/**
 * Parser + AST-builder tests for IEC 61131-3 `structure_initialization`
 * (Annex B.1.4.3) and the type-level default forms of Annex B.1.3.3.
 *
 *   p : Point := (x := 1.0, y := 2.0);          -- structure initializer
 *   o : Outer := (i := (a := 5), b := 7);       -- nested
 *   pts : ARRAY[0..1] OF Point := [(x := 1.0)]; -- inside an array literal
 *   t : TON := (PT := T#1s);                    -- FB instance initialisation
 *   TYPE Origin : Point := (x := 0.0); END_TYPE -- type carries the default
 *
 * Before this was implemented the parser reached the parenthesised-expression
 * alternative, parsed the element name as a variable and then demanded `)`,
 * failing with `Expected RParen, found :=`.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { uppercaseSource } from "../../src/frontend/lexer.js";
import type {
  ArrayLiteralExpression,
  CompilationUnit,
  Expression,
  StructInitializerExpression,
  VarDeclaration,
} from "../../src/frontend/ast.js";

const POINT_TYPE = `
  TYPE
    Point : STRUCT
      x : REAL;
      y : REAL;
    END_STRUCT;
  END_TYPE
`;

function parseOk(source: string): CompilationUnit {
  const { cst, errors } = parse(uppercaseSource(source));
  expect(errors.map((e) => e.message)).toEqual([]);
  const ast = buildAST(cst!);
  expect(ast).toBeDefined();
  return ast;
}

/** First declaration of the first VAR block of the first program. */
function firstProgramVar(ast: CompilationUnit): VarDeclaration {
  const decl = ast.programs[0]?.varBlocks[0]?.declarations[0];
  expect(decl).toBeDefined();
  return decl!;
}

function asStructInit(
  expr: Expression | undefined,
): StructInitializerExpression {
  expect(expr?.kind).toBe("StructInitializerExpression");
  return expr as StructInitializerExpression;
}

/** Element names and, for scalar values, their raw literal text. */
function elementPairs(
  init: StructInitializerExpression,
): Array<[string, string]> {
  return init.elements.map((element) => [
    element.name,
    element.value.kind === "LiteralExpression"
      ? element.value.rawValue
      : element.value.kind,
  ]);
}

