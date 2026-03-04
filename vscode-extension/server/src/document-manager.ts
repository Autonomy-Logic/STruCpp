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
} from "strucpp";

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
      includedPaths.add(otherPath);
      additionalSources.push({
        source: otherState.source,
        fileName: path.basename(otherPath),
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

    const options: Partial<CompileOptions> = {
      fileName: currentFileName,
      ...(additionalSources.length > 0 ? { additionalSources } : {}),
      ...(this.libraryPaths.length > 0
        ? { libraryPaths: this.libraryPaths }
        : {}),
    };

    state.analysisResult = this.analyzeFn(state.source, options);

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

/**
 * Recursively discover all .st / .iecst files in a directory.
 * Guards against unbounded recursion (max depth), symlink cycles, and hidden dirs.
 */
function discoverStFiles(
  dir: string,
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
        results.push(...discoverStFiles(fullPath, depth + 1, seen));
      } else if (/\.(st|iecst)$/i.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }
  return results;
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
function isTestFile(source: string): boolean {
  // Strip leading comments and whitespace, then check the first keyword
  const stripped = source
    .replace(/^\uFEFF/, "")             // strip UTF-8 BOM
    .replace(/\/\/.*$/gm, "")           // remove line comments
    .replace(/\(\*[\s\S]*?\*\)/g, "")   // remove block comments
    .trimStart();
  return /^(TEST|SETUP)\b/i.test(stripped);
}
