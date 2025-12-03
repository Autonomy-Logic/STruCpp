/**
 * STruC++ CST to AST Builder
 *
 * This module converts the Chevrotain Concrete Syntax Tree (CST) produced by
 * the parser into the Abstract Syntax Tree (AST) defined in ast.ts.
 */

import type { CstNode, IToken } from "chevrotain";
import type {
  CompilationUnit,
  ProgramDeclaration,
  FunctionDeclaration,
  FunctionBlockDeclaration,
  TypeDeclaration,
  ConfigurationDeclaration,
  ResourceDeclaration,
  TaskDeclaration,
  ProgramInstance,
  VarBlock,
  VarBlockType,
  VarDeclaration,
  TypeReference,
  Statement,
  Expression,
  LiteralExpression,
  VariableExpression,
  AssignmentStatement,
  IfStatement,
  ForStatement,
  WhileStatement,
  RepeatStatement,
  CaseStatement,
  ExitStatement,
  ReturnStatement,
  BinaryOperator,
  UnaryOperator,
} from "./ast.js";
import type { SourceSpan } from "../types.js";

// =============================================================================
// CST Node Types (from Chevrotain parser)
// =============================================================================

interface CstChildren {
  [key: string]: (CstNode | IToken)[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a source span from a token.
 */
function tokenToSourceSpan(token: IToken): SourceSpan {
  return {
    file: "",
    startLine: token.startLine ?? 0,
    endLine: token.endLine ?? 0,
    startCol: token.startColumn ?? 0,
    endCol: token.endColumn ?? 0,
  };
}

/**
 * Create a source span from a CST node.
 */
function nodeToSourceSpan(node: CstNode): SourceSpan {
  const children = node.children as CstChildren;
  let startLine = Number.MAX_SAFE_INTEGER;
  let endLine = 0;
  let startCol = Number.MAX_SAFE_INTEGER;
  let endCol = 0;

  for (const key of Object.keys(children)) {
    for (const child of children[key]) {
      if ("image" in child) {
        // It's a token
        if (child.startLine !== undefined && child.startLine < startLine) {
          startLine = child.startLine;
          startCol = child.startColumn ?? 0;
        }
        if (child.endLine !== undefined && child.endLine > endLine) {
          endLine = child.endLine;
          endCol = child.endColumn ?? 0;
        }
      }
    }
  }

  return {
    file: "",
    startLine: startLine === Number.MAX_SAFE_INTEGER ? 0 : startLine,
    endLine,
    startCol: startCol === Number.MAX_SAFE_INTEGER ? 0 : startCol,
    endCol,
  };
}

/**
 * Get the first token from a CST node children array.
 */
function getFirstToken(items: (CstNode | IToken)[] | undefined): IToken | undefined {
  if (!items || items.length === 0) return undefined;
  const first = items[0];
  if ("image" in first) return first;
  return undefined;
}

/**
 * Get the first CST node from a children array.
 */
function getFirstNode(items: (CstNode | IToken)[] | undefined): CstNode | undefined {
  if (!items || items.length === 0) return undefined;
  const first = items[0];
  if ("children" in first) return first;
  return undefined;
}

/**
 * Get all CST nodes from a children array.
 */
function getAllNodes(items: (CstNode | IToken)[] | undefined): CstNode[] {
  if (!items) return [];
  return items.filter((item): item is CstNode => "children" in item);
}

/**
 * Get all tokens from a children array.
 */
function getAllTokens(items: (CstNode | IToken)[] | undefined): IToken[] {
  if (!items) return [];
  return items.filter((item): item is IToken => "image" in item);
}

// =============================================================================
// AST Builder Class
// =============================================================================

/**
 * Builds an AST from a Chevrotain CST.
 */
export class ASTBuilder {
  /**
   * Build a CompilationUnit from the root CST node.
   */
  buildCompilationUnit(cst: CstNode): CompilationUnit {
    const children = cst.children as CstChildren;
    const programs: ProgramDeclaration[] = [];
    const functions: FunctionDeclaration[] = [];
    const functionBlocks: FunctionBlockDeclaration[] = [];
    const types: TypeDeclaration[] = [];
    const configurations: ConfigurationDeclaration[] = [];

    // Process program declarations
    for (const node of getAllNodes(children.programDeclaration)) {
      programs.push(this.buildProgramDeclaration(node));
    }

    // Process function declarations
    for (const node of getAllNodes(children.functionDeclaration)) {
      functions.push(this.buildFunctionDeclaration(node));
    }

    // Process function block declarations
    for (const node of getAllNodes(children.functionBlockDeclaration)) {
      functionBlocks.push(this.buildFunctionBlockDeclaration(node));
    }

    // Process type declarations
    for (const node of getAllNodes(children.typeDeclaration)) {
      types.push(this.buildTypeDeclaration(node));
    }

    // Process configuration declarations
    for (const node of getAllNodes(children.configurationDeclaration)) {
      configurations.push(this.buildConfigurationDeclaration(node));
    }

    return {
      kind: "CompilationUnit",
      sourceSpan: nodeToSourceSpan(cst),
      programs,
      functions,
      functionBlocks,
      types,
      configurations,
    };
  }

  /**
   * Build a ProgramDeclaration from a CST node.
   */
  buildProgramDeclaration(node: CstNode): ProgramDeclaration {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    const varBlocks: VarBlock[] = [];
    for (const varBlockNode of getAllNodes(children.varBlock)) {
      varBlocks.push(this.buildVarBlock(varBlockNode));
    }

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    return {
      kind: "ProgramDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      varBlocks,
      body,
    };
  }

  /**
   * Build a FunctionDeclaration from a CST node.
   */
  buildFunctionDeclaration(node: CstNode): FunctionDeclaration {
    const children = node.children as CstChildren;
    const identifiers = getAllTokens(children.Identifier);
    const name = identifiers[0]?.image ?? "";
    const returnTypeName = identifiers[1]?.image ?? "VOID";

    const varBlocks: VarBlock[] = [];
    for (const varBlockNode of getAllNodes(children.varBlock)) {
      varBlocks.push(this.buildVarBlock(varBlockNode));
    }

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    return {
      kind: "FunctionDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      returnType: {
        kind: "TypeReference",
        sourceSpan: identifiers[1] ? tokenToSourceSpan(identifiers[1]) : nodeToSourceSpan(node),
        name: returnTypeName,
        isReference: false,
      },
      varBlocks,
      body,
    };
  }

  /**
   * Build a FunctionBlockDeclaration from a CST node.
   */
  buildFunctionBlockDeclaration(node: CstNode): FunctionBlockDeclaration {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    const varBlocks: VarBlock[] = [];
    for (const varBlockNode of getAllNodes(children.varBlock)) {
      varBlocks.push(this.buildVarBlock(varBlockNode));
    }

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    return {
      kind: "FunctionBlockDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      varBlocks,
      body,
    };
  }

  /**
   * Build a TypeDeclaration from a CST node.
   */
  buildTypeDeclaration(node: CstNode): TypeDeclaration {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    // For Phase 2.1, we just create a simple type reference
    // Full type definition parsing will be in Phase 2.2
    return {
      kind: "TypeDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      definition: {
        kind: "TypeReference",
        sourceSpan: nodeToSourceSpan(node),
        name: "INT", // Placeholder
        isReference: false,
      },
    };
  }

