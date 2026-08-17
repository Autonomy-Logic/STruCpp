/**
 * The generated debug table has to compile.
 *
 * `debugTableCpp` addresses every leaf variable by name through
 * `&g_config.INSTANCE.MEMBER...`, so it only builds if every one of those names
 * matches what codegen actually declared. Nothing else in the pipeline checks
 * that: `strucpp file.st` emits no debug table, and `--build` (the REPL binary)
 * does not include one either. The ST compiles, the program's C++ compiles, and
 * the failure appears only in a full firmware build, in a file the user never
 * wrote.
 *
 * That gap let the member-mangling rule drift between the class definition and
 * the table, in both directions — mangling too little named a member that does
 * not exist (`RunningLights : RunningLights` is declared `RUNNINGLIGHTS_`),
 * mangling too much did the same in reverse (`Time : TIME` is declared plain
 * `TIME`). Each case below fails to compile if the two disagree.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { hasGpp } from "./test-helpers.js";

const RUNTIME_INCLUDE = path.resolve(__dirname, "../../src/runtime/include");

const describeIfGpp = hasGpp ? describe : describe.skip;

const CFG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

const MOTOR = `
FUNCTION_BLOCK Motor
VAR_INPUT run : BOOL; END_VAR
VAR_OUTPUT spinning : BOOL; END_VAR
  spinning := run;
END_FUNCTION_BLOCK`;

describeIfGpp("generated debug table compiles", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dbgtable-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Compile ST, then syntax-check the generated debug table against the
   * generated header. Returns g++'s output, empty when it compiled.
   */
  function buildDebugTable(source: string, testName: string): string {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.debugTableCpp, "no debug table was generated").toBeTruthy();

    const dir = path.join(tempDir, testName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    const tablePath = path.join(dir, "generated_debug.cpp");
    fs.writeFileSync(tablePath, result.debugTableCpp!);

    try {
      execSync(
        `g++ -std=c++17 -fsyntax-only -I"${RUNTIME_INCLUDE}" -I"${dir}" "${tablePath}" 2>&1`,
        { encoding: "utf-8" },
      );
      return "";
    } catch (e) {
      return (e as { stdout?: string }).stdout ?? String(e);
    }
  }

  it("compiles for a member whose name matches its type, in a PROGRAM", () => {
    expect(
      buildDebugTable(
        `${MOTOR}
PROGRAM Main
VAR Motor : Motor; plain : BOOL; END_VAR
  Motor(run := plain);
END_PROGRAM${CFG}`,
        "program_var",
      ),
    ).toBe("");
  });

  it("compiles for the same member one scope in, inside a FUNCTION_BLOCK", () => {
    // Used to fail: "no member named 'MOTOR' in 'strucpp::RIG'".
    expect(
      buildDebugTable(
        `${MOTOR}
FUNCTION_BLOCK Rig
VAR Motor : Motor; idle : BOOL; END_VAR
  Motor(run := idle);
END_FUNCTION_BLOCK
PROGRAM Main
VAR r : Rig; END_VAR
  r();
END_PROGRAM${CFG}`,
        "fb_member",
      ),
    ).toBe("");
  });

  it("compiles for a STRUCT field whose name matches its type", () => {
    // Used to fail: "no member named 'INNER' in 'strucpp::RIG'".
    expect(
      buildDebugTable(
        `
TYPE
  Inner : STRUCT v : BOOL; w : INT; END_STRUCT;
  Rig : STRUCT Inner : Inner; plain : BOOL; END_STRUCT;
END_TYPE
PROGRAM Main
VAR r : Rig; END_VAR
  r.plain := FALSE;
END_PROGRAM${CFG}`,
        "struct_field",
      ),
    ).toBe("");
  });

  it("compiles for a member colliding with an implemented interface method", () => {
    // Used to fail: "cannot create a non-constant pointer to member function"
    // — the table took the address of the method rather than the variable.
    expect(
      buildDebugTable(
        `
INTERFACE IMotor
  METHOD Start : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Drive IMPLEMENTS IMotor
VAR Start : BOOL; other : INT; END_VAR
  METHOD Start : BOOL
    Start := TRUE;
  END_METHOD
  other := 1;
END_FUNCTION_BLOCK
PROGRAM Main
VAR d : Drive; END_VAR
  d();
END_PROGRAM${CFG}`,
        "iface_method",
      ),
    ).toBe("");
  });

  it("compiles for variables named after elementary types", () => {
    // The inverse failure: mangling these would address a `TIME_` that codegen
    // never declared.
    expect(
      buildDebugTable(
        `
PROGRAM Main
VAR Time : TIME; Word : WORD; Date : DATE; Real : REAL; END_VAR
  Time := T#0s;
END_PROGRAM${CFG}`,
        "elementary_names",
      ),
    ).toBe("");
  });

  it("compiles for elementary-named members of an FB and a STRUCT", () => {
    expect(
      buildDebugTable(
        `
TYPE Bag : STRUCT Time : TIME; Word : WORD; END_STRUCT; END_TYPE
FUNCTION_BLOCK Holder
VAR Time : TIME; b : Bag; END_VAR
  Time := T#0s;
END_FUNCTION_BLOCK
PROGRAM Main
VAR h : Holder; g : Bag; END_VAR
  h();
END_PROGRAM${CFG}`,
        "elementary_nested",
      ),
    ).toBe("");
  });

  it("compiles for a variable named after an enum type", () => {
    expect(
      buildDebugTable(
        `
TYPE Color : (Red, Green, Blue); END_TYPE
PROGRAM Main
VAR Color : Color; plain : BOOL; END_VAR
  plain := FALSE;
END_PROGRAM${CFG}`,
        "enum_name",
      ),
    ).toBe("");
  });

  it("compiles for an ordinary project with arrays and nested structs", () => {
    // A broad shape check, so this file also guards the table's other address
    // forms against the next change to the walker.
    //
    // Deliberately 1-dimensional: the table indexes a multi-dimensional array as
    // `[i][j]`, which `Array2D`/`Array3D` have no operator for, so any project
    // with one fails here. That is a separate pre-existing defect, fixed by the
    // `formatArrayElementAccess` change on the structure-initialization branch
    // (PR #205); add the 2D case to this test once that lands.
    expect(
      buildDebugTable(
        `
TYPE
  Point : STRUCT x : REAL; y : REAL; END_STRUCT;
  Frame : STRUCT origin : Point; label : BOOL; END_STRUCT;
END_TYPE
PROGRAM Main
VAR
  grid : ARRAY[0..2] OF Point;
  frame : Frame;
  counts : ARRAY[1..4] OF INT;
  flag : BOOL;
END_VAR
  flag := FALSE;
END_PROGRAM${CFG}`,
        "ordinary",
      ),
    ).toBe("");
  });
});
