/**
 * STruC++ Semantic Analyzer - Undeclared Variable Validation Tests
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { analyze } from "../../src/semantic/analyzer.js";

function analyzeSource(source: string) {
  const parseResult = parse(source);
  expect(parseResult.errors).toHaveLength(0);
  const ast = buildAST(parseResult.cst!);
  return analyze(ast);
}

function undeclaredErrors(result: ReturnType<typeof analyzeSource>) {
  return result.errors.filter((e) => e.message.includes("Undeclared variable"));
}

// =============================================================================
// Positive tests — no false errors
// =============================================================================

describe("Undeclared Variables - Positive (no false errors)", () => {
  it("should accept declared VAR variables", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; y : REAL; END_VAR
        x := 42;
        y := 3.14;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT variables", () => {
    const result = analyzeSource(`
      FUNCTION Add : INT
        VAR_INPUT a : INT; b : INT; END_VAR
        Add := a + b;
      END_FUNCTION
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept VAR_EXTERNAL variables", () => {
    const result = analyzeSource(`
      VAR_GLOBAL gCount : INT; END_VAR
      PROGRAM Main
        VAR_EXTERNAL gCount : INT; END_VAR
        gCount := gCount + 1;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept VAR_GLOBAL variables", () => {
    const result = analyzeSource(`
      VAR_GLOBAL globalFlag : BOOL; END_VAR
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 10;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept CONSTANT variables", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR CONSTANT MAX_VAL : INT := 100; END_VAR
        VAR x : INT; END_VAR
        x := MAX_VAL;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept function return variable (FuncName := value)", () => {
    const result = analyzeSource(`
      FUNCTION Square : INT
        VAR_INPUT n : INT; END_VAR
        Square := n * n;
      END_FUNCTION
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept case-insensitive variable references", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR myVar : INT; END_VAR
        MYVAR := 10;
        myvar := 20;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept variables in nested control flow", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; y : INT; z : BOOL; END_VAR
        IF z THEN
          x := 1;
          IF z THEN
            y := x + 2;
          END_IF;
        ELSIF NOT z THEN
          x := 3;
        ELSE
          y := 4;
        END_IF;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept variables in FOR/WHILE/REPEAT loops", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR i : INT; sum : INT; flag : BOOL; END_VAR
        FOR i := 0 TO 10 BY 2 DO
          sum := sum + i;
        END_FOR;
        WHILE flag DO
          sum := sum - 1;
        END_WHILE;
        REPEAT
          sum := sum + 1;
        UNTIL flag
        END_REPEAT;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept array subscripts with declared variables", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR arr : ARRAY[0..9] OF INT; i : INT; END_VAR
        arr[i] := 42;
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept FB instance variables", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Counter
        VAR count : INT; END_VAR
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR c : Counter; END_VAR
        c();
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept THIS and SUPER in FB methods", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Base
        VAR val : INT; END_VAR
        METHOD PUBLIC DoWork : INT
          VAR_INPUT x : INT; END_VAR
          DoWork := x;
        END_METHOD
      END_FUNCTION_BLOCK

      FUNCTION_BLOCK Child EXTENDS Base
        METHOD PUBLIC OVERRIDE DoWork : INT
          VAR_INPUT x : INT; END_VAR
          DoWork := THIS.val + x;
        END_METHOD
      END_FUNCTION_BLOCK
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept method return variable", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        METHOD PUBLIC Calc : INT
          VAR_INPUT n : INT; END_VAR
          Calc := n * 2;
        END_METHOD
      END_FUNCTION_BLOCK
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept property getter return variable", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        VAR _val : INT; END_VAR
        PROPERTY PUBLIC Value : INT
          GET
            Value := _val;
          END_GET
        END_PROPERTY
      END_FUNCTION_BLOCK
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept property setter input variable", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        VAR _val : INT; END_VAR
        PROPERTY PUBLIC Value : INT
          SET
            _val := Value;
          END_SET
        END_PROPERTY
      END_FUNCTION_BLOCK
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept standard function calls without flagging function name", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : REAL; y : REAL; END_VAR
        y := ABS(x);
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept dotted FB method calls", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK Worker
        METHOD PUBLIC Run : INT
          Run := 0;
        END_METHOD
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR w : Worker; r : INT; END_VAR
        r := w.Run();
      END_PROGRAM
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });

  it("should accept method-local variables in FB methods", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        METHOD PUBLIC DoWork : INT
          VAR localVar : INT; END_VAR
          localVar := 42;
          DoWork := localVar;
        END_METHOD
      END_FUNCTION_BLOCK
    `);
    expect(undeclaredErrors(result)).toHaveLength(0);
  });
});

// =============================================================================
// Negative tests — must detect errors
// =============================================================================

describe("Undeclared Variables - Negative (must error)", () => {
  it("should error on undeclared variable in assignment target", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        y := 42;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'Y'");
  });

  it("should error on undeclared variable in expression RHS", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x := unknown + 1;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'UNKNOWN'");
  });

  it("should error on undeclared variable in IF condition", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        IF notDeclared THEN
          x := 1;
        END_IF;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should error on undeclared variable in WHILE condition", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        WHILE notDeclared DO
          x := x + 1;
        END_WHILE;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should error on undeclared variable in REPEAT condition", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        REPEAT
          x := x + 1;
        UNTIL notDeclared
        END_REPEAT;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should error on undeclared FOR control variable", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        FOR notDeclared := 0 TO 10 DO
          x := x + 1;
        END_FOR;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should error on undeclared variable in CASE selector", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        CASE notDeclared OF
          1: x := 1;
          2: x := 2;
        END_CASE;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should error on undeclared variable in FB body", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        VAR x : INT; END_VAR
        x := undeclared;
      END_FUNCTION_BLOCK
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'UNDECLARED'");
  });

  it("should error on undeclared variable in method body", () => {
    const result = analyzeSource(`
      FUNCTION_BLOCK MyFB
        METHOD PUBLIC DoWork : INT
          VAR localVar : INT; END_VAR
          localVar := undeclared;
          DoWork := localVar;
        END_METHOD
      END_FUNCTION_BLOCK
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'UNDECLARED'");
  });

  it("should error on undeclared variable in function call argument", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x := ABS(notDeclared);
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should error on undeclared variable in array subscript", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR arr : ARRAY[0..9] OF INT; END_VAR
        arr[notDeclared] := 42;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });

  it("should report multiple undeclared variables", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        a := b + c;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs.length).toBeGreaterThanOrEqual(3);
  });

  it("should report correct source location", () => {
    const result = analyzeSource(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x := badVar;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'BADVAR'");
    expect(errs[0]!.line).toBeGreaterThan(0);
    expect(errs[0]!.column).toBeGreaterThan(0);
  });

  it("should error on undeclared variable in function body", () => {
    const result = analyzeSource(`
      FUNCTION Calc : INT
        VAR_INPUT n : INT; END_VAR
        Calc := n + undeclared;
      END_FUNCTION
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'UNDECLARED'");
  });

  it("should error on undeclared variable in accessChain subscript", () => {
    const result = analyzeSource(`
      TYPE MyRecord : STRUCT
        items : ARRAY[0..9] OF INT;
      END_STRUCT;
      END_TYPE

      PROGRAM Main
        VAR rec : MyRecord; END_VAR
        rec.items[notDeclared] := 42;
      END_PROGRAM
    `);
    const errs = undeclaredErrors(result);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("'NOTDECLARED'");
  });
});
