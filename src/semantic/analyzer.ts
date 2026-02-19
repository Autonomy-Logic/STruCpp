/**
 * STruC++ Semantic Analyzer
 *
 * Coordinates semantic analysis passes over the AST.
 * Builds symbol tables, performs type checking, and validates IEC semantics.
 */

import type {
  CompilationUnit,
  ElementaryType,
  Expression,
  FunctionBlockDeclaration,
  FunctionCallExpression,
  MethodDeclaration,
  VarBlock,
  VarDeclaration,
  Statement,
  Visibility,
} from "../frontend/ast.js";
import type { CompileError } from "../types.js";
import { StdFunctionRegistry } from "./std-function-registry.js";
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
  private stdRegistry = new StdFunctionRegistry();
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

    // Validate OOP property/member name collisions
    this.validatePropertyNameCollisions(ast);

    // Validate OOP modifier contradictions
    this.validateOOPModifiers(ast);

    // Validate abstract FB instantiation
    this.validateAbstractInstantiation(ast);

    // Validate property write access (read-only check)
    this.validatePropertyAccess(ast);

    // Validate access modifier enforcement
    this.validateAccessModifiers(ast);

    // Validate bit access bounds and ADR l-value targets
    this.validateExpressions(ast);

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
      // CONSTANT requires initializer (except VAR_INPUT CONSTANT — caller provides value)
      if (blockType !== "VAR_INPUT") {
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
   * Validate that property names don't collide with member variable names
   * within the same function block. A collision causes the setter parameter
   * to silently shadow the member variable.
   */
  private validatePropertyNameCollisions(ast: CompilationUnit): void {
    for (const fb of ast.functionBlocks) {
      if (fb.properties.length === 0) continue;

      // Collect all declared member variable names (case-insensitive)
      const memberNames = new Set<string>();
      for (const block of fb.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            memberNames.add(name.toUpperCase());
          }
        }
      }

      // Check each property name against member names
      for (const prop of fb.properties) {
        if (memberNames.has(prop.name.toUpperCase())) {
          this.addWarning(
            `Property '${prop.name}' in FUNCTION_BLOCK '${fb.name}' has the same name as a member variable. ` +
              `The setter parameter will shadow the member variable.`,
            prop.sourceSpan.startLine,
            prop.sourceSpan.startCol,
          );
        }
      }
    }
  }

  /**
   * Validate OOP modifier contradictions on function blocks and methods.
   */
  private validateOOPModifiers(ast: CompilationUnit): void {
    // Build FB lookup map for OVERRIDE and IMPLEMENTS validation
    const fbMap = new Map<string, FunctionBlockDeclaration>();
    for (const fb of ast.functionBlocks) {
      fbMap.set(fb.name.toUpperCase(), fb);
    }

    // Build interface lookup map
    const ifaceMap = new Map<string, Set<string>>();
    for (const iface of ast.interfaces) {
      const methodNames = new Set<string>();
      for (const m of iface.methods) {
        methodNames.add(m.name.toUpperCase());
      }
      ifaceMap.set(iface.name.toUpperCase(), methodNames);
    }

    for (const fb of ast.functionBlocks) {
      // ABSTRACT + FINAL on same FB is contradictory
      if (fb.isAbstract && fb.isFinal) {
        this.addError(
          `FUNCTION_BLOCK '${fb.name}' cannot be both ABSTRACT and FINAL.`,
          fb.sourceSpan.startLine,
          fb.sourceSpan.startCol,
        );
      }

      // Collect parent methods for OVERRIDE / FINAL validation
      const parentMethods = this.collectParentMethods(fb, fbMap);

      // Cannot extend a FINAL FB
      if (fb.extends) {
        const parentFB = fbMap.get(fb.extends.toUpperCase());
        if (parentFB && parentFB.isFinal) {
          this.addError(
            `Cannot extend FINAL FUNCTION_BLOCK '${fb.extends}'.`,
            fb.sourceSpan.startLine,
            fb.sourceSpan.startCol,
          );
        }
      }

      // ABSTRACT method in non-abstract FB is an error
      for (const method of fb.methods) {
        if (method.isAbstract && !fb.isAbstract) {
          this.addError(
            `Method '${method.name}' is ABSTRACT but FUNCTION_BLOCK '${fb.name}' is not ABSTRACT. ` +
              `ABSTRACT methods can only appear in ABSTRACT function blocks.`,
            method.sourceSpan.startLine,
            method.sourceSpan.startCol,
          );
        }

        // ABSTRACT + FINAL on same method is contradictory
        if (method.isAbstract && method.isFinal) {
          this.addError(
            `Method '${method.name}' in '${fb.name}' cannot be both ABSTRACT and FINAL.`,
            method.sourceSpan.startLine,
            method.sourceSpan.startCol,
          );
        }

        // OVERRIDE validation
        if (method.isOverride) {
          if (!fb.extends) {
            this.addError(
              `Method '${method.name}' in '${fb.name}' is marked OVERRIDE but '${fb.name}' does not extend any function block.`,
              method.sourceSpan.startLine,
              method.sourceSpan.startCol,
            );
          } else {
            const parentMethod = parentMethods.get(method.name.toUpperCase());
            if (!parentMethod) {
              this.addError(
                `Method '${method.name}' in '${fb.name}' is marked OVERRIDE but no method '${method.name}' exists in parent '${fb.extends}'.`,
                method.sourceSpan.startLine,
                method.sourceSpan.startCol,
              );
            } else {
              // Cannot override a FINAL method
              if (parentMethod.isFinal) {
                this.addError(
                  `Cannot override FINAL method '${method.name}' from '${fb.extends}'.`,
                  method.sourceSpan.startLine,
                  method.sourceSpan.startCol,
                );
              }
              // Signature must match parent
              this.validateOverrideSignature(
                method,
                parentMethod,
                fb.name,
                fb.extends,
              );
            }
          }
        }
      }

      // IMPLEMENTS contract validation: check all interface methods are provided
      if (fb.implements && !fb.isAbstract) {
        const fbMethodNames = new Set<string>();
        for (const m of fb.methods) {
          fbMethodNames.add(m.name.toUpperCase());
        }
        // Include inherited methods
        for (const name of parentMethods.keys()) {
          fbMethodNames.add(name);
        }

        for (const ifaceName of fb.implements) {
          const requiredMethods = ifaceMap.get(ifaceName.toUpperCase());
          if (requiredMethods) {
            for (const reqMethod of requiredMethods) {
              if (!fbMethodNames.has(reqMethod)) {
                this.addError(
                  `FUNCTION_BLOCK '${fb.name}' implements '${ifaceName}' but does not provide method '${reqMethod}'.`,
                  fb.sourceSpan.startLine,
                  fb.sourceSpan.startCol,
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Collect all methods from the parent chain of a function block.
   * Returns a map of uppercase method name → nearest parent MethodDeclaration.
   */
  private collectParentMethods(
    fb: FunctionBlockDeclaration,
    fbMap: Map<string, FunctionBlockDeclaration>,
  ): Map<string, MethodDeclaration> {
    const methods = new Map<string, MethodDeclaration>();
    let current = fb.extends;
    const visited = new Set<string>(); // prevent infinite loops on circular extends
    while (current) {
      const upper = current.toUpperCase();
      if (visited.has(upper)) break;
      visited.add(upper);
      const parent = fbMap.get(upper);
      if (!parent) break;
      for (const m of parent.methods) {
        const key = m.name.toUpperCase();
        // Only store the nearest parent's version (first encountered wins)
        if (!methods.has(key)) {
          methods.set(key, m);
        }
      }
      current = parent.extends;
    }
    return methods;
  }

  /**
   * Validate that an OVERRIDE method has the same signature as the parent method.
   */
  private validateOverrideSignature(
    method: MethodDeclaration,
    parentMethod: MethodDeclaration,
    fbName: string,
    parentFBName: string,
  ): void {
    // Extract VAR_INPUT parameters from both methods
    const childParams = this.extractMethodParams(method);
    const parentParams = this.extractMethodParams(parentMethod);

    // Compare parameter count and types
    const childSig = childParams.map((p) => p.type).join(", ") || "void";
    const parentSig = parentParams.map((p) => p.type).join(", ") || "void";

    let mismatch = false;
    if (childParams.length !== parentParams.length) {
      mismatch = true;
    } else {
      for (let i = 0; i < childParams.length; i++) {
        if (
          childParams[i]!.type.toUpperCase() !==
          parentParams[i]!.type.toUpperCase()
        ) {
          mismatch = true;
          break;
        }
      }
    }

    // Compare return types
    const childReturn = method.returnType?.name?.toUpperCase() ?? "";
    const parentReturn = parentMethod.returnType?.name?.toUpperCase() ?? "";
    if (childReturn !== parentReturn) {
      mismatch = true;
    }

    if (mismatch) {
      const childRetStr = method.returnType?.name ?? "void";
      const parentRetStr = parentMethod.returnType?.name ?? "void";
      this.addError(
        `Method '${method.name}' in '${fbName}' has different signature than parent method in '${parentFBName}'. ` +
          `Expected: (${parentSig}) : ${parentRetStr}, got: (${childSig}) : ${childRetStr}.`,
        method.sourceSpan.startLine,
        method.sourceSpan.startCol,
      );
    }
  }

  /**
   * Extract VAR_INPUT parameter names and types from a method declaration.
   */
  private extractMethodParams(
    method: MethodDeclaration,
  ): Array<{ name: string; type: string }> {
    const params: Array<{ name: string; type: string }> = [];
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push({ name, type: decl.type.name });
          }
        }
      }
    }
    return params;
  }

  /**
   * Validate that abstract function blocks are not instantiated directly.
   */
  private validateAbstractInstantiation(ast: CompilationUnit): void {
    // Build set of abstract FB names
    const abstractFBs = new Set<string>();
    for (const fb of ast.functionBlocks) {
      if (fb.isAbstract) {
        abstractFBs.add(fb.name.toUpperCase());
      }
    }
    if (abstractFBs.size === 0) return;

    // Check variable declarations in programs
    for (const prog of ast.programs) {
      this.checkVarBlocksForAbstractInstantiation(prog.varBlocks, abstractFBs);
    }

    // Check variable declarations in function blocks
    for (const fb of ast.functionBlocks) {
      this.checkVarBlocksForAbstractInstantiation(fb.varBlocks, abstractFBs);
    }

    // Check variable declarations in functions
    for (const func of ast.functions) {
      this.checkVarBlocksForAbstractInstantiation(func.varBlocks, abstractFBs);
    }
  }

  /**
   * Check var blocks for instantiation of abstract FBs.
   */
  private checkVarBlocksForAbstractInstantiation(
    varBlocks: VarBlock[],
    abstractFBs: Set<string>,
  ): void {
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        if (abstractFBs.has(decl.type.name.toUpperCase())) {
          this.addError(
            `Cannot instantiate ABSTRACT FUNCTION_BLOCK '${decl.type.name}'.`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
          );
        }
      }
    }
  }

  /**
   * Validate that properties without setters are not written to.
   * Best-effort check for direct `x.Property := value;` assignments.
   */
  private validatePropertyAccess(ast: CompilationUnit): void {
    // Build property info map: "FBNAME.PROPNAME" → { hasSetter }
    const propertyInfo = new Map<string, { hasSetter: boolean }>();
    for (const fb of ast.functionBlocks) {
      for (const prop of fb.properties) {
        const key = `${fb.name.toUpperCase()}.${prop.name.toUpperCase()}`;
        propertyInfo.set(key, { hasSetter: prop.setter !== undefined });
      }
    }
    if (propertyInfo.size === 0) return;

    // Build a map of variable name (uppercase) → FB type name (uppercase) for each scope
    const checkStatementsInScope = (
      stmts: Statement[],
      varTypeMap: Map<string, string>,
    ) => {
      this.walkStatementsForPropertyWrites(stmts, varTypeMap, propertyInfo);
    };

    // Check programs
    for (const prog of ast.programs) {
      const varTypeMap = this.buildVarTypeMap(prog.varBlocks);
      checkStatementsInScope(prog.body, varTypeMap);
    }

    // Check function blocks (body and method bodies)
    for (const fb of ast.functionBlocks) {
      const varTypeMap = this.buildVarTypeMap(fb.varBlocks);
      checkStatementsInScope(fb.body, varTypeMap);
      for (const method of fb.methods) {
        const methodVarMap = new Map(varTypeMap);
        // Add method-local vars
        for (const [k, v] of this.buildVarTypeMap(method.varBlocks)) {
          methodVarMap.set(k, v);
        }
        checkStatementsInScope(method.body, methodVarMap);
      }
    }

    // Check functions
    for (const func of ast.functions) {
      const varTypeMap = this.buildVarTypeMap(func.varBlocks);
      checkStatementsInScope(func.body, varTypeMap);
    }
  }

  /**
   * Build a map of variable name (uppercase) → type name (uppercase) from var blocks.
   */
  private buildVarTypeMap(varBlocks: VarBlock[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          map.set(name.toUpperCase(), decl.type.name.toUpperCase());
        }
      }
    }
    return map;
  }

  /**
   * Walk statements looking for assignments to read-only properties.
   */
  private walkStatementsForPropertyWrites(
    stmts: Statement[],
    varTypeMap: Map<string, string>,
    propertyInfo: Map<string, { hasSetter: boolean }>,
  ): void {
    for (const stmt of stmts) {
      if (stmt.kind === "AssignmentStatement") {
        const target = stmt.target;
        // Check for x.Property := value pattern
        if (
          target.kind === "VariableExpression" &&
          target.fieldAccess.length === 1
        ) {
          const varType = varTypeMap.get(target.name.toUpperCase());
          if (varType) {
            const fieldName = target.fieldAccess[0]!;
            const propKey = `${varType}.${fieldName.toUpperCase()}`;
            const info = propertyInfo.get(propKey);
            if (info && !info.hasSetter) {
              this.addError(
                `Property '${fieldName}' of '${varType}' is read-only (no SET accessor).`,
                stmt.sourceSpan.startLine,
                stmt.sourceSpan.startCol,
              );
            }
          }
        }
      }
      // Recurse into control flow
      this.recurseStatementsForPropertyWrites(stmt, varTypeMap, propertyInfo);
    }
  }

  /**
   * Recurse into control flow statements for property write checks.
   */
  private recurseStatementsForPropertyWrites(
    stmt: Statement,
    varTypeMap: Map<string, string>,
    propertyInfo: Map<string, { hasSetter: boolean }>,
  ): void {
    if (stmt.kind === "IfStatement") {
      const s = stmt as unknown as {
        thenStatements: Statement[];
        elsifClauses: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      this.walkStatementsForPropertyWrites(
        s.thenStatements,
        varTypeMap,
        propertyInfo,
      );
      for (const clause of s.elsifClauses) {
        this.walkStatementsForPropertyWrites(
          clause.statements,
          varTypeMap,
          propertyInfo,
        );
      }
      this.walkStatementsForPropertyWrites(
        s.elseStatements,
        varTypeMap,
        propertyInfo,
      );
    } else if (stmt.kind === "ForStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForPropertyWrites(s.body, varTypeMap, propertyInfo);
    } else if (stmt.kind === "WhileStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForPropertyWrites(s.body, varTypeMap, propertyInfo);
    } else if (stmt.kind === "RepeatStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForPropertyWrites(s.body, varTypeMap, propertyInfo);
    } else if (stmt.kind === "CaseStatement") {
      const s = stmt as unknown as {
        cases: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      for (const c of s.cases) {
        this.walkStatementsForPropertyWrites(
          c.statements,
          varTypeMap,
          propertyInfo,
        );
      }
      this.walkStatementsForPropertyWrites(
        s.elseStatements,
        varTypeMap,
        propertyInfo,
      );
    }
  }

  // =============================================================================
  // Bit Access & ADR Expression Validation
  // =============================================================================

  /** Bit widths for IEC types that support bit access. */
  private static readonly IEC_TYPE_BITS: Record<string, number> = {
    BOOL: 1,
    BYTE: 8,
    WORD: 16,
    DWORD: 32,
    LWORD: 64,
    SINT: 8,
    INT: 16,
    DINT: 32,
    LINT: 64,
    USINT: 8,
    UINT: 16,
    UDINT: 32,
    ULINT: 64,
  };

  /**
   * Validate expressions across all programs, functions, and FBs.
   * Checks std function argument counts, bit access bounds, and ADR l-value targets.
   */
  private validateExpressions(ast: CompilationUnit): void {
    for (const prog of ast.programs) {
      const varTypeMap = this.buildVarTypeMap(prog.varBlocks);
      this.walkStatementsForExpressionValidation(prog.body, varTypeMap, ast);
    }
    for (const func of ast.functions) {
      const varTypeMap = this.buildVarTypeMap(func.varBlocks);
      this.walkStatementsForExpressionValidation(func.body, varTypeMap, ast);
    }
    for (const fb of ast.functionBlocks) {
      const varTypeMap = this.buildVarTypeMap(fb.varBlocks);
      this.walkStatementsForExpressionValidation(fb.body, varTypeMap, ast);
      for (const method of fb.methods) {
        const methodVarTypeMap = this.buildVarTypeMap(method.varBlocks);
        // Merge FB vars into method scope (method can access FB members)
        for (const [k, v] of varTypeMap) {
          if (!methodVarTypeMap.has(k)) methodVarTypeMap.set(k, v);
        }
        this.walkStatementsForExpressionValidation(
          method.body,
          methodVarTypeMap,
          ast,
        );
      }
    }
  }

  /**
   * Walk statements checking expressions for bit access bounds and ADR l-value issues.
   */
  private walkStatementsForExpressionValidation(
    stmts: Statement[],
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    for (const stmt of stmts) {
      // Check expressions in assignments
      if (stmt.kind === "AssignmentStatement") {
        this.validateExpression(stmt.target, varTypeMap, ast);
        this.validateExpression(stmt.value, varTypeMap, ast);
      } else if (stmt.kind === "RefAssignStatement") {
        this.validateExpression(stmt.target, varTypeMap, ast);
        this.validateExpression(stmt.source, varTypeMap, ast);
      } else if (stmt.kind === "FunctionCallStatement") {
        this.validateExpression(stmt.call, varTypeMap, ast);
      }
      // Recurse into control flow
      this.recurseStatementsForExpressionValidation(stmt, varTypeMap, ast);
    }
  }

  /**
   * Recurse into control flow statements for expression validation.
   */
  private recurseStatementsForExpressionValidation(
    stmt: Statement,
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    if (stmt.kind === "IfStatement") {
      this.validateExpression(stmt.condition, varTypeMap, ast);
      this.walkStatementsForExpressionValidation(
        stmt.thenStatements,
        varTypeMap,
        ast,
      );
      for (const clause of stmt.elsifClauses) {
        this.validateExpression(clause.condition, varTypeMap, ast);
        this.walkStatementsForExpressionValidation(
          clause.statements,
          varTypeMap,
          ast,
        );
      }
      this.walkStatementsForExpressionValidation(
        stmt.elseStatements,
        varTypeMap,
        ast,
      );
    } else if (stmt.kind === "ForStatement") {
      this.validateExpression(stmt.start, varTypeMap, ast);
      this.validateExpression(stmt.end, varTypeMap, ast);
      if (stmt.step) this.validateExpression(stmt.step, varTypeMap, ast);
      this.walkStatementsForExpressionValidation(stmt.body, varTypeMap, ast);
    } else if (stmt.kind === "WhileStatement") {
      this.validateExpression(stmt.condition, varTypeMap, ast);
      this.walkStatementsForExpressionValidation(stmt.body, varTypeMap, ast);
    } else if (stmt.kind === "RepeatStatement") {
      this.walkStatementsForExpressionValidation(stmt.body, varTypeMap, ast);
      this.validateExpression(stmt.condition, varTypeMap, ast);
    } else if (stmt.kind === "CaseStatement") {
      this.validateExpression(stmt.selector, varTypeMap, ast);
      for (const c of stmt.cases) {
        this.walkStatementsForExpressionValidation(
          c.statements,
          varTypeMap,
          ast,
        );
      }
      this.walkStatementsForExpressionValidation(
        stmt.elseStatements,
        varTypeMap,
        ast,
      );
    }
  }

  /**
   * Validate a single expression recursively for std function args, bit access, and ADR issues.
   */
  private validateExpression(
    expr: Expression,
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    // Check bit access bounds on variable expressions
    if (expr.kind === "VariableExpression") {
      this.checkBitAccess(expr, varTypeMap, ast, expr.subscripts.length > 0);
    }

    // Validate standard function argument counts and ADR l-value requirement
    if (
      expr.kind === "FunctionCallExpression" &&
      !expr.functionName.includes(".")
    ) {
      this.checkStdFunctionArgs(expr);
    }

    // Recurse into sub-expressions
    if (expr.kind === "BinaryExpression") {
      this.validateExpression(expr.left, varTypeMap, ast);
      this.validateExpression(expr.right, varTypeMap, ast);
    } else if (expr.kind === "UnaryExpression") {
      this.validateExpression(expr.operand, varTypeMap, ast);
    } else if (expr.kind === "FunctionCallExpression") {
      for (const arg of expr.arguments) {
        this.validateExpression(arg.value, varTypeMap, ast);
      }
    } else if (expr.kind === "MethodCallExpression") {
      this.validateExpression(expr.object, varTypeMap, ast);
      for (const arg of expr.arguments) {
        this.validateExpression(arg.value, varTypeMap, ast);
      }
    } else if (expr.kind === "ParenthesizedExpression") {
      this.validateExpression(expr.expression, varTypeMap, ast);
    }
  }

  /**
   * Check if an expression is a valid l-value (can have its address taken).
   */
  private isLValue(expr: Expression): boolean {
    return (
      expr.kind === "VariableExpression" ||
      (expr.kind === "ParenthesizedExpression" &&
        this.isLValue(expr.expression))
    );
  }

  /**
   * Validate standard function argument counts and special constraints (e.g., ADR l-value).
   * Covers all registered std functions and *_TO_* conversion functions.
   */
  private checkStdFunctionArgs(expr: FunctionCallExpression): void {
    const nameUpper = expr.functionName.toUpperCase();
    const argCount = expr.arguments.length;

    // Look up in std function registry
    const desc = this.stdRegistry.lookup(nameUpper);
    if (desc) {
      if (desc.isVariadic) {
        const minArgs = desc.minArgs ?? desc.params.length;
        if (argCount < minArgs) {
          this.addError(
            `'${nameUpper}' requires at least ${minArgs} argument(s), got ${argCount}`,
            expr.sourceSpan.startLine,
            expr.sourceSpan.startCol,
          );
        }
      } else {
        const expected = desc.params.length;
        if (argCount !== expected) {
          this.addError(
            `'${nameUpper}' requires ${expected} argument(s), got ${argCount}`,
            expr.sourceSpan.startLine,
            expr.sourceSpan.startCol,
          );
        }
      }
    } else if (this.stdRegistry.resolveConversion(nameUpper)) {
      // *_TO_* conversion functions always take exactly 1 argument
      if (argCount !== 1) {
        this.addError(
          `'${nameUpper}' requires 1 argument, got ${argCount}`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
        );
      }
    }

    // Additional ADR constraint: argument must be an l-value
    if (nameUpper === "ADR" && argCount > 0) {
      const arg = expr.arguments[0]!.value;
      if (!this.isLValue(arg)) {
        this.addError(
          "ADR() requires a variable reference, not an expression",
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
        );
      }
    }
  }

  /**
   * Check bit access bounds on a variable expression.
   * Detects patterns like `var.31` where 31 exceeds the bit width of var's type.
   */
  private checkBitAccess(
    expr: {
      name: string;
      fieldAccess: string[];
      sourceSpan: { startLine: number; startCol: number };
    },
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
    hasSubscripts: boolean,
  ): void {
    if (expr.fieldAccess.length === 0) return;

    // Find the first numeric field access (bit index)
    for (let i = 0; i < expr.fieldAccess.length; i++) {
      const field = expr.fieldAccess[i]!;
      if (!/^\d+$/.test(field)) continue;

      const bitIndex = parseInt(field, 10);

      // Resolve the type of the field chain up to (but not including) the bit index
      let typeName = varTypeMap.get(expr.name.toUpperCase());
      if (!typeName) return;

      // If the variable has subscripts (array indexing), resolve to the element type
      if (i === 0 && hasSubscripts) {
        const elemType = this.resolveArrayElementType(typeName, ast);
        if (elemType) {
          typeName = elemType;
        } else {
          return; // Can't resolve element type — skip validation
        }
      }

      // Walk intermediate fields to resolve the type
      for (let j = 0; j < i; j++) {
        const intermediateField = expr.fieldAccess[j]!;
        if (/^\d+$/.test(intermediateField)) return; // Earlier bit access — skip
        typeName = this.resolveStructFieldType(
          typeName,
          intermediateField,
          ast,
        );
        if (!typeName) return;
      }

      const typeUpper = typeName.toUpperCase();
      const bits = SemanticAnalyzer.IEC_TYPE_BITS[typeUpper];
      if (bits === undefined) {
        // Type doesn't support bit access (REAL, STRING, user-defined, etc.)
        this.addError(
          `Bit access is not valid on type ${typeName}`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
        );
        return;
      }
      if (bitIndex >= bits) {
        this.addError(
          `Bit index ${bitIndex} is out of range for type ${typeName} (0..${bits - 1})`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
        );
      }
      return; // Only check the first bit access
    }
  }

  /**
   * Resolve the type of a struct field by looking up the type definition in the AST.
   */
  private resolveStructFieldType(
    typeName: string,
    fieldName: string,
    ast: CompilationUnit,
  ): string | undefined {
    const typeUpper = typeName.toUpperCase();
    const fieldUpper = fieldName.toUpperCase();

    // Check struct type definitions
    for (const td of ast.types) {
      if (
        td.name.toUpperCase() === typeUpper &&
        td.definition.kind === "StructDefinition"
      ) {
        for (const field of td.definition.fields) {
          for (const name of field.names) {
            if (name.toUpperCase() === fieldUpper) return field.type.name;
          }
        }
      }
    }

    // Check FB var blocks (FB instance member access)
    for (const fb of ast.functionBlocks) {
      if (fb.name.toUpperCase() === typeUpper) {
        for (const block of fb.varBlocks) {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              if (name.toUpperCase() === fieldUpper) return decl.type.name;
            }
          }
        }
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Resolve the element type of an array type.
   * Handles __INLINE_ARRAY_* internal types and user-defined array TYPE definitions.
   */
  private resolveArrayElementType(
    typeName: string,
    ast: CompilationUnit,
  ): string | undefined {
    const typeUpper = typeName.toUpperCase();

    // Handle __INLINE_ARRAY_<ElementType> internal types
    if (typeUpper.startsWith("__INLINE_ARRAY_")) {
      return typeUpper.substring("__INLINE_ARRAY_".length);
    }

    // Check user-defined array type definitions
    for (const td of ast.types) {
      if (
        td.name.toUpperCase() === typeUpper &&
        td.definition.kind === "ArrayDefinition"
      ) {
        return td.definition.elementType.name.toUpperCase();
      }
    }

    return undefined;
  }

  /**
   * Validate access modifier enforcement for method calls.
   * PRIVATE methods only callable from within same FB.
   * PROTECTED only from same FB or derived FBs.
   */
  private validateAccessModifiers(ast: CompilationUnit): void {
    // Build method visibility map: "FBNAME.METHODNAME" → Visibility
    const methodVisibility = new Map<string, Visibility>();
    for (const fb of ast.functionBlocks) {
      for (const method of fb.methods) {
        const key = `${fb.name.toUpperCase()}.${method.name.toUpperCase()}`;
        methodVisibility.set(key, method.visibility);
      }
    }

    // Build inheritance chain: FB name → set of ancestor FB names (uppercase)
    const fbMap = new Map<string, FunctionBlockDeclaration>();
    for (const fb of ast.functionBlocks) {
      fbMap.set(fb.name.toUpperCase(), fb);
    }

    const getAncestors = (fbName: string): Set<string> => {
      const ancestors = new Set<string>();
      let current = fbMap.get(fbName.toUpperCase())?.extends;
      const visited = new Set<string>();
      while (current) {
        const upper = current.toUpperCase();
        if (visited.has(upper)) break;
        visited.add(upper);
        ancestors.add(upper);
        current = fbMap.get(upper)?.extends;
      }
      return ancestors;
    };

    // Check method calls in programs (caller context: not in any FB)
    for (const prog of ast.programs) {
      const varTypeMap = this.buildVarTypeMap(prog.varBlocks);
      this.walkStatementsForAccessViolations(
        prog.body,
        varTypeMap,
        methodVisibility,
        null,
        getAncestors,
      );
    }

    // Check method calls in functions
    for (const func of ast.functions) {
      const varTypeMap = this.buildVarTypeMap(func.varBlocks);
      this.walkStatementsForAccessViolations(
        func.body,
        varTypeMap,
        methodVisibility,
        null,
        getAncestors,
      );
    }

    // Check method calls in FBs and their methods
    for (const fb of ast.functionBlocks) {
      const varTypeMap = this.buildVarTypeMap(fb.varBlocks);
      this.walkStatementsForAccessViolations(
        fb.body,
        varTypeMap,
        methodVisibility,
        fb.name.toUpperCase(),
        getAncestors,
      );
      for (const method of fb.methods) {
        const methodVarMap = new Map(varTypeMap);
        for (const [k, v] of this.buildVarTypeMap(method.varBlocks)) {
          methodVarMap.set(k, v);
        }
        this.walkStatementsForAccessViolations(
          method.body,
          methodVarMap,
          methodVisibility,
          fb.name.toUpperCase(),
          getAncestors,
        );
      }
    }
  }

  /**
   * Walk statements looking for method calls that violate access modifiers.
   */
  private walkStatementsForAccessViolations(
    stmts: Statement[],
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null, // uppercase name of the FB we're inside, or null
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    for (const stmt of stmts) {
      // Check method calls in FunctionCallStatement
      if (stmt.kind === "FunctionCallStatement") {
        const fcStmt = stmt as unknown as {
          call: {
            kind: string;
            functionName?: string;
            object?: Expression;
            methodName?: string;
            arguments: Array<{ value: Expression }>;
            sourceSpan: { startLine: number; startCol: number };
          };
        };
        // Handle dotted FunctionCallExpression: m.Method() → functionName = "m.Method"
        if (
          fcStmt.call.kind === "FunctionCallExpression" &&
          fcStmt.call.functionName?.includes(".")
        ) {
          this.checkDottedFunctionCallAccess(
            fcStmt.call.functionName,
            fcStmt.call.sourceSpan,
            varTypeMap,
            methodVisibility,
            callerFB,
            getAncestors,
          );
        }
        // Handle MethodCallExpression: chained calls
        if (fcStmt.call.kind === "MethodCallExpression") {
          this.checkMethodCallAccess(
            fcStmt.call as {
              object: Expression;
              methodName: string;
              sourceSpan: { startLine: number; startCol: number };
            },
            varTypeMap,
            methodVisibility,
            callerFB,
            getAncestors,
          );
        }
      }

      // Check assignment RHS for method calls
      if (stmt.kind === "AssignmentStatement") {
        const value = (stmt as { value: Expression }).value;
        this.walkExpressionForAccessViolations(
          value,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }

      // Recurse into control flow
      this.recurseStatementsForAccessViolations(
        stmt,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    }
  }

  /**
   * Walk an expression tree looking for method calls that violate access modifiers.
   */
  private walkExpressionForAccessViolations(
    expr: Expression,
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    if (expr.kind === "MethodCallExpression") {
      this.checkMethodCallAccess(
        expr as {
          object: Expression;
          methodName: string;
          sourceSpan: { startLine: number; startCol: number };
        },
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
      // Also check arguments
      const args = (expr as { arguments: Array<{ value: Expression }> })
        .arguments;
      for (const arg of args) {
        this.walkExpressionForAccessViolations(
          arg.value,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
    } else if (expr.kind === "FunctionCallExpression") {
      const args = (expr as { arguments: Array<{ value: Expression }> })
        .arguments;
      for (const arg of args) {
        this.walkExpressionForAccessViolations(
          arg.value,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
    } else if (expr.kind === "BinaryExpression") {
      const bin = expr as { left: Expression; right: Expression };
      this.walkExpressionForAccessViolations(
        bin.left,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
      this.walkExpressionForAccessViolations(
        bin.right,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (expr.kind === "UnaryExpression") {
      const un = expr as { operand: Expression };
      this.walkExpressionForAccessViolations(
        un.operand,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (expr.kind === "ParenthesizedExpression") {
      const paren = expr as { expression: Expression };
      this.walkExpressionForAccessViolations(
        paren.expression,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    }
  }

  /**
   * Check a dotted FunctionCallExpression (e.g., functionName="m.InternalCalc")
   * for access modifier violations.
   */
  private checkDottedFunctionCallAccess(
    functionName: string,
    sourceSpan: { startLine: number; startCol: number },
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    const dotIndex = functionName.indexOf(".");
    if (dotIndex < 0) return;
    const objName = functionName.substring(0, dotIndex);
    const methodName = functionName.substring(dotIndex + 1);

    const calleeFBType = varTypeMap.get(objName.toUpperCase());
    if (!calleeFBType) return;

    const visKey = `${calleeFBType}.${methodName.toUpperCase()}`;
    const visibility = methodVisibility.get(visKey);
    if (!visibility) return;

    if (visibility === "PRIVATE") {
      if (callerFB !== calleeFBType) {
        this.addError(
          `Cannot call PRIVATE method '${methodName}' of '${calleeFBType}' from outside '${calleeFBType}'.`,
          sourceSpan.startLine,
          sourceSpan.startCol,
        );
      }
    } else if (visibility === "PROTECTED") {
      if (callerFB !== calleeFBType) {
        const ancestors = callerFB ? getAncestors(callerFB) : new Set<string>();
        if (!ancestors.has(calleeFBType)) {
          this.addError(
            `Cannot call PROTECTED method '${methodName}' of '${calleeFBType}' from '${callerFB ?? "PROGRAM"}'.`,
            sourceSpan.startLine,
            sourceSpan.startCol,
          );
        }
      }
    }
  }

  /**
   * Check a single method call for access modifier violations.
   */
  private checkMethodCallAccess(
    call: {
      object: Expression;
      methodName: string;
      sourceSpan: { startLine: number; startCol: number };
    },
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    // Only handle obj.Method() where obj is a simple VariableExpression
    if (call.object.kind !== "VariableExpression") return;
    const varExpr = call.object as { name: string; fieldAccess: string[] };
    if (varExpr.fieldAccess.length > 0) return; // skip chained access for now

    const calleeFBType = varTypeMap.get(varExpr.name.toUpperCase());
    if (!calleeFBType) return;

    const visKey = `${calleeFBType}.${call.methodName.toUpperCase()}`;
    const visibility = methodVisibility.get(visKey);
    if (!visibility) return;

    if (visibility === "PRIVATE") {
      if (callerFB !== calleeFBType) {
        this.addError(
          `Cannot call PRIVATE method '${call.methodName}' of '${calleeFBType}' from outside '${calleeFBType}'.`,
          call.sourceSpan.startLine,
          call.sourceSpan.startCol,
        );
      }
    } else if (visibility === "PROTECTED") {
      if (callerFB !== calleeFBType) {
        // Check if caller is a derived FB
        const ancestors = callerFB ? getAncestors(callerFB) : new Set<string>();
        if (!ancestors.has(calleeFBType)) {
          this.addError(
            `Cannot call PROTECTED method '${call.methodName}' of '${calleeFBType}' from '${callerFB ?? "PROGRAM"}'.`,
            call.sourceSpan.startLine,
            call.sourceSpan.startCol,
          );
        }
      }
    }
  }

  /**
   * Recurse into control flow statements for access violation checks.
   */
  private recurseStatementsForAccessViolations(
    stmt: Statement,
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    if (stmt.kind === "IfStatement") {
      const s = stmt as unknown as {
        thenStatements: Statement[];
        elsifClauses: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      this.walkStatementsForAccessViolations(
        s.thenStatements,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
      for (const clause of s.elsifClauses) {
        this.walkStatementsForAccessViolations(
          clause.statements,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
      this.walkStatementsForAccessViolations(
        s.elseStatements,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "ForStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForAccessViolations(
        s.body,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "WhileStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForAccessViolations(
        s.body,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "RepeatStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForAccessViolations(
        s.body,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "CaseStatement") {
      const s = stmt as unknown as {
        cases: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      for (const c of s.cases) {
        this.walkStatementsForAccessViolations(
          c.statements,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
      this.walkStatementsForAccessViolations(
        s.elseStatements,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    }
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
