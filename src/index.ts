/**
 * STruC++ - IEC 61131-3 Structured Text to C++ Compiler
 *
 * Main entry point for the STruC++ compiler library.
 * This module exports the public API for programmatic usage.
 */

import { CompileOptions, CompileResult, CompileError } from "./types.js";
import { parse as parseSource } from "./frontend/parser.js";
import { buildAST } from "./frontend/ast-builder.js";
import { buildProjectModel } from "./project-model.js";
import { SymbolTables } from "./semantic/symbol-table.js";
import { SemanticAnalyzer } from "./semantic/analyzer.js";
import { CodeGenerator } from "./backend/codegen.js";
import type { CompilationUnit } from "./frontend/ast.js";
import { mergeCompilationUnits } from "./merge.js";
import {
  registerLibrarySymbols,
  discoverLibraries,
  LibraryManifestError,
} from "./library/library-loader.js";
import {
  getStdFBLibraryManifest,
  getStdFBSources,
} from "./library/builtin-stdlib.js";

/**
 * Default compilation options
 */
export const defaultOptions: CompileOptions = {
  debug: false,
  lineMapping: true,
  optimizationLevel: 0,
};

/** Cached compiled C++ output from standard FB library */
let cachedStdFBCode: { headerCode: string; cppCode: string } | undefined;

/**
 * Reset the cached compiled standard FB C++ code.
 * Useful for tests that modify the FB library sources.
 */
export function resetStdFBCodeCache(): void {
  cachedStdFBCode = undefined;
}

/**
 * Extract the body inside `namespace ... { ... }` from generated C++ code.
 * Strips includes, pragma once, and the namespace wrapper.
 */
function extractNamespaceBody(code: string): string {
  const lines = code.split("\n");
  let inNamespace = false;
  let braceDepth = 0;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (!inNamespace) {
      if (/^namespace\s+\w+\s*\{/.test(line)) {
        inNamespace = true;
        braceDepth = 1;
        continue;
      }
      continue;
    }

    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }

    if (braceDepth <= 0) break;
    if (/^\s*using namespace strucpp;/.test(line)) continue;

    bodyLines.push(line);
  }

  return bodyLines.join("\n");
}

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
  // Discover libraries from libraryPaths and combine with explicit libraries
  const allLibraries = [...(mergedOptions.libraries ?? [])];
  if (mergedOptions.libraryPaths) {
    for (const libPath of mergedOptions.libraryPaths) {
      try {
        allLibraries.push(...discoverLibraries(libPath));
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

  // Pre-populate symbol tables with built-in standard FB library and any user libraries
  let semanticSymbolTables: SymbolTables | undefined;
  if (allLibraries.length > 0 || !mergedOptions.noStdFBLibrary) {
    semanticSymbolTables = new SymbolTables();
    // Always register standard FB library (TON, CTU, R_TRIG, etc.) unless opted out
    if (!mergedOptions.noStdFBLibrary) {
      registerLibrarySymbols(getStdFBLibraryManifest(), semanticSymbolTables);
    }
    for (const manifest of allLibraries) {
      registerLibrarySymbols(manifest, semanticSymbolTables);
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
  for (const manifest of allLibraries) {
    for (const header of manifest.headers) {
      if (!libraryHeaders.includes(header)) {
        libraryHeaders.push(header);
      }
    }
  }

  const codegenSymbolTables = new SymbolTables();
  const codegen = new CodeGenerator(codegenSymbolTables, {
    sourceComments: mergedOptions.debug,
    lineDirectives: mergedOptions.lineMapping,
    headerFileName: mergedOptions.headerFileName ?? "generated.hpp",
    libraryHeaders,
    isTestBuild: mergedOptions.isTestBuild ?? false,
    globalConstants: mergedOptions.globalConstants ?? {},
  });
  codegen.setProjectModel(projectModelResult.model);

  // Register library FB type names so codegen can distinguish FB invocations
  // from regular function calls (library FBs are not in the user AST)
  if (!mergedOptions.noStdFBLibrary) {
    const stdFBManifest = getStdFBLibraryManifest();
    codegen.registerLibraryFBTypes(
      stdFBManifest.functionBlocks.map((fb) => fb.name),
    );
    // Inject compiled standard FB C++ code (class declarations + implementations)
    if (!cachedStdFBCode) {
      const sources = getStdFBSources();
      if (sources.length > 0) {
        const fbResult = compile(sources[0]!.source, {
          additionalSources: sources.slice(1),
          noStdFBLibrary: true,
          headerFileName: "__stdlib_fb.hpp",
        });
        if (fbResult.success) {
          cachedStdFBCode = {
            headerCode: extractNamespaceBody(fbResult.headerCode),
            cppCode: extractNamespaceBody(fbResult.cppCode),
          };
        } else {
          cachedStdFBCode = { headerCode: "", cppCode: "" };
        }
      } else {
        cachedStdFBCode = { headerCode: "", cppCode: "" };
      }
    }
    if (cachedStdFBCode.headerCode) {
      codegen.setLibraryPreamble(
        cachedStdFBCode.headerCode,
        cachedStdFBCode.cppCode,
      );
    }
  }
  for (const manifest of allLibraries) {
    codegen.registerLibraryFBTypes(
      manifest.functionBlocks.map((fb) => fb.name),
    );
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
export type { CompileOptions, CompileResult, CompileError } from "./types.js";

// Re-export library system
export { compileLibrary } from "./library/library-compiler.js";
export {
  loadLibraryManifest,
  loadLibraryFromFile,
  discoverLibraries,
  registerLibrarySymbols,
  LibraryManifestError,
} from "./library/library-loader.js";
export {
  getBuiltinStdlibManifest,
  getStdFBLibraryManifest,
} from "./library/builtin-stdlib.js";
export type {
  LibraryManifest,
  LibraryCompileResult,
} from "./library/library-manifest.js";
