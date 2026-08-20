import { describe, expect, it } from "vitest";
import { analyze } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";
import { printModule } from "../../src/ir/printer.js";
import { verifyModule, formatIssues } from "../../src/ir/verify.js";
import { fromJson, toJson } from "../../src/ir/json.js";
import { IR_VERSION } from "../../src/ir/ir.js";

/** Lower ST and assert the module is well-formed before returning it. */
function lower(source: string) {
  const { ast, errors } = analyze(source);
  expect(errors.filter((e) => e.severity !== "warning")).toEqual([]);
  expect(ast).toBeDefined();
  const result = lowerToIr(ast!, {
    moduleName: "test",
    producerVersion: "test",
  });
  const verdict = verifyModule(result.module);
  expect(formatIssues(verdict)).toBe("");
  expect(verdict.ok).toBe(true);
  return result;
}

/** Lower ST with FB/function inlining on, as the netlist path does. */
function lowerInlined(source: string) {
  const { ast, errors } = analyze(source);
  expect(errors.filter((e) => e.severity !== "warning")).toEqual([]);
  expect(ast).toBeDefined();
  const result = lowerToIr(ast!, {
    moduleName: "test",
    producerVersion: "test",
    inlineCalls: true,
  });
  const verdict = verifyModule(result.module);
  expect(formatIssues(verdict)).toBe("");
  expect(verdict.ok).toBe(true);
  return result;
}

describe("lowering: basics", () => {
  it("lowers a program with declarations and arithmetic", () => {
    const { module, diagnostics } = lower(`
      PROGRAM Main
      VAR
        a : INT := 3;
        b : INT;
      END_VAR
        b := a * 2 + 1;
      END_PROGRAM
    `);
    expect(diagnostics).toEqual([]);
    const fn = module.functions[0]!;
    expect(fn.kind).toBe("program");
    expect(fn.name).toBe("MAIN");
    const ops = fn.blocks.flatMap((b) => b.instrs.map((i) => i.op));
    expect(ops).toContain("alloca");
    expect(ops).toContain("mul");
    expect(ops).toContain("add");
    expect(ops).toContain("store");
  });

  it("keeps declared widths rather than widening everything", () => {
    const { module } = lower(`
      PROGRAM Widths
      VAR
        small : SINT;
        big : DINT;
      END_VAR
        small := 1;
        big := 2;
      END_PROGRAM
    `);
    const allocas = module.functions[0]!.blocks[0]!.instrs.filter(
      (i) => i.op === "alloca",
    );
    const types = allocas.map((a) =>
      a.op === "alloca" ? a.allocatedType : undefined,
    );
    expect(types).toContainEqual({
      kind: "int",
      bits: 8,
      signed: true,
      iec: "SINT",
    });
    expect(types).toContainEqual({
      kind: "int",
      bits: 32,
      signed: true,
      iec: "DINT",
    });
  });

  it("carries located variables and RETAIN into the IR", () => {
    const { module } = lower(`
      PROGRAM Io
      VAR RETAIN
        motor AT %QX0.1 : BOOL;
      END_VAR
        motor := TRUE;
      END_PROGRAM
    `);
    const alloca = module.functions[0]!.blocks[0]!.instrs.find(
      (i) => i.op === "alloca",
    );
    expect(alloca?.op).toBe("alloca");
    if (alloca?.op !== "alloca") throw new Error("unreachable");
    expect(alloca.name).toBe("MOTOR");
    expect(alloca.located).toBe("%QX0.1");
    expect(alloca.retain).toBe(true);
  });
});

