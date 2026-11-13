// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Method calls with omitted inputs and named arguments: the call takes the declared defaults and binds each named
 * argument to its own parameter, for the unit's own methods, interface methods and library methods.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const BLOCK = `INTERFACE ICount
  METHOD Bump : DINT VAR_INPUT V : DINT := 5; W : DINT := 0; END_VAR END_METHOD
END_INTERFACE
FUNCTION_BLOCK Counter IMPLEMENTS ICount
  VAR c : DINT; END_VAR
  METHOD Bump : DINT
    VAR_INPUT V : DINT := 5; W : DINT := 0; END_VAR
    c := c + V * 10 + W;
    Bump := c;
  END_METHOD
  METHOD Split : DINT
    VAR_INPUT A : DINT := 1; END_VAR
    VAR_OUTPUT Half : DINT; END_VAR
    Half := A / 2;
    Split := A;
  END_METHOD
  METHOD Inner : DINT
    Inner := Bump(W := 2) + THIS^.Bump();
  END_METHOD
END_FUNCTION_BLOCK`;

const PROGRAM = `PROGRAM P
  VAR k : Counter; i : ICount; r1, r2, r3, r4, r5, h : DINT; END_VAR
  r1 := k.Bump();
  r2 := k.Bump(W := 1);
  r3 := k.Split(8, Half => h);
  i := k;
  r4 := i.Bump(V := 1);
  r5 := k.Inner();
END_PROGRAM`;

describe("method call arguments", () => {
  it("fills omitted inputs with their defaults and binds named arguments by name", () => {
    const result = compile(`${BLOCK}\n${PROGRAM}`);
    expect(result.errors).toEqual([]);
    const calls = result.cppCode.match(/K\.(BUMP|SPLIT)\([^;]*\)/g) ?? [];
    expect(calls).toContain("K.BUMP(5, 0)");
    expect(calls).toContain("K.BUMP(5, 1)");
    expect(calls).toContain("K.SPLIT(8, H)");
    expect(result.cppCode).toContain("I->BUMP(1, 0)");
  });

  it("exports method defaults and fills them in a library's consumer", () => {
    const lib = compileStlib([{ fileName: "c.st", source: BLOCK }], {
      name: "counters",
      version: "1.0.0",
      namespace: "counters",
    });
    expect(lib.errors).toEqual([]);
    const archive = loadStlibFromString(
      JSON.stringify(lib.archive),
      "counters",
    );
    const bump = archive.manifest.functionBlocks
      .find((f) => f.name === "COUNTER")
      ?.methods?.find((m) => m.name === "BUMP");
    expect(bump?.inputs.map((v) => v.initialValue)).toEqual(["5", "0"]);
    const result = compile(PROGRAM, { libraries: [archive] });
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain("K.BUMP(5, 1)");
    expect(result.cppCode).toContain("I->BUMP(1, 0)");
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("method call arguments compiled and run with g++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-methodargs-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs defaults, named arguments, outputs and own-method calls", () => {
    const result = compile(`${BLOCK}\n${PROGRAM}`);
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "method_call_arguments",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld %lld %lld %lld %lld %lld\\n", (long long)p.R1.get(), (long long)p.R2.get(),
    (long long)p.R3.get(), (long long)p.H.get(), (long long)p.R4.get(), (long long)p.R5.get());
  return 0;
}`,
    });
    expect(out.trim()).toBe("50 101 8 4 111 376");
  });
});
