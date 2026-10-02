/**
 * Declaration spans: every span a declaration exposes covers exactly the text
 * the user wrote.
 *
 * The OpenPLC Editor reads variable declarations with `parse()` and takes each
 * part back out of the source through its span: the type, the name, the `AT`
 * address, the initial value and the whole declaration. The compiler itself
 * reads the AST fields, not the text, so a span that is wrong but whose fields
 * are right compiles fine and still breaks the Editor. That is what happened
 * with `POINTER TO`: its span covered only `real` in
 * `p : POINTER TO real;`, and the variables code view turned the pointer into
 * a plain REAL. These tests pin the text under every span, for every
 * declaration form, in every place a declaration can be written.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/index.js";
import type {
  CompilationUnit,
  SourceSpan,
  VarDeclaration,
} from "../../src/index.js";

/** The source text a 1-indexed, end-inclusive span covers. */
function spanText(source: string, span: SourceSpan | undefined): string {
  if (!span) return "";
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return source.slice(
    starts[span.startLine - 1]! + span.startCol - 1,
    starts[span.endLine - 1]! + span.endCol,
  );
}

interface Case {
  /** The declaration, exactly as written, including the `;`. */
  decl: string;
  type: string;
  init?: string;
  address?: string;
}

const CASES: Case[] = [
  // Elementary types, any case
  { decl: "a : BOOL;", type: "BOOL" },
  { decl: "a : real;", type: "real" },
  { decl: "a : LREAL;", type: "LREAL" },
  { decl: "a : TIME_OF_DAY;", type: "TIME_OF_DAY" },
  { decl: "a : DATE_AND_TIME;", type: "DATE_AND_TIME" },
  { decl: "a : WCHAR;", type: "WCHAR" },
  { decl: "a : STRING;", type: "STRING" },
  { decl: "a : STRING(20);", type: "STRING(20)" },
  { decl: "a : WSTRING(10);", type: "WSTRING(10)" },
  { decl: "a : STRING(n_len);", type: "STRING(n_len)" },
  // Arrays
  { decl: "a : ARRAY[0..9] OF INT;", type: "ARRAY[0..9] OF INT" },
  { decl: "a : array [0..9] of int;", type: "array [0..9] of int" },
  { decl: "a : ARRAY[1..2, 3..4] OF REAL;", type: "ARRAY[1..2, 3..4] OF REAL" },
  { decl: "a : ARRAY[0..N] OF INT;", type: "ARRAY[0..N] OF INT" },
  { decl: "a : ARRAY[0..1] OF TON;", type: "ARRAY[0..1] OF TON" },
  {
    decl: "a : ARRAY[0..1] OF POINTER TO INT;",
    type: "ARRAY[0..1] OF POINTER TO INT",
  },
  {
    decl: "a : ARRAY[0..2] OF INT := [1, 2, 3];",
    type: "ARRAY[0..2] OF INT",
    init: "[1, 2, 3]",
  },
  {
    decl: "a : ARRAY[0..2] OF INT := [3(0)];",
    type: "ARRAY[0..2] OF INT",
    init: "[3(0)]",
  },
  // POINTER TO, the regression
  { decl: "a : POINTER TO INT;", type: "POINTER TO INT" },
  { decl: "a : POINTER TO real;", type: "POINTER TO real" },
  { decl: "a : pointer to real;", type: "pointer to real" },
  { decl: "a : POINTER  TO   INT;", type: "POINTER  TO   INT" },
  { decl: "a : POINTER TO MyStruct;", type: "POINTER TO MyStruct" },
  { decl: "a : POINTER TO TON;", type: "POINTER TO TON" },
  { decl: "a : POINTER TO STRING;", type: "POINTER TO STRING" },
  {
    decl: "a : POINTER TO ARRAY[0..3] OF INT;",
    type: "POINTER TO ARRAY[0..3] OF INT",
  },
  { decl: "a : POINTER TO INT := 0;", type: "POINTER TO INT", init: "0" },
  { decl: "a : POINTER (* c *) TO INT;", type: "POINTER (* c *) TO INT" },
  // Nested references
  { decl: "a : POINTER TO POINTER TO INT;", type: "POINTER TO POINTER TO INT" },
  { decl: "a : POINTER TO REF_TO INT;", type: "POINTER TO REF_TO INT" },
  { decl: "a : REF_TO REF_TO INT;", type: "REF_TO REF_TO INT" },
  // REF_TO and REFERENCE TO
  { decl: "a : REF_TO INT;", type: "REF_TO INT" },
  { decl: "a : ref_to int;", type: "ref_to int" },
  { decl: "a : REF_TO MyStruct;", type: "REF_TO MyStruct" },
  { decl: "a : REFERENCE TO INT;", type: "REFERENCE TO INT" },
  // Function block instances and user types, including names that start with
  // a keyword or a type name
  { decl: "a : TON;", type: "TON" },
  { decl: "a : myfb;", type: "myfb" },
  { decl: "a : Motor_Controller_V2;", type: "Motor_Controller_V2" },
  { decl: "a : REAL_Filter;", type: "REAL_Filter" },
  { decl: "a : INT_Scaler;", type: "INT_Scaler" },
  { decl: "a : Pointer_FB;", type: "Pointer_FB" },
  { decl: "a : ARRAY_Handler;", type: "ARRAY_Handler" },
  { decl: "a : STRING_Builder;", type: "STRING_Builder" },
  { decl: "a : TO_Unit;", type: "TO_Unit" },
  { decl: "a : REF_Holder;", type: "REF_Holder" },
  { decl: "a : Of_Block;", type: "Of_Block" },
  { decl: "a : FB1;", type: "FB1" },
  { decl: "a : TON := (PT := T#5s);", type: "TON", init: "(PT := T#5s)" },
  {
    decl: "a : MyFB := (Speed := 10, Name := 'x');",
    type: "MyFB",
    init: "(Speed := 10, Name := 'x')",
  },
  // Anonymous enumerations and subranges
  {
    decl: "a : (Idle, Running, Fault) := Idle;",
    type: "(Idle, Running, Fault)",
    init: "Idle",
  },
  { decl: "a : (A := 1, B := 5) := B;", type: "(A := 1, B := 5)", init: "B" },
  { decl: "a : (Idle,Running);", type: "(Idle,Running)" },
  { decl: "a : INT(0..100) := 50;", type: "INT(0..100)", init: "50" },
  { decl: "a : INT (0..100);", type: "INT (0..100)" },
  { decl: "a : uint(1..9) := 3;", type: "uint(1..9)", init: "3" },
  { decl: "a : DINT(-10..10);", type: "DINT(-10..10)" },
  { decl: "a : INT(0..MAX_X);", type: "INT(0..MAX_X)" },
  // Initial values
  { decl: "a : INT := 5;", type: "INT", init: "5" },
  { decl: "a : REAL := -1.5E3;", type: "REAL", init: "-1.5E3" },
  { decl: "a : TIME := T#1s500ms;", type: "TIME", init: "T#1s500ms" },
  { decl: "a : WORD := 16#42f6;", type: "WORD", init: "16#42f6" },
  { decl: "a : STRING(20) := 'abc';", type: "STRING(20)", init: "'abc'" },
  {
    decl: "a : E_State := E_State#Idle;",
    type: "E_State",
    init: "E_State#Idle",
  },
  { decl: "a : BOOL := BOOL#FALSE;", type: "BOOL", init: "BOOL#FALSE" },
  // AT
  { decl: "a AT %IW0 : INT;", type: "INT", address: "%IW0" },
  {
    decl: "a AT %QX0.1 : BOOL := TRUE;",
    type: "BOOL",
    init: "TRUE",
    address: "%QX0.1",
  },
  {
    decl: "a AT U1_hi : WORD := 16#42f6;",
    type: "WORD",
    init: "16#42f6",
    address: "U1_hi",
  },
  {
    decl: "a AT %MD5 : POINTER TO REAL;",
    type: "POINTER TO REAL",
    address: "%MD5",
  },
  // Several names, comments, several lines
  { decl: "a, b : INT;", type: "INT" },
  { decl: "a, b : POINTER TO INT;", type: "POINTER TO INT" },
  { decl: "a : (* c *) INT;", type: "INT" },
  { decl: "a : INT (* c *) := 5;", type: "INT", init: "5" },
  { decl: "a :\n    POINTER TO\n    REAL;", type: "POINTER TO\n    REAL" },
  {
    decl: "a :\n    ARRAY[0..1]\n    OF INT := [1, 2];",
    type: "ARRAY[0..1]\n    OF INT",
    init: "[1, 2]",
  },
];

