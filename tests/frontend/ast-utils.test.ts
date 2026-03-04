// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { analyze, findEnclosingPOU } from "../../src/index.js";
import type { EnclosingScope, AnalysisResult } from "../../src/index.js";

const FIXTURE = `FUNCTION_BLOCK MyFB
  VAR
    x : INT;
  END_VAR

  METHOD PUBLIC DoWork
    VAR
      temp : INT;
    END_VAR
    temp := x + 1;
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION Add : INT
  VAR_INPUT
    a : INT;
    b : INT;
  END_VAR
  Add := a + b;
END_FUNCTION

PROGRAM Main
  VAR
    fb : MyFB;
    result : INT;
  END_VAR
  result := Add(a := 1, b := 2);
END_PROGRAM
`;

let cachedResult: AnalysisResult;
function getResult(): AnalysisResult {
  if (!cachedResult) {
    cachedResult = analyze(FIXTURE, { fileName: "test.st" });
  }
  return cachedResult;
}

function findPos(text: string): { line: number; col: number } {
  const lines = FIXTURE.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(text);
    if (idx >= 0) {
      return { line: i + 1, col: idx + 1 }; // 1-indexed
    }
  }
  throw new Error(`Text "${text}" not found in fixture`);
}

function getScope(line: number, col: number): EnclosingScope {
  const result = getResult();
  expect(result.ast).toBeDefined();
  return findEnclosingPOU(result.ast!, "test.st", line, col);
}

describe("findEnclosingPOU", () => {
  it("identifies program scope", () => {
    const pos = findPos("result := Add(");
    const scope = getScope(pos.line, pos.col);
    expect(scope.kind).toBe("program");
    expect(scope.name.toUpperCase()).toBe("MAIN");
  });

  it("identifies function scope", () => {
    const pos = findPos("Add := a + b");
    const scope = getScope(pos.line, pos.col);
    expect(scope.kind).toBe("function");
    expect(scope.name.toUpperCase()).toBe("ADD");
  });

  it("identifies function block scope", () => {
    // VAR block inside FB but outside methods
    const pos = findPos("x : INT");
    const scope = getScope(pos.line, pos.col);
    expect(scope.kind).toBe("functionBlock");
    expect(scope.name.toUpperCase()).toBe("MYFB");
  });

  it("identifies method scope within FB", () => {
    const pos = findPos("temp := x + 1");
    const scope = getScope(pos.line, pos.col);
    expect(scope.kind).toBe("method");
    expect(scope.name.toUpperCase()).toBe("DOWORK");
    expect(scope.parentName!.toUpperCase()).toBe("MYFB");
  });

  it("returns global for position outside any POU", () => {
    // Position well past the end of the source
    const scope = getScope(100, 1);
    expect(scope.kind).toBe("global");
    expect(scope.name).toBe("global");
  });
});
