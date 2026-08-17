/**
 * Every emitter that names a C++ member has to agree on the mangling rule,
 * because they all name the same entity. This file asserts that agreement
 * directly, rather than testing each emitter in isolation — the bugs in this
 * area have all been one emitter drifting from another, and only a
 * cross-emitter assertion catches that.
 *
 * A member is renamed for two reasons (see `src/backend/member-mangling.ts`):
 * its name matches its own type's name, or it matches an interface method the
 * owning FB implements. Both are case-insensitive, because ST names are —
 * `rig : Rig` collides just as `Rig : Rig` does.
 *
 * The inverse matters as much: elementary type names are not reserved, so
 * `Time : TIME` is an ordinary declaration that must stay unmangled everywhere.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

const MOTOR = `
FUNCTION_BLOCK Motor
VAR_INPUT run : BOOL; END_VAR
VAR_OUTPUT spinning : BOOL; END_VAR
  spinning := run;
END_FUNCTION_BLOCK`;

function build(source: string): { header: string; cpp: string } {
  const result = compile(source);
  expect(result.errors.map((e) => e.message)).toEqual([]);
  expect(result.success).toBe(true);
  return { header: result.headerCode, cpp: result.cppCode };
}

/** The constructor initializer-list line for a program. */
function initList(cpp: string): string {
  return cpp.split("\n").find((l) => l.trimStart().startsWith(": ")) ?? "";
}

