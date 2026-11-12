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
import { compileStlib } from "../../src/library/library-compiler.js";
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

  it("calls through interfaces held by a base, a struct and a method result", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
INTERFACE I METHOD M : DINT END_METHOD END_INTERFACE
INTERFACE J EXTENDS I END_INTERFACE
FUNCTION_BLOCK Impl IMPLEMENTS J
  VAR k : DINT := 7; END_VAR
  METHOD M : DINT M := k; END_METHOD
END_FUNCTION_BLOCK
TYPE Holder : STRUCT itf : I; n : INT; END_STRUCT; END_TYPE
FUNCTION_BLOCK Base VAR itf : I; END_VAR END_FUNCTION_BLOCK
FUNCTION_BLOCK Derived EXTENDS Base
  VAR keep : J; END_VAR
  METHOD Bind : DINT VAR_INPUT target : J; END_VAR
    itf := target; keep := target; Bind := itf.M();
  END_METHOD
  METHOD Kept : I Kept := keep; END_METHOD
  METHOD Nothing : I Nothing := 0; END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR impl : Impl; d : Derived; h : Holder; ii : I; jj : J; RESULT : DINT; END_VAR
  RESULT := d.Bind(impl);
  h.itf := impl;
  RESULT := RESULT * 10 + h.itf.M();
  RESULT := RESULT * 10 + d.Kept().M();
  ii := impl; jj := impl;
  IF ii = jj AND jj = ii AND d.Nothing() = 0 THEN RESULT := RESULT * 10 + 1; END_IF;
END_PROGRAM`,
      "interface_paths",
    );
    expect(out.trim()).toBe("7771");
  });

  it("calls a user function named like an enumeration conversion", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
TYPE E : (A := 0, B := 5); END_TYPE
FUNCTION INT_TO_E : E VAR_INPUT v : INT; END_VAR INT_TO_E := E#B; END_FUNCTION
PROGRAM P
  VAR RESULT : DINT; END_VAR
  RESULT := E_TO_DINT(INT_TO_E(3));
END_PROGRAM`,
      "user_enum_conversion",
    );
    expect(out.trim()).toBe("5");
  });

  it("reads ENO and uses INTERNAL as a type, method and property name", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK Internal VAR_INPUT a : INT; END_VAR END_FUNCTION_BLOCK
FUNCTION_BLOCK Gauge
  VAR_INPUT a : INT; END_VAR
  METHOD Internal : INT Internal := a; END_METHOD
  METHOD INTERNAL Twice : INT Twice := 2 * a; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Meter
  VAR v : INT := 3; END_VAR
  PROPERTY Internal : INT GET Internal := v; END_GET END_PROPERTY
END_FUNCTION_BLOCK
PROGRAM P
  VAR i : Internal; g : Gauge; m : Meter; ok : BOOL; RESULT : DINT; END_VAR
  i(a := 1);
  g(a := 4);
  ok := i.ENO AND g.ENO;
  RESULT := g.Internal() * 100 + g.Twice() * 10 + m.Internal;
  IF NOT ok THEN RESULT := -1; END_IF;
END_PROGRAM`,
      "internal_names",
    );
    expect(out.trim()).toBe("483");
  });

  it("uses INTERNAL as an enumeration member", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
TYPE Mode : (EXTERNAL_M, INTERNAL); END_TYPE
PROGRAM P
  VAR m : Mode := Mode#INTERNAL; RESULT : DINT; END_VAR
  RESULT := TO_DINT(m);
END_PROGRAM`,
      "internal_enum_member",
    );
    expect(out.trim()).toBe("1");
  });

  it("names a member the way its declaring block does when a derived block has a method of that name", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK B VAR_INPUT Start : BOOL; END_VAR VAR_OUTPUT Q : INT; END_VAR
  IF Start THEN Q := 42; END_IF;
END_FUNCTION_BLOCK
FUNCTION_BLOCK D EXTENDS B SUPER^(); END_FUNCTION_BLOCK
FUNCTION_BLOCK E EXTENDS B METHOD Start : BOOL Start := TRUE; END_METHOD END_FUNCTION_BLOCK
PROGRAM P
  VAR inst : D; RESULT : DINT; END_VAR
  inst(Start := TRUE);
  IF inst.Start THEN RESULT := inst.Q; END_IF;
END_PROGRAM`,
      "sibling_method_member",
    );
    expect(out.trim()).toBe("42");
  });

  it("uses the C++ name a library records for an input renamed by a derived method", () => {
    const lib = compileStlib(
      [
        {
          fileName: "l.st",
          source: `
FUNCTION_BLOCK B VAR_INPUT Start : BOOL; END_VAR VAR_OUTPUT Q : INT; END_VAR
  IF Start THEN Q := 42; END_IF;
END_FUNCTION_BLOCK
FUNCTION_BLOCK D EXTENDS B METHOD Start : BOOL Start := TRUE; END_METHOD END_FUNCTION_BLOCK`,
        },
      ],
      { name: "l", version: "1.0.0", namespace: "l" },
    );
    expect(lib.success).toBe(true);
    const b = lib.archive.manifest.functionBlocks.find((f) => f.name === "B");
    expect(b?.inputs[0]?.cppName).toBe("START_");
    const result = compile(
      `PROGRAM P
  VAR inst : B; RESULT : DINT; END_VAR
  inst(Start := TRUE);
  RESULT := inst.Q;
END_PROGRAM`,
      { libraries: [lib.archive] },
    );
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "library_member_name",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld\\n", (long long)p.RESULT.get());
  return 0;
}`,
    });
    expect(out.trim()).toBe("42");
  });

  it("evaluates calls with side effects left to right, on every compiler", () => {
    const source = `
FUNCTION Pair : DINT VAR_INPUT a : DINT; b : DINT; END_VAR Pair := a * 100 + b; END_FUNCTION
FUNCTION_BLOCK Counter
  VAR n : DINT; END_VAR
  METHOD Bump : DINT n := n + 1; Bump := n; END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR c : Counter; x : DINT; y : DINT; z : DINT; RESULT : DINT; END_VAR
  x := Pair(c.Bump(), c.Bump());
  y := c.Bump() * 10 + c.Bump();
  IF c.Bump() - c.Bump() = -1 THEN z := 1; END_IF;
  RESULT := x * 10000 + y * 10 + z;
END_PROGRAM`;
    const cpp = compile(source).cppCode;
    expect(cpp).toMatch(
      /Y = \[&\]\(\) \{ auto __seq\d+ = C\.BUMP\(\); auto __seq\d+ = C\.BUMP\(\); return __seq\d+ \* 10 \+ __seq\d+; \}\(\);/,
    );
    expect(runProgram(tempDir, pchPath, source, "left_to_right").trim()).toBe(
      "1020341",
    );
  });

  it("compares an interface with 0 in either operand order", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
INTERFACE I METHOD M : INT END_METHOD END_INTERFACE
FUNCTION_BLOCK F IMPLEMENTS I METHOD M : INT M := 1; END_METHOD END_FUNCTION_BLOCK
PROGRAM P
  VAR itf : I; f1 : F; RESULT : DINT; END_VAR
  IF 0 = itf THEN RESULT := RESULT + 1; END_IF;
  itf := f1;
  IF 0 <> itf THEN RESULT := RESULT + 10; END_IF;
  IF itf <> 0 THEN RESULT := RESULT + 100; END_IF;
END_PROGRAM`,
      "interface_zero_reversed",
    );
    expect(out.trim()).toBe("111");
  });

  it("computes REAL ** REAL like EXPT, in single precision", () => {
    const source = `
PROGRAM P
  VAR x : REAL := 1.7; y : REAL := 9.3; a : REAL; b : REAL; RESULT : DINT; END_VAR
  a := x ** y;
  b := EXPT(x, y);
  IF a = b THEN RESULT := 1; END_IF;
END_PROGRAM`;
    expect(compile(source).cppCode).toContain(
      "EXPT(static_cast<REAL_t>(X), static_cast<REAL_t>(Y))",
    );
    expect(runProgram(tempDir, pchPath, source, "real_power").trim()).toBe("1");
  });

  it("calls methods inside a property GET", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK B
  VAR v : DINT := 2; END_VAR
  METHOD Calc : DINT Calc := v * 2; END_METHOD
  PROPERTY Value : DINT
    GET Value := Calc() + THIS^.Calc(); END_GET
  END_PROPERTY
END_FUNCTION_BLOCK
PROGRAM P
  VAR b : B; RESULT : DINT; END_VAR
  RESULT := b.Value;
END_PROGRAM`,
      "getter_calls_method",
    );
    expect(out.trim()).toBe("8");
  });

  it("follows a full variable path after THIS^", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
FUNCTION_BLOCK S
  VAR v : DINT; END_VAR
  METHOD M : DINT M := v + 1; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Cnt
  VAR_INPUT inc : DINT; END_VAR
  VAR_OUTPUT total : DINT; END_VAR
  total := total + inc;
END_FUNCTION_BLOCK
FUNCTION_BLOCK F
  VAR s : S; arr : ARRAY[0..2] OF S; cs : ARRAY[0..1] OF Cnt; x : DINT; y : DINT; END_VAR
  METHOD Run : DINT
    THIS^.s.v := 4;
    THIS^.arr[1].v := 9;
    x := THIS^.s.v;
    x := x + THIS^.s.M();
    x := x + THIS^.arr[1].M();
    THIS^.s.M();
    THIS^.cs[0](inc := 5);
    y := THIS^.cs[0].total;
    THIS.s.v := THIS.s.v + 1;
    Run := x * 100 + y + THIS^.s.v;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR fb1 : F; RESULT : DINT; END_VAR
  RESULT := fb1.Run();
END_PROGRAM`,
      "this_paths",
    );
    expect(out.trim()).toBe("1910");
  });

  it("keeps the length of bounded strings in arrays", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
TYPE
  TA : ARRAY[0..1] OF STRING[4];
  ST : STRUCT f : ARRAY[0..1] OF STRING(3); END_STRUCT;
END_TYPE
FUNCTION_BLOCK H
  VAR_OUTPUT n : DINT; END_VAR
  VAR m : ARRAY[1..2] OF STRING[2]; END_VAR
  m[1] := 'abcdef';
  n := LEN(m[1]);
END_FUNCTION_BLOCK
PROGRAM P
  VAR a : ARRAY[0..1] OF STRING[4]; c : ARRAY[0..1] OF STRING(4); t : TA; s : ST; h : H; RESULT : DINT; END_VAR
  a[0] := 'abcdefgh';
  c[1] := 'abcdefgh';
  t[0] := 'abcdefgh';
  s.f[1] := 'abcdefgh';
  h();
  RESULT := LEN(a[0]) * 10000 + LEN(c[1]) * 1000 + LEN(t[0]) * 100 + LEN(s.f[1]) * 10 + h.n;
END_PROGRAM`,
      "bounded_string_arrays",
    );
    expect(out.trim()).toBe("44432");
  });

  it("reads and writes interface properties, inherited ones included", () => {
    const out = runProgram(
      tempDir,
      pchPath,
      `
INTERFACE IBase
  PROPERTY Level : DINT GET END_GET END_PROPERTY
END_INTERFACE
INTERFACE I EXTENDS IBase
  PROPERTY Setpoint : DINT GET END_GET SET END_SET END_PROPERTY
END_INTERFACE
FUNCTION_BLOCK Tank IMPLEMENTS I
  VAR lvl : DINT := 7; sp : DINT; END_VAR
  PROPERTY Level : DINT GET Level := lvl; END_GET END_PROPERTY
  PROPERTY Setpoint : DINT
    GET Setpoint := sp; END_GET
    SET sp := Setpoint; END_SET
  END_PROPERTY
END_FUNCTION_BLOCK
PROGRAM P
  VAR t : Tank; itf : I; b : IBase; RESULT : DINT; END_VAR
  itf := t;
  b := itf;
  itf.Setpoint := 40;
  RESULT := itf.Setpoint * 100 + b.Level;
END_PROGRAM`,
      "interface_properties",
    );
    expect(out.trim()).toBe("4007");
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

  it("checks SUPER^ against the base method it reaches", () => {
    const errs = errorsOf(`
FUNCTION_BLOCK B
  METHOD PRIVATE Priv : INT Priv := 1; END_METHOD
  METHOD PROTECTED Prot : INT Prot := 2; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK D EXTENDS B
  METHOD PUBLIC Priv : INT Priv := SUPER^.Priv(); END_METHOD
  METHOD PUBLIC Prot : INT Prot := SUPER^.Prot(); END_METHOD
END_FUNCTION_BLOCK
PROGRAM main END_PROGRAM`);
    expect(errs).toEqual([
      "Method 'PRIV' in 'D' cannot override PRIVATE method 'PRIV' of 'B'.",
      "Cannot call PRIVATE method 'PRIV' of 'B' from outside 'B'.",
    ]);
  });

  it("reports a method call on a member that is not a method", () => {
    const errs = errorsOf(`
FUNCTION_BLOCK Inner VAR_INPUT a : INT; END_VAR END_FUNCTION_BLOCK
FUNCTION_BLOCK Mid VAR sub : Inner; END_VAR END_FUNCTION_BLOCK
FUNCTION_BLOCK Outer VAR_OUTPUT mm : Mid; END_VAR END_FUNCTION_BLOCK
PROGRAM main
  VAR o : Outer; ms : ARRAY[0..1] OF Mid; END_VAR
  o.mm.sub(a := 5);
  ms[1].sub(a := 7);
END_PROGRAM`);
    expect(errs).toEqual([
      "'MID' has no method 'SUB'",
      "'MID' has no method 'SUB'",
    ]);
  });

  it("checks named arguments of a library function block", () => {
    const lib = compileStlib(
      [
        {
          fileName: "l.st",
          source:
            "FUNCTION_BLOCK LibFb VAR_INPUT a : INT; END_VAR VAR hidden : INT; END_VAR END_FUNCTION_BLOCK",
        },
      ],
      { name: "l", version: "1.0.0", namespace: "l" },
    );
    expect(lib.success).toBe(true);
    const errs = compile(
      `PROGRAM main
  VAR f : LibFb; END_VAR
  f(a := 1);
  f(Nope := 1);
END_PROGRAM`,
      { libraries: [lib.archive] },
    ).errors.map((e) => e.message);
    expect(errs).toEqual(["'LIBFB' has no input or output 'NOPE'"]);
  });
});

