/**
 * End-to-end proof that 64-bit integer literals survive the whole pipeline: the
 * generated C++ must compile with g++ -std=c++17 AND print back the digits the
 * ST source wrote.
 *
 * Compiling is not sufficient evidence here. `9007199254740993` lowered to
 * `9007199254740992` compiles perfectly — the defect is only visible by running
 * the binary and comparing values. The two bounds are the other half: they used
 * to lower to a decimal past INT64_MAX / UINT64_MAX, which g++ warns on or
 * rejects outright, so "it builds" is itself part of the assertion.
 *
 * -Werror is deliberate: `18446744073709551615` without the `ULL` suffix is a
 * GCC extension that warns rather than fails, and a warning is exactly the
 * failure mode this test exists to catch.
 *
 * `-pedantic-errors`, not a named `-Werror=`: GCC emits this diagnostic
 * ("integer constant is so large that it is unsigned") unconditionally, with
 * no `-W` name of its own to target — `-Werror=implicitly-unsigned-literal`
 * is a Clang-only spelling that GCC rejects outright as an unknown option,
 * aborting the compile before it reaches the check. `-pedantic-errors` is
 * the portable way to turn this specific warning into a hard error on both.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("64-bit integer literals — generated C++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-intlit-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function run(source: string, mainBody: string, testName: string): string {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    return compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
      // An unsuffixed `18446744073709551615` is a GCC *extension* that warns
      // rather than fails, so the warning has to be the failure here.
      extraFlags: ["-pedantic-errors", "-Werror=overflow"],
      mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
    });
  }

  it("round-trips a VAR_GLOBAL value above 2^53", () => {
    const output = run(
      `
      VAR_GLOBAL
        big : LINT := 9007199254740993;
      END_VAR
      `,
      `    std::cout << BIG << std::endl;`,
      "intlit_global_2p53",
    );
    // Rounded through a double this prints ...992.
    expect(output).toBe("9007199254740993");
  });

  it("round-trips both 64-bit bounds", () => {
    const output = run(
      `
      VAR_GLOBAL
        hi : LINT := 9223372036854775807;
        lo : LINT := -9223372036854775808;
        u : ULINT := 18446744073709551615;
      END_VAR
      `,
      `    std::cout << HI << " " << LO << " " << U << std::endl;`,
      "intlit_global_bounds",
    );
    expect(output).toBe(
      "9223372036854775807 -9223372036854775808 18446744073709551615",
    );
  });

  it("round-trips a PROGRAM variable initializer", () => {
    const output = run(
      `
      PROGRAM Main
        VAR
          x : LINT := 9007199254740993;
          u : ULINT := 18446744073709551615;
        END_VAR
        x := x;
      END_PROGRAM
      `,
      `    Program_MAIN p;\n    std::cout << p.X.get() << " " << p.U.get() << std::endl;`,
      "intlit_program",
    );
    expect(output).toBe("9007199254740993 18446744073709551615");
  });

  it("round-trips a STRUCT element default", () => {
    const output = run(
      `
      TYPE
        Big : STRUCT
          a : LINT := 9007199254740993;
          b : ULINT := 18446744073709551615;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        s : Big;
      END_VAR
      `,
      `    std::cout << S.A << " " << S.B << std::endl;`,
      "intlit_struct_default",
    );
    expect(output).toBe("9007199254740993 18446744073709551615");
  });

  it("agrees between a declaration initializer and the same literal assigned in a body", () => {
    const output = run(
      `
      PROGRAM Main
        VAR
          declared : LINT := 9007199254740993;
          assigned : LINT;
        END_VAR
        assigned := 9007199254740993;
      END_PROGRAM
      `,
      `    Program_MAIN p;\n    p.run();\n    std::cout << (p.DECLARED.get() == p.ASSIGNED.get() ? "same" : "differ") << " " << p.ASSIGNED.get() << std::endl;`,
      "intlit_decl_vs_body",
    );
    expect(output).toBe("same 9007199254740993");
  });

  it("round-trips the widest based literal", () => {
    const output = run(
      `
      VAR_GLOBAL
        h : ULINT := 16#FFFFFFFFFFFFFFFF;
      END_VAR
      `,
      `    std::cout << H << std::endl;`,
      "intlit_based_max",
    );
    expect(output).toBe("18446744073709551615");
  });

  it("does not read a leading-zero decimal as octal", () => {
    const output = run(
      `
      VAR_GLOBAL
        a : INT := 007;
        b : INT := 0010;
        c : INT := 008;
      END_VAR
      `,
      `    std::cout << A << " " << B << " " << C << std::endl;`,
      "intlit_leading_zero",
    );
    // Raw digits would make B octal 8, and C would not compile at all.
    expect(output).toBe("7 10 8");
  });
});