  /**
   * Build a ConfigurationDeclaration from a CST node.
   */
  buildConfigurationDeclaration(node: CstNode): ConfigurationDeclaration {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    const varBlocks: VarBlock[] = [];
    for (const varBlockNode of getAllNodes(children.varBlock)) {
      varBlocks.push(this.buildVarBlock(varBlockNode));
    }

    const resources: ResourceDeclaration[] = [];
    for (const resourceNode of getAllNodes(children.resourceDeclaration)) {
      resources.push(this.buildResourceDeclaration(resourceNode));
    }

    return {
      kind: "ConfigurationDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      varBlocks,
      resources,
    };
  }

  /**
   * Build a ResourceDeclaration from a CST node.
   */
  buildResourceDeclaration(node: CstNode): ResourceDeclaration {
    const children = node.children as CstChildren;
    const identifiers = getAllTokens(children.Identifier);
    const name = identifiers[0]?.image ?? "";
    const onType = identifiers[1]?.image ?? "PLC";

    const tasks: TaskDeclaration[] = [];
    for (const taskNode of getAllNodes(children.taskDeclaration)) {
      tasks.push(this.buildTaskDeclaration(taskNode));
    }

    const programInstances: ProgramInstance[] = [];
    for (const instanceNode of getAllNodes(children.programInstance)) {
      programInstances.push(this.buildProgramInstance(instanceNode));
    }

    return {
      kind: "ResourceDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      onType,
      tasks,
      programInstances,
    };
  }

