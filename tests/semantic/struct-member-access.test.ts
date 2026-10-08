/**
 * STruC++ Semantic Analyzer - Members named in an access path
 *
 * IEC 61131-3 §6.4.4.6.1: an element of a structured variable is named by
 * "two or more identifiers or array accesses separated by single periods",
 * the later identifiers naming "the sequence of element names to access the
 * particular data element within the data structure". §6.6.3.4, Table 41
 * features 6a and 7: an instance's inputs and outputs are reached as
 * `FB_Instance.Input` and `FB_Instance.Output`.
 *
 * A name the type does not declare names nothing. It used to be accepted —
 * "Compilation successful" — and only the C++ compiler rejected it ("has no
 * member named"), with no ST location.
 */

import { describe, expect, it } from "vitest";

import { compile, compileStlib } from "../../src/index.js";
import { discoverStlibs } from "../../src/node/library-loader.js";

const BUNDLED = discoverStlibs("libs");

const build = (
  source: string,
  libraries: ReturnType<typeof discoverStlibs> = BUNDLED,
) => compile(source, { libraries });

const errors = (result: ReturnType<typeof build>) =>
  (result.errors ?? []).map((e) => ({ message: e.message, line: e.line }));

const CONFIG = `
CONFIGURATION C
  RESOURCE R ON PLC
    TASK t(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM i WITH t : P;
  END_RESOURCE
END_CONFIGURATION`;

const TYPES = `
TYPE S1 : STRUCT a : BOOL; n : INT; END_STRUCT; END_TYPE
TYPE S2 : STRUCT inner : S1; arr : ARRAY[1..3] OF S1; END_STRUCT; END_TYPE
TYPE S1ALIAS : S1; END_TYPE
`;

const BLOCK = `
FUNCTION_BLOCK Cell
  VAR_INPUT go : BOOL; END_VAR
  VAR_OUTPUT done : BOOL; state : S1; END_VAR
  VAR count : INT; END_VAR
  done := go;
END_FUNCTION_BLOCK
`;

