// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * The long time types: LTIME, LTOD and LDT.
 *
 * Each is a signed 64-bit integer of nanoseconds — LTOD since midnight, LDT
 * since 1970-01-01-00:00:00 — which is how TIME, TOD and DT are already
 * stored, so each shares its short form's representation.
 *
 * LDATE is deliberately absent: it needs nanoseconds while `DATE_t` holds
 * whole days, so registering it would misreport every value by 86400e9.
 *
 * Literal prefixes: T/LT/TIME/LTIME, TOD/LTIME_OF_DAY, DT/LDATE_AND_TIME.
 *
 * Assignment widens one way only — TIME→LTIME, TOD→LTOD, DT→LDT.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const prog = (vars: string, body = "") =>
  `PROGRAM main VAR ${vars} END_VAR ${body} END_PROGRAM`;

const compileProg = (vars: string, body = "") =>
  compile(prog(vars, body), { programName: "main" });

/** The first `X = <number>;` the program body emits. */
const emittedValue = (vars: string, body: string): string | undefined => {
  const result = compileProg(vars, body);
  const runBody = (result.cppCode ?? "").split("::run()")[1] ?? "";
  return runBody
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /=\s*-?\d/.test(line));
};

describe("declaring the long time types", () => {
  it.each([
    "LTIME",
    "LTOD",
    "LDT",
    "LTIME_OF_DAY",
    "LDATE_AND_TIME",
  ])("accepts %s", (type) => {
    expect(compileProg(`v : ${type};`).errors).toEqual([]);
  });

  it("still refuses LDATE, whose unit does not match DATE_t", () => {
    const result = compileProg("v : LDATE;");
    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.message).join("\n")).toContain(
      "Undefined type 'LDATE'",
    );
  });
});

describe("the literal prefixes", () => {
  it.each([
    ["LT#", "t : LTIME;", "t := LT#14.7s;"],
    ["LTIME#", "t : LTIME;", "t := LTIME#5m_30s_500ms;"],
    ["LTOD#", "d : LTOD;", "d := LTOD#12:30:00;"],
    ["LTIME_OF_DAY#", "d : LTOD;", "d := LTIME_OF_DAY#12:30:00;"],
    ["LDT#", "x : LDT;", "x := LDT#2024-06-15-14:30:45;"],
    ["LDATE_AND_TIME#", "x : LDT;", "x := LDATE_AND_TIME#2024-06-15-14:30:45;"],
  ])("lexes and accepts %s", (_label, vars, body) => {
    expect(compileProg(vars, body).errors).toEqual([]);
  });

  it.each([
    ["T#", "t : TIME;", "t := T#1s;"],
    ["TIME#", "t : TIME;", "t := TIME#1s;"],
    ["TOD#", "d : TOD;", "d := TOD#12:30:00;"],
    ["DT#", "x : DT;", "x := DT#2024-06-15-14:30:45;"],
    ["D#", "y : DATE;", "y := D#2024-06-15;"],
  ])("leaves the short form %s alone", (_label, vars, body) => {
    expect(compileProg(vars, body).errors).toEqual([]);
  });

  // A long prefix must not be consumed as a short one plus leftovers — `LDATE#`
  // as `LD` + `ATE#`, or `LTIME_OF_DAY#` as `LTIME` + `_OF_DAY#`.
  it.each([
    ["LTOD#12:30:00;", "TOD#12:30:00;", "d : LTOD;", "d : TOD;"],
    [
      "LDT#2024-06-15-14:30:45;",
      "DT#2024-06-15-14:30:45;",
      "x : LDT;",
      "x : DT;",
    ],
    ["LT#1s;", "T#1s;", "t : LTIME;", "t : TIME;"],
  ])(
    "gives %s the same value as %s",
    (longLit, shortLit, longVar, shortVar) => {
      const name = longVar.split(" ")[0]!;
      const digits = (line?: string) => line?.match(/-?\d+/)?.[0];
      expect(digits(emittedValue(longVar, `${name} := ${longLit}`))).toBe(
        digits(emittedValue(shortVar, `${name} := ${shortLit}`)),
      );
    },
  );

  it("converts LTOD to nanoseconds since midnight", () => {
    // 12:30:00 = 45000 s
    expect(emittedValue("d : LTOD;", "d := LTOD#12:30:00;")).toContain(
      "45000000000000",
    );
  });

  it("converts LT# to nanoseconds", () => {
    expect(emittedValue("t : LTIME;", "t := LT#1s;")).toContain("1000000000");
  });
});

describe("implicit conversions", () => {
  it.each([
    ["TIME", "LTIME"],
    ["TOD", "LTOD"],
    ["DT", "LDT"],
  ])("allows %s to %s", (short, long) => {
    expect(
      compileProg(`a : ${short}; b : ${long};`, "b := a;").errors,
    ).toEqual([]);
  });

  // The promotion is one way only; the pair is the same width, so a plain
  // widening rule would have admitted both directions.
  it.each([
    ["LTIME", "TIME"],
    ["LTOD", "TOD"],
    ["LDT", "DT"],
  ])("refuses %s to %s", (long, short) => {
    expect(compileProg(`a : ${short}; b : ${long};`, "a := b;").success).toBe(
      false,
    );
  });
});

describe("the long types as generic arguments", () => {
  const withPin = (type: string) =>
    `FUNCTION_BLOCK F VAR_INPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main VAR a : F; v : ${type}; END_VAR a(P := v); END_PROGRAM`;

  it.each(["TIME", "TOD", "DT", "LTIME", "LTOD", "LDT"])(
    "passes %s to an ANY pin",
    (type) => {
      expect(compile(withPin(type), { programName: "main" }).errors).toEqual(
        [],
      );
    },
  );
});
