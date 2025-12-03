/**
 * STruC++ Type Checker
 *
 * Performs type checking and type inference on the AST.
 * Validates IEC 61131-3 type rules and resolves types for expressions.
 */

import type {
  Expression,
  BinaryExpression,
  UnaryExpression,
  LiteralExpression,
  VariableExpression,
  FunctionCallExpression,
  IECType,
  ElementaryType,
  CompilationUnit,
} from "../frontend/ast.js";
import type { SymbolTables, Scope } from "./symbol-table.js";
import type { CompileError } from "../types.js";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Built-in elementary types with their properties.
 */
export const ELEMENTARY_TYPES: Record<string, ElementaryType> = {
  BOOL: { typeKind: "elementary", name: "BOOL", sizeBits: 1 },
  BYTE: { typeKind: "elementary", name: "BYTE", sizeBits: 8 },
  WORD: { typeKind: "elementary", name: "WORD", sizeBits: 16 },
  DWORD: { typeKind: "elementary", name: "DWORD", sizeBits: 32 },
  LWORD: { typeKind: "elementary", name: "LWORD", sizeBits: 64 },
  SINT: { typeKind: "elementary", name: "SINT", sizeBits: 8 },
  INT: { typeKind: "elementary", name: "INT", sizeBits: 16 },
  DINT: { typeKind: "elementary", name: "DINT", sizeBits: 32 },
  LINT: { typeKind: "elementary", name: "LINT", sizeBits: 64 },
  USINT: { typeKind: "elementary", name: "USINT", sizeBits: 8 },
  UINT: { typeKind: "elementary", name: "UINT", sizeBits: 16 },
  UDINT: { typeKind: "elementary", name: "UDINT", sizeBits: 32 },
  ULINT: { typeKind: "elementary", name: "ULINT", sizeBits: 64 },
  REAL: { typeKind: "elementary", name: "REAL", sizeBits: 32 },
  LREAL: { typeKind: "elementary", name: "LREAL", sizeBits: 64 },
  TIME: { typeKind: "elementary", name: "TIME", sizeBits: 64 },
  DATE: { typeKind: "elementary", name: "DATE", sizeBits: 64 },
  TIME_OF_DAY: { typeKind: "elementary", name: "TIME_OF_DAY", sizeBits: 64 },
  DATE_AND_TIME: {
    typeKind: "elementary",
    name: "DATE_AND_TIME",
    sizeBits: 64,
  },
  STRING: { typeKind: "elementary", name: "STRING", sizeBits: 0 },
  WSTRING: { typeKind: "elementary", name: "WSTRING", sizeBits: 0 },
};

/**
 * Type categories for IEC 61131-3 generic types.
 */
export type TypeCategory =
  | "ANY"
  | "ANY_DERIVED"
  | "ANY_ELEMENTARY"
  | "ANY_MAGNITUDE"
  | "ANY_NUM"
  | "ANY_REAL"
  | "ANY_INT"
  | "ANY_BIT"
  | "ANY_STRING"
  | "ANY_DATE";

/**
 * Map of type names to their categories.
 */
const TYPE_CATEGORIES: Record<string, TypeCategory[]> = {
  BOOL: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  BYTE: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  WORD: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  DWORD: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  LWORD: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  SINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  INT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  DINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  LINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  USINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  UINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  UDINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  ULINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  REAL: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_REAL"],
  LREAL: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_REAL"],
  TIME: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_DATE"],
  DATE: ["ANY", "ANY_ELEMENTARY", "ANY_DATE"],
  TIME_OF_DAY: ["ANY", "ANY_ELEMENTARY", "ANY_DATE"],
  DATE_AND_TIME: ["ANY", "ANY_ELEMENTARY", "ANY_DATE"],
  STRING: ["ANY", "ANY_ELEMENTARY", "ANY_STRING"],
  WSTRING: ["ANY", "ANY_ELEMENTARY", "ANY_STRING"],
};

// =============================================================================
// Type Checker
// =============================================================================

/**
 * Type checker for IEC 61131-3 programs.
 */
export class TypeChecker {
  private errors: CompileError[] = [];
  private warnings: CompileError[] = [];

  constructor(private symbolTables: SymbolTables) {}

