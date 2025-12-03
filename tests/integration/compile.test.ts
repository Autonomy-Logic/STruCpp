/**
 * STruC++ Integration Tests
 *
 * End-to-end tests for the complete compilation pipeline.
 */

import { describe, it, expect } from 'vitest';
import { compile, getVersion, defaultOptions } from '../../src/index.js';

describe('STruC++ Compiler', () => {
  describe('getVersion', () => {
    it('should return version string', () => {
      const version = getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('defaultOptions', () => {
    it('should have sensible defaults', () => {
      expect(defaultOptions.debug).toBe(false);
      expect(defaultOptions.lineMapping).toBe(true);
      expect(defaultOptions.optimizationLevel).toBe(0);
    });
  });

  describe('compile', () => {
    it('should return a result object', () => {
      const result = compile('');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('cppCode');
      expect(result).toHaveProperty('headerCode');
      expect(result).toHaveProperty('lineMap');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should indicate not implemented in Phase 0', () => {
      const result = compile('PROGRAM Main END_PROGRAM');
      // In Phase 0, the compiler is not yet implemented
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain('not yet implemented');
    });

    it('should accept compilation options', () => {
      const result = compile('PROGRAM Main END_PROGRAM', {
        debug: true,
        lineMapping: false,
      });
      expect(result).toBeDefined();
    });
  });
});

describe('Future Integration Tests', () => {
  // These tests are placeholders for Phase 3+ when the compiler is implemented

  it.skip('should compile a simple program', () => {
    const source = `
      PROGRAM Main
        VAR counter : INT; END_VAR
        counter := counter + 1;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('class Program_Main');
  });

  it.skip('should compile a function', () => {
    const source = `
      FUNCTION Add : INT
        VAR_INPUT a, b : INT; END_VAR
        Add := a + b;
      END_FUNCTION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('IEC_INT Add(');
  });

  it.skip('should compile a function block', () => {
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
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('class Counter');
  });

  it.skip('should generate line mapping', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 1;
        x := x + 1;
      END_PROGRAM
    `;
    const result = compile(source, { lineMapping: true });
    expect(result.success).toBe(true);
    expect(result.lineMap.size).toBeGreaterThan(0);
  });

  it.skip('should report syntax errors', () => {
    const source = `
      PROGRAM Main
        VAR x : ; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.skip('should report type errors', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; y : STRING; END_VAR
        x := y;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('type'))).toBe(true);
  });
});
