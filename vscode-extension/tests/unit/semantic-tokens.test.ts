// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import {
  getSemanticTokens,
  getTestFileSemanticTokens,
  TOKEN_TYPES,
  TOKEN_MODIFIERS,
} from "../../server/src/semantic-tokens.js";
import type { AnalysisResult } from "strucpp";

const FIXTURE_PATH = path.resolve(__dirname, "../fixtures/complex-project.st");
const FIXTURE = fs.readFileSync(FIXTURE_PATH, "utf-8");

function getAnalysis(): AnalysisResult {
  return analyze(FIXTURE, { fileName: "complex-project.st" });
}

const TYPE_IDX = Object.fromEntries(TOKEN_TYPES.map((t, i) => [t, i]));
const MOD_BIT = Object.fromEntries(TOKEN_MODIFIERS.map((m, i) => [m, 1 << i]));

/** Decode delta-encoded tokens into absolute [line, col, length, type, mods] tuples */
function decodeTokens(data: number[]): Array<[number, number, number, number, number]> {
  const result: Array<[number, number, number, number, number]> = [];
  let line = 0;
  let col = 0;
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaCol = data[i + 1];
    line += deltaLine;
    col = deltaLine === 0 ? col + deltaCol : deltaCol;
    result.push([line, col, data[i + 2], data[i + 3], data[i + 4]]);
  }
  return result;
}

function findToken(
  decoded: Array<[number, number, number, number, number]>,
  text: string,
  expectedType: number,
): [number, number, number, number, number] | undefined {
  const lines = FIXTURE.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(text);
    if (idx >= 0) {
      // Decoded tokens use 0-indexed line and col (LSP coords)
      const line = i;
      const col = idx;
      return decoded.find(
        (t) => t[0] === line && t[1] === col && t[3] === expectedType,
      );
    }
  }
  return undefined;
}

