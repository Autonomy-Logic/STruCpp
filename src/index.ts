// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ - IEC 61131-3 Structured Text to C++ Compiler
 *
 * Main entry point for the STruC++ compiler library.
 * This module exports the public API for programmatic usage.
 */

import {
  CompileOptions,
  CompileResult,
  CompileError,
  AnalysisResult,
} from "./types.js";
import { parse as parseSource } from "./frontend/parser.js";
import { buildAST } from "./frontend/ast-builder.js";
import { buildProjectModel } from "./project-model.js";
import { SymbolTables } from "./semantic/symbol-table.js";
import { SemanticAnalyzer } from "./semantic/analyzer.js";
import { CodeGenerator } from "./backend/codegen.js";
import { StdFunctionRegistry } from "./semantic/std-function-registry.js";
import type { CompilationUnit } from "./frontend/ast.js";
import { mergeCompilationUnits } from "./merge.js";
import {
  registerLibrarySymbols,
  discoverStlibs,
  LibraryManifestError,
} from "./library/library-loader.js";
import type { StlibArchive } from "./library/library-manifest.js";

/**
 * Default compilation options
 */
export const defaultOptions: CompileOptions = {
  debug: false,
  lineMapping: true,
  optimizationLevel: 0,
};

/**
 * Compile IEC 61131-3 Structured Text source code to C++.
 *
 * @param source - The ST source code to compile
 * @param options - Compilation options
 * @returns The compilation result containing C++ code and metadata
 *
 * @example
 * ```typescript
 * import { compile } from 'strucpp';
 *
 * const stSource = `
 * PROGRAM Main
 *   VAR counter : INT; END_VAR
 *   counter := counter + 1;
 * END_PROGRAM
 * `;
 *
 * const result = compile(stSource, { debug: true, lineMapping: true });
 * console.log(result.cppCode);
 * console.log(result.lineMap);
 * ```
 */
