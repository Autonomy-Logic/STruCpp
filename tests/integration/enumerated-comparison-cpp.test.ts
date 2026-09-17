/**
 * EQ and NE on an enumerated data type, and the fundamental-integer traits.
 *
 * Two faults that only a board could see, fixed together because the second is
 * why the first was mis-diagnosed for so long.
 *
 * 1. IEC 61131-3 Ed 3 §6.6.2.5.14 Table 38 lets SEL, MUX, EQ and NE be applied
 *    to inputs of an enumerated data type. SEL and MUX worked; EQ and NE did
 *    not, because the comparison templates constrain on ANY_ELEMENTARY and
 *    §6.4.3 rule 3 puts an enumeration in ANY_DERIVED. So `q = GOOD` compiled
 *    (codegen emits `==` directly) while `EQ(q, GOOD)` did not — the two
 *    spellings of the same Table 38 function disagreed. A ladder or FBD box
 *    has no symbol form, so an enumeration could not be compared in a
 *    graphical language at all, which §8.1.2 requires.
 *
 *    Table 38 lists four functions and no more. GT, GE, LT, LE, MIN, MAX and
 *    LIMIT must keep failing: an enumeration has no defined order. TO_INT must
 *    keep failing too — it takes ANY_ELEMENTARY. Those are asserted here so a
 *    later "fix" cannot quietly widen them.
 *
 * 2. `is_any_elementary` and friends specialise on the fixed-width aliases,
 *    and which fundamental type each names is target-specific. On x86-64
 *    `int32_t` is `int`; on xtensa/ARM/AVR it is `long int`, leaving a plain
 *    `int` with no traits at all. A generated `ADD(0, 0)` therefore compiled
 *    on the host and failed on an ESP32 with "no matching function for call to
 *    ADD(int, int)" — a whole class of defect no host test could ever see.
 *
 *    `long long` is distinct from `int64_t` on this host, so it exercises the
 *    same mechanism here that `int` exercises on a board.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileWithGpp, compileAndRunStandalone } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const PRELUDE = `
TYPE Quality : (UNKNOWN, GOOD, UNCERTAIN, BAD); END_TYPE
TYPE Other : (OTHER_A, OTHER_B); END_TYPE
TYPE Box : STRUCT q : Quality; END_STRUCT END_TYPE
`;

const program = (vars: string, body: string) => `${PRELUDE}
PROGRAM Main
VAR
  q : Quality;
  n : INT;
  b : BOOL;
  ${vars}
END_VAR
  ${body}
END_PROGRAM`;

describeIfGpp("EQ and NE on an enumerated data type (IEC 61131-3 Table 38)", () => {
  let tempDir: string;
  let pchPath: string;
  let caseId = 0;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-enum-cmp-"));
    pchPath = createPCH(tempDir);
  });
  afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  /** Translate to C++ and compile it. Returns whether g++ accepted it. */
  const builds = (vars: string, body: string): boolean => {
    const result = compile(program(vars, body), { programName: "Main" });
    if (!result.success) return false;
    return compileWithGpp({
      tempDir,
      pchPath,
      headerCode: result.headerCode ?? "",
      cppCode: result.cppCode ?? "",
      testName: `enum_cmp_${caseId++}`,
    }).success;
  };

  // --- the four functions Table 38 admits ---------------------------------

  it("compares an enumeration with EQ, the way a ladder box does", () => {
    expect(builds("", `b := EQ(q, GOOD);`)).toBe(true);
  });

  it("compares two enumeration VARIABLES with EQ", () => {
    expect(builds("q2 : Quality;", `b := EQ(q, q2);`)).toBe(true);
  });

  it("compares with NE", () => {
    expect(builds("", `b := NE(q, GOOD);`)).toBe(true);
  });

  it("is extensible, as Table 33 feature 3 is", () => {
    expect(builds("q2 : Quality; q3 : Quality;", `b := EQ(q, q2, q3);`)).toBe(true);
  });

  it("still admits SEL and MUX", () => {
    expect(builds("q3 : Quality;", `q3 := SEL(TRUE, q, q);`)).toBe(true);
    expect(builds("q3 : Quality;", `q3 := MUX(0, q, q);`)).toBe(true);
  });

  // --- every shape an operand can arrive in --------------------------------

  it("reaches an enumeration held in a STRUCT", () => {
    expect(builds("bx : Box;", `b := EQ(bx.q, GOOD);`)).toBe(true);
  });

  it("reaches an enumeration held in an ARRAY", () => {
    expect(builds("qs : ARRAY [0..2] OF Quality;", `b := EQ(qs[0], GOOD);`)).toBe(true);
  });

  // --- and actually gives the right answer ---------------------------------

  it("evaluates correctly, not merely compiles", () => {
    const src = program("q2 : Quality;", `
  q := GOOD;
  q2 := BAD;
  b := EQ(q, GOOD);`);
    const result = compile(src, { programName: "Main" });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode ?? "",
      cppCode: result.cppCode ?? "",
      testName: "enum_cmp_run",
      mainCode: `
#include <iostream>
int main() {
  using namespace strucpp;
  Program_MAIN prog;
  prog.run();
  // EQ(q, GOOD) where q IS GOOD, then the same comparison against a variable
  // holding BAD — a compile-only test would not notice the two being swapped.
  std::cout << (bool)prog.B << " " << (bool)EQ(prog.Q, prog.Q2) << "\\n";
  return 0;
}`,
    });
    expect(out).toBe("1 0");
  });

  // --- what Table 38 does NOT admit ----------------------------------------

  it("refuses an ORDERING on an enumeration — Table 38 lists no such function", () => {
    for (const op of ["GT", "GE", "LT", "LE"]) {
      expect(builds("", `b := ${op}(q, GOOD);`), `${op} must not compile`).toBe(false);
    }
  });

  it("refuses MIN, MAX and LIMIT on an enumeration", () => {
    expect(builds("q3 : Quality;", `q3 := MIN(q, q);`)).toBe(false);
    expect(builds("q3 : Quality;", `q3 := MAX(q, q);`)).toBe(false);
    expect(builds("q3 : Quality;", `q3 := LIMIT(q, q, q);`)).toBe(false);
  });

  it("refuses a conversion out of an enumeration — TO_* takes ANY_ELEMENTARY", () => {
    expect(builds("", `n := TO_INT(q);`)).toBe(false);
    expect(builds("d : DINT;", `d := TO_DINT(q);`)).toBe(false);
  });

  it("refuses a comparison ACROSS two different enumerations", () => {
    // §6.4.4.2: "Different enumerated data types may use the same identifiers
    // for enumerated values" — so this would compare names that only look alike.
    expect(builds("", `b := EQ(q, OTHER_A);`)).toBe(false);
  });
});

