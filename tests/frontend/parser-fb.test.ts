/**
 * STruC++ Parser Function Block Tests (Phase 5.1)
 *
 * Tests for parsing IEC 61131-3 Function Block features:
 * FB declarations, FB instances, FB invocations, FB member access,
 * FB composition, and FB integration with programs.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/frontend/parser.js';

function expectNoErrors(source: string) {
  const result = parse(source);
  expect(result.errors).toHaveLength(0);
  expect(result.cst).toBeDefined();
  return result;
}

describe('Function Block Parser (Phase 5.1)', () => {
  // ==========================================================================
  // FB Declaration
  // ==========================================================================

  describe('FB declaration', () => {
    it('should parse simple FB with VAR_INPUT and VAR_OUTPUT', () => {
      const source = `
        FUNCTION_BLOCK Counter
          VAR_INPUT
            enable : BOOL;
            reset : BOOL;
          END_VAR
          VAR_OUTPUT
            count : INT;
            overflow : BOOL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse FB with VAR (local variables)', () => {
      const source = `
        FUNCTION_BLOCK Accumulator
          VAR
            internal_sum : REAL;
            sample_count : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse FB with VAR_IN_OUT', () => {
      const source = `
        FUNCTION_BLOCK Modifier
          VAR_IN_OUT
            data : INT;
            buffer : REAL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse FB with all var block types', () => {
      const source = `
        FUNCTION_BLOCK FullFB
          VAR_INPUT
            enable : BOOL;
            setpoint : REAL;
          END_VAR
          VAR_OUTPUT
            output : REAL;
            error : BOOL;
          END_VAR
          VAR_IN_OUT
            shared_data : INT;
          END_VAR
          VAR
            internal : REAL;
            state : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse empty FB body', () => {
      const source = `
        FUNCTION_BLOCK EmptyFB
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse FB with statements in body', () => {
      const source = `
        FUNCTION_BLOCK Counter
          VAR_INPUT
            enable : BOOL;
          END_VAR
          VAR_OUTPUT
            count : INT;
          END_VAR
          VAR
            internal : INT;
          END_VAR
          IF enable THEN
            internal := internal + 1;
            count := internal;
          END_IF;
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });
  });

  // ==========================================================================
  // FB Instance Declaration
  // ==========================================================================

  describe('FB instance declaration', () => {
    it('should parse FB instance in program VAR block', () => {
      const source = `
        FUNCTION_BLOCK Timer
          VAR_INPUT
            IN : BOOL;
            PT : INT;
          END_VAR
          VAR_OUTPUT
            Q : BOOL;
            ET : INT;
          END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            myTimer : Timer;
          END_VAR
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse multiple FB instances of same type', () => {
      const source = `
        FUNCTION_BLOCK Counter
          VAR_INPUT enable : BOOL; END_VAR
          VAR_OUTPUT count : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            counter1 : Counter;
            counter2 : Counter;
            counter3 : Counter;
          END_VAR
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse FB instance inside another FB (composition)', () => {
      const source = `
        FUNCTION_BLOCK InnerFB
          VAR_INPUT
            signal : BOOL;
          END_VAR
          VAR_OUTPUT
            result : INT;
          END_VAR
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK OuterFB
          VAR
            inner : InnerFB;
          END_VAR
          VAR_INPUT
            enable : BOOL;
          END_VAR
          VAR_OUTPUT
            output : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });
  });

  // ==========================================================================
  // FB Invocation
  // ==========================================================================

  describe('FB invocation', () => {
    it('should parse FB call with named parameters', () => {
      const source = `
        FUNCTION_BLOCK Adder
          VAR_INPUT a : INT; b : INT; END_VAR
          VAR_OUTPUT result : INT; END_VAR
          result := a + b;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            fb : Adder;
            x : INT;
          END_VAR
          fb(a := 5, b := 3);
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse FB call with single named parameter', () => {
      const source = `
        FUNCTION_BLOCK Toggle
          VAR_INPUT trigger : BOOL; END_VAR
          VAR_OUTPUT state : BOOL; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            tog : Toggle;
          END_VAR
          tog(trigger := TRUE);
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse FB call with no parameters', () => {
      const source = `
        FUNCTION_BLOCK Ticker
          VAR_OUTPUT tick : INT; END_VAR
          VAR internal : INT; END_VAR
          internal := internal + 1;
          tick := internal;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            t : Ticker;
          END_VAR
          t();
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse FB call with output capture', () => {
      const source = `
        FUNCTION_BLOCK Compute
          VAR_INPUT a : INT; END_VAR
          VAR_OUTPUT result : INT; END_VAR
          result := a * 2;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            fb : Compute;
            x : INT;
          END_VAR
          fb(a := 5, result => x);
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse FB call with mixed input and output parameters', () => {
      const source = `
        FUNCTION_BLOCK PIDController
          VAR_INPUT
            setpoint : REAL;
            measured : REAL;
          END_VAR
          VAR_OUTPUT
            control_out : REAL;
            error : REAL;
          END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            pid : PIDController;
            output_val : REAL;
            err_val : REAL;
          END_VAR
          pid(setpoint := 100.0, measured := 95.0, control_out => output_val, error => err_val);
        END_PROGRAM
      `;
      expectNoErrors(source);
    });
  });

  // ==========================================================================
  // FB Member Access
  // ==========================================================================

  describe('FB member access', () => {
    it('should parse read FB output member', () => {
      const source = `
        FUNCTION_BLOCK Counter
          VAR_OUTPUT count : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            fb : Counter;
            x : INT;
          END_VAR
          x := fb.count;
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse write FB input member', () => {
      const source = `
        FUNCTION_BLOCK Motor
          VAR_INPUT speed : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            m : Motor;
          END_VAR
          m.speed := 42;
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse chained member access', () => {
      const source = `
        PROGRAM Main
          VAR
            fb : SomeType;
            val : INT;
          END_VAR
          val := fb.nested.value;
        END_PROGRAM
      `;
      expectNoErrors(source);
    });
  });

  // ==========================================================================
  // FB Composition
  // ==========================================================================

  describe('FB composition', () => {
    it('should parse FB containing another FB instance in VAR', () => {
      const source = `
        FUNCTION_BLOCK Inner
          VAR_INPUT
            CLK : BOOL;
          END_VAR
          VAR_OUTPUT
            Q : BOOL;
          END_VAR
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Outer
          VAR
            inner_inst : Inner;
          END_VAR
          VAR_INPUT
            enable : BOOL;
          END_VAR
          VAR_OUTPUT
            result : BOOL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse nested FB call in FB body', () => {
      const source = `
        FUNCTION_BLOCK Inner
          VAR_INPUT CLK : BOOL; END_VAR
          VAR_OUTPUT Q : BOOL; END_VAR
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Outer
          VAR
            inner_inst : Inner;
          END_VAR
          VAR_INPUT
            signal : BOOL;
          END_VAR
          VAR_OUTPUT
            output : BOOL;
          END_VAR
          inner_inst(CLK := signal);
          output := inner_inst.Q;
        END_FUNCTION_BLOCK
      `;
      expectNoErrors(source);
    });

    it('should parse accessing nested FB output', () => {
      const source = `
        PROGRAM Main
          VAR
            outer : OuterType;
            x : INT;
          END_VAR
          x := outer.inner_inst.Q;
        END_PROGRAM
      `;
      expectNoErrors(source);
    });
  });

  // ==========================================================================
  // FB with Program
  // ==========================================================================

  describe('FB with program', () => {
    it('should parse program with FB instance and invocation', () => {
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

        PROGRAM Main
          VAR
            cnt : Counter;
          END_VAR
          cnt(enable := TRUE);
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse program calling FB and reading output', () => {
      const source = `
        FUNCTION_BLOCK Averager
          VAR_INPUT
            new_value : REAL;
          END_VAR
          VAR_OUTPUT
            average : REAL;
          END_VAR
          VAR
            sum : REAL;
            count : INT;
          END_VAR
          sum := sum + new_value;
          count := count + 1;
          average := sum / count;
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            avg : Averager;
            result : REAL;
          END_VAR
          avg(new_value := 42.0);
          result := avg.average;
        END_PROGRAM
      `;
      expectNoErrors(source);
    });

    it('should parse multiple programs and FBs in same unit', () => {
      const source = `
        FUNCTION_BLOCK Timer
          VAR_INPUT
            IN : BOOL;
            PT : INT;
          END_VAR
          VAR_OUTPUT
            Q : BOOL;
            ET : INT;
          END_VAR
          VAR
            elapsed : INT;
          END_VAR
          IF IN THEN
            elapsed := elapsed + 1;
            ET := elapsed;
            IF elapsed >= PT THEN
              Q := TRUE;
            END_IF;
          ELSE
            elapsed := 0;
            ET := 0;
            Q := FALSE;
          END_IF;
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Counter
          VAR_INPUT enable : BOOL; END_VAR
          VAR_OUTPUT count : INT; END_VAR
          VAR internal : INT; END_VAR
          IF enable THEN
            internal := internal + 1;
            count := internal;
          END_IF;
        END_FUNCTION_BLOCK

        PROGRAM Supervisor
          VAR
            t1 : Timer;
            cnt : Counter;
            running : BOOL;
          END_VAR
          t1(IN := TRUE, PT := 1000);
          running := t1.Q;
          cnt(enable := running);
        END_PROGRAM

        PROGRAM Logger
          VAR
            t2 : Timer;
            log_active : BOOL;
          END_VAR
          t2(IN := TRUE, PT := 500);
          log_active := t2.Q;
        END_PROGRAM
      `;
      expectNoErrors(source);
    });
  });

  // ==========================================================================
  // Negative FB Declaration Tests
  // ==========================================================================

  describe('Negative FB declaration tests', () => {
    it('should error on missing END_FUNCTION_BLOCK', () => {
      const source = `
        FUNCTION_BLOCK Broken
          VAR x : INT; END_VAR
      `;
      const result = parse(source);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