export function compile(
  source: string,
  options: Partial<CompileOptions> = {},
): CompileResult {
  const mergedOptions = { ...defaultOptions, ...options };
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];

  // Phase 1: Parse ST source to CST
  const parseResult = parseSource(source);
  if (parseResult.errors.length > 0) {
    for (const err of parseResult.errors) {
      // Handle Chevrotain error format
      const errObj = err as {
        message?: string;
        token?: { startLine?: number; startColumn?: number };
      };
      errors.push({
        message: errObj.message ?? "Parse error",
        line: errObj.token?.startLine ?? 0,
        column: errObj.token?.startColumn ?? 0,
        severity: "error",
      });
    }
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors,
      warnings,
    };
  }

  // Phase 2: Build AST from CST (supports multi-file via additionalSources)
  let ast: CompilationUnit;
  if (!parseResult.cst) {
    errors.push({
      message: "Parse failed: no CST produced",
      line: 0,
      column: 0,
      severity: "error",
    });
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors,
      warnings,
    };
  }
  try {
    const globalConstants = mergedOptions.globalConstants;
    const primaryAst = buildAST(
      parseResult.cst,
      mergedOptions.fileName ?? "main.st",
      globalConstants,
    );
    const units: CompilationUnit[] = [primaryAst];

    // Parse additional source files
    if (mergedOptions.additionalSources) {
      for (const addlSource of mergedOptions.additionalSources) {
        const addlParseResult = parseSource(addlSource.source);
        if (addlParseResult.errors.length > 0) {
          for (const err of addlParseResult.errors) {
            const errObj = err as {
              message?: string;
              token?: { startLine?: number; startColumn?: number };
            };
            errors.push({
              message: errObj.message ?? "Parse error",
              line: errObj.token?.startLine ?? 0,
              column: errObj.token?.startColumn ?? 0,
              severity: "error",
              file: addlSource.fileName,
            });
          }
          continue;
        }
        if (addlParseResult.cst) {
          units.push(
            buildAST(addlParseResult.cst, addlSource.fileName, globalConstants),
          );
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        cppCode: "",
        headerCode: "",
        lineMap: new Map(),
        headerLineMap: new Map(),
        errors,
        warnings,
      };
    }

    ast = mergeCompilationUnits(units);
  } catch (e) {
    errors.push({
      message: `AST building failed: ${e instanceof Error ? e.message : String(e)}`,
      line: 0,
      column: 0,
      severity: "error",
    });
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors,
      warnings,
    };
  }

  // Phase 3: Build project model and validate
  const projectModelResult = buildProjectModel(ast);
  for (const err of projectModelResult.errors) {
    errors.push({
      message: err.message,
      line: err.line ?? 0,
      column: err.column ?? 0,
      severity: "error",
    });
  }
  for (const warn of projectModelResult.warnings) {
    warnings.push({
      message: warn.message,
      line: warn.line ?? 0,
      column: warn.column ?? 0,
      severity: "warning",
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors,
      warnings,
    };
  }

  // Phase 3.5: Library loading & Semantic analysis
  // Collect all library archives: explicit archives + discovered from paths
  const allArchives: StlibArchive[] = [...(mergedOptions.libraries ?? [])];
  for (const libPath of mergedOptions.libraryPaths ?? []) {
    try {
      allArchives.push(...discoverStlibs(libPath));
    } catch (e) {
      errors.push({
        message:
          e instanceof LibraryManifestError
            ? e.message
            : `Library loading failed: ${e instanceof Error ? e.message : String(e)}`,
        line: 0,
        column: 0,
        severity: "error",
      });
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors,
      warnings,
    };
  }

  // Auto-merge library globalConstants into effective constants.
  // Library values provide defaults; user-provided values take priority.
  for (const archive of allArchives) {
    if (archive.globalConstants) {
      if (!mergedOptions.globalConstants) {
        mergedOptions.globalConstants = {};
      }
      for (const [key, value] of Object.entries(archive.globalConstants)) {
        if (!(key in mergedOptions.globalConstants)) {
          mergedOptions.globalConstants[key] = value;
        }
      }
    }
  }

  // Single registration loop for all libraries (stdlib + user)
  let semanticSymbolTables: SymbolTables | undefined;
  if (allArchives.length > 0) {
    semanticSymbolTables = new SymbolTables();
    for (const archive of allArchives) {
      registerLibrarySymbols(archive.manifest, semanticSymbolTables);
    }
  }
  // Register global constants (e.g., STRING_LENGTH, LIST_LENGTH) in symbol tables
  if (mergedOptions.globalConstants) {
    if (!semanticSymbolTables) {
      semanticSymbolTables = new SymbolTables();
    }
    for (const name of Object.keys(mergedOptions.globalConstants)) {
      try {
        semanticSymbolTables.globalScope.define({
          name,
          kind: "constant",
          declaration:
            undefined as unknown as import("./frontend/ast.js").VarDeclaration,
          type: {
            typeKind: "elementary",
            name: "ULINT",
            sizeBits: 64,
          } as import("./frontend/ast.js").ElementaryType,
        });
      } catch {
        // Ignore duplicate
      }
    }
  }

  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast, semanticSymbolTables);
  for (const err of semanticResult.errors) {
    errors.push({
      message: err.message,
      line: err.line ?? 0,
      column: err.column ?? 0,
      severity: "error",
    });
  }
  for (const warn of semanticResult.warnings) {
    warnings.push({
      message: warn.message,
      line: warn.line ?? 0,
      column: warn.column ?? 0,
      severity: "warning",
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors,
      warnings,
    };
  }

  // Phase 4: Generate C++ code
  // Collect library headers for #include directives
  const libraryHeaders: string[] = [];
  for (const archive of allArchives) {
    for (const header of archive.manifest.headers) {
      if (!libraryHeaders.includes(header)) {
        libraryHeaders.push(header);
      }
    }
  }

  // Pass semantic symbol tables to codegen so it can use type info from semantic analysis
  const codegen = new CodeGenerator(semanticSymbolTables, {
    sourceComments: mergedOptions.debug,
    lineDirectives: mergedOptions.lineMapping,
    headerFileName: mergedOptions.headerFileName ?? "generated.hpp",
    libraryHeaders,
    isTestBuild: mergedOptions.isTestBuild ?? false,
    globalConstants: mergedOptions.globalConstants ?? {},
  });
  codegen.setProjectModel(projectModelResult.model);

  // Single codegen injection loop for all libraries (stdlib + user)
  for (const archive of allArchives) {
    codegen.registerLibraryFBTypes(
      archive.manifest.functionBlocks.map((fb) => fb.name),
    );
    if (archive.headerCode) {
      codegen.addLibraryPreamble(
        archive.manifest.name,
        archive.headerCode,
        archive.cppCode,
      );
    }
  }

  const codeResult = codegen.generate(ast);

  // Collect codegen warnings
  for (const warn of codeResult.warnings) {
    const entry: CompileError = {
      message: warn.message,
      line: warn.line ?? 0,
      column: warn.column ?? 0,
      severity: "warning",
    };
    if (warn.file !== undefined) {
      entry.file = warn.file;
    }
    warnings.push(entry);
  }

  return {
    success: true,
    cppCode: codeResult.cppCode,
    headerCode: codeResult.headerCode,
    lineMap: codeResult.lineMap,
    headerLineMap: codeResult.headerLineMap,
    errors,
    warnings,
    ast,
    projectModel: projectModelResult.model,
    symbolTables: semanticResult.symbolTables,
    ...(allArchives.length > 0 ? { resolvedLibraries: allArchives } : {}),
  };
}

