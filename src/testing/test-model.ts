/**
 * STruC++ Test Model
 *
 * Data structures representing a parsed test file. These are populated by
 * the test parser and consumed by the test main generator.
 */

import type { VarBlock, Expression } from "../frontend/ast.js";
import type { SourceSpan } from "../types.js";

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
 * A test file containing optional SETUP/TEARDOWN and one or more test cases.
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
 * An assert function call within a test.
 */
export interface AssertCall {
  kind: "AssertCall";
  assertType: AssertType;
  args: Expression[];
  message?: string;
  sourceSpan: SourceSpan;
}

/**
 * A statement within a test block: either a regular ST statement or an assert call.
 */
export type TestStatement =
  | import("../frontend/ast.js").Statement
  | AssertCall;
