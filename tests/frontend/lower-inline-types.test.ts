/**
 * Inline enumerations and subranges are lowered to TYPEs named after their
 * owner. A generated name that clashes is an error, and an inline
 * enumeration's values belong to its POU and to targets declared with it,
 * not to the global scope.
 */

import { describe, it, expect } from "vitest";
import { compile, parseTestFile } from "../../src/index.js";

const errorsOf = (source: string): string[] =>
  compile(source).errors.map((e) => e.message);

describe("generated type names", () => {
  it("rejects two declarations that generate the same name", () => {
    expect(
      errorsOf(`
PROGRAM A_B
VAR c : (Red, Green); END_VAR
c := Red;
END_PROGRAM
PROGRAM A
VAR b_c : (Cold, Hot); END_VAR
b_c := Hot;
END_PROGRAM
`),
    ).toEqual([
      "The inline enumeration of 'A.B_C' and the inline enumeration of 'A_B.C' both use the type name '__INLINE_ENUM_A_B_C'; rename one of them.",
    ]);
  });

  it("rejects a generated name that a declared TYPE already uses", () => {
    expect(
      errorsOf(`
TYPE __INLINE_ENUM_MAIN_S : (X1, X2); END_TYPE
PROGRAM main
VAR s : (Idle, Running); END_VAR
s := Running;
END_PROGRAM
`),
    ).toEqual([
      "The inline enumeration of 'MAIN.S' and the declared TYPE '__INLINE_ENUM_MAIN_S' both use the type name '__INLINE_ENUM_MAIN_S'; rename one of them.",
    ]);
  });

  it("rejects a clash between inline subranges too", () => {
    const errors = errorsOf(`
PROGRAM A_B
VAR c : INT(0..10); END_VAR
END_PROGRAM
PROGRAM A
VAR b_c : INT(0..20); END_VAR
END_PROGRAM
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'__INLINE_SUBRANGE_A_B_C'");
  });
});

describe("inline enumeration values", () => {
  const twoBlocks = `
FUNCTION_BLOCK FB1
VAR_INPUT cmd : (Idle, Running); END_VAR
VAR st : (Idle, Running); n : INT; END_VAR
st := Running;
IF cmd = Running THEN n := 1; END_IF;
END_FUNCTION_BLOCK
FUNCTION_BLOCK FB2
VAR st : (Idle, Running, Done); END_VAR
st := Done;
CASE st OF
  Idle: st := Running;
  Running: st := Done;
END_CASE;
END_FUNCTION_BLOCK
`;

  it("are not shared between POUs that declare the same values", () => {
    expect(
      errorsOf(`${twoBlocks}
PROGRAM main
VAR a : FB1; b : FB2; END_VAR
a(); b();
END_PROGRAM
`),
    ).toEqual([]);
  });

  it("resolve by the target a caller passes or compares them to", () => {
    const result = compile(`${twoBlocks}
PROGRAM main
VAR a : FB1; b : FB2; k : INT; END_VAR
a(cmd := Running);
a.cmd := Idle;
IF a.cmd = Running THEN k := 1; END_IF;
CASE a.cmd OF
  Idle: k := 2;
END_CASE;
END_PROGRAM
`);
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain("A.CMD = __INLINE_ENUM_FB1_CMD::IDLE");
  });

  it("are not visible where nothing is declared with them", () => {
    expect(
      errorsOf(`${twoBlocks}
PROGRAM main
VAR k : INT; END_VAR
k := Running;
END_PROGRAM
`),
    ).toEqual(["Undeclared variable 'RUNNING'"]);
  });

  it("are ambiguous when two inline enumerations of one POU share a value", () => {
    expect(
      errorsOf(`
PROGRAM main
VAR a : (Idle, Busy); b : (Idle, Done); k : INT; END_VAR
IF Idle = Idle THEN k := 1; END_IF;
END_PROGRAM
`),
    ).toContain(
      "Ambiguous enum member 'IDLE': it is a value of the inline enumeration of 'MAIN.A' and of the inline enumeration of 'MAIN.B'; rename one of the values.",
    );
  });

  it("are ambiguous with a declared enumeration that has the same value", () => {
    expect(
      errorsOf(`
TYPE E : (Idle, Busy); END_TYPE
PROGRAM main
VAR a : (Idle, Done); k : INT; END_VAR
IF Idle = Idle THEN k := 1; END_IF;
END_PROGRAM
`),
    ).toContain(
      "Ambiguous enum member 'IDLE': it is a value of 'E' and of the inline enumeration of 'MAIN.A'; rename one of the values, or write E#IDLE.",
    );
  });

  it("resolve by the target even when a declared enumeration shares the value", () => {
    expect(
      errorsOf(`
TYPE E : (Idle, Busy); END_TYPE
PROGRAM main
VAR a : (Idle, Done); e1 : E; END_VAR
a := Idle;
e1 := E#Idle;
END_PROGRAM
`),
    ).toEqual([]);
  });
});

describe("inline types in test files", () => {
  it("are lowered into the test file and their values qualified", () => {
    const { testFile, errors } = parseTestFile(
      `
SETUP
VAR mode : (Auto, Manual); END_VAR
END_SETUP
TEST 'inline'
VAR s : (Idle, Running); lvl : INT(0..10); END_VAR
s := Running;
mode := Auto;
ASSERT_TRUE(s = Running);
END_TEST
`,
      "t_inline.st",
    );
    expect(errors).toEqual([]);
    expect(testFile?.inlineTypes?.map((t) => t.name)).toEqual([
      "__INLINE_ENUM_T_INLINE_SETUP_MODE",
      "__INLINE_ENUM_T_INLINE_T1_S",
      "__INLINE_SUBRANGE_T_INLINE_T1_LVL",
    ]);
    const assign = testFile!.testCases[0]!.body[0] as {
      value: { name: string; fieldAccess: string[] };
    };
    expect(assign.value.name).toBe("__INLINE_ENUM_T_INLINE_T1_S");
    expect(assign.value.fieldAccess).toEqual(["RUNNING"]);
  });
});