  /**
   * Build a TaskDeclaration from a CST node.
   */
  buildTaskDeclaration(node: CstNode): TaskDeclaration {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    // Parse task properties (INTERVAL, PRIORITY, etc.)
    const properties = new Map<string, Expression>();
    const propIdentifiers = getAllTokens(children.Identifier);
    const expressions = getAllNodes(children.expression);

    // Skip the first identifier (task name), then pair remaining identifiers with expressions
    for (let i = 1; i < propIdentifiers.length && i - 1 < expressions.length; i++) {
      const propName = propIdentifiers[i].image;
      const expr = this.buildExpression(expressions[i - 1]);
      if (expr) {
        properties.set(propName, expr);
      }
    }

    return {
      kind: "TaskDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      properties,
    };
  }

  /**
   * Build a ProgramInstance from a CST node.
   */
  buildProgramInstance(node: CstNode): ProgramInstance {
    const children = node.children as CstChildren;
    const identifiers = getAllTokens(children.Identifier);

    // PROGRAM instanceName WITH taskName : programType
    // or PROGRAM instanceName : programType (no task)
    const instanceName = identifiers[0]?.image ?? "";
    let taskName: string | undefined;
    let programType: string;

    if (identifiers.length >= 3) {
      // Has WITH clause
      taskName = identifiers[1]?.image;
      programType = identifiers[2]?.image ?? "";
    } else {
      // No WITH clause
      programType = identifiers[1]?.image ?? "";
    }

    return {
      kind: "ProgramInstance",
      sourceSpan: nodeToSourceSpan(node),
      instanceName,
      taskName,
      programType,
    };
  }

  /**
   * Build a VarBlock from a CST node.
   */
  buildVarBlock(node: CstNode): VarBlock {
    const children = node.children as CstChildren;

    // Determine block type from keywords
    let blockType: VarBlockType = "VAR";
    if (children.VAR_INPUT) blockType = "VAR_INPUT";
    else if (children.VAR_OUTPUT) blockType = "VAR_OUTPUT";
    else if (children.VAR_IN_OUT) blockType = "VAR_IN_OUT";
    else if (children.VAR_EXTERNAL) blockType = "VAR_EXTERNAL";
    else if (children.VAR_GLOBAL) blockType = "VAR_GLOBAL";
    else if (children.VAR_TEMP) blockType = "VAR_TEMP";

    const isConstant = !!children.CONSTANT;
    const isRetain = !!children.RETAIN;

    const declarations: VarDeclaration[] = [];
    for (const declNode of getAllNodes(children.varDeclaration)) {
      declarations.push(this.buildVarDeclaration(declNode));
    }

    return {
      kind: "VarBlock",
      sourceSpan: nodeToSourceSpan(node),
      blockType,
      isConstant,
      isRetain,
      declarations,
    };
  }

  /**
   * Build a VarDeclaration from a CST node.
   */
  buildVarDeclaration(node: CstNode): VarDeclaration {
    const children = node.children as CstChildren;
    const identifiers = getAllTokens(children.Identifier);
    const names = identifiers.map((t) => t.image);

    // Get type reference
    const typeRefNode = getFirstNode(children.typeReference);
    let type: TypeReference;
    if (typeRefNode) {
      type = this.buildTypeReference(typeRefNode);
    } else {
      // Fallback: look for type name in identifiers
      // In "x : INT", the type is the last identifier after the colon
      const typeIdentifiers = getAllTokens(children.Identifier);
      const typeName = typeIdentifiers.length > 0 ? typeIdentifiers[typeIdentifiers.length - 1].image : "INT";
      type = {
        kind: "TypeReference",
        sourceSpan: nodeToSourceSpan(node),
        name: typeName,
        isReference: false,
      };
    }

    // Get initial value if present
    let initialValue: Expression | undefined;
    const exprNode = getFirstNode(children.expression);
    if (exprNode) {
      initialValue = this.buildExpression(exprNode);
    }

    // Get address if present (AT %IX0.0)
    let address: string | undefined;
    const atToken = getFirstToken(children.AT);
    if (atToken) {
      const directVarToken = getFirstToken(children.DirectVariable);
      if (directVarToken) {
        address = directVarToken.image;
      }
    }

    return {
      kind: "VarDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      names,
      type,
      initialValue,
      address,
    };
  }

