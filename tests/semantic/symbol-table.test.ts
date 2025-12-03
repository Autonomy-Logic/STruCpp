/**
 * STruC++ Symbol Table Tests
 *
 * Tests for the symbol table implementation used during semantic analysis.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Scope,
  SymbolTables,
  DuplicateSymbolError,
  type VariableSymbol,
  type TypeSymbol,
} from '../../src/semantic/symbol-table.js';

describe('Scope', () => {
  let scope: Scope;

  beforeEach(() => {
    scope = new Scope('test');
  });

  describe('define', () => {
    it('should define a symbol', () => {
      const symbol: VariableSymbol = {
        name: 'myVar',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      scope.define(symbol);
      expect(scope.has('myVar')).toBe(true);
    });

    it('should throw on duplicate symbol', () => {
      const symbol: VariableSymbol = {
        name: 'myVar',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      scope.define(symbol);
      expect(() => scope.define(symbol)).toThrow(DuplicateSymbolError);
    });

    it('should be case-insensitive', () => {
      const symbol: VariableSymbol = {
        name: 'MyVar',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      scope.define(symbol);
      expect(scope.has('myvar')).toBe(true);
      expect(scope.has('MYVAR')).toBe(true);
    });
  });

  describe('lookup', () => {
    it('should find defined symbols', () => {
      const symbol: VariableSymbol = {
        name: 'myVar',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      scope.define(symbol);
      const found = scope.lookup('myVar');
      expect(found).toBe(symbol);
    });

    it('should return undefined for unknown symbols', () => {
      const found = scope.lookup('unknown');
      expect(found).toBeUndefined();
    });

    it('should search parent scopes', () => {
      const parentScope = new Scope('parent');
      const childScope = new Scope('child', parentScope);

      const symbol: VariableSymbol = {
        name: 'parentVar',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      parentScope.define(symbol);
      const found = childScope.lookup('parentVar');
      expect(found).toBe(symbol);
    });
  });

  describe('lookupLocal', () => {
    it('should not search parent scopes', () => {
      const parentScope = new Scope('parent');
      const childScope = new Scope('child', parentScope);

      const symbol: VariableSymbol = {
        name: 'parentVar',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      parentScope.define(symbol);
      const found = childScope.lookupLocal('parentVar');
      expect(found).toBeUndefined();
    });
  });

  describe('getAllSymbols', () => {
    it('should return all symbols in scope', () => {
      const symbol1: VariableSymbol = {
        name: 'var1',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      const symbol2: VariableSymbol = {
        name: 'var2',
        kind: 'variable',
        declaration: undefined as never,
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: false,
        isRetain: false,
      };

      scope.define(symbol1);
      scope.define(symbol2);

      const symbols = scope.getAllSymbols();
      expect(symbols).toHaveLength(2);
    });
  });
});

describe('SymbolTables', () => {
  let tables: SymbolTables;

  beforeEach(() => {
    tables = new SymbolTables();
  });

  describe('initialization', () => {
    it('should have built-in types', () => {
      expect(tables.lookupType('INT')).toBeDefined();
      expect(tables.lookupType('BOOL')).toBeDefined();
      expect(tables.lookupType('REAL')).toBeDefined();
      expect(tables.lookupType('STRING')).toBeDefined();
    });
  });

  describe('createFunctionScope', () => {
    it('should create a function scope', () => {
      const scope = tables.createFunctionScope('MyFunc');
      expect(scope).toBeDefined();
      expect(scope.name).toBe('MyFunc');
    });

    it('should retrieve created scope', () => {
      tables.createFunctionScope('MyFunc');
      const scope = tables.getFunctionScope('MyFunc');
      expect(scope).toBeDefined();
    });
  });

  describe('createProgramScope', () => {
    it('should create a program scope', () => {
      const scope = tables.createProgramScope('Main');
      expect(scope).toBeDefined();
      expect(scope.name).toBe('Main');
    });
  });

  describe('createFBScope', () => {
    it('should create a function block scope', () => {
      const scope = tables.createFBScope('Counter');
      expect(scope).toBeDefined();
      expect(scope.name).toBe('Counter');
    });
  });
});
