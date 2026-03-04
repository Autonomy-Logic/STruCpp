// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import {
  DATA_TYPE_HOVER,
  getHoverForWord,
  getWordAtOffset,
} from "../server/src/hover-provider.js";

describe("DATA_TYPE_HOVER", () => {
  it("covers all 27 IEC built-in types", () => {
    const expected = [
      "BOOL",
      "BYTE",
      "WORD",
      "DWORD",
      "LWORD",
      "SINT",
      "INT",
      "DINT",
      "LINT",
      "USINT",
      "UINT",
      "UDINT",
      "ULINT",
      "REAL",
      "LREAL",
      "TIME",
      "LTIME",
      "DATE",
      "TIME_OF_DAY",
      "TOD",
      "DATE_AND_TIME",
      "DT",
      "STRING",
      "WSTRING",
      "CHAR",
      "WCHAR",
    ];
    for (const t of expected) {
      expect(DATA_TYPE_HOVER).toHaveProperty(t);
    }
    expect(Object.keys(DATA_TYPE_HOVER)).toHaveLength(expected.length);
  });

  it("each entry is non-empty markdown", () => {
    for (const [key, value] of Object.entries(DATA_TYPE_HOVER)) {
      expect(value.length, `${key} hover text is empty`).toBeGreaterThan(0);
      expect(value, `${key} missing bold name`).toContain("**");
    }
  });
});

describe("getHoverForWord", () => {
  it("returns hover text for exact uppercase type names", () => {
    expect(getHoverForWord("INT")).toContain("**INT**");
    expect(getHoverForWord("BOOL")).toContain("**BOOL**");
    expect(getHoverForWord("TIME")).toContain("**TIME**");
    expect(getHoverForWord("LREAL")).toContain("**LREAL**");
    expect(getHoverForWord("DATE_AND_TIME")).toContain("**DATE_AND_TIME**");
  });

  it("is case-insensitive", () => {
    expect(getHoverForWord("int")).toContain("**INT**");
    expect(getHoverForWord("Bool")).toContain("**BOOL**");
    expect(getHoverForWord("lReal")).toContain("**LREAL**");
  });

  it("returns null for non-type words", () => {
    expect(getHoverForWord("myVar")).toBeNull();
    expect(getHoverForWord("IF")).toBeNull();
    expect(getHoverForWord("END_PROGRAM")).toBeNull();
    expect(getHoverForWord("")).toBeNull();
    expect(getHoverForWord("TON")).toBeNull();
  });
});

describe("getWordAtOffset", () => {
  it("extracts word when cursor is inside it", () => {
    expect(getWordAtOffset("myVar : INT;", 0)).toBe("myVar"); // start
    expect(getWordAtOffset("myVar : INT;", 2)).toBe("myVar"); // middle
    expect(getWordAtOffset("myVar : INT;", 4)).toBe("myVar"); // end
    expect(getWordAtOffset("myVar : INT;", 8)).toBe("INT"); // other word
  });

  it("returns null when cursor is on non-identifier character", () => {
    expect(getWordAtOffset("myVar : INT;", 5)).toBeNull(); // space
    expect(getWordAtOffset("myVar : INT;", 6)).toBeNull(); // space
    expect(getWordAtOffset("myVar : INT;", 11)).toBeNull(); // semicolon
  });

  it("handles multi-word lines", () => {
    const line = "counter : DINT := 0;";
    expect(getWordAtOffset(line, 0)).toBe("counter");
    expect(getWordAtOffset(line, 10)).toBe("DINT");
    expect(getWordAtOffset(line, 17)).toBeNull(); // space before 0
  });

  it("handles empty line", () => {
    expect(getWordAtOffset("", 0)).toBeNull();
  });

  it("handles underscores in identifiers", () => {
    expect(getWordAtOffset("TIME_OF_DAY", 5)).toBe("TIME_OF_DAY");
  });
});
