// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { analyze } from "strucpp";
import { getCompletions } from "../../server/src/completion.js";
import { getHover } from "../../server/src/hover.js";

// A minimal test file fixture
const TEST_SOURCE = `SETUP
  VAR
    x : INT;
  END_VAR
END_SETUP

TEST 'counter increments'
  x := x + 1;
  ASSERT_EQ(x, 1);
END_TEST

TEST 'counter resets'
  ASSERT_TRUE(x = 0);
  MOCK_VERIFY_CALLED(timer);
  ADVANCE_TIME(T#100ms);
END_TEST
`;

// A normal (non-test) source for comparison
const NORMAL_SOURCE = `PROGRAM Main
  VAR
    counter : INT;
  END_VAR
  counter := counter + 1;
END_PROGRAM
`;

// Workspace source that defines types used by tests
const WORKSPACE_SOURCE = `TYPE Color : (RED, GREEN, BLUE); END_TYPE

TYPE Point :
  STRUCT
    x : REAL;
    y : REAL;
  END_STRUCT;
END_TYPE
`;

// Test file that uses workspace types
const TEST_WITH_TYPES = `TEST 'color test'
  VAR c : Color; END_VAR
  c := Color.RED;
END_TEST
`;

function getTestAnalysis() {
  return analyze(TEST_SOURCE, { fileName: "test_counter.st" });
}

function getNormalAnalysis() {
  return analyze(NORMAL_SOURCE, { fileName: "main.st" });
}

/** Simulate how the extension analyzes test files: empty primary + workspace as additional. */
function getTestWithWorkspaceAnalysis() {
  return analyze("", {
    fileName: "test_color.st",
    additionalSources: [{ source: WORKSPACE_SOURCE, fileName: "types.st" }],
  });
}

describe("test-aware completions", () => {
  describe("top-level in test file", () => {
    it("returns TEST/SETUP/TEARDOWN snippets instead of POU keywords", () => {
      const analysis = getTestAnalysis();
      // Position after END_TEST at end of file
      const lines = TEST_SOURCE.split("\n");
      const items = getCompletions(
        analysis,
        "test_counter.st",
        lines.length + 1,
        1,
        TEST_SOURCE,
      );
      const labels = items.map((i) => i.label);
      expect(labels).toContain("TEST");
      expect(labels).toContain("SETUP");
      expect(labels).toContain("TEARDOWN");
      // Should NOT contain normal POU keywords
      expect(labels).not.toContain("PROGRAM");
      expect(labels).not.toContain("FUNCTION_BLOCK");
      expect(labels).not.toContain("FUNCTION");
    });
  });

  describe("top-level in normal file", () => {
    it("does not include TEST snippets", () => {
      const analysis = getNormalAnalysis();
      const lines = NORMAL_SOURCE.split("\n");
      const items = getCompletions(
        analysis,
        "main.st",
        lines.length + 1,
        1,
        NORMAL_SOURCE,
      );
      const labels = items.map((i) => i.label);
      expect(labels).toContain("PROGRAM");
      expect(labels).not.toContain("SETUP");
      expect(labels).not.toContain("TEARDOWN");
    });
  });

  describe("body completions in test file", () => {
    it("includes ASSERT_* completions inside TEST block", () => {
      const analysis = getTestAnalysis();
      // Position inside the first TEST block body
      const lines = TEST_SOURCE.split("\n");
      const testBodyLine = lines.findIndex((l) => l.includes("x := x + 1"));
      const items = getCompletions(
        analysis,
        "test_counter.st",
        testBodyLine + 1,
        3,
        TEST_SOURCE,
      );
      const labels = items.map((i) => i.label);
      expect(labels).toContain("ASSERT_EQ");
      expect(labels).toContain("ASSERT_NEQ");
      expect(labels).toContain("ASSERT_TRUE");
      expect(labels).toContain("ASSERT_FALSE");
      expect(labels).toContain("ASSERT_GT");
      expect(labels).toContain("ASSERT_LT");
      expect(labels).toContain("ASSERT_GE");
      expect(labels).toContain("ASSERT_LE");
      expect(labels).toContain("ASSERT_NEAR");
    });

    it("includes MOCK_* completions inside TEST block", () => {
      const analysis = getTestAnalysis();
      const lines = TEST_SOURCE.split("\n");
      const testBodyLine = lines.findIndex((l) => l.includes("x := x + 1"));
      const items = getCompletions(
        analysis,
        "test_counter.st",
        testBodyLine + 1,
        3,
        TEST_SOURCE,
      );
      const labels = items.map((i) => i.label);
      expect(labels).toContain("MOCK");
      expect(labels).toContain("MOCK_FUNCTION");
      expect(labels).toContain("MOCK_VERIFY_CALLED");
      expect(labels).toContain("MOCK_VERIFY_CALL_COUNT");
    });

    it("includes ADVANCE_TIME completion inside TEST block", () => {
      const analysis = getTestAnalysis();
      const lines = TEST_SOURCE.split("\n");
      const testBodyLine = lines.findIndex((l) => l.includes("x := x + 1"));
      const items = getCompletions(
        analysis,
        "test_counter.st",
        testBodyLine + 1,
        3,
        TEST_SOURCE,
      );
      const labels = items.map((i) => i.label);
      expect(labels).toContain("ADVANCE_TIME");
    });
  });

  describe("body completions in normal file", () => {
    it("does not include ASSERT_* completions", () => {
      const analysis = getNormalAnalysis();
      const lines = NORMAL_SOURCE.split("\n");
      const bodyLine = lines.findIndex((l) => l.includes("counter := counter"));
      const items = getCompletions(
        analysis,
        "main.st",
        bodyLine + 1,
        3,
        NORMAL_SOURCE,
      );
      const labels = items.map((i) => i.label);
      expect(labels).not.toContain("ASSERT_EQ");
      expect(labels).not.toContain("MOCK");
      expect(labels).not.toContain("ADVANCE_TIME");
    });
  });
});

