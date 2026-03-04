// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getSignatureHelp } from "../../server/src/signature-help.js";
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

describe("getSignatureHelp", () => {
  it("shows params for user function call", () => {
    const analysis = getAnalysis();
    // Position cursor right after "Distance(" — inside the call
    const pos = findPosition("Distance(p1");
    const col = pos.col + "Distance(".length;
    const help = getSignatureHelp(
      analysis,
      "complex-project.st",
      pos.line,
      col,
      FIXTURE,
    );
    expect(help).not.toBeNull();
    expect(help!.signatures.length).toBe(1);
    const label = help!.signatures[0].label.toUpperCase();
    expect(label).toContain("DISTANCE");
    expect(label).toContain("REAL");
    expect(help!.signatures[0].parameters!.length).toBe(2); // p1, p2
    expect(help!.activeParameter).toBe(0);
  });

  it("shows params for standard function", () => {
    const analysis = getAnalysis();
    // Position cursor right after "SQRT("
    const pos = findPosition("SQRT(");
    const col = pos.col + "SQRT(".length;
    const help = getSignatureHelp(
      analysis,
      "complex-project.st",
      pos.line,
      col,
      FIXTURE,
    );
    expect(help).not.toBeNull();
    expect(help!.signatures[0].label.toUpperCase()).toContain("SQRT");
  });

  it("tracks active parameter with commas", () => {
    const analysis = getAnalysis();
    // "Distance(p1 := player.position, p2 := enemy.position)"
    // Position cursor after the comma, on "p2"
    const pos = findPosition("p2 := enemy.position");
    // Make sure we're inside the Distance( call
    const help = getSignatureHelp(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      FIXTURE,
    );
    expect(help).not.toBeNull();
    expect(help!.activeParameter).toBe(1);
  });

  it("returns null when not inside a call", () => {
    const analysis = getAnalysis();
    // Position on "counter := counter + 1" — no open paren
    const pos = findPosition("counter := counter + 1");
    const help = getSignatureHelp(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col + 5,
      FIXTURE,
    );
    expect(help).toBeNull();
  });

  it("handles method call signature", () => {
    const analysis = getAnalysis();
    // "player.Move(dx := 1.0, dy := 0.0)"
    const pos = findPosition("player.Move(dx");
    const col = pos.col + "player.Move(".length;
    const help = getSignatureHelp(
      analysis,
      "complex-project.st",
      pos.line,
      col,
      FIXTURE,
    );
    expect(help).not.toBeNull();
    expect(help!.signatures[0].label.toUpperCase()).toContain("MOVE");
    // Move has dx, dy params
    expect(help!.signatures[0].parameters!.length).toBe(2);
  });

  it("handles nested calls — inner takes precedence", () => {
    const analysis = getAnalysis();
    // "SQRT(dx * dx + dy * dy)" — cursor inside SQRT(
    const pos = findPosition("SQRT(dx");
    const col = pos.col + "SQRT(".length;
    const help = getSignatureHelp(
      analysis,
      "complex-project.st",
      pos.line,
      col,
      FIXTURE,
    );
    expect(help).not.toBeNull();
    expect(help!.signatures[0].label.toUpperCase()).toContain("SQRT");
  });
});
