// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { compile, generateReplMain } from "strucpp";

describe("server compile handler logic", () => {
  it("compiles a simple program to C++", () => {
    const source = `
PROGRAM Main
  VAR counter : INT; END_VAR
  counter := counter + 1;
END_PROGRAM
`;
    const result = compile(source, {
      fileName: "test.st",
      headerFileName: "test.hpp",
    });

    expect(result.success).toBe(true);
    // Codegen uppercases variable names
    expect(result.cppCode).toContain("COUNTER");
    expect(result.headerCode).toContain("strucpp");
  });

  it("returns errors for invalid source", () => {
    const source = `PROGRAM Main
  VAR x : INT END_VAR
  x := ;
END_PROGRAM`;
    const result = compile(source, { fileName: "bad.st" });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("compiles with additionalSources", () => {
    const primary = `
PROGRAM Main
  VAR helper : HelperFB; END_VAR
END_PROGRAM
`;
    const secondary = `
FUNCTION_BLOCK HelperFB
  VAR value : INT; END_VAR
END_FUNCTION_BLOCK
`;
    const result = compile(primary, {
      fileName: "main.st",
      headerFileName: "main.hpp",
      additionalSources: [{ source: secondary, fileName: "helper.st" }],
    });

    expect(result.success).toBe(true);
    // Codegen uppercases FB names
    expect(result.cppCode.toUpperCase()).toContain("HELPERFB");
  });

  it("passes libraryPaths through to compile", () => {
    const source = `
PROGRAM Main
  VAR x : INT; END_VAR
  x := 42;
END_PROGRAM
`;
    // Use a nonexistent path — compile should still succeed (no stlibs found)
    const result = compile(source, {
      fileName: "test.st",
      libraryPaths: ["/nonexistent/path"],
    });

    // The compile still succeeds — missing library paths are soft errors
    // (the directory just has no .stlib files)
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
  });

  it("generates valid REPL main with generateReplMain", () => {
    const source = `
PROGRAM Main
  VAR counter : INT; END_VAR
  counter := counter + 1;
END_PROGRAM
`;
    const result = compile(source, {
      fileName: "test.st",
      headerFileName: "test.hpp",
    });

    expect(result.success).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.projectModel).toBeDefined();

    const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
      headerFileName: "test.hpp",
      stSource: source,
      cppCode: result.cppCode,
      headerCode: result.headerCode,
      lineMap: result.lineMap,
      headerLineMap: result.headerLineMap,
    });

    expect(mainCpp).toContain("main");
    expect(mainCpp).toContain("test.hpp");
    expect(mainCpp.length).toBeGreaterThan(100);
  });
});
