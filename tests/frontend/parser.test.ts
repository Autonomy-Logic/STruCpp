/**
 * STruC++ Parser Tests
 *
 * Tests for the Chevrotain-based parser that produces a CST from ST tokens.
 */

import { describe, it, expect } from 'vitest';
import { parse, parser } from '../../src/frontend/parser.js';

describe('STParser', () => {
  describe('initialization', () => {
    it('should create a valid parser', () => {
      expect(parser).toBeDefined();
    });
  });

  describe('parse', () => {
    it('should parse an empty input', () => {
      const result = parse('');
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a minimal program', () => {
      const source = `
        PROGRAM Main
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.cst).toBeDefined();
    });

    it('should parse a program with variables', () => {
      const source = `
        PROGRAM Main
          VAR
            counter : INT;
            flag : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a program with assignment', () => {
      const source = `
        PROGRAM Main
          VAR counter : INT; END_VAR
          counter := 0;
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a program with IF statement', () => {
      const source = `
        PROGRAM Main
          VAR x : INT; END_VAR
          IF x > 0 THEN
            x := x - 1;
          END_IF;
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a program with FOR loop', () => {
      const source = `
        PROGRAM Main
          VAR i : INT; END_VAR
          FOR i := 0 TO 10 DO
            i := i;
          END_FOR;
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('functions', () => {
    it('should parse a simple function', () => {
      const source = `
        FUNCTION Add : INT
          VAR_INPUT
            a : INT;
            b : INT;
          END_VAR
          Add := a + b;
        END_FUNCTION
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('function blocks', () => {
    it('should parse a simple function block', () => {
      const source = `
        FUNCTION_BLOCK Counter
          VAR_INPUT enable : BOOL; END_VAR
          VAR_OUTPUT count : INT; END_VAR
          VAR internal : INT; END_VAR
          IF enable THEN
            internal := internal + 1;
            count := internal;
          END_IF;
        END_FUNCTION_BLOCK
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('error recovery', () => {
    it('should report errors for invalid syntax', () => {
      const source = `
        PROGRAM Main
          VAR x : ; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
