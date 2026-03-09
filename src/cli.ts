#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Command Line Interface
 *
 * Usage:
 *   strucpp <input.st> [input2.st ...] -o <output.cpp> [options]
 *   strucpp --compile-lib <input.st> [...] -o <dir> --lib-name <name> [options]
 *
 * Options:
 *   -o, --output <file>       Output file path or directory
 *   -d, --debug               Enable debug mode
 *   --no-line-mapping         Disable line mapping
 *   --line-directives         Include #line directives
 *   --source-comments         Include ST source as comments
 *   -O, --optimize <level>    Optimization level (0, 1, 2)
 *   --build                   Compile to executable binary with interactive REPL
 *   --gpp <path>              Custom g++ path (default: g++)
 *   --cc <path>               Custom C compiler path (default: cc)
 *   --cxx-flags <flags>       Extra C++ compiler flags
 *   -L, --lib-path <path>     Library search path (repeatable)
 *   --compile-lib             Compile sources into a library
 *   --lib-name <name>         Library name (required with --compile-lib)
 *   --lib-version <version>   Library version (default: "1.0.0")
 *   --lib-namespace <ns>      C++ namespace (default: derived from lib-name)
 *   -v, --version             Show version
 *   -h, --help                Show help
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  statSync,
} from "fs";
import { resolve, basename, dirname, join } from "path";
import { tmpdir, platform } from "os";
import { execFileSync } from "child_process";
import { compile, getVersion, compileStlib } from "./index.js";
import { loadStlibFromFile, discoverStlibs } from "./library/library-loader.js";
import { discoverSTFiles } from "./library/library-utils.js";
import { generateReplMain } from "./backend/repl-main-gen.js";
import { parseTestFile } from "./testing/test-parser.js";
import {
  generateTestMain,
  buildPOUInfoFromAST,
} from "./backend/test-main-gen.js";
import { analyzeTestFile } from "./semantic/analyzer.js";
import {
  getCxxEnv,
  splitCxxFlags,
  isCompilerAvailable,
  findRuntimeIncludeDir,
  findBundledLibsDir,
} from "./build-utils.js";
import type { CompileOptions } from "./types.js";
import { importCodesysLibrary } from "./library/codesys-import/index.js";

