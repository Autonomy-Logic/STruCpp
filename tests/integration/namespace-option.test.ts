// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * The `namespace` compile option: two units with the same names (a PLC program and an HMI unit, say) link into one
 * binary, and a unit's debug table addresses its own configuration.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const config = (program: string): string =>
  `CONFIGURATION C RESOURCE R ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1);
  PROGRAM I WITH T : ${program}; END_RESOURCE END_CONFIGURATION`;

const UNIT = (
  program: string,
  out: string,
): string => `TYPE Mode : (Off, On); END_TYPE
FUNCTION_BLOCK Motor VAR_INPUT Run : BOOL; END_VAR VAR_OUTPUT Count : DINT; END_VAR
  IF Run THEN Count := Count + 1; END_IF;
END_FUNCTION_BLOCK
PROGRAM ${program} VAR m : Motor; ${out} AT %QX0.0 : BOOL; total : DINT; END_VAR
  m(Run := TRUE); total := m.Count;
END_PROGRAM
${config(program)}`;

describe("namespace option", () => {
  it("declares the unit in the given namespace, debug table included", () => {
    const result = compile(UNIT("Screen", "lamp"), { namespace: "hmi" });
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain("namespace hmi {");
    expect(result.debugTableCpp).toContain(
      "extern ::hmi::Configuration_C g_config;",
    );
  });

  it("refuses C++ keywords and std as a namespace", () => {
    for (const ns of ["int", "std", "namespace"]) {
      expect(
        compile("PROGRAM P END_PROGRAM", { namespace: ns }).errors.length,
      ).toBe(1);
    }
  });

  it("refuses a namespace that is not a C++ identifier", () => {
    const result = compile("PROGRAM P END_PROGRAM", { namespace: "no-good" });
    expect(result.errors.map((e) => e.message)).toEqual([
      "Namespace 'no-good' is not a C++ identifier, or is reserved (a C++ keyword or 'std').",
    ]);
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("namespace option compiled and run with g++", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-namespace-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("links two units with the same names into one binary", () => {
    const plc = compile(UNIT("Main", "x"), { headerFileName: "plc.hpp" });
    const hmi = compile(UNIT("Screen", "lamp"), {
      headerFileName: "hmi.hpp",
      namespace: "hmi",
    });
    expect(plc.errors).toEqual([]);
    expect(hmi.errors).toEqual([]);
    const files: Record<string, string> = {
      "plc.hpp": plc.headerCode,
      "plc.cpp": plc.cppCode,
      "plc_debug.cpp": (plc.debugTableCpp ?? "").replace(
        '"generated.hpp"',
        '"plc.hpp"',
      ),
      "hmi.hpp": hmi.headerCode,
      "hmi.cpp": hmi.cppCode,
      "main.cpp": `#include "plc.hpp"
#include "hmi.hpp"
#include <cstdio>
strucpp::Configuration_C g_config;
hmi::Configuration_C h_config;
int main() {
  g_config.I.run();
  h_config.I.run();
  h_config.I.run();
  std::printf("%lld %lld %u %u\\n", (long long)g_config.I.TOTAL.get(), (long long)h_config.I.TOTAL.get(),
    (unsigned)strucpp::locatedVarsCount, (unsigned)hmi::locatedVarsCount);
  return 0;
}`,
    };
    for (const [name, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), text);
    }
    const bin = path.join(dir, "both");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        ["main.cpp", "plc.cpp", "plc_debug.cpp", "hmi.cpp"]
          .map((f) => `"${path.join(dir, f)}"`)
          .join(" "),
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("1 2 1 1");
  });

  it("compiles a namespaced unit's debug table", () => {
    const hmi = compile(UNIT("Screen", "lamp"), {
      headerFileName: "generated.hpp",
      namespace: "hmi",
    });
    fs.writeFileSync(path.join(dir, "generated.hpp"), hmi.headerCode);
    const table = path.join(dir, "hmi_debug.cpp");
    fs.writeFileSync(table, hmi.debugTableCpp ?? "");
    expect(() =>
      execSync(
        `g++ -std=${CXX_STD} -fsyntax-only -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" "${table}"`,
        { encoding: "utf-8", env: cxxEnv },
      ),
    ).not.toThrow();
  });
  it("includes two unit headers with the same global constants in one translation unit", () => {
    const constants = { STRING_LENGTH: 254, LIST_LENGTH: 254 };
    const plc = compile(UNIT("Main", "x"), {
      headerFileName: "plc.hpp",
      globalConstants: constants,
    });
    const hmi = compile(UNIT("Screen", "lamp"), {
      headerFileName: "hmi.hpp",
      namespace: "hmi",
      globalConstants: constants,
    });
    expect(plc.errors).toEqual([]);
    expect(hmi.errors).toEqual([]);
    const sub = path.join(dir, "constants");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "plc.hpp"), plc.headerCode);
    fs.writeFileSync(path.join(sub, "hmi.hpp"), hmi.headerCode);
    const both = path.join(sub, "both.cpp");
    fs.writeFileSync(
      both,
      '#include "plc.hpp"\n#include "hmi.hpp"\nstatic_assert(STRING_LENGTH == 254, "");\n',
    );
    expect(() =>
      execSync(
        `g++ -std=${CXX_STD} -fsyntax-only -I"${RUNTIME_INCLUDE_PATH}" -I"${sub}" "${both}"`,
        { encoding: "utf-8", env: cxxEnv },
      ),
    ).not.toThrow();
  });
});
