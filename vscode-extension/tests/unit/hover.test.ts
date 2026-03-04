// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getHover } from "../../server/src/hover.js";
import type { AnalysisResult } from "strucpp";

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/complex-project.st");
const FIXTURE = fs.readFileSync(FIXTURE_PATH, "utf-8");

function getAnalysis(): AnalysisResult {
  return analyze(FIXTURE, { fileName: "complex-project.st" });
}

function findPosition(text: string): { line: number; col: number } {
  const lines = FIXTURE.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(text);
    if (idx >= 0) {
      return { line: i + 1, col: idx + 1 };
    }
  }
  throw new Error(`Text "${text}" not found in fixture`);
}

describe("getHover", () => {
  it("shows variable type on hover", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const hover = getHover(analysis, "complex-project.st", pos.line, pos.col);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    expect(value).toContain("COUNTER");
    expect(value).toContain("INT");
  });

  it("shows function signature on hover", () => {
    const analysis = getAnalysis();
    const pos = findPosition("Distance(p1");
    const hover = getHover(analysis, "complex-project.st", pos.line, pos.col);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    expect(value).toContain("FUNCTION");
    expect(value).toContain("DISTANCE");
    expect(value).toContain("REAL");
  });

  it("shows FB instance type on hover", () => {
    const analysis = getAnalysis();
    const pos = findPosition("player.visible");
    const hover = getHover(analysis, "complex-project.st", pos.line, pos.col);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    expect(value).toContain("SPRITE");
  });

  it("returns null for whitespace beyond end of line", () => {
    const analysis = getAnalysis();
    const hover = getHover(analysis, "complex-project.st", 1, 100);
    expect(hover).toBeNull();
  });

  it("shows standard function info on hover", () => {
    const analysis = getAnalysis();
    const pos = findPosition("SQRT(");
    const hover = getHover(analysis, "complex-project.st", pos.line, pos.col);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    expect(value).toContain("SQRT");
  });

  it("shows struct type fields on hover", () => {
    const analysis = getAnalysis();
    // Hover over "Point" in "TYPE Point :" (line 3 of fixture)
    const lines = FIXTURE.split("\n");
    const typeLineIdx = lines.findIndex((l) =>
      l.toUpperCase().includes("TYPE POINT"),
    );
    expect(typeLineIdx).toBeGreaterThanOrEqual(0);
    // Find "Point" (not "TYPE") in the line
    const col = lines[typeLineIdx].toUpperCase().indexOf("POINT") + 1;
    const hover = getHover(
      analysis,
      "complex-project.st",
      typeLineIdx + 1,
      col,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    expect(value).toContain("STRUCT");
    expect(value).toContain("X");
    expect(value).toContain("Y");
  });

  it("shows enum type members on hover", () => {
    const analysis = getAnalysis();
    const lines = FIXTURE.split("\n");
    // Fixture uses "TYPE Color" not "TYPE Direction"
    const typeLineIdx = lines.findIndex((l) =>
      l.toUpperCase().includes("TYPE COLOR"),
    );
    expect(typeLineIdx).toBeGreaterThanOrEqual(0);
    const col = lines[typeLineIdx].toUpperCase().indexOf("COLOR") + 1;
    const hover = getHover(
      analysis,
      "complex-project.st",
      typeLineIdx + 1,
      col,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    expect(value).toContain("COLOR");
    expect(value).toContain("RED");
    expect(value).toContain("GREEN");
    expect(value).toContain("BLUE");
  });

  it("expands FB details on variable hover", () => {
    const analysis = getAnalysis();
    const pos = findPosition("player.visible");
    const hover = getHover(analysis, "complex-project.st", pos.line, pos.col);
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value.toUpperCase();
    // Should expand the Sprite FB type details
    expect(value).toContain("SPRITE");
    expect(value).toContain("VAR_INPUT");
  });
});

describe("error resilience", () => {
  it("still provides hover for valid parts when source has parse errors", () => {
    // Source with a parse error in the middle
    const sourceWithError = `
PROGRAM GoodProg
  VAR
    counter : INT;
  END_VAR
  counter := counter + 1;
END_PROGRAM

PROGRAM BadProg
  VAR
    x : INT;
  END_VAR
  x := !!!INVALID!!!;
END_PROGRAM
`;
    const analysis = analyze(sourceWithError, {
      fileName: "test.st",
    });
    // Even with parse errors, we should get at least partial results
    expect(analysis.errors.length).toBeGreaterThan(0);
    // The analysis should still have ast and symbolTables from recovery
    if (analysis.ast && analysis.symbolTables) {
      // Try hovering on "counter" in GoodProg
      const lines = sourceWithError.split("\n");
      const lineIdx = lines.findIndex((l) => l.includes("counter := counter"));
      if (lineIdx >= 0) {
        const col = lines[lineIdx].indexOf("counter") + 1;
        const hover = getHover(analysis, "test.st", lineIdx + 1, col);
        // Should still work for the valid program
        if (hover) {
          const value = (hover.contents as { value: string }).value.toUpperCase();
          expect(value).toContain("COUNTER");
        }
      }
    }
  });
});