describe("diagnostics added for the language features", () => {
  const warningsOf = (source: string): string[] =>
    compile(source).warnings.map((w) => w.message);

  it("warns about a variable named like a method of its hierarchy", () => {
    const source = `
FUNCTION_BLOCK B METHOD Start : BOOL Start := TRUE; END_METHOD END_FUNCTION_BLOCK
FUNCTION_BLOCK D EXTENDS B VAR Start : BOOL; END_VAR END_FUNCTION_BLOCK
FUNCTION_BLOCK E VAR Run : BOOL; END_VAR METHOD Run : BOOL Run := TRUE; END_METHOD END_FUNCTION_BLOCK
FUNCTION_BLOCK G EXTENDS E METHOD Go : BOOL Go := TRUE; END_METHOD END_FUNCTION_BLOCK
FUNCTION_BLOCK K VAR_INPUT Stop : BOOL; END_VAR END_FUNCTION_BLOCK
FUNCTION_BLOCK L EXTENDS K METHOD Stop : BOOL Stop := TRUE; END_METHOD END_FUNCTION_BLOCK`;
    expect(errorsOf(source)).toEqual([]);
    expect(warningsOf(source)).toEqual([
      "Variable 'START' in FUNCTION_BLOCK 'D' has the same name as METHOD 'START' of 'B'; it is renamed in the generated C++",
      "Variable 'RUN' in FUNCTION_BLOCK 'E' has the same name as METHOD 'RUN' of 'E'; it is renamed in the generated C++",
      "METHOD 'STOP' in FUNCTION_BLOCK 'L' has the same name as variable 'STOP' inherited from 'K'; the variable is renamed in the generated C++",
    ]);
  });

  it("refuses a method named like a variable of a library base", () => {
    const lib = compileStlib(
      [
        {
          fileName: "b.st",
          source:
            "FUNCTION_BLOCK LibB VAR_INPUT Start : BOOL; END_VAR END_FUNCTION_BLOCK",
        },
      ],
      { name: "blib", version: "1.0.0", namespace: "blib" },
    );
    expect(lib.success).toBe(true);
    const result = compile(
      "FUNCTION_BLOCK D EXTENDS LibB METHOD Start : BOOL Start := TRUE; END_METHOD END_FUNCTION_BLOCK",
      { libraries: [lib.archive] },
    );
    expect(result.errors.map((e) => e.message)).toEqual([
      "METHOD 'START' in FUNCTION_BLOCK 'D' has the same name as variable 'START' inherited from library FUNCTION_BLOCK 'LIBB'; rename the method",
    ]);
  });

  it("checks interface-typed arguments of FB, function and method calls", () => {
    const decls = `
INTERFACE I METHOD M : INT END_METHOD END_INTERFACE
FUNCTION_BLOCK Impl IMPLEMENTS I METHOD M : INT M := 1; END_METHOD END_FUNCTION_BLOCK
FUNCTION_BLOCK Other END_FUNCTION_BLOCK
FUNCTION_BLOCK H VAR_INPUT target : I; END_VAR END_FUNCTION_BLOCK
FUNCTION Use : INT VAR_INPUT x : I; END_VAR Use := 0; END_FUNCTION
FUNCTION_BLOCK Host
  METHOD Take : INT VAR_INPUT x : I; END_VAR Take := 0; END_METHOD
END_FUNCTION_BLOCK`;
    const bad = errorsOf(`${decls}
PROGRAM P VAR h : H; host : Host; o : Other; r : INT; END_VAR
  h(target := o);
  r := Use(o);
  r := host.Take(x := o);
END_PROGRAM`);
    expect(bad).toEqual([
      "Cannot pass OTHER to 'TARGET' (I): OTHER does not implement I",
      "Cannot pass OTHER to 'X' (I): OTHER does not implement I",
      "Cannot pass OTHER to 'X' (I): OTHER does not implement I",
    ]);
    expect(
      errorsOf(`${decls}
PROGRAM P VAR h : H; host : Host; ok : Impl; r : INT; END_VAR
  h(target := ok);
  r := Use(x := 0);
  r := host.Take(x := ok);
END_PROGRAM`),
    ).toEqual([]);
  });

  it("warns when ADR of an unrelated block is assigned to a POINTER TO a block", () => {
    const warnings = warningsOf(`
FUNCTION_BLOCK A END_FUNCTION_BLOCK
FUNCTION_BLOCK D EXTENDS A END_FUNCTION_BLOCK
FUNCTION_BLOCK Other END_FUNCTION_BLOCK
PROGRAM P
  VAR p : POINTER TO A; pi : POINTER TO INT; a1 : A; d1 : D; o : Other; END_VAR
  p := ADR(a1);
  p := ADR(d1);
  p := ADR(o);
  pi := ADR(o);
END_PROGRAM`).filter((w) => w.startsWith("ADR"));
    expect(warnings).toEqual([
      "ADR of an instance of OTHER assigned to POINTER TO A: OTHER is not derived from A, so a method call through the pointer is undefined",
    ]);
  });

  it("enforces access specifiers on properties", () => {
    const errors = errorsOf(`
FUNCTION_BLOCK B
  VAR hidden : INT; END_VAR
  PROPERTY PRIVATE Secret : INT GET Secret := hidden; END_GET SET hidden := Secret; END_SET END_PROPERTY
  PROPERTY PROTECTED Prot : INT GET Prot := THIS^.Secret; END_GET END_PROPERTY
END_FUNCTION_BLOCK
FUNCTION_BLOCK D EXTENDS B
  METHOD Use : INT
    Use := THIS^.Prot + SUPER^.Prot;
    Use := THIS^.Secret;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR b : B; x : INT; END_VAR
  x := b.Secret;
  b.Secret := 3;
  x := b.Prot;
END_PROGRAM`);
    expect(errors).toEqual([
      "Cannot access PRIVATE property 'SECRET' of 'B' from outside 'B'.",
      "Cannot access PRIVATE property 'SECRET' of 'B' from outside 'B'.",
      "Cannot access PROTECTED property 'PROT' of 'B' from 'PROGRAM'.",
      "Cannot access PRIVATE property 'SECRET' of 'B' from outside 'B'.",
    ]);
  });

  it("requires interface members to be implemented PUBLIC", () => {
    expect(
      errorsOf(`
INTERFACE I
  METHOD M : DINT END_METHOD
  PROPERTY P : DINT GET END_GET END_PROPERTY
END_INTERFACE
FUNCTION_BLOCK B IMPLEMENTS I
  VAR hidden : DINT := 7; END_VAR
  METHOD PROTECTED M : DINT M := 1; END_METHOD
  PROPERTY PRIVATE P : DINT GET P := THIS^.hidden; END_GET END_PROPERTY
END_FUNCTION_BLOCK
FUNCTION_BLOCK Base METHOD PRIVATE M : DINT M := 1; END_METHOD PROPERTY P : DINT GET P := 1; END_GET END_PROPERTY END_FUNCTION_BLOCK
FUNCTION_BLOCK Derived EXTENDS Base IMPLEMENTS I END_FUNCTION_BLOCK
PROGRAM Q
  VAR b : B; itf : I; r : DINT; END_VAR
  itf := b;
  r := itf.P;
END_PROGRAM`),
    ).toEqual([
      "FUNCTION_BLOCK 'B' implements 'I' but its PROPERTY 'P' is PRIVATE; interface members must be implemented PUBLIC.",
      "FUNCTION_BLOCK 'B' implements 'I' but its method 'M' is PROTECTED; interface members must be implemented PUBLIC.",
      "FUNCTION_BLOCK 'DERIVED' implements 'I' but its method 'M' is PRIVATE; interface members must be implemented PUBLIC.",
    ]);
  });

  it("checks interface property signatures and their implementations", () => {
    const errors = errorsOf(`
INTERFACE I
  PROPERTY P : INT GET END_GET SET END_SET END_PROPERTY
  PROPERTY RO : INT GET END_GET END_PROPERTY
END_INTERFACE
INTERFACE Bad
  PROPERTY PRIVATE Hidden : INT GET END_GET END_PROPERTY
  PROPERTY NoAccessor : INT END_PROPERTY
  PROPERTY Body : INT GET Body := 1; END_GET END_PROPERTY
END_INTERFACE
FUNCTION_BLOCK WrongType IMPLEMENTS I
  PROPERTY P : DINT GET P := 0; END_GET SET END_SET END_PROPERTY
  PROPERTY RO : INT GET RO := 0; END_GET END_PROPERTY
END_FUNCTION_BLOCK
FUNCTION_BLOCK NoSet IMPLEMENTS I
  PROPERTY P : INT GET P := 0; END_GET END_PROPERTY
END_FUNCTION_BLOCK
PROGRAM Main
  VAR itf : I; END_VAR
  itf.RO := 5;
END_PROGRAM`);
    expect(errors).toEqual([
      "PROPERTY 'HIDDEN' of INTERFACE 'BAD' cannot have an access modifier.",
      "PROPERTY 'NOACCESSOR' of INTERFACE 'BAD' must declare GET, SET or both.",
      "PROPERTY 'BODY' of INTERFACE 'BAD' cannot have a body.",
      "FUNCTION_BLOCK 'WRONGTYPE' implements 'I' but its PROPERTY 'P' is DINT, not INT.",
      "FUNCTION_BLOCK 'NOSET' implements 'I' but its PROPERTY 'P' has no SET.",
      "FUNCTION_BLOCK 'NOSET' implements 'I' but does not provide PROPERTY 'RO'.",
      "Property 'RO' of 'I' is read-only (no SET accessor).",
    ]);
  });
});
