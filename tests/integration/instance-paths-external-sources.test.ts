// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * `externalSources` with `externalInstancePaths`: an HMI unit holds the PLC's declarations (host-owned) next to its
 * own program, configuration and globals (compiled normally). Checked as text and with g++.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import type { CompileOptions, CompileResult } from "../../src/index.js";
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

/** The PLC's declarations as the HMI compilation sees them. */
const PLC_DECLS = `
TYPE GVL_T : STRUCT Output1 : INT; END_STRUCT; END_TYPE
VAR_GLOBAL GVL : GVL_T; END_VAR
PROGRAM Main
VAR Run : BOOL; Speed : INT := 3; END_VAR
;
END_PROGRAM
CONFIGURATION Config0
VAR_GLOBAL gCount : INT := 10; END_VAR
RESOURCE Res0 ON PLC
  TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH task0 : Main;
END_RESOURCE
END_CONFIGURATION
`;

/** The PLC unit itself, compiled on its own. */
const PLC = PLC_DECLS.replace(
  ";\nEND_PROGRAM",
  "Speed := Speed + 0;\nEND_PROGRAM",
);

const GLUE = `
VAR_GLOBAL HMI__Request : DINT := -1; HMI__Page : DINT := -1; END_VAR
FUNCTION HmiPage : DINT
HmiPage := HMI__Page + 1;
END_FUNCTION
`;

const SCREEN = `
{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR_OUTPUT seen : INT; END_VAR
seen := instance0.Main.Speed;
instance0.Main.Speed := seen + 1;
gCount := gCount + 1;
GVL.Output1 := 42;
END_FUNCTION_BLOCK
`;

const HMI_MAIN = `
{attribute 'instance_paths'}
PROGRAM HmiMain
VAR s : Screen; page : DINT; END_VAR
s();
Config0.Res0.instance0.Main.Run := TRUE;
HMI__Request := 5;
page := HmiPage();
END_PROGRAM
`;

const HMI_CONFIG = `
CONFIGURATION HmiConfig
RESOURCE HmiResource ON PLC
  TASK HmiTask(INTERVAL := T#100ms, PRIORITY := 2);
  PROGRAM HmiInstance WITH HmiTask : HmiMain;
END_RESOURCE
END_CONFIGURATION
`;

function compileHmi(extra: Partial<CompileOptions> = {}): CompileResult {
  return compile(GLUE, {
    fileName: "hmi_glue.st",
    additionalSources: [
      { source: PLC_DECLS, fileName: "plc_decls.st" },
      { source: SCREEN, fileName: "screen.st" },
      { source: HMI_MAIN, fileName: "hmi_main.st" },
      { source: HMI_CONFIG, fileName: "hmi_config.st" },
    ],
    externalInstancePaths: true,
    externalSources: ["plc_decls.st"],
    headerFileName: "hmi.hpp",
    namespace: "hmi",
    ...extra,
  });
}

