/**
 * CLI Library Feature Tests
 *
 * Tests for --compile-lib mode, -L library paths, and multiple .st file inputs.
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
    it("should compile ST source into a library with manifest and C++ files", () => {
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

      // Check manifest
      const manifestPath = join(outDir, "math-lib.stlib.json");
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      expect(manifest.name).toBe("math-lib");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.functions).toHaveLength(1);
      expect(manifest.functions[0].name).toBe("MATHADD");

      // Check C++ files
      expect(existsSync(join(outDir, "math-lib.hpp"))).toBe(true);
      expect(existsSync(join(outDir, "math-lib.cpp"))).toBe(true);
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

      const manifest = JSON.parse(
        readFileSync(join(outDir, "my-lib.stlib.json"), "utf-8"),
      );
      expect(manifest.version).toBe("2.5.0");
      expect(manifest.namespace).toBe("myns");
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

  describe("-L / --lib-path", () => {
    it("should load library manifests from a directory and compile successfully", () => {
      const workDir = freshDir("lib-path-basic");
      const libDir = join(workDir, "libs");
      mkdirSync(libDir, { recursive: true });

      // Create a library manifest
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
        join(libDir, "ext-lib.stlib.json"),
        JSON.stringify(manifest),
      );

      // Write a program that uses the library function
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

      const cppCode = readFileSync(outFile, "utf-8");
      expect(cppCode).toContain("EXTFUNC");

      // The header should include the library header
      const hppCode = readFileSync(
        outFile.replace(".cpp", ".hpp"),
        "utf-8",
      );
      expect(hppCode).toContain('#include "ext-lib.hpp"');
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
    it("should compile multiple ST files into a single library", () => {
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

      const manifest = JSON.parse(
        readFileSync(join(outDir, "arith-lib.stlib.json"), "utf-8"),
      );
      expect(manifest.functions).toHaveLength(2);
      const names = manifest.functions.map(
        (f: { name: string }) => f.name,
      );
      expect(names).toContain("LIBADD");
      expect(names).toContain("LIBSUB");
    });
  });
});
