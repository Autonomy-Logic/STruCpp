/**
 * STruC++ Type Code Generator Tests
 *
 * Tests for the type code generator that produces C++ type definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  TypeCodeGenerator,
  generateTypeCode,
} from '../../src/backend/type-codegen.js';
import { TypeRegistry } from '../../src/semantic/type-registry.js';
import type {
  TypeDeclaration,
  StructDefinition,
  EnumDefinition,
  ArrayDefinition,
  SubrangeDefinition,
  TypeReference,
  EnumMember,
  VarDeclaration,
  ArrayDimension,
  LiteralExpression,
} from '../../src/frontend/ast.js';

const createSourceSpan = () => ({
  file: '',
  startLine: 1,
  endLine: 1,
  startCol: 1,
  endCol: 1,
});

const createLiteral = (value: number): LiteralExpression => ({
  kind: 'LiteralExpression',
  sourceSpan: createSourceSpan(),
  literalType: 'INT',
  value,
  rawValue: String(value),
});

const createTypeRef = (name: string): TypeReference => ({
  kind: 'TypeReference',
  sourceSpan: createSourceSpan(),
  name,
  isReference: false,
});

const createEnumMember = (name: string, value?: number): EnumMember => ({
  kind: 'EnumMember',
  sourceSpan: createSourceSpan(),
  name,
  ...(value !== undefined ? { value: createLiteral(value) } : {}),
});

const createVarDecl = (name: string, typeName: string): VarDeclaration => ({
  kind: 'VarDeclaration',
  sourceSpan: createSourceSpan(),
  names: [name],
  type: createTypeRef(typeName),
});

const createArrayDim = (start: number, end: number): ArrayDimension => ({
  kind: 'ArrayDimension',
  sourceSpan: createSourceSpan(),
  start: createLiteral(start),
  end: createLiteral(end),
});

describe('TypeCodeGenerator', () => {
  describe('mapTypeToCpp', () => {
    it('should map elementary types to C++ types', () => {
      const generator = new TypeCodeGenerator();
      expect(generator.mapTypeToCpp('BOOL')).toBe('BOOL_t');
      expect(generator.mapTypeToCpp('INT')).toBe('INT_t');
      expect(generator.mapTypeToCpp('REAL')).toBe('REAL_t');
      expect(generator.mapTypeToCpp('DINT')).toBe('DINT_t');
      expect(generator.mapTypeToCpp('STRING')).toBe('IECString<254>');
    });

    it('should be case-insensitive for elementary types', () => {
      const generator = new TypeCodeGenerator();
      expect(generator.mapTypeToCpp('int')).toBe('INT_t');
      expect(generator.mapTypeToCpp('Bool')).toBe('BOOL_t');
    });

    it('should preserve user-defined type names', () => {
      const generator = new TypeCodeGenerator();
      expect(generator.mapTypeToCpp('MyStruct')).toBe('MyStruct');
      expect(generator.mapTypeToCpp('TrafficLight')).toBe('TrafficLight');
    });
  });

  describe('generateTypes', () => {
    it('should return empty string for no types', () => {
      const generator = new TypeCodeGenerator();
      const result = generator.generateTypes([]);
      expect(result).toBe('');
    });

    it('should generate type alias', () => {
      const generator = new TypeCodeGenerator();
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'MyInt',
        definition: createTypeRef('INT'),
      };

      const result = generator.generateTypes([type]);
      expect(result).toContain('using MyInt = INT_t;');
    });

    it('should generate struct type', () => {
      const generator = new TypeCodeGenerator();
      const structDef: StructDefinition = {
        kind: 'StructDefinition',
        sourceSpan: createSourceSpan(),
        fields: [createVarDecl('x', 'INT'), createVarDecl('y', 'REAL')],
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'Point',
        definition: structDef,
      };

      const result = generator.generateTypes([type]);
      expect(result).toContain('struct Point {');
      expect(result).toContain('INT_t x');
      expect(result).toContain('REAL_t y');
      expect(result).toContain('};');
    });

    it('should generate simple enum type', () => {
      const generator = new TypeCodeGenerator();
      const enumDef: EnumDefinition = {
        kind: 'EnumDefinition',
        sourceSpan: createSourceSpan(),
        members: [
          createEnumMember('RED'),
          createEnumMember('YELLOW'),
          createEnumMember('GREEN'),
        ],
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'TrafficLight',
        definition: enumDef,
      };

      const result = generator.generateTypes([type]);
      expect(result).toContain('enum class TrafficLight');
      expect(result).toContain('RED');
      expect(result).toContain('YELLOW');
      expect(result).toContain('GREEN');
    });

    it('should generate typed enum with explicit values', () => {
      const generator = new TypeCodeGenerator();
      const enumDef: EnumDefinition = {
        kind: 'EnumDefinition',
        sourceSpan: createSourceSpan(),
        baseType: createTypeRef('INT'),
        members: [
          createEnumMember('IDLE', 0),
          createEnumMember('RUNNING', 1),
          createEnumMember('STOPPED', 2),
        ],
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'State',
        definition: enumDef,
      };

      const result = generator.generateTypes([type]);
      expect(result).toContain('enum class State : INT_t');
      expect(result).toContain('IDLE = 0');
      expect(result).toContain('RUNNING = 1');
      expect(result).toContain('STOPPED = 2');
    });

    it('should generate array type', () => {
      const generator = new TypeCodeGenerator();
      const arrayDef: ArrayDefinition = {
        kind: 'ArrayDefinition',
        sourceSpan: createSourceSpan(),
        dimensions: [createArrayDim(0, 9)],
        elementType: createTypeRef('INT'),
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'IntArray',
        definition: arrayDef,
      };

      const result = generator.generateTypes([type]);
      // Uses Array1D with preserved bounds (0..9)
      expect(result).toContain('using IntArray = Array1D<INT_t, 0, 9>;');
    });

    it('should generate multi-dimensional array type', () => {
      const generator = new TypeCodeGenerator();
      const arrayDef: ArrayDefinition = {
        kind: 'ArrayDefinition',
        sourceSpan: createSourceSpan(),
        dimensions: [createArrayDim(0, 2), createArrayDim(0, 2)],
        elementType: createTypeRef('REAL'),
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'Matrix',
        definition: arrayDef,
      };

      const result = generator.generateTypes([type]);
      // Uses Array2D with preserved bounds for both dimensions
      expect(result).toContain('using Matrix = Array2D<REAL_t, 0, 2, 0, 2>;');
    });

    it('should generate non-zero-based array type', () => {
      const generator = new TypeCodeGenerator();
      const arrayDef: ArrayDefinition = {
        kind: 'ArrayDefinition',
        sourceSpan: createSourceSpan(),
        dimensions: [createArrayDim(3, 7)],
        elementType: createTypeRef('INT'),
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'OffsetArray',
        definition: arrayDef,
      };

      const result = generator.generateTypes([type]);
      // Uses Array1D with preserved non-zero bounds (3..7)
      expect(result).toContain('using OffsetArray = Array1D<INT_t, 3, 7>;');
    });

    it('should generate subrange type', () => {
      const generator = new TypeCodeGenerator();
      const subrangeDef: SubrangeDefinition = {
        kind: 'SubrangeDefinition',
        sourceSpan: createSourceSpan(),
        baseType: createTypeRef('INT'),
        lowerBound: createLiteral(0),
        upperBound: createLiteral(100),
      };
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'Percentage',
        definition: subrangeDef,
      };

      const result = generator.generateTypes([type]);
      expect(result).toContain('using Percentage = INT_t;');
      expect(result).toContain('constexpr INT_t Percentage_MIN = 0;');
      expect(result).toContain('constexpr INT_t Percentage_MAX = 100;');
    });
  });

  describe('generateFromRegistry', () => {
    it('should generate types from registry in dependency order', () => {
      const registry = new TypeRegistry();

      const innerStruct: StructDefinition = {
        kind: 'StructDefinition',
        sourceSpan: createSourceSpan(),
        fields: [createVarDecl('value', 'INT')],
      };
      const innerType: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'Inner',
        definition: innerStruct,
      };

      const outerStruct: StructDefinition = {
        kind: 'StructDefinition',
        sourceSpan: createSourceSpan(),
        fields: [createVarDecl('inner', 'Inner')],
      };
      const outerType: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'Outer',
        definition: outerStruct,
      };

      registry.registerTypes([outerType, innerType]);

      const generator = new TypeCodeGenerator();
      const result = generator.generateFromRegistry(registry);

      const innerIndex = result.indexOf('struct Inner');
      const outerIndex = result.indexOf('struct Outer');
      expect(innerIndex).toBeLessThan(outerIndex);
    });
  });

  describe('generateTypeCode helper', () => {
    it('should generate type code from registry', () => {
      const registry = new TypeRegistry();
      const type: TypeDeclaration = {
        kind: 'TypeDeclaration',
        sourceSpan: createSourceSpan(),
        name: 'MyInt',
        definition: createTypeRef('INT'),
      };
      registry.registerType(type);

      const result = generateTypeCode(registry);
      expect(result).toContain('using MyInt = INT_t;');
    });
  });
});
