// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * `__VARINFO(x)` and `__SYSTEM.VAR_INFO` — CODESYS's variable information.
 *
 * An extension of IEC 61131-3 describing ONE variable named in source at
 * compile time. NOT the mechanism behind `IEC_ANY::TYPEDESC`: `VAR_INFO` has
 * no member list, and a POU with a generic pin has no name to hand it. They
 * share a vocabulary and nothing else.
 *
 * Values checked against CODESYS's documented example, which reports
 * `NumElements = 8` and `BaseTypeClass = TYPE_INT` for
 * `arrA : ARRAY [1..2,1..2,1..2] OF INT`.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const build = (vars: string, body: string) => {
  const result = compile(
    `TYPE ST : STRUCT A : WORD; B : DINT; END_STRUCT END_TYPE
TYPE E : (RED, GREEN); END_TYPE
PROGRAM main VAR ${vars} END_VAR ${body} END_PROGRAM`,
    { programName: "main" },
  );
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result;
};

/** The `VAR_INFO` initialiser emitted for one `__VARINFO` call. */
const infoFor = (decl: string, arg: string) => {
  const result = build(
    `${decl} info : __SYSTEM.VAR_INFO;`,
    `info := __VARINFO(${arg});`,
  );
  const body = (result.cppCode ?? "").split("::run()")[1] ?? "";
  return body.split("\n").find((l) => l.includes("VAR_INFO{")) ?? "";
};

describe("__SYSTEM.VAR_INFO as a declarable type", () => {
  it("can be declared and assigned, like __SYSTEM.AnyType", () => {
    const result = build(
      "i : INT; info : __SYSTEM.VAR_INFO;",
      "info := __VARINFO(i);",
    );
    expect(result.cppCode).toContain("strucpp::VAR_INFO");
  });

  it("maps to the runtime struct, not to an IEC_ wrapper name", () => {
    // A dot is not a C++ name, so this needs the same special case
    // `__SYSTEM.AnyType` has.
    const result = build("info : __SYSTEM.VAR_INFO;", "");
    expect(result.headerCode ?? result.cppCode).toContain("strucpp::VAR_INFO");
  });

  it("reads its members case-insensitively, as CODESYS documents them", () => {
    // CODESYS writes `info.TypeClass`; ST is case-insensitive and codegen
    // normalises, so the C++ member is TYPECLASS.
    const result = build(
      "i : INT; info : __SYSTEM.VAR_INFO; c : DWORD; n : UDINT;",
      "info := __VARINFO(i); c := info.TypeClass; n := info.NumElements;",
    );
    const body = (result.cppCode ?? "").split("::run()")[1] ?? "";
    expect(body).toContain("INFO.TYPECLASS");
    expect(body).toContain("INFO.NUMELEMENTS");
  });
});

describe("what __VARINFO reports", () => {
  it("gives an elementary variable its own class and its address", () => {
    const line = infoFor("i : INT;", "i");
    expect(line).toContain("strucpp::TYPE_CLASS::TYPE_INT");
    expect(line).toContain('"INT"');
    // `&I`, not `I.raw_ptr()`: an alias or subrange variable in a POU is
    // declared RAW (`INT_t A;`) and has no raw_ptr() at all, and iec_var.hpp
    // pins `&x` and `x.raw_ptr()` to the same address, so one spelling serves
    // every case.
    expect(line).toContain("reinterpret_cast<uintptr_t>(&I)");
  });

  it("gives an array NUMELEMENTS and a BASETYPECLASS, as CODESYS does", () => {
    const line = infoFor("a : ARRAY[1..8] OF INT;", "a");
    expect(line).toContain("strucpp::TYPE_CLASS::TYPE_ARRAY");
    expect(line).toContain("A.element_count()");
    expect(line).toContain("strucpp::TYPE_CLASS::TYPE_INT");
    expect(line).toContain('"ARRAY OF INT"');
    // The first element, not the array object.
    expect(line).toContain("A.elements()");
  });

  it("names a DUT and reports TYPE_USERDEF, as CODESYS specifies", () => {
    const line = infoFor("s : ST;", "s");
    expect(line).toContain("strucpp::TYPE_CLASS::TYPE_USERDEF");
    expect(line).toContain('"ST"');
  });

  it("gives an enumeration its own class", () => {
    const line = infoFor("e : E;", "e");
    expect(line).toContain("strucpp::TYPE_CLASS::TYPE_ENUM");
    expect(line).toContain('"E"');
  });

  it("reports AREA -1 and BITNR -1, which is what OpenPLC can honestly say", () => {
    // CODESYS documents -1 as "not global in memory, but relative to an
    // instance or on the stack" — true of every variable here. OpenPLC has no
    // device-dependent area numbering, and inventing a plausible number would
    // invite arithmetic on it.
    const line = infoFor("i : INT;", "i");
    expect(line).toContain(", 0, -1, -1, ");
  });

  it("spells an array type readably, not by its synthetic name", () => {
    expect(infoFor("a : ARRAY[0..2] OF INT;", "a")).not.toContain(
      "__INLINE_ARRAY",
    );
  });
});

