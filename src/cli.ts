#!/usr/bin/env node
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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, basename, dirname } from "path";
import { execFileSync } from "child_process";
import { compile, getVersion, compileLibrary } from "./index.js";
import { generateReplMain } from "./backend/repl-main-gen.js";
import type { CompileOptions } from "./types.js";

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
  compileLib: boolean;
  libName?: string;
  libVersion: string;
  libNamespace?: string;
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
    compileLib: false,
    libVersion: "1.0.0",
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
  strucpp --compile-lib <input.st> [...] -o <dir> --lib-name <name> [options]

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
  -v, --version             Show version
  -h, --help                Show this help

Library compilation:
  --compile-lib             Compile sources into a library
  --lib-name <name>         Library name (required with --compile-lib)
  --lib-version <version>   Library version (default: "1.0.0")
  --lib-namespace <ns>      C++ namespace (default: derived from lib-name)

Examples:
  strucpp program.st -o program.cpp
  strucpp program.st utils.st -o program.cpp
  strucpp program.st -o program.cpp -L ./libs/
  strucpp program.st -o program.cpp --debug --line-directives
  strucpp program.st -o program.cpp --build
  strucpp --compile-lib math.st -o mathlib/ --lib-name math-lib

For more information, visit: https://github.com/Autonomy-Logic/STruCpp
`);
}

/**
 * Extract -I include paths from a compiler flags string.
 * Handles: -I/path, -I /path, -I"/path with spaces"
 */
function extractIncludePaths(flags: string): string[] {
  const paths: string[] = [];
  const parts = flags.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i] ?? "";
    const part = raw.replace(/^"|"$/g, "");
    if (part === "-I" && i + 1 < parts.length) {
      i++;
      paths.push((parts[i] ?? "").replace(/^"|"$/g, ""));
    } else if (part.startsWith("-I")) {
      paths.push(part.slice(2));
    }
  }
  return paths;
}

/**
 * Split a --cxx-flags string into individual arguments,
 * respecting double-quoted segments (e.g. '-I"/path with spaces"').
 */
function splitCxxFlags(flags: string): string[] {
  if (!flags || !flags.trim()) return [];
  const parts = flags.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((p) => p.replace(/^"|"$/g, ""));
}

/**
 * Locate the runtime include directory by auto-discovery or from --cxx-flags.
 * Returns the resolved path or null if not found.
 */
function findRuntimeIncludeDir(cxxFlags: string): string | null {
  const candidates: string[] = [];

  // From import.meta.url (ESM dev mode)
  try {
    if (typeof import.meta?.url === "string") {
      const scriptDir = dirname(new URL(import.meta.url).pathname);
      candidates.push(resolve(scriptDir, "runtime", "include"));
      candidates.push(resolve(scriptDir, "..", "src", "runtime", "include"));
    }
  } catch {
    // unavailable in CJS bundle / pkg binary
  }

  // From __dirname (CJS bundle via esbuild)
  if (typeof __dirname === "string") {
    candidates.push(resolve(__dirname, "runtime", "include"));
    candidates.push(resolve(__dirname, "..", "src", "runtime", "include"));
  }

  // Relative to binary (pkg binary may be in dist/bin/, dist/, or project root)
  const execDir = dirname(process.execPath);
  for (const base of [
    execDir,
    resolve(execDir, ".."),
    resolve(execDir, "..", ".."),
  ]) {
    candidates.push(resolve(base, "runtime", "include"));
    candidates.push(resolve(base, "src", "runtime", "include"));
  }

  // CWD
  candidates.push(resolve(process.cwd(), "src", "runtime", "include"));

  // Check auto-discovery candidates
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "iec_types.hpp"))) {
      return candidate;
    }
  }

  // Fallback: check user-provided -I paths from --cxx-flags
  for (const ipath of extractIncludePaths(cxxFlags)) {
    const resolved = resolve(ipath);
    if (existsSync(resolve(resolved, "iec_types.hpp"))) {
      return resolved;
    }
  }

  return null;
}

/**
 * Library compilation mode: compile ST sources into a library manifest + C++ output.
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

  // Read all input files
  const sources: Array<{ source: string; fileName: string }> = [];
  for (const input of options.inputs) {
    const inputPath = resolve(input);
    try {
      sources.push({
        source: readFileSync(inputPath, "utf-8"),
        fileName: basename(inputPath),
      });
    } catch {
      console.error(`Error: Cannot read input file: ${inputPath}`);
      process.exit(1);
    }
  }

  console.log(
    `Compiling library "${options.libName}" from ${sources.length} source file(s)...`,
  );

  const result = compileLibrary(sources, {
    name: options.libName,
    version: options.libVersion,
    namespace: libNamespace,
  });

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

  // Write manifest
  const manifestPath = resolve(outputDir, `${options.libName}.stlib.json`);
  writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2), "utf-8");
  console.log(`Manifest written to ${manifestPath}`);

  // Write C++ files
  if (result.headerCode) {
    const headerPath = resolve(outputDir, `${options.libName}.hpp`);
    writeFileSync(headerPath, result.headerCode, "utf-8");
    console.log(`Header written to ${headerPath}`);
  }

  if (result.cppCode) {
    const cppPath = resolve(outputDir, `${options.libName}.cpp`);
    writeFileSync(cppPath, result.cppCode, "utf-8");
    console.log(`Source written to ${cppPath}`);
  }

  console.log("Library compilation successful!");
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

  // Library compilation mode
  if (options.compileLib) {
    compileLibraryMode(options);
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
  if (options.libraryPaths.length > 0) {
    compileOptions.libraryPaths = options.libraryPaths;
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
      execFileSync(options.gpp, gppArgs, { stdio: "inherit" });
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
