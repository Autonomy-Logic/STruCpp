/**
 * A string literal passed to a string function.
 *
 * C++ sees an ST literal as `const char[N]` (`char16_t[N]` for WSTRING), and
 * the runtime's string functions are templates over the string's size, which
 * a literal does not deduce. `MID('ABCDEFG', 3, 2)` therefore found no
 * function at all, nor did two literals, a literal first, strings of
 * different sizes mixed, or any WSTRING through the standard names. Every
 * call below is run and its value checked.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const SOURCE = `
TYPE Tag : STRUCT
  name : STRING := 'pump';
  code : STRING(10) := 'P1';
END_STRUCT; END_TYPE

FUNCTION Greet : STRING
  VAR_INPUT who : STRING; END_VAR
  Greet := CONCAT('hi ', who);
END_FUNCTION

PROGRAM Main
VAR
  s : STRING := 'ABCDEFG';
  s10 : STRING(10) := 'xyz';
  t : Tag;
  ws : WSTRING := "wide";
  mid1, mid2, left1, right1, ins1, ins2, ins3, del1, rep1, rep2 : STRING;
  cat1, cat2, cat3, cat4, max1, min1, lim1, greet1, greet2 : STRING;
  len1, len2, find1, find2, find3, wlen, wfind : INT;
  eq1, eq2, gt1, lt1, ne1, eq3 : BOOL;
  wmid, wcat, wleft : WSTRING;
END_VAR
  mid1 := MID('ABCDEFG', 3, 2);
  mid2 := MID(P := 2, L := 3, IN := 'ABCDEFG');
  left1 := LEFT('ABCDEFG', 2);
  right1 := RIGHT('ABCDEFG', 2);
  ins1 := INSERT('AB', 'xy', 1);
  ins2 := INSERT('xy', s, 2);
  ins3 := INSERT(s10, '-', 1);
  del1 := DELETE('ABCDEF', 2, 1);
  rep1 := REPLACE('ABC', 'zz', 1, 2);
  rep2 := REPLACE(s10, s, 1, 1);
  cat1 := CONCAT('a', 'b');
  cat2 := CONCAT('a', s10, 'c');
  cat3 := CONCAT(s, '-', t.name, '/', t.code);
  cat4 := CONCAT(IN2 := 'tail', IN1 := 'head');
  len1 := LEN('ABC');
  len2 := LEN(t.code);
  find1 := FIND('ABCDE', 'CD');
  find2 := FIND(s, 'EF');
  find3 := FIND(IN2 := 'C', IN1 := s);
  eq1 := EQ('pump', t.name);
  eq2 := EQ(s10, 'nope');
  gt1 := GT('b', 'a');
  lt1 := LT(s10, s);
  ne1 := NE('a', 'b');
  eq3 := EQ('x', 'x', 'x');
  max1 := MAX('apple', s10, 'pear');
  min1 := MIN('apple', s10, 'pear');
  lim1 := LIMIT('b', 'zebra', 'y');
  greet1 := Greet('bob');
  greet2 := Greet(who := 'amy');
  wlen := LEN("abc");
  wmid := MID("abcdef", 3, 2);
  wcat := CONCAT(ws, "-", "x");
  wleft := LEFT(ws, 2);
  wfind := FIND(ws, "de");
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

const CHECKS = `
  check_s("mid1", p.MID1, "BCD");
  check_s("mid2", p.MID2, "BCD");
  check_s("left1", p.LEFT1, "AB");
  check_s("right1", p.RIGHT1, "FG");
  check_s("ins1", p.INS1, "AxyB");
  check_s("ins2", p.INS2, "xyABCDEFG");
  check_s("ins3", p.INS3, "x-yz");
  check_s("del1", p.DEL1, "CDEF");
  check_s("rep1", p.REP1, "AzzC");
  check_s("rep2", p.REP2, "ABCDEFGyz");
  check_s("cat1", p.CAT1, "ab");
  check_s("cat2", p.CAT2, "axyzc");
  check_s("cat3", p.CAT3, "ABCDEFG-pump/P1");
  check_s("cat4", p.CAT4, "headtail");
  check_s("max1", p.MAX1, "xyz");
  check_s("min1", p.MIN1, "apple");
  check_s("lim1", p.LIM1, "y");
  check_s("greet1", p.GREET1, "hi bob");
  check_s("greet2", p.GREET2, "hi amy");
  check("len1", p.LEN1, 3);
  check("len2", p.LEN2, 2);
  check("find1", p.FIND1, 3);
  check("find2", p.FIND2, 5);
  check("find3", p.FIND3, 3);
  check("eq1", p.EQ1, 1);
  check("eq2", p.EQ2, 0);
  check("gt1", p.GT1, 1);
  check("lt1", p.LT1, 0);
  check("ne1", p.NE1, 1);
  check("eq3", p.EQ3, 1);
  check("wlen", p.WLEN, 3);
  check("wmid_len", strucpp::WLEN(p.WMID.get()), 3);
  check("wmid_0", p.WMID.get().c_str()[0], 'b');
  check("wcat_len", strucpp::WLEN(p.WCAT.get()), 6);
  check("wleft_len", strucpp::WLEN(p.WLEFT.get()), 2);
  check("wfind", p.WFIND, 3);
`;

describeIfGpp("string literals passed to string functions", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-str-lit-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("compiles and computes every call", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(tempDir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(tempDir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
#include <string>
strucpp::Configuration_CONFIG0 g_config;
static int fails = 0;
static void check(const char* what, double got, double want) {
  if (got != want) { printf("FAIL %s: got %g want %g\\n", what, got, want); ++fails; }
}
template <typename S>
static void check_s(const char* what, const S& got, const char* want) {
  std::string g = got.get().c_str();
  if (g != want) { printf("FAIL %s: got '%s' want '%s'\\n", what, g.c_str(), want); ++fails; }
}
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
${CHECKS}
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(tempDir, "strings");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${tempDir}" -o "${bin}" ` +
        `"${path.join(tempDir, "main.cpp")}" "${path.join(tempDir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    let out = "";
    try {
      out = execSync(`"${bin}"`, { encoding: "utf-8" });
    } catch (e) {
      out = (e as { stdout?: string }).stdout ?? String(e);
    }
    expect(out.trim()).toBe("ALL_OK");
  });
});
