/**
 * Regression tests for issue #133 — numeric literal lowering in VAR
 * initializers.
 *
 * IEC numeric literals used as VAR initial values reach the program /
 * global codegen path as raw IEC strings (project-model stringifies the
 * initializer expression). They must be lowered to valid C++ the same
 * way the expression-statement path lowers them — otherwise the
 * constructor initializer list emits e.g. `X(16#FF)` / `X(INT#5)` /
 * `X(1_000)` verbatim and the generated C++ fails to compile
 * (`stray '#' in program`, bad digit separators), or a signed literal
 * like `-5` is silently dropped to the type default.
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

/** Extract the constructor initializer-list line for a program. */
function initList(cpp: string): string {
  const line = cpp.split("\n").find((l) => l.trimStart().startsWith(": "));
  return line ?? "";
}

describe("issue #133: VAR initializer literal lowering", () => {
  it("lowers based integer/bitstring literals (16#, 8#, 2#)", () => {
    const { cppCode, success } = compileST(`
      PROGRAM P
        VAR
          h : UDINT := 16#FF;
          o : UDINT := 8#17;
          b : UDINT := 2#1010;
        END_VAR
        h := h;
      END_PROGRAM
    `);
    expect(success).toBe(true);
    const inits = initList(cppCode);
    expect(inits).toContain("H(0xFF)");
    expect(inits).toContain("O(017)");
    expect(inits).toContain("B(0b1010)");
    // No raw IEC based-literal marker must survive in the init list.
    expect(inits).not.toContain("#");
  });

  it("strips IEC underscore separators from initializers", () => {
    const { cppCode, success } = compileST(`
      PROGRAM P
        VAR
          x : UDINT := 16#FF_FF;
          y : UDINT := 1_000;
        END_VAR
        x := x;
      END_PROGRAM
    `);
    expect(success).toBe(true);
    const inits = initList(cppCode);
    expect(inits).toContain("X(0xFFFF)");
    expect(inits).toContain("Y(1000)");
    // The IEC underscore separators must be gone from the init list.
    expect(inits).not.toContain("_");
  });

  it("strips IEC typed-literal prefixes (INT#, BYTE#, REAL#)", () => {
    const { cppCode, success } = compileST(`
      PROGRAM P
        VAR
          a : INT  := INT#5;
          b : INT  := INT#16#10;
          c : BYTE := BYTE#16#AB;
          d : REAL := REAL#1.5;
        END_VAR
        a := a;
      END_PROGRAM
    `);
    expect(success).toBe(true);
    const inits = initList(cppCode);
    expect(inits).toContain("A(5)");
    expect(inits).toContain("B(0x10)");
    expect(inits).toContain("C(0xAB)");
    expect(inits).toContain("D(1.5)");
    expect(inits).not.toContain("#");
  });

  it("preserves the sign on negative/positive literal initializers", () => {
    const { cppCode, success } = compileST(`
      PROGRAM P
        VAR
          n : INT := -5;
          p : INT := +3;
        END_VAR
        n := n;
      END_PROGRAM
    `);
    expect(success).toBe(true);
    const inits = initList(cppCode);
    expect(inits).toContain("N(-5)");
    // A dropped sign would regress to the default 0.
    expect(inits).not.toContain("N(0)");
  });

  it("leaves decimals, reals and non-numeric initializers unchanged", () => {
    const { cppCode, success } = compileST(`
      PROGRAM P
        VAR
          d : UDINT := 255;
          r : REAL  := 1.5;
          e : REAL  := 1.5E3;
          t : BOOL  := TRUE;
        END_VAR
        d := d;
      END_PROGRAM
    `);
    expect(success).toBe(true);
    const inits = initList(cppCode);
    expect(inits).toContain("D(255)");
    expect(inits).toContain("R(1.5)");
    expect(inits).toContain("E(1.5E3)");
    expect(inits).toContain("T(true)");
  });

  it("lowers based literals in VAR_GLOBAL initializers too", () => {
    const { cppCode, success } = compileST(`
      CONFIGURATION Cfg
        VAR_GLOBAL
          g : UDINT := 16#CAFE;
        END_VAR
      END_CONFIGURATION
    `);
    expect(success).toBe(true);
    expect(cppCode).toContain("0xCAFE");
    expect(cppCode).not.toContain("16#");
  });
});
