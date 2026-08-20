import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { runPasses } from "../../src/ir/passes/pass.js";
import { ssaPipeline, flatPipeline } from "../../src/ir/passes/pipeline.js";
import { verifyModule } from "../../src/ir/verify.js";
import type { IrModule } from "../../src/ir/ir.js";

function run(src: string, flat: boolean): IrModule {
  const { ast } = analyze(src);
  const m = lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
  runPasses(m, flat ? flatPipeline : ssaPipeline);
  return m;
}

const REALISTIC = `
  PROGRAM Plant
  VAR
    start AT %IX0.0 : BOOL;
    stop  AT %IX0.1 : BOOL;
    level AT %IW0   : INT;
    pump  AT %QX0.0 : BOOL;
    lo : INT := 20;
    hi : INT := 80;
    i : INT;
    acc : INT;
  END_VAR
    IF level < lo THEN
      pump := TRUE;
    ELSIF level > hi THEN
      pump := FALSE;
    END_IF;
    IF stop THEN pump := FALSE; END_IF;
  END_PROGRAM
`;

describe("pipelines", () => {
  it("ssa pipeline leaves a verifiable SSA module with control flow", () => {
    const m = run(REALISTIC, false);
    expect(verifyModule(m, "ssa").ok).toBe(true);
    // Control flow survives in the SSA view.
    expect(m.functions[0]!.blocks.length).toBeGreaterThan(1);
  });

  it("flat pipeline reduces a realistic program to one flat block", () => {
    const m = run(REALISTIC, true);
    expect(m.functions[0]!.blocks).toHaveLength(1);
    expect(verifyModule(m, "flat").ok).toBe(true);
  });

  it("the AND gate flat-compiles to loads, an and, and a store", () => {
    const m = run(
      `PROGRAM P VAR a AT %IX0.0 : BOOL; b AT %IX0.1 : BOOL; q AT %QX0.0 : BOOL; END_VAR q := a AND b; END_PROGRAM`,
      true,
    );
    const ops = m.functions[0]!.blocks[0]!.instrs.map((i) => i.op);
    expect(ops.filter((o) => o === "load").length).toBe(2);
    expect(ops).toContain("and");
    expect(ops.filter((o) => o === "store").length).toBe(1);
    expect(verifyModule(m, "flat").ok).toBe(true);
  });
});
