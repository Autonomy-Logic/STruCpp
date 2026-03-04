// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getDefinition, getTypeDefinition } from "../../server/src/definition.js";
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

describe("getDefinition", () => {
  it("navigates variable to its declaration", () => {
    const analysis = getAnalysis();
    const pos = findPosition("counter := counter + 1");
    const def = getDefinition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
    );
    expect(def).not.toBeNull();
    expect(def!.uri).toBe(URI);
    // Declaration should be before usage
    expect(def!.range.start.line).toBeLessThan(pos.line - 1);
  });

  it("navigates function call to function declaration", () => {
    const analysis = getAnalysis();
    const pos = findPosition("Distance(p1");
    const def = getDefinition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
    );
    expect(def).not.toBeNull();
    expect(def!.uri).toBe(URI);
    // Should point to FUNCTION Distance declaration
    const lines = FIXTURE.split("\n");
    const declLine = lines.findIndex((l) =>
      l.toUpperCase().startsWith("FUNCTION DISTANCE"),
    );
    expect(declLine).toBeGreaterThanOrEqual(0);
    expect(def!.range.start.line).toBe(declLine);
  });

  it("returns null for standard functions", () => {
    const analysis = getAnalysis();
    const pos = findPosition("SQRT(");
    const def = getDefinition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
    );
    expect(def).toBeNull();
  });
});

describe("getDefinition cross-file", () => {
  it("resolves type defined in another file to that file's URI", () => {
    // Simulate multi-file project: type defined in types.st, used in main.st
    const typesSource = `TYPE MyEnum : (A, B, C); END_TYPE`;
    const mainSource = `PROGRAM Main
  VAR
    x : MyEnum;
  END_VAR
END_PROGRAM`;

    const analysis = analyze(mainSource, {
      fileName: "main.st",
      additionalSources: [{ source: typesSource, fileName: "types.st" }],
    });

    // Hover on "MyEnum" in the VAR declaration (line 3, col at "MyEnum")
    const lines = mainSource.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("MyEnum"));
    const col = lines[lineIdx].indexOf("MyEnum") + 1;

    // Provide a resolver that maps "types.st" to a URI
    const resolver = (fn: string) =>
      fn === "types.st" ? "file:///workspace/types.st" : undefined;

    const def = getDefinition(
      analysis,
      "main.st",
      lineIdx + 1,
      col,
      "file:///workspace/main.st",
      resolver,
    );

    expect(def).not.toBeNull();
    expect(def!.uri).toBe("file:///workspace/types.st");
  });

  it("falls back to current URI when resolver cannot find file", () => {
    const typesSource = `TYPE MyEnum : (A, B, C); END_TYPE`;
    const mainSource = `PROGRAM Main
  VAR
    x : MyEnum;
  END_VAR
END_PROGRAM`;

    const analysis = analyze(mainSource, {
      fileName: "main.st",
      additionalSources: [{ source: typesSource, fileName: "types.st" }],
    });

    const lines = mainSource.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("MyEnum"));
    const col = lines[lineIdx].indexOf("MyEnum") + 1;

    // Resolver that can't find anything
    const resolver = () => undefined;

    const def = getDefinition(
      analysis,
      "main.st",
      lineIdx + 1,
      col,
      "file:///workspace/main.st",
      resolver,
    );

    expect(def).not.toBeNull();
    // Falls back to current URI since resolver can't resolve
    expect(def!.uri).toBe("file:///workspace/main.st");
  });
});

describe("getTypeDefinition", () => {
  it("navigates variable to its type declaration", () => {
    const analysis = getAnalysis();
    const pos = findPosition("player.visible");
    const def = getTypeDefinition(
      analysis,
      "complex-project.st",
      pos.line,
      pos.col,
      URI,
    );
    expect(def).not.toBeNull();
    // Should point to FUNCTION_BLOCK Sprite declaration
    const lines = FIXTURE.split("\n");
    const declLine = lines.findIndex((l) =>
      l.toUpperCase().startsWith("FUNCTION_BLOCK SPRITE"),
    );
    expect(declLine).toBeGreaterThanOrEqual(0);
    expect(def!.range.start.line).toBe(declLine);
  });
});
