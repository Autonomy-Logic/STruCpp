// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Instance paths compiled with g++ and run: a screen function block marked `{attribute 'instance_paths'}` reads and
 * writes a program instance's variables and the globals, in the default mode (one unit, direct access through the
 * configuration object) and in external mode (a separate unit whose accesses go through host functions that the
 * test defines over the PLC unit's own variables).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import type { InstancePathEntry } from "../../src/index.js";
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const DECLARATIONS = `
TYPE GVL_T : STRUCT Output1 : INT; Flag : BOOL; END_STRUCT; END_TYPE
VAR_GLOBAL
  GVL : GVL_T;
END_VAR
TYPE Point : STRUCT x : DINT; y : DINT; END_STRUCT; END_TYPE
`;

const PROGRAM_DECL = `
PROGRAM Main
VAR
  Run : BOOL;
  Speed : INT := 3;
  Name : STRING[20] := 'plc';
  Levels : ARRAY[0..3] OF REAL;
  Pos : Point;
  Flags : WORD;
  Cycles : DINT;
END_VAR
VAR_EXTERNAL gCount : INT; END_VAR
Cycles := Cycles + 1;
END_PROGRAM
`;

const CONFIG = `
CONFIGURATION Config0
VAR_GLOBAL gCount : INT := 10; END_VAR
RESOURCE Res0 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH t : Main;
END_RESOURCE
END_CONFIGURATION
`;

const SCREEN = `
{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR_OUTPUT seen : INT; label : STRING[20]; END_VAR
METHOD Bump
  instance0.Main.Cycles := instance0.Main.Cycles + 100;
END_METHOD
seen := instance0.Main.Speed;
instance0.Main.Speed := instance0.Main.Speed * 2;
IF NOT Config0.Res0.instance0.Main.Run THEN
  Config0.Res0.instance0.Main.Run := TRUE;
END_IF;
label := instance0.Main.Name;
instance0.Main.Name := 'screen';
instance0.Main.Levels[2] := 1.5;
instance0.Main.Pos.y := 7;
instance0.Main.Flags.3 := TRUE;
gCount := gCount + 1;
Config0.gCount := Config0.gCount + 1;
GVL.Output1 := 42;
Bump();
END_FUNCTION_BLOCK
`;

/** The marked block's method also reaches the paths. */
const SCREEN_WITH_METHOD = SCREEN;

const PRINT = `std::printf("%d %d %s %g %d %d %d %d %d\\n",
    (int)P.SPEED.get(), (int)P.RUN.get(), P.NAME.c_str(), (double)P.LEVELS[2].get(),
    (int)P.POS.Y.get(), (int)P.FLAGS.get(), (int)P.CYCLES.get(), (int)strucpp::GCOUNT.value.get(),
    (int)strucpp::GVL.OUTPUT1.get());`;

/** C++ that names the PLC unit's variable for a canonical path. */
function cppOf(entry: InstancePathEntry): string {
  const parts = entry.path.replace(/\[(\d+)\]/g, ".[$1]").split(".");
  const access = (segs: string[]): string =>
    segs.map((s) => (s.startsWith("[") ? s : `.${s}`)).join("");
  if (entry.kind === "instance") {
    // CONFIG.RES.INST.PROG.VAR... → g_config.INST.VAR...
    return `g_config.${parts[2]}${access(parts.slice(4))}`;
  }
  if (entry.path.startsWith("CONFIG0.")) {
    return `strucpp::${parts[1]}.value${access(parts.slice(2))}`;
  }
  return `strucpp::${parts[0]}${access(parts.slice(1))}`;
}

/** Host definitions of `external_variable` / `external_store` for the paths the HMI unit uses. */
function hostSpecializations(entries: InstancePathEntry[]): string {
  const cppType = (e: InstancePathEntry): string =>
    e.type === "STRING"
      ? `IECStringVar<${e.maxLength ?? 254}>`
      : `IEC_${e.type}`;
  const out: string[] = ["namespace strucpp {"];
  out.push("void* external_variable(uint32_t id) {");
  out.push("  switch (id) {");
  for (const e of entries) out.push(`    case ${e.id}: return &${cppOf(e)};`);
  out.push("  }\n  std::abort();\n}");
  out.push("void external_store(uint32_t id, const void* value) {");
  out.push("  switch (id) {");
  for (const e of entries)
    out.push(
      `    case ${e.id}: ${cppOf(e)} = *static_cast<const ${cppType(e)}*>(value); return;`,
    );
  out.push("  }\n  std::abort();\n}");
  out.push("}  // namespace strucpp");
  return out.join("\n");
}

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("instance paths compiled and run with g++", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-instance-paths-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function build(name: string, files: Record<string, string>): string {
    const sub = path.join(dir, name);
    fs.mkdirSync(sub, { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(sub, file), text);
    }
    const sources = Object.keys(files)
      .filter((f) => f.endsWith(".cpp"))
      .map((f) => `"${path.join(sub, f)}"`)
      .join(" ");
    const bin = path.join(sub, "run");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${sub}" -o "${bin}" ${sources}`,
      { encoding: "utf-8", env: cxxEnv },
    );
    return execSync(`"${bin}"`, { encoding: "utf-8" }).trim();
  }

  it("default mode: the screen reaches the instance and the globals directly", () => {
    const result = compile(
      DECLARATIONS + PROGRAM_DECL + SCREEN_WITH_METHOD + CONFIG,
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain(
      "extern ::strucpp::Configuration_CONFIG0 g_config;",
    );
    const files: Record<string, string> = {
      "generated.hpp": result.headerCode,
    };
    for (const f of result.cppFiles) files[f.name] = f.content;
    files["main.cpp"] = `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
int main() {
  strucpp::SCREEN screen;
  screen();
  auto& P = g_config.INSTANCE0;
  ${PRINT}
  std::printf("%d %s\\n", (int)screen.SEEN.get(), screen.LABEL.c_str());
  return 0;
}`;
    expect(build("default", files)).toBe("6 1 screen 1.5 7 8 100 12 42\n3 plc");
  });

  it("default mode: configuration globals go through their lock, in the threaded build too", () => {
    const source = `
TYPE Pt : STRUCT x : INT; y : INT; END_STRUCT; END_TYPE
FUNCTION Twice : INT VAR_IN_OUT v : INT; END_VAR v := v * 2; Twice := v; END_FUNCTION
FUNCTION_BLOCK Fb VAR_INPUT i : BOOL; END_VAR VAR_OUTPUT q : BOOL; END_VAR VAR_IN_OUT io : INT; END_VAR q := i; io := io + 1; END_FUNCTION_BLOCK
PROGRAM Main VAR x : INT; END_VAR x := x + 1; END_PROGRAM
{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR n : INT; f : Fb; pt : Pt; END_VAR
VAR_OUTPUT bit3 : BOOL; tw : INT; y : INT; END_VAR
gCount := gCount + 1;
bit3 := gW.3; gW.4 := TRUE;
pt := gP; pt.y := 9; gP := pt; gP.x := 5; y := gP.y;
f(i := TRUE, q => gB, io := gCount);
tw := Twice(gCount);
END_FUNCTION_BLOCK
CONFIGURATION Config0
VAR_GLOBAL gCount : INT := 4; gB : BOOL; gP : Pt; gW : WORD := 8; END_VAR
RESOURCE Res0 ON PLC TASK t(INTERVAL := T#20ms, PRIORITY := 1); PROGRAM instance0 WITH t : Main; END_RESOURCE
END_CONFIGURATION
`;
    const result = compile(source);
    expect(result.errors).toEqual([]);
    const files: Record<string, string> = {
      "generated.hpp": result.headerCode,
    };
    for (const f of result.cppFiles) files[f.name] = f.content;
    files["main.cpp"] = `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
int main() {
  strucpp::SCREEN screen;
  screen();
  std::printf("%d %d %d %d %d %d %d %d\\n", (int)strucpp::GCOUNT.value.get(), (int)screen.BIT3.get(),
    (int)strucpp::GW.value.get(), (int)strucpp::GP.value.X.get(), (int)screen.Y.get(),
    (int)strucpp::GB.value.get(), (int)screen.TW.get(), 0);
  return 0;
}`;
    const expected = "12 1 24 5 9 1 12 0";
    expect(build("locked-globals", files)).toBe(expected);
    const threaded = Object.fromEntries(
      Object.entries(files).map(([name, text]) => [
        name,
        name.endsWith(".cpp") ? `#define STRUCPP_THREADED 1\n${text}` : text,
      ]),
    );
    expect(build("locked-globals-threaded", threaded)).toBe(expected);
  });

  it("external mode: a separate unit reaches the PLC through host functions", () => {
    const plc = compile(DECLARATIONS + PROGRAM_DECL + CONFIG, {
      headerFileName: "plc.hpp",
    });
    expect(plc.errors).toEqual([]);
    // The HMI unit has the declarations only: no program body is needed.
    const programDeclOnly = PROGRAM_DECL.replace("Cycles := Cycles + 1;\n", "");
    const hmi = compile(
      DECLARATIONS + programDeclOnly + SCREEN_WITH_METHOD + CONFIG,
      {
        headerFileName: "hmi.hpp",
        namespace: "hmi",
        externalInstancePaths: true,
      },
    );
    expect(hmi.errors).toEqual([]);
    expect(hmi.headerCode).toContain('#include "iec_external.hpp"');
    expect(hmi.headerCode).not.toContain("Configuration_CONFIG0 :");
    expect(hmi.headerCode).not.toContain("GVL{}");
    expect(hmi.debugTableCpp).toBeUndefined();
    const entries = hmi.instancePaths ?? [];
    expect(entries.map((e) => e.path)).toEqual([
      "CONFIG0.RES0.INSTANCE0.MAIN.SPEED",
      "CONFIG0.RES0.INSTANCE0.MAIN.RUN",
      "CONFIG0.RES0.INSTANCE0.MAIN.NAME",
      "CONFIG0.RES0.INSTANCE0.MAIN.LEVELS[2]",
      "CONFIG0.RES0.INSTANCE0.MAIN.POS.Y",
      "CONFIG0.RES0.INSTANCE0.MAIN.FLAGS",
      "CONFIG0.GCOUNT",
      "GVL.OUTPUT1",
      "CONFIG0.RES0.INSTANCE0.MAIN.CYCLES",
    ]);

    const files: Record<string, string> = {
      "plc.hpp": plc.headerCode,
      "plc.cpp": plc.cppCode,
      "hmi.hpp": hmi.headerCode,
      "hmi.cpp": hmi.cppCode.replace(/"generated\.hpp"/g, '"hmi.hpp"'),
      "host.cpp": `#include "plc.hpp"
#include "iec_external.hpp"
#include <cstdlib>
extern strucpp::Configuration_CONFIG0 g_config;
${hostSpecializations(entries)}
`,
      "main.cpp": `#include "plc.hpp"
#include "hmi.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
int main() {
  hmi::SCREEN screen;
  screen();
  auto& P = g_config.INSTANCE0;
  ${PRINT}
  std::printf("%d %s\\n", (int)screen.SEEN.get(), screen.LABEL.c_str());
  return 0;
}`,
    };
    expect(build("external", files)).toBe(
      "6 1 screen 1.5 7 8 100 12 42\n3 plc",
    );
  });
});
