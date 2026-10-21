// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
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
  AdvanceTimeStatement,
  MockFBStatement,
  MockFunctionStatement,
  MockVerifyCalledStatement,
  MockVerifyCallCountStatement,
  TestStatement,
} from "../frontend/ast.js";
