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

  it("should treat unknown identifiers as function calls", () => {
    const result = parseILBody("BCD_TO_INT\n");
    expect(result.errors).toHaveLength(0);
    expect(result.instructions).toHaveLength(1);
    const instr = result.instructions[0] as { operator: string; functionName?: string };
    expect(instr.operator).toBe("FUNC_CALL");
    expect(instr.functionName).toBe("BCD_TO_INT");
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

  it("should convert implicit FB invocation operators", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR x : BOOL; fb1 : TON; END_VAR
LD x
IN fb1
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("fb1.IN := x;");
    expect(result.stSource).toContain("fb1();");
  });

  it("should convert parenthesized expressions", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR a : BOOL; b : BOOL; c : BOOL; d : BOOL; r : BOOL; END_VAR
LD a
AND b
OR( c
ANDN d
)
ST r
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.errors).toHaveLength(0);
    // Should produce nested expression with correct grouping
    expect(result.stSource).toContain("OR");
    expect(result.stSource).toContain("AND NOT d");
    expect(result.stSource).toContain("r :=");
  });

  it("should convert CAL with parameters", () => {
    const result = transpileILSource(`
PROGRAM Test
  VAR tmr : TON; END_VAR
CAL tmr(IN := TRUE, PT := T#5s)
END_PROGRAM
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("tmr(IN := TRUE, PT := T#5s);");
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

  it("should convert inline function calls in IL", () => {
    const result = transpileILSource(`
FUNCTION Convert : INT
  VAR_INPUT raw : WORD; tare : INT; END_VAR
LD raw
BCD_TO_INT
SUB tare
ST Convert
END_FUNCTION
    `);
    expect(result.hasIL).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stSource).toContain("BCD_TO_INT(raw)");
    expect(result.stSource).toContain("- tare");
  });

  it("should handle mixed IL and ST POUs in same file", () => {
    const result = transpileILSource(`
PROGRAM STProgram
  VAR x : INT; END_VAR
  x := x + 1;
END_PROGRAM

FUNCTION_BLOCK ILBlock
  VAR_INPUT a : BOOL; END_VAR
  VAR_OUTPUT b : BOOL; END_VAR
LD a
NOT
ST b
END_FUNCTION_BLOCK
    `);
    expect(result.hasIL).toBe(true);
    expect(result.errors).toHaveLength(0);
    // ST program should be unchanged
    expect(result.stSource).toContain("x := x + 1;");
    // IL block should be transpiled
    expect(result.stSource).toContain("b := NOT (a);");
  });

  it("should convert FUNCTION with IL body", () => {
    const result = transpileILSource(`
FUNCTION AddOne : INT
  VAR_INPUT x : INT; END_VAR
LD x
ADD 1
ST AddOne
END_FUNCTION
    `);
    expect(result.hasIL).toBe(true);
    expect(result.stSource).toContain("AddOne := (x + 1);");
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

  it("should reset __IL_STATE at the top of each invocation", () => {
    // Regression: __IL_STATE is a class member (persistent across calls),
    // so without an explicit reset the state machine sees the previous
    // call's exit state and skips the entire body on every call after the
    // first. Output stays frozen at whatever the first invocation set.
    const result = transpileILSource(`
FUNCTION_BLOCK StateRouter
  VAR_INPUT s : INT; END_VAR
  VAR_OUTPUT a : BOOL; b : BOOL; END_VAR
LD s
EQ 0
JMPC label_a
JMP label_b
label_a:
LD TRUE
ST a
JMP done
label_b:
LD TRUE
ST b
done:
END_FUNCTION_BLOCK
    `);
    expect(result.hasIL).toBe(true);
    expect(result.errors).toHaveLength(0);
    // Reset must come BEFORE the REPEAT, not inside the CASE.
    const stateInit = result.stSource.indexOf("__IL_STATE := 0;");
    const repeatStart = result.stSource.indexOf("REPEAT");
    expect(stateInit).toBeGreaterThanOrEqual(0);
    expect(repeatStart).toBeGreaterThan(stateInit);
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
