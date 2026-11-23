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
    src : STRING := 'abcde'; part : STRING := 'XY'; p0 : INT := 0; p2 : INT := 2; p5 : INT := 5;
    ins0, ins2, ins5 : STRING;
    mn : INT := 3; mx : INT := 1; lo : INT := 0; hi : INT := 5; limLo, limHi : INT;
    sa : STRING := 'abc'; se : STRING := ''; sab : STRING := 'ab'; sabd : STRING := 'abd'; sabe : STRING := 'abe';
    lenLit : INT; catLit : STRING; ltLit, gtLit, le, ge : BOOL;
    a : INT := 3; b : INT := 5; c : INT := 2; b7 : INT := 7; muxExpr, maxExpr, minExpr : INT;
    strMin, strMax, strLim : STRING;
  END_VAR
  limitNamed := LIMIT(MX := 10, IN := i0, MN := 0);
  selNamed := SEL(IN1 := 20, G := g, IN0 := 10);
  muxNamed := MUX(IN0 := 10, IN1 := 20, K := k);
  swapNamed := t.Swap(Acc := accNamed, Step := stepNamed);
  swapPositional := t.Swap(accPositional, stepPositional);
  ins0 := INSERT(src, part, p0);
  ins2 := INSERT(src, part, p2);
  ins5 := INSERT(src, part, p5);
  limLo := LIMIT(mn, lo, mx);
  limHi := LIMIT(mn, hi, mx);
  lenLit := LEN('hello');
  catLit := CONCAT('ab', 'cd');
  ltLit := se < 'a';
  gtLit := 'b' > sa;
  le := sa <= sab;
  ge := sa >= sab;
  muxExpr := MUX(k, a + b, a * 2, MAX(a, b));
  maxExpr := MAX(a * 2, b7, c);
  minExpr := MIN(a, a - 10, c);
  strMin := MIN(sa, sabd);
  strMax := MAX(sa, sabd);
  strLim := LIMIT(sa, sabe, sabd);
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

TEST 'standard functions and string operators give the CODESYS results'
  VAR uut : Conformance; e0 : STRING := 'XYabcde'; e2 : STRING := 'abXYcde'; e5 : STRING := 'abcdeXY';
    eCat : STRING := 'abcd'; eAbc : STRING := 'abc'; eAbd : STRING := 'abd'; END_VAR
  uut();
  ASSERT_TRUE(uut.ins0 = e0);
  ASSERT_TRUE(uut.ins2 = e2);
  ASSERT_TRUE(uut.ins5 = e5);
  ASSERT_EQ(uut.limLo, 1);
  ASSERT_EQ(uut.limHi, 1);
  ASSERT_EQ(uut.lenLit, 5);
  ASSERT_TRUE(uut.catLit = eCat);
  ASSERT_TRUE(uut.ltLit);
  ASSERT_TRUE(uut.gtLit);
  ASSERT_FALSE(uut.le);
  ASSERT_TRUE(uut.ge);
  ASSERT_EQ(uut.muxExpr, 6);
  ASSERT_EQ(uut.maxExpr, 7);
  ASSERT_EQ(uut.minExpr, -7);
  ASSERT_TRUE(uut.strMin = eAbc);
  ASSERT_TRUE(uut.strMax = eAbd);
  ASSERT_TRUE(uut.strLim = eAbd);
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
    expect(stdout).toContain("3 tests, 3 passed, 0 failed");
    expect(exitCode).toBe(0);
  }, 60000);
});
