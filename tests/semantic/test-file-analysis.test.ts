/**
 * STruC++ Semantic Analyzer - Test File Analysis Tests
 *
 * Tests for analyzeTestFile() which validates type references
 * and undeclared variable usage in SETUP/TEARDOWN/TEST blocks.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";
import { parseTestFile } from "../../src/testing/test-parser.js";
import { analyzeTestFile } from "../../src/semantic/analyzer.js";
import { uppercaseSource } from "../../src/frontend/lexer.js";
import { SymbolTables } from "../../src/semantic/symbol-table.js";

/**
 * Compile source ST and return symbol tables.
 */
function compileSource(source: string): SymbolTables {
  const result = compile(source, { headerFileName: "generated.hpp" });
  if (!result.success) {
    throw new Error(
      `Source compilation failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return result.symbolTables!;
}

/**
 * Parse a test file and run semantic analysis against source symbol tables.
 */
function analyzeTest(
  sourceST: string,
  testST: string,
): {
  errors: { message: string; line: number; column: number }[];
  warnings: { message: string; line: number; column: number }[];
} {
  const symbolTables = compileSource(sourceST);
  const parseResult = parseTestFile(
    uppercaseSource(testST),
    "test.st",
  );
  expect(parseResult.errors).toHaveLength(0);
  expect(parseResult.testFile).toBeDefined();
  return analyzeTestFile(parseResult.testFile!, symbolTables);
}

// =============================================================================
// Positive tests — no false errors
// =============================================================================

describe("Test File Analysis - Positive (no false errors)", () => {
  it("should accept a valid test file with declared vars and known types", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 42;
        END_PROGRAM
      `,
      `
        TEST 'basic test'
          VAR y : INT; END_VAR
          y := 10;
          ASSERT_EQ(y, 10);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("should accept SETUP vars visible in TEST bodies", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        SETUP
          VAR shared : INT; END_VAR
          shared := 0;
        END_SETUP

        TEST 'uses setup var'
          shared := 42;
          ASSERT_EQ(shared, 42);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("should accept SETUP vars visible in TEARDOWN body", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        SETUP
          VAR cleanup : INT; END_VAR
          cleanup := 1;
        END_SETUP

        TEARDOWN
          cleanup := 0;
        END_TEARDOWN

        TEST 'dummy'
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("should accept source-level FB types in test var blocks", () => {
    const result = analyzeTest(
      `
        FUNCTION_BLOCK Counter
          VAR count : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR c : Counter; END_VAR
          c();
        END_PROGRAM
      `,
      `
        TEST 'fb instance'
          VAR myCounter : Counter; END_VAR
          myCounter();
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("should accept global variables from source in test bodies", () => {
    const result = analyzeTest(
      `
        VAR_GLOBAL gFlag : BOOL; END_VAR
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'uses global'
          gFlag := TRUE;
          ASSERT_TRUE(gFlag);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("should accept elementary types in test var blocks", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'elementary types'
          VAR a : INT; b : REAL; c : BOOL; d : STRING; END_VAR
          a := 1;
          b := 2.0;
          c := TRUE;
          ASSERT_EQ(a, 1);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// Negative tests — must detect errors
// =============================================================================

describe("Test File Analysis - Negative (must error)", () => {
  it("should error on undefined type in TEST varBlock", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'bad type'
          VAR bad : NonExistentType; END_VAR
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toContain("NONEXISTENTTYPE");
  });

  it("should error on undefined type in SETUP varBlock", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        SETUP
          VAR bad : BogusType; END_VAR
        END_SETUP

        TEST 'dummy'
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toContain("BOGUSTYPE");
  });

  it("should error on undeclared variable in TEST body", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'undeclared'
          VAR y : INT; END_VAR
          y := notDeclared;
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });

  it("should error on undeclared variable in SETUP body", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        SETUP
          VAR s : INT; END_VAR
          s := missingVar;
        END_SETUP

        TEST 'dummy'
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });

  it("should error on undeclared variable in TEARDOWN body", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        SETUP
          VAR s : INT; END_VAR
        END_SETUP

        TEARDOWN
          s := phantomVar + 1;
        END_TEARDOWN

        TEST 'dummy'
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });

  it("should error on ASSERT_EQ with undeclared arg", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'assert undeclared'
          ASSERT_EQ(ghostVar, 10);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });

  it("should error on MOCK_FUNCTION with undeclared returnValue", () => {
    const result = analyzeTest(
      `
        FUNCTION MyFunc : INT
          VAR_INPUT a : INT; END_VAR
          MyFunc := a;
        END_FUNCTION

        PROGRAM Main
          VAR x : INT; END_VAR
          x := MyFunc(1);
        END_PROGRAM
      `,
      `
        TEST 'mock undeclared'
          MOCK_FUNCTION MyFunc RETURNS undeclaredVal;
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });

  it("should error on ADVANCE_TIME with undeclared duration", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'advance undeclared'
          ADVANCE_TIME(ghostDuration);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });

  it("should not allow TEST-local vars to be visible in other TESTs", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'first test'
          VAR localOnly : INT; END_VAR
          localOnly := 1;
        END_TEST

        TEST 'second test'
          localOnly := 2;
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("Undeclared variable")),
    ).toBe(true);
  });
});

