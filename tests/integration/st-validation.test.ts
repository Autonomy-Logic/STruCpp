/**
 * ST Validation Suite Orchestrator (Phase 9.5).
 *
 * Auto-discovers ST source + test file pairs in tests/st-validation/
 * and runs them end-to-end: compile → parse test → generate test_main → g++ → run.
 *
 * Convention: source = <name>.st, test = test_<name>.st in same directory.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { hasGpp, runE2ETestPipeline } from "./test-helpers.js";
import { loadStlibFromFile } from "../../src/library/library-loader.js";

const VALIDATION_DIR = path.resolve(__dirname, "../st-validation");

/**
 * Recursively find all test_*.st files under a directory.
 */
function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.startsWith("test_") && entry.name.endsWith(".st")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Load only the IEC standard FB library (not the full libs/ directory,
 *  to avoid loading oscat-basic.stlib which would conflict with inline
 *  OSCAT test sources that redefine the same functions/FBs). */
const IEC_STDLIB_PATH = path.resolve(__dirname, "../../libs/iec-standard-fb.stlib");
const iecStdlib = fs.existsSync(IEC_STDLIB_PATH)
  ? loadStlibFromFile(IEC_STDLIB_PATH)
  : undefined;

/**
 * Run a validation test pair: source.st + test_source.st.
 */
function runValidation(
  sourcePath: string,
  testPath: string,
): { stdout: string; exitCode: number } {
  const sourceST = fs.readFileSync(sourcePath, "utf-8");
  const testST = fs.readFileSync(testPath, "utf-8");

  return runE2ETestPipeline({
    sourceST,
    testST,
    testFileName: path.basename(testPath),
    isTestBuild: true,
    tempDirPrefix: "strucpp-val-",
    compileOptions: {
      libraries: iecStdlib ? [iecStdlib] : [],
    },
  });
}

describe.skipIf(!hasGpp)("ST Validation Suite", () => {
  const testFiles = findTestFiles(VALIDATION_DIR);

  for (const testPath of testFiles) {
    // Derive source file: test_arithmetic.st → arithmetic.st
    const dir = path.dirname(testPath);
    const baseName = path.basename(testPath).replace(/^test_/, "");
    const sourcePath = path.join(dir, baseName);

    const category = path.relative(VALIDATION_DIR, dir);
    const featureName = baseName.replace(/\.st$/, "");

    // Skip if source file doesn't exist (visible in test output)
    if (!fs.existsSync(sourcePath)) {
      it.skip(`validates ${category}/${featureName} (missing source: ${baseName})`, () => {});
      continue;
    }
    const testName = `${category}/${featureName}`;

    it(
      `validates ${testName}`,
      () => {
        const { stdout, exitCode } = runValidation(sourcePath, testPath);
        expect(stdout).not.toContain("[FAIL]");
        expect(exitCode).toBe(0);
      },
      30000,
    );
  }
});
