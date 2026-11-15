// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * A representative program, linked with a library, compiles with -Wall -Wextra -Werror and computes IEC results:
 * BOOL AND / OR / XOR on comparisons, LEN and FIND as signed INT, global FB instances (local and library type)
 * invoked with arguments, library enumerations, and functions called with named and omitted arguments.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { hasGpp, RUNTIME_INCLUDE_PATH, cxxEnv } from "./test-helpers.js";

const LIBRARY = `TYPE Hmi_Align : (Left := 0, Center := 1, Right := 2); END_TYPE
FUNCTION_BLOCK Label
  VAR_INPUT Align : Hmi_Align := Hmi_Align#Left; END_VAR
  VAR_OUTPUT Code : DINT; END_VAR
  Code := TO_DINT(Align);
END_FUNCTION_BLOCK`;

const PROGRAM = `VAR_GLOBAL Rt : Label; Loc : Counter; Steps : INT := 3; END_VAR
FUNCTION_BLOCK Counter
  VAR_INPUT Step : DINT := 1; END_VAR
  VAR_OUTPUT Total : DINT; END_VAR
  Total := Total + Step;
END_FUNCTION_BLOCK
FUNCTION Clip : DINT
  VAR_INPUT V : DINT; Lo : DINT := 0; Hi : DINT := 100; END_VAR
  Clip := LIMIT(Lo, V, Hi);
END_FUNCTION
PROGRAM Main
  VAR
    s : STRING(32) := 'hello';
    t : STRING := '';
    n, p, c : INT;
    neg, both, either, odd, inRange : BOOL;
    a : Hmi_Align;
    total, clipped : DINT;
    w : WORD := 16#00FF;
    i : INT;
  END_VAR
  n := LEN(s);
  p := FIND(s, 'll');
  neg := LEN(t) - 10 < 0;
  both := n > 2 AND p = 3;
  either := n < 2 OR p <> 0;
  odd := (n MOD 2 = 1) XOR (p > 5);
  inRange := c >= 0 AND c < LEN(s) AND NOT neg;
  w := w AND 16#0F0F OR 16#1000;
  FOR i := 1 TO Steps DO Loc(Step := i); END_FOR;
  Rt(Align := Hmi_Align#Right);
  a := Center;
  CASE a OF Hmi_Align#Left: c := 1; Right: c := 3; ELSE c := 2; END_CASE;
  clipped := Clip(250) + Clip(V := -5, Hi := 10) + Clip(7, 5);
  total := Loc.Total * 1000 + Rt.Code * 100 + clipped;
END_PROGRAM
CONFIGURATION C RESOURCE R0 ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1);
  PROGRAM I WITH T : Main; END_RESOURCE END_CONFIGURATION`;

function library(): StlibArchive {
  const lib = compileStlib([{ fileName: "w.st", source: LIBRARY }], {
    name: "w",
    version: "1.0.0",
    namespace: "w",
  });
  expect(lib.errors).toEqual([]);
  return loadStlibFromString(JSON.stringify(lib.archive), "w");
}

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("generated code compiled with -Wall -Wextra -Werror", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-warnings-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("builds without a warning and computes the IEC results", () => {
    const result = compile(PROGRAM, {
      libraries: [library()],
      headerFileName: "unit.hpp",
    });
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain("iec_bool_and(");
    fs.writeFileSync(path.join(dir, "unit.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "unit.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "unit.hpp"
#include <cstdio>
strucpp::Configuration_C config;
int main() {
  config.I.run();
  std::printf("%d %d %d %d %d %d %d %lld %u\\n", (int)config.I.N.get(), (int)config.I.P.get(),
    (int)config.I.NEG.get(), (int)config.I.BOTH.get(), (int)config.I.EITHER.get(), (int)config.I.ODD.get(),
    (int)config.I.INRANGE.get(), (long long)config.I.TOTAL.get(), (unsigned)config.I.W.get());
  return 0;
}`,
    );
    const bin = path.join(dir, "run");
    execSync(
      `g++ -std=c++17 -Wall -Wextra -Werror -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        ["main.cpp", "unit.cpp"].map((f) => `"${path.join(dir, f)}"`).join(" "),
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe(
      `5 3 1 1 1 1 0 6307 ${(0x00ff & 0x0f0f) | 0x1000}`,
    );
  });
});
