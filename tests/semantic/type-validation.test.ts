/**
 * STruC++ Type Validation Tests (Sub-Phase C)
 *
 * Tests that the type checker correctly reports type errors and warnings.
 */

import { describe, it, expect } from "vitest";
import { SemanticAnalyzer } from "../../src/semantic/analyzer.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { parse } from "../../src/frontend/parser.js";

/**
 * Helper: parse + build AST + semantic analysis.
 * Returns errors and warnings as string arrays.
 */
function analyzeSource(source: string): {
  errors: string[];
  warnings: string[];
} {
  const parseResult = parse(source);
  if (parseResult.errors.length > 0) {
    throw new Error(
      `Parse error: ${parseResult.errors.map((e: unknown) => (e as { message: string }).message).join(", ")}`,
    );
  }
  const ast = buildAST(parseResult.cst!, "test.st");
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);
  return {
    errors: result.errors.map((e) => e.message),
    warnings: result.warnings.map((e) => e.message),
  };
}

describe("Type Validation", () => {
  describe("Assignment Errors", () => {
    it("should error on assigning STRING to INT", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 'hello';
        END_PROGRAM
      `);
      expect(errors.some((e) => e.includes("Cannot assign"))).toBe(true);
      expect(errors.some((e) => e.includes("STRING") && e.includes("INT"))).toBe(
        true,
      );
    });

    it("should allow valid same-type assignment", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x, y : INT; END_VAR
          x := y;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should allow widening INT to DINT", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; y : DINT; END_VAR
          y := x;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should allow widening INT to REAL", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; y : REAL; END_VAR
          y := x;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should allow untyped integer literal to any integer type", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR a : SINT; b : USINT; c : UDINT; d : ULINT; END_VAR
          a := 0;
          b := 0;
          c := 0;
          d := 0;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should allow untyped real literal to LREAL", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : LREAL; END_VAR
          x := 3.14;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });
  });

  describe("Narrowing Warnings", () => {
    it("should warn on narrowing DINT to INT variable assignment", () => {
      const { warnings } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; y : DINT; END_VAR
          x := y;
        END_PROGRAM
      `);
      expect(
        warnings.some(
          (w) => w.includes("narrowing") && w.includes("DINT") && w.includes("INT"),
        ),
      ).toBe(true);
    });

    it("should not warn on same-type assignment", () => {
      const { warnings } = analyzeSource(`
        PROGRAM Main
          VAR x, y : INT; END_VAR
          x := y;
        END_PROGRAM
      `);
      const narrowingWarnings = warnings.filter((w) => w.includes("narrowing"));
      expect(narrowingWarnings).toHaveLength(0);
    });

    it("should not warn on untyped literal assignment", () => {
      const { warnings } = analyzeSource(`
        PROGRAM Main
          VAR x : SINT; END_VAR
          x := 42;
        END_PROGRAM
      `);
      const narrowingWarnings = warnings.filter((w) => w.includes("narrowing"));
      expect(narrowingWarnings).toHaveLength(0);
    });
  });

  describe("Condition Type Errors", () => {
    it("should error when IF condition is not boolean/bit type", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR s : STRING; END_VAR
          IF s THEN
            ;
          END_IF;
        END_PROGRAM
      `);
      expect(errors.some((e) => e.includes("Condition") && e.includes("boolean"))).toBe(true);
    });

    it("should allow BOOL condition", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR b : BOOL; END_VAR
          IF b THEN
            ;
          END_IF;
        END_PROGRAM
      `);
      const condErrors = errors.filter((e) => e.includes("Condition"));
      expect(condErrors).toHaveLength(0);
    });

    it("should allow BYTE condition (ANY_BIT)", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR b : BYTE; END_VAR
          IF b THEN
            ;
          END_IF;
        END_PROGRAM
      `);
      const condErrors = errors.filter((e) => e.includes("Condition"));
      expect(condErrors).toHaveLength(0);
    });

    it("should error when WHILE condition is INT", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; END_VAR
          WHILE x DO
            x := x - 1;
          END_WHILE;
        END_PROGRAM
      `);
      expect(errors.some((e) => e.includes("Condition") || e.includes("boolean"))).toBe(true);
    });
  });

  describe("FOR Statement Validation", () => {
    it("should error when FOR control variable is REAL", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR r : REAL; END_VAR
          FOR r := 0 TO 10 DO
            ;
          END_FOR;
        END_PROGRAM
      `);
      expect(
        errors.some((e) => e.includes("FOR") && e.includes("integer")),
      ).toBe(true);
    });

    it("should allow INT control variable", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR i : INT; END_VAR
          FOR i := 0 TO 10 DO
            ;
          END_FOR;
        END_PROGRAM
      `);
      const forErrors = errors.filter(
        (e) => e.includes("FOR") && e.includes("integer"),
      );
      expect(forErrors).toHaveLength(0);
    });
  });

  describe("Standard Function Argument Validation", () => {
    it("should error on wrong argument type for std function", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR s : STRING; r : INT; END_VAR
          r := ABS(s);
        END_PROGRAM
      `);
      // ABS expects ANY_NUM, STRING is not ANY_NUM
      expect(
        errors.some((e) => e.includes("ABS") || e.includes("ANY_NUM")),
      ).toBe(true);
    });

    it("should allow valid numeric argument for ABS", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; r : INT; END_VAR
          r := ABS(x);
        END_PROGRAM
      `);
      const absErrors = errors.filter((e) => e.includes("ABS"));
      expect(absErrors).toHaveLength(0);
    });
  });

  describe("CASE Selector Validation", () => {
    it("should error when CASE selector is STRING", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR s : STRING; END_VAR
          CASE s OF
            1: ;
          END_CASE;
        END_PROGRAM
      `);
      expect(
        errors.some(
          (e) => e.includes("CASE") && e.includes("integer"),
        ),
      ).toBe(true);
    });

    it("should allow INT selector", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; END_VAR
          CASE x OF
            1: x := 2;
          END_CASE;
        END_PROGRAM
      `);
      const caseErrors = errors.filter(
        (e) => e.includes("CASE") && e.includes("integer"),
      );
      expect(caseErrors).toHaveLength(0);
    });
  });

  describe("Cross-type assignments in real-world patterns", () => {
    it("should allow counter pattern (CV := CV + 1 where CV is UDINT)", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR cv : UDINT; END_VAR
          cv := cv + 1;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should allow timer pattern (STATE : SINT := 0)", () => {
      const { errors } = analyzeSource(`
        PROGRAM Main
          VAR state : SINT; END_VAR
          state := 0;
          state := 1;
          state := 2;
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });
  });

  describe("Method scope type validation", () => {
    it("should error on assigning STRING to method-local INT", () => {
      const { errors } = analyzeSource(`
        FUNCTION_BLOCK Worker
          METHOD Run : BOOL
            VAR temp : INT; END_VAR
            temp := 'hello';
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      expect(errors.some((e) => e.includes("Cannot assign"))).toBe(true);
      expect(
        errors.some((e) => e.includes("STRING") && e.includes("INT")),
      ).toBe(true);
    });

    it("should allow valid assignment to method-local variable", () => {
      const { errors } = analyzeSource(`
        FUNCTION_BLOCK Worker
          METHOD Run : BOOL
            VAR temp : INT; END_VAR
            temp := 42;
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should allow method to access FB member variables", () => {
      const { errors } = analyzeSource(`
        FUNCTION_BLOCK Worker
          VAR_INPUT inVal : INT; END_VAR
          VAR counter : INT; END_VAR
          METHOD Run : BOOL
            counter := inVal;
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      const undeclErrors = errors.filter((e) => e.includes("Undeclared"));
      expect(typeErrors).toHaveLength(0);
      expect(undeclErrors).toHaveLength(0);
    });

    it("should validate method return variable assignment", () => {
      const { errors } = analyzeSource(`
        FUNCTION_BLOCK Worker
          METHOD GetValue : INT
            GetValue := 'bad';
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      expect(errors.some((e) => e.includes("Cannot assign"))).toBe(true);
    });

    it("should allow method-local variable to shadow FB member", () => {
      const { errors } = analyzeSource(`
        FUNCTION_BLOCK Worker
          VAR counter : INT; END_VAR
          METHOD Run : BOOL
            VAR counter : REAL; END_VAR
            counter := 3.14;
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      // counter in method is REAL, so assigning 3.14 (REAL) should be fine
      const typeErrors = errors.filter((e) => e.includes("Cannot assign"));
      expect(typeErrors).toHaveLength(0);
    });

    it("should warn on narrowing inside method body", () => {
      const { warnings } = analyzeSource(`
        FUNCTION_BLOCK Worker
          METHOD Run : BOOL
            VAR small : INT; big : DINT; END_VAR
            small := big;
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      expect(
        warnings.some(
          (w) =>
            w.includes("narrowing") &&
            w.includes("DINT") &&
            w.includes("INT"),
        ),
      ).toBe(true);
    });
  });
});
