// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getDocumentSymbols, getWorkspaceSymbols } from "../../server/src/symbols.js";
import type { AnalysisResult } from "strucpp";

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/complex-project.st");
const FIXTURE = fs.readFileSync(FIXTURE_PATH, "utf-8");

function getAnalysis(): AnalysisResult {
  return analyze(FIXTURE, { fileName: "complex-project.st" });
}

/** Case-insensitive find in symbol array */
function findSymbol(symbols: { name: string }[], name: string) {
  return symbols.find((s) => s.name.toUpperCase() === name.toUpperCase());
}

describe("getDocumentSymbols", () => {
  it("returns top-level POUs", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);

    const upperNames = symbols.map((s) => s.name.toUpperCase());
    expect(upperNames).toContain("MAIN");
    expect(upperNames).toContain("SPRITE");
    expect(upperNames).toContain("DISTANCE");
    expect(upperNames).toContain("COLOR");
    expect(upperNames).toContain("POINT");
    expect(upperNames).toContain("IMOVABLE");
  });

  it("maps PROGRAM to Module symbol kind", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const main = findSymbol(symbols, "Main");
    expect(main).toBeDefined();
    expect(main!.kind).toBe(2); // SymbolKind.Module
  });

  it("maps FUNCTION_BLOCK to Class symbol kind", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const sprite = findSymbol(symbols, "Sprite");
    expect(sprite).toBeDefined();
    expect(sprite!.kind).toBe(5); // SymbolKind.Class
  });

  it("maps FUNCTION to Function symbol kind", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const dist = findSymbol(symbols, "Distance");
    expect(dist).toBeDefined();
    expect(dist!.kind).toBe(12); // SymbolKind.Function
  });

  it("maps INTERFACE to Interface symbol kind", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const iface = findSymbol(symbols, "IMovable");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe(11); // SymbolKind.Interface
  });

  it("includes struct fields as children", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const point = findSymbol(symbols, "Point");
    expect(point).toBeDefined();
    expect(point!.kind).toBe(23); // SymbolKind.Struct
    expect(point!.children).toBeDefined();
    const fieldNames = point!.children!.map((c) => c.name.toUpperCase());
    expect(fieldNames).toContain("X");
    expect(fieldNames).toContain("Y");
  });

  it("includes enum members as children", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const color = findSymbol(symbols, "Color");
    expect(color).toBeDefined();
    expect(color!.kind).toBe(10); // SymbolKind.Enum
    expect(color!.children).toBeDefined();
    const memberNames = color!.children!.map((c) => c.name.toUpperCase());
    expect(memberNames).toEqual(["RED", "GREEN", "BLUE"]);
  });

  it("includes FB methods as children", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const sprite = findSymbol(symbols, "Sprite");
    expect(sprite).toBeDefined();
    expect(sprite!.children).toBeDefined();
    const methodChild = findSymbol(sprite!.children!, "Move");
    expect(methodChild).toBeDefined();
    expect(methodChild!.kind).toBe(6); // SymbolKind.Method
  });

  it("includes variables as children of programs", () => {
    const analysis = getAnalysis();
    const symbols = getDocumentSymbols(analysis);
    const main = findSymbol(symbols, "Main");
    expect(main).toBeDefined();
    expect(main!.children).toBeDefined();
    const varNames = main!.children!.map((c) => c.name.toUpperCase());
    expect(varNames).toContain("PLAYER");
    expect(varNames).toContain("ENEMY");
    expect(varNames).toContain("DIST");
    expect(varNames).toContain("COUNTER");
  });

  it("returns empty array for empty analysis", () => {
    const analysis: AnalysisResult = { errors: [], warnings: [] };
    const symbols = getDocumentSymbols(analysis);
    expect(symbols).toEqual([]);
  });
});

describe("getDocumentSymbols multi-file filtering", () => {
  it("only returns symbols from the specified file", () => {
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

    // When filtering to main.st, should only show Main program
    const mainSymbols = getDocumentSymbols(analysis, "main.st");
    const mainNames = mainSymbols.map((s) => s.name.toUpperCase());
    expect(mainNames).toContain("MAIN");
    expect(mainNames).not.toContain("MYENUM");

    // When filtering to types.st, should only show MyEnum type
    const typesSymbols = getDocumentSymbols(analysis, "types.st");
    const typesNames = typesSymbols.map((s) => s.name.toUpperCase());
    expect(typesNames).toContain("MYENUM");
    expect(typesNames).not.toContain("MAIN");
  });
});

describe("getWorkspaceSymbols", () => {
  it("filters symbols by query (case-insensitive)", () => {
    const analysis = getAnalysis();
    const allAnalyses = new Map([
      ["file:///test.st", analysis],
    ]);
    const results = getWorkspaceSymbols(allAnalyses, "SPRITE");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((s) => s.name.toUpperCase() === "SPRITE")).toBe(true);
  });

  it("returns all symbols for empty query", () => {
    const analysis = getAnalysis();
    const allAnalyses = new Map([
      ["file:///test.st", analysis],
    ]);
    const results = getWorkspaceSymbols(allAnalyses, "");
    expect(results.length).toBeGreaterThan(5);
  });
});
