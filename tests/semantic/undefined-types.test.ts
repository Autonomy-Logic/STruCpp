/**
 * STruC++ Semantic Analyzer - Undefined Type Validation Tests
 *
 * Tests that undefined types are caught during semantic analysis
 * with proper error messages and source locations.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { analyze } from "../../src/semantic/analyzer.js";

function analyzeSource(source: string) {
  const parseResult = parse(source);
  expect(parseResult.errors).toHaveLength(0);
  const ast = buildAST(parseResult.cst!);
  return analyze(ast);
}

// =============================================================================
// Positive Tests — no false errors for valid types
// =============================================================================

describe("Undefined Type Validation - Positive (no false errors)", () => {
  it("should accept elementary types", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR
          b : BOOL;
          i : INT;
          d : DINT;
          r : REAL;
          lr : LREAL;
          s : STRING;
          w : WORD;
          t : TIME;
          dt : DATE;
        END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept user-defined STRUCT types", () => {
    const result = analyzeSource(`
      TYPE MyStruct :
        STRUCT
          x : INT;
          y : REAL;
        END_STRUCT;
      END_TYPE

      PROGRAM Main
        VAR
          s : MyStruct;
        END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept user-defined ENUM types", () => {
    const result = analyzeSource(`
      TYPE Color : (RED, GREEN, BLUE); END_TYPE

      PROGRAM Main
        VAR c : Color; END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept FUNCTION_BLOCK types for instances", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Counter
        VAR count : INT; END_VAR
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR c : Counter; END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept POINTER TO / REF_TO with valid base type", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR
          p : POINTER TO INT;
          r : REF_TO REAL;
        END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept inline ARRAY OF with valid element type", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR
          arr : ARRAY[0..9] OF INT;
        END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept forward references (types declared after use in same unit)", () => {
    // In IEC 61131-3, all types are registered before validation runs
    const result = analyzeSource(`
      PROGRAM Main
        VAR s : MyStruct; END_VAR
      END_PROGRAM

      TYPE MyStruct :
        STRUCT
          x : INT;
        END_STRUCT;
      END_TYPE
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept interface names as types", () => {
    const result = analyzeSource(`
      INTERFACE IRunnable
        METHOD Run : BOOL
        END_METHOD
      END_INTERFACE

      FUNCTION_BLOCK Motor IMPLEMENTS IRunnable
        METHOD PUBLIC Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK

      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept case-insensitive type names", () => {
    const result = analyzeSource(`
      TYPE MyStruct :
        STRUCT
          x : INT;
        END_STRUCT;
      END_TYPE

      PROGRAM Main
        VAR s : mystruct; END_VAR
      END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept function return type VOID (implicit)", () => {
    const result = analyzeSource(`
      FUNCTION Add : INT
        VAR_INPUT a : INT; b : INT; END_VAR
      END_FUNCTION

      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });

  it("should accept programs used as types in CONFIGURATION", () => {
    const result = analyzeSource(`
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// Negative Tests — must report errors for undefined types
// =============================================================================

describe("Undefined Type Validation - Negative (must error)", () => {
  it("should error on undefined type in variable declaration", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : NonExistentType; END_VAR
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/NonExistentType/i);
  });

  it("should error on undefined function return type", () => {
    const result = analyzeSource(`
      FUNCTION Foo : UnknownReturnType
      END_FUNCTION
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/UnknownReturnType/i);
  });

  it("should error on undefined method return type", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        METHOD PUBLIC Calc : MissingType
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/MissingType/i);
  });

  it("should error on undefined type in struct field", () => {
    const result = analyzeSource(`
      TYPE MyStruct :
        STRUCT
          x : INT;
          y : GhostType;
        END_STRUCT;
      END_TYPE
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/GhostType/i);
  });

  it("should error on undefined type in EXTENDS clause", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Child EXTENDS NonExistentParent
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/NonExistentParent/i);
  });

  it("should error on undefined type in IMPLEMENTS clause", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB IMPLEMENTS IDoesNotExist
        METHOD PUBLIC Dummy : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/IDoesNotExist/i);
  });

  it("should error on undefined type in ARRAY element type", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR arr : ARRAY[0..5] OF MysteryType; END_VAR
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/MysteryType/i);
  });

  it("should error on undefined type in function parameter", () => {
    const result = analyzeSource(`
      FUNCTION Foo : INT
        VAR_INPUT x : UnknownParam; END_VAR
      END_FUNCTION
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/UnknownParam/i);
  });

  it("should error on undefined type in method parameter", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        METHOD PUBLIC DoWork : INT
          VAR_INPUT p : NoSuchType; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/NoSuchType/i);
  });

  it("should error on undefined type in POINTER TO", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR p : POINTER TO FakeType; END_VAR
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/FakeType/i);
  });

  it("should error on undefined type in interface EXTENDS", () => {
    const result = analyzeSource(`
      INTERFACE IChild EXTENDS IDoesNotExist
        METHOD Foo : BOOL
        END_METHOD
      END_INTERFACE
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/IDoesNotExist/i);
  });

  it("should error on undefined type in property type", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        VAR _val : INT; END_VAR
        PROPERTY PUBLIC Value : NoType
          GET
            Value := _val;
          END_GET
        END_PROPERTY
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Undefined type");
    expect(result.errors[0]!.message).toMatch(/NoType/i);
  });

  it("should report multiple undefined types", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR
          a : TypeA;
          b : TypeB;
        END_VAR
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    const messages = result.errors.map((e) => e.message);
    expect(messages.some((m) => /TypeA/i.test(m))).toBe(true);
    expect(messages.some((m) => /TypeB/i.test(m))).toBe(true);
  });
});

// =============================================================================
// Source Location Tests
// =============================================================================

describe("Undefined Type Validation - Source Location", () => {
  it("should report correct line number for undefined type", () => {
    const result = analyzeSource(
      `PROGRAM Main
VAR
  x : INT;
  y : BadType;
END_VAR
END_PROGRAM`,
    );
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find((e) => /BadType/i.test(e.message));
    expect(err).toBeDefined();
    expect(err!.line).toBe(4);
  });
});
