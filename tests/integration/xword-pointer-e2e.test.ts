// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * E2E for the __XWORD pointer-width address type: ADR()/REF_LINK() return
 * __XWORD, a __XWORD temp round-trips an address to a typed pointer, and a
 * user function may use __XWORD as a generic pointer-sized return.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

describe.skipIf(!hasGpp)("__XWORD pointer-width address type", () => {
  let tempDir: string;
  let pchPath: string;
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-xword-"));
    pchPath = createPCH(tempDir);
  });
  afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  it("ADR -> __XWORD temp -> typed pointer round-trips (write through pointer)", () => {
    const result = compile(`
      PROGRAM Main
        VAR
          v : INT := 5;
          addr : __XWORD;
          p : POINTER TO INT;
          out : INT;
        END_VAR
        addr := ADR(v);   (* IEC_XWORD := &(v)        — address into the temp  *)
        p := addr;        (* IEC_Ptr<int> := IEC_XWORD — address into a pointer *)
        p^ := 42;         (* write through the pointer                          *)
        out := v;         (* v is now 42 if the address round-tripped           *)
      END_PROGRAM
    `);
    expect(result.success).toBe(true);

    const stdout = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode!,
      cppCode: result.cppCode!,
      testName: "xword_adr_roundtrip",
      mainCode: `
#include <iostream>
int main() {
    strucpp::Program_MAIN prog;
    prog.run();
    std::cout << static_cast<int>(prog.OUT) << std::endl;
    return 0;
}
`,
    });
    expect(stdout).toBe("42");
  });

  it("a user function may return __XWORD and be used as a generic pointer", () => {
    // Compilation is the contract here: __XWORD is a first-class declarable
    // type on a user FUNCTION, and its result assigns to a typed pointer.
    const result = compile(`
      FUNCTION MAKE_PTR : __XWORD
        VAR_INPUT x : INT; END_VAR
        MAKE_PTR := ADR(x);
      END_FUNCTION

      PROGRAM Main
        VAR a : INT := 9; p : POINTER TO INT; END_VAR
        p := MAKE_PTR(a);
      END_PROGRAM
    `);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });
});
