/**
 * Tests for mock statement parsing (Phase 9.4).
 *
 * Verifies that MOCK, MOCK_FUNCTION, MOCK_VERIFY_CALLED, and
 * MOCK_VERIFY_CALL_COUNT statements parse into correct AST nodes.
 */

import { describe, it, expect } from "vitest";
import { parseTestFile } from "../../src/testing/test-parser.js";
import type {
  MockFBStatement,
  MockFunctionStatement,
  MockVerifyCalledStatement,
  MockVerifyCallCountStatement,
} from "../../src/frontend/ast.js";

describe("Mock Statement Parser", () => {
  describe("MOCK (FB mocking)", () => {
    it("should parse MOCK with simple instance name", () => {
      const source = `
TEST 'mock simple'
  VAR fb : MyFB; END_VAR
  MOCK fb;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(2);
      expect(body[0]!.kind).toBe("MockFBStatement");
      const mock = body[0] as MockFBStatement;
      expect(mock.instancePath).toEqual(["FB"]);
    });

    it("should parse MOCK with dotted instance path", () => {
      const source = `
TEST 'mock dotted'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const mock = body[0] as MockFBStatement;
      expect(mock.kind).toBe("MockFBStatement");
      expect(mock.instancePath).toEqual(["CTRL", "SENSOR"]);
    });

    it("should parse MOCK with deeply nested path", () => {
      const source = `
TEST 'mock deep'
  VAR sys : System; END_VAR
  MOCK sys.subsystem.valve;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const mock = result.testFile!.testCases[0]!.body[0] as MockFBStatement;
      expect(mock.kind).toBe("MockFBStatement");
      expect(mock.instancePath).toEqual(["SYS", "SUBSYSTEM", "VALVE"]);
    });

    it("should parse multiple MOCK statements", () => {
      const source = `
TEST 'multi mock'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  MOCK ctrl.actuator;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(3);
      expect(body[0]!.kind).toBe("MockFBStatement");
      expect(body[1]!.kind).toBe("MockFBStatement");
      expect(body[2]!.kind).toBe("AssertCall");
    });

    it("should track source span for MOCK statement", () => {
      const source = `TEST 'span'
  MOCK fb;
END_TEST`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const mock = result.testFile!.testCases[0]!.body[0]!;
      expect(mock.sourceSpan.startLine).toBe(2);
      expect(mock.sourceSpan.file).toBe("test.st");
    });
  });

  describe("MOCK_FUNCTION", () => {
    it("should parse MOCK_FUNCTION with integer return value", () => {
      const source = `
TEST 'mock func int'
  MOCK_FUNCTION ReadSensor RETURNS 4200;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body[0]!.kind).toBe("MockFunctionStatement");
      const mock = body[0] as MockFunctionStatement;
      expect(mock.functionName).toBe("READSENSOR");
      expect(mock.returnValue.kind).toBe("LiteralExpression");
    });

    it("should parse MOCK_FUNCTION with boolean return value", () => {
      const source = `
TEST 'mock func bool'
  MOCK_FUNCTION IsReady RETURNS TRUE;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const mock = result.testFile!.testCases[0]!.body[0] as MockFunctionStatement;
      expect(mock.kind).toBe("MockFunctionStatement");
      expect(mock.functionName).toBe("ISREADY");
    });

    it("should parse MOCK_FUNCTION with real return value", () => {
      const source = `
TEST 'mock func real'
  MOCK_FUNCTION GetTemp RETURNS 36.5;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const mock = result.testFile!.testCases[0]!.body[0] as MockFunctionStatement;
      expect(mock.kind).toBe("MockFunctionStatement");
      expect(mock.functionName).toBe("GETTEMP");
    });

    it("should parse MOCK_FUNCTION with negative return value", () => {
      const source = `
TEST 'mock func neg'
  MOCK_FUNCTION GetError RETURNS -1;
  ASSERT_TRUE(TRUE);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const mock = result.testFile!.testCases[0]!.body[0] as MockFunctionStatement;
      expect(mock.kind).toBe("MockFunctionStatement");
      expect(mock.functionName).toBe("GETERROR");
    });

    it("should track source span for MOCK_FUNCTION", () => {
      const source = `TEST 'span'
  MOCK_FUNCTION Foo RETURNS 0;
END_TEST`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const mock = result.testFile!.testCases[0]!.body[0]!;
      expect(mock.sourceSpan.startLine).toBe(2);
    });
  });

  describe("MOCK_VERIFY_CALLED", () => {
    it("should parse MOCK_VERIFY_CALLED with simple instance", () => {
      const source = `
TEST 'verify called'
  VAR fb : MyFB; END_VAR
  MOCK fb;
  fb();
  MOCK_VERIFY_CALLED(fb);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const verify = body[2] as MockVerifyCalledStatement;
      expect(verify.kind).toBe("MockVerifyCalledStatement");
      expect(verify.instancePath).toEqual(["FB"]);
    });

    it("should parse MOCK_VERIFY_CALLED with dotted path", () => {
      const source = `
TEST 'verify called dotted'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  ctrl();
  MOCK_VERIFY_CALLED(ctrl.sensor);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const verify = body[2] as MockVerifyCalledStatement;
      expect(verify.kind).toBe("MockVerifyCalledStatement");
      expect(verify.instancePath).toEqual(["CTRL", "SENSOR"]);
    });

    it("should track source span for MOCK_VERIFY_CALLED", () => {
      const source = `TEST 'span'
  MOCK_VERIFY_CALLED(fb);
END_TEST`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const stmt = result.testFile!.testCases[0]!.body[0]!;
      expect(stmt.sourceSpan.startLine).toBe(2);
    });
  });

  describe("MOCK_VERIFY_CALL_COUNT", () => {
    it("should parse MOCK_VERIFY_CALL_COUNT with integer count", () => {
      const source = `
TEST 'verify count'
  VAR fb : MyFB; END_VAR
  MOCK fb;
  fb();
  fb();
  MOCK_VERIFY_CALL_COUNT(fb, 2);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      const verify = body[3] as MockVerifyCallCountStatement;
      expect(verify.kind).toBe("MockVerifyCallCountStatement");
      expect(verify.instancePath).toEqual(["FB"]);
      expect(verify.expectedCount.kind).toBe("LiteralExpression");
    });

    it("should parse MOCK_VERIFY_CALL_COUNT with dotted path", () => {
      const source = `
TEST 'verify count dotted'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  MOCK_VERIFY_CALL_COUNT(ctrl.sensor, 0);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const verify = result.testFile!.testCases[0]!.body[1] as MockVerifyCallCountStatement;
      expect(verify.kind).toBe("MockVerifyCallCountStatement");
      expect(verify.instancePath).toEqual(["CTRL", "SENSOR"]);
    });

    it("should track source span for MOCK_VERIFY_CALL_COUNT", () => {
      const source = `TEST 'span'
  MOCK_VERIFY_CALL_COUNT(fb, 1);
END_TEST`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const stmt = result.testFile!.testCases[0]!.body[0]!;
      expect(stmt.sourceSpan.startLine).toBe(2);
    });
  });

  describe("mixed mock and regular statements", () => {
    it("should parse mock statements interleaved with assignments and asserts", () => {
      const source = `
TEST 'mixed'
  VAR fb : MyFB; x : INT; END_VAR
  MOCK fb;
  x := 10;
  fb();
  ASSERT_EQ(x, 10);
  MOCK_VERIFY_CALLED(fb);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body).toHaveLength(5);
      expect(body[0]!.kind).toBe("MockFBStatement");
      expect(body[1]!.kind).toBe("AssignmentStatement");
      expect(body[2]!.kind).toBe("FunctionCallStatement");
      expect(body[3]!.kind).toBe("AssertCall");
      expect(body[4]!.kind).toBe("MockVerifyCalledStatement");
    });

    it("should parse MOCK_FUNCTION alongside MOCK FB", () => {
      const source = `
TEST 'both mock types'
  VAR fb : MyFB; END_VAR
  MOCK fb;
  MOCK_FUNCTION ReadSensor RETURNS 100;
  fb();
  MOCK_VERIFY_CALLED(fb);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      const body = result.testFile!.testCases[0]!.body;
      expect(body[0]!.kind).toBe("MockFBStatement");
      expect(body[1]!.kind).toBe("MockFunctionStatement");
      expect(body[2]!.kind).toBe("FunctionCallStatement");
      expect(body[3]!.kind).toBe("MockVerifyCalledStatement");
    });
  });

  describe("mock with SETUP block", () => {
    it("should parse MOCK in SETUP block", () => {
      const source = `
SETUP
  VAR fb : MyFB; END_VAR
  MOCK fb;
END_SETUP

TEST 'test with setup mock'
  fb();
  MOCK_VERIFY_CALLED(fb);
END_TEST
`;
      const result = parseTestFile(source, "test.st");
      expect(result.errors).toHaveLength(0);
      expect(result.testFile!.setup).toBeDefined();
      expect(result.testFile!.setup!.body).toHaveLength(1);
      expect(result.testFile!.setup!.body[0]!.kind).toBe("MockFBStatement");
      const body = result.testFile!.testCases[0]!.body;
      expect(body[0]!.kind).toBe("FunctionCallStatement");
      expect(body[1]!.kind).toBe("MockVerifyCalledStatement");
    });
  });
});
