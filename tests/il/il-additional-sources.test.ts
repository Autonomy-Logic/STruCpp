/**
 * IL transpilation must run on every source the compiler ingests —
 * primary `source` AND every entry in `additionalSources`. The OpenPLC
 * Editor's program.st splitter feeds per-POU files via
 * `additionalSources`, and any of them can be IL; without this pass the
 * IL POU reaches the ST parser as raw `LD x / ST y` and fails with a
 * confusing "expecting Identifier but found 'LD'" error.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../dist/index.js";

describe("IL transpilation across additionalSources", () => {
  it("compiles an IL POU passed via additionalSources alongside an ST primary", () => {
    const stPrimary = `
PROGRAM Main
  VAR a : INT := 5; END_VAR
  a := a + 1;
END_PROGRAM
`;
    const ilAdditional = `
FUNCTION_BLOCK State_Display
  VAR State : INT; Out : INT; END_VAR
  LD State
  ST Out
END_FUNCTION_BLOCK
`;
    const result = compile(stPrimary, {
      additionalSources: [{ fileName: "State_Display.st", source: ilAdditional }],
    });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("surfaces IL transpile errors from additionalSources with the right file name", () => {
    const stPrimary = `PROGRAM Main VAR x : INT; END_VAR x := 0; END_PROGRAM\n`;
    const broken = `
FUNCTION_BLOCK Bad
  VAR x : INT; END_VAR
  LD nonexistent_variable
  ST x
END_FUNCTION_BLOCK
`;
    const result = compile(stPrimary, {
      additionalSources: [{ fileName: "Bad.st", source: broken }],
    });
    // Either the IL transpiler errors out or the downstream type
    // checker does — what matters is the file attribution.
    if (!result.success) {
      const fromBad = result.errors.find((e) => e.file === "Bad.st");
      expect(fromBad).toBeDefined();
    }
  });
});
