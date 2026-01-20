/**
 * STruC++ Lexer Tests
 *
 * Tests for the Chevrotain-based lexer that tokenizes IEC 61131-3 ST source code.
 */

import { describe, it, expect } from 'vitest';
import { tokenize, STLexer } from '../../src/frontend/lexer.js';

describe('STLexer', () => {
  describe('initialization', () => {
    it('should create a valid lexer', () => {
      expect(STLexer).toBeDefined();
    });
  });

  describe('tokenize', () => {
    it('should tokenize an empty string', () => {
      const result = tokenize('');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip whitespace', () => {
      const result = tokenize('   \n\t  ');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip single-line comments', () => {
      const result = tokenize('// this is a comment\n');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip multi-line comments', () => {
      const result = tokenize('(* this is a\nmulti-line comment *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip nested block comments (depth 2)', () => {
      const result = tokenize('(* outer (* inner *) outer *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip deeply nested block comments (depth 3)', () => {
      const result = tokenize('(* level1 (* level2 (* level3 *) level2 *) level1 *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip nested comments with multiple inner comments', () => {
      const result = tokenize('(* outer (* inner1 *) middle (* inner2 *) outer *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should handle nested comments spanning multiple lines', () => {
      const result = tokenize(`(* outer
        (* inner
           comment *)
        still outer
      *)`);
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should report error for unclosed block comment', () => {
      const result = tokenize('(* unclosed comment');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error for unclosed nested comment', () => {
      const result = tokenize('(* outer (* inner *) missing close');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report correct line and column for unclosed comment', () => {
      const source = `VAR x : INT;
(* unclosed comment`;
      const result = tokenize(source);
      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors.find(e => e.message?.includes('Unclosed'));
      expect(error).toBeDefined();
      expect(error?.line).toBe(2);
      expect(error?.column).toBe(1);
    });

    it('should report correct column for unclosed comment after code', () => {
      const result = tokenize('VAR x (* unclosed');
      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors.find(e => e.message?.includes('Unclosed'));
      expect(error).toBeDefined();
      expect(error?.line).toBe(1);
      expect(error?.column).toBe(7);
    });

    it('should handle comments with stars and parens inside', () => {
      const result = tokenize('(* contains ) and ( and * chars *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should handle code with nested comments', () => {
      const result = tokenize(`
        PROGRAM Main
          (* This is a comment
             (* with a nested comment *)
             and more text
          *)
          VAR x : INT; END_VAR
        END_PROGRAM
      `);
      expect(result.errors).toHaveLength(0);
      // Should have tokens for PROGRAM, Main, VAR, x, :, INT, ;, END_VAR, END_PROGRAM
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.tokens[0]?.tokenType.name).toBe('PROGRAM');
    });

    it('should not confuse single-line comment with nested block comment', () => {
      const result = tokenize('// This (* is not *) nested');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0); // Entire line is single-line comment
    });

    it('should handle comment followed by code', () => {
      const result = tokenize('(* comment *) VAR');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('VAR');
    });

    it('should handle nested comment followed by code', () => {
      const result = tokenize('(* outer (* inner *) *) PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('PROGRAM');
    });
  });

  describe('keywords', () => {
    it('should tokenize PROGRAM keyword', () => {
      const result = tokenize('PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('PROGRAM');
    });

    it('should tokenize END_PROGRAM keyword', () => {
      const result = tokenize('END_PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('END_PROGRAM');
    });

    it('should tokenize VAR keyword', () => {
      const result = tokenize('VAR');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('VAR');
    });

    it('should be case-insensitive for keywords', () => {
      const result = tokenize('program Program PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens.every((t) => t.tokenType.name === 'PROGRAM')).toBe(true);
    });
  });

  describe('identifiers', () => {
    it('should tokenize simple identifiers', () => {
      const result = tokenize('myVar');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Identifier');
      expect(result.tokens[0]?.image).toBe('myVar');
    });

    it('should tokenize identifiers with underscores', () => {
      const result = tokenize('my_variable_name');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Identifier');
    });

    it('should tokenize identifiers with numbers', () => {
      const result = tokenize('var123');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Identifier');
    });
  });

  describe('literals', () => {
    it('should tokenize integer literals', () => {
      const result = tokenize('123');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('IntegerLiteral');
      expect(result.tokens[0]?.image).toBe('123');
    });

    it('should tokenize real literals', () => {
      const result = tokenize('3.14');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('RealLiteral');
    });

    it('should tokenize string literals', () => {
      const result = tokenize("'hello world'");
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('StringLiteral');
    });

    it('should tokenize boolean literals', () => {
      const result = tokenize('TRUE FALSE');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]?.tokenType.name).toBe('TRUE');
      expect(result.tokens[1]?.tokenType.name).toBe('FALSE');
    });

    it('should tokenize time literals', () => {
      const result = tokenize('T#1s');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
    });

    it('should tokenize time literals with various units', () => {
      const validLiterals = ['T#10ms', 'T#100us', 'T#1000ns', 'T#1d', 'T#2h', 'T#30m', 'T#45s'];
      for (const literal of validLiterals) {
        const result = tokenize(literal);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
        expect(result.tokens[0]?.image).toBe(literal);
      }
    });

    it('should tokenize compound time literals', () => {
      const result = tokenize('T#1h2m3s');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
      expect(result.tokens[0]?.image).toBe('T#1h2m3s');
    });

    it('should tokenize TIME# prefix', () => {
      const result = tokenize('TIME#500ms');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
    });

    it('should not match time literals without unit suffix', () => {
      // T#10.5 without a unit should NOT be a valid time literal
      // It should tokenize as separate tokens or produce an error
      const result = tokenize('T#10.5');
      // The regex should not match T#10.5 as a TimeLiteral
      // It will either not match at all or match only T#10 if there was a unit
      const timeLiteralTokens = result.tokens.filter(t => t.tokenType.name === 'TimeLiteral');
      expect(timeLiteralTokens).toHaveLength(0);
    });

    it('should not match bare T# without number and unit', () => {
      const result = tokenize('T#');
      const timeLiteralTokens = result.tokens.filter(t => t.tokenType.name === 'TimeLiteral');
      expect(timeLiteralTokens).toHaveLength(0);
    });
  });

  describe('operators', () => {
    it('should tokenize assignment operator', () => {
      const result = tokenize(':=');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Assign');
    });

    it('should tokenize comparison operators', () => {
      const result = tokenize('= <> < > <= >=');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(6);
    });

    it('should tokenize arithmetic operators', () => {
      const result = tokenize('+ - * / **');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(5);
    });
  });

  describe('complex input', () => {
    it('should tokenize a simple program', () => {
      const source = `
        PROGRAM Main
          VAR counter : INT; END_VAR
          counter := counter + 1;
        END_PROGRAM
      `;
      const result = tokenize(source);
      expect(result.errors).toHaveLength(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });
});
