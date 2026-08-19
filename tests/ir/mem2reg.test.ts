import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { mem2reg } from "../../src/ir/passes/mem2reg.js";
import { runPasses } from "../../src/ir/passes/pass.js";
import { verifyModule, formatIssues } from "../../src/ir/verify.js";
import { printModule } from "../../src/ir/printer.js";
import type { IrFunction, IrModule } from "../../src/ir/ir.js";

function lowered(src: string): IrModule {
  const { ast, errors } = analyze(src);
  expect(errors.filter((e) => e.severity !== "warning")).toEqual([]);
  return lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
}

function promote(src: string): IrModule {
  const m = lowered(src);
  const { module } = runPasses(m, [mem2reg]); // runPasses verifies after the pass
  return module;
}

function ops(fn: IrFunction): string[] {
  return fn.blocks.flatMap((b) => b.instrs.map((i) => i.op));
}

describe("mem2reg", () => {
  it("removes alloca/load/store on straight-line code", () => {
    const m = promote(`
      PROGRAM P
      VAR a : INT; b : INT; END_VAR
        a := 3;
        b := a + 1;
      END_PROGRAM
    `);
    const o = ops(m.functions[0]!);
    expect(o).not.toContain("alloca");
    expect(o).not.toContain("load");
    expect(o).not.toContain("store");
    expect(o).toContain("add");
  });

  it("leaves a verifiable module", () => {
    const m = promote(`
      PROGRAM P
      VAR x : INT; y : INT; END_VAR
        x := 1;
        y := x * x;
      END_PROGRAM
    `);
    const verdict = verifyModule(m);
    expect(formatIssues(verdict)).toBe("");
    expect(verdict.ok).toBe(true);
  });

  it("inserts a phi at an if/else join", () => {
    const m = promote(`
      PROGRAM P
      VAR c : BOOL; r : INT; END_VAR
        IF c THEN
          r := 1;
        ELSE
          r := 2;
        END_IF;
        r := r + 1;
      END_PROGRAM
    `);
    const fn = m.functions[0]!;
    expect(ops(fn)).toContain("phi");
    // The value read after the join must be the phi, not a reload.
    expect(ops(fn)).not.toContain("load");
    expect(verifyModule(m).ok).toBe(true);
  });

  it("inserts a phi for a loop-carried variable", () => {
    const m = promote(`
      PROGRAM P
      VAR i : INT; END_VAR
        WHILE i < 10 DO
          i := i + 1;
        END_WHILE;
      END_PROGRAM
    `);
    const fn = m.functions[0]!;
    const phis = fn.blocks
      .flatMap((b) => b.instrs)
      .filter((i) => i.op === "phi");
    expect(phis.length).toBeGreaterThanOrEqual(1);
    expect(verifyModule(m).ok).toBe(true);
    // A loop phi must have an incoming edge from the latch as well as the entry.
    const phi = phis[0]!;
    if (phi.op !== "phi") throw new Error("unreachable");
    expect(phi.incoming.length).toBe(2);
  });

  it("promotes a FOR loop's control and body variables", () => {
    const m = promote(`
      PROGRAM P
      VAR i : INT; acc : INT; END_VAR
        FOR i := 1 TO 5 DO
          acc := acc + i;
        END_FOR;
      END_PROGRAM
    `);
    expect(ops(m.functions[0]!)).not.toContain("load");
    expect(verifyModule(m).ok).toBe(true);
  });

  it("leaves an escaping alloca (array) in memory rather than corrupting it", () => {
    const m = promote(`
      PROGRAM P
      VAR data : ARRAY[1..4] OF INT; v : INT; END_VAR
        v := data[2];
      END_PROGRAM
    `);
    // The array's alloca feeds a gep, so it must survive; the scalar v is promoted.
    const o = ops(m.functions[0]!);
    expect(o).toContain("alloca");
    expect(o).toContain("gep");
    expect(verifyModule(m).ok).toBe(true);
  });

  it("is idempotent", () => {
    const m = lowered(`
      PROGRAM P
      VAR a : INT; END_VAR
        a := 7;
      END_PROGRAM
    `);
    runPasses(m, [mem2reg]);
    const once = printModule(m);
    runPasses(m, [mem2reg]);
    expect(printModule(m)).toBe(once);
  });
});
