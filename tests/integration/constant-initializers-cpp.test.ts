/**
 * An initial value that names a constant.
 *
 * `x : INT := K`, with K a VAR_EXTERNAL of a global CONSTANT, used to compile
 * to `X(K)` — K being the external's pointer member, not yet bound — so a
 * program did not compile, and a function block read the global while its
 * instance was constructed, during static initialisation, before the global's
 * own definition (in another translation unit) need have run. The constant's
 * value is now written into the initial value, in structure and array
 * initialisers too. An initial value that reads a global variable that is not
 * CONSTANT is an error, as IEC 61131-3 requires.
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
TYPE Pair : STRUCT a : INT; b : INT; END_STRUCT; END_TYPE

VAR_GLOBAL CONSTANT
  TOP : INT := 40;
END_VAR

FUNCTION_BLOCK Counter
  VAR_EXTERNAL CONSTANT K : INT; START : Pair; END_VAR
  VAR
    z : INT := K;
    pz : Pair := START;
    first : INT := START_B;
  END_VAR
  VAR CONSTANT START_B : INT := 11; END_VAR
END_FUNCTION_BLOCK

PROGRAM Main
  VAR_EXTERNAL CONSTANT K : INT; KR : REAL; START : Pair; END_VAR
  VAR_EXTERNAL G : INT; END_VAR
  VAR
    x : INT := K;
    y : INT := K * 2 + 1;
    r : REAL := KR;
    p : Pair := (a := K, b := TOP);
    q : Pair := START;
    arr : ARRAY[0..2] OF INT := [K, 2, TOP];
    late : INT := N;
    c : Counter;
  END_VAR
  VAR CONSTANT N : INT := 5; END_VAR
END_PROGRAM

CONFIGURATION Config0
  VAR_GLOBAL CONSTANT
    K : INT := 7;
    KR : REAL := 1.5;
    START : Pair := (a := 3, b := K);
  END_VAR
  VAR_GLOBAL G : INT := K + TOP; END_VAR
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describeIfGpp("initial values that name constants", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-const-init-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("start from the constants' values", () => {
    const result = compile(SOURCE, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    // Written in, not read from the global at construction.
    expect(result.cppCode).toContain("X(7)");
    expect(result.cppCode).toContain("Z(7)");
    expect(result.cppCode).not.toMatch(/\bZ\(K->read\(\)\)/);

    // Each translation unit compiled on its own and linked, as a board build
    // does: the instance is constructed in main.cpp, the globals are defined
    // in configuration.cpp, and nothing orders the two.
    for (const f of result.cppFiles) {
      fs.writeFileSync(path.join(tempDir, f.name), f.content);
    }
    fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
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
  check("x", p.X, 7);
  check("y", p.Y, 15);
  check("r", p.R, 1.5);
  check("p.a", p.P.A, 7);
  check("p.b", p.P.B, 40);
  check("q.a", p.Q.A, 3);
  check("q.b", p.Q.B, 7);
  check("arr0", p.ARR[0], 7);
  check("arr2", p.ARR[2], 40);
  check("late", p.LATE, 5);
  check("c.z", p.C.Z, 7);
  check("c.pz.b", p.C.PZ.B, 7);
  check("c.first", p.C.FIRST, 11);
  check("g", strucpp::G.read(), 47);
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );
    const units = [...result.cppFiles.map((f) => f.name), "main.cpp"];
    const objects = units.map((u) => {
      const obj = path.join(tempDir, `${u}.o`);
      execSync(
        `g++ -std=${CXX_STD} -c -I"${RUNTIME_INCLUDE_PATH}" -I"${tempDir}" "${path.join(tempDir, u)}" -o "${obj}"`,
        { encoding: "utf-8", env: cxxEnv },
      );
      return `"${obj}"`;
    });
    const bin = path.join(tempDir, "consts");
    execSync(`g++ ${objects.join(" ")} -o "${bin}"`, {
      encoding: "utf-8",
      env: cxxEnv,
    });
    let out = "";
    try {
      out = execSync(`"${bin}"`, { encoding: "utf-8" });
    } catch (e) {
      out = (e as { stdout?: string }).stdout ?? String(e);
    }
    expect(out.trim()).toBe("ALL_OK");
  });
});

describe("an initial value that names a global variable", () => {
  it("is an error", () => {
    const result = compile(`
PROGRAM Main
  VAR_EXTERNAL G : INT; END_VAR
  VAR x : INT := G + 1; END_VAR
END_PROGRAM
CONFIGURATION Config0
  VAR_GLOBAL G : INT := 3; END_VAR
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`);
    expect(result.errors.map((e) => e.message)).toEqual([
      "An initial value must be a constant: 'G' is a global variable, not CONSTANT",
    ]);
    expect(result.errors[0]!.line).toBe(4);
  });

  it("allows VAR_EXTERNAL CONSTANT without an initial value", () => {
    const result = compile(`
PROGRAM Main
  VAR_EXTERNAL CONSTANT K : INT; END_VAR
  VAR x : INT; END_VAR
  x := K;
END_PROGRAM
CONFIGURATION Config0
  VAR_GLOBAL CONSTANT K : INT := 3; END_VAR
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`);
    expect(result.errors.map((e) => e.message)).toEqual([]);
  });
});
