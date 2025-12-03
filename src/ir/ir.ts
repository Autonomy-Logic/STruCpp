/**
 * STruC++ Intermediate Representation
 *
 * Defines the IR used between semantic analysis and code generation.
 * The IR is a simplified, statement-level representation that maintains
 * 1:1 correspondence with ST source lines where possible.
 *
 * Note: The IR layer is optional for Phase 1. We can generate C++ directly
 * from the typed AST. The IR becomes useful in later phases for handling
 * complex v3 features (references, namespaces) that don't map 1:1 to C++.
 */

import type { SourceSpan } from '../types.js';
import type { IECType } from '../frontend/ast.js';

// =============================================================================
// Base Types
// =============================================================================

/**
 * Base interface for all IR nodes.
 */
export interface IRNode {
  /** Node type discriminator */
  readonly irKind: string;

  /** Source location span for line mapping */
  sourceSpan: SourceSpan;
}

// =============================================================================
// IR Expressions
// =============================================================================

/**
 * IR variable reference.
 */
export interface IRVariable extends IRNode {
  irKind: 'Variable';
  name: string;
  type: IECType;
  isTemporary: boolean;
}

/**
 * IR literal value.
 */
export interface IRLiteral extends IRNode {
  irKind: 'Literal';
  type: IECType;
  value: string | number | boolean;
}

/**
 * IR binary operation.
 */
export interface IRBinaryOp extends IRNode {
  irKind: 'BinaryOp';
  operator: string;
  left: IRExpression;
  right: IRExpression;
  resultType: IECType;
}

/**
 * IR unary operation.
 */
export interface IRUnaryOp extends IRNode {
  irKind: 'UnaryOp';
  operator: string;
  operand: IRExpression;
  resultType: IECType;
}

/**
 * IR array access.
 */
export interface IRArrayAccess extends IRNode {
  irKind: 'ArrayAccess';
  array: IRExpression;
  indices: IRExpression[];
  elementType: IECType;
}

/**
 * IR field access.
 */
export interface IRFieldAccess extends IRNode {
  irKind: 'FieldAccess';
  object: IRExpression;
  fieldName: string;
  fieldType: IECType;
}

/**
 * IR dereference operation (for references).
 */
export interface IRDereference extends IRNode {
  irKind: 'Dereference';
  reference: IRExpression;
  resultType: IECType;
}

/**
 * Union of all IR expression types.
 */
export type IRExpression =
  | IRVariable
  | IRLiteral
  | IRBinaryOp
  | IRUnaryOp
  | IRArrayAccess
  | IRFieldAccess
  | IRDereference;

// =============================================================================
// IR Statements
// =============================================================================

/**
 * IR assignment statement.
 */
export interface IRAssignment extends IRNode {
  irKind: 'Assignment';
  target: IRExpression;
  value: IRExpression;
}

/**
 * IR function call.
 */
export interface IRFunctionCall extends IRNode {
  irKind: 'FunctionCall';
  functionName: string;
  arguments: IRExpression[];
  resultVar?: IRVariable | undefined;
}

/**
 * IR function block call.
 */
export interface IRFBCall extends IRNode {
  irKind: 'FBCall';
  fbInstance: IRVariable;
  fbTypeName: string;
  inputs: Map<string, IRExpression>;
  outputs: Map<string, IRVariable>;
}

/**
 * IR if statement.
 */
export interface IRIfStatement extends IRNode {
  irKind: 'IfStatement';
  condition: IRExpression;
  thenBlock: IRStatement[];
  elsifBlocks: Array<{ condition: IRExpression; block: IRStatement[] }>;
  elseBlock: IRStatement[];
}

/**
 * IR case statement.
 */
export interface IRCaseStatement extends IRNode {
  irKind: 'CaseStatement';
  selector: IRExpression;
  cases: Array<{
    labels: Array<{ start: IRExpression; end?: IRExpression }>;
    block: IRStatement[];
  }>;
  elseBlock: IRStatement[];
}

/**
 * IR for loop.
 */
export interface IRForLoop extends IRNode {
  irKind: 'ForLoop';
  controlVar: IRVariable;
  start: IRExpression;
  end: IRExpression;
  step?: IRExpression | undefined;
  body: IRStatement[];
}

/**
 * IR while loop.
 */
export interface IRWhileLoop extends IRNode {
  irKind: 'WhileLoop';
  condition: IRExpression;
  body: IRStatement[];
}

/**
 * IR repeat loop.
 */
export interface IRRepeatLoop extends IRNode {
  irKind: 'RepeatLoop';
  body: IRStatement[];
  condition: IRExpression;
}

/**
 * IR exit statement (break from loop).
 */
