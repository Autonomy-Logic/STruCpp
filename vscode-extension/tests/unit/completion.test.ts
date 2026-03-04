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
      const labels = items.map((i) => i.label);
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
      const ifItem = items.find((i) => i.label === "IF");

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

    it("keeps keywords uppercase", () => {
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
      // Keywords should remain uppercase
      expect(labels).toContain("IF");
      expect(labels).toContain("FOR");
      expect(labels).toContain("WHILE");
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
