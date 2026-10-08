/**
 * STruC++ Semantic Analyzer - Call Parameter Names
 *
 * Every named argument of a call must name a parameter of the callee, on the
 * side it travels: an input or in-out is assigned with `:=`, an output is read
 * with `=>`. EN and ENO are the implicit input and output of every POU.
 *
 * A misspelt pin used to pass the check and reach C++ as a member the block
 * does not have (`T.BOGUS = true;`), failing only in the board build.
 */

import { describe, expect, it } from "vitest";

import { compile, compileStlib } from "../../src/index.js";
import { discoverStlibs } from "../../src/node/library-loader.js";

const BUNDLED = discoverStlibs("libs");

const build = (
  source: string,
  libraries: ReturnType<typeof discoverStlibs> = BUNDLED,
) => compile(source, { libraries });

const messages = (result: ReturnType<typeof build>): string[] =>
  (result.errors ?? []).map((e) => e.message);

const PUMP = `
FUNCTION_BLOCK Pump
  VAR_INPUT
    START : BOOL;
    SPEED : INT := 50;
  END_VAR
  VAR_OUTPUT
    RUNNING : BOOL;
  END_VAR
  RUNNING := START;
END_FUNCTION_BLOCK
`;

describe("a function block call", () => {
  it("rejects an input the block does not have", () => {
    const result = build(`
PROGRAM main
  VAR t : TON; END_VAR
  t(BOGUS := TRUE, PT := T#1s);
END_PROGRAM
`);
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual([
      "Function block 'TON' has no input 'BOGUS' (its inputs are IN, PT)",
    ]);
    expect(result.errors[0]!.line).toBe(4);
    expect(result.errors[0]!.column).toBe(5);
    expect(result.cppCode ?? "").not.toContain("BOGUS");
  });

  it("rejects an output the block does not have", () => {
    const result = build(
      PUMP +
        `
PROGRAM main
  VAR p : Pump; on : BOOL; END_VAR
  p(START := TRUE, RUN => on);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([
      "Function block 'PUMP' has no output 'RUN' (its outputs are RUNNING)",
    ]);
  });

  it("rejects '=>' on an input and ':=' on an output", () => {
    const result = build(
      PUMP +
        `
PROGRAM main
  VAR p : Pump; on : BOOL; END_VAR
  p(START => on, RUNNING := on);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([
      "'START' is an input of function block 'PUMP': assign it with ':=', not '=>'",
      "'RUNNING' is an output of function block 'PUMP': read it with '=>', not ':='",
    ]);
  });

  it("accepts its inputs, outputs and positional arguments", () => {
    const result = build(
      PUMP +
        `
PROGRAM main
  VAR p : Pump; t : TON; on : BOOL; END_VAR
  p(START := TRUE, SPEED := 10, RUNNING => on);
  p(TRUE);
  t(IN := on, PT := T#1s, Q => on);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([]);
  });

  it("is checked in a block's own body and a function's", () => {
    const result = build(
      PUMP +
        `
FUNCTION_BLOCK Station
  VAR p : Pump; END_VAR
  p(STRAT := TRUE);
END_FUNCTION_BLOCK
FUNCTION Kick : BOOL
  VAR t : TON; END_VAR
  t(INN := TRUE);
  Kick := t.Q;
END_FUNCTION
PROGRAM main
  VAR s : Station; END_VAR
  s();
END_PROGRAM
`,
    );
    expect(messages(result).sort()).toEqual([
      "Function block 'PUMP' has no input 'STRAT' (its inputs are START, SPEED)",
      "Function block 'TON' has no input 'INN' (its inputs are IN, PT)",
    ]);
  });
});

describe("EN and ENO", () => {
  it("are accepted on every block and function without a declaration", () => {
    const result = build(
      PUMP +
        `
FUNCTION Twice : INT
  VAR_INPUT v : INT; END_VAR
  Twice := v * 2;
END_FUNCTION
PROGRAM main
  VAR p : Pump; t : TON; ok : BOOL; i : INT; END_VAR
  p(EN := TRUE, START := TRUE, ENO => ok);
  t(EN := ok, IN := TRUE, PT := T#1s, ENO => ok);
  i := Twice(EN := ok, v := 1, ENO => ok);
  i := LIMIT(EN := ok, MN := 0, IN := 5, MX := 10, ENO => ok);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([]);
  });

  it("travel only their own way", () => {
    const result = build(`
PROGRAM main
  VAR t : TON; ok : BOOL; END_VAR
  t(EN => ok, ENO := ok, IN := TRUE, PT := T#1s);
END_PROGRAM
`);
    expect(messages(result)).toEqual([
      "'EN' is the implicit input of function block 'TON': assign it with ':='",
      "'ENO' is the implicit output of function block 'TON': read it with '=>'",
    ]);
  });
});

describe("an instance reached through a path", () => {
  const TYPES = `
TYPE Cell : STRUCT
  pump : Pump;
  spare : ARRAY[1..2] OF Pump;
END_STRUCT; END_TYPE
TYPE Bank : ARRAY[0..3] OF Pump; END_TYPE
`;

  it("checks an element of an array", () => {
    const result = build(
      PUMP +
        TYPES +
        `
PROGRAM main
  VAR pumps : ARRAY[1..2] OF Pump; bank : Bank; END_VAR
  pumps[1](BOGUS := TRUE);
  bank[2](START := TRUE, SPED := 1);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([
      "Function block 'PUMP' has no input 'BOGUS' (its inputs are START, SPEED)",
      "Function block 'PUMP' has no input 'SPED' (its inputs are START, SPEED)",
    ]);
  });

  it("checks a field of a struct and a member of a block", () => {
    const result = build(
      PUMP +
        TYPES +
        `
FUNCTION_BLOCK Station
  VAR p : Pump; END_VAR
  p();
END_FUNCTION_BLOCK
PROGRAM main
  VAR c : Cell; s : Station; END_VAR
  c.pump(BOGUS := TRUE);
  s.p(BOGUS := TRUE);
  c.pump(START := TRUE);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([
      "Function block 'PUMP' has no input 'BOGUS' (its inputs are START, SPEED)",
      "Function block 'PUMP' has no input 'BOGUS' (its inputs are START, SPEED)",
    ]);
  });
});

describe("inheritance and methods", () => {
  const DERIVED = `
FUNCTION_BLOCK Dosing EXTENDS Pump
  VAR_INPUT LITRES : REAL; END_VAR
  METHOD Prime
    VAR_INPUT SECONDS : INT; END_VAR
  END_METHOD
END_FUNCTION_BLOCK
`;

  it("accepts the parameters a block inherits", () => {
    const result = build(
      PUMP +
        DERIVED +
        `
PROGRAM main
  VAR d : Dosing; on : BOOL; END_VAR
  d(START := TRUE, LITRES := 1.5, RUNNING => on);
  d.Prime(SECONDS := 3);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([]);
  });

  it("rejects a method parameter that is not declared", () => {
    const result = build(
      PUMP +
        DERIVED +
        `
PROGRAM main
  VAR d : Dosing; END_VAR
  d(LITERS := 1.5);
  d.Prime(SECS := 3);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([
      "Function block 'DOSING' has no input 'LITERS' (its inputs are START, SPEED, LITRES)",
      "Method 'DOSING.PRIME' has no input 'SECS' (its inputs are SECONDS)",
    ]);
  });
});

describe("a function call", () => {
  const SCALE = `
FUNCTION Scale : REAL
  VAR_INPUT RAW : INT; SPAN : REAL := 100.0; END_VAR
  VAR_OUTPUT CLIPPED : BOOL; END_VAR
  Scale := INT_TO_REAL(RAW) * SPAN;
END_FUNCTION
`;

  it("rejects an input or output the function does not have", () => {
    const result = build(
      SCALE +
        `
PROGRAM main
  VAR r : REAL; c : BOOL; END_VAR
  r := Scale(RAW := 1, GAIN := 2.0);
  r := Scale(RAW := 1, CLIP => c);
  r := Scale(RAW := 1, SPAN := 2.0, CLIPPED => c);
END_PROGRAM
`,
    );
    expect(messages(result)).toEqual([
      "Function 'SCALE' has no input 'GAIN' (its inputs are RAW, SPAN)",
      "Function 'SCALE' has no output 'CLIP' (its outputs are CLIPPED)",
    ]);
  });

  it("leaves a standard function's arguments to their own check", () => {
    const result = build(`
PROGRAM main
  VAR i : INT; END_VAR
  i := ADD(IN1 := 1, IN2 := 2, IN3 := 3);
END_PROGRAM
`);
    expect(messages(result)).toEqual([]);
  });
});

describe("a block or function from a library", () => {
  const archive = (() => {
    const r = compileStlib(
      [
        {
          fileName: "modem.st",
          source: `
FUNCTION_BLOCK GSM_MODEM
  VAR_INPUT ENABLED : BOOL; APN : STRING; END_VAR
  VAR_OUTPUT READY : BOOL; END_VAR
  READY := ENABLED;
END_FUNCTION_BLOCK
FUNCTION SIGNAL_BARS : INT
  VAR_INPUT RSSI : INT; END_VAR
  SIGNAL_BARS := RSSI / 20;
END_FUNCTION
`,
        },
      ],
      { name: "modemlib", version: "1.0.0", namespace: "modemlib" },
    );
    expect(r.success, JSON.stringify(r.errors)).toBe(true);
    return r.archive;
  })();

  it("checks the interface the manifest carries", () => {
    const result = build(
      `
PROGRAM main
  VAR m : GSM_MODEM; ok : BOOL; bars : INT; END_VAR
  m(ENABLE := TRUE, READY => ok);
  m(ENABLED := TRUE, APN := 'internet', READY => ok);
  bars := SIGNAL_BARS(RSSI := 60);
  bars := SIGNAL_BARS(LEVEL := 60);
END_PROGRAM
`,
      [...BUNDLED, archive],
    );
    expect(messages(result)).toEqual([
      "Function block 'GSM_MODEM' has no input 'ENABLE' (its inputs are ENABLED, APN)",
      "Function 'SIGNAL_BARS' has no input 'LEVEL' (its inputs are RSSI)",
      "'SIGNAL_BARS' is missing required input: RSSI",
    ]);
  });
});

describe("an IL call", () => {
  it("is checked like the ST it becomes", () => {
    const result = build(`
PROGRAM main
  VAR tmr : TON; END_VAR
CAL tmr(IN := TRUE, PTT := T#5s)
END_PROGRAM
`);
    expect(messages(result)).toEqual([
      "Function block 'TON' has no input 'PTT' (its inputs are IN, PT)",
    ]);
  });
});
