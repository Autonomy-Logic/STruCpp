/**
 * STruC++ Test Model
 *
 * Re-exports test framework types from the AST module.
 * These types are the canonical definitions used by the test parser
 * and test main generator.
 */

export type {
  AssertType,
  TestFile,
  SetupBlock,
  TeardownBlock,
  TestCase,
  AssertCall,
  MockFBStatement,
  MockFunctionStatement,
  MockVerifyCalledStatement,
  MockVerifyCallCountStatement,
  TestStatement,
} from "../frontend/ast.js";