/**
 * Analyze ST source code without code generation.
 * Unlike compile(), returns partial results (AST, symbol tables, project model)
 * even when errors are present, making it suitable for IDE/LSP integration.
 *
 * @param source - The ST source code to analyze
 * @param options - Compilation options (codegen options are ignored)
 * @returns Analysis result with AST, symbol tables, and diagnostics
 */
export function analyze(
  source: string,
  options: Partial<CompileOptions> = {},
): AnalysisResult {
  const mergedOptions = { ...defaultOptions, ...options };
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];
  let ast: CompilationUnit | undefined;
  let projectModel: import("./project-model.js").ProjectModel | undefined;
  let symbolTables: SymbolTables | undefined;

  // Phase 1: Parse ST source to CST
  const parseResult = parseSource(source);
  if (parseResult.errors.length > 0) {
    for (const err of parseResult.errors) {
      const errObj = err as {
        message?: string;
        token?: { startLine?: number; startColumn?: number };
      };
      errors.push({
        message: errObj.message ?? "Parse error",
        line: errObj.token?.startLine ?? 0,
        column: errObj.token?.startColumn ?? 0,
        severity: "error",
      });
    }
    return { errors, warnings, stdFunctionRegistry: new StdFunctionRegistry() };
  }

  // Phase 2: Build AST from CST
  if (!parseResult.cst) {
    errors.push({
      message: "Parse failed: no CST produced",
      line: 0,
      column: 0,
      severity: "error",
    });
    return { errors, warnings, stdFunctionRegistry: new StdFunctionRegistry() };
  }

  try {
    const globalConstants = mergedOptions.globalConstants;
    const primaryAst = buildAST(
      parseResult.cst,
      mergedOptions.fileName ?? "main.st",
      globalConstants,
    );
    const units: CompilationUnit[] = [primaryAst];

    if (mergedOptions.additionalSources) {
      for (const addlSource of mergedOptions.additionalSources) {
        const addlParseResult = parseSource(addlSource.source);
        if (addlParseResult.errors.length > 0) {
          for (const err of addlParseResult.errors) {
            const errObj = err as {
              message?: string;
              token?: { startLine?: number; startColumn?: number };
            };
            errors.push({
              message: errObj.message ?? "Parse error",
              line: errObj.token?.startLine ?? 0,
              column: errObj.token?.startColumn ?? 0,
              severity: "error",
              file: addlSource.fileName,
            });
          }
          continue;
        }
        if (addlParseResult.cst) {
          units.push(
            buildAST(addlParseResult.cst, addlSource.fileName, globalConstants),
          );
        }
      }
    }

    ast = mergeCompilationUnits(units);
  } catch (e) {
    errors.push({
      message: `AST building failed: ${e instanceof Error ? e.message : String(e)}`,
      line: 0,
      column: 0,
      severity: "error",
    });
    return {
      ...(ast ? { ast } : {}),
      errors,
      warnings,
      stdFunctionRegistry: new StdFunctionRegistry(),
    };
  }

  // Phase 3: Build project model (continue even on errors)
  try {
    const projectModelResult = buildProjectModel(ast);
    projectModel = projectModelResult.model;
    for (const err of projectModelResult.errors) {
      errors.push({
        message: err.message,
        line: err.line ?? 0,
        column: err.column ?? 0,
        severity: "error",
      });
    }
    for (const warn of projectModelResult.warnings) {
      warnings.push({
        message: warn.message,
        line: warn.line ?? 0,
        column: warn.column ?? 0,
        severity: "warning",
      });
    }
  } catch {
    // Project model failure is non-fatal for analysis
  }

  // Phase 4: Library loading
  const allArchives: StlibArchive[] = [...(mergedOptions.libraries ?? [])];
  for (const libPath of mergedOptions.libraryPaths ?? []) {
    try {
      allArchives.push(...discoverStlibs(libPath));
    } catch (e) {
      errors.push({
        message:
          e instanceof LibraryManifestError
            ? e.message
            : `Library loading failed: ${e instanceof Error ? e.message : String(e)}`,
        line: 0,
        column: 0,
        severity: "error",
      });
    }
  }

  // Auto-merge library globalConstants
  for (const archive of allArchives) {
    if (archive.globalConstants) {
      if (!mergedOptions.globalConstants) {
        mergedOptions.globalConstants = {};
      }
      for (const [key, value] of Object.entries(archive.globalConstants)) {
        if (!(key in mergedOptions.globalConstants)) {
          mergedOptions.globalConstants[key] = value;
        }
      }
    }
  }

  // Phase 5: Semantic analysis (continue even on earlier errors)
  let semanticSymbolTables: SymbolTables | undefined;
  if (allArchives.length > 0) {
    semanticSymbolTables = new SymbolTables();
    for (const archive of allArchives) {
      registerLibrarySymbols(archive.manifest, semanticSymbolTables);
    }
  }

  if (mergedOptions.globalConstants) {
    if (!semanticSymbolTables) {
      semanticSymbolTables = new SymbolTables();
    }
    for (const name of Object.keys(mergedOptions.globalConstants)) {
      try {
        semanticSymbolTables.globalScope.define({
          name,
          kind: "constant",
          declaration:
            undefined as unknown as import("./frontend/ast.js").VarDeclaration,
          type: {
            typeKind: "elementary",
            name: "ULINT",
            sizeBits: 64,
          } as import("./frontend/ast.js").ElementaryType,
        });
      } catch {
        // Ignore duplicate
      }
    }
  }

  try {
    const analyzer = new SemanticAnalyzer();
    const semanticResult = analyzer.analyze(ast, semanticSymbolTables);
    symbolTables = semanticResult.symbolTables;
    for (const err of semanticResult.errors) {
      errors.push({
        message: err.message,
        line: err.line ?? 0,
        column: err.column ?? 0,
        severity: "error",
      });
    }
    for (const warn of semanticResult.warnings) {
      warnings.push({
        message: warn.message,
        line: warn.line ?? 0,
        column: warn.column ?? 0,
        severity: "warning",
      });
    }
  } catch {
    // Semantic analysis failure is non-fatal — return whatever we have
  }

  return {
    ...(ast ? { ast } : {}),
    ...(symbolTables ? { symbolTables } : {}),
    ...(projectModel ? { projectModel } : {}),
    errors,
    warnings,
    stdFunctionRegistry: new StdFunctionRegistry(),
  };
}

