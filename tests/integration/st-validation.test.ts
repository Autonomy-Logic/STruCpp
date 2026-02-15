/**
 * ST Validation Suite Orchestrator (Phase 9.5).
 *
 * Auto-discovers ST source + test file pairs in tests/st-validation/
 * and runs them end-to-end: compile → parse test → generate test_main → g++ → run.
 *
 * Convention: source = <name>.st, test = test_<name>.st in same directory.
 */

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { parseTestFile } from "../../src/testing/test-parser.js";
import { generateTestMain } from "../../src/backend/test-main-gen.js";
import type { POUInfo, FunctionInfo } from "../../src/backend/test-main-gen.js";
import { hasGpp, RUNTIME_INCLUDE_PATH } from "./test-helpers.js";

const TEST_RUNTIME_PATH = path.resolve(__dirname, "../../src/runtime/test");
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

/**
 * Run a validation test pair: source.st + test_source.st.
 */
function runValidation(
  sourcePath: string,
  testPath: string,
): { stdout: string; exitCode: number } {
  const sourceST = fs.readFileSync(sourcePath, "utf-8");
  const testST = fs.readFileSync(testPath, "utf-8");
  const testFileName = path.basename(testPath);

  // 1. Compile source with isTestBuild for mock infrastructure
  const result = compile(sourceST, {
    headerFileName: "generated.hpp",
    isTestBuild: true,
  });
  if (!result.success) {
    throw new Error(
      `Compilation of ${path.basename(sourcePath)} failed: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  // 2. Build POU info and function info
  const pous: POUInfo[] = [];
  const functions: FunctionInfo[] = [];
  if (result.ast) {
    for (const prog of result.ast.programs) {
      const vars = new Map<string, string>();
      for (const block of prog.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            vars.set(name, decl.type.name);
          }
        }
      }
      pous.push({
        name: prog.name,
        kind: "program",
        cppClassName: `Program_${prog.name}`,
        variables: vars,
      });
    }
    for (const fb of result.ast.functionBlocks) {
      const vars = new Map<string, string>();
      for (const block of fb.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            vars.set(name, decl.type.name);
          }
        }
      }
      pous.push({
        name: fb.name,
        kind: "functionBlock",
        cppClassName: fb.name,
        variables: vars,
      });
    }
    for (const func of result.ast.functions) {
      const params: Array<{ name: string; type: string }> = [];
      for (const block of func.varBlocks) {
        if (block.blockType === "VAR_INPUT" || block.blockType === "VAR_IN_OUT") {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              params.push({ name, type: decl.type.name });
            }
          }
        }
      }
      pous.push({
        name: func.name,
        kind: "function",
        cppClassName: func.name,
        variables: new Map(),
      });
      functions.push({
        name: func.name,
        returnType: func.returnType.name,
        parameters: params,
      });
    }
  }

  // 3. Parse test file
  const parseResult = parseTestFile(testST, testFileName);
  if (parseResult.errors.length > 0) {
    throw new Error(
      `Test parse of ${testFileName} failed: ${parseResult.errors.map((e) => e.message).join(", ")}`,
    );
  }

  // 4. Generate test_main.cpp
  const testMainCpp = generateTestMain([parseResult.testFile!], {
    headerFileName: "generated.hpp",
    pous,
    isTestBuild: true,
    functions,
  });

  // 5. Write to temp dir and compile
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-val-"));
  try {
    fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(tempDir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(path.join(tempDir, "test_main.cpp"), testMainCpp);

    const binaryPath = path.join(tempDir, "test_runner");

    execSync(
      [
        "g++",
        "-std=c++17",
        `-I${RUNTIME_INCLUDE_PATH}`,
        `-I${TEST_RUNTIME_PATH}`,
        `-I${tempDir}`,
        path.join(tempDir, "test_main.cpp"),
        path.join(tempDir, "generated.cpp"),
        "-o",
        binaryPath,
      ].join(" "),
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );

    // 6. Run binary
    try {
      const stdout = execSync(`"${binaryPath}"`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      return { stdout, exitCode: 0 };
    } catch (err: unknown) {
      const execErr = err as { status?: number; stdout?: string };
      return {
        stdout: execErr.stdout ?? "",
        exitCode: execErr.status ?? 1,
      };
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe.skipIf(!hasGpp)("ST Validation Suite", () => {
  const testFiles = findTestFiles(VALIDATION_DIR);

  for (const testPath of testFiles) {
    // Derive source file: test_arithmetic.st → arithmetic.st
    const dir = path.dirname(testPath);
    const baseName = path.basename(testPath).replace(/^test_/, "");
    const sourcePath = path.join(dir, baseName);

    // Skip if source file doesn't exist
    if (!fs.existsSync(sourcePath)) continue;

    const category = path.relative(VALIDATION_DIR, dir);
    const featureName = baseName.replace(/\.st$/, "");
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
