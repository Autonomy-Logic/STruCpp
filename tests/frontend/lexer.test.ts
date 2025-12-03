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
