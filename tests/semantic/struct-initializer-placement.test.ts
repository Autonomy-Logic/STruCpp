/**
 * A structure initializer `(NAME := value, ...)` is `structure_initialization`
 * (Annex B.1.4.3), part of `var_init_decl` — not an expression. IEC therefore
 * has no position for it inside a statement.
 *
 * It used to reach codegen from three real statement positions, where the
 * target's C++ type is unknown and the emitter value-initialised instead:
 *
 *     arr := [(x := 1.0), (x := 2.0)];   ->  ARR = {{}, {}};
 *     f(P := (x := 3.0));                ->  F.P = {};
 *     s := (x := 1.0);                   ->  S = {};
 *
 * Each compiled clean, produced no diagnostic, and ran with every written
 * element discarded — the members left at whatever their own declarations
 * defaulted to. Now reported against the source.
 *
 * The accepted half is the point of the check: every position where IEC *does*
 * allow the form has to keep working, or this blocks valid code.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

const POINT = `
TYPE
  Point : STRUCT
    x : REAL := 9.0;
    y : REAL := 8.0;
  END_STRUCT;
END_TYPE
`;

function errorsFor(source: string): string[] {
  return compile(source).errors.map((e) => e.message);
}

function expectClean(source: string): void {
  expect(errorsFor(source)).toEqual([]);
}

/** The one diagnostic this check emits. */
const PLACEMENT = "only valid as a variable's initial value in a declaration";

describe("structure initializer placement — rejected in statements", () => {
  it("rejects a structure initializer assigned to a variable", () => {
    const errors = errorsFor(`
      ${POINT}
      PROGRAM Main
        VAR p : Point; END_VAR
        p := (x := 1.0);
      END_PROGRAM
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(PLACEMENT);
  });

  it("rejects structure initializers inside an array literal in a statement", () => {
    const errors = errorsFor(`
      ${POINT}
      PROGRAM Main
        VAR arr : ARRAY[0..1] OF Point; END_VAR
        arr := [(x := 1.0), (x := 2.0)];
      END_PROGRAM
    `);
    // One per initializer — they are two separate mistakes.
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain(PLACEMENT);
    expect(errors[1]).toContain(PLACEMENT);
  });

  it("rejects a structure initializer passed as a named FB argument", () => {
    const errors = errorsFor(`
      ${POINT}
      FUNCTION_BLOCK Sink
        VAR_INPUT p : Point; END_VAR
        p.x := p.x;
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR s : Sink; END_VAR
        s(p := (x := 3.0));
      END_PROGRAM
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(PLACEMENT);
  });

  it("reports one diagnostic for a nested structure initializer, not one per level", () => {
    const errors = errorsFor(`
      TYPE
        Inner : STRUCT v : REAL := 1.0; END_STRUCT;
        Outer : STRUCT i : Inner; END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR o : Outer; END_VAR
        o := (i := (v := 2.0));
      END_PROGRAM
    `);
    expect(errors).toHaveLength(1);
  });

  it("reports the line and column of the initializer", () => {
    const result = compile(
      `${POINT}
PROGRAM Main
  VAR p : Point; END_VAR
  p := (x := 1.0);
END_PROGRAM
`,
    );
    const err = result.errors[0]!;
    expect(err.message).toContain(PLACEMENT);
    // Points at the `(` that opens the initializer, not at the statement.
    expect(err.line).toBe(11);
    expect(err.column).toBe(8);
  });

  it("rejects one inside a control-flow body", () => {
    const errors = errorsFor(`
      ${POINT}
      PROGRAM Main
        VAR p : Point; c : BOOL; END_VAR
        IF c THEN
          p := (x := 1.0);
        END_IF;
      END_PROGRAM
    `);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(PLACEMENT);
  });

  it("rejects one in a function block body and in a method body", () => {
    const errors = errorsFor(`
      ${POINT}
      FUNCTION_BLOCK Holder
        VAR p : Point; END_VAR
        METHOD Reset
          p := (x := 5.0);
        END_METHOD
        p := (x := 1.0);
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR h : Holder; END_VAR
        h();
      END_PROGRAM
    `);
    expect(errors).toHaveLength(2);
    for (const e of errors) expect(e).toContain(PLACEMENT);
  });
});

describe("structure initializer placement — accepted in declarations", () => {
  it("accepts a PROGRAM variable's initial value", () => {
    expectClean(`
      ${POINT}
      PROGRAM Main
        VAR p : Point := (x := 1.0, y := 2.0); END_VAR
        p.x := p.y;
      END_PROGRAM
    `);
  });

  it("accepts structure initializers nested in an array literal initial value", () => {
    expectClean(`
      ${POINT}
      PROGRAM Main
        VAR arr : ARRAY[0..1] OF Point := [(x := 1.0), (x := 2.0)]; END_VAR
        arr[0].x := arr[1].y;
      END_PROGRAM
    `);
  });

  it("accepts a STRUCT element default", () => {
    expectClean(`
      TYPE
        Point : STRUCT x : REAL := 9.0; END_STRUCT;
        Outer : STRUCT p : Point := (x := 5.0); END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR o : Outer; END_VAR
        o.p.x := o.p.x;
      END_PROGRAM
    `);
  });

  it("accepts a type-level default (Annex B.1.3.3)", () => {
    expectClean(`
      ${POINT}
      TYPE
        Origin : Point := (x := 0.0, y := 0.0);
      END_TYPE
      PROGRAM Main
        VAR p : Origin; END_VAR
        p.x := p.y;
      END_PROGRAM
    `);
  });

  it("accepts a file-level VAR_GLOBAL initial value", () => {
    expectClean(`
      ${POINT}
      VAR_GLOBAL
        origin : Point := (x := 1.0, y := 2.0);
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL origin : Point; END_VAR
        origin.x := origin.y;
      END_PROGRAM
    `);
  });

  it("accepts a FUNCTION_BLOCK member and a METHOD local initial value", () => {
    expectClean(`
      ${POINT}
      FUNCTION_BLOCK Holder
        VAR p : Point := (x := 1.0); END_VAR
        METHOD Reset
          VAR q : Point := (y := 2.0); END_VAR
          p.x := q.y;
        END_METHOD
        p.x := p.y;
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR h : Holder; END_VAR
        h();
      END_PROGRAM
    `);
  });

  it("leaves an ordinary parenthesized expression alone", () => {
    expectClean(`
      PROGRAM Main
        VAR a : INT; b : INT; END_VAR
        a := (b + 1) * 2;
      END_PROGRAM
    `);
  });
});
