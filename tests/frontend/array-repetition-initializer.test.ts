/**
 * Parser + AST-builder tests for the array repetition initializer.
 *
 * IEC 61131-3 Annex B.1.4.3:
 *
 *   array_initial_elements ::= array_initial_element
 *                            | integer '(' [array_initial_element] ')'
 *
 * `[10(0)]` stands for ten copies of `0`. The AST builder expands repetition
 * groups into plain element lists, so nothing downstream — semantic analysis,
 * the project model, codegen — needs to know the form exists.
 *
 * The optional-element form `[10()]` (ten copies of the element default) is
 * deliberately not accepted; see the compliance notes.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { uppercaseSource } from "../../src/frontend/lexer.js";
import type {
  ArrayLiteralExpression,
  CompilationUnit,
  Expression,
  VarDeclaration,
} from "../../src/frontend/ast.js";

function parseOk(source: string): CompilationUnit {
  const { cst, errors } = parse(uppercaseSource(source));
  expect(errors.map((e) => e.message)).toEqual([]);
  return buildAST(cst!);
}

function firstProgramVar(ast: CompilationUnit): VarDeclaration {
  const decl = ast.programs[0]?.varBlocks[0]?.declarations[0];
  expect(decl).toBeDefined();
  return decl!;
}

/** Raw literal text of every element of an array-literal initialiser. */
function elementLiterals(init: Expression | undefined): string[] {
  expect(init?.kind).toBe("ArrayLiteralExpression");
  return (init as ArrayLiteralExpression).elements.map((element) =>
    element.kind === "LiteralExpression" ? element.rawValue : element.kind,
  );
}

/** Declaration `index` of the first VAR block, by position. */
function programVar(ast: CompilationUnit, index: number): VarDeclaration {
  const decl = ast.programs[0]?.varBlocks[0]?.declarations[index];
  expect(decl).toBeDefined();
  return decl!;
}

describe("array repetition initializer — parsing and expansion", () => {
  it("expands a whole-array repetition", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..9] OF INT := [10(0)]; END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual(
      Array(10).fill("0"),
    );
  });

  it("expands several repetition groups in order", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..4] OF INT := [3(1), 2(5)]; END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual([
      "1",
      "1",
      "1",
      "5",
      "5",
    ]);
  });

  it("mixes repetition groups with single values", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..5] OF INT := [7, 4(2), 9]; END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual([
      "7",
      "2",
      "2",
      "2",
      "2",
      "9",
    ]);
  });

  it("accepts repetition in the bracket-less initialiser form", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..3] OF INT := 2(3), 2(4); END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual([
      "3",
      "3",
      "4",
      "4",
    ]);
  });

  it("treats a lone repetition group as an array initialiser", () => {
    // `:= 4(0)` has no brackets and no comma, but it is still a list.
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..3] OF INT := 4(0); END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual([
      "0",
      "0",
      "0",
      "0",
    ]);
  });

  it("repeats a structure initializer", () => {
    const ast = parseOk(`
      TYPE
        Point : STRUCT x : REAL; y : REAL; END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR pts : ARRAY[0..1] OF Point := [2((x := 1.5, y := 2.5))]; END_VAR
      END_PROGRAM
    `);
    const elements = (
      firstProgramVar(ast).initialValue as ArrayLiteralExpression
    ).elements;
    expect(elements).toHaveLength(2);
    expect(
      elements.every((e) => e.kind === "StructInitializerExpression"),
    ).toBe(true);
    // Each repeat is its own node, so per-element annotations cannot collide.
    expect(elements[0]).not.toBe(elements[1]);
  });

  it("repeats a nested array literal", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..3] OF INT := [2([1, 2])]; END_VAR
      END_PROGRAM
    `);
    const elements = (
      firstProgramVar(ast).initialValue as ArrayLiteralExpression
    ).elements;
    expect(elements.map((e) => e.kind)).toEqual([
      "ArrayLiteralExpression",
      "ArrayLiteralExpression",
    ]);
  });

  it("accepts a based-notation repetition count", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..3] OF INT := [16#4(7)]; END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual([
      "7",
      "7",
      "7",
      "7",
    ]);
  });

  it("expands a zero count to nothing", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR a : ARRAY[0..1] OF INT := [0(9), 4]; END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(firstProgramVar(ast).initialValue)).toEqual(["4"]);
  });

  it("rejects a count beyond the expansion limit instead of truncating", () => {
    const { cst, errors } = parse(
      uppercaseSource(`
      PROGRAM Main
        VAR a : ARRAY[0..9] OF INT := [99999999(0)]; END_VAR
      END_PROGRAM
    `),
    );
    expect(errors).toHaveLength(0);
    expect(() => buildAST(cst!)).toThrow(/exceeds the supported maximum/);
  });

  it("does not accept the optional-element form", () => {
    // `[10()]` (ten copies of the element default) has no positional lowering
    // in C++17 and is supported by neither matiec nor CODESYS.
    const { errors } = parse(
      uppercaseSource(`
      PROGRAM Main
        VAR a : ARRAY[0..9] OF INT := [10()]; END_VAR
      END_PROGRAM
    `),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("array repetition initializer — no effect on other syntax", () => {
  it("still parses a function call as an array element", () => {
    // `F(2)` starts with an identifier, not an integer, so it is a call.
    const ast = parseOk(`
      FUNCTION F : INT
        VAR_INPUT x : INT; END_VAR
        F := x;
      END_FUNCTION
      PROGRAM Main
        VAR a : ARRAY[0..1] OF INT := [F(2), 3]; END_VAR
      END_PROGRAM
    `);
    const elements = (
      firstProgramVar(ast).initialValue as ArrayLiteralExpression
    ).elements;
    expect(elements[0]!.kind).toBe("FunctionCallExpression");
  });

  it("still parses a scalar initialiser as a single value", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR x : INT := 5; END_VAR
      END_PROGRAM
    `);
    expect(firstProgramVar(ast).initialValue?.kind).toBe("LiteralExpression");
  });

  it("still parses an arithmetic initialiser containing parentheses", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR
          x : INT := 2 * (3 + 4);
        END_VAR
      END_PROGRAM
    `);
    expect(firstProgramVar(ast).initialValue?.kind).toBe("BinaryExpression");
  });

  it("still resolves a CONSTANT used as an array dimension", () => {
    // The constant scanner reads the same initializer rule; a scalar CONSTANT
    // must still be picked up for `ARRAY[0..SIZE]`.
    const ast = parseOk(`
      PROGRAM Main
        VAR CONSTANT SIZE : INT := 4; END_VAR
        VAR a : ARRAY[0..SIZE] OF INT; END_VAR
      END_PROGRAM
    `);
    const arrayDecl = ast.programs[0]!.varBlocks[1]!.declarations[0]!;
    expect(arrayDecl.type.arrayDimensions).toEqual([{ start: 0, end: 4 }]);
  });

  it("keeps multiple declarations in one block independent", () => {
    const ast = parseOk(`
      PROGRAM Main
        VAR
          a : ARRAY[0..2] OF INT := [3(1)];
          b : INT := 9;
          c : ARRAY[0..1] OF INT := [2(2)];
        END_VAR
      END_PROGRAM
    `);
    expect(elementLiterals(programVar(ast, 0).initialValue)).toEqual([
      "1",
      "1",
      "1",
    ]);
    expect(programVar(ast, 1).initialValue?.kind).toBe("LiteralExpression");
    expect(elementLiterals(programVar(ast, 2).initialValue)).toEqual([
      "2",
      "2",
    ]);
  });
});
