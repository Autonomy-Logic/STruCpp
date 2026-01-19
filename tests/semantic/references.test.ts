/**
 * STruC++ Phase 2.4 References and Pointers Tests
 *
 * Tests for REF_TO, REFERENCE_TO, REF(), DREF(), ^, NULL parsing
 * and semantic validation.
 * Based on Phase 2.4 documentation requirements.
 *
 * Note: Tests with program body statements (ref := NULL, etc.) are marked
 * as skipped until Phase 3 statement translation is implemented.
 */

import { describe, it, expect } from 'vitest';
import { compile, parse } from '../../src/index.js';

describe('Phase 2.4 - References and Pointers', () => {
  describe('Parser: REF_TO Type', () => {
    it('should parse REF_TO INT variable declaration', () => {
      const source = `
        PROGRAM Main
          VAR
            my_ref : REF_TO INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decl = result.ast?.programs[0].varBlocks[0].declarations[0];
      expect(decl?.type.isReference).toBe(true);
      expect(decl?.type.referenceKind).toBe('ref_to');
      expect(decl?.type.name).toBe('INT');
    });

    it('should parse REF_TO REAL variable declaration', () => {
      const source = `
        PROGRAM Main
          VAR
            ref_real : REF_TO REAL;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decl = result.ast?.programs[0].varBlocks[0].declarations[0];
      expect(decl?.type.isReference).toBe(true);
      expect(decl?.type.referenceKind).toBe('ref_to');
      expect(decl?.type.name).toBe('REAL');
    });

    it('should parse REF_TO user-defined type', () => {
      const source = `
        PROGRAM Main
          VAR
            struct_ref : REF_TO MyStruct;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decl = result.ast?.programs[0].varBlocks[0].declarations[0];
      expect(decl?.type.isReference).toBe(true);
      expect(decl?.type.name).toBe('MyStruct');
    });

    it.skip('should parse nested REF_TO REF_TO type (pending grammar extension)', () => {
      // Note: Nested REF_TO types like `REF_TO REF_TO INT` require
      // grammar changes to support recursive type references.
      // This is tracked for a future enhancement.
      const source = `
        PROGRAM Main
          VAR
            nested_ref : REF_TO REF_TO INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Parser: REFERENCE_TO Type (CODESYS)', () => {
    it('should parse REFERENCE_TO INT variable declaration', () => {
      const source = `
        PROGRAM Main
          VAR
            my_ref : REFERENCE_TO INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decl = result.ast?.programs[0].varBlocks[0].declarations[0];
      expect(decl?.type.isReference).toBe(true);
      expect(decl?.type.referenceKind).toBe('reference_to');
      expect(decl?.type.name).toBe('INT');
    });

    it('should parse REFERENCE_TO BOOL variable declaration', () => {
      const source = `
        PROGRAM Main
          VAR
            flag_ref : REFERENCE_TO BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decl = result.ast?.programs[0].varBlocks[0].declarations[0];
      expect(decl?.type.referenceKind).toBe('reference_to');
    });

    it('should parse REFERENCE_TO with user type', () => {
      const source = `
        PROGRAM Main
          VAR
            struct_ref : REFERENCE_TO MyStruct;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const decl = result.ast?.programs[0].varBlocks[0].declarations[0];
      expect(decl?.type.referenceKind).toBe('reference_to');
      expect(decl?.type.name).toBe('MyStruct');
    });
  });

  describe('Parser: Mixed REF_TO and non-reference variables', () => {
    it('should parse program with mixed variable types', () => {
      const source = `
        PROGRAM Main
          VAR
            x : INT;
            y : REAL;
            ref_int : REF_TO INT;
            ref_real : REF_TO REAL;
            implicit_ref : REFERENCE_TO INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const varBlock = result.ast?.programs[0].varBlocks[0];
      expect(varBlock?.declarations).toHaveLength(5);
      expect(varBlock?.declarations[0].type.isReference).toBe(false);
      expect(varBlock?.declarations[1].type.isReference).toBe(false);
      expect(varBlock?.declarations[2].type.isReference).toBe(true);
      expect(varBlock?.declarations[2].type.referenceKind).toBe('ref_to');
      expect(varBlock?.declarations[3].type.isReference).toBe(true);
      expect(varBlock?.declarations[3].type.referenceKind).toBe('ref_to');
      expect(varBlock?.declarations[4].type.isReference).toBe(true);
      expect(varBlock?.declarations[4].type.referenceKind).toBe('reference_to');
    });

    it('should parse multiple reference declarations in same VAR block', () => {
      const source = `
        PROGRAM Main
          VAR
            ptr1, ptr2 : REF_TO INT;
            implref1 : REFERENCE_TO REAL;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const varBlock = result.ast?.programs[0].varBlocks[0];
      expect(varBlock?.declarations).toHaveLength(2);
      // First declaration has two names
      expect(varBlock?.declarations[0].names).toEqual(['ptr1', 'ptr2']);
      expect(varBlock?.declarations[0].type.referenceKind).toBe('ref_to');
    });
  });

  describe('Parser: REF_TO in different VAR block types', () => {
    it('should parse REF_TO in VAR_INPUT', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          VAR_INPUT
            input_ref : REF_TO INT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const varBlock = result.ast?.functionBlocks[0].varBlocks[0];
      expect(varBlock?.blockType).toBe('VAR_INPUT');
      expect(varBlock?.declarations[0].type.isReference).toBe(true);
    });

    it('should parse REF_TO in VAR_OUTPUT', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          VAR_OUTPUT
            output_ref : REF_TO REAL;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const varBlock = result.ast?.functionBlocks[0].varBlocks[0];
      expect(varBlock?.blockType).toBe('VAR_OUTPUT');
      expect(varBlock?.declarations[0].type.isReference).toBe(true);
    });

    it('should parse REF_TO in VAR_IN_OUT', () => {
      const source = `
        FUNCTION_BLOCK MyFB
          VAR_IN_OUT
            inout_ref : REF_TO DINT;
          END_VAR
        END_FUNCTION_BLOCK
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const varBlock = result.ast?.functionBlocks[0].varBlocks[0];
      expect(varBlock?.blockType).toBe('VAR_IN_OUT');
      expect(varBlock?.declarations[0].type.isReference).toBe(true);
    });
  });

  describe('Parser: Case insensitivity for type keywords', () => {
    it('should parse lowercase ref_to', () => {
      const source = `
        PROGRAM Main
          VAR
            my_ptr : ref_to INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].type.isReference).toBe(true);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].type.referenceKind).toBe('ref_to');
    });

    it('should parse mixed case Ref_To', () => {
      const source = `
        PROGRAM Main
          VAR
            my_ptr : Ref_To INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].type.isReference).toBe(true);
    });

    it('should parse lowercase reference_to', () => {
      const source = `
        PROGRAM Main
          VAR
            my_ptr : reference_to INT;
          END_VAR
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.programs[0].varBlocks[0].declarations[0].type.referenceKind).toBe('reference_to');
    });
  });

  describe('Parser: REF_TO in TYPE declarations', () => {
    it('should parse REF_TO in struct field', () => {
      const source = `
        TYPE
          MyStruct : STRUCT
            ptr_field : REF_TO INT;
            value_field : REAL;
          END_STRUCT;
        END_TYPE
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const structDef = result.ast?.types[0].definition;
      expect(structDef?.kind).toBe('StructDefinition');
      if (structDef?.kind === 'StructDefinition') {
        expect(structDef.fields[0].type.isReference).toBe(true);
        expect(structDef.fields[1].type.isReference).toBe(false);
      }
    });
  });

  describe('Parser: Function return type with REF_TO', () => {
    it('should parse function with REF_TO return type', () => {
      const source = `
        FUNCTION GetRef : REF_TO INT
          VAR
            temp : INT;
          END_VAR
        END_FUNCTION
      `;
      const result = parse(source);
      expect(result.errors).toHaveLength(0);
      const func = result.ast?.functions[0];
      expect(func?.returnType.isReference).toBe(true);
      expect(func?.returnType.referenceKind).toBe('ref_to');
      expect(func?.returnType.name).toBe('INT');
    });
  });
});