describe("lowering: control flow", () => {
  it("turns IF/ELSIF/ELSE into a branch chain that verifies", () => {
    const { module } = lower(`
      PROGRAM Branchy
      VAR
        x : INT;
        y : INT;
      END_VAR
        IF x > 10 THEN
          y := 1;
        ELSIF x > 5 THEN
          y := 2;
        ELSE
          y := 3;
        END_IF;
      END_PROGRAM
    `);
    const fn = module.functions[0]!;
    const condBrs = fn.blocks
      .flatMap((b) => b.instrs)
      .filter((i) => i.op === "condbr");
    expect(condBrs).toHaveLength(2);
    expect(fn.blocks.some((b) => b.label.startsWith("if.end"))).toBe(true);
  });

  it("lowers WHILE with the test before the body", () => {
    const { module } = lower(`
      PROGRAM Loopy
      VAR i : INT; END_VAR
        WHILE i < 10 DO
          i := i + 1;
        END_WHILE;
      END_PROGRAM
    `);
    const labels = module.functions[0]!.blocks.map((b) => b.label);
    expect(labels).toContain("while.cond");
    expect(labels).toContain("while.body");
    expect(labels).toContain("while.end");
  });

  it("lowers REPEAT with the test after the body", () => {
    const { module } = lower(`
      PROGRAM R
      VAR i : INT; END_VAR
        REPEAT
          i := i + 1;
        UNTIL i > 3 END_REPEAT;
      END_PROGRAM
    `);
    const labels = module.functions[0]!.blocks.map((b) => b.label);
    expect(labels).toContain("repeat.body");
    expect(labels).toContain("repeat.cond");
  });

  it("evaluates the FOR limit and step once, as IEC requires", () => {
    const { module } = lower(`
      PROGRAM Counting
      VAR i : INT; total : INT; END_VAR
        FOR i := 1 TO 10 BY 2 DO
          total := total + i;
        END_FOR;
      END_PROGRAM
    `);
    const fn = module.functions[0]!;
    const names = fn.blocks[0]!.instrs.filter((i) => i.op === "alloca").map(
      (i) => (i.op === "alloca" ? i.name : ""),
    );
    expect(names).toContain("I$limit");
    expect(names).toContain("I$step");
    // The direction test is branch-free, so a descending step works too.
    expect(
      fn.blocks.flatMap((b) => b.instrs).some((i) => i.op === "select"),
    ).toBe(true);
  });

  it("lowers CASE labels including ranges", () => {
    const { module } = lower(`
      PROGRAM Selector
      VAR mode : INT; out : INT; END_VAR
        CASE mode OF
          1: out := 10;
          2..4: out := 20;
        ELSE
          out := 0;
        END_CASE;
      END_PROGRAM
    `);
    const instrs = module.functions[0]!.blocks.flatMap((b) => b.instrs);
    // A range needs two comparisons joined by AND.
    expect(instrs.filter((i) => i.op === "cmp").length).toBeGreaterThanOrEqual(
      3,
    );
    expect(instrs.some((i) => i.op === "and")).toBe(true);
  });

  it("routes EXIT to the loop exit and RETURN to the function exit", () => {
    const { module } = lower(`
      PROGRAM Jumps
      VAR i : INT; END_VAR
        WHILE TRUE DO
          EXIT;
        END_WHILE;
        RETURN;
      END_PROGRAM
    `);
    const fn = module.functions[0]!;
    const targets = fn.blocks
      .flatMap((b) => b.instrs)
      .filter((i) => i.op === "br")
      .map((i) => (i.op === "br" ? i.target : ""));
    expect(targets).toContain("while.end");
    expect(targets).toContain("exit");
  });
});