describe("structure_initialization — parsing", () => {
  it("parses a structure initializer in a VAR_GLOBAL declaration", () => {
    const ast = parseOk(`
      ${POINT_TYPE}
      VAR_GLOBAL
        origin : Point := (x := 1.0, y := 2.0);
      END_VAR
    `);
    const decl = ast.globalVarBlocks[0]!.declarations[0]!;
    expect(elementPairs(asStructInit(decl.initialValue))).toEqual([
      ["X", "1.0"],
      ["Y", "2.0"],
    ]);
  });

  it("parses a structure initializer with no space before the paren", () => {
    // The form reported on the forum: `:=(a:=1.0,b:=2.0)`.
    const ast = parseOk(`
      ${POINT_TYPE}
      PROGRAM Main
        VAR p : Point :=(x:=1.0,y:=2.0); END_VAR
      END_PROGRAM
    `);
    expect(
      elementPairs(asStructInit(firstProgramVar(ast).initialValue)),
    ).toEqual([
      ["X", "1.0"],
      ["Y", "2.0"],
    ]);
  });

  it("preserves element order as written, including partial initialisers", () => {
    const ast = parseOk(`
      ${POINT_TYPE}
      PROGRAM Main
        VAR p : Point := (y := 2.0); END_VAR
      END_PROGRAM
    `);
    expect(
      elementPairs(asStructInit(firstProgramVar(ast).initialValue)),
    ).toEqual([["Y", "2.0"]]);
  });

  it("parses nested structure initializers", () => {
    const ast = parseOk(`
      TYPE
        Inner : STRUCT a : INT; END_STRUCT;
        Outer : STRUCT
          i : Inner;
          b : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR o : Outer := (i := (a := 5), b := 7); END_VAR
      END_PROGRAM
    `);
    const outer = asStructInit(firstProgramVar(ast).initialValue);
    expect(outer.elements.map((e) => e.name)).toEqual(["I", "B"]);
    expect(elementPairs(asStructInit(outer.elements[0]!.value))).toEqual([
      ["A", "5"],
    ]);
  });

  it("parses structure initializers inside an array literal", () => {
    const ast = parseOk(`
      ${POINT_TYPE}
      PROGRAM Main
        VAR
          pts : ARRAY[0..1] OF Point := [(x := 1.0, y := 2.0), (x := 3.0, y := 4.0)];
        END_VAR
      END_PROGRAM
    `);
    const init = firstProgramVar(ast).initialValue;
    expect(init?.kind).toBe("ArrayLiteralExpression");
    const elements = (init as ArrayLiteralExpression).elements;
    expect(elements).toHaveLength(2);
    expect(elementPairs(asStructInit(elements[0]))).toEqual([
      ["X", "1.0"],
      ["Y", "2.0"],
    ]);
    expect(elementPairs(asStructInit(elements[1]))).toEqual([
      ["X", "3.0"],
      ["Y", "4.0"],
    ]);
  });

  it("parses an array element value inside a structure initializer", () => {
    const ast = parseOk(`
      TYPE
        Buf : STRUCT
          data : ARRAY[0..2] OF INT;
          n : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR b : Buf := (data := [1, 2, 3], n := 3); END_VAR
      END_PROGRAM
    `);
    const init = asStructInit(firstProgramVar(ast).initialValue);
    expect(init.elements[0]!.name).toBe("DATA");
    expect(init.elements[0]!.value.kind).toBe("ArrayLiteralExpression");
  });

  it("parses a function block instance initialiser", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR t : TON := (PT := T#1s); END_VAR
      END_PROGRAM
    `);
    expect(
      asStructInit(firstProgramVar(ast).initialValue).elements[0]!.name,
    ).toBe("PT");
  });

  it("parses a structure initializer as a STRUCT element default", () => {
    const ast = parseOk(`
      TYPE
        Inner : STRUCT a : INT; END_STRUCT;
        Outer : STRUCT
          i : Inner := (a := 5);
        END_STRUCT;
      END_TYPE
    `);
    const outer = ast.types.find((t) => t.name === "OUTER")!;
    expect(outer.definition.kind).toBe("StructDefinition");
    const field =
      outer.definition.kind === "StructDefinition"
        ? outer.definition.fields[0]!
        : undefined;
    expect(elementPairs(asStructInit(field?.initialValue))).toEqual([
      ["A", "5"],
    ]);
  });

  it("still parses a parenthesised expression, which also starts with `(`", () => {
    // The structure-initializer alternative is gated on `( NAME :=`, so an
    // ordinary parenthesised expression must be unaffected.
    const ast = parseOk(`
      PROGRAM Main
        VAR a : INT := 1; b : INT; END_VAR
        b := (a + 2) * 3;
      END_PROGRAM
    `);
    expect(ast.programs[0]!.body).toHaveLength(1);
  });

  it("still parses named arguments in a function block invocation", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR t : TON; END_VAR
        t(IN := TRUE, PT := T#1s);
      END_PROGRAM
    `);
    expect(ast.programs[0]!.body).toHaveLength(1);
  });
});

describe("type-level default values (IEC 61131-3 B.1.3.3)", () => {
  it("attaches a simple type's default to the TYPE declaration", () => {
    const ast = parseOk(`
      TYPE
        Setpoint : REAL := 25.0;
      END_TYPE
    `);
    const decl = ast.types[0]!;
    expect(decl.defaultValue?.kind).toBe("LiteralExpression");
  });

  it("applies a simple type default to declarations that have no initialiser", () => {
    const ast = parseOk(`
      TYPE
        Setpoint : REAL := 25.0;
      END_TYPE
      PROGRAM Main
        VAR s : Setpoint; END_VAR
      END_PROGRAM
    `);
    const init = firstProgramVar(ast).initialValue;
    expect(init?.kind).toBe("LiteralExpression");
    expect(init && "rawValue" in init ? init.rawValue : undefined).toBe("25.0");
  });

  it("does not override a declaration's own initialiser", () => {
    const ast = parseOk(`
      TYPE
        Setpoint : REAL := 25.0;
      END_TYPE
      PROGRAM Main
        VAR s : Setpoint := 30.0; END_VAR
      END_PROGRAM
    `);
    const init = firstProgramVar(ast).initialValue;
    expect(init && "rawValue" in init ? init.rawValue : undefined).toBe("30.0");
  });

  it("applies a structure default from an initialised structure type", () => {
    const ast = parseOk(`
      ${POINT_TYPE}
      TYPE
        Origin : Point := (x := 0.0, y := 0.0);
      END_TYPE
      PROGRAM Main
        VAR p : Origin; END_VAR
      END_PROGRAM
    `);
    expect(
      elementPairs(asStructInit(firstProgramVar(ast).initialValue)),
    ).toEqual([
      ["X", "0.0"],
      ["Y", "0.0"],
    ]);
  });

  it("follows an alias chain to find the default", () => {
    const ast = parseOk(`
      TYPE
        Setpoint : REAL := 25.0;
        RoomSetpoint : Setpoint;
      END_TYPE
      PROGRAM Main
        VAR s : RoomSetpoint; END_VAR
      END_PROGRAM
    `);
    const init = firstProgramVar(ast).initialValue;
    expect(init && "rawValue" in init ? init.rawValue : undefined).toBe("25.0");
  });

  it("terminates on a cyclic alias chain instead of hanging", () => {
    const ast = parseOk(`
      TYPE
        Setpoint : REAL := 25.0;
        A : B;
        B : A;
      END_TYPE
      PROGRAM Main
        VAR x : A; END_VAR
      END_PROGRAM
    `);
    expect(firstProgramVar(ast).initialValue).toBeUndefined();
  });

  it("applies a simple enum's default value", () => {
    const ast = parseOk(`
      TYPE
        Light : (RED, GREEN) := GREEN;
      END_TYPE
      PROGRAM Main
        VAR l : Light; END_VAR
      END_PROGRAM
    `);
    const init = firstProgramVar(ast).initialValue;
    expect(init?.kind).toBe("VariableExpression");
    expect(init && "name" in init ? init.name : undefined).toBe("GREEN");
  });

  it("leaves VAR_EXTERNAL alone — it names storage owned elsewhere", () => {
    const ast = parseOk(`
      TYPE
        Setpoint : REAL := 25.0;
      END_TYPE
      VAR_GLOBAL
        gs : Setpoint;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL gs : Setpoint; END_VAR
        gs := 1.0;
      END_PROGRAM
    `);
    const external = ast.programs[0]!.varBlocks.find(
      (b) => b.blockType === "VAR_EXTERNAL",
    );
    expect(external!.declarations[0]!.initialValue).toBeUndefined();
    // The global itself still gets the default.
    expect(ast.globalVarBlocks[0]!.declarations[0]!.initialValue?.kind).toBe(
      "LiteralExpression",
    );
  });
});
