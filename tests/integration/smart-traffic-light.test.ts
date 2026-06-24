/**
 * Real-project integration test: the `smart-traffic-light` sample project.
 *
 * This is a multi-file IEC 61131-3 project (enums, structs, function blocks with
 * inheritance and methods, arrays passed to functions, POINTER TO, the standard
 * FB library) bundled with its own ST unit-test suite. Checking the whole project
 * through compile → C++ → g++ → run guards against codegen regressions that unit
 * tests on isolated snippets miss — e.g. `.at()` emitted for array-view / pointer
 * subscripts, or an elaborated `struct` specifier wrongly applied to an enum
 * alias. The fixture lives in tests/fixtures/smart-traffic-light/.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { hasGpp, runE2ETestPipeline } from "./test-helpers.js";
import { loadStlibFromFile } from "../../src/node/library-loader.js";

/** The project uses TON from the IEC standard FB library (auto-loaded by the CLI). */
const IEC_STDLIB_PATH = path.resolve(
  __dirname,
  "../../libs/iec-standard-fb.stlib",
);
const iecStdlib = fs.existsSync(IEC_STDLIB_PATH)
  ? loadStlibFromFile(IEC_STDLIB_PATH)
  : undefined;

const PROJECT_DIR = path.resolve(
  __dirname,
  "../fixtures/smart-traffic-light",
);
const SRC_DIR = path.join(PROJECT_DIR, "src");
const TEST_DIR = path.join(PROJECT_DIR, "tests");

/** Recursively collect every .st file under `dir`, sorted for determinism. */
function collectST(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectST(full));
    else if (entry.name.endsWith(".st")) out.push(full);
  }
  return out.sort();
}

/** Source files compiled together for every test run. */
function loadSources(): {
  primary: { source: string; fileName: string };
  additional: Array<{ source: string; fileName: string }>;
} {
  const files = collectST(SRC_DIR).map((p) => ({
    source: fs.readFileSync(p, "utf-8"),
    fileName: path.basename(p),
  }));
  const [primary, ...additional] = files;
  if (!primary) throw new Error("No source files found in fixture");
  return { primary, additional };
}

describe.skipIf(!hasGpp)("smart-traffic-light project", () => {
  const { primary, additional } = loadSources();
  const testFiles = collectST(TEST_DIR);

  it("has its source and test files checked into the fixture", () => {
    expect(testFiles.length).toBeGreaterThan(0);
    expect(additional.length).toBeGreaterThan(0);
  });

  // One case per ST test file: compile the whole project together with that test
  // file, build, run, and require every assertion to pass.
  for (const testPath of testFiles) {
    const testName = path.basename(testPath);
    it(`passes all unit tests in ${testName}`, () => {
      const testST = fs.readFileSync(testPath, "utf-8");
      const { stdout, exitCode } = runE2ETestPipeline({
        sourceST: primary.source,
        testST,
        testFileName: testName,
        isTestBuild: true,
        tempDirPrefix: "strucpp-stl-",
        compileOptions: {
          fileName: primary.fileName,
          additionalSources: additional,
          libraries: iecStdlib ? [iecStdlib] : [],
        },
      });

      // exitCode 0 only when every assertion passed; the summary line confirms
      // every test ran (passed count == total) and none failed.
      expect(stdout).not.toContain("[FAIL]");
      const summary = stdout.match(
        /(\d+) tests?, (\d+) passed, (\d+) failed/,
      );
      expect(summary, `no summary line in:\n${stdout}`).not.toBeNull();
      const [, total, passed, failed] = summary!;
      expect(Number(total)).toBeGreaterThan(0);
      expect(passed).toBe(total);
      expect(failed).toBe("0");
      expect(exitCode).toBe(0);
    });
  }
});