describe("test-aware hover", () => {
  it("shows hover for ASSERT_EQ in test file", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const assertLine = lines.findIndex((l) => l.includes("ASSERT_EQ"));
    const col = lines[assertLine].indexOf("ASSERT_EQ") + 1;
    const hover = getHover(
      analysis,
      "test_counter.st",
      assertLine + 1,
      col,
      undefined,
      TEST_SOURCE,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("ASSERT_EQ");
    expect(value).toContain("actual");
    expect(value).toContain("expected");
  });

  it("shows hover for ASSERT_TRUE in test file", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const assertLine = lines.findIndex((l) => l.includes("ASSERT_TRUE"));
    const col = lines[assertLine].indexOf("ASSERT_TRUE") + 1;
    const hover = getHover(
      analysis,
      "test_counter.st",
      assertLine + 1,
      col,
      undefined,
      TEST_SOURCE,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("ASSERT_TRUE");
    expect(value).toContain("condition");
  });

  it("shows hover for MOCK_VERIFY_CALLED in test file", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const mockLine = lines.findIndex((l) => l.includes("MOCK_VERIFY_CALLED"));
    const col = lines[mockLine].indexOf("MOCK_VERIFY_CALLED") + 1;
    const hover = getHover(
      analysis,
      "test_counter.st",
      mockLine + 1,
      col,
      undefined,
      TEST_SOURCE,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("MOCK_VERIFY_CALLED");
  });

  it("shows hover for ADVANCE_TIME in test file", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const advLine = lines.findIndex((l) => l.includes("ADVANCE_TIME"));
    const col = lines[advLine].indexOf("ADVANCE_TIME") + 1;
    const hover = getHover(
      analysis,
      "test_counter.st",
      advLine + 1,
      col,
      undefined,
      TEST_SOURCE,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("ADVANCE_TIME");
    expect(value).toContain("duration");
  });

  it("shows hover for TEST keyword", () => {
    const analysis = getTestAnalysis();
    const lines = TEST_SOURCE.split("\n");
    const testLine = lines.findIndex((l) => l.startsWith("TEST "));
    const hover = getHover(
      analysis,
      "test_counter.st",
      testLine + 1,
      1,
      undefined,
      TEST_SOURCE,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value).toContain("TEST");
    expect(value).toContain("test case");
  });

  it("does not show test hover in normal file", () => {
    const analysis = getNormalAnalysis();
    // Hover on a keyword that happens to match but is not in a test file
    const hover = getHover(
      analysis,
      "main.st",
      1,
      1,
      undefined,
      NORMAL_SOURCE,
    );
    // Should be null (PROGRAM is not in test keyword hover map)
    // or a normal hover — either way, not a test framework hover
    if (hover) {
      const value = (hover.contents as { value: string }).value;
      expect(value).not.toContain("ASSERT");
    }
  });

  it("shows hover for workspace type in test file", () => {
    const analysis = getTestWithWorkspaceAnalysis();
    // Hover on "Color" at line 2 of TEST_WITH_TYPES ("VAR c : Color;")
    const lines = TEST_WITH_TYPES.split("\n");
    const colorLine = lines.findIndex((l) => l.includes("Color"));
    const col = lines[colorLine].indexOf("Color") + 1;
    const hover = getHover(
      analysis,
      "test_color.st",
      colorLine + 1,
      col,
      undefined,
      TEST_WITH_TYPES,
    );
    expect(hover).not.toBeNull();
    const value = (hover!.contents as { value: string }).value;
    expect(value.toUpperCase()).toContain("COLOR");
    expect(value.toUpperCase()).toContain("RED");
  });
});

