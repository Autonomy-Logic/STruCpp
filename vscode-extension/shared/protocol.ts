// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared LSP protocol types for STruC++ extension client ↔ server communication.
 */

import { RequestType, RequestType0, NotificationType0 } from "vscode-languageserver/node.js";

// ---------------------------------------------------------------------------
// strucpp/compile
// ---------------------------------------------------------------------------

export interface CompileParams {
  uri: string;
  workspace?: boolean;
}

export interface CompileError {
  message: string;
  line: number;
  column: number;
  severity: string;
  file?: string;
}

export interface CompileResponse {
  success: boolean;
  cppCode: string;
  headerCode: string;
  errors: CompileError[];
  warnings: CompileError[];
  primaryFileName: string;
}

export const CompileRequest = new RequestType<
  CompileParams,
  CompileResponse,
  void
>("strucpp/compile");

// ---------------------------------------------------------------------------
// strucpp/build — extends compile with REPL main
// ---------------------------------------------------------------------------

export interface BuildParams {
  uri: string;
}

export interface BuildResponse extends CompileResponse {
  mainCppCode: string;
  headerFileName: string;
  /** Resolved path to runtime/include/ (for -I flag to g++) */
  runtimeIncludeDir: string;
  /** Resolved path to runtime/repl/ (isocline) */
  replDir: string;
}

export const BuildRequest = new RequestType<
  BuildParams,
  BuildResponse,
  void
>("strucpp/build");

// ---------------------------------------------------------------------------
// strucpp/getSettings
// ---------------------------------------------------------------------------

export interface ExtensionSettings {
  libraryPaths: string[];
  autoDiscoverLibraries: boolean;
  outputDirectory: string;
  gppPath: string;
  ccPath: string;
  cxxFlags: string;
  globalConstants: Record<string, number>;
  autoAnalyze: boolean;
  analyzeDelay: number;
  formatOnSave: boolean;
}

export const GetSettingsRequest = new RequestType<
  void,
  ExtensionSettings,
  void
>("strucpp/getSettings");

// ---------------------------------------------------------------------------
// strucpp/compileLib — compile workspace .st files into a .stlib archive
// ---------------------------------------------------------------------------

export interface CompileLibParams {
  uri: string;
  libName: string;
  libVersion: string;
}

export interface CompileLibResponse {
  success: boolean;
  archiveJson: string;
  errors: CompileError[];
  warnings: CompileError[];
  libName: string;
}

export const CompileLibRequest = new RequestType<
  CompileLibParams,
  CompileLibResponse,
  void
>("strucpp/compileLib");

// ---------------------------------------------------------------------------
// strucpp/getLibraries — list loaded library archives for explorer
// ---------------------------------------------------------------------------

export interface LibraryArchiveInfo {
  filePath: string;
  archive: {
    manifest: {
      name: string;
      version: string;
      description?: string;
      namespace: string;
      functions: Array<{
        name: string;
        returnType: string;
        parameters: Array<{ name: string; type: string; direction: string }>;
      }>;
      functionBlocks: Array<{
        name: string;
        inputs: Array<{ name: string; type: string }>;
        outputs: Array<{ name: string; type: string }>;
        inouts: Array<{ name: string; type: string }>;
      }>;
      types: Array<{
        name: string;
        kind: string;
        baseType?: string;
      }>;
    };
    headerCode: string;
    cppCode: string;
    sources?: Array<{ fileName: string; source: string }>;
    dependencies: Array<{ name: string; version: string }>;
  };
}

export const GetLibrariesRequest = new RequestType0<
  LibraryArchiveInfo[],
  void
>("strucpp/getLibraries");

export const LibrariesChangedNotification = new NotificationType0(
  "strucpp/librariesChanged",
);

// ---------------------------------------------------------------------------
// strucpp/runTests — compile and execute test file, return JSON results
// ---------------------------------------------------------------------------

export interface RunTestsParams {
  /** URI of the test file to run */
  testFileUri: string;
  /** Optional: specific test names to run (runs all if empty/omitted).
   *  TODO: Not yet implemented server-side — currently all tests in the file are executed. */
  testNames?: string[];
}

export interface RunTestsResponse {
  success: boolean;
  /** Parsed JSON output from test binary (when success=true) */
  output?: import("./test-result.js").TestRunOutput;
  /** Compilation or execution errors */
  errors: CompileError[];
}

export const RunTestsRequest = new RequestType<
  RunTestsParams,
  RunTestsResponse,
  void
>("strucpp/runTests");
