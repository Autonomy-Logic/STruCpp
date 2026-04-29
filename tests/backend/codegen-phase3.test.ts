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
      expect(result.cppCode).toContain('__assign(X, 10);');
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
      expect(result.cppCode).toContain('__assign(FLAG, true);');
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
      expect(result.cppCode).toContain('__assign(X, 3.14);');
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
      expect(result.cppCode).toContain('__assign(X, 10);');
      expect(result.cppCode).toContain('__assign(Y, X);');
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
      const aPos = cppCode.indexOf('__assign(A, 1);');
      const bPos = cppCode.indexOf('__assign(B, 2);');
      const cPos = cppCode.indexOf('__assign(C, 3);');
      expect(aPos).toBeLessThan(bPos);
      expect(bPos).toBeLessThan(cPos);
    });

    // Regression: a chain of assignments to multiple destinations from the
    // same IECVar source, after an inlined function-block body. The OLD
    // codegen emitted `dst = src;` which let GCC hoist `&src` into a
    // callee-saved register that the inlined FB body would clobber, so
    // every destination after the FB call read garbage. `__assign` routes
    // through `dst.set(src.get())`, consuming the source's address inline
    // per statement. See iec_var.hpp `__assign` rationale.
    it('should emit independent __assign calls after an inlined FB body (no shared rvalue ref)', () => {
      const source = `
        PROGRAM Test
          VAR
            TON0 : TON;
            blink : BOOL;
            blink0 : BOOL;
            blink1 : BOOL;
          END_VAR
          TON0(IN := NOT(blink), PT := T#200ms);
          blink := TON0.Q;
          blink0 := TON0.Q;
          blink1 := TON0.Q;
        END_PROGRAM
      `;
      const result = compile(source, { libraryPaths: ['libs'] });
      expect(result.success).toBe(true);
      // Each destination should appear in its own __assign call.
      expect(result.cppCode).toContain('__assign(BLINK, TON0.Q);');
      expect(result.cppCode).toContain('__assign(BLINK0, TON0.Q);');
      expect(result.cppCode).toContain('__assign(BLINK1, TON0.Q);');
      // And the legacy reference-passing op= form must not leak back in.
      expect(result.cppCode).not.toContain('BLINK = TON0.Q;');
      expect(result.cppCode).not.toContain('BLINK0 = TON0.Q;');
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
      expect(result.cppCode).toContain('__assign(Y, X + 5);');
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
      expect(result.cppCode).toContain('__assign(Y, X - 3);');
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
      expect(result.cppCode).toContain('__assign(Y, X * 2);');
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
      expect(result.cppCode).toContain('__assign(Y, X / 4);');
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
      expect(result.cppCode).toContain('__assign(Y, X % 3);');
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
      expect(result.cppCode).toContain('__assign(RESULT, A + B * C);');
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
      expect(result.cppCode).toContain('__assign(RESULT, X == 10);');
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
      expect(result.cppCode).toContain('__assign(RESULT, X != 0);');
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
      expect(result.cppCode).toContain('__assign(RESULT, A < B);');
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
      expect(result.cppCode).toContain('__assign(RESULT, A > B);');
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
      expect(result.cppCode).toContain('__assign(RESULT, A <= B);');
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
      expect(result.cppCode).toContain('__assign(RESULT, A >= B);');
    });
  });

  describe('Logical Expressions', () => {
    it('should generate AND operator (→ &)', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; b : BOOL; result : BOOL; END_VAR
          result := a AND b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('__assign(RESULT, (A) & (B));');
    });

    it('should generate OR operator (→ |)', () => {
      const source = `
        PROGRAM Test
          VAR a : BOOL; b : BOOL; result : BOOL; END_VAR
          result := a OR b;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('__assign(RESULT, (A) | (B));');
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
      expect(result.cppCode).toContain('__assign(RESULT, (A) ^ (B));');
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
      expect(result.cppCode).toContain('__assign(RESULT, !A);');
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
      expect(result.cppCode).toContain('__assign(Y, -X);');
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
      expect(result.cppCode).toContain('__assign(Y, +X);');
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
      expect(result.cppCode).toContain('__assign(RESULT, (A + B) * 2);');
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
      expect(result.cppCode).toContain('__assign(X, true);');
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
      expect(result.cppCode).toContain('__assign(X, false);');
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
      expect(result.cppCode).toContain('__assign(X, 42);');
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
      expect(result.cppCode).toContain('__assign(X, 2.718);');
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
      expect(result.cppCode).toContain('__assign(ADDINTS_result, A + B);');
      expect(result.cppCode).toContain('return ADDINTS_result;');
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
      expect(result.cppCode).toContain('__assign(MYFUNC_result, X > 0);');
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
      // Model-based path uses initializer list: X(42)
      expect(result.cppCode).toContain('X(42)');
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
      expect(result.cppCode).toContain('__assign(X, 10);');
      expect(result.cppCode).toContain('__assign(Y, X + 5);');
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
      expect(result.cppCode).toContain('__assign(A, 10);');
      expect(result.cppCode).toContain('__assign(B, 20);');
      expect(result.cppCode).toContain('__assign(RESULT, ((A < B)) & ((B > 15)));');
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
      expect(result.cppCode).toContain('__assign(X, 3.5);');
      expect(result.cppCode).toContain('__assign(Y, 2.0);');
      expect(result.cppCode).toContain('__assign(SUM, X + Y);');
      expect(result.cppCode).toContain('__assign(PRODUCT, X * Y);');
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
      expect(result.cppCode).toContain('__assign(RESULT, (X + Y) > 100);');
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
      expect(result.cppCode).toContain('__assign(RESULT, (((A) & (B))) | (C));');
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
      expect(result.cppCode).toContain('__assign(INTERNAL, INTERNAL + 1);');
      expect(result.cppCode).toContain('__assign(COUNT, INTERNAL);');
    });
  });
});
