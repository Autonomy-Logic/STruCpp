/**
 * STruC++ Semantic Analyzer
 *
 * Coordinates semantic analysis passes over the AST.
 * Builds symbol tables, performs type checking, and validates IEC semantics.
 */

import type {
  CompilationUnit,
  ElementaryType,
  VarBlock,
  VarDeclaration,
  Statement,
} from "../frontend/ast.js";
import type { CompileError } from "../types.js";
import { SymbolTables } from "./symbol-table.js";
import { TypeChecker } from "./type-checker.js";

// =============================================================================
// Located Variable Address Parsing
// =============================================================================

/**
 * Parsed components of a located variable address.
 */
interface ParsedAddress {
  area: "I" | "Q" | "M"; // Input, Output, Memory
  size: "X" | "B" | "W" | "D" | "L"; // Bit, Byte, Word, DWord, LWord
  byteIndex: number;
  bitIndex: number;
}

/**
 * Parse a located variable address string.
 * @param address Address string like "%IX0.0" or "%QW10"
 * @returns Parsed address components or null if invalid
 */
function parseAddress(address: string): ParsedAddress | null {
  // Pattern: %<area><size><byte_index>.<bit_index>
  // Examples: %IX0.0, %QX2.3, %IW10, %QW5, %MW100, %MD50
  const match = address.match(/^%([IQM])([XBWDL]?)(\d+)(?:\.(\d+))?$/i);
  if (!match) {
    return null;
  }

  const area = match[1]!.toUpperCase() as "I" | "Q" | "M";
  let size = match[2]?.toUpperCase() as "X" | "B" | "W" | "D" | "L" | undefined;
  const byteIndex = parseInt(match[3]!, 10);
  const bitIndex = match[4] ? parseInt(match[4], 10) : 0;

  // Default size to X (bit) if not specified and bit index is present
  if (!size) {
    size = "X";
  }

  return { area, size, byteIndex, bitIndex };
}

/**
 * Get the expected IEC types for a given address size.
 */
function getCompatibleTypes(size: "X" | "B" | "W" | "D" | "L"): string[] {
  switch (size) {
    case "X":
      return ["BOOL"];
    case "B":
      return ["BYTE", "USINT", "SINT"];
    case "W":
      return ["WORD", "INT", "UINT"];
    case "D":
      return ["DWORD", "DINT", "UDINT", "REAL"];
    case "L":
      return ["LWORD", "LINT", "ULINT", "LREAL"];
  }
}

/**
 * Create a canonical address key for duplicate detection.
 */
function addressKey(parsed: ParsedAddress): string {
  return `${parsed.area}${parsed.size}${parsed.byteIndex}.${parsed.bitIndex}`;
}

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
/**
 * Information about a located variable for validation.
 */
interface LocatedVarInfo {
  name: string;
  address: string;
  parsed: ParsedAddress;
  typeName: string;
  scopeType: "program" | "function" | "functionBlock";
  scopeName: string;
  declaration: VarDeclaration;
}

export class SemanticAnalyzer {
  private symbolTables: SymbolTables;
  private typeChecker: TypeChecker;
  private errors: CompileError[] = [];
  private warnings: CompileError[] = [];

  /** Track all located variables for duplicate detection */
  private locatedVars: LocatedVarInfo[] = [];

  constructor() {
    this.symbolTables = new SymbolTables();
    this.typeChecker = new TypeChecker(this.symbolTables);
  }

