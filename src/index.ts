/**
 * STruC++ - IEC 61131-3 Structured Text to C++ Compiler
 *
 * Main entry point for the STruC++ compiler library.
 * This module exports the public API for programmatic usage.
 */

import { CompileOptions, CompileResult } from './types.js';

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
  _source: string,
  options: Partial<CompileOptions> = {}
): CompileResult {
  // Merge options with defaults (will be used in Phase 3+)
  void { ...defaultOptions, ...options };

  // TODO: Implement compilation pipeline
  // Phase 3+: This will be implemented with:
  // 1. Frontend: Parse ST source to AST
  // 2. Semantic: Build symbol tables and type check
  // 3. Backend: Generate C++ code

  return {
    success: false,
    cppCode: '',
    headerCode: '',
    lineMap: new Map(),
    errors: [
      {
        message: 'Compiler not yet implemented - Phase 0 setup only',
        line: 0,
        column: 0,
        severity: 'error',
      },
    ],
    warnings: [],
  };
}

/**
 * Parse ST source code and return the AST without code generation.
 * Useful for syntax checking and IDE integration.
 *
 * @param source - The ST source code to parse
 * @returns The parsed AST or parse errors
 */
export function parse(_source: string): unknown {
  // TODO: Implement in Phase 3
  return { error: 'Parser not yet implemented' };
}

/**
 * Get the version of the STruC++ compiler.
 */
export function getVersion(): string {
  return '0.1.0-dev';
}

// Re-export types
export type { CompileOptions, CompileResult, CompileError } from './types.js';
