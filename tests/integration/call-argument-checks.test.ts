// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Omitted call arguments: defaults by the static type at the call site, the errors for an omitted in-out or a library
 * input with no default, method names that collide with IEC operators, omitted outputs in ELSIF / UNTIL
 * conditions, and which library headers a consumer includes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { execSync } from "child_process";
import {
  hasGpp,
  createPCH,
  compileAndRunStandalone,
  RUNTIME_INCLUDE_PATH,
  CXX_STD,
  cxxEnv,
} from "./test-helpers.js";

const STATIC_DEFAULTS = `INTERFACE IVal METHOD Fetch : DINT VAR_INPUT V : DINT := 1; END_VAR END_METHOD END_INTERFACE
FUNCTION_BLOCK Base IMPLEMENTS IVal
  METHOD Fetch : DINT VAR_INPUT V : DINT := 1; END_VAR Fetch := V; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Der EXTENDS Base
  METHOD Fetch : DINT VAR_INPUT V : DINT := 100; END_VAR Fetch := V; END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR d : Der; i : IVal; pb : POINTER TO Base; r1, r2, r3 : DINT; END_VAR
  i := d;
  pb := ADR(d);
  r1 := i.Fetch();
  r2 := d.Fetch();
  r3 := pb^.Fetch();
END_PROGRAM`;

const CONDITION_TEMPS = `FUNCTION Fill : BOOL
  VAR_INPUT N : INT; END_VAR
  VAR_OUTPUT Arr : ARRAY[0..1] OF INT; END_VAR
  Arr[0] := N; Arr[1] := N; Fill := N > 2;
END_FUNCTION
FUNCTION_BLOCK Step
  VAR n : INT; END_VAR
  METHOD Next : BOOL VAR_OUTPUT Seen : INT; END_VAR
    n := n + 1; Seen := n; Next := n >= 3;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR s : Step; branch, loops : INT; END_VAR
  IF Fill(N := 1) THEN branch := 1;
  ELSIF Fill(N := 5) THEN branch := 2;
  ELSE branch := 3;
  END_IF;
  REPEAT loops := loops + 1; UNTIL s.Next() END_REPEAT;
END_PROGRAM`;

function library(source: string, headers?: string[]): StlibArchive {
  const lib = compileStlib([{ fileName: "l.st", source }], {
    name: "lib",
    version: "1.0.0",
    namespace: "lib",
    ...(headers ? { headers } : {}),
  });
  expect(lib.errors).toEqual([]);
  return loadStlibFromString(JSON.stringify(lib.archive), "lib");
}

const messages = (source: string, libraries: StlibArchive[] = []): string[] =>
  compile(source, { libraries }).errors.map((e) => e.message);

describe("omitted arguments", () => {
  it("takes the default of the method as declared for the static type at the call site", () => {
    const result = compile(STATIC_DEFAULTS);
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain("I->FETCH(1)");
    expect(result.cppCode).toContain("D.FETCH(100)");
  });

  it("refuses an omitted in-out on a function and on a method", () => {
    const fn = `FUNCTION Inc : BOOL VAR_IN_OUT Y : DINT; END_VAR Y := Y + 1; Inc := TRUE; END_FUNCTION
PROGRAM P VAR ok : BOOL; END_VAR ok := Inc(); END_PROGRAM`;
    expect(messages(fn)).toContain("'INC' is missing its in-out argument 'Y'");
    const method = `FUNCTION_BLOCK B METHOD Inc : BOOL VAR_IN_OUT Y : DINT; END_VAR Y := Y + 1; Inc := TRUE; END_METHOD
END_FUNCTION_BLOCK
PROGRAM P VAR b : B; ok : BOOL; END_VAR ok := b.Inc(); END_PROGRAM`;
    expect(messages(method)).toContain(
      "'INC' is missing its in-out argument 'Y'",
    );
  });

  it("refuses an omitted input of a library method with no default, and allows it on a local method", () => {
    const block = `FUNCTION_BLOCK Gate METHOD Go : DINT VAR_INPUT X : DINT; END_VAR Go := X; END_METHOD END_FUNCTION_BLOCK`;
    const program = `PROGRAM P VAR g : Gate; r : DINT; END_VAR r := g.Go(); END_PROGRAM`;
    expect(messages(`${block}\n${program}`)).toEqual([]);
    expect(messages(program, [library(block)])).toContain(
      "'GO' is missing input 'X': the library declares no default for it",
    );
    expect(
      messages(
        `PROGRAM P VAR g : Gate; r : DINT; END_VAR r := g.Go(X := 2); END_PROGRAM`,
        [library(block)],
      ),
    ).toEqual([]);
  });
});

