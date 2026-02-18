/**
 * STruC++ Phase 2.6 Variable Modifiers Tests
 *
 * Tests for CONSTANT and RETAIN variable modifier validation and code generation.
 * Based on Phase 2.6 documentation requirements.
 */

import { describe, it, expect } from 'vitest';
import { compile, parse } from '../../src/index.js';

describe('Phase 2.6 - Variable Modifiers', () => {
  describe('Parser: CONSTANT modifier', () => {
    it('should parse VAR CONSTANT block', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL := 3.14159;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isConstant).toBe(true);
    });

    it('should parse multiple CONSTANT variables', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            MAX_SIZE : INT := 100;
            MIN_SIZE : INT := 1;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isConstant).toBe(true);
      expect(result.ast?.programs[0].varBlocks[0].declarations).toHaveLength(2);
    });
  });

  describe('Parser: RETAIN modifier', () => {
    it('should parse VAR RETAIN block', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isRetain).toBe(true);
    });

    it('should parse multiple RETAIN variables', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            total_count : DINT;
            last_state : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].isRetain).toBe(true);
      expect(result.ast?.programs[0].varBlocks[0].declarations).toHaveLength(2);
    });
  });

  describe('Semantic: CONSTANT validation', () => {
    it('should error when CONSTANT variable has no initializer', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('CONSTANT') && e.message.includes('initializer')
      )).toBe(true);
    });

    it('should allow CONSTANT with initializer', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL := 3.14159;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should error when VAR_OUTPUT is CONSTANT', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_OUTPUT CONSTANT
            out : INT := 0;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_OUTPUT') && e.message.includes('CONSTANT')
      )).toBe(true);
    });

    it('should error when VAR_IN_OUT is CONSTANT', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_IN_OUT CONSTANT
            inout : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_IN_OUT') && e.message.includes('CONSTANT')
      )).toBe(true);
    });

    it('should allow VAR_INPUT CONSTANT', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_INPUT CONSTANT
            max_value : INT := 100;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic: RETAIN validation', () => {
    it('should error when RETAIN and CONSTANT are combined (parser level)', () => {
      // Note: The parser grammar treats RETAIN and CONSTANT as mutually exclusive
      // (OR rule in the grammar), so this is a parse error, not a semantic error.
      // This is acceptable because RETAIN + CONSTANT is semantically nonsensical:
      // a constant never needs to be retained since it's always the same value.
      const source = `
        PROGRAM Main
          VAR RETAIN CONSTANT
            value : INT := 0;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should error when VAR_INPUT is RETAIN', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_INPUT RETAIN
            input : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_INPUT') && e.message.includes('RETAIN')
      )).toBe(true);
    });

    it('should error when VAR_OUTPUT is RETAIN', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_OUTPUT RETAIN
            output : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_OUTPUT') && e.message.includes('RETAIN')
      )).toBe(true);
    });

    it('should error when VAR_IN_OUT is RETAIN', () => {
      const source = `
        FUNCTION_BLOCK TestFB
          VAR_IN_OUT RETAIN
            inout : INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_IN_OUT') && e.message.includes('RETAIN')
      )).toBe(true);
    });

    it('should error when VAR_TEMP is RETAIN', () => {
      const source = `
        PROGRAM Main
          VAR_TEMP RETAIN
            temp : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('VAR_TEMP') && e.message.includes('RETAIN')
      )).toBe(true);
    });

    it('should allow VAR RETAIN', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Code Generation: CONSTANT', () => {
    it('should generate const qualifier for CONSTANT variables', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            PI : REAL := 3.14159;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('const IEC_REAL PI');
    });

    it('should generate const qualifier for multiple CONSTANT variables', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            MAX_SIZE : INT := 100;
            MIN_SIZE : INT := 1;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('const IEC_INT MAX_SIZE');
      expect(result.headerCode).toContain('const IEC_INT MIN_SIZE');
    });
  });

  describe('Code Generation: RETAIN', () => {
    it('should generate retain variable table for RETAIN variables', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Check for retain table declaration in header
      expect(result.headerCode).toContain('__retain_vars');
      expect(result.headerCode).toContain('getRetainVars');
      expect(result.headerCode).toContain('getRetainCount');
      // Check for retain table definition in source
      expect(result.cppCode).toContain('RetainVarInfo');
      expect(result.cppCode).toContain('COUNTER');
      expect(result.cppCode).toContain('offsetof');
    });

    it('should generate retain table with multiple variables', () => {
      const source = `
        PROGRAM Main
          VAR RETAIN
            total_count : DINT;
            last_state : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('__retain_vars[2]');
      expect(result.cppCode).toContain('TOTAL_COUNT');
      expect(result.cppCode).toContain('LAST_STATE');
    });

    it('should not generate retain table when no RETAIN variables', () => {
      const source = `
        PROGRAM Main
          VAR
            counter : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).not.toContain('__retain_vars');
      expect(result.headerCode).not.toContain('getRetainVars');
    });
  });
});