/** Where a declaration can be written, and how to find it in the AST. */
interface Place {
  label: string;
  wrap: (decl: string) => string;
  pick: (ast: CompilationUnit) => VarDeclaration | undefined;
}

const inProgram = (block: string): Place => ({
  label: `PROGRAM ${block}`,
  wrap: (d) => `PROGRAM p\n${block}\n${d}\nEND_VAR\nEND_PROGRAM`,
  pick: (ast) => ast.programs[0]?.varBlocks[0]?.declarations[0],
});

const PLACES: Place[] = [
  inProgram("VAR"),
  inProgram("VAR_INPUT"),
  inProgram("VAR_OUTPUT"),
  inProgram("VAR_IN_OUT"),
  inProgram("VAR_TEMP"),
  inProgram("VAR CONSTANT"),
  inProgram("VAR RETAIN"),
  inProgram("VAR_EXTERNAL"),
  {
    label: "FUNCTION_BLOCK VAR",
    wrap: (d) => `FUNCTION_BLOCK F\nVAR\n${d}\nEND_VAR\nEND_FUNCTION_BLOCK`,
    pick: (ast) => ast.functionBlocks[0]?.varBlocks[0]?.declarations[0],
  },
  {
    label: "FUNCTION VAR_INPUT",
    wrap: (d) =>
      `FUNCTION F : INT\nVAR_INPUT\n${d}\nEND_VAR\nF := 0;\nEND_FUNCTION`,
    pick: (ast) => ast.functions[0]?.varBlocks[0]?.declarations[0],
  },
  {
    label: "VAR_GLOBAL",
    wrap: (d) => `VAR_GLOBAL\n${d}\nEND_VAR`,
    pick: (ast) => ast.globalVarBlocks[0]?.declarations[0],
  },
  {
    label: "VAR_GLOBAL RETAIN",
    wrap: (d) => `VAR_GLOBAL RETAIN\n${d}\nEND_VAR`,
    pick: (ast) => ast.globalVarBlocks[0]?.declarations[0],
  },
  {
    label: "STRUCT field",
    wrap: (d) => `TYPE T :\nSTRUCT\n${d}\nEND_STRUCT;\nEND_TYPE`,
    pick: (ast) => {
      const def = ast.types[0]?.definition;
      return def?.kind === "StructDefinition" ? def.fields[0] : undefined;
    },
  },
];

