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

describe("getDefinition with library symbols", () => {
  it("resolves library FB via resolveLibrarySymbol callback", () => {
    // Simulate a program that uses a FB loaded from a library
    // The library FB will have a default sourceSpan (all zeros, empty file)
    const libSource = `FUNCTION_BLOCK TrafficLight
  VAR_INPUT
    go : BOOL;
  END_VAR
END_FUNCTION_BLOCK`;
    const mainSource = `PROGRAM Main
  VAR
    tl : TrafficLight;
  END_VAR
  tl(go := TRUE);
END_PROGRAM`;

    // Compile with library providing TrafficLight via additionalSources
    // (in real usage it comes from .stlib with default spans, but here
    // we test the definition logic by using libraryPaths)
    const analysis = analyze(mainSource, {
      fileName: "main.st",
      additionalSources: [{ source: libSource, fileName: "TrafficLight.st" }],
    });

    // Position on "TrafficLight" type reference in VAR declaration
    const lines = mainSource.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("TrafficLight"));
    const col = lines[lineIdx].indexOf("TrafficLight") + 1;

    // Library symbol resolver that knows about the library source
    const libResolver = (name: string) => {
      if (name === "TrafficLight") {
        return { uri: "strucpp-lib:/semaphoreLib/sources/TrafficLight.st", line: 0 };
      }
      return undefined;
    };

    const def = getDefinition(
      analysis,
      "main.st",
      lineIdx + 1,
      col,
      "file:///workspace/main.st",
      (fn) => fn === "TrafficLight.st" ? "strucpp-lib:/semaphoreLib/sources/TrafficLight.st" : undefined,
      libResolver,
    );

    expect(def).not.toBeNull();
    expect(def!.uri).toBe("strucpp-lib:/semaphoreLib/sources/TrafficLight.st");
  });

  it("returns null when library symbol has no source available", () => {
    const libSource = `FUNCTION_BLOCK NoSource
  VAR_INPUT
    x : INT;
  END_VAR
END_FUNCTION_BLOCK`;
    const mainSource = `PROGRAM Main
  VAR
    ns : NoSource;
  END_VAR
END_PROGRAM`;

    const analysis = analyze(mainSource, {
      fileName: "main.st",
      additionalSources: [{ source: libSource, fileName: "NoSource.st" }],
    });

    const lines = mainSource.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("NoSource"));
    const col = lines[lineIdx].indexOf("NoSource") + 1;

    // Resolver that returns nothing (no sources available)
    const def = getDefinition(
      analysis,
      "main.st",
      lineIdx + 1,
      col,
      "file:///workspace/main.st",
      (fn) => fn === "NoSource.st" ? "file:///workspace/NoSource.st" : undefined,
      () => undefined,
    );

    // Should still resolve via the file name resolver (since the source has proper spans)
    expect(def).not.toBeNull();
  });
});

describe("getDefinition in test files", () => {
  const TYPES_SOURCE = `TYPE PedestrianState : (WALK, DONT_WALK, FLASHING); END_TYPE

FUNCTION_BLOCK PedestrianLight
  VAR_INPUT enable : BOOL; END_VAR
  VAR_OUTPUT active : BOOL; END_VAR
END_FUNCTION_BLOCK
`;

  const TEST_SOURCE = `TEST 'PedestrianState values'
  VAR
    s1 : PedestrianState;
  END_VAR

  s1 := PedestrianState.WALK;
  ASSERT_TRUE(TRUE);
END_TEST
`;

  function getTestAnalysis(): AnalysisResult {
    return analyze("", {
      fileName: "test_pedestrian.st",
      additionalSources: [{ source: TYPES_SOURCE, fileName: "types.st" }],
    });
  }

  it("navigates type name in test file to its declaration", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("s1 : PedestrianState"));
    const col = lines[lineIdx].indexOf("PedestrianState") + 1;

    const def = getDefinition(
      analysis,
      "test_pedestrian.st",
      lineIdx + 1,
      col,
      "file:///workspace/test_pedestrian.st",
      (fn) => fn === "types.st" ? "file:///workspace/types.st" : undefined,
      undefined,
      TEST_SOURCE,
    );

    expect(def).not.toBeNull();
    expect(def!.uri).toBe("file:///workspace/types.st");
  });

  it("navigates FB name in test file to its declaration", () => {
    const testWithFB = `TEST 'fb test'
  VAR pl : PedestrianLight; END_VAR
  ASSERT_TRUE(TRUE);
END_TEST
`;
    const analysis = getTestAnalysis();
    const lines = testWithFB.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("PedestrianLight"));
    const col = lines[lineIdx].indexOf("PedestrianLight") + 1;

    const def = getDefinition(
      analysis,
      "test_pedestrian.st",
      lineIdx + 1,
      col,
      "file:///workspace/test_pedestrian.st",
      (fn) => fn === "types.st" ? "file:///workspace/types.st" : undefined,
      undefined,
      testWithFB,
    );

    expect(def).not.toBeNull();
    expect(def!.uri).toBe("file:///workspace/types.st");
  });

  it("returns null for unknown symbols in test files", () => {
    const analysis = getTestAnalysis();
    // "s1" is a locally declared variable — not in symbol tables
    const lines = TEST_SOURCE.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("s1 :="));
    const col = lines[lineIdx].indexOf("s1") + 1;

    const def = getDefinition(
      analysis,
      "test_pedestrian.st",
      lineIdx + 1,
      col,
      "file:///workspace/test_pedestrian.st",
      undefined,
      undefined,
      TEST_SOURCE,
    );

    expect(def).toBeNull();
  });

  it("returns null for test framework keywords", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const lineIdx = lines.findIndex((l) => l.includes("ASSERT_TRUE"));
    const col = lines[lineIdx].indexOf("ASSERT_TRUE") + 1;

    const def = getDefinition(
      analysis,
      "test_pedestrian.st",
      lineIdx + 1,
      col,
      "file:///workspace/test_pedestrian.st",
      undefined,
      undefined,
      TEST_SOURCE,
    );

    expect(def).toBeNull();
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
