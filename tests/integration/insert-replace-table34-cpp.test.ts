/**
 * INSERT and REPLACE keep the whole result — IEC 61131-3 Table 34, features 6
 * and 8: "A:= INSERT(IN1:='ABC', IN2:='XY', P=2); is equivalent to A:= 'ABXYC'"
 * and "A:= REPLACE(IN1:='ABCDE', IN2:='X', L:=2, P:=3); is equivalent to
 * A:= 'ABXE'". Only the target's declared length truncates (6.6.1.2.2,
 * "Implementer specific": STruC++ keeps the leading characters).
 *
 * The result used to hold only IN1's declared length, and a WSTRING, or a
 * STRING of another size, had IN2 cut to IN1's length first. The rows marked
 * CHANGED gave the value in the comment before; every other row is pinned at
 * the value it already had.
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
TYPE Rec : STRUCT tag : STRING(8); END_STRUCT; END_TYPE

PROGRAM Main
VAR
  a5 : STRING(5); long5 : STRING(10); long10 : STRING(10); rec : Rec;
  ins1, ins2, ins3, ins4, ins5, insLit, rep1, rep2, rep3, rep4, rep5 : STRING(30);
  d4 : STRING(4);
  w5s : WSTRING(5); wl : WSTRING(10); wins, wrep : WSTRING(30);
  n1, nw1, nw2 : INT;
END_VAR
  a5 := 'AB'; long5 := 'XYZXY'; long10 := 'XYZXYZXYZX'; rec.tag := 'AB';
  w5s := "AB"; wl := "XYZXY";
  ins1 := INSERT(a5, long5, 1);                (* CHANGED: was 'AXYZB' *)
  ins2 := INSERT('ABC', 'XY', 2);              (* Table 34 example *)
  ins3 := INSERT(a5, 'XYZ', 2);                (* fits IN1's length: unchanged *)
  ins4 := INSERT(a5, 'XYZW', 2);               (* CHANGED: was 'ABXYZ' *)
  ins5 := INSERT(rec.tag, long10, 1);          (* CHANGED: was 'AXYZXYZB' *)
  insLit := INSERT(IN1 := 'AB', IN2 := long10, P := 1); (* literal IN1: unchanged *)
  rep1 := REPLACE('ABCDE', 'X', 2, 3);         (* Table 34 example *)
  rep2 := REPLACE(a5, long5, 1, 1);            (* CHANGED: was 'XYZXB' *)
  rep3 := REPLACE(a5, 'Q', 1, 2);              (* unchanged *)
  rep4 := REPLACE(rec.tag, long10, 1, 1);      (* CHANGED: was 'XYZXYZXB' *)
  rep5 := REPLACE(a5, 'XYZW', 0, 3);           (* P past the end: unchanged, IN1 *)
  d4 := INSERT(a5, long5, 1);                  (* the target truncates: unchanged *)
  n1 := LEN(INSERT(a5, long5, 1));             (* CHANGED: was 5 *)
  wins := INSERT(w5s, wl, 1); nw1 := LEN(wins); (* CHANGED: was 5 *)
  wrep := REPLACE(w5s, wl, 1, 1); nw2 := LEN(wrep); (* CHANGED: was 5 *)
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

const CHECKS = `
  check_s("ins1", p.INS1, "AXYZXYB");
  check_s("ins2", p.INS2, "ABXYC");
  check_s("ins3", p.INS3, "ABXYZ");
  check_s("ins4", p.INS4, "ABXYZW");
  check_s("ins5", p.INS5, "AXYZXYZXYZXB");
  check_s("insLit", p.INSLIT, "AXYZXYZXYZXB");
  check_s("rep1", p.REP1, "ABXE");
  check_s("rep2", p.REP2, "XYZXYB");
  check_s("rep3", p.REP3, "AQ");
  check_s("rep4", p.REP4, "XYZXYZXYZXB");
  check_s("rep5", p.REP5, "AB");
  check_s("d4", p.D4, "AXYZ");
  check("n1", p.N1, 7);
  check("nw1", p.NW1, 7);
  check("nw2", p.NW2, 6);
`;

describeIfGpp(
  "INSERT and REPLACE keep the whole result (IEC 61131-3 Table 34)",
  () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-insrep-"));
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("inserts / substitutes IN2 whole; only the target's declared length truncates", () => {
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
      const bin = path.join(tempDir, "insrep");
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
  },
);
