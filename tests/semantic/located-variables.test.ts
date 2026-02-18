/**
 * STruC++ Phase 2.3 Located Variables Tests
 *
 * Tests for located variable parsing, semantic validation, and code generation.
 * Based on Phase 2.3 documentation requirements.
 */

import { describe, it, expect } from 'vitest';
import { compile, parse } from '../../src/index.js';

describe('Phase 2.3 - Located Variables', () => {
  describe('Parser: Address Format', () => {
    it('should parse bit-addressed input variable', () => {
      const source = `
        PROGRAM Main
          VAR input_bit AT %IX0.0 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IX0.0');
    });

    it('should parse bit-addressed output variable', () => {
      const source = `
        PROGRAM Main
          VAR output_bit AT %QX2.3 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%QX2.3');
    });

    it('should parse word-addressed input variable', () => {
      const source = `
        PROGRAM Main
          VAR analog_in AT %IW10 : INT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IW10');
    });

    it('should parse word-addressed output variable', () => {
      const source = `
        PROGRAM Main
          VAR analog_out AT %QW5 : INT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%QW5');
    });

    it('should parse memory word variable', () => {
      const source = `
        PROGRAM Main
          VAR counter AT %MW100 : INT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%MW100');
    });

    it('should parse memory double word variable', () => {
      const source = `
        PROGRAM Main
          VAR accumulated AT %MD50 : DINT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%MD50');
    });

    it('should parse byte-addressed variable', () => {
      const source = `
        PROGRAM Main
          VAR byte_in AT %IB5 : BYTE; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IB5');
    });

    it('should parse long word variable', () => {
      const source = `
        PROGRAM Main
          VAR big_val AT %ML0 : LINT; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%ML0');
    });

    it('should parse lowercase address (uppercased by lexer)', () => {
      const source = `
        PROGRAM Main
          VAR input_bit AT %ix0.0 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      // uppercaseSource() converts the address to uppercase before lexing
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].address).toBe('%IX0.0');
    });

    it('should parse multiple located variables', () => {
      const source = `
        PROGRAM Main
          VAR
            start_button AT %IX0.0 : BOOL;
            stop_button AT %IX0.1 : BOOL;
            motor_running AT %QX2.0 : BOOL;
            speed_setpoint AT %QW10 : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations).toHaveLength(4);
    });
  });

  describe('Semantic: Duplicate Address Detection', () => {
    it('should error on duplicate addresses', () => {
      const source = `
        PROGRAM Main
          VAR
            var1 AT %QX0.0 : BOOL;
            var2 AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('Duplicate address'))).toBe(true);
    });

    it('should allow different addresses', () => {
      const source = `
        PROGRAM Main
          VAR
            var1 AT %QX0.0 : BOOL;
            var2 AT %QX0.1 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should allow same byte different bit', () => {
      const source = `
        PROGRAM Main
          VAR
            bit0 AT %IX0.0 : BOOL;
            bit1 AT %IX0.1 : BOOL;
            bit7 AT %IX0.7 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic: Function Block Restriction', () => {
    it('should error on located variable in function block', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          VAR
            output AT %QX0.0 : BOOL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('FUNCTION_BLOCK'))).toBe(true);
    });

    it('should allow located variable in program', () => {
      const source = `
        PROGRAM Main
          VAR
            output AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic: Type Size Compatibility', () => {
    it('should accept BOOL for bit address', () => {
      const source = `
        PROGRAM Main
          VAR input AT %IX0.0 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should error on INT for bit address', () => {
      const source = `
        PROGRAM Main
          VAR input AT %IX0.0 : INT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible'))).toBe(true);
    });

    it('should accept INT for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IW10 : INT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept UINT for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %QW5 : UINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept WORD for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MW0 : WORD; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept DINT for double word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MD50 : DINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept REAL for double word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MD50 : REAL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept BYTE for byte address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IB5 : BYTE; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept SINT for byte address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %MB10 : SINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept LINT for long word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %ML0 : LINT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should accept LREAL for long word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %QL0 : LREAL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should error on BOOL for word address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IW10 : BOOL; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible'))).toBe(true);
    });

    it('should error on INT for byte address', () => {
      const source = `
        PROGRAM Main
          VAR val AT %IB5 : INT; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('not compatible'))).toBe(true);
    });
  });

  describe('Code Generation: Descriptor Array', () => {
    it('should generate located variable descriptor in header', () => {
      const source = `
        PROGRAM Main
          VAR
            start_button AT %IX0.0 : BOOL;
            motor_running AT %QX2.3 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('locatedVars');
      expect(result.headerCode).toContain('locatedVarsCount');
    });

    it('should generate descriptor array definition in cpp', () => {
      const source = `
        PROGRAM Main
          VAR
            input_bit AT %IX0.0 : BOOL;
            output_word AT %QW10 : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('LocatedVar locatedVars');
      expect(result.cppCode).toContain('LocatedArea::Input');
      expect(result.cppCode).toContain('LocatedArea::Output');
      expect(result.cppCode).toContain('LocatedSize::Bit');
      expect(result.cppCode).toContain('LocatedSize::Word');
    });

    it('should generate pointer initialization in constructor', () => {
      const source = `
        PROGRAM Main
          VAR
            sensor AT %IX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('raw_ptr()');
    });

    it('should not generate descriptor for non-located variables', () => {
      const source = `
        PROGRAM Main
          VAR
            local_var : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).not.toContain('locatedVars');
    });

    it('should include address comment in variable declaration', () => {
      const source = `
        PROGRAM Main
          VAR
            input_bit AT %IX0.5 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('AT %IX0.5');
    });
  });

  describe('Integration: Complete Located Variables Example', () => {
    it('should compile Test 1: Basic Located Variables', () => {
      const source = `
        PROGRAM test
          VAR
            input_bit AT %IX0.0 : BOOL;
            output_bit AT %QX0.0 : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('Program_TEST');
      expect(result.cppCode).toContain('locatedVars');
    });

    it('should compile Test 2: Word-Addressed Variables', () => {
      const source = `
        PROGRAM test
          VAR
            analog_in AT %IW5 : INT;
            analog_out AT %QW10 : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile Test 3: Memory Variables', () => {
      const source = `
        PROGRAM test
          VAR
            counter AT %MW100 : INT;
            accumulator AT %MD50 : DINT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile mixed located and non-located variables', () => {
      const source = `
        PROGRAM Main
          VAR
            input AT %IX0.0 : BOOL;
            local_counter : INT;
            output AT %QX0.0 : BOOL;
            temp : REAL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });
});
