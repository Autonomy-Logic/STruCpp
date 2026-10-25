/**
 * LIMIT(MN, IN, MX) is MIN(MAX(IN, MN), MX) (IEC 61131-3 table 24), so when
 * MN is above MX the result is MX. The runtime tested IN < MN first and
 * returned MN.
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
  r1, r2, r3 : REAL;
  i1, i2 : INT;
  d1 : DINT;
  k : INT := 0;
END_VAR
  r1 := LIMIT(90.0, 0.0, 80.0);
  r2 := LIMIT(90.0, 85.0, 80.0);
  r3 := LIMIT(10.0, 50.0, 80.0);
  i1 := LIMIT(9, k, 8);
  i2 := LIMIT(2, k, 8);
  d1 := LIMIT(INT#9, DINT#0, DINT#8);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describeIfGpp("LIMIT with MN above MX", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-limit-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns MX, for one type and for mixed types", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const dir = path.join(tempDir, "limit");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
static int fails = 0;
static void check(const char* what, double got, double want) {
  if (got != want) { printf("FAIL %s: got %g want %g\\n", what, got, want); ++fails; }
}
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
  check("r1", (double)p.R1, 80.0);
  check("r2", (double)p.R2, 80.0);
  check("r3", (double)p.R3, 50.0);
  check("i1", (double)p.I1, 8);
  check("i2", (double)p.I2, 2);
  check("d1", (double)p.D1, 8);
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(dir, "limit");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});