describe("declaration and constructor initializer list agree", () => {
  it("mangles an initialised PROGRAM member in both places", () => {
    // The declaration was mangled but the initializer list was not, so any
    // colliding member *with an initialiser* failed to compile:
    //   error: member initializer 'AIRANGE' does not name a non-static data
    //          member or base class
    const { header, cpp } = build(`
TYPE AiRange : STRUCT lo : REAL := 4.0; hi : REAL := 20.0; END_STRUCT; END_TYPE
PROGRAM Main
VAR AiRange : AiRange := (hi := 22.0); n : INT; END_VAR
  n := n + 1;
END_PROGRAM`);
    expect(header).toContain("AIRANGE AIRANGE_;");
    expect(initList(cpp)).toContain("AIRANGE_(");
    // The unmangled spelling must not appear as an initializer target.
    expect(initList(cpp)).not.toMatch(/(^|[\s:,])AIRANGE\(/);
  });

  it("matches case-insensitively, as ST names do", () => {
    const { header, cpp } = build(`
TYPE Range1 : STRUCT lo : REAL := 1.0; END_STRUCT; END_TYPE
PROGRAM Main
VAR range1 : Range1 := (lo := 3.0); n : INT; END_VAR
  n := n + 1;
END_PROGRAM`);
    expect(header).toContain("RANGE1 RANGE1_;");
    expect(initList(cpp)).toContain("RANGE1_(");
  });

  it("leaves an initialised elementary-named member unmangled in both places", () => {
    const { header, cpp } = build(`
PROGRAM Main
VAR Time : TIME := T#5s; Word : WORD := 16#FF; END_VAR
  Word := Word;
END_PROGRAM`);
    expect(header).toContain("IEC_TIME TIME;");
    expect(header).toContain("IEC_WORD WORD;");
    const inits = initList(cpp);
    expect(inits).toContain("TIME(");
    expect(inits).toContain("WORD(");
    expect(inits).not.toContain("TIME_(");
    expect(inits).not.toContain("WORD_(");
  });

  it("already agreed for a FUNCTION_BLOCK member, and still does", () => {
    const { header, cpp } = build(`
TYPE AiRange : STRUCT lo : REAL := 4.0; END_STRUCT; END_TYPE
FUNCTION_BLOCK Holder
VAR AiRange : AiRange := (lo := 9.0); END_VAR
  AiRange.lo := AiRange.lo;
END_FUNCTION_BLOCK
PROGRAM Main
VAR h : Holder; END_VAR
  h();
END_PROGRAM`);
    expect(header).toContain("AIRANGE AIRANGE_;");
    expect(cpp).toContain("AIRANGE_(");
  });
});

describe("declaration and statement body agree", () => {
  it("names the mangled member when the body reaches through it", () => {
    const { header, cpp } = build(`${MOTOR}
PROGRAM Main
VAR Motor : Motor; flag : BOOL; END_VAR
  Motor(run := TRUE);
  flag := Motor.spinning;
END_PROGRAM`);
    expect(header).toContain("MOTOR MOTOR_;");
    expect(cpp).toContain("MOTOR_.SPINNING");
  });

  it("leaves an elementary-named member alone in the body", () => {
    const { header, cpp } = build(`
PROGRAM Main
VAR Word : WORD; n : INT; END_VAR
  Word := WORD#7;
  n := n + 1;
END_PROGRAM`);
    expect(header).toContain("IEC_WORD WORD;");
    expect(cpp).toContain("WORD = ");
    expect(cpp).not.toContain("WORD_");
  });
});

describe("declaration and STRUCT field emission agree", () => {
  it("mangles a field named after its own type", () => {
    const { header } = build(`
TYPE
  Inner : STRUCT v : BOOL; END_STRUCT;
  Outer : STRUCT Inner : Inner; plain : BOOL; END_STRUCT;
END_TYPE
PROGRAM Main
VAR o : Outer; END_VAR
  o.plain := FALSE;
END_PROGRAM`);
    expect(header).toContain("INNER INNER_");
    expect(header).toContain("IEC_BOOL PLAIN");
  });

  it("mangles a struct field whose type is a function block", () => {
    // Needs codegen's type resolution, not just the type declarations:
    // a bare TypeCodeGenerator cannot tell that MOTOR is a function block.
    const { header } = build(`${MOTOR}
TYPE Rig : STRUCT Motor : Motor; idle : BOOL; END_STRUCT; END_TYPE
PROGRAM Main
VAR r : Rig; END_VAR
  r.idle := FALSE;
END_PROGRAM`);
    expect(header).toContain("MOTOR MOTOR_");
  });

  it("leaves an elementary-named struct field alone", () => {
    const { header } = build(`
TYPE Bag : STRUCT Time : TIME; Word : WORD; END_STRUCT; END_TYPE
PROGRAM Main
VAR b : Bag; END_VAR
  b.Word := 16#FF;
END_PROGRAM`);
    expect(header).toContain("IEC_TIME TIME");
    expect(header).toContain("IEC_WORD WORD");
    expect(header).not.toContain("TIME_");
    expect(header).not.toContain("WORD_");
  });
});

describe("interface method collision", () => {
  it("mangles the variable, leaving the method to own the name", () => {
    const { header, cpp } = build(`
INTERFACE IMotor
  METHOD Start : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Drive IMPLEMENTS IMotor
VAR Start : BOOL := TRUE; other : INT; END_VAR
  METHOD Start : BOOL
    Start := TRUE;
  END_METHOD
  other := 1;
END_FUNCTION_BLOCK
PROGRAM Main
VAR d : Drive; END_VAR
  d();
END_PROGRAM`);
    expect(header).toContain("IEC_BOOL START_;");
    expect(header).toContain("virtual IEC_BOOL START();");
    // The initialiser names the variable, not the method.
    expect(cpp).toContain("START_(");
  });
});

describe("declaration and function-block invocation agree", () => {
  /**
   * Invoking an FB assigns its inputs, copies VAR_IN_OUT back, and captures
   * `=>` outputs — all through `instance.MEMBER`. A parameter named after its
   * own type, or after an interface method the FB implements, is declared with
   * the underscore, so the bare name reaches nothing:
   *
   *   error: no member named 'READING' in 'strucpp::SENSOR'
   */
  const READING = `
TYPE Reading : STRUCT v : REAL; END_STRUCT; END_TYPE`;

  it("mangles a named input whose name matches its type", () => {
    const { header, cpp } = build(`${READING}
FUNCTION_BLOCK Sensor
VAR_INPUT Reading : Reading; END_VAR
VAR_OUTPUT o : REAL; END_VAR
  o := Reading.v;
END_FUNCTION_BLOCK
PROGRAM Main
VAR s : Sensor; inp : Reading; END_VAR
  s(Reading := inp);
END_PROGRAM`);
    expect(header).toContain("READING READING_;");
    expect(cpp).toContain("S.READING_ = INP;");
  });

  it("mangles a positional input too", () => {
    const { cpp } = build(`${READING}
FUNCTION_BLOCK Sensor
VAR_INPUT Reading : Reading; END_VAR
VAR_OUTPUT o : REAL; END_VAR
  o := Reading.v;
END_FUNCTION_BLOCK
PROGRAM Main
VAR s : Sensor; inp : Reading; END_VAR
  s(inp);
END_PROGRAM`);
    expect(cpp).toContain("S.READING_ = INP;");
  });

  it("mangles an input colliding with an implemented interface method", () => {
    const { header, cpp } = build(`
INTERFACE IProbe
  METHOD Arm : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Sensor IMPLEMENTS IProbe
VAR_INPUT Arm : BOOL; gain : REAL; END_VAR
VAR_OUTPUT o : REAL; END_VAR
  METHOD Arm : BOOL
    Arm := TRUE;
  END_METHOD
  o := gain;
END_FUNCTION_BLOCK
PROGRAM Main
VAR s : Sensor; END_VAR
  s(Arm := TRUE, gain := 2.0);
END_PROGRAM`);
    expect(header).toContain("IEC_BOOL ARM_;");
    expect(cpp).toContain("S.ARM_ = true;");
    // A non-colliding sibling is untouched.
    expect(cpp).toContain("S.GAIN = 2.0;");
  });

  it("mangles the VAR_IN_OUT copy-back and the => output capture", () => {
    const { cpp } = build(`${READING}
FUNCTION_BLOCK Sensor
VAR_INPUT gain : REAL; END_VAR
VAR_OUTPUT Reading : Reading; END_VAR
VAR_IN_OUT acc : Reading; END_VAR
  Reading.v := gain;
  acc.v := gain;
END_FUNCTION_BLOCK
PROGRAM Main
VAR s : Sensor; tally : Reading; got : Reading; END_VAR
  s(gain := 1.0, acc := tally, Reading => got);
END_PROGRAM`);
    // copy-out of the inout, and the => capture, both name the mangled member
    expect(cpp).toContain("TALLY = S.ACC;");
    expect(cpp).toContain("GOT = S.READING_;");
  });

  it("leaves an elementary-named FB input alone", () => {
    const { header, cpp } = build(`
FUNCTION_BLOCK Sensor
VAR_INPUT Time : TIME; END_VAR
VAR_OUTPUT o : TIME; END_VAR
  o := Time;
END_FUNCTION_BLOCK
PROGRAM Main
VAR s : Sensor; END_VAR
  s(Time := T#1s);
END_PROGRAM`);
    expect(header).toContain("IEC_TIME TIME;");
    expect(cpp).toContain("S.TIME = ");
    expect(cpp).not.toContain("S.TIME_");
  });
});
