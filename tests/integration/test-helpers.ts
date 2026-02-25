/**
 * Shared test helpers for C++ integration tests.
 *
 * Provides precompiled header (PCH) creation and g++ compilation wrappers
 * to avoid redundant header parsing across ~120 g++ invocations.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { compile } from '../../src/index.js';
import { parseTestFile } from '../../src/testing/test-parser.js';
import { generateTestMain, buildPOUInfoFromAST } from '../../src/backend/test-main-gen.js';
import { uppercaseSource } from '../../src/frontend/lexer.js';
import { analyzeTestFile } from '../../src/semantic/analyzer.js';

/** Resolved path to the C++ runtime headers */
export const RUNTIME_INCLUDE_PATH = path.resolve(__dirname, '../../src/runtime/include');

/** Resolved path to the REPL support files (isocline, etc.) */
export const REPL_PATH = path.resolve(__dirname, '../../src/runtime/repl');

/** Header content for the precompiled header */
export const PCH_INCLUDES = `#pragma once
#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_array.hpp"
#include "iec_located.hpp"
#include "iec_std_lib.hpp"
#include "iec_enum.hpp"
#include "iec_memory.hpp"
#include "iec_string.hpp"
#include "iec_wstring.hpp"
#include <array>
#include <cstddef>
#include <string>
#include <iostream>
#include <cstring>
`;

/**
 * Check if g++ is available on the system.
 */
