/**
 * STruC++ Library System Tests
 *
 * Tests for library compilation, manifest loading, and symbol registration.
 * Covers Phase 4.5: Library System.
 */

import { describe, it, expect } from "vitest";
import { compileLibrary } from "../../src/library/library-compiler.js";
import {
  loadLibraryManifest,
  registerLibrarySymbols,
  LibraryManifestError,
} from "../../src/library/library-loader.js";
import { getBuiltinStdlibManifest } from "../../src/library/builtin-stdlib.js";
import { SymbolTables } from "../../src/semantic/symbol-table.js";
import { StdFunctionRegistry } from "../../src/semantic/std-function-registry.js";
import { compile } from "../../src/index.js";

describe("Library System", () => {
  describe("compileLibrary", () => {
    it("should compile a simple library", () => {
      const result = compileLibrary(
        [
          {
            source: `
              FUNCTION MathAdd : INT
                VAR_INPUT a : INT; b : INT; END_VAR
                MathAdd := a + b;
              END_FUNCTION
            `,
            fileName: "math.st",
          },
        ],
        { name: "math-lib", version: "1.0.0", namespace: "math" },
      );

      expect(result.success).toBe(true);
      expect(result.manifest.name).toBe("math-lib");
      expect(result.manifest.version).toBe("1.0.0");
      expect(result.manifest.functions).toHaveLength(1);
      expect(result.manifest.functions[0]!.name).toBe("MathAdd");
      expect(result.manifest.functions[0]!.returnType).toBe("INT");
      expect(result.manifest.isBuiltin).toBe(false);
      expect(result.headerCode).toBeTruthy();
      expect(result.cppCode).toBeTruthy();
    });

    it("should compile library with types", () => {
      const result = compileLibrary(
        [
          {
            source: `
              TYPE
                MyStruct : STRUCT
                  x : INT;
                  y : INT;
                END_STRUCT;
              END_TYPE
            `,
            fileName: "types.st",
          },
        ],
        { name: "types-lib", version: "1.0.0", namespace: "types" },
      );

      expect(result.success).toBe(true);
      expect(result.manifest.types).toHaveLength(1);
      expect(result.manifest.types[0]!.name).toBe("MyStruct");
      expect(result.manifest.types[0]!.kind).toBe("struct");
    });

    it("should fail with no sources", () => {
      const result = compileLibrary([], {
        name: "empty",
        version: "1.0.0",
        namespace: "empty",
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("loadLibraryManifest", () => {
    it("should load a manifest from JSON", () => {
      const json = {
        name: "test-lib",
        version: "2.0.0",
        description: "A test library",
        namespace: "test",
        functions: [
          {
            name: "TestFunc",
            returnType: "INT",
            parameters: [{ name: "x", type: "INT", direction: "input" }],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: ["test.hpp"],
        isBuiltin: false,
        sourceFiles: ["test.st"],
      };

      const manifest = loadLibraryManifest(json);
      expect(manifest.name).toBe("test-lib");
      expect(manifest.version).toBe("2.0.0");
      expect(manifest.description).toBe("A test library");
      expect(manifest.functions).toHaveLength(1);
      expect(manifest.headers).toEqual(["test.hpp"]);
      expect(manifest.sourceFiles).toEqual(["test.st"]);
    });

    it("should handle missing optional fields", () => {
      const json = {
        name: "minimal",
        version: "1.0.0",
        namespace: "min",
        functions: [],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
      };

      const manifest = loadLibraryManifest(json);
      expect(manifest.description).toBeUndefined();
      expect(manifest.sourceFiles).toBeUndefined();
    });

    it("should reject null input", () => {
      expect(() => loadLibraryManifest(null)).toThrow(LibraryManifestError);
    });

    it("should reject missing name", () => {
      expect(() =>
        loadLibraryManifest({
          version: "1.0.0",
          namespace: "ns",
        }),
      ).toThrow("'name' must be a non-empty string");
    });

    it("should reject empty name", () => {
      expect(() =>
        loadLibraryManifest({
          name: "",
          version: "1.0.0",
          namespace: "ns",
        }),
      ).toThrow("'name' must be a non-empty string");
    });

    it("should reject missing version", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          namespace: "ns",
        }),
      ).toThrow("'version' must be a non-empty string");
    });

    it("should reject missing namespace", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          version: "1.0.0",
        }),
      ).toThrow("'namespace' must be a non-empty string");
    });

    it("should reject function entry without name", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          version: "1.0.0",
          namespace: "ns",
          functions: [{ returnType: "INT", parameters: [] }],
        }),
      ).toThrow("functions[0].name must be a non-empty string");
    });

    it("should reject function entry without returnType", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          version: "1.0.0",
          namespace: "ns",
          functions: [{ name: "Foo", parameters: [] }],
        }),
      ).toThrow("functions[0].returnType must be a non-empty string");
    });

    it("should reject function entry without parameters array", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          version: "1.0.0",
          namespace: "ns",
          functions: [{ name: "Foo", returnType: "INT" }],
        }),
      ).toThrow("functions[0].parameters must be an array");
    });

    it("should reject function block without inputs array", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          version: "1.0.0",
          namespace: "ns",
          functionBlocks: [{ name: "FB", outputs: [], inouts: [] }],
        }),
      ).toThrow("functionBlocks[0].inputs must be an array");
    });

    it("should reject type entry with invalid kind", () => {
      expect(() =>
        loadLibraryManifest({
          name: "lib",
          version: "1.0.0",
          namespace: "ns",
          types: [{ name: "T", kind: "invalid" }],
        }),
      ).toThrow('types[0].kind must be "struct", "enum", or "alias"');
    });
  });

  describe("registerLibrarySymbols", () => {
    it("should register function symbols", () => {
      const symbolTables = new SymbolTables();
      const manifest = loadLibraryManifest({
        name: "test",
        version: "1.0.0",
        namespace: "test",
        functions: [
          {
            name: "LibFunc",
            returnType: "REAL",
            parameters: [{ name: "x", type: "INT", direction: "input" }],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
      });

      registerLibrarySymbols(manifest, symbolTables);

      const func = symbolTables.lookupFunction("LibFunc");
      expect(func).toBeDefined();
      expect(func!.returnType).toBeDefined();
    });

    it("should register type symbols", () => {
      const symbolTables = new SymbolTables();
      const manifest = loadLibraryManifest({
        name: "test",
        version: "1.0.0",
        namespace: "test",
        functions: [],
        functionBlocks: [],
        types: [{ name: "MyType", kind: "alias", baseType: "INT" }],
        headers: [],
        isBuiltin: false,
      });

      registerLibrarySymbols(manifest, symbolTables);

      const typeSym = symbolTables.globalScope.lookup("MyType");
      expect(typeSym).toBeDefined();
      expect(typeSym!.kind).toBe("type");
    });

    it("should register function block symbols", () => {
      const symbolTables = new SymbolTables();
      const manifest = loadLibraryManifest({
        name: "test",
        version: "1.0.0",
        namespace: "test",
        functions: [],
        functionBlocks: [
          {
            name: "MyFB",
            inputs: [{ name: "IN1", type: "BOOL" }],
            outputs: [{ name: "Q", type: "BOOL" }],
            inouts: [],
          },
        ],
        types: [],
        headers: [],
        isBuiltin: false,
      });

      registerLibrarySymbols(manifest, symbolTables);

      const fbSym = symbolTables.globalScope.lookup("MyFB");
      expect(fbSym).toBeDefined();
      expect(fbSym!.kind).toBe("functionBlock");
    });
  });

  describe("registerLibrarySymbols - duplicate handling", () => {
    it("should silently skip duplicate function symbols", () => {
      const symbolTables = new SymbolTables();
      const manifest = loadLibraryManifest({
        name: "test",
        version: "1.0.0",
        namespace: "test",
        functions: [
          {
            name: "DupeFunc",
            returnType: "INT",
            parameters: [],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
      });

      // Register twice - should not throw
      registerLibrarySymbols(manifest, symbolTables);
      registerLibrarySymbols(manifest, symbolTables);

      // First definition wins
      const func = symbolTables.lookupFunction("DupeFunc");
      expect(func).toBeDefined();
    });
  });

  describe("builtin stdlib", () => {
    it("should generate a manifest for the built-in stdlib", () => {
      const manifest = getBuiltinStdlibManifest();
      expect(manifest.name).toBe("iec-stdlib");
      expect(manifest.isBuiltin).toBe(true);
      expect(manifest.functions.length).toBeGreaterThan(40);
    });

    it("should include all functions from the registry", () => {
      const manifest = getBuiltinStdlibManifest();
      const registry = new StdFunctionRegistry();
      const allFuncs = registry.getAll();

      expect(manifest.functions).toHaveLength(allFuncs.length);
    });
  });

  describe("end-to-end library workflow", () => {
    it("should compile a library and use its function in a program", () => {
      // Step 1: Compile the library
      const libResult = compileLibrary(
        [
          {
            source: `
              FUNCTION MathAdd : INT
                VAR_INPUT a : INT; b : INT; END_VAR
                MathAdd := a + b;
              END_FUNCTION
            `,
            fileName: "math.st",
          },
        ],
        { name: "math-lib", version: "1.0.0", namespace: "math" },
      );
      expect(libResult.success).toBe(true);

      // Step 2: Compile a program that uses the library function
      const mainSource = `
        PROGRAM Main
          VAR result : INT; END_VAR
          result := MathAdd(a := 3, b := 4);
        END_PROGRAM
      `;
      const result = compile(mainSource, {
        libraries: [libResult.manifest],
      });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("MathAdd");
    });

    it("should compile a library and use its type in a program", () => {
      // Step 1: Compile a library with a type
      const libResult = compileLibrary(
        [
          {
            source: `
              TYPE
                Point : STRUCT
                  x : INT;
                  y : INT;
                END_STRUCT;
              END_TYPE
            `,
            fileName: "point.st",
          },
        ],
        { name: "geom-lib", version: "1.0.0", namespace: "geom" },
      );
      expect(libResult.success).toBe(true);

      // Step 2: Compile a program that uses the library type
      const mainSource = `
        PROGRAM Main
          VAR p : Point; END_VAR
          p.x := 10;
        END_PROGRAM
      `;
      const result = compile(mainSource, {
        libraries: [libResult.manifest],
      });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("p.x = 10");
    });

    it("should include library headers in generated code", () => {
      const libResult = compileLibrary(
        [
          {
            source: `
              FUNCTION LibHelper : INT
                VAR_INPUT x : INT; END_VAR
                LibHelper := x;
              END_FUNCTION
            `,
            fileName: "helper.st",
          },
        ],
        { name: "helper-lib", version: "1.0.0", namespace: "helper" },
      );
      expect(libResult.success).toBe(true);
      // The manifest should have the library header
      expect(libResult.manifest.headers).toContain("helper-lib.hpp");

      // Step 2: Compile using the library
      const mainSource = `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := LibHelper(x := 5);
        END_PROGRAM
      `;
      const result = compile(mainSource, {
        libraries: [libResult.manifest],
      });

      expect(result.success).toBe(true);
      // The generated header should include the library header
      expect(result.headerCode).toContain('#include "helper-lib.hpp"');
    });

    it("should compile without libraries (backward compatible)", () => {
      const source = `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 42;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("x = 42");
    });
  });
});
