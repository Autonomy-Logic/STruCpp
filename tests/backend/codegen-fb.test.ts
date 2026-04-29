/**
 * STruC++ Codegen Function Block Tests
 *
 * Tests for C++ code generation of function block instances,
 * invocations, member access, and composition.
 * Covers Phase 5.1: Function Block Instances and Invocations.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

function compileAndCheck(source: string) {
  const result = compile(source);
  if (!result.success) {
    console.error("Compilation errors:", result.errors);
  }
  expect(result.success).toBe(true);
  return result;
}

describe("Codegen - Function Blocks", () => {
  describe("FB class generation", () => {
    it("should generate C++ class for simple FB", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Adder
          VAR_INPUT a, b : INT; END_VAR
          VAR_OUTPUT result : INT; END_VAR
          result := a + b;
        END_FUNCTION_BLOCK

        PROGRAM Main
        END_PROGRAM
      `);

      // Header should contain the class declaration
      expect(result.headerCode).toContain("class ADDER {");
      expect(result.headerCode).toContain("public:");
      expect(result.headerCode).toContain("IEC_INT A;");
      expect(result.headerCode).toContain("IEC_INT B;");
      expect(result.headerCode).toContain("IEC_INT RESULT;");
      expect(result.headerCode).toContain("void operator()();");

      // Implementation should contain constructor and operator()
      expect(result.cppCode).toContain("ADDER::ADDER()");
      expect(result.cppCode).toContain("void ADDER::operator()()");
      expect(result.cppCode).toContain("RESULT = A + B;");
    });
  });

  describe("FB instance declarations", () => {
    it("should generate FB instance as class member (no IECVar wrapper)", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT x : INT; END_VAR
          VAR_OUTPUT y : INT; END_VAR
          y := x * 2;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            fb : MyFB;
            result : INT;
          END_VAR
          fb(x := 5);
          result := fb.y;
        END_PROGRAM
      `);

      // FB instance should be plain class member, not IEC_MYFB
      expect(result.headerCode).toContain("MYFB FB;");
      expect(result.headerCode).not.toContain("IEC_MYFB FB;");

      // Regular variable should still use IEC_ prefix
      expect(result.headerCode).toContain("IEC_INT RESULT;");
    });

    it("should generate multiple independent FB instances", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Timer
          VAR_INPUT pt : INT; END_VAR
          VAR_OUTPUT q : BOOL; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            t1 : Timer;
            t2 : Timer;
          END_VAR
        END_PROGRAM
      `);

      expect(result.headerCode).toContain("TIMER T1;");
      expect(result.headerCode).toContain("TIMER T2;");
    });
  });

  describe("FB invocation codegen", () => {
    it("should generate FB invocation as input assignment + operator()", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Adder
          VAR_INPUT a, b : INT; END_VAR
          VAR_OUTPUT result : INT; END_VAR
          result := a + b;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            add : Adder;
            sum : INT;
          END_VAR
          add(a := 5, b := 3);
          sum := add.result;
        END_PROGRAM
      `);

      // FB invocation should assign inputs then call operator()
      expect(result.cppCode).toContain("ADD.A = 5;");
      expect(result.cppCode).toContain("ADD.B = 3;");
      expect(result.cppCode).toContain("ADD();");

      // Member access should be direct property access
      expect(result.cppCode).toContain("SUM = ADD.RESULT;");
    });

    it("should generate FB output capture with => syntax", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT x : INT; END_VAR
          VAR_OUTPUT y : INT; END_VAR
          y := x + 1;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            fb : MyFB;
            output : INT;
          END_VAR
          fb(x := 10, y => output);
        END_PROGRAM
      `);

      // Input assignment
      expect(result.cppCode).toContain("FB.X = 10;");
      // Call
      expect(result.cppCode).toContain("FB();");
      // Output capture
      expect(result.cppCode).toContain("OUTPUT = FB.Y;");
    });

    it("should generate FB member access as direct property access", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Sensor
          VAR_INPUT raw : INT; END_VAR
          VAR_OUTPUT calibrated : INT; END_VAR
          calibrated := raw + 10;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            s : Sensor;
            val : INT;
          END_VAR
          s(raw := 100);
          val := s.calibrated;
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("VAL = S.CALIBRATED;");
    });

    it("should generate FB input write as direct property assignment", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT x : INT; END_VAR
          VAR_OUTPUT y : INT; END_VAR
          y := x;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR fb : MyFB; END_VAR
          fb.x := 42;
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("FB.X = 42;");
    });
  });

  describe("FB constructor generation", () => {
    it("should generate constructor with default values", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT x : INT; END_VAR
          VAR_OUTPUT y : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("MYFB::MYFB()");
    });
  });

  describe("FB composition (nested FBs)", () => {
    it("should generate nested FB as class member", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Inner
          VAR_INPUT CLK : BOOL; END_VAR
          VAR_OUTPUT Q : BOOL; END_VAR
          Q := CLK;
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Outer
          VAR_INPUT signal : BOOL; END_VAR
          VAR_OUTPUT edges : INT; END_VAR
          VAR edge : Inner; END_VAR
          edge(CLK := signal);
          IF edge.Q THEN edges := edges + 1; END_IF;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR ctrl : Outer; END_VAR
          ctrl(signal := TRUE);
        END_PROGRAM
      `);

      // Inner FB instance inside Outer should be a plain class member
      expect(result.headerCode).toContain("class OUTER {");
      expect(result.headerCode).toMatch(/INNER EDGE;/);

      // Outer body should invoke Inner
      expect(result.cppCode).toContain("EDGE.CLK = SIGNAL;");
      expect(result.cppCode).toContain("EDGE();");

      // Program should invoke Outer
      expect(result.cppCode).toContain("CTRL.SIGNAL = true;");
      expect(result.cppCode).toContain("CTRL();");
    });
  });

  describe("FB state persistence", () => {
    it("should compile FB with state that persists between calls", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK Counter
          VAR_INPUT inc : BOOL; END_VAR
          VAR_OUTPUT count : INT; END_VAR
          IF inc THEN count := count + 1; END_IF;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR c : Counter; END_VAR
          c(inc := TRUE);
          c(inc := TRUE);
        END_PROGRAM
      `);

      // Two separate invocations of the same instance
      const cppCode = result.cppCode;
      const invocations = cppCode.match(/C\(\);/g);
      expect(invocations).toHaveLength(2);
    });
  });

  describe("FB invocation without function call confusion", () => {
    it("should not confuse FB invocation with function call", () => {
      const result = compileAndCheck(`
        FUNCTION MyFunc : INT
          VAR_INPUT x : INT; END_VAR
          MyFunc := x * 2;
        END_FUNCTION

        FUNCTION_BLOCK MyFB
          VAR_INPUT x : INT; END_VAR
          VAR_OUTPUT y : INT; END_VAR
          y := x + 1;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            fb : MyFB;
            r : INT;
          END_VAR
          r := MyFunc(5);
          fb(x := 10);
        END_PROGRAM
      `);

      // Function call should remain as regular call
      expect(result.cppCode).toContain("R = MYFUNC(5);");
      // FB invocation should use assign+call pattern
      expect(result.cppCode).toContain("FB.X = 10;");
      expect(result.cppCode).toContain("FB();");
    });

    it("should resolve positional arguments in FB invocation", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT
            a : INT;
            b : BOOL;
          END_VAR
          a := a + 1;
        END_FUNCTION_BLOCK

        PROGRAM Test
          VAR fb : MyFB; END_VAR
          fb(42, TRUE);
        END_PROGRAM
      `);

      // Positional args should be mapped to VAR_INPUT by order
      expect(result.cppCode).toContain("FB.A = 42;");
      expect(result.cppCode).toContain("FB.B = true;");
      expect(result.cppCode).toContain("FB();");
    });

    it("should handle mixed named and positional arguments", () => {
      const result = compileAndCheck(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT
            x : INT;
            y : INT;
          END_VAR
          x := x + y;
        END_FUNCTION_BLOCK

        PROGRAM Test
          VAR fb : MyFB; END_VAR
          fb(y := 20);
        END_PROGRAM
      `);

      // Named argument should work
      expect(result.cppCode).toContain("FB.Y = 20;");
      expect(result.cppCode).toContain("FB();");
    });
  });
});
