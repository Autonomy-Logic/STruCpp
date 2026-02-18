/**
 * OSCAT Basic 335 — Full g++ Compilation Test
 *
 * Transpiles all OSCAT .st files to C++ and validates with g++ -fsyntax-only.
 * This test is expected to expose gaps between successful transpilation and
 * valid C++ output. Failures here represent real codegen issues.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, RUNTIME_INCLUDE_PATH } from "./test-helpers.js";
import { execSync } from "child_process";

const OSCAT_LIB_DIR = path.resolve(__dirname, "../st-validation/oscat/lib");

const oscatLibAvailable = (() => {
  try {
    const files = fs.readdirSync(OSCAT_LIB_DIR).filter((f) => f.endsWith(".st"));
    return files.length > 0;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasGpp || !oscatLibAvailable)("OSCAT g++ Compilation", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-oscat-gpp-"));
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
      const stFiles = fs.readdirSync(OSCAT_LIB_DIR).filter((f) => f.endsWith(".st")).sort();
      expect(stFiles.length).toBeGreaterThan(500);

      // Read all ST sources
      const additionalSources: Array<{ source: string; fileName: string }> = [];
      const primarySource = fs.readFileSync(path.join(OSCAT_LIB_DIR, stFiles[0]), "utf-8");

      for (let i = 1; i < stFiles.length; i++) {
        additionalSources.push({
          source: fs.readFileSync(path.join(OSCAT_LIB_DIR, stFiles[i]), "utf-8"),
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

      // Report transpilation failures but don't fail the test
      // (the oscat-test.mjs already validates transpilation)
      if (!result.success) {
        const errorSummary = result.errors.slice(0, 20).map((e) => `  ${e.file || ""}:${e.line}: ${e.message}`).join("\n");
        console.warn(
          `OSCAT transpilation had ${result.errors.length} errors (showing first 20):\n${errorSummary}`,
        );
      }

      // Write output regardless — we want to test whatever C++ was generated
      fs.writeFileSync(path.join(tempDir, "oscat_all.hpp"), result.headerCode || "");
      fs.writeFileSync(path.join(tempDir, "oscat_all.cpp"), result.cppCode || "");

      // Basic sanity: we should have generated some code
      expect((result.headerCode || "").length).toBeGreaterThan(0);
      expect((result.cppCode || "").length).toBeGreaterThan(0);
    },
    120000,
  );

  it(
    "passes g++ -fsyntax-only on merged output",
    () => {
      const hppPath = path.join(tempDir, "oscat_all.hpp");
      const cppPath = path.join(tempDir, "oscat_all.cpp");

      // Skip if transpilation step didn't produce files
      if (!fs.existsSync(hppPath) || !fs.existsSync(cppPath)) {
        console.warn("Skipping g++ check — no transpiled output available");
        return;
      }

      const cppCode = fs.readFileSync(cppPath, "utf-8");
      if (cppCode.length === 0) {
        console.warn("Skipping g++ check — empty C++ output");
        return;
      }

      // Append a minimal main() so g++ has an entry point for syntax checking
      const cppWithMain = cppCode + "\n\nint main() { return 0; }\n";
      const fullCppPath = path.join(tempDir, "oscat_all_main.cpp");
      fs.writeFileSync(fullCppPath, cppWithMain);

      const gppCmd = [
        "g++",
        "-std=c++17",
        "-fsyntax-only",
        "-ferror-limit=200",
        `-include "${pchPath}"`,
        `-I"${RUNTIME_INCLUDE_PATH}"`,
        `-I"${tempDir}"`,
        `"${fullCppPath}"`,
      ].join(" ");

      try {
        execSync(gppCmd, { encoding: "utf-8", timeout: 120000 });
        // If we get here, g++ passed — great!
        expect(true).toBe(true);
      } catch (error) {
        const execError = error as { stdout?: string; stderr?: string; status?: number };
        const output = execError.stdout || execError.stderr || "";

        // Parse error lines to extract unique error types
        const errorLines = output.split("\n").filter((l) => /:\d+:\d+: error:/.test(l));
        const uniqueErrors = new Set(
          errorLines.map((l) => {
            const match = l.match(/error: (.+)/);
            return match ? match[1].substring(0, 100) : l;
          }),
        );

        console.warn(
          `\ng++ found ${errorLines.length} errors (${uniqueErrors.size} unique types):\n`,
        );
        for (const err of uniqueErrors) {
          const count = errorLines.filter((l) => l.includes(err.substring(0, 50))).length;
          console.warn(`  [${count}x] ${err}`);
        }

        // Show first 30 raw error lines for debugging
        console.warn("\nFirst 30 error lines:");
        for (const line of errorLines.slice(0, 30)) {
          console.warn(`  ${line}`);
        }

        // This test is EXPECTED to fail — it exposes the gap list
        // We use expect.soft so the error details are captured but don't
        // prevent the rest of the suite from running
        expect.soft(errorLines.length, `g++ reported ${errorLines.length} errors`).toBe(0);
      }
    },
    120000,
  );
});