describe("getSemanticTokens", () => {
  it("returns valid delta-encoded data", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    // Data length should be multiple of 5
    expect(data.length % 5).toBe(0);
    // Should have some tokens
    expect(data.length).toBeGreaterThan(0);
  });

  it("emits program name as namespace + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const token = findToken(decoded, "Main", TYPE_IDX.namespace);
    expect(token).toBeDefined();
    expect(token![4] & MOD_BIT.declaration).toBeTruthy();
  });

  it("emits function declaration as function + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const token = findToken(decoded, "Distance", TYPE_IDX.function);
    expect(token).toBeDefined();
    expect(token![4] & MOD_BIT.declaration).toBeTruthy();
  });

  it("emits function block declaration as class + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const token = findToken(decoded, "Sprite", TYPE_IDX.class);
    expect(token).toBeDefined();
    expect(token![4] & MOD_BIT.declaration).toBeTruthy();
  });

  it("emits interface declaration as interface + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const token = findToken(decoded, "IMovable", TYPE_IDX.interface);
    expect(token).toBeDefined();
    expect(token![4] & MOD_BIT.declaration).toBeTruthy();
  });

  it("emits method declaration as method + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    // There are two Move methods (interface + FB); find any
    const moveTokens = decoded.filter(
      (t) => t[3] === TYPE_IDX.method && (t[4] & MOD_BIT.declaration),
    );
    expect(moveTokens.length).toBeGreaterThanOrEqual(1);
  });

  it("emits variable declaration as variable + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    // "counter" in VAR block of Main
    const token = findToken(decoded, "counter : INT", TYPE_IDX.variable);
    expect(token).toBeDefined();
    expect(token![4] & MOD_BIT.declaration).toBeTruthy();
  });

  it("emits VAR_INPUT declarations as parameter + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    // "visible" is VAR_INPUT in Sprite
    const token = findToken(decoded, "visible : BOOL", TYPE_IDX.parameter);
    expect(token).toBeDefined();
    expect(token![4] & MOD_BIT.declaration).toBeTruthy();
  });

  it("emits function call as function", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const token = findToken(decoded, "Distance(p1", TYPE_IDX.function);
    expect(token).toBeDefined();
  });

  it("emits elementary type references with defaultLibrary", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    // REAL appears as a type reference
    const realTokens = decoded.filter(
      (t) =>
        t[3] === TYPE_IDX.type &&
        (t[4] & MOD_BIT.defaultLibrary) !== 0,
    );
    expect(realTokens.length).toBeGreaterThan(0);
  });

  it("emits FB type references as class", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    // "Sprite" as a type reference in "player : Sprite"
    const lines = FIXTURE.split("\n");
    const playerLine = lines.findIndex((l) => l.includes("player : Sprite"));
    const spriteCol = lines[playerLine].indexOf("Sprite");
    const token = decoded.find(
      (t) =>
        t[0] === playerLine &&
        t[1] === spriteCol &&
        t[3] === TYPE_IDX.class,
    );
    expect(token).toBeDefined();
  });

  it("emits user type references as type", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    // "Point" as a type reference in "position : Point"
    const lines = FIXTURE.split("\n");
    const posLine = lines.findIndex((l) => l.includes("position : Point"));
    const pointCol = lines[posLine].indexOf("Point");
    const token = decoded.find(
      (t) =>
        t[0] === posLine &&
        t[1] === pointCol &&
        t[3] === TYPE_IDX.type,
    );
    expect(token).toBeDefined();
  });

  it("emits numeric literals as number", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const numberTokens = decoded.filter((t) => t[3] === TYPE_IDX.number);
    // There are numeric literals: 1.0, 0.0, 0, 1
    expect(numberTokens.length).toBeGreaterThan(0);
  });

  it("only includes tokens for the requested file", () => {
    // Multi-file: analyze with additional source
    const mainSource = `PROGRAM Test
  VAR
    x : INT;
  END_VAR
  x := 1;
END_PROGRAM`;
    const otherSource = `FUNCTION OtherFunc : INT
  VAR_INPUT
    y : INT;
  END_VAR
  OtherFunc := y;
END_FUNCTION`;

    const analysis = analyze(mainSource, {
      fileName: "main.st",
      additionalSources: [{ source: otherSource, fileName: "other.st" }],
    });

    const mainTokens = getSemanticTokens(analysis, "main.st", mainSource);
    const otherTokens = getSemanticTokens(analysis, "other.st", otherSource);

    // main.st should have tokens (at least program name + var decl)
    expect(mainTokens.length).toBeGreaterThan(0);
    // other.st should have tokens (at least function name)
    expect(otherTokens.length).toBeGreaterThan(0);
    // They should be different
    expect(mainTokens).not.toEqual(otherTokens);
  });

  it("delta encodes correctly", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);

    // Verify monotonically increasing (line, col)
    for (let i = 1; i < decoded.length; i++) {
      const [prevLine, prevCol] = decoded[i - 1];
      const [curLine, curCol] = decoded[i];
      if (curLine === prevLine) {
        expect(curCol).toBeGreaterThanOrEqual(prevCol);
      } else {
        expect(curLine).toBeGreaterThan(prevLine);
      }
    }
  });

  it("emits enum members as enumMember + declaration", () => {
    const analysis = getAnalysis();
    const data = getSemanticTokens(analysis, "complex-project.st", FIXTURE);
    const decoded = decodeTokens(data);
    const enumMemberTokens = decoded.filter(
      (t) => t[3] === TYPE_IDX.enumMember && (t[4] & MOD_BIT.declaration),
    );
    // RED, GREEN, BLUE
    expect(enumMemberTokens.length).toBeGreaterThanOrEqual(3);
  });
});

