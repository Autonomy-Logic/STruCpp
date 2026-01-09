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
      errors,
      warnings,
    };
  }

  // Phase 2: Build AST from CST
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
      errors,
      warnings,
    };
  }
  try {
    ast = buildAST(parseResult.cst);
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
      errors,
      warnings,
    };
  }

  // Phase 3.5: Semantic analysis (located variables, type checking, etc.)
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
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
      errors,
      warnings,
    };
  }

  // Phase 4: Generate C++ code
  const codegenSymbolTables = new SymbolTables();
  const codegen = new CodeGenerator(codegenSymbolTables, {
    sourceComments: mergedOptions.debug,
    lineDirectives: mergedOptions.lineMapping,
    headerFileName: mergedOptions.headerFileName ?? "generated.hpp",
  });
  codegen.setProjectModel(projectModelResult.model);

  const codeResult = codegen.generate(ast);

  return {
    success: true,
    cppCode: codeResult.cppCode,
    headerCode: codeResult.headerCode,
    lineMap: codeResult.lineMap,
    errors,
    warnings,
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
