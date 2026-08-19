import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { mem2reg } from "../../src/ir/passes/mem2reg.js";
import { constFold } from "../../src/ir/passes/constfold.js";
import { runPasses } from "../../src/ir/passes/pass.js";
import { verifyModule } from "../../src/ir/verify.js";
import type { IrConstValue, IrModule } from "../../src/ir/ir.js";

function opt(src: string): IrModule {
  const { ast } = analyze(src);
  const m = lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
  runPasses(m, [mem2reg, constFold]);
  return m;
}

/** The constant a store writes to a named located output, if it is one. */
function storedConst(m: IrModule): IrConstValue | undefined {
  const store = m.functions[0]!.blocks.flatMap((b) => b.instrs).find(
    (i) => i.op === "store",
  );
  const v = store?.operands[0];
  return v?.kind === "const" ? v : undefined;
}

describe("constfold", () => {
  it("folds integer arithmetic", () => {
    const m = opt(`
      PROGRAM P
      VAR r AT %QW0 : INT; END_VAR
        r := 2 * 3 + 4;
      END_PROGRAM
    `);
    expect(storedConst(m)?.value).toBe(10);
    expect(verifyModule(m).ok).toBe(true);
  });

  it("folds a boolean expression", () => {
    const m = opt(`
      PROGRAM P
      VAR q AT %QX0.0 : BOOL; END_VAR
        q := (TRUE AND FALSE) OR TRUE;
      END_PROGRAM
    `);
    expect(storedConst(m)?.value).toBe(true);
  });

  it("folds a comparison", () => {
    const m = opt(`
      PROGRAM P
      VAR q AT %QX0.0 : BOOL; END_VAR
        q := 5 > 3;
      END_PROGRAM
    `);
    expect(storedConst(m)?.value).toBe(true);
  });

  it("wraps to 16 bits on overflow", () => {
    const m = opt(`
      PROGRAM P
      VAR r AT %QW0 : INT; END_VAR
        r := 30000 + 30000;
      END_PROGRAM
    `);
    // 60000 wraps to -5536 in signed 16-bit.
    expect(storedConst(m)?.value).toBe(-5536);
  });

  it("does not fold division by zero", () => {
    const m = opt(`
      PROGRAM P
      VAR r AT %QW0 : INT; a : INT; END_VAR
        r := 10 / 0;
      END_PROGRAM
    `);
    // Left to the backend's divide-by-zero semantics rather than folded here.
    const ops = m.functions[0]!.blocks.flatMap((b) => b.instrs).map(
      (i) => i.op,
    );
    expect(ops).toContain("div");
  });

  it("does not fold float arithmetic", () => {
    const m = opt(`
      PROGRAM P
      VAR r : REAL; END_VAR
        r := 1.5 + 2.5;
      END_PROGRAM
    `);
    const ops = m.functions[0]!.blocks.flatMap((b) => b.instrs).map(
      (i) => i.op,
    );
    expect(ops).toContain("add");
  });

  it("propagates through a chain to a fixpoint", () => {
    const m = opt(`
      PROGRAM P
      VAR r AT %QW0 : INT; a : INT; b : INT; END_VAR
        a := 4;
        b := a + 1;
        r := b * 2;
      END_PROGRAM
    `);
    expect(storedConst(m)?.value).toBe(10);
  });
});
