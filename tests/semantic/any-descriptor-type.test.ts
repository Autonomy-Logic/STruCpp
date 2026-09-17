// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * `__SYSTEM.AnyType`, the descriptor behind a generic parameter.
 *
 * `ANY` itself cannot be a variable — the caller fills the descriptor, and a
 * local has no caller — so the structure is offered as an ordinary
 * concrete type. That is what lets a block keep what it was handed, and what
 * makes `ARRAY [*] OF __SYSTEM.AnyType` the way to carry several arguments of
 * mixed type: a variable-length array is VAR_IN_OUT-only and `ANY` is
 * VAR_INPUT-only, so `ARRAY [*] OF ANY` cannot be written.
 *
 * It is the only qualified type name the parser admits, and the qualifier has
 * to survive into the element type of an array: taking the first Identifier
 * alone yields `__SYSTEM`, which fails a fixed-bound declaration outright and,
 * worse, passes a variable-length one and emits an undeclared C++ type.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const build = (source: string) => compile(source, { programName: "main" });

describe("the positions __SYSTEM.AnyType may be declared in", () => {
  it.each([
    [
      "a local variable",
      "PROGRAM main VAR v : __SYSTEM.AnyType; END_VAR v.DISIZE := 0; END_PROGRAM",
    ],
    [
      "a fixed-bound array",
      "PROGRAM main VAR a : ARRAY[0..1] OF __SYSTEM.AnyType; END_VAR a[0].DISIZE := 0; END_PROGRAM",
    ],
    [
      "a variable-length array",
      "FUNCTION_BLOCK F VAR_IN_OUT a : ARRAY [*] OF __SYSTEM.AnyType; END_VAR VAR i : DINT; END_VAR i := a[LOWER_BOUND(a,1)].DISIZE; END_FUNCTION_BLOCK",
    ],
    [
      "a function return type",
      "FUNCTION F : __SYSTEM.AnyType VAR_INPUT v : ANY; END_VAR F.DISIZE := v.DISIZE; END_FUNCTION",
    ],
    [
      "a structure element",
      "TYPE S : STRUCT d : __SYSTEM.AnyType; END_STRUCT END_TYPE PROGRAM main VAR s : S; END_VAR s.d.DISIZE := 0; END_PROGRAM",
    ],
    [
      "a concrete input pin",
      "FUNCTION_BLOCK F VAR_INPUT d : __SYSTEM.AnyType; END_VAR VAR i : DINT; END_VAR i := d.DISIZE; END_FUNCTION_BLOCK",
    ],
    [
      "a 2D array",
      "PROGRAM main VAR a : ARRAY[0..1, 0..1] OF __SYSTEM.AnyType; END_VAR a[0,0].DISIZE := 0; END_PROGRAM",
    ],
  ])("accepts it as %s", (_label, source) => {
    expect(build(source).errors).toEqual([]);
  });
});

describe("the element type the array lowers to", () => {
  // The qualifier is what selects the runtime type. Dropping it produced
  // `IEC___SYSTEM`, which no header declares, so the failure landed in g++
  // rather than here.
  const emitted = (source: string) =>
    `${build(source).headerCode ?? ""}\n${build(source).cppCode ?? ""}`;

  it("lowers a fixed-bound array to IEC_ANY", () => {
    const out = emitted(
      "PROGRAM main VAR a : ARRAY[0..1] OF __SYSTEM.AnyType; END_VAR a[0].DISIZE := 4; END_PROGRAM",
    );
    expect(out).toContain("Array1D<IEC_ANY, 0, 1>");
    expect(out).not.toContain("IEC___SYSTEM");
  });

  it("lowers a variable-length array to IEC_ANY", () => {
    const out = emitted(
      "FUNCTION_BLOCK F VAR_IN_OUT a : ARRAY [*] OF __SYSTEM.AnyType; END_VAR VAR i : DINT; END_VAR i := a[LOWER_BOUND(a,1)].DISIZE; END_FUNCTION_BLOCK",
    );
    expect(out).toContain("ArrayView1D<IEC_ANY>");
    expect(out).not.toContain("IEC___SYSTEM");
  });
});

