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
  TypeDefinition,
  StructDefinition,
  EnumDefinition,
  EnumMember,
  ArrayDefinition,
  ArrayDimension,
  SubrangeDefinition,
  ConfigurationDeclaration,
  ResourceDeclaration,
  TaskDeclaration,
  ProgramInstance,
  VarBlock,
  VarBlockType,
  VarDeclaration,
  TypeReference,
  ReferenceKind,
  Statement,
  Expression,
  LiteralExpression,
  VariableExpression,
  AssignmentStatement,
  RefAssignStatement,
  RefExpression,
  DrefExpression,
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
    const childArray = children[key];
    if (!childArray) continue;
    for (const child of childArray) {
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
function getFirstToken(
  items: (CstNode | IToken)[] | undefined,
): IToken | undefined {
  if (!items || items.length === 0) return undefined;
  const first = items[0];
  if (first && "image" in first) return first;
  return undefined;
}

/**
 * Get the first CST node from a children array.
 */
function getFirstNode(
  items: (CstNode | IToken)[] | undefined,
): CstNode | undefined {
  if (!items || items.length === 0) return undefined;
  const first = items[0];
  if (first && "children" in first) return first;
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

    // Process type declarations (TYPE...END_TYPE blocks can contain multiple types)
    for (const node of getAllNodes(children.typeDeclaration)) {
      types.push(...this.buildTypeDeclarationBlock(node));
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
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    // Get return type from the dataType subrule
    const dataTypeNode = getFirstNode(children.dataType);
    let returnType: TypeReference;
    if (dataTypeNode) {
      returnType = this.buildTypeReference(dataTypeNode);
    } else {
      // Fallback to VOID if no return type specified
      returnType = {
        kind: "TypeReference",
        sourceSpan: nodeToSourceSpan(node),
        name: "VOID",
        isReference: false,
        referenceKind: "none",
      };
    }

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
      returnType,
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
   * Build TypeDeclarations from a TYPE...END_TYPE block CST node.
   * A single TYPE block can contain multiple type declarations.
   */
  buildTypeDeclarationBlock(node: CstNode): TypeDeclaration[] {
    const children = node.children as CstChildren;
    const types: TypeDeclaration[] = [];

    for (const singleTypeNode of getAllNodes(children.singleTypeDeclaration)) {
      types.push(this.buildSingleTypeDeclaration(singleTypeNode));
    }

    return types;
  }

  /**
   * Build a single TypeDeclaration from a singleTypeDeclaration CST node.
   */
  buildSingleTypeDeclaration(node: CstNode): TypeDeclaration {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    const definition = this.buildTypeDefinition(node);

    return {
      kind: "TypeDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      name,
      definition,
    };
  }

  /**
   * Build a TypeDefinition from a singleTypeDeclaration CST node.
   * Handles struct, enum (simple or typed), array, subrange, and alias types.
   */
  buildTypeDefinition(node: CstNode): TypeDefinition {
    const children = node.children as CstChildren;

    // Check for struct type
    const structNode = getFirstNode(children.structType);
    if (structNode) {
      return this.buildStructDefinition(structNode);
    }

    // Check for simple enum type: (RED, YELLOW, GREEN)
    const simpleEnumNode = getFirstNode(children.simpleEnumType);
    if (simpleEnumNode) {
      return this.buildSimpleEnumDefinition(simpleEnumNode);
    }

    // Check for array type
    const arrayNode = getFirstNode(children.arrayType);
    if (arrayNode) {
      return this.buildArrayDefinition(arrayNode);
    }

    // Check for typed enum, subrange, or alias
    const typedEnumOrSubrangeNode = getFirstNode(
      children.typedEnumOrSubrangeOrAlias,
    );
    if (typedEnumOrSubrangeNode) {
      return this.buildTypedEnumOrSubrangeOrAlias(typedEnumOrSubrangeNode);
    }

    // Fallback to a simple type reference
    return {
      kind: "TypeReference",
      sourceSpan: nodeToSourceSpan(node),
      name: "INT",
      isReference: false,
      referenceKind: "none",
    };
  }

  /**
   * Build a StructDefinition from a structType CST node.
   */
  buildStructDefinition(node: CstNode): StructDefinition {
    const children = node.children as CstChildren;
    const fields: VarDeclaration[] = [];

    for (const varDeclNode of getAllNodes(children.varDeclaration)) {
      fields.push(this.buildVarDeclaration(varDeclNode));
    }

    return {
      kind: "StructDefinition",
      sourceSpan: nodeToSourceSpan(node),
      fields,
    };
  }

  /**
   * Build an EnumDefinition from a simpleEnumType CST node.
   * Handles: (RED, YELLOW, GREEN) or (A := 0, B := 1)
   */
  buildSimpleEnumDefinition(node: CstNode): EnumDefinition {
    const children = node.children as CstChildren;
    const members: EnumMember[] = [];

    for (const memberNode of getAllNodes(children.enumMember)) {
      members.push(this.buildEnumMember(memberNode));
    }

    // Check for default value: := DefaultValue
    let defaultValue: string | undefined;
    const identifiers = getAllTokens(children.Identifier);
    if (identifiers.length > 0) {
      defaultValue = identifiers[0]?.image;
    }

    return {
      kind: "EnumDefinition",
      sourceSpan: nodeToSourceSpan(node),
      members,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
  }

  /**
   * Build an EnumMember from an enumMember CST node.
   */
  buildEnumMember(node: CstNode): EnumMember {
    const children = node.children as CstChildren;
    const nameToken = getAllTokens(children.Identifier)[0];
    const name = nameToken?.image ?? "";

    // Check for explicit value: := expression
    let value: Expression | undefined;
    const exprNode = getFirstNode(children.expression);
    if (exprNode) {
      const expr = this.buildExpression(exprNode);
      if (expr) {
        value = expr;
      }
    }

    return {
      kind: "EnumMember",
      sourceSpan: nodeToSourceSpan(node),
      name,
      ...(value !== undefined ? { value } : {}),
    };
  }

  /**
   * Build an ArrayDefinition from an arrayType CST node.
   */
  buildArrayDefinition(node: CstNode): ArrayDefinition {
    const children = node.children as CstChildren;
    const dimensions: ArrayDimension[] = [];

    for (const dimNode of getAllNodes(children.arrayDimension)) {
      dimensions.push(this.buildArrayDimension(dimNode));
    }

    // Get element type from dataType
    const dataTypeNode = getFirstNode(children.dataType);
    const elementType: TypeReference = dataTypeNode
      ? this.buildTypeReference(dataTypeNode)
      : {
          kind: "TypeReference",
          sourceSpan: nodeToSourceSpan(node),
          name: "INT",
          isReference: false,
          referenceKind: "none",
        };

    return {
      kind: "ArrayDefinition",
      sourceSpan: nodeToSourceSpan(node),
      dimensions,
      elementType,
    };
  }

  /**
   * Build an ArrayDimension from an arrayDimension CST node.
   */
  buildArrayDimension(node: CstNode): ArrayDimension {
    const children = node.children as CstChildren;
    const expressions = getAllNodes(children.expression);

    const startExpr = expressions[0]
      ? this.buildExpression(expressions[0])
      : undefined;
    const endExpr = expressions[1]
      ? this.buildExpression(expressions[1])
      : undefined;

    const start = startExpr ?? this.createDummyLiteral(node);
    const end = endExpr ?? this.createDummyLiteral(node);

    return {
      kind: "ArrayDimension",
      sourceSpan: nodeToSourceSpan(node),
      start,
      end,
    };
  }

  /**
   * Build a TypeDefinition from a typedEnumOrSubrangeOrAlias CST node.
   * Handles:
   * - Typed enum: INT (IDLE := 0, RUNNING := 1)
   * - Subrange: INT(0..100)
   * - Alias: INT
   */
  buildTypedEnumOrSubrangeOrAlias(node: CstNode): TypeDefinition {
    const children = node.children as CstChildren;

    // Get the base type
    const dataTypeNode = getFirstNode(children.dataType);
    const baseType: TypeReference = dataTypeNode
      ? this.buildTypeReference(dataTypeNode)
      : {
          kind: "TypeReference",
          sourceSpan: nodeToSourceSpan(node),
          name: "INT",
          isReference: false,
          referenceKind: "none",
        };

    // Check for subrange bounds
    const subrangeBoundsNode = getFirstNode(children.subrangeBounds);
    if (subrangeBoundsNode) {
      return this.buildSubrangeDefinition(subrangeBoundsNode, baseType);
    }

    // Check for typed enum members
    const enumMemberNodes = getAllNodes(children.enumMember);
    if (enumMemberNodes.length > 0) {
      const members: EnumMember[] = [];
      for (const memberNode of enumMemberNodes) {
        members.push(this.buildEnumMember(memberNode));
      }

      return {
        kind: "EnumDefinition",
        sourceSpan: nodeToSourceSpan(node),
        baseType,
        members,
      };
    }

    // Simple alias - just return the type reference
    return baseType;
  }

  /**
   * Build a SubrangeDefinition from a subrangeBounds CST node.
   */
  buildSubrangeDefinition(
    node: CstNode,
    baseType: TypeReference,
  ): SubrangeDefinition {
    const children = node.children as CstChildren;
    const expressions = getAllNodes(children.expression);

    const lowerExpr = expressions[0]
      ? this.buildExpression(expressions[0])
      : undefined;
    const upperExpr = expressions[1]
      ? this.buildExpression(expressions[1])
      : undefined;

    const lowerBound = lowerExpr ?? this.createDummyLiteral(node);
    const upperBound = upperExpr ?? this.createDummyLiteral(node);

    return {
      kind: "SubrangeDefinition",
      sourceSpan: nodeToSourceSpan(node),
      baseType,
      lowerBound,
      upperBound,
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
    for (
      let i = 1;
      i < propIdentifiers.length && i - 1 < expressions.length;
      i++
    ) {
      const propToken = propIdentifiers[i];
      const exprNode = expressions[i - 1];
      if (propToken && exprNode) {
        const propName = propToken.image;
        const expr = this.buildExpression(exprNode);
        if (expr) {
          properties.set(propName, expr);
        }
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

    // Use conditional spreading for optional taskName to comply with exactOptionalPropertyTypes
    return {
      kind: "ProgramInstance",
      sourceSpan: nodeToSourceSpan(node),
      instanceName,
      programType,
      ...(taskName !== undefined ? { taskName } : {}),
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

    // Get type reference from the dataType subrule
    const dataTypeNode = getFirstNode(children.dataType);
    let type: TypeReference;
    if (dataTypeNode) {
      type = this.buildTypeReference(dataTypeNode);
    } else {
      // Fallback: default to INT if no type found
      type = {
        kind: "TypeReference",
        sourceSpan: nodeToSourceSpan(node),
        name: "INT",
        isReference: false,
        referenceKind: "none",
      };
    }

    // Get initial value if present
    let initialValue: Expression | undefined;
    const exprNode = getFirstNode(children.expression);
    if (exprNode) {
      const expr = this.buildExpression(exprNode);
      if (expr) {
        initialValue = expr;
      }
    }

    // Get address if present (AT %IX0.0)
    let address: string | undefined;
    const atToken = getFirstToken(children.AT);
    if (atToken) {
      const directAddrToken = getFirstToken(children.DirectAddress);
      if (directAddrToken) {
        address = directAddrToken.image;
      }
    }

    // Use conditional spreading for optional properties to comply with exactOptionalPropertyTypes
    return {
      kind: "VarDeclaration",
      sourceSpan: nodeToSourceSpan(node),
      names,
      type,
      ...(initialValue !== undefined ? { initialValue } : {}),
      ...(address !== undefined ? { address } : {}),
    };
  }

  /**
   * Build a TypeReference from a CST node.
   */
  buildTypeReference(node: CstNode): TypeReference {
    const children = node.children as CstChildren;
    const nameToken = getFirstToken(children.Identifier);
    const name = nameToken?.image ?? "INT";
    const isRefTo = !!children.REF_TO;
    const isReferenceTo = !!children.REFERENCE_TO;
    const isReference = isRefTo || isReferenceTo;

    let referenceKind: ReferenceKind = "none";
    if (isRefTo) {
      referenceKind = "ref_to";
    } else if (isReferenceTo) {
      referenceKind = "reference_to";
    }

    return {
      kind: "TypeReference",
      sourceSpan: nodeToSourceSpan(node),
      name,
      isReference,
      referenceKind,
    };
  }

  /**
   * Build a Statement from a CST node.
   */
  buildStatement(node: CstNode): Statement | undefined {
    const children = node.children as CstChildren;

    // Check for different statement types
    if (children.refAssignStatement) {
      return this.buildRefAssignStatement(
        getFirstNode(children.refAssignStatement)!,
      );
    }
    if (children.assignmentStatement) {
      return this.buildAssignmentStatement(
        getFirstNode(children.assignmentStatement)!,
      );
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
   * Build a RefAssignStatement from a CST node.
   */
  buildRefAssignStatement(node: CstNode): RefAssignStatement {
    const children = node.children as CstChildren;
    const variableNodes = getAllNodes(children.variable);

    const target = variableNodes[0]
      ? this.buildVariableExpression(variableNodes[0])
      : this.createDummyVariable(node);
    const source = variableNodes[1]
      ? this.buildVariableExpression(variableNodes[1])
      : this.createDummyVariable(node);

    return {
      kind: "RefAssignStatement",
      sourceSpan: nodeToSourceSpan(node),
      target,
      source,
    };
  }

  /**
   * Build an AssignmentStatement from a CST node.
   */
  buildAssignmentStatement(node: CstNode): AssignmentStatement {
    const children = node.children as CstChildren;
    const variableNode = getFirstNode(children.variable);
    const exprNode = getFirstNode(children.expression);

    const target = variableNode
      ? this.buildVariableExpression(variableNode)
      : this.createDummyVariable(node);
    const valueExpr = exprNode ? this.buildExpression(exprNode) : undefined;
    const value = valueExpr ?? this.createDummyLiteral(node);

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
    const condition = exprNode
      ? this.buildExpression(exprNode)
      : this.createDummyLiteral(node);

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
    const startExpr = expressions[0]
      ? this.buildExpression(expressions[0])
      : undefined;
    const endExpr = expressions[1]
      ? this.buildExpression(expressions[1])
      : undefined;
    const stepExpr = expressions[2]
      ? this.buildExpression(expressions[2])
      : undefined;

    const body: Statement[] = [];
    for (const stmtNode of getAllNodes(children.statement)) {
      const stmt = this.buildStatement(stmtNode);
      if (stmt) body.push(stmt);
    }

    // Use conditional spreading for optional step to comply with exactOptionalPropertyTypes
    return {
      kind: "ForStatement",
      sourceSpan: nodeToSourceSpan(node),
      controlVariable,
      start: startExpr ?? this.createDummyLiteral(node),
      end: endExpr ?? this.createDummyLiteral(node),
      body,
      ...(stepExpr !== undefined ? { step: stepExpr } : {}),
    };
  }

  /**
   * Build a WhileStatement from a CST node.
   */
  buildWhileStatement(node: CstNode): WhileStatement {
    const children = node.children as CstChildren;
    const exprNode = getFirstNode(children.expression);
    const condition = exprNode
      ? this.buildExpression(exprNode)
      : this.createDummyLiteral(node);

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
    const condition = exprNode
      ? this.buildExpression(exprNode)
      : this.createDummyLiteral(node);

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
    const selector = exprNode
      ? this.buildExpression(exprNode)
      : this.createDummyLiteral(node);

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

    const firstXorExpr = xorExprs[0];
    if (!firstXorExpr) return undefined;
    let left = this.buildXorExpression(firstXorExpr);
    if (!left) return undefined;

    for (let i = 1; i < xorExprs.length; i++) {
      const xorExpr = xorExprs[i];
      if (!xorExpr) continue;
      const right = this.buildXorExpression(xorExpr);
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

    const firstAndExpr = andExprs[0];
    if (!firstAndExpr) return undefined;
    let left = this.buildAndExpression(firstAndExpr);
    if (!left) return undefined;

    for (let i = 1; i < andExprs.length; i++) {
      const andExpr = andExprs[i];
      if (!andExpr) continue;
      const right = this.buildAndExpression(andExpr);
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

    const firstCompExpr = compExprs[0];
    if (!firstCompExpr) return undefined;
    let left = this.buildComparisonExpression(firstCompExpr);
    if (!left) return undefined;

    for (let i = 1; i < compExprs.length; i++) {
      const compExpr = compExprs[i];
      if (!compExpr) continue;
      const right = this.buildComparisonExpression(compExpr);
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

    const firstAddExpr = addExprs[0];
    if (!firstAddExpr) return undefined;
    let left = this.buildAddExpression(firstAddExpr);
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
      const addExpr = addExprs[i];
      if (!addExpr) continue;
      const right = this.buildAddExpression(addExpr);
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

    const firstMulExpr = mulExprs[0];
    if (!firstMulExpr) return undefined;
    let left = this.buildMulExpression(firstMulExpr);
    if (!left) return undefined;

    // Get add/sub operators
    const plusTokens = getAllTokens(children.Plus);
    const minusTokens = getAllTokens(children.Minus);

    for (let i = 1; i < mulExprs.length; i++) {
      const mulExpr = mulExprs[i];
      if (!mulExpr) continue;
      const right = this.buildMulExpression(mulExpr);
      if (!right) continue;

      // Determine operator based on token positions
      const op: BinaryOperator =
        plusTokens.length > minusTokens.length ? "+" : "-";
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

    const firstPowerExpr = powerExprs[0];
    if (!firstPowerExpr) return undefined;
    let left = this.buildPowerExpression(firstPowerExpr);
    if (!left) return undefined;

    for (let i = 1; i < powerExprs.length; i++) {
      const powerExpr = powerExprs[i];
      if (!powerExpr) continue;
      const right = this.buildPowerExpression(powerExpr);
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

    const firstUnaryExpr = unaryExprs[0];
    if (!firstUnaryExpr) return undefined;
    let left = this.buildUnaryExpression(firstUnaryExpr);
    if (!left) return undefined;

    for (let i = 1; i < unaryExprs.length; i++) {
      const unaryExpr = unaryExprs[i];
      if (!unaryExpr) continue;
      const right = this.buildUnaryExpression(unaryExpr);
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

    // Check for REF(variable) expression
    if (children.refExpression) {
      return this.buildRefExpression(getFirstNode(children.refExpression)!);
    }

    // Check for DREF(expression) expression
    if (children.drefExpression) {
      return this.buildDrefExpression(getFirstNode(children.drefExpression)!);
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
      return this.buildPrimaryExpression(
        getFirstNode(children.primaryExpression)!,
      );
    }

    // Try to extract a literal or variable directly
    return this.tryBuildDirectExpression(node);
  }

  /**
   * Build a RefExpression from a CST node.
   */
  buildRefExpression(node: CstNode): RefExpression {
    const children = node.children as CstChildren;
    const variableNode = getFirstNode(children.variable);
    const operand = variableNode
      ? this.buildVariableExpression(variableNode)
      : this.createDummyVariable(node);

    return {
      kind: "RefExpression",
      sourceSpan: nodeToSourceSpan(node),
      operand,
    };
  }

  /**
   * Build a DrefExpression from a CST node.
   */
  buildDrefExpression(node: CstNode): DrefExpression {
    const children = node.children as CstChildren;
    const exprNode = getFirstNode(children.expression);
    const operand = exprNode
      ? this.buildExpression(exprNode)
      : this.createDummyVariable(node);

    return {
      kind: "DrefExpression",
      sourceSpan: nodeToSourceSpan(node),
      operand: operand!,
    };
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

    if (children.NULL) {
      const token = getFirstToken(children.NULL)!;
      return {
        kind: "LiteralExpression",
        sourceSpan: tokenToSourceSpan(token),
        literalType: "NULL",
        value: "NULL",
        rawValue: "NULL",
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

    // Check for dereference operator (^)
    const isDereference = !!children.Caret;

    // Get additional field access identifiers
    const allIdentifiers = getAllTokens(children.Identifier);
    const fieldAccess: string[] = [];
    for (let i = 1; i < allIdentifiers.length; i++) {
      const token = allIdentifiers[i];
      if (token) {
        fieldAccess.push(token.image);
      }
    }

    // TODO: Handle subscripts in Phase 3+
    return {
      kind: "VariableExpression",
      sourceSpan: nodeToSourceSpan(node),
      name,
      subscripts: [],
      fieldAccess,
      isDereference,
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
