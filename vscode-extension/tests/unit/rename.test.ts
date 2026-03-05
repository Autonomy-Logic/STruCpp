// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { prepareRename, getRenameEdits } from "../../server/src/rename.js";
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

describe("prepareRename", () => {
  it("returns range and placeholder for a variable", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const result = prepareRename(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
    );
    expect(result).not.toBeNull();
    expect(result!.placeholder.toUpperCase()).toBe("COUNTER");
  });

  it("returns null for standard functions", () => {
    const analysis = getAnalysis();
    const pos = findPosition("SQRT(");
    const result = prepareRename(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
    );
    expect(result).toBeNull();
  });

  it("returns null for keywords", () => {
    const analysis = getAnalysis();
    // Position on BOOL keyword in "visible : BOOL"
    const line = FIXTURE.split("\n").findIndex((l) => l.includes("visible : BOOL"));
    const col = FIXTURE.split("\n")[line].indexOf("BOOL") + 1;
    const result = prepareRename(
      analysis,
      "complex-project.st",
      line + 1,
      col,
    );
    expect(result).toBeNull();
  });

  it("returns null when cursor is on empty space", () => {
    const analysis = getAnalysis();
    const result = prepareRename(
      analysis,
      "complex-project.st",
      2,
      1,
    );
    expect(result).toBeNull();
  });
});

describe("getRenameEdits", () => {
  it("produces WorkspaceEdit for a variable rename", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const edits = getRenameEdits(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      "newCounter",
      URI,
      makeDocMap(analysis),
    );
    expect(edits).not.toBeNull();
    expect(edits!.changes).toBeDefined();
    expect(edits!.changes![URI]).toBeDefined();
    // Should have edits for declaration + usages
    expect(edits!.changes![URI].length).toBeGreaterThanOrEqual(3);
    // All edits should replace with the new name
    for (const edit of edits!.changes![URI]) {
      expect(edit.newText).toBe("newCounter");
    }
  });

  it("scopes rename to the correct POU for local variables", () => {
    // Rename dx in Distance should not affect dx in Sprite.Move
    const analysis = getAnalysis();
    const pos = findPosition("dx := p2.x - p1.x");
    const edits = getRenameEdits(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      "deltaX",
      URI,
      makeDocMap(analysis),
    );
    expect(edits).not.toBeNull();
    const fileEdits = edits!.changes![URI];
    expect(fileEdits).toBeDefined();
    // All edits should be within the Distance function (lines 41-53, 0-indexed 40-52)
    const distFuncStart = FIXTURE.split("\n").findIndex((l) =>
      l.toUpperCase().startsWith("FUNCTION DISTANCE"),
    );
    const distFuncEnd = FIXTURE.split("\n").findIndex(
      (l, i) => i > distFuncStart && l.toUpperCase().startsWith("END_FUNCTION"),
    );
    for (const edit of fileEdits) {
      // Edit lines are 0-indexed in LSP
      expect(edit.range.start.line).toBeGreaterThanOrEqual(distFuncStart);
      expect(edit.range.start.line).toBeLessThanOrEqual(distFuncEnd);
    }
  });

  it("returns null for standard functions", () => {
    const analysis = getAnalysis();
    const pos = findPosition("SQRT(");
    const edits = getRenameEdits(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      "MySqrt",
      URI,
      makeDocMap(analysis),
    );
    expect(edits).toBeNull();
  });
});
