#!/usr/bin/env node
/**
 * STruC++ Command Line Interface
 *
 * Usage:
 *   strucpp <input.st> -o <output.cpp> [options]
 *
 * Options:
 *   -o, --output <file>    Output file path
 *   -d, --debug            Enable debug mode
 *   --no-line-mapping      Disable line mapping
 *   --line-directives      Include #line directives
 *   --source-comments      Include ST source as comments
 *   -O, --optimize <level> Optimization level (0, 1, 2)
 *   --build                Compile to executable binary with interactive REPL
 *   --gpp <path>           Custom g++ path (default: g++)
 *   --cxx-flags <flags>    Extra C++ compiler flags
 *   -v, --version          Show version
 *   -h, --help             Show help
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename, dirname } from "path";
import { execSync } from "child_process";
import { compile, getVersion } from "./index.js";
import { generateReplMain } from "./backend/repl-main-gen.js";
import type { CompileOptions } from "./types.js";

interface CLIOptions {
  input?: string;
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
  cxxFlags: string;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    debug: false,
    lineMapping: true,
    lineDirectives: false,
    sourceComments: false,
    optimizationLevel: 0,
    showHelp: false,
    showVersion: false,
    build: false,
    gpp: "g++",
    cxxFlags: "",
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
    } else if (arg === "--cxx-flags") {
      i++;
      const nextArg = args[i];
      if (nextArg !== undefined) {
        options.cxxFlags = nextArg;
      }
    } else if (arg !== undefined && !arg.startsWith("-")) {
      options.input = arg;
    }

    i++;
  }

  return options;
}

function showHelp(): void {
  console.log(`
STruC++ - IEC 61131-3 Structured Text to C++ Compiler

Usage:
  strucpp <input.st> -o <output.cpp> [options]

Options:
  -o, --output <file>    Output file path (default: <input>.cpp)
  -d, --debug            Enable debug mode
  --no-line-mapping      Disable line mapping
  --line-directives      Include #line directives in output
  --source-comments      Include ST source as comments
  -O, --optimize <level> Optimization level (0, 1, 2)
  --build                Compile to executable with interactive REPL
  --gpp <path>           Custom g++ path (default: g++)
  --cxx-flags <flags>    Extra C++ compiler flags
  -v, --version          Show version
  -h, --help             Show this help

Examples:
  strucpp program.st -o program.cpp
  strucpp program.st -o program.cpp --debug --line-directives
  strucpp program.st -o program.cpp --build
  strucpp program.st -O 2

For more information, visit: https://github.com/Autonomy-Logic/STruCpp
`);
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

  if (!options.input) {
    console.error("Error: No input file specified");
    console.error('Run "strucpp --help" for usage information');
    process.exit(1);
  }

  const inputPath = resolve(options.input);
  const outputPath = options.output
    ? resolve(options.output)
    : inputPath.replace(/\.st$/i, ".cpp");

  // Derive header filename from output path for correct #include directive
  const headerFileName = basename(outputPath).replace(/\.cpp$/i, ".hpp");

  let source: string;
  try {
    source = readFileSync(inputPath, "utf-8");
  } catch (err) {
    console.error(`Error: Cannot read input file: ${inputPath}`);
    process.exit(1);
  }

  const compileOptions: Partial<CompileOptions> = {
    debug: options.debug,
    lineMapping: options.lineMapping,
    lineDirectives: options.lineDirectives,
    sourceComments: options.sourceComments,
    optimizationLevel: options.optimizationLevel,
    headerFileName,
  };

  console.log(`Compiling ${basename(inputPath)}...`);

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
  } catch (err) {
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

    // Resolve runtime include directory
    // When running from dist/cli.js, go up to project root then into src/runtime/include
    // When running from src/cli.ts directly, go to src/runtime/include
    const scriptDir = dirname(new URL(import.meta.url).pathname);
    let runtimeIncludeDir = resolve(scriptDir, "runtime", "include");
    if (!existsSync(runtimeIncludeDir)) {
      runtimeIncludeDir = resolve(scriptDir, "..", "src", "runtime", "include");
    }

    console.log("Generating REPL harness...");
    const mainCppCode = generateReplMain(result.ast, result.projectModel, {
      headerFileName,
    });
    writeFileSync(mainCppPath, mainCppCode, "utf-8");
    console.log(`REPL main written to ${mainCppPath}`);

    // Derive binary output path (strip .cpp extension)
    const binaryPath = outputPath.replace(/\.cpp$/i, "");

    const gppCmd = [
      options.gpp,
      "-std=c++17",
      `-I"${runtimeIncludeDir}"`,
      `-I"${outputDir}"`,
      options.cxxFlags,
      `"${mainCppPath}"`,
      `"${outputPath}"`,
      `-o "${binaryPath}"`,
    ]
      .filter((s) => s.length > 0)
      .join(" ");

    console.log(`Building binary: ${basename(binaryPath)}`);
    try {
      execSync(gppCmd, { stdio: "inherit" });
      console.log(`Binary built: ${binaryPath}`);
      console.log(`Run it with: ${binaryPath}`);
    } catch (err) {
      console.error("Error: g++ compilation failed");
      process.exit(1);
    }
  }
}

main();
