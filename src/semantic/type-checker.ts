// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Type Checker
 *
 * Performs type checking and type inference on the AST.
 * Validates IEC 61131-3 type rules and resolves types for expressions.
 *
 * Sub-Phase B: Walks all POUs and resolves every expression's type (sets resolvedType on AST nodes).
 * Sub-Phase C: Validates type rules (assignment compatibility, conditions, FOR vars, function args).
 */

import type {
  Expression,
  BinaryExpression,
  UnaryExpression,
  LiteralExpression,
  VariableExpression,
  FunctionCallExpression,
  MethodCallExpression,
  IECType,
  ElementaryType,
  ReferenceType,
  CompilationUnit,
  Statement,
} from "../frontend/ast.js";
import type { SymbolTables, Scope } from "./symbol-table.js";
import type { StdFunctionRegistry } from "./std-function-registry.js";
import type { CompileError } from "../types.js";
import {
  ELEMENTARY_TYPES,
  isTypeInCategory as _isTypeInCategory,
  isAssignable as _isAssignable,
  isNarrowingConversion,
  matchesConstraint,
  getCommonType,
  resolveFieldType,
  resolveArrayElementType,
  typeName as typeNameUtil,
} from "./type-utils.js";

// Re-export from type-utils for backward compatibility
export { ELEMENTARY_TYPES, TYPE_CATEGORIES } from "./type-utils.js";
export type { TypeCategory } from "./type-utils.js";

// =============================================================================
// Type Checker
// =============================================================================

/**
 * Type checker for IEC 61131-3 programs.
 */
export class TypeChecker {
  private errors: CompileError[] = [];
  private warnings: CompileError[] = [];
  private ast: CompilationUnit | undefined;

  constructor(
    private symbolTables: SymbolTables,
    private stdRegistry?: StdFunctionRegistry,
  ) {}

