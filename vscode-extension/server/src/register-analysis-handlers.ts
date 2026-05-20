// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Registers all LSP analysis handlers — the providers that depend
 * only on AnalysisResult + DocumentManager state, with no
 * filesystem or subprocess access of their own.
 *
 * Both the Node language server (`server.ts`) and the browser
 * language server (`server-browser.ts`) call this function so the
 * two implementations stay byte-identical for everything that
 * matters to feature parity:
 *
 *   - Diagnostics on open / change / close (debounced)
 *   - Document & workspace symbols
 *   - Hover, go-to-definition, type-definition
 *   - Completion, signature help
 *   - References, prepare-rename, rename
 *   - Semantic tokens
 *   - Code actions, document formatting
 *
 * What stays in each entry point: `onInitialize`, `onInitialized`,
 * settings management, the build-style custom RPCs (compile, build,
 * test runner) — these touch Node-only APIs or have different
 * shapes across environments and live in `server.ts` only.
 */

import type {
  Connection,
  TextDocuments,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { AnalysisResult } from "strucpp";
import type { DocumentManager } from "./document-manager.js";
import { toLspDiagnostics } from "./diagnostics.js";
import { lspPositionToCompiler } from "./lsp-utils.js";
import { getDocumentSymbols, getWorkspaceSymbols } from "./symbols.js";
import { getHover } from "./hover.js";
import { getDefinition, getTypeDefinition } from "./definition.js";
import { getCompletions } from "./completion.js";
import { getSignatureHelp } from "./signature-help.js";
import { getReferences } from "./references.js";
import { prepareRename, getRenameEdits } from "./rename.js";
import {
  getSemanticTokens,
  getTestFileSemanticTokens,
} from "./semantic-tokens.js";
import { isTestFile } from "../../shared/test-utils.js";
import { getCodeActions } from "./code-actions.js";
import { formatDocument } from "./formatting.js";

export interface AnalysisHandlerOptions {
  /** LSP connection (Node or browser). */
  connection: Connection;
  /** Document store the connection feeds. */
  textDocuments: TextDocuments<TextDocument>;
  /** Document manager owning analysis state. */
  docManager: DocumentManager;
  /**
   * Callable producing the current debounce window (ms) for
   * re-analysis on document change.  Returns a number every call so
   * the Node server can mutate its settings cache at runtime; the
   * browser server can just return a constant.
   */
  getAnalysisDebounceMs(): number;
}

/** Publish strucpp diagnostics to the LSP client for a single document. */
function publishDiagnostics(
  connection: Connection,
  docManager: DocumentManager,
  uri: string,
  result: AnalysisResult | undefined,
): void {
  if (!result) return;
  const fileName = docManager.getFileName(uri);
  const diagnostics = toLspDiagnostics(result.errors, result.warnings, fileName);
  void connection.sendDiagnostics({ uri, diagnostics });
}

export function registerAnalysisHandlers(opts: AnalysisHandlerOptions): {
  /**
   * Helper kept exposed so the entry-point modules can publish
   * diagnostics from their own handlers (e.g. after a workspace-
   * folders-changed reanalyze) without duplicating the formatter.
   */
  publishDiagnostics(uri: string, result: AnalysisResult | undefined): void;
} {
  const { connection, textDocuments, docManager, getAnalysisDebounceMs } =
    opts;

  // Per-document debounce timers for re-analysis on change.
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const publish = (uri: string, result: AnalysisResult | undefined) =>
    publishDiagnostics(connection, docManager, uri, result);

  // -------------------------------------------------------------------------
  // Document lifecycle
  // -------------------------------------------------------------------------

  textDocuments.onDidOpen((event) => {
    const { uri } = event.document;
    const state = docManager.onDocumentOpen(uri, event.document.getText());
    publish(uri, state.analysisResult);
  });

  textDocuments.onDidChangeContent((event) => {
    const { uri } = event.document;
    const existing = debounceTimers.get(uri);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      uri,
      setTimeout(() => {
        debounceTimers.delete(uri);
        const state = docManager.onDocumentChange(
          uri,
          event.document.getText(),
          event.document.version,
        );
        if (state) publish(uri, state.analysisResult);
      }, getAnalysisDebounceMs()),
    );
  });

  textDocuments.onDidClose((event) => {
    const { uri } = event.document;
    const timer = debounceTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(uri);
    }
    docManager.onDocumentClose(uri);
    // Clear diagnostics for closed files.
    void connection.sendDiagnostics({ uri, diagnostics: [] });
  });

  // -------------------------------------------------------------------------
  // Phase 2 handlers: Document Symbols, Hover, Go to Definition
  // -------------------------------------------------------------------------

  connection.onDocumentSymbol((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return [];
    const fileName = docManager.getFileName(params.textDocument.uri);
    return getDocumentSymbols(
      state.analysisResult,
      fileName,
      docManager.getCaseMap(),
    );
  });

  connection.onWorkspaceSymbol((params) => {
    const allAnalyses = new Map<string, AnalysisResult>();
    for (const doc of docManager.getAllDocuments()) {
      if (doc.analysisResult) {
        allAnalyses.set(doc.uri, doc.analysisResult);
      }
    }
    return getWorkspaceSymbols(
      allAnalyses,
      params.query,
      docManager.getCaseMap(),
    );
  });

  connection.onHover((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return null;
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    const source =
      textDocuments.get(params.textDocument.uri)?.getText() ?? state.source;
    return getHover(
      state.analysisResult,
      fileName,
      line,
      column,
      docManager.getCaseMap(),
      source,
    );
  });

  connection.onDefinition((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return null;
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    const source =
      textDocuments.get(params.textDocument.uri)?.getText() ?? state.source;
    return getDefinition(
      state.analysisResult,
      fileName,
      line,
      column,
      params.textDocument.uri,
      (fn) => docManager.resolveFileNameToUri(fn),
      (name) => docManager.findSymbolInLibrarySources(name),
      source,
    );
  });

  connection.onTypeDefinition((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return null;
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    return getTypeDefinition(
      state.analysisResult,
      fileName,
      line,
      column,
      params.textDocument.uri,
      (fn) => docManager.resolveFileNameToUri(fn),
      (name) => docManager.findSymbolInLibrarySources(name),
    );
  });

  // -------------------------------------------------------------------------
  // Phase 3 handlers: Completion, Signature Help
  // -------------------------------------------------------------------------

  connection.onCompletion((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return [];
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    // Use live document text rather than state.source — the latter
    // is debounced and may be stale when a trigger character fires.
    const source =
      textDocuments.get(params.textDocument.uri)?.getText() ?? state.source;
    return getCompletions(
      state.analysisResult,
      fileName,
      line,
      column,
      source,
      docManager.getCaseMap(),
    );
  });

  connection.onSignatureHelp((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return null;
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    const source =
      textDocuments.get(params.textDocument.uri)?.getText() ?? state.source;
    return getSignatureHelp(
      state.analysisResult,
      fileName,
      line,
      column,
      source,
    );
  });

  // -------------------------------------------------------------------------
  // Phase 4 handlers: References, Rename, Semantic Tokens
  // -------------------------------------------------------------------------

  connection.onReferences((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return [];
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    const allDocs = new Map<
      string,
      { uri: string; analysisResult?: AnalysisResult }
    >();
    for (const doc of docManager.getAllDocuments()) {
      allDocs.set(doc.uri, doc);
    }
    return getReferences(
      state.analysisResult,
      fileName,
      line,
      column,
      params.textDocument.uri,
      allDocs,
      (fn) => docManager.resolveFileNameToUri(fn),
      params.context.includeDeclaration,
    );
  });

  connection.onPrepareRename((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return null;
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    return prepareRename(
      state.analysisResult,
      fileName,
      line,
      column,
      docManager.getCaseMap(),
    );
  });

  connection.onRenameRequest((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state?.analysisResult) return null;
    const fileName = docManager.getFileName(params.textDocument.uri);
    const { line, column } = lspPositionToCompiler(params.position);
    const allDocs = new Map<
      string,
      { uri: string; analysisResult?: AnalysisResult }
    >();
    for (const doc of docManager.getAllDocuments()) {
      allDocs.set(doc.uri, doc);
    }
    return getRenameEdits(
      state.analysisResult,
      fileName,
      line,
      column,
      params.newName,
      params.textDocument.uri,
      allDocs,
      (fn) => docManager.resolveFileNameToUri(fn),
    );
  });

  connection.languages.semanticTokens.on((params) => {
    const uri = params.textDocument.uri;
    let state = docManager.getState(uri);
    if (!state) return { data: [] };
    // If the live text differs from the analyzed source (e.g. after
    // a rename edit, before the debounce fires), re-analyze
    // immediately so token positions match the current text.
    const liveDoc = textDocuments.get(uri);
    if (liveDoc && liveDoc.getText() !== state.source) {
      state =
        docManager.onDocumentChange(uri, liveDoc.getText(), liveDoc.version) ??
        state;
    }
    if (!state.analysisResult) return { data: [] };
    const fileName = docManager.getFileName(uri);
    const data = isTestFile(state.source)
      ? getTestFileSemanticTokens(state.analysisResult, state.source)
      : getSemanticTokens(state.analysisResult, fileName, state.source);
    return { data };
  });

  // -------------------------------------------------------------------------
  // Phase 5 handlers: Code Actions, Document Formatting
  // -------------------------------------------------------------------------

  connection.onCodeAction((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state) return [];
    return getCodeActions(
      params.context.diagnostics,
      state.source,
      params.textDocument.uri,
      state.analysisResult,
    );
  });

  connection.onDocumentFormatting((params) => {
    const state = docManager.getState(params.textDocument.uri);
    if (!state) return [];
    return formatDocument(state.source, params.options);
  });

  return { publishDiagnostics: publish };
}
