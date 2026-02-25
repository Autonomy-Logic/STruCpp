/**
 * Phase 3.3: Composite Type Access - Code Generation Tests
 *
 * Tests that array and structure access expressions are correctly
 * translated from ST to C++:
 * - Array element access: arr[i], arr[i,j]
 * - Structure member access: point.x, line.start.x
 * - Combined access: points[i].x
 *
 * Note: Array types are typically defined in TYPE blocks for clarity.
 * Phase 3.4 added inline ARRAY type syntax support in VAR declarations.
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
// Array Element Access Tests
// =============================================================================

describe("Phase 3.3: Array Element Access", () => {
  it("should generate 1D array element write", () => {
    const result = compileST(`
      TYPE
        IntArr10 : ARRAY[1..10] OF INT;
      END_TYPE
      PROGRAM TestArr1D
        VAR
          arr : IntArr10;
          i : INT;
        END_VAR
        arr[1] := 100;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ARR[1] = 100;");
  });

  it("should generate 1D array element read", () => {
    const result = compileST(`
      TYPE
        IntArr10 : ARRAY[1..10] OF INT;
      END_TYPE
      PROGRAM TestArr1DRead
        VAR
          arr : IntArr10;
          x : INT;
        END_VAR
        x := arr[5];
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("X = ARR[5];");
  });

  it("should generate array access with variable index", () => {
    const result = compileST(`
      TYPE
        IntArr10 : ARRAY[1..10] OF INT;
      END_TYPE
      PROGRAM TestArrVar
        VAR
          arr : IntArr10;
          i : INT;
        END_VAR
        arr[i] := arr[i] + 1;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ARR[I] = ARR[I] + 1;");
  });

  it("should generate array access with expression index", () => {
    const result = compileST(`
      TYPE
        IntArr10 : ARRAY[1..10] OF INT;
      END_TYPE
      PROGRAM TestArrExpr
        VAR
          arr : IntArr10;
          i : INT;
        END_VAR
        arr[i + 1] := arr[i - 1] + arr[i];
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ARR[I + 1] = ARR[I - 1] + ARR[I];");
  });

  it("should generate 2D array access with multiple subscripts", () => {
    const result = compileST(`
      TYPE
        Matrix3x3 : ARRAY[0..2, 0..2] OF REAL;
      END_TYPE
      PROGRAM TestArr2D
        VAR
          matrix : Matrix3x3;
          i : INT;
          j : INT;
        END_VAR
        matrix[0, 0] := 1.0;
        matrix[i, j] := 0.0;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("MATRIX(0, 0) = 1.0;");
    expect(result.cppCode).toContain("MATRIX(I, J) = 0.0;");
  });

  it("should generate array access in FOR loop", () => {
    const result = compileST(`
      TYPE
        IntArr5 : ARRAY[1..5] OF INT;
      END_TYPE
      PROGRAM TestArrLoop
        VAR
          arr : IntArr5;
          sum : INT;
          i : INT;
        END_VAR
        FOR i := 1 TO 5 DO
          arr[i] := i * 10;
        END_FOR;
        FOR i := 1 TO 5 DO
          sum := sum + arr[i];
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ARR[I] = I * 10;");
    expect(result.cppCode).toContain("SUM = SUM + ARR[I];");
  });
});

// =============================================================================
// Structure Member Access Tests
// =============================================================================

describe("Phase 3.3: Structure Member Access", () => {
  it("should generate struct member write", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM TestStruct
        VAR p : Point; END_VAR
        p.x := 10;
        p.y := 20;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("P.X = 10;");
    expect(result.cppCode).toContain("P.Y = 20;");
  });

  it("should generate struct member read", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM TestStructRead
        VAR p : Point; dist : INT; END_VAR
        dist := p.x + p.y;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("DIST = P.X + P.Y;");
  });

  it("should generate nested struct access", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
        Line : STRUCT
          startPt : Point;
          endPt : Point;
        END_STRUCT;
      END_TYPE
      PROGRAM TestNested
        VAR line : Line; END_VAR
        line.startPt.x := 0;
        line.endPt.y := 100;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("LINE_.STARTPT.X = 0;");
    expect(result.cppCode).toContain("LINE_.ENDPT.Y = 100;");
  });

  it("should generate struct assignment", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM TestStructAssign
        VAR p1 : Point; p2 : Point; END_VAR
        p2 := p1;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("P2 = P1;");
  });
});

// =============================================================================
// Combined Access Tests (Array of Struct)
// =============================================================================

describe("Phase 3.3: Combined Array/Struct Access", () => {
  it("should generate array of struct member access", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
        PointArr10 : ARRAY[1..10] OF Point;
      END_TYPE
      PROGRAM TestArrStruct
        VAR
          points : PointArr10;
          i : INT;
        END_VAR
        points[1].x := 100;
        points[i].y := 200;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("POINTS[1].X = 100;");
    expect(result.cppCode).toContain("POINTS[I].Y = 200;");
  });

  it("should generate array of struct access in loop", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
        PointArr3 : ARRAY[1..3] OF Point;
      END_TYPE
      PROGRAM TestArrStructLoop
        VAR
          points : PointArr3;
          i : INT;
        END_VAR
        FOR i := 1 TO 3 DO
          points[i].x := i;
          points[i].y := i * 2;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("POINTS[I].X = I;");
    expect(result.cppCode).toContain("POINTS[I].Y = I * 2;");
  });
});

// =============================================================================
// Validation Examples from Phase 3.3 Docs
// =============================================================================

describe("Phase 3.3: Validation Examples", () => {
  it("should handle array access and assignment (Test 1)", () => {
    const result = compileST(`
      TYPE
        IntArr5 : ARRAY[1..5] OF INT;
      END_TYPE
      PROGRAM TestArrayAccess
        VAR
          arr : IntArr5;
          sum : INT := 0;
          i : INT;
        END_VAR
        FOR i := 1 TO 5 DO
          arr[i] := i * 10;
        END_FOR;
        FOR i := 1 TO 5 DO
          sum := sum + arr[i];
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ARR[I] = I * 10;");
    expect(result.cppCode).toContain("SUM = SUM + ARR[I];");
  });

  it("should handle structure access (Test 2)", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM TestStructAccess
        VAR
          p1 : Point;
          p2 : Point;
          dist : INT;
        END_VAR
        p1.x := 0;
        p1.y := 0;
        p2.x := 3;
        p2.y := 4;
        dist := (p2.x - p1.x) + (p2.y - p1.y);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("P1.X = 0;");
    expect(result.cppCode).toContain("P1.Y = 0;");
    expect(result.cppCode).toContain("P2.X = 3;");
    expect(result.cppCode).toContain("P2.Y = 4;");
    expect(result.cppCode).toContain("DIST = (P2.X - P1.X) + (P2.Y - P1.Y);");
  });

  it("should handle array of structures (Test 3)", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
        PointArr3 : ARRAY[1..3] OF Point;
      END_TYPE
      PROGRAM TestArrayOfStruct
        VAR
          points : PointArr3;
          i : INT;
        END_VAR
        FOR i := 1 TO 3 DO
          points[i].x := i;
          points[i].y := i * 2;
        END_FOR;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("POINTS[I].X = I;");
    expect(result.cppCode).toContain("POINTS[I].Y = I * 2;");
  });
});
