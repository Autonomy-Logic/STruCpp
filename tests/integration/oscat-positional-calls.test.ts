// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Positional calls to bundled OSCAT functions whose declarations hold local or constant variable blocks: only the
 * VAR_INPUT, VAR_OUTPUT and VAR_IN_OUT variables are parameters, so the call passes exactly those. Run with g++.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { discoverStlibs } from "../../src/node/library-loader.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const LIBS_DIR = path.resolve(__dirname, "../../libs");

const PROGRAM = `PROGRAM P
VAR ok : BOOL; s : STRING := 'a,b'; d : DWORD := 16#1; END_VAR
ok := LIST_ADD(44, 'c', s);
d := BIT_LOAD_DW(d, TRUE, 3);
END_PROGRAM`;

function compileProgram(): ReturnType<typeof compile> {
  return compile(PROGRAM, { libraries: discoverStlibs(LIBS_DIR) });
}

describe("positional calls to OSCAT functions", () => {
  it("lists only VAR_INPUT, VAR_OUTPUT and VAR_IN_OUT variables as parameters", () => {
    const oscat = discoverStlibs(LIBS_DIR).find(
      (a) => a.manifest.name === "oscat-basic",
    );
    const params = (name: string): string[] =>
      oscat?.manifest.functions
        .find((f) => f.name === name)
        ?.parameters.map((p) => `${p.name}:${p.direction}`) ?? [];
    expect(params("LIST_ADD")).toEqual([
      "SEP:input",
      "INS:input",
      "LIST:inout",
    ]);
    expect(params("BIT_LOAD_DW")).toEqual([
      "IN:input",
      "VAL:input",
      "POS:input",
    ]);
  });

  it("passes one argument per parameter", () => {
    const result = compileProgram();
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain(
      'OK = LIST_ADD(static_cast<IEC_BYTE>(44), "c", S);',
    );
    expect(result.cppCode).toContain("D = BIT_LOAD_DW(D, true, 3);");
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("positional calls to OSCAT functions compiled with g++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-oscat-pos-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs LIST_ADD and BIT_LOAD_DW called positionally", () => {
    const result = compileProgram();
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "oscat_positional",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%d %u\\n", (int)p.OK.get(), (unsigned)p.D.get());
  return 0;
}`,
    });
    expect(out).toBe("1 9");
  });
});
