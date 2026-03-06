// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared LSP protocol types for STruC++ extension client ↔ server communication.
 */

import { RequestType } from "vscode-languageserver/node.js";

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
