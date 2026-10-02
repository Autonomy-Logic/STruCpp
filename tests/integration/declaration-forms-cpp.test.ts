/**
 * Declaration forms, end to end: the ST compiles, the generated C++ compiles
 * with g++, and the program computes the values the source asks for.
 *
 *   - nested references keep every level (POINTER TO POINTER TO, POINTER TO
 *     REF_TO, REF_TO REF_TO), in variables, TYPE aliases and STRUCT fields
 *   - REF_TO and REFERENCE TO struct fields hold references (bound with :=
 *     REF() and REF=)
 *   - arrays of pointers and references (inline, TYPE, in a STRUCT, several
 *     dimensions, ARRAY[*] parameters) hold pointers and references
 *   - REF= on array elements and inherited members
 *   - typed enumeration values (E_State#Idle), including in CASE labels
 *   - anonymous enumerations and subranges written in a declaration, which
 *     behave like their TYPE equivalents, in TEST blocks too
 *   - the forum program that reinterprets two Modbus WORDs as a REAL
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile, parse } from "../../src/index.js";
import {
  hasGpp,
  createPCH,
  compileAndRunStandalone,
  runE2ETestPipeline,
} from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("declaration forms — generated C++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-declforms-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Compile ST, then compile and run the C++, returning stdout. */
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
      mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
    });
  }

  it("nested references keep every level and dereference twice", () => {
    const source = `
TYPE P2 : POINTER TO POINTER TO INT; END_TYPE
TYPE S : STRUCT pp : POINTER TO POINTER TO INT; END_STRUCT; END_TYPE
PROGRAM main
VAR
  x : INT := 7;
  px : POINTER TO INT;
  ppx : POINTER TO POINTER TO INT;
  r : REF_TO INT;
  rr : REF_TO REF_TO INT;
  pr : POINTER TO REF_TO INT;
  alias_pp : P2;
  s : S;
  y1 : INT; y2 : INT; y3 : INT; y4 : INT; y5 : INT;
END_VAR
px := ADR(x);
ppx := ADR(px);
y1 := ppx^^;
r := REF(x);
rr := REF(r);
y2 := rr^^;
pr := ADR(r);
y3 := pr^^;
alias_pp := ADR(px);
y4 := alias_pp^^;
s.pp := ADR(px);
y5 := s.pp^^;
rr^^ := 9;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.Y1.get() << " " << p.Y2.get() << " " << p.Y3.get() << " "
              << p.Y4.get() << " " << p.Y5.get() << " " << p.X.get() << std::endl;`,
      "nested_refs",
    );
    expect(out.trim()).toBe("7 7 7 7 7 9");
  });

  it("REF_TO and REFERENCE TO struct fields hold references", () => {
    const source = `
TYPE Inner : STRUCT r : REF_TO INT; END_STRUCT; END_TYPE
TYPE S : STRUCT
  r : REF_TO INT;
  rt : REFERENCE TO INT;
  rr : REF_TO REF_TO INT;
  inner : Inner;
END_STRUCT; END_TYPE
PROGRAM main
VAR
  x : INT := 7;
  z : INT := 3;
  rx : REF_TO INT;
  s : S;
  y1 : INT; y2 : INT; y3 : INT; y4 : INT;
END_VAR
s.r := REF(x);
y1 := s.r^;
s.r REF= z;
y2 := s.r^;
s.rt REF= x;
s.rt := 11;
rx := REF(z);
s.rr := REF(rx);
y3 := s.rr^^;
s.inner.r := REF(x);
y4 := s.inner.r^;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.Y1.get() << " " << p.Y2.get() << " " << p.Y3.get() << " "
              << p.Y4.get() << " " << p.X.get() << std::endl;`,
      "struct_ref_fields",
    );
    expect(out.trim()).toBe("7 3 3 11 11");
  });

  it("arrays of pointers and references hold pointers and references", () => {
    const source = `
TYPE PAT : ARRAY[0..1] OF POINTER TO INT; END_TYPE
TYPE RAT : ARRAY[0..1] OF REF_TO INT; END_TYPE
TYPE S : STRUCT ps : ARRAY[0..1] OF POINTER TO INT; rs : ARRAY[0..1] OF REF_TO INT; END_STRUCT; END_TYPE
PROGRAM main
VAR
  x : INT := 7; z : INT := 3;
  ia : ARRAY[0..1] OF POINTER TO INT;
  ra : ARRAY[0..1] OF REF_TO INT;
  m : ARRAY[0..1, 0..1] OF POINTER TO INT;
  pp : ARRAY[0..1] OF POINTER TO POINTER TO INT;
  px : POINTER TO INT;
  ta : PAT; tr : RAT; s : S;
  y : ARRAY[0..7] OF INT;
END_VAR
ia[0] := ADR(x); ia[1] := ADR(z);
y[0] := ia[0]^ + ia[1]^;
ra[1] := REF(z); y[1] := ra[1]^;
m[1, 0] := ADR(x); y[2] := m[1, 0]^;
px := ADR(z); pp[0] := ADR(px); y[3] := pp[0]^^;
ta[1] := ADR(x); y[4] := ta[1]^;
tr[0] := REF(z); y[5] := tr[0]^;
s.ps[1] := ADR(z); y[6] := s.ps[1]^;
s.rs[0] := REF(x); y[7] := s.rs[0]^;
ra[1]^ := 42;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    for (int i = 0; i < 8; i++) std::cout << p.Y[i].get() << " ";
    std::cout << p.Z.get() << std::endl;`,
      "arrays_of_refs",
    );
    expect(out.trim()).toBe("10 3 7 3 7 3 3 7 42");
  });

  it("typed enumeration values, in expressions and CASE labels", () => {
    const source = `
TYPE E_State : (Idle, Running, Fault) := Idle; END_TYPE
TYPE E_Other : (Idle, Stop); END_TYPE
PROGRAM main
VAR
  s : E_State := E_State#Running;
  o : E_Other := E_Other#Stop;
  b : BOOL := BOOL#TRUE;
  n : INT;
  m : INT;
END_VAR
IF s = E_State#Running THEN s := E_State#Fault; END_IF;
IF o <> E_Other#Idle THEN m := 1; END_IF;
CASE s OF
  E_State#Idle: n := 10;
  E_State#Fault: n := 20;
END_CASE;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << (p.S.get() == E_STATE::FAULT) << " " << (p.O.get() == E_OTHER::STOP)
              << " " << p.B.get() << " " << p.N.get() << " " << p.M.get() << std::endl;`,
      "enum_literals",
    );
    expect(out.trim()).toBe("1 1 1 20 1");
  });

  it("anonymous enumerations and subranges in every declaration place", () => {
    const source = `
TYPE S : STRUCT mode : (Manual, Auto) := Auto; pct : INT(0..100) := 7; END_STRUCT; END_TYPE
VAR_GLOBAL
  g_level : UINT(10..20) := 15;
END_VAR
FUNCTION_BLOCK Motor
VAR_INPUT
  cmd : (Off, Fwd, Rev);
END_VAR
VAR
  speed : INT(-100..100);
END_VAR
METHOD Clamp : INT
VAR_INPUT v : INT(0..50); END_VAR
Clamp := v;
END_METHOD
IF cmd = Fwd THEN speed := 50; ELSIF cmd = Rev THEN speed := -50; ELSE speed := 0; END_IF;
END_FUNCTION_BLOCK
FUNCTION Pick : INT
VAR_INPUT sel : (First, Second); END_VAR
IF sel = Second THEN Pick := 2; ELSE Pick := 1; END_IF;
END_FUNCTION
PROGRAM main
VAR
  state : (Idle, Running, Fault) := Running;
  level : INT(0..100) := 50;
  m : Motor;
  s : S;
  n : INT;
  k : INT;
END_VAR
CASE state OF
  Idle: n := 1;
  Running: n := 2;
  Fault: n := 3;
END_CASE;
m(cmd := Rev);
k := Pick(sel := Second) + m.Clamp(v := 5);
IF s.mode = Auto THEN level := level + s.pct; END_IF;
state := Fault;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.N.get() << " " << p.LEVEL << " " << p.K.get() << " "
              << p.M.SPEED << " " << (p.STATE.get() == __INLINE_ENUM_MAIN_STATE::FAULT)
              << std::endl;`,
      "inline_types",
    );
    expect(out.trim()).toBe("2 57 7 -50 1");
  });

  it("an anonymous subrange compiles exactly like its TYPE equivalent", () => {
    const inline = compile(`PROGRAM main
VAR level : INT(0..100) := 150; END_VAR
END_PROGRAM`);
    const declared =
      compile(`TYPE __INLINE_SUBRANGE_MAIN_LEVEL : INT(0..100); END_TYPE
PROGRAM main
VAR level : __INLINE_SUBRANGE_MAIN_LEVEL := 150; END_VAR
END_PROGRAM`);
    expect(inline.success).toBe(declared.success);
    expect(inline.errors.map((e) => e.message)).toEqual(
      declared.errors.map((e) => e.message),
    );
    expect(inline.headerCode).toBe(declared.headerCode);
  });

  it("REF= reaches array elements and inherited members", () => {
    const source = `
TYPE RA : ARRAY[0..1] OF REF_TO INT; END_TYPE
TYPE S : STRUCT rs : ARRAY[0..1] OF REF_TO INT; END_STRUCT; END_TYPE
FUNCTION_BLOCK BaseFB
VAR o : REF_TO INT; END_VAR
END_FUNCTION_BLOCK
FUNCTION_BLOCK DerivedFB EXTENDS BaseFB
END_FUNCTION_BLOCK
PROGRAM main
VAR
  arr : ARRAY[0..1] OF REF_TO INT; ta : RA; s : S; dd : DerivedFB;
  a : INT := 1; b : INT := 2; c : INT := 3; d : INT := 4; y : INT;
END_VAR
arr[1] REF= a;
ta[0] REF= b;
s.rs[1] REF= c;
dd.o REF= d;
y := arr[1]^ * 1000 + ta[0]^ * 100 + s.rs[1]^ * 10 + dd.o^;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.Y.get() << std::endl;`,
      "ref_assign_targets",
    );
    expect(out.trim()).toBe("1234");
  });

  it("a REF_TO REF_TO alias dereferences twice", () => {
    const source = `
TYPE R1 : REF_TO INT; END_TYPE
TYPE RR2 : REF_TO REF_TO INT; END_TYPE
TYPE S : STRUCT q : RR2; END_STRUCT; END_TYPE
PROGRAM main
VAR x : INT := 7; y : INT; z : INT; r : R1; q : RR2; s : S; END_VAR
r := REF(x);
q := REF(r);
y := q^^;
s.q := REF(r);
z := s.q^^ + r^;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.Y.get() << " " << p.Z.get() << std::endl;`,
      "ref_alias_chain",
    );
    expect(out.trim()).toBe("7 14");
  });

  it("an ARRAY[*] OF POINTER TO parameter takes an array of pointers", () => {
    const source = `
FUNCTION SumAll : INT
VAR_IN_OUT a : ARRAY[*] OF POINTER TO INT; END_VAR
VAR i : DINT; END_VAR
SumAll := 0;
FOR i := LOWER_BOUND(a, 1) TO UPPER_BOUND(a, 1) DO
  SumAll := SumAll + a[i]^;
END_FOR;
END_FUNCTION
PROGRAM main
VAR x : INT := 3; z : INT := 4; p : ARRAY[0..1] OF POINTER TO INT; y : INT; END_VAR
p[0] := ADR(x);
p[1] := ADR(z);
y := SumAll(p);
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.Y.get() << std::endl;`,
      "vla_of_pointers",
    );
    expect(out.trim()).toBe("7");
  });

  it("inline enumerations with the same values in two blocks, set by a caller", () => {
    const source = `
FUNCTION_BLOCK Motor
VAR_INPUT cmd : (Off, Fwd, Rev); END_VAR
VAR_OUTPUT speed : INT; END_VAR
CASE cmd OF
  Off: speed := 0;
  Fwd: speed := 50;
  Rev: speed := -50;
END_CASE;
END_FUNCTION_BLOCK
FUNCTION_BLOCK Valve
VAR_INPUT cmd : (Off, Open); END_VAR
VAR_OUTPUT pos : INT; END_VAR
IF cmd = Open THEN pos := 100; ELSE pos := 0; END_IF;
END_FUNCTION_BLOCK
PROGRAM main
VAR m : Motor; v : Valve; a : INT; b : INT; END_VAR
m(cmd := Rev);
v(cmd := Open);
a := m.speed;
IF m.cmd = Rev THEN b := v.pos; END_IF;
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout << p.A.get() << " " << p.B.get() << std::endl;`,
      "inline_enum_callers",
    );
    expect(out.trim()).toBe("-50 100");
  });

  it("inline enumerations and subranges in a TEST block", () => {
    const { stdout, exitCode } = runE2ETestPipeline({
      sourceST: `
FUNCTION_BLOCK Counter
VAR_INPUT go : BOOL; END_VAR
VAR_OUTPUT n : INT; END_VAR
IF go THEN n := n + 1; END_IF;
END_FUNCTION_BLOCK
`,
      testST: `
TEST 'inline types in a test'
VAR c : Counter; s : (Idle, Running); lvl : INT(0..10) := 3; END_VAR
s := Running;
c(go := TRUE);
ASSERT_EQ(c.n, 1);
ASSERT_TRUE(s = Running);
ASSERT_EQ(lvl, 3);
END_TEST
`,
      testFileName: "t_inline.st",
      tempDirPrefix: "strucpp-declforms-test-",
    });
    expect(stdout).toContain("1 passed, 0 failed");
    expect(exitCode).toBe(0);
  });

  it("the forum program reinterprets two WORDs as a REAL", () => {
    const source = `
FUNCTION LOAD_REAL : REAL
VAR_INPUT
  from_hi : WORD;
  from_lo : WORD;
END_VAR
VAR
  ptr_dword : POINTER TO DWORD;
  ptr_real : POINTER TO real;
  tmp_dword : DWORD;
END_VAR
tmp_dword := SHL(WORD_TO_DWORD(from_hi), 16) OR WORD_TO_DWORD(from_lo);
ptr_dword := ADR(tmp_dword);
ptr_real := ptr_dword;
LOAD_REAL := ptr_real^;
END_FUNCTION

PROGRAM main
VAR
  mb_U1_hi : WORD := 16#42f6;
  mb_U1_lo : WORD := 16#e9e0;
  opcua_U1 : REAL;
END_VAR
opcua_U1 := LOAD_REAL(mb_U1_hi, mb_U1_lo);
END_PROGRAM
`;
    const out = run(
      source,
      `    Program_MAIN p; p.run();
    std::cout.precision(9);
    std::cout << p.OPCUA_U1.get() << std::endl;`,
      "forum_load_real",
    );
    expect(Number(out.trim())).toBeCloseTo(123.456787, 5);
  });
});

describe("anonymous types in parse() and compile()", () => {
  const source = `
TYPE T : STRUCT f : (X, Y); END_STRUCT; END_TYPE
PROGRAM main
VAR
  a : (Idle, Run) := Idle;
  b : INT(0..100) := 5;
END_VAR
END_PROGRAM
`;

  it("parse() returns only the declared types, with the definition in place", () => {
    const result = parse(source);
    expect(result.errors).toEqual([]);
    expect(result.ast!.types.map((t) => t.name)).toEqual(["T"]);
    const decls = result.ast!.programs[0]!.varBlocks[0]!.declarations;
    expect(decls.map((d) => d.type.inlineDefinition?.kind)).toEqual([
      "EnumDefinition",
      "SubrangeDefinition",
    ]);
  });

  it("compile() declares them as TYPEs named after their owner", () => {
    const result = compile(source);
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain("enum class __INLINE_ENUM_MAIN_A");
    expect(result.headerCode).toContain("using __INLINE_SUBRANGE_MAIN_B");
    expect(result.headerCode).toContain("enum class __INLINE_ENUM_T_F");
  });
});
