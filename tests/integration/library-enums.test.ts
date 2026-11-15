// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Enumerations declared in a library, used by a consumer as it uses its own: typed literals, unqualified members
 * (unless the type is `qualified_only`), comparisons, CASE labels, arguments and instance initializers.
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
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const LIBRARY = `TYPE Hmi_Align : (Left := 0, Center := 1, Right := 2); END_TYPE
{attribute 'qualified_only'}
TYPE Hmi_Port : (Top, Bottom); END_TYPE
TYPE Hmi_Wide : DINT (Low := 0, High := 100000); END_TYPE
TYPE Hmi_Colors : STRUCT Text, Accent : UDINT; END_STRUCT; END_TYPE
VAR_GLOBAL CONSTANT
  COLOR : Hmi_Colors := (Text := 16#111111, Accent := 16#2563EB);
END_VAR
FUNCTION Align_Code : DINT
  VAR_INPUT Align : Hmi_Align; Port : Hmi_Port := Hmi_Port#Top; END_VAR
  Align_Code := 10 * TO_DINT(Align);
  IF Port = Hmi_Port#Bottom THEN Align_Code := Align_Code + 1; END_IF;
END_FUNCTION
FUNCTION_BLOCK Label
  VAR_INPUT Align : Hmi_Align := Hmi_Align#Left; END_VAR
  VAR_OUTPUT Code : DINT; END_VAR
  Code := TO_DINT(Align);
END_FUNCTION_BLOCK`;

function library(): StlibArchive {
  const lib = compileStlib([{ fileName: "w.st", source: LIBRARY }], {
    name: "w",
    version: "1.0.0",
    namespace: "w",
  });
  expect(lib.errors).toEqual([]);
  return loadStlibFromString(JSON.stringify(lib.archive), "w");
}

const CONSUMER = `PROGRAM Main
  VAR
    a : Hmi_Align;
    p : Hmi_Port;
    l : Label := (Align := Hmi_Align#Center);
    r : Label;
    code, pos, named, casePick, unq, port : DINT;
    c : UDINT;
    same : BOOL;
  END_VAR
  a := Hmi_Align#Right;
  same := a = Hmi_Align#Right;
  pos := Align_Code(Hmi_Align#Center, Hmi_Port#Bottom);
  named := Align_Code(Align := Hmi_Align#Right);
  CASE a OF
    Hmi_Align#Left: casePick := 1;
    Right: casePick := 3;
  ELSE
    casePick := 9;
  END_CASE;
  a := Center;
  unq := TO_DINT(a);
  p := Hmi_Port#Bottom;
  port := TO_DINT(p);
  c := COLOR.Accent;
  l();
  r(Align := Left);
  code := l.Code * 100 + r.Code;
END_PROGRAM
CONFIGURATION C RESOURCE R0 ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1);
  PROGRAM I WITH T : Main; END_RESOURCE END_CONFIGURATION`;

describe("library enumerations in a consumer", () => {
  it("debugs a library enumeration like a local one, with its integer base", () => {
    const result = compile(
      `PROGRAM Main VAR l : Label; w : Hmi_Wide := Hmi_Wide#High; a : Hmi_Align; END_VAR l(); END_PROGRAM
CONFIGURATION C RESOURCE R0 ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1);
  PROGRAM I WITH T : Main; END_RESOURCE END_CONFIGURATION`,
      { libraries: [library()] },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.message)).toEqual([]);
    const types = Object.fromEntries(
      (result.debugMap?.leaves ?? []).map((l) => [l.path, l.type]),
    );
    expect(types["I.L.ALIGN"]).toBe("INT");
    expect(types["I.A"]).toBe("INT");
    expect(types["I.W"]).toBe("DINT");
  });

  it("accepts typed literals, unqualified members, CASE labels, arguments and initializers", () => {
    const result = compile(CONSUMER, { libraries: [library()] });
    expect(result.errors).toEqual([]);
  });

  it("refuses an unqualified member of a qualified_only library enumeration", () => {
    const result = compile(
      `PROGRAM Main VAR p : Hmi_Port; END_VAR p := Bottom; END_PROGRAM`,
      { libraries: [library()] },
    );
    expect(result.errors.map((e) => e.message).join("\n")).toMatch(/BOTTOM/i);
  });

  it("refuses a member the library enumeration does not have", () => {
    const result = compile(
      `PROGRAM Main VAR a : Hmi_Align; END_VAR a := Hmi_Align#Middle; END_PROGRAM`,
      { libraries: [library()] },
    );
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("library enumerations compiled and run with g++", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-library-enums-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("runs a consumer of a library enumeration", () => {
    const result = compile(CONSUMER, {
      libraries: [library()],
      headerFileName: "unit.hpp",
    });
    expect(result.errors).toEqual([]);
    fs.writeFileSync(path.join(dir, "unit.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "unit.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "unit.hpp"
#include <cstdio>
strucpp::Configuration_C config;
int main() {
  config.I.run();
  std::printf("%d %lld %lld %lld %lld %lld %lld %u\\n", (int)config.I.SAME.get(), (long long)config.I.POS.get(),
    (long long)config.I.NAMED.get(), (long long)config.I.CASEPICK.get(), (long long)config.I.UNQ.get(),
    (long long)config.I.CODE.get(), (long long)config.I.PORT.get(), (unsigned)config.I.C.get());
  return 0;
}`,
    );
    const bin = path.join(dir, "run");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        ["main.cpp", "unit.cpp"].map((f) => `"${path.join(dir, f)}"`).join(" "),
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe(
      `1 11 20 3 1 100 1 ${0x2563eb}`,
    );
  });
});
