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
