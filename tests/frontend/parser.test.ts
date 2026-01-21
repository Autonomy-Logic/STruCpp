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

  describe('type declarations', () => {
    it('should parse a simple type alias', () => {
      const source = `
        TYPE
          MyInt : INT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a simple enum type', () => {
      const source = `
        TYPE
          TrafficLight : (RED, YELLOW, GREEN);
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse an enum with default value', () => {
      const source = `
        TYPE
          TrafficLight : (RED, YELLOW, GREEN) := RED;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse an enum with explicit values', () => {
      const source = `
        TYPE
          State : (IDLE := 0, RUNNING := 1, STOPPED := 2);
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a typed enum', () => {
      const source = `
        TYPE
          State : INT (IDLE := 0, RUNNING := 1, STOPPED := 2);
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a struct type', () => {
      const source = `
        TYPE
          Point : STRUCT
            x : INT;
            y : INT;
          END_STRUCT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a struct with multiple field types', () => {
      const source = `
        TYPE
          Person : STRUCT
            name : STRING;
            age : INT;
            height : REAL;
            active : BOOL;
          END_STRUCT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse an array type', () => {
      const source = `
        TYPE
          IntArray : ARRAY[0..9] OF INT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a multi-dimensional array type', () => {
      const source = `
        TYPE
          Matrix : ARRAY[0..2, 0..2] OF REAL;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a non-zero-based array type', () => {
      const source = `
        TYPE
          OffsetArray : ARRAY[3..7] OF INT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a 1-based array type (IEC convention)', () => {
      const source = `
        TYPE
          OneBasedArray : ARRAY[1..10] OF REAL;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a multi-dimensional non-zero-based array', () => {
      const source = `
        TYPE
          OffsetMatrix : ARRAY[1..3, 5..8] OF DINT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse a subrange type', () => {
      const source = `
        TYPE
          Percentage : INT(0..100);
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse multiple type declarations', () => {
      const source = `
        TYPE
          MyInt : INT;
          MyReal : REAL;
          Color : (RED, GREEN, BLUE);
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });

    it('should parse nested struct types', () => {
      const source = `
        TYPE
          Inner : STRUCT
            value : INT;
          END_STRUCT;
          Outer : STRUCT
            inner : Inner;
            count : INT;
          END_STRUCT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('pragmas', () => {
    describe('external code pragma', () => {
      it('should parse external pragma as statement in program', () => {
        const source = `
          PROGRAM Main
            VAR x : INT; END_VAR
            {external printf("test"); }
          END_PROGRAM
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });

      it('should parse external pragma with nested braces', () => {
        const source = `
          PROGRAM Main
            {external if (x > 0) { y = x; } }
          END_PROGRAM
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });

      it('should parse external pragma as only statement', () => {
        const source = `
          PROGRAM CppOnly
            {external
              int x = 0;
              for (int i = 0; i < 10; i++) {
                x += i;
              }
            }
          END_PROGRAM
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });

      it('should parse external pragma mixed with ST statements', () => {
        const source = `
          PROGRAM Mixed
            VAR counter : INT; END_VAR
            counter := 0;
            {external printf("counter = %d\\n", counter); }
            counter := counter + 1;
            {external
              // More C++ code
              if (counter > 10) {
                reset_counter();
              }
            }
            counter := counter * 2;
          END_PROGRAM
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });

      it('should parse external pragma in function', () => {
        const source = `
          FUNCTION AddWithLog : INT
            VAR_INPUT a : INT; b : INT; END_VAR
            {external printf("AddWithLog(%d, %d)\\n", a, b); }
            AddWithLog := a + b;
          END_FUNCTION
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });

      it('should parse external pragma in function block', () => {
        const source = `
          FUNCTION_BLOCK Counter
            VAR_INPUT enable : BOOL; END_VAR
            VAR_OUTPUT count : INT; END_VAR
            IF enable THEN
              count := count + 1;
            END_IF;
            {external
              // Hardware access code
              write_to_hardware(count);
            }
          END_FUNCTION_BLOCK
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });

      it('should parse multiple external pragmas', () => {
        const source = `
          PROGRAM Multi
            {external printf("first"); }
            {external printf("second"); }
            {external printf("third"); }
          END_PROGRAM
        `;
        const result = parse(source);
        expect(result.errors).toHaveLength(0);
      });
    });
  });
});
