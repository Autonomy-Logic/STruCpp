// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { parseTestJson, type TestRunOutput } from "../../shared/test-result.js";

describe("parseTestJson", () => {
  it("parses all-passing results", () => {
    const json: TestRunOutput = {
      version: 1,
      file: "test_motor.st",
      results: [
        { name: "Motor starts on enable", passed: true },
        { name: "Motor stops on disable", passed: true },
      ],
      summary: { total: 2, passed: 2, failed: 0 },
    };

    const result = parseTestJson(JSON.stringify(json));
    expect(result.version).toBe(1);
    expect(result.file).toBe("test_motor.st");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(true);
    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(0);
  });

  it("parses mixed pass/fail results", () => {
    const json: TestRunOutput = {
      version: 1,
      file: "test_counter.st",
      results: [
        { name: "Counter increments", passed: true },
        {
          name: "Counter resets",
          passed: false,
          failure: {
            assertType: "ASSERT_EQ",
            detail: "uut.count expected 0, got 5",
            file: "test_counter.st",
            line: 15,
            message: "Should reset to zero",
            expected: "0",
            actual: "5",
          },
        },
      ],
      summary: { total: 2, passed: 1, failed: 1 },
    };

    const result = parseTestJson(JSON.stringify(json));
    expect(result.results).toHaveLength(2);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);

    const failure = result.results[1].failure!;
    expect(failure.assertType).toBe("ASSERT_EQ");
    expect(failure.detail).toBe("uut.count expected 0, got 5");
    expect(failure.file).toBe("test_counter.st");
    expect(failure.line).toBe(15);
    expect(failure.message).toBe("Should reset to zero");
    expect(failure.expected).toBe("0");
    expect(failure.actual).toBe("5");
  });

  it("parses failure without optional fields", () => {
    const json: TestRunOutput = {
      version: 1,
      file: "test_basic.st",
      results: [
        {
          name: "Exception test",
          passed: false,
          failure: {
            assertType: "EXCEPTION",
            detail: "Runtime exception in test body",
          },
        },
      ],
      summary: { total: 1, passed: 0, failed: 1 },
    };

    const result = parseTestJson(JSON.stringify(json));
    const failure = result.results[0].failure!;
    expect(failure.assertType).toBe("EXCEPTION");
    expect(failure.file).toBeUndefined();
    expect(failure.line).toBeUndefined();
    expect(failure.message).toBeUndefined();
    expect(failure.expected).toBeUndefined();
    expect(failure.actual).toBeUndefined();
  });

  it("parses empty results array", () => {
    const json: TestRunOutput = {
      version: 1,
      file: "empty.st",
      results: [],
      summary: { total: 0, passed: 0, failed: 0 },
    };

    const result = parseTestJson(JSON.stringify(json));
    expect(result.results).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseTestJson("not json")).toThrow();
  });

  it("throws on missing results array", () => {
    expect(() => parseTestJson(JSON.stringify({ version: 1, summary: { total: 0 } }))).toThrow(
      "Invalid test output",
    );
  });

  it("throws on missing summary", () => {
    expect(() => parseTestJson(JSON.stringify({ version: 1, results: [] }))).toThrow(
      "Invalid test output",
    );
  });
});