/** Forms that are not legal in a place (an AT address in a STRUCT field). */
function appliesTo(c: Case, place: Place): boolean {
  if (place.label === "STRUCT field" && c.address !== undefined) return false;
  return true;
}

describe("declaration spans cover the text as written", () => {
  for (const place of PLACES) {
    describe(place.label, () => {
      for (const c of CASES.filter((x) => appliesTo(x, place))) {
        it(JSON.stringify(c.decl), () => {
          const source = place.wrap(c.decl);
          const result = parse(source);
          expect(result.errors).toEqual([]);
          const decl = place.pick(result.ast!);
          expect(decl).toBeDefined();

          expect(spanText(source, decl!.type.sourceSpan).trim()).toBe(c.type);
          expect(
            decl!.initialValue
              ? spanText(source, decl!.initialValue.sourceSpan).trim()
              : undefined,
          ).toBe(c.init);
          expect(
            decl!.addressSpan ? spanText(source, decl!.addressSpan) : undefined,
          ).toBe(c.address);

          const names = c.decl
            .split(/\s*(?::|\sAT\s)/)[0]!
            .split(",")
            .map((n) => n.trim());
          expect(
            (decl!.nameSpans ?? []).map((s) => spanText(source, s)),
          ).toEqual(names);
          expect(spanText(source, decl!.sourceSpan)).toBe(c.decl);
        });
      }
    });
  }
});

describe("TYPE declaration spans", () => {
  function typeOf(source: string): CompilationUnit["types"][number] {
    const result = parse(source);
    expect(result.errors).toEqual([]);
    return result.ast!.types[0]!;
  }

  it("POINTER TO ARRAY covers the prefix", () => {
    const source = "TYPE A : POINTER TO ARRAY[0..9] OF INT; END_TYPE";
    expect(spanText(source, typeOf(source).definition.sourceSpan)).toBe(
      "POINTER TO ARRAY[0..9] OF INT",
    );
  });

  it("POINTER TO alias covers the prefix", () => {
    const source = "TYPE A : POINTER TO INT; END_TYPE";
    expect(spanText(source, typeOf(source).definition.sourceSpan)).toBe(
      "POINTER TO INT",
    );
  });

  it("a subrange covers its base type and bounds", () => {
    const source = "TYPE A : INT (0..100) := 5; END_TYPE";
    expect(spanText(source, typeOf(source).definition.sourceSpan)).toBe(
      "INT (0..100)",
    );
  });

  it("array element type and dimensions", () => {
    const source = "TYPE A : ARRAY[0..9, 1..2] OF POINTER TO REAL; END_TYPE";
    const def = typeOf(source).definition;
    expect(def.kind).toBe("ArrayDefinition");
    if (def.kind !== "ArrayDefinition") return;
    expect(spanText(source, def.elementType.sourceSpan)).toBe(
      "POINTER TO REAL",
    );
    expect(def.dimensions.map((d) => spanText(source, d.sourceSpan))).toEqual([
      "0..9",
      "1..2",
    ]);
  });

  it("enum members and default", () => {
    const source = "TYPE A : (Idle, Run := 5, Stop) := Run; END_TYPE";
    const t = typeOf(source);
    const def = t.definition;
    expect(def.kind).toBe("EnumDefinition");
    if (def.kind !== "EnumDefinition") return;
    expect(def.members.map((m) => spanText(source, m.sourceSpan))).toEqual([
      "Idle",
      "Run := 5",
      "Stop",
    ]);
    expect(spanText(source, t.defaultValue?.sourceSpan)).toBe("Run");
  });
});
