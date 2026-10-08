/**
 * A variable named like a standard function.
 *
 * IEC 61131-3 keeps variables and functions in separate namespaces, so `sel`,
 * `limit`, `max`, `to_int` or `time` may name a variable while the POU still
 * calls SEL, LIMIT, MAX, TO_INT or TIME. In C++ the member or local hid the
 * runtime function (`no match for call to (IEC_INT)(...)`); the generated
 * code now calls standard functions by their qualified name. The variables
 * keep their names, so the debugger sees the same paths.
 *
 * A global is different: its storage shares the runtime's C++ namespace, so
 * one name cannot be both, and it is reported instead.
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
TYPE Range : STRUCT
  min : INT := 2;
  max : INT := 8;
END_STRUCT; END_TYPE

FUNCTION Clamp : INT
  VAR_INPUT max : INT; v : INT; END_VAR
  VAR abs : INT; END_VAR
  abs := ABS(v);
  Clamp := MIN(abs, max);
END_FUNCTION

FUNCTION_BLOCK Window
  VAR_INPUT v : INT; END_VAR
  VAR_OUTPUT min, len : INT; END_VAR
  min := MIN(v, 4);
  len := LEN('abc');
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  sel, limit, max, clamped : INT;
  b : BOOL := TRUE;
  to_int : INT;
  r : REAL := 2.6;
  time : TIME;
  range : Range;
  w : Window;
  fromRange : INT;
END_VAR
  sel := SEL(b, 1, 20);
  limit := LIMIT(0, sel * 30, 9);
  max := MAX(sel, limit);
  to_int := REAL_TO_INT(r);
  time := TIME();
  fromRange := LIMIT(range.min, 100, range.max);
  w(v := 7);
  clamped := Clamp(max := 5, v := -12);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describeIfGpp("variables named like standard functions", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-std-names-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("calls the functions and keeps the variables", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.cppCode).toContain("SEL = strucpp::SEL(");
    expect(result.cppCode).toContain("TO_INT = strucpp::TO_INT(");

    // The debugger addresses the variables by their IEC names.
    const paths = result.debugMap!.leaves.map((l) => l.path);
    for (const name of [
      "SEL",
      "LIMIT",
      "MAX",
      "TO_INT",
      "TIME",
      "RANGE.MIN",
      "W.MIN",
      "W.LEN",
    ]) {
      expect(paths).toContain(`INSTANCE0.${name}`);
    }

    fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(tempDir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(tempDir, "main.cpp"),
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
  check("sel", p.SEL, 20);
  check("limit", p.LIMIT, 9);
  check("max", p.MAX, 20);
  check("to_int", p.TO_INT, 3);
  check("fromRange", p.FROMRANGE, 8);
  check("w.min", p.W.MIN, 4);
  check("w.len", p.W.LEN, 3);
  check("clamped", p.CLAMPED, 5);
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const bin = path.join(tempDir, "names");
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

describe("a global named like a standard function", () => {
  it.each([
    [
      "CONFIGURATION",
      "CONFIGURATION C VAR_GLOBAL limit : INT; END_VAR END_CONFIGURATION",
      "limit",
      "LIMIT",
    ],
    ["top-level", "VAR_GLOBAL to_real : INT; END_VAR", "to_real", "TO_REAL"],
    [
      "DELETE's C++ name",
      "VAR_GLOBAL delete_str : INT; END_VAR",
      "delete_str",
      "DELETE",
    ],
  ])("is reported (%s)", (_where, source, name, fn) => {
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.message)).toEqual([
      `A global variable cannot be named '${name.toUpperCase()}': the standard function ${fn} has that name in the generated code. Rename the global (a local variable may use the name)`,
    ]);
  });

  it("leaves a global named like the IEC name only alone", () => {
    // DELETE's C++ function is DELETE_STR; nothing is called DELETE.
    expect(compile("VAR_GLOBAL delete : INT; END_VAR").errors ?? []).toEqual(
      [],
    );
  });
});
