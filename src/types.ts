// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Type Definitions
 *
 * Core type definitions used throughout the compiler.
 */

/**
 * Compilation options for the STruC++ compiler.
 */
export interface CompileOptions {
  /** Enable debug mode with additional output */
  debug: boolean;

  /** Generate line mapping between ST and C++ */
  lineMapping: boolean;

  /** Optimization level (0 = none, 1 = basic, 2 = full) */
  optimizationLevel: 0 | 1 | 2;

  /** Output directory for generated files */
  outputDir?: string;

  /** Include #line directives in generated C++ */
  lineDirectives?: boolean;

  /** Absolute source path used in #line directives (for debugger file resolution).
   *  Falls back to fileName when not set. */
  lineDirectiveFileName?: string;

  /** Include ST source as comments in generated C++ */
  sourceComments?: boolean;

  /** Header filename to use in #include directive (default: "generated.hpp") */
  headerFileName?: string;

  /** Primary source file name for error reporting (default: "main.st") */
  fileName?: string;

  /** Additional ST source files to compile together */
  additionalSources?: Array<{
    source: string;
    fileName: string;
  }>;

  /** Library search paths — discovers *.stlib files */
  libraryPaths?: string[];

  /** Pre-loaded .stlib library archives */
  libraries?: import("./library/library-manifest.js").StlibArchive[];

  /** Skip source inclusion when compiling libraries (closed-source) */
  noSource?: boolean;

  /** Whether this is a test build (adds mock infrastructure to generated code) */
  isTestBuild?: boolean;

  /** Global constants injected as constexpr into the C++ header preamble (before namespace).
   *  Useful for library-wide sizing parameters like STRING_LENGTH, LIST_LENGTH. */
  globalConstants?: Record<string, number>;
}

/**
 * Severity level for compiler messages.
 */
export type Severity = "error" | "warning" | "info";

/**
 * A compiler error or warning message.
 */
export interface CompileError {
  /** The error message */
  message: string;

  /** Line number in the source file (1-indexed) */
  line: number;

  /** Column number in the source file (1-indexed) */
  column: number;

  /** End line number (1-indexed). Falls back to line if not set. */
  endLine?: number;

  /** End column number (1-indexed). Falls back to column if not set. */
  endColumn?: number;

  /** Severity of the message */
  severity: Severity;

  /** Optional source file path */
  file?: string;

  /** Optional error code */
  code?: string;

  /** Optional suggestion for fixing the error */
  suggestion?: string;
}

/**
 * Line mapping entry from ST to C++.
 */
export interface LineMapEntry {
  /** First C++ line for this ST line */
  cppStartLine: number;

  /** Last C++ line for this ST line */
  cppEndLine: number;
}

/**
 * Result of a compilation.
 */
export interface CompileResult {
  /** Whether compilation was successful */
  success: boolean;

  /** Generated C++ implementation code */
  cppCode: string;

  /** Generated C++ header code */
  headerCode: string;

  /** Line mapping from ST line numbers to C++ implementation line ranges */
  lineMap: Map<number, LineMapEntry>;

  /** Line mapping from ST line numbers to C++ header line ranges */
  headerLineMap: Map<number, LineMapEntry>;

  /** Compilation errors */
  errors: CompileError[];

  /** Compilation warnings */
  warnings: CompileError[];

  /** Optional debug information */
  debugInfo?: unknown;

  /** Parsed AST (only populated on successful compilation) */
  ast?: import("./frontend/ast.js").CompilationUnit;

  /** Project model (only populated on successful compilation) */
  projectModel?: import("./project-model.js").ProjectModel;

  /** Symbol tables from semantic analysis (only populated on successful compilation) */
  symbolTables?: import("./semantic/symbol-table.js").SymbolTables;

  /** Resolved library archives (stdlib + user) used during compilation */
  resolvedLibraries?: import("./library/library-manifest.js").StlibArchive[];
}

/**
 * Result of semantic analysis (no code generation).
 * Unlike CompileResult, always returns partial results even when errors are present.
 */
export interface AnalysisResult {
  /** Parsed AST (available even with semantic errors) */
  ast?: import("./frontend/ast.js").CompilationUnit;

  /** Symbol tables from semantic analysis (available even with errors) */
  symbolTables?: import("./semantic/symbol-table.js").SymbolTables;

  /** Project model (available if AST was built successfully) */
  projectModel?: import("./project-model.js").ProjectModel;

  /** Standard function registry for autocomplete */
  stdFunctionRegistry?: import("./semantic/std-function-registry.js").StdFunctionRegistry;

  /** Analysis errors */
  errors: CompileError[];

  /** Analysis warnings */
  warnings: CompileError[];
}

/**
 * Source location span for AST nodes.
 */
export interface SourceSpan {
  /** Source file path */
  file: string;

  /** Start line (1-indexed) */
  startLine: number;

  /** End line (1-indexed) */
  endLine: number;

  /** Start column (1-indexed) */
  startCol: number;

  /** End column (1-indexed) */
  endCol: number;
}
