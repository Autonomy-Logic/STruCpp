/**
 * IL Transpiler Tests
 *
 * Tests the full IL→ST transpilation pipeline including detection,
 * parsing, and code generation.
 */

import { describe, it, expect } from "vitest";
import { transpileILSource } from "../../src/il/il-transpiler.js";
import { isILBody } from "../../src/il/il-detector.js";
import { parseILBody } from "../../src/il/il-parser.js";
import { compile } from "../../src/index.js";

describe("IL Detection", () => {
  it("should detect IL body starting with LD", () => {
    expect(isILBody("LD x\nST y\n")).toBe(true);
  });

  it("should detect IL body starting with label", () => {
    expect(isILBody("start:\nLD x\n")).toBe(true);
  });

  it("should detect ST body with semicolons", () => {
    expect(isILBody("x := 42;\n")).toBe(false);
  });

  it("should detect ST body with IF statement", () => {
    expect(isILBody("IF x THEN\n  y := 1;\nEND_IF;\n")).toBe(false);
  });

  it("should handle empty body as ST", () => {
    expect(isILBody("")).toBe(false);
    expect(isILBody("  \n  \n")).toBe(false);
  });

  it("should handle comments-only body as ST", () => {
    expect(isILBody("(* just a comment *)")).toBe(false);
  });
});

describe("IL Parser", () => {
  it("should parse LD and ST instructions", () => {
    const result = parseILBody("LD x\nST y\n");
    expect(result.errors).toHaveLength(0);
    expect(result.instructions).toHaveLength(2);
    expect(result.instructions[0]).toMatchObject({ operator: "LD", operand: "x" });
    expect(result.instructions[1]).toMatchObject({ operator: "ST", operand: "y" });
  });

  it("should parse labels", () => {
    const result = parseILBody("start:\nLD x\n");
    expect(result.errors).toHaveLength(0);
    expect(result.instructions).toHaveLength(1);
    expect(result.instructions[0]).toMatchObject({ operator: "LD", operand: "x", label: "start" });
    expect(result.hasControlFlow).toBe(true);
  });

  it("should parse arithmetic operators", () => {
    const result = parseILBody("LD x\nADD 1\nSUB y\nMUL 2\nDIV z\n");
    expect(result.errors).toHaveLength(0);
    expect(result.instructions).toHaveLength(5);
  });

  it("should parse comparison operators", () => {
    const result = parseILBody("LD x\nEQ 0\n");
    expect(result.errors).toHaveLength(0);
    expect(result.instructions[1]).toMatchObject({ operator: "EQ", operand: "0" });
  });

  it("should parse jump instructions and mark hasControlFlow", () => {
    const result = parseILBody("LD x\nJMPC label1\nlabel1:\nST y\n");
    expect(result.hasControlFlow).toBe(true);
  });

  it("should parse CAL with parameters", () => {
    const result = parseILBody("CAL fb1(IN:=5, PT:=T#1s)\n");
    expect(result.errors).toHaveLength(0);
    const instr = result.instructions[0] as { operator: string; operand: string; callParams?: Array<{ name: string; value: string }> };
    expect(instr.operator).toBe("CAL");
    expect(instr.operand).toBe("fb1");
    expect(instr.callParams).toHaveLength(2);
  });

  it("should skip comments", () => {
    const result = parseILBody("(* comment *)\nLD x\n(* another *)\nST y\n");
    expect(result.instructions).toHaveLength(2);
  });

  it("should report unknown operators", () => {
    const result = parseILBody("FOO x\n");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Unknown IL operator");
  });
});

describe("IL to ST Conversion - Straight Line", () => {
  it("should convert simple LD/ST to assignment", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR x : INT; y : INT; END_VAR
LD x
ST y
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stSource).toContain("y := x;");
  });

  it("should convert arithmetic chain", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR a : INT; b : INT; result : INT; END_VAR
LD a
ADD b
ST result
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("result := (a + b);");
  });

  it("should convert boolean operations", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR a : BOOL; b : BOOL; c : BOOL; END_VAR
LD a
AND b
ST c
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("c := (a AND b);");
  });

  it("should convert NOT operator", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR a : BOOL; b : BOOL; END_VAR
LD a
NOT
ST b
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("b := NOT (a);");
  });

  it("should convert comparison operators", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR x : INT; result : BOOL; END_VAR
LD x
EQ 0
ST result
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("result := (x = 0);");
  });

  it("should convert S and R operators", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR cond : BOOL; flag : BOOL; END_VAR
LD cond
S flag
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("IF cond THEN flag := TRUE; END_IF;");
  });

  it("should not transpile ST bodies", () => {
    const source = `
PROGRAM Test
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
    `;
    const result = transpileILSource(source);
    expect(result.hasIL).toBe(false);
    expect(result.stSource).toBe(source);
  });
});

describe("IL to ST Conversion - Control Flow", () => {
  it("should convert simple jump pattern to state machine", () => {
    const result = transpileILSource(`
FUNCTION_BLOCK Test
  VAR_INPUT x : INT; END_VAR
  VAR_OUTPUT y : BOOL; END_VAR
LD x
EQ 0
JMPC done
LD FALSE
ST y
JMP exit
done:
LD TRUE
ST y
exit:
END_FUNCTION_BLOCK
    `);
    expect(result.hasIL).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stSource).toContain("CASE __IL_STATE OF");
    expect(result.stSource).toContain("UNTIL FALSE END_REPEAT");
  });
});

describe("IL End-to-End Compilation", () => {
  it("should compile simple IL program to C++", () => {
    const result = compile(`
PROGRAM ILTest
  VAR x : INT; y : INT; END_VAR
LD x
ADD 1
ST y
END_PROGRAM
    `);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.cppCode).toContain("ILTEST");
  });

  it("should compile IL with control flow to C++", () => {
    const result = compile(`
FUNCTION_BLOCK State_Display
  VAR_INPUT State : INT; END_VAR
  VAR_OUTPUT
    Stopped_led : BOOL;
    Running_led : BOOL;
  END_VAR

LD State
EQ 0
JMPC stopped
LD FALSE
ST Stopped_led
LD TRUE
ST Running_led
JMP done
stopped:
LD TRUE
ST Stopped_led
LD FALSE
ST Running_led
done:
END_FUNCTION_BLOCK
    `);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.cppCode).toContain("STATE_DISPLAY");
  });

  it("should compile the real OpenPLC State_Display IL file", () => {
    const fs = require("fs");
    const source = fs.readFileSync(
      "/Users/thiagoralves/Documents/PLC Progs/Irrigation Controller/pous/function-blocks/State_Display.il",
      "utf8",
    );
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
