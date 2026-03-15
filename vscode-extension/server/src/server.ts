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
import * as os from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
const execFile = promisify(execFileCb);
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
import {
  analyze,
  compile,
  generateReplMain,
  compileStlib,
  loadStlibFromFile,
  parseTestFile,
  analyzeTestFile,
  generateTestMain,
  buildPOUInfoFromAST,
  getCxxEnv,
  splitCxxFlags,
  ELEMENTARY_TYPES,
  typeName,
} from "strucpp";
import {
  CompileRequest,
  BuildRequest,
  DebugBuildRequest,
  CompileLibRequest,
  GetSettingsRequest,
  GetLibrariesRequest,
  LibrariesChangedNotification,
  RunTestsRequest,
  IsWrappedTypeRequest,
  type ExtensionSettings,
  type CompileResponse,
  type BuildResponse,
  type DebugBuildResponse,
  type CompileLibResponse,
  type LibraryArchiveInfo,
  type RunTestsParams,
  type RunTestsResponse,
} from "../../shared/protocol.js";
import { parseTestJson } from "../../shared/test-result.js";
import { DocumentManager } from "./document-manager.js";
import { toLspDiagnostics } from "./diagnostics.js";
import { lspPositionToCompiler } from "./lsp-utils.js";
import { resolveSymbolAtPosition as resolveSymbolAtPositionFn } from "./resolve-symbol.js";
import { getDocumentSymbols, getWorkspaceSymbols } from "./symbols.js";
import { getHover } from "./hover.js";
import { getDefinition, getTypeDefinition } from "./definition.js";
import { getCompletions } from "./completion.js";
import { getSignatureHelp } from "./signature-help.js";
import { getReferences } from "./references.js";
import { prepareRename, getRenameEdits } from "./rename.js";
import { getSemanticTokens, getTestFileSemanticTokens, TOKEN_TYPES, TOKEN_MODIFIERS } from "./semantic-tokens.js";
import { isTestFile } from "../../shared/test-utils.js";
import { getCodeActions } from "./code-actions.js";
import { formatDocument } from "./formatting.js";

const connection = createConnection(ProposedFeatures.all);
const textDocuments = new TextDocuments(TextDocument);
const docManager = new DocumentManager(analyze);

/** Default extension settings */
const DEFAULT_SETTINGS: ExtensionSettings = {
  libraryPaths: [],
  autoDiscoverLibraries: true,
  outputDirectory: "./generated",
  gppPath: "g++",
  ccPath: process.platform === "win32" ? "gcc" : "cc",
  cxxFlags: "",
  globalConstants: {},
  autoAnalyze: true,
  analyzeDelay: 400,
  formatOnSave: false,
};

let currentSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

/** Debounce timeout for re-analysis on document change (ms) */
let analysisDebounceMs = currentSettings.analyzeDelay;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Fetch settings from the client and update internal state.
 */
async function fetchSettings(): Promise<void> {
  try {
    const config = await connection.workspace.getConfiguration("strucpp");
    if (config) {
      currentSettings = {
        libraryPaths: config.libraryPaths ?? DEFAULT_SETTINGS.libraryPaths,
        autoDiscoverLibraries:
          config.autoDiscoverLibraries ?? DEFAULT_SETTINGS.autoDiscoverLibraries,
        outputDirectory: config.outputDirectory ?? DEFAULT_SETTINGS.outputDirectory,
        gppPath: config.gppPath || DEFAULT_SETTINGS.gppPath,
        ccPath: config.ccPath || DEFAULT_SETTINGS.ccPath,
        cxxFlags: config.cxxFlags ?? DEFAULT_SETTINGS.cxxFlags,
        globalConstants: config.globalConstants ?? DEFAULT_SETTINGS.globalConstants,
        autoAnalyze: config.autoAnalyze ?? DEFAULT_SETTINGS.autoAnalyze,
        analyzeDelay: config.analyzeDelay ?? DEFAULT_SETTINGS.analyzeDelay,
        formatOnSave: config.formatOnSave ?? DEFAULT_SETTINGS.formatOnSave,
      };
      analysisDebounceMs = currentSettings.analyzeDelay;
    }
  } catch {
    // Use defaults if config fetch fails
  }
}