  /**
   * Check types for a complete compilation unit.
   * Will be fully implemented in Phase 3+.
   */
  check(_ast: CompilationUnit): {
    errors: CompileError[];
    warnings: CompileError[];
  } {
    this.errors = [];
    this.warnings = [];

    // TODO: Implement full type checking in Phase 3+
    // For now, this is a placeholder

    return {
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Infer the type of an expression.
   */
  inferType(expr: Expression, scope: Scope): IECType | undefined {
    switch (expr.kind) {
      case "LiteralExpression":
        return this.inferLiteralType(expr);
      case "VariableExpression":
        return this.inferVariableType(expr, scope);
      case "BinaryExpression":
        return this.inferBinaryType(expr, scope);
      case "UnaryExpression":
        return this.inferUnaryType(expr, scope);
      case "FunctionCallExpression":
        return this.inferFunctionCallType(expr, scope);
      case "ParenthesizedExpression":
        return this.inferType(expr.expression, scope);
      default:
        return undefined;
    }
  }

  /**
   * Infer type of a literal expression.
   */
  private inferLiteralType(expr: LiteralExpression): IECType | undefined {
    switch (expr.literalType) {
      case "BOOL":
        return ELEMENTARY_TYPES["BOOL"];
      case "INT":
        return ELEMENTARY_TYPES["INT"];
      case "REAL":
        return ELEMENTARY_TYPES["REAL"];
      case "STRING":
        return ELEMENTARY_TYPES["STRING"];
      case "WSTRING":
        return ELEMENTARY_TYPES["WSTRING"];
      case "TIME":
        return ELEMENTARY_TYPES["TIME"];
      case "DATE":
        return ELEMENTARY_TYPES["DATE"];
      case "TIME_OF_DAY":
        return ELEMENTARY_TYPES["TIME_OF_DAY"];
      case "DATE_AND_TIME":
        return ELEMENTARY_TYPES["DATE_AND_TIME"];
      case "NULL":
        return undefined; // NULL has no specific type
      default:
        return undefined;
    }
  }

  /**
   * Infer type of a variable expression.
   */
  private inferVariableType(
    expr: VariableExpression,
    scope: Scope,
  ): IECType | undefined {
    const symbol = scope.lookup(expr.name);
    if (symbol === undefined) {
      this.addError(
        `Undefined variable: ${expr.name}`,
        expr.sourceSpan.startLine,
        expr.sourceSpan.startCol,
      );
      return undefined;
    }

    if (symbol.kind !== "variable" && symbol.kind !== "constant") {
      this.addError(
        `'${expr.name}' is not a variable`,
        expr.sourceSpan.startLine,
        expr.sourceSpan.startCol,
      );
      return undefined;
    }

    return symbol.type;
  }

  /**
   * Infer type of a binary expression.
   */
  private inferBinaryType(
    expr: BinaryExpression,
    scope: Scope,
  ): IECType | undefined {
    const leftType = this.inferType(expr.left, scope);
    const rightType = this.inferType(expr.right, scope);

    if (leftType === undefined || rightType === undefined) {
      return undefined;
    }

    // Comparison operators always return BOOL
    if (["=", "<>", "<", ">", "<=", ">="].includes(expr.operator)) {
      return ELEMENTARY_TYPES["BOOL"];
    }

    // Logical operators return BOOL
    if (["AND", "OR", "XOR"].includes(expr.operator)) {
      return ELEMENTARY_TYPES["BOOL"];
    }

    // Arithmetic operators return the "wider" type
    if (["+", "-", "*", "/", "MOD", "**"].includes(expr.operator)) {
      return this.getWiderType(leftType, rightType);
    }

    return leftType;
  }

  /**
   * Infer type of a unary expression.
   */
  private inferUnaryType(
    expr: UnaryExpression,
    scope: Scope,
  ): IECType | undefined {
    const operandType = this.inferType(expr.operand, scope);

    if (operandType === undefined) {
      return undefined;
    }

    if (expr.operator === "NOT") {
      return ELEMENTARY_TYPES["BOOL"];
    }

    // Unary + and - preserve the operand type
    return operandType;
  }

  /**
   * Infer type of a function call expression.
   */
  private inferFunctionCallType(
    expr: FunctionCallExpression,
    scope: Scope,
  ): IECType | undefined {
    const funcSymbol = this.symbolTables.lookupFunction(expr.functionName);
    if (funcSymbol !== undefined) {
      return funcSymbol.returnType;
    }

    // Could be a function block call - check for FB instance
    const fbInstance = scope.lookup(expr.functionName);
    if (fbInstance?.kind === "variable") {
      // FB calls don't have a direct return type
      return undefined;
    }

    this.addError(
      `Unknown function: ${expr.functionName}`,
      expr.sourceSpan.startLine,
      expr.sourceSpan.startCol,
    );
    return undefined;
  }

  /**
   * Get the wider of two types for arithmetic operations.
   */
  private getWiderType(left: IECType, right: IECType): IECType {
    if (left.typeKind !== "elementary" || right.typeKind !== "elementary") {
      return left;
    }

    const leftElem = left as ElementaryType;
    const rightElem = right as ElementaryType;

    // REAL types are wider than INT types
    if (leftElem.name === "LREAL" || rightElem.name === "LREAL") {
      return ELEMENTARY_TYPES["LREAL"] ?? left;
    }
    if (leftElem.name === "REAL" || rightElem.name === "REAL") {
      return ELEMENTARY_TYPES["REAL"] ?? left;
    }

    // Return the type with more bits
    return leftElem.sizeBits >= rightElem.sizeBits ? left : right;
  }

  /**
   * Check if a type belongs to a category.
   */
  isTypeInCategory(type: IECType, category: TypeCategory): boolean {
    if (type.typeKind !== "elementary") {
      return category === "ANY" || category === "ANY_DERIVED";
    }

    const elemType = type as ElementaryType;
    const categories = TYPE_CATEGORIES[elemType.name];
    return categories?.includes(category) ?? false;
  }

  /**
   * Check if two types are compatible for assignment.
   */
  areTypesCompatible(target: IECType, source: IECType): boolean {
    if (target.typeKind !== source.typeKind) {
      return false;
    }

    if (target.typeKind === "elementary" && source.typeKind === "elementary") {
      const targetElem = target as ElementaryType;
      const sourceElem = source as ElementaryType;

      // Same type is always compatible
      if (targetElem.name === sourceElem.name) {
        return true;
      }

      // Allow implicit widening conversions within numeric types
      const targetCategories = TYPE_CATEGORIES[targetElem.name] ?? [];
      const sourceCategories = TYPE_CATEGORIES[sourceElem.name] ?? [];

      if (
        targetCategories.includes("ANY_NUM") &&
        sourceCategories.includes("ANY_NUM")
      ) {
        return targetElem.sizeBits >= sourceElem.sizeBits;
      }

      return false;
    }

    // For other types, require exact match
    return JSON.stringify(target) === JSON.stringify(source);
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
   * Used in Phase 3+ for type checking warnings.
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
