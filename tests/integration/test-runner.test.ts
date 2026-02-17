/**
 * Integration tests for the STruC++ test runner (Phase 9.1).
 *
 * These tests exercise the complete pipeline:
 * source ST → compile → parse test file → generate test_main.cpp → g++ → run → check output
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { parseTestFile } from "../../src/testing/test-parser.js";
import { generateTestMain, buildPOUInfoFromAST } from "../../src/backend/test-main-gen.js";
import { hasGpp, RUNTIME_INCLUDE_PATH } from "./test-helpers.js";

const TEST_RUNTIME_PATH = path.resolve(__dirname, "../../src/runtime/test");

/**
 * End-to-end helper: compile source + test, build binary, run and return output.
 */
function runTest(
  sourceST: string,
  testST: string,
  testFileName = "test.st",
): { stdout: string; exitCode: number } {
  // 1. Compile source
  const result = compile(sourceST, { headerFileName: "generated.hpp" });
  if (!result.success) {
    throw new Error(
      `Source compilation failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  // 2. Build POU info
  const { pous } = result.ast
    ? buildPOUInfoFromAST(result.ast)
    : { pous: [] };

  // 3. Parse test file
  const parseResult = parseTestFile(testST, testFileName);
  if (parseResult.errors.length > 0) {
    throw new Error(
      `Test parse failed: ${parseResult.errors.map((e) => e.message).join(", ")}`,
    );
  }

  // 4. Generate test_main.cpp
  const testMainCpp = generateTestMain([parseResult.testFile!], {
    headerFileName: "generated.hpp",
    pous,
    ast: result.ast,
  });

  // 5. Write to temp dir and compile
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-test-int-"));
  try {
    fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(tempDir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(path.join(tempDir, "test_main.cpp"), testMainCpp);

    const binaryPath = path.join(tempDir, "test_runner");

    execSync(
      [
        "g++",
        "-std=c++17",
        `-I${RUNTIME_INCLUDE_PATH}`,
        `-I${TEST_RUNTIME_PATH}`,
        `-I${tempDir}`,
        path.join(tempDir, "test_main.cpp"),
        path.join(tempDir, "generated.cpp"),
        "-o",
        binaryPath,
      ].join(" "),
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );

    // 6. Run binary
    try {
      const stdout = execSync(`"${binaryPath}"`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      return { stdout, exitCode: 0 };
    } catch (err: unknown) {
      const execErr = err as {
        status?: number;
        stdout?: string;
      };
      return {
        stdout: execErr.stdout ?? "",
        exitCode: execErr.status ?? 1,
      };
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe.skipIf(!hasGpp)("Test Runner Integration", () => {
  it("should pass all tests with exit code 0", () => {
    const source = `
PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM
`;
    const test = `
TEST 'Counter increments by 1'
  VAR uut : Counter; END_VAR
  uut();
  ASSERT_EQ(uut.count, 1);
END_TEST

TEST 'Counter starts at zero'
  VAR uut : Counter; END_VAR
  ASSERT_EQ(uut.count, 0);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test, "test_counter.st");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Counter increments by 1");
    expect(stdout).toContain("[PASS] Counter starts at zero");
    expect(stdout).toContain("2 tests, 2 passed, 0 failed");
  });

  it("should fail with exit code 1 on assertion failure", () => {
    const source = `
PROGRAM Buggy
  VAR result : INT; END_VAR
  result := -1;
END_PROGRAM
`;
    const test = `
TEST 'Should fail'
  VAR uut : Buggy; END_VAR
  uut();
  ASSERT_EQ(uut.result, 0);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test, "test_buggy.st");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL] Should fail");
    expect(stdout).toContain("ASSERT_EQ failed");
    expect(stdout).toContain("1 tests, 0 passed, 1 failed");
  });

  it("should report file name and line number on failure", () => {
    const source = `
PROGRAM Simple
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
`;
    const test = `
TEST 'Line test'
  VAR uut : Simple; END_VAR
  uut();
  ASSERT_EQ(uut.x, 99);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test, "test_simple.st");
    expect(exitCode).toBe(1);
    expect(stdout).toContain("test_simple.st");
  });

  it("should provide context isolation between TEST blocks", () => {
    const source = `
PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM
`;
    const test = `
TEST 'State accumulates within test'
  VAR uut : Counter; END_VAR
  uut();
  uut();
  uut();
  ASSERT_EQ(uut.count, 3);
END_TEST

TEST 'State is fresh in new test'
  VAR uut : Counter; END_VAR
  ASSERT_EQ(uut.count, 0);
  uut();
  ASSERT_EQ(uut.count, 1);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] State accumulates within test");
    expect(stdout).toContain("[PASS] State is fresh in new test");
  });

  it("should handle variable preset before invocation", () => {
    const source = `
PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM
`;
    const test = `
TEST 'Preset value works'
  VAR uut : Counter; END_VAR
  uut.count := 100;
  uut();
  ASSERT_EQ(uut.count, 101);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Preset value works");
  });

  it("should handle ASSERT_TRUE and ASSERT_FALSE", () => {
    const source = `
PROGRAM Flags
  VAR enabled : BOOL; count : INT; END_VAR
  count := count + 1;
  enabled := TRUE;
END_PROGRAM
`;
    const test = `
TEST 'Boolean assertions'
  VAR uut : Flags; END_VAR
  uut();
  ASSERT_TRUE(uut.enabled);
  ASSERT_FALSE(FALSE);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Boolean assertions");
  });

  it("should handle test with local variables and expressions", () => {
    const source = `
PROGRAM Calculator
  VAR result : INT; END_VAR
  result := 42;
END_PROGRAM
`;
    const test = `
TEST 'Expression in assert'
  VAR uut : Calculator; expected : INT; END_VAR
  expected := 42;
  uut();
  ASSERT_EQ(uut.result, expected);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Expression in assert");
  });

  it("should display test runner header", () => {
    const source = `
PROGRAM P
  VAR x : INT; END_VAR
  x := 1;
END_PROGRAM
`;
    const test = `
TEST 'basic'
  VAR uut : P; END_VAR
  uut();
  ASSERT_EQ(uut.x, 1);
END_TEST
`;
    const { stdout } = runTest(source, test, "test_basic.st");
    expect(stdout).toContain("STruC++ Test Runner v1.0");
    expect(stdout).toContain("test_basic.st");
  });

  it("should handle negative values", () => {
    const source = `
PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM
`;
    const test = `
TEST 'Negative preset'
  VAR uut : Counter; END_VAR
  uut.count := -5;
  uut();
  ASSERT_EQ(uut.count, -4);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Negative preset");
  });

  it("should run multiple tests with mixed pass/fail", () => {
    const source = `
PROGRAM P
  VAR x : INT; END_VAR
  x := 10;
END_PROGRAM
`;
    const test = `
TEST 'This passes'
  VAR uut : P; END_VAR
  uut();
  ASSERT_EQ(uut.x, 10);
END_TEST

TEST 'This fails'
  VAR uut : P; END_VAR
  uut();
  ASSERT_EQ(uut.x, 99);
END_TEST

TEST 'This also passes'
  VAR uut : P; END_VAR
  uut();
  ASSERT_TRUE(uut.x > 0);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("[PASS] This passes");
    expect(stdout).toContain("[FAIL] This fails");
    expect(stdout).toContain("[PASS] This also passes");
    expect(stdout).toContain("3 tests, 2 passed, 1 failed");
  });

  it("should handle ASSERT_GT and ASSERT_LT", () => {
    const source = `
PROGRAM Calculator
  VAR result : INT; END_VAR
  result := 42;
END_PROGRAM
`;
    const test = `
TEST 'Comparison asserts'
  VAR uut : Calculator; END_VAR
  uut();
  ASSERT_GT(uut.result, 0);
  ASSERT_LT(uut.result, 100);
  ASSERT_GE(uut.result, 42);
  ASSERT_LE(uut.result, 42);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Comparison asserts");
  });

  it("should handle ASSERT_NEQ", () => {
    const source = `
PROGRAM P
  VAR x : INT; END_VAR
  x := 10;
END_PROGRAM
`;
    const test = `
TEST 'Not equal'
  VAR uut : P; END_VAR
  uut();
  ASSERT_NEQ(uut.x, 0);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Not equal");
  });

  it("should handle ASSERT_NEAR with REAL values", () => {
    const source = `
PROGRAM P
  VAR value : REAL; END_VAR
  value := 3.14;
END_PROGRAM
`;
    const test = `
TEST 'Near check'
  VAR uut : P; END_VAR
  uut();
  ASSERT_NEAR(uut.value, 3.14, 0.01);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Near check");
  });

  it("should display custom message on failure", () => {
    const source = `
PROGRAM P
  VAR x : INT; END_VAR
  x := -1;
END_PROGRAM
`;
    const test = `
TEST 'Custom message'
  VAR uut : P; END_VAR
  uut();
  ASSERT_EQ(uut.x, 0, 'X should be zero');
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL] Custom message");
    expect(stdout).toContain("Message: X should be zero");
  });

  it("should handle SETUP/TEARDOWN blocks", () => {
    const source = `
PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM
`;
    const test = `
SETUP
  VAR uut : Counter; END_VAR
  uut.count := 100;
END_SETUP

TEST 'Setup runs before each test'
  uut();
  ASSERT_EQ(uut.count, 101);
END_TEST

TEST 'Setup gives fresh state'
  ASSERT_EQ(uut.count, 100);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Setup runs before each test");
    expect(stdout).toContain("[PASS] Setup gives fresh state");
  });

  it("should fail ASSERT_GT when actual is not greater", () => {
    const source = `
PROGRAM P
  VAR x : INT; END_VAR
  x := 5;
END_PROGRAM
`;
    const test = `
TEST 'GT fail'
  VAR uut : P; END_VAR
  uut();
  ASSERT_GT(uut.x, 10);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL] GT fail");
    expect(stdout).toContain("ASSERT_GT failed");
  });

  it("should fail ASSERT_NEAR when outside tolerance", () => {
    const source = `
PROGRAM P
  VAR value : REAL; END_VAR
  value := 10.0;
END_PROGRAM
`;
    const test = `
TEST 'Near fail'
  VAR uut : P; END_VAR
  uut();
  ASSERT_NEAR(uut.value, 5.0, 0.1);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("[FAIL] Near fail");
    expect(stdout).toContain("ASSERT_NEAR failed");
  });

  // Phase 9.3: Function and FB Testing

  it("should test functions with direct calls in assertions", () => {
    const source = `
FUNCTION SQUARE : INT
  VAR_INPUT x : INT; END_VAR
  SQUARE := x * x;
END_FUNCTION
`;
    const test = `
TEST 'SQUARE of positive'
  VAR result : INT; END_VAR
  result := SQUARE(5);
  ASSERT_EQ(result, 25);
END_TEST

TEST 'SQUARE of zero'
  VAR result : INT; END_VAR
  result := SQUARE(0);
  ASSERT_EQ(result, 0);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] SQUARE of positive");
    expect(stdout).toContain("[PASS] SQUARE of zero");
  });

  it("should test FB with named parameter invocation", () => {
    const source = `
FUNCTION_BLOCK Debounce
  VAR_INPUT
    signal : BOOL;
    threshold : INT;
  END_VAR
  VAR_OUTPUT
    stable : BOOL;
  END_VAR
  VAR
    count : INT;
  END_VAR
  IF signal THEN
    count := count + 1;
  ELSE
    count := 0;
  END_IF;
  stable := count >= threshold;
END_FUNCTION_BLOCK
`;
    const test = `
TEST 'Debounce needs sustained signal'
  VAR db : Debounce; END_VAR
  db(signal := TRUE, threshold := 3);
  ASSERT_FALSE(db.stable);
  db(signal := TRUE, threshold := 3);
  ASSERT_FALSE(db.stable);
  db(signal := TRUE, threshold := 3);
  ASSERT_TRUE(db.stable);
END_TEST

TEST 'Debounce resets on signal loss'
  VAR db : Debounce; END_VAR
  db(signal := TRUE, threshold := 2);
  db(signal := TRUE, threshold := 2);
  ASSERT_TRUE(db.stable);
  db(signal := FALSE, threshold := 2);
  ASSERT_FALSE(db.stable);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Debounce needs sustained signal");
    expect(stdout).toContain("[PASS] Debounce resets on signal loss");
  });

  it("should test two independent FB instances", () => {
    const source = `
FUNCTION_BLOCK Accumulator
  VAR_INPUT value : INT; END_VAR
  VAR_OUTPUT total : INT; END_VAR
  total := total + value;
END_FUNCTION_BLOCK
`;
    const test = `
TEST 'Two instances are independent'
  VAR a : Accumulator; b : Accumulator; END_VAR
  a(value := 10);
  b(value := 20);
  a(value := 5);
  ASSERT_EQ(a.total, 15);
  ASSERT_EQ(b.total, 20);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Two instances are independent");
  });

  it("should test FB state persists within TEST but fresh between TESTs", () => {
    const source = `
FUNCTION_BLOCK Accumulator
  VAR_INPUT value : INT; END_VAR
  VAR_OUTPUT total : INT; END_VAR
  total := total + value;
END_FUNCTION_BLOCK
`;
    const test = `
TEST 'State accumulates within test'
  VAR acc : Accumulator; END_VAR
  acc(value := 10);
  acc(value := 20);
  ASSERT_EQ(acc.total, 30);
END_TEST

TEST 'State is fresh in new test'
  VAR acc : Accumulator; END_VAR
  ASSERT_EQ(acc.total, 0);
  acc(value := 5);
  ASSERT_EQ(acc.total, 5);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] State accumulates within test");
    expect(stdout).toContain("[PASS] State is fresh in new test");
  });

  it("should test FB methods", () => {
    const source = `
FUNCTION_BLOCK Motor
  VAR
    _speed : INT;
    _running : BOOL;
  END_VAR

  METHOD PUBLIC Start
    _running := TRUE;
  END_METHOD

  METHOD PUBLIC Stop
    _running := FALSE;
    _speed := 0;
  END_METHOD

  METHOD PUBLIC SetSpeed
    VAR_INPUT newSpeed : INT; END_VAR
    _speed := newSpeed;
  END_METHOD
END_FUNCTION_BLOCK
`;
    const test = `
TEST 'Motor starts and stops'
  VAR m : Motor; END_VAR
  m.Start();
  ASSERT_TRUE(m._running);
  m.Stop();
  ASSERT_FALSE(m._running);
  ASSERT_EQ(m._speed, 0);
END_TEST

TEST 'Motor set speed'
  VAR m : Motor; END_VAR
  m.Start();
  m.SetSpeed(newSpeed := 750);
  ASSERT_EQ(m._speed, 750);
END_TEST
`;
    const { stdout, exitCode } = runTest(source, test);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[PASS] Motor starts and stops");
    expect(stdout).toContain("[PASS] Motor set speed");
  });
});
