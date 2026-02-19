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
  interfaces: InterfaceDeclaration[];
  types: TypeDeclaration[];
  configurations: ConfigurationDeclaration[];
  globalVarBlocks: VarBlock[];
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
  isAbstract: boolean;
  isFinal: boolean;
  extends?: string;
  implements?: string[];
  varBlocks: VarBlock[];
  methods: MethodDeclaration[];
  properties: PropertyDeclaration[];
  body: Statement[];
}

/**
 * Visibility modifier for OOP members
 */
export type Visibility = "PUBLIC" | "PRIVATE" | "PROTECTED";

/**
 * METHOD declaration within a Function Block
 */
export interface MethodDeclaration extends ASTNode {
  kind: "MethodDeclaration";
  name: string;
  visibility: Visibility;
  isAbstract: boolean;
  isFinal: boolean;
  isOverride: boolean;
  returnType?: TypeReference;
  varBlocks: VarBlock[];
  body: Statement[];
}

/**
 * INTERFACE declaration (top-level POU)
 */
export interface InterfaceDeclaration extends ASTNode {
  kind: "InterfaceDeclaration";
  name: string;
  extends?: string[];
  methods: MethodDeclaration[];
}

/**
 * PROPERTY declaration within a Function Block
 */
export interface PropertyDeclaration extends ASTNode {
  kind: "PropertyDeclaration";
  name: string;
  type: TypeReference;
  visibility: Visibility;
  getter?: Statement[];
  setter?: Statement[];
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
  | "VAR_TEMP"
  | "VAR_INST";

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
 * For fixed bounds: start and end are set, isVariableLength is false
 * For variable-length (ARRAY[*]): isVariableLength is true, start/end are undefined
 */
export interface ArrayDimension extends ASTNode {
  kind: "ArrayDimension";
  isVariableLength: boolean;
  start?: Expression;
  end?: Expression;
}

/**
 * Reference kind for type references
 */
export type ReferenceKind = "none" | "ref_to" | "reference_to" | "pointer_to";

/**
 * Type reference (name of a type)
 */
export interface TypeReference extends ASTNode {
  kind: "TypeReference";
  name: string;
  isReference: boolean; // true for REF_TO (for backwards compat)
  referenceKind: ReferenceKind; // more specific: "none", "ref_to", or "reference_to"
  maxLength?: number | string; // For STRING(n) / WSTRING(n) parameterized length; string for constant names
  arrayDimensions?: Array<{ start: number; end: number }>; // For __INLINE_ARRAY_* types
  elementTypeName?: string; // Element type for inline arrays (e.g. "BYTE" for ARRAY[0..7] OF BYTE)
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
  | FunctionCallStatement
  | ExternalCodePragma
  | DeleteStatement
  | AssertCall;

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
  call: FunctionCallExpression | MethodCallExpression;
}

/**
 * __DELETE(pointer) statement - deallocate dynamic memory
 */
export interface DeleteStatement extends ASTNode {
  kind: "DeleteStatement";
  pointer: Expression;
}

// =============================================================================
// Pragmas
// =============================================================================

/**
 * External code pragma: {external ... }
 * Content is passed through AS-IS to generated C++ code.
 * Allows mixing Structured Text with C/C++ code.
 */
export interface ExternalCodePragma extends ASTNode {
  kind: "ExternalCodePragma";
  /** Raw C/C++ code content (AS-IS, no transformation) */
  code: string;
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
  | MethodCallExpression
  | VariableExpression
  | LiteralExpression
  | ParenthesizedExpression
  | RefExpression
  | DrefExpression
  | NewExpression
  | ArrayLiteralExpression;

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
 * Method call on an expression (for method chaining / fluent interface).
 * e.g., fb.method1(args).method2(args) → nested MethodCallExpression nodes
 */
export interface MethodCallExpression extends TypedNode {
  kind: "MethodCallExpression";
  object: Expression; // The expression to call the method on
  methodName: string;
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
  typePrefix?: string;
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

/**
 * __NEW(Type) or __NEW(Type, size) expression - allocate dynamic memory
 */
export interface NewExpression extends TypedNode {
  kind: "NewExpression";
  allocationType: TypeReference;
  arraySize?: Expression;
}

/**
 * Array literal expression (comma-separated list of values)
 * Used for inline array initializers: ARRAY := 0, 31, 59, 90;
 */
export interface ArrayLiteralExpression extends TypedNode {
  kind: "ArrayLiteralExpression";
  elements: Expression[];
}

// =============================================================================
// Test Framework Types
// =============================================================================

/**
 * Root node representing a parsed test file.
 */
export interface TestFile {
  fileName: string;
  setup?: SetupBlock;
  teardown?: TeardownBlock;
  testCases: TestCase[];
}

/**
 * SETUP block: shared initialization that runs before each TEST.
 */
export interface SetupBlock {
  varBlocks: VarBlock[];
  body: TestStatement[];
  sourceSpan: SourceSpan;
}

/**
 * TEARDOWN block: cleanup that runs after each TEST.
 */
export interface TeardownBlock {
  body: TestStatement[];
  sourceSpan: SourceSpan;
}

/**
 * A single TEST block.
 */
export interface TestCase {
  name: string;
  varBlocks: VarBlock[];
  body: TestStatement[];
  sourceSpan: SourceSpan;
}

/**
 * Assert function type
 */
export type AssertType =
  | "ASSERT_EQ"
  | "ASSERT_NEQ"
  | "ASSERT_TRUE"
  | "ASSERT_FALSE"
  | "ASSERT_GT"
  | "ASSERT_LT"
  | "ASSERT_GE"
  | "ASSERT_LE"
  | "ASSERT_NEAR";

/**
 * Assert function call within a test block.
 */
export interface AssertCall extends ASTNode {
  kind: "AssertCall";
  assertType: AssertType;
  args: Expression[];
  message?: string;
  sourceSpan: SourceSpan;
}

/**
 * MOCK instance.path; - Mock an FB instance (skip body, retain outputs).
 */
export interface MockFBStatement extends ASTNode {
  kind: "MockFBStatement";
  instancePath: string[];
  sourceSpan: SourceSpan;
}

/**
 * MOCK_FUNCTION FuncName RETURNS expression; - Mock a function with fixed return value.
 */
export interface MockFunctionStatement extends ASTNode {
  kind: "MockFunctionStatement";
  functionName: string;
  returnValue: Expression;
  sourceSpan: SourceSpan;
}

/**
 * MOCK_VERIFY_CALLED(instance.path); - Assert mocked FB was called at least once.
 */
export interface MockVerifyCalledStatement extends ASTNode {
  kind: "MockVerifyCalledStatement";
  instancePath: string[];
  sourceSpan: SourceSpan;
}

/**
 * MOCK_VERIFY_CALL_COUNT(instance.path, count); - Assert mocked FB call count.
 */
export interface MockVerifyCallCountStatement extends ASTNode {
  kind: "MockVerifyCallCountStatement";
  instancePath: string[];
  expectedCount: Expression;
  sourceSpan: SourceSpan;
}

/**
 * A statement within a test block (either a regular statement, assert call, or mock statement).
 */
/**
 * ADVANCE_TIME(duration) - Advance scan-cycle time in tests.
 */
export interface AdvanceTimeStatement extends ASTNode {
  kind: "AdvanceTimeStatement";
  duration: Expression;
  sourceSpan: SourceSpan;
}

export type TestStatement =
  | Statement
  | AssertCall
  | AdvanceTimeStatement
  | MockFBStatement
  | MockFunctionStatement
  | MockVerifyCalledStatement
  | MockVerifyCallCountStatement;

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
    interfaces: [],
    types: [],
    configurations: [],
    globalVarBlocks: [],
  };
}
