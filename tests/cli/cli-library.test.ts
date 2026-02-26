/**
 * CLI Library Feature Tests
 *
 * Tests for --compile-lib mode (single .stlib output), -L library paths,
 * folder input, --no-source flag, and multiple .st file inputs.
 * These tests invoke the CLI via the compiled dist/cli.js.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";

const CLI_PATH = resolve(__dirname, "../../dist/cli.js");
const TMP_BASE = join(tmpdir(), "strucpp-cli-tests");

/** Run the CLI and return stdout. Throws on non-zero exit. */
function runCLI(args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    timeout: 15000,
  });
}

/** Run the CLI expecting failure. Returns stderr. */
function runCLIFail(args: string[]): string {
  try {
    execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      timeout: 15000,
    });
    throw new Error("Expected CLI to fail but it succeeded");
  } catch (err: unknown) {
    const e = err as { stderr?: string; status?: number };
    if (e.status === undefined || e.status === 0) throw err;
    return e.stderr ?? "";
  }
}

function freshDir(name: string): string {
  const dir = join(TMP_BASE, name);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("CLI Library Features", () => {
  beforeAll(() => {
    // Ensure dist/cli.js exists
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not built: ${CLI_PATH} not found. Run "npm run build" first.`,
      );
    }
    // Clean up temp base
    if (existsSync(TMP_BASE)) rmSync(TMP_BASE, { recursive: true });
    mkdirSync(TMP_BASE, { recursive: true });
  });

  describe("--compile-lib", () => {
    it("should compile ST source into a single .stlib archive", () => {
      const workDir = freshDir("compile-lib-basic");
      const stFile = join(workDir, "math.st");
      writeFileSync(
        stFile,
        `
        FUNCTION MathAdd : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          MathAdd := a + b;
        END_FUNCTION
      `,
      );

      const outDir = join(workDir, "out");
      const stdout = runCLI([
        "--compile-lib",
        stFile,
        "-o",
        outDir,
        "--lib-name",
        "math-lib",
      ]);

      expect(stdout).toContain("Library compilation successful!");

      // Check .stlib archive exists
      const stlibPath = join(outDir, "math-lib.stlib");
      expect(existsSync(stlibPath)).toBe(true);

      // Validate the .stlib archive structure
      const archive = JSON.parse(readFileSync(stlibPath, "utf-8"));
      expect(archive.formatVersion).toBe(1);
      expect(archive.manifest.name).toBe("math-lib");
      expect(archive.manifest.version).toBe("1.0.0");
      expect(archive.manifest.functions).toHaveLength(1);
      expect(archive.manifest.functions[0].name).toBe("MATHADD");
      expect(archive.headerCode).toBeTruthy();
      expect(archive.cppCode).toBeTruthy();
      expect(archive.dependencies).toEqual([]);

      // Should NOT produce separate .hpp/.cpp files
      expect(existsSync(join(outDir, "math-lib.hpp"))).toBe(false);
      expect(existsSync(join(outDir, "math-lib.cpp"))).toBe(false);
    });

    it("should use custom version and namespace", () => {
      const workDir = freshDir("compile-lib-options");
      const stFile = join(workDir, "funcs.st");
      writeFileSync(
        stFile,
        `
        FUNCTION MyFunc : BOOL
          VAR_INPUT x : INT; END_VAR
          MyFunc := x > 0;
        END_FUNCTION
      `,
      );

      const outDir = join(workDir, "out");
      runCLI([
        "--compile-lib",
        stFile,
        "-o",
        outDir,
        "--lib-name",
        "my-lib",
        "--lib-version",
        "2.5.0",
        "--lib-namespace",
        "myns",
      ]);

      const archive = JSON.parse(
        readFileSync(join(outDir, "my-lib.stlib"), "utf-8"),
      );
      expect(archive.manifest.version).toBe("2.5.0");
      expect(archive.manifest.namespace).toBe("myns");
    });

    it("should fail when --lib-name is missing", () => {
      const workDir = freshDir("compile-lib-no-name");
      const stFile = join(workDir, "test.st");
      writeFileSync(
        stFile,
        `
        FUNCTION F : INT
          VAR_INPUT x : INT; END_VAR
          F := x;
        END_FUNCTION
      `,
      );

      const stderr = runCLIFail(["--compile-lib", stFile, "-o", workDir]);
      expect(stderr).toContain("--lib-name is required");
    });

    it("should fail when no input files are given", () => {
      const workDir = freshDir("compile-lib-no-input");
      const stderr = runCLIFail([
        "--compile-lib",
        "-o",
        workDir,
        "--lib-name",
        "empty",
      ]);
      expect(stderr).toContain("No input files");
    });
  });

  describe("--compile-lib with folder input", () => {
    it("should discover .st files recursively from a directory", () => {
      const workDir = freshDir("compile-lib-folder");
      const srcDir = join(workDir, "src");
      const subDir = join(srcDir, "sub");
      mkdirSync(subDir, { recursive: true });

      writeFileSync(
        join(srcDir, "add.st"),
        `
        FUNCTION LibAdd : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          LibAdd := a + b;
        END_FUNCTION
      `,
      );

      writeFileSync(
        join(subDir, "sub.st"),
        `
        FUNCTION LibSub : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          LibSub := a - b;
        END_FUNCTION
      `,
      );

      const outDir = join(workDir, "out");
      const stdout = runCLI([
        "--compile-lib",
        srcDir,
        "-o",
        outDir,
        "--lib-name",
        "arith-lib",
      ]);

      expect(stdout).toContain("2 source file(s)");
      expect(stdout).toContain("Library compilation successful!");

      const archive = JSON.parse(
        readFileSync(join(outDir, "arith-lib.stlib"), "utf-8"),
      );
      expect(archive.manifest.functions).toHaveLength(2);
      const names = archive.manifest.functions.map(
        (f: { name: string }) => f.name,
      );
      expect(names).toContain("LIBADD");
      expect(names).toContain("LIBSUB");
    });
  });

  describe("--no-source", () => {
    it("should omit sources from .stlib when --no-source is used", () => {
      const workDir = freshDir("compile-lib-nosource");
      const stFile = join(workDir, "func.st");
      writeFileSync(
        stFile,
        `
        FUNCTION F : INT
          VAR_INPUT x : INT; END_VAR
          F := x;
        END_FUNCTION
      `,
      );

      const outDir = join(workDir, "out");
      runCLI([
        "--compile-lib",
        stFile,
        "-o",
        outDir,
        "--lib-name",
        "nosrc-lib",
        "--no-source",
      ]);

      const archive = JSON.parse(
        readFileSync(join(outDir, "nosrc-lib.stlib"), "utf-8"),
      );
      expect(archive.sources).toBeUndefined();
    });

    it("should include sources by default (without --no-source)", () => {
      const workDir = freshDir("compile-lib-withsource");
      const stFile = join(workDir, "func.st");
      writeFileSync(
        stFile,
        `
        FUNCTION F : INT
          VAR_INPUT x : INT; END_VAR
          F := x;
        END_FUNCTION
      `,
      );

      const outDir = join(workDir, "out");
      runCLI([
        "--compile-lib",
        stFile,
        "-o",
        outDir,
        "--lib-name",
        "src-lib",
      ]);

      const archive = JSON.parse(
        readFileSync(join(outDir, "src-lib.stlib"), "utf-8"),
      );
      expect(archive.sources).toBeDefined();
      expect(archive.sources.length).toBeGreaterThan(0);
    });
  });

  describe("-L / --lib-path with .stlib files", () => {
    it("should discover .stlib files and compile with injected C++ code", () => {
      const workDir = freshDir("lib-path-stlib");

      // Step 1: Create a library .stlib via CLI
      const libSrcDir = join(workDir, "libsrc");
      mkdirSync(libSrcDir, { recursive: true });
      writeFileSync(
        join(libSrcDir, "ext.st"),
        `
        FUNCTION ExtFunc : INT
          VAR_INPUT x : INT; END_VAR
          ExtFunc := x * 2;
        END_FUNCTION
      `,
      );

      const libDir = join(workDir, "libs");
      runCLI([
        "--compile-lib",
        join(libSrcDir, "ext.st"),
        "-o",
        libDir,
        "--lib-name",
        "ext-lib",
      ]);

      // Verify .stlib was created
      expect(existsSync(join(libDir, "ext-lib.stlib"))).toBe(true);

      // Step 2: Compile a program using the library
      const stFile = join(workDir, "main.st");
      writeFileSync(
        stFile,
        `
        PROGRAM Main
          VAR result : INT; END_VAR
          result := ExtFunc(x := 42);
        END_PROGRAM
      `,
      );

      const outFile = join(workDir, "main.cpp");
      const stdout = runCLI([stFile, "-o", outFile, "-L", libDir]);
      expect(stdout).toContain("Compilation successful!");

      // Verify the library C++ code is in the output
      const cppCode = readFileSync(outFile, "utf-8");
      expect(cppCode).toContain("EXTFUNC");
      expect(cppCode).toContain("Library: ext-lib");

      const hppCode = readFileSync(
        outFile.replace(".cpp", ".hpp"),
        "utf-8",
      );
      expect(hppCode).toContain("Library: ext-lib");
    });

    it("should fail gracefully with invalid library path", () => {
      const workDir = freshDir("lib-path-invalid");
      const stFile = join(workDir, "main.st");
      writeFileSync(
        stFile,
        `
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `,
      );

      const stderr = runCLIFail([
        stFile,
        "-o",
        join(workDir, "main.cpp"),
        "-L",
        join(workDir, "nonexistent"),
      ]);
      expect(stderr).toContain("Cannot read library directory");
    });
  });

  describe("multiple .st file inputs", () => {
    it("should compile multiple ST files together", () => {
      const workDir = freshDir("multi-file");
      const mainFile = join(workDir, "main.st");
      const utilFile = join(workDir, "utils.st");

      writeFileSync(
        utilFile,
        `
        FUNCTION UtilAdd : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          UtilAdd := a + b;
        END_FUNCTION
      `,
      );

      writeFileSync(
        mainFile,
        `
        PROGRAM Main
          VAR result : INT; END_VAR
          result := UtilAdd(a := 1, b := 2);
        END_PROGRAM
      `,
      );

      const outFile = join(workDir, "main.cpp");
      const stdout = runCLI([mainFile, utilFile, "-o", outFile]);
      expect(stdout).toContain("Compiling 2 files...");
      expect(stdout).toContain("Compilation successful!");

      const cppCode = readFileSync(outFile, "utf-8");
      expect(cppCode).toContain("UTILADD");
    });
  });

  describe("--compile-lib with multiple source files", () => {
    it("should compile multiple ST files into a single .stlib archive", () => {
      const workDir = freshDir("compile-lib-multi");
      const file1 = join(workDir, "add.st");
      const file2 = join(workDir, "sub.st");

      writeFileSync(
        file1,
        `
        FUNCTION LibAdd : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          LibAdd := a + b;
        END_FUNCTION
      `,
      );

      writeFileSync(
        file2,
        `
        FUNCTION LibSub : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          LibSub := a - b;
        END_FUNCTION
      `,
      );

      const outDir = join(workDir, "out");
      runCLI([
        "--compile-lib",
        file1,
        file2,
        "-o",
        outDir,
        "--lib-name",
        "arith-lib",
      ]);

      const archive = JSON.parse(
        readFileSync(join(outDir, "arith-lib.stlib"), "utf-8"),
      );
      expect(archive.formatVersion).toBe(1);
      expect(archive.manifest.functions).toHaveLength(2);
      const names = archive.manifest.functions.map(
        (f: { name: string }) => f.name,
      );
      expect(names).toContain("LIBADD");
      expect(names).toContain("LIBSUB");
    });
  });

  describe("--decompile-lib", () => {
    it("should extract ST sources from a .stlib archive", () => {
      const workDir = freshDir("decompile-basic");
      const stFile = join(workDir, "math.st");
      writeFileSync(
        stFile,
        `
        FUNCTION MathAdd : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          MathAdd := a + b;
        END_FUNCTION
      `,
      );

      // First compile into a .stlib
      const libDir = join(workDir, "lib");
      runCLI([
        "--compile-lib",
        stFile,
        "-o",
        libDir,
        "--lib-name",
        "math-lib",
      ]);

      const stlibPath = join(libDir, "math-lib.stlib");
      expect(existsSync(stlibPath)).toBe(true);

      // Then decompile
      const outDir = join(workDir, "extracted");
      const stdout = runCLI(["--decompile-lib", stlibPath, "-o", outDir]);

      expect(stdout).toContain("Extracted 1 file(s)");
      expect(stdout).toContain("math-lib");
      expect(existsSync(join(outDir, "math.st"))).toBe(true);

      // Verify extracted content matches original
      const extracted = readFileSync(join(outDir, "math.st"), "utf-8");
      const original = readFileSync(stFile, "utf-8");
      expect(extracted).toBe(original);
    });

    it("should fail for archive compiled with --no-source", () => {
      const workDir = freshDir("decompile-nosource");
      const stFile = join(workDir, "func.st");
      writeFileSync(
        stFile,
        `
        FUNCTION F : INT
          VAR_INPUT x : INT; END_VAR
          F := x;
        END_FUNCTION
      `,
      );

      const libDir = join(workDir, "lib");
      runCLI([
        "--compile-lib",
        stFile,
        "-o",
        libDir,
        "--lib-name",
        "nosrc-lib",
        "--no-source",
      ]);

      const stderr = runCLIFail([
        "--decompile-lib",
        join(libDir, "nosrc-lib.stlib"),
      ]);
      expect(stderr).toContain("no embedded sources");
    });

    it("should fail for nonexistent .stlib file", () => {
      const stderr = runCLIFail([
        "--decompile-lib",
        "/nonexistent/path.stlib",
      ]);
      expect(stderr).toContain("Cannot read stlib archive");
    });
  });
});
