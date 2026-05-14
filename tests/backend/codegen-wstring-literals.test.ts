/**
 * WSTRING literal handling — parser, type-checker, and codegen.
 *
 * Background: a real user report failed to compile after adding a
 * WSTRING variable with a STRING-shaped initial value via the
 * OpenPLC Editor's variables table:
 *
 *     pou_MAIN.cpp: error: no matching function for call to
 *     'IECWStringVar<254>::IECWStringVar(const char [22])'
 *
 * Per IEC 61131-3, `'foo'` is a STRING literal and `"foo"` is a
 * WSTRING literal — the two are NOT interchangeable. The bug had
 * two layers:
 *
 *   1. The lexer recognised `"foo"` as `WideStringLiteral`, but the
 *      AST builder had no branch for it — so a WSTRING literal got
 *      silently rewritten to `LiteralExpression { literalType: INT,
 *      value: 0 }`. The mismatch then fell through every downstream
 *      type check.
 *
 *   2. Codegen emitted WSTRING literal expressions with `L"…"`
 *      (wchar_t — 32-bit on Linux/AVR) instead of `u"…"` (char16_t,
 *      what IECWStringVar's string ctor binds to).
 *
 * Both are fixed. The test suite below pins:
 *
 *   - parser: `"foo"` ⇒ WSTRING literal; `'foo'` ⇒ STRING literal
 *   - type-checker: STRING-into-WSTRING (and the reverse) is rejected
 *   - codegen: WSTRING literals emit with the `u` prefix; STRING with
 *     no prefix
 */

import { describe, it, expect } from "vitest";
import { compile, parse } from "../../dist/index.js";

describe("WSTRING literal handling", () => {
  describe("parser", () => {
    it("tags double-quoted literals as WSTRING", () => {
      const result = parse(`
        PROGRAM Main
          VAR msg : WSTRING := "hello world"; END_VAR
        END_PROGRAM
      `);
      expect(result.errors).toEqual([]);
      const init = result.ast?.programs?.[0]?.varBlocks?.[0]?.declarations?.[0]
        ?.initialValue;
      expect(init?.kind).toBe("LiteralExpression");
      expect(init && "literalType" in init && init.literalType).toBe("WSTRING");
    });

    it("tags single-quoted literals as STRING", () => {
      const result = parse(`
        PROGRAM Main
          VAR msg : STRING := 'hello world'; END_VAR
        END_PROGRAM
      `);
      expect(result.errors).toEqual([]);
      const init = result.ast?.programs?.[0]?.varBlocks?.[0]?.declarations?.[0]
        ?.initialValue;
      expect(init && "literalType" in init && init.literalType).toBe("STRING");
    });
  });

  describe("type-checker", () => {
    it("rejects WSTRING := 'string' (single-quoted STRING into WSTRING)", () => {
      // Per the user report: this is the case that previously slipped
      // through and produced broken C++. With the AST tagged
      // correctly, the assignability check catches the mismatch.
      const result = compile(`
        PROGRAM Main
          VAR msg : WSTRING := 'this is my new string'; END_VAR
        END_PROGRAM
      `);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const messages = result.errors.map((e) => e.message).join("\n");
      expect(messages).toMatch(/STRING|WSTRING|incompat/i);
    });

    it("rejects STRING := \"wstring\" (double-quoted WSTRING into STRING)", () => {
      const result = compile(`
        PROGRAM Main
          VAR msg : STRING := "hello"; END_VAR
        END_PROGRAM
      `);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("codegen", () => {
    it("emits u\"…\" for a WSTRING-typed variable initialised with a WSTRING literal", () => {
      const result = compile(`
        PROGRAM Main
          VAR msg : WSTRING := "hello world"; END_VAR
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
      // Strucpp uppercases ST variable names in the C++ initialiser
      // list. The `u"hello world"` token is what binds to
      // IECWStringVar's char16_t* ctor.
      expect(result.cppCode).toContain('MSG(u"hello world")');
    });

    it("emits \"…\" (no prefix) for a STRING-typed variable", () => {
      const result = compile(`
        PROGRAM Main
          VAR msg : STRING := 'hello world'; END_VAR
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('MSG("hello world")');
    });

    it("does not emit a bare \"\" initialiser for a defaulted WSTRING", () => {
      const result = compile(`
        PROGRAM Main
          VAR msg : WSTRING; END_VAR
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
      // Default-value path (`MSG(u"")`) or {} default init is OK;
      // the regression we're guarding against is a bare `""`
      // (char* form) leaking in.
      expect(result.cppCode).not.toMatch(/MSG\(""\)/);
    });

    it("STRING_TO_WSTRING resolves to TO_WSTRING and compiles", () => {
      const result = compile(`
        PROGRAM Main
          VAR
            s : STRING := 'hello';
            w : WSTRING;
          END_VAR
          w := STRING_TO_WSTRING(s);
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
      // Frontend collapses *_TO_* to TO_${toType} for codegen.
      expect(result.cppCode).toMatch(/TO_WSTRING\(/);
    });

    it("WSTRING_TO_STRING resolves to TO_STRING and compiles", () => {
      const result = compile(`
        PROGRAM Main
          VAR
            w : WSTRING := "hello";
            s : STRING;
          END_VAR
          s := WSTRING_TO_STRING(w);
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
      expect(result.cppCode).toMatch(/TO_STRING\(/);
    });

    it("emits u\"…\" for a WSTRING literal in a struct field initialiser", () => {
      // Struct fields go through type-codegen.ts, a separate code
      // path from program variables. The literal still has to land
      // with the `u` prefix.
      const result = compile(`
        TYPE
          Greeting : STRUCT
            message : WSTRING := "wide hello";
          END_STRUCT;
        END_TYPE
        PROGRAM Main
          VAR g : Greeting; END_VAR
        END_PROGRAM
      `);
      expect(result.success).toBe(true);
      expect(result.headerCode).toMatch(/MESSAGE\s*=\s*u"wide hello"/);
    });
  });
});
