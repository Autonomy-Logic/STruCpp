/**
 * DT_TO_TOD and DT_TO_DATE (IEC 61131-3 table 22) split a DT into its time of
 * day and its date. They were lowered to the plain TO_TOD / TO_DATE cast, which
 * returned the whole DT: a DT is nanoseconds since 1970, a TOD nanoseconds
 * since midnight and a DATE a day count.
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
  d : DT := DT#2024-01-02-03:04:05;
  early : DT := DT#1969-12-31-23:00:00;
  ok1, ok2, ok3, ok4, ok5, ok6 : BOOL;
END_VAR
  ok1 := DT_TO_TOD(d) = TOD#03:04:05;
  ok2 := DT_TO_DATE(d) = D#2024-01-02;
  ok3 := DATE_AND_TIME_TO_TIME_OF_DAY(d) = TOD#03:04:05;
  ok4 := TO_TOD(d) = TOD#03:04:05;
  ok5 := TO_DATE(d) = D#2024-01-02;
  ok6 := DT_TO_TOD(early) = TOD#23:00:00 AND DT_TO_DATE(early) = D#1969-12-31;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describe("DT_TO_TOD and DT_TO_DATE", () => {
  it("lower to the runtime's split functions", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.cppCode).toContain("TOD_OF_DT(D)");
    expect(result.cppCode).toContain("DATE_OF_DT(D)");
  });
});

describeIfGpp("DT_TO_TOD and DT_TO_DATE at run time", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dtsplit-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("give the time of day and the date", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const dir = path.join(tempDir, "dtsplit");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
  bool ok[] = {p.OK1, p.OK2, p.OK3, p.OK4, p.OK5, p.OK6};
  int fails = 0;
  for (int i = 0; i < 6; ++i) if (!ok[i]) { printf("FAIL ok%d\\n", i + 1); ++fails; }
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(dir, "dtsplit");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});
