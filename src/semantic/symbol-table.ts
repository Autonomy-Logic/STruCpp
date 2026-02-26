/**
 * STruC++ Symbol Table
 *
 * Manages symbol tables for name resolution during semantic analysis.
 * Supports nested scopes and different symbol kinds.
 */

import type {
  FunctionDeclaration,
  FunctionBlockDeclaration,
  ProgramDeclaration,
  TypeDeclaration,
  VarDeclaration,
  IECType,
} from "../frontend/ast.js";

// =============================================================================
// Symbol Types
// =============================================================================

/**
 * Kind of symbol
 */
export type SymbolKind =
  | "variable"
  | "constant"
  | "function"
  | "functionBlock"
  | "program"
  | "type"
  | "enumValue";

/**
 * Base interface for all symbols
 */
export interface BaseSymbol {
  /** Symbol name */
  name: string;

  /** Kind of symbol */
  kind: SymbolKind;

  /** Resolved type (if applicable) */
  type?: IECType;
}

/**
 * Variable symbol
 */
export interface VariableSymbol extends BaseSymbol {
  kind: "variable";
  declaration: VarDeclaration;
  isInput: boolean;
  isOutput: boolean;
  isInOut: boolean;
  isExternal: boolean;
  isGlobal: boolean;
  isRetain: boolean;
  address?: string | undefined;
}

/**
 * Constant symbol
 */
export interface ConstantSymbol extends BaseSymbol {
  kind: "constant";
  declaration: VarDeclaration;
  value?: unknown;
}

/**
 * Function symbol
 */
export interface FunctionSymbol extends BaseSymbol {
  kind: "function";
  declaration: FunctionDeclaration;
  returnType: IECType;
  parameters: VariableSymbol[];
}

/**
 * Function block symbol
 */
export interface FunctionBlockSymbol extends BaseSymbol {
  kind: "functionBlock";
  declaration: FunctionBlockDeclaration;
  inputs: VariableSymbol[];
  outputs: VariableSymbol[];
  inouts: VariableSymbol[];
  locals: VariableSymbol[];
}

/**
 * Program symbol
 */
export interface ProgramSymbol extends BaseSymbol {
  kind: "program";
  declaration: ProgramDeclaration;
  variables: VariableSymbol[];
}

/**
 * Type symbol
 */
export interface TypeSymbol extends BaseSymbol {
  kind: "type";
  declaration: TypeDeclaration;
  resolvedType: IECType;
}

/**
 * Enum value symbol
 */
export interface EnumValueSymbol extends BaseSymbol {
  kind: "enumValue";
  enumType: string;
  value: number;
}

/**
 * Union of all symbol types
 */
export type AnySymbol =
  | VariableSymbol
  | ConstantSymbol
  | FunctionSymbol
  | FunctionBlockSymbol
  | ProgramSymbol
  | TypeSymbol
  | EnumValueSymbol;

// =============================================================================
// Symbol Table
// =============================================================================

/**
 * Error thrown when a symbol is not found
 */
export class SymbolNotFoundError extends Error {
  constructor(
    public readonly symbolName: string,
    public readonly scope: string,
  ) {
    super(`Symbol '${symbolName}' not found in scope '${scope}'`);
    this.name = "SymbolNotFoundError";
  }
}

/**
 * Error thrown when a symbol is already defined
 */
export class DuplicateSymbolError extends Error {
  constructor(
    public readonly symbolName: string,
    public readonly scope: string,
  ) {
    super(`Symbol '${symbolName}' already defined in scope '${scope}'`);
    this.name = "DuplicateSymbolError";
  }
}

/**
 * A single scope in the symbol table hierarchy.
 */
export class Scope {
  private symbols: Map<string, AnySymbol> = new Map();

  constructor(
    public readonly name: string,
    public readonly parent?: Scope,
  ) {}

  /**
   * Define a symbol in this scope.
   * @throws DuplicateSymbolError if symbol already exists in this scope
   */
  define(symbol: AnySymbol): void {
    const normalizedName = symbol.name.toUpperCase();
    if (this.symbols.has(normalizedName)) {
      throw new DuplicateSymbolError(symbol.name, this.name);
    }
    this.symbols.set(normalizedName, symbol);
  }

  /**
   * Look up a symbol in this scope only (not parent scopes).
   */
  lookupLocal(name: string): AnySymbol | undefined {
    return this.symbols.get(name.toUpperCase());
  }

  /**
   * Look up a symbol in this scope and parent scopes.
   */
  lookup(name: string): AnySymbol | undefined {
    const normalizedName = name.toUpperCase();
    const symbol = this.symbols.get(normalizedName);
    if (symbol !== undefined) {
      return symbol;
    }
    if (this.parent !== undefined) {
      return this.parent.lookup(normalizedName);
    }
    return undefined;
  }

  /**
   * Check if a symbol exists in this scope only.
   */
  hasLocal(name: string): boolean {
    return this.symbols.has(name.toUpperCase());
  }

  /**
   * Check if a symbol exists in this scope or parent scopes.
   */
  has(name: string): boolean {
    return this.lookup(name) !== undefined;
  }

