// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Test File Parser
 *
 * Parses test ST files into TestFile models. Uses the test lexer (which
 * recognizes TEST/END_TEST/ASSERT_* tokens) and the shared parser's
 * testFile entry point.
 */

import { parseTestSource } from "../frontend/parser.js";
import { buildTestAST } from "../frontend/ast-builder.js";
import type { TestFile } from "./test-model.js";
import type { CompileError } from "../types.js";

/**
 * Parse a test file source string into a TestFile model.
 *
 * @param source - The test file source code
 * @param fileName - The test file name (for error reporting and output)
 * @returns The parsed TestFile and any errors
 */
export function parseTestFile(
  source: string,
  fileName: string,
): { testFile?: TestFile; errors: CompileError[] } {
  const errors: CompileError[] = [];

  // Parse with the test lexer/parser
  const parseResult = parseTestSource(source);

  if (parseResult.errors.length > 0) {
    for (const err of parseResult.errors) {
      const errObj = err as {
        message?: string;
        token?: { startLine?: number; startColumn?: number };
        offset?: number;
        line?: number;
        column?: number;
      };
      errors.push({
        message: errObj.message ?? "Parse error",
        line: errObj.token?.startLine ?? errObj.line ?? 0,
        column: errObj.token?.startColumn ?? errObj.column ?? 0,
        severity: "error",
        file: fileName,
      });
    }
    return { errors };
  }

  if (!parseResult.cst) {
    errors.push({
      message: "Parse failed: no CST produced",
      line: 0,
      column: 0,
      severity: "error",
      file: fileName,
    });
    return { errors };
  }

  // Build TestFile AST from CST
  try {
    const testFile = buildTestAST(parseResult.cst, fileName);
    return { testFile, errors };
  } catch (e) {
    errors.push({
      message: `Test file AST building failed: ${e instanceof Error ? e.message : String(e)}`,
      line: 0,
      column: 0,
      severity: "error",
      file: fileName,
    });
    return { errors };
  }
}