  /**
   * Build a TypeReference from a CST node.
   */
  buildTypeReference(node: CstNode): TypeReference {
    const children = node.children as CstChildren;
    const nameToken = getFirstToken(children.Identifier);
    const name = nameToken?.image ?? "INT";
    const isReference = !!children.REF_TO;

    return {
      kind: "TypeReference",
      sourceSpan: nodeToSourceSpan(node),
      name,
      isReference,
    };
  }

  /**
   * Build a Statement from a CST node.
   */
  buildStatement(node: CstNode): Statement | undefined {
    const children = node.children as CstChildren;

    // Check for different statement types
    if (children.assignmentStatement) {
      return this.buildAssignmentStatement(getFirstNode(children.assignmentStatement)!);
    }
    if (children.ifStatement) {
      return this.buildIfStatement(getFirstNode(children.ifStatement)!);
    }
    if (children.forStatement) {
      return this.buildForStatement(getFirstNode(children.forStatement)!);
    }
    if (children.whileStatement) {
      return this.buildWhileStatement(getFirstNode(children.whileStatement)!);
    }
    if (children.repeatStatement) {
      return this.buildRepeatStatement(getFirstNode(children.repeatStatement)!);
    }
    if (children.caseStatement) {
      return this.buildCaseStatement(getFirstNode(children.caseStatement)!);
    }
    if (children.EXIT) {
      return this.buildExitStatement(node);
    }
    if (children.RETURN) {
      return this.buildReturnStatement(node);
    }

    return undefined;
  }

  /**
   * Build an AssignmentStatement from a CST node.
   */
  buildAssignmentStatement(node: CstNode): AssignmentStatement {
    const children = node.children as CstChildren;
    const variableNode = getFirstNode(children.variable);
    const exprNode = getFirstNode(children.expression);

    const target = variableNode ? this.buildVariableExpression(variableNode) : this.createDummyVariable(node);
    const value = exprNode ? this.buildExpression(exprNode) : this.createDummyLiteral(node);

    return {
      kind: "AssignmentStatement",
      sourceSpan: nodeToSourceSpan(node),
      target,
      value,
    };
  }