/**
 * Parse ST source code and return the AST without code generation.
 * Useful for syntax checking and IDE integration.
 *
 * @param source - The ST source code to parse
 * @returns The parsed AST or parse errors
 */
export function parse(source: string): {
  ast?: CompilationUnit;
  errors: CompileError[];
} {
  const errors: CompileError[] = [];

  // Parse ST source to CST
  const parseResult = parseSource(source);
  if (parseResult.errors.length > 0) {
    for (const err of parseResult.errors) {
      // Handle Chevrotain error format
      const errObj = err as {
        message?: string;
        token?: { startLine?: number; startColumn?: number };
      };
      errors.push({
        message: errObj.message ?? "Parse error",
        line: errObj.token?.startLine ?? 0,
        column: errObj.token?.startColumn ?? 0,
        severity: "error",
      });
    }
    return { errors };
  }

  // Build AST from CST
  if (!parseResult.cst) {
    errors.push({
      message: "Parse failed: no CST produced",
      line: 0,
      column: 0,
      severity: "error",
    });
    return { errors };
  }
  try {
    const ast = buildAST(parseResult.cst);
    return { ast, errors };
  } catch (e) {
    errors.push({
      message: `AST building failed: ${e instanceof Error ? e.message : String(e)}`,
      line: 0,
      column: 0,
      severity: "error",
    });
    return { errors };
  }
}