export const hasGpp = (() => {
  try {
    execSync('which g++', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Check if cc (C compiler) is available on the system.
 */
export const hasCc = (() => {
  try {
    execSync('which cc', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Create a precompiled header in the given temp directory.
 * Returns the path to the .hpp file (g++ finds the .gch automatically).
 */
export function createPCH(tempDir: string): string {
  const pchHppPath = path.join(tempDir, 'strucpp_pch.hpp');
  const pchGchPath = pchHppPath + '.gch';

  fs.writeFileSync(pchHppPath, PCH_INCLUDES);
  execSync(
    `g++ -std=c++17 -x c++-header -I"${RUNTIME_INCLUDE_PATH}" "${pchHppPath}" -o "${pchGchPath}" 2>&1`,
    { encoding: 'utf-8' },
  );

  return pchHppPath;
}

export interface CompileWithGppOptions {
  tempDir: string;
  pchPath: string;
  headerCode: string;
  cppCode: string;
  testName: string;
  /** If true, only check syntax (no linking/output binary). Default: true */
  syntaxOnly?: boolean;
  /** Extra g++ flags, e.g. ['-O0', '-O2'] */
  extraFlags?: string[];
  /** Extra -I include paths */
  extraIncludes?: string[];
  /** Extra object files to link */
  extraObjects?: string[];
  /** Custom main() code to append. If not provided, a default main is appended for syntax-only. */
  mainCode?: string;
}

export interface CompileResult {
  success: boolean;
  error?: string;
  outputPath?: string;
}

/**
 * Compile generated C++ code with g++, using the precompiled header.
 */
export function compileWithGpp(opts: CompileWithGppOptions): CompileResult {
  const {
    tempDir,
    pchPath,
    headerCode,
    cppCode,
    testName,
    syntaxOnly = true,
    extraFlags = [],
    extraIncludes = [],
    extraObjects = [],
    mainCode,
  } = opts;

  const headerPath = path.join(tempDir, 'generated.hpp');
  const cppPath = path.join(tempDir, `${testName}.cpp`);

  fs.writeFileSync(headerPath, headerCode);

  let fullCpp: string;
  if (mainCode !== undefined) {
    fullCpp = `${cppCode}\n\n${mainCode}\n`;
  } else {
    fullCpp = `${cppCode}\n\nint main() {\n    return 0;\n}\n`;
  }
  fs.writeFileSync(cppPath, fullCpp);

  const includeFlags = [
    `-include "${pchPath}"`,
    `-I"${RUNTIME_INCLUDE_PATH}"`,
    `-I"${tempDir}"`,
    ...extraIncludes.map((p) => `-I"${p}"`),
  ].join(' ');

  const flagsStr = extraFlags.join(' ');
  const objectsStr = extraObjects.map((o) => `"${o}"`).join(' ');

  try {
    if (syntaxOnly) {
      execSync(
        `g++ -std=c++17 -fsyntax-only ${includeFlags} ${flagsStr} "${cppPath}" 2>&1`,
        { encoding: 'utf-8' },
      );
      return { success: true };
    } else {
      const binPath = path.join(tempDir, testName);
      execSync(
        `g++ -std=c++17 ${includeFlags} ${flagsStr} "${cppPath}" ${objectsStr} -o "${binPath}" 2>&1`,
        { encoding: 'utf-8' },
      );
      return { success: true, outputPath: binPath };
    }
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    return {
      success: false,
      error: execError.stdout || execError.stderr || execError.message || 'Unknown error',
    };
  }
}

export interface CompileAndRunOptions {
  tempDir: string;
  pchPath: string;
  headerCode: string;
  cppCode: string;
  testName: string;
  mainCode: string;
  extraFlags?: string[];
  extraIncludes?: string[];
  extraObjects?: string[];
  timeout?: number;
}

/**
 * Compile and run a standalone C++ binary. Returns stdout output (trimmed).
 */
export function compileAndRunStandalone(opts: CompileAndRunOptions): string {
  const result = compileWithGpp({
    ...opts,
    syntaxOnly: false,
  });
  if (!result.success) {
    throw new Error(`g++ compilation failed: ${result.error}`);
  }

  return execSync(`"${result.outputPath}"`, {
    encoding: 'utf-8',
    timeout: opts.timeout ?? 5000,
  }).trim();
}

/**
 * Pre-compile isocline.c for REPL tests. Returns path to the .o file.
 */
export function precompileIsocline(tempDir: string): string {
  const objPath = path.join(tempDir, 'isocline.o');
  execSync(
    `cc -c -std=c11 -I"${REPL_PATH}" "${path.join(REPL_PATH, 'isocline.c')}" -o "${objPath}" 2>&1`,
    { encoding: 'utf-8' },
  );
  return objPath;
}

// ============================================================================
// End-to-end test pipeline for test runner integration tests
// ============================================================================

/** Resolved path to the test runtime headers (iec_test.hpp) */
export const TEST_RUNTIME_PATH = path.resolve(__dirname, '../../src/runtime/test');

export interface RunE2ETestPipelineOptions {
  sourceST: string;
  testST: string;
  testFileName?: string;
  isTestBuild?: boolean;
  tempDirPrefix?: string;
  /** Additional compile options passed to compile() */
  compileOptions?: Record<string, unknown>;
}

/**
 * End-to-end helper: compile source + test, build binary, run and return output.
 * Shared across test-runner, test-mock-runner, and st-validation integration tests.
 */
export function runE2ETestPipeline(
  opts: RunE2ETestPipelineOptions,
): { stdout: string; exitCode: number } {
  const {
    sourceST,
    testST,
    testFileName = 'test.st',
    isTestBuild = false,
    tempDirPrefix = 'strucpp-test-',
  } = opts;

  // 1. Compile source
  const result = compile(sourceST, {
    headerFileName: 'generated.hpp',
    isTestBuild,
    ...opts.compileOptions,
  });
  if (!result.success) {
    throw new Error(
      `Source compilation failed: ${result.errors.map((e) => e.message).join(', ')}`,
    );
  }

  // 2. Build POU info
  const { pous } = result.ast ? buildPOUInfoFromAST(result.ast) : { pous: [] };

  // 3. Parse test file (uppercase to match case-insensitive ST semantics)
  const parseResult = parseTestFile(uppercaseSource(testST), testFileName);
  if (parseResult.errors.length > 0) {
    throw new Error(
      `Test parse failed: ${parseResult.errors.map((e) => e.message).join(', ')}`,
    );
  }

  // 3b. Semantic analysis of test file
  if (parseResult.testFile && result.symbolTables) {
    const analysisResult = analyzeTestFile(parseResult.testFile, result.symbolTables);
    if (analysisResult.errors.length > 0) {
      throw new Error(
        `Test semantic analysis failed: ${analysisResult.errors.map((e) => e.message).join(', ')}`,
      );
    }
  }

  // 4. Generate test_main.cpp
  const testMainCpp = generateTestMain([parseResult.testFile!], {
    headerFileName: 'generated.hpp',
    pous,
    isTestBuild,
    ast: result.ast,
  });

  // 5. Write to temp dir and compile
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), tempDirPrefix));
  try {
    fs.writeFileSync(path.join(tempDir, 'generated.hpp'), result.headerCode);
    fs.writeFileSync(path.join(tempDir, 'generated.cpp'), result.cppCode);
    fs.writeFileSync(path.join(tempDir, 'test_main.cpp'), testMainCpp);

    const binaryPath = path.join(tempDir, 'test_runner');

    const gppCommand = [
      'g++',
      '-std=c++17',
      `-I${RUNTIME_INCLUDE_PATH}`,
      `-I${TEST_RUNTIME_PATH}`,
      `-I${tempDir}`,
      path.join(tempDir, 'test_main.cpp'),
      path.join(tempDir, 'generated.cpp'),
      '-o',
      binaryPath,
    ].join(' ');

    try {
      execSync(gppCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err: unknown) {
      const execErr = err as { stderr?: string; message?: string };
      throw new Error(
        `g++ compilation failed:\n${execErr.stderr || execErr.message || 'Unknown error'}`,
      );
    }

    // 6. Run binary
    try {
      const stdout = execSync(`"${binaryPath}"`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      return { stdout, exitCode: 0 };
    } catch (err: unknown) {
      const execErr = err as { status?: number; stdout?: string };
      return {
        stdout: execErr.stdout ?? '',
        exitCode: execErr.status ?? 1,
      };
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
