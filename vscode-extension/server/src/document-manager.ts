// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Document Manager — Per-file analysis cache
 *
 * Manages the state of open documents and coordinates re-analysis
 * through the STruC++ compiler's analyze() function.
 * Discovers all .st files in workspace folders for multi-file projects.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { URI } from "vscode-uri";
import type {
  AnalysisResult,
  CompileOptions,
  StlibArchive,
} from "strucpp";
import { parseTestFile, analyzeTestFile } from "strucpp";
import { isTestFile } from "../../shared/test-utils.js";

export interface DocumentState {
  uri: string;
  version: number;
  source: string;
  analysisResult?: AnalysisResult;
}

export type AnalyzeFn = (
  source: string,
  options?: Partial<CompileOptions>,
) => AnalysisResult;

export class DocumentManager {
  private documents = new Map<string, DocumentState>();
  private analyzeFn: AnalyzeFn;
  private workspaceFolders = new Set<string>();
  private libraryPaths: string[] = [];
  private discoveryCache = new Map<string, string[]>();
  /** Cached library sources keyed by library name, for analyzing strucpp-lib: documents. */
  private librarySources = new Map<string, Array<{ fileName: string; source: string }>>();
  /** Cached library archives keyed by library name, for passing as dependencies. */
  private libraryArchives = new Map<string, StlibArchive>();
  /** Cached file paths for library archives, keyed by library name. */
  private libraryFilePaths = new Map<string, string>();

  /**
   * Case map: UPPERCASE identifier → first-seen original casing.
   * Built from ALL source texts encountered during analysis (open docs +
   * workspace files from disk). Used by completion to restore original casing.
   */
  private _caseMap = new Map<string, string>();

  constructor(analyzeFn: AnalyzeFn) {
    this.analyzeFn = analyzeFn;
  }

  /** Get the workspace-wide case map for identifier casing restoration. */
  getCaseMap(): ReadonlyMap<string, string> {
    return this._caseMap;
  }

  setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = new Set(folders);
    this.invalidateDiscoveryCache();
  }

  addWorkspaceFolders(folders: string[]): void {
    for (const f of folders) {
      this.workspaceFolders.add(f);
    }
    this.invalidateDiscoveryCache();
  }

  removeWorkspaceFolders(folders: string[]): void {
    for (const f of folders) {
      this.workspaceFolders.delete(f);
    }
    this.invalidateDiscoveryCache();
  }

  invalidateDiscoveryCache(): void {
    this.discoveryCache.clear();
  }

  setLibraryPaths(paths: string[]): void {
    this.libraryPaths = paths;
  }

  getLibraryPaths(): string[] {
    return this.libraryPaths;
  }

  /** Cache a library's source files and archive for strucpp-lib: document analysis. */
  setLibraryArchiveCache(libName: string, archive: StlibArchive, filePath?: string): void {
    if (archive.sources && archive.sources.length > 0) {
      this.librarySources.set(libName, archive.sources);
    }
    this.libraryArchives.set(libName, archive);
    if (filePath) {
      this.libraryFilePaths.set(libName, filePath);
    }
  }

  clearLibraryArchiveCache(): void {
    this.librarySources.clear();
    this.libraryArchives.clear();
    this.libraryFilePaths.clear();
  }

  /** Get all cached library archives with their file paths. */
  getCachedLibraries(): Array<{ filePath: string; archive: StlibArchive }> {
    const results: Array<{ filePath: string; archive: StlibArchive }> = [];
    for (const [name, archive] of this.libraryArchives) {
      results.push({
        filePath: this.libraryFilePaths.get(name) ?? "",
        archive,
      });
    }
    return results;
  }

  getWorkspaceFolders(): ReadonlySet<string> {
    return this.workspaceFolders;
  }

  /**
   * Discover directories containing .stlib files anywhere in the workspace.
   * Recursively walks workspace folders (same guards as .st discovery)
   * and returns deduplicated parent directories of any .stlib files found.
   */
  discoverWorkspaceLibraries(): string[] {
    const dirSet = new Set<string>();

    for (const folder of this.workspaceFolders) {
      for (const stlibPath of discoverFiles(folder, /\.stlib$/i)) {
        dirSet.add(path.dirname(stlibPath));
      }
    }

    return [...dirSet];
  }

  /**
   * Build sources from ALL workspace .st files (open docs + disk).
   * Used for library compilation where no file is excluded.
   */
  buildAllWorkspaceSources(): Array<{ source: string; fileName: string }> {
    return this.collectWorkspaceSources();
  }

  /**
   * Build additional sources from all workspace .st files (open docs + disk),
   * excluding the given primary file URI.
   */
  buildWorkspaceSources(
    excludeUri: string,
  ): Array<{ source: string; fileName: string }> {
    return this.collectWorkspaceSources(excludeUri);
  }

  /**
   * Collect workspace .st sources from open documents and disk.
   * If excludeUri is provided, that document and its disk path are skipped.
   */
  private collectWorkspaceSources(
    excludeUri?: string,
  ): Array<{ source: string; fileName: string }> {
    const excludePath = excludeUri ? uriToFilePath(excludeUri) : undefined;
    const sources: Array<{ source: string; fileName: string }> = [];
    const includedPaths = new Set<string>();

    // 1. Include open documents (they may have unsaved edits)
    for (const [uri, state] of this.documents) {
      if (uri === excludeUri) continue;
      if (isTestFile(state.source)) continue;
      const filePath = uriToFilePath(uri);
      includedPaths.add(filePath);
      sources.push({
        source: state.source,
        fileName: path.basename(filePath),
      });
    }

    // 2. Discover .st files from workspace folders (read from disk, cached)
    for (const folder of this.workspaceFolders) {
      let discovered = this.discoveryCache.get(folder);
      if (!discovered) {
        discovered = discoverStFiles(folder);
        this.discoveryCache.set(folder, discovered);
      }
      for (const filePath of discovered) {
        if (filePath === excludePath || includedPaths.has(filePath)) continue;
        includedPaths.add(filePath);
        try {
          const source = fs.readFileSync(filePath, "utf-8");
          if (isTestFile(source)) continue;
          sources.push({
            source,
            fileName: path.basename(filePath),
          });
        } catch {
          // Skip unreadable files
        }
      }
    }

    return sources;
  }

  onDocumentOpen(uri: string, source: string): DocumentState {
    const state: DocumentState = { uri, version: 0, source };
    this.documents.set(uri, state);
    this.analyzeDocument(state);
    return state;
  }

  onDocumentChange(
    uri: string,
    source: string,
    version: number,
  ): DocumentState | undefined {
    const state = this.documents.get(uri);
    if (!state) return undefined;

    state.source = source;
    state.version = version;
    this.analyzeDocument(state);
    return state;
  }

  onDocumentClose(uri: string): void {
    this.documents.delete(uri);
  }

  getState(uri: string): DocumentState | undefined {
    return this.documents.get(uri);
  }

  getAllDocuments(): DocumentState[] {
    return [...this.documents.values()];
  }

  /** Get all document states as a Map (for cross-file lookups). */
  getAllDocumentStates(): ReadonlyMap<string, DocumentState> {
    return this.documents;
  }

  /** Extract a bare fileName from a URI. */
  getFileName(uri: string): string {
    return path.basename(uriToFilePath(uri));
  }

  /** Map a bare fileName back to a URI among open documents. */
  getUriForFile(fileName: string): string | undefined {
    for (const [uri] of this.documents) {
      if (path.basename(uriToFilePath(uri)) === fileName) {
        return uri;
      }
    }
    return undefined;
  }

  /**
   * Find the library source file and line where a symbol is declared.
   * Searches all cached library sources for FUNCTION_BLOCK, FUNCTION,
   * TYPE, or PROGRAM declarations matching the given symbol name.
   */
  findSymbolInLibrarySources(
    symbolName: string,
  ): { uri: string; line: number } | undefined {
    const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const declPattern = new RegExp(
      `^\\s*(?:FUNCTION_BLOCK|FUNCTION|TYPE|PROGRAM)\\s+${escaped}\\b`,
      "im",
    );
    for (const [libName, sources] of this.librarySources) {
      for (const src of sources) {
        const lines = src.source.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (declPattern.test(lines[i])) {
            return {
              uri: `strucpp-lib:/${libName}/sources/${src.fileName}`,
              line: i,
            };
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Resolve a bare fileName (from compiler sourceSpan) to a file:// URI.
   * Searches open documents first, then discovered workspace files.
   */
  resolveFileNameToUri(fileName: string): string | undefined {
    // 1. Check open documents first (may have unsaved edits)
    const openUri = this.getUriForFile(fileName);
    if (openUri) return openUri;

    // 2. Search discovered workspace files
    for (const folder of this.workspaceFolders) {
      let discovered = this.discoveryCache.get(folder);
      if (!discovered) {
        discovered = discoverStFiles(folder);
        this.discoveryCache.set(folder, discovered);
      }
      for (const filePath of discovered) {
        if (path.basename(filePath) === fileName) {
          return URI.file(filePath).toString();
        }
      }
    }

    // 3. Search library source files (strucpp-lib: virtual documents)
    for (const [libName, sources] of this.librarySources) {
      for (const src of sources) {
        if (src.fileName === fileName) {
          return `strucpp-lib:/${libName}/sources/${fileName}`;
        }
      }
    }

    return undefined;
  }

  /**
   * Re-analyze all open documents. Useful when workspace folders change
   * or when a file is saved that may affect other files.
   */
  reanalyzeAll(): Map<string, AnalysisResult | undefined> {
    const results = new Map<string, AnalysisResult | undefined>();
    for (const state of this.documents.values()) {
      this.analyzeDocument(state);
      results.set(state.uri, state.analysisResult);
    }
    return results;
  }

  private analyzeDocument(state: DocumentState): void {
    const currentFilePath = uriToFilePath(state.uri);
    const currentFileName = path.basename(currentFilePath);

    // Build additional sources: open documents + workspace .st files from disk
    const additionalSources: Array<{ source: string; fileName: string }> = [];
    const includedPaths = new Set<string>();

    // 1. Include other open documents (they may have unsaved edits)
    for (const [otherUri, otherState] of this.documents) {
      if (otherUri === state.uri) continue;
      // Skip test files — they use a separate parser
      if (isTestFile(otherState.source)) continue;
      const otherPath = uriToFilePath(otherUri);
      const otherBaseName = path.basename(otherPath);
      includedPaths.add(otherPath);
      includedPaths.add(otherBaseName);
      additionalSources.push({
        source: otherState.source,
        fileName: otherBaseName,
      });
    }

    // 2. For strucpp-lib: documents, include sibling sources from the same library
    const libMatch = state.uri.match(/^strucpp-lib:\/([^/]+)\//);
    if (libMatch) {
      const libSources = this.librarySources.get(libMatch[1]);
      if (libSources) {
        for (const src of libSources) {
          if (src.fileName === currentFileName) continue;
          if (includedPaths.has(src.fileName)) continue;
          includedPaths.add(src.fileName);
          additionalSources.push(src);
        }
      }
    }

    // 3. Discover .st files from workspace folders (read from disk, cached)
    for (const folder of this.workspaceFolders) {
      let discovered = this.discoveryCache.get(folder);
      if (!discovered) {
        discovered = discoverStFiles(folder);
        this.discoveryCache.set(folder, discovered);
      }
      for (const filePath of discovered) {
        // Skip the current file and files already included from open docs
        if (filePath === currentFilePath || includedPaths.has(filePath)) continue;
        includedPaths.add(filePath);
        try {
          const source = fs.readFileSync(filePath, "utf-8");
          // Skip test files — they use a separate parser (TEST/END_TEST syntax)
          if (isTestFile(source)) continue;
          additionalSources.push({
            source,
            fileName: path.basename(filePath),
          });
        } catch {
          // Skip unreadable files
        }
      }
    }

    // For strucpp-lib: documents, pass pre-loaded archives excluding the
    // current library to avoid duplicate symbol registration.
    let libraryOption: Partial<CompileOptions> = {};
    if (libMatch && this.libraryArchives.size > 0) {
      const currentLib = libMatch[1];
      const deps = [...this.libraryArchives.entries()]
        .filter(([name]) => name !== currentLib)
        .map(([, archive]) => archive);
      if (deps.length > 0) {
        libraryOption = { libraries: deps };
      }
    } else if (this.libraryPaths.length > 0) {
      libraryOption = { libraryPaths: this.libraryPaths };
    }

    const options: Partial<CompileOptions> = {
      fileName: currentFileName,
      ...(additionalSources.length > 0 ? { additionalSources } : {}),
      ...libraryOption,
    };

    // Test files use TEST/END_TEST syntax that the standard parser doesn't
    // understand. Analyze with empty primary source so we still get symbol
    // tables from workspace sources (for completions/hover of user types)
    // without emitting parser errors for test syntax. The hover and
    // completion providers handle test files via text-based word extraction.
    if (isTestFile(state.source)) {
      state.analysisResult = this.analyzeFn("", options);

      // Parse the test file and run semantic validation (assert arg counts,
      // mock targets, type refs, undeclared vars) to surface diagnostics
      if (state.analysisResult?.symbolTables) {
        const parseResult = parseTestFile(state.source, currentFileName);
        if (parseResult.errors.length > 0) {
          state.analysisResult.errors = [
            ...state.analysisResult.errors,
            ...parseResult.errors.map((e) => ({
              message: (e as { message?: string }).message ?? String(e),
              line: (e as { token?: { startLine?: number } }).token?.startLine ?? 1,
              column: (e as { token?: { startColumn?: number } }).token?.startColumn ?? 1,
              severity: "error" as const,
            })),
          ];
        } else if (parseResult.testFile) {
          const testDiags = analyzeTestFile(
            parseResult.testFile,
            state.analysisResult.symbolTables,
          );
          state.analysisResult.errors = [
            ...state.analysisResult.errors,
            ...testDiags.errors,
          ];
          state.analysisResult.warnings = [
            ...state.analysisResult.warnings,
            ...testDiags.warnings,
          ];
        }
      }
    } else {
      state.analysisResult = this.analyzeFn(state.source, options);
    }

    // Rebuild the workspace-wide case map from all sources we just read.
    // This runs on every analysis (~400ms debounced), reusing the sources
    // we already have in memory — no extra I/O.
    this._caseMap.clear();
    addToCaseMap(this._caseMap, state.source);
    for (const addlSrc of additionalSources) {
      addToCaseMap(this._caseMap, addlSrc.source);
    }
  }
}

/** Maximum recursion depth for file discovery */
const MAX_DISCOVERY_DEPTH = 10;

/** Pattern matching .st and .iecst source files */
const ST_FILE_PATTERN = /\.(st|iecst)$/i;

/**
 * Recursively discover files matching a pattern in a directory.
 * Guards against unbounded recursion (max depth), symlink cycles, and hidden dirs.
 */
function discoverFiles(
  dir: string,
  pattern: RegExp,
  depth: number = 0,
  seenReal?: Set<string>,
): string[] {
  if (depth > MAX_DISCOVERY_DEPTH) return [];

  const seen = seenReal ?? new Set<string>();

  // Resolve real path to detect symlink cycles
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    return [];
  }
  if (seen.has(realDir)) return [];
  seen.add(realDir);

  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden directories (e.g., .git, .vscode)
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        // Skip common non-source directories
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "out" ||
          entry.name === "build"
        ) {
          continue;
        }
        results.push(...discoverFiles(fullPath, pattern, depth + 1, seen));
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
}

/** Discover all .st / .iecst files recursively. */
function discoverStFiles(dir: string): string[] {
  return discoverFiles(dir, ST_FILE_PATTERN);
}

function uriToFilePath(uri: string): string {
  try {
    return URI.parse(uri).fsPath;
  } catch {
    return uri;
  }
}

/**
 * Extract identifiers from source text and add them to a case map.
 * First-occurrence wins: if the map already has an entry for an uppercase key,
 * it is not overwritten.
 */
function addToCaseMap(map: Map<string, string>, source: string): void {
  const regex = /\b([a-zA-Z_]\w*)\b/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const original = match[1];
    const upper = original.toUpperCase();
    if (!map.has(upper)) {
      map.set(upper, original);
    }
  }
}

/**
 * Detect whether source content is a test file (uses TEST/END_TEST syntax).
 * Checks if the first non-comment, non-whitespace code token is TEST or SETUP.
 */
