/**
 * `__SYSTEM.TYPE_CLASS.<member>` — the constants CODESYS code compares a
 * generic parameter's class against:
 *
 *   CASE In.TypeClass OF
 *     __SYSTEM.TYPE_CLASS.TYPE_INT: pInt := In.pValue; ...
 *
 * iec_type_class.hpp defines every enumerator so such code resolves, but the
 * ST front end treated `__SYSTEM` as an undeclared variable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { TYPE_CLASS_MEMBERS } from "../../src/semantic/type-utils.js";
import { hasGpp, RUNTIME_INCLUDE_PATH, cxxEnv, CXX_STD } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const TO_REAL_FN = `
FUNCTION AnyToReal : REAL
VAR_INPUT
  In : ANY_NUM;
END_VAR
VAR
  pI : POINTER TO INT;
  pR : POINTER TO REAL;
END_VAR
  CASE In.TypeClass OF
  __SYSTEM.TYPE_CLASS.TYPE_INT:
    pI := In.pValue;
    AnyToReal := INT_TO_REAL(pI^);
  __SYSTEM.TYPE_CLASS.TYPE_REAL:
    pR := In.pValue;
    AnyToReal := pR^;
  ELSE
    AnyToReal := -1.0;
  END_CASE;
END_FUNCTION
`;

describe("__SYSTEM.TYPE_CLASS constants", () => {
  it("lists exactly the enumerators the runtime header defines", () => {
    const hpp = fs.readFileSync(path.join(RUNTIME_INCLUDE_PATH, "iec_type_class.hpp"), "utf-8");
    const body = /enum TYPE_CLASS : uint32_t \{([\s\S]*?)\};/.exec(hpp)![1]!;
    const fromHeader = [...body.matchAll(/(TYPE_\w+)\s*=/g)].map((m) => m[1]);
    expect([...TYPE_CLASS_MEMBERS]).toEqual(fromHeader);
  });

  it("compiles in a comparison and as CASE labels, in any letter case", () => {
    const result = compile(
      TO_REAL_FN +
        `FUNCTION IsInt : BOOL
VAR_INPUT In : ANY_NUM; END_VAR
  IsInt := In.typeclass = __system.type_class.type_int;
END_FUNCTION`,
      {},
    );
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.cppCode).toContain("strucpp::TYPE_CLASS::TYPE_INT");
    expect(result.cppCode).toContain("strucpp::TYPE_CLASS::TYPE_REAL");
  });

  it("rejects a member TYPE_CLASS does not have", () => {
    const result = compile(
      `FUNCTION F : BOOL
VAR_INPUT In : ANY_NUM; END_VAR
  F := In.TypeClass = __SYSTEM.TYPE_CLASS.TYPE_FLOAT;
END_FUNCTION`,
      {},
    );
    expect(result.errors.map((e) => e.message)).toContain(
      "'TYPE_FLOAT' is not a member of __SYSTEM.TYPE_CLASS",
    );
  });
});

describeIfGpp("reading a generic parameter by its class", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-typeclass-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns the caller's INT and REAL through pValue", () => {
    const source =
      TO_REAL_FN +
      `PROGRAM Main
VAR
  i : INT := -300;
  r : REAL := 1.25;
  d : DINT := 7;
  fromInt : REAL;
  fromReal : REAL;
  fromDint : REAL;
END_VAR
  fromInt := AnyToReal(i);
  fromReal := AnyToReal(r);
  fromDint := AnyToReal(d);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);

    const dir = path.join(tempDir, "typeclass");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
int main() {
  g_config.INSTANCE0.run();
  printf("%g %g %g\\n", (double)g_config.INSTANCE0.FROMINT.get(),
         (double)g_config.INSTANCE0.FROMREAL.get(), (double)g_config.INSTANCE0.FROMDINT.get());
  return 0;
}
`,
    );
    const bin = path.join(dir, "typeclass");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    // DINT has no CASE branch, so it takes ELSE
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("-300 1.25 -1");
  });
});