describe("types that used to be classified wrongly", () => {
  // These four all reported TYPE_USERDEF or the wrong class before `__VARINFO`
  // and the struct descriptors were made to share one classifier. A block
  // reading `info.TypeClass` and `member.TYPECLASS` was told two different
  // things about the same declared type.
  const PRE = `TYPE ALIAS_T : INT; END_TYPE
TYPE RANGE_T : INT (0..100); END_TYPE
TYPE ARRT : ARRAY[0..3] OF INT; END_TYPE
`;
  const classOf = (decl: string, arg: string) => {
    const result = compile(
      PRE +
        `PROGRAM main VAR ${decl} info : __SYSTEM.VAR_INFO; END_VAR info := __VARINFO(${arg}); END_PROGRAM`,
      { programName: "main" },
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const line =
      ((result.cppCode ?? "").split("::run()")[1] ?? "")
        .split("\n")
        .find((l) => l.includes("VAR_INFO{")) ?? "";
    return /TYPE_CLASS::(\w+), "/.exec(line)?.[1] ?? "";
  };

  it("resolves an alias to the elementary type it derives from", () => {
    // IEC 61131-3 §6.4.3 rule 1: a directly derived type has the generic type
    // of the elementary type it comes from.
    expect(classOf("v : ALIAS_T;", "v")).toBe("TYPE_INT");
  });

  it("resolves a subrange to its base type", () => {
    expect(classOf("v : RANGE_T;", "v")).toBe("TYPE_INT");
  });

  it("reports an ARRAY declared as its own TYPE as TYPE_ARRAY", () => {
    expect(classOf("v : ARRT;", "v")).toBe("TYPE_ARRAY");
  });

  it("reports a POINTER as TYPE_POINTER, not as what it points at", () => {
    // The storage is a pointer. Reporting TYPE_INT said two bytes of integer.
    expect(classOf("v : POINTER TO INT;", "v")).toBe("TYPE_POINTER");
    // And the name agrees with the class, rather than naming the target.
    const result = compile(
      `PROGRAM main VAR v : POINTER TO INT; info : __SYSTEM.VAR_INFO; END_VAR info := __VARINFO(v); END_PROGRAM`,
      { programName: "main" },
    );
    expect(result.cppCode).toContain('"POINTER TO INT"');
  });

  it("gives __XWORD a class chosen by the target's pointer width", () => {
    const result = compile(
      `PROGRAM main VAR v : __XWORD; info : __SYSTEM.VAR_INFO; END_VAR info := __VARINFO(v); END_PROGRAM`,
      { programName: "main" },
    );
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    const body = (result.cppCode ?? "").split("::run()")[1] ?? "";
    // No single enumerator is right for it, so the choice is a constant
    // expression rather than a guess baked in at compile time.
    expect(body).toContain("sizeof(strucpp::XWORD_t) == 8");
    expect(body).toContain("TYPE_LWORD");
  });
});

describe("arguments __VARINFO refuses", () => {
  // Each of these used to emit a literal `__VARINFO(X)` into the generated C++
  // — a call to a function that does not exist. The ST compiled clean and the
  // build broke later, in a file the engineer did not write.
  const errorFor = (decl: string, arg: string) => {
    const result = compile(
      `PROGRAM main VAR ${decl} info : __SYSTEM.VAR_INFO; END_VAR info := __VARINFO(${arg}); END_PROGRAM`,
      { programName: "main" },
    );
    return result.errors.map((e) => e.message).join(" | ");
  };

  it("refuses a generic descriptor, which already describes a variable", () => {
    expect(errorFor("v : __SYSTEM.AnyType;", "v")).toContain(
      "already describes a variable",
    );
  });

  it("refuses a VAR_INFO, for the same reason", () => {
    expect(errorFor("v : __SYSTEM.VAR_INFO;", "v")).toContain(
      "already describes a variable",
    );
  });

  it("refuses a literal, which has no storage to describe", () => {
    expect(errorFor("v : INT;", "42")).toContain("Only a variable");
  });
});