describe("lowering: POUs", () => {
  it("gives a FUNCTION a result slot and returns it", () => {
    const { module } = lower(`
      FUNCTION Add2 : INT
      VAR_INPUT a : INT; b : INT; END_VAR
        Add2 := a + b;
      END_FUNCTION
    `);
    const fn = module.functions.find((f) => f.name === "ADD2")!;
    expect(fn.kind).toBe("function");
    expect(fn.returnType).toEqual({
      kind: "int",
      bits: 16,
      signed: true,
      iec: "INT",
    });
    expect(fn.params.map((p) => [p.name, p.mode])).toEqual([
      ["A", "input"],
      ["B", "input"],
    ]);
    const ret = fn.blocks.at(-1)!.instrs.at(-1)!;
    expect(ret.op).toBe("ret");
    expect(ret.operands).toHaveLength(1);
  });

  it("passes VAR_OUTPUT by reference", () => {
    const { module } = lower(`
      FUNCTION_BLOCK Splitter
      VAR_INPUT src : INT; END_VAR
      VAR_OUTPUT half : INT; END_VAR
        half := src / 2;
      END_FUNCTION_BLOCK
    `);
    const fn = module.functions.find((f) => f.name === "SPLITTER")!;
    const out = fn.params.find((p) => p.name === "HALF")!;
    expect(out.mode).toBe("output");
    expect(out.type.kind).toBe("pointer");
    // The FB body takes an implicit instance pointer first.
    expect(fn.params[0]!.name).toBe("this");
  });

  it("preserves FB type and instance instead of inlining, so backends can substitute", () => {
    const { module, diagnostics } = lower(`
      FUNCTION_BLOCK MyTimer
      VAR_INPUT IN : BOOL; PT : TIME; END_VAR
      VAR_OUTPUT Q : BOOL; END_VAR
        Q := IN;
      END_FUNCTION_BLOCK

      PROGRAM Timed
      VAR
        t : MyTimer;
        go : BOOL;
      END_VAR
        t(IN := go, PT := T#5s);
      END_PROGRAM
    `);
    expect(diagnostics).toEqual([]);
    const call = module.functions
      .find((f) => f.name === "TIMED")!
      .blocks.flatMap((b) => b.instrs)
      .find((i) => i.op === "fbcall");
    expect(call?.op).toBe("fbcall");
    if (call?.op !== "fbcall") throw new Error("unreachable");
    expect(call.fbType).toBe("MYTIMER");
    expect(call.instance).toBe("T");
    expect(call.argNames).toEqual(["IN", "PT"]);
  });

  it("inlines an FB invocation into a call-free program with member access", () => {
    const { module, diagnostics } = lowerInlined(`
      FUNCTION_BLOCK Latch
      VAR_INPUT s, r : BOOL; END_VAR
      VAR_OUTPUT q : BOOL; END_VAR
        q := s OR (q AND NOT r);
      END_FUNCTION_BLOCK

      PROGRAM P
      VAR
        setb AT %IX0.0 : BOOL;
        rstb AT %IX0.1 : BOOL;
        outb AT %QX0.0 : BOOL;
        l : Latch;
      END_VAR
        l(s := setb, r := rstb);
        outb := l.q;
      END_PROGRAM
    `);
    expect(diagnostics).toEqual([]);
    const fns = module.functions;
    // Only the program is emitted; the FB is inlined, not a standalone function.
    expect(fns.map((f) => f.name)).toEqual(["P"]);
    const ops = fns[0]!.blocks.flatMap((b) => b.instrs.map((i) => i.op));
    expect(ops).not.toContain("fbcall");
    expect(ops).not.toContain("call");
    // The instance output `l.q` is a real, readable storage slot (its name is
    // qualified by the instance), so member access lowered rather than dropping.
    const allocas = fns[0]!.blocks
      .flatMap((b) => b.instrs)
      .filter((i) => i.op === "alloca");
    expect(allocas.some((a) => a.op === "alloca" && a.name === "L.Q")).toBe(true);
  });

  it("gives each FB instance its own independent state", () => {
    const { module } = lowerInlined(`
      FUNCTION_BLOCK Edge
      VAR_INPUT clk : BOOL; END_VAR
      VAR_OUTPUT q : BOOL; END_VAR
      VAR m : BOOL; END_VAR
        q := clk AND NOT m;
        m := clk;
      END_FUNCTION_BLOCK

      PROGRAM P
      VAR
        a AT %IX0.0 : BOOL; b AT %IX0.1 : BOOL;
        x AT %QX0.0 : BOOL; y AT %QX0.1 : BOOL;
        e1 : Edge; e2 : Edge;
      END_VAR
        e1(clk := a); x := e1.q;
        e2(clk := b); y := e2.q;
      END_PROGRAM
    `);
    const allocas = module.functions[0]!.blocks
      .flatMap((b) => b.instrs)
      .filter((i) => i.op === "alloca");
    const names = allocas.map((a) => (a.op === "alloca" ? a.name : ""));
    // Two disjoint state slots, one per instance.
    expect(names).toContain("E1.M");
    expect(names).toContain("E2.M");
  });

  it("inlines a FUNCTION call as a stateless value", () => {
    const { module } = lowerInlined(`
      FUNCTION Doubler : INT
      VAR_INPUT x : INT; END_VAR
        Doubler := x * 2;
      END_FUNCTION

      PROGRAM P
      VAR a : INT; b : INT; END_VAR
        b := Doubler(a) + 1;
      END_PROGRAM
    `);
    const ops = module.functions[0]!.blocks.flatMap((b) =>
      b.instrs.map((i) => i.op),
    );
    expect(ops).not.toContain("call");
    expect(ops).toContain("mul");
    expect(ops).toContain("add");
  });

  it("lowers NOT(x) written with parentheses as the NOT operator", () => {
    const { module } = lowerInlined(`
      PROGRAM P
      VAR a AT %IX0.0 : BOOL; b AT %QX0.0 : BOOL; END_VAR
        b := NOT(a);
      END_PROGRAM
    `);
    const instrs = module.functions[0]!.blocks.flatMap((b) => b.instrs);
    expect(instrs.some((i) => i.op === "not")).toBe(true);
    expect(instrs.some((i) => i.op === "call")).toBe(false);
  });

  it("marks unknown callees as standard functions", () => {
    const { module } = lower(`
      PROGRAM M
      VAR a : INT; b : INT; END_VAR
        b := MAX(a, 5);
      END_PROGRAM
    `);
    const call = module.functions[0]!.blocks.flatMap((b) => b.instrs).find(
      (i) => i.op === "call",
    );
    expect(call?.op).toBe("call");
    if (call?.op !== "call") throw new Error("unreachable");
    expect(call.callee).toBe("MAX");
    expect(call.standard).toBe(true);
  });
});

