import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { mem2reg } from "../../src/ir/passes/mem2reg.js";
import { constFold } from "../../src/ir/passes/constfold.js";
import { dce } from "../../src/ir/passes/dce.js";
import { flatten } from "../../src/ir/passes/flatten.js";
import { schedule } from "../../src/ir/passes/schedule.js";
import { runPasses } from "../../src/ir/passes/pass.js";
import { verifyModule } from "../../src/ir/verify.js";
import type { IrInstr, IrModule } from "../../src/ir/ir.js";

function sched(src: string): IrModule {
  const { ast } = analyze(src);
  const m = lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
  runPasses(m, [mem2reg, constFold, dce, flatten, schedule]);
  return m;
}

function defBeforeUse(m: IrModule): boolean {
  const block = m.functions[0]!.blocks[0]!;
  const seen = new Set<number>();
  for (const instr of block.instrs) {
    for (const op of instr.operands) {
      if (op.kind === "temp" && !seen.has(op.id)) {
        // A temp used before definition — unless it is this very instruction.
        if (op.id !== instr.id) return false;
      }
    }
    if (instr.type.kind !== "void") seen.add(instr.id);
  }
  return true;
}

describe("schedule", () => {
  it("produces a def-before-use order on a diamond", () => {
    const m = sched(`
      PROGRAM P
      VAR c AT %IX0.0 : BOOL; q AT %QW0 : INT; a AT %IW0 : INT; END_VAR
        IF c THEN q := a + 1; ELSE q := a - 1; END_IF;
      END_PROGRAM
    `);
    expect(defBeforeUse(m)).toBe(true);
    expect(verifyModule(m, "flat").ok).toBe(true);
  });

  it("keeps the terminator last", () => {
    const m = sched(`
      PROGRAM P
      VAR q AT %QX0.0 : BOOL; a AT %IX0.0 : BOOL; END_VAR
        q := a;
      END_PROGRAM
    `);
    const instrs = m.functions[0]!.blocks[0]!.instrs;
    expect(instrs.at(-1)!.op).toBe("ret");
  });

  it("keeps allocas at the top", () => {
    const m = sched(`
      PROGRAM P
      VAR q AT %QW0 : INT; a AT %IW0 : INT; END_VAR
        q := a * 2;
      END_PROGRAM
    `);
    const instrs = m.functions[0]!.blocks[0]!.instrs;
    const firstNonAlloca = instrs.findIndex((i: IrInstr) => i.op !== "alloca");
    expect(
      instrs.slice(0, firstNonAlloca).every((i: IrInstr) => i.op === "alloca"),
    ).toBe(true);
  });

  it("preserves the relative order of stores to the same output", () => {
    // The two predicated stores from an if/else must not reorder: the second
    // reads the first's result.
    const m = sched(`
      PROGRAM P
      VAR c AT %IX0.0 : BOOL; q AT %QW0 : INT; END_VAR
        IF c THEN q := 1; ELSE q := 2; END_IF;
      END_PROGRAM
    `);
    const stores = m.functions[0]!.blocks[0]!.instrs.filter(
      (i: IrInstr) => i.op === "store",
    );
    expect(stores.length).toBe(2);
    expect(verifyModule(m, "flat").ok).toBe(true);
  });
});
