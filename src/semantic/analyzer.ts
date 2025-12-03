/**
 * STruC++ Semantic Analyzer
 *
 * Coordinates semantic analysis passes over the AST.
 * Builds symbol tables, performs type checking, and validates IEC semantics.
 */

import type { CompilationUnit, ElementaryType } from '../frontend/ast.js';
import type { CompileError } from '../types.js';
import { SymbolTables } from './symbol-table.js';
import { TypeChecker } from './type-checker.js';

// =============================================================================
// Analysis Result
// =============================================================================

/**
 * Result of semantic analysis.
 */
export interface SemanticAnalysisResult {
  /** Whether analysis was successful (no errors) */
  success: boolean;

  /** Symbol tables built during analysis */
  symbolTables: SymbolTables;

  /** Errors found during analysis */
  errors: CompileError[];

  /** Warnings found during analysis */
  warnings: CompileError[];
}

// =============================================================================
// Semantic Analyzer
// =============================================================================

/**
 * Semantic analyzer for IEC 61131-3 programs.
 *
 * Performs the following passes:
 * 1. Symbol table building - Index all declarations
 * 2. Type checking - Verify type correctness
 * 3. Semantic validation - Check IEC semantic rules
 */
export class SemanticAnalyzer {
  private symbolTables: SymbolTables;
  private typeChecker: TypeChecker;
  private errors: CompileError[] = [];
  private warnings: CompileError[] = [];

  constructor() {
    this.symbolTables = new SymbolTables();
    this.typeChecker = new TypeChecker(this.symbolTables);
  }

  /**
   * Analyze a compilation unit.
   */
  analyze(ast: CompilationUnit): SemanticAnalysisResult {
    this.errors = [];
    this.warnings = [];

    // Pass 1: Build symbol tables
    this.buildSymbolTables(ast);

    // Pass 2: Type checking
    if (this.errors.length === 0) {
      const typeResult = this.typeChecker.check(ast);
      this.errors.push(...typeResult.errors);
      this.warnings.push(...typeResult.warnings);
    }

    // Pass 3: Semantic validation
    if (this.errors.length === 0) {
      this.validateSemantics(ast);
    }

    return {
      success: this.errors.length === 0,
      symbolTables: this.symbolTables,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Build symbol tables from the AST.
   */
  private buildSymbolTables(ast: CompilationUnit): void {
    // Register type declarations
    for (const typeDecl of ast.types) {
      try {
        const resolvedType: ElementaryType = { typeKind: 'elementary', name: typeDecl.name, sizeBits: 0 };
        this.symbolTables.globalScope.define({
          name: typeDecl.name,
          kind: 'type',
          declaration: typeDecl,
          resolvedType,
        });
      } catch (err) {
        if (err instanceof Error) {
          this.addError(err.message, typeDecl.sourceSpan.startLine, typeDecl.sourceSpan.startCol);
        }
      }
    }

    // Register function declarations
    for (const funcDecl of ast.functions) {
      try {
        const returnType: ElementaryType = { typeKind: 'elementary', name: funcDecl.returnType.name, sizeBits: 0 };
        this.symbolTables.globalScope.define({
          name: funcDecl.name,
          kind: 'function',
          declaration: funcDecl,
          returnType,
          parameters: [],
        });

        // Create local scope for function
        const scope = this.symbolTables.createFunctionScope(funcDecl.name);
        this.buildVarBlockSymbols(funcDecl.varBlocks, scope);
      } catch (err) {
        if (err instanceof Error) {
          this.addError(err.message, funcDecl.sourceSpan.startLine, funcDecl.sourceSpan.startCol);
        }
      }
    }

    // Register function block declarations
    for (const fbDecl of ast.functionBlocks) {
      try {
        this.symbolTables.globalScope.define({
          name: fbDecl.name,
          kind: 'functionBlock',
          declaration: fbDecl,
          inputs: [],
          outputs: [],
          inouts: [],
          locals: [],
        });

        // Create local scope for function block
        const scope = this.symbolTables.createFBScope(fbDecl.name);
        this.buildVarBlockSymbols(fbDecl.varBlocks, scope);
      } catch (err) {
        if (err instanceof Error) {
          this.addError(err.message, fbDecl.sourceSpan.startLine, fbDecl.sourceSpan.startCol);
        }
      }
    }

    // Register program declarations
    for (const progDecl of ast.programs) {
      try {
        this.symbolTables.globalScope.define({
          name: progDecl.name,
          kind: 'program',
          declaration: progDecl,
          variables: [],
        });

        // Create local scope for program
        const scope = this.symbolTables.createProgramScope(progDecl.name);
        this.buildVarBlockSymbols(progDecl.varBlocks, scope);
      } catch (err) {
        if (err instanceof Error) {
          this.addError(err.message, progDecl.sourceSpan.startLine, progDecl.sourceSpan.startCol);
        }
      }
    }
  }

  /**
   * Build symbols from variable blocks.
   */
  private buildVarBlockSymbols(
    varBlocks: CompilationUnit['programs'][0]['varBlocks'],
    scope: ReturnType<typeof this.symbolTables.createProgramScope>
  ): void {
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          try {
            const varType: ElementaryType = { typeKind: 'elementary', name: decl.type.name, sizeBits: 0 };
            if (block.isConstant) {
              scope.define({
                name,
                kind: 'constant',
                declaration: decl,
                type: varType,
              });
            } else {
              scope.define({
                name,
                kind: 'variable',
                declaration: decl,
                type: varType,
                isInput: block.blockType === 'VAR_INPUT',
                isOutput: block.blockType === 'VAR_OUTPUT',
                isInOut: block.blockType === 'VAR_IN_OUT',
                isExternal: block.blockType === 'VAR_EXTERNAL',
                isGlobal: block.blockType === 'VAR_GLOBAL',
                isRetain: block.isRetain,
                address: decl.address,
              });
            }
          } catch (err) {
            if (err instanceof Error) {
              this.addError(err.message, decl.sourceSpan.startLine, decl.sourceSpan.startCol);
            }
          }
        }
      }
    }
  }

  /**
   * Validate IEC 61131-3 semantic rules.
   * Will be implemented in Phase 3+.
   */
  private validateSemantics(_ast: CompilationUnit): void {
    // TODO: Implement semantic validation in Phase 3+
    // - Check that variables are declared before use
    // - Validate array bounds
    // - Check CASE statement coverage
    // - Validate reference operations
    // - Check for unreachable code
  }

  /**
   * Add an error message.
   */
  private addError(message: string, line: number, column: number): void {
    this.errors.push({
      message,
      line,
      column,
      severity: 'error',
    });
  }

  /**
   * Add a warning message.
   * Used in Phase 3+ for semantic validation warnings.
   */
  protected addWarning(message: string, line: number, column: number): void {
    this.warnings.push({
      message,
      line,
      column,
      severity: 'warning',
    });
  }
}

/**
 * Analyze a compilation unit.
 * Convenience function that creates an analyzer and runs analysis.
 */
export function analyze(ast: CompilationUnit): SemanticAnalysisResult {
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(ast);
}
