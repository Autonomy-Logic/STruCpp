/**
 * CONCAT keeps the whole joined string — IEC 61131-3 Table 34, feature 5.
 *
 * "A:= CONCAT('AB','CD','E'); is equivalent to A:= 'ABCDE'": the result is every
 * input in order. The standard limits it only by the Implementer specific
 * maximum string length (6.6.2.5.11) and, on assignment, by the target: "If
 * the source string is longer than the target string the result is
 * Implementer specific" (6.6.1.2.2) — STruC++ keeps the leading characters.
 *
 * A CONCAT result used to hold only max(L1, L2) characters, the LONGER input's
 * declared length, whatever it was assigned to: two full STRING(10)s joined
 * into a STRING(30) gave 10 characters. The rows marked CHANGED below gave the
 * shorter result before; every other row is pinned at the value it already had.
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
TYPE Rec : STRUCT
  tag : STRING(8);
  text : STRING(40);
END_STRUCT; END_TYPE

FUNCTION Join : STRING(30)
  VAR_INPUT x, y : STRING(10); END_VAR
  Join := CONCAT(x, y);
END_FUNCTION

PROGRAM Main
VAR
  a, b, c : STRING(10);
  d30, joined, nested, extens, viaFn, aliased : STRING(30);
  d15 : STRING(15);
  s : STRING;
  r : Rec;
  wa, wb : WSTRING(10);
  wd : WSTRING(30);
  table34, withLit, litFirst, max1, min1 : STRING;
  n1, n2, n3, nWide : INT;
END_VAR
  a := '0123456789'; b := 'abcdefghij'; c := 'KLMNOPQRST';
  table34 := CONCAT('AB', 'CD', 'E');          (* Table 34 example *)
  d30 := CONCAT(a, b);                         (* CHANGED: was 10 chars *)
  d15 := CONCAT(a, b);                         (* CHANGED: was 10; the target keeps 15 *)
  nested := CONCAT(CONCAT(a, b), c);           (* CHANGED: was 10 *)
  extens := CONCAT(a, b, c);                   (* CHANGED: was 10 *)
  n1 := LEN(CONCAT(a, b));                     (* CHANGED: was 10 *)
  r.tag := 'P1'; r.text := CONCAT(a, b);       (* CHANGED: was 10 *)
  viaFn := Join(a, b);                         (* CHANGED: was 10 *)
  withLit := CONCAT(a, 'XY');                  (* 12: unchanged *)
  litFirst := CONCAT('XY', a);                 (* 12: unchanged *)
  s := CONCAT(r.tag, ': ', a);                 (* 14: unchanged *)
  aliased := 'abc';
  aliased := CONCAT(aliased, aliased, aliased); (* 9: unchanged *)
  aliased := CONCAT('>', aliased);             (* 10: unchanged *)
  joined := CONCAT(a, '');                     (* 10: unchanged *)
  n2 := LEN(CONCAT('', ''));                   (* 0: unchanged *)
  max1 := MAX(a, b);                           (* one input whole: unchanged *)
  min1 := MIN(a, 'zz');
  n3 := LEN(max1);
  wa := "0123456789"; wb := "abcdefghij";
  wd := CONCAT(wa, wb);                        (* CHANGED: WSTRING too, was 10 *)
  nWide := LEN(wd);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

const CHECKS = `
  check_s("table34", p.TABLE34, "ABCDE");
  check_s("d30", p.D30, "0123456789abcdefghij");
  check_s("d15", p.D15, "0123456789abcde");
  check_s("nested", p.NESTED, "0123456789abcdefghijKLMNOPQRST");
  check_s("extens", p.EXTENS, "0123456789abcdefghijKLMNOPQRST");
  check("n1", p.N1, 20);
  check_s("r.text", p.R.TEXT, "0123456789abcdefghij");
  check_s("viaFn", p.VIAFN, "0123456789abcdefghij");
  check_s("withLit", p.WITHLIT, "0123456789XY");
  check_s("litFirst", p.LITFIRST, "XY0123456789");
  check_s("s", p.S, "P1: 0123456789");
  check_s("aliased", p.ALIASED, ">abcabcabc");
  check_s("joined", p.JOINED, "0123456789");
  check("n2", p.N2, 0);
  check_s("max1", p.MAX1, "abcdefghij");
  check_s("min1", p.MIN1, "0123456789");
  check("n3", p.N3, 10);
  check("nWide", p.NWIDE, 20);
`;

describeIfGpp(
  "CONCAT keeps the whole joined string (IEC 61131-3 Table 34)",
  () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-concat-"));
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("joins every input; only the target's declared length truncates", () => {
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
      const bin = path.join(tempDir, "concat");
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
