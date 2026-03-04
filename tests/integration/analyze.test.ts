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

  it("handles invalid library paths without crashing", () => {
    const result = analyze(
      `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 1;
      END_PROGRAM
    `,
      {
        libraryPaths: ["/nonexistent/path/to/libs"],
      },
    );

    // Should still return a defined result (may or may not have errors)
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
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
