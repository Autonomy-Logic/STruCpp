/**
 * Tests for the test file parser (Phase 9.1).
 *
 * Verifies that TEST/END_TEST blocks, ASSERT_* calls, and
 * test file parsing produce correct TestFile AST structures.
 */

import { describe, it, expect } from "vitest";
import { parseTestFile } from "../../src/testing/test-parser.js";
import type { AssertCall } from "../../src/frontend/ast.js";

describe("Test File Parser", () => {
  describe("basic parsing", () => {
    it("should parse a simple TEST block with ASSERT_EQ", () => {
      const source = `
TEST 'my test'
  VAR x : INT; END_VAR
  x := 42;
  ASSERT_EQ(x, 42);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile).toBeDefined();
      expect(result.testFile!.testCases).toHaveLength(1);

      const tc = result.testFile!.testCases[0]!;
      expect(tc.name).toBe("my test");
      expect(tc.varBlocks).toHaveLength(1);
      expect(tc.body).toHaveLength(2); // assignment + assert
    });

    it("should parse multiple TEST blocks", () => {
      const source = `
TEST 'first test'
  ASSERT_TRUE(TRUE);
END_TEST

TEST 'second test'
  ASSERT_FALSE(FALSE);
END_TEST

TEST 'third test'
  ASSERT_EQ(1, 1);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.testCases).toHaveLength(3);
      expect(result.testFile!.testCases[0]!.name).toBe("first test");
      expect(result.testFile!.testCases[1]!.name).toBe("second test");
      expect(result.testFile!.testCases[2]!.name).toBe("third test");
    });

    it("should parse TEST block with no VAR declarations", () => {
      const source = `
TEST 'no vars'
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const tc = result.testFile!.testCases[0]!;
      expect(tc.varBlocks).toHaveLength(0);
      expect(tc.body).toHaveLength(1);
    });

    it("should parse TEST block with multiple VAR blocks", () => {
      const source = `
TEST 'multi var'
  VAR a : INT; END_VAR
  VAR b : BOOL; END_VAR
  ASSERT_TRUE(b);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const tc = result.testFile!.testCases[0]!;
      expect(tc.varBlocks).toHaveLength(2);
    });
  });

  describe("assert calls", () => {
    it("should parse ASSERT_EQ with two arguments", () => {
      const source = `
TEST 'eq test'
  ASSERT_EQ(1, 2);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(1);
      expect(body[0]!.kind).toBe("AssertCall");
      const assert = body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_EQ");
      expect(assert.args).toHaveLength(2);
    });

    it("should parse ASSERT_TRUE with one argument", () => {
      const source = `
TEST 'true test'
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const assert = body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_TRUE");
      expect(assert.args).toHaveLength(1);
    });

    it("should parse ASSERT_FALSE with one argument", () => {
      const source = `
TEST 'false test'
  ASSERT_FALSE(FALSE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const assert = body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_FALSE");
      expect(assert.args).toHaveLength(1);
    });

    it("should parse ASSERT_EQ with expression arguments", () => {
      const source = `
TEST 'expr test'
  VAR x : INT; END_VAR
  ASSERT_EQ(x + 1, 10);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const assert = body[0] as AssertCall;
      expect(assert.args[0]!.kind).toBe("BinaryExpression");
    });
  });

  describe("statements in test blocks", () => {
    it("should parse assignment statements", () => {
      const source = `
TEST 'assignment test'
  VAR x : INT; END_VAR
  x := 42;
  ASSERT_EQ(x, 42);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(2);
      expect(body[0]!.kind).toBe("AssignmentStatement");
      expect(body[1]!.kind).toBe("AssertCall");
    });

    it("should parse function call statements (POU invocation)", () => {
      const source = `
TEST 'pou invocation'
  VAR uut : Counter; END_VAR
  uut();
  ASSERT_EQ(uut.count, 1);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(2);
      expect(body[0]!.kind).toBe("FunctionCallStatement");
    });

    it("should parse member access expressions", () => {
      const source = `
TEST 'member access'
  VAR uut : Counter; END_VAR
  uut.count := 10;
  ASSERT_EQ(uut.count, 10);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body[0]!.kind).toBe("AssignmentStatement");
    });

    it("should parse IF statements in test blocks", () => {
      const source = `
TEST 'if test'
  VAR x : INT; END_VAR
  x := 5;
  IF x > 0 THEN
    ASSERT_TRUE(TRUE);
  END_IF;
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body[1]!.kind).toBe("IfStatement");
    });
  });

  describe("error handling", () => {
    it("should report error on missing END_TEST", () => {
      const source = `
TEST 'incomplete'
  ASSERT_TRUE(TRUE);
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should report error on syntax error in test body", () => {
      const source = `
TEST 'bad syntax'
  := invalid;
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should set file name on errors", () => {
      const source = `
TEST 'error file'
  ASSERT_TRUE(;
END_TEST
`;
      const result = parseTestFile(source, "my_test.st");
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.file).toBe("my_test.st");
    });
  });

  describe("source span tracking", () => {
    it("should track source spans for test cases", () => {
      const source = `TEST 'span test'
  ASSERT_TRUE(TRUE);
END_TEST`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const tc = result.testFile!.testCases[0]!;
      expect(tc.sourceSpan.startLine).toBe(1);
      expect(tc.sourceSpan.file).toBe("test.st");
    });

    it("should track source spans for assert calls", () => {
      const source = `TEST 'assert span'
  ASSERT_EQ(1, 2);
END_TEST`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0]!;
      expect(assert.sourceSpan.startLine).toBe(2);
    });
  });

  describe("comments in test files", () => {
    it("should handle block comments in test files", () => {
      const source = `
(* This is a test file *)
TEST 'commented test'
  (* setup *)
  ASSERT_TRUE(TRUE); (* check *)
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.testCases).toHaveLength(1);
    });

    it("should handle single-line comments", () => {
      const source = `
// Test file for counter
TEST 'counter test'
  // This checks the value
  ASSERT_EQ(1, 1);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.testCases).toHaveLength(1);
    });
  });

  describe("new assert types (Phase 9.2)", () => {
    it("should parse ASSERT_NEQ with two arguments", () => {
      const source = `
TEST 'neq test'
  ASSERT_NEQ(1, 2);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const assert = body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_NEQ");
      expect(assert.args).toHaveLength(2);
    });

    it("should parse ASSERT_GT with two arguments", () => {
      const source = `
TEST 'gt test'
  ASSERT_GT(10, 5);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_GT");
      expect(assert.args).toHaveLength(2);
    });

    it("should parse ASSERT_LT with two arguments", () => {
      const source = `
TEST 'lt test'
  ASSERT_LT(1, 10);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_LT");
    });

    it("should parse ASSERT_GE and ASSERT_LE", () => {
      const source = `
TEST 'ge le test'
  ASSERT_GE(10, 10);
  ASSERT_LE(5, 10);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(2);
      expect((body[0] as AssertCall).assertType).toBe("ASSERT_GE");
      expect((body[1] as AssertCall).assertType).toBe("ASSERT_LE");
    });

    it("should parse ASSERT_NEAR with three arguments", () => {
      const source = `
TEST 'near test'
  ASSERT_NEAR(1.0, 1.01, 0.1);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_NEAR");
      expect(assert.args).toHaveLength(3);
    });
  });

  describe("optional message parameter (Phase 9.2)", () => {
    it("should parse ASSERT_EQ with optional message", () => {
      const source = `
TEST 'msg test'
  ASSERT_EQ(1, 2, 'Values should match');
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0] as AssertCall;
      expect(assert.assertType).toBe("ASSERT_EQ");
      expect(assert.args).toHaveLength(2);
      expect(assert.message).toBe("Values should match");
    });

    it("should parse ASSERT_TRUE with optional message", () => {
      const source = `
TEST 'msg true test'
  ASSERT_TRUE(TRUE, 'Should be true');
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0] as AssertCall;
      expect(assert.args).toHaveLength(1);
      expect(assert.message).toBe("Should be true");
    });

    it("should parse ASSERT_NEAR with optional message", () => {
      const source = `
TEST 'near msg test'
  ASSERT_NEAR(1.0, 1.01, 0.1, 'Within tolerance');
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const assert = result.testFile!.testCases[0]!.body[0] as AssertCall;
      expect(assert.args).toHaveLength(3);
      expect(assert.message).toBe("Within tolerance");
    });
  });

  describe("SETUP and TEARDOWN (Phase 9.2)", () => {
    it("should parse SETUP block with VAR declarations", () => {
      const source = `
SETUP
  VAR x : INT; END_VAR
  x := 42;
END_SETUP

TEST 'setup test'
  ASSERT_EQ(x, 42);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.setup).toBeDefined();
      expect(result.testFile!.setup!.varBlocks).toHaveLength(1);
      expect(result.testFile!.setup!.body).toHaveLength(1);
      expect(result.testFile!.testCases).toHaveLength(1);
    });

    it("should parse TEARDOWN block", () => {
      const source = `
TEARDOWN
  (* cleanup *)
END_TEARDOWN

TEST 'teardown test'
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.teardown).toBeDefined();
      expect(result.testFile!.teardown!.body).toHaveLength(0);
    });

    it("should parse both SETUP and TEARDOWN", () => {
      const source = `
SETUP
  VAR counter : INT; END_VAR
  counter := 0;
END_SETUP

TEARDOWN
  counter := -1;
END_TEARDOWN

TEST 'both blocks'
  ASSERT_EQ(counter, 0);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.setup).toBeDefined();
      expect(result.testFile!.teardown).toBeDefined();
      expect(result.testFile!.testCases).toHaveLength(1);
    });

    it("should parse SETUP with multiple VAR blocks", () => {
      const source = `
SETUP
  VAR a : INT; END_VAR
  VAR b : BOOL; END_VAR
  a := 10;
END_SETUP

TEST 'multi var setup'
  ASSERT_EQ(a, 10);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.setup!.varBlocks).toHaveLength(2);
    });

    it("should allow test file with no SETUP or TEARDOWN", () => {
      const source = `
TEST 'no setup'
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.setup).toBeUndefined();
      expect(result.testFile!.teardown).toBeUndefined();
    });
  });
});
