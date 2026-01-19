/**
 * STruC++ Abstract Syntax Tree Definitions
 *
 * This module defines the AST node types used throughout the compiler.
 * The AST is produced by the CST visitor from the parser output.
 */

import type { SourceSpan } from "../types.js";

// =============================================================================
// Base Types
// =============================================================================

/**
 * Base interface for all AST nodes.
 */
export interface ASTNode {
  /** Node type discriminator */
  readonly kind: string;

  /** Source location of this node */
  sourceSpan: SourceSpan;

  /** Parent node (set during tree construction) */
  parent?: ASTNode;
}

/**
 * Base interface for typed AST nodes (after semantic analysis).
 */
export interface TypedNode extends ASTNode {
  /** Resolved type after type checking */
  resolvedType?: IECType;
}

// =============================================================================
// Type System
// =============================================================================

/**
 * Base interface for IEC types.
 */
export interface IECType {
  readonly typeKind: string;
}

/**
 * Elementary type (BOOL, INT, REAL, etc.)
 */
export interface ElementaryType extends IECType {
  typeKind: "elementary";
  name: string;
  sizeBits: number;
}

/**
 * Array type
 */
export interface ArrayType extends IECType {
  typeKind: "array";
  elementType: IECType;
  dimensions: Array<{ start: number; end: number }>;
}

/**
 * Structure type
 */
export interface StructType extends IECType {
  typeKind: "struct";
  name: string;
  fields: Map<string, IECType>;
}

/**
 * Enumeration type
 */
export interface EnumType extends IECType {
  typeKind: "enum";
  name: string;
  values: string[];
}

/**
 * Reference type (REF_TO)
 */
export interface ReferenceType extends IECType {
  typeKind: "reference";
  referencedType: IECType;
  isImplicitDeref: boolean; // true for REFERENCE_TO (CODESYS), false for REF_TO
}

/**
 * Function block type
 */
export interface FunctionBlockType extends IECType {
  typeKind: "functionBlock";
  name: string;
  inputVars: Map<string, IECType>;
  outputVars: Map<string, IECType>;
  inoutVars: Map<string, IECType>;
}

// =============================================================================
// Compilation Unit
// =============================================================================

/**
 * Root node representing a complete compilation unit.
 */
export interface CompilationUnit extends ASTNode {
  kind: "CompilationUnit";
  programs: ProgramDeclaration[];
  functions: FunctionDeclaration[];
  functionBlocks: FunctionBlockDeclaration[];
  types: TypeDeclaration[];
  configurations: ConfigurationDeclaration[];
}

// =============================================================================
// Program Organization Units
// =============================================================================

/**
 * PROGRAM declaration
 */
export interface ProgramDeclaration extends ASTNode {
  kind: "ProgramDeclaration";
  name: string;
  varBlocks: VarBlock[];
  body: Statement[];
}

/**
 * FUNCTION declaration
 */
export interface FunctionDeclaration extends ASTNode {
  kind: "FunctionDeclaration";
  name: string;
  returnType: TypeReference;
  varBlocks: VarBlock[];
  body: Statement[];
}

/**
 * FUNCTION_BLOCK declaration
 */
export interface FunctionBlockDeclaration extends ASTNode {
  kind: "FunctionBlockDeclaration";
  name: string;
  varBlocks: VarBlock[];
  body: Statement[];
}

// =============================================================================
// Variable Declarations
// =============================================================================

/**
 * Variable block type
 */
export type VarBlockType =
  | "VAR"
  | "VAR_INPUT"
  | "VAR_OUTPUT"
  | "VAR_IN_OUT"
  | "VAR_EXTERNAL"
  | "VAR_GLOBAL"
  | "VAR_TEMP";

/**
 * Variable block (VAR, VAR_INPUT, etc.)
 */
export interface VarBlock extends ASTNode {
  kind: "VarBlock";
  blockType: VarBlockType;
  isConstant: boolean;
  isRetain: boolean;
  declarations: VarDeclaration[];
}

/**
 * Single variable declaration
 */
export interface VarDeclaration extends ASTNode {
  kind: "VarDeclaration";
  names: string[];
  type: TypeReference;
  initialValue?: Expression;
  address?: string;
}

// =============================================================================
// Type Declarations
// =============================================================================

/**
 * TYPE declaration block
 */
