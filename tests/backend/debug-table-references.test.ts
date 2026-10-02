/**
 * Pointers and references are left out of the debug table.
 *
 * A POINTER TO / REF_TO / REFERENCE TO holds an address, not a value of its
 * element type. It used to be registered as the element type, so the debugger
 * read the pointer's own bytes as the value and a write from the debugger
 * overwrote the pointer. The table has no per-leaf width and a pointer is 2, 4
 * or 8 bytes depending on the target, so such a variable is skipped, with a
 * build warning naming it; everything around it stays debuggable.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

const SOURCE = `
TYPE S : STRUCT r : REF_TO INT; v : INT; END_STRUCT; END_TYPE
TYPE P2 : POINTER TO POINTER TO INT; END_TYPE
FUNCTION_BLOCK F
VAR p : POINTER TO REAL; k : INT; END_VAR
END_FUNCTION_BLOCK
PROGRAM main
VAR
  x : INT;
  px : POINTER TO INT;
  ppx : POINTER TO POINTER TO INT;
  r : REF_TO INT;
  rt : REFERENCE TO INT;
  pa : POINTER TO ARRAY[0..3] OF INT;
  alias_pp : P2;
  s : S;
  f : F;
END_VAR
END_PROGRAM
CONFIGURATION c
RESOURCE r1 ON PLC
TASK t(INTERVAL := T#10ms, PRIORITY := 1);
PROGRAM inst WITH t : main;
END_RESOURCE
END_CONFIGURATION
`;

describe("debug table and references", () => {
  const result = compile(SOURCE);

  it("compiles", () => {
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("registers only the value leaves", () => {
    expect(result.debugMap?.leaves.map((l) => `${l.path}:${l.type}`)).toEqual([
      "INST.X:INT",
      "INST.S.V:INT",
      "INST.F.K:INT",
    ]);
  });

  it("names every pointer and reference it leaves out", () => {
    const skipped = result.warnings
      .map((w) => w.message)
      .filter((m) => m.includes("is not debuggable"));
    expect(skipped).toEqual([
      "INST.PX is not debuggable: a POINTER TO holds an address, which the debugger cannot show or write.",
      "INST.PPX is not debuggable: a POINTER TO holds an address, which the debugger cannot show or write.",
      "INST.R is not debuggable: a REF_TO holds an address, which the debugger cannot show or write.",
      "INST.RT is not debuggable: a REFERENCE TO holds an address, which the debugger cannot show or write.",
      "INST.PA is not debuggable: a POINTER TO holds an address, which the debugger cannot show or write.",
      "INST.ALIAS_PP is not debuggable: a POINTER TO holds an address, which the debugger cannot show or write.",
      "INST.S.R is not debuggable: a REF_TO holds an address, which the debugger cannot show or write.",
      "INST.F.P is not debuggable: a POINTER TO holds an address, which the debugger cannot show or write.",
    ]);
  });

  it("the debug table C++ has no entry for a pointer", () => {
    expect(result.debugTableCpp).not.toMatch(/\bPX\b|\bPPX\b|\bALIAS_PP\b/);
  });
});

describe("debug table and arrays of references", () => {
  const result = compile(`
TYPE PAT : ARRAY[0..1] OF POINTER TO INT; END_TYPE
TYPE PI : POINTER TO INT; END_TYPE
TYPE PIA : ARRAY[0..1] OF PI; END_TYPE
PROGRAM main
VAR
  ia : ARRAY[0..1] OF POINTER TO INT;
  pa : ARRAY[0..999] OF PI;
  tpa : PIA;
  ra : ARRAY[0..1] OF REF_TO INT;
  ta : PAT;
  y : ARRAY[0..1] OF INT;
END_VAR
END_PROGRAM
CONFIGURATION c
RESOURCE r1 ON PLC
TASK t(INTERVAL := T#10ms, PRIORITY := 1);
PROGRAM inst WITH t : main;
END_RESOURCE
END_CONFIGURATION
`);

  it("keeps value arrays and leaves arrays of references out, once per array", () => {
    expect(result.errors).toEqual([]);
    expect(result.debugMap?.leaves.map((l) => l.path)).toEqual([
      "INST.Y[0]",
      "INST.Y[1]",
    ]);
    expect(
      result.warnings
        .map((w) => w.message)
        .filter((m) => m.includes("is not debuggable")),
    ).toEqual([
      "INST.IA is not debuggable: an array of POINTER TO holds addresses, which the debugger cannot show or write.",
      "INST.PA is not debuggable: an array of POINTER TO holds addresses, which the debugger cannot show or write.",
      "INST.TPA is not debuggable: an array of POINTER TO holds addresses, which the debugger cannot show or write.",
      "INST.RA is not debuggable: an array of REF_TO holds addresses, which the debugger cannot show or write.",
      "INST.TA is not debuggable: an array of POINTER TO holds addresses, which the debugger cannot show or write.",
    ]);
  });
});
