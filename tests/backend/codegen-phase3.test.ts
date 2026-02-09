/**
 * STruC++ Phase 3.1 Code Generator Tests
 *
 * Tests for expression and assignment code generation.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';

describe('Phase 3.1 - Expression and Assignment Code Generation', () => {
  describe('Assignment Statements', () => {
    it('should generate simple integer assignment', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 10;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 10;');
    });

    it('should generate boolean assignment', () => {
      const source = `
        PROGRAM Test
          VAR flag : BOOL; END_VAR
          flag := TRUE;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('flag = true;');
    });

    it('should generate real number assignment', () => {
      const source = `
        PROGRAM Test
          VAR x : REAL; END_VAR
          x := 3.14;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 3.14;');
    });

    it('should generate variable-to-variable assignment', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          x := 10;
          y := x;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 10;');
      expect(result.cppCode).toContain('y = x;');
    });

    it('should generate multiple assignments in order', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; c : INT; END_VAR
          a := 1;
          b := 2;
          c := 3;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      const cppCode = result.cppCode;
      const aPos = cppCode.indexOf('a = 1;');
      const bPos = cppCode.indexOf('b = 2;');
      const cPos = cppCode.indexOf('c = 3;');
      expect(aPos).toBeLessThan(bPos);
      expect(bPos).toBeLessThan(cPos);
    });
  });

  describe('Arithmetic Expressions', () => {
    it('should generate addition', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := x + 5;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = x + 5;');
    });

    it('should generate subtraction', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := x - 3;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = x - 3;');
    });

    it('should generate multiplication', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := x * 2;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = x * 2;');
    });

    it('should generate division', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := x / 4;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = x / 4;');
    });

    it('should generate MOD operator', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := x MOD 3;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = x % 3;');
    });

    it('should generate complex arithmetic expression', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; c : INT; result : INT; END_VAR
          result := a + b * c;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a + b * c;');
    });
  });

  describe('Comparison Expressions', () => {
    it('should generate equality comparison (= → ==)', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; result : BOOL; END_VAR
          result := x = 10;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = x == 10;');
    });

    it('should generate not-equal comparison (<> → !=)', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; result : BOOL; END_VAR
          result := x <> 0;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = x != 0;');
    });

    it('should generate less-than comparison', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; result : BOOL; END_VAR
          result := a < b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a < b;');
    });

    it('should generate greater-than comparison', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; result : BOOL; END_VAR
          result := a > b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a > b;');
    });

    it('should generate less-than-or-equal comparison', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; result : BOOL; END_VAR
          result := a <= b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a <= b;');
    });

    it('should generate greater-than-or-equal comparison', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; result : BOOL; END_VAR
          result := a >= b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a >= b;');
    });
  });

  describe('Logical Expressions', () => {
    it('should generate AND operator (→ &&)', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; b : BOOL; result : BOOL; END_VAR
          result := a AND b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a && b;');
    });

    it('should generate OR operator (→ ||)', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; b : BOOL; result : BOOL; END_VAR
          result := a OR b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a || b;');
    });

    it('should generate XOR operator (→ ^)', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; b : BOOL; result : BOOL; END_VAR
          result := a XOR b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = a ^ b;');
    });

    it('should generate NOT operator (→ !)', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; result : BOOL; END_VAR
          result := NOT a;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = !a;');
    });
  });

  describe('Unary Expressions', () => {
    it('should generate unary minus', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := -x;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = -x;');
    });

    it('should generate unary plus', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; END_VAR
          y := +x;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('y = +x;');
    });
  });

  describe('Parenthesized Expressions', () => {
    it('should generate parenthesized expression', () => {
      const source = `
        PROGRAM Test
          VAR a : INT; b : INT; result : INT; END_VAR
          result := (a + b) * 2;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = (a + b) * 2;');
    });
  });

  describe('Literal Expressions', () => {
    it('should generate TRUE literal', () => {
      const source = `
        PROGRAM Test
          VAR x : BOOL; END_VAR
          x := TRUE;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = true;');
    });

    it('should generate FALSE literal', () => {
      const source = `
        PROGRAM Test
          VAR x : BOOL; END_VAR
          x := FALSE;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = false;');
    });

    it('should generate integer literal', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 42;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 42;');
    });

    it('should generate real literal', () => {
      const source = `
        PROGRAM Test
          VAR x : REAL; END_VAR
          x := 2.718;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 2.718;');
    });
  });

  describe('Function Return Value Assignment', () => {
    it('should redirect function name assignment to result variable', () => {
      const source = `
        FUNCTION AddInts : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          AddInts := a + b;
        END_FUNCTION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('AddInts_result = a + b;');
      expect(result.cppCode).toContain('return AddInts_result;');
    });

    it('should handle case-insensitive function name assignment', () => {
      const source = `
        FUNCTION MyFunc : BOOL
          VAR_INPUT x : INT; END_VAR
          myfunc := x > 0;
        END_FUNCTION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('MyFunc_result = x > 0;');
    });
  });

  describe('Constructor Initialization', () => {
    it('should generate initial value in constructor', () => {
      const source = `
        PROGRAM Test
          VAR x : INT := 42; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Model-based path uses initializer list: x(42)
      expect(result.cppCode).toContain('x(42)');
    });

    it('should generate boolean initial value', () => {
      const source = `
        PROGRAM Test
          VAR flag : BOOL := TRUE; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Validation Examples from Docs', () => {
    it('Test 1: Simple Assignment (y = 15)', () => {
      const source = `
        PROGRAM SimpleAssign
          VAR
            x : INT;
            y : INT;
          END_VAR
          x := 10;
          y := x + 5;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 10;');
      expect(result.cppCode).toContain('y = x + 5;');
    });

    it('Test 2: Boolean Expression', () => {
      const source = `
        PROGRAM BoolExpr
          VAR
            a : INT;
            b : INT;
            result : BOOL;
          END_VAR
          a := 10;
          b := 20;
          result := (a < b) AND (b > 15);
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('a = 10;');
      expect(result.cppCode).toContain('b = 20;');
      expect(result.cppCode).toContain('result = (a < b) && (b > 15);');
    });

    it('Test 3: Arithmetic Operations', () => {
      const source = `
        PROGRAM Arithmetic
          VAR
            x : REAL;
            y : REAL;
            sum : REAL;
            product : REAL;
          END_VAR
          x := 3.5;
          y := 2.0;
          sum := x + y;
          product := x * y;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('x = 3.5;');
      expect(result.cppCode).toContain('y = 2.0;');
      expect(result.cppCode).toContain('sum = x + y;');
      expect(result.cppCode).toContain('product = x * y;');
    });
  });

  describe('CONSTANT Assignment Validation', () => {
    it('should reject assignment to CONSTANT variable', () => {
      const source = `
        PROGRAM Test
          VAR CONSTANT
            MAX_VAL : INT := 100;
          END_VAR
          VAR
            x : INT;
          END_VAR
          MAX_VAL := 50;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toContain('CONSTANT');
    });

    it('should allow assignment to non-constant variable', () => {
      const source = `
        PROGRAM Test
          VAR CONSTANT
            MAX_VAL : INT := 100;
          END_VAR
          VAR
            x : INT;
          END_VAR
          x := MAX_VAL;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Mixed Expressions', () => {
    it('should handle comparison with arithmetic', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; y : INT; result : BOOL; END_VAR
          result := (x + y) > 100;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = (x + y) > 100;');
    });

    it('should handle nested logical operations', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; b : BOOL; c : BOOL; result : BOOL; END_VAR
          result := (a AND b) OR c;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('result = (a && b) || c;');
    });
  });

  describe('Function Block Body', () => {
    it('should generate statements in function block body', () => {
      const source = `
        FUNCTION_BLOCK Counter
          VAR_INPUT enable : BOOL; END_VAR
          VAR_OUTPUT count : INT; END_VAR
          VAR internal : INT; END_VAR
          internal := internal + 1;
          count := internal;
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('internal = internal + 1;');
      expect(result.cppCode).toContain('count = internal;');
    });
  });
});
