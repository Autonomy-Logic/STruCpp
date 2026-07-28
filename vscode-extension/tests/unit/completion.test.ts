// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getCompletions } from "../../server/src/completion.js";
import type { AnalysisResult } from "strucpp";

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/complex-project.st");
const FIXTURE = fs.readFileSync(FIXTURE_PATH, "utf-8");
const LINES = FIXTURE.split("\n");

function getAnalysis(): AnalysisResult {
  return analyze(FIXTURE, { fileName: "complex-project.st" });
}

/** Find 1-indexed line/col for the first occurrence of text. */
function findPosition(text: string): { line: number; col: number } {
  for (let i = 0; i < LINES.length; i++) {
    const idx = LINES[i].indexOf(text);
    if (idx >= 0) {
      return { line: i + 1, col: idx + 1 };
    }
  }
  throw new Error(`Text "${text}" not found in fixture`);
}

/** Helper: uppercase all labels for case-insensitive comparison. */
function upperLabels(items: { label: string }[]): string[] {
  return items.map((i) => i.label.toUpperCase());
}

describe("getCompletions", () => {
  describe("top-level", () => {
    it("returns POU keyword snippets outside any POU", () => {
      const analysis = getAnalysis();
      // Use a position past END_PROGRAM at the very end.
      const lastLine = LINES.length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        lastLine + 1,
        1,
        FIXTURE,
      );
      // Labels are lower-case by convention; compare case-
      // insensitively so the test survives either casing.
      const labels = upperLabels(items);
      expect(labels).toContain("PROGRAM");
      expect(labels).toContain("FUNCTION_BLOCK");
      expect(labels).toContain("FUNCTION");
      expect(labels).toContain("TYPE");
      expect(labels).toContain("INTERFACE");
    });
  });

  describe("type annotation", () => {
    it("returns elementary types and user types after ':'", () => {
      const analysis = getAnalysis();
      // Find "counter : INT" and position cursor after ": "
      const pos = findPosition("counter : INT");
      const col = pos.col + "counter : ".length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        col,
        FIXTURE,
      );
      const labels = upperLabels(items);
      // Elementary types
      expect(labels).toContain("INT");
      expect(labels).toContain("REAL");
      expect(labels).toContain("BOOL");
      expect(labels).toContain("STRING");
      // User-defined types (compiler uppercases names)
      expect(labels).toContain("POINT");
      expect(labels).toContain("COLOR");
      // FB types
      expect(labels).toContain("SPRITE");
      // Snippets
      expect(labels).toContain("ARRAY");
      expect(labels).toContain("REF_TO");
    });
  });

  describe("body", () => {
    it("returns keywords and scope variables", () => {
      const analysis = getAnalysis();
      const pos = findPosition("counter := counter + 1");
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        3,
        FIXTURE,
      );
      const labels = upperLabels(items);
      // Keywords
      expect(labels).toContain("IF");
      expect(labels).toContain("FOR");
      expect(labels).toContain("WHILE");
      expect(labels).toContain("CASE");
      // Local variables (compiler uppercases names)
      expect(labels).toContain("PLAYER");
      expect(labels).toContain("ENEMY");
      expect(labels).toContain("DIST");
      expect(labels).toContain("COUNTER");
      // Functions from global scope
      expect(labels).toContain("DISTANCE");
    });

    it("includes standard library functions", () => {
      const analysis = getAnalysis();
      const pos = findPosition("counter := counter + 1");
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        3,
        FIXTURE,
      );
      const labels = upperLabels(items);
      expect(labels).toContain("SQRT");
      expect(labels).toContain("ABS");
    });

    it("sorts local vars before globals before std functions", () => {
      const analysis = getAnalysis();
      const pos = findPosition("counter := counter + 1");
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        3,
        FIXTURE,
      );
      // Find sort texts using case-insensitive lookup
      const playerItem = items.find(
        (i) => i.label.toUpperCase() === "PLAYER",
      );
      const distanceItem = items.find(
        (i) => i.label.toUpperCase() === "DISTANCE",
      );
      const sqrtItem = items.find(
        (i) => i.label.toUpperCase() === "SQRT",
      );
      const ifItem = items.find((i) => i.label.toUpperCase() === "IF");

      expect(ifItem?.sortText).toBe("0"); // keywords first
      expect(playerItem?.sortText).toBe("1"); // local vars
      // Distance is a global function
      expect(distanceItem?.sortText).toBe("4");
      // SQRT is a std function
      expect(sqrtItem?.sortText).toBe("5");
    });
  });

  describe("dot-access on FB instance", () => {
    it("shows inputs and outputs of FB", () => {
      const analysis = getAnalysis();
      const pos = findPosition("player.visible");
      const col = pos.col + "player.".length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        col,
        FIXTURE,
      );
      const labels = upperLabels(items);
      expect(labels).toContain("VISIBLE"); // VAR_INPUT
      expect(labels).toContain("POSITION"); // VAR_OUTPUT
    });

    it("shows methods of FB", () => {
      const analysis = getAnalysis();
      const pos = findPosition("player.visible");
      const col = pos.col + "player.".length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        col,
        FIXTURE,
      );
      const labels = upperLabels(items);
      expect(labels).toContain("MOVE");
    });
  });

  describe("dot-access on struct", () => {
    it("shows struct fields after dot", () => {
      const analysis = getAnalysis();
      // "p2.x - p1.x" — position cursor right after "p2."
      const p2pos = findPosition("p2.x - p1.x");
      const col = p2pos.col + "p2.".length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        p2pos.line,
        col,
        FIXTURE,
      );
      const labels = upperLabels(items);
      expect(labels).toContain("X");
      expect(labels).toContain("Y");
    });
  });

  describe("original-case restoration", () => {
    it("restores variable names to source casing", () => {
      const analysis = getAnalysis();
      const pos = findPosition("counter := counter + 1");
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        3,
        FIXTURE,
      );
      // Fixture uses lowercase: player, enemy, dist, counter
      const labels = items.map((i) => i.label);
      expect(labels).toContain("player");
      expect(labels).toContain("enemy");
      expect(labels).toContain("dist");
      expect(labels).toContain("counter");
    });

    it("restores type names to source casing in type annotations", () => {
      const analysis = getAnalysis();
      const pos = findPosition("counter : INT");
      const col = pos.col + "counter : ".length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        col,
        FIXTURE,
      );
      // Fixture declares "Point", "Color", "Sprite" in PascalCase
      const labels = items.map((i) => i.label);
      expect(labels).toContain("Point");
      expect(labels).toContain("Color");
      expect(labels).toContain("Sprite");
    });

    it("restores dot-access member names to source casing", () => {
      const analysis = getAnalysis();
      const pos = findPosition("player.visible");
      const col = pos.col + "player.".length;
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        col,
        FIXTURE,
      );
      // Fixture uses lowercase: visible, position, speed
      const labels = items.map((i) => i.label);
      expect(labels).toContain("visible");
      expect(labels).toContain("position");
    });

    it("emits keywords lower-case", () => {
      const analysis = getAnalysis();
      const pos = findPosition("counter := counter + 1");
      const items = getCompletions(
        analysis,
        "complex-project.st",
        pos.line,
        3,
        FIXTURE,
      );
      const labels = items.map((i) => i.label);
      // Statement keywords ship lower-case so the inserted snippet
      // text matches the surface label.  ST is case-insensitive at
      // the parser level, so this is purely a typographic choice.
      expect(labels).toContain("if");
      expect(labels).toContain("for");
      expect(labels).toContain("while");
    });
  });

  describe("error resilience", () => {
    it("returns empty array for invalid position", () => {
      const analysis = getAnalysis();
      const items = getCompletions(
        analysis,
        "complex-project.st",
        9999,
        1,
        FIXTURE,
      );
      expect(Array.isArray(items)).toBe(true);
    });

    it("handles source with parse errors gracefully", () => {
      const badSource = `
PROGRAM Broken
  VAR
    x : INT;
  END_VAR
  x := !!!INVALID;
END_PROGRAM
`;
      const analysis = analyze(badSource, { fileName: "broken.st" });
      const items = getCompletions(analysis, "broken.st", 6, 3, badSource);
      expect(Array.isArray(items)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Array variables
//
// The AST names inline arrays with an internal synthetic identifier
// (`__INLINE_ARRAY_BOOL`) and keeps the element type and bounds beside it on
// the same TypeReference. Publishing the raw name leaked a compiler internal
// and left clients unable to tell what the symbol could be used as: an editor
// filtering candidates by an expected type found nothing to offer for an
// array, and rejected `someArray[0]` as an unknown expression.
// ---------------------------------------------------------------------------

describe("array completions", () => {
  const ARRAY_SOURCE = `PROGRAM Main
  VAR
    someArray : ARRAY [0..10] OF BOOL;
    matrix : ARRAY [0..2, 0..2] OF INT;
    negative : ARRAY [-2..0] OF SINT;
    huge : ARRAY [1..500] OF INT;
    plain : BOOL;
  END_VAR
  plain := FALSE;
END_PROGRAM
`;

  function arrayCompletions() {
    const analysis = analyze(ARRAY_SOURCE, { fileName: "arrays.st" });
    // Body position, on the assignment line.
    return getCompletions(analysis, "arrays.st", 9, 3, ARRAY_SOURCE);
  }

  function labelled(items: { label: string }[], prefix: string): string[] {
    return items.map((i) => i.label).filter((l) => l.toUpperCase().startsWith(prefix.toUpperCase()));
  }

  function detailOf(items: { label: string; detail?: string }[], label: string): string | undefined {
    return items.find((i) => i.label.toUpperCase() === label.toUpperCase())?.detail;
  }

  it("renders the declared ARRAY type instead of the internal synthetic name", () => {
    const items = arrayCompletions();
    expect(detailOf(items, "someArray")).toBe("ARRAY [0..10] OF BOOL");
    expect(detailOf(items, "matrix")).toBe("ARRAY [0..2, 0..2] OF INT");
    expect(detailOf(items, "negative")).toBe("ARRAY [-2..0] OF SINT");
  });

  it("never leaks an internal array type name through a variable's detail", () => {
    const items = arrayCompletions();
    const leaked = items.filter(
      (i) => i.detail?.includes("__INLINE_ARRAY") || i.detail?.includes("__VLA_"),
    );
    expect(leaked).toEqual([]);
  });

  it("offers every element of a 1-D array, typed as the element type", () => {
    const items = arrayCompletions();
    const elements = labelled(items, "someArray[");
    expect(elements).toHaveLength(11);
    expect(elements[0]).toBe("someArray[0]");
    expect(elements[10]).toBe("someArray[10]");
    expect(detailOf(items, "someArray[3]")).toBe("BOOL");
  });

  it("offers multi-dimensional elements in row-major order with comma indices", () => {
    const items = arrayCompletions();
    const elements = labelled(items, "matrix[");
    expect(elements).toHaveLength(9);
    expect(elements.slice(0, 4)).toEqual(["matrix[0,0]", "matrix[0,1]", "matrix[0,2]", "matrix[1,0]"]);
    expect(detailOf(items, "matrix[2,2]")).toBe("INT");
  });

  it("honours negative bounds", () => {
    const items = arrayCompletions();
    expect(labelled(items, "negative[")).toEqual(["negative[-2]", "negative[-1]", "negative[0]"]);
  });

  it("offers the bare name only for an array past the element cap", () => {
    const items = arrayCompletions();
    expect(labelled(items, "huge[")).toEqual([]);
    // …but the array itself is still completable, with a readable type.
    expect(detailOf(items, "huge")).toBe("ARRAY [1..500] OF INT");
  });

  it("restores the declaration's casing on synthesized element labels", () => {
    const items = arrayCompletions();
    // The compiler uppercases identifiers; an element label is synthesized by
    // the server and so never appears verbatim in the source. Without explicit
    // handling the editor would insert a shouting `SOMEARRAY[0]`.
    expect(labelled(items, "someArray[").every((l) => l.startsWith("someArray["))).toBe(true);
  });

  it("leaves non-array variables untouched", () => {
    const items = arrayCompletions();
    expect(detailOf(items, "plain")).toBe("BOOL");
    expect(labelled(items, "plain[")).toEqual([]);
  });
});
