// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * IEC 61131-3 / CODESYS conformance end to end: one program and one ST test file, built once with g++ and run,
 * with one assertion group per conformance case.
 */
import { describe, it, expect } from "vitest";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import { hasGpp, runE2ETestPipeline } from "./test-helpers.js";

const LIBRARY = `FUNCTION_BLOCK Tool
  METHOD Swap : INT
    VAR_IN_OUT Acc : INT; END_VAR
    VAR_INPUT Step : INT; END_VAR
    Acc := Acc * 10 + Step;
    Swap := Acc;
  END_METHOD
END_FUNCTION_BLOCK`;

const SOURCE = `PROGRAM Conformance
  VAR
    i0 : INT := 5; g : BOOL := TRUE; k : INT := 1;
    limitNamed, selNamed, muxNamed : INT;
    t : Tool;
    accNamed : INT := 1; stepNamed : INT := 2; swapNamed : INT;
    accPositional : INT := 3; stepPositional : INT := 4; swapPositional : INT;
  END_VAR
  limitNamed := LIMIT(MX := 10, IN := i0, MN := 0);
  selNamed := SEL(IN1 := 20, G := g, IN0 := 10);
  muxNamed := MUX(IN0 := 10, IN1 := 20, K := k);
  swapNamed := t.Swap(Acc := accNamed, Step := stepNamed);
  swapPositional := t.Swap(accPositional, stepPositional);
END_PROGRAM`;

const TESTS = `TEST 'named arguments on standard functions bind by name'
  VAR uut : Conformance; END_VAR
  uut();
  ASSERT_EQ(uut.limitNamed, 5);
  ASSERT_EQ(uut.selNamed, 20);
  ASSERT_EQ(uut.muxNamed, 20);
END_TEST

TEST 'library method arguments bind in declaration order'
  VAR uut : Conformance; END_VAR
  uut();
  ASSERT_EQ(uut.swapNamed, 12);
  ASSERT_EQ(uut.accNamed, 12);
  ASSERT_EQ(uut.stepNamed, 2);
  ASSERT_EQ(uut.swapPositional, 34);
  ASSERT_EQ(uut.accPositional, 34);
END_TEST
`;

describe.skipIf(!hasGpp)("conformance end to end", () => {
  it("runs every conformance case in one g++ build", () => {
    const lib = compileStlib([{ fileName: "liba.st", source: LIBRARY }], {
      name: "liba",
      version: "1.0.0",
      namespace: "liba",
    });
    expect(lib.errors).toEqual([]);
    const archive = loadStlibFromString(JSON.stringify(lib.archive), "liba");
    const { stdout, exitCode } = runE2ETestPipeline({
      sourceST: SOURCE,
      testST: TESTS,
      testFileName: "test_conformance.st",
      tempDirPrefix: "strucpp-conformance-",
      compileOptions: { libraries: [archive] },
    });
    expect(stdout).not.toContain("[FAIL]");
    expect(stdout).toContain("2 tests, 2 passed, 0 failed");
    expect(exitCode).toBe(0);
  }, 60000);
});
