/**
 * A REF_TO is typed (IEC 61131-3): it can only hold a reference to its
 * declared type, wherever the reference comes from: a variable, a member, an
 * array element, a function result or a call argument.
 *
 * POINTER TO keeps its CODESYS cross-type assignment, which is how a WORD pair
 * is reinterpreted as a REAL, and anything that cannot be resolved exactly
 * (an alias, an unknown type) is left alone rather than risk a false error.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

const HEADER = `
TYPE St : STRUCT a : INT; END_STRUCT; END_TYPE
TYPE St2 : STRUCT a : INT; END_STRUCT; END_TYPE
TYPE MyInt : INT; END_TYPE
PROGRAM main
VAR
  xr : REAL; xd : DWORD; xi : INT; s : St; s2 : St2;
  r_real : REF_TO REAL; r_dword : REF_TO DWORD;
  r_int : REF_TO INT; r_int2 : REF_TO INT;
  rr : REF_TO REF_TO INT; rs : REF_TO St; rmi : REF_TO MyInt;
  p_real : POINTER TO REAL; p_dword : POINTER TO DWORD;
END_VAR
`;

function errorsFor(body: string): string[] {
  const result = compile(`${HEADER}${body}\nEND_PROGRAM\n`);
  return result.errors.map((e) => e.message);
}

describe("REF_TO assignment is typed", () => {
  it("rejects REF_TO DWORD into REF_TO REAL with an ST message", () => {
    expect(errorsFor("r_real := r_dword;")).toEqual([
      "Cannot assign REF_TO DWORD to REF_TO REAL: a REF_TO can only hold a reference to its declared type",
    ]);
  });

  it("rejects REF() of a variable of another type", () => {
    expect(errorsFor("r_real := REF(xd);")).toHaveLength(1);
  });

  it("rejects a reference with a different number of levels", () => {
    expect(errorsFor("rr := REF(xi);")).toEqual([
      "Cannot assign REF_TO INT to REF_TO REF_TO INT: a REF_TO can only hold a reference to its declared type",
    ]);
  });

  it("rejects a reference to another struct type", () => {
    expect(errorsFor("rs := REF(s2);")).toHaveLength(1);
  });

  it.each([
    ["REF() of the declared type", "r_real := REF(xr);"],
    ["a REF_TO of the same type", "r_int := r_int2;"],
    ["a reference to a reference", "rr := REF(r_int);"],
    ["a reference to the declared struct", "rs := REF(s);"],
    ["NULL", "r_real := NULL;"],
    ["an alias target, not resolved exactly", "rmi := REF(xi);"],
    ["assignment through a dereference", "rr^ := REF(xi);"],
    ["POINTER TO reinterpretation (CODESYS)", "p_real := p_dword;"],
  ])("accepts %s", (_label, body) => {
    expect(errorsFor(body)).toEqual([]);
  });
});

describe("references in struct fields", () => {
  const source = (body: string): string => `
TYPE S : STRUCT r : REF_TO INT; rs : REF_TO REAL; rt : REFERENCE TO INT; v : INT; END_STRUCT; END_TYPE
PROGRAM main
VAR x : INT; s : S; END_VAR
${body}
END_PROGRAM
`;
  const errors = (body: string): string[] =>
    compile(source(body)).errors.map((e) => e.message);

  it("checks a field's declared target type", () => {
    expect(errors("s.rs := REF(x);")).toEqual([
      "Cannot assign REF_TO INT to REF_TO REAL: a REF_TO can only hold a reference to its declared type",
    ]);
  });

  it("accepts REF= on a REF_TO or REFERENCE TO field", () => {
    expect(errors("s.r REF= x;\ns.rt REF= x;")).toEqual([]);
  });

  it("rejects REF= on a value field, naming the field", () => {
    expect(errors("s.v REF= x;")).toEqual([
      "REF= requires a REF_TO or REFERENCE TO target; 'S.V' is not a reference",
    ]);
  });
});

describe("REF= targets reached through elements and inheritance", () => {
  const source = (body: string): string => `
TYPE RA : ARRAY[0..1] OF REF_TO INT; END_TYPE
TYPE S : STRUCT rs : ARRAY[0..1] OF REF_TO INT; END_STRUCT; END_TYPE
FUNCTION_BLOCK BaseFB
VAR o : REF_TO INT; d : REF_TO DWORD; END_VAR
END_FUNCTION_BLOCK
FUNCTION_BLOCK DerivedFB EXTENDS BaseFB
END_FUNCTION_BLOCK
PROGRAM main
VAR
  vals : ARRAY[0..1] OF INT; refs : ARRAY[0..1] OF REF_TO INT; ta : RA; s : S;
  dw_refs : ARRAY[0..1] OF REF_TO DWORD; dd : DerivedFB; x : INT; r : REF_TO INT;
END_VAR
${body}
END_PROGRAM
`;
  const errors = (body: string): string[] =>
    compile(source(body)).errors.map((e) => e.message);

  it("rejects REF= on an element of a value array", () => {
    expect(errors("vals[1] REF= x;")).toEqual([
      "REF= requires a REF_TO or REFERENCE TO target; 'VALS' is not a reference",
    ]);
  });

  it.each([
    ["an inline array of references", "refs[1] REF= x;"],
    ["a TYPE array of references", "ta[0] REF= x;"],
    ["an array of references in a struct", "s.rs[1] REF= x;"],
    ["an inherited member", "dd.o REF= x;"],
  ])("accepts REF= on an element or member of %s", (_label, body) => {
    expect(errors(body)).toEqual([]);
  });

  it.each([
    ["an inherited member", "r := dd.d;"],
    ["an array element", "r := dw_refs[0];"],
  ])("checks the target type of %s", (_label, body) => {
    expect(errors(body)).toEqual([
      "Cannot assign REF_TO DWORD to REF_TO INT: a REF_TO can only hold a reference to its declared type",
    ]);
  });
});

describe("REF_TO through calls", () => {
  const source = (body: string): string => `
FUNCTION GetD : REF_TO DWORD
VAR_INPUT rd : REF_TO DWORD; END_VAR
GetD := rd;
END_FUNCTION
FUNCTION TakeI : INT
VAR_INPUT ri : REF_TO INT; END_VAR
TakeI := 0;
END_FUNCTION
FUNCTION_BLOCK FBI
VAR_INPUT i : REF_TO INT; END_VAR
END_FUNCTION_BLOCK
PROGRAM main
VAR dw : DWORD; x : INT; rd : REF_TO DWORD; ri : REF_TO INT; r : REF_TO INT; fb : FBI; n : INT; END_VAR
${body}
END_PROGRAM
`;
  const errors = (body: string): string[] =>
    compile(source(body)).errors.map((e) => e.message);
  const mismatch =
    "Cannot assign REF_TO DWORD to REF_TO INT: a REF_TO can only hold a reference to its declared type";

  it.each([
    ["a function result", "r := GetD(rd);"],
    ["a named FB input", "fb(i := rd);"],
    ["a positional function input", "n := TakeI(rd);"],
    ["a named function input", "n := TakeI(ri := REF(dw));"],
  ])("checks %s", (_label, body) => {
    expect(errors(body)).toEqual([mismatch]);
  });

  it("accepts arguments of the declared type", () => {
    expect(
      errors("fb(i := ri);\nfb(i := REF(x));\nn := TakeI(REF(x));"),
    ).toEqual([]);
  });
});

describe("pointer and reference initializers", () => {
  const errors = (decl: string): string[] =>
    compile(
      `PROGRAM main\nVAR x : INT; dw : DWORD; ${decl} END_VAR\nEND_PROGRAM\n`,
    ).errors.map((e) => e.message);

  it.each([
    [
      "r : REF_TO REAL := REF(dw);",
      "REF_TO initializers are not supported; assign 'R' in the body instead",
    ],
    [
      "p : POINTER TO INT := ADR(x);",
      "POINTER TO initializers are not supported; assign 'P' in the body instead",
    ],
  ])("rejects %s", (decl, message) => {
    expect(errors(decl)).toEqual([message]);
  });

  it.each(["r : REF_TO INT := NULL;", "p : POINTER TO INT := 0;"])(
    "accepts %s",
    (decl) => {
      expect(errors(decl)).toEqual([]);
    },
  );
});

describe("REFERENCE TO is not combined with other levels", () => {
  const message = (where: string): string =>
    `REFERENCE TO cannot be combined with other reference levels in ${where}`;

  it.each([
    ["rr : REFERENCE TO REF_TO INT;"],
    ["rp : REFERENCE TO POINTER TO INT;"],
    ["rrf : REF_TO REFERENCE TO INT;"],
    ["arr : ARRAY[0..1] OF REF_TO REFERENCE TO INT;"],
  ])("rejects %s", (decl) => {
    const result = compile(`PROGRAM main\nVAR ${decl} END_VAR\nEND_PROGRAM\n`);
    expect(result.errors.map((e) => e.message)).toEqual([
      message("PROGRAM 'MAIN'"),
    ]);
  });

  it("rejects it in a struct field, an array TYPE and an alias", () => {
    const result = compile(`
TYPE S : STRUCT f : REFERENCE TO REF_TO INT; END_STRUCT; END_TYPE
TYPE A : ARRAY[0..1] OF REFERENCE TO POINTER TO INT; END_TYPE
TYPE RRA : REF_TO REFERENCE TO INT; END_TYPE
PROGRAM main
VAR x : INT; END_VAR
END_PROGRAM
`);
    expect(result.errors.map((e) => e.message)).toEqual([
      message("STRUCT 'S'"),
      message("ARRAY type 'A'"),
      message("type alias 'RRA'"),
    ]);
  });

  it("still accepts a single REFERENCE TO", () => {
    const result = compile(
      "PROGRAM main\nVAR x : INT; rf : REFERENCE TO INT; END_VAR\nrf REF= x;\nEND_PROGRAM\n",
    );
    expect(result.errors).toEqual([]);
  });
});

describe("one diagnostic per mistake", () => {
  it("reports a derived-to-base REF_TO assignment once", () => {
    const result = compile(`
FUNCTION_BLOCK BaseFB
END_FUNCTION_BLOCK
FUNCTION_BLOCK DerivedFB EXTENDS BaseFB
END_FUNCTION_BLOCK
PROGRAM main
VAR rb : REF_TO BaseFB; rd : REF_TO DerivedFB; END_VAR
rb := rd;
END_PROGRAM
`);
    expect(result.errors.map((e) => e.message)).toEqual([
      "Cannot assign DERIVEDFB to BASEFB",
    ]);
  });
});

describe("typed literals on a type that is not an enumeration", () => {
  const errors = (expr: string): string[] =>
    compile(
      `PROGRAM main\nVAR b : BYTE; END_VAR\nb := ${expr};\nEND_PROGRAM\n`,
    ).errors.map((e) => e.message);

  it("suggests the radix form for a hex-looking value", () => {
    expect(errors("BYTE#FF")).toEqual([
      "'BYTE#FF' is not a valid literal: 'BYTE' is not an enumeration; did you mean '16#FF' or 'BYTE#16#FF'?",
    ]);
  });

  it("names the type for any other value", () => {
    expect(errors("BYTE#Foo")).toEqual([
      "'BYTE#FOO' is not a valid literal: 'BYTE' is not an enumeration.",
    ]);
  });

  it("still accepts BYTE#16#FF", () => {
    expect(errors("BYTE#16#FF")).toEqual([]);
  });
});
