// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { resolveSymbolAtPosition } from "../../server/src/resolve-symbol.js";
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

describe("resolveSymbolAtPosition", () => {
  it("resolves a variable in program scope", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const resolved = resolveSymbolAtPosition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
    );
    expect(resolved).toBeDefined();
    expect(resolved!.symbol).toBeDefined();
    expect(resolved!.symbol!.kind).toBe("variable");
    expect(resolved!.symbol!.name.toUpperCase()).toBe("COUNTER");
    expect(resolved!.scope.kind).toBe("program");
  });

  it("resolves a function call", () => {
    const analysis = getAnalysis();
    const pos = findPosition("Distance(p1");
    const resolved = resolveSymbolAtPosition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
    );
    expect(resolved).toBeDefined();
    expect(resolved!.symbol).toBeDefined();
    expect(resolved!.symbol!.kind).toBe("function");
  });

  it("resolves a standard function call", () => {
    const analysis = getAnalysis();
    const pos = findPosition("SQRT(");
    const resolved = resolveSymbolAtPosition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
    );
    expect(resolved).toBeDefined();
    // SQRT may be resolved via symbol table (registered by std function registry)
    // or as stdFunction — either way something should be found
    expect(
      resolved!.symbol !== undefined || resolved!.stdFunction !== undefined,
    ).toBe(true);
  });

  it("returns undefined for empty position", () => {
    const analysis = getAnalysis();
    const resolved = resolveSymbolAtPosition(
      analysis,
      "complex-project.st",
      1,
      100,
    );
    expect(resolved).toBeUndefined();
  });

  it("resolves variable inside a method", () => {
    const analysis = getAnalysis();
    // Inside Move method: "dx * speed"
    const pos = findPosition("dx * speed");
    const resolved = resolveSymbolAtPosition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
    );
    expect(resolved).toBeDefined();
    expect(resolved!.scope.kind).toBe("method");
    expect(resolved!.scope.name.toUpperCase()).toBe("MOVE");
    expect(resolved!.scope.parentName!.toUpperCase()).toBe("SPRITE");
  });
});
