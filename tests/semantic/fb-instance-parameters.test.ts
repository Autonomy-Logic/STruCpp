// A function block instance handed to another POU.
//
// On a VAR_IN_OUT the callee reads, writes and calls the caller's own instance,
// so the parameter is a pointer bound at the call and there is no copy back.

import { describe, expect, it } from "vitest";

import { compile, compileStlib } from "../../src/index.js";

const ENGINE = `
FUNCTION_BLOCK Engine
  VAR_INPUT
    SPEED : INT;
  END_VAR
  VAR_OUTPUT
    RUNNING : BOOL;
  END_VAR
  VAR
    ticks : DINT;
  END_VAR
  ticks := ticks + 1;
  RUNNING := SPEED > 0;
END_FUNCTION_BLOCK
`;

const build = (source: string) => compile(source, { programName: "main" });

const DRIVER = `
FUNCTION_BLOCK Driver
  VAR_IN_OUT
    ENG : Engine;
  END_VAR
  VAR_OUTPUT
    SEEN : BOOL;
  END_VAR
  ENG(SPEED := 5);
  SEEN := ENG.RUNNING;
END_FUNCTION_BLOCK
`;

const MAIN = `
PROGRAM main
  VAR
    e : Engine;
    d : Driver;
  END_VAR
  d(ENG := e);
END_PROGRAM
`;

describe("a function block instance as VAR_IN_OUT", () => {
  const result = build(ENGINE + DRIVER + MAIN);

  it("compiles", () => {
    expect(result.success).toBe(true);
    expect(result.errors ?? []).toHaveLength(0);
  });

  it("holds the parameter as a pointer, not a copy", () => {
    expect(result.headerCode ?? "").toContain("ENGINE* ENG = nullptr;");
    expect(result.headerCode ?? "").not.toContain("ENGINE ENG;");
  });

  it("binds the caller's own instance", () => {
    expect(result.cppCode ?? "").toContain("D.ENG = &E;");
  });

  it("does not copy the instance back", () => {
    expect(result.cppCode ?? "").not.toContain("E = D.ENG");
  });

  it("reads, writes and calls through the pointer", () => {
    const cpp = result.cppCode ?? "";
    expect(cpp).toContain("(*ENG).SPEED = 5;");
    expect(cpp).toContain("(*ENG)();");
    expect(cpp).toContain("(*ENG).RUNNING");
  });
});

describe("what still copies", () => {
  it("a scalar in-out is unchanged", () => {
    const result = build(`
      FUNCTION_BLOCK Bumper
        VAR_IN_OUT v : INT; END_VAR
        v := v + 1;
      END_FUNCTION_BLOCK
      PROGRAM main VAR b : Bumper; n : INT; END_VAR b(v := n); END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.headerCode ?? "").toContain("IEC_INT V;");
    expect(result.cppCode ?? "").toContain("B.V = N;");
    expect(result.cppCode ?? "").toContain("N = B.V;");
  });

  it("a structure in-out is unchanged", () => {
    const result = build(`
      TYPE PointT : STRUCT a : INT; END_STRUCT END_TYPE
      FUNCTION_BLOCK Setter
        VAR_IN_OUT p : PointT; END_VAR
        p.a := 3;
      END_FUNCTION_BLOCK
      PROGRAM main VAR s : Setter; q : PointT; END_VAR s(p := q); END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode ?? "").toContain("S.P = Q;");
    expect(result.cppCode ?? "").toContain("Q = S.P;");
  });
});

describe("the parameter must be assigned", () => {
  it("refuses a call that leaves it unassigned", () => {
    const result = build(ENGINE + DRIVER + `
      PROGRAM main VAR d : Driver; END_VAR d(); END_PROGRAM
    `);
    expect(result.success).toBe(false);
    expect((result.errors ?? []).map((e) => e.message).join(" ")).toContain(
      "leaves in-out 'ENG' unassigned",
    );
  });

  it("names every parameter left unassigned", () => {
    const result = build(`
      ${ENGINE}
      FUNCTION_BLOCK Twin
        VAR_IN_OUT A : Engine; B : Engine; END_VAR
        A(SPEED := 1);
      END_FUNCTION_BLOCK
      PROGRAM main VAR t : Twin; END_VAR t(); END_PROGRAM
    `);
    expect(result.success).toBe(false);
    const message = (result.errors ?? []).map((e) => e.message).join(" ");
    expect(message).toContain("'A'");
    expect(message).toContain("'B'");
  });

  it("refuses it on a later call, even after an earlier one assigned it", () => {
    const result = build(ENGINE + DRIVER + `
      PROGRAM main VAR e : Engine; d : Driver; END_VAR
        d(ENG := e);
        d();
      END_PROGRAM
    `);
    expect(result.success).toBe(false);
  });

  it("accepts a call that assigns it", () => {
    expect(build(ENGINE + DRIVER + MAIN).success).toBe(true);
  });

  it("accepts it supplied without a name", () => {
    const result = build(ENGINE + DRIVER + `
      PROGRAM main VAR e : Engine; d : Driver; END_VAR d(e); END_PROGRAM
    `);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });
});

