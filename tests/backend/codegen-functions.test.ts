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

  describe("VAR_OUTPUT call-site codegen", () => {
    it("should pass variable as-is for output argument at call site", () => {
      const result = compileAndCheck(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; r : INT; END_VAR
          q := Divide(dividend := 10, divisor := 3, remainder => r);
        END_PROGRAM
      `);

      // The output argument r should be passed directly (no copies or temporaries)
      expect(result.cppCode).toMatch(/Divide\(10, 3, r\)/);
    });

    it("should handle mixed input/output with reordering", () => {
      const result = compileAndCheck(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; r : INT; END_VAR
          q := Divide(remainder => r, dividend := 10, divisor := 3);
        END_PROGRAM
      `);

      // Named args should be reordered to declaration order: (dividend, divisor, remainder)
      expect(result.cppCode).toMatch(/Divide\(10, 3, r\)/);
    });

    it("should warn when output argument is not a variable", () => {
      const result = compile(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; END_VAR
          q := Divide(dividend := 10, divisor := 3, remainder => (1 + 2));
        END_PROGRAM
      `);

      expect(result.success).toBe(true);
      const outputWarnings = result.warnings.filter((w) =>
        w.message.includes("should be a variable"),
      );
      expect(outputWarnings.length).toBe(1);
      expect(outputWarnings[0]!.message).toContain("remainder");
    });

    it("should warn when => is used on a VAR_INPUT parameter", () => {
      const result = compile(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; r : INT; END_VAR
          q := Divide(dividend => r, divisor := 3, remainder => r);
        END_PROGRAM
      `);

      expect(result.success).toBe(true);
      const directionWarnings = result.warnings.filter((w) =>
        w.message.includes("did you mean"),
      );
      expect(directionWarnings.length).toBe(1);
      expect(directionWarnings[0]!.message).toContain("dividend");
    });
  });

  describe("omitted VAR_OUTPUT arguments", () => {
    it("should generate temp variable for positional call omitting VAR_OUTPUT", () => {
      const result = compileAndCheck(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; END_VAR
          q := Divide(10, 3);
        END_PROGRAM
      `);

      // Should emit a temp variable declaration and pass it
      expect(result.cppCode).toContain("IEC_INT __output_tmp_0;");
      expect(result.cppCode).toMatch(/Divide\(10, 3, __output_tmp_0\)/);
    });

    it("should generate temp variable for named call omitting VAR_OUTPUT", () => {
      const result = compileAndCheck(`
        FUNCTION Divide : INT
          VAR_INPUT dividend : INT; divisor : INT; END_VAR
          VAR_OUTPUT remainder : INT; END_VAR
          remainder := dividend MOD divisor;
          Divide := dividend / divisor;
        END_FUNCTION

        PROGRAM Main
          VAR q : INT; END_VAR
          q := Divide(dividend := 10, divisor := 3);
        END_PROGRAM
      `);

      // Should emit a temp variable declaration and pass it
      expect(result.cppCode).toContain("IEC_INT __output_tmp_0;");
      expect(result.cppCode).toMatch(/Divide\(10, 3, __output_tmp_0\)/);
    });

    it("should generate multiple temp variables for multiple omitted VAR_OUTPUT", () => {
      const result = compileAndCheck(`
        FUNCTION MultiOut : INT
          VAR_INPUT x : INT; END_VAR
          VAR_OUTPUT y : INT; z : REAL; END_VAR
          y := x * 2;
          z := 3.14;
          MultiOut := x;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := MultiOut(5);
        END_PROGRAM
      `);

      // Should emit two temp variables
      expect(result.cppCode).toContain("IEC_INT __output_tmp_0;");
      expect(result.cppCode).toContain("IEC_REAL __output_tmp_1;");
      expect(result.cppCode).toMatch(
        /MultiOut\(5, __output_tmp_0, __output_tmp_1\)/,
      );
    });

    it("should handle partial omit — some VAR_OUTPUT provided, some not", () => {
      const result = compileAndCheck(`
        FUNCTION DivMod : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          VAR_OUTPUT quotient : INT; remainder : INT; END_VAR
          quotient := a / b;
          remainder := a MOD b;
          DivMod := a;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; q : INT; END_VAR
          r := DivMod(a := 10, b := 3, quotient => q);
        END_PROGRAM
      `);

      // quotient is provided (q), remainder should get a temp
      expect(result.cppCode).toContain("IEC_INT __output_tmp_0;");
      expect(result.cppCode).toMatch(/DivMod\(10, 3, q, __output_tmp_0\)/);
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

  describe("named argument reordering", () => {
    it("should reorder named args to match declaration order", () => {
      const result = compileAndCheck(`
        FUNCTION Calc : INT
          VAR_INPUT a : INT; b : INT; c : INT; END_VAR
          Calc := a + b + c;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(c := 30, a := 10, b := 20);
        END_PROGRAM
      `);

      // Named args should be reordered to (a, b, c) = (10, 20, 30)
      expect(result.cppCode).toMatch(/Calc\(10, 20, 30\)/);
    });

    it("should handle positional args after named args correctly", () => {
      const result = compileAndCheck(`
        FUNCTION Calc : INT
          VAR_INPUT a : INT; b : INT; c : INT; END_VAR
          Calc := a + b + c;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(b := 20, 10, 30);
        END_PROGRAM
      `);

      // b is claimed by named arg (20), positional 10 fills a, positional 30 fills c
      expect(result.cppCode).toMatch(/Calc\(10, 20, 30\)/);
    });

    it("should fill unfilled parameters with zero default", () => {
      const result = compileAndCheck(`
        FUNCTION Calc : INT
          VAR_INPUT a : INT; b : INT; c : INT; END_VAR
          Calc := a + b + c;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(a := 10);
        END_PROGRAM
      `);

      // a=10, b and c should get default 0
      expect(result.cppCode).toMatch(/Calc\(10, 0, 0\)/);
    });

    it("should use declared default values for unfilled parameters", () => {
      const result = compileAndCheck(`
        FUNCTION Calc : INT
          VAR_INPUT a : INT := 99; b : INT; c : INT := 77; END_VAR
          Calc := a + b + c;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(b := 5);
        END_PROGRAM
      `);

      // a defaults to 99, b=5, c defaults to 77
      expect(result.cppCode).toMatch(/Calc\(99, 5, 77\)/);
    });

    it("should warn about named args referencing non-existent parameters", () => {
      const result = compile(`
        FUNCTION Calc : INT
          VAR_INPUT x : INT; y : INT; END_VAR
          Calc := x + y;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(xx := 5, yy := 10);
        END_PROGRAM
      `);

      expect(result.success).toBe(true);
      // Should have warnings for unrecognized param names
      const typoWarnings = result.warnings.filter((w) =>
        w.message.includes("does not match any parameter"),
      );
      expect(typoWarnings.length).toBe(2);
      expect(typoWarnings[0]!.message).toContain("XX");
      expect(typoWarnings[1]!.message).toContain("YY");
    });

    it("should fill all slots with defaults when named args have typos", () => {
      const result = compile(`
        FUNCTION Calc : INT
          VAR_INPUT x : INT; y : INT; END_VAR
          Calc := x + y;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(xx := 5, yy := 10);
        END_PROGRAM
      `);

      expect(result.success).toBe(true);
      // x and y are unfilled (typos don't match), so they get default 0
      expect(result.cppCode).toMatch(/Calc\(0, 0\)/);
    });

    it("should handle mix of positional before named correctly", () => {
      const result = compileAndCheck(`
        FUNCTION Calc : INT
          VAR_INPUT a : INT; b : INT; c : INT; END_VAR
          Calc := a + b + c;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Calc(10, c := 30);
        END_PROGRAM
      `);

      // a=10 (positional), b=0 (unfilled default), c=30 (named)
      expect(result.cppCode).toMatch(/Calc\(10, 0, 30\)/);
    });

    it("should handle REAL parameter defaults correctly", () => {
      const result = compileAndCheck(`
        FUNCTION Scale : REAL
          VAR_INPUT value : REAL; factor : REAL; END_VAR
          Scale := value * factor;
        END_FUNCTION

        PROGRAM Main
          VAR r : REAL; END_VAR
          r := Scale(value := 3.14);
        END_PROGRAM
      `);

      // factor should default to 0.0 for REAL type
      expect(result.cppCode).toMatch(/Scale\(3\.14, 0\.0\)/);
    });
  });
});
