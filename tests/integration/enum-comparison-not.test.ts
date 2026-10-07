/**
 * A comparison is BOOL whatever its operands are (IEC 61131-3 table 29).
 *
 * The type checker returned no type for a binary expression with an untyped
 * operand, and a bare enumeration value is one. With the standard library
 * loaded (as the editor always compiles), NOT is the library's generic
 * function returning ANY_BIT, refined to its argument's type; an untyped
 * argument left it ANY_BIT, and `IF NOT (c = R_RED) THEN` failed with
 * "Condition must be a boolean or bit type, got ANY_BIT".
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import { compile } from "../../src/index.js";
import { discoverStlibs } from "../../src/node/library-loader.js";

const SOURCE = `
TYPE R_COLOR : (R_RED, R_GREEN) := R_RED; END_TYPE

FUNCTION_BLOCK R_FB
VAR_INPUT B : BOOL; END_VAR
VAR_OUTPUT Q1, Q2, Q3 : BOOL; END_VAR
VAR c : R_COLOR; END_VAR
  IF NOT (c = R_RED) THEN Q1 := TRUE; END_IF;
  IF NOT (c = R_RED AND B) THEN Q2 := TRUE; END_IF;
  IF NOT (c = R_RED OR B) THEN Q3 := TRUE; END_IF;
END_FUNCTION_BLOCK

PROGRAM P
VAR f : R_FB; END_VAR
  f(B := TRUE);
END_PROGRAM
`;

describe("NOT of an enumeration comparison", () => {
  it("is a valid IF condition with the standard library loaded", () => {
    const result = compile(SOURCE, {
      libraries: discoverStlibs(path.resolve(__dirname, "../../libs")),
    });
    expect(result.errors.map((e) => e.message)).toEqual([]);
  });
});
