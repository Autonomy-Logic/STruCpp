// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { isTestFile, getWordAt, extractTestVarDeclarations } from "../../shared/test-utils.js";

describe("isTestFile", () => {
  it("detects file starting with TEST", () => {
    expect(isTestFile("TEST 'my test'\n  ASSERT_TRUE(TRUE);\nEND_TEST")).toBe(true);
  });

  it("detects file starting with SETUP", () => {
    expect(isTestFile("SETUP\n  VAR x : INT; END_VAR\nEND_SETUP\n\nTEST 'a'\nEND_TEST")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isTestFile("test 'lower case'\nend_test")).toBe(true);
    expect(isTestFile("Test 'Mixed'\nEND_TEST")).toBe(true);
  });

  it("returns false for PROGRAM files", () => {
    expect(isTestFile("PROGRAM Main\n  VAR x : INT; END_VAR\nEND_PROGRAM")).toBe(false);
  });

  it("returns false for FUNCTION_BLOCK files", () => {
    expect(isTestFile("FUNCTION_BLOCK Motor\nEND_FUNCTION_BLOCK")).toBe(false);
  });

  it("ignores line comments before TEST", () => {
    expect(isTestFile("// this is a comment\nTEST 'after comment'\nEND_TEST")).toBe(true);
  });

  it("ignores block comments before TEST", () => {
    expect(isTestFile("(* block comment *)\nTEST 'after block'\nEND_TEST")).toBe(true);
  });

  it("handles BOM before TEST", () => {
    expect(isTestFile("\uFEFFTEST 'with bom'\nEND_TEST")).toBe(true);
  });

  it("returns false for empty source", () => {
    expect(isTestFile("")).toBe(false);
  });

  it("returns false for whitespace-only source", () => {
    expect(isTestFile("   \n  \n")).toBe(false);
  });

  it("does not match TEST inside a word", () => {
    expect(isTestFile("TESTING something\nEND_TEST")).toBe(false);
  });
});

describe("getWordAt", () => {
  const source = "  x := PedestrianState.WALK;\n  ASSERT_EQ(x, 1);";

  it("extracts word at start of identifier", () => {
    const result = getWordAt(source, 1, 8); // 'P' of PedestrianState
    expect(result).toEqual({ word: "PedestrianState", startCol: 7 });
  });

  it("extracts word in middle of identifier", () => {
    const result = getWordAt(source, 1, 15); // middle of PedestrianState
    expect(result).toEqual({ word: "PedestrianState", startCol: 7 });
  });

  it("extracts word after dot", () => {
    const result = getWordAt(source, 1, 24); // 'W' of WALK
    expect(result).toEqual({ word: "WALK", startCol: 23 });
  });

  it("extracts ASSERT_EQ on line 2", () => {
    const result = getWordAt(source, 2, 5); // inside ASSERT_EQ
    expect(result).toEqual({ word: "ASSERT_EQ", startCol: 2 });
  });

  it("on dot position expands to adjacent word", () => {
    // Column 23 (1-indexed) is the `.` in `PedestrianState.WALK`
    // getWordAt expands left into PedestrianState since '.' is not a word char
    const result = getWordAt(source, 1, 23);
    expect(result).toEqual({ word: "PedestrianState", startCol: 7 });
  });

  it("returns undefined for empty line", () => {
    const result = getWordAt("  \nfoo", 1, 1);
    expect(result).toBeUndefined();
  });
});

describe("extractTestVarDeclarations", () => {
  it("extracts simple VAR declarations", () => {
    const source = "VAR\n  x : INT;\n  y : REAL;\nEND_VAR";
    const vars = extractTestVarDeclarations(source);
    expect(vars.get("X")).toBe("INT");
    expect(vars.get("Y")).toBe("REAL");
    expect(vars.size).toBe(2);
  });

  it("extracts multi-name declarations", () => {
    const source = "VAR\n  a, b, c : BOOL;\nEND_VAR";
    const vars = extractTestVarDeclarations(source);
    expect(vars.get("A")).toBe("BOOL");
    expect(vars.get("B")).toBe("BOOL");
    expect(vars.get("C")).toBe("BOOL");
  });

  it("handles VAR_TEMP and other VAR_ variants", () => {
    const source = "VAR_TEMP\n  tmp : DINT;\nEND_VAR";
    const vars = extractTestVarDeclarations(source);
    expect(vars.get("TMP")).toBe("DINT");
  });

  it("returns empty map for source with no VAR blocks", () => {
    const source = "TEST 'foo'\n  ASSERT_TRUE(TRUE);\nEND_TEST";
    const vars = extractTestVarDeclarations(source);
    expect(vars.size).toBe(0);
  });

  it("handles multiple VAR blocks", () => {
    const source = "VAR\n  x : INT;\nEND_VAR\nVAR\n  y : REAL;\nEND_VAR";
    const vars = extractTestVarDeclarations(source);
    expect(vars.get("X")).toBe("INT");
    expect(vars.get("Y")).toBe("REAL");
  });
});