  /**
   * Check types for a complete compilation unit.
   * Walks all POUs, resolves expression types, and validates type rules.
   */
  check(ast: CompilationUnit): {
    errors: CompileError[];
    warnings: CompileError[];
  } {
    this.errors = [];
    this.warnings = [];
    this.ast = ast;

    // Walk all programs
    for (const prog of ast.programs) {
      const scope = this.symbolTables.getProgramScope(prog.name);
      if (scope) {
        this.checkStatements(prog.body, scope);
      }
    }

    // Walk all functions
    for (const func of ast.functions) {
      const scope = this.symbolTables.getFunctionScope(func.name);
      if (scope) {
        this.checkStatements(func.body, scope);
      }
    }

    // Walk all function blocks
    for (const fb of ast.functionBlocks) {
      const scope = this.symbolTables.getFBScope(fb.name);
      if (scope) {
        // FB body
        this.checkStatements(fb.body, scope);

        // Method bodies (use method scope for local variable resolution)
        for (const method of fb.methods) {
          const methodScope = this.symbolTables.getMethodScope(
            fb.name,
            method.name,
          );
          this.checkStatements(method.body, methodScope ?? scope);
        }

        // Property getter/setter bodies
        for (const prop of fb.properties) {
          if (prop.getter) this.checkStatements(prop.getter, scope);
          if (prop.setter) this.checkStatements(prop.setter, scope);
        }
      }
    }

    return {
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  // ===========================================================================
  // Expression Type Resolution (Sub-Phase B)
  // ===========================================================================

  /**
   * Resolve the type of an expression, setting resolvedType on the AST node.
   * Public so codegen can call it for standalone expressions.
   */
  resolveExprType(expr: Expression, scope: Scope): IECType | undefined {
    const type = this.inferType(expr, scope);
    if (type) {
      expr.resolvedType = type;
    }
    return type;
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
      case "MethodCallExpression":
        return this.inferMethodCallType(expr, scope);
      case "ParenthesizedExpression": {
        const inner = this.inferType(expr.expression, scope);
        if (inner) expr.resolvedType = inner;
        return inner;
      }
      case "RefExpression": {
        const operandType = this.resolveExprType(expr.operand, scope);
        if (operandType) {
          const refType: ReferenceType = {
            typeKind: "reference",
            referencedType: operandType,
            isImplicitDeref: false,
          };
          expr.resolvedType = refType;
          return refType;
        }
        return undefined;
      }
      case "DrefExpression": {
        const operandType = this.resolveExprType(expr.operand, scope);
        if (operandType?.typeKind === "reference") {
          const derefType = (operandType as ReferenceType).referencedType;
          expr.resolvedType = derefType;
          return derefType;
        }
        return undefined;
      }
      case "NewExpression": {
        const allocType =
          ELEMENTARY_TYPES[expr.allocationType.name.toUpperCase()];
        if (allocType) {
          const refType: ReferenceType = {
            typeKind: "reference",
            referencedType: allocType,
            isImplicitDeref: false,
          };
          expr.resolvedType = refType;
          return refType;
        }
        return undefined;
      }
      case "ArrayLiteralExpression": {
        // Array literals don't have an inherent type — they get their type from the assignment target
        return undefined;
      }
      default:
        return undefined;
    }
  }

  /**
   * Infer type of a literal expression.
   */
  private inferLiteralType(expr: LiteralExpression): IECType | undefined {
    if (expr.typePrefix) {
      const prefixType = ELEMENTARY_TYPES[expr.typePrefix.toUpperCase()];
      if (prefixType) {
        expr.resolvedType = prefixType;
        return prefixType;
      }
    }
    let type: IECType | undefined;
    switch (expr.literalType) {
      case "BOOL":
        type = ELEMENTARY_TYPES["BOOL"];
        break;
      case "INT":
        type = ELEMENTARY_TYPES["INT"];
        break;
      case "REAL":
        type = ELEMENTARY_TYPES["REAL"];
        break;
      case "STRING":
        type = ELEMENTARY_TYPES["STRING"];
        break;
      case "WSTRING":
        type = ELEMENTARY_TYPES["WSTRING"];
        break;
      case "TIME":
        type = ELEMENTARY_TYPES["TIME"];
        break;
      case "DATE":
        type = ELEMENTARY_TYPES["DATE"];
        break;
      case "TIME_OF_DAY":
        type = ELEMENTARY_TYPES["TIME_OF_DAY"];
        break;
      case "DATE_AND_TIME":
        type = ELEMENTARY_TYPES["DATE_AND_TIME"];
        break;
      case "NULL":
        return undefined;
      default:
        return undefined;
    }
    if (type) expr.resolvedType = type;
    return type;
  }

  /**
   * Infer type of a variable expression, including access chain resolution.
   */
  private inferVariableType(
    expr: VariableExpression,
    scope: Scope,
  ): IECType | undefined {
    const symbol = scope.lookup(expr.name);
    if (symbol === undefined) {
      // Don't report error here — Pass 3 undeclared-variable check handles this
      return undefined;
    }

    if (symbol.kind !== "variable" && symbol.kind !== "constant") {
      return undefined;
    }

    let currentType: IECType | undefined = symbol.type;
    let currentTypeName: string | undefined;

    if (currentType?.typeKind === "elementary") {
      currentTypeName = (currentType as ElementaryType).name;
    } else if (currentType) {
      // For non-elementary types, use the declaration type name
      currentTypeName = symbol.declaration?.type?.name;
    }

    // Resolve access chain (accessChain is the preferred path)
    if (expr.accessChain && expr.accessChain.length > 0 && this.ast) {
      for (const step of expr.accessChain) {
        if (!currentTypeName) break;

        if (step.kind === "field") {
          // Resolve struct/FB field
          const fieldType = resolveFieldType(
            currentTypeName,
            step.name,
            this.ast,
          );
          if (fieldType) {
            currentTypeName = fieldType;
            currentType =
              ELEMENTARY_TYPES[fieldType.toUpperCase()] ??
              ({
                typeKind: "elementary",
                name: fieldType,
                sizeBits: 0,
              } as ElementaryType);
          } else {
            // Check if it's a numeric bit access (e.g., var.0)
            if (/^\d+$/.test(step.name)) {
              currentType = ELEMENTARY_TYPES["BOOL"];
              currentTypeName = "BOOL";
            } else {
              currentType = undefined;
              currentTypeName = undefined;
            }
          }
        } else if (step.kind === "subscript") {
          // Resolve array element type
          const elemType = resolveArrayElementType(currentTypeName, this.ast);
          if (elemType) {
            currentTypeName = elemType;
            currentType =
              ELEMENTARY_TYPES[elemType.toUpperCase()] ??
              ({
                typeKind: "elementary",
                name: elemType,
                sizeBits: 0,
              } as ElementaryType);
          } else {
            currentType = undefined;
            currentTypeName = undefined;
          }
          // Also resolve the index expressions
          for (const idx of step.indices) {
            this.resolveExprType(idx, scope);
          }
        } else if (step.kind === "dereference") {
          if (currentType?.typeKind === "reference") {
            currentType = (currentType as ReferenceType).referencedType;
            if (currentType.typeKind === "elementary") {
              currentTypeName = (currentType as ElementaryType).name;
            }
          } else {
            currentType = undefined;
            currentTypeName = undefined;
          }
        }
      }
    } else if (this.ast) {
      // Fallback: use legacy fieldAccess + subscripts
      // Resolve subscripts (array indexing on the base variable)
      if (expr.subscripts.length > 0 && currentTypeName) {
        for (const sub of expr.subscripts) {
          this.resolveExprType(sub, scope);
        }
        const elemType = resolveArrayElementType(currentTypeName, this.ast);
        if (elemType) {
          currentTypeName = elemType;
          currentType =
            ELEMENTARY_TYPES[elemType.toUpperCase()] ??
            ({
              typeKind: "elementary",
              name: elemType,
              sizeBits: 0,
            } as ElementaryType);
        }
      }

      // Resolve field access chain
      if (expr.fieldAccess.length > 0 && currentTypeName) {
        for (const field of expr.fieldAccess) {
          if (!currentTypeName) break;

          if (/^\d+$/.test(field)) {
            // Bit access
            currentType = ELEMENTARY_TYPES["BOOL"];
            currentTypeName = "BOOL";
          } else {
            const fieldType = resolveFieldType(
              currentTypeName,
              field,
              this.ast,
            );
            if (fieldType) {
              currentTypeName = fieldType;
              currentType =
                ELEMENTARY_TYPES[fieldType.toUpperCase()] ??
                ({
                  typeKind: "elementary",
                  name: fieldType,
                  sizeBits: 0,
                } as ElementaryType);
            } else {
              currentType = undefined;
              currentTypeName = undefined;
            }
          }
        }
      }

      // Handle dereference
      if (expr.isDereference && currentType?.typeKind === "reference") {
        currentType = (currentType as ReferenceType).referencedType;
      }
    }

    if (currentType) {
      expr.resolvedType = currentType;
    }
    return currentType;
  }

  /**
   * Infer type of a binary expression.
   */
  private inferBinaryType(
    expr: BinaryExpression,
    scope: Scope,
  ): IECType | undefined {
    const leftType = this.resolveExprType(expr.left, scope);
    const rightType = this.resolveExprType(expr.right, scope);

    if (leftType === undefined || rightType === undefined) {
      return undefined;
    }

    let type: IECType | undefined;

    // Comparison operators always return BOOL
    if (["=", "<>", "<", ">", "<=", ">="].includes(expr.operator)) {
      type = ELEMENTARY_TYPES["BOOL"];
    }
    // Logical operators return BOOL
    else if (["AND", "OR", "XOR"].includes(expr.operator)) {
      type = ELEMENTARY_TYPES["BOOL"];
    }
    // Arithmetic operators return the "wider" type
    else if (["+", "-", "*", "/", "MOD", "**"].includes(expr.operator)) {
      type = getCommonType(leftType, rightType) ?? leftType;
    } else {
      type = leftType;
    }

    if (type) expr.resolvedType = type;
    return type;
  }

  /**
   * Infer type of a unary expression.
   */
  private inferUnaryType(
    expr: UnaryExpression,
    scope: Scope,
  ): IECType | undefined {
    const operandType = this.resolveExprType(expr.operand, scope);

    if (operandType === undefined) {
      return undefined;
    }

    let type: IECType | undefined;
    if (expr.operator === "NOT") {
      // NOT preserves the operand type for bit types (NOT BYTE returns BYTE)
      type = operandType;
    } else {
      // Unary + and - preserve the operand type
      type = operandType;
    }

    if (type) expr.resolvedType = type;
    return type;
  }

  /**
   * Infer type of a function call expression.
   */
  private inferFunctionCallType(
    expr: FunctionCallExpression,
    scope: Scope,
  ): IECType | undefined {
    // Resolve argument expressions
    for (const arg of expr.arguments) {
      this.resolveExprType(arg.value, scope);
    }

    const nameUpper = expr.functionName.toUpperCase();

    // Check user-defined functions in symbol tables
    const funcSymbol = this.symbolTables.lookupFunction(expr.functionName);
    if (funcSymbol !== undefined) {
      expr.resolvedType = funcSymbol.returnType;
      return funcSymbol.returnType;
    }

    // Validate standard function argument types (after resolving args)
    this.validateFunctionCallArgs(expr, scope);

    // Check standard function registry for return type
    if (this.stdRegistry) {
      // Check conversion functions (e.g., INT_TO_REAL → REAL)
      const conv = this.stdRegistry.resolveConversion(nameUpper);
      if (conv) {
        const retType = ELEMENTARY_TYPES[conv.toType.toUpperCase()];
        if (retType) {
          expr.resolvedType = retType;
          return retType;
        }
      }

      // Check standard functions
      const desc = this.stdRegistry.lookup(nameUpper);
      if (desc) {
        // Specific return type
        if (desc.specificReturnType) {
          const retType =
            ELEMENTARY_TYPES[desc.specificReturnType.toUpperCase()];
          if (retType) {
            expr.resolvedType = retType;
            return retType;
          }
        }
        // Return matches first parameter
        if (desc.returnMatchesFirstParam && expr.arguments.length > 0) {
          const firstArgType = expr.arguments[0]!.value.resolvedType;
          if (firstArgType) {
            expr.resolvedType = firstArgType;
            return firstArgType;
          }
        }
      }
    }

    // Could be a function block invocation (treated as statement, no return)
    const fbInstance = scope.lookup(expr.functionName);
    if (fbInstance?.kind === "variable") {
      return undefined;
    }

    // Check if it's a standard function even without the registry
    // (the function might be known via the symbol table from library loading)
    const globalSymbol = this.symbolTables.globalScope.lookup(
      expr.functionName,
    );
    if (globalSymbol?.kind === "functionBlock") {
      return undefined; // FB invocation, no direct return type
    }

    // Unknown function — don't error here, the undeclared-variable pass handles this
    return undefined;
  }

  /**
   * Infer type of a method call expression (e.g., fb.method(args)).
   */
  private inferMethodCallType(
    expr: MethodCallExpression,
    scope: Scope,
  ): IECType | undefined {
    // Resolve the object expression
    const objType = this.resolveExprType(expr.object, scope);

    // Resolve argument expressions
    for (const arg of expr.arguments) {
      this.resolveExprType(arg.value, scope);
    }

    if (!objType || !this.ast) return undefined;

    // Get the type name for the object
    let objTypeName: string | undefined;
    if (objType.typeKind === "elementary") {
      objTypeName = (objType as ElementaryType).name;
    } else if (expr.object.kind === "VariableExpression") {
      const sym = scope.lookup(expr.object.name);
      if (sym?.kind === "variable") {
        objTypeName = sym.declaration?.type?.name;
      }
    }

    if (!objTypeName) return undefined;

    // Find the FB declaration and the method
    const fb = this.ast.functionBlocks.find(
      (f) => f.name.toUpperCase() === objTypeName.toUpperCase(),
    );
    if (fb) {
      const method = fb.methods.find(
        (m) => m.name.toUpperCase() === expr.methodName.toUpperCase(),
      );
      if (method?.returnType) {
        const retType =
          ELEMENTARY_TYPES[method.returnType.name.toUpperCase()] ??
          ({
            typeKind: "elementary",
            name: method.returnType.name,
            sizeBits: 0,
          } as ElementaryType);
        expr.resolvedType = retType;
        return retType;
      }
    }

    return undefined;
  }

  // ===========================================================================
  // Statement Type Validation (Sub-Phase C)
  // ===========================================================================

  /**
   * Walk statements, resolve all sub-expressions, and validate type rules.
   */
  private checkStatements(stmts: Statement[], scope: Scope): void {
    for (const stmt of stmts) {
      this.checkStatement(stmt, scope);
    }
  }

  private checkStatement(stmt: Statement, scope: Scope): void {
    switch (stmt.kind) {
      case "AssignmentStatement": {
        const targetType = this.resolveExprType(stmt.target, scope);
        const valueType = this.resolveExprType(stmt.value, scope);
        this.validateAssignment(targetType, valueType, stmt.target, stmt.value);
        break;
      }

      case "RefAssignStatement": {
        this.resolveExprType(stmt.target, scope);
        this.resolveExprType(stmt.source, scope);
        break;
      }

      case "IfStatement": {
        const condType = this.resolveExprType(stmt.condition, scope);
        this.validateCondition(condType, stmt.condition);
        this.checkStatements(stmt.thenStatements, scope);
        for (const clause of stmt.elsifClauses) {
          const clauseCondType = this.resolveExprType(clause.condition, scope);
          this.validateCondition(clauseCondType, clause.condition);
          this.checkStatements(clause.statements, scope);
        }
        this.checkStatements(stmt.elseStatements, scope);
        break;
      }

      case "CaseStatement": {
        const selectorType = this.resolveExprType(stmt.selector, scope);
        if (selectorType) {
          this.validateCaseSelector(selectorType, stmt.selector);
        }
        for (const c of stmt.cases) {
          for (const label of c.labels) {
            this.resolveExprType(label.start, scope);
            if (label.end) this.resolveExprType(label.end, scope);
          }
          this.checkStatements(c.statements, scope);
        }
        this.checkStatements(stmt.elseStatements, scope);
        break;
      }

      case "ForStatement": {
        const startType = this.resolveExprType(stmt.start, scope);
        const endType = this.resolveExprType(stmt.end, scope);
        if (stmt.step) this.resolveExprType(stmt.step, scope);

        // Validate control variable type
        const controlSym = scope.lookup(stmt.controlVariable);
        if (
          controlSym?.kind === "variable" ||
          controlSym?.kind === "constant"
        ) {
          const ctrlType = controlSym.type;
          if (ctrlType && !_isTypeInCategory(ctrlType, "ANY_INT")) {
            this.addError(
              `FOR control variable '${stmt.controlVariable}' must be an integer type, got ${typeNameUtil(ctrlType)}`,
              stmt.sourceSpan.startLine,
              stmt.sourceSpan.startCol,
              stmt.sourceSpan.file,
            );
          }
          // Validate start/end compatibility with control variable
          // Use warnings instead of errors — CODESYS is lenient with FOR bounds
          if (
            ctrlType &&
            startType &&
            !this.isUntypedNumericLiteral(stmt.start)
          ) {
            if (
              ctrlType.typeKind === "elementary" &&
              startType.typeKind === "elementary" &&
              !_isAssignable(ctrlType, startType)
            ) {
              this.addWarning(
                `FOR start value type ${typeNameUtil(startType)} is not compatible with control variable type ${typeNameUtil(ctrlType)}`,
                stmt.start.sourceSpan.startLine,
                stmt.start.sourceSpan.startCol,
                stmt.start.sourceSpan.file,
              );
            }
          }
          if (ctrlType && endType && !this.isUntypedNumericLiteral(stmt.end)) {
            if (
              ctrlType.typeKind === "elementary" &&
              endType.typeKind === "elementary" &&
              !_isAssignable(ctrlType, endType)
            ) {
              this.addWarning(
                `FOR end value type ${typeNameUtil(endType)} is not compatible with control variable type ${typeNameUtil(ctrlType)}`,
                stmt.end.sourceSpan.startLine,
                stmt.end.sourceSpan.startCol,
                stmt.end.sourceSpan.file,
              );
            }
          }
        }
        this.checkStatements(stmt.body, scope);
        break;
      }

      case "WhileStatement": {
        const condType = this.resolveExprType(stmt.condition, scope);
        this.validateCondition(condType, stmt.condition);
        this.checkStatements(stmt.body, scope);
        break;
      }

      case "RepeatStatement": {
        this.checkStatements(stmt.body, scope);
        const condType = this.resolveExprType(stmt.condition, scope);
        this.validateCondition(condType, stmt.condition);
        break;
      }

      case "FunctionCallStatement": {
        // resolveExprType already validates function call args
        this.resolveExprType(stmt.call, scope);
        break;
      }

      case "ReturnStatement":
      case "ExitStatement":
      case "ExternalCodePragma":
        // No expressions to validate
        break;

      case "DeleteStatement": {
        this.resolveExprType(stmt.pointer, scope);
        break;
      }

      case "AssertCall": {
        // Assert calls may have conditions
        break;
      }
    }
  }

  // ===========================================================================
  // Validation Helpers
  // ===========================================================================

  private validateAssignment(
    targetType: IECType | undefined,
    valueType: IECType | undefined,
    target: Expression,
    value: Expression,
  ): void {
    if (!targetType || !valueType) return;

    // Integer/real/bool literals without explicit type prefix are polymorphic:
    // they can be assigned to any compatible numeric or bit type.
    if (this.isUntypedNumericLiteral(value)) {
      if (targetType.typeKind === "elementary") {
        // INT/REAL literals → any numeric or bit type
        if (
          _isTypeInCategory(targetType, "ANY_NUM") ||
          _isTypeInCategory(targetType, "ANY_BIT")
        ) {
          return;
        }
      }
    }

    // Check assignment compatibility
    if (!_isAssignable(targetType, valueType)) {
      // Check if it's a function name assignment (return value)
      if (target.kind === "VariableExpression") {
        const funcSym = this.symbolTables.lookupFunction(target.name);
        if (funcSym) return; // Function return assignment
      }

      // Allow reference/pointer assignments to non-reference types (CODESYS pattern)
      if (
        valueType.typeKind === "reference" ||
        targetType.typeKind === "reference"
      ) {
        return;
      }

      // For elementary types, check if this is narrowing (warning) vs truly incompatible (error)
      if (
        targetType.typeKind === "elementary" &&
        valueType.typeKind === "elementary"
      ) {
        const tName = (targetType as ElementaryType).name;
        const vName = (valueType as ElementaryType).name;

        // Skip validation for user-defined type aliases that we can't resolve
        if (!ELEMENTARY_TYPES[tName] || !ELEMENTARY_TYPES[vName]) {
          return;
        }

        // Narrowing conversions are warnings, not errors
        if (isNarrowingConversion(tName, vName)) {
          this.addWarning(
            `Implicit narrowing conversion from ${vName} to ${tName}`,
            value.sourceSpan.startLine,
            value.sourceSpan.startCol,
            value.sourceSpan.file,
          );
          return;
        }
      }

      this.addError(
        `Cannot assign ${typeNameUtil(valueType)} to ${typeNameUtil(targetType)}`,
        value.sourceSpan.startLine,
        value.sourceSpan.startCol,
        value.sourceSpan.file,
      );
      return;
    }
  }

  /**
   * Check if an expression is an untyped numeric literal (no explicit type prefix).
   * These are polymorphic and can be assigned to any compatible numeric type.
   */
  private isUntypedNumericLiteral(expr: Expression): boolean {
    if (expr.kind !== "LiteralExpression") return false;
    // If there's an explicit type prefix (e.g., DINT#42), it's not polymorphic
    if (expr.typePrefix) return false;
    return (
      expr.literalType === "INT" ||
      expr.literalType === "REAL" ||
      expr.literalType === "BOOL"
    );
  }

  private validateCondition(
    condType: IECType | undefined,
    condExpr: Expression,
  ): void {
    if (!condType) return;

    // Conditions must be ANY_BIT (BOOL, BYTE, WORD, etc.)
    if (!_isTypeInCategory(condType, "ANY_BIT")) {
      this.addError(
        `Condition must be a boolean or bit type, got ${typeNameUtil(condType)}`,
        condExpr.sourceSpan.startLine,
        condExpr.sourceSpan.startCol,
        condExpr.sourceSpan.file,
      );
    }
  }

  private validateCaseSelector(
    selectorType: IECType,
    selectorExpr: Expression,
  ): void {
    // CASE selector must be ANY_INT, ANY_BIT, or enum (IEC 61131-3: ordinal types)
    if (
      !_isTypeInCategory(selectorType, "ANY_INT") &&
      !_isTypeInCategory(selectorType, "ANY_BIT") &&
      selectorType.typeKind !== "enum"
    ) {
      this.addError(
        `CASE selector must be an integer, bit, or enum type, got ${typeNameUtil(selectorType)}`,
        selectorExpr.sourceSpan.startLine,
        selectorExpr.sourceSpan.startCol,
        selectorExpr.sourceSpan.file,
      );
    }
  }

  private validateFunctionCallArgs(
    expr: FunctionCallExpression,
    _scope: Scope,
  ): void {
    if (!this.stdRegistry) return;

    const nameUpper = expr.functionName.toUpperCase();
    const desc = this.stdRegistry.lookup(nameUpper);
    if (!desc) return; // User-defined or unknown — skip constraint checking

    // Validate argument types against parameter constraints
    for (let i = 0; i < expr.arguments.length && i < desc.params.length; i++) {
      const arg = expr.arguments[i]!;
      const param = desc.params[i]!;
      const argType = arg.value.resolvedType;

      if (!argType || argType.typeKind !== "elementary") continue;

      const argTypeName = (argType as ElementaryType).name;

      // Check specific type constraint
      if (param.constraint === "specific" && param.specificType) {
        const specUpper = param.specificType.toUpperCase();
        if (argTypeName.toUpperCase() !== specUpper) {
          const specType = ELEMENTARY_TYPES[specUpper];
          // Allow implicit widening to the specific type
          if (specType && !_isAssignable(specType, argType)) {
            // Check if it's a narrowing (warning) vs truly incompatible (error)
            if (specType && isNarrowingConversion(specUpper, argTypeName)) {
              this.addWarning(
                `Argument '${param.name}' of '${nameUpper}' expects ${param.specificType}, got ${argTypeName} (narrowing)`,
                arg.value.sourceSpan.startLine,
                arg.value.sourceSpan.startCol,
                arg.value.sourceSpan.file,
              );
            } else {
              this.addError(
                `Argument '${param.name}' of '${nameUpper}' expects ${param.specificType}, got ${argTypeName}`,
                arg.value.sourceSpan.startLine,
                arg.value.sourceSpan.startCol,
                arg.value.sourceSpan.file,
              );
            }
          }
        }
      } else if (!matchesConstraint(argTypeName, param.constraint)) {
        // Allow implicit widening: INT→REAL for ANY_REAL constraints, etc.
        // Check if the argument type can be implicitly widened to a type in the constraint category
        const canWiden = this.canWidenToConstraint(
          argTypeName,
          param.constraint,
        );
        if (!canWiden) {
          this.addError(
            `Argument '${param.name}' of '${nameUpper}' expects ${param.constraint}, got ${argTypeName}`,
            arg.value.sourceSpan.startLine,
            arg.value.sourceSpan.startCol,
            arg.value.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Check if a type can be implicitly widened to match a constraint.
   * E.g., INT can match ANY_REAL because INT→REAL is a valid widening.
   */
  private canWidenToConstraint(
    typeName: string,
    constraint: import("./std-function-registry.js").TypeConstraint,
  ): boolean {
    const upper = typeName.toUpperCase();
    // ANY_REAL: integer types can be implicitly promoted to REAL
    if (constraint === "ANY_REAL") {
      const elemType: ElementaryType = ELEMENTARY_TYPES[upper] ?? {
        typeKind: "elementary" as const,
        name: upper,
        sizeBits: 0,
      };
      return _isTypeInCategory(elemType, "ANY_INT");
    }
    // ANY_NUM: bit types can be promoted to numeric
    if (constraint === "ANY_NUM") {
      const elemType: ElementaryType = ELEMENTARY_TYPES[upper] ?? {
        typeKind: "elementary" as const,
        name: upper,
        sizeBits: 0,
      };
      return _isTypeInCategory(elemType, "ANY_BIT");
    }
    // ANY_BIT: integer types can be used in bit operations (CODESYS compat)
    if (constraint === "ANY_BIT") {
      const elemType: ElementaryType = ELEMENTARY_TYPES[upper] ?? {
        typeKind: "elementary" as const,
        name: upper,
        sizeBits: 0,
      };
      return _isTypeInCategory(elemType, "ANY_INT");
    }
    return false;
  }

  // ===========================================================================
  // Public API (backward compatible)
  // ===========================================================================

  /**
   * Check if a type belongs to a category.
   * Delegates to type-utils.
   */
  isTypeInCategory(
    type: IECType,
    category: import("./type-utils.js").TypeCategory,
  ): boolean {
    return _isTypeInCategory(type, category);
  }

  /**
   * Check if two types are compatible for assignment.
   * Delegates to type-utils isAssignable.
   */
  areTypesCompatible(target: IECType, source: IECType): boolean {
    return _isAssignable(target, source);
  }

  // ===========================================================================
  // Error/Warning Helpers
  // ===========================================================================

  /**
   * Add an error message.
   */
  private addError(
    message: string,
    line: number,
    column: number,
    file?: string,
  ): void {
    this.errors.push({
      message,
      line,
      column,
      severity: "error",
      ...(file ? { file } : {}),
    });
  }

  /**
   * Add a warning message.
   */
  protected addWarning(
    message: string,
    line: number,
    column: number,
    file?: string,
  ): void {
    this.warnings.push({
      message,
      line,
      column,
      severity: "warning",
      ...(file ? { file } : {}),
    });
  }
}
