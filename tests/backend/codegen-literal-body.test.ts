/**
 * Companion to codegen-var-initializers.test.ts (issue #133).
 *
 * The initializer fix lowers numeric literals on the declaration path so
 * it matches the statement-body path. These tests pin down the body path
 * itself — based literals, IEC underscore separators, typed-literal
 * prefixes, signs, and reals must lower to valid C++ wherever a literal
 * can appear (assignment RHS, conditions, arithmetic, array indices),
 * so the two paths can't drift apart later.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

/** Compile a program body and return just the `run()` method text. */
function runBody(statements: string, vars: string): string {
  const result = compile(`
    PROGRAM P
      VAR ${vars} END_VAR
      ${statements}
    END_PROGRAM
  `);
  expect(result.success).toBe(true);
  const lines = result.cppCode.split("\n");
  const start = lines.findIndex((l) => l.includes("void Program_P::run"));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((l, idx) => idx > start && l.trimEnd() === "}");
  return lines.slice(start, end + 1).join("\n");
}

describe("issue #133: statement-body literal lowering", () => {
  it("lowers based integer/bitstring literals", () => {
    const body = runBody("u := 16#FF; u := 8#17; u := 2#1010;", "u : UDINT;");
    expect(body).toContain("U = 0xFF;");
    expect(body).toContain("U = 017;");
    expect(body).toContain("U = 0b1010;");
  });

  it("strips IEC underscore separators", () => {
    const body = runBody("u := 16#FF_FF; u := 1_000;", "u : UDINT;");
    expect(body).toContain("U = 0xFFFF;");
    expect(body).toContain("U = 1000;");
  });

  it("lowers typed-literal prefixes to static_cast", () => {
    const body = runBody(
      "i := INT#5; i := INT#16#10; bt := BYTE#16#AB; wd := WORD#16#1234;",
      "i : INT; bt : BYTE; wd : WORD;",
    );
    expect(body).toContain("static_cast<IEC_INT>(5)");
    expect(body).toContain("static_cast<IEC_INT>(0x10)");
    expect(body).toContain("static_cast<IEC_BYTE>(0xAB)");
    expect(body).toContain("static_cast<IEC_WORD>(0x1234)");
  });

  it("preserves signs, including on based literals", () => {
    const body = runBody("i := -5; i := +3; li := -16#FF;", "i : INT; li : LINT;");
    expect(body).toContain("I = -5;");
    expect(body).toContain("I = +3;");
    expect(body).toContain("LI = -0xFF;");
  });

  it("lowers based literals inside conditions, arithmetic and indices", () => {
    const body = runBody(
      "IF u > 16#10 THEN u := u + 16#01; END_IF; arr[2#11] := 16#AA;",
      "u : UDINT; arr : ARRAY[0..15] OF INT;",
    );
    expect(body).toContain("U > 0x10");
    expect(body).toContain("U + 0x01");
    expect(body).toContain("ARR[0b11] = 0xAA;");
  });

  it("emits valid reals (decimal point or exponent)", () => {
    const body = runBody(
      "r := 1.5; r := 1.5E3; lr := 1.5E-10;",
      "r : REAL; lr : LREAL;",
    );
    expect(body).toContain("R = 1.5;");
    expect(body).toContain("R = 1500.0;");
    expect(body).toContain("LR = 1.5e-10;");
  });
});