describe("the qualifier gate", () => {
  // The parser consumes a Dot only after `__SYSTEM`, so a second Identifier
  // from anywhere else must be left where it is.
  it.each([
    [
      "a parameterized string length",
      "PROGRAM main VAR a : ARRAY[0..1] OF STRING(23); END_VAR a[0] := 'hi'; END_PROGRAM",
    ],
    [
      "a named string length",
      "PROGRAM main VAR CONSTANT L : INT := 8; END_VAR VAR a : ARRAY[0..1] OF STRING(L); END_VAR a[0] := 'hi'; END_PROGRAM",
    ],
    [
      "a user structure",
      "TYPE S : STRUCT x : INT; END_STRUCT END_TYPE PROGRAM main VAR a : ARRAY[0..1] OF S; END_VAR a[0].x := 0; END_PROGRAM",
    ],
    [
      "an elementary element",
      "PROGRAM main VAR a : ARRAY[0..3] OF INT; END_VAR a[0] := 1; END_PROGRAM",
    ],
  ])("leaves %s alone", (_label, source) => {
    expect(build(source).errors).toEqual([]);
  });

  it("still refuses an unknown qualified name", () => {
    const result = build(
      "PROGRAM main VAR a : ARRAY[0..1] OF __SYSTEM.NoSuchType; END_VAR a[0].X := 0; END_PROGRAM",
    );
    expect(result.success).toBe(false);
  });
});

describe("carrying mixed-type arguments, the way ARRAY [*] OF ANY cannot", () => {
  // `ANY` is VAR_INPUT-only and a variable-length array is VAR_IN_OUT-only, so
  // the descriptor is what bridges them: a function takes the generic and
  // returns the structure, and the array is built from the results.
  const SOURCE = `FUNCTION F_Arg : __SYSTEM.AnyType
VAR_INPUT val : ANY; END_VAR
F_Arg.TYPECLASS := val.TYPECLASS;
F_Arg.PVALUE    := val.PVALUE;
F_Arg.DISIZE    := val.DISIZE;
END_FUNCTION

FUNCTION_BLOCK FB_Process
VAR_IN_OUT aArgs : ARRAY [*] OF __SYSTEM.AnyType; END_VAR
VAR i : DINT; total : DINT; END_VAR
total := 0;
FOR i := LOWER_BOUND(aArgs, 1) TO UPPER_BOUND(aArgs, 1) DO
    total := total + aArgs[i].DISIZE;
END_FOR
END_FUNCTION_BLOCK

PROGRAM main
VAR
    r : REAL := 1.5;
    n : INT  := 7;
    args : ARRAY[0..1] OF __SYSTEM.AnyType;
    fb : FB_Process;
END_VAR
args[0] := F_Arg(r);
args[1] := F_Arg(n);
fb(aArgs := args);
END_PROGRAM`;

  it("compiles the whole pattern", () => {
    expect(build(SOURCE).errors).toEqual([]);
  });

  it("passes the fixed-bound array to the variable-length pin", () => {
    expect(build(SOURCE).headerCode ?? "").toContain("ArrayView1D<IEC_ANY>");
  });
});

describe("ANY takes composites, and the class names the composite", () => {
  // Every array is TYPE_ARRAY whatever its elements, a
  // structure is TYPE_USERDEF. The class carries no element type, so a block
  // cannot tell an array of bits from an array of words through a generic pin
  // — which is why a descriptor of one's own still has a use.
  const withPin = (vars: string, arg: string) =>
    `FUNCTION_BLOCK F VAR_INPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main VAR a : F; ${vars} END_VAR a(P := ${arg}); END_PROGRAM`;

  it.each([
    ["an array", "arr : ARRAY[0..3] OF INT;", "arr", "TYPE_ARRAY"],
    ["an elementary type", "v : INT;", "v", "TYPE_INT"],
  ])("stamps %s as %s", (_label, vars, arg, cls) => {
    const result = compile(withPin(vars, arg), { programName: "main" });
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain(`TYPE_CLASS::${cls}`);
  });

  it("gives an array of BOOL the same class as an array of INT", () => {
    const of = (t: string) =>
      compile(withPin(`arr : ARRAY[0..3] OF ${t};`, "arr"), {
        programName: "main",
      }).cppCode ?? "";
    expect(of("BOOL")).toContain("TYPE_ARRAY");
    expect(of("INT")).toContain("TYPE_ARRAY");
  });

  it("still refuses a literal, which has no variable to reference", () => {
    expect(
      compile(withPin("v : INT;", "42"), { programName: "main" }).success,
    ).toBe(false);
  });
});