describe("what may be assigned to an in-out", () => {
  const ACC = `
FUNCTION_BLOCK Acc
  VAR_IN_OUT VAL : INT; END_VAR
  VAL := VAL + 1;
END_FUNCTION_BLOCK
`;
  const errorText = (source: string) =>
    (build(source).errors ?? []).map((e) => e.message).join("\n");

  it.each([
    ["a literal", "VAR a : Acc; END_VAR a(VAL := 7);"],
    ["an expression", "VAR a : Acc; x : INT; y : INT; END_VAR a(VAL := x + y);"],
  ])("refuses %s, which has nowhere to write back to", (_label, body) => {
    expect(errorText(ACC + `PROGRAM main ${body} END_PROGRAM`)).toContain(
      "Only a variable may be assigned to in-out",
    );
  });

  it("refuses a CONSTANT", () => {
    expect(
      errorText(
        ACC +
          `PROGRAM main VAR CONSTANT k : INT := 3; END_VAR VAR a : Acc; END_VAR a(VAL := k); END_PROGRAM`,
      ),
    ).toContain("is CONSTANT");
  });

  it("refuses the caller's own VAR_INPUT", () => {
    expect(
      errorText(
        ACC +
          `FUNCTION_BLOCK G VAR_INPUT p : INT; END_VAR VAR a : Acc; END_VAR a(VAL := p); END_FUNCTION_BLOCK
           PROGRAM main VAR g : G; END_VAR g(p := 1); END_PROGRAM`,
      ),
    ).toContain("is a VAR_INPUT");
  });

  it.each([
    ["a plain variable", "VAR a : Acc; n : INT; END_VAR a(VAL := n);"],
    ["an array element", "VAR a : Acc; arr : ARRAY[0..3] OF INT; END_VAR a(VAL := arr[2]);"],
  ])("accepts %s", (_label, body) => {
    const result = build(ACC + `PROGRAM main ${body} END_PROGRAM`);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("accepts a field of the caller's own in-out", () => {
    const result = build(`
      TYPE Drv : STRUCT n : INT; END_STRUCT END_TYPE
      TYPE Ax : STRUCT Drive : Drv; END_STRUCT END_TYPE
      FUNCTION_BLOCK Low VAR_IN_OUT D : Drv; END_VAR D.n := 1; END_FUNCTION_BLOCK
      FUNCTION_BLOCK High
        VAR_IN_OUT Axis : Ax; END_VAR
        VAR l : Low; END_VAR
        l(D := Axis.Drive);
      END_FUNCTION_BLOCK
      PROGRAM main VAR h : High; a : Ax; END_VAR h(Axis := a); END_PROGRAM
    `);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("accepts a VAR_EXTERNAL", () => {
    const result = build(
      ACC +
        `VAR_GLOBAL g : INT; END_VAR
         PROGRAM main VAR_EXTERNAL g : INT; END_VAR VAR a : Acc; END_VAR a(VAL := g); END_PROGRAM`,
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });
});

describe("where an in-out may be used", () => {
  const ACC = `
FUNCTION_BLOCK Acc
  VAR_IN_OUT VAL : INT; END_VAR
  VAL := VAL + 1;
END_FUNCTION_BLOCK
`;
  const errorText = (source: string) =>
    (build(source).errors ?? []).map((e) => e.message).join("\n");

  it.each([
    ["read", "a(VAL := n); m := a.VAL;"],
    ["written", "a.VAL := n; a(VAL := n);"],
  ])("refuses it being %s from outside the block", (_label, body) => {
    expect(
      errorText(
        ACC + `PROGRAM main VAR a : Acc; n : INT; m : INT; END_VAR ${body} END_PROGRAM`,
      ),
    ).toContain("reaches an in-out of 'ACC' from outside it");
  });

  it("refuses capturing it with '=>'", () => {
    expect(
      errorText(ACC + `PROGRAM main VAR a : Acc; n : INT; END_VAR a(VAL => n); END_PROGRAM`),
    ).toContain("with '=>'");
  });

  it("refuses a method reaching its own block's in-out", () => {
    expect(
      errorText(`
        FUNCTION_BLOCK F
          VAR_IN_OUT v : INT; END_VAR
          METHOD M : INT  M := v; END_METHOD
          v := v + 1;
        END_FUNCTION_BLOCK
        PROGRAM main VAR f : F; n : INT; END_VAR f(v := n); END_PROGRAM
      `),
    ).toContain("not available in a method");
  });

  it("still allows an output to be read from outside", () => {
    const result = build(
      ENGINE + `PROGRAM main VAR e : Engine; b : BOOL; END_VAR e(SPEED := 1); b := e.RUNNING; END_PROGRAM`,
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });
});

describe("two callers sharing one instance", () => {
  it("both bind the same block", () => {
    const result = build(`
      ${ENGINE}
      ${DRIVER}
      PROGRAM main
        VAR e : Engine; d1 : Driver; d2 : Driver; END_VAR
        d1(ENG := e);
        d2(ENG := e);
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode ?? "").toContain("D1.ENG = &E;");
    expect(result.cppCode ?? "").toContain("D2.ENG = &E;");
  });
});

describe("resolving the parameter's type", () => {
  it("binds by pointer when the callee's type is declared later", () => {
    const result = build(DRIVER + ENGINE + MAIN);
    expect(result.success).toBe(true);
    expect(result.headerCode ?? "").toContain("ENGINE* ENG = nullptr;");
    expect(result.cppCode ?? "").toContain("D.ENG = &E;");
    expect(result.cppCode ?? "").not.toContain("E = D.ENG");
    expect(result.cppCode ?? "").toContain("(*ENG).SPEED = 5;");
  });

  it("calls a method through the pointer", () => {
    const result = build(`
      FUNCTION_BLOCK Engine
        VAR_INPUT SPEED : INT; END_VAR
        METHOD Go : INT  Go := SPEED; END_METHOD
        SPEED := SPEED;
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK Driver
        VAR_IN_OUT ENG : Engine; END_VAR
        VAR_OUTPUT N : INT; END_VAR
        N := ENG.Go();
      END_FUNCTION_BLOCK
      PROGRAM main VAR e : Engine; d : Driver; END_VAR d(ENG := e); END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.cppCode ?? "").toContain("(*ENG).GO()");
  });
});

describe("a library function block's in-out", () => {
  const archive = () => {
    const r = compileStlib(
      [{ fileName: "motor.st", source: ENGINE + DRIVER }],
      { name: "motorlib", version: "1.0.0", namespace: "motorlib" },
    );
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
    return r.archive;
  };

  it("binds the caller's instance by pointer", () => {
    const result = compile(
      `PROGRAM main VAR e : Engine; d : Driver; END_VAR d(ENG := e); END_PROGRAM`,
      { programName: "main", libraries: [archive()] },
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.cppCode ?? "").toContain("D.ENG = &E;");
    expect(result.cppCode ?? "").not.toContain("E = D.ENG");
  });
});

describe("an in-out is not converted", () => {
  const withInOut = (type: string) =>
    `FUNCTION_BLOCK F VAR_IN_OUT v : ${type}; END_VAR v := v; END_FUNCTION_BLOCK\n`;
  const errorText = (source: string) =>
    (build(source).errors ?? []).map((e) => e.message).join("\n");

  it.each([
    ["INT", "DINT"],
    ["WORD", "UINT"],
  ])("refuses a %s where the in-out is %s", (actual, formal) => {
    expect(
      errorText(
        withInOut(formal) +
          `PROGRAM main VAR f : F; n : ${actual}; END_VAR f(v := n); END_PROGRAM`,
      ),
    ).toContain("is not converted");
  });

  it("accepts the same type", () => {
    const result = build(
      withInOut("INT") +
        `PROGRAM main VAR f : F; n : INT; END_VAR f(v := n); END_PROGRAM`,
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("leaves a structure in-out alone", () => {
    const result = build(`
      TYPE P : STRUCT a : INT; END_STRUCT END_TYPE
      FUNCTION_BLOCK S VAR_IN_OUT p : P; END_VAR p.a := 1; END_FUNCTION_BLOCK
      PROGRAM main VAR s : S; q : P; END_VAR s(p := q); END_PROGRAM
    `);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });
});

describe("an in-out supplied without a name", () => {
  it("binds a function block instance by pointer", () => {
    const result = build(ENGINE + DRIVER + `
      PROGRAM main VAR e : Engine; d : Driver; END_VAR d(e); END_PROGRAM
    `);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    expect(result.cppCode ?? "").toContain("D.ENG = &E;");
    expect(result.cppCode ?? "").not.toContain("could not be resolved");
  });

  it("copies a scalar in and back, in declaration order after an input", () => {
    const result = build(`
      FUNCTION_BLOCK Bump
        VAR_INPUT k : INT; END_VAR
        VAR_IN_OUT v : INT; END_VAR
        v := v + k;
      END_FUNCTION_BLOCK
      PROGRAM main VAR b : Bump; n : INT; END_VAR b(3, n); END_PROGRAM
    `);
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const cpp = result.cppCode ?? "";
    expect(cpp).toContain("B.K = 3;");
    expect(cpp).toContain("B.V = N;");
    expect(cpp).toContain("N = B.V;");
  });
});

describe("what a callee may do with a block handed to it", () => {
  const errorText = (source: string) =>
    (build(source).errors ?? []).map((e) => e.message).join("\n");

  const wrap = (callee: string) =>
    `${ENGINE}\n${callee}\nPROGRAM main VAR e : Engine; c : C; END_VAR c(ENG := e); END_PROGRAM`;

  it("refuses writing through one passed as an input", () => {
    expect(
      errorText(
        wrap(`FUNCTION_BLOCK C VAR_INPUT ENG : Engine; END_VAR ENG.SPEED := 5; END_FUNCTION_BLOCK`),
      ),
    ).toContain("can only be read");
  });

  it("refuses calling one passed as an input", () => {
    expect(
      errorText(
        wrap(`FUNCTION_BLOCK C VAR_INPUT ENG : Engine; END_VAR ENG(SPEED := 5); END_FUNCTION_BLOCK`),
      ),
    ).toContain("cannot be called");
  });

  it("allows reading one passed as an input", () => {
    const result = build(
      wrap(`FUNCTION_BLOCK C
              VAR_INPUT ENG : Engine; END_VAR
              VAR_OUTPUT S : BOOL; END_VAR
              S := ENG.RUNNING;
            END_FUNCTION_BLOCK`),
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("refuses writing an output of one passed as an in-out", () => {
    expect(
      errorText(
        wrap(`FUNCTION_BLOCK C VAR_IN_OUT ENG : Engine; END_VAR ENG.RUNNING := TRUE; END_FUNCTION_BLOCK`),
      ),
    ).toContain("can be read but not written");
  });

  it("refuses writing an output of one reached as an external", () => {
    expect(
      errorText(
        ENGINE +
          `VAR_GLOBAL GNODE : Engine; END_VAR
           FUNCTION_BLOCK X VAR_EXTERNAL GNODE : Engine; END_VAR GNODE.RUNNING := TRUE; END_FUNCTION_BLOCK
           PROGRAM main VAR x : X; END_VAR x(); END_PROGRAM`,
      ),
    ).toContain("can be read but not written");
  });

  it.each([
    [
      "writes an input of one passed as an in-out",
      `FUNCTION_BLOCK C VAR_IN_OUT ENG : Engine; END_VAR ENG.SPEED := 5; END_FUNCTION_BLOCK`,
    ],
    [
      "calls one passed as an in-out",
      `FUNCTION_BLOCK C VAR_IN_OUT ENG : Engine; END_VAR ENG(SPEED := 5); END_FUNCTION_BLOCK`,
    ],
  ])("allows a callee that %s", (_label, callee) => {
    const result = build(wrap(callee));
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("allows calling one reached as an external", () => {
    const result = build(
      ENGINE +
        `VAR_GLOBAL GNODE : Engine; END_VAR
         FUNCTION_BLOCK X VAR_EXTERNAL GNODE : Engine; END_VAR GNODE(SPEED := 5); END_FUNCTION_BLOCK
         PROGRAM main VAR x : X; END_VAR x(); END_PROGRAM`,
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });

  it("leaves a block's own local instance alone", () => {
    const result = build(
      ENGINE + `PROGRAM main VAR e : Engine; END_VAR e(SPEED := 1); e.SPEED := 2; END_PROGRAM`,
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
  });
});
