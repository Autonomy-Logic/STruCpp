/**
 * STruC++ Codegen Function Tests
 *
 * Tests for C++ code generation of function calls.
 * Covers Phase 4.3: Enhanced Codegen for Function Calls.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

function compileAndCheck(source: string) {
  const result = compile(source);
  expect(result.success).toBe(true);
  return result;
}

describe("Codegen - Function Calls", () => {
  describe("user-defined function calls", () => {
    it("should generate code for function call in expression", () => {
      const result = compileAndCheck(`
        FUNCTION Square : INT
          VAR_INPUT x : INT; END_VAR
          Square := x * x;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Square(5);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("Square(");
    });

    it("should generate code for function call as statement", () => {
      const result = compileAndCheck(`
        FUNCTION DoWork : INT
          VAR_INPUT x : INT; END_VAR
          DoWork := x;
        END_FUNCTION

        PROGRAM Main
          DoWork(42);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("DoWork(");
    });

    it("should generate function with multiple parameters", () => {
      const result = compileAndCheck(`
        FUNCTION Add2 : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          Add2 := a + b;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Add2(3, 7);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("Add2(");
    });
  });

  describe("standard function name mapping", () => {
    it("should map DELETE to DELETE_STR", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR s : STRING; END_VAR
          s := DELETE(s, 2, 1);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("DELETE_STR(");
      expect(result.cppCode).not.toMatch(/[^_]DELETE\(/);
    });

    it("should pass through ABS directly", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR r : INT; END_VAR
          r := ABS(r);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("ABS(");
    });
  });

  describe("type conversion functions", () => {
    it("should convert INT_TO_REAL to TO_REAL", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR i : INT; r : REAL; END_VAR
          r := INT_TO_REAL(i);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("TO_REAL(");
      expect(result.cppCode).not.toContain("INT_TO_REAL(");
    });

    it("should convert REAL_TO_INT to TO_INT", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR i : INT; r : REAL; END_VAR
          i := REAL_TO_INT(r);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("TO_INT(");
    });

    it("should convert BOOL_TO_DINT to TO_DINT", () => {
      const result = compileAndCheck(`
        PROGRAM Main
          VAR b : BOOL; d : DINT; END_VAR
          d := BOOL_TO_DINT(b);
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("TO_DINT(");
    });
  });

  describe("function with VAR_OUTPUT", () => {
    it("should generate VAR_OUTPUT as reference parameter", () => {
      const result = compileAndCheck(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; r : INT; END_VAR
          q := Divide(10, 3, r => r);
        END_PROGRAM
      `);

      // The function header should have remainder as a reference
      expect(result.headerCode).toContain("IEC_INT& remainder");
    });
  });

  describe("nested function calls", () => {
    it("should generate nested calls correctly", () => {
      const result = compileAndCheck(`
        FUNCTION Inner : INT
          VAR_INPUT x : INT; END_VAR
          Inner := x * 2;
        END_FUNCTION

        FUNCTION Outer : INT
          VAR_INPUT y : INT; END_VAR
          Outer := y + 1;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Outer(Inner(5));
        END_PROGRAM
      `);

      expect(result.cppCode).toContain("Outer(Inner(");
    });
  });
});
