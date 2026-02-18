/**
 * STruC++ Multi-File Compilation Tests
 *
 * Tests for compiling multiple ST source files together.
 * Covers Phase 4.4: Multi-File Compilation.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

describe("Multi-File Compilation", () => {
  it("should compile function from additional source", () => {
    const mathST = `
      FUNCTION Square : INT
        VAR_INPUT x : INT; END_VAR
        Square := x * x;
      END_FUNCTION
    `;

    const mainST = `
      PROGRAM Main
        VAR r : INT; END_VAR
        r := Square(5);
      END_PROGRAM
    `;

    const result = compile(mainST, {
      additionalSources: [{ source: mathST, fileName: "math.st" }],
    });

    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("SQUARE(");
    expect(result.headerCode).toContain("SQUARE");
  });

  it("should compile types from additional source", () => {
    const typesST = `
      TYPE
        Color : (RED, GREEN, BLUE);
      END_TYPE
    `;

    const mainST = `
      PROGRAM Main
        VAR c : Color; END_VAR
      END_PROGRAM
    `;

    const result = compile(mainST, {
      additionalSources: [{ source: typesST, fileName: "types.st" }],
    });

    expect(result.success).toBe(true);
  });

  it("should compile multiple additional sources", () => {
    const mathST = `
      FUNCTION Double : INT
        VAR_INPUT x : INT; END_VAR
        Double := x * 2;
      END_FUNCTION
    `;

    const utilsST = `
      FUNCTION Triple : INT
        VAR_INPUT x : INT; END_VAR
        Triple := x * 3;
      END_FUNCTION
    `;

    const mainST = `
      PROGRAM Main
        VAR a : INT; b : INT; END_VAR
        a := Double(5);
        b := Triple(5);
      END_PROGRAM
    `;

    const result = compile(mainST, {
      additionalSources: [
        { source: mathST, fileName: "math.st" },
        { source: utilsST, fileName: "utils.st" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("DOUBLE(");
    expect(result.cppCode).toContain("TRIPLE(");
  });

  it("should report parse errors in additional sources", () => {
    const badST = `
      FUNCTION Bad : INT
        BAD SYNTAX HERE!!!
      END_FUNCTION
    `;

    const mainST = `
      PROGRAM Main
      END_PROGRAM
    `;

    const result = compile(mainST, {
      additionalSources: [{ source: badST, fileName: "bad.st" }],
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should set file name on source spans", () => {
    const libST = `
      FUNCTION LibFunc : INT
        VAR_INPUT x : INT; END_VAR
        LibFunc := x;
      END_FUNCTION
    `;

    const mainST = `
      PROGRAM Main
        VAR r : INT; END_VAR
        r := LibFunc(1);
      END_PROGRAM
    `;

    const result = compile(mainST, {
      additionalSources: [{ source: libST, fileName: "lib.st" }],
    });

    expect(result.success).toBe(true);
    // The AST should have the function from lib.st
    expect(result.ast).toBeDefined();
    const libFunc = result.ast!.functions.find((f) => f.name === "LIBFUNC");
    expect(libFunc).toBeDefined();
    expect(libFunc!.sourceSpan.file).toBe("lib.st");
  });
});