describe("body completions include type names", () => {
  it("includes enum type names in test file body completions", () => {
    const analysis = getTestWithWorkspaceAnalysis();
    const lines = TEST_WITH_TYPES.split("\n");
    const bodyLine = lines.findIndex((l) => l.includes("c := Color.RED"));
    const items = getCompletions(
      analysis,
      "test_color.st",
      bodyLine + 1,
      3,
      TEST_WITH_TYPES,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("COLOR");
  });

  it("includes struct type names in normal file body completions", () => {
    const source = `TYPE Point :
  STRUCT
    x : REAL;
    y : REAL;
  END_STRUCT;
END_TYPE

PROGRAM Main
  VAR p : Point; END_VAR
  p.x := 1.0;
END_PROGRAM
`;
    const analysis = analyze(source, { fileName: "main.st" });
    const lines = source.split("\n");
    const bodyLine = lines.findIndex((l) => l.includes("p.x := 1.0"));
    const items = getCompletions(
      analysis,
      "main.st",
      bodyLine + 1,
      3,
      source,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("POINT");
  });
});

describe("enum dot-access completions", () => {
  it("provides enum members on EnumType. dot-access", () => {
    // Normal file with an enum type — test dot-access on type name
    const enumSource = `TYPE Color : (RED, GREEN, BLUE); END_TYPE

PROGRAM Main
  VAR c : Color; END_VAR
  c := Color.RED;
END_PROGRAM
`;
    const analysis = analyze(enumSource, { fileName: "main.st" });
    const lines = enumSource.split("\n");
    const assignLine = lines.findIndex((l) => l.includes("Color.RED"));
    // Position cursor right after "Color."
    const col = lines[assignLine].indexOf("Color.") + "Color.".length + 1;
    const items = getCompletions(
      analysis,
      "main.st",
      assignLine + 1,
      col,
      enumSource,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("RED");
    expect(labels).toContain("GREEN");
    expect(labels).toContain("BLUE");
  });

  it("provides enum members in test file dot-access", () => {
    const analysis = getTestWithWorkspaceAnalysis();
    const lines = TEST_WITH_TYPES.split("\n");
    const assignLine = lines.findIndex((l) => l.includes("Color.RED"));
    const col = lines[assignLine].indexOf("Color.") + "Color.".length + 1;
    const items = getCompletions(
      analysis,
      "test_color.st",
      assignLine + 1,
      col,
      TEST_WITH_TYPES,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("RED");
    expect(labels).toContain("GREEN");
    expect(labels).toContain("BLUE");
  });
});

describe("test file local variable completions", () => {
  const STRUCT_WORKSPACE = `TYPE PhaseTiming :
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

  const TEST_WITH_VARS = `SETUP
  VAR
    timing : PhaseTiming;
    light : PedestrianLight;
    count : INT;
  END_VAR
END_SETUP

TEST 'timing test'
  timing.greenDuration := T#30s;
  count := count + 1;
  ASSERT_TRUE(TRUE);
END_TEST
`;

  function getStructAnalysis() {
    return analyze("", {
      fileName: "test_pedestrian.st",
      additionalSources: [{ source: STRUCT_WORKSPACE, fileName: "types.st" }],
    });
  }

  it("suggests locally declared variables in test body", () => {
    const analysis = getStructAnalysis();
    const lines = TEST_WITH_VARS.split("\n");
    const bodyLine = lines.findIndex((l) => l.includes("count := count + 1"));
    const items = getCompletions(
      analysis,
      "test_pedestrian.st",
      bodyLine + 1,
      3,
      TEST_WITH_VARS,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("TIMING");
    expect(labels).toContain("LIGHT");
    expect(labels).toContain("COUNT");
  });

  it("suggests struct fields on local variable dot-access", () => {
    const analysis = getStructAnalysis();
    const lines = TEST_WITH_VARS.split("\n");
    const dotLine = lines.findIndex((l) => l.includes("timing.greenDuration"));
    const col = lines[dotLine].indexOf("timing.") + "timing.".length + 1;
    const items = getCompletions(
      analysis,
      "test_pedestrian.st",
      dotLine + 1,
      col,
      TEST_WITH_VARS,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("GREENDURATION");
    expect(labels).toContain("YELLOWDURATION");
    expect(labels).toContain("REDDURATION");
  });

  it("suggests FB members on local FB instance dot-access", () => {
    const analysis = getStructAnalysis();
    const testWithFBDot = `SETUP
  VAR
    light : PedestrianLight;
  END_VAR
END_SETUP

TEST 'fb member access'
  light.enable := TRUE;
END_TEST
`;
    const lines = testWithFBDot.split("\n");
    const dotLine = lines.findIndex((l) => l.includes("light.enable"));
    const col = lines[dotLine].indexOf("light.") + "light.".length + 1;
    const items = getCompletions(
      analysis,
      "test_pedestrian.st",
      dotLine + 1,
      col,
      testWithFBDot,
    );
    const labels = items.map((i) => i.label.toUpperCase());
    expect(labels).toContain("ENABLE");
    expect(labels).toContain("ACTIVE");
  });
});
