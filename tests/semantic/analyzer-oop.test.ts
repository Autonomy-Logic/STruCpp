/**
 * STruC++ Semantic Analyzer OOP Tests
 *
 * Tests for semantic validation of OOP modifier contradictions.
 * Verifies that ABSTRACT+FINAL and other invalid modifier combinations
 * are caught during semantic analysis.
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

describe("Semantic Analyzer - OOP Modifier Validation", () => {
  it("should error when FB is both ABSTRACT and FINAL", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ABSTRACT FINAL Motor
        VAR _speed : INT; END_VAR
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("ABSTRACT");
    expect(result.errors[0].message).toContain("FINAL");
  });

  it("should error when ABSTRACT method is in non-abstract FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        METHOD PUBLIC ABSTRACT Calculate : REAL
          VAR_INPUT input : REAL; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("ABSTRACT");
    expect(result.errors[0].message).toContain("not ABSTRACT");
  });

  it("should error when method is both ABSTRACT and FINAL", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ABSTRACT Motor
        METHOD PUBLIC ABSTRACT FINAL Calculate : REAL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain("ABSTRACT");
    expect(result.errors[0].message).toContain("FINAL");
  });

  it("should allow ABSTRACT method in ABSTRACT FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ABSTRACT BaseController
        METHOD PUBLIC ABSTRACT Calculate : REAL
          VAR_INPUT input : REAL; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    // Should not have errors related to OOP modifiers
    const oopErrors = result.errors.filter(
      (e) => e.message.includes("ABSTRACT") || e.message.includes("FINAL"),
    );
    expect(oopErrors).toHaveLength(0);
  });

  it("should allow FINAL FB without ABSTRACT", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK FINAL SealedMotor
        VAR _speed : INT; END_VAR
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    const oopErrors = result.errors.filter(
      (e) => e.message.includes("ABSTRACT") || e.message.includes("FINAL"),
    );
    expect(oopErrors).toHaveLength(0);
  });
});

describe("Semantic Analyzer - FINAL Enforcement", () => {
  it("should error when extending a FINAL FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK FINAL BaseMotor
        VAR _speed : INT; END_VAR
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        VAR _torque : INT; END_VAR
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Cannot extend FINAL"))).toBe(true);
  });

  it("should error when overriding a FINAL method", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        METHOD PUBLIC FINAL GetSpeed : INT
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        METHOD PUBLIC OVERRIDE GetSpeed : INT
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Cannot override FINAL method"))).toBe(true);
  });

  it("should allow extending a non-FINAL FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        VAR _speed : INT; END_VAR
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        VAR _torque : INT; END_VAR
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    const finalErrors = result.errors.filter((e) => e.message.includes("FINAL"));
    expect(finalErrors).toHaveLength(0);
  });

  it("should allow overriding a non-FINAL method", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        METHOD PUBLIC GetSpeed : INT
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        METHOD PUBLIC OVERRIDE GetSpeed : INT
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    const finalErrors = result.errors.filter((e) => e.message.includes("FINAL"));
    expect(finalErrors).toHaveLength(0);
  });
});

describe("Semantic Analyzer - Abstract FB Instantiation", () => {
  it("should error when instantiating abstract FB in PROGRAM", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ABSTRACT BaseController
        METHOD PUBLIC ABSTRACT Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR ctrl : BaseController; END_VAR
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Cannot instantiate ABSTRACT"))).toBe(true);
  });

  it("should error when instantiating abstract FB in another FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ABSTRACT BaseController
        METHOD PUBLIC ABSTRACT Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK Container
        VAR ctrl : BaseController; END_VAR
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Cannot instantiate ABSTRACT"))).toBe(true);
  });

  it("should allow concrete FB instantiation", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ConcreteController
        METHOD PUBLIC Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR ctrl : ConcreteController; END_VAR
      END_PROGRAM
    `);
    const abstractErrors = result.errors.filter((e) => e.message.includes("Cannot instantiate ABSTRACT"));
    expect(abstractErrors).toHaveLength(0);
  });

  it("should allow abstract FB used only as EXTENDS base", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK ABSTRACT BaseController
        METHOD PUBLIC ABSTRACT Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK ConcreteController EXTENDS BaseController
        METHOD PUBLIC OVERRIDE Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR ctrl : ConcreteController; END_VAR
      END_PROGRAM
    `);
    const abstractErrors = result.errors.filter((e) => e.message.includes("Cannot instantiate ABSTRACT"));
    expect(abstractErrors).toHaveLength(0);
  });
});

describe("Semantic Analyzer - Method Override Signature Matching", () => {
  it("should error when override has different parameter types", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        METHOD PUBLIC Calculate : REAL
          VAR_INPUT speed : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        METHOD PUBLIC OVERRIDE Calculate : REAL
          VAR_INPUT speed : REAL; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("different signature"))).toBe(true);
  });

  it("should error when override has different parameter count", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        METHOD PUBLIC Calculate : REAL
          VAR_INPUT speed : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        METHOD PUBLIC OVERRIDE Calculate : REAL
          VAR_INPUT speed : INT; END_VAR
          VAR_INPUT torque : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("different signature"))).toBe(true);
  });

  it("should error when override has different return type", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        METHOD PUBLIC Calculate : REAL
          VAR_INPUT speed : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        METHOD PUBLIC OVERRIDE Calculate : INT
          VAR_INPUT speed : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("different signature"))).toBe(true);
  });

  it("should allow override with matching signature", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK BaseMotor
        METHOD PUBLIC Calculate : REAL
          VAR_INPUT speed : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS BaseMotor
        METHOD PUBLIC OVERRIDE Calculate : REAL
          VAR_INPUT speed : INT; END_VAR
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    const sigErrors = result.errors.filter((e) => e.message.includes("different signature"));
    expect(sigErrors).toHaveLength(0);
  });
});

describe("Semantic Analyzer - Read-only Property Write", () => {
  it("should error when assigning to a property with no setter", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        VAR _speed : INT; END_VAR
        PROPERTY PUBLIC Speed : INT
          GET
            Speed := _speed;
          END_GET
        END_PROPERTY
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR m : Motor; END_VAR
        m.Speed := 100;
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("read-only"))).toBe(true);
  });

  it("should allow assigning to a property with setter", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        VAR _speed : INT; END_VAR
        PROPERTY PUBLIC Speed : INT
          GET
            Speed := _speed;
          END_GET
          SET
            _speed := Speed;
          END_SET
        END_PROPERTY
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR m : Motor; END_VAR
        m.Speed := 100;
      END_PROGRAM
    `);
    const propErrors = result.errors.filter((e) => e.message.includes("read-only"));
    expect(propErrors).toHaveLength(0);
  });

  it("should allow reading from a property with no setter", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        VAR _speed : INT; END_VAR
        PROPERTY PUBLIC Speed : INT
          GET
            Speed := _speed;
          END_GET
        END_PROPERTY
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR m : Motor; END_VAR
        VAR x : INT; END_VAR
        x := m.Speed;
      END_PROGRAM
    `);
    const propErrors = result.errors.filter((e) => e.message.includes("read-only"));
    expect(propErrors).toHaveLength(0);
  });
});

describe("Semantic Analyzer - Access Modifier Enforcement", () => {
  it("should error when calling PRIVATE method from PROGRAM", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        METHOD PRIVATE InternalCalc : INT
        END_METHOD
        METHOD PUBLIC Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR m : Motor; END_VAR
        m.InternalCalc();
      END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("PRIVATE"))).toBe(true);
  });

  it("should error when calling PRIVATE method from different FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        METHOD PRIVATE InternalCalc : INT
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK Controller
        VAR m : Motor; END_VAR
        METHOD PUBLIC Run : BOOL
          m.InternalCalc();
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("PRIVATE"))).toBe(true);
  });

  it("should allow calling PUBLIC method from anywhere", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        METHOD PUBLIC Run : BOOL
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR m : Motor; END_VAR
        m.Run();
      END_PROGRAM
    `);
    const accessErrors = result.errors.filter(
      (e) => e.message.includes("PRIVATE") || e.message.includes("PROTECTED"),
    );
    expect(accessErrors).toHaveLength(0);
  });

  it("should error when calling PROTECTED method from non-derived FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        METHOD PROTECTED InternalCalc : INT
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK Controller
        VAR m : Motor; END_VAR
        METHOD PUBLIC Run : BOOL
          m.InternalCalc();
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("PROTECTED"))).toBe(true);
  });

  it("should allow calling PROTECTED method from derived FB", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Motor
        METHOD PROTECTED InternalCalc : INT
        END_METHOD
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK DerivedMotor EXTENDS Motor
        VAR m : Motor; END_VAR
        METHOD PUBLIC Run : BOOL
          m.InternalCalc();
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main END_PROGRAM
    `);
    const accessErrors = result.errors.filter((e) => e.message.includes("PROTECTED"));
    expect(accessErrors).toHaveLength(0);
  });
});
