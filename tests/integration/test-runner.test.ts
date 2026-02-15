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
import { generateTestMain } from "../../src/backend/test-main-gen.js";
import type { POUInfo } from "../../src/backend/test-main-gen.js";
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
  const pous: POUInfo[] = [];
  if (result.ast) {
    for (const prog of result.ast.programs) {
      const vars = new Map<string, string>();
      for (const block of prog.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            vars.set(name, decl.type.name);
          }
        }
      }
      pous.push({
        name: prog.name,
        kind: "program",
        cppClassName: `Program_${prog.name}`,
        variables: vars,
      });
    }
    for (const fb of result.ast.functionBlocks) {
      const vars = new Map<string, string>();
      for (const block of fb.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            vars.set(name, decl.type.name);
          }
        }
      }
      pous.push({
        name: fb.name,
        kind: "functionBlock",
        cppClassName: fb.name,
        variables: vars,
      });
    }
  }

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
});
