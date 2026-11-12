/**
 * Language features that compile and run as C++: THIS^ member and method
 * access, STRING[n], conversions to and from enumerations, and the access
 * specifiers PRIVATE, PROTECTED and INTERNAL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

/** Compiles `source`, runs program P once and prints its RESULT variable. */
function runProgram(
  tempDir: string,
  pchPath: string,
  source: string,
  name: string,
): string {
  const result = compile(source);
  if (!result.success) {
    throw new Error(
      result.errors.map((e) => `${e.line}: ${e.message}`).join("\n"),
    );
  }
  return compileAndRunStandalone({
    tempDir,
    pchPath,
    headerCode: result.headerCode,
    cppCode: result.cppCode,
    testName: name,
    mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld\\n", (long long)p.RESULT.get());
  return 0;
}`,
  });
}

function errorsOf(source: string): string[] {
  return compile(source).errors.map((e) => e.message);
}

describeIfGpp("language features compiled and run with g++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-lang-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads, writes and calls through THIS^", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK Counter
  VAR n : DINT; END_VAR
  METHOD Bump : DINT
    THIS^.n := THIS^.n + 1;
    Bump := THIS^.n;
  END_METHOD
  METHOD Twice : DINT
    THIS^.Bump();
    Twice := THIS^.Bump();
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR c : Counter; RESULT : DINT; END_VAR
  RESULT := c.Twice() * 10 + c.Bump();
END_PROGRAM`,
      "this_caret",
    );
    expect(out.trim()).toBe("23");
  });

  it("sizes STRING[n] like STRING(n)", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
PROGRAM P
  VAR s : STRING[4]; w : STRING(4); RESULT : DINT; END_VAR
  s := 'abcdefgh';
  w := 'abcdefgh';
  RESULT := LEN(s) * 10 + LEN(w);
END_PROGRAM`,
      "string_bracket",
    );
    expect(out.trim()).toBe("44");
  });

  it("converts integers to enumerations and back", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
TYPE COLOR : (Red := 0, Green := 5, Blue := 9); END_TYPE
TYPE VALVE_STATE : INT (Top := 0, Right := 1, Bottom := 2); END_TYPE
PROGRAM P
  VAR c : COLOR; p : VALVE_STATE; i : INT := 9; RESULT : DINT; END_VAR
  c := TO_COLOR(i);
  p := INT_TO_VALVE_STATE(2);
  RESULT := TO_DINT(c) * 100 + VALVE_STATE_TO_INT(p) * 10 + COLOR_TO_INT(INT_TO_COLOR(5)) / 5;
  IF c <> COLOR#Blue OR p <> VALVE_STATE#Bottom THEN RESULT := -1; END_IF;
END_PROGRAM`,
      "enum_conversions",
    );
    expect(out.trim()).toBe("921");
  });

  it("dispatches a PROTECTED override called from the base and keeps INTERNAL methods callable in the unit", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK Base
  METHOD PROTECTED Size : DINT
    Size := 1;
  END_METHOD
  METHOD INTERNAL Scale : DINT
    Scale := 3;
  END_METHOD
  METHOD Total : DINT
    Total := Size() * THIS^.Scale();
  END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Big EXTENDS Base
  METHOD PROTECTED OVERRIDE Size : DINT
    Size := 7;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR b : Big; RESULT : DINT; END_VAR
  RESULT := b.Total() * 10 + b.Scale();
END_PROGRAM`,
      "access_dispatch",
    );
    expect(out.trim()).toBe("213");
  });

  it("compiles variables named like a method of the block", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK Base
  VAR level : DINT := 4; END_VAR
  METHOD Scale : DINT
    Scale := 10;
  END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Gauge EXTENDS Base
  VAR scale : DINT := 2; END_VAR
  METHOD Level : DINT
    VAR scale2 : DINT; END_VAR
    scale2 := Scale();
    Level := scale2 + scale;
  END_METHOD
  METHOD Uses : DINT
    VAR level : DINT := 5; END_VAR
    Uses := level * 100 + Level();
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR g : Gauge; RESULT : DINT; END_VAR
  RESULT := g.Uses();
END_PROGRAM`,
      "method_name_collisions",
    );
    expect(out.trim()).toBe("512");
  });

  it("computes REAL in single precision and LREAL in double precision", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
PROGRAM P
  VAR r : REAL := 1.0; d : LREAL := 1.0; s : REAL; RESULT : DINT; END_VAR
  r := r + 0.00000001;
  d := d + 0.00000001;
  s := SQRT(REAL#2.0);
  IF r = 1.0 THEN RESULT := RESULT + 1; END_IF;
  IF d > 1.0 THEN RESULT := RESULT + 10; END_IF;
  IF s * s <> 2.0 AND ABS(s * s - 2.0) < 0.000001 THEN RESULT := RESULT + 100; END_IF;
END_PROGRAM`,
      "real_precision",
    );
    expect(out.trim()).toBe("111");
  });
});

describe("access specifiers are enforced by the compiler", () => {
  const LIB = `
FUNCTION_BLOCK Base
  METHOD PRIVATE Secret : DINT Secret := 1; END_METHOD
  METHOD PROTECTED Guarded : DINT Guarded := 2; END_METHOD
  METHOD Open : DINT Open := Secret() + Guarded(); END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Derived EXTENDS Base
  VAR other : Base; END_VAR
  METHOD UseOwn : DINT UseOwn := Guarded() + THIS^.Guarded(); END_METHOD
  METHOD UseOther : DINT UseOther := other.Guarded(); END_METHOD
  METHOD UsePrivate : DINT UsePrivate := Secret(); END_METHOD
END_FUNCTION_BLOCK
`;

  it("allows PRIVATE and PROTECTED inside their lineage", () => {
    const errs = errorsOf(
      LIB.replace(/METHOD UseOther[\s\S]*?END_METHOD/, "").replace(
        /METHOD UsePrivate[\s\S]*?END_METHOD/,
        "",
      ) +
        "PROGRAM main VAR d : Derived; r : DINT; END_VAR r := d.Open(); END_PROGRAM",
    );
    expect(errs).toEqual([]);
  });

  it("refuses a PRIVATE method of the base from a derived FB", () => {
    expect(errorsOf(LIB + "PROGRAM main END_PROGRAM")).toContain(
      "Cannot call PRIVATE method 'SECRET' of 'BASE' from outside 'BASE'.",
    );
  });

  it("refuses a PROTECTED method through an instance outside the caller's lineage", () => {
    expect(errorsOf(LIB + "PROGRAM main END_PROGRAM")).toContain(
      "Cannot call PROTECTED method 'GUARDED' of 'BASE' from 'DERIVED'.",
    );
  });

  it("refuses PROTECTED and PRIVATE from a program, also on inherited methods and member paths", () => {
    const errs = errorsOf(
      LIB.replace(/METHOD UseOther[\s\S]*?END_METHOD/, "").replace(
        /METHOD UsePrivate[\s\S]*?END_METHOD/,
        "",
      ) +
        `PROGRAM main
  VAR d : Derived; arr : ARRAY[0..1] OF Derived; r : DINT; END_VAR
  r := d.Guarded();
  r := arr[1].Guarded();
  r := arr[0].Secret();
END_PROGRAM`,
    );
    expect(errs).toContain(
      "Cannot call PROTECTED method 'GUARDED' of 'BASE' from 'PROGRAM'.",
    );
    expect(errs).toContain(
      "Cannot call PRIVATE method 'SECRET' of 'BASE' from outside 'BASE'.",
    );
    expect(
      errs.filter((e) => e.includes("PROTECTED method 'GUARDED'")).length,
    ).toBe(2);
  });

  it("keeps INTERNAL usable as an identifier", () => {
    expect(
      errorsOf(
        "PROGRAM main VAR Internal : INT; END_VAR Internal := 1; END_PROGRAM",
      ),
    ).toEqual([]);
  });

  it("reports members and named arguments a block does not declare", () => {
    const errs = errorsOf(`
FUNCTION_BLOCK F
  VAR_INPUT a : INT; END_VAR
  VAR hidden : INT; END_VAR
END_FUNCTION_BLOCK
TYPE S : STRUCT x : INT; END_STRUCT; END_TYPE
PROGRAM main
  VAR f : F; s : S; i : INT; END_VAR
  f.Nope := 1;
  i := f.Nope;
  f(Nope := 1);
  f(hidden := 1);
  f(a := 2);
  s.y := 1;
END_PROGRAM`);
    expect(errs).toEqual([
      "'F' has no member 'NOPE'",
      "'F' has no member 'NOPE'",
      "'F' has no input or output 'NOPE'",
      "'HIDDEN' is not an input or output of 'F'",
      "'S' has no member 'Y'",
    ]);
  });

  it("types conversions to and from enumerations", () => {
    const errs = errorsOf(`
TYPE COLOR : (Red := 0, Green := 5); END_TYPE
PROGRAM main
  VAR c : COLOR; i : INT; s : STRING; END_VAR
  c := TO_COLOR(i);
  i := COLOR_TO_INT(c);
  s := TO_COLOR(i);
END_PROGRAM`);
    expect(errs).toEqual(["Cannot assign COLOR to STRING"]);
  });
});
