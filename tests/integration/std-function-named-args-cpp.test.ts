/**
 * A standard function called with named arguments binds them by name, in
 * whatever order they are written (IEC 61131-3). The arguments used to be
 * passed in source order with the names ignored, so `LIMIT(IN := 5, MN := 0,
 * MX := 10)` ran as LIMIT(MN := 5, IN := 0, MX := 10) and returned 5 for
 * any input — a wrong value with no diagnostic.
 *
 * Every call below is written out of formal order and checked on the running
 * program.
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
PROGRAM Main
VAR
  x : INT := 50;
  lim, lim_en, lim_mixed, r_sel, r_mux, mx, r_sub, add_gap : INT;
  shl_w : WORD;
  shr_w : WORD;
  mid_s, left_s, ins_s, rep_s : STRING;
  letters : STRING := 'ABCDEFG';
  ab : STRING := 'AB';
  abc : STRING := 'ABC';
  abcde : STRING := 'ABCDE';
  xy : STRING := 'xy';
  zz : STRING := 'zz';
  cd : STRING := 'CD';
  find_i : INT;
  r : REAL;
  pick : BOOL := TRUE;
  ok : BOOL;
END_VAR
  lim := LIMIT(IN := x, MX := 40, MN := 10);
  lim_en := LIMIT(EN := TRUE, MX := 40, IN := 5, MN := 10, ENO => ok);
  lim_mixed := LIMIT(10, MX := 40, IN := 25);
  r_sel := SEL(IN1 := 111, IN0 := 222, G := pick);
  r_mux := MUX(IN2 := 3, IN0 := 1, K := 2, IN1 := 2);
  mx := MAX(IN3 := 9, IN1 := 4, IN2 := 7);
  r_sub := SUB(IN2 := 3, IN1 := 10);
  add_gap := ADD(IN3 := 30, IN1 := 1);
  shl_w := SHL(N := 4, IN := WORD#16#0001);
  shr_w := SHR(N := 1, IN := WORD#16#0010);
  mid_s := MID(P := 2, L := 3, IN := letters);
  left_s := LEFT(L := 2, IN := letters);
  ins_s := INSERT(P := 1, IN2 := xy, IN1 := ab);
  rep_s := REPLACE(P := 2, L := 1, IN2 := zz, IN1 := abc);
  find_i := FIND(IN2 := cd, IN1 := abcde);
  r := INT_TO_REAL(IN := x);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describeIfGpp("standard functions with named arguments, out of order", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-std-named-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("binds every argument by its name", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const dir = path.join(tempDir, "named");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
#include <string>
strucpp::Configuration_CONFIG0 g_config;
static int fails = 0;
static void check(const char* what, double got, double want) {
  if (got != want) { printf("FAIL %s: got %g want %g\\n", what, got, want); ++fails; }
}
static void check_s(const char* what, const std::string& got, const char* want) {
  if (got != want) { printf("FAIL %s: got '%s' want '%s'\\n", what, got.c_str(), want); ++fails; }
}
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
  check("lim", (double)p.LIM, 40);
  check("lim_en", (double)p.LIM_EN, 10);
  check("lim_mixed", (double)p.LIM_MIXED, 25);
  check("sel", (double)p.R_SEL, 111);
  check("mux", (double)p.R_MUX, 3);
  check("mx", (double)p.MX, 9);
  check("sub", (double)p.R_SUB, 7);
  check("add_gap", (double)p.ADD_GAP, 31);
  check("shl", (double)p.SHL_W, 16);
  check("shr", (double)p.SHR_W, 8);
  check_s("mid", p.MID_S.get().c_str(), "BCD");
  check_s("left", p.LEFT_S.get().c_str(), "AB");
  check_s("insert", p.INS_S.get().c_str(), "AxyB");
  check_s("replace", p.REP_S.get().c_str(), "AzzC");
  check("find", (double)p.FIND_I, 3);
  check("int_to_real", (double)p.R, 50);
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(dir, "named");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});
