/**
 * Integration tests for the STruC++ mocking framework (Phase 9.4).
 *
 * These tests exercise the complete mock pipeline:
 * source ST → compile (isTestBuild) → parse test → generate test_main.cpp → g++ → run → check
 */

import { describe, it, expect } from "vitest";
import { hasGpp, runE2ETestPipeline } from "./test-helpers.js";

/**
 * End-to-end helper: compile source with isTestBuild, parse test, build binary, run.
 */
function runMockTest(
  sourceST: string,
  testST: string,
  testFileName = "test.st",
): { stdout: string; exitCode: number } {
  return runE2ETestPipeline({
    sourceST,
    testST,
    testFileName,
    isTestBuild: true,
    tempDirPrefix: "strucpp-mock-int-",
  });
}

describe.skipIf(!hasGpp)("Mock Integration Tests", () => {
  describe("FB mocking", () => {
    it("should skip FB body when mocked", () => {
      const source = `
FUNCTION_BLOCK Sensor
  VAR_OUTPUT
    value : INT;
  END_VAR
  value := 42;
END_FUNCTION_BLOCK

FUNCTION_BLOCK Controller
  VAR
    sensor : Sensor;
    result : INT;
  END_VAR
  sensor();
  result := sensor.value;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Mocked FB body is skipped'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  ctrl();
  ASSERT_EQ(ctrl.sensor.value, 0);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Mocked FB body is skipped");
    });

    it("should allow setting inputs on mocked FB", () => {
      const source = `
FUNCTION_BLOCK Actuator
  VAR_INPUT
    command : INT;
  END_VAR
  VAR_OUTPUT
    status : INT;
  END_VAR
  status := command * 2;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Mocked FB retains input assignments'
  VAR act : Actuator; END_VAR
  MOCK act;
  act.command := 50;
  act();
  ASSERT_EQ(act.command, 50);
  ASSERT_EQ(act.status, 0);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Mocked FB retains input assignments");
    });

    it("should not mock unmocked FBs", () => {
      const source = `
FUNCTION_BLOCK Adder
  VAR_INPUT a : INT; b : INT; END_VAR
  VAR_OUTPUT sum : INT; END_VAR
  sum := a + b;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Unmocked FB runs normally'
  VAR add : Adder; END_VAR
  add(a := 3, b := 7);
  ASSERT_EQ(add.sum, 10);
END_TEST
`;
      // Run with isTestBuild but without MOCK statement - FB should still work
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Unmocked FB runs normally");
    });

    it("should provide per-TEST mock isolation", () => {
      const source = `
FUNCTION_BLOCK Counter
  VAR_OUTPUT count : INT; END_VAR
  count := count + 1;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'First test mocks'
  VAR c : Counter; END_VAR
  MOCK c;
  c();
  ASSERT_EQ(c.count, 0);
END_TEST

TEST 'Second test runs real'
  VAR c : Counter; END_VAR
  c();
  ASSERT_EQ(c.count, 1);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] First test mocks");
      expect(stdout).toContain("[PASS] Second test runs real");
    });
  });

  describe("MOCK_VERIFY_CALLED", () => {
    it("should pass when mocked FB was called", () => {
      const source = `
FUNCTION_BLOCK Motor
  VAR_OUTPUT running : BOOL; END_VAR
  running := TRUE;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Verify called passes'
  VAR m : Motor; END_VAR
  MOCK m;
  m();
  MOCK_VERIFY_CALLED(m);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Verify called passes");
    });

    it("should fail when mocked FB was not called", () => {
      const source = `
FUNCTION_BLOCK Motor
  VAR_OUTPUT running : BOOL; END_VAR
  running := TRUE;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Verify called fails'
  VAR m : Motor; END_VAR
  MOCK m;
  MOCK_VERIFY_CALLED(m);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(1);
      expect(stdout).toContain("[FAIL] Verify called fails");
    });
  });

  describe("MOCK_VERIFY_CALL_COUNT", () => {
    it("should pass with correct call count", () => {
      const source = `
FUNCTION_BLOCK Ticker
  VAR_OUTPUT ticks : INT; END_VAR
  ticks := ticks + 1;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Verify call count'
  VAR t : Ticker; END_VAR
  MOCK t;
  t();
  t();
  t();
  MOCK_VERIFY_CALL_COUNT(t, 3);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Verify call count");
    });

    it("should fail with incorrect call count", () => {
      const source = `
FUNCTION_BLOCK Ticker
  VAR_OUTPUT ticks : INT; END_VAR
  ticks := ticks + 1;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Wrong call count'
  VAR t : Ticker; END_VAR
  MOCK t;
  t();
  MOCK_VERIFY_CALL_COUNT(t, 5);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(1);
      expect(stdout).toContain("[FAIL] Wrong call count");
    });

    it("should verify zero calls", () => {
      const source = `
FUNCTION_BLOCK Ticker
  VAR_OUTPUT ticks : INT; END_VAR
  ticks := ticks + 1;
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Zero calls'
  VAR t : Ticker; END_VAR
  MOCK t;
  MOCK_VERIFY_CALL_COUNT(t, 0);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Zero calls");
    });
  });

  describe("function mocking", () => {
    it("should mock a function return value", () => {
      const source = `
FUNCTION ReadSensor : INT
  VAR_INPUT channel : INT; END_VAR
  ReadSensor := channel * 100;
END_FUNCTION

FUNCTION_BLOCK Controller
  VAR
    reading : INT;
  END_VAR
  reading := ReadSensor(channel := 1);
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Function mock overrides return value'
  VAR ctrl : Controller; END_VAR
  MOCK_FUNCTION ReadSensor RETURNS 4200;
  ctrl();
  ASSERT_EQ(ctrl.reading, 4200);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Function mock overrides return value");
    });

    it("should reset function mock between tests", () => {
      const source = `
FUNCTION GetValue : INT
  GetValue := 42;
END_FUNCTION
`;
      const test = `
TEST 'Mock overrides'
  VAR result : INT; END_VAR
  MOCK_FUNCTION GetValue RETURNS 99;
  result := GetValue();
  ASSERT_EQ(result, 99);
END_TEST

TEST 'Real function restored'
  VAR result : INT; END_VAR
  result := GetValue();
  ASSERT_EQ(result, 42);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Mock overrides");
      expect(stdout).toContain("[PASS] Real function restored");
    });
  });

  describe("combined FB and function mocking", () => {
    it("should mock both FBs and functions in same test", () => {
      const source = `
FUNCTION ReadSensor : INT
  VAR_INPUT channel : INT; END_VAR
  ReadSensor := channel * 100;
END_FUNCTION

FUNCTION_BLOCK Logger
  VAR_OUTPUT lastValue : INT; END_VAR
  lastValue := ReadSensor(channel := 0);
END_FUNCTION_BLOCK

FUNCTION_BLOCK Controller
  VAR
    logger : Logger;
    result : INT;
  END_VAR
  logger();
  result := ReadSensor(channel := 1);
END_FUNCTION_BLOCK
`;
      const test = `
TEST 'Mock FB and function together'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.logger;
  MOCK_FUNCTION ReadSensor RETURNS 999;
  ctrl();
  ASSERT_EQ(ctrl.result, 999);
  ASSERT_EQ(ctrl.logger.lastValue, 0);
  MOCK_VERIFY_CALLED(ctrl.logger);
END_TEST
`;
      const { stdout, exitCode } = runMockTest(source, test);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[PASS] Mock FB and function together");
    });
  });
});
