// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Calls to names that do not resolve.
 *
 * A compiler has to report the
 * errors it can detect. A call to a function nothing declares is detectable
 * while checking, and used not to be reported: it was emitted verbatim and
 * failed in the C++ compiler, against generated code the user never wrote —
 * or worse, was rescued by C++ name lookup and never failed at all.
 *
 * The contract under test is that a name is reported only when every route has
 * been tried: user and library functions, the standard registry (including a
 * descriptor whose result type cannot be narrowed here), the legacy
 * `<TYPE>_TO_<TYPE>` conversions, function block instances, and the methods of
 * the enclosing type and anything it extends.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const compileSource = (source: string) => compile(source, {});
const errorText = (source: string) =>
  compileSource(source)
    .errors.map((e) => e.message)
    .join("\n");

const PROG = (body: string, vars = "i : INT;") =>
  `PROGRAM main VAR ${vars} END_VAR ${body} END_PROGRAM`;

describe("a call that resolves to nothing", () => {
  it("is reported, naming the function", () => {
    expect(errorText(PROG("i := ZZQQ(1);"))).toContain(
      "Unknown function 'ZZQQ'",
    );
  });

  it("is reported when nested inside another call", () => {
    expect(errorText(PROG("i := ABS(NOPE(1));"))).toContain(
      "Unknown function 'NOPE'",
    );
  });

  it("does not report a name the standard registry knows", () => {
    expect(compileSource(PROG("i := ABS(-1);")).errors).toEqual([]);
  });

  it.each(["SEL", "LIMIT", "MUX"])(
    "does not report %s, whose result comes from a later parameter",
    (fn) => {
      // These reach the end of the resolver with no return type narrowed, so a
      // check that keyed on "did we work out a type" would call them unknown.
      const source = PROG(
        fn === "SEL"
          ? "i := SEL(TRUE, 1, 2);"
          : fn === "LIMIT"
            ? "i := LIMIT(0, 5, 10);"
            : "i := MUX(1, 10, 20);",
      );
      expect(errorText(source)).not.toContain("Unknown function");
    },
  );

  it("does not report a legacy TYPE_TO_TYPE conversion", () => {
    expect(errorText(PROG("r := INT_TO_REAL(1);", "r : REAL;"))).not.toContain(
      "Unknown function",
    );
  });

  it("does not report a user FUNCTION declared after its call", () => {
    const source = `${PROG("i := MYF(1);")}
FUNCTION MYF : INT VAR_INPUT a : INT; END_VAR MYF := a; END_FUNCTION`;
    expect(errorText(source)).not.toContain("Unknown function");
  });

  it("does not report a function block instance invocation", () => {
    const source = `FUNCTION_BLOCK FB VAR_INPUT a : INT; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main VAR f : FB; END_VAR f(a := 1); END_PROGRAM`;
    expect(errorText(source)).not.toContain("Unknown function");
  });
});

describe("methods of the enclosing type", () => {
  const FB = (call: string, extra = "") =>
    `${extra}FUNCTION_BLOCK FB${extra ? " EXTENDS BASE" : ""}
  METHOD Helper : INT VAR_INPUT a : INT; END_VAR Helper := a; END_METHOD
  METHOD Run : INT VAR i : INT; END_VAR i := ${call}; Run := i; END_METHOD
END_FUNCTION_BLOCK
PROGRAM main VAR f : FB; i : INT; END_VAR i := f.Run(); END_PROGRAM`;

  it("accepts a sibling method called by bare name", () => {
    expect(errorText(FB("Helper(1)"))).not.toContain("Unknown function");
  });

  it("accepts a sibling method called through THIS", () => {
    expect(errorText(FB("THIS.Helper(1)"))).not.toContain("Unknown function");
  });

  it("reports a misspelled sibling method", () => {
    // Without this the emitted `HELPERR(1)` is offered to C++ member lookup
    // against a name that does not exist, and the diagnostic lands on
    // generated code instead of on the ST line that is wrong.
    //
    // The name is reported as the AST normalised it. ST identifiers are
    // case-insensitive and every other diagnostic here does the same.
    expect(errorText(FB("Helperr(1)"))).toContain("Unknown function 'HELPERR'");
  });

  it("accepts a method inherited from a base type", () => {
    const source = `FUNCTION_BLOCK BASE
  METHOD Inherited : INT Inherited := 7; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK FB EXTENDS BASE
  METHOD Run : INT VAR i : INT; END_VAR i := Inherited(); Run := i; END_METHOD
END_FUNCTION_BLOCK
PROGRAM main VAR f : FB; i : INT; END_VAR i := f.Run(); END_PROGRAM`;
    expect(errorText(source)).not.toContain("Unknown function");
  });
});