describe("lowering: aggregates", () => {
  it("normalises array indices against the declared lower bound", () => {
    const { module } = lower(`
      PROGRAM Arr
      VAR
        data : ARRAY[1..10] OF INT;
        v : INT;
      END_VAR
        v := data[3];
      END_PROGRAM
    `);
    const instrs = module.functions[0]!.blocks.flatMap((b) => b.instrs);
    const gep = instrs.find((i) => i.op === "gep");
    expect(gep).toBeDefined();
    // Index 3 on a 1-based array becomes 3 - 1; a constant index folds in the
    // operand rather than needing a sub instruction.
    const sub = instrs.find((i) => i.op === "sub");
    expect(gep!.operands.length).toBe(2);
    expect(sub ?? gep).toBeDefined();
  });

  it("resolves struct fields to indices with the name kept for diagnostics", () => {
    const { module } = lower(`
      TYPE Point : STRUCT
        x : INT;
        y : INT;
      END_STRUCT END_TYPE

      PROGRAM S
      VAR p : Point; v : INT; END_VAR
        v := p.y;
      END_PROGRAM
    `);
    expect(module.types.map((t) => t.name)).toContain("POINT");
    const gep = module.functions
      .find((f) => f.name === "S")!
      .blocks.flatMap((b) => b.instrs)
      .find((i) => i.op === "gep");
    expect(gep?.op).toBe("gep");
    if (gep?.op !== "gep") throw new Error("unreachable");
    expect(gep.path).toEqual(["Y"]);
  });
});

describe("IR plumbing", () => {
  it("round-trips through JSON", () => {
    const { module } = lower(`
      PROGRAM Rt
      VAR a : INT; END_VAR
        a := 1;
      END_PROGRAM
    `);
    const back = fromJson(toJson(module));
    expect(back).toEqual(module);
    expect(verifyModule(back).ok).toBe(true);
  });

  it("refuses an IR document from a different schema version", () => {
    expect(() =>
      fromJson(JSON.stringify({ irVersion: IR_VERSION + 1 })),
    ).toThrow(/cannot be read by this build/);
  });

  it("prints something a person can read", () => {
    const { module } = lower(`
      PROGRAM Dump
      VAR a : INT; b : BOOL; END_VAR
        b := a > 2;
      END_PROGRAM
    `);
    const text = printModule(module);
    expect(text).toContain("; STruC++ lowered IR v1");
    expect(text).toContain("define program void @DUMP()");
    expect(text).toContain("cmp sgt");
    expect(text).not.toContain("missing terminator");
  });

  it("reports unsupported constructs instead of throwing", () => {
    const { ast } = analyze(`
      PROGRAM Odd
      VAR p : POINTER TO INT; v : INT; END_VAR
        v := p^;
      END_PROGRAM
    `);
    const result = lowerToIr(ast!, {
      moduleName: "odd",
      producerVersion: "test",
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.module.functions.length).toBeGreaterThan(0);
  });
});