interface CLIOptions {
  inputs: string[];
  output?: string;
  debug: boolean;
  lineMapping: boolean;
  lineDirectives: boolean;
  sourceComments: boolean;
  optimizationLevel: 0 | 1 | 2;
  showHelp: boolean;
  showVersion: boolean;
  build: boolean;
  gpp: string;
  cc: string;
  cxxFlags: string;
  libraryPaths: string[];
  noDefaultLibs: boolean;
  compileLib: boolean;
  libName?: string;
  libVersion: string;
  libNamespace?: string;
  noSource: boolean;
  decompileLib?: string;
  importLib?: string;
  test: string[];
  defines: Record<string, number>;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    inputs: [],
    debug: false,
    lineMapping: true,
    lineDirectives: false,
    sourceComments: false,
    optimizationLevel: 0,
    showHelp: false,
    showVersion: false,
    build: false,
    gpp: "g++",
    cc: process.platform === "win32" ? "gcc" : "cc",
    cxxFlags: "",
    libraryPaths: [],
    noDefaultLibs: false,
    compileLib: false,
    libVersion: "1.0.0",
    noSource: false,
    test: [],
    defines: {},
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      options.showHelp = true;
    } else if (arg === "-v" || arg === "--version") {
      options.showVersion = true;
    } else if (arg === "-d" || arg === "--debug") {
      options.debug = true;
    } else if (arg === "--no-line-mapping") {
      options.lineMapping = false;
    } else if (arg === "--line-directives") {
      options.lineDirectives = true;
    } else if (arg === "--source-comments") {
      options.sourceComments = true;
    } else if (arg === "-o" || arg === "--output") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.output = nextArg;
      }
    } else if (arg === "-O" || arg === "--optimize") {
      i++;
      const level = parseInt(args[i] ?? "0", 10);
      if (level >= 0 && level <= 2) {
        options.optimizationLevel = level as 0 | 1 | 2;
      }
    } else if (arg === "--build") {
      options.build = true;
    } else if (arg === "--gpp") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.gpp = nextArg;
      }
    } else if (arg === "--cc") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.cc = nextArg;
      }
    } else if (arg === "--cxx-flags") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.cxxFlags = nextArg;
      }
    } else if (arg === "-L" || arg === "--lib-path") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.libraryPaths.push(nextArg);
      }
    } else if (arg === "--no-default-libs") {
      options.noDefaultLibs = true;
    } else if (arg === "--compile-lib") {
      options.compileLib = true;
    } else if (arg === "--lib-name") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.libName = nextArg;
      }
    } else if (arg === "--lib-version") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.libVersion = nextArg;
      }
    } else if (arg === "--lib-namespace") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.libNamespace = nextArg;
      }
    } else if (arg === "--no-source") {
      options.noSource = true;
    } else if (arg === "--decompile-lib") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.decompileLib = nextArg;
      }
    } else if (arg === "--import-lib") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.importLib = nextArg;
      }
    } else if (arg === "--define") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        parseDefine(nextArg, options.defines);
      }
    } else if (arg !== undefined && arg.startsWith("-D")) {
      // -DNAME=VALUE (no space) or -D NAME=VALUE (with space)
      const inline = arg.substring(2);
      if (inline.length > 0) {
        parseDefine(inline, options.defines);
      } else {
        i++;
        const nextArg = args[i];
        if (nextArg !== undefined) {
          parseDefine(nextArg, options.defines);
        }
      }
    } else if (arg === "--test") {
      // Collect all following arguments that don't start with '-' as test files
      i++;
      while (
        i < args.length &&
        args[i] !== undefined &&
        !args[i]!.startsWith("-")
      ) {
        options.test.push(args[i]!);
        i++;
      }
      // Back up one so the outer loop increment doesn't skip anything
      i--;
    } else if (arg !== undefined && !arg.startsWith("-")) {
      options.inputs.push(arg);
    }

    i++;
  }

  return options;
}

function showHelp(): void {
  console.log(`
STruC++ - IEC 61131-3 Structured Text to C++ Compiler

Usage:
  strucpp <input.st> [input2.st ...] -o <output.cpp> [options]
  strucpp --compile-lib <input.st|dir> [...] -o <dir> --lib-name <name> [options]

Options:
  -o, --output <file>       Output file path (default: <input>.cpp)
  -d, --debug               Enable debug mode
  --no-line-mapping         Disable line mapping
  --line-directives         Include #line directives in output
  --source-comments         Include ST source as comments
  -O, --optimize <level>    Optimization level (0, 1, 2)
  --build                   Compile to executable with interactive REPL
  --gpp <path>              Custom g++ path (default: g++)
  --cc <path>               Custom C compiler path (default: cc)
  --cxx-flags <flags>       Extra C++ compiler flags
  -L, --lib-path <path>     Library search path (repeatable)
  --no-default-libs         Do not auto-add bundled library paths
  -D, --define NAME=VALUE   Define a global constant (repeatable)
  -v, --version             Show version
  -h, --help                Show this help

Library compilation:
  --compile-lib             Compile sources into a .stlib library archive
  --lib-name <name>         Library name (required with --compile-lib)
  --lib-version <version>   Library version (default: "1.0.0")
  --lib-namespace <ns>      C++ namespace (default: derived from lib-name)
  --no-source               Omit ST source from .stlib archive (closed-source)
  --decompile-lib <path>    Extract ST sources from a .stlib archive

CODESYS import:
  --import-lib <path>       Import a CODESYS V2.3 (.lib) or V3 (.library) file
                            Requires --lib-name; -o sets output dir (default: cwd)

Testing:
  --test <file> [file2...]   Run tests from test file(s) against source files
                             (must come after -o if used)

Examples:
  strucpp program.st -o program.cpp
  strucpp program.st utils.st -o program.cpp
  strucpp program.st -o program.cpp -L ./libs/
  strucpp program.st -o program.cpp --debug --line-directives
  strucpp program.st -o program.cpp --build
  strucpp --compile-lib math.st -o mathlib/ --lib-name math-lib
  strucpp --compile-lib src/mylib/ -o out/ --lib-name my-lib
  strucpp counter.st --test test_counter.st
  strucpp --decompile-lib mylib.stlib -o extracted/
  strucpp --import-lib oscat.lib -o libs/ --lib-name oscat-basic -L libs/

For more information, visit: https://github.com/Autonomy-Logic/STruCpp
`);
}

