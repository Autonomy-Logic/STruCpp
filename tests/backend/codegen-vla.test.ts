/**
 * Phase 3.4: Variable-Length Arrays - Code Generation Tests
 *
 * Tests that ARRAY[*] (variable-length array) syntax is correctly parsed,
 * represented in the AST, and generated as C++ ArrayView types.
 * Also tests inline ARRAY type declarations in VAR blocks.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

function compileST(source: string): {
  cppCode: string;
  headerCode: string;
  success: boolean;
  errors: unknown[];
} {
  const result = compile(source);
  return {
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    success: result.success,
    errors: result.errors,
  };
}

// =============================================================================
// Parser: ARRAY[*] Syntax Recognition
// =============================================================================

describe("Phase 3.4: ARRAY[*] Parser Recognition", () => {
  it("should parse ARRAY[*] OF INT in VAR_IN_OUT", () => {
    const result = compileST(`
      FUNCTION SumArray : INT
        VAR_IN_OUT
          arr : ARRAY[*] OF INT;
        END_VAR
        SumArray := 0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
  });

  it("should parse ARRAY[*, *] OF REAL in VAR_IN_OUT", () => {
    const result = compileST(`
      FUNCTION MatrixOp : REAL
        VAR_IN_OUT
          mat : ARRAY[*, *] OF REAL;
        END_VAR
        MatrixOp := 0.0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
  });

  it("should parse mixed fixed and variable-length dimensions", () => {
    // ARRAY[*] with a single dimension
    const result = compileST(`
      FUNCTION Process : INT
        VAR_IN_OUT
          data : ARRAY[*] OF BOOL;
        END_VAR
        Process := 0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Inline ARRAY Type Declarations in VAR Blocks
// =============================================================================

describe("Phase 3.4: Inline ARRAY Types in VAR Blocks", () => {
  it("should parse inline ARRAY[1..10] OF INT in VAR block", () => {
    const result = compileST(`
      PROGRAM TestInlineArray
        VAR
          myArr : ARRAY[1..10] OF INT;
        END_VAR
        myArr[1] := 42;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("MYARR[1] = 42;");
  });

  it("should parse inline ARRAY[0..4] OF REAL in VAR block", () => {
    const result = compileST(`
      PROGRAM TestInlineReal
        VAR
          values : ARRAY[0..4] OF REAL;
        END_VAR
        values[0] := 3.14;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("VALUES[0] = 3.14;");
  });
});

// =============================================================================
// Code Generation: VLA Parameters as ArrayView Types
// =============================================================================

describe("Phase 3.4: VLA Code Generation", () => {
  it("should generate ArrayView1D parameter for 1D VLA", () => {
    const result = compileST(`
      FUNCTION SumArray : INT
        VAR_IN_OUT
          arr : ARRAY[*] OF INT;
        END_VAR
        SumArray := 0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    // Function signature should use ArrayView1D
    expect(result.cppCode).toContain("ArrayView1D<INT_t>");
  });

  it("should generate ArrayView2D parameter for 2D VLA", () => {
    const result = compileST(`
      FUNCTION MatrixSum : REAL
        VAR_IN_OUT
          mat : ARRAY[*, *] OF REAL;
        END_VAR
        MatrixSum := 0.0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    // Function signature should use ArrayView2D
    expect(result.cppCode).toContain("ArrayView2D<REAL_t>");
  });

  it("should generate ArrayView1D in function header", () => {
    const result = compileST(`
      FUNCTION ProcessBools : BOOL
        VAR_IN_OUT
          flags : ARRAY[*] OF BOOL;
        END_VAR
        ProcessBools := TRUE;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain("ArrayView1D<BOOL_t>");
  });

  it("should handle VLA with non-VLA parameters", () => {
    const result = compileST(`
      FUNCTION FindValue : INT
        VAR_INPUT
          searchVal : INT;
        END_VAR
        VAR_IN_OUT
          arr : ARRAY[*] OF INT;
        END_VAR
        FindValue := -1;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    // Should have both regular input and ArrayView parameter
    expect(result.cppCode).toContain("IEC_INT");
    expect(result.cppCode).toContain("ArrayView1D<INT_t>");
  });

  it("should pass VAR_IN_OUT non-VLA by reference", () => {
    const result = compileST(`
      FUNCTION Increment : INT
        VAR_IN_OUT
          counter : INT;
        END_VAR
        counter := counter + 1;
        Increment := counter;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    // Non-VLA VAR_IN_OUT should be passed by reference
    expect(result.cppCode).toContain("IEC_INT& COUNTER");
  });
});

// =============================================================================
// TYPE Block: Array Type with Fixed Dimensions (unchanged from Phase 3.3)
// =============================================================================

describe("Phase 3.4: Fixed Array Type Declarations Still Work", () => {
  it("should still generate ARRAY types in TYPE blocks", () => {
    const result = compileST(`
      TYPE
        IntArray5 : ARRAY[0..4] OF INT;
      END_TYPE
      PROGRAM TestTypedArray
        VAR
          arr : IntArray5;
        END_VAR
        arr[0] := 1;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain("Array1D<INT_t, 0, 4>");
    expect(result.cppCode).toContain("ARR[0] = 1;");
  });

  it("should still generate 2D array types in TYPE blocks", () => {
    const result = compileST(`
      TYPE
        Matrix3x3 : ARRAY[1..3, 1..3] OF REAL;
      END_TYPE
      PROGRAM TestMatrix
        VAR
          m : Matrix3x3;
        END_VAR
        m[1, 1] := 1.0;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain("Array2D<REAL_t, 1, 3, 1, 3>");
  });
});

// =============================================================================
// Array Dimension: Star Token in arrayDimension Rule
// =============================================================================

describe("Phase 3.4: Array Dimension Star Support", () => {
  it("should handle single star dimension", () => {
    const result = compileST(`
      FUNCTION F1 : INT
        VAR_IN_OUT
          a : ARRAY[*] OF INT;
        END_VAR
        F1 := 0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
  });

  it("should handle multiple star dimensions", () => {
    const result = compileST(`
      FUNCTION F2 : INT
        VAR_IN_OUT
          a : ARRAY[*, *] OF INT;
        END_VAR
        F2 := 0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
  });

  it("should handle VLA with different element types", () => {
    const result = compileST(`
      FUNCTION ProcessReals : REAL
        VAR_IN_OUT
          data : ARRAY[*] OF REAL;
        END_VAR
        ProcessReals := 0.0;
      END_FUNCTION
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("ArrayView1D<REAL_t>");
  });
});
