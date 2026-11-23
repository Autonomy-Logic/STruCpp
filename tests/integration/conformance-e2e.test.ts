// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * IEC 61131-3 / CODESYS conformance end to end: one program and one ST test file, built once with g++ and run,
 * with one assertion group per conformance case.
 */
import { describe, it, expect } from "vitest";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import { compile } from "../../src/index.js";
import { tokenize } from "../../src/frontend/lexer.js";
import { hasGpp, runE2ETestPipeline } from "./test-helpers.js";

const LIBRARY = `FUNCTION_BLOCK Tool
  METHOD Swap : INT
    VAR_IN_OUT Acc : INT; END_VAR
    VAR_INPUT Step : INT; END_VAR
    Acc := Acc * 10 + Step;
    Swap := Acc;
  END_METHOD
END_FUNCTION_BLOCK`;

const SOURCE = `TYPE SMALL : INT(5..10); END_TYPE
TYPE S5 : STRING[5]; END_TYPE
TYPE S6 : STRING(6); END_TYPE

FUNCTION_BLOCK Tmp
  VAR_INPUT x : INT; END_VAR
  VAR_OUTPUT y, z : INT; END_VAR
  VAR_TEMP t : INT; u : INT := 10; END_VAR
  t := t + x;
  u := u + x;
  y := t;
  z := u;
END_FUNCTION_BLOCK

FUNCTION_BLOCK Counted
  VAR_INPUT EN : BOOL; END_VAR
  VAR_OUTPUT ENO : BOOL; n : INT; END_VAR
  VAR s5 : S5; s6 : S6; END_VAR
  n := n + 1;
  ENO := TRUE;
  s5 := 'abcdefgh';
  s6 := 'abcdefgh';
END_FUNCTION_BLOCK

PROGRAM Conformance
  VAR_INPUT
    ia : INT := 3;
    ib : INT := 5;
  END_VAR
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
    tmp : Tmp; y1, y2, y3, z1, z2 : INT;
    sm : SMALL; smallDefault : INT;
    spanTod, spanDt, spanDate : TIME;
    i : INT; oddFor, oddWhile, oddRepeat : INT;
    negInt : INT; negDint : DINT;
    cnt : Counted; eno : BOOL; len5, len6 : INT;
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
  muxExpr := MUX(k, ia + ib, ia * 2, MAX(ia, ib));
  maxExpr := MAX(a * 2, b7, c);
  minExpr := MIN(a, a - 10, c);
  strMin := MIN(sa, sabd);
  strMax := MAX(sa, sabd);
  strLim := LIMIT(sa, sabe, sabd);
  tmp(x := 3); y1 := tmp.y; z1 := tmp.z;
  tmp(x := 4); y2 := tmp.y; z2 := tmp.z;
  tmp(x := 0); y3 := tmp.y;
  smallDefault := sm;
  spanTod := (TOD#12:00:00 + T#90m) - TOD#00:00:00;
  spanDt := DT#2026-01-02-00:00:00 - DT#2026-01-01-00:00:00;
  spanDate := D#2026-01-02 - D#2026-01-01;
  oddFor := 0;
  FOR i := 1 TO 5 DO
    IF i MOD 2 = 0 THEN CONTINUE; END_IF;
    oddFor := oddFor + i;
  END_FOR;
  oddWhile := 0; i := 0;
  WHILE i < 5 DO
    i := i + 1;
    IF i MOD 2 = 0 THEN CONTINUE; END_IF;
    oddWhile := oddWhile + i;
  END_WHILE;
  oddRepeat := 0; i := 0;
  REPEAT
    i := i + 1;
    IF i MOD 2 = 0 THEN CONTINUE; END_IF;
    oddRepeat := oddRepeat + i;
  UNTIL i >= 5 END_REPEAT;
  negInt := INT#-5;
  negDint := DINT#-2147483648;
  cnt(EN := TRUE, ENO => eno);
  len5 := LEN(cnt.s5);
  len6 := LEN(cnt.s6);
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

TEST 'declarations and language give the CODESYS results'
  VAR uut : Conformance; END_VAR
  uut();
  ASSERT_EQ(uut.y1, 3);
  ASSERT_EQ(uut.y2, 4);
  ASSERT_EQ(uut.y3, 0);
  ASSERT_EQ(uut.z1, 13);
  ASSERT_EQ(uut.z2, 14);
  ASSERT_EQ(uut.smallDefault, 5);
  ASSERT_TRUE(uut.spanTod = T#13h30m);
  ASSERT_TRUE(uut.spanDt = T#1d);
  ASSERT_TRUE(uut.spanDate = T#1d);
  ASSERT_EQ(uut.oddFor, 9);
  ASSERT_EQ(uut.oddWhile, 9);
  ASSERT_EQ(uut.oddRepeat, 9);
  ASSERT_EQ(uut.negInt, -5);
  ASSERT_TRUE(uut.negDint = DINT#-2147483648);
  ASSERT_TRUE(uut.eno);
  ASSERT_EQ(uut.cnt.n, 1);
  ASSERT_EQ(uut.len5, 5);
  ASSERT_EQ(uut.len6, 6);
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
    expect(stdout).toContain("4 tests, 4 passed, 0 failed");
    expect(exitCode).toBe(0);
  }, 60000);
});

describe("conformance compile errors", () => {
  it("rejects a signed unsigned literal, TOD - TOD into TOD and CONTINUE outside a loop, with positions", () => {
    const errorAt = (
      body: string,
      vars: string,
    ): { line: number; column: number } | undefined => {
      const r = compile(`PROGRAM P\nVAR ${vars} END_VAR\n${body}\nEND_PROGRAM`);
      expect(r.success).toBe(false);
      const e = r.errors[0];
      return e === undefined ? undefined : { line: e.line, column: e.column };
    };
    expect(errorAt("u := UINT#-1;", "u : UINT;")).toEqual({
      line: 3,
      column: 6,
    });
    expect(errorAt("t := TOD#12:00:00 - TOD#01:00:00;", "t : TOD;")?.line).toBe(
      3,
    );
    expect(errorAt("CONTINUE;", "x : INT;")).toEqual({ line: 3, column: 1 });

    const long = `INT#-${"9".repeat(10000)}`;
    const start = Date.now();
    tokenize(long);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
