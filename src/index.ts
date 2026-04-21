// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ - IEC 61131-3 Structured Text to C++ Compiler
 *
 * Main entry point for the STruC++ compiler library.
 * This module exports the public API for programmatic usage.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
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
import {
  generateDebugTable,
  type DebugMapV2,
} from "./backend/debug-table-gen.js";
import { StdFunctionRegistry } from "./semantic/std-function-registry.js";
import type {
  CompilationUnit,
  FunctionCallExpression,
  FunctionBlockDeclaration,
  InterfaceDeclaration,
  TypeReference,
  ASTNode,
} from "./frontend/ast.js";
import { mergeCompilationUnits } from "./merge.js";
import { walkAST } from "./ast-utils.js";
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

// ---------------------------------------------------------------------------
// Library tree-shaking: only include libraries whose symbols are referenced
// ---------------------------------------------------------------------------

/**
 * Determine which libraries are actually used by the user program.
 * Walks the AST to collect all referenced symbol names, then matches them
 * against library manifests to find which libraries are needed.
 * Includes transitive dependencies.
 */
function collectUsedLibraries(
  ast: CompilationUnit,
  archives: StlibArchive[],
): Set<string> {
  // Build symbol→library name map (uppercase keys for case-insensitive match)
  const symbolToLib = new Map<string, string>();
  for (const archive of archives) {
    const libName = archive.manifest.name;
    for (const fn of archive.manifest.functions) {
      symbolToLib.set(fn.name.toUpperCase(), libName);
    }
    for (const fb of archive.manifest.functionBlocks) {
      symbolToLib.set(fb.name.toUpperCase(), libName);
    }
    for (const t of archive.manifest.types) {
      symbolToLib.set(t.name.toUpperCase(), libName);
    }
  }

  // Collect all symbol names referenced in the AST
  const referencedNames = new Set<string>();

  walkAST(ast, (node: ASTNode): void => {
    switch (node.kind) {
      case "FunctionCallExpression": {
        const fc = node as FunctionCallExpression;
        referencedNames.add(fc.functionName.toUpperCase());
        break;
      }
      case "TypeReference": {
        const tr = node as TypeReference;
        referencedNames.add(tr.name.toUpperCase());
        if (tr.elementTypeName) {
          referencedNames.add(tr.elementTypeName.toUpperCase());
        }
        break;
      }
      case "FunctionBlockDeclaration": {
        const fbd = node as FunctionBlockDeclaration;
        if (fbd.extends) referencedNames.add(fbd.extends.toUpperCase());
        if (fbd.implements) {
          for (const iface of fbd.implements) {
            referencedNames.add(iface.toUpperCase());
          }
        }
        break;
      }
      case "InterfaceDeclaration": {
        const id = node as InterfaceDeclaration;
        if (id.extends) {
          for (const base of id.extends) {
            referencedNames.add(base.toUpperCase());
          }
        }
        break;
      }
    }
  });

  // Match referenced names to libraries
  const usedLibs = new Set<string>();
  for (const name of referencedNames) {
    const lib = symbolToLib.get(name);
    if (lib) usedLibs.add(lib);
  }

  // Add transitive dependencies
  const depMap = new Map<string, string[]>();
  for (const archive of archives) {
    depMap.set(
      archive.manifest.name,
      archive.dependencies.map((d) => d.name),
    );
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const lib of usedLibs) {
      const deps = depMap.get(lib);
      if (deps) {
        for (const dep of deps) {
          if (!usedLibs.has(dep)) {
            usedLibs.add(dep);
            changed = true;
          }
        }
      }
    }
  }

  return usedLibs;
}

// ---------------------------------------------------------------------------
// Shared pipeline
// ---------------------------------------------------------------------------

interface PipelineResult {
  ast: CompilationUnit | undefined;
  projectModel: import("./project-model.js").ProjectModel | undefined;
  symbolTables: SymbolTables | undefined;
  errors: CompileError[];
  warnings: CompileError[];
  allArchives: StlibArchive[];
  mergedOptions: CompileOptions;
}

/**
 * Run phases 1-5 of the compilation pipeline (parse → AST → project model →
 * library loading → semantic analysis).
 *
 * @param continueOnError - When true (analyze mode), wraps each phase in
 *   try/catch and never aborts early so partial results are returned.
 *   When false (compile mode), aborts at each phase boundary on errors.
 */
