/**
 * AND, OR and XOR of BOOL operands are BOOL, and of ANY_BIT operands keep the
 * bit type (IEC 61131-3 table 28).
 *
 * `NOT (a > 0.0 AND b > 0.0)` failed to compile: a comparison is a raw C++
 * `bool`, `bool & bool` promotes to `int`, and the NOT template rejected INT.
 * The same promotion reached any generic function given such an expression.
 * The semantic layer also typed every AND/OR/XOR as BOOL, so `BYTE XOR BYTE`
 * was BOOL too.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { hasGpp, RUNTIME_INCLUDE_PATH, cxxEnv, CXX_STD } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const SOURCE = `
PROGRAM Main
VAR
  a : REAL := 1.0;
  b : REAL := -1.0;
  x : BOOL := TRUE;
  y : BOOL := TRUE;
  k : INT := 3;
  by1 : BYTE := 16#0F;
  by2 : BYTE := 16#3C;
  q1, q2, q3, q4, q5, q6 : BOOL;
  s1 : INT;
  bx : BYTE;
END_VAR
  q1 := NOT (a > 0.0 AND b > 0.0);
  q2 := NOT (a > 0.0 OR b > 0.0);
  q3 := NOT (a > 0.0 XOR b < 0.0);
  q4 := NOT (x AND y);
  q5 := SEL(a > 0.0 AND k = 3, FALSE, TRUE);
  q6 := NOT (a > 0.0 AND (b < 0.0 OR x));
  s1 := SEL(a > 0.0 AND b < 0.0, 10, 20);
  bx := NOT (by1 XOR by2);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describe("type of AND, OR and XOR", () => {
  it("compiles NOT of a logical expression of comparisons", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.cppCode).toContain(
      "Q1 = NOT(static_cast<bool>((A > 0.0) & (B > 0.0)));",
    );
  });

  it("keeps BYTE XOR BYTE a BYTE", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.cppCode).toContain("BX = NOT((BY1) ^ (BY2));");
  });
});

describeIfGpp("logical expressions of comparisons at run time", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-boollogic-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("gives the IEC results", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const dir = path.join(tempDir, "boollogic");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
static int fails = 0;
static void check(const char* what, long got, long want) {
  if (got != want) { printf("FAIL %s: got %ld want %ld\\n", what, got, want); ++fails; }
}
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
  check("q1", (bool)p.Q1, 1);
  check("q2", (bool)p.Q2, 0);
  check("q3", (bool)p.Q3, 1);
  check("q4", (bool)p.Q4, 0);
  check("q5", (bool)p.Q5, 1);
  check("q6", (bool)p.Q6, 0);
  check("s1", (long)p.S1, 20);
  check("bx", (long)p.BX, 0xCC);
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(dir, "boollogic");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});
