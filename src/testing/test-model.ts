/**
 * STruC++ Test Model
 *
 * Data structures representing a parsed test file. These are populated by
 * the test parser and consumed by the test main generator.
 */

import type { VarBlock, Expression } from "../frontend/ast.js";
import type { SourceSpan } from "../types.js";

/**
 * Assert function type (Phase 9.1: basic set)
 */
export type AssertType = "ASSERT_EQ" | "ASSERT_TRUE" | "ASSERT_FALSE";

/**
 * A test file containing one or more test cases.
 */
export interface TestFile {
  fileName: string;
  testCases: TestCase[];
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
  sourceSpan: SourceSpan;
}

/**
 * A statement within a test block: either a regular ST statement or an assert call.
 */
export type TestStatement =
  | import("../frontend/ast.js").Statement
  | AssertCall;