// =============================================================================
// Assert argument count validation
// =============================================================================

describe("Test File Analysis - Assert arg count validation", () => {
  const SOURCE = `
    PROGRAM Main
      VAR x : INT; END_VAR
      x := 1;
    END_PROGRAM
  `;

  it("should error on ASSERT_EQ with wrong arg count", () => {
    const result = analyzeTest(
      SOURCE,
      `
        TEST 'bad assert_eq'
          ASSERT_EQ(1);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("ASSERT_EQ expects 2 arguments, got 1")),
    ).toBe(true);
  });

  it("should error on ASSERT_TRUE with wrong arg count", () => {
    const result = analyzeTest(
      SOURCE,
      `
        TEST 'bad assert_true'
          ASSERT_TRUE(1, 2);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("ASSERT_TRUE expects 1 argument, got 2")),
    ).toBe(true);
  });

  it("should error on ASSERT_NEAR with wrong arg count", () => {
    const result = analyzeTest(
      SOURCE,
      `
        TEST 'bad assert_near'
          ASSERT_NEAR(1.0, 2.0);
        END_TEST
      `,
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(
      result.errors.some((e) => e.message.includes("ASSERT_NEAR expects 3 arguments, got 2")),
    ).toBe(true);
  });

  it("should accept correct arg counts with no errors", () => {
    const result = analyzeTest(
      SOURCE,
      `
        TEST 'valid asserts'
          VAR a : INT; b : REAL; END_VAR
          ASSERT_TRUE(TRUE);
          ASSERT_FALSE(FALSE);
          ASSERT_EQ(a, 0);
          ASSERT_NEQ(a, 1);
          ASSERT_GT(a, 0);
          ASSERT_LT(a, 10);
          ASSERT_GE(a, 0);
          ASSERT_LE(a, 10);
          ASSERT_NEAR(b, 1.0, 0.01);
        END_TEST
      `,
    );
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// Mock validation
// =============================================================================

describe("Test File Analysis - Mock validation", () => {
  it("should warn on MOCK with unknown variable", () => {
    const result = analyzeTest(
      `
        FUNCTION_BLOCK Counter
          VAR count : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR c : Counter; END_VAR
          c();
        END_PROGRAM
      `,
      `
        TEST 'mock unknown'
          MOCK ghostInstance;
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(
      result.warnings.some((w) => w.message.includes("Unknown variable") && w.message.includes("GHOSTINSTANCE")),
    ).toBe(true);
  });

  it("should not warn on MOCK with declared SETUP variable", () => {
    const result = analyzeTest(
      `
        FUNCTION_BLOCK Counter
          VAR count : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR c : Counter; END_VAR
          c();
        END_PROGRAM
      `,
      `
        SETUP
          VAR myCounter : Counter; END_VAR
        END_SETUP

        TEST 'mock declared'
          MOCK myCounter;
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("should warn on MOCK_FUNCTION with unknown function", () => {
    const result = analyzeTest(
      `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      `
        TEST 'mock unknown func'
          MOCK_FUNCTION NonExistentFunc RETURNS 42;
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(
      result.warnings.some((w) => w.message.includes("Unknown function") && w.message.includes("NONEXISTENTFUNC")),
    ).toBe(true);
  });

  it("should not warn on MOCK_FUNCTION with known user function", () => {
    const result = analyzeTest(
      `
        FUNCTION MyFunc : INT
          VAR_INPUT a : INT; END_VAR
          MyFunc := a;
        END_FUNCTION

        PROGRAM Main
          VAR x : INT; END_VAR
          x := MyFunc(1);
        END_PROGRAM
      `,
      `
        TEST 'mock known func'
          MOCK_FUNCTION MyFunc RETURNS 99;
          ASSERT_TRUE(TRUE);
        END_TEST
      `,
    );
    expect(result.warnings).toHaveLength(0);
  });
});
