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

/** Path to the bundled libs directory containing .stlib files */
const LIBS_DIR = path.resolve(__dirname, "../../libs");

/**
 * Load standard FB ST sources for tests that need them.
 * Extracts sources from the pre-compiled .stlib archive.
 * Returns additionalSources array for the compile() options.
 */
function loadStdFBSources(): Array<{ source: string; fileName: string }> {
  const stlibPath = path.resolve(LIBS_DIR, "iec-standard-fb.stlib");
  const archive = JSON.parse(fs.readFileSync(stlibPath, "utf-8"));
  if (!archive.sources || archive.sources.length === 0) {
    throw new Error("Stdlib .stlib has no embedded sources");
  }
  return archive.sources;
}

/**
 * Run a validation test pair: source.st + test_source.st.
 */
function runValidation(
  sourcePath: string,
  testPath: string,
  category: string,
): { stdout: string; exitCode: number } {
  const sourceST = fs.readFileSync(sourcePath, "utf-8");
  const testST = fs.readFileSync(testPath, "utf-8");

  // Standard FB tests need the standard FB library compiled as additional sources
  const compileOptions: Record<string, unknown> = {};
  if (category === "standard_fbs") {
    compileOptions.additionalSources = loadStdFBSources();
  } else {
    // Non-stdlib tests may still use standard FBs via the library path
    compileOptions.libraryPaths = [LIBS_DIR];
  }

  return runE2ETestPipeline({
    sourceST,
    testST,
    testFileName: path.basename(testPath),
    isTestBuild: true,
    tempDirPrefix: "strucpp-val-",
    compileOptions,
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
        const { stdout, exitCode } = runValidation(sourcePath, testPath, category);
        expect(stdout).not.toContain("[FAIL]");
        expect(exitCode).toBe(0);
      },
      30000,
    );
  }
});
