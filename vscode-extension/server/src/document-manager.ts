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
  private workspaceFolders: string[] = [];
  private libraryPaths: string[] = [];

  constructor(analyzeFn: AnalyzeFn) {
    this.analyzeFn = analyzeFn;
  }

  setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = folders;
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

    // 2. Discover .st files from workspace folders (read from disk)
    for (const folder of this.workspaceFolders) {
      for (const filePath of discoverStFiles(folder)) {
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
  }
}

/**
 * Recursively discover all .st / .iecst files in a directory.
 */
function discoverStFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-source directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === "out" ||
          entry.name === "build"
        ) {
          continue;
        }
        results.push(...discoverStFiles(fullPath));
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
    return new URL(uri).pathname;
  } catch {
    return uri;
  }
}

/**
 * Detect whether source content is a test file (uses TEST/END_TEST syntax).
 * Checks if the first non-comment, non-whitespace code token is TEST or SETUP.
 */
function isTestFile(source: string): boolean {
  // Strip leading comments and whitespace, then check the first keyword
  const stripped = source
    .replace(/\/\/.*$/gm, "")           // remove line comments
    .replace(/\(\*[\s\S]*?\*\)/g, "")   // remove block comments
    .trimStart();
  return /^(TEST|SETUP)\b/i.test(stripped);
}
