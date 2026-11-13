// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * `separateLibraryFiles`: a linked library's declarations go to their own header and its implementation to its own
 * translation unit, which does not change when the unit's own code does.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { discoverStlibs } from "../../src/node/library-loader.js";
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const LIBRARY = `INTERFACE IW METHOD Area : DINT END_METHOD END_INTERFACE
FUNCTION_BLOCK ABSTRACT Base IMPLEMENTS IW
  VAR_INPUT Scale : DINT := 2; END_VAR
  METHOD ABSTRACT Area : DINT END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Sq EXTENDS Base
  VAR_INPUT Side : DINT := 3; END_VAR
  METHOD OVERRIDE Area : DINT Area := Side * Side * Scale; END_METHOD
END_FUNCTION_BLOCK
FUNCTION Twice : DINT VAR_INPUT V : DINT; END_VAR Twice := V * 2; END_FUNCTION`;

const CONFIG = `CONFIGURATION C RESOURCE R ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1);
  PROGRAM I WITH T : P; END_RESOURCE END_CONFIGURATION`;

function library(): StlibArchive {
  const lib = compileStlib([{ fileName: "w.st", source: LIBRARY }], {
    name: "widgets",
    version: "1.0.0",
    namespace: "widgets",
  });
  expect(lib.errors).toEqual([]);
  return lib.archive;
}

function build(body: string): ReturnType<typeof compile> {
  const result = compile(
    `PROGRAM P VAR s : Sq; i : IW; r : DINT; END_VAR i := s; ${body} END_PROGRAM\n${CONFIG}`,
    { libraries: [library()], separateLibraryFiles: true, namespace: "hmi" },
  );
  expect(result.errors).toEqual([]);
  return result;
}

const libraryCpp = (r: ReturnType<typeof compile>): string | undefined =>
  r.cppFiles.find((f) => f.name === "lib_widgets.cpp")?.content;

describe("separate library files", () => {
  it("keeps a library's files unchanged when the unit's own code changes", () => {
    const a = build("r := Twice(s.Area());");
    const b = build("r := s.Area() + Twice(1) + 100;");
    expect(a.libraryHeader?.name).toBe("generated_libraries.hpp");
    expect(a.headerCode).toContain('#include "generated_libraries.hpp"');
    expect(a.headerCode).not.toContain("class SQ ");
    expect(libraryCpp(a)).toBeDefined();
    expect(libraryCpp(a)).toBe(libraryCpp(b));
    expect(a.libraryHeader?.content).toBe(b.libraryHeader?.content);
    expect(libraryCpp(a)).not.toContain("generated.hpp");
    expect(
      a.cppFiles.find((f) => f.name === "configuration.cpp")?.content,
    ).not.toContain("SQ::");
  });

  it("leaves the default output as it was", () => {
    const result = compile(
      `PROGRAM P VAR s : Sq; r : DINT; END_VAR r := s.Area(); END_PROGRAM\n${CONFIG}`,
      { libraries: [library()] },
    );
    expect(result.libraryHeader).toBeUndefined();
    expect(result.cppFiles.map((f) => f.name)).not.toContain("lib_widgets.cpp");
    expect(result.headerCode).toContain("// Library: widgets");
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("separate library files compiled and run with g++", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-seplib-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("links the library translation unit with the unit's own", () => {
    const result = build("r := s.Area() + Twice(1) + 100;");
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    if (result.libraryHeader) {
      fs.writeFileSync(
        path.join(dir, result.libraryHeader.name),
        result.libraryHeader.content,
      );
    }
    for (const f of result.cppFiles) {
      fs.writeFileSync(path.join(dir, f.name), f.content);
    }
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
hmi::Configuration_C c;
int main() { c.I.run(); std::printf("%lld\\n", (long long)c.I.R.get()); return 0; }`,
    );
    const sources = ["main.cpp", ...result.cppFiles.map((f) => f.name)]
      .map((f) => `"${path.join(dir, f)}"`)
      .join(" ");
    const bin = path.join(dir, "run");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ${sources}`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("120");
  });
  it("links with libraries that bring global constants (OSCAT)", () => {
    const shipped = discoverStlibs(path.resolve(__dirname, "../../libs"));
    const result = compile(
      `PROGRAM P VAR t : TON; e : R_TRIG; x : REAL; b : BOOL; n : INT; END_VAR
  t(IN := TRUE, PT := T#1s); e(CLK := t.Q);
  x := HYPOT(3.0, 4.0); b := EVEN(4); n := REAL_TO_INT(x) + BOOL_TO_INT(b);
END_PROGRAM
${CONFIG}`,
      {
        libraries: shipped,
        separateLibraryFiles: true,
        globalConstants: { STRING_LENGTH: 254, LIST_LENGTH: 254 },
      },
    );
    expect(result.errors).toEqual([]);
    const sub = path.join(dir, "oscat");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, "generated.hpp"), result.headerCode);
    if (result.libraryHeader) {
      fs.writeFileSync(
        path.join(sub, result.libraryHeader.name),
        result.libraryHeader.content,
      );
    }
    for (const f of result.cppFiles) {
      fs.writeFileSync(path.join(sub, f.name), f.content);
    }
    fs.writeFileSync(
      path.join(sub, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_C c;
int main() { c.I.run(); std::printf("%d\\n", (int)c.I.N.get()); return 0; }`,
    );
    const sources = ["main.cpp", ...result.cppFiles.map((f) => f.name)]
      .map((f) => `"${path.join(sub, f)}"`)
      .join(" ");
    const bin = path.join(sub, "run");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${sub}" -o "${bin}" ${sources}`,
      { encoding: "utf-8", env: cxxEnv },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("6");
  });
});