describe("methods named like IEC operators", () => {
  it("refuses operators and conversions, as CODESYS does", () => {
    for (const name of [
      "Max",
      "Limit",
      "Sin",
      "Add",
      "Move",
      "Int_To_Real",
      "To_Int",
    ]) {
      expect(
        messages(
          `FUNCTION_BLOCK B METHOD ${name} : DINT ${name} := 0; END_METHOD END_FUNCTION_BLOCK`,
        ),
      ).toContain(
        `Method '${name.toUpperCase()}' in 'B' is named like the operator ${name.toUpperCase()}; rename it.`,
      );
    }
  });

  it("accepts standard functions that are not operators, as CODESYS does", () => {
    for (const name of [
      "Clamp",
      "Len",
      "Concat",
      "Round",
      "Atan2",
      "Memcpy",
      "Time_To_Ms",
    ]) {
      expect(
        messages(
          `FUNCTION_BLOCK B METHOD ${name} : DINT ${name} := 0; END_METHOD END_FUNCTION_BLOCK`,
        ),
      ).toEqual([]);
    }
  });

  it("refuses one declared by an interface", () => {
    expect(
      messages("INTERFACE I METHOD Limit : DINT END_METHOD END_INTERFACE"),
    ).toContain(
      "Method 'LIMIT' in 'I' is named like the operator LIMIT; rename it.",
    );
  });
});

describe("library headers", () => {
  const EXTERNAL = `FUNCTION Lamp : BOOL Lamp := TRUE; END_FUNCTION`;

  it("refuses absolute paths and . or .. segments", () => {
    for (const header of [
      "/usr/include/x.h",
      "../x.h",
      "a/./x.h",
      "a/../x.h",
    ]) {
      expect(() =>
        compileStlib([{ fileName: "l.st", source: EXTERNAL }], {
          name: "lib",
          version: "1.0.0",
          namespace: "lib",
          headers: [header],
        }),
      ).toThrow(TypeError);
    }
    expect(library(EXTERNAL, ["hmi/core.h"]).manifest.headers).toEqual([
      "hmi/core.h",
    ]);
  });

  it("includes only the headers of libraries the unit uses", () => {
    const archive = library(EXTERNAL, ["lamp.h"]);
    const unused = compile(
      "PROGRAM P VAR x : INT; END_VAR x := 1; END_PROGRAM",
      {
        libraries: [archive],
      },
    );
    expect(unused.errors).toEqual([]);
    expect(unused.headerCode).not.toContain('#include "lamp.h"');
    const used = compile(
      "PROGRAM P VAR x : BOOL; END_VAR x := Lamp(); END_PROGRAM",
      { libraries: [archive] },
    );
    expect(used.errors).toEqual([]);
    expect(used.headerCode).toContain('#include "lamp.h"');
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("omitted arguments compiled and run with g++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-callargs-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("dispatches with the static type's defaults", () => {
    const result = compile(STATIC_DEFAULTS);
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "static_type_defaults",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld %lld %lld\\n", (long long)p.R1.get(), (long long)p.R2.get(), (long long)p.R3.get());
  return 0;
}`,
    });
    expect(out.trim()).toBe("1 100 1");
  });

  it("declares omitted outputs of ELSIF and UNTIL conditions, array outputs included", () => {
    const result = compile(CONDITION_TEMPS);
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "condition_temps",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%d %d\\n", (int)p.BRANCH.get(), (int)p.LOOPS.get());
  return 0;
}`,
    });
    expect(out.trim()).toBe("2 3");
  });
});

const CALLEE_SCOPE = `FUNCTION_BLOCK Fb
  VAR CONSTANT Lim : DINT := 7; Twice : DINT := Lim * 2; END_VAR
  VAR k : DINT := 3; END_VAR
  METHOD M : DINT VAR_INPUT a : DINT := Lim; END_VAR M := a; END_METHOD
  METHOD N : DINT VAR_INPUT a : DINT := Twice + 1; END_VAR N := a; END_METHOD
  METHOD Kd : DINT VAR_INPUT a : DINT := k; END_VAR Kd := a; END_METHOD
  METHOD Len : DINT Len := 42; END_METHOD
  METHOD Round : DINT Round := 1; END_METHOD
  METHOD UseOwn : DINT UseOwn := Len() + Round(); END_METHOD
END_FUNCTION_BLOCK`;