describe("a member named in an access path (IEC 61131-3 §6.4.4.6.1)", () => {
  it("reports the effluent repro: a write to a member a global and a local do not have", () => {
    const result = build(
      `
TYPE S1 : STRUCT a : BOOL; END_STRUCT; END_TYPE
VAR_GLOBAL G : S1; END_VAR
PROGRAM P
  VAR_EXTERNAL G : S1; END_VAR
  VAR x : S1; END_VAR
  G.nosuch := TRUE;
  x.nosuch2 := TRUE;
END_PROGRAM
${CONFIG}`,
    );
    expect(errors(result)).toEqual([
      { message: "'NOSUCH' is not a member of structure type S1", line: 7 },
      { message: "'NOSUCH2' is not a member of structure type S1", line: 8 },
    ]);
  });

  it("reports reads as well as writes", () => {
    const result = build(
      `${TYPES}
PROGRAM P
  VAR x : S1; b : BOOL; END_VAR
  b := x.missing;
  IF x.gone THEN b := FALSE; END_IF;
END_PROGRAM
${CONFIG}`,
    );
    expect(errors(result).map((e) => e.message)).toEqual([
      "'MISSING' is not a member of structure type S1",
      "'GONE' is not a member of structure type S1",
    ]);
  });

  it("follows nested structures, array elements and aliases", () => {
    const result = build(
      `${TYPES}
PROGRAM P
  VAR s : S2; arr : ARRAY[0..1] OF S2; al : S1ALIAS; b : BOOL; END_VAR
  s.inner.a := TRUE;
  s.arr[2].n := 3;
  arr[1].inner.n := 4;
  al.a := TRUE;
  s.inner.zz := TRUE;
  s.arr[2].yy := 1;
  arr[0].inner.xx := 1;
  b := al.ww;
  s.nope.a := TRUE;
END_PROGRAM
${CONFIG}`,
    );
    expect(errors(result).map((e) => e.message)).toEqual([
      "'ZZ' is not a member of structure type S1",
      "'YY' is not a member of structure type S1",
      "'XX' is not a member of structure type S1",
      "'WW' is not a member of structure type S1",
      "'NOPE' is not a member of structure type S2",
    ]);
  });

  it("checks function block instance members (Table 41 features 6a, 7)", () => {
    const result = build(
      `${TYPES}${BLOCK}
PROGRAM P
  VAR c : Cell; cells : ARRAY[1..2] OF Cell; b : BOOL; n : INT; END_VAR
  c.go := TRUE;
  c(ENO => b);
  b := c.done AND c.ENO;
  n := c.state.n;
  b := cells[1].done;
  c.speed := 1;
  b := cells[2].finished;
  b := c.state.zz;
END_PROGRAM
${CONFIG}`,
    );
    expect(errors(result).map((e) => e.message)).toEqual([
      "'SPEED' is not a member of function block type CELL",
      "'FINISHED' is not a member of function block type CELL",
      "'ZZ' is not a member of structure type S1",
    ]);
  });

  it("checks inherited members, methods and properties of a function block", () => {
    const result = build(
      `
FUNCTION_BLOCK Base
  VAR_OUTPUT q : BOOL; END_VAR
  METHOD PUBLIC Reset
    q := FALSE;
  END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Derived EXTENDS Base
  VAR_INPUT x : BOOL; END_VAR
  PROPERTY PUBLIC Level : INT
    GET Level := 1; END_GET
  END_PROPERTY
  q := x;
END_FUNCTION_BLOCK
PROGRAM P
  VAR d : Derived; b : BOOL; n : INT; END_VAR
  d.x := TRUE;
  b := d.q;
  n := d.Level;
  d.Reset();
  b := d.absent;
END_PROGRAM
${CONFIG}`,
    );
    expect(errors(result).map((e) => e.message)).toEqual([
      "'ABSENT' is not a member of function block type DERIVED",
    ]);
  });

  it("checks the instance a call names (st.cell(...), as resolveCallee follows it)", () => {
    const result = build(
      `${BLOCK}
FUNCTION_BLOCK Station
  VAR_INPUT en : BOOL; END_VAR
  VAR cell : Cell; END_VAR
  cell(go := en);
END_FUNCTION_BLOCK
FUNCTION_BLOCK Line
  VAR st : Station; END_VAR
  st(en := TRUE);
  st.cel(go := FALSE);
END_FUNCTION_BLOCK
PROGRAM P
  VAR st : Station; sts : ARRAY[1..2] OF Station; ln : Line; END_VAR
  st.cell(go := TRUE);
  sts[1](en := TRUE);
  st.cel(go := TRUE);
END_PROGRAM
${CONFIG}`,
    );
    const messages = errors(result).map((e) => e.message);
    expect(messages.filter((m) => m.includes("is not a member"))).toEqual([
      "'CEL' is not a member of function block type STATION",
      "'CEL' is not a member of function block type STATION",
    ]);
  });

  it("leaves partial access, generics and elementary members to their own checks", () => {
    const result = build(
      `${TYPES}
PROGRAM P
  VAR w : WORD; s : S1; b : BOOL; t : TON; END_VAR
  b := w.3;
  s.n.%X2 := TRUE;
  b := t.Q;
  t(IN := TRUE, PT := T#1s);
END_PROGRAM
${CONFIG}`,
    );
    expect(errors(result)).toEqual([]);
  });

  it("checks a library structure from its manifest", () => {
    const archive = (() => {
      const r = compileStlib(
        [
          {
            fileName: "plant.st",
            source: `
TYPE PlantState : STRUCT level : REAL; alarm : BOOL; END_STRUCT; END_TYPE
FUNCTION_BLOCK PlantFb
  VAR_OUTPUT st : PlantState; END_VAR
  st.alarm := FALSE;
END_FUNCTION_BLOCK
`,
          },
        ],
        { name: "plantlib", version: "1.0.0", namespace: "plantlib" },
      );
      expect(r.success, JSON.stringify(r.errors)).toBe(true);
      return r.archive;
    })();
    const result = build(
      `
PROGRAM P
  VAR s : PlantState; f : PlantFb; r : REAL; b : BOOL; END_VAR
  r := s.level;
  b := f.st.alarm;
  s.levl := 1.0;
  b := f.st.alrm;
END_PROGRAM
${CONFIG}`,
      [...BUNDLED, archive],
    );
    expect(errors(result).map((e) => e.message)).toEqual([
      "'LEVL' is not a member of structure type PlantState",
      "'ALRM' is not a member of structure type PlantState",
    ]);
  });
});
