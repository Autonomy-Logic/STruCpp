// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * `POINTER TO` lowers to `IEC_Ptr<T>` wherever it is written.
 *
 * `ADR` yields an address assignable to
 * `DWORD | LWORD | POINTER TO <basis data type> | __XWORD` — the address is
 * untyped, which is what lets its own `AnyType.pvalue : POINTER TO BYTE`
 * address a variable of any type. `IEC_Ptr<T>` carries those semantics; a raw
 * `T*` does not.
 *
 * Struct elements and type aliases used to append a `*` to the wrapped type
 * instead, giving `IEC_BYTE*`. That type-checked here and then failed in C++
 * on the assignment, which is the silent-until-g++ shape these tests exist to
 * close.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const build = (source: string) => compile(source, { programName: "main" });

/** Header plus implementation, which is where declarations and uses live. */
const emitted = (source: string) => {
  const result = build(source);
  return `${result.headerCode ?? ""}\n${result.cppCode ?? ""}`;
};

describe("every position a POINTER TO can be written", () => {
  it("lowers a local variable to IEC_Ptr", () => {
    const out = emitted(
      "PROGRAM main VAR p : POINTER TO BYTE; i : INT; END_VAR p := ADR(i); END_PROGRAM",
    );
    expect(out).toContain("IEC_Ptr<BYTE_t>");
  });

  it("lowers a structure element to IEC_Ptr, not a raw pointer", () => {
    const out = emitted(
      "TYPE S : STRUCT p : POINTER TO BYTE; END_STRUCT END_TYPE " +
        "PROGRAM main VAR s : S; i : INT; END_VAR s.p := ADR(i); END_PROGRAM",
    );
    expect(out).toContain("IEC_Ptr<BYTE_t>");
    expect(out).not.toMatch(/IEC_BYTE\*/);
  });

  it("lowers a type alias to IEC_Ptr", () => {
    const out = emitted(
      "TYPE PB : POINTER TO BYTE; END_TYPE " +
        "PROGRAM main VAR p : PB; i : INT; END_VAR p := ADR(i); END_PROGRAM",
    );
    expect(out).toContain("IEC_Ptr<BYTE_t>");
  });

  it("keeps the array type as the element of a pointer to array", () => {
    const out = emitted(
      "TYPE S : STRUCT p : POINTER TO ARRAY[0..3] OF INT; END_STRUCT END_TYPE " +
        "PROGRAM main VAR s : S; END_VAR ; END_PROGRAM",
    );
    expect(out).toMatch(/IEC_Ptr<Array1D<[^>]*>>/);
  });
});

describe("the types an address may be assigned to", () => {
  // "<address name> : DWORD | LWORD | POINTER TO <basis data type> | __XWORD"
  it.each([
    ["POINTER TO BYTE", "p : POINTER TO BYTE;", "p"],
    ["POINTER TO INT", "p : POINTER TO INT;", "p"],
    ["DWORD", "p : DWORD;", "p"],
    ["LWORD", "p : LWORD;", "p"],
    ["__XWORD", "p : __XWORD;", "p"],
  ])("accepts an address in a %s", (_label, decl, name) => {
    const result = build(
      `PROGRAM main VAR ${decl} i : INT; END_VAR ${name} := ADR(i); END_PROGRAM`,
    );
    expect(result.errors).toEqual([]);
  });

  // The address is untyped, so a POINTER TO BYTE takes the address of any
  // type — the shape the generic descriptor relies on.
  it.each(["INT", "REAL", "LWORD", "BOOL"])(
    "assigns the address of a %s to a POINTER TO BYTE",
    (type) => {
      const result = build(
        `PROGRAM main VAR p : POINTER TO BYTE; v : ${type}; END_VAR p := ADR(v); END_PROGRAM`,
      );
      expect(result.errors).toEqual([]);
    },
  );

  it("does the same through a structure element", () => {
    const result = build(
      "TYPE S : STRUCT p : POINTER TO BYTE; END_STRUCT END_TYPE " +
        "PROGRAM main VAR s : S; r : REAL; END_VAR s.p := ADR(r); END_PROGRAM",
    );
    expect(result.errors).toEqual([]);
  });
});

describe("SIZEOF on a variable-length array parameter", () => {
  // A view is a descriptor whose own size says nothing about what it
  // addresses, so `SIZEOF` has to report the data. That is what makes
  // `SIZEOF(a) / count` the element stride on any target, with no table of
  // types and sizes to keep in sync.
  const STRIDE_FN = `FUNCTION Stride : DINT
VAR_IN_OUT a : ARRAY [*] OF INT; END_VAR
Stride := SIZEOF(a) / (UPPER_BOUND(a,1) - LOWER_BOUND(a,1) + 1);
END_FUNCTION
PROGRAM main VAR ai : ARRAY[0..3] OF INT; n : DINT; END_VAR n := Stride(a := ai); END_PROGRAM`;

  it("compiles the stride idiom", () => {
    expect(build(STRIDE_FN).errors).toEqual([]);
  });

  it("routes SIZEOF through the runtime overload rather than a literal", () => {
    expect(emitted(STRIDE_FN)).toContain("IEC_SIZEOF");
  });
});
