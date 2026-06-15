// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Tests for the analyze() API.
 *
 * The analyze() function is the LSP-facing entry point. Its key contract:
 *   - Returns partial results (AST, symbolTables, projectModel) even when errors exist
 *   - Never throws — all failures are captured as errors
 *   - Does NOT produce codegen output (no cppCode/headerCode)
 */

import { describe, it, expect } from "vitest";
import { analyze } from "../../src/index.js";

describe("analyze() API", () => {
  it("returns AST, symbolTables, projectModel, and stdFunctionRegistry for valid source", () => {
    const result = analyze(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x := x + 1;
      END_PROGRAM
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast!.kind).toBe("CompilationUnit");
    expect(result.symbolTables).toBeDefined();
    expect(result.projectModel).toBeDefined();
    expect(result.stdFunctionRegistry).toBeDefined();
  });

  it("returns errors without crashing on parse errors", () => {
    const result = analyze(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x :=  ;  (* missing expression *)
      END_PROGRAM
    `);

    expect(result.errors.length).toBeGreaterThan(0);
    // Should not throw — result is still defined
    expect(result).toBeDefined();
  });

  it("returns AST and symbolTables despite semantic errors", () => {
    const result = analyze(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x := undeclared_var;
      END_PROGRAM
    `);

    // Semantic errors should be present
    expect(result.errors.length).toBeGreaterThan(0);
    // Key contract: AST and symbolTables are still available
    expect(result.ast).toBeDefined();
    expect(result.symbolTables).toBeDefined();
  });

  it("resolves cross-file references via additionalSources", () => {
    const result = analyze(
      `
      PROGRAM Main
        VAR fb : MyFB; END_VAR
        fb();
      END_PROGRAM
    `,
      {
        additionalSources: [
          {
            fileName: "myfb.st",
            source: `
            FUNCTION_BLOCK MyFB
              VAR_OUTPUT done : BOOL; END_VAR
              done := TRUE;
            END_FUNCTION_BLOCK
          `,
          },
        ],
      },
    );

    // Should resolve MyFB from the additional source — no "undeclared" error for the FB type
    const fbTypeErrors = result.errors.filter(
      (e) => e.message.includes("MyFB") && e.message.toLowerCase().includes("undeclared"),
    );
    expect(fbTypeErrors).toHaveLength(0);
    expect(result.ast).toBeDefined();
  });

  it("does not flag a user-defined function called with missing args (codegen zero-fills)", () => {
    // User-defined functions intentionally zero-fill unfilled inputs at the
    // call site (named/positional reordering), so a missing argument is not an
    // error for them — only library functions, which have no default filling,
    // are checked. This guards against re-introducing a false positive here.
    const result = analyze(`
      FUNCTION DOUBLE_IT : INT
        VAR_INPUT IN : INT; END_VAR
        DOUBLE_IT := IN * 2;
      END_FUNCTION

      PROGRAM Main
        VAR y : INT; END_VAR
        y := DOUBLE_IT();
      END_PROGRAM
    `);

    expect(result.errors.some((e) => /requires \d+ argument/i.test(e.message))).toBe(false);
  });

  it("does not require arguments for a function-block invocation (inputs are optional)", () => {
    const result = analyze(
      `
      PROGRAM Main
        VAR fb : MyFB; END_VAR
        fb();
      END_PROGRAM
    `,
      {
        additionalSources: [
          {
            fileName: "myfb.st",
            source: `
            FUNCTION_BLOCK MyFB
              VAR_INPUT trigger : BOOL; END_VAR
              VAR_OUTPUT done : BOOL; END_VAR
              done := trigger;
            END_FUNCTION_BLOCK
          `,
          },
        ],
      },
    );

    // fb() omits the optional input `trigger` — that is valid for an FB.
    expect(result.errors.some((e) => /requires \d+ argument/i.test(e.message))).toBe(false);
  });

  it("errors when a LIBRARY function call omits its required input (the BIT_COUNT case)", () => {
    // The graphical editor emits e.g. `BIT_COUNT(EN := TRUE, ENO => tmp)` when
    // its data input is left unconnected.  With the library signature loaded,
    // the analyzer must flag the missing argument instead of letting it reach
    // the C++ compiler.
    const bitCountLib = {
      formatVersion: 1 as const,
      manifest: {
        name: "oscat-basic",
        version: "1.0.0",
        namespace: "oscat",
        functions: [
          {
            name: "BIT_COUNT",
            returnType: "INT",
            parameters: [{ name: "IN", type: "DWORD", direction: "input" as const }],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
      },
      chunks: [],
      dependencies: [],
    };

    const result = analyze(
      `
      PROGRAM Main
        VAR n : INT; END_VAR
        n := BIT_COUNT(EN := TRUE);
      END_PROGRAM
    `,
      { libraries: [bitCountLib] },
    );

    expect(
      result.errors.some((e) => /BIT_COUNT.*requires 1 argument.*got 0/i.test(e.message)),
    ).toBe(true);
  });

  it("returns a defined result for empty/whitespace input", () => {
    const result = analyze("");
    expect(result).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.warnings).toBeDefined();

    const result2 = analyze("   \n\t  ");
    expect(result2).toBeDefined();
  });

  it("does not include codegen fields in result", () => {
    const result = analyze(`
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 42;
      END_PROGRAM
    `);

    // AnalysisResult should not have cppCode or headerCode
    const resultAny = result as Record<string, unknown>;
    expect(resultAny.cppCode).toBeUndefined();
    expect(resultAny.headerCode).toBeUndefined();
    expect(resultAny.lineMap).toBeUndefined();
  });
});