/**
 * Merge library paths from 3 sources: bundled → workspace auto-discovery → user paths.
 * Deduplicates with Set<string>.
 */
function updateLibraryPaths(): void {
  const seen = new Set<string>();
  const merged: string[] = [];

  // 1. Bundled libs from strucpp package
  for (const p of findLibraryPaths()) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }

  // 2. Auto-discovered workspace library directories
  if (currentSettings.autoDiscoverLibraries) {
    for (const p of docManager.discoverWorkspaceLibraries()) {
      if (!seen.has(p)) {
        seen.add(p);
        merged.push(p);
      }
    }
  }

  // 3. User-configured library paths
  for (const p of currentSettings.libraryPaths) {
    if (!seen.has(p)) {
      seen.add(p);
      merged.push(p);
    }
  }

  docManager.setLibraryPaths(merged);
  cacheLibraryArchives(merged);
}

/**
 * Load library archives and cache them in the document manager.
 * Enables LSP features (hover, go-to-definition) on strucpp-lib: virtual documents
 * and provides dependency archives for library source analysis.
 */
function cacheLibraryArchives(libDirs: string[]): void {
  docManager.clearLibraryArchiveCache();
  for (const libDir of libDirs) {
    let entries: string[];
    try {
      entries = fs.readdirSync(libDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".stlib")) continue;
      const filePath = path.join(libDir, entry);
      try {
        const archive = loadStlibFromFile(filePath);
        docManager.setLibraryArchiveCache(archive.manifest.name, archive, filePath);
      } catch {
        // Skip invalid archives
      }
    }
  }
}

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

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      hoverProvider: true,
      definitionProvider: true,
      typeDefinitionProvider: true,
      completionProvider: {
        triggerCharacters: [".", ":"],
        resolveProvider: false,
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      codeActionProvider: {
        codeActionKinds: ["quickfix"],
      },
      documentFormattingProvider: true,
      semanticTokensProvider: {
        legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: TOKEN_MODIFIERS },
        full: true,
      },
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
  connection.sendNotification(LibrariesChangedNotification);

  // Re-analyze all open documents with new workspace context
  const results = docManager.reanalyzeAll();
  for (const [uri, result] of results) {
    publishDiagnostics(uri, result);
  }
});

// Re-analyze when .st/.stlib files change on disk (saves, creates, deletes)
connection.onDidChangeWatchedFiles((change) => {
  docManager.invalidateDiscoveryCache();

  // If any .stlib files changed, re-discover library paths
  const hasStlibChange = change.changes.some((c) =>
    c.uri.endsWith(".stlib"),
  );
  if (hasStlibChange) {
    updateLibraryPaths();
    connection.sendNotification(LibrariesChangedNotification);
  }

  const results = docManager.reanalyzeAll();
  for (const [uri, result] of results) {
    publishDiagnostics(uri, result);
  }
});

// Re-fetch settings when configuration changes
connection.onDidChangeConfiguration(async () => {
  await fetchSettings();
  updateLibraryPaths();
  connection.sendNotification(LibrariesChangedNotification);

  const results = docManager.reanalyzeAll();
  for (const [uri, result] of results) {
    publishDiagnostics(uri, result);
  }
});

connection.onInitialized(async () => {
  // Fetch settings from the client and configure library paths
  await fetchSettings();
  updateLibraryPaths();

  // Notify client that libraries are ready (client.start() resolves before this)
  connection.sendNotification(LibrariesChangedNotification);

  // Register for file watching after initialization (ST files + stlib files)
  void connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: [{ globPattern: "**/*.{st,iecst,ST,stlib}" }],
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
    }, analysisDebounceMs),
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
  return getDocumentSymbols(state.analysisResult, fileName, docManager.getCaseMap());
});

