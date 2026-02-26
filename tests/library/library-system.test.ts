/**
 * STruC++ Library System Tests
 *
 * Tests for library compilation, manifest loading, and symbol registration.
 * Covers Phase 4.5: Library System and the .stlib archive format.
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
import { compileStlib } from "../../src/library/library-compiler.js";
import {
  loadLibraryManifest,
  loadLibraryFromFile,
  discoverLibraries,
  loadStlibArchive,
  loadStlibFromFile,
  discoverStlibs,
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
      expect(result.manifest.functions[0]!.name).toBe("MATHADD");
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
      expect(result.manifest.types[0]!.name).toBe("MYSTRUCT");
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

  describe("compileStlib", () => {
    it("should produce a valid StlibArchive with headerCode/cppCode populated", () => {
      const result = compileStlib(
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
      expect(result.archive.formatVersion).toBe(1);
      expect(result.archive.manifest.name).toBe("math-lib");
      expect(result.archive.headerCode).toBeTruthy();
      expect(result.archive.cppCode).toBeTruthy();
      expect(result.archive.dependencies).toEqual([]);
    });

    it("should include sources when noSource is false", () => {
      const result = compileStlib(
        [
          {
            source: `
              FUNCTION F : INT
                VAR_INPUT x : INT; END_VAR
                F := x;
              END_FUNCTION
            `,
            fileName: "f.st",
          },
        ],
        { name: "src-lib", version: "1.0.0", namespace: "src", noSource: false },
      );

      expect(result.success).toBe(true);
      expect(result.archive.sources).toBeDefined();
      expect(result.archive.sources).toHaveLength(1);
      expect(result.archive.sources![0]!.fileName).toBe("f.st");
    });

    it("should omit sources when noSource is true", () => {
      const result = compileStlib(
        [
          {
            source: `
              FUNCTION F : INT
                VAR_INPUT x : INT; END_VAR
                F := x;
              END_FUNCTION
            `,
            fileName: "f.st",
          },
        ],
        { name: "nosrc-lib", version: "1.0.0", namespace: "nosrc", noSource: true },
      );

      expect(result.success).toBe(true);
      expect(result.archive.sources).toBeUndefined();
    });

    it("should return errors on compilation failure", () => {
      const result = compileStlib(
        [
          {
            source: `INVALID SYNTAX !!!`,
            fileName: "bad.st",
          },
        ],
        { name: "bad-lib", version: "1.0.0", namespace: "bad" },
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should produce namespace-body-only C++ code (no includes/pragma/namespace wrapper)", () => {
      const result = compileStlib(
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
      // Should NOT contain namespace wrapper or includes
      expect(result.archive.headerCode).not.toContain("#pragma once");
      expect(result.archive.headerCode).not.toContain("#include");
      expect(result.archive.headerCode).not.toMatch(/^namespace\s/m);
      // Should contain actual code
      expect(result.archive.headerCode).toContain("MATHADD");
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

  describe("loadStlibArchive", () => {
    it("should load a valid StlibArchive from JSON", () => {
      const json = {
        formatVersion: 1,
        manifest: {
          name: "test-lib",
          version: "1.0.0",
          namespace: "test",
          functions: [],
          functionBlocks: [],
          types: [],
          headers: [],
          isBuiltin: false,
        },
        headerCode: "// header",
        cppCode: "// cpp",
        dependencies: [],
      };

      const archive = loadStlibArchive(json);
      expect(archive.formatVersion).toBe(1);
      expect(archive.manifest.name).toBe("test-lib");
      expect(archive.headerCode).toBe("// header");
      expect(archive.cppCode).toBe("// cpp");
      expect(archive.dependencies).toEqual([]);
    });

    it("should reject missing formatVersion", () => {
      expect(() =>
        loadStlibArchive({
          manifest: {
            name: "lib",
            version: "1.0.0",
            namespace: "ns",
            functions: [],
            functionBlocks: [],
            types: [],
            headers: [],
            isBuiltin: false,
          },
          headerCode: "",
          cppCode: "",
          dependencies: [],
        }),
      ).toThrow("'formatVersion' must be 1");
    });

    it("should reject invalid formatVersion", () => {
      expect(() =>
        loadStlibArchive({
          formatVersion: 2,
          manifest: {
            name: "lib",
            version: "1.0.0",
            namespace: "ns",
            functions: [],
            functionBlocks: [],
            types: [],
            headers: [],
            isBuiltin: false,
          },
          headerCode: "",
          cppCode: "",
          dependencies: [],
        }),
      ).toThrow("'formatVersion' must be 1");
    });

    it("should reject missing manifest", () => {
      expect(() =>
        loadStlibArchive({
          formatVersion: 1,
          headerCode: "",
          cppCode: "",
          dependencies: [],
        }),
      ).toThrow("'manifest' must be an object");
    });

    it("should reject missing headerCode", () => {
      expect(() =>
        loadStlibArchive({
          formatVersion: 1,
          manifest: {
            name: "lib",
            version: "1.0.0",
            namespace: "ns",
            functions: [],
            functionBlocks: [],
            types: [],
            headers: [],
            isBuiltin: false,
          },
          cppCode: "",
          dependencies: [],
        }),
      ).toThrow("'headerCode' must be a string");
    });

    it("should reject missing cppCode", () => {
      expect(() =>
        loadStlibArchive({
          formatVersion: 1,
          manifest: {
            name: "lib",
            version: "1.0.0",
            namespace: "ns",
            functions: [],
            functionBlocks: [],
            types: [],
            headers: [],
            isBuiltin: false,
          },
          headerCode: "",
          dependencies: [],
        }),
      ).toThrow("'cppCode' must be a string");
    });

    it("should reject missing dependencies", () => {
      expect(() =>
        loadStlibArchive({
          formatVersion: 1,
          manifest: {
            name: "lib",
            version: "1.0.0",
            namespace: "ns",
            functions: [],
            functionBlocks: [],
            types: [],
            headers: [],
            isBuiltin: false,
          },
          headerCode: "",
          cppCode: "",
        }),
      ).toThrow("'dependencies' must be an array");
    });

    it("should reject null input", () => {
      expect(() => loadStlibArchive(null)).toThrow(LibraryManifestError);
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

  describe("compileStlib with dependencies", () => {
    it("should compile a library that depends on another library", () => {
      // Compile a base library with a helper FB
      const baseResult = compileStlib(
        [
          {
            source: `
              FUNCTION_BLOCK HelperFB
                VAR_INPUT x : BOOL; END_VAR
                VAR_OUTPUT q : BOOL; END_VAR
                q := x;
              END_FUNCTION_BLOCK
            `,
            fileName: "helper.st",
          },
        ],
        { name: "base-lib", version: "1.0.0", namespace: "base" },
      );
      expect(baseResult.success).toBe(true);

      // Compile a dependent library that uses the base library's FB
      const depResult = compileStlib(
        [
          {
            source: `
              PROGRAM Main
                VAR h : HelperFB; END_VAR
                h(x := TRUE);
              END_PROGRAM
            `,
            fileName: "user.st",
          },
        ],
        {
          name: "dep-lib",
          version: "1.0.0",
          namespace: "dep",
          dependencies: [baseResult.archive],
        },
      );
      expect(depResult.success).toBe(true);
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
      // Step 1: Compile the library into a StlibArchive
      const libResult = compileStlib(
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
        libraries: [libResult.archive],
      });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("MATHADD");
    });

    it("should compile a library and use its type in a program", () => {
      const libResult = compileStlib(
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

      const mainSource = `
        PROGRAM Main
          VAR p : Point; END_VAR
          p.x := 10;
        END_PROGRAM
      `;
      const result = compile(mainSource, {
        libraries: [libResult.archive],
      });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("P.X = 10");
    });

    it("should inject library C++ code into output when using StlibArchive", () => {
      const libResult = compileStlib(
        [
          {
            source: `
              FUNCTION_BLOCK MyCounter
                VAR_INPUT
                  increment : BOOL;
                END_VAR
                VAR_OUTPUT
                  count : INT;
                END_VAR
                VAR
                  internal_count : INT;
                END_VAR
                IF increment THEN
                  internal_count := internal_count + 1;
                END_IF;
                count := internal_count;
              END_FUNCTION_BLOCK
            `,
            fileName: "counter.st",
          },
        ],
        { name: "counter-lib", version: "1.0.0", namespace: "counter" },
      );
      expect(libResult.success).toBe(true);
      expect(libResult.archive.headerCode).toBeTruthy();
      expect(libResult.archive.cppCode).toBeTruthy();

      // Compile user program that uses the library FB
      const mainSource = `
        PROGRAM Main
          VAR
            ctr : MyCounter;
            done : BOOL;
          END_VAR
          ctr(increment := TRUE);
          done := ctr.count > 10;
        END_PROGRAM
      `;
      const result = compile(mainSource, {
        libraries: [libResult.archive],
      });

      expect(result.success).toBe(true);
      // Verify library C++ code is injected in the output
      expect(result.headerCode).toContain("Library: counter-lib");
      expect(result.cppCode).toContain("Library: counter-lib");
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
      expect(result.cppCode).toContain("X = 42");
    });

    it("should inject multiple library preambles", () => {
      // Compile two separate libraries
      const lib1 = compileStlib(
        [
          {
            source: `
              FUNCTION_BLOCK FB_A
                VAR_INPUT x : BOOL; END_VAR
                VAR_OUTPUT q : BOOL; END_VAR
                q := x;
              END_FUNCTION_BLOCK
            `,
            fileName: "a.st",
          },
        ],
        { name: "lib-a", version: "1.0.0", namespace: "a" },
      );
      const lib2 = compileStlib(
        [
          {
            source: `
              FUNCTION_BLOCK FB_B
                VAR_INPUT y : INT; END_VAR
                VAR_OUTPUT r : INT; END_VAR
                r := y + 1;
              END_FUNCTION_BLOCK
            `,
            fileName: "b.st",
          },
        ],
        { name: "lib-b", version: "1.0.0", namespace: "b" },
      );
      expect(lib1.success).toBe(true);
      expect(lib2.success).toBe(true);

      // Use both in one compilation
      const mainSource = `
        PROGRAM Main
          VAR
            a : FB_A;
            b : FB_B;
          END_VAR
          a(x := TRUE);
          b(y := 42);
        END_PROGRAM
      `;
      const result = compile(mainSource, {
        libraries: [lib1.archive, lib2.archive],
      });

      expect(result.success).toBe(true);
      expect(result.headerCode).toContain("Library: lib-a");
      expect(result.headerCode).toContain("Library: lib-b");
      expect(result.cppCode).toContain("Library: lib-a");
      expect(result.cppCode).toContain("Library: lib-b");
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

  describe("loadStlibFromFile", () => {
    beforeAll(() => {
      mkdirSync(TMP_BASE, { recursive: true });
    });

    it("should load a valid .stlib archive from file", () => {
      const dir = freshDir("stlib-load-valid");
      const stlibPath = join(dir, "test.stlib");
      writeFileSync(
        stlibPath,
        JSON.stringify({
          formatVersion: 1,
          manifest: {
            name: "file-lib",
            version: "1.0.0",
            namespace: "filelib",
            functions: [],
            functionBlocks: [],
            types: [],
            headers: [],
            isBuiltin: false,
          },
          headerCode: "// header code",
          cppCode: "// cpp code",
          dependencies: [],
        }),
      );

      const archive = loadStlibFromFile(stlibPath);
      expect(archive.formatVersion).toBe(1);
      expect(archive.manifest.name).toBe("file-lib");
      expect(archive.headerCode).toBe("// header code");
      expect(archive.cppCode).toBe("// cpp code");
    });

    it("should throw for nonexistent file", () => {
      expect(() => loadStlibFromFile("/nonexistent/path.stlib")).toThrow(
        LibraryManifestError,
      );
      expect(() => loadStlibFromFile("/nonexistent/path.stlib")).toThrow(
        "Cannot read stlib archive",
      );
    });

    it("should throw for invalid JSON", () => {
      const dir = freshDir("stlib-bad-json");
      const stlibPath = join(dir, "bad.stlib");
      writeFileSync(stlibPath, "not valid json");

      expect(() => loadStlibFromFile(stlibPath)).toThrow(
        "Invalid JSON in stlib archive",
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

  describe("discoverStlibs", () => {
    beforeAll(() => {
      mkdirSync(TMP_BASE, { recursive: true });
    });

    it("should discover all .stlib files in a directory", () => {
      const dir = freshDir("discover-stlibs");
      const archive1 = {
        formatVersion: 1,
        manifest: {
          name: "stlib-a",
          version: "1.0.0",
          namespace: "a",
          functions: [],
          functionBlocks: [],
          types: [],
          headers: [],
          isBuiltin: false,
        },
        headerCode: "",
        cppCode: "",
        dependencies: [],
      };
      const archive2 = {
        formatVersion: 1,
        manifest: {
          name: "stlib-b",
          version: "2.0.0",
          namespace: "b",
          functions: [],
          functionBlocks: [],
          types: [],
          headers: [],
          isBuiltin: false,
        },
        headerCode: "",
        cppCode: "",
        dependencies: [],
      };
      writeFileSync(join(dir, "lib-a.stlib"), JSON.stringify(archive1));
      writeFileSync(join(dir, "lib-b.stlib"), JSON.stringify(archive2));
      writeFileSync(join(dir, "readme.txt"), "not a library");

      const result = discoverStlibs(dir);
      expect(result).toHaveLength(2);
      const names = result.map((a) => a.manifest.name).sort();
      expect(names).toEqual(["stlib-a", "stlib-b"]);
    });

    it("should return empty for directory with no .stlib files", () => {
      const dir = freshDir("discover-stlibs-empty");
      writeFileSync(join(dir, "other.txt"), "hello");

      const result = discoverStlibs(dir);
      expect(result).toEqual([]);
    });

    it("should throw for nonexistent directory", () => {
      expect(() =>
        discoverStlibs(join(TMP_BASE, "nonexistent-stlib-dir")),
      ).toThrow(LibraryManifestError);
    });
  });

  describe("compile() with libraryPaths option (.stlib)", () => {
    beforeAll(() => {
      if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
      mkdirSync(TMP_BASE, { recursive: true });
    });

    it("should load .stlib archives from libraryPaths and inject C++ code", () => {
      const dir = freshDir("compile-stlib-libpaths");

      // Compile a library to get a .stlib archive
      const libResult = compileStlib(
        [
          {
            source: `
              FUNCTION ExtFunc : INT
                VAR_INPUT x : INT; END_VAR
                ExtFunc := x * 2;
              END_FUNCTION
            `,
            fileName: "ext.st",
          },
        ],
        { name: "ext-lib", version: "1.0.0", namespace: "ext" },
      );
      expect(libResult.success).toBe(true);

      // Write the .stlib file to disk
      writeFileSync(
        join(dir, "ext-lib.stlib"),
        JSON.stringify(libResult.archive),
      );

      // Compile a program using the library via -L path
      const source = `
        PROGRAM Main
          VAR result : INT; END_VAR
          result := ExtFunc(x := 42);
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: [dir] });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("EXTFUNC");
      // The library C++ code should be injected
      expect(result.headerCode).toContain("Library: ext-lib");
      expect(result.cppCode).toContain("Library: ext-lib");
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
      const dir = freshDir("compile-stlib-combined");

      // Library on disk as .stlib
      const diskLib = compileStlib(
        [
          {
            source: `
              FUNCTION DiskFunc : INT
                VAR_INPUT x : INT; END_VAR
                DiskFunc := x;
              END_FUNCTION
            `,
            fileName: "disk.st",
          },
        ],
        { name: "disk-lib", version: "1.0.0", namespace: "disk" },
      );
      expect(diskLib.success).toBe(true);
      writeFileSync(
        join(dir, "disk-lib.stlib"),
        JSON.stringify(diskLib.archive),
      );

      // Inline library archive
      const inlineLib = compileStlib(
        [
          {
            source: `
              FUNCTION InlineFunc : INT
                VAR_INPUT y : INT; END_VAR
                InlineFunc := y;
              END_FUNCTION
            `,
            fileName: "inline.st",
          },
        ],
        { name: "inline-lib", version: "1.0.0", namespace: "inline" },
      );
      expect(inlineLib.success).toBe(true);

      const source = `
        PROGRAM Main
          VAR a : INT; b : INT; END_VAR
          a := DiskFunc(x := 1);
          b := InlineFunc(y := 2);
        END_PROGRAM
      `;
      const result = compile(source, {
        libraryPaths: [dir],
        libraries: [inlineLib.archive],
      });

      expect(result.success).toBe(true);
      expect(result.cppCode).toContain("DISKFUNC");
      expect(result.cppCode).toContain("INLINEFUNC");
    });
  });
});