describeIfGpp("the fundamental integer types carry IEC traits", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-fund-int-"));
    pchPath = createPCH(tempDir);
  });
  afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  it("accepts every fundamental integer type, whichever the fixed-width aliases name", () => {
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: "",
      cppCode: "",
      testName: "fundamental_int_traits",
      mainCode: `
#include <iostream>
using namespace strucpp;
#define CHECK(T) \\
  static_assert(is_any_elementary_v<T>, #T " must be ANY_ELEMENTARY"); \\
  static_assert(is_any_num_v<T>, #T " must be ANY_NUM"); \\
  static_assert(is_any_int_v<T>, #T " must be ANY_INT"); \\
  static_assert(iec_bit_size_v<T> == sizeof(T) * 8, #T " must have a width");
CHECK(signed char) CHECK(short) CHECK(int) CHECK(long) CHECK(long long)
CHECK(unsigned char) CHECK(unsigned short) CHECK(unsigned int)
CHECK(unsigned long) CHECK(unsigned long long)
int main() {
  // The rig's actual failure: an untyped literal on both sides. On a target
  // where int32_t is 'long int' this did not resolve at all.
  std::cout << (int)ADD(0, 0) << " " << (int)ADD(1LL, 2LL) << "\\n";
  return 0;
}`,
    });
    expect(out).toBe("0 3");
  });
});
