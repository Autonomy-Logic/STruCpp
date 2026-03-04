// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Language Server
 *
 * LSP server providing diagnostics (and in later phases: hover, completion,
 * go-to-definition, etc.) for IEC 61131-3 Structured Text.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { URI } from "vscode-uri";
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeWatchedFilesNotification,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { analyze } from "strucpp";
import { DocumentManager } from "./document-manager.js";
import { toLspDiagnostics } from "./diagnostics.js";
import { lspPositionToCompiler } from "./lsp-utils.js";
import { getDocumentSymbols, getWorkspaceSymbols } from "./symbols.js";
import { getHover } from "./hover.js";
import { getDefinition, getTypeDefinition } from "./definition.js";

const connection = createConnection(ProposedFeatures.all);
const textDocuments = new TextDocuments(TextDocument);
const docManager = new DocumentManager(analyze);

/** Debounce timeout for re-analysis on document change (ms) */
const ANALYSIS_DEBOUNCE_MS = 400;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Set workspace folders for multi-file discovery
  const folders: string[] = [];
  if (params.workspaceFolders) {
    for (const folder of params.workspaceFolders) {
      try {
        folders.push(URI.parse(folder.uri).fsPath);
      } catch {
        // skip invalid URIs
      }
    }
  } else if (params.rootUri) {
    try {
      folders.push(URI.parse(params.rootUri).fsPath);
    } catch {
      // skip
    }
  }
  docManager.setWorkspaceFolders(folders);

  // Resolve bundled libs/ directory from the strucpp package
  docManager.setLibraryPaths(findLibraryPaths());

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      hoverProvider: true,
      definitionProvider: true,
      typeDefinitionProvider: true,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
    },
  };
});

// Re-discover workspace when folders change
connection.onNotification("workspace/didChangeWorkspaceFolders", (params) => {
  const { event } = params as {
    event: {
      added: Array<{ uri: string }>;
      removed: Array<{ uri: string }>;
    };
  };

  // Apply the LSP delta directly to the workspace folder set
  const addedPaths: string[] = [];
  for (const folder of event.added) {
    try {
      addedPaths.push(URI.parse(folder.uri).fsPath);
    } catch {
      // skip invalid URIs
    }
  }
  const removedPaths: string[] = [];
  for (const folder of event.removed) {
    try {
      removedPaths.push(URI.parse(folder.uri).fsPath);
    } catch {
      // skip invalid URIs
    }
  }
  docManager.addWorkspaceFolders(addedPaths);
  docManager.removeWorkspaceFolders(removedPaths);

  // Re-analyze all open documents with new workspace context
  const results = docManager.reanalyzeAll();
  for (const [uri, result] of results) {
    publishDiagnostics(uri, result);
  }
});

// Re-analyze when .st files change on disk (saves, creates, deletes)
connection.onDidChangeWatchedFiles((_change) => {
  docManager.invalidateDiscoveryCache();
  const results = docManager.reanalyzeAll();
  for (const [uri, result] of results) {
    publishDiagnostics(uri, result);
  }
});

connection.onInitialized(() => {
  // Register for file watching after initialization
  void connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: [{ globPattern: "**/*.{st,iecst,ST}" }],
  });
});

textDocuments.onDidOpen((event) => {
  const { uri } = event.document;
  const state = docManager.onDocumentOpen(uri, event.document.getText());
  publishDiagnostics(uri, state.analysisResult);
});

textDocuments.onDidChangeContent((event) => {
  const { uri } = event.document;

  // Debounce re-analysis
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
      if (state) {
        publishDiagnostics(uri, state.analysisResult);
      }
    }, ANALYSIS_DEBOUNCE_MS),
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
  // Clear diagnostics for closed files
  connection.sendDiagnostics({ uri, diagnostics: [] });
});

// ---------------------------------------------------------------------------
// Phase 2 handlers: Document Symbols, Hover, Go to Definition
// ---------------------------------------------------------------------------

connection.onDocumentSymbol((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return [];
  const fileName = docManager.getFileName(params.textDocument.uri);
  return getDocumentSymbols(state.analysisResult, fileName);
});

connection.onWorkspaceSymbol((params) => {
  const allAnalyses = new Map<string, import("strucpp").AnalysisResult>();
  for (const doc of docManager.getAllDocuments()) {
    if (doc.analysisResult) {
      allAnalyses.set(doc.uri, doc.analysisResult);
    }
  }
  return getWorkspaceSymbols(allAnalyses, params.query);
});

connection.onHover((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return null;
  const fileName = docManager.getFileName(params.textDocument.uri);
  const { line, column } = lspPositionToCompiler(params.position);
  return getHover(state.analysisResult, fileName, line, column);
});

connection.onDefinition((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return null;
  const fileName = docManager.getFileName(params.textDocument.uri);
  const { line, column } = lspPositionToCompiler(params.position);
  return getDefinition(
    state.analysisResult,
    fileName,
    line,
    column,
    params.textDocument.uri,
    (fn) => docManager.resolveFileNameToUri(fn),
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
  );
});

function publishDiagnostics(
  uri: string,
  result?: import("strucpp").AnalysisResult,
): void {
  if (!result) return;
  const diagnostics = toLspDiagnostics(result.errors, result.warnings);
  connection.sendDiagnostics({ uri, diagnostics });
}

/**
 * Find the bundled libs/ directory from the strucpp package.
 * The strucpp package is linked via file:.. so libs/ is at the package root.
 */
function findLibraryPaths(): string[] {
  const paths: string[] = [];

  // Resolve from require.resolve (works with symlinked file: dependency)
  try {
    const strucppMain = require.resolve("strucpp");
    // strucppMain = .../strucpp/dist/index.js → .../strucpp/libs/
    const libsDir = path.resolve(path.dirname(strucppMain), "..", "libs");
    if (fs.existsSync(libsDir)) {
      paths.push(libsDir);
    }
  } catch {
    // strucpp not resolvable via require — try relative paths
  }

  // Fallback: relative from this server file's location
  // server.ts is at vscode-extension/server/src/server.ts
  // libs/ is at strucpp/libs/ (3 levels up)
  if (paths.length === 0) {
    const candidates = [
      path.resolve(__dirname, "..", "..", "..", "libs"),
      path.resolve(__dirname, "..", "..", "..", "..", "libs"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        paths.push(candidate);
        break;
      }
    }
  }

  return paths;
}

textDocuments.listen(connection);
connection.listen();