  /**
   * Get all symbols in this scope.
   */
  getAllSymbols(): AnySymbol[] {
    return Array.from(this.symbols.values());
  }

  /**
   * Get all symbols of a specific kind.
   */
  getSymbolsByKind<K extends SymbolKind>(
    kind: K,
  ): Extract<AnySymbol, { kind: K }>[] {
    return this.getAllSymbols().filter(
      (s): s is Extract<AnySymbol, { kind: K }> => s.kind === kind,
    );
  }
}

/**
 * Global symbol tables for a compilation unit.
 */
export class SymbolTables {
  /** Global scope containing types, functions, FBs, programs */
  public readonly globalScope: Scope;

  /** Map of function names to their local scopes */
  private functionScopes: Map<string, Scope> = new Map();

  /** Map of function block names to their local scopes */
  private fbScopes: Map<string, Scope> = new Map();

  /** Map of program names to their local scopes */
  private programScopes: Map<string, Scope> = new Map();

  /** Map of "FBNAME.METHODNAME" to their local scopes (parent = FB scope) */
  private methodScopes: Map<string, Scope> = new Map();

  constructor() {
    this.globalScope = new Scope("global");
    this.initializeBuiltinTypes();
  }

  /**
   * Initialize built-in IEC types.
   */
  private initializeBuiltinTypes(): void {
    const builtinTypes = [
      "BOOL",
      "BYTE",
      "WORD",
      "DWORD",
      "LWORD",
      "SINT",
      "INT",
      "DINT",
      "LINT",
      "USINT",
      "UINT",
      "UDINT",
      "ULINT",
      "REAL",
      "LREAL",
      "TIME",
      "DATE",
      "TIME_OF_DAY",
      "TOD",
      "DATE_AND_TIME",
      "DT",
      "STRING",
      "WSTRING",
    ];

    for (const typeName of builtinTypes) {
      this.globalScope.define({
        name: typeName,
        kind: "type",
        declaration: undefined as unknown as TypeDeclaration,
        resolvedType: { typeKind: "elementary", name: typeName, sizeBits: 0 },
      } as TypeSymbol);
    }
  }

  /**
   * Create a new scope for a function.
   */
  createFunctionScope(name: string): Scope {
    const scope = new Scope(name, this.globalScope);
    this.functionScopes.set(name.toUpperCase(), scope);
    return scope;
  }

  /**
   * Create a new scope for a function block.
   */
  createFBScope(name: string): Scope {
    const scope = new Scope(name, this.globalScope);
    this.fbScopes.set(name.toUpperCase(), scope);
    return scope;
  }

  /**
   * Create a new scope for a program.
   */
  createProgramScope(name: string): Scope {
    const scope = new Scope(name, this.globalScope);
    this.programScopes.set(name.toUpperCase(), scope);
    return scope;
  }

  /**
   * Get the scope for a function.
   */
  getFunctionScope(name: string): Scope | undefined {
    return this.functionScopes.get(name.toUpperCase());
  }

  /**
   * Get the scope for a function block.
   */
  getFBScope(name: string): Scope | undefined {
    return this.fbScopes.get(name.toUpperCase());
  }

  /**
   * Get the scope for a program.
   */
  getProgramScope(name: string): Scope | undefined {
    return this.programScopes.get(name.toUpperCase());
  }

  /**
   * Create a new scope for a method within a function block.
   * The method scope's parent is the FB scope, giving the lookup chain:
   * method locals → FB members → globals.
   */
  createMethodScope(fbName: string, methodName: string): Scope {
    const fbScope = this.getFBScope(fbName);
    const parent = fbScope ?? this.globalScope;
    const key = `${fbName.toUpperCase()}.${methodName.toUpperCase()}`;
    const scope = new Scope(`${fbName}.${methodName}`, parent);
    this.methodScopes.set(key, scope);
    return scope;
  }

  /**
   * Get the scope for a method within a function block.
   */
  getMethodScope(fbName: string, methodName: string): Scope | undefined {
    const key = `${fbName.toUpperCase()}.${methodName.toUpperCase()}`;
    return this.methodScopes.get(key);
  }

  /**
   * Look up a type by name.
   */
  lookupType(name: string): TypeSymbol | undefined {
    const symbol = this.globalScope.lookup(name);
    if (symbol?.kind === "type") {
      return symbol;
    }
    return undefined;
  }

  /**
   * Look up a function by name.
   */
  lookupFunction(name: string): FunctionSymbol | undefined {
    const symbol = this.globalScope.lookup(name);
    if (symbol?.kind === "function") {
      return symbol;
    }
    return undefined;
  }

  /**
   * Look up a function block by name.
   */
  lookupFunctionBlock(name: string): FunctionBlockSymbol | undefined {
    const symbol = this.globalScope.lookup(name);
    if (symbol?.kind === "functionBlock") {
      return symbol;
    }
    return undefined;
  }

  /**
   * Look up a program by name.
   */
  lookupProgram(name: string): ProgramSymbol | undefined {
    const symbol = this.globalScope.lookup(name);
    if (symbol?.kind === "program") {
      return symbol;
    }
    return undefined;
  }
}