connection.onWorkspaceSymbol((params) => {
  const allAnalyses = new Map<string, import("strucpp").AnalysisResult>();
  for (const doc of docManager.getAllDocuments()) {
    if (doc.analysisResult) {
      allAnalyses.set(doc.uri, doc.analysisResult);
    }
  }
  return getWorkspaceSymbols(allAnalyses, params.query, docManager.getCaseMap());
});

connection.onHover((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return null;
  const fileName = docManager.getFileName(params.textDocument.uri);
  const { line, column } = lspPositionToCompiler(params.position);
  const source =
    textDocuments.get(params.textDocument.uri)?.getText() ?? state.source;
  return getHover(state.analysisResult, fileName, line, column, docManager.getCaseMap(), source);
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

// ---------------------------------------------------------------------------
// Phase 3 handlers: Completion, Signature Help
// ---------------------------------------------------------------------------

connection.onCompletion((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return [];
  const fileName = docManager.getFileName(params.textDocument.uri);
  const { line, column } = lspPositionToCompiler(params.position);
  // Use live document text (updates synchronously) rather than state.source
  // which is debounced and may be stale when a trigger character fires.
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
  return getSignatureHelp(state.analysisResult, fileName, line, column, source);
});

// ---------------------------------------------------------------------------
// Phase 4 handlers: References, Rename, Semantic Tokens
// ---------------------------------------------------------------------------

connection.onReferences((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return [];
  const fileName = docManager.getFileName(params.textDocument.uri);
  const { line, column } = lspPositionToCompiler(params.position);

  // Build document map for cross-file reference search
  const allDocs = new Map<string, { uri: string; analysisResult?: import("strucpp").AnalysisResult }>();
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
  return prepareRename(state.analysisResult, fileName, line, column, docManager.getCaseMap());
});

connection.onRenameRequest((params) => {
  const state = docManager.getState(params.textDocument.uri);
  if (!state?.analysisResult) return null;
  const fileName = docManager.getFileName(params.textDocument.uri);
  const { line, column } = lspPositionToCompiler(params.position);

  const allDocs = new Map<string, { uri: string; analysisResult?: import("strucpp").AnalysisResult }>();
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

  // If the live document text differs from the last analyzed source
  // (e.g. after a rename edit, before the debounce fires), re-analyze
  // immediately so token positions match the current text.
  const liveDoc = textDocuments.get(uri);
  if (liveDoc && liveDoc.getText() !== state.source) {
    state = docManager.onDocumentChange(uri, liveDoc.getText(), liveDoc.version) ?? state;
  }

  if (!state.analysisResult) return { data: [] };
  const fileName = docManager.getFileName(uri);
  const data = isTestFile(state.source)
    ? getTestFileSemanticTokens(state.analysisResult, state.source)
    : getSemanticTokens(state.analysisResult, fileName, state.source);
  return { data };
});

// ---------------------------------------------------------------------------
// Phase 5 handlers: Code Actions, Document Formatting
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Phase 6 handlers: Compile, Build, Settings
// ---------------------------------------------------------------------------

connection.onRequest(CompileRequest, (params): CompileResponse => {
  const uri = params.uri;
  const state = docManager.getState(uri);
  const source = state?.source;

  if (!source) {
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      errors: [{ message: "No source available for compilation", line: 0, column: 0, severity: "error" }],
      warnings: [],
      primaryFileName: "",
    };
  }

  const fileName = docManager.getFileName(uri);
  const additionalSources = params.workspace
    ? docManager.buildWorkspaceSources(uri)
    : [];

  const options: Partial<import("strucpp").CompileOptions> = {
    fileName,
    headerFileName: fileName.replace(/\.(st|iecst)$/i, ".hpp"),
    ...(additionalSources.length > 0 ? { additionalSources } : {}),
    ...(docManager.getLibraryPaths().length > 0
      ? { libraryPaths: docManager.getLibraryPaths() }
      : {}),
    ...(Object.keys(currentSettings.globalConstants).length > 0
      ? { globalConstants: currentSettings.globalConstants }
      : {}),
  };

  const result = compile(source, options);

  return {
    success: result.success,
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    errors: result.errors.map((e) => ({
      message: e.message,
      line: e.line,
      column: e.column,
      severity: e.severity,
      ...(e.file ? { file: e.file } : {}),
    })),
    warnings: result.warnings.map((w) => ({
      message: w.message,
      line: w.line,
      column: w.column,
      severity: w.severity,
      ...(w.file ? { file: w.file } : {}),
    })),
    primaryFileName: fileName,
  };
});

connection.onRequest(BuildRequest, (params): BuildResponse => {
  const uri = params.uri;
  const state = docManager.getState(uri);
  const source = state?.source;

  const failResponse = (errors: BuildResponse["errors"]): BuildResponse => ({
    success: false,
    cppCode: "",
    headerCode: "",
    mainCppCode: "",
    headerFileName: "",
    runtimeIncludeDir: "",
    replDir: "",
    errors,
    warnings: [],
    primaryFileName: "",
  });

  if (!source) {
    return failResponse([{ message: "No source available for build", line: 0, column: 0, severity: "error" }]);
  }

  // Resolve runtime paths early so we fail fast before compilation
  const runtimePaths = findRuntimePaths();
  if (!runtimePaths) {
    return failResponse([{
      message: "Could not locate STruC++ runtime directory. Ensure the strucpp package is installed correctly.",
      line: 0, column: 0, severity: "error",
    }]);
  }

  const fileName = docManager.getFileName(uri);
  const headerFileName = fileName.replace(/\.(st|iecst)$/i, ".hpp");
  const additionalSources = docManager.buildWorkspaceSources(uri);

  const options: Partial<import("strucpp").CompileOptions> = {
    fileName,
    headerFileName,
    ...(additionalSources.length > 0 ? { additionalSources } : {}),
    ...(docManager.getLibraryPaths().length > 0
      ? { libraryPaths: docManager.getLibraryPaths() }
      : {}),
    ...(Object.keys(currentSettings.globalConstants).length > 0
      ? { globalConstants: currentSettings.globalConstants }
      : {}),
  };

  const result = compile(source, options);

  const mapErrors = (errs: typeof result.errors) =>
    errs.map((e) => ({
      message: e.message,
      line: e.line,
      column: e.column,
      severity: e.severity,
      ...(e.file ? { file: e.file } : {}),
    }));

  if (!result.success || !result.ast || !result.projectModel) {
    return {
      success: false,
      cppCode: result.cppCode,
      headerCode: result.headerCode,
      mainCppCode: "",
      headerFileName,
      runtimeIncludeDir: "",
      replDir: "",
      errors: mapErrors(result.errors),
      warnings: mapErrors(result.warnings),
      primaryFileName: fileName,
    };
  }

  const mainCppCode = generateReplMain(result.ast, result.projectModel, {
    headerFileName,
    stSource: source,
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    lineMap: result.lineMap,
    headerLineMap: result.headerLineMap,
  });

  return {
    success: true,
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    mainCppCode,
    headerFileName,
    runtimeIncludeDir: runtimePaths.includeDir,
    replDir: runtimePaths.replDir,
    errors: mapErrors(result.errors),
    warnings: mapErrors(result.warnings),
    primaryFileName: fileName,
  };
});

// ---------------------------------------------------------------------------
// strucpp/debugBuild — compile with #line directives for source-level debugging
// ---------------------------------------------------------------------------
connection.onRequest(DebugBuildRequest, (params): DebugBuildResponse => {
  const uri = params.uri;
  const state = docManager.getState(uri);
  const source = state?.source;

  const failResponse = (errors: DebugBuildResponse["errors"]): DebugBuildResponse => ({
    success: false,
    cppCode: "",
    headerCode: "",
    mainCppCode: "",
    headerFileName: "",
    runtimeIncludeDir: "",
    replDir: "",
    errors,
    warnings: [],
    primaryFileName: "",
    lineMap: [],
  });

  if (!source) {
    return failResponse([{ message: "No source available for debug build", line: 0, column: 0, severity: "error" }]);
  }

  const runtimePaths = findRuntimePaths();
  if (!runtimePaths) {
    return failResponse([{
      message: "Could not locate STruC++ runtime directory. Ensure the strucpp package is installed correctly.",
      line: 0, column: 0, severity: "error",
    }]);
  }

  const fileName = docManager.getFileName(uri);
  const headerFileName = fileName.replace(/\.(st|iecst)$/i, ".hpp");
  const absolutePath = URI.parse(uri).fsPath;
  const additionalSources = docManager.buildWorkspaceSources(uri);

  const options: Partial<import("strucpp").CompileOptions> = {
    fileName,
    headerFileName,
    lineDirectives: true,
    lineDirectiveFileName: absolutePath,
    lineMapping: true,
    ...(additionalSources.length > 0 ? { additionalSources } : {}),
    ...(docManager.getLibraryPaths().length > 0
      ? { libraryPaths: docManager.getLibraryPaths() }
      : {}),
    ...(Object.keys(currentSettings.globalConstants).length > 0
      ? { globalConstants: currentSettings.globalConstants }
      : {}),
  };

  const result = compile(source, options);

  const mapErrors = (errs: typeof result.errors) =>
    errs.map((e) => ({
      message: e.message,
      line: e.line,
      column: e.column,
      severity: e.severity,
      ...(e.file ? { file: e.file } : {}),
    }));

  if (!result.success || !result.ast || !result.projectModel) {
    return {
      success: false,
      cppCode: result.cppCode,
      headerCode: result.headerCode,
      mainCppCode: "",
      headerFileName,
      runtimeIncludeDir: "",
      replDir: "",
      errors: mapErrors(result.errors),
      warnings: mapErrors(result.warnings),
      primaryFileName: fileName,
      lineMap: [],
    };
  }

  const mainCppCode = generateReplMain(result.ast, result.projectModel, {
    headerFileName,
    stSource: source,
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    lineMap: result.lineMap,
    headerLineMap: result.headerLineMap,
  });

  // Serialize lineMap for breakpoint validation
  const lineMap: DebugBuildResponse["lineMap"] = [];
  for (const [stLine, entry] of result.lineMap) {
    lineMap.push({ stLine, cppStart: entry.cppStartLine, cppEnd: entry.cppEndLine });
  }

  return {
    success: true,
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    mainCppCode,
    headerFileName,
    runtimeIncludeDir: runtimePaths.includeDir,
    replDir: runtimePaths.replDir,
    errors: mapErrors(result.errors),
    warnings: mapErrors(result.warnings),
    primaryFileName: fileName,
    lineMap,
  };
});

connection.onRequest(GetSettingsRequest, (): ExtensionSettings => {
  return currentSettings;
});

connection.onRequest(IsWrappedTypeRequest, (params) => {
  const state = docManager.getState(params.uri);
  if (!state?.analysisResult?.symbolTables) {
    return { isWrapped: true }; // Default: assume wrapped (most common)
  }

  const fileName = docManager.getFileName(params.uri);
  const { line, column } = lspPositionToCompiler({ line: params.line, character: params.character });

  const resolved = resolveSymbolAtPositionFn(state.analysisResult, fileName, line, column);

  if (!resolved?.symbol || resolved.symbol.kind !== "variable") {
    // Not a variable — could be an FB type name, program, etc.
    // Check if it's a FB/program/interface definition
    if (resolved?.symbol?.kind === "functionBlock" || resolved?.symbol?.kind === "program") {
      return { isWrapped: false };
    }
    return { isWrapped: true };
  }

  // Get the type name from the variable declaration
  const varTypeName = resolved.symbol.declaration?.type?.name;
  if (!varTypeName) return { isWrapped: true };

  const upper = varTypeName.toUpperCase();

  // Elementary types (INT, BOOL, REAL, etc.) → IECVar-wrapped
  if (ELEMENTARY_TYPES[upper]) return { isWrapped: true };

  // STRING/WSTRING → IECStringVar-wrapped
  if (upper === "STRING" || upper === "WSTRING") return { isWrapped: true };

  // Check if it's an enum type → IEC_ENUM-wrapped
  const typeSym = state.analysisResult.symbolTables.lookupType(varTypeName);
  if (typeSym?.declaration?.definition?.kind === "EnumDefinition") {
    return { isWrapped: true };
  }

  // Subrange types (e.g., TYPE Percent : INT (0..100); END_TYPE) → IEC_<base>-wrapped
  if (typeSym?.declaration?.definition?.kind === "SubrangeDefinition") {
    return { isWrapped: true };
  }

  // Type alias to a primitive (e.g., TYPE MyInt : INT; END_TYPE)
  if (typeSym?.declaration?.definition?.kind === "TypeReference") {
    const baseName = typeSym.declaration.definition.name?.toUpperCase();
    if (baseName && ELEMENTARY_TYPES[baseName]) return { isWrapped: true };
  }

  // Everything else (FB, struct, array, interface) → NOT wrapped
  return { isWrapped: false };
});

connection.onRequest(CompileLibRequest, (params): CompileLibResponse => {
  const { libName, libVersion } = params;
  const namespace = libName.replace(/-/g, "_");

  const sources = docManager.buildAllWorkspaceSources();

  if (sources.length === 0) {
    return {
      success: false,
      archiveJson: "",
      errors: [{ message: "No .st files found in workspace", line: 0, column: 0, severity: "error" }],
      warnings: [],
      libName,
    };
  }

  // Load dependency libraries from configured paths
  const depArchives: import("strucpp").StlibArchive[] = [];
  for (const libDir of docManager.getLibraryPaths()) {
    try {
      const entries = fs.readdirSync(libDir);
      for (const entry of entries) {
        if (entry.endsWith(".stlib")) {
          try {
            depArchives.push(loadStlibFromFile(path.join(libDir, entry)));
          } catch {
            // Skip unreadable library files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  const result = compileStlib(sources, {
    name: libName,
    version: libVersion,
    namespace,
    ...(depArchives.length > 0 ? { dependencies: depArchives } : {}),
    ...(Object.keys(currentSettings.globalConstants).length > 0
      ? { globalConstants: currentSettings.globalConstants }
      : {}),
  });

  if (!result.success) {
    return {
      success: false,
      archiveJson: "",
      errors: result.errors.map((e) => ({
        message: e.message,
        line: e.line ?? 0,
        column: 0,
        severity: "error",
        ...(e.file ? { file: e.file } : {}),
      })),
      warnings: [],
      libName,
    };
  }

  return {
    success: true,
    archiveJson: JSON.stringify(result.archive, null, 2),
    errors: [],
    warnings: [],
    libName,
  };
});

connection.onRequest(GetLibrariesRequest, (): LibraryArchiveInfo[] => {
  return docManager.getCachedLibraries();
});

// ---------------------------------------------------------------------------
// strucpp/runTests — compile and execute test file
// ---------------------------------------------------------------------------

connection.onRequest(RunTestsRequest, async (params: RunTestsParams): Promise<RunTestsResponse> => {
  const testUri = params.testFileUri;
  const testFilePath = URI.parse(testUri).fsPath;
  const testFileName = path.basename(testFilePath);

  // 1. Read test file source (prefer live editor buffer over disk)
  let testSource: string;
  const liveTestDoc = textDocuments.get(testUri);
  if (liveTestDoc) {
    testSource = liveTestDoc.getText();
  } else {
    try {
      testSource = fs.readFileSync(testFilePath, "utf-8");
    } catch {
      return {
        success: false,
        errors: [{ message: `Cannot read test file: ${testFilePath}`, line: 0, column: 0, severity: "error" }],
      };
    }
  }

  // 2. Gather workspace sources (all non-test .st files)
  const workspaceSources = docManager.buildAllWorkspaceSources();
  if (workspaceSources.length === 0) {
    return {
      success: false,
      errors: [{ message: "No source files found in workspace", line: 0, column: 0, severity: "error" }],
    };
  }

  // 3. Compile sources with isTestBuild flag
  const primarySource = workspaceSources[0]!;
  const additionalSources = workspaceSources.slice(1);
  const libraryPaths = docManager.getLibraryPaths();

  const compileResult = compile(primarySource.source, {
    fileName: primarySource.fileName,
    headerFileName: "generated.hpp",
    isTestBuild: true,
    ...(additionalSources.length > 0 ? { additionalSources } : {}),
    ...(libraryPaths.length > 0 ? { libraryPaths } : {}),
  });

  if (!compileResult.success) {
    return {
      success: false,
      errors: compileResult.errors.map((e) => ({
        message: e.message,
        line: e.line,
        column: e.column,
        severity: e.severity,
        ...(e.file ? { file: e.file } : {}),
      })),
    };
  }

  // 4. Parse test file
  const parseResult = parseTestFile(testSource, testFileName);
  if (parseResult.errors.length > 0) {
    return {
      success: false,
      errors: parseResult.errors.map((e) => ({
        message: e.message,
        line: e.line,
        column: e.column,
        severity: e.severity,
      })),
    };
  }

  if (!parseResult.testFile || parseResult.testFile.testCases.length === 0) {
    return {
      success: false,
      errors: [{ message: "No test cases found in test file", line: 0, column: 0, severity: "error" }],
    };
  }

  // 5. Semantic analysis of test file
  if (compileResult.symbolTables) {
    const testAnalysis = analyzeTestFile(parseResult.testFile, compileResult.symbolTables);
    if (testAnalysis.errors.length > 0) {
      return {
        success: false,
        errors: testAnalysis.errors.map((e) => ({
          message: e.message,
          line: e.line,
          column: e.column,
          severity: e.severity,
        })),
      };
    }
  }

  // 6. Generate test_main.cpp
  const pous = compileResult.ast ? buildPOUInfoFromAST(compileResult.ast).pous : [];
  const testMainCpp = generateTestMain([parseResult.testFile], {
    headerFileName: "generated.hpp",
    pous,
    isTestBuild: true,
    ...(compileResult.ast ? { ast: compileResult.ast } : {}),
    ...(compileResult.resolvedLibraries ? { libraryArchives: compileResult.resolvedLibraries } : {}),
  });

  // 7. Write to temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-test-"));
  try {
    fs.writeFileSync(path.join(tempDir, "generated.hpp"), compileResult.headerCode, "utf-8");
    fs.writeFileSync(path.join(tempDir, "generated.cpp"), compileResult.cppCode, "utf-8");
    fs.writeFileSync(path.join(tempDir, "test_main.cpp"), testMainCpp, "utf-8");

    // 8. Find runtime paths
    const runtimePaths = findRuntimePaths();
    if (!runtimePaths) {
      return {
        success: false,
        errors: [{ message: "Could not locate runtime include directory", line: 0, column: 0, severity: "error" }],
      };
    }
    const testRuntimeDir = path.resolve(path.dirname(runtimePaths.includeDir), "test");

    // 9. Compile with g++
    const binaryName = process.platform === "win32" ? "test_runner.exe" : "test_runner";
    const binaryPath = path.join(tempDir, binaryName);
    const gppPath = currentSettings.gppPath || "g++";
    const cxxFlags = currentSettings.cxxFlags || "";

    try {
      await execFile(gppPath, [
        "-std=c++17",
        `-I${runtimePaths.includeDir}`,
        `-I${testRuntimeDir}`,
        `-I${tempDir}`,
        ...splitCxxFlags(cxxFlags),
        path.join(tempDir, "test_main.cpp"),
        path.join(tempDir, "generated.cpp"),
        "-o",
        binaryPath,
      ], { env: getCxxEnv() });
    } catch (err: unknown) {
      const execErr = err as { stderr?: string };
      const stderr = execErr.stderr ?? "Unknown compilation error";
      return {
        success: false,
        errors: [{ message: `C++ compilation failed:\n${stderr}`, line: 0, column: 0, severity: "error" }],
      };
    }

    // 10. Execute test binary with --json flag
    let stdout: string;
    try {
      const result = await execFile(binaryPath, ["--json"], {
        encoding: "utf-8",
        timeout: 30000,
      });
      stdout = result.stdout;
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; signal?: string; code?: number };
      // Test binary returns exit code 1 when tests fail — that's normal, stdout still has JSON
      if (execErr.stdout) {
        stdout = execErr.stdout;
      } else {
        const detail = execErr.signal
          ? `Test binary crashed with signal ${execErr.signal}`
          : `Test binary failed with exit code ${execErr.code ?? 1}`;
        return {
          success: false,
          errors: [{ message: detail, line: 0, column: 0, severity: "error" }],
        };
      }
    }

    // 11. Parse JSON output
    try {
      const output = parseTestJson(stdout);
      return { success: true, output, errors: [] };
    } catch {
      return {
        success: false,
        errors: [{ message: `Failed to parse test output: ${stdout.slice(0, 200)}`, line: 0, column: 0, severity: "error" }],
      };
    }
  } finally {
    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
});

function publishDiagnostics(
  uri: string,
  result?: import("strucpp").AnalysisResult,
): void {
  if (!result) return;
  const fileName = docManager.getFileName(uri);
  const diagnostics = toLspDiagnostics(result.errors, result.warnings, fileName);
  connection.sendDiagnostics({ uri, diagnostics });
}

/**
 * Find the runtime include and repl directories from the strucpp package.
 * Uses require.resolve to locate the package on disk, then navigates to
 * src/runtime/include/ and src/runtime/repl/.
 */
function findRuntimePaths(): { includeDir: string; replDir: string } | null {
  // Bundled runtime (highest priority — works in published .vsix)
  // After esbuild bundle: out/server.js → runtime/include/, runtime/repl/
  const bundledCandidates = [
    path.resolve(__dirname, "..", "runtime"),
    path.resolve(__dirname, "..", "..", "runtime"),
  ];
  for (const base of bundledCandidates) {
    const includeDir = path.join(base, "include");
    const replDir = path.join(base, "repl");
    if (
      fs.existsSync(path.join(includeDir, "iec_types.hpp")) &&
      fs.existsSync(path.join(replDir, "isocline.h"))
    ) {
      return { includeDir, replDir };
    }
  }

  // From require.resolve (works with symlinked file: dependency in dev)
  const candidates: string[] = [];
  try {
    const strucppMain = require.resolve("strucpp");
    const pkgRoot = path.resolve(path.dirname(strucppMain), "..");
    candidates.push(pkgRoot);
  } catch {
    // strucpp not resolvable
  }

  // Fallback: relative from this server file's location
  candidates.push(
    path.resolve(__dirname, "..", "..", ".."),
    path.resolve(__dirname, "..", "..", "..", ".."),
  );

  for (const base of candidates) {
    const includeDir = path.join(base, "src", "runtime", "include");
    const replDir = path.join(base, "src", "runtime", "repl");
    if (
      fs.existsSync(path.join(includeDir, "iec_types.hpp")) &&
      fs.existsSync(path.join(replDir, "isocline.h"))
    ) {
      return { includeDir, replDir };
    }
  }

  return null;
}

/**
 * Find the bundled libs/ directory from the strucpp package.
 * The strucpp package is linked via file:.. so libs/ is at the package root.
 */
function findLibraryPaths(): string[] {
  const paths: string[] = [];

  // Bundled libs (highest priority — works in published .vsix)
  const bundledCandidates = [
    path.resolve(__dirname, "..", "bundled-libs"),
    path.resolve(__dirname, "..", "..", "bundled-libs"),
  ];
  for (const candidate of bundledCandidates) {
    if (fs.existsSync(candidate)) {
      paths.push(candidate);
      return paths;
    }
  }

  // Resolve from require.resolve (works with symlinked file: dependency)
  try {
    const strucppMain = require.resolve("strucpp");
    const libsDir = path.resolve(path.dirname(strucppMain), "..", "libs");
    if (fs.existsSync(libsDir)) {
      paths.push(libsDir);
    }
  } catch {
    // strucpp not resolvable via require — try relative paths
  }

  // Fallback: relative from this server file's location
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
