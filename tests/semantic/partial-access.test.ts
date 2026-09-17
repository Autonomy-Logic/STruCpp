// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Partial access: one part of a bit-field variable.
 *
 * `X`/`B`/`W`/`D` is the part's width and the index counts from the least
 * significant end, so `Do.%B3` is a DWORD's most significant byte. `%X` is
 * optional for bits, which is why `Wo.3` and `Wo.%X3` are the same access.
 *
 * A part exists only where it is strictly narrower than the variable: bits of
 * BYTE/WORD/DWORD/LWORD, bytes of WORD/DWORD/LWORD, words of DWORD/LWORD, and
 * a dword of LWORD. There is no `WORD.%W0`, because a WORD has no word inside
 * it.
 *
 * The integer types are accepted too, and warn — see BIT_ACCESSIBLE_TYPES.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const VARS = "bo : BOOL; b8 : BYTE; wo : WORD; dwo : DWORD; lo : LWORD;";

const build = (body: string, vars = VARS) =>
  compile(`PROGRAM main VAR ${vars} END_VAR ${body} END_PROGRAM`, {
    programName: "main",
  });

const errorText = (body: string, vars = VARS) =>
  build(body, vars)
    .errors.map((e) => e.message)
    .join("\n");

/** The first assignment the program body emits. */
const emitted = (body: string, vars = VARS): string => {
  const result = build(body, vars);
  const runBody = (result.cppCode ?? "").split("::run()")[1] ?? "";
  return (
    runBody
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /=/.test(line)) ?? ""
  );
};

describe("the parts each type has", () => {
  it.each([
    ["1a", "bo := b8.%X7;"],
    ["1b", "bo := wo.%X15;"],
    ["1c", "bo := dwo.%X31;"],
    ["1d", "bo := lo.%X63;"],
    ["2a", "b8 := wo.%B1;"],
    ["2b", "b8 := dwo.%B3;"],
    ["2c", "b8 := lo.%B7;"],
    ["3a", "wo := dwo.%W1;"],
    ["3b", "wo := lo.%W3;"],
    ["4", "dwo := lo.%D1;"],
  ])("accepts feature %s: %s", (_feature, body) => {
    expect(build(body).errors).toEqual([]);
  });

  // A part must be strictly narrower than the variable it comes from.
  it.each([
    ["a WORD has no word", "wo := wo.%W0;", "Word access is not valid"],
    ["a BYTE has no byte", "b8 := b8.%B0;", "Byte access is not valid"],
    ["a DWORD has no dword", "dwo := dwo.%D0;", "Dword access is not valid"],
    ["a WORD has no dword", "dwo := wo.%D0;", "Dword access is not valid"],
  ])("refuses %s", (_label, body, expected) => {
    expect(errorText(body)).toContain(expected);
  });

  it.each([
    ["b8.%X8", "bo := b8.%X8;", "Bit index 8 is out of range"],
    ["wo.%X16", "bo := wo.%X16;", "Bit index 16 is out of range"],
    ["wo.%B2", "b8 := wo.%B2;", "Byte index 2 is out of range"],
    ["lo.%W4", "wo := lo.%W4;", "Word index 4 is out of range"],
    ["lo.%D2", "dwo := lo.%D2;", "Dword index 2 is out of range"],
  ])("refuses %s as out of range", (_label, body, expected) => {
    expect(errorText(body)).toContain(expected);
  });

  it.each([
    ["a bit", "bo := r.%X0;", "Bit access is not valid on type REAL"],
    ["a byte", "b8 := r.%B0;", "Byte access is not valid on type REAL"],
    ["a bare bit", "bo := r.3;", "Bit access is not valid on type REAL"],
  ])("refuses %s on a type that has no parts", (_label, body, expected) => {
    expect(errorText(body, "bo : BOOL; b8 : BYTE; r : REAL;")).toContain(
      expected,
    );
  });
});

describe("%X is optional for bits", () => {
  it("gives Wo.3 and Wo.%X3 the same lowering", () => {
    expect(emitted("bo := wo.3;")).toBe(emitted("bo := wo.%X3;"));
  });
});

describe("the emitted shift and mask", () => {
  // Index 0 is the least significant part, so the shift is index × width.
  it.each([
    ["b8.%X7", "bo := b8.%X7;", ">> 7", "& 1"],
    ["wo.%B1", "b8 := wo.%B1;", ">> 8", "0xFFULL"],
    ["dwo.%B3", "b8 := dwo.%B3;", ">> 24", "0xFFULL"],
    ["lo.%W3", "wo := lo.%W3;", ">> 48", "0xFFFFULL"],
    ["lo.%D1", "dwo := lo.%D1;", ">> 32", "0xFFFFFFFFULL"],
  ])("reads %s with the right shift and mask", (_l, body, shift, mask) => {
    const line = emitted(body);
    expect(line).toContain(shift);
    expect(line).toContain(mask);
  });

  // Everything is done in 64 bits, so a shift of 32 or more is well defined
  // rather than undefined behaviour.
  it("reads and writes in 64-bit arithmetic", () => {
    expect(emitted("bo := lo.%X63;")).toContain("uint64_t");
    expect(emitted("lo.%D1 := dwo;")).toContain("ULL");
  });
});