describe("externalSources", () => {
  it("emits the HMI's own program, configuration and globals, and not the host's", () => {
    const hmi = compileHmi();
    expect(hmi.errors).toEqual([]);
    const header = hmi.headerCode;
    expect(header).toContain("class Program_HMIMAIN");
    expect(header).toContain("class Configuration_HMICONFIG");
    expect(header).toContain("HMI__REQUEST");
    expect(header).not.toContain("class Program_MAIN :");
    expect(header).not.toContain("class Configuration_CONFIG0 :");
    expect(header).not.toContain("GlobalVar<IEC_INT> GCOUNT");
    expect(header).not.toContain("inline GVL_T GVL");
    const files = hmi.cppFiles.map((f) => f.name);
    expect(files).toContain("pou_HMIMAIN.cpp");
    expect(files).not.toContain("pou_MAIN.cpp");
    expect(hmi.cppCode).toContain("HMI__REQUEST = 5;");
    expect(hmi.instancePaths?.map((e) => e.path)).toEqual([
      "CONFIG0.RES0.INSTANCE0.MAIN.RUN",
      "CONFIG0.RES0.INSTANCE0.MAIN.SPEED",
      "CONFIG0.GCOUNT",
      "GVL.OUTPUT1",
    ]);
  });

  it("resolves a path to the host's instance when the HMI declares one of the same name", () => {
    const hmi = compileHmi({
      additionalSources: [
        { source: PLC_DECLS, fileName: "plc_decls.st" },
        { source: SCREEN, fileName: "screen.st" },
        { source: HMI_MAIN, fileName: "hmi_main.st" },
        {
          source: HMI_CONFIG.replace("HmiInstance", "instance0"),
          fileName: "hmi_config.st",
        },
      ],
    });
    expect(hmi.errors).toEqual([]);
    expect(hmi.instancePaths?.[1]?.path).toBe(
      "CONFIG0.RES0.INSTANCE0.MAIN.SPEED",
    );
  });

  it("refuses a VAR_EXTERNAL to a host global in an HMI program", () => {
    const hmi = compileHmi({
      additionalSources: [
        { source: PLC_DECLS, fileName: "plc_decls.st" },
        { source: SCREEN, fileName: "screen.st" },
        {
          source: HMI_MAIN.replace(
            "VAR s : Screen;",
            "VAR_EXTERNAL gCount : INT; END_VAR VAR s : Screen;",
          ),
          fileName: "hmi_main.st",
        },
        { source: HMI_CONFIG, fileName: "hmi_config.st" },
      ],
    });
    expect(hmi.errors.map((e) => e.message)).toEqual([
      "VAR_EXTERNAL in 'HMIMAIN' is not supported with externalInstancePaths, which does not emit globals; in a POU marked {attribute 'instance_paths'} use the global by name.",
    ]);
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("externalSources compiled and run with g++", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-external-sources-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("runs the HMI configuration's program against the PLC through the host", () => {
    const plc = compile(PLC, { headerFileName: "plc.hpp" });
    expect(plc.errors).toEqual([]);
    const hmi = compileHmi();
    expect(hmi.errors).toEqual([]);
    const entries = hmi.instancePaths ?? [];
    const cppOf = (p: string): string => {
      const parts = p.split(".");
      if (parts.length === 5) return `g_config.${parts[2]}.${parts[4]}`;
      if (parts[0] === "CONFIG0") return `strucpp::${parts[1]}.value`;
      return `strucpp::${parts.join(".")}`;
    };
    const byType = new Map<string, typeof entries>();
    for (const e of entries)
      byType.set(`IEC_${e.type}`, [...(byType.get(`IEC_${e.type}`) ?? []), e]);
    const host: string[] = ["namespace strucpp {"];
    for (const [t, list] of byType) {
      host.push(
        `template <> ${t} external_read<${t}>(uint32_t id) { switch (id) {`,
      );
      for (const e of list) host.push(`case ${e.id}: return ${cppOf(e.path)};`);
      host.push("} std::abort(); }");
      host.push(
        `template <> void external_write<${t}>(uint32_t id, const ${t}& v) { switch (id) {`,
      );
      for (const e of list)
        host.push(`case ${e.id}: ${cppOf(e.path)} = v; return;`);
      host.push("} std::abort(); }");
    }
    host.push("}");
    const files: Record<string, string> = {
      "plc.hpp": plc.headerCode,
      "plc.cpp": plc.cppCode,
      "hmi.hpp": hmi.headerCode,
      "hmi.cpp": hmi.cppCode.replace(/"generated\.hpp"/g, '"hmi.hpp"'),
      "host.cpp": `#include "plc.hpp"
#include "iec_external.hpp"
#include <cstdlib>
extern strucpp::Configuration_CONFIG0 g_config;
${host.join("\n")}
`,
      "main.cpp": `#include "plc.hpp"
#include "hmi.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
hmi::Configuration_HMICONFIG h_config;
int main() {
  h_config.HMIINSTANCE.run();
  auto& P = g_config.INSTANCE0;
  std::printf("%d %d %d %d %d %d\\n", (int)P.SPEED.get(), (int)P.RUN.get(),
    (int)strucpp::GCOUNT.value.get(), (int)strucpp::GVL.OUTPUT1.get(),
    (int)hmi::HMI__REQUEST.get(), (int)h_config.HMIINSTANCE.PAGE.get());
  return 0;
}`,
    };
    for (const [name, text] of Object.entries(files))
      fs.writeFileSync(path.join(dir, name), text);
    const bin = path.join(dir, "run");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        ["plc.cpp", "hmi.cpp", "host.cpp", "main.cpp"]
          .map((f) => `"${path.join(dir, f)}"`)
          .join(" "),
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe(
      "4 1 11 42 5 0",
    );
  });
});