/**
 * Parse a `NAME=VALUE` define string and add it to the defines record.
 * Ignores malformed input (no `=`, non-numeric value).
 */
function parseDefine(input: string, defines: Record<string, number>): void {
  const eqIdx = input.indexOf("=");
  if (eqIdx > 0) {
    const name = input.substring(0, eqIdx);
    const value = parseInt(input.substring(eqIdx + 1), 10);
    if (!isNaN(value)) {
      defines[name] = value;
    }
  }
}

/**
 * Check whether winget is available on Windows.
 */
function hasWinget(): boolean {
  try {
    execFileSync("winget", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Print platform-specific compiler installation instructions and exit.
 */
function printCompilerNotFound(compiler: string, flag: string): never {
  console.error(
    `\nError: ${compiler === "g++" || compiler === "clang++" ? "C++" : "C"} compiler '${compiler}' not found.\n`,
  );

  const os = platform();
  if (os === "win32") {
    console.error(
      "To compile on Windows you need a C/C++ toolchain (MinGW-w64).\n",
    );
    if (hasWinget()) {
      console.error("  Install via winget (recommended):");
      console.error(
        "    winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT\n",
      );
      console.error(
        "  Then reopen your terminal so the PATH update takes effect.\n",
      );
    }
    console.error("  Or download standalone MinGW-w64 (GCC) from:");
    console.error("    https://winlibs.com\n");
    console.error("  Extract it and add the bin/ folder to your PATH.");
  } else if (os === "darwin") {
    console.error("  Install the Xcode Command Line Tools:\n");
    console.error("    xcode-select --install");
  } else {
    console.error("  Install a C/C++ toolchain:\n");
    console.error("    Ubuntu/Debian:  sudo apt install build-essential");
    console.error("    Fedora/RHEL:    sudo dnf install gcc-c++");
    console.error("    Arch Linux:     sudo pacman -S base-devel");
  }

  console.error(`\n  Or specify a custom compiler with --${flag} <path>`);
  process.exit(1);
}

/**
 * Verify that the required compilers are available before attempting compilation.
 * Called early in --build and --test flows to fail fast with helpful messages.
 */
function ensureCompilersAvailable(options: CLIOptions, needsCC: boolean): void {
  if (!isCompilerAvailable(options.gpp)) {
    printCompilerNotFound(options.gpp, "gpp");
  }
  if (needsCC && !isCompilerAvailable(options.cc)) {
    printCompilerNotFound(options.cc, "cc");
  }
}

/**
 * Build the effective list of library search paths.
 * Prepends the bundled libs directory (like gcc's default system lib paths)
 * unless --no-default-libs is specified.
 */
function getEffectiveLibraryPaths(options: CLIOptions): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  if (!options.noDefaultLibs) {
    const bundledDir = findBundledLibsDir();
    if (bundledDir) {
      const resolved = resolve(bundledDir);
      seen.add(resolved);
      paths.push(resolved);
    }
  }

  for (const p of options.libraryPaths) {
    const resolved = resolve(p);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      paths.push(resolved);
    }
  }
  return paths;
}

/**
 * Library compilation mode: compile ST sources into a single .stlib archive.
 */
function compileLibraryMode(options: CLIOptions): void {
  if (!options.libName) {
    console.error("Error: --lib-name is required with --compile-lib");
    process.exit(1);
  }

  if (options.inputs.length === 0) {
    console.error("Error: No input files specified");
    process.exit(1);
  }

  const outputDir = options.output ? resolve(options.output) : process.cwd();
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const libNamespace =
    options.libNamespace ?? options.libName.replace(/[^a-zA-Z0-9_]/g, "_");

  // Collect input files — if an input is a directory, discover .st files recursively
  const filePaths: string[] = [];
  for (const input of options.inputs) {
    const inputPath = resolve(input);
    try {
      const stat = statSync(inputPath);
      if (stat.isDirectory()) {
        const discovered = discoverSTFiles(inputPath);
        if (discovered.length === 0) {
          console.error(`Error: No .st files found in directory: ${inputPath}`);
          process.exit(1);
        }
        filePaths.push(...discovered);
      } else {
        filePaths.push(inputPath);
      }
    } catch {
      console.error(`Error: Cannot read input: ${inputPath}`);
      process.exit(1);
    }
  }

  // Read all source files
  const sources: Array<{ source: string; fileName: string }> = [];
  for (const filePath of filePaths) {
    try {
      sources.push({
        source: readFileSync(filePath, "utf-8"),
        fileName: basename(filePath),
      });
    } catch {
      console.error(`Error: Cannot read input file: ${filePath}`);
      process.exit(1);
    }
  }

  if (sources.length === 0) {
    console.error("Error: No input files specified");
    process.exit(1);
  }

  console.log(
    `Compiling library "${options.libName}" from ${sources.length} source file(s)...`,
  );

  // Load dependency libraries from explicit -L paths only.
  // Unlike normal compilation, library compilation should not auto-add
  // bundled system libraries as dependencies — only user-specified paths.
  const dependencies: import("./library/library-manifest.js").StlibArchive[] =
    [];
  for (const libPath of options.libraryPaths) {
    try {
      dependencies.push(...discoverStlibs(libPath));
    } catch (e) {
      console.error(
        `Warning: Could not load libraries from ${libPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const stlibOpts: Parameters<typeof compileStlib>[1] = {
    name: options.libName,
    version: options.libVersion,
    namespace: libNamespace,
    noSource: options.noSource,
  };
  if (dependencies.length > 0) {
    stlibOpts.dependencies = dependencies;
  }
  if (Object.keys(options.defines).length > 0) {
    stlibOpts.globalConstants = options.defines;
  }
  const result = compileStlib(sources, stlibOpts);

  if (!result.success) {
    console.error("\nLibrary compilation failed:");
    for (const error of result.errors) {
      const location = error.file
        ? `${error.file}:${error.line ?? 0}`
        : `${error.line ?? 0}`;
      console.error(`  ${location}: error: ${error.message}`);
    }
    process.exit(1);
  }

  // Write single .stlib archive
  const stlibPath = resolve(outputDir, `${options.libName}.stlib`);
  writeFileSync(stlibPath, JSON.stringify(result.archive, null, 2), "utf-8");
  console.log(`Library archive written to ${stlibPath}`);
  console.log("Library compilation successful!");
}

/**
 * Test runner mode: compile source, parse tests, generate + compile + run test binary.
 */
function runTestMode(options: CLIOptions): void {
  ensureCompilersAvailable(options, false);

  if (options.inputs.length === 0) {
    console.error("Error: No source files specified for testing");
    console.error("Usage: strucpp <source.st> --test <test.st>");
    process.exit(1);
  }

  // 1. Read and compile all source files
  const primaryInput = options.inputs[0]!;
  const inputPath = resolve(primaryInput);
  let source: string;
  try {
    source = readFileSync(inputPath, "utf-8");
  } catch {
    console.error(`Error: Cannot read source file: ${inputPath}`);
    process.exit(1);
  }

  const additionalSources: Array<{ source: string; fileName: string }> = [];
  for (const extra of options.inputs.slice(1)) {
    const extraPath = resolve(extra);
    try {
      additionalSources.push({
        source: readFileSync(extraPath, "utf-8"),
        fileName: basename(extraPath),
      });
    } catch {
      console.error(`Error: Cannot read source file: ${extraPath}`);
      process.exit(1);
    }
  }

  const effectiveLibPaths = getEffectiveLibraryPaths(options);
  const compileOptions: Partial<CompileOptions> = {
    headerFileName: "generated.hpp",
    fileName: basename(inputPath),
    isTestBuild: true,
  };
  if (additionalSources.length > 0) {
    compileOptions.additionalSources = additionalSources;
  }
  if (effectiveLibPaths.length > 0) {
    compileOptions.libraryPaths = effectiveLibPaths;
  }
  if (Object.keys(options.defines).length > 0) {
    compileOptions.globalConstants = options.defines;
  }

  const result = compile(source, compileOptions);
  if (!result.success) {
    console.error("Error compiling source files:");
    for (const err of result.errors) {
      const location = err.file
        ? `${err.file}:${err.line}:${err.column}`
        : `${err.line}:${err.column}`;
      console.error(`  ${location}: ${err.severity}: ${err.message}`);
    }
    process.exit(1);
  }

  // 2. Build POU info from the compiled AST
  const { pous } = result.ast ? buildPOUInfoFromAST(result.ast) : { pous: [] };

  // 3. Parse test files
  const testFiles: import("./testing/test-model.js").TestFile[] = [];
  for (const testPath of options.test) {
    const resolvedPath = resolve(testPath);
    let testSource: string;
    try {
      testSource = readFileSync(resolvedPath, "utf-8");
    } catch {
      console.error(`Error: Cannot read test file: ${resolvedPath}`);
      process.exit(1);
    }

    const parseResult = parseTestFile(testSource, basename(testPath));
    if (parseResult.errors.length > 0) {
      console.error(`Error parsing ${basename(testPath)}:`);
      for (const err of parseResult.errors) {
        console.error(`  ${err.line}:${err.column}: ${err.message}`);
      }
      process.exit(1);
    }
    if (parseResult.testFile) {
      testFiles.push(parseResult.testFile);
    }
  }

  if (testFiles.length === 0) {
    console.error("Error: No test cases found in test files");
    process.exit(1);
  }

  // 3b. Semantic analysis of test files
  if (result.symbolTables) {
    let hasTestErrors = false;
    for (const tf of testFiles) {
      const analysisResult = analyzeTestFile(tf, result.symbolTables);
      if (analysisResult.errors.length > 0) {
        hasTestErrors = true;
        console.error(`Error in test file '${tf.fileName}':`);
        for (const err of analysisResult.errors) {
          console.error(`  ${err.line}:${err.column}: ${err.message}`);
        }
      }
    }
    if (hasTestErrors) {
      process.exit(1);
    }
  }

  // 4. Generate test_main.cpp
  const testMainOpts: import("./backend/test-main-gen.js").TestMainGenOptions =
    {
      headerFileName: "generated.hpp",
      pous,
      isTestBuild: true,
    };
  if (result.ast) {
    testMainOpts.ast = result.ast;
  }
  if (result.resolvedLibraries) {
    testMainOpts.libraryArchives = result.resolvedLibraries;
  }
  const testMainCpp = generateTestMain(testFiles, testMainOpts);

  // 5. Write to temp directory
  const tempDir = mkdtempSync(join(tmpdir(), "strucpp-test-"));
  try {
    writeFileSync(join(tempDir, "generated.hpp"), result.headerCode, "utf-8");
    writeFileSync(join(tempDir, "generated.cpp"), result.cppCode, "utf-8");
    writeFileSync(join(tempDir, "test_main.cpp"), testMainCpp, "utf-8");

    // 6. Find runtime include directory
    const runtimeIncludeDir = findRuntimeIncludeDir(options.cxxFlags);
    if (!runtimeIncludeDir) {
      console.error(
        "Error: Could not locate runtime include directory.\n" +
          '  Use --cxx-flags "-I/path/to/runtime/include" to specify it.',
      );
      process.exit(1);
    }

    // Test runtime header directory
    const testRuntimeDir = resolve(dirname(runtimeIncludeDir), "test");

    // 7. Compile with g++
    const binaryPath = join(
      tempDir,
      process.platform === "win32" ? "test_runner.exe" : "test_runner",
    );

    try {
      execFileSync(
        options.gpp,
        [
          "-std=c++17",
          `-I${runtimeIncludeDir}`,
          `-I${testRuntimeDir}`,
          `-I${tempDir}`,
          ...splitCxxFlags(options.cxxFlags),
          join(tempDir, "test_main.cpp"),
          join(tempDir, "generated.cpp"),
          "-o",
          binaryPath,
        ],
        { stdio: ["pipe", "pipe", "pipe"], env: getCxxEnv() },
      );
    } catch (err: unknown) {
      const execErr = err as {
        status?: number;
        stderr?: Buffer | string;
        stdout?: Buffer | string;
      };
      const stderr = execErr.stderr
        ? typeof execErr.stderr === "string"
          ? execErr.stderr
          : execErr.stderr.toString()
        : "";
      console.error("Error: C++ compilation failed:");
      if (stderr) console.error(stderr);
      process.exit(1);
    }

    // 8. Execute test binary and display results
    let exitCode = 0;
    try {
      const output = execFileSync(binaryPath, [], {
        encoding: "utf-8",
        timeout: 30000,
      });
      process.stdout.write(output);
    } catch (err: unknown) {
      const execErr = err as {
        status?: number;
        stdout?: string;
        stderr?: string;
        signal?: string;
      };
      if (execErr.stdout) {
        process.stdout.write(execErr.stdout);
      }
      if (execErr.signal) {
        console.error(
          `Error: Test binary crashed with signal ${execErr.signal}`,
        );
      }
      exitCode = execErr.status ?? 1;
    }

    // 9. Exit with test result code
    process.exit(exitCode);
  } finally {
    // 10. Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Decompile mode: extract ST source files from a .stlib archive.
 */
function decompileLibMode(options: CLIOptions): void {
  let archive: import("./library/library-manifest.js").StlibArchive;
  try {
    archive = loadStlibFromFile(resolve(options.decompileLib!));
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (!archive.sources || archive.sources.length === 0) {
    console.error(
      "Error: This .stlib archive has no embedded sources (compiled with --no-source).",
    );
    process.exit(1);
  }

  const outputDir = options.output ? resolve(options.output) : process.cwd();
  mkdirSync(outputDir, { recursive: true });

  for (const src of archive.sources) {
    const outPath = join(outputDir, src.fileName);
    writeFileSync(outPath, src.source, "utf-8");
    console.log(`  ${outPath}`);
  }
  console.log(
    `Extracted ${archive.sources.length} file(s) from ${archive.manifest.name} v${archive.manifest.version}`,
  );
}

/**
 * Import mode: convert a CODESYS .lib/.library file into a .stlib archive.
 * Extracts ST source from the binary, then compiles via compileStlib().
 */
function importLibMode(options: CLIOptions): void {
  if (!options.libName) {
    console.error("Error: --lib-name is required with --import-lib");
    process.exit(1);
  }

  const outputDir = options.output ? resolve(options.output) : process.cwd();
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Importing CODESYS library: ${options.importLib!}`);

  const importResult = importCodesysLibrary(options.importLib!);

  if (!importResult.success) {
    for (const err of importResult.errors) {
      console.error(`Error: ${err}`);
    }
    process.exit(1);
  }

  for (const w of importResult.warnings) {
    console.warn(`  warning: ${w}`);
  }

  const { metadata } = importResult;
  console.log(`  Format: CODESYS ${metadata.format === "v23" ? "V2.3" : "V3"}`);
  console.log(`  Extracted ${metadata.pouCount} items:`);
  for (const [type, count] of Object.entries(metadata.counts).sort()) {
    console.log(`    ${type}: ${count}`);
  }
  if (metadata.guid) {
    console.log(`  GUID: ${metadata.guid}`);
  }

  // Now compile the extracted sources into a .stlib archive
  const libNamespace =
    options.libNamespace ?? options.libName.replace(/[^a-zA-Z0-9_]/g, "_");

  // Load dependency libraries from explicit -L paths only
  const dependencies: import("./library/library-manifest.js").StlibArchive[] =
    [];
  for (const libPath of options.libraryPaths) {
    try {
      dependencies.push(...discoverStlibs(libPath));
    } catch (e) {
      console.error(
        `Warning: Could not load libraries from ${libPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  console.log(
    `\nCompiling library "${options.libName}" from ${importResult.sources.length} extracted source(s)...`,
  );

  const stlibOpts: Parameters<typeof compileStlib>[1] = {
    name: options.libName,
    version: options.libVersion,
    namespace: libNamespace,
    noSource: options.noSource,
  };
  if (dependencies.length > 0) {
    stlibOpts.dependencies = dependencies;
  }
  if (Object.keys(options.defines).length > 0) {
    stlibOpts.globalConstants = options.defines;
  }
  const result = compileStlib(importResult.sources, stlibOpts);

  if (!result.success) {
    console.error("\nLibrary compilation failed:");
    for (const error of result.errors) {
      const location = error.file
        ? `${error.file}:${error.line ?? 0}`
        : `${error.line ?? 0}`;
      console.error(`  ${location}: error: ${error.message}`);
    }
    console.error(
      "\nNote: Extracted ST sources may need manual adjustments for compilation.",
    );
    process.exit(1);
  }

  const stlibPath = resolve(outputDir, `${options.libName}.stlib`);
  writeFileSync(stlibPath, JSON.stringify(result.archive, null, 2), "utf-8");
  console.log(`\nLibrary archive written to ${stlibPath}`);
  console.log("Import successful!");
}

function main(): void {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.showVersion) {
    console.log(`STruC++ version ${getVersion()}`);
    process.exit(0);
  }

  if (options.showHelp || args.length === 0) {
    showHelp();
    process.exit(options.showHelp ? 0 : 1);
  }

  // Decompile mode
  if (options.decompileLib) {
    decompileLibMode(options);
    return;
  }

  // Import CODESYS library mode
  if (options.importLib) {
    importLibMode(options);
    return;
  }

  // Library compilation mode
  if (options.compileLib) {
    compileLibraryMode(options);
    return;
  }

  // Test mode
  if (options.test.length > 0) {
    runTestMode(options);
    return;
  }

  if (options.inputs.length === 0) {
    console.error("Error: No input file specified");
    console.error('Run "strucpp --help" for usage information');
    process.exit(1);
  }

  const primaryInput = options.inputs[0]!;
  const inputPath = resolve(primaryInput);
  const outputPath = options.output
    ? resolve(options.output)
    : inputPath.replace(/\.st$/i, ".cpp");

  // Derive header filename from output path for correct #include directive
  const headerFileName = basename(outputPath).replace(/\.cpp$/i, ".hpp");

  let source: string;
  try {
    source = readFileSync(inputPath, "utf-8");
  } catch {
    console.error(`Error: Cannot read input file: ${inputPath}`);
    process.exit(1);
  }

  // Read additional source files
  const additionalSources: Array<{ source: string; fileName: string }> = [];
  for (const extra of options.inputs.slice(1)) {
    const extraPath = resolve(extra);
    try {
      additionalSources.push({
        source: readFileSync(extraPath, "utf-8"),
        fileName: basename(extraPath),
      });
    } catch {
      console.error(`Error: Cannot read input file: ${extraPath}`);
      process.exit(1);
    }
  }

  const effectiveLibPaths = getEffectiveLibraryPaths(options);
  const compileOptions: Partial<CompileOptions> = {
    debug: options.debug,
    lineMapping: options.lineMapping,
    lineDirectives: options.lineDirectives,
    sourceComments: options.sourceComments,
    optimizationLevel: options.optimizationLevel,
    headerFileName,
    fileName: basename(inputPath),
  };
  if (additionalSources.length > 0) {
    compileOptions.additionalSources = additionalSources;
  }
  if (effectiveLibPaths.length > 0) {
    compileOptions.libraryPaths = effectiveLibPaths;
  }
  if (Object.keys(options.defines).length > 0) {
    compileOptions.globalConstants = options.defines;
  }

  const fileLabel =
    options.inputs.length > 1
      ? `${options.inputs.length} files`
      : basename(inputPath);
  console.log(`Compiling ${fileLabel}...`);

  const result = compile(source, compileOptions);

  if (!result.success) {
    console.error("\nCompilation failed:");
    for (const error of result.errors) {
      const location = error.file
        ? `${error.file}:${error.line}:${error.column}`
        : `${error.line}:${error.column}`;
      console.error(`  ${location}: ${error.severity}: ${error.message}`);
      if (error.suggestion) {
        console.error(`    Suggestion: ${error.suggestion}`);
      }
    }
    process.exit(1);
  }

  for (const warning of result.warnings) {
    const location = warning.file
      ? `${warning.file}:${warning.line}:${warning.column}`
      : `${warning.line}:${warning.column}`;
    console.warn(`  ${location}: warning: ${warning.message}`);
  }

  try {
    writeFileSync(outputPath, result.cppCode, "utf-8");
    console.log(`Output written to ${outputPath}`);

    if (result.headerCode) {
      const headerPath = outputPath.replace(/\.cpp$/i, ".hpp");
      writeFileSync(headerPath, result.headerCode, "utf-8");
      console.log(`Header written to ${headerPath}`);
    }
  } catch {
    console.error(`Error: Cannot write output file: ${outputPath}`);
    process.exit(1);
  }

  console.log("Compilation successful!");

  // --build: generate main.cpp and invoke g++
  if (options.build) {
    ensureCompilersAvailable(options, true);

    if (!result.ast || !result.projectModel) {
      console.error("Error: AST/ProjectModel not available for --build");
      process.exit(1);
    }

    const outputDir = dirname(outputPath);
    const mainCppPath = resolve(outputDir, "main.cpp");

    // Resolve runtime include dir (auto-discovery + --cxx-flags fallback)
    const runtimeIncludeDir = findRuntimeIncludeDir(options.cxxFlags);
    if (!runtimeIncludeDir) {
      console.error(
        "Error: Could not locate runtime include directory.\n" +
          '  Use --cxx-flags "-I/path/to/runtime/include" to specify it.',
      );
      process.exit(1);
    }

    // Derive repl dir as sibling of include dir (runtime/include -> runtime/repl)
    const replDir = resolve(dirname(runtimeIncludeDir), "repl");
    if (!existsSync(resolve(replDir, "isocline.h"))) {
      console.error(
        `Error: REPL runtime not found at ${replDir}\n` +
          "  Expected runtime/repl/ as sibling of runtime/include/.",
      );
      process.exit(1);
    }

    console.log("Generating REPL harness...");
    const mainCppCode = generateReplMain(result.ast, result.projectModel, {
      headerFileName,
      stSource: source,
      cppCode: result.cppCode,
      headerCode: result.headerCode,
      lineMap: result.lineMap,
      headerLineMap: result.headerLineMap,
    });
    writeFileSync(mainCppPath, mainCppCode, "utf-8");
    console.log(`REPL main written to ${mainCppPath}`);

    // Derive binary output path (strip .cpp extension)
    let binaryPath = outputPath.replace(/\.cpp$/i, "");
    if (process.platform === "win32") binaryPath += ".exe";
    const isoclineObjPath = resolve(outputDir, "isocline.o");

    // Step 1: Compile isocline.c as C (uses execFileSync to avoid shell injection)
    console.log("Compiling isocline...");
    try {
      execFileSync(
        options.cc,
        [
          "-c",
          "-std=c11",
          `-I${replDir}`,
          resolve(replDir, "isocline.c"),
          "-o",
          isoclineObjPath,
        ],
        { stdio: "inherit" },
      );
    } catch (err: unknown) {
      const exitCode = (err as { status?: number }).status;
      console.error(
        `Error: C compilation of isocline failed (exit code ${exitCode ?? "unknown"}).`,
      );
      console.error(
        "Ensure a C compiler is available or specify one with --cc.",
      );
      process.exit(1);
    }

    // Step 2: Compile C++ and link with isocline.o (uses execFileSync to avoid shell injection)
    const gppArgs = [
      "-std=c++17",
      `-I${runtimeIncludeDir}`,
      `-I${replDir}`,
      `-I${outputDir}`,
      ...splitCxxFlags(options.cxxFlags),
      mainCppPath,
      outputPath,
      isoclineObjPath,
      "-o",
      binaryPath,
    ];

    console.log(`Building binary: ${basename(binaryPath)}`);
    try {
      execFileSync(options.gpp, gppArgs, {
        stdio: "inherit",
        env: getCxxEnv(),
      });
      console.log(`Binary built: ${binaryPath}`);
      console.log(`Run it with: ${binaryPath}`);
    } catch (err: unknown) {
      const exitCode = (err as { status?: number }).status;
      console.error(
        `Error: g++ compilation failed (exit code ${exitCode ?? "unknown"}).`,
      );
      console.error("Check the compiler output above for details.");
      process.exit(1);
    }
  }
}

main();