function runPipeline(
  source: string,
  options: Partial<CompileOptions>,
  continueOnError: boolean,
): PipelineResult {
  const mergedOptions = { ...defaultOptions, ...options };
  const errors: CompileError[] = [];
  const warnings: CompileError[] = [];
  let ast: CompilationUnit | undefined;
  let projectModel: import("./project-model.js").ProjectModel | undefined;
  let symbolTables: SymbolTables | undefined;
  const allArchives: StlibArchive[] = [];

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
    // In analyze mode, continue with partial CST from Chevrotain recovery.
    // In compile mode, abort immediately.
    if (!continueOnError) {
      return {
        ast,
        projectModel,
        symbolTables,
        errors,
        warnings,
        allArchives,
        mergedOptions,
      };
    }
  }

  // Phase 2: Build AST from CST (supports multi-file via additionalSources)
  if (!parseResult.cst) {
    errors.push({
      message: "Parse failed: no CST produced",
      line: 0,
      column: 0,
      severity: "error",
    });
    return {
      ast,
      projectModel,
      symbolTables,
      errors,
      warnings,
      allArchives,
      mergedOptions,
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
          // In compile mode, skip files with parse errors.
          // In analyze mode, try to build from the partial CST.
          if (!continueOnError) {
            continue;
          }
        }
        if (addlParseResult.cst) {
          try {
            units.push(
              buildAST(
                addlParseResult.cst,
                addlSource.fileName,
                globalConstants,
              ),
            );
          } catch (e) {
            errors.push({
              message: `AST build failed for ${addlSource.fileName}: ${e instanceof Error ? e.message : String(e)}`,
              line: 0,
              column: 0,
              severity: "error",
              file: addlSource.fileName,
            });
          }
        }
      }
    }

    if (!continueOnError && errors.length > 0) {
      return {
        ast,
        projectModel,
        symbolTables,
        errors,
        warnings,
        allArchives,
        mergedOptions,
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
    if (!continueOnError) {
      return {
        ast,
        projectModel,
        symbolTables,
        errors,
        warnings,
        allArchives,
        mergedOptions,
      };
    }
    // In analyze mode, AST building failure is non-fatal — continue with
    // whatever partial ast is available (may be undefined)
  }

  // Phase 3: Build project model and validate
  if (!ast) {
    // No AST available (parse/build failed completely) — skip remaining phases
    return {
      ast,
      projectModel,
      symbolTables,
      errors,
      warnings,
      allArchives,
      mergedOptions,
    };
  }
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
  } catch (e) {
    if (!continueOnError) {
      errors.push({
        message: `Project model failed: ${e instanceof Error ? e.message : String(e)}`,
        line: 0,
        column: 0,
        severity: "error",
      });
      return {
        ast,
        projectModel,
        symbolTables,
        errors,
        warnings,
        allArchives,
        mergedOptions,
      };
    }
    // In analyze mode, project model failure is non-fatal
  }

  if (!continueOnError && errors.length > 0) {
    return {
      ast,
      projectModel,
      symbolTables,
      errors,
      warnings,
      allArchives,
      mergedOptions,
    };
  }

  // Phase 4: Library loading
  allArchives.push(...(mergedOptions.libraries ?? []));
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

  if (!continueOnError && errors.length > 0) {
    return {
      ast,
      projectModel,
      symbolTables,
      errors,
      warnings,
      allArchives,
      mergedOptions,
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

  // Phase 5: Semantic analysis
  let semanticSymbolTables: SymbolTables | undefined;
  if (allArchives.length > 0) {
    semanticSymbolTables = new SymbolTables();
    for (const archive of allArchives) {
      registerLibrarySymbols(archive.manifest, semanticSymbolTables);
    }
  }

  // Register global constants in symbol tables
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
        ...(err.file ? { file: err.file } : {}),
      });
    }
    for (const warn of semanticResult.warnings) {
      warnings.push({
        message: warn.message,
        line: warn.line ?? 0,
        column: warn.column ?? 0,
        severity: "warning",
        ...(warn.file ? { file: warn.file } : {}),
      });
    }
  } catch (e) {
    if (!continueOnError) {
      errors.push({
        message: `Semantic analysis failed: ${e instanceof Error ? e.message : String(e)}`,
        line: 0,
        column: 0,
        severity: "error",
      });
    }
    // In analyze mode, semantic failure is non-fatal — return whatever we have
  }

  return {
    ast,
    projectModel,
    symbolTables,
    errors,
    warnings,
    allArchives,
    mergedOptions,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
  const pipeline = runPipeline(source, options, false);

  if (pipeline.errors.length > 0 || !pipeline.ast) {
    return {
      success: false,
      cppCode: "",
      headerCode: "",
      lineMap: new Map(),
      headerLineMap: new Map(),
      errors: pipeline.errors,
      warnings: pipeline.warnings,
    };
  }

  // Phase 6: Generate C++ code
  // Collect library headers for #include directives
  const libraryHeaders: string[] = [];
  for (const archive of pipeline.allArchives) {
    for (const header of archive.manifest.headers) {
      if (!libraryHeaders.includes(header)) {
        libraryHeaders.push(header);
      }
    }
  }

  // Pass semantic symbol tables to codegen so it can use type info from semantic analysis
  const codegen = new CodeGenerator(pipeline.symbolTables, {
    sourceComments: pipeline.mergedOptions.debug,
    lineDirectives: pipeline.mergedOptions.lineDirectives ?? false,
    headerFileName: pipeline.mergedOptions.headerFileName ?? "generated.hpp",
    fileName: pipeline.mergedOptions.fileName ?? "main.st",
    ...(pipeline.mergedOptions.lineDirectiveFileName
      ? { lineDirectiveFileName: pipeline.mergedOptions.lineDirectiveFileName }
      : {}),
    libraryHeaders,
    isTestBuild: pipeline.mergedOptions.isTestBuild ?? false,
    globalConstants: pipeline.mergedOptions.globalConstants ?? {},
  });
  codegen.setProjectModel(pipeline.projectModel!);

  // Register all library metadata (FB types, field mappings, enum/struct types)
  codegen.registerLibraryArchives(pipeline.allArchives);

  // Tree-shake: only include libraries whose symbols are referenced by the
  // program.  Skip for test builds — the test harness (test_main.cpp) may
  // reference library symbols that aren't in the source AST.
  const isTestBuild = pipeline.mergedOptions.isTestBuild ?? false;
  const usedLibs = isTestBuild
    ? null
    : collectUsedLibraries(pipeline.ast, pipeline.allArchives);

  // Inject compiled C++ preamble code from libraries
  for (const archive of pipeline.allArchives) {
    if (
      archive.headerCode &&
      (usedLibs === null || usedLibs.has(archive.manifest.name))
    ) {
      codegen.addLibraryPreamble(
        archive.manifest.name,
        archive.headerCode,
        archive.cppCode,
      );
    }
  }

  const codeResult = codegen.generate(pipeline.ast);

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
    pipeline.warnings.push(entry);
  }

  // Emit debugger pointer tables + editor manifest. This is best-effort:
  // if projectModel or symbolTables are missing (malformed input), we still
  // return the primary compile output; the debug artifacts are just omitted.
  let debugTableCpp: string | undefined;
  let debugMap: DebugMapV2 | undefined;
  if (pipeline.projectModel && pipeline.symbolTables) {
    const dbg = generateDebugTable(
      pipeline.ast,
      pipeline.projectModel,
      pipeline.symbolTables,
      pipeline.allArchives,
      { md5: pipeline.mergedOptions.md5 ?? "" },
    );
    debugTableCpp = dbg.debugTableCpp;
    debugMap = dbg.debugMap;
  }

  return {
    success: true,
    cppCode: codeResult.cppCode,
    headerCode: codeResult.headerCode,
    lineMap: codeResult.lineMap,
    headerLineMap: codeResult.headerLineMap,
    errors: pipeline.errors,
    warnings: pipeline.warnings,
    ast: pipeline.ast,
    ...(pipeline.projectModel ? { projectModel: pipeline.projectModel } : {}),
    ...(pipeline.symbolTables ? { symbolTables: pipeline.symbolTables } : {}),
    ...(pipeline.allArchives.length > 0
      ? { resolvedLibraries: pipeline.allArchives }
      : {}),
    ...(debugTableCpp !== undefined ? { debugTableCpp } : {}),
    ...(debugMap !== undefined ? { debugMap } : {}),
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
  const pipeline = runPipeline(source, options, true);

  return {
    ...(pipeline.ast ? { ast: pipeline.ast } : {}),
    ...(pipeline.symbolTables ? { symbolTables: pipeline.symbolTables } : {}),
    ...(pipeline.projectModel ? { projectModel: pipeline.projectModel } : {}),
    errors: pipeline.errors,
    warnings: pipeline.warnings,
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
declare const STRUCPP_VERSION: string | undefined;

export function getVersion(): string {
  // Bundled binary: version injected by esbuild --define at build time
  if (typeof STRUCPP_VERSION !== "undefined") {
    return STRUCPP_VERSION;
  }
  // Development: read from package.json at runtime
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(join(dir, "../package.json"), "utf-8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
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
  StructDefinition,
  EnumDefinition,
  EnumMember,
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
  findEnclosingPOU,
} from "./ast-utils.js";
export type { EnclosingScope } from "./ast-utils.js";

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

// REPL main generator (for build command)
export { generateReplMain } from "./backend/repl-main-gen.js";
export type { ReplMainGenOptions } from "./backend/repl-main-gen.js";

// Build utilities (for extension client)
export {
  getCxxEnv,
  splitCxxFlags,
  isCompilerAvailable,
  findRuntimeIncludeDir,
  findBundledLibsDir,
} from "./build-utils.js";

// Test framework
export { parseTestFile } from "./testing/test-parser.js";
export { analyzeTestFile } from "./semantic/analyzer.js";
export {
  generateTestMain,
  buildPOUInfoFromAST,
} from "./backend/test-main-gen.js";
export type { TestMainGenOptions, POUInfo } from "./backend/test-main-gen.js";
export type {
  TestFile,
  TestCase,
  SetupBlock,
  TeardownBlock,
  AssertType,
  AssertCall,
  TestStatement,
} from "./testing/test-model.js";
