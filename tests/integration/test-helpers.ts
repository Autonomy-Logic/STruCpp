/**
 * Shared test helpers for C++ integration tests.
 *
 * Provides precompiled header (PCH) creation and g++ compilation wrappers
 * to avoid redundant header parsing across ~120 g++ invocations.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
