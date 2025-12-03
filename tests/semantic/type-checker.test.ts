/**
 * STruC++ Type Checker Tests
 *
 * Tests for the type checking and type inference functionality.
 */

import { describe, it, expect } from 'vitest';
import { TypeChecker, ELEMENTARY_TYPES } from '../../src/semantic/type-checker.js';
import { SymbolTables } from '../../src/semantic/symbol-table.js';

describe('TypeChecker', () => {
  describe('ELEMENTARY_TYPES', () => {
    it('should define all basic types', () => {
      expect(ELEMENTARY_TYPES['BOOL']).toBeDefined();
      expect(ELEMENTARY_TYPES['INT']).toBeDefined();
      expect(ELEMENTARY_TYPES['DINT']).toBeDefined();
      expect(ELEMENTARY_TYPES['REAL']).toBeDefined();
      expect(ELEMENTARY_TYPES['LREAL']).toBeDefined();
      expect(ELEMENTARY_TYPES['STRING']).toBeDefined();
    });

    it('should have correct size for integer types', () => {
      expect(ELEMENTARY_TYPES['SINT']?.sizeBits).toBe(8);
      expect(ELEMENTARY_TYPES['INT']?.sizeBits).toBe(16);
      expect(ELEMENTARY_TYPES['DINT']?.sizeBits).toBe(32);
      expect(ELEMENTARY_TYPES['LINT']?.sizeBits).toBe(64);
    });

    it('should have correct size for real types', () => {
      expect(ELEMENTARY_TYPES['REAL']?.sizeBits).toBe(32);
      expect(ELEMENTARY_TYPES['LREAL']?.sizeBits).toBe(64);
    });
  });

  describe('TypeChecker', () => {
    let typeChecker: TypeChecker;
    let symbolTables: SymbolTables;

    beforeEach(() => {
      symbolTables = new SymbolTables();
      typeChecker = new TypeChecker(symbolTables);
    });

    describe('isTypeInCategory', () => {
      it('should identify ANY_INT types', () => {
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['INT']!, 'ANY_INT')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['DINT']!, 'ANY_INT')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['REAL']!, 'ANY_INT')).toBe(false);
      });

      it('should identify ANY_REAL types', () => {
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['REAL']!, 'ANY_REAL')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['LREAL']!, 'ANY_REAL')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['INT']!, 'ANY_REAL')).toBe(false);
      });

      it('should identify ANY_NUM types', () => {
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['INT']!, 'ANY_NUM')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['REAL']!, 'ANY_NUM')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['BOOL']!, 'ANY_NUM')).toBe(false);
      });

      it('should identify ANY_BIT types', () => {
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['BOOL']!, 'ANY_BIT')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['BYTE']!, 'ANY_BIT')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['WORD']!, 'ANY_BIT')).toBe(true);
        expect(typeChecker.isTypeInCategory(ELEMENTARY_TYPES['INT']!, 'ANY_BIT')).toBe(false);
      });
    });

    describe('areTypesCompatible', () => {
      it('should allow same type assignment', () => {
        expect(typeChecker.areTypesCompatible(
          ELEMENTARY_TYPES['INT']!,
          ELEMENTARY_TYPES['INT']!
        )).toBe(true);
      });

      it('should allow widening numeric conversions', () => {
        expect(typeChecker.areTypesCompatible(
          ELEMENTARY_TYPES['DINT']!,
          ELEMENTARY_TYPES['INT']!
        )).toBe(true);
      });

      it('should reject narrowing numeric conversions', () => {
        expect(typeChecker.areTypesCompatible(
          ELEMENTARY_TYPES['INT']!,
          ELEMENTARY_TYPES['DINT']!
        )).toBe(false);
      });

      it('should reject incompatible types', () => {
        expect(typeChecker.areTypesCompatible(
          ELEMENTARY_TYPES['INT']!,
          ELEMENTARY_TYPES['STRING']!
        )).toBe(false);
      });
    });
  });
});
