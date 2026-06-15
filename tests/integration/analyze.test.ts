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

  // --- Option A: required vs. optional function inputs --------------------
  // An input WITHOUT an initial value is mandatory; one WITH a default is
  // optional. Enforced uniformly for user-defined and library functions.

  const MISSING = /is missing required input/i;

  it("errors when a user-defined function omits a required (no-default) input", () => {
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

    expect(
      result.errors.some((e) => /DOUBLE_IT.*missing required input.*IN/i.test(e.message)),
    ).toBe(true);
  });

  it("does not flag a user-defined function input that declares an initial value", () => {
    const result = analyze(`
      FUNCTION SCALE_IT : INT
        VAR_INPUT IN : INT; FACTOR : INT := 2; END_VAR
        SCALE_IT := IN * FACTOR;
      END_FUNCTION

      PROGRAM Main
        VAR y : INT; END_VAR
        y := SCALE_IT(IN := 21);
      END_PROGRAM
    `);

    // FACTOR has a default, so omitting it is fine; IN is provided.
    expect(result.errors.some((e) => MISSING.test(e.message))).toBe(false);
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
    expect(result.errors.some((e) => MISSING.test(e.message))).toBe(false);
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
      result.errors.some((e) => /BIT_COUNT.*missing required input.*IN/i.test(e.message)),
    ).toBe(true);
  });

  it("does not flag a LIBRARY function input that carries an initialValue", () => {
    // A library function with an optional input (default in the manifest) may
    // be called without it.
    const scaleLib = {
      formatVersion: 1 as const,
      manifest: {
        name: "demo",
        version: "1.0.0",
        namespace: "demo",
        functions: [
          {
            name: "SCALE1",
            returnType: "REAL",
            parameters: [
              { name: "IN", type: "REAL", direction: "input" as const },
              {
                name: "MAXV",
                type: "REAL",
                direction: "input" as const,
                initialValue: "1000.0",
              },
            ],
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
        VAR r : REAL; END_VAR
        r := SCALE1(IN := 2.0);
      END_PROGRAM
    `,
      { libraries: [scaleLib] },
    );

    // MAXV has a manifest default → optional; IN is provided.
    expect(result.errors.some((e) => /missing required input/i.test(e.message))).toBe(false);
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