export interface TypeDeclaration extends ASTNode {
  kind: "TypeDeclaration";
  name: string;
  definition: TypeDefinition;
}

/**
 * Type definition (struct, enum, array, subrange, or alias)
 */
export type TypeDefinition =
  | StructDefinition
  | EnumDefinition
  | ArrayDefinition
  | SubrangeDefinition
  | TypeReference;

/**
 * Structure definition
 */
export interface StructDefinition extends ASTNode {
  kind: "StructDefinition";
  fields: VarDeclaration[];
}

/**
 * Enumeration member with optional explicit value
 */
export interface EnumMember extends ASTNode {
  kind: "EnumMember";
  name: string;
  value?: Expression;
}

/**
 * Enumeration definition
 * Supports both simple enums: (RED, YELLOW, GREEN)
 * and typed enums with explicit values: INT (IDLE := 0, RUNNING := 1)
 */
export interface EnumDefinition extends ASTNode {
  kind: "EnumDefinition";
  baseType?: TypeReference;
  members: EnumMember[];
  defaultValue?: string;
}

/**
 * Subrange definition
 * Restricts a base type to a range of values: INT(0..100)
 */
export interface SubrangeDefinition extends ASTNode {
  kind: "SubrangeDefinition";
  baseType: TypeReference;
  lowerBound: Expression;
  upperBound: Expression;
}

/**
 * Array definition
 */
export interface ArrayDefinition extends ASTNode {
  kind: "ArrayDefinition";
  dimensions: ArrayDimension[];
  elementType: TypeReference;
}

/**
 * Array dimension
 */
export interface ArrayDimension extends ASTNode {
  kind: "ArrayDimension";
  start: Expression;
  end: Expression;
}

/**
 * Reference kind for type references
 */
export type ReferenceKind = "none" | "ref_to" | "reference_to";

/**
 * Type reference (name of a type)
 */
