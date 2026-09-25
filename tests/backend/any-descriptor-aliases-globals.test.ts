// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * A generic parameter given a shared global must alias the global.
 *
 * `ANY` is passed by reference, so a literal or expression is refused: there
 * would be nothing to point at. A shared global's read paths hand back a COPY
 * (`read()`, `with_lock`), so a descriptor built from one points at a temporary
 * that dies with the full expression. The canonical storage is named instead,
 * which also keeps the operand a plain lvalue — a `with_lock` lambda inside
 * `sizeof` is C++20, and this targets C++17.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const SINK = `FUNCTION_BLOCK F VAR_INPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK`;

/** The IEC_ANY line the program body emits for `a(P := <arg>)`. */
const descriptorFor = (source: string, programName = "main") => {
  const result = compile(source, { programName });
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  const body = (result.cppCode ?? "").split("::run()")[1] ?? "";
  return body.split("\n").find((l) => l.includes("IEC_ANY")) ?? "";
};

const composite = (memberType: string, arg: string) => `${SINK}
TYPE G_TYPE : STRUCT m : ${memberType}; END_STRUCT END_TYPE
PROGRAM main
  VAR_EXTERNAL G : G_TYPE; END_VAR
  VAR a : F; END_VAR
  a(P := ${arg});
END_PROGRAM
CONFIGURATION cfg
  VAR_GLOBAL G : G_TYPE; END_VAR
  RESOURCE res ON PLC
    TASK t(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM i WITH t : main;
  END_RESOURCE
END_CONFIGURATION`;

const scalar = (type: string) => `${SINK}
PROGRAM main
  VAR_EXTERNAL S : ${type}; END_VAR
  VAR a : F; END_VAR
  a(P := S);
END_PROGRAM
CONFIGURATION cfg
  VAR_GLOBAL S : ${type}; END_VAR
  RESOURCE res ON PLC
    TASK t(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM i WITH t : main;
  END_RESOURCE
END_CONFIGURATION`;

describe("a generic parameter given a member of a composite global", () => {
  it("points at the canonical storage, not a locked copy", () => {
    const line = descriptorFor(composite("REAL", "G.m"));
    expect(line).toContain("->value.M");
    expect(line).not.toContain("with_lock");
  });

  it("leaves no lambda in the unevaluated operands", () => {
    // `sizeof` / `IEC_SIZEOF` do not evaluate their operand, and a lambda
    // there needs C++20.
    expect(descriptorFor(composite("REAL", "G.m"))).not.toContain("[&](");
  });

  it.each([
    ["an elementary type", "REAL", "G.m"],
    ["an array", "ARRAY[0..2] OF WORD", "G.m"],
    ["the whole structure", "REAL", "G"],
  ])("does the same for %s", (_label, memberType, arg) => {
    const line = descriptorFor(composite(memberType, arg));
    expect(line).not.toContain("with_lock");
    expect(line).not.toContain("[&](");
  });
});

describe("a generic parameter given a scalar global", () => {
  it("points at the canonical storage, not the value read() returns", () => {
    const line = descriptorFor(scalar("REAL"));
    expect(line).toContain("->value");
    expect(line).not.toContain("read()");
  });
});

describe("a local is already its own storage", () => {
  it("is passed by name, unchanged", () => {
    const line = descriptorFor(`${SINK}
PROGRAM main VAR a : F; v : REAL; END_VAR a(P := v); END_PROGRAM`);
    expect(line).toContain("V.raw_ptr()");
    expect(line).not.toContain("->value");
  });
});
