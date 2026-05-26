/**
 * STruC++ parser error-message shape tests.
 *
 * The provider in `src/frontend/parser-error-message-provider.ts`
 * replaces chevrotain's default verbose alternation dump.  These tests
 * pin the *shape* of the new messages (length cap + presence of key
 * substrings) so future wording tweaks don't fail the suite.
 *
 * What gets asserted:
 *   - Messages stay short (< 500 chars) — the original chevrotain
 *     output for these inputs ran several thousand characters.
 *   - The unexpected token's actual image is in the message.
 *   - For `NoViableAlt` / `EarlyExit`, the rule description gives the
 *     user a hint about what was being parsed.
 *   - For `Mismatched`, the expected token type is named.
 *   - For "redundant input", the message identifies the extra token.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";

interface ParseError {
  message?: string;
  context?: { ruleStack?: string[] };
}

function firstErrorMessage(source: string): string {
  const result = parse(source);
  expect(result.errors.length).toBeGreaterThan(0);
  const first = result.errors[0] as ParseError;
  return first.message ?? "";
}

const MAX_MESSAGE_CHARS = 500;

describe("parser error messages (custom provider)", () => {
  describe("bare identifier in a statement (NoViableAlt at top level)", () => {
    // The headline case from the user's report: a function-block
    // body that contains just `sdfasdfa`.  Chevrotain's default
    // dumps every alternative of the `statement` rule.
    const source = `
      FUNCTION_BLOCK cvavava
        sdfasdfa
      END_FUNCTION_BLOCK
    `;

    it("does not enumerate every token path", () => {
      const message = firstErrorMessage(source);
      expect(message.length).toBeLessThan(MAX_MESSAGE_CHARS);
      // The default provider's format starts with this phrase before
      // listing alternatives — its absence is the signal that we
      // intercepted the message.
      expect(message).not.toContain("possible Token sequences");
      expect(message).not.toMatch(/\[Identifier,\s*RefAssign\]/);
    });

    it("names the unexpected identifier", () => {
      const message = firstErrorMessage(source);
      expect(message.toLowerCase()).toContain("sdfasdfa");
    });

    it("identifies the rule that failed (statement)", () => {
      const message = firstErrorMessage(source);
      expect(message.toLowerCase()).toContain("statement");
    });
  });

  describe("missing END_FUNCTION_BLOCK (MismatchedToken)", () => {
    const source = `
      FUNCTION_BLOCK widget
        VAR a : INT; END_VAR
        a := a + 1;
    `;

    it("names the expected END_* token and the actual one", () => {
      const message = firstErrorMessage(source);
      expect(message.length).toBeLessThan(MAX_MESSAGE_CHARS);
      // Either the END_FUNCTION_BLOCK type is named, or the message
      // calls out the unexpected EOF / next token.  Both are useful.
      expect(message).toMatch(/END_FUNCTION_BLOCK|end of input/i);
    });
  });

  describe("extra input after end of program (NotAllInputParsed)", () => {
    const source = `
      PROGRAM main
        VAR a : INT; END_VAR
        a := 1;
      END_PROGRAM
      garbage
    `;

    it("calls out the extra token", () => {
      const message = firstErrorMessage(source);
      expect(message.length).toBeLessThan(MAX_MESSAGE_CHARS);
      expect(message.toLowerCase()).toMatch(/extra input|unexpected/);
    });
  });

  describe("rule-stack-based suggestion", () => {
    it("attaches a suggestion when the first error is a bare statement identifier", async () => {
      // We can't access CompileError.suggestion through `parse()`
      // directly — that's only built in src/index.ts.  Import the
      // suggestion helper and exercise it standalone instead.  Same
      // mapping the production path uses.
      const { suggestionForParseError } = await import(
        "../../src/frontend/parser-error-message-provider.js"
      );
      const fakeToken = {
        tokenType: { name: "Identifier" },
        image: "sdfasdfa",
      };
      const suggestion = suggestionForParseError(
        "statement",
        fakeToken as Parameters<typeof suggestionForParseError>[1],
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.toLowerCase()).toMatch(/assignment|:=/);
    });

    it("returns undefined when the rule has no curated suggestion", async () => {
      const { suggestionForParseError } = await import(
        "../../src/frontend/parser-error-message-provider.js"
      );
      const fakeToken = {
        tokenType: { name: "Identifier" },
        image: "x",
      };
      const suggestion = suggestionForParseError(
        "compilationUnit",
        fakeToken as Parameters<typeof suggestionForParseError>[1],
      );
      expect(suggestion).toBeUndefined();
    });
  });

  describe("escape hatch — STRUCPP_VERBOSE_PARSER_ERRORS", () => {
    it("returns the custom provider by default", async () => {
      const { resolveErrorMessageProvider } = await import(
        "../../src/frontend/parser-error-message-provider.js"
      );
      const original = process.env.STRUCPP_VERBOSE_PARSER_ERRORS;
      delete process.env.STRUCPP_VERBOSE_PARSER_ERRORS;
      try {
        expect(resolveErrorMessageProvider()).toBeDefined();
      } finally {
        if (original !== undefined) {
          process.env.STRUCPP_VERBOSE_PARSER_ERRORS = original;
        }
      }
    });

    it("returns undefined when STRUCPP_VERBOSE_PARSER_ERRORS=1", async () => {
      const { resolveErrorMessageProvider } = await import(
        "../../src/frontend/parser-error-message-provider.js"
      );
      const original = process.env.STRUCPP_VERBOSE_PARSER_ERRORS;
      process.env.STRUCPP_VERBOSE_PARSER_ERRORS = "1";
      try {
        expect(resolveErrorMessageProvider()).toBeUndefined();
      } finally {
        if (original === undefined) {
          delete process.env.STRUCPP_VERBOSE_PARSER_ERRORS;
        } else {
          process.env.STRUCPP_VERBOSE_PARSER_ERRORS = original;
        }
      }
    });
  });
});