describe("getTestFileSemanticTokens", () => {
  const WORKSPACE_SOURCE = `TYPE TrafficState : (RED, GREEN, YELLOW); END_TYPE

TYPE PhaseTiming :
  STRUCT
    greenDuration : TIME;
    yellowDuration : TIME;
    redDuration : TIME;
  END_STRUCT;
END_TYPE

FUNCTION_BLOCK PedestrianLight
  VAR_INPUT enable : BOOL; END_VAR
  VAR_OUTPUT active : BOOL; END_VAR
END_FUNCTION_BLOCK
`;

  const TEST_SOURCE = `TEST 'TrafficState values'
  VAR
    s1 : TrafficState;
    s2 : TrafficState;
  END_VAR

  s1 := TrafficState.RED;
  s2 := TrafficState.GREEN;
  ASSERT_NEQ(s1, s2);
END_TEST
`;

  function getTestAnalysis(): AnalysisResult {
    return analyze("", {
      fileName: "test_traffic.st",
      additionalSources: [{ source: WORKSPACE_SOURCE, fileName: "types.st" }],
    });
  }

  function findTestToken(
    decoded: Array<[number, number, number, number, number]>,
    source: string,
    text: string,
    expectedType: number,
  ): [number, number, number, number, number] | undefined {
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let searchFrom = 0;
      while (true) {
        const idx = lines[i].indexOf(text, searchFrom);
        if (idx < 0) break;
        // Skip matches inside string literals (surrounded by quotes)
        const before = lines[i].substring(0, idx);
        const quoteCount = (before.match(/'/g) || []).length;
        if (quoteCount % 2 === 1) {
          searchFrom = idx + 1;
          continue;
        }
        const match = decoded.find(
          (t) => t[0] === i && t[1] === idx && t[3] === expectedType,
        );
        if (match) return match;
        searchFrom = idx + 1;
      }
    }
    return undefined;
  }

  it("emits type tokens for enum type names", () => {
    const analysis = getTestAnalysis();
    const data = getTestFileSemanticTokens(analysis, TEST_SOURCE);
    const decoded = decodeTokens(data);
    // TrafficState should be classified as enum type
    const token = findTestToken(decoded, TEST_SOURCE, "TrafficState", TYPE_IDX.enum);
    expect(token).toBeDefined();
  });

  it("emits class tokens for function block names", () => {
    const analysis = getTestAnalysis();
    // Test source referencing the FB
    const testWithFB = `TEST 'fb test'
  VAR pl : PedestrianLight; END_VAR
  ASSERT_TRUE(TRUE);
END_TEST
`;
    const data = getTestFileSemanticTokens(analysis, testWithFB);
    const decoded = decodeTokens(data);
    const lines = testWithFB.split("\n");
    const fbLine = lines.findIndex((l) => l.includes("PedestrianLight"));
    const fbCol = lines[fbLine].indexOf("PedestrianLight");
    const token = decoded.find(
      (t) => t[0] === fbLine && t[1] === fbCol && t[3] === TYPE_IDX.class,
    );
    expect(token).toBeDefined();
  });

  it("emits enumMember tokens for enum values", () => {
    const analysis = getTestAnalysis();
    const data = getTestFileSemanticTokens(analysis, TEST_SOURCE);
    const decoded = decodeTokens(data);
    // RED after the dot in TrafficState.RED
    const lines = TEST_SOURCE.split("\n");
    const redLine = lines.findIndex((l) => l.includes(".RED"));
    const redCol = lines[redLine].indexOf("RED", lines[redLine].indexOf(".RED"));
    const token = decoded.find(
      (t) => t[0] === redLine && t[1] === redCol && t[3] === TYPE_IDX.enumMember,
    );
    expect(token).toBeDefined();
  });

  it("emits variable tokens for locally declared vars", () => {
    const analysis = getTestAnalysis();
    const data = getTestFileSemanticTokens(analysis, TEST_SOURCE);
    const decoded = decodeTokens(data);
    // s1 in the assignment line
    const lines = TEST_SOURCE.split("\n");
    const assignLine = lines.findIndex((l) => l.includes("s1 :="));
    const s1Col = lines[assignLine].indexOf("s1");
    const token = decoded.find(
      (t) => t[0] === assignLine && t[1] === s1Col && t[3] === TYPE_IDX.variable,
    );
    expect(token).toBeDefined();
  });

  it("does not emit tokens for test framework keywords", () => {
    const analysis = getTestAnalysis();
    const data = getTestFileSemanticTokens(analysis, TEST_SOURCE);
    const decoded = decodeTokens(data);
    // TEST and ASSERT_NEQ should not have semantic tokens
    const lines = TEST_SOURCE.split("\n");
    const testLine = lines.findIndex((l) => l.startsWith("TEST"));
    const testToken = decoded.find((t) => t[0] === testLine && t[1] === 0);
    expect(testToken).toBeUndefined();
  });
});
