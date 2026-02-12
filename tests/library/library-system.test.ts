/**
 * STruC++ Library System Tests
 *
 * Tests for library compilation, manifest loading, and symbol registration.
 * Covers Phase 4.5: Library System.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { compileLibrary } from "../../src/library/library-compiler.js";
import {
  loadLibraryManifest,
  loadLibraryFromFile,
  discoverLibraries,
  registerLibrarySymbols,
  LibraryManifestError,
} from "../../src/library/library-loader.js";
import { getBuiltinStdlibManifest } from "../../src/library/builtin-stdlib.js";
import { SymbolTables } from "../../src/semantic/symbol-table.js";
import { StdFunctionRegistry } from "../../src/semantic/std-function-registry.js";
import { compile } from "../../src/index.js";

const TMP_BASE = join(tmpdir(), "strucpp-lib-unit-tests");

function freshDir(name: string): string {
  const dir = join(TMP_BASE, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

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

  describe("loadLibraryFromFile", () => {
    beforeAll(() => {
      if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
      mkdirSync(TMP_BASE, { recursive: true });
    });

    it("should load a valid manifest from a .stlib.json file", () => {
      const dir = freshDir("load-valid");
      const manifestPath = join(dir, "test.stlib.json");
      writeFileSync(
        manifestPath,
        JSON.stringify({
          name: "file-lib",
          version: "1.0.0",
          namespace: "filelib",
          functions: [
            {
              name: "FileFunc",
              returnType: "INT",
              parameters: [{ name: "x", type: "INT", direction: "input" }],
            },
          ],
          functionBlocks: [],
          types: [],
          headers: ["file-lib.hpp"],
          isBuiltin: false,
        }),
      );

      const manifest = loadLibraryFromFile(manifestPath);
      expect(manifest.name).toBe("file-lib");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.functions).toHaveLength(1);
      expect(manifest.functions[0]!.name).toBe("FileFunc");
    });

    it("should throw LibraryManifestError for nonexistent file", () => {
      expect(() => loadLibraryFromFile("/nonexistent/path.stlib.json")).toThrow(
        LibraryManifestError,
      );
      expect(() => loadLibraryFromFile("/nonexistent/path.stlib.json")).toThrow(
        "Cannot read library manifest",
      );
    });

    it("should throw LibraryManifestError for invalid JSON", () => {
      const dir = freshDir("load-bad-json");
      const manifestPath = join(dir, "bad.stlib.json");
      writeFileSync(manifestPath, "not valid json {{{");

      expect(() => loadLibraryFromFile(manifestPath)).toThrow(
        LibraryManifestError,
      );
      expect(() => loadLibraryFromFile(manifestPath)).toThrow(
        "Invalid JSON in library manifest",
      );
    });

    it("should throw LibraryManifestError for valid JSON with missing fields", () => {
      const dir = freshDir("load-incomplete");
      const manifestPath = join(dir, "incomplete.stlib.json");
      writeFileSync(manifestPath, JSON.stringify({ name: "x" }));

      expect(() => loadLibraryFromFile(manifestPath)).toThrow(
        LibraryManifestError,
      );
    });
  });

  describe("discoverLibraries", () => {
    beforeAll(() => {
      if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
      mkdirSync(TMP_BASE, { recursive: true });
    });

    it("should discover all .stlib.json files in a directory", () => {
      const dir = freshDir("discover-multi");
      const manifest1 = {
        name: "lib-a",
        version: "1.0.0",
        namespace: "a",
        functions: [],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
      };
      const manifest2 = {
        name: "lib-b",
        version: "2.0.0",
        namespace: "b",
        functions: [],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
      };
      writeFileSync(
        join(dir, "lib-a.stlib.json"),
        JSON.stringify(manifest1),
      );
      writeFileSync(
        join(dir, "lib-b.stlib.json"),
        JSON.stringify(manifest2),
      );
      // Non-manifest file should be ignored
      writeFileSync(join(dir, "readme.txt"), "not a manifest");

      const result = discoverLibraries(dir);
      expect(result).toHaveLength(2);
      const names = result.map((m) => m.name).sort();
      expect(names).toEqual(["lib-a", "lib-b"]);
    });

    it("should return empty array for directory with no manifests", () => {
      const dir = freshDir("discover-empty");
      writeFileSync(join(dir, "some-file.txt"), "hello");

      const result = discoverLibraries(dir);
      expect(result).toEqual([]);
    });

    it("should throw LibraryManifestError for nonexistent directory", () => {
      expect(() =>
        discoverLibraries(join(TMP_BASE, "nonexistent-dir")),
      ).toThrow(LibraryManifestError);
      expect(() =>
        discoverLibraries(join(TMP_BASE, "nonexistent-dir")),
      ).toThrow("Cannot read library directory");
    });

    it("should throw LibraryManifestError if a manifest file is invalid", () => {
      const dir = freshDir("discover-bad-manifest");
      writeFileSync(join(dir, "bad.stlib.json"), "not json");

      expect(() => discoverLibraries(dir)).toThrow(LibraryManifestError);
    });
  });

  describe("compile() with libraryPaths option", () => {
    beforeAll(() => {
      if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
      mkdirSync(TMP_BASE, { recursive: true });
    });

    it("should load libraries from libraryPaths and resolve symbols", () => {
      const dir = freshDir("compile-libpaths");
      const manifest = {
        name: "ext-lib",
        version: "1.0.0",
        namespace: "ext",
        functions: [
          {
            name: "ExtFunc",
            returnType: "INT",
            parameters: [{ name: "x", type: "INT", direction: "input" }],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: ["ext-lib.hpp"],
        isBuiltin: false,
      };
      writeFileSync(
        join(dir, "ext-lib.stlib.json"),
        JSON.stringify(manifest),
      );

      const source = `
        PROGRAM Main
          VAR result : INT; END_VAR
          result := ExtFunc(x := 42);
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [dir] });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("ExtFunc");
      expect(result.headerCode).toContain('#include "ext-lib.hpp"');
    });

    it("should return compile error for invalid libraryPaths", () => {
      const source = `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source, {
        libraryPaths: [join(TMP_BASE, "does-not-exist")],
      });

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain(
        "Cannot read library directory",
      );
    });

    it("should combine libraryPaths with explicit libraries", () => {
      const dir = freshDir("compile-combined");
      const diskManifest = {
        name: "disk-lib",
        version: "1.0.0",
        namespace: "disk",
        functions: [
          {
            name: "DiskFunc",
            returnType: "INT",
            parameters: [{ name: "x", type: "INT", direction: "input" }],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: ["disk-lib.hpp"],
        isBuiltin: false,
      };
      writeFileSync(
        join(dir, "disk-lib.stlib.json"),
        JSON.stringify(diskManifest),
      );

      const inlineManifest = loadLibraryManifest({
        name: "inline-lib",
        version: "1.0.0",
        namespace: "inline",
        functions: [
          {
            name: "InlineFunc",
            returnType: "INT",
            parameters: [{ name: "y", type: "INT", direction: "input" }],
          },
        ],
        functionBlocks: [],
        types: [],
        headers: ["inline-lib.hpp"],
        isBuiltin: false,
      });

      const source = `
        PROGRAM Main
          VAR a : INT; b : INT; END_VAR
          a := DiskFunc(x := 1);
          b := InlineFunc(y := 2);
        END_PROGRAM
      `;
      const result = compile(source, {
        libraryPaths: [dir],
        libraries: [inlineManifest],
      });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("DiskFunc");
      expect(result.cppCode).toContain("InlineFunc");
      expect(result.headerCode).toContain('#include "disk-lib.hpp"');
      expect(result.headerCode).toContain('#include "inline-lib.hpp"');
    });
  });
});