export interface IRExitStatement extends IRNode {
  irKind: 'ExitStatement';
}

/**
 * IR return statement.
 */
export interface IRReturnStatement extends IRNode {
  irKind: 'ReturnStatement';
  value?: IRExpression;
}

/**
 * Union of all IR statement types.
 */
export type IRStatement =
  | IRAssignment
  | IRFunctionCall
  | IRFBCall
  | IRIfStatement
  | IRCaseStatement
  | IRForLoop
  | IRWhileLoop
  | IRRepeatLoop
  | IRExitStatement
  | IRReturnStatement;

// =============================================================================
// IR Program Units
// =============================================================================

/**
 * IR function definition.
 */
export interface IRFunction extends IRNode {
  irKind: 'Function';
  name: string;
  returnType: IECType;
  parameters: IRVariable[];
  locals: IRVariable[];
  body: IRStatement[];
}

/**
 * IR function block definition.
 */
export interface IRFunctionBlock extends IRNode {
  irKind: 'FunctionBlock';
  name: string;
  inputs: IRVariable[];
  outputs: IRVariable[];
  inouts: IRVariable[];
  locals: IRVariable[];
  body: IRStatement[];
}

/**
 * IR program definition.
 */
export interface IRProgram extends IRNode {
  irKind: 'Program';
  name: string;
  variables: IRVariable[];
  body: IRStatement[];
}

/**
 * IR compilation unit.
 */
export interface IRCompilationUnit extends IRNode {
  irKind: 'CompilationUnit';
  functions: IRFunction[];
  functionBlocks: IRFunctionBlock[];
  programs: IRProgram[];
}

// =============================================================================
// IR Builder
// =============================================================================

/**
 * Builder for creating IR nodes.
 * Provides factory methods for constructing IR from the typed AST.
 */
export class IRBuilder {
  private tempCounter = 0;

  /**
   * Create a temporary variable.
   */
  createTemp(type: IECType, sourceSpan: SourceSpan): IRVariable {
    return {
      irKind: 'Variable',
      name: `__temp_${this.tempCounter++}`,
      type,
      isTemporary: true,
      sourceSpan,
    };
  }

  /**
   * Create a variable reference.
   */
  createVariable(
    name: string,
    type: IECType,
    sourceSpan: SourceSpan
  ): IRVariable {
    return {
      irKind: 'Variable',
      name,
      type,
      isTemporary: false,
      sourceSpan,
    };
  }

  /**
   * Create a literal value.
   */
  createLiteral(
    value: string | number | boolean,
    type: IECType,
    sourceSpan: SourceSpan
  ): IRLiteral {
    return {
      irKind: 'Literal',
      value,
      type,
      sourceSpan,
    };
  }

  /**
   * Create a binary operation.
   */
  createBinaryOp(
    operator: string,
    left: IRExpression,
    right: IRExpression,
    resultType: IECType,
    sourceSpan: SourceSpan
  ): IRBinaryOp {
    return {
      irKind: 'BinaryOp',
      operator,
      left,
      right,
      resultType,
      sourceSpan,
    };
  }

  /**
   * Create an assignment statement.
   */
  createAssignment(
    target: IRExpression,
    value: IRExpression,
    sourceSpan: SourceSpan
  ): IRAssignment {
    return {
      irKind: 'Assignment',
      target,
      value,
      sourceSpan,
    };
  }

  /**
   * Create a function call.
   */
  createFunctionCall(
    functionName: string,
    args: IRExpression[],
    sourceSpan: SourceSpan,
    resultVar?: IRVariable
  ): IRFunctionCall {
    return {
      irKind: 'FunctionCall',
      functionName,
      arguments: args,
      resultVar,
      sourceSpan,
    };
  }

  /**
   * Create an if statement.
   */
  createIfStatement(
    condition: IRExpression,
    thenBlock: IRStatement[],
    elsifBlocks: Array<{ condition: IRExpression; block: IRStatement[] }>,
    elseBlock: IRStatement[],
    sourceSpan: SourceSpan
  ): IRIfStatement {
    return {
      irKind: 'IfStatement',
      condition,
      thenBlock,
      elsifBlocks,
      elseBlock,
      sourceSpan,
    };
  }

  /**
   * Create a for loop.
   */
  createForLoop(
    controlVar: IRVariable,
    start: IRExpression,
    end: IRExpression,
    body: IRStatement[],
    sourceSpan: SourceSpan,
    step?: IRExpression
  ): IRForLoop {
    return {
      irKind: 'ForLoop',
      controlVar,
      start,
      end,
      step,
      body,
      sourceSpan,
    };
  }

  /**
   * Reset the temporary variable counter.
   */
  resetTempCounter(): void {
    this.tempCounter = 0;
  }
}
