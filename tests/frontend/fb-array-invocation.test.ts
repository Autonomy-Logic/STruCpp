/**
 * Parsing tests for invoking a function block instance held in an array element.
 *
 *   units[0](step := 2.0);
 *   grid[i, j]();
 *
 * IEC 61131-3 allows an array of function block instances, and an element is
 * invoked like any other instance. This used to fail in the parser: the
 * statement was taken as an assignment target, which then demanded `:=`
 * (`Expected Assign, found (`).
 *
 * The alternative is gated on `(` following the closing `]` directly, so it
 * claims exactly the element invocation and leaves `arr[0].m(…)` — which could
 * equally be a method call on the element — to the existing rules.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { uppercaseSource } from "../../src/frontend/lexer.js";
import type {
  CompilationUnit,
  FunctionCallExpression,
  FunctionCallStatement,
  Statement,
} from "../../src/frontend/ast.js";

function parseOk(source: string): CompilationUnit {
  const { cst, errors } = parse(uppercaseSource(source));
  expect(errors.map((e) => e.message)).toEqual([]);
  return buildAST(cst!);
}

function firstStatement(ast: CompilationUnit): Statement {
  const stmt = ast.programs[0]?.body[0];
  expect(stmt).toBeDefined();
  return stmt!;
}

function asCall(stmt: Statement): FunctionCallExpression {
  expect(stmt.kind).toBe("FunctionCallStatement");
  const call = (stmt as FunctionCallStatement).call;
  expect(call.kind).toBe("FunctionCallExpression");
  return call as FunctionCallExpression;
}

const FB = `
  FUNCTION_BLOCK Accum
    VAR_INPUT step : REAL := 1.0; END_VAR
    VAR_OUTPUT val : REAL; END_VAR
    val := val + step;
  END_FUNCTION_BLOCK
`;

describe("function block array element invocation — parsing", () => {
  it("parses an invocation with no arguments", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR units : ARRAY[0..1] OF Accum; END_VAR
        units[0]();
      END_PROGRAM
    `);
    const call = asCall(firstStatement(ast));
    // The base name still resolves the declared type; `instance` is the target.
    expect(call.functionName).toBe("UNITS");
    expect(call.arguments).toEqual([]);
    expect(call.instance?.kind).toBe("VariableExpression");
  });

  it("parses named arguments on the element invocation", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR units : ARRAY[0..1] OF Accum; END_VAR
        units[1](step := 2.0);
      END_PROGRAM
    `);
    const call = asCall(firstStatement(ast));
    expect(call.arguments).toHaveLength(1);
    expect(call.arguments[0]!.name).toBe("STEP");
  });

  it("parses a variable index", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR units : ARRAY[0..1] OF Accum; i : INT; END_VAR
        units[i]();
      END_PROGRAM
    `);
    const call = asCall(firstStatement(ast));
    const instance = call.instance!;
    expect(instance.kind).toBe("VariableExpression");
    expect("subscripts" in instance ? instance.subscripts.length : 0).toBe(1);
  });

  it("parses a multi-dimensional index", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR grid : ARRAY[0..1, 0..1] OF Accum; END_VAR
        grid[0, 1]();
      END_PROGRAM
    `);
    const instance = asCall(firstStatement(ast)).instance!;
    expect("subscripts" in instance ? instance.subscripts.length : 0).toBe(2);
  });

  it("parses a nested subscript in the index expression", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR
          units : ARRAY[0..1] OF Accum;
          idx : ARRAY[0..1] OF INT;
        END_VAR
        units[idx[0]]();
      END_PROGRAM
    `);
    expect(asCall(firstStatement(ast)).instance).toBeDefined();
  });

  it("parses an invocation inside a FOR loop", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR units : ARRAY[0..2] OF Accum; i : INT; END_VAR
        FOR i := 0 TO 2 DO
          units[i](step := 1.0);
        END_FOR;
      END_PROGRAM
    `);
    expect(firstStatement(ast).kind).toBe("ForStatement");
  });
});

describe("function block array element invocation — no effect on other statements", () => {
  it("still parses an assignment to an array element", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..1] OF INT; END_VAR
        a[0] := 5;
      END_PROGRAM
    `);
    expect(firstStatement(ast).kind).toBe("AssignmentStatement");
  });

  it("still parses an assignment whose value subscripts an array", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..1] OF INT; b : INT; END_VAR
        b := a[0];
      END_PROGRAM
    `);
    expect(firstStatement(ast).kind).toBe("AssignmentStatement");
  });

  it("still parses a function call whose argument subscripts an array", () => {
    const ast = parseOk(`
      FUNCTION F : INT
        VAR_INPUT x : INT; END_VAR
        F := x;
      END_FUNCTION
      PROGRAM Main
        VAR a : ARRAY[0..1] OF INT; b : INT; END_VAR
        b := F(a[0]);
      END_PROGRAM
    `);
    expect(firstStatement(ast).kind).toBe("AssignmentStatement");
  });

  it("still parses a plain function block invocation", () => {
    const ast = parseOk(`
      ${FB}
      PROGRAM Main
        VAR unit : Accum; END_VAR
        unit(step := 1.0);
      END_PROGRAM
    `);
    const call = asCall(firstStatement(ast));
    expect(call.functionName).toBe("UNIT");
    expect(call.instance).toBeUndefined();
  });

  it("leaves a method call on an array element unparsed (pre-existing gap)", () => {
    // `cs[0].Bump()` is a *method* call on an element, which the expression
    // grammar still doesn't accept — `isMethodCallAhead` wants `ident . ident (`
    // and this is `ident [ … ] . ident (`. Unchanged by the element-invocation
    // rule, whose gate only fires when `(` follows `]` directly. Recorded here
    // so the day it starts parsing is a deliberate change, not a surprise.
    const { errors } = parse(
      uppercaseSource(`
      FUNCTION_BLOCK Counter
        VAR n : INT; END_VAR
        METHOD Bump : INT
          n := n + 1;
          Bump := n;
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR cs : ARRAY[0..1] OF Counter; r : INT; END_VAR
        r := cs[0].Bump();
      END_PROGRAM
    `),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
