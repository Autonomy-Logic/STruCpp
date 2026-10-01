/**
 * A REF_TO is typed (IEC 61131-3): it can only hold a reference to its
 * declared type. Assigning a REF_TO DWORD to a REF_TO REAL used to pass
 * semantic analysis (the target types were compared with the ordinary
 * conversion rules, and DWORD converts to REAL implicitly) and then fail in
 * the C++ compiler with an error about IEC_REF_TO templates (DOPE-687).
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
