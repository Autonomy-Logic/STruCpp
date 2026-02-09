/**
 * Phase 3.5: Dynamic Memory Allocation - Code Generation Tests
 *
 * Tests that __NEW and __DELETE operators are correctly parsed and
 * translated to C++ iec_new/iec_delete runtime calls.
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
// __NEW Expression: Scalar Allocation
// =============================================================================

describe("Phase 3.5: __NEW Scalar Allocation", () => {
  it("should parse __NEW(INT) expression", () => {
    const result = compileST(`
      PROGRAM TestNewInt
        VAR
          pInt : INT;
        END_VAR
        pInt := __NEW(INT);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<INT_t>()");
  });

  it("should parse __NEW(REAL) expression", () => {
    const result = compileST(`
      PROGRAM TestNewReal
        VAR
          pReal : REAL;
        END_VAR
        pReal := __NEW(REAL);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<REAL_t>()");
  });

  it("should parse __NEW(BOOL) expression", () => {
    const result = compileST(`
      PROGRAM TestNewBool
        VAR
          pBool : BOOL;
        END_VAR
        pBool := __NEW(BOOL);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<BOOL_t>()");
  });

  it("should parse __NEW with user-defined type", () => {
    const result = compileST(`
      TYPE
        Point : STRUCT
          x : REAL;
          y : REAL;
        END_STRUCT;
      END_TYPE
      PROGRAM TestNewStruct
        VAR
          pPoint : INT;
        END_VAR
        pPoint := __NEW(Point);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<Point>()");
  });
});

// =============================================================================
// __NEW Expression: Array Allocation
// =============================================================================

describe("Phase 3.5: __NEW Array Allocation", () => {
  it("should parse __NEW(INT, 10) with literal size", () => {
    const result = compileST(`
      PROGRAM TestNewArray
        VAR
          pArr : INT;
        END_VAR
        pArr := __NEW(INT, 10);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new_array<INT_t>(10)");
  });

  it("should parse __NEW(REAL, size) with variable size", () => {
    const result = compileST(`
      PROGRAM TestNewArrayVar
        VAR
          pArr : REAL;
          size : INT;
        END_VAR
        size := 100;
        pArr := __NEW(REAL, size);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new_array<REAL_t>(size)");
  });

  it("should parse __NEW with expression as size", () => {
    const result = compileST(`
      PROGRAM TestNewArrayExpr
        VAR
          pArr : INT;
          n : INT;
        END_VAR
        n := 5;
        pArr := __NEW(INT, n * 2);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new_array<INT_t>(n * 2)");
  });
});

// =============================================================================
// __DELETE Statement
// =============================================================================

describe("Phase 3.5: __DELETE Statement", () => {
  it("should parse __DELETE(ptr) statement", () => {
    const result = compileST(`
      PROGRAM TestDelete
        VAR
          pInt : INT;
        END_VAR
        pInt := __NEW(INT);
        __DELETE(pInt);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<INT_t>()");
    expect(result.cppCode).toContain("strucpp::iec_delete(pInt)");
  });

  it("should parse __DELETE with struct pointer", () => {
    const result = compileST(`
      TYPE
        Data : STRUCT
          value : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM TestDeleteStruct
        VAR
          pData : INT;
        END_VAR
        pData := __NEW(Data);
        __DELETE(pData);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<Data>()");
    expect(result.cppCode).toContain("strucpp::iec_delete(pData)");
  });
});

// =============================================================================
// Combined __NEW and __DELETE Usage
// =============================================================================

describe("Phase 3.5: Combined __NEW/__DELETE Usage", () => {
  it("should handle allocate-use-free pattern", () => {
    const result = compileST(`
      PROGRAM TestAllocUseFree
        VAR
          pArr : INT;
          i : INT;
        END_VAR
        pArr := __NEW(INT, 10);
        i := 42;
        __DELETE(pArr);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new_array<INT_t>(10)");
    expect(result.cppCode).toContain("strucpp::iec_delete(pArr)");
  });

  it("should handle multiple allocations", () => {
    const result = compileST(`
      PROGRAM TestMultiAlloc
        VAR
          p1 : INT;
          p2 : INT;
        END_VAR
        p1 := __NEW(INT);
        p2 := __NEW(INT);
        __DELETE(p1);
        __DELETE(p2);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    // Should have two iec_new calls and two iec_delete calls
    const newCount = (result.cppCode.match(/strucpp::iec_new</g) || []).length;
    const deleteCount = (result.cppCode.match(/strucpp::iec_delete/g) || []).length;
    expect(newCount).toBe(2);
    expect(deleteCount).toBe(2);
  });
});

// =============================================================================
// Header Generation
// =============================================================================

describe("Phase 3.5: Header Includes", () => {
  it("should include iec_memory.hpp in generated header", () => {
    const result = compileST(`
      PROGRAM TestHeader
        VAR
          x : INT;
        END_VAR
        x := 1;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain('#include "iec_memory.hpp"');
  });
});

// =============================================================================
// Case-insensitive __NEW/__DELETE
// =============================================================================

describe("Phase 3.5: Case Insensitivity", () => {
  it("should accept lowercase __new", () => {
    const result = compileST(`
      PROGRAM TestLower
        VAR
          p : INT;
        END_VAR
        p := __new(INT);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_new<INT_t>()");
  });

  it("should accept lowercase __delete", () => {
    const result = compileST(`
      PROGRAM TestLowerDel
        VAR
          p : INT;
        END_VAR
        p := __NEW(INT);
        __delete(p);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("strucpp::iec_delete(p)");
  });
});
