/**
 * Generated C++ that builds and runs for:
 *   - globals (GVL and configuration, single and array) and user types whose
 *     type is a STRUCT from a linked library
 *   - function blocks with ARRAY[*] VAR_IN_OUT members, defined in the unit
 *     and in a library
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile, compileStlib } from "../../src/index.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const library = (name: string, source: string): StlibArchive => {
  const r = compileStlib([{ fileName: `${name}.st`, source }], {
    name,
    version: "1.0.0",
    namespace: name.replace(/-/g, "_"),
  });
  expect(r.success, JSON.stringify(r.errors)).toBe(true);
  return r.archive;
};

const ALARM_LIB = `
TYPE HMI_ALARM_ENTRY : STRUCT
  Active, Acked, AckReq : BOOL;
  Severity : USINT;
  RaisedAt : DT;
  Message : STRING(80);
END_STRUCT END_TYPE
`;

const FILL_VIEW_FB = `
FUNCTION_BLOCK FillView
VAR_IN_OUT a : ARRAY[*] OF INT; m : ARRAY[*, *] OF INT; n : INT; END_VAR
VAR i : DINT; END_VAR
FOR i := LOWER_BOUND(a, 1) TO UPPER_BOUND(a, 1) DO
  a[i] := TO_INT(i) * 10;
END_FOR;
m[UPPER_BOUND(m, 1), UPPER_BOUND(m, 2)] := 99;
n := n + 1;
END_FUNCTION_BLOCK
`;

const FILL_VIEW_PROGRAM = `
PROGRAM Main
VAR
  f : FillView;
  arr : ARRAY[3..5] OF INT;
  mat : ARRAY[0..1, 1..2] OF INT;
  k : INT := 4;
END_VAR
f(a := arr, m := mat, n := k);
f(a := arr, m := mat, n := k);
END_PROGRAM
`;

const FILL_VIEW_MAIN = `    Program_MAIN p; p.run();
    std::cout << p.ARR[3].get() << " " << p.ARR[5].get() << " "
              << p.MAT(1, 2).get() << " " << p.K.get() << std::endl;`;

describe.skipIf(!hasGpp)(
  "library types and function block views — generated C++",
  () => {
    let tempDir: string;
    let pchPath: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "strucpp-libtypes-views-"),
      );
      pchPath = createPCH(tempDir);
    });

    afterAll(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function run(
      source: string,
      libraries: StlibArchive[],
      mainBody: string,
      testName: string,
    ): string {
      const result = compile(source, {
        libraries,
        headerFileName: "generated.hpp",
      });
      expect(result.errors.map((e) => e.message)).toEqual([]);
      expect(result.success).toBe(true);
      return compileAndRunStandalone({
        tempDir,
        pchPath,
        headerCode: result.headerCode,
        cppCode: result.cppCode,
        testName,
        mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
      });
    }

    it("globals and user types of a library STRUCT type build and run", () => {
      const source = `
TYPE ALARM_WRAP : STRUCT Entry : HMI_ALARM_ENTRY; END_STRUCT END_TYPE
VAR_GLOBAL
  Alarms : ARRAY[1..10] OF HMI_ALARM_ENTRY;
  Single : HMI_ALARM_ENTRY;
END_VAR
PROGRAM Main
VAR_EXTERNAL
  Alarms : ARRAY[1..10] OF HMI_ALARM_ENTRY;
  Single : HMI_ALARM_ENTRY;
  CfgAlarms : ARRAY[0..1] OF HMI_ALARM_ENTRY;
  CfgSingle : HMI_ALARM_ENTRY;
END_VAR
VAR w : ALARM_WRAP; o1, o2, o3, o4, o5 : INT; END_VAR
Alarms[2].Severity := 7;
Single.Severity := 8;
CfgAlarms[1].Severity := 3;
CfgSingle.Severity := 4;
w.Entry.Severity := 5;
o1 := USINT_TO_INT(Alarms[2].Severity);
o2 := USINT_TO_INT(Single.Severity);
o3 := USINT_TO_INT(CfgAlarms[1].Severity);
o4 := USINT_TO_INT(CfgSingle.Severity);
o5 := USINT_TO_INT(w.Entry.Severity);
END_PROGRAM
CONFIGURATION Cfg
  VAR_GLOBAL CfgAlarms : ARRAY[0..1] OF HMI_ALARM_ENTRY; CfgSingle : HMI_ALARM_ENTRY; END_VAR
  RESOURCE Res ON PLC
    TASK T1(INTERVAL := T#10ms, PRIORITY := 1);
    PROGRAM Inst WITH T1 : Main;
  END_RESOURCE
END_CONFIGURATION
`;
      const out = run(
        source,
        [library("alarm-lib", ALARM_LIB)],
        `    Program_MAIN p(&CFGALARMS, &CFGSINGLE); p.run();
    std::cout << p.O1.get() << " " << p.O2.get() << " " << p.O3.get() << " "
              << p.O4.get() << " " << p.O5.get() << std::endl;`,
        "lib_struct_globals",
      );
      expect(out).toBe("7 8 3 4 5");
    });

    it("a function block writes through its ARRAY[*] in-outs", () => {
      const out = run(
        FILL_VIEW_FB + FILL_VIEW_PROGRAM,
        [],
        FILL_VIEW_MAIN,
        "fb_array_view_inout",
      );
      expect(out).toBe("30 50 99 6");
    });

    it("a library function block writes through its ARRAY[*] in-outs", () => {
      const out = run(
        FILL_VIEW_PROGRAM,
        [library("fill-lib", FILL_VIEW_FB)],
        FILL_VIEW_MAIN,
        "lib_fb_array_view_inout",
      );
      expect(out).toBe("30 50 99 6");
    });
  },
);
