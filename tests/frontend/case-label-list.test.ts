/**
 * A CASE label list may be any length (IEC 61131-3 case_list). The parser
 * looked at most 8 tokens ahead for the label's colon, so a list of five
 * labels or more (`2, 3, 4, 5, 6:`, ten tokens) was taken for a statement
 * and failed with "Expected END_CASE".
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

const SOURCE = `
PROGRAM Main
VAR
  x : INT;
  y : INT;
END_VAR
  CASE x OF
  1: y := 1;
  2, 3, 4, 5, 6: y := 2;
  7, 8, 9, 10, 11, 12, 13, 14, 15..20, 21: y := 3;
  ELSE
    y := 0;
  END_CASE;
END_PROGRAM
`;

describe("a long CASE label list", () => {
  it("parses as labels, every one of them", () => {
    const result = compile(SOURCE);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    for (const label of [2, 6, 14, 21]) {
      expect(result.cppCode).toMatch(new RegExp(`\\b${label}\\b`));
    }
  });
});
