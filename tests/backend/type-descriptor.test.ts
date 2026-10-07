// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Layout descriptors for STRUCT types reaching a generic parameter.
 *
 * The tables checked here name each member of a STRUCT reaching a generic pin
 * — see `runtime/include/iec_typedesc.hpp`. Offsets are C++ constant
 * expressions, so these assert the SHAPE of what is emitted; the arithmetic is
 * proved in `tests/integration/type-descriptor-cpp.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const PROGRAM = (types: string, vars: string, arg: string) =>
  `${types}
FUNCTION_BLOCK F VAR_INPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main VAR a : F; ${vars} END_VAR a(P := ${arg}); END_PROGRAM`;

const build = (types: string, vars: string, arg: string) => {
  const result = compile(PROGRAM(types, vars, arg), { programName: "main" });
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result;
};

/** The generated header's declaration lines for one type's member table. */
const memberRows = (
  types: string,
  vars: string,
  arg: string,
  typeName: string,
) => {
  const header = build(types, vars, arg).headerCode ?? "";
  const start = header.indexOf(
    `const strucpp::MemberDesc ${typeName}__MEMBERS[] = {`,
  );
  if (start < 0) return [];
  const end = header.indexOf("\n};", start);
  return header
    .slice(start, end)
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean);
};

/** The `IEC_ANY` initialiser the program body builds for the call. */
const descriptorLine = (types: string, vars: string, arg: string) => {
  const body =
    (build(types, vars, arg).cppCode ?? "").split("::run()")[1] ?? "";
  return body.split("\n").find((l) => l.includes("IEC_ANY")) ?? "";
};

const STATION = `TYPE INNER : STRUCT TAGNAME : STRING(8); N : INT; END_STRUCT END_TYPE
TYPE COLOUR : (RED, GREEN, BLUE); END_TYPE
TYPE STATION : STRUCT
  NAME : STRING(20);
  SPEEDRPM : REAL;
  SUB : INNER;
  HUES : ARRAY[1..4] OF COLOUR;
  POINTS : ARRAY[0..2] OF INNER;
  W : WSTRING(6);
END_STRUCT END_TYPE
`;

describe("the table emitted beside a struct", () => {
  it("names one member per field, in declaration order", () => {
    const rows = memberRows(STATION, "v : STATION;", "v", "STATION");
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.split('"')[1])).toEqual([
      "NAME",
      "SPEEDRPM",
      "SUB",
      "HUES",
      "POINTS",
      "W",
    ]);
  });

  it("carries the ST name as declared, not the mangled C++ name", () => {
    // The name is what a callee reads back, so it has to match what the
    // engineer typed rather than whatever C++ had to be called.
    const rows = memberRows(
      `TYPE T : STRUCT speedRpm : INT; END_STRUCT END_TYPE\n`,
      "v : T;",
      "v",
      "T",
    );
    expect(rows[0]).toContain('"speedRpm"');
  });

  it("keeps the declared case of every member", () => {
    // Every name the compiler resolves on is folded upper case, because
    // IEC 61131-3 §6.1.2 makes identifiers case-insensitive. This one is
    // reported rather than resolved on, and the declared spelling is the only
    // form it can still be recovered from.
    const rows = memberRows(
      `TYPE Tags : STRUCT
  spPressureAlt : REAL;
  Flow_Rate : REAL;
  ALARM : BOOL;
END_STRUCT END_TYPE\n`,
      "v : Tags;",
      "v",
      "TAGS",
    );
    expect(rows.map((r) => r.split('"')[1])).toEqual([
      "spPressureAlt",
      "Flow_Rate",
      "ALARM",
    ]);
  });

  it("gives the TYPE its declared case too", () => {
    // The C++ SYMBOL stays folded — `TAGS__TYPEDESC` is a name only the
    // generated code uses. The string inside it is the reported one.
    const header =
      build(
        `TYPE Tags : STRUCT spPressureAlt : REAL; END_STRUCT END_TYPE\n`,
        "v : Tags;",
        "v",
      ).headerCode ?? "";
    expect(header).toContain("const strucpp::TypeDesc TAGS__TYPEDESC = {");
    expect(header.slice(header.indexOf("TAGS__TYPEDESC = {"))).toContain(
      '"Tags", TAGS__MEMBERS',
    );
  });

  it("folds nothing and resolves everything, however the pin is typed", () => {
    // `Tags` declared, `TAGS` on the pin: one type to IEC 61131-3 §6.1.2, so
    // the descriptor still has to be found AND still has to report "Tags".
    const rows = memberRows(
      `TYPE Tags : STRUCT spPressureAlt : REAL; END_STRUCT END_TYPE\n`,
      "v : TAGS;",
      "v",
      "TAGS",
    );
    expect(rows[0]).toContain('"spPressureAlt"');
  });

  it("addresses each member's payload, not the wrapper around it", () => {
    // Without the wrapper's own offset a reader gets the forcing flag as data.
    const rows = memberRows(STATION, "v : STATION;", "v", "STATION");
    expect(rows[0]).toContain(
      "offsetof(STATION, NAME) + IECStringVar<20>::value_field_offset()",
    );
    expect(rows[1]).toContain(
      "offsetof(STATION, SPEEDRPM) + IEC_REAL::value_field_offset()",
    );
  });

  it("gives a nested struct its own descriptor and no wrapper offset", () => {
    const rows = memberRows(STATION, "v : STATION;", "v", "STATION");
    expect(rows[2]).toContain("&INNER__TYPEDESC");
    expect(rows[2]).toContain("strucpp::TYPE_USERDEF");
    // A nested aggregate IS its payload — nothing to step over.
    expect(rows[2]).toContain("offsetof(STATION, SUB)");
    expect(rows[2]).not.toContain("value_field_offset");
  });

  it("describes an array by its element, count and stride", () => {
    const rows = memberRows(STATION, "v : STATION;", "v", "STATION");
    expect(rows[3]).toContain("strucpp::TYPE_ARRAY");
    expect(rows[3]).toContain("elements_field_offset()");
    expect(rows[3]).toContain("element_count()");
    // The element's class rides in BASETYPECLASS, as on IEC_ANY.
    expect(rows[3]).toContain("strucpp::TYPE_ARRAY, strucpp::TYPE_ENUM");
  });

  it("points an array of structs at the element's layout", () => {
    const rows = memberRows(STATION, "v : STATION;", "v", "STATION");
    expect(rows[4]).toContain("&INNER__TYPEDESC");
    expect(rows[4]).toContain("sizeof(INNER)");
  });

  it("records a string's declared capacity, and 254 for an unqualified one", () => {
    const rows = memberRows(STATION, "v : STATION;", "v", "STATION");
    expect(rows[0].trimEnd().endsWith("20 },")).toBe(true);
    expect(rows[5]).toContain("strucpp::TYPE_WSTRING");
    expect(rows[5].trimEnd().endsWith("6 },")).toBe(true);

    const plain = memberRows(
      `TYPE T : STRUCT S : STRING; END_STRUCT END_TYPE\n`,
      "v : T;",
      "v",
      "T",
    );
    // The real number, not the debug table's "0 means 254" convention: a block
    // sizing a buffer from CAP must not have to know the convention.
    expect(plain[0].trimEnd().endsWith("254 },")).toBe(true);
  });

  it("gives an enumeration TYPE_ENUM, the class CODESYS uses", () => {
    const rows = memberRows(
      `TYPE E : (A, B); END_TYPE\nTYPE T : STRUCT C : E; END_STRUCT END_TYPE\n`,
      "v : T;",
      "v",
      "T",
    );
    expect(rows[0]).toContain("strucpp::TYPE_ENUM");
  });

  it("emits no table at all when a member defies description", () => {
    // A partial table is worse than none: a callee trusts MEMBERCOUNT, so a
    // silently short one reads as a struct that lacks the member, and the fault
    // shows at run time rather than as a build error.
    const rows = memberRows(
      `TYPE T : STRUCT P : POINTER TO INT; N : INT; END_STRUCT END_TYPE\n`,
      "v : T;",
      "v",
      "T",
    );
    expect(rows).toEqual([]);
  });
});

describe("what the call site hands the callee", () => {
  it("gives a struct argument its layout", () => {
    expect(descriptorLine(STATION, "v : STATION;", "v")).toContain(
      "&STATION__TYPEDESC",
    );
  });

  it("gives an array of structs the ELEMENT's layout", () => {
    // DICOUNT and DISTRIDE already say how to step between them.
    const types = `TYPE ST : STRUCT A : WORD; END_STRUCT END_TYPE\n`;
    expect(descriptorLine(types, "v : ARRAY[0..1] OF ST;", "v")).toContain(
      "&ST__TYPEDESC",
    );
  });

  it.each([
    ["an elementary type", "", "v : INT;", "v"],
    ["an array of an elementary type", "", "v : ARRAY[0..2] OF INT;", "v"],
    ["an enumeration", `TYPE E : (A, B); END_TYPE\n`, "v : E;", "v"],
  ])("leaves %s with no layout", (_label, types, vars, arg) => {
    expect(descriptorLine(types, vars, arg)).not.toContain("__TYPEDESC");
  });

  it("keeps an elementary argument's initialiser short of the full field list", () => {
    // The compatibility claim under test, not tidiness: TYPEDESC was APPENDED
    // and defaulted, so an initialiser written before it existed must still
    // compile. Reordering IEC_ANY's fields then fails here rather than handing
    // an imported CODESYS POU the wrong field.
    const line = descriptorLine("", "v : INT;", "v");
    const inner = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
    let depth = 0;
    let commas = 0;
    for (const ch of inner) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) commas++;
    }
    // TYPEDESC is skipped (null by default) but NAME and TYPENAME follow it,
    // so the initialiser stops at nine rather than ten fields.
    expect(commas + 1).toBe(9);
  });

  it("leaves a function block instance with no layout", () => {
    // IEC 61131-3 §6.4.3 scopes ANY_DERIVED to the Table 11 DATA types and an
    // FB is a POU, and a generated FB class may carry a vptr or an EXTENDS
    // base, where offsetof is unanswerable. The call still works.
    const types = `FUNCTION_BLOCK INNERFB VAR_INPUT X : INT; END_VAR ; END_FUNCTION_BLOCK\n`;
    const line = descriptorLine(types, "t : INNERFB;", "t");
    expect(line).toContain("TYPE_CLASS::TYPE_USERDEF");
    // No layout, but still named — see the identity tests below.
    expect(line).not.toContain("__TYPEDESC");
    expect(line).toContain('nullptr, "t", "INNERFB"');
  });
});

describe("a struct that cannot be described says so", () => {
  // Emitting nothing was silent: adding a POINTER to a DUT dropped the whole
  // table with no diagnostic. A warning, not an error — the program still
  // compiles, and one that never puts the struct on a generic pin is fine.
  const warningsFor = (types: string, vars: string, arg: string) =>
    compile(PROGRAM(types, vars, arg), { programName: "main" })
      .warnings.map((w) => w.message)
      .filter((m) => m.includes("has no member layout"));

  it.each([
    [
      "a POINTER member",
      "TYPE T : STRUCT P : POINTER TO INT; END_STRUCT END_TYPE\n",
      "is an address",
    ],
    [
      "an __XWORD member",
      "TYPE T : STRUCT X : __XWORD; END_STRUCT END_TYPE\n",
      "no single TYPE_CLASS",
    ],
  ])("names the member and the reason for %s", (_label, types, reason) => {
    const w = warningsFor(types, "v : T;", "v");
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("STRUCT 'T'");
    expect(w[0]).toContain(reason);
  });

  it("says nothing about a struct it can describe", () => {
    const types = "TYPE T : STRUCT A : INT; B : REAL; END_STRUCT END_TYPE\n";
    expect(warningsFor(types, "v : T;", "v")).toEqual([]);
  });
});

describe("the argument's own name and type", () => {
  // TYPEDESC names a struct's TYPE and its members. Neither names the variable
  // the caller wired up, and for a scalar there is no TYPEDESC at all — so
  // without these two fields a callee handed `SETPOINT : REAL` has nothing to
  // call it.
  const identityOf = (types: string, vars: string, arg: string) => {
    const line = descriptorLine(types, vars, arg);
    const inner = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
    const fields: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of inner) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        fields.push(current.trim());
        current = "";
      } else current += ch;
    }
    fields.push(current.trim());
    return { name: fields[7] ?? "", typeName: fields[8] ?? "" };
  };

  const ENUM = `TYPE E : (A, B); END_TYPE\n`;

  it.each([
    ["a scalar", "", "setpoint : REAL;", "setpoint", '"setpoint"', '"REAL"'],
    ["a string", "", "myText : STRING(20);", "myText", '"myText"', '"STRING"'],
    ["an enumeration", ENUM, "mode : E;", "mode", '"mode"', '"E"'],
    ["a struct", STATION, "plant : STATION;", "plant", '"plant"', '"STATION"'],
  ])(
    "names %s by the variable, not the type",
    (_l, types, vars, arg, name, typeName) => {
      expect(identityOf(types, vars, arg)).toEqual({ name, typeName });
    },
  );

  it("keeps the access path, so a member or element is not reported as its root", () => {
    expect(identityOf(STATION, "plant : STATION;", "plant.SPEEDRPM").name).toBe(
      '"plant.SPEEDRPM"',
    );
    expect(identityOf("", "trend : ARRAY[0..2] OF INT;", "trend[2]").name).toBe(
      '"trend[2]"',
    );
  });

  it("reports the DECLARATION's case, not the call site's", () => {
    // `Plant` and `PLANT` are one variable (IEC 61131-3 §6.1.2). Taking the
    // call site would report one variable under two spellings depending on
    // which the pin happened to be wired with.
    const types = `TYPE Tags : STRUCT spPressureAlt : REAL; END_STRUCT END_TYPE\n`;
    expect(
      identityOf(types, "Plant : Tags;", "PLANT.SPPRESSUREALT"),
    ).toEqual({ name: '"Plant.spPressureAlt"', typeName: '"REAL"' });
  });

  it("spells an array type the way an engineer would, not the synthetic name", () => {
    // `__INLINE_ARRAY_INT` is a compiler-internal spelling with no meaning to
    // a callee reading TYPENAME.
    const id = identityOf("", "trend : ARRAY[0..2] OF INT;", "trend");
    expect(id.typeName).toBe('"ARRAY OF INT"');
    expect(id.typeName).not.toContain("__INLINE_ARRAY");
  });

  it("names a function block instance too, though it has no layout", () => {
    const types = `FUNCTION_BLOCK INNERFB VAR_INPUT X : INT; END_VAR ; END_FUNCTION_BLOCK\n`;
    expect(identityOf(types, "t : INNERFB;", "t")).toEqual({
      name: '"t"',
      typeName: '"INNERFB"',
    });
  });
});

describe("re-caching a string length written through the descriptor", () => {
  // IECString caches its length beside the characters. A block writing a
  // member's characters through MemberDesc::OFFSET cannot reach that field, so
  // without the resync the ST side keeps reading the old length.
  it("syncs after passing a struct that holds a string", () => {
    const body = (build(STATION, "v : STATION;", "v").cppCode ?? "").split(
      "::run()",
    )[1];
    expect(body).toContain("strucpp::sync_strings(&V, &STATION__TYPEDESC);");
  });

  it("syncs when only a NESTED struct holds the string", () => {
    const types = `TYPE INNER : STRUCT S : STRING(4); END_STRUCT END_TYPE
TYPE OUTER : STRUCT I : INNER; END_STRUCT END_TYPE
`;
    const body = (build(types, "v : OUTER;", "v").cppCode ?? "").split(
      "::run()",
    )[1];
    expect(body).toContain("strucpp::sync_strings(&V, &OUTER__TYPEDESC);");
  });

  it("emits nothing for a struct with no strings in it", () => {
    const types = `TYPE T : STRUCT A : INT; B : REAL; END_STRUCT END_TYPE\n`;
    const body = (build(types, "v : T;", "v").cppCode ?? "").split(
      "::run()",
    )[1];
    expect(body).not.toContain("sync_strings");
  });

  it("still syncs a whole STRING passed on its own", () => {
    const body = (build("", "v : STRING(10);", "v").cppCode ?? "").split(
      "::run()",
    )[1];
    expect(body).toContain("V.sync_length();");
  });
});