  /**
   * Build an IfStatement from a CST node.
   */
  buildIfStatement(node: CstNode): IfStatement {
    const children = node.children as CstChildren;
    const exprNode = getFirstNode(children.expression);
    const condition = exprNode ? this.buildExpression(exprNode) : this.createDummyLiteral(node);

    const thenStatements: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) thenStatements.push(stmt);
    }

    return {
      kind: "IfStatement",
      sourceSpan: nodeToSourceSpan(node),
      condition: condition!,
      thenStatements,
      elsifClauses: [],
      elseStatements: [],
    };
  }

  /**
   * Build a ForStatement from a CST node.
   */
  buildForStatement(node: CstNode): ForStatement {
    const children = node.children as CstChildren;
    const identifiers = getAllTokens(children.Identifier);
    const controlVariable = identifiers[0]?.image ?? "i";

    const expressions = getAllNodes(children.expression);
    const start = expressions[0] ? this.buildExpression(expressions[0]) : this.createDummyLiteral(node);
    const end = expressions[1] ? this.buildExpression(expressions[1]) : this.createDummyLiteral(node);
    const step = expressions[2] ? this.buildExpression(expressions[2]) : undefined;

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    return {
      kind: "ForStatement",
      sourceSpan: nodeToSourceSpan(node),
      controlVariable,
      start: start!,
      end: end!,
      step,
      body,
    };
  }

  /**
   * Build a WhileStatement from a CST node.
   */
  buildWhileStatement(node: CstNode): WhileStatement {
    const children = node.children as CstChildren;
    const exprNode = getFirstNode(children.expression);
    const condition = exprNode ? this.buildExpression(exprNode) : this.createDummyLiteral(node);

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    return {
      kind: "WhileStatement",
      sourceSpan: nodeToSourceSpan(node),
      condition: condition!,
      body,
    };
  }

  /**
   * Build a RepeatStatement from a CST node.
   */
  buildRepeatStatement(node: CstNode): RepeatStatement {
    const children = node.children as CstChildren;
    const exprNode = getFirstNode(children.expression);
    const condition = exprNode ? this.buildExpression(exprNode) : this.createDummyLiteral(node);

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    return {
      kind: "RepeatStatement",
      sourceSpan: nodeToSourceSpan(node),
      body,
      condition: condition!,
    };
  }

  /**
   * Build a CaseStatement from a CST node.
   */
  buildCaseStatement(node: CstNode): CaseStatement {
    const children = node.children as CstChildren;
    const exprNode = getFirstNode(children.expression);
    const selector = exprNode ? this.buildExpression(exprNode) : this.createDummyLiteral(node);

    return {
      kind: "CaseStatement",
      sourceSpan: nodeToSourceSpan(node),
      selector: selector!,
      cases: [],
      elseStatements: [],
    };
  }

  /**
   * Build an ExitStatement from a CST node.
   */
  buildExitStatement(node: CstNode): ExitStatement {
    return {
      kind: "ExitStatement",
      sourceSpan: nodeToSourceSpan(node),
    };
  }

  /**
   * Build a ReturnStatement from a CST node.
   */
  buildReturnStatement(node: CstNode): ReturnStatement {
    return {
      kind: "ReturnStatement",
      sourceSpan: nodeToSourceSpan(node),
    };
  }

  /**
   * Build an Expression from a CST node.
   */
  buildExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    // Check for different expression types
    if (children.orExpression) {
      return this.buildOrExpression(getFirstNode(children.orExpression)!);
    }
    if (children.literal) {
      return this.buildLiteralExpression(getFirstNode(children.literal)!);
    }
    if (children.variable) {
      return this.buildVariableExpression(getFirstNode(children.variable)!);
    }

    // Try to build from the node itself
    return this.buildOrExpression(node);
  }

  /**
   * Build an OR expression (handles binary operators).
   */
  buildOrExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    // Check for XOR expressions
    const xorExprs = getAllNodes(children.xorExpression);
    if (xorExprs.length === 0) {
      // Try other expression types
      return this.buildXorExpression(node);
    }

    let left = this.buildXorExpression(xorExprs[0]);
    if (!left) return undefined;

    for (let i = 1; i < xorExprs.length; i++) {
      const right = this.buildXorExpression(xorExprs[i]);
      if (!right) continue;

      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: "OR" as BinaryOperator,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build an XOR expression.
   */
  buildXorExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    const andExprs = getAllNodes(children.andExpression);
    if (andExprs.length === 0) {
      return this.buildAndExpression(node);
    }

    let left = this.buildAndExpression(andExprs[0]);
    if (!left) return undefined;

    for (let i = 1; i < andExprs.length; i++) {
      const right = this.buildAndExpression(andExprs[i]);
      if (!right) continue;

      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: "XOR" as BinaryOperator,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build an AND expression.
   */
  buildAndExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    const compExprs = getAllNodes(children.comparisonExpression);
    if (compExprs.length === 0) {
      return this.buildComparisonExpression(node);
    }

    let left = this.buildComparisonExpression(compExprs[0]);
    if (!left) return undefined;

    for (let i = 1; i < compExprs.length; i++) {
      const right = this.buildComparisonExpression(compExprs[i]);
      if (!right) continue;

      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: "AND" as BinaryOperator,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build a comparison expression.
   */
  buildComparisonExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    const addExprs = getAllNodes(children.addExpression);
    if (addExprs.length === 0) {
      return this.buildAddExpression(node);
    }

    let left = this.buildAddExpression(addExprs[0]);
    if (!left) return undefined;

    // Get comparison operators
    const operators: BinaryOperator[] = [];
    if (children.Equal) operators.push("=");
    if (children.NotEqual) operators.push("<>");
    if (children.LessThan) operators.push("<");
    if (children.GreaterThan) operators.push(">");
    if (children.LessEqual) operators.push("<=");
    if (children.GreaterEqual) operators.push(">=");

    for (let i = 1; i < addExprs.length; i++) {
      const right = this.buildAddExpression(addExprs[i]);
      if (!right) continue;

      const op = operators[i - 1] ?? "=";
      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: op,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build an addition expression.
   */
  buildAddExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    const mulExprs = getAllNodes(children.mulExpression);
    if (mulExprs.length === 0) {
      return this.buildMulExpression(node);
    }

    let left = this.buildMulExpression(mulExprs[0]);
    if (!left) return undefined;

    // Get add/sub operators
    const plusTokens = getAllTokens(children.Plus);
    const minusTokens = getAllTokens(children.Minus);

    for (let i = 1; i < mulExprs.length; i++) {
      const right = this.buildMulExpression(mulExprs[i]);
      if (!right) continue;

      // Determine operator based on token positions
      const op: BinaryOperator = plusTokens.length > minusTokens.length ? "+" : "-";
      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: op,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build a multiplication expression.
   */
  buildMulExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    const powerExprs = getAllNodes(children.powerExpression);
    if (powerExprs.length === 0) {
      return this.buildPowerExpression(node);
    }

    let left = this.buildPowerExpression(powerExprs[0]);
    if (!left) return undefined;

    for (let i = 1; i < powerExprs.length; i++) {
      const right = this.buildPowerExpression(powerExprs[i]);
      if (!right) continue;

      // Determine operator
      let op: BinaryOperator = "*";
      if (children.Divide) op = "/";
      if (children.MOD) op = "MOD";

      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: op,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build a power expression.
   */
  buildPowerExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    const unaryExprs = getAllNodes(children.unaryExpression);
    if (unaryExprs.length === 0) {
      return this.buildUnaryExpression(node);
    }

    let left = this.buildUnaryExpression(unaryExprs[0]);
    if (!left) return undefined;

    for (let i = 1; i < unaryExprs.length; i++) {
      const right = this.buildUnaryExpression(unaryExprs[i]);
      if (!right) continue;

      left = {
        kind: "BinaryExpression",
        sourceSpan: nodeToSourceSpan(node),
        operator: "**" as BinaryOperator,
        left,
        right,
      };
    }

    return left;
  }

  /**
   * Build a unary expression.
   */
  buildUnaryExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    // Check for unary operators
    if (children.NOT) {
      const operand = this.buildPrimaryExpression(node);
      if (operand) {
        return {
          kind: "UnaryExpression",
          sourceSpan: nodeToSourceSpan(node),
          operator: "NOT" as UnaryOperator,
          operand,
        };
      }
    }

    if (children.Minus) {
      const operand = this.buildPrimaryExpression(node);
      if (operand) {
        return {
          kind: "UnaryExpression",
          sourceSpan: nodeToSourceSpan(node),
          operator: "-" as UnaryOperator,
          operand,
        };
      }
    }

    return this.buildPrimaryExpression(node);
  }

  /**
   * Build a primary expression.
   */
  buildPrimaryExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    // Check for literal
    if (children.literal) {
      return this.buildLiteralExpression(getFirstNode(children.literal)!);
    }

    // Check for variable
    if (children.variable) {
      return this.buildVariableExpression(getFirstNode(children.variable)!);
    }

    // Check for parenthesized expression
    if (children.expression) {
      return this.buildExpression(getFirstNode(children.expression)!);
    }

    // Check for primary expression
    if (children.primaryExpression) {
      return this.buildPrimaryExpression(getFirstNode(children.primaryExpression)!);
    }

    // Try to extract a literal or variable directly
    return this.tryBuildDirectExpression(node);
  }

  /**
   * Try to build an expression directly from tokens.
   */
  tryBuildDirectExpression(node: CstNode): Expression | undefined {
    const children = node.children as CstChildren;

    // Check for integer literal
    if (children.IntegerLiteral) {
      const token = getFirstToken(children.IntegerLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "INT",
        value: parseInt(token.image, 10),
        rawValue: token.image,
      };
    }

    // Check for real literal
    if (children.RealLiteral) {
      const token = getFirstToken(children.RealLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "REAL",
        value: parseFloat(token.image),
        rawValue: token.image,
      };
    }

    // Check for boolean literals
    if (children.TRUE) {
      const token = getFirstToken(children.TRUE)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "BOOL",
        value: true,
        rawValue: "TRUE",
      };
    }

    if (children.FALSE) {
      const token = getFirstToken(children.FALSE)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "BOOL",
        value: false,
        rawValue: "FALSE",
      };
    }

    // Check for time literal
    if (children.TimeLiteral) {
      const token = getFirstToken(children.TimeLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "TIME",
        value: token.image,
        rawValue: token.image,
      };
    }

    // Check for identifier (variable reference)
    if (children.Identifier) {
      const token = getFirstToken(children.Identifier)!;
      return {
        kind: "VariableExpression",
        sourceSpan: tokenToSourceSpan(token),
        name: token.image,
        subscripts: [],
        fieldAccess: [],
        isDereference: false,
      };
    }

    return undefined;
  }

  /**
   * Build a LiteralExpression from a CST node.
   */
  buildLiteralExpression(node: CstNode): LiteralExpression {
    const children = node.children as CstChildren;

    // Check for different literal types
    if (children.IntegerLiteral) {
      const token = getFirstToken(children.IntegerLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "INT",
        value: parseInt(token.image, 10),
        rawValue: token.image,
      };
    }

    if (children.RealLiteral) {
      const token = getFirstToken(children.RealLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "REAL",
        value: parseFloat(token.image),
        rawValue: token.image,
      };
    }

    if (children.TRUE) {
      const token = getFirstToken(children.TRUE)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "BOOL",
        value: true,
        rawValue: "TRUE",
      };
    }

    if (children.FALSE) {
      const token = getFirstToken(children.FALSE)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "BOOL",
        value: false,
        rawValue: "FALSE",
      };
    }

    if (children.StringLiteral) {
      const token = getFirstToken(children.StringLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "STRING",
        value: token.image,
        rawValue: token.image,
      };
    }

    if (children.TimeLiteral) {
      const token = getFirstToken(children.TimeLiteral)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "TIME",
        value: token.image,
        rawValue: token.image,
      };
    }

    // Default fallback
    return {
      kind: "LiteralExpression",
      sourceSpan: nodeToSourceSpan(node),
      literalType: "INT",
      value: 0,
      rawValue: "0",
    };
  }

  /**
   * Build a VariableExpression from a CST node.
   */
  buildVariableExpression(node: CstNode): VariableExpression {
    const children = node.children as CstChildren;
    const nameToken = getFirstToken(children.Identifier);
    const name = nameToken?.image ?? "";

    // TODO: Handle subscripts and field access in Phase 3+
    return {
      kind: "VariableExpression",
      sourceSpan: nodeToSourceSpan(node),
      name,
      subscripts: [],
      fieldAccess: [],
      isDereference: false,
    };
  }

  /**
   * Create a dummy variable expression for error recovery.
   */
  private createDummyVariable(node: CstNode): VariableExpression {
    return {
      kind: "VariableExpression",
      sourceSpan: nodeToSourceSpan(node),
      name: "_dummy",
      subscripts: [],
      fieldAccess: [],
      isDereference: false,
    };
  }

  /**
   * Create a dummy literal expression for error recovery.
   */
  private createDummyLiteral(node: CstNode): LiteralExpression {
    return {
      kind: "LiteralExpression",
      sourceSpan: nodeToSourceSpan(node),
      literalType: "INT",
      value: 0,
      rawValue: "0",
    };
  }
}

/**
 * Build an AST from a CST.
 * Convenience function that creates a builder and builds the AST.
 */
export function buildAST(cst: CstNode): CompilationUnit {
  const builder = new ASTBuilder();
  return builder.buildCompilationUnit(cst);
}