describe("writing a part", () => {
  it("writes a bit as a read-modify-write", () => {
    const line = emitted("wo.%X3 := TRUE;");
    expect(line).toContain("~(1ULL << 3)");
    expect(line).toContain("<< 3");
  });

  it("masks a wider part so it cannot corrupt its neighbours", () => {
    const line = emitted("wo.%B1 := b8;");
    expect(line).toContain("~(0xFFULL << 8)");
    expect(line).toContain("& 0xFFULL) << 8");
  });

  it("writes a dword of an LWORD", () => {
    expect(emitted("lo.%D1 := dwo;")).toContain("~(0xFFFFFFFFULL << 32)");
  });
});

describe("the part's type", () => {
  // Each part has a type: a bit is BOOL, a byte BYTE, a word WORD, a dword
  // DWORD. Assigning one to a narrower target warns, and the warning names the
  // part's type — which is what pins the resolution.
  const warningText = (body: string) =>
    build(body)
      .warnings.map((w) => w.message)
      .join("\n");

  it.each([
    ["a byte is BYTE", "bo := wo.%B1;", "narrowing conversion from BYTE"],
    ["a word is WORD", "b8 := dwo.%W1;", "narrowing conversion from WORD"],
    ["a dword is DWORD", "wo := lo.%D1;", "narrowing conversion from DWORD"],
  ])("%s", (_label, body, expected) => {
    expect(warningText(body)).toContain(expected);
  });

  // A bit is BOOL, and BOOL widens to BYTE, so this is clean.
  it("a bit is BOOL, which widens without complaint", () => {
    const result = build("b8 := wo.%X3;");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // A part assigned to its own type is exact, so nothing is reported.
  it.each([
    ["b8 := wo.%B1;"],
    ["wo := dwo.%W1;"],
    ["dwo := lo.%D1;"],
  ])("reports nothing for an exact match: %s", (body) => {
    const result = build(body);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("the integer extension, accepted and reported", () => {
  // A part of an integer compiles and warns, so an existing program keeps
  // working and a new one is told it is outside the bit-field set.
  it.each(["SINT", "INT", "DINT", "LINT", "USINT", "UINT", "UDINT", "ULINT"])(
    "accepts a bit of %s but warns",
    (type) => {
      const result = build("bo := v.3;", `bo : BOOL; v : ${type};`);
      expect(result.errors).toEqual([]);
      expect(result.warnings.map((w) => w.message).join("\n")).toContain(
        `Partial access on type ${type} is an extension`,
      );
    },
  );

  it.each(["BYTE", "WORD", "DWORD", "LWORD"])(
    "says nothing about %s, which the standard allows",
    (type) => {
      const result = build("bo := v.3;", `bo : BOOL; v : ${type};`);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    },
  );

  // Five flagged accesses in one program, and the BYTE one clean.
  it("flags every integer access and leaves the bit-field one alone", () => {
    const result = compile(
      `PROGRAM main
VAR iTemp1 : INT; diTemp3 : DINT; uliTemp4 : ULINT; siTemp5 : SINT; usiTemp6 : USINT; byTemp2 : BYTE; END_VAR
iTemp1.3 := TRUE;
diTemp3.4 := TRUE;
uliTemp4.18 := FALSE;
siTemp5.2 := FALSE;
usiTemp6.3 := TRUE;
byTemp2.5 := FALSE;
END_PROGRAM`,
      { programName: "main" },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(5);
  });

  // A malformed access gets one clear error, not an error plus an aside.
  it("does not add the extension warning to an out-of-range access", () => {
    const result = build("bo := v.9;", "bo : BOOL; v : SINT;");
    expect(result.success).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("still refuses REAL, as the standard does", () => {
    expect(build("bo := v.3;", "bo : BOOL; v : REAL;").success).toBe(false);
  });
});

describe("direct variables", () => {
  // A direct variable cannot take a part, and needs no check to refuse one:
  // it is not an expression operand
  // here, so the form cannot be written at all.
  it("cannot use a direct variable in an expression", () => {
    expect(
      compile(`PROGRAM main VAR f : BOOL; END_VAR f := %IB10.%X0; END_PROGRAM`, {
        programName: "main",
      }).success,
    ).toBe(false);
  });

  // A symbolic variable declared AT an address is a located variable, not a
  // direct one, so partial access on it is permitted.
  it("allows partial access on a symbolic located variable", () => {
    expect(
      compile(
        `PROGRAM main VAR b AT %IB10 : BYTE; f : BOOL; END_VAR f := b.%X0; END_PROGRAM`,
        { programName: "main" },
      ).errors,
    ).toEqual([]);
  });
});
