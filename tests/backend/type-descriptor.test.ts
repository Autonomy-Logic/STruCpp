// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Layout descriptors for STRUCT types reaching a generic parameter.
 *
 * `IEC_ANY` gives a callee a pointer and a byte count, which for a STRUCT is
 * an opaque run of bytes. The tables checked here are what let a block name a
 * member, find it, and tell an INT from a REAL — see
 * `runtime/include/iec_typedesc.hpp`.
 *
 * The offsets are C++ constant expressions rather than numbers, because only
 * the target compiler knows its own padding, and because a member is a WRAPPER
 * whose payload the descriptor must address rather than the wrapper itself.
 * So the assertions here are on the SHAPE of what is emitted; that the
 * arithmetic comes out right is proved by compiling and running it, in
 * `tests/integration/type-descriptor-cpp.test.ts`.
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

  it("carries the ST name upper-cased, not the mangled C++ name", () => {
    // The name is what a block publishes as a topic, so it has to match what
    // the engineer typed rather than whatever C++ had to be called.
    const rows = memberRows(
      `TYPE T : STRUCT speedRpm : INT; END_STRUCT END_TYPE\n`,
      "v : T;",
      "v",
      "T",
    );
    expect(rows[0]).toContain('"SPEEDRPM"');
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
    // A partial table is worse than none: a block trusts MEMBERCOUNT, so a
    // silently short one reads as a struct that lacks the member the engineer
    // wired up, and the fault shows as a missing topic rather than a build
    // error.
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
    // Not tidiness — this is the compatibility claim under test. TYPEDESC was
    // APPENDED and defaulted, so an initialiser written before it existed must
    // still compile. Keeping one such initialiser in the generated output
    // means a future reordering of IEC_ANY's fields fails here and in the C++
    // build, rather than silently handing an imported CODESYS POU the wrong
    // field.
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
    // Neither IEC 61131-3 §6.4.3 — which scopes ANY_DERIVED to the Table 11
    // user-defined DATA types, and a function block is a POU — nor CODESYS
    // sanctions an FB here, and a generated FB class may carry a vptr or an
    // EXTENDS base, where offsetof is not answerable. The call keeps working;
    // it just is not described.
    const types = `FUNCTION_BLOCK INNERFB VAR_INPUT X : INT; END_VAR ; END_FUNCTION_BLOCK\n`;
    const line = descriptorLine(types, "t : INNERFB;", "t");
    expect(line).toContain("TYPE_CLASS::TYPE_USERDEF");
    // No layout, but still named — see the identity tests below.
    expect(line).not.toContain("__TYPEDESC");
    expect(line).toContain('nullptr, "T", "INNERFB"');
  });
});

describe("a struct that cannot be described says so", () => {
  // Emitting nothing was the original behaviour and it was silent: an engineer
  // added a POINTER to a DUT and every MQTT topic vanished, with no diagnostic
  // anywhere. It is a warning, not an error — the program still compiles and
  // runs, and one that never puts the struct on a generic pin is unaffected.
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
  // without these two fields a block handed `SETPOINT : REAL` has nothing to
  // call it, and cannot build a topic, a log line or a column heading.
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
    ["a scalar", "", "setpoint : REAL;", "setpoint", '"SETPOINT"', '"REAL"'],
    ["a string", "", "myText : STRING(20);", "myText", '"MYTEXT"', '"STRING"'],
    ["an enumeration", ENUM, "mode : E;", "mode", '"MODE"', '"E"'],
    ["a struct", STATION, "plant : STATION;", "plant", '"PLANT"', '"STATION"'],
  ])(
    "names %s by the variable, not the type",
    (_l, types, vars, arg, name, typeName) => {
      expect(identityOf(types, vars, arg)).toEqual({ name, typeName });
    },
  );

  it("keeps the access path, so a member or element is not reported as its root", () => {
    expect(identityOf(STATION, "plant : STATION;", "plant.SPEEDRPM").name).toBe(
      '"PLANT.SPEEDRPM"',
    );
    expect(identityOf("", "trend : ARRAY[0..2] OF INT;", "trend[2]").name).toBe(
      '"TREND[2]"',
    );
  });

  it("spells an array type the way an engineer would, not the synthetic name", () => {
    // `__INLINE_ARRAY_INT` is a compiler-internal spelling; a block publishing
    // TYPENAME as a topic segment would otherwise put it on the wire.
    const id = identityOf("", "trend : ARRAY[0..2] OF INT;", "trend");
    expect(id.typeName).toBe('"ARRAY OF INT"');
    expect(id.typeName).not.toContain("__INLINE_ARRAY");
  });

  it("names a function block instance too, though it has no layout", () => {
    const types = `FUNCTION_BLOCK INNERFB VAR_INPUT X : INT; END_VAR ; END_FUNCTION_BLOCK\n`;
    expect(identityOf(types, "t : INNERFB;", "t")).toEqual({
      name: '"T"',
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
