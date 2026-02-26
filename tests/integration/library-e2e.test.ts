/**
 * E2E Library Pipeline Tests
 *
 * Exercises the full library lifecycle: build (.stlib) → compile program → g++ → run.
 * Verifies that custom and bundled libraries work end-to-end through the real toolchain.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compileStlib } from "../../src/library/library-compiler.js";
import { compile } from "../../src/index.js";
import {
  hasGpp,
  createPCH,
  compileAndRunStandalone,
  runE2ETestPipeline,
} from "./test-helpers.js";

const LIBS_DIR = path.resolve(__dirname, "../../libs");

describe.skipIf(!hasGpp)("Library E2E Pipeline", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-lib-e2e-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds a custom library and compiles+runs a program against it", () => {
    // 1. Define and compile a simple FB library
    const libResult = compileStlib(
      [
        {
          source: `
            FUNCTION_BLOCK Adder
              VAR_INPUT
                A : INT;
                B : INT;
              END_VAR
              VAR_OUTPUT
                SUM : INT;
              END_VAR
              SUM := A + B;
            END_FUNCTION_BLOCK
          `,
          fileName: "adder.st",
        },
      ],
      { name: "adder-lib", version: "1.0.0", namespace: "adder" },
    );
    expect(libResult.success).toBe(true);

    // 2. Write .stlib to a temp subdirectory
    const libDir = path.join(tempDir, "libs-custom1");
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, "adder-lib.stlib"),
      JSON.stringify(libResult.archive),
    );

    // 3. Compile a user program that uses the FB
    const userSource = `
      PROGRAM Main
        VAR
          add : Adder;
        END_VAR
        add(A := 10, B := 32);
      END_PROGRAM
    `;
    const result = compile(userSource, {
      libraryPaths: [libDir],
    });
    expect(result.success).toBe(true);
    expect(result.headerCode).toBeTruthy();
    expect(result.cppCode).toBeTruthy();

    // 4. Compile+run — no stub headers needed since .stlib inlines C++ code
    const mainCode = `
#include "generated.hpp"
#include <iostream>
int main() {
    strucpp::Program_MAIN prog;
    prog.run();
    std::cout << static_cast<int>(prog.ADD.SUM) << std::endl;
    return 0;
}
`;
    const stdout = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "lib_e2e_custom",
      mainCode,
    });
    expect(stdout).toBe("42");
  });

  it("builds a custom library and runs tests against it via test framework", () => {
    // 1. Build custom FB library
    const libResult = compileStlib(
      [
        {
          source: `
            FUNCTION_BLOCK Multiplier
              VAR_INPUT
                X : INT;
                Y : INT;
              END_VAR
              VAR_OUTPUT
                PRODUCT : INT;
              END_VAR
              PRODUCT := X * Y;
            END_FUNCTION_BLOCK
          `,
          fileName: "multiplier.st",
        },
      ],
      { name: "mul-lib", version: "1.0.0", namespace: "mul" },
    );
    expect(libResult.success).toBe(true);

    // 2. Write .stlib to disk
    const libDir = path.join(tempDir, "libs-custom2");
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, "mul-lib.stlib"),
      JSON.stringify(libResult.archive),
    );

    // 3. Source program + test ST (test framework instantiates programs locally)
    const sourceST = `
      PROGRAM TestMul
        VAR
          m : Multiplier;
        END_VAR
        m(X := 6, Y := 7);
      END_PROGRAM
    `;
    const testST = `
TEST 'multiplication result'
  VAR uut : TestMul; END_VAR
  uut();
  ASSERT_EQ(uut.m.PRODUCT, 42);
END_TEST
    `;

    // 4. Run through E2E test pipeline
    const { stdout, exitCode } = runE2ETestPipeline({
      sourceST,
      testST,
      testFileName: "test_multiplier.st",
      isTestBuild: true,
      tempDirPrefix: "strucpp-lib-e2e-mul-",
      compileOptions: {
        libraryPaths: [libDir],
      },
    });

    expect(stdout).not.toContain("[FAIL]");
    expect(exitCode).toBe(0);
  });

  it("builds a library with dependencies on another library", () => {
    // 1. Build Library A: BaseCounter
    const libAResult = compileStlib(
      [
        {
          source: `
            FUNCTION_BLOCK BaseCounter
              VAR_INPUT
                Enable : BOOL;
              END_VAR
              VAR_OUTPUT
                Count : INT;
              END_VAR
              VAR
                internal : INT;
              END_VAR
              IF Enable THEN
                internal := internal + 1;
              END_IF;
              Count := internal;
            END_FUNCTION_BLOCK
          `,
          fileName: "base_counter.st",
        },
      ],
      { name: "base-counter-lib", version: "1.0.0", namespace: "basectr" },
    );
    expect(libAResult.success).toBe(true);

    // 2. Build Library B depending on Library A: DoubleCounter
    const libBResult = compileStlib(
      [
        {
          source: `
            FUNCTION_BLOCK DoubleCounter
              VAR_INPUT
                Enable : BOOL;
              END_VAR
              VAR_OUTPUT
                Count : INT;
              END_VAR
              VAR
                ctr1 : BaseCounter;
                ctr2 : BaseCounter;
              END_VAR
              ctr1(Enable := Enable);
              ctr2(Enable := Enable);
              Count := ctr1.Count + ctr2.Count;
            END_FUNCTION_BLOCK
          `,
          fileName: "double_counter.st",
        },
      ],
      {
        name: "double-counter-lib",
        version: "1.0.0",
        namespace: "dblctr",
        dependencies: [libAResult.archive],
      },
    );
    expect(libBResult.success).toBe(true);

    // 3. Write only the top-level library to disk. The double-counter-lib stlib
    //    already includes BaseCounter's inlined code from its dependency.
    const libDir = path.join(tempDir, "libs-deps");
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, "double-counter-lib.stlib"),
      JSON.stringify(libBResult.archive),
    );

    // 4. Compile user program
    const userSource = `
      PROGRAM Main
        VAR
          dc : DoubleCounter;
        END_VAR
        dc(Enable := TRUE);
      END_PROGRAM
    `;
    const result = compile(userSource, {
      libraryPaths: [libDir],
    });
    expect(result.success).toBe(true);

    // 5. Compile+run — no stub headers needed since .stlib inlines C++ code
    const mainCode = `
#include "generated.hpp"
#include <iostream>
int main() {
    strucpp::Program_MAIN prog;
    prog.run();
    prog.run();
    prog.run();
    std::cout << static_cast<int>(prog.DC.COUNT) << std::endl;
    return 0;
}
`;
    const stdout = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "lib_e2e_deps",
      mainCode,
    });
    // Each execute: both counters increment by 1, sum = 2. After 3 calls: 6
    expect(stdout).toBe("6");
  });

  it("bundled stdlib works via libraryPaths", () => {
    const sourceST = `
      PROGRAM TestCTU
        VAR
          counter : CTU;
          done : BOOL;
        END_VAR
        counter(CU := TRUE, R := FALSE, PV := 3);
        counter(CU := FALSE, R := FALSE, PV := 3);
        counter(CU := TRUE, R := FALSE, PV := 3);
        counter(CU := FALSE, R := FALSE, PV := 3);
        counter(CU := TRUE, R := FALSE, PV := 3);
        done := counter.Q;
      END_PROGRAM
    `;
    const testST = `
TEST 'CTU reaches preset'
  VAR uut : TestCTU; END_VAR
  uut();
  ASSERT_TRUE(uut.done);
  ASSERT_EQ(uut.counter.CV, 3);
END_TEST
    `;

    const { stdout, exitCode } = runE2ETestPipeline({
      sourceST,
      testST,
      testFileName: "test_stdlib_ctu.st",
      isTestBuild: true,
      tempDirPrefix: "strucpp-lib-e2e-stdlib-",
      compileOptions: {
        libraryPaths: [LIBS_DIR],
      },
    });

    expect(stdout).not.toContain("[FAIL]");
    expect(exitCode).toBe(0);
  });
});
