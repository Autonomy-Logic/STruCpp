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
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

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
