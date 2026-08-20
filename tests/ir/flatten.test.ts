import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { mem2reg } from "../../src/ir/passes/mem2reg.js";
import { constFold } from "../../src/ir/passes/constfold.js";
import { dce } from "../../src/ir/passes/dce.js";
import { flatten, FlattenError } from "../../src/ir/passes/flatten.js";
import { runPasses } from "../../src/ir/passes/pass.js";
import { verifyModule, formatIssues } from "../../src/ir/verify.js";
import { printModule } from "../../src/ir/printer.js";
import type { IrModule } from "../../src/ir/ir.js";

function flat(src: string): IrModule {
  const { ast, errors } = analyze(src);
  expect(errors.filter((e) => e.severity !== "warning")).toEqual([]);
  const m = lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
  runPasses(m, [mem2reg, constFold, dce, flatten]); // ssa between passes
  // flat is the postcondition of the whole pipeline, asserted by callers
  return m;
}
const ops = (m: IrModule) =>
  m.functions[0]!.blocks.flatMap((b) => b.instrs).map((i) => i.op);

describe("flatten", () => {
  it("collapses an if/else to one flat block that verifies", () => {
    const m = flat(`
      PROGRAM P
      VAR c AT %IX0.0 : BOOL; q AT %QW0 : INT; a AT %IW0 : INT; END_VAR
        IF c THEN q := a + 1; ELSE q := a - 1; END_IF;
      END_PROGRAM
    `);
    expect(m.functions[0]!.blocks).toHaveLength(1);
    expect(m.functions[0]!.blocks[0]!.label).toBe("flat");
    const verdict = verifyModule(m, "flat");
    expect(formatIssues(verdict)).toBe("");
    expect(ops(m)).not.toContain("condbr");
    expect(ops(m)).not.toContain("br");
    expect(ops(m)).not.toContain("phi");
    // Both branch stores survive, each enable-gated by a select.
    expect(ops(m).filter((o) => o === "store").length).toBe(2);
    expect(ops(m)).toContain("select");
  });

  it("converts a join phi to a select", () => {
    const m = flat(`
      PROGRAM P
      VAR c AT %IX0.0 : BOOL; q AT %QW0 : INT; a AT %IW0 : INT; b AT %IW1 : INT; END_VAR
        IF c THEN q := a; ELSE q := b; END_IF;
        q := q + 1;   (* forces a value that must be the joined q *)
      END_PROGRAM
    `);
    expect(verifyModule(m, "flat").ok).toBe(true);
    expect(ops(m)).toContain("select");
  });

  it("enable-gates a store in a bare IF, preserving the prior value", () => {
    const m = flat(`
      PROGRAM P
      VAR c AT %IX0.0 : BOOL; q AT %QX0.0 : BOOL; END_VAR
        IF c THEN q := TRUE; END_IF;
      END_PROGRAM
    `);
    // The conditional store must read q's current value for the untaken path.
    expect(ops(m)).toContain("load");
    expect(ops(m)).toContain("select");
    expect(verifyModule(m, "flat").ok).toBe(true);
  });

  it("handles nested conditionals", () => {
    const m = flat(`
      PROGRAM P
      VAR a AT %IX0.0 : BOOL; b AT %IX0.1 : BOOL; q AT %QX0.0 : BOOL; END_VAR
        IF a THEN
          IF b THEN q := TRUE; ELSE q := FALSE; END_IF;
        ELSE
          q := FALSE;
        END_IF;
      END_PROGRAM
    `);
    expect(m.functions[0]!.blocks).toHaveLength(1);
    expect(verifyModule(m, "flat").ok).toBe(true);
  });

  it("flattens CASE", () => {
    const m = flat(`
      PROGRAM P
      VAR sel AT %IW0 : INT; q AT %QW0 : INT; END_VAR
        CASE sel OF
          1: q := 10;
          2: q := 20;
        ELSE q := 0;
        END_CASE;
      END_PROGRAM
    `);
    expect(m.functions[0]!.blocks).toHaveLength(1);
    expect(verifyModule(m, "flat").ok).toBe(true);
  });

  it("rejects a loop with a positioned diagnostic", () => {
    const { ast } = analyze(`
      PROGRAM P
      VAR i : INT; END_VAR
        WHILE i < 10 DO i := i + 1; END_WHILE;
      END_PROGRAM
    `);
    const m = lowerToIr(ast!, { moduleName: "t", producerVersion: "t" }).module;
    runPasses(m, [mem2reg, constFold]);
    expect(() => runPasses(m, [flatten])).toThrow(FlattenError);
  });

  it("leaves a straight-line program as a single block", () => {
    const m = flat(`
      PROGRAM P
      VAR a AT %IX0.0 : BOOL; b AT %IX0.1 : BOOL; q AT %QX0.0 : BOOL; END_VAR
        q := a AND b;
      END_PROGRAM
    `);
    expect(m.functions[0]!.blocks).toHaveLength(1);
    expect(verifyModule(m, "flat").ok).toBe(true);
    expect(ops(m)).toContain("and");
  });
});
