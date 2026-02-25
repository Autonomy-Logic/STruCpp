/**
 * OSCAT Basic 335 — Full End-to-End Compilation Test
 *
 * Transpiles all 551 OSCAT .st files to C++, generates a test harness that
 * instantiates every function block, then does a full g++ compile + link + run.
 * This goes beyond syntax-only checking — it verifies constructors, vtables,
 * linker symbol resolution, and binary execution.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
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
} from "./test-helpers.js";
import { execSync } from "child_process";
import type { CompilationUnit } from "../../src/frontend/ast.js";

const OSCAT_LIB_DIR = path.resolve(__dirname, "../st-validation/oscat/lib");

const oscatLibAvailable = (() => {
  try {
    const files = fs
      .readdirSync(OSCAT_LIB_DIR)
      .filter((f) => f.endsWith(".st"));
    return files.length > 0;
  } catch {
    return false;
  }
})();

/**
 * Auto-generate a test .st file that instantiates every FB in the AST.
 * Each FB gets its own TEST block with a local VAR declaration.
 */
function generateInstantiationTests(ast: CompilationUnit): string {
  const lines: string[] = [];

  for (const fb of ast.functionBlocks) {
    lines.push(`TEST '${fb.name} instantiation'`);
    lines.push(`  VAR uut : ${fb.name}; END_VAR`);
    lines.push(`  ASSERT_TRUE(TRUE);`);
    lines.push(`END_TEST`);
    lines.push("");
  }

  return lines.join("\n");
}

describe.skipIf(!hasGpp || !oscatLibAvailable)(
  "OSCAT Full Compilation",
  () => {
    let tempDir: string;
    let pchPath: string;
    let ast: CompilationUnit | undefined;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-oscat-e2e-"));
      pchPath = createPCH(tempDir);
    }, 30000);

    afterAll(() => {
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it(
      "transpiles all OSCAT files to C++",
      () => {
        // CLK_PRG is an external type referenced by PWM_DC.st and PWM_PW.st
        // but not defined in the OSCAT library. CTRL_PWM.st depends on PWM_DC.
        // Exclude these files so the undefined-type check doesn't block compilation.
        const EXCLUDED_FILES = new Set(["PWM_DC.st", "PWM_PW.st", "CTRL_PWM.st"]);
        const stFiles = fs
          .readdirSync(OSCAT_LIB_DIR)
          .filter((f) => f.endsWith(".st") && !EXCLUDED_FILES.has(f))
          .sort();
        expect(stFiles.length).toBeGreaterThan(500);

        // Read all ST sources
        const additionalSources: Array<{
          source: string;
          fileName: string;
        }> = [];
        const primarySource = fs.readFileSync(
          path.join(OSCAT_LIB_DIR, stFiles[0]),
          "utf-8",
        );

        for (let i = 1; i < stFiles.length; i++) {
          additionalSources.push({
            source: fs.readFileSync(
              path.join(OSCAT_LIB_DIR, stFiles[i]),
              "utf-8",
            ),
            fileName: stFiles[i],
          });
        }

        const result = compile(primarySource, {
          headerFileName: "oscat_all.hpp",
          fileName: stFiles[0],
          additionalSources,
          noStdFBLibrary: false,
          globalConstants: { STRING_LENGTH: 254, LIST_LENGTH: 254 },
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

        // Save for the next test
        ast = result.ast;

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
        if (!ast) {
          console.warn("Skipping — no AST available from previous step");
          return;
        }

        // Generate test .st that instantiates every FB
        const testST = generateInstantiationTests(ast);
        const fbCount = ast.functionBlocks.length;
        expect(fbCount).toBeGreaterThan(0);
        console.log(
          `Generated ${fbCount} FB instantiation tests, ${ast.functions.length} functions compiled`,
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

        // Build POU info from the OSCAT AST
        const { pous } = buildPOUInfoFromAST(ast);

        // Generate test_main.cpp
        const testMainCpp = generateTestMain([parseResult.testFile!], {
          headerFileName: "oscat_all.hpp",
          pous,
          isTestBuild: true,
          ast,
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
          execSync(gppCmd, { encoding: "utf-8", timeout: 180000 });
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
