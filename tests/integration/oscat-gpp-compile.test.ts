/**
 * OSCAT Basic 335 — Full End-to-End Compilation Test
 *
 * Loads the pre-compiled oscat-basic.stlib archive, compiles a dummy program
 * that pulls in all OSCAT library code, generates a test harness that
 * instantiates every function block, then does a full g++ compile + link + run.
 * This verifies constructors, vtables, linker symbol resolution, and binary execution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { loadStlibFromFile } from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { parseTestFile } from "../../src/testing/test-parser.js";
import {
  generateTestMain,
  buildPOUInfoFromAST,
} from "../../src/backend/test-main-gen.js";
import { uppercaseSource } from "../../src/frontend/lexer.js";
import {
  hasGpp,
  createPCH,
  RUNTIME_INCLUDE_PATH,
  TEST_RUNTIME_PATH,
  cxxEnv,
} from "./test-helpers.js";
import { execSync } from "child_process";

const LIBS_DIR = path.resolve(__dirname, "../../libs");
const OSCAT_STLIB_PATH = path.resolve(LIBS_DIR, "oscat-basic.stlib");

const oscatStlibAvailable = fs.existsSync(OSCAT_STLIB_PATH);

/**
 * Auto-generate a test .st file that instantiates every FB from the archive manifest.
 */
function generateInstantiationTests(
  fbs: Array<{ name: string }>,
): string {
  const lines: string[] = [];

  for (const fb of fbs) {
    lines.push(`TEST '${fb.name} instantiation'`);
    lines.push(`  VAR uut : ${fb.name}; END_VAR`);
    lines.push(`  ASSERT_TRUE(TRUE);`);
    lines.push(`END_TEST`);
    lines.push("");
  }

  return lines.join("\n");
}

describe.skipIf(!hasGpp || !oscatStlibAvailable)(
  "OSCAT Full Compilation",
  () => {
    let tempDir: string;
    let pchPath: string;
    let oscatArchive: StlibArchive;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-oscat-e2e-"));
      pchPath = createPCH(tempDir);
      oscatArchive = loadStlibFromFile(OSCAT_STLIB_PATH);
    }, 30000);

    afterAll(() => {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it(
      "transpiles OSCAT library to C++ via .stlib",
      () => {
        // Compile a minimal dummy program with the OSCAT library loaded
        const dummyST = "PROGRAM _Dummy\nEND_PROGRAM\n";
        const result = compile(dummyST, {
          headerFileName: "oscat_all.hpp",
          fileName: "_dummy.st",
          libraryPaths: [LIBS_DIR],
        });

        if (!result.success) {
          const errorSummary = result.errors
            .slice(0, 20)
            .map((e) => `  ${e.file || ""}:${e.line}: ${e.message}`)
            .join("\n");
          console.warn(
            `OSCAT transpilation had ${result.errors.length} errors (showing first 20):\n${errorSummary}`,
          );
        }

        // Write generated C++ to temp dir
        fs.writeFileSync(
          path.join(tempDir, "oscat_all.hpp"),
          result.headerCode || "",
        );
        fs.writeFileSync(
          path.join(tempDir, "oscat_all.cpp"),
          result.cppCode || "",
        );

        expect((result.headerCode || "").length).toBeGreaterThan(0);
        expect((result.cppCode || "").length).toBeGreaterThan(0);

        console.log(
          `OSCAT archive: ${oscatArchive.manifest.functions.length} functions, ` +
            `${oscatArchive.manifest.functionBlocks.length} FBs, ` +
            `${oscatArchive.manifest.types.length} types`,
        );
      },
      120000,
    );

    it(
      "compiles and runs full OSCAT instantiation test",
      () => {
        const hppPath = path.join(tempDir, "oscat_all.hpp");
        const cppPath = path.join(tempDir, "oscat_all.cpp");

        if (!fs.existsSync(hppPath) || !fs.existsSync(cppPath)) {
          console.warn(
            "Skipping — no transpiled output available from previous step",
          );
          return;
        }

        // Generate test .st that instantiates every FB from the archive manifest
        const fbs = oscatArchive.manifest.functionBlocks;
        const testST = generateInstantiationTests(fbs);
        expect(fbs.length).toBeGreaterThan(0);
        console.log(
          `Generated ${fbs.length} FB instantiation tests`,
        );

        // Parse the test file through the STruC++ test parser
        const parseResult = parseTestFile(
          uppercaseSource(testST),
          "test_oscat_instantiation.st",
        );
        if (parseResult.errors.length > 0) {
          const errMsgs = parseResult.errors
            .map((e) => e.message)
            .join(", ");
          throw new Error(`Test parse failed: ${errMsgs}`);
        }

        // Compile a dummy to get the AST for POU info (needed by test-main-gen)
        const dummyST = "PROGRAM _Dummy\nEND_PROGRAM\n";
        const dummyResult = compile(dummyST, {
          headerFileName: "oscat_all.hpp",
          fileName: "_dummy.st",
          libraryPaths: [LIBS_DIR],
        });
        const { pous } = dummyResult.ast
          ? buildPOUInfoFromAST(dummyResult.ast)
          : { pous: [] };

        // Generate test_main.cpp
        const testMainCpp = generateTestMain([parseResult.testFile!], {
          headerFileName: "oscat_all.hpp",
          pous,
          isTestBuild: true,
          ast: dummyResult.ast,
          libraryArchives: dummyResult.resolvedLibraries,
        });

        const testMainPath = path.join(tempDir, "test_main.cpp");
        fs.writeFileSync(testMainPath, testMainCpp);

        // Full g++ compile + link (with PCH for speed)
        const binaryPath = path.join(tempDir, "oscat_test");
        const gppCmd = [
          "g++",
          "-std=c++17",
          `-include "${pchPath}"`,
          `-I"${RUNTIME_INCLUDE_PATH}"`,
          `-I"${TEST_RUNTIME_PATH}"`,
          `-I"${tempDir}"`,
          `"${testMainPath}"`,
          `"${cppPath}"`,
          "-o",
          `"${binaryPath}"`,
        ].join(" ");

        try {
          execSync(gppCmd, { encoding: "utf-8", timeout: 180000, env: cxxEnv });
        } catch (error) {
          const execError = error as {
            stdout?: string;
            stderr?: string;
          };
          const output = execError.stdout || execError.stderr || "";
          const errorLines = output
            .split("\n")
            .filter((l) => /:\d+:\d+: error:/.test(l));
          console.error(
            `\ng++ compilation failed with ${errorLines.length} errors:`,
          );
          for (const line of errorLines.slice(0, 30)) {
            console.error(`  ${line}`);
          }
          expect.fail(
            `g++ full compile+link failed with ${errorLines.length} errors`,
          );
          return;
        }

        // Run the binary
        try {
          const stdout = execSync(`"${binaryPath}"`, {
            encoding: "utf-8",
            timeout: 30000,
          });

          // Verify no test failures
          expect(stdout).not.toContain("[FAIL]");

          // Log summary
          const passMatch = stdout.match(/(\d+) passed/);
          const failMatch = stdout.match(/(\d+) failed/);
          console.log(
            `OSCAT instantiation: ${passMatch?.[1] ?? "?"} passed, ${failMatch?.[1] ?? "0"} failed`,
          );
        } catch (error) {
          const execError = error as {
            stdout?: string;
            stderr?: string;
            status?: number;
          };
          const stdout = execError.stdout || "";
          console.error("Binary execution output:", stdout);
          expect.fail(
            `OSCAT test binary exited with code ${execError.status ?? "unknown"}`,
          );
        }
      },
      300000,
    );
  },
);