export interface TypeReference extends ASTNode {
  kind: "TypeReference";
  name: string;
  isReference: boolean; // true for REF_TO (for backwards compat)
  referenceKind: ReferenceKind; // more specific: "none", "ref_to", or "reference_to"
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * CONFIGURATION declaration
 */
export interface ConfigurationDeclaration extends ASTNode {
  kind: "ConfigurationDeclaration";
  name: string;
  varBlocks: VarBlock[];
  resources: ResourceDeclaration[];
}

/**
 * RESOURCE declaration
 */
export interface ResourceDeclaration extends ASTNode {
  kind: "ResourceDeclaration";
  name: string;
  onType: string;
  tasks: TaskDeclaration[];
  programInstances: ProgramInstance[];
}

/**
 * TASK declaration
 */
export interface TaskDeclaration extends ASTNode {
  kind: "TaskDeclaration";
  name: string;
  properties: Map<string, Expression>;
}

/**
 * Program instance
 */
export interface ProgramInstance extends ASTNode {
  kind: "ProgramInstance";
  instanceName: string;
  taskName?: string;
  programType: string;
}

// =============================================================================
// Statements
// =============================================================================

/**
 * Union of all statement types
 */
export type Statement =
  | AssignmentStatement
  | RefAssignStatement
  | IfStatement
  | CaseStatement
  | ForStatement
  | WhileStatement
  | RepeatStatement
  | ExitStatement
  | ReturnStatement
  | FunctionCallStatement;

/**
 * Assignment statement
 */
export interface AssignmentStatement extends ASTNode {
  kind: "AssignmentStatement";
  target: Expression;
  value: Expression;
}

/**
 * REF= assignment statement (bind REFERENCE_TO to a variable)
 */
export interface RefAssignStatement extends ASTNode {
  kind: "RefAssignStatement";
  target: Expression;
  source: Expression;
}

/**
 * IF statement
 */
export interface IfStatement extends ASTNode {
  kind: "IfStatement";
  condition: Expression;
  thenStatements: Statement[];
  elsifClauses: ElsifClause[];
  elseStatements: Statement[];
}

/**
 * ELSIF clause
 */
export interface ElsifClause extends ASTNode {
  kind: "ElsifClause";
  condition: Expression;
  statements: Statement[];
}

/**
 * CASE statement
 */
export interface CaseStatement extends ASTNode {
  kind: "CaseStatement";
  selector: Expression;
  cases: CaseElement[];
  elseStatements: Statement[];
}

/**
 * CASE element
 */
export interface CaseElement extends ASTNode {
  kind: "CaseElement";
  labels: CaseLabel[];
  statements: Statement[];
}

/**
 * Case label (single value or range)
 */
export interface CaseLabel extends ASTNode {
  kind: "CaseLabel";
  start: Expression;
  end?: Expression;
}

/**
 * FOR statement
 */
export interface ForStatement extends ASTNode {
  kind: "ForStatement";
  controlVariable: string;
  start: Expression;
  end: Expression;
  step?: Expression;
  body: Statement[];
}

/**
 * WHILE statement
 */
export interface WhileStatement extends ASTNode {
  kind: "WhileStatement";
  condition: Expression;
  body: Statement[];
}

/**
 * REPEAT statement
 */
export interface RepeatStatement extends ASTNode {
  kind: "RepeatStatement";
  body: Statement[];
  condition: Expression;
}

/**
 * EXIT statement
 */
export interface ExitStatement extends ASTNode {
  kind: "ExitStatement";
}

/**
 * RETURN statement
 */
export interface ReturnStatement extends ASTNode {
  kind: "ReturnStatement";
}

/**
 * Function call as statement
 */
export interface FunctionCallStatement extends ASTNode {
  kind: "FunctionCallStatement";
  call: FunctionCallExpression;
}

// =============================================================================
// Expressions
// =============================================================================

/**
 * Union of all expression types
 */
export type Expression =
  | BinaryExpression
  | UnaryExpression
  | FunctionCallExpression
  | VariableExpression
  | LiteralExpression
  | ParenthesizedExpression
  | RefExpression
  | DrefExpression;

/**
 * Binary operator
 */
export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "MOD"
  | "**"
  | "AND"
  | "OR"
  | "XOR"
  | "="
  | "<>"
  | "<"
  | ">"
  | "<="
  | ">=";

/**
 * Binary expression
 */
export interface BinaryExpression extends TypedNode {
  kind: "BinaryExpression";
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

/**
 * Unary operator
 */
export type UnaryOperator = "NOT" | "-" | "+";

/**
 * Unary expression
 */
export interface UnaryExpression extends TypedNode {
  kind: "UnaryExpression";
  operator: UnaryOperator;
  operand: Expression;
}

/**
 * Function or FB call expression
 */
export interface FunctionCallExpression extends TypedNode {
  kind: "FunctionCallExpression";
  functionName: string;
  arguments: Argument[];
}

/**
 * Function argument
 */
export interface Argument extends ASTNode {
  kind: "Argument";
  name?: string;
  isOutput: boolean;
  value: Expression;
}

/**
 * Variable reference expression
 */
export interface VariableExpression extends TypedNode {
  kind: "VariableExpression";
  name: string;
  subscripts: Expression[];
  fieldAccess: string[];
  isDereference: boolean;
}

/**
 * Literal expression
 */
export interface LiteralExpression extends TypedNode {
  kind: "LiteralExpression";
  literalType: LiteralType;
  value: string | number | boolean;
  rawValue: string;
}

/**
 * Literal type
 */
export type LiteralType =
  | "BOOL"
  | "INT"
  | "REAL"
  | "STRING"
  | "WSTRING"
  | "TIME"
  | "DATE"
  | "TIME_OF_DAY"
  | "DATE_AND_TIME"
  | "NULL";

/**
 * Parenthesized expression
 */
export interface ParenthesizedExpression extends TypedNode {
  kind: "ParenthesizedExpression";
  expression: Expression;
}

/**
 * REF(variable) expression - get reference to a variable
 */
export interface RefExpression extends TypedNode {
  kind: "RefExpression";
  operand: Expression;
}

/**
 * DREF(expression) expression - explicit dereference
 */
export interface DrefExpression extends TypedNode {
  kind: "DrefExpression";
  operand: Expression;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a default source span for nodes without location info.
 */
export function createDefaultSourceSpan(): SourceSpan {
  return {
    file: "",
    startLine: 0,
    endLine: 0,
    startCol: 0,
    endCol: 0,
  };
}

/**
 * Create an empty compilation unit.
 */
export function createCompilationUnit(): CompilationUnit {
  return {
    kind: "CompilationUnit",
    sourceSpan: createDefaultSourceSpan(),
    programs: [],
    functions: [],
    functionBlocks: [],
    types: [],
    configurations: [],
  };
}