/**
 * Get the version of the STruC++ compiler.
 */
export function getVersion(): string {
  return "0.1.0-dev";
}

// Re-export types
export type {
  CompileOptions,
  CompileResult,
  CompileError,
  AnalysisResult,
} from "./types.js";
export type { SourceSpan, LineMapEntry, Severity } from "./types.js";

// Re-export AST types for LSP integration
export type {
  ASTNode,
  TypedNode,
  CompilationUnit,
  ProgramDeclaration,
  FunctionDeclaration,
  FunctionBlockDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  TypeDeclaration,
  VarDeclaration,
  VarBlock,
  VarBlockType,
  Statement,
  Expression,
  VariableExpression,
  FunctionCallExpression,
  MethodCallExpression,
  LiteralExpression,
  TypeReference,
  IECType,
  ElementaryType,
  ArrayType,
  StructType,
  EnumType,
  ReferenceType,
  FunctionBlockType,
  AccessStep,
} from "./frontend/ast.js";

// Re-export symbol table types
export { SymbolTables, Scope } from "./semantic/symbol-table.js";
export type {
  AnySymbol,
  VariableSymbol,
  ConstantSymbol,
  FunctionSymbol,
  FunctionBlockSymbol,
  ProgramSymbol,
  TypeSymbol,
  EnumValueSymbol,
  SymbolKind,
} from "./semantic/symbol-table.js";

// Re-export standard function registry
export { StdFunctionRegistry } from "./semantic/std-function-registry.js";
export type {
  StdFunctionDescriptor,
  StdFunctionParam,
  TypeConstraint,
} from "./semantic/std-function-registry.js";

// Re-export type utilities
export {
  typeName,
  resolveFieldType,
  resolveArrayElementType,
  ELEMENTARY_TYPES,
  TYPE_CATEGORIES,
  matchesConstraint,
  isAssignable,
  isImplicitlyConvertible,
  getCommonType,
} from "./semantic/type-utils.js";
export { isElementaryType } from "./semantic/type-registry.js";

// Re-export project model
export type { ProjectModel } from "./project-model.js";

// Re-export AST utilities
export {
  walkAST,
  findNodeAtPosition,
  findInnermostExpression,
  collectReferences,
} from "./ast-utils.js";

// Re-export library system
export { compileLibrary, compileStlib } from "./library/library-compiler.js";
export {
  loadLibraryManifest,
  loadStlibArchive,
  loadStlibFromFile,
  discoverStlibs,
  registerLibrarySymbols,
  LibraryManifestError,
} from "./library/library-loader.js";
export { getBuiltinStdlibManifest } from "./library/builtin-stdlib.js";
export { extractNamespaceBody } from "./library/library-utils.js";
export type {
  LibraryManifest,
  LibraryCompileResult,
  StlibArchive,
  StlibCompileResult,
  LibraryFunctionEntry,
  LibraryFBEntry,
  LibraryTypeEntry,
} from "./library/library-manifest.js";

// Re-export CODESYS import
export {
  importCodesysLibrary,
  detectFormat,
} from "./library/codesys-import/index.js";
export type {
  CodesysImportResult,
  CodesysFormat,
} from "./library/codesys-import/index.js";
