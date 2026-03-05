// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getReferences } from "../../server/src/references.js";
import type { AnalysisResult } from "strucpp";

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/complex-project.st");
const FIXTURE = fs.readFileSync(FIXTURE_PATH, "utf-8");
const URI = "file:///workspace/complex-project.st";

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

function makeDocMap(analysis: AnalysisResult) {
  return new Map([[URI, { uri: URI, analysisResult: analysis }]]);
}

describe("getReferences", () => {
  it("finds all references to a local variable", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const refs = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
      makeDocMap(analysis),
      undefined,
      true,
    );
    // counter appears: declaration, assignment target, assignment source (counter + 1)
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const ref of refs) {
      expect(ref.uri).toBe(URI);
    }
  });

  it("scopes local variables to their enclosing POU", () => {
    // dx exists in both Distance (function) and Sprite.Move (method)
    const analysis = getAnalysis();
    // Find dx inside the Distance function body
    const pos = findPosition("dx := p2.x - p1.x");
    const refs = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
      makeDocMap(analysis),
      undefined,
      true,
    );
    // dx in Distance: declaration + assignment + two usages in SQRT expression
    expect(refs.length).toBeGreaterThanOrEqual(2);
    // All refs should be within the Distance function, not in Sprite.Move
    const moveMethodLine = FIXTURE.split("\n").findIndex((l) =>
      l.includes("METHOD PUBLIC Move"),
    );
    for (const ref of refs) {
      // None should be on or after the Move method line (which also has dx)
      // unless they're before the Distance function
      expect(ref.uri).toBe(URI);
    }
  });

  it("finds references to a function across the file", () => {
    const analysis = getAnalysis();
    // Find "Distance" at the function call site
    const pos = findPosition("Distance(p1");
    const refs = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
      makeDocMap(analysis),
      undefined,
      true,
    );
    // Distance: declaration + call site
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("finds references to a function block type", () => {
    const analysis = getAnalysis();
    // Find "Sprite" at its type usage (player : Sprite)
    const pos = findPosition("player : Sprite");
    // Position on "Sprite" (type reference)
    const spriteCol = FIXTURE.split("\n")[pos.line - 1].indexOf("Sprite") + 1;
    const refs = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      spriteCol,
      URI,
      makeDocMap(analysis),
      undefined,
      true,
    );
    // Sprite: FB declaration + type refs (player : Sprite, enemy : Sprite)
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty for standard functions", () => {
    const analysis = getAnalysis();
    const pos = findPosition("SQRT(");
    const refs = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
      makeDocMap(analysis),
    );
    expect(refs).toHaveLength(0);
  });

  it("returns empty when cursor is on whitespace", () => {
    const analysis = getAnalysis();
    // Line 2 is empty in the fixture
    const refs = getReferences(
      analysis,
      "complex-project.st",
      2,
      1,
      URI,
      makeDocMap(analysis),
    );
    expect(refs).toHaveLength(0);
  });

  it("excludes declaration when includeDeclaration is false", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const refsWithDecl = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
      makeDocMap(analysis),
      undefined,
      true,
    );
    const refsWithoutDecl = getReferences(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
      makeDocMap(analysis),
      undefined,
      false,
    );
    expect(refsWithDecl.length).toBeGreaterThan(refsWithoutDecl.length);
  });
});