const CALLER = `PROGRAM P
  VAR f : Fb; r : DINT; END_VAR
  r := f.M() * 10000 + f.N() * 100 + f.UseOwn() + f.Kd(a := 0);
END_PROGRAM
CONFIGURATION C RESOURCE R ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1);
  PROGRAM I WITH T : P; END_RESOURCE END_CONFIGURATION`;

describe("method defaults resolve in the callee", () => {
  it("reads the callee's constants, locally and through a library", () => {
    const local = compile(`${CALLEE_SCOPE}\n${CALLER}`);
    expect(local.errors).toEqual([]);
    expect(local.cppCode).toContain("F.M((7))");
    const linked = compile(CALLER, { libraries: [library(CALLEE_SCOPE)] });
    expect(linked.errors).toEqual([]);
    expect(linked.cppCode).toContain("F.M((7))");
  });

  it("warns about a default that reads a variable of the block, and requires the argument", () => {
    const local = compile(
      `${CALLEE_SCOPE}\nPROGRAM Q VAR f : Fb; r : DINT; END_VAR r := f.Kd(); END_PROGRAM`,
    );
    expect(compile(CALLEE_SCOPE).warnings.map((w) => w.message)).toContain(
      "The default of 'A' in method 'KD' reads K, which is not constant; callers must pass it.",
    );
    expect(local.errors.map((e) => e.message)).toContain(
      "'KD' is missing input 'A': its default is not constant",
    );
    expect(
      messages(
        "PROGRAM Q VAR f : Fb; r : DINT; END_VAR r := f.Kd(); END_PROGRAM",
        [library(CALLEE_SCOPE)],
      ),
    ).toContain("'KD' is missing input 'A': its default is not constant");
  });

  it("types a call to the block's own method by the method, not the standard function", () => {
    expect(
      messages(`FUNCTION_BLOCK Q
  VAR n : INT; END_VAR
  METHOD Concat : BOOL Concat := TRUE; END_METHOD
  METHOD Step : INT IF Concat() THEN n := n + 1; END_IF; Step := n; END_METHOD
END_FUNCTION_BLOCK`),
    ).toEqual([]);
  });

  it("calls the block's own method before a standard function of the same name", () => {
    const result = compile(`${CALLEE_SCOPE}\n${CALLER}`);
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toMatch(/LEN\(\) \+ (this->)?ROUND\(\)/);
  });
});

describeIfGpp("method defaults compiled and run with g++", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-calleescope-"));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (name: string, result: ReturnType<typeof compile>): string => {
    const sub = path.join(dir, name);
    fs.mkdirSync(sub, { recursive: true });
    const files: Array<{ name: string; content: string }> = [
      { name: "generated.hpp", content: result.headerCode },
      ...(result.libraryHeader ? [result.libraryHeader] : []),
      ...(result.cppFiles.length > 0
        ? result.cppFiles
        : [{ name: "generated.cpp", content: result.cppCode }]),
      {
        name: "main.cpp",
        content: `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_C c;
int main() { c.I.run(); std::printf("%lld\\n", (long long)c.I.R.get()); return 0; }`,
      },
    ];
    for (const f of files) fs.writeFileSync(path.join(sub, f.name), f.content);
    const sources = files
      .filter((f) => f.name.endsWith(".cpp"))
      .map((f) => `"${path.join(sub, f.name)}"`)
      .join(" ");
    const bin = path.join(sub, "run");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${sub}" -o "${bin}" ${sources}`,
      { encoding: "utf-8", env: cxxEnv },
    );
    return execSync(`"${bin}"`, { encoding: "utf-8" }).trim();
  };

  it("runs a local block's defaults and own methods", () => {
    const result = compile(`${CALLEE_SCOPE}\n${CALLER}`, {
      headerFileName: "generated.hpp",
    });
    expect(result.errors).toEqual([]);
    expect(run("local", result)).toBe("71543");
  });

  it("runs a library block's defaults and own methods", () => {
    const result = compile(CALLER, {
      headerFileName: "generated.hpp",
      libraries: [library(CALLEE_SCOPE)],
      separateLibraryFiles: true,
    });
    expect(result.errors).toEqual([]);
    expect(run("library", result)).toBe("71543");
  });
});
