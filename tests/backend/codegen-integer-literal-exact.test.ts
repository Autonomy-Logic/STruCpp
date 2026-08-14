/**
 * Integer literals must lower to C++ with every digit intact.
 *
 * LINT and ULINT span the full 64 bits, which a JS `number` cannot hold. The
 * lowering used to go through `String(expr.value)` over a `parseInt` result, so
 * anything past 2^53 was rounded on the way out:
 *
 *     x : LINT  := 9007199254740993;      ->  X(9007199254740992)      wrong value
 *     y : LINT  := 9223372036854775807;   ->  Y(9223372036854776000)   past INT64_MAX
 *     z : ULINT := 18446744073709551615;  ->  Z(18446744073709552000)  g++ rejects it
 *
 * The first is silent, the last two break the C++ build — LINT/ULINT bounds are
 * exactly the values most likely to be written as sentinels.
 *
 * Re-emitting the raw digits instead is not the fix: a leading zero is an octal
 * prefix in C++, so `0010` would become 8 and `008` a compile error. The value
 * is re-derived exactly (bigint) and normalized, and a value above INT64_MAX
 * gets a `ULL` suffix because a C++ decimal literal is only ever given a signed
 * type (C++17 [lex.icon]/3).
 *
 * One lowering serves every position — PROGRAM/VAR_GLOBAL initializers, STRUCT
 * element defaults, and statement bodies — so a literal cannot mean one thing in
 * a declaration and another in an assignment.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

function compileOk(source: string): { cpp: string; header: string } {
  const result = compile(source);
  expect(result.errors.map((e) => e.message)).toEqual([]);
  expect(result.success).toBe(true);
  return { cpp: result.cppCode, header: result.headerCode };
}

/** The constructor initializer-list line for a program. */
function initList(cpp: string): string {
  return cpp.split("\n").find((l) => l.trimStart().startsWith(": ")) ?? "";
}

describe("64-bit integer literals keep every digit", () => {
  it("keeps a PROGRAM VAR initializer above 2^53 exact", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR x : LINT := 9007199254740993; END_VAR
        x := x;
      END_PROGRAM
    `);
    expect(initList(cpp)).toContain("X(9007199254740993)");
  });

  it("keeps LINT_MAX and suffixes ULINT_MAX so C++ can name the type", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR
          y : LINT := 9223372036854775807;
          z : ULINT := 18446744073709551615;
        END_VAR
        y := y;
      END_PROGRAM
    `);
    const inits = initList(cpp);
    expect(inits).toContain("Y(9223372036854775807)");
    // Unsuffixed, this decimal names no C++ type at all.
    expect(inits).toContain("Z(18446744073709551615ULL)");
  });

  it("keeps a file-level VAR_GLOBAL definition exact", () => {
    const { header } = compileOk(`
      VAR_GLOBAL
        g : LINT := 9007199254740993;
        u : ULINT := 18446744073709551615;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL g : LINT; END_VAR
        g := g;
      END_PROGRAM
    `);
    expect(header).toContain("IEC_LINT G = 9007199254740993;");
    expect(header).toContain("IEC_ULINT U = 18446744073709551615ULL;");
  });

  it("keeps a STRUCT element default exact", () => {
    const { header } = compileOk(`
      TYPE
        Big : STRUCT
          a : LINT := 9007199254740993;
          b : ULINT := 18446744073709551615;
        END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR s : Big; END_VAR
        s.a := s.a;
      END_PROGRAM
    `);
    expect(header).toContain("IEC_LINT A = 9007199254740993;");
    expect(header).toContain("IEC_ULINT B = 18446744073709551615ULL;");
  });

  it("keeps a statement-body literal exact", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR x : LINT; END_VAR
        x := 9007199254740993;
      END_PROGRAM
    `);
    expect(cpp).toContain("X = 9007199254740993;");
  });

  it("agrees between the declaration and the statement path", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR x : LINT := 9007199254740993; END_VAR
        x := 9007199254740993;
      END_PROGRAM
    `);
    expect(initList(cpp)).toContain("X(9007199254740993)");
    expect(cpp).toContain("X = 9007199254740993;");
  });

  it("keeps a typed-prefix 64-bit literal exact", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR x : LINT := LINT#9007199254740993; END_VAR
        x := x;
      END_PROGRAM
    `);
    expect(initList(cpp)).toContain(
      "X(static_cast<IEC_LINT>(9007199254740993))",
    );
  });

  it("leaves 64-bit based literals in their own notation", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR h : ULINT := 16#FFFFFFFFFFFFFFFF; END_VAR
        h := h;
      END_PROGRAM
    `);
    // A hex literal may take an unsigned type on its own, so no suffix is needed.
    expect(initList(cpp)).toContain("H(0xFFFFFFFFFFFFFFFF)");
  });
});

describe("decimal literals are normalized, never copied raw", () => {
  it("does not turn a leading zero into a C++ octal constant", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR
          a : INT := 007;
          b : INT := 0010;
          c : INT := 008;
        END_VAR
        a := a;
      END_PROGRAM
    `);
    const inits = initList(cpp);
    // Raw passthrough would give 0010 (octal 8) and 008 (a g++ error).
    expect(inits).toContain("A(7)");
    expect(inits).toContain("B(10)");
    expect(inits).toContain("C(8)");
  });

  it("strips IEC digit separators", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR n : DINT := 1_000_000; END_VAR
        n := n;
      END_PROGRAM
    `);
    expect(initList(cpp)).toContain("N(1000000)");
  });

  it("still lowers based and typed literals as before", () => {
    const { cpp } = compileOk(`
      PROGRAM Main
        VAR
          h : UDINT := 16#FF;
          o : UDINT := 8#17;
          b : UDINT := 2#1010;
          t : INT := INT#5;
        END_VAR
        h := h;
      END_PROGRAM
    `);
    const inits = initList(cpp);
    expect(inits).toContain("H(0xFF)");
    expect(inits).toContain("O(017)");
    expect(inits).toContain("B(0b1010)");
    expect(inits).toContain("T(static_cast<IEC_INT>(5))");
  });
});

describe("integer literals outside every IEC integer type", () => {
  it("rejects a value wider than ULINT", () => {
    const result = compile(`
      PROGRAM Main
        VAR a : ULINT := 99999999999999999999999; END_VAR
        a := a;
      END_PROGRAM
    `);
    expect(result.success).toBe(false);
    expect(result.errors[0]!.message).toContain(
      "outside the range of every IEC 61131-3 integer type",
    );
  });

  it("rejects one in a statement body too", () => {
    const result = compile(`
      PROGRAM Main
        VAR a : ULINT; END_VAR
        a := 99999999999999999999999;
      END_PROGRAM
    `);
    expect(result.success).toBe(false);
    expect(result.errors[0]!.message).toContain(
      "outside the range of every IEC 61131-3 integer type",
    );
  });

  it("accepts both 64-bit bounds, and LINT_MIN written with a sign", () => {
    // LINT_MIN parses as unary minus over 9223372036854775808, whose magnitude
    // exceeds LINT_MAX — the check has to allow it or it would flag valid code.
    compileOk(`
      PROGRAM Main
        VAR
          lo : LINT := -9223372036854775808;
          hi : LINT := 9223372036854775807;
          u : ULINT := 18446744073709551615;
        END_VAR
        lo := lo;
      END_PROGRAM
    `);
  });

  it("accepts the widest based literal", () => {
    compileOk(`
      PROGRAM Main
        VAR h : ULINT := 16#FFFFFFFFFFFFFFFF; END_VAR
        h := h;
      END_PROGRAM
    `);
  });
});