describe("SUPER", () => {
  const WITH_SUPER = (call: string) => `FUNCTION_BLOCK BASE
  METHOD Describe : INT Describe := 1; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK FB EXTENDS BASE
  METHOD Run : INT VAR i : INT; END_VAR ${call} Run := i; END_METHOD
END_FUNCTION_BLOCK
PROGRAM main VAR f : FB; i : INT; END_VAR i := f.Run(); END_PROGRAM`;

  it("accepts the parent body call SUPER^()", () => {
    // The ast-builder spells this as a bare call named "SUPER", with no method
    // to qualify it, so it has to be recognised on the name alone.
    expect(errorText(WITH_SUPER("SUPER^(); i := 1;"))).not.toContain(
      "Unknown function",
    );
  });

  it("accepts a parent method call SUPER^.M()", () => {
    expect(errorText(WITH_SUPER("i := SUPER^.Describe();"))).not.toContain(
      "Unknown function",
    );
  });
});

describe("the TIME family the runtime implements", () => {
  // Each of these is defined in iec_time.hpp, iec_date.hpp, iec_dt.hpp or
  // iec_tod.hpp and was missing from the registry, so a call to one checked
  // clean here and was resolved only by the C++ compiler.
  it.each([
    ["TIME_TO_NS", "l := TIME_TO_NS(t);"],
    ["TIME_TO_US", "l := TIME_TO_US(t);"],
    ["TIME_TO_M", "l := TIME_TO_M(t);"],
    ["TIME_TO_H", "l := TIME_TO_H(t);"],
    ["TIME_TO_D", "l := TIME_TO_D(t);"],
    ["ADD_TIME", "t := ADD_TIME(t, t);"],
    ["SUB_TIME", "t := SUB_TIME(t, t);"],
    ["ABS_TIME", "t := ABS_TIME(t);"],
    ["ADD_DATE", "d := ADD_DATE(d, 1);"],
    ["SUB_DATE", "d := SUB_DATE(d, 1);"],
    ["DIFF_DATE", "l := DIFF_DATE(d, d);"],
    ["ADD_DT", "dt := ADD_DT(dt, t);"],
    ["SUB_DT", "dt := SUB_DT(dt, t);"],
    ["DIFF_DT", "l := DIFF_DT(dt, dt);"],
    ["ADD_TOD", "td := ADD_TOD(td, t);"],
    ["SUB_TOD", "td := SUB_TOD(td, t);"],
    ["DIFF_TOD", "l := DIFF_TOD(td, td);"],
    ["CONCAT_DATE_TOD", "dt := CONCAT_DATE_TOD(d, td);"],
    ["DATE_OF_DT", "d := DATE_OF_DT(dt);"],
    ["TOD_OF_DT", "td := TOD_OF_DT(dt);"],
  ])("resolves %s", (_name, body) => {
    const source = PROG(
      body,
      "t : TIME; d : DATE; dt : DT; td : TOD; l : LINT;",
    );
    expect(errorText(source)).not.toContain("Unknown function");
  });
});
