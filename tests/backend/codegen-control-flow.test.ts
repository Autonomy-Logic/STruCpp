/**
 * Phase 3.2: Control Flow Statements - Code Generation Tests
 *
 * Tests that control flow statements are correctly translated from ST to C++:
 * - IF/ELSIF/ELSE → if/else if/else
 * - CASE → switch/case with range expansion
 * - FOR → for loop with direction detection
 * - WHILE → while loop
 * - REPEAT → do-while with negated condition
 * - EXIT → break
 * - RETURN → return (with function result in functions)
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

function compileST(source: string): { cppCode: string; headerCode: string; success: boolean; errors: unknown[] } {
  const result = compile(source);
  return {
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    success: result.success,
    errors: result.errors,
  };
}

// =============================================================================
// IF Statement Tests
// =============================================================================

describe("Phase 3.2: IF Statement Code Generation", () => {
  it("should generate simple IF statement", () => {
    const result = compileST(`
      PROGRAM TestIf
        VAR x : INT; y : INT; END_VAR
        IF x > 0 THEN
          y := 1;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X > 0) {");
    expect(result.cppCode).toContain("Y = 1;");
    expect(result.cppCode).toContain("}");
  });

  it("should generate IF-ELSE statement", () => {
    const result = compileST(`
      PROGRAM TestIfElse
        VAR x : INT; y : INT; END_VAR
        IF x > 0 THEN
          y := 1;
        ELSE
          y := -1;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X > 0) {");
    expect(result.cppCode).toContain("Y = 1;");
    expect(result.cppCode).toContain("} else {");
    expect(result.cppCode).toContain("Y = -1;");
  });

  it("should generate IF-ELSIF-ELSE chain", () => {
    const result = compileST(`
      PROGRAM TestIfElsif
        VAR x : INT; result : INT; END_VAR
        IF x < 0 THEN
          result := -1;
        ELSIF x = 0 THEN
          result := 0;
        ELSE
          result := 1;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X < 0) {");
    expect(result.cppCode).toContain("RESULT = -1;");
    expect(result.cppCode).toContain("} else if (X == 0) {");
    expect(result.cppCode).toContain("RESULT = 0;");
    expect(result.cppCode).toContain("} else {");
    expect(result.cppCode).toContain("RESULT = 1;");
  });

  it("should generate multiple ELSIF clauses", () => {
    const result = compileST(`
      PROGRAM TestMultiElsif
        VAR x : INT; result : INT; END_VAR
        IF x = 1 THEN
          result := 10;
        ELSIF x = 2 THEN
          result := 20;
        ELSIF x = 3 THEN
          result := 30;
        ELSE
          result := 0;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X == 1) {");
    expect(result.cppCode).toContain("} else if (X == 2) {");
    expect(result.cppCode).toContain("} else if (X == 3) {");
    expect(result.cppCode).toContain("} else {");
  });

  it("should generate nested IF statements", () => {
    const result = compileST(`
      PROGRAM TestNestedIf
        VAR x : INT; y : INT; result : INT; END_VAR
        IF x > 0 THEN
          IF y > 0 THEN
            result := 1;
          ELSE
            result := 2;
          END_IF;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X > 0) {");
    expect(result.cppCode).toContain("if (Y > 0) {");
    expect(result.cppCode).toContain("RESULT = 1;");
    expect(result.cppCode).toContain("} else {");
    expect(result.cppCode).toContain("RESULT = 2;");
  });
});

// =============================================================================
// CASE Statement Tests
// =============================================================================

describe("Phase 3.2: CASE Statement Code Generation", () => {
  it("should generate simple CASE statement", () => {
    const result = compileST(`
      PROGRAM TestCase
        VAR state : INT; x : INT; END_VAR
        CASE state OF
          1: x := 10;
          2: x := 20;
          3: x := 30;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("switch (STATE) {");
    expect(result.cppCode).toContain("case 1:");
    expect(result.cppCode).toContain("X = 10;");
    expect(result.cppCode).toContain("break;");
    expect(result.cppCode).toContain("case 2:");
    expect(result.cppCode).toContain("X = 20;");
    expect(result.cppCode).toContain("case 3:");
    expect(result.cppCode).toContain("X = 30;");
  });

  it("should generate CASE with multiple labels (fall-through)", () => {
    const result = compileST(`
      PROGRAM TestCaseMulti
        VAR state : INT; x : INT; END_VAR
        CASE state OF
          1, 2, 3: x := 100;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("case 1:");
    expect(result.cppCode).toContain("case 2:");
    expect(result.cppCode).toContain("case 3:");
    expect(result.cppCode).toContain("X = 100;");
  });

  it("should generate CASE with range expansion", () => {
    const result = compileST(`
      PROGRAM TestCaseRange
        VAR state : INT; x : INT; END_VAR
        CASE state OF
          4..6: x := 200;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("case 4:");
    expect(result.cppCode).toContain("case 5:");
    expect(result.cppCode).toContain("case 6:");
    expect(result.cppCode).toContain("X = 200;");
  });

  it("should generate CASE with ELSE (default)", () => {
    const result = compileST(`
      PROGRAM TestCaseElse
        VAR state : INT; x : INT; END_VAR
        CASE state OF
          1: x := 10;
        ELSE
          x := 0;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("case 1:");
    expect(result.cppCode).toContain("X = 10;");
    expect(result.cppCode).toContain("default:");
    expect(result.cppCode).toContain("X = 0;");
  });

  it("should generate CASE with mixed labels and ranges", () => {
    const result = compileST(`
      PROGRAM TestCaseMixed
        VAR grade : INT; letter : INT; END_VAR
        CASE grade OF
          90..100: letter := 65;
          80..89: letter := 66;
          70..79: letter := 67;
        ELSE
          letter := 70;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("switch (GRADE) {");
    expect(result.cppCode).toContain("case 90:");
    expect(result.cppCode).toContain("case 100:");
    expect(result.cppCode).toContain("case 80:");
    expect(result.cppCode).toContain("case 89:");
    expect(result.cppCode).toContain("default:");
  });
});

// =============================================================================
// FOR Statement Tests
// =============================================================================

describe("Phase 3.2: FOR Statement Code Generation", () => {
  it("should generate ascending FOR loop (default step)", () => {
    const result = compileST(`
      PROGRAM TestFor
        VAR i : INT; sum : INT; END_VAR
        FOR i := 1 TO 10 DO
          sum := sum + i;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 1; I <= 10; I++) {");
    expect(result.cppCode).toContain("SUM = SUM + I;");
  });

  it("should generate FOR loop with positive BY step", () => {
    const result = compileST(`
      PROGRAM TestForStep
        VAR i : INT; sum : INT; END_VAR
        FOR i := 1 TO 10 BY 2 DO
          sum := sum + i;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 1; I <= 10; I += 2) {");
  });

  it("should generate descending FOR loop with negative step", () => {
    const result = compileST(`
      PROGRAM TestForDesc
        VAR i : INT; sum : INT; END_VAR
        FOR i := 10 TO 1 BY -1 DO
          sum := sum + i;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 10; I >= 1; I += -1) {");
  });

  it("should generate FOR loop with expression bounds", () => {
    const result = compileST(`
      PROGRAM TestForExpr
        VAR i : INT; n : INT; sum : INT; END_VAR
        FOR i := 0 TO n DO
          sum := sum + i;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 0; I <= N; I++) {");
  });
});

// =============================================================================
// WHILE Statement Tests
// =============================================================================

describe("Phase 3.2: WHILE Statement Code Generation", () => {
  it("should generate WHILE loop", () => {
    const result = compileST(`
      PROGRAM TestWhile
        VAR count : INT; END_VAR
        WHILE count < 100 DO
          count := count + 1;
        END_WHILE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("while (COUNT < 100) {");
    expect(result.cppCode).toContain("COUNT = COUNT + 1;");
  });

  it("should generate WHILE loop with complex condition", () => {
    const result = compileST(`
      PROGRAM TestWhileComplex
        VAR x : INT; y : INT; END_VAR
        WHILE (x < 10) AND (y > 0) DO
          x := x + 1;
          y := y - 1;
        END_WHILE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("while ((X < 10) && (Y > 0)) {");
    expect(result.cppCode).toContain("X = X + 1;");
    expect(result.cppCode).toContain("Y = Y - 1;");
  });
});

// =============================================================================
// REPEAT Statement Tests
// =============================================================================

describe("Phase 3.2: REPEAT Statement Code Generation", () => {
  it("should generate REPEAT as do-while with negated condition", () => {
    const result = compileST(`
      PROGRAM TestRepeat
        VAR count : INT; END_VAR
        REPEAT
          count := count + 1;
        UNTIL count >= 100
        END_REPEAT;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("do {");
    expect(result.cppCode).toContain("COUNT = COUNT + 1;");
    expect(result.cppCode).toContain("} while (!(COUNT >= 100));");
  });

  it("should generate REPEAT with simple condition", () => {
    const result = compileST(`
      PROGRAM TestRepeatSimple
        VAR n : INT; factorial : INT; END_VAR
        REPEAT
          factorial := factorial * n;
          n := n + 1;
        UNTIL n > 5
        END_REPEAT;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("do {");
    expect(result.cppCode).toContain("FACTORIAL = FACTORIAL * N;");
    expect(result.cppCode).toContain("N = N + 1;");
    expect(result.cppCode).toContain("} while (!(N > 5));");
  });
});

// =============================================================================
// EXIT Statement Tests
// =============================================================================

describe("Phase 3.2: EXIT Statement Code Generation", () => {
  it("should generate EXIT as break", () => {
    const result = compileST(`
      PROGRAM TestExit
        VAR i : INT; sum : INT; END_VAR
        FOR i := 1 TO 100 DO
          sum := sum + i;
          IF sum > 50 THEN
            EXIT;
          END_IF;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 1; I <= 100; I++) {");
    expect(result.cppCode).toContain("if (SUM > 50) {");
    expect(result.cppCode).toContain("break;");
  });

  it("should generate EXIT in WHILE loop", () => {
    const result = compileST(`
      PROGRAM TestExitWhile
        VAR done : BOOL; x : INT; END_VAR
        WHILE NOT done DO
          x := x + 1;
          IF x > 10 THEN
            EXIT;
          END_IF;
        END_WHILE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("while (!DONE) {");
    expect(result.cppCode).toContain("break;");
  });
});

// =============================================================================
// RETURN Statement Tests
// =============================================================================

describe("Phase 3.2: RETURN Statement Code Generation", () => {
  it("should generate RETURN in program as plain return", () => {
    const result = compileST(`
      PROGRAM TestReturn
        VAR x : INT; END_VAR
        IF x < 0 THEN
          RETURN;
        END_IF;
        x := x + 1;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("return;");
  });

  it("should generate RETURN in function with result variable", () => {
    const result = compileST(`
      FUNCTION Abs : INT
        VAR_INPUT x : INT; END_VAR
        IF x < 0 THEN
          Abs := -x;
          RETURN;
        END_IF;
        Abs := x;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ABS_result = -X;");
    expect(result.cppCode).toContain("return ABS_result;");
  });
});

// =============================================================================
// Complex / Combined Tests
// =============================================================================

describe("Phase 3.2: Complex Control Flow", () => {
  it("should handle nested loops with EXIT", () => {
    const result = compileST(`
      PROGRAM TestNested
        VAR i : INT; j : INT; found : BOOL; END_VAR
        FOR i := 0 TO 9 DO
          FOR j := 0 TO 9 DO
            IF i = j THEN
              found := TRUE;
              EXIT;
            END_IF;
          END_FOR;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 0; I <= 9; I++) {");
    expect(result.cppCode).toContain("for (J = 0; J <= 9; J++) {");
    expect(result.cppCode).toContain("if (I == J) {");
    expect(result.cppCode).toContain("FOUND = true;");
    expect(result.cppCode).toContain("break;");
  });

  it("should handle validation example: nested IF with ELSIF", () => {
    const result = compileST(`
      PROGRAM TestIf
        VAR
          x : INT := 10;
          result : INT;
        END_VAR
        IF x < 0 THEN
          result := -1;
        ELSIF x = 0 THEN
          result := 0;
        ELSE
          result := 1;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X < 0) {");
    expect(result.cppCode).toContain("RESULT = -1;");
    expect(result.cppCode).toContain("} else if (X == 0) {");
    expect(result.cppCode).toContain("RESULT = 0;");
    expect(result.cppCode).toContain("} else {");
    expect(result.cppCode).toContain("RESULT = 1;");
  });

  it("should handle validation example: FOR loop with EXIT", () => {
    const result = compileST(`
      PROGRAM TestFor
        VAR
          sum : INT := 0;
          i : INT;
        END_VAR
        FOR i := 1 TO 100 DO
          sum := sum + i;
          IF sum > 50 THEN
            EXIT;
          END_IF;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("for (I = 1; I <= 100; I++) {");
    expect(result.cppCode).toContain("SUM = SUM + I;");
    expect(result.cppCode).toContain("if (SUM > 50) {");
    expect(result.cppCode).toContain("break;");
  });

  it("should handle validation example: WHILE loop", () => {
    const result = compileST(`
      PROGRAM TestWhile
        VAR
          count : INT := 0;
          sum : INT := 0;
        END_VAR
        WHILE count < 5 DO
          count := count + 1;
          sum := sum + count;
        END_WHILE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("while (COUNT < 5) {");
    expect(result.cppCode).toContain("COUNT = COUNT + 1;");
    expect(result.cppCode).toContain("SUM = SUM + COUNT;");
  });

  it("should handle validation example: REPEAT-UNTIL", () => {
    const result = compileST(`
      PROGRAM TestRepeat
        VAR
          n : INT := 1;
          factorial : INT := 1;
        END_VAR
        REPEAT
          factorial := factorial * n;
          n := n + 1;
        UNTIL n > 5
        END_REPEAT;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("do {");
    expect(result.cppCode).toContain("FACTORIAL = FACTORIAL * N;");
    expect(result.cppCode).toContain("N = N + 1;");
    expect(result.cppCode).toContain("} while (!(N > 5));");
  });

  it("should handle CASE with ranges (validation example)", () => {
    const result = compileST(`
      PROGRAM TestCase
        VAR
          grade : INT := 85;
          letter : INT;
        END_VAR
        CASE grade OF
          90..100: letter := 65;
          80..89: letter := 66;
          70..79: letter := 67;
          60..69: letter := 68;
        ELSE
          letter := 70;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("switch (GRADE) {");
    // Check some range expansion
    expect(result.cppCode).toContain("case 90:");
    expect(result.cppCode).toContain("case 91:");
    expect(result.cppCode).toContain("case 100:");
    expect(result.cppCode).toContain("LETTER = 65;");
    expect(result.cppCode).toContain("case 80:");
    expect(result.cppCode).toContain("case 89:");
    expect(result.cppCode).toContain("LETTER = 66;");
    expect(result.cppCode).toContain("default:");
    expect(result.cppCode).toContain("LETTER = 70;");
  });

  it("should handle control flow in function block", () => {
    const result = compileST(`
      FUNCTION_BLOCK Counter
        VAR_INPUT enable : BOOL; END_VAR
        VAR_OUTPUT count : INT; END_VAR
        VAR prev : BOOL; END_VAR
        IF enable AND NOT prev THEN
          count := count + 1;
        END_IF;
        prev := enable;
      END_FUNCTION_BLOCK
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (ENABLE && !PREV) {");
    expect(result.cppCode).toContain("COUNT = COUNT + 1;");
    expect(result.cppCode).toContain("PREV = ENABLE;");
  });

  it("should handle IF-ELSIF without ELSE", () => {
    const result = compileST(`
      PROGRAM TestIfNoElse
        VAR x : INT; result : INT; END_VAR
        IF x = 1 THEN
          result := 10;
        ELSIF x = 2 THEN
          result := 20;
        END_IF;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("if (X == 1) {");
    expect(result.cppCode).toContain("} else if (X == 2) {");
    // The user program function should NOT contain } else { (no else clause)
    // Extract just the user program's run() method (names are uppercased in codegen)
    const progStart = result.cppCode.indexOf("::run()");
    expect(progStart).toBeGreaterThan(-1);
    const progSection = result.cppCode.slice(progStart);
    // Only check up to end of the function (closing namespace brace)
    const nsEnd = progSection.indexOf("}  // namespace");
    const funcSection = nsEnd > 0 ? progSection.slice(0, nsEnd) : progSection;
    const lines = funcSection.split("\n");
    const elseLines = lines.filter(l => l.trim() === "} else {");
    expect(elseLines.length).toBe(0);
  });

  it("should handle CASE without ELSE", () => {
    const result = compileST(`
      PROGRAM TestCaseNoElse
        VAR state : INT; x : INT; END_VAR
        CASE state OF
          1: x := 10;
          2: x := 20;
        END_CASE;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("switch (STATE) {");
    expect(result.cppCode).toContain("case 1:");
    expect(result.cppCode).toContain("case 2:");
    // Should NOT contain default:
    expect(result.cppCode).not.toContain("default:");
  });
});
