// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import {
  getIecTypeDoc,
  IEC_TYPE_DOCS,
} from "../../server/src/iec-type-docs.js";

const ALL_TYPES = [
  "BOOL", "BYTE", "WORD", "DWORD", "LWORD",
  "SINT", "INT", "DINT", "LINT",
  "USINT", "UINT", "UDINT", "ULINT",
  "REAL", "LREAL",
  "TIME", "LTIME", "DATE", "TIME_OF_DAY", "TOD", "DATE_AND_TIME", "DT",
  "STRING", "WSTRING", "CHAR", "WCHAR",
];

describe("getIecTypeDoc", () => {
  it("returns markdown for every built-in IEC type", () => {
    for (const t of ALL_TYPES) {
      const doc = getIecTypeDoc(t);
      expect(doc, t).not.toBeNull();
      expect(doc, t).toContain(`**${t}**`); // bold type name header
    }
  });

  it("covers exactly the documented type set (no orphans)", () => {
    expect(Object.keys(IEC_TYPE_DOCS).sort()).toEqual([...ALL_TYPES].sort());
  });

  it("is case-insensitive", () => {
    expect(getIecTypeDoc("int")).toBe(getIecTypeDoc("INT"));
    expect(getIecTypeDoc("Lreal")).toBe(getIecTypeDoc("LREAL"));
  });

  it("returns null for non-type words", () => {
    expect(getIecTypeDoc("PROGRAM")).toBeNull();
    expect(getIecTypeDoc("myVar")).toBeNull();
    expect(getIecTypeDoc("INT_TO_REAL")).toBeNull();
    expect(getIecTypeDoc("")).toBeNull();
  });

  it("documents the temporal types as STruC++ implements them (int64)", () => {
    // Regression guard: these are NOT 32-bit ms in STruC++ — all 64-bit.
    for (const t of ["TIME", "LTIME", "TOD", "TIME_OF_DAY", "DATE_AND_TIME", "DT"]) {
      expect(getIecTypeDoc(t), t).toContain("64 bits (nanoseconds)");
    }
    expect(getIecTypeDoc("DATE")).toContain("64 bits (days)");
  });

  it("documents signed/unsigned integer widths correctly", () => {
    expect(getIecTypeDoc("INT")).toContain("16 bits");
    expect(getIecTypeDoc("DINT")).toContain("32 bits");
    expect(getIecTypeDoc("LINT")).toContain("64 bits");
    expect(getIecTypeDoc("USINT")).toContain("8 bits");
  });
});
