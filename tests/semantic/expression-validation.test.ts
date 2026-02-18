/**
 * STruC++ Semantic Analyzer - Expression Validation Tests
 *
 * Tests for bit access bounds checking and ADR l-value validation.
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

describe("Semantic Analyzer - Bit Access Validation", () => {
  it("should accept valid bit access on BYTE (0..7)", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR b : BYTE; END_VAR
        b.7 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index") || e.message.includes("Bit access"),
    );
    expect(bitErrors).toHaveLength(0);
  });

  it("should error on out-of-range bit access on BYTE", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR b : BYTE; END_VAR
        b.8 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index"),
    );
    expect(bitErrors).toHaveLength(1);
    expect(bitErrors[0]!.message).toContain("Bit index 8");
    expect(bitErrors[0]!.message).toContain("BYTE");
    expect(bitErrors[0]!.message).toContain("0..7");
  });

  it("should accept valid bit access on WORD (0..15)", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR w : WORD; END_VAR
        w.15 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index") || e.message.includes("Bit access"),
    );
    expect(bitErrors).toHaveLength(0);
  });

  it("should error on out-of-range bit access on WORD", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR w : WORD; END_VAR
        w.16 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index"),
    );
    expect(bitErrors).toHaveLength(1);
    expect(bitErrors[0]!.message).toContain("Bit index 16");
    expect(bitErrors[0]!.message).toContain("WORD");
  });

  it("should accept valid bit access on DWORD (0..31)", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR d : DWORD; END_VAR
        d.31 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index") || e.message.includes("Bit access"),
    );
    expect(bitErrors).toHaveLength(0);
  });

  it("should error on out-of-range bit access on DWORD", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR d : DWORD; END_VAR
        d.32 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index"),
    );
    expect(bitErrors).toHaveLength(1);
    expect(bitErrors[0]!.message).toContain("Bit index 32");
    expect(bitErrors[0]!.message).toContain("DWORD");
  });

  it("should error on bit access on REAL type", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR r : REAL; END_VAR
        r.0 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit access"),
    );
    expect(bitErrors).toHaveLength(1);
    expect(bitErrors[0]!.message).toContain("not valid");
    expect(bitErrors[0]!.message).toContain("REAL");
  });

  it("should accept valid bit access on INT (0..15)", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR n : INT; END_VAR
        n.15 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index") || e.message.includes("Bit access"),
    );
    expect(bitErrors).toHaveLength(0);
  });

  it("should error on out-of-range bit access on INT", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR n : INT; END_VAR
        n.16 := TRUE;
      END_PROGRAM
    `);
    const bitErrors = result.errors.filter((e) =>
      e.message.includes("Bit index"),
    );
    expect(bitErrors).toHaveLength(1);
    expect(bitErrors[0]!.message).toContain("Bit index 16");
    expect(bitErrors[0]!.message).toContain("INT");
  });
});

describe("Semantic Analyzer - ADR Validation", () => {
  it("should accept ADR with variable reference", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; p : DWORD; END_VAR
        p := ADR(x);
      END_PROGRAM
    `);
    const adrErrors = result.errors.filter((e) =>
      e.message.includes("ADR()"),
    );
    expect(adrErrors).toHaveLength(0);
  });

  it("should error on ADR with literal argument", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR p : DWORD; END_VAR
        p := ADR(42);
      END_PROGRAM
    `);
    const adrErrors = result.errors.filter((e) =>
      e.message.includes("ADR()"),
    );
    expect(adrErrors).toHaveLength(1);
    expect(adrErrors[0]!.message).toContain("variable reference");
  });

  it("should error on ADR with binary expression", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; p : DWORD; END_VAR
        p := ADR(x + 1);
      END_PROGRAM
    `);
    const adrErrors = result.errors.filter((e) =>
      e.message.includes("ADR()"),
    );
    expect(adrErrors).toHaveLength(1);
    expect(adrErrors[0]!.message).toContain("variable reference");
  });

  it("should error on ADR with function call result", () => {
    const result = analyzeSource(`
      FUNCTION GetVal : INT END_FUNCTION
      PROGRAM Main
        VAR p : DWORD; END_VAR
        p := ADR(GetVal());
      END_PROGRAM
    `);
    const adrErrors = result.errors.filter((e) =>
      e.message.includes("ADR()"),
    );
    expect(adrErrors).toHaveLength(1);
    expect(adrErrors[0]!.message).toContain("variable reference");
  });
});