  /**
   * Analyze a compilation unit.
   * @param ast The compilation unit to analyze
   * @param existingSymbolTables Optional pre-populated symbol tables (e.g., with library symbols)
   */
  analyze(
    ast: CompilationUnit,
    existingSymbolTables?: SymbolTables,
  ): SemanticAnalysisResult {
    this.errors = [];
    this.warnings = [];
    this.locatedVars = [];

    // Use provided symbol tables (with library symbols pre-registered) or create new ones
    if (existingSymbolTables) {
      this.symbolTables = existingSymbolTables;
      this.typeChecker = new TypeChecker(this.symbolTables);
    }

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
        const resolvedType: ElementaryType = {
          typeKind: "elementary",
          name: typeDecl.name,
          sizeBits: 0,
        };
        this.symbolTables.globalScope.define({
          name: typeDecl.name,
          kind: "type",
          declaration: typeDecl,
          resolvedType,
        });
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            typeDecl.sourceSpan.startLine,
            typeDecl.sourceSpan.startCol,
          );
        }
      }
    }

    // Register function declarations
    for (const funcDecl of ast.functions) {
      try {
        const returnType: ElementaryType = {
          typeKind: "elementary",
          name: funcDecl.returnType.name,
          sizeBits: 0,
        };
        this.symbolTables.globalScope.define({
          name: funcDecl.name,
          kind: "function",
          declaration: funcDecl,
          returnType,
          parameters: [],
        });

        // Create local scope for function
        const scope = this.symbolTables.createFunctionScope(funcDecl.name);
        this.buildVarBlockSymbols(
          funcDecl.varBlocks,
          scope,
          "function",
          funcDecl.name,
        );
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            funcDecl.sourceSpan.startLine,
            funcDecl.sourceSpan.startCol,
          );
        }
      }
    }

    // Register function block declarations
    for (const fbDecl of ast.functionBlocks) {
      try {
        this.symbolTables.globalScope.define({
          name: fbDecl.name,
          kind: "functionBlock",
          declaration: fbDecl,
          inputs: [],
          outputs: [],
          inouts: [],
          locals: [],
        });

        // Create local scope for function block
        const scope = this.symbolTables.createFBScope(fbDecl.name);
        this.buildVarBlockSymbols(
          fbDecl.varBlocks,
          scope,
          "functionBlock",
          fbDecl.name,
        );
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            fbDecl.sourceSpan.startLine,
            fbDecl.sourceSpan.startCol,
          );
        }
      }
    }

    // Register program declarations
    for (const progDecl of ast.programs) {
      try {
        this.symbolTables.globalScope.define({
          name: progDecl.name,
          kind: "program",
          declaration: progDecl,
          variables: [],
        });

        // Create local scope for program
        const scope = this.symbolTables.createProgramScope(progDecl.name);
        this.buildVarBlockSymbols(
          progDecl.varBlocks,
          scope,
          "program",
          progDecl.name,
        );
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            progDecl.sourceSpan.startLine,
            progDecl.sourceSpan.startCol,
          );
        }
      }
    }
  }

  /**
   * Build symbols from variable blocks.
   */
  private buildVarBlockSymbols(
    varBlocks: CompilationUnit["programs"][0]["varBlocks"],
    scope: ReturnType<typeof this.symbolTables.createProgramScope>,
    scopeType: "program" | "function" | "functionBlock",
    scopeName: string,
  ): void {
    for (const block of varBlocks) {
      // Validate variable modifiers (CONSTANT, RETAIN)
      this.validateVarModifiers(block);

      for (const decl of block.declarations) {
        for (const name of decl.names) {
          try {
            const varType: ElementaryType = {
              typeKind: "elementary",
              name: decl.type.name,
              sizeBits: 0,
            };
            if (block.isConstant) {
              scope.define({
                name,
                kind: "constant",
                declaration: decl,
                type: varType,
              });
            } else {
              scope.define({
                name,
                kind: "variable",
                declaration: decl,
                type: varType,
                isInput: block.blockType === "VAR_INPUT",
                isOutput: block.blockType === "VAR_OUTPUT",
                isInOut: block.blockType === "VAR_IN_OUT",
                isExternal: block.blockType === "VAR_EXTERNAL",
                isGlobal: block.blockType === "VAR_GLOBAL",
                isRetain: block.isRetain,
                address: decl.address,
              });

              // Track located variables for validation
              if (decl.address) {
                const parsed = parseAddress(decl.address);
                if (parsed) {
                  this.locatedVars.push({
                    name,
                    address: decl.address,
                    parsed,
                    typeName: decl.type.name,
                    scopeType,
                    scopeName,
                    declaration: decl,
                  });
                } else {
                  this.addError(
                    `Invalid address format: ${decl.address}`,
                    decl.sourceSpan.startLine,
                    decl.sourceSpan.startCol,
                  );
                }
              }
            }
          } catch (err) {
            if (err instanceof Error) {
              this.addError(
                err.message,
                decl.sourceSpan.startLine,
                decl.sourceSpan.startCol,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Validate IEC 61131-3 semantic rules.
   */
  private validateSemantics(ast: CompilationUnit): void {
    // Validate located variables
    this.validateLocatedVariables();

    // Validate CONSTANT assignment restrictions
    this.validateConstantAssignments(ast);

    // TODO: Implement additional semantic validation in Phase 3+
    // - Check that variables are declared before use
    // - Validate array bounds
    // - Check CASE statement coverage
    // - Validate reference operations
    // - Check for unreachable code
  }

  /**
   * Validate that no assignments target CONSTANT variables.
   */
  private validateConstantAssignments(ast: CompilationUnit): void {
    for (const prog of ast.programs) {
      const scope = this.symbolTables.getProgramScope(prog.name);
      if (scope) {
        this.validateStatementsForConstantAssignment(prog.body, scope);
      }
    }
    for (const func of ast.functions) {
      const scope = this.symbolTables.getFunctionScope(func.name);
      if (scope) {
        this.validateStatementsForConstantAssignment(func.body, scope);
      }
    }
    for (const fb of ast.functionBlocks) {
      const scope = this.symbolTables.getFBScope(fb.name);
      if (scope) {
        this.validateStatementsForConstantAssignment(fb.body, scope);
      }
    }
  }

  /**
   * Walk statements and check for assignments to CONSTANT variables.
   */
  private validateStatementsForConstantAssignment(
    stmts: Statement[],
    scope: ReturnType<typeof this.symbolTables.createProgramScope>,
  ): void {
    for (const stmt of stmts) {
      if (stmt.kind === "AssignmentStatement") {
        if (stmt.target.kind === "VariableExpression") {
          const varName = stmt.target.name;
          const symbol = scope.lookup(varName);
          if (symbol && symbol.kind === "constant") {
            this.addError(
              `Cannot assign to CONSTANT variable '${varName}'`,
              stmt.sourceSpan.startLine,
              stmt.sourceSpan.startCol,
            );
          }
        }
      }
      // Recurse into control flow statements
      if (stmt.kind === "IfStatement") {
        const ifStmt = stmt as {
          thenStatements: Statement[];
          elsifClauses: Array<{ statements: Statement[] }>;
          elseStatements: Statement[];
        };
        this.validateStatementsForConstantAssignment(
          ifStmt.thenStatements,
          scope,
        );
        for (const clause of ifStmt.elsifClauses) {
          this.validateStatementsForConstantAssignment(
            clause.statements,
            scope,
          );
        }
        this.validateStatementsForConstantAssignment(
          ifStmt.elseStatements,
          scope,
        );
      }
      if (stmt.kind === "ForStatement") {
        const forStmt = stmt as { body: Statement[] };
        this.validateStatementsForConstantAssignment(forStmt.body, scope);
      }
      if (stmt.kind === "WhileStatement") {
        const whileStmt = stmt as { body: Statement[] };
        this.validateStatementsForConstantAssignment(whileStmt.body, scope);
      }
      if (stmt.kind === "RepeatStatement") {
        const repeatStmt = stmt as { body: Statement[] };
        this.validateStatementsForConstantAssignment(repeatStmt.body, scope);
      }
      if (stmt.kind === "CaseStatement") {
        const caseStmt = stmt as {
          cases: Array<{ statements: Statement[] }>;
          elseStatements: Statement[];
        };
        for (const c of caseStmt.cases) {
          this.validateStatementsForConstantAssignment(c.statements, scope);
        }
        this.validateStatementsForConstantAssignment(
          caseStmt.elseStatements,
          scope,
        );
      }
    }
  }

  /**
   * Validate located variables for IEC 61131-3 compliance.
   * Checks:
   * - Located variables not allowed in function blocks
   * - No duplicate addresses
   * - Type must be compatible with address size
   * - Bit index must be 0-7 for bit addresses
   */
  private validateLocatedVariables(): void {
    const addressMap = new Map<string, LocatedVarInfo>();

    for (const locVar of this.locatedVars) {
      const decl = locVar.declaration;

      // Rule 1: Located variables not allowed in function blocks
      if (locVar.scopeType === "functionBlock") {
        this.addError(
          `Located variable '${locVar.name}' at ${locVar.address} not allowed in FUNCTION_BLOCK '${locVar.scopeName}'. Located variables can only be declared in PROGRAM or VAR_GLOBAL scope.`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
        );
        continue;
      }

      // Rule 2: Validate type compatibility with address size
      const compatibleTypes = getCompatibleTypes(locVar.parsed.size);
      if (!compatibleTypes.includes(locVar.typeName.toUpperCase())) {
        this.addError(
          `Type '${locVar.typeName}' is not compatible with address size '${locVar.parsed.size}' in '${locVar.address}'. Expected one of: ${compatibleTypes.join(", ")}`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
        );
      }

      // Rule 3: Validate bit index is 0-7 for bit addresses
      if (
        locVar.parsed.size === "X" &&
        (locVar.parsed.bitIndex < 0 || locVar.parsed.bitIndex > 7)
      ) {
        this.addError(
          `Bit index ${locVar.parsed.bitIndex} out of range (0-7) in address '${locVar.address}'`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
        );
      }

      // Rule 4: Check for duplicate addresses
      const key = addressKey(locVar.parsed);
      const existing = addressMap.get(key);
      if (existing) {
        this.addError(
          `Duplicate address ${locVar.address}: variable '${locVar.name}' conflicts with '${existing.name}'`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
        );
      } else {
        addressMap.set(key, locVar);
      }
    }
  }

  /**
   * Validate variable block modifiers (CONSTANT, RETAIN).
   * Checks:
   * - RETAIN + CONSTANT mutual exclusion
   * - CONSTANT requires initializer
   * - Block type restrictions for CONSTANT
   * - Block type restrictions for RETAIN
   */
  private validateVarModifiers(block: VarBlock): void {
    const blockType = block.blockType;

    // RETAIN + CONSTANT is invalid
    if (block.isRetain && block.isConstant) {
      this.addError(
        "Variable cannot be both RETAIN and CONSTANT",
        block.sourceSpan.startLine,
        block.sourceSpan.startCol,
      );
      return; // Skip further validation for this block
    }

    // CONSTANT validation
    if (block.isConstant) {
      // CONSTANT requires initializer
      for (const decl of block.declarations) {
        if (!decl.initialValue) {
          const names = decl.names.join(", ");
          this.addError(
            `CONSTANT variable '${names}' must have an initializer`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
          );
        }
      }

      // Block type restrictions for CONSTANT
      if (blockType === "VAR_OUTPUT") {
        this.addError(
          "VAR_OUTPUT cannot be CONSTANT",
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
        );
      } else if (blockType === "VAR_IN_OUT") {
        this.addError(
          "VAR_IN_OUT cannot be CONSTANT",
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
        );
      }
    }

    // RETAIN validation - block type restrictions
    if (block.isRetain) {
      const invalidRetainTypes = [
        "VAR_INPUT",
        "VAR_OUTPUT",
        "VAR_IN_OUT",
        "VAR_TEMP",
        "VAR_EXTERNAL",
      ];

      if (invalidRetainTypes.includes(blockType)) {
        this.addError(
          `${blockType} cannot be RETAIN`,
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
        );
      }
    }
  }

  /**
   * Add an error message.
   */
  private addError(message: string, line: number, column: number): void {
    this.errors.push({
      message,
      line,
      column,
      severity: "error",
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
      severity: "warning",
    });
  }
}

/**
 * Analyze a compilation unit.
 * Convenience function that creates an analyzer and runs analysis.
 */
export function analyze(
  ast: CompilationUnit,
  existingSymbolTables?: SymbolTables,
): SemanticAnalysisResult {
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(ast, existingSymbolTables);
}
