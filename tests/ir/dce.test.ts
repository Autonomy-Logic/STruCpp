import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { mem2reg } from "../../src/ir/passes/mem2reg.js";
import { constFold } from "../../src/ir/passes/constfold.js";
import { dce } from "../../src/ir/passes/dce.js";
import { runPasses } from "../../src/ir/passes/pass.js";
import { verifyModule } from "../../src/ir/verify.js";
import type { IrModule } from "../../src/ir/ir.js";

function opt(src: string, passes = [mem2reg, constFold, dce]): IrModule {
  const { ast } = analyze(src);
  const m = lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
  runPasses(m, passes);
  return m;
}
const allInstrs = (m: IrModule) =>
  m.functions[0]!.blocks.flatMap((b) => b.instrs);

describe("dce", () => {
  it("removes a dead computation", () => {
    const m = opt(`
      PROGRAM P
      VAR q AT %QX0.0 : BOOL; a : INT; b : INT; END_VAR
        a := 5;      (* unused after fold *)
        b := a * 2;  (* unused *)
        q := TRUE;
      END_PROGRAM
    `);
    const ops = allInstrs(m).map((i) => i.op);
    expect(ops).not.toContain("mul");
    expect(verifyModule(m).ok).toBe(true);
  });

  it("keeps stores to located outputs", () => {
    const m = opt(`
      PROGRAM P
      VAR q AT %QX0.0 : BOOL; a AT %IX0.0 : BOOL; END_VAR
        q := a;
      END_PROGRAM
    `);
    expect(allInstrs(m).some((i) => i.op === "store")).toBe(true);
  });

  it("keeps a computation that feeds a live output", () => {
    const m = opt(`
      PROGRAM P
      VAR q AT %QW0 : INT; a AT %IW0 : INT; END_VAR
        q := a + 1;
      END_PROGRAM
    `);
    expect(allInstrs(m).some((i) => i.op === "add")).toBe(true);
    expect(verifyModule(m).ok).toBe(true);
  });

  it("is idempotent", () => {
    const m = opt(`
      PROGRAM P
      VAR q AT %QX0.0 : BOOL; x : INT; END_VAR
        x := 99;
        q := FALSE;
      END_PROGRAM
    `);
    const before = allInstrs(m).length;
    runPasses(m, [dce]);
    expect(allInstrs(m).length).toBe(before);
  });
});
