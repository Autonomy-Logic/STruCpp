/**
 * A declared string length inside an array that is a STRUCT member, or the
 * element of an ARRAY type, must reach the storage.
 *
 * `names : ARRAY [1..3] OF STRING(10)` as a structure field was stored as
 * `Array1D<IECStringVar<254>, ...>`: generateStructType dropped the element
 * length, while the debug table and the type descriptor kept 10. The program
 * then accepted 254 characters where IEC allows 10, and the debugger, reading
 * each element as a STRING(10), took its length from inside the text buffer —
 * an empty string, or text from somewhere else. `TYPE T : ARRAY [..] OF
 * STRING(n)` went through generateArrayType and lost the length the same way.
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
TYPE
  REC : STRUCT
    n : INT := 5;
    names : ARRAY [1..3] OF STRING(10);
    tail : INT := 77;
  END_STRUCT;
  NAMES_T : ARRAY [1..2] OF STRING(8);
END_TYPE

PROGRAM Main
VAR
  r : REC;
  t : NAMES_T;
END_VAR
  r.names[1] := 'alpha';
  r.names[2] := 'bravo charlie delta';
  r.names[3] := 'x';
  t[1] := 'abcdefghijk';
  t[2] := 'yz';
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describe("declared string length of array elements", () => {
  it("keeps STRING(n) for an array that is a structure field", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.headerCode).toMatch(/Array1D<IECStringVar<10>, 1, 3> NAMES/);
    expect(result.headerCode).not.toMatch(/IECStringVar<254>, 1, 3>/);
  });

  it("keeps STRING(n) for an ARRAY type", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.headerCode).toMatch(/using NAMES_T = Array1D<IECStringVar<8>, 1, 2>;/);
  });
});

describeIfGpp("array-of-string elements read back over the debugger", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-strarr-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads each element's own text, truncated to the declared length", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const leaf = (p: string): string => {
      const l = result.debugMap!.leaves.find((x) => x.path === p);
      expect(l, `no leaf for ${p}`).toBeTruthy();
      return `${l!.arrayIdx}, ${l!.elemIdx}`;
    };

    const dir = path.join(tempDir, "strarr");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(path.join(dir, "generated_debug.cpp"), result.debugTableCpp!);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp::debug;
static int fails = 0;
static void expect_read(const char* what, unsigned char arr, unsigned short elem, const char* want) {
  unsigned char buf[256] = {0};
  handle_read(arr, elem, buf);
  char got[256] = {0};
  std::memcpy(got, buf + 1, buf[0]);
  if (buf[0] != std::strlen(want) || std::strcmp(got, want) != 0) {
    printf("FAIL %s: got [%u] \\"%s\\" want \\"%s\\"\\n", what, buf[0], got, want); ++fails;
  }
}
int main() {
  g_config.INSTANCE0.run();
  expect_read("r.names[1]", ${leaf("INSTANCE0.R.NAMES[1]")}, "alpha");
  expect_read("r.names[2]", ${leaf("INSTANCE0.R.NAMES[2]")}, "bravo char");
  expect_read("r.names[3]", ${leaf("INSTANCE0.R.NAMES[3]")}, "x");
  expect_read("t[1]", ${leaf("INSTANCE0.T[1]")}, "abcdefgh");
  expect_read("t[2]", ${leaf("INSTANCE0.T[2]")}, "yz");
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(dir, "strarr");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}" ` +
        `"${path.join(dir, "generated_debug.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});
