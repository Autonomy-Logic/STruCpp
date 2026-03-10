// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared test result types matching the JSON output from the STruC++ test binary.
 * Used by server (to parse binary output) and client (to map results to TestItems).
 */

export interface TestFailure {
  assertType: string;   // "ASSERT_EQ", "ASSERT_TRUE", "EXCEPTION", etc.
  detail: string;       // Human-readable failure description
  file?: string;        // Source file name
  line?: number;        // Line number in source
  message?: string;     // Optional user-provided message
  expected?: string;    // For ASSERT_EQ/NEQ: expected value (for diff view)
  actual?: string;      // For ASSERT_EQ/NEQ: actual value (for diff view)
}

export interface TestResult {
  name: string;
  passed: boolean;
  failure?: TestFailure;
}

export interface TestRunOutput {
  version: number;
  file: string;
  results: TestResult[];
  summary: { total: number; passed: number; failed: number };
}

/**
 * Parse JSON stdout from the test binary into typed results.
 * The test binary outputs JSON when invoked with --json flag.
 * Validates the structure to provide clear errors on malformed output.
 */
export function parseTestJson(stdout: string): TestRunOutput {
  const parsed = JSON.parse(stdout);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.results) ||
    typeof parsed.summary !== "object" ||
    typeof parsed.summary?.total !== "number"
  ) {
    throw new Error(
      "Invalid test output: missing required fields (results, summary)",
    );
  }
  return parsed as TestRunOutput;
}
