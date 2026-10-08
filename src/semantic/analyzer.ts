// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Semantic Analyzer
 *
 * Coordinates semantic analysis passes over the AST.
 * Builds symbol tables, performs type checking, and validates IEC semantics.
 */

import type {
  AccessStep,
  ASTNode,
  Argument,
  AssignmentStatement,
  ArrayLiteralExpression,
  AssertCall,
  CompilationUnit,
  ElementaryType,
  EnumType,
  Expression,
  FunctionBlockDeclaration,
  FunctionCallExpression,
  LiteralExpression,
  MethodDeclaration,
  MockFunctionStatement,
  TypeDeclaration,
  TypeDefinition,
  TypeReference,
  VarBlock,
  VarDeclaration,
  VariableExpression,
  Statement,
  TestFile,
  TestStatement,
  Visibility,
} from "../frontend/ast.js";
import type { CompileError, SourceSpan } from "../types.js";
import { StdFunctionRegistry } from "./std-function-registry.js";
import { Scope, SymbolTables } from "./symbol-table.js";
import type {
  FunctionBlockSymbol,
  FunctionSymbol,
  VariableSymbol,
} from "./symbol-table.js";
import { TypeChecker } from "./type-checker.js";
import {
  arrayDimSize,
  arrayElementTypeName,
  arrayTotalSize,
  buildEnumMemberMap,
  describeType,
  ELEMENTARY_TYPES,
  getBitAccessWidth,
  isAnyDescriptorType,
  isVarInfoType,
  isDeclarableGenericType,
  isStandardPartialAccessType,
  parsePartialAccess,
  resolveArrayElementType,
  resolveArrayShape,
  resolveArrayShapeByName,
  resolveFieldType,
  type ArrayShape,
  type EnumMemberEntry,
  TYPE_CATEGORIES,
  TYPE_CLASS_MEMBERS,
  systemTypeClassMember,
} from "./type-utils.js";
import {
  isEnArgument,
  isEnEnoArgument,
  isEnoArgument,
  stripEnEno,
  walkAST,
} from "../ast-utils.js";
import {
  exactIntegerLiteralValue,
  IEC_INTEGER_MAX,
  IEC_INTEGER_MIN,
} from "../literal-utils.js";
import {
  describeStdParams,
  stdParamIndex,
  stdParamNameAt,
  type StdSignature,
} from "./std-function-registry.js";

// =============================================================================
// Located Variable Address Parsing
// =============================================================================

/**
 * Parsed components of a located variable address.
 */
interface ParsedAddress {
  area: "I" | "Q" | "M"; // Input, Output, Memory
  size: "X" | "B" | "W" | "D" | "L"; // Bit, Byte, Word, DWord, LWord
  byteIndex: number;
  bitIndex: number;
}

/**
 * Parse a located variable address string.
 * @param address Address string like "%IX0.0" or "%QW10"
 * @returns Parsed address components or null if invalid
 */
function parseAddress(address: string): ParsedAddress | null {
  // Pattern: %<area><size><byte_index>.<bit_index>
  // Examples: %IX0.0, %QX2.3, %IW10, %QW5, %MW100, %MD50
  const match = address.match(/^%([IQM])([XBWDL]?)(\d+)(?:\.(\d+))?$/i);
  if (!match) {
    return null;
  }

  const area = match[1]!.toUpperCase() as "I" | "Q" | "M";
  let size = match[2]?.toUpperCase() as "X" | "B" | "W" | "D" | "L" | undefined;
  const byteIndex = parseInt(match[3]!, 10);
  const bitIndex = match[4] ? parseInt(match[4], 10) : 0;

  // Default size to X (bit) if not specified and bit index is present
  if (!size) {
    size = "X";
  }

  return { area, size, byteIndex, bitIndex };
}

/**
 * Variable-block kinds that may carry a physical location ("AT %...").
 *
 * IEC 61131-3 allows located declarations in VAR and VAR_GLOBAL only — interface
 * sections describe a call contract, not hardware. The editor enforces the same
 * set at edit and load time (DISALLOWED_LOCATION_CLASSES, GitHub issue #904), so
 * enforcing it here keeps hand-written and editor-authored ST consistent.
 *
 * VAR_EXTERNAL is the sharpest case: it references storage a CONFIGURATION
 * VAR_GLOBAL owns, codegen emits it as `GlobalVar<T>*` and collects located
 * variables from local declarations only, so an address written there is silently
 * dropped while also duplicating the address the global legitimately claims.
 */
const LOCATABLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "VAR",
  "VAR_GLOBAL",
]);

/**
 * The bank a located address lives in: its area and its size class.
 *
 * Two addresses can only collide within one bank. The image is not flat memory
 * -- each size class has its own array in the runtime (bool_memory[][],
 * int_memory[], dint_memory[], lint_memory[]) and the index selects an element
 * of THAT array -- so %MW0 and %MD0 name unrelated storage rather than
 * overlapping bytes.
 */
function bankKey(parsed: ParsedAddress): string {
  return `${parsed.area}${parsed.size}`;
}

/**
 * The first slot a located address names, as a linear index into its bank.
 *
 * Bit addresses linearise as `byte*8 + bit` so that consecutive bits are
 * consecutive slots across a byte boundary (%IX0.7 and %IX1.0 are slots 7 and
 * 8). Every other size class indexes its array directly.
 */
function firstSlot(parsed: ParsedAddress): number {
  return parsed.size === "X"
    ? parsed.byteIndex * 8 + parsed.bitIndex
    : parsed.byteIndex;
}

/**
 * Elementary types that may sit at an address of the given size.
 *
 * For an array, this is checked against the ELEMENT type: `ARRAY [0..66] OF
 * WORD AT %MW60` occupies 67 consecutive WORD slots, so what has to fit the
 * `W` size class is WORD, not the array as a whole.
 */
function getCompatibleTypes(size: "X" | "B" | "W" | "D" | "L"): string[] {
  switch (size) {
    case "X":
      return ["BOOL"];
    case "B":
      return ["BYTE", "USINT", "SINT"];
    case "W":
      return ["WORD", "INT", "UINT"];
    case "D":
      return ["DWORD", "DINT", "UDINT", "REAL"];
    case "L":
      return ["LWORD", "LINT", "ULINT", "LREAL"];
  }
}

/**
 * What a located declaration actually occupies in the process image.
 *
 * A plain variable takes one slot and must itself fit the size class. An array
 * takes one slot PER ELEMENT, laid out consecutively from the declared address,
 * and it is the element type that must fit -- `HR AT %MW60 : ARRAY [0..66] OF
 * WORD` means %MW60 through %MW126, each a WORD (openplc-editor#565).
 *
 * Arrays are supported here because nothing in the descriptor table stands in
 * the way: it is flat, one `{area, size, index, pointer}` row per slot, so an
 * array is N rows rather than a new mechanism. (The pre-strucpp toolchain
 * refused these because MatIEC could not express them at all; that constraint
 * left with MatIEC.)
 *
 * Returns a `reason` instead of a shape for the array forms that have no
 * meaningful linear layout. Each is rejected with its own sentence rather than
 * falling through to the type-compatibility error, which would otherwise
 * report the compiler's internal `__INLINE_ARRAY_<T>` spelling at the user.
 */
type LocatedShape =
  | { elementTypeName: string; slotCount: number; reason?: undefined }
  | { reason: string; elementTypeName?: undefined; slotCount?: undefined };

function resolveLocatedShape(
  type: TypeReference,
  ast: CompilationUnit,
): LocatedShape {
  // A variable-length array carries no bounds anywhere — the AST builder
  // records only its rank, in the synthetic `__VLA_<rank>_<T>` name — so
  // `resolveArrayShape` cannot see it and it would otherwise fall through to
  // the scalar branch and be reported as an incompatible type named
  // `__VLA_1D_WORD`. Catch it here so the message says what is actually wrong.
  if (type.name.toUpperCase().startsWith("__VLA_")) {
    return {
      reason: `its length is not known at compile time. A located array needs constant bounds, because each element is bound to a fixed address before the program runs`,
    };
  }

  const shape: ArrayShape | undefined = resolveArrayShape(type, ast);
  if (!shape) {
    // Not an array: the declaration is the slot, and its own type is what
    // has to fit the size class.
    return { elementTypeName: type.name, slotCount: 1 };
  }

  if (shape.dims.length !== 1) {
    return {
      reason: `a ${shape.dims.length}-dimensional array has no single linear run of addresses to occupy. Declare it unlocated, or use a one-dimensional array`,
    };
  }

  const dim = shape.dims[0];
  if (!dim) {
    // `ARRAY [*]` or a bound that isn't a compile-time constant. The runtime
    // binds each element to a fixed address, so the count has to be known
    // when the descriptor table is emitted -- not when the program runs.
    return {
      reason: `its length is not known at compile time. A located array needs constant bounds, because each element is bound to a fixed address before the program runs`,
    };
  }

  const slotCount = arrayDimSize(dim);
  if (slotCount === undefined || slotCount <= 0) {
    return { reason: `its declared bounds are empty` };
  }

  return { elementTypeName: shape.elementTypeName, slotCount };
}

// =============================================================================
// Analysis Result
// =============================================================================

/**
 * Result of semantic analysis.
 */
export interface SemanticAnalysisResult {
  /** Whether analysis was successful (no errors) */
  success: boolean;

  /** Symbol tables built during analysis */
  symbolTables: SymbolTables;

  /** Errors found during analysis */
  errors: CompileError[];

  /** Warnings found during analysis */
  warnings: CompileError[];
}

// =============================================================================
// Semantic Analyzer
// =============================================================================

/**
 * Semantic analyzer for IEC 61131-3 programs.
 *
 * Performs the following passes:
 * 1. Symbol table building - Index all declarations
 * 2. Type checking - Verify type correctness
 * 3. Semantic validation - Check IEC semantic rules
 */
/**
 * Why an `AT` operand cannot be compiled, in the words the user needs.
 *
 * Every place that reads an `AT` operand — POU-local `VAR`, top-level
 * `VAR_GLOBAL`, `CONFIGURATION VAR_GLOBAL` — reaches the same two dead ends, so
 * the wording lives here rather than three times over. An alias reported as an
 * "invalid address format" sends the user looking for a typo in something that
 * is spelled correctly, and that is exactly what happened in the CONFIGURATION
 * path while the POU path had already been taught better.
 */
export function unusableAddressMessage(decl: VarDeclaration): string {
  if (decl.addressKind === "alias") {
    // The parser accepts `AT Motor_Start` so the OpenPLC Editor can read its own
    // declarations with this parser. A compile is a different matter: an alias
    // names an I/O channel the editor knows about and the compiler does not, so
    // it has to have been resolved to a real address before we get here.
    return (
      `'${decl.address}' is an I/O alias, not an address, and it was not resolved before compiling. ` +
      `Check that '${decl.address}' still names a channel in the device configuration; ` +
      `a variable bound to an alias that no longer exists is left unlocated.`
    );
  }
  return `Invalid address format: ${decl.address}`;
}

/**
 * Information about a located variable for validation.
 */
interface LocatedVarInfo {
  name: string;
  address: string;
  parsed: ParsedAddress;
  typeName: string;
  /** "configuration" covers CONFIGURATION VAR_GLOBAL ... AT. Those live in
   *  ast.configurations[].varBlocks rather than ast.globalVarBlocks, so they are
   *  gathered during validation (collectConfigurationLocatedVars) instead of
   *  during symbol building. */
  scopeType: "program" | "function" | "functionBlock" | "configuration";
  scopeName: string;
  declaration: VarDeclaration;
}

/**
 * Context for undeclared variable checking within a POU scope.
 */
interface UndeclaredVarContext {
  functionName?: string;
  fbName?: string;
  methodName?: string;
  propertyName?: string;
}

/** One parameter of a callee, in the order it was declared. */
interface InOutSlot {
  name: string;
  kind: "input" | "inout" | "output";
  type: string;
}

/** What a call invokes, as a diagnostic names it, and its parameters. */
interface Callee {
  what: string;
  slots: InOutSlot[];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function slot(name: string, kind: InOutSlot["kind"], type: string): InOutSlot {
  return { name: name.toUpperCase(), kind, type: type.toUpperCase() };
}

/** How a partial access reads in a diagnostic: "Bit", "Byte", "Word", "Dword". */
function partLabel(part: { resultType: string }): string {
  return part.resultType === "BOOL"
    ? "Bit"
    : part.resultType.charAt(0) + part.resultType.slice(1).toLowerCase();
}

export class SemanticAnalyzer {
  private symbolTables: SymbolTables;
  private typeChecker: TypeChecker;
  private stdRegistry = new StdFunctionRegistry();
  private enumMemberMap: Map<string, EnumMemberEntry> = new Map();
  private errors: CompileError[] = [];
  private warnings: CompileError[] = [];

  /** Track all located variables for duplicate detection */
  private locatedVars: LocatedVarInfo[] = [];

  constructor() {
    this.symbolTables = new SymbolTables();
    this.typeChecker = new TypeChecker(this.symbolTables, this.stdRegistry);
  }

  /**
   * Analyze a compilation unit.
   * @param ast The compilation unit to analyze
   * @param existingSymbolTables Optional pre-populated symbol tables (e.g., with library symbols)
   */
  analyze(
    ast: CompilationUnit,
    existingSymbolTables?: SymbolTables,
  ): SemanticAnalysisResult {
    this.errors = [];
    this.warnings = [];
    this.locatedVars = [];

    // Use provided symbol tables (with library symbols pre-registered) or create new ones
    if (existingSymbolTables) {
      this.symbolTables = existingSymbolTables;
      this.typeChecker = new TypeChecker(this.symbolTables, this.stdRegistry);
    }

    // Pass 1: Build symbol tables
    this.buildSymbolTables(ast);

    // Standard calls are read by position from here on.
    this.bindStdFunctionArguments([ast]);

    // Initial values hold constants' values, not references to them.
    this.foldConstantInitializers(ast);

    this.checkGlobalNamesAgainstStdFunctions(ast);

    // BOOL#<n> is 0 or 1 (IEC 61131-3 §6.3.2).
    walkAST(ast, (node) => {
      if (node.kind !== "LiteralExpression") return;
      const lit = node as LiteralExpression;
      if (lit.typePrefix !== "BOOL" || lit.value === 0 || lit.value === 1) {
        return;
      }
      this.addError(
        `'${lit.rawValue}' is not a BOOL: write BOOL#0, BOOL#1, BOOL#TRUE or BOOL#FALSE`,
        lit.sourceSpan.startLine,
        lit.sourceSpan.startCol,
        lit.sourceSpan.file,
      );
    });

    // Reported before the gates below so a type error in any merged source cannot hide
    // an undefined type — and excluded from them, so the reverse cannot happen either.
    const errorsBeforeTypeReferences = this.errors.length;
    this.validateTypeReferences(ast);
    const typeReferenceErrors = this.errors.length - errorsBeforeTypeReferences;

    // Pass 2: Type checking
    if (this.errors.length - typeReferenceErrors === 0) {
      const typeResult = this.typeChecker.check(ast);
      this.errors.push(...typeResult.errors);
      this.warnings.push(...typeResult.warnings);
    }

    // Pass 3: Semantic validation
    if (this.errors.length - typeReferenceErrors === 0) {
      this.validateSemantics(ast);
    }

    return {
      success: this.errors.length === 0,
      symbolTables: this.symbolTables,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Resolve a type name to its registered type (preserves enum typeKind)
   * or fall back to a generic elementary type for unknown/user-defined types.
   */
  private resolveVarType(typeName: string): EnumType | ElementaryType {
    const typeSymbol = this.symbolTables.globalScope.lookup(typeName);
    return typeSymbol?.kind === "type" && typeSymbol.resolvedType
      ? (typeSymbol.resolvedType as EnumType | ElementaryType)
      : { typeKind: "elementary" as const, name: typeName, sizeBits: 0 };
  }

  /**
   * Which generic families an argument's type may be passed to. An array takes
   * its element's families, so `ARRAY OF DINT` reaches an `ANY_INT` pin and
   * `ARRAY OF REAL` does not. Undefined when a generic accepts it at all.
   */
  private genericCategoriesFor(
    typeName: string,
  ): readonly string[] | undefined {
    const upper = typeName.toUpperCase();
    const direct = TYPE_CATEGORIES[upper];
    if (direct) return direct;

    const element = arrayElementTypeName(upper);
    if (element) {
      const inner = TYPE_CATEGORIES[element];
      return inner
        ? [...inner, "ANY_DERIVED"]
        : this.isKnownType(element)
          ? ["ANY", "ANY_DERIVED"]
          : undefined;
    }

    // A declared structure or enumeration.
    return this.isKnownType(upper) ? ["ANY", "ANY_DERIVED"] : undefined;
  }

  /**
   * Build symbol tables from the AST.
   */
  private buildSymbolTables(ast: CompilationUnit): void {
    // Register type declarations
    for (const typeDecl of ast.types) {
      try {
        // Use enum typeKind for EnumDefinition so CASE and type checks work correctly
        const resolvedType: EnumType | ElementaryType =
          typeDecl.definition.kind === "EnumDefinition"
            ? {
                typeKind: "enum" as const,
                name: typeDecl.name,
                values: typeDecl.definition.members.map((m) => m.name),
              }
            : {
                typeKind: "elementary" as const,
                name: typeDecl.name,
                sizeBits: 0,
              };
        this.symbolTables.globalScope.defineOrReplace({
          name: typeDecl.name,
          kind: "type",
          declaration: typeDecl,
          resolvedType,
        });

        // Surface each enum member as a separate `EnumValueSymbol`
        // in the global scope.  Type-checking uses the
        // `enumMemberMap` built below for resolution, but
        // autocomplete walks `scope.getAllSymbols()` — without
        // these entries, bare enum values (`Stopped`, `Running`, …)
        // never appear in the suggestion list even though the
        // language accepts them.  Skip names already claimed by a
        // real symbol (e.g. a global variable with the same
        // identifier) to avoid silently shadowing them.
        if (typeDecl.definition.kind === "EnumDefinition") {
          typeDecl.definition.members.forEach((member, index) => {
            if (this.symbolTables.globalScope.hasLocal(member.name)) return;
            this.symbolTables.globalScope.defineOrReplace({
              name: member.name,
              kind: "enumValue",
              enumType: typeDecl.name,
              // Ordinal default; explicit values (`MEMBER := 5`) are
              // resolved by the analyzer's expression pass elsewhere
              // and not consumed by autocomplete.
              value: index,
            });
          });
        }
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            typeDecl.sourceSpan.startLine,
            typeDecl.sourceSpan.startCol,
            typeDecl.sourceSpan.file,
          );
        }
      }
    }

    // Reverse lookup: enum member name → owning enum type.
    //
    // A library's enums count too — a program that imports one may name its
    // members directly. Listed after the project's, so a clash is reported as
    // ambiguous rather than resolving silently to the library.
    const enumDescriptors: Array<{ name: string; members: string[] }> =
      ast.types
        .filter((t) => t.definition.kind === "EnumDefinition")
        .map((t) => ({
          name: t.name,
          members:
            t.definition.kind === "EnumDefinition"
              ? t.definition.members.map((m) => m.name)
              : [],
        }));
    for (const sym of this.symbolTables.globalScope.getAllSymbols()) {
      if (sym.kind !== "type" || sym.resolvedType?.typeKind !== "enum")
        continue;
      const enumType = sym.resolvedType as EnumType;
      if (enumType.values.length === 0) continue;
      enumDescriptors.push({ name: enumType.name, members: enumType.values });
    }
    this.enumMemberMap = buildEnumMemberMap(enumDescriptors);

    // Register function declarations
    for (const funcDecl of ast.functions) {
      try {
        const returnType = this.resolveVarType(
          funcDecl.returnType.name.toUpperCase(),
        );
        this.symbolTables.globalScope.defineOrReplace({
          name: funcDecl.name,
          kind: "function",
          declaration: funcDecl,
          returnType,
          parameters: [],
        });

        // Create local scope for function
        const scope = this.symbolTables.createFunctionScope(funcDecl.name);
        this.buildVarBlockSymbols(
          funcDecl.varBlocks,
          scope,
          "function",
          funcDecl.name,
          false,
        );
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            funcDecl.sourceSpan.startLine,
            funcDecl.sourceSpan.startCol,
            funcDecl.sourceSpan.file,
          );
        }
      }
    }

    // Register function block declarations
    for (const fbDecl of ast.functionBlocks) {
      try {
        this.symbolTables.globalScope.defineOrReplace({
          name: fbDecl.name,
          kind: "functionBlock",
          declaration: fbDecl,
          inputs: [],
          outputs: [],
          inouts: [],
          locals: [],
        });

        // Create local scope for function block
        const scope = this.symbolTables.createFBScope(fbDecl.name);
        this.buildVarBlockSymbols(
          fbDecl.varBlocks,
          scope,
          "functionBlock",
          fbDecl.name,
          true,
        );

        // Create method scopes (parent = FB scope for correct lookup chain)
        for (const method of fbDecl.methods) {
          try {
            const methodScope = this.symbolTables.createMethodScope(
              fbDecl.name,
              method.name,
            );
            this.buildVarBlockSymbols(
              method.varBlocks,
              methodScope,
              "functionBlock",
              fbDecl.name,
              false,
            );
            // Register method return variable (MethodName := value)
            if (method.returnType) {
              const retType = this.resolveVarType(method.returnType.name);
              methodScope.define({
                name: method.name,
                kind: "variable",
                type: retType,
                declaration: undefined as unknown as VarDeclaration,
                isInput: false,
                isOutput: false,
                isInOut: false,
                isExternal: false,
                isGlobal: false,
                isRetain: false,
              });
            }
          } catch (methodErr) {
            if (methodErr instanceof Error) {
              this.addError(
                methodErr.message,
                method.sourceSpan.startLine,
                method.sourceSpan.startCol,
                method.sourceSpan.file,
              );
            }
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            fbDecl.sourceSpan.startLine,
            fbDecl.sourceSpan.startCol,
            fbDecl.sourceSpan.file,
          );
        }
      }
    }

    // Register interface declarations as types (so they can be used in IMPLEMENTS and var types)
    for (const ifaceDecl of ast.interfaces) {
      try {
        const resolvedType: ElementaryType = {
          typeKind: "elementary",
          name: ifaceDecl.name,
          sizeBits: 0,
        };
        this.symbolTables.globalScope.defineOrReplace({
          name: ifaceDecl.name,
          kind: "type",
          declaration:
            undefined as unknown as import("../frontend/ast.js").TypeDeclaration,
          resolvedType,
        });
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            ifaceDecl.sourceSpan.startLine,
            ifaceDecl.sourceSpan.startCol,
            ifaceDecl.sourceSpan.file,
          );
        }
      }
    }

    // Register program declarations
    for (const progDecl of ast.programs) {
      try {
        this.symbolTables.globalScope.defineOrReplace({
          name: progDecl.name,
          kind: "program",
          declaration: progDecl,
          variables: [],
        });

        // Create local scope for program
        const scope = this.symbolTables.createProgramScope(progDecl.name);
        this.buildVarBlockSymbols(
          progDecl.varBlocks,
          scope,
          "program",
          progDecl.name,
          true,
        );
      } catch (err) {
        if (err instanceof Error) {
          this.addError(
            err.message,
            progDecl.sourceSpan.startLine,
            progDecl.sourceSpan.startCol,
            progDecl.sourceSpan.file,
          );
        }
      }
    }

    // Register global variable declarations
    for (const block of ast.globalVarBlocks) {
      for (const decl of block.declarations) {
        // An `AT` operand on a TOP-LEVEL global is checked here, per
        // declaration, because nothing downstream looks at it: codegen emits
        // these as plain `inline` storage and only CONFIGURATION VAR_GLOBALs
        // reach `locatedVars[]` / `locatedGlobals[]`.
        //
        // The two cases part company on whether the source can be compiled at
        // all. An unresolved alias cannot: no address exists for it, so it is
        // an error, exactly as it is in a POU — left unchecked it compiled
        // clean and produced an unlocated variable, the silent failure the
        // alias diagnostic exists to prevent, newly reachable because this
        // grammar now accepts an identifier wherever it accepts an address. A
        // well-formed `%` address is a compilable program whose address this
        // compiler cannot bind, so it warns and carries on: the variable is
        // built, unlocated, and the user is told where to move it rather than
        // having a build refused over something that used to pass.
        if (decl.address) {
          if (parseAddress(decl.address)) {
            this.addWarning(
              `Located variable '${decl.names[0] ?? ""}' at ${decl.address} is declared in a top-level VAR_GLOBAL, ` +
                `where the compiler cannot bind it, so the address is ignored. ` +
                `Move it to CONFIGURATION VAR_GLOBAL to have it located.`,
              decl.sourceSpan.startLine,
              decl.sourceSpan.startCol,
              decl.sourceSpan.file,
            );
          } else {
            this.addError(
              unusableAddressMessage(decl),
              decl.sourceSpan.startLine,
              decl.sourceSpan.startCol,
              decl.sourceSpan.file,
            );
          }
        }
        for (const name of decl.names) {
          try {
            const varType = this.resolveVarType(decl.type.name);
            if (block.isConstant) {
              this.symbolTables.globalScope.define({
                name,
                kind: "constant",
                declaration: decl,
                type: varType,
              });
            } else {
              this.symbolTables.globalScope.define({
                name,
                kind: "variable",
                declaration: decl,
                type: varType,
                isInput: false,
                isOutput: false,
                isInOut: false,
                isExternal: false,
                isGlobal: true,
                isRetain: block.isRetain,
                address: decl.address,
              });
            }
          } catch (err) {
            if (err instanceof Error) {
              this.addError(
                err.message,
                decl.sourceSpan.startLine,
                decl.sourceSpan.startCol,
                decl.sourceSpan.file,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Build symbols from variable blocks.
   */
  private buildVarBlockSymbols(
    varBlocks: CompilationUnit["programs"][0]["varBlocks"],
    scope: ReturnType<typeof this.symbolTables.createProgramScope>,
    scopeType: "program" | "function" | "functionBlock",
    scopeName: string,
    /**
     * Whether declarations here belong to something with instance storage.
     *
     * False for a FUNCTION and for a METHOD: neither has an instance, their
     * locals are stack temporaries, and RETAIN over a stack slot is
     * meaningless. `scopeType` cannot answer this — a method reports
     * "functionBlock" so its located variables are rejected the same way an
     * FB's are, and overloading it would change that unrelated rule.
     */
    hasInstanceState: boolean,
  ): void {
    for (const block of varBlocks) {
      this.validateVarModifiers(block, hasInstanceState);

      for (const decl of block.declarations) {
        for (const name of decl.names) {
          try {
            const varType = this.resolveVarType(decl.type.name);
            if (block.isConstant) {
              scope.define({
                name,
                kind: "constant",
                declaration: decl,
                type: varType,
              });
            } else {
              scope.define({
                name,
                kind: "variable",
                declaration: decl,
                type: varType,
                isInput: block.blockType === "VAR_INPUT",
                isOutput: block.blockType === "VAR_OUTPUT",
                isInOut: block.blockType === "VAR_IN_OUT",
                isExternal: block.blockType === "VAR_EXTERNAL",
                isGlobal: block.blockType === "VAR_GLOBAL",
                isRetain: block.isRetain,
                address: decl.address,
              });

              // Track located variables for validation.
              //
              // Only VAR and VAR_GLOBAL may own an address (see
              // LOCATABLE_BLOCK_TYPES). Report and do NOT record the declaration,
              // so a located VAR_EXTERNAL cannot also collide with the global that
              // legitimately claims the address.
              if (decl.address && !LOCATABLE_BLOCK_TYPES.has(block.blockType)) {
                this.addError(
                  `Variable '${name}' in ${block.blockType} cannot have a location ('AT ${decl.address}'). Only VAR and VAR_GLOBAL declarations may be located.` +
                    (block.blockType === "VAR_EXTERNAL"
                      ? ` A VAR_EXTERNAL references storage owned by a CONFIGURATION VAR_GLOBAL — declare the address on that VAR_GLOBAL and drop it here.`
                      : ` Move '${name}' to a VAR block, or to CONFIGURATION VAR_GLOBAL if other POUs need it.`),
                  decl.sourceSpan.startLine,
                  decl.sourceSpan.startCol,
                  decl.sourceSpan.file,
                );
              } else if (decl.address) {
                const parsed = parseAddress(decl.address);
                if (parsed) {
                  this.locatedVars.push({
                    name,
                    address: decl.address,
                    parsed,
                    typeName: decl.type.name,
                    scopeType,
                    scopeName,
                    declaration: decl,
                  });
                } else {
                  this.addError(
                    unusableAddressMessage(decl),
                    decl.sourceSpan.startLine,
                    decl.sourceSpan.startCol,
                    decl.sourceSpan.file,
                  );
                }
              }
            }
          } catch (err) {
            if (err instanceof Error) {
              this.addError(
                err.message,
                decl.sourceSpan.startLine,
                decl.sourceSpan.startCol,
                decl.sourceSpan.file,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Validate IEC 61131-3 semantic rules.
   */
  private validateSemantics(ast: CompilationUnit): void {
    // Validate undeclared variable usage
    this.validateUndeclaredVariables(ast);

    // Validate located variables
    this.validateLocatedVariables(ast);

    // Validate CONSTANT assignment restrictions
    this.validateConstantAssignments(ast);

    // Validate in-out mapping at calls, and in-out access outside a block
    this.validateInOutUsage(ast);

    // Validate OOP property/member name collisions
    this.validatePropertyNameCollisions(ast);

    // Validate OOP modifier contradictions
    this.validateOOPModifiers(ast);

    // Validate abstract FB instantiation
    this.validateAbstractInstantiation(ast);

    // Validate property write access (read-only check)
    this.validatePropertyAccess(ast);

    // Validate access modifier enforcement
    this.validateAccessModifiers(ast);

    // Validate bit access bounds and ADR l-value targets
    this.validateExpressions(ast);

    // Validate array initializer shape/size and subscript counts
    this.validateArrayShapes(ast);

    // Validate that structure initializers only appear where IEC allows them
    this.validateStructInitializerPlacement(ast);

    // Validate that integer literals fit an IEC integer type
    this.validateIntegerLiteralRange(ast);

    // TODO: Implement additional semantic validation
    // - Check CASE statement coverage
    // - Validate reference operations
    // - Check for unreachable code
  }

  /**
   * Validate array declarations and array accesses against the declared shape:
   *
   *   - an initializer's nesting must match the array's rank
   *   - an initializer must not supply more values than the array (or a row) holds
   *   - a subscript must supply one index per dimension
   *
   * All three were previously invisible here: a nesting or rank mistake surfaced
   * as a C++ error against generated code, and an over-long initializer was
   * silently truncated by the runtime container's constructor.
   *
   * Every check is skipped rather than guessed at when the shape isn't statically
   * known (variable-length `ARRAY[*]`, non-constant bounds, a type that doesn't
   * resolve), so this can only ever add diagnostics for definite mistakes.
   */
  private validateArrayShapes(ast: CompilationUnit): void {
    // Globals are visible to every POU, and are the fallback when a name isn't
    // one of the POU's own variables.
    const globals = new Map<string, TypeReference>();
    const addDecls = (
      blocks: VarBlock[],
      into: Map<string, TypeReference>,
    ): void => {
      for (const block of blocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names)
            into.set(name.toUpperCase(), decl.type);
        }
      }
    };
    addDecls(ast.globalVarBlocks, globals);
    for (const config of ast.configurations)
      addDecls(config.varBlocks, globals);

    // Declaration initializers, everywhere a declaration can appear.
    for (const block of ast.globalVarBlocks) {
      this.checkVarBlockInitializers(block, ast);
    }
    for (const config of ast.configurations) {
      for (const block of config.varBlocks) {
        this.checkVarBlockInitializers(block, ast);
      }
    }
    for (const typeDecl of ast.types) {
      if (typeDecl.definition.kind !== "StructDefinition") continue;
      for (const field of typeDecl.definition.fields) {
        this.checkDeclarationInitializer(field, ast);
      }
    }

    // Per-POU: initializers plus the subscript counts in its body.
    const checkPou = (blocks: VarBlock[], bodies: Statement[][]): void => {
      const scope = new Map(globals);
      addDecls(blocks, scope);
      for (const block of blocks) this.checkVarBlockInitializers(block, ast);
      for (const body of bodies) this.checkSubscriptCounts(body, scope, ast);
    };

    for (const prog of ast.programs) checkPou(prog.varBlocks, [prog.body]);
    for (const func of ast.functions) checkPou(func.varBlocks, [func.body]);
    for (const fb of ast.functionBlocks) {
      checkPou(fb.varBlocks, [fb.body]);
      for (const method of fb.methods) {
        // A method sees its own locals plus the FB's members.
        checkPou([...fb.varBlocks, ...method.varBlocks], [method.body]);
      }
    }
  }

  /** Check every declaration in a VAR block. */
  private checkVarBlockInitializers(
    block: VarBlock,
    ast: CompilationUnit,
  ): void {
    for (const decl of block.declarations) {
      this.checkDeclarationInitializer(decl, ast);
    }
  }

  /**
   * Check one declaration's initializer against its declared array shape.
   *
   * Only array literals are examined. A scalar initializer on an array is left
   * alone: it is meaningful for a STRUCT element (`data : ARRAY[…] OF INT := 0`
   * value-initialises), so rejecting it here would flag working code.
   */
  private checkDeclarationInitializer(
    decl: VarDeclaration,
    ast: CompilationUnit,
  ): void {
    if (!decl.initialValue) return;
    if (decl.initialValue.kind !== "ArrayLiteralExpression") return;
    const shape = resolveArrayShape(decl.type, ast);
    if (!shape) return;
    this.checkArrayLiteralShape(
      decl.initialValue,
      shape,
      decl.names.join(", "),
      ast,
      0,
    );
  }

  /**
   * Recursively check an array literal against the dimensions it initialises.
   *
   * `depth` counts nesting levels already consumed. Returns true once something
   * has been reported, so one mistaken declaration yields one diagnostic rather
   * than one per row.
   */
  private checkArrayLiteralShape(
    literal: ArrayLiteralExpression,
    shape: ArrayShape,
    declName: string,
    ast: CompilationUnit,
    depth: number,
  ): boolean {
    const span = literal.sourceSpan;
    const where = depth === 0 ? "" : ` at nesting level ${depth + 1}`;
    const nestedCount = literal.elements.filter(
      (e) => e.kind === "ArrayLiteralExpression",
    ).length;

    if (nestedCount > 0 && nestedCount !== literal.elements.length) {
      this.addError(
        `Initializer for '${declName}' mixes nested and flat values${where}. ` +
          `Either give every element its own list, or write the whole array flat.`,
        span.startLine,
        span.startCol,
        span.file,
      );
      return true;
    }

    if (nestedCount === 0) {
      // A flat list at the outermost level fills the whole array row-major,
      // which IEC allows for any rank. Once nesting has started, though, each
      // level descends exactly one dimension — a flat list part-way down leaves
      // dimensions unaccounted for and no container constructor matches it.
      if (depth > 0 && shape.dims.length > 1) {
        this.addError(
          `Initializer for '${declName}' stops nesting at level ${depth + 1}, ` +
            `but ${shape.dims.length} dimensions remain. Nest one level per ` +
            `dimension, or write the whole array as a single flat list.`,
          span.startLine,
          span.startCol,
          span.file,
        );
        return true;
      }
      const total = arrayTotalSize(shape.dims);
      if (total !== undefined && literal.elements.length > total) {
        this.addError(
          `Initializer for '${declName}' has ${literal.elements.length} values ` +
            `but the array holds ${total}. The extra values would be discarded.`,
          span.startLine,
          span.startCol,
          span.file,
        );
        return true;
      }
      return false;
    }

    // Nested list — the outer level fills the first dimension. When only one
    // dimension remains, the nesting can only be meant for an element type that
    // is itself an array.
    const outerSize = arrayDimSize(shape.dims[0] ?? null);
    if (outerSize !== undefined && literal.elements.length > outerSize) {
      this.addError(
        `Initializer for '${declName}' has ${literal.elements.length} entries` +
          `${where} but that dimension holds ${outerSize}. ` +
          `The extra entries would be discarded.`,
        span.startLine,
        span.startCol,
        span.file,
      );
      return true;
    }

    let innerShape: ArrayShape;
    if (shape.dims.length > 1) {
      innerShape = {
        dims: shape.dims.slice(1),
        elementTypeName: shape.elementTypeName,
      };
    } else {
      const elementShape = resolveArrayShapeByName(shape.elementTypeName, ast);
      if (!elementShape) {
        this.addError(
          `Initializer for '${declName}' is nested ${depth + 2} levels deep, but ` +
            `the array has ${depth + 1} dimension${depth === 0 ? "" : "s"} and its ` +
            `elements are not arrays. Write the values at one level per dimension.`,
          span.startLine,
          span.startCol,
          span.file,
        );
        return true;
      }
      innerShape = elementShape;
    }

    for (const element of literal.elements) {
      if (
        this.checkArrayLiteralShape(
          element as ArrayLiteralExpression,
          innerShape,
          declName,
          ast,
          depth + 1,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Walk statements and check that every array subscript supplies one index per
   * dimension. `arr[i, j]` on a 1-dimensional array and `arr[i]` on a
   * 2-dimensional one are both static mistakes that used to reach g++ as
   * "no matching member function for call to 'at'".
   */
  private checkSubscriptCounts(
    statements: Statement[],
    scope: Map<string, TypeReference>,
    ast: CompilationUnit,
  ): void {
    const seen = new Set<Expression>();
    for (const stmt of statements) {
      walkAST(stmt, (node) => {
        if (node.kind !== "VariableExpression") return;
        const expr = node as VariableExpression;
        if (seen.has(expr)) return;
        seen.add(expr);
        this.checkVariableSubscripts(expr, scope, ast);
      });
    }
  }

  /**
   * Check one variable reference's subscripts, walking its access chain so that
   * `a[0][1]` (two single-index steps into an array of arrays) is not confused
   * with `a[0, 1]` (one two-index step into a 2D array).
   */
  private checkVariableSubscripts(
    expr: VariableExpression,
    scope: Map<string, TypeReference>,
    ast: CompilationUnit,
  ): void {
    const declared = scope.get(expr.name.toUpperCase());
    if (!declared) return;

    // Only the ordered chain distinguishes the two spellings above; without it
    // the flat `subscripts` list is ambiguous, so there is nothing safe to check.
    const chain = expr.accessChain;
    if (!chain || chain.length === 0) return;

    let currentTypeName: string | undefined = declared.name;
    let currentShape = resolveArrayShape(declared, ast);

    for (const step of chain) {
      if (step.kind === "subscript") {
        if (!currentShape) return; // not a known array — nothing to check
        if (step.indices.length !== currentShape.dims.length) {
          this.addError(
            `'${expr.name}' has ${currentShape.dims.length} dimension` +
              `${currentShape.dims.length === 1 ? "" : "s"} but is indexed with ` +
              `${step.indices.length} ` +
              `${step.indices.length === 1 ? "index" : "indices"}.`,
            expr.sourceSpan.startLine,
            expr.sourceSpan.startCol,
            expr.sourceSpan.file,
          );
          return;
        }
        currentTypeName = currentShape.elementTypeName;
        currentShape = currentTypeName
          ? resolveArrayShapeByName(currentTypeName, ast)
          : undefined;
      } else if (step.kind === "field") {
        if (!currentTypeName) return;
        const fieldType = resolveFieldType(currentTypeName, step.name, ast);
        if (!fieldType) return;
        currentTypeName = fieldType;
        currentShape = resolveArrayShapeByName(fieldType, ast);
      } else {
        // Dereference — pointer semantics are out of scope for this check.
        return;
      }
    }
  }

  /**
   * Reject a structure initializer written anywhere but a declaration's initial
   * value.
   *
   * `structure_initialization` (Annex B.1.4.3) belongs to `var_init_decl`; it is
   * not an expression, so IEC has no position for it inside a statement. The
   * lowering needs the target's C++ type, which only a declaration supplies —
   * reaching codegen without one used to value-initialise silently, so
   *
   *     arr := [(x := 1.0), (x := 2.0)];   ->  ARR = {{}, {}};
   *     f(P := (x := 3.0));                ->  F.P = {};
   *
   * compiled clean and ran with every written element discarded, the members
   * left at their declared defaults. Reported here instead, against the source.
   *
   * The walk prunes at every initial value a declaration can carry — a variable
   * or STRUCT element's (`VarDeclaration.initialValue`) and a type-level default's
   * (`TypeDeclaration.defaultValue`, Annex B.1.3.3) — so the legal forms, including
   * a structure initializer nested inside an array literal, are never visited.
   */
  private validateStructInitializerPlacement(ast: CompilationUnit): void {
    // Identity set rather than a node-kind test: only the initializer's own root
    // is legal, and pruning there covers everything beneath it.
    const declarationInitializers = new Set<Expression>();
    walkAST(ast, (node) => {
      if (node.kind === "VarDeclaration") {
        const decl = node as VarDeclaration;
        if (decl.initialValue) declarationInitializers.add(decl.initialValue);
      } else if (node.kind === "TypeDeclaration") {
        const type = node as TypeDeclaration;
        if (type.defaultValue) declarationInitializers.add(type.defaultValue);
      }
    });

    walkAST(ast, (node) => {
      if (declarationInitializers.has(node as Expression)) return false;
      if (node.kind !== "StructInitializerExpression") return;
      const span = node.sourceSpan;
      this.addError(
        "A structure initializer '(NAME := value, ...)' is only valid as a " +
          "variable's initial value in a declaration, not inside a statement. " +
          "Assign the elements individually instead.",
        span.startLine,
        span.startCol,
        span.file,
      );
      // One diagnostic per initializer, not one per nesting level.
      return false;
    });
  }

  /**
   * Reject an integer literal that no IEC 61131-3 integer type can hold.
   *
   * The widest are LINT (signed 64-bit) and ULINT (unsigned 64-bit), so a value
   * outside `[LINT_MIN, ULINT_MAX]` is a mistake against *every* declared type
   * and can be reported without knowing which one it initialises — the same
   * conservative rule the array-shape checks follow. In range but wrong for the
   * specific type (`INT := 70000`) is left to the type checker.
   *
   * Checked on the exact value rather than the parsed `number`, which rounds
   * above 2^53; codegen lowers from the same exact value (see
   * `formatIntegerLiteral`), so the two agree on what is representable.
   */
  private validateIntegerLiteralRange(ast: CompilationUnit): void {
    walkAST(ast, (node) => {
      if (node.kind !== "LiteralExpression") return;
      const literal = node as LiteralExpression;
      if (literal.literalType !== "INT") return;
      const exact = exactIntegerLiteralValue(literal.rawValue);
      if (exact === undefined) return;
      // A negative literal parses as unary minus over a positive one, so the
      // magnitude LINT_MIN needs the unsigned bound to stay accepted here.
      if (exact <= IEC_INTEGER_MAX && exact >= IEC_INTEGER_MIN) return;
      const span = literal.sourceSpan;
      this.addError(
        `Integer literal '${literal.rawValue}' is outside the range of every ` +
          `IEC 61131-3 integer type (LINT holds ${IEC_INTEGER_MIN} to ` +
          `${-IEC_INTEGER_MIN - 1n}, ULINT holds 0 to ${IEC_INTEGER_MAX}).`,
        span.startLine,
        span.startCol,
        span.file,
      );
    });
  }

  /**
   * Validate that no assignments target CONSTANT variables.
   */
  private validateConstantAssignments(ast: CompilationUnit): void {
    for (const prog of ast.programs) {
      const scope = this.symbolTables.getProgramScope(prog.name);
      if (scope) {
        this.validateStatementsForConstantAssignment(prog.body, scope);
      }
    }
    for (const func of ast.functions) {
      const scope = this.symbolTables.getFunctionScope(func.name);
      if (scope) {
        this.validateStatementsForConstantAssignment(func.body, scope);
      }
    }
    for (const fb of ast.functionBlocks) {
      const scope = this.symbolTables.getFBScope(fb.name);
      if (scope) {
        this.validateStatementsForConstantAssignment(fb.body, scope);
      }
    }
  }

  /**
   * Walk statements and check for assignments to CONSTANT variables.
   */
  private validateStatementsForConstantAssignment(
    stmts: Statement[],
    scope: ReturnType<typeof this.symbolTables.createProgramScope>,
  ): void {
    for (const stmt of stmts) {
      if (stmt.kind === "AssignmentStatement") {
        if (stmt.target.kind === "VariableExpression") {
          const varName = stmt.target.name;
          const symbol = scope.lookup(varName);
          if (symbol && symbol.kind === "constant") {
            this.addError(
              `Cannot assign to CONSTANT variable '${varName}'`,
              stmt.sourceSpan.startLine,
              stmt.sourceSpan.startCol,
              stmt.sourceSpan.file,
            );
          }
        }
      }
      // Recurse into control flow statements
      if (stmt.kind === "IfStatement") {
        const ifStmt = stmt as {
          thenStatements: Statement[];
          elsifClauses: Array<{ statements: Statement[] }>;
          elseStatements: Statement[];
        };
        this.validateStatementsForConstantAssignment(
          ifStmt.thenStatements,
          scope,
        );
        for (const clause of ifStmt.elsifClauses) {
          this.validateStatementsForConstantAssignment(
            clause.statements,
            scope,
          );
        }
        this.validateStatementsForConstantAssignment(
          ifStmt.elseStatements,
          scope,
        );
      }
      if (stmt.kind === "ForStatement") {
        const forStmt = stmt as { body: Statement[] };
        this.validateStatementsForConstantAssignment(forStmt.body, scope);
      }
      if (stmt.kind === "WhileStatement") {
        const whileStmt = stmt as { body: Statement[] };
        this.validateStatementsForConstantAssignment(whileStmt.body, scope);
      }
      if (stmt.kind === "RepeatStatement") {
        const repeatStmt = stmt as { body: Statement[] };
        this.validateStatementsForConstantAssignment(repeatStmt.body, scope);
      }
      if (stmt.kind === "CaseStatement") {
        const caseStmt = stmt as {
          cases: Array<{ statements: Statement[] }>;
          elseStatements: Statement[];
        };
        for (const c of caseStmt.cases) {
          this.validateStatementsForConstantAssignment(c.statements, scope);
        }
        this.validateStatementsForConstantAssignment(
          caseStmt.elseStatements,
          scope,
        );
      }
    }
  }

  /**
   * A global variable may not take the C++ name of a standard function.
   *
   * IEC 61131-3 keeps variables and functions apart, and a local variable,
   * a block's member or a structure field named `max`, `sel` or `to_int`
   * compiles: the generated code calls the function by its qualified name. A
   * global is different. Its storage is declared in the same C++ namespace as
   * the runtime's standard functions, where one name cannot be both, so it is
   * reported here rather than as a C++ error in a board build.
   */
  private checkGlobalNamesAgainstStdFunctions(ast: CompilationUnit): void {
    const taken = new Map<string, string>();
    for (const desc of this.stdRegistry.getAll()) {
      taken.set(desc.cppName.toUpperCase(), desc.name.toUpperCase());
    }
    for (const type of Object.keys(ELEMENTARY_TYPES)) {
      taken.set(`TO_${type}`, `TO_${type}`);
    }
    const blocks = [
      ...ast.globalVarBlocks,
      ...ast.configurations.flatMap((c) => c.varBlocks),
    ].filter((b) => b.blockType === "VAR_GLOBAL");
    for (const block of blocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          const fn = taken.get(name.toUpperCase());
          if (fn === undefined) continue;
          this.addError(
            `A global variable cannot be named '${name}': the standard function ${fn} has that name in the generated code. Rename the global (a local variable may use the name)`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
            decl.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Replace every reference to a constant in an initial value with the
   * constant's own initial value: `x : INT := K` becomes `x : INT := 7`.
   *
   * An initial value is set when the instance is constructed, and a reference
   * there read whatever K was at that moment. For a VAR_EXTERNAL that was the
   * pointer member, not yet bound, so the C++ did not compile in a program
   * (`X(K)` from a `GlobalVar*`) and in a function block it read the global
   * during static initialisation, before the global's own definition — in
   * another translation unit — need have run. A constant's value is known
   * here, so it is written in. Covers the POU's own VAR CONSTANT, a
   * VAR_EXTERNAL [CONSTANT] whose global is a CONFIGURATION or top-level
   * VAR_GLOBAL CONSTANT, and a top-level VAR_GLOBAL CONSTANT named directly,
   * including inside structure and array initialisers. An initial value that
   * reads a global variable that is not CONSTANT is an error: IEC 61131-3
   * requires a constant there, and nothing would make the read well defined.
   */
  private foldConstantInitializers(ast: CompilationUnit): void {
    const globalConstants = new Map<string, Expression>();
    const globalVariables = new Set<string>();
    const collect = (
      blocks: VarBlock[],
      into: Map<string, Expression>,
    ): void => {
      for (const block of blocks) {
        if (block.blockType !== "VAR_GLOBAL") continue;
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            if (block.isConstant && decl.initialValue !== undefined) {
              into.set(name.toUpperCase(), decl.initialValue);
            } else if (block.blockType === "VAR_GLOBAL") {
              globalVariables.add(name.toUpperCase());
            }
          }
        }
      }
    };
    collect(ast.globalVarBlocks, globalConstants);
    for (const config of ast.configurations) {
      collect(config.varBlocks, globalConstants);
    }

    // The globals' own initial values may name other global constants.
    this.foldInitializersIn(
      [
        ...ast.globalVarBlocks,
        ...ast.configurations.flatMap((c) => c.varBlocks),
      ],
      globalConstants,
      new Set(),
    );

    // What each set of declarations sees, and which of them to fold: a
    // method sees its block's declarations as well as its own.
    const pous: Array<{ blocks: VarBlock[]; own: VarBlock[] }> = [
      ...ast.programs.map((p) => ({ blocks: p.varBlocks, own: p.varBlocks })),
      ...ast.functions.map((f) => ({ blocks: f.varBlocks, own: f.varBlocks })),
      ...ast.functionBlocks.flatMap((fb) => [
        { blocks: fb.varBlocks, own: fb.varBlocks },
        ...fb.methods.map((m) => ({
          blocks: [...fb.varBlocks, ...m.varBlocks],
          own: m.varBlocks,
        })),
      ]),
    ];
    for (const { blocks, own } of pous) {
      const constants = new Map<string, Expression>();
      const externalVariables = new Set<string>();
      // Top-level constants are visible unless a declaration here hides them.
      const declared = new Set(
        blocks.flatMap((b) =>
          b.declarations.flatMap((d) => d.names.map((n) => n.toUpperCase())),
        ),
      );
      for (const [name, value] of globalConstants) {
        if (!declared.has(name)) constants.set(name, value);
      }
      for (const block of blocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            const upper = name.toUpperCase();
            if (block.blockType === "VAR_EXTERNAL") {
              const value = globalConstants.get(upper);
              if (value !== undefined) constants.set(upper, value);
              else if (globalVariables.has(upper)) externalVariables.add(upper);
            } else if (block.isConstant && decl.initialValue !== undefined) {
              constants.set(upper, decl.initialValue);
            }
          }
        }
      }
      this.foldInitializersIn(own, constants, externalVariables);
    }
  }

  private foldInitializersIn(
    blocks: VarBlock[],
    constants: ReadonlyMap<string, Expression>,
    externalVariables: ReadonlySet<string>,
  ): void {
    for (const block of blocks) {
      if (block.blockType === "VAR_EXTERNAL") continue;
      for (const decl of block.declarations) {
        if (decl.initialValue === undefined) continue;
        this.foldConstants(
          decl.initialValue,
          constants,
          externalVariables,
          new Set(decl.names.map((n) => n.toUpperCase())),
        );
      }
    }
  }

  /** Fold the constants in one expression tree, in place. */
  private foldConstants(
    root: Expression,
    constants: ReadonlyMap<string, Expression>,
    externalVariables: ReadonlySet<string>,
    folding: ReadonlySet<string>,
  ): void {
    walkAST(root, (node) => {
      if (node.kind !== "VariableExpression") return;
      const ref = node as VariableExpression;
      const upper = ref.name.toUpperCase();
      const plain =
        ref.subscripts.length === 0 &&
        ref.fieldAccess.length === 0 &&
        !ref.isDereference;
      if (externalVariables.has(upper)) {
        this.addError(
          `An initial value must be a constant: '${ref.name}' is a global variable, not CONSTANT`,
          ref.sourceSpan.startLine,
          ref.sourceSpan.startCol,
          ref.sourceSpan.file,
        );
        return false;
      }
      const value = constants.get(upper);
      if (value === undefined || !plain || folding.has(upper)) return;
      const span = ref.sourceSpan;
      const copy = structuredClone(value);
      this.foldConstants(
        copy,
        constants,
        externalVariables,
        new Set([...folding, upper]),
      );
      // In place, so every holder of this node — the project model included —
      // sees the value.
      for (const key of Object.keys(ref)) {
        delete (ref as unknown as Record<string, unknown>)[key];
      }
      Object.assign(ref, copy, { sourceSpan: span });
      return false;
    });
  }

  /**
   * Bind the named arguments of every standard-function call to the
   * function's formal parameters (IEC 61131-3), and leave them in formal
   * order. Everything after this — type checking, the argument checks and
   * code generation — reads a standard call's arguments by position, so
   * `LIMIT(IN := x, MN := 0, MX := 10)` would otherwise hand x to MN.
   */
  private bindStdFunctionArguments(roots: ASTNode[]): void {
    // A block instance named like a standard function is the block being
    // called. Any other variable of that name leaves the call standard.
    const instances = new Set<string>();
    for (const root of roots) {
      walkAST(root, (node) => {
        if (node.kind !== "VarDeclaration") return;
        const decl = node as VarDeclaration;
        const typeName = arrayElementTypeName(decl.type.name) ?? decl.type.name;
        if (!this.symbolTables.lookupFunctionBlock(typeName)) return;
        for (const n of decl.names) instances.add(n.toUpperCase());
      });
    }
    for (const root of roots) {
      walkAST(root, (node) => {
        if (node.kind !== "FunctionCallExpression") return;
        const call = node as FunctionCallExpression;
        if (call.instance !== undefined || call.functionName.includes(".")) {
          return;
        }
        if (instances.has(call.functionName.toUpperCase())) return;
        const sig = this.stdRegistry.signature(call.functionName);
        if (sig) this.bindStdCall(call, sig);
      });
    }
  }

  private bindStdCall(call: FunctionCallExpression, sig: StdSignature): void {
    const callee = call.functionName.toUpperCase();
    const bound = new Map<number, Argument>();
    let named = false;
    let positional = 0;
    let ok = true;
    const report = (
      node: ASTNode & { sourceSpan: SourceSpan },
      message: string,
    ): void => {
      ok = false;
      const span = node.sourceSpan;
      this.addError(message, span.startLine, span.startCol, span.file);
    };

    for (const arg of call.arguments) {
      if (isEnEnoArgument(arg)) continue;
      if (arg.name === undefined) {
        if (named) {
          report(
            arg,
            `'${callee}' has an argument without a name after a named one: name every argument, or give them all in order`,
          );
        } else {
          bound.set(positional++, arg);
        }
        continue;
      }
      named = true;
      const formal = arg.name.toUpperCase();
      if (formal === "EN" || formal === "ENO") {
        report(
          arg,
          formal === "EN"
            ? `'EN' is the implicit input of function '${callee}': assign it with ':='`
            : `'ENO' is the implicit output of function '${callee}': read it with '=>'`,
        );
        continue;
      }
      const index = stdParamIndex(sig, formal);
      if (index === undefined) {
        report(
          arg,
          arg.isOutput
            ? `Function '${callee}' has no output '${formal}' (it has no outputs)`
            : `Function '${callee}' has no input '${formal}' (its inputs are ${describeStdParams(sig)})`,
        );
      } else if (arg.isOutput) {
        report(
          arg,
          `'${formal}' is an input of function '${callee}': assign it with ':=', not '=>'`,
        );
      } else if (bound.has(index)) {
        report(
          arg,
          index < positional
            ? `Function '${callee}' is given input '${formal}' twice: by position and by name`
            : `Function '${callee}' is given input '${formal}' twice`,
        );
      } else {
        bound.set(index, arg);
      }
    }
    if (!ok || !named) return;

    // Every input must be given. An extensible function — ADD, AND, MAX,
    // CONCAT, GT, … — may skip one of its numbered inputs: the rest close up
    // in order, as a ladder block with an unwired pin compiles, and the
    // argument count is checked later. MUX may not: its inputs are chosen by
    // number, so closing up would select the wrong one.
    const closesUp = sig.isVariadic && callee !== "MUX";
    const last = Math.max(sig.params.length - 1, ...bound.keys());
    const missing: string[] = [];
    for (let i = 0; i <= last && !closesUp; i++) {
      if (!bound.has(i)) missing.push(stdParamNameAt(sig, i) ?? `#${i + 1}`);
    }
    if (missing.length > 0) {
      report(
        call,
        `Function '${callee}' is missing input${missing.length > 1 ? "s" : ""} ${missing.join(", ")}`,
      );
      return;
    }

    const ordered = [...bound.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, arg]) => arg);
    call.arguments.splice(
      0,
      call.arguments.length,
      ...call.arguments.filter(isEnArgument),
      ...ordered,
      ...call.arguments.filter(isEnoArgument),
    );
  }

  /**
   * How a call must map an in-out, and where an in-out may be used.
   */
  private validateInOutUsage(ast: CompilationUnit): void {
    for (const prog of ast.programs) {
      const scope = this.symbolTables.getProgramScope(prog.name);
      if (scope) this.checkInOutsIn(prog.body, scope);
    }
    for (const func of ast.functions) {
      const scope = this.symbolTables.getFunctionScope(func.name);
      if (scope) this.checkInOutsIn(func.body, scope);
    }
    for (const fb of ast.functionBlocks) {
      const fbScope = this.symbolTables.getFBScope(fb.name);
      if (fbScope) this.checkInOutsIn(fb.body, fbScope);
      for (const method of fb.methods ?? []) {
        const scope = this.symbolTables.getMethodScope(fb.name, method.name);
        if (!scope) continue;
        this.checkInOutsIn(method.body, scope);
        if (fbScope) this.checkMethodInOutAccess(method, scope, fbScope);
      }
    }
  }

  private checkInOutsIn(stmts: Statement[], scope: Scope): void {
    for (const stmt of stmts) {
      walkAST(stmt, (node) => {
        if (node.kind === "FunctionCallExpression") {
          const call = node as FunctionCallExpression;
          this.checkCallParameterNames(call, scope);
          this.checkCallInOuts(call, scope);
          this.checkPassedInstanceCall(call, scope);
        } else if (node.kind === "VariableExpression") {
          this.checkRemoteInOutAccess(node as VariableExpression, scope);
        } else if (node.kind === "AssignmentStatement") {
          this.checkPassedInstanceWrite(
            (node as AssignmentStatement).target,
            scope,
          );
        }
      });
    }
  }

  /** The instance a name refers to, when it was passed into this POU. */
  private passedInstance(
    name: string,
    scope: Scope,
  ): { fb: FunctionBlockSymbol; isInput: boolean } | undefined {
    const sym = scope.lookup(name);
    if (sym?.kind !== "variable") return undefined;
    if (!sym.isInput && !sym.isInOut && !sym.isExternal) return undefined;
    const fb = this.symbolTables.lookupFunctionBlock(sym.declaration.type.name);
    return fb ? { fb, isInput: sym.isInput } : undefined;
  }

  /**
   * A block handed in as an input is read-only, and the outputs of any block
   * handed in belong to it.
   */
  private checkPassedInstanceWrite(target: Expression, scope: Scope): void {
    if (target.kind !== "VariableExpression") return;
    const field = target.fieldAccess[0];
    if (field === undefined) return;
    const passed = this.passedInstance(target.name, scope);
    if (!passed) return;

    const span = target.sourceSpan;
    if (passed.isInput) {
      this.addError(
        `'${target.name}' is an input of type '${passed.fb.name}' and can only be read`,
        span.startLine,
        span.startCol,
        span.file,
      );
      return;
    }
    const wanted = field.toUpperCase();
    if (
      this.fbSlots(passed.fb).some(
        (s) => s.kind === "output" && s.name === wanted,
      )
    ) {
      this.addError(
        `'${target.name}.${field}' is an output of '${passed.fb.name}' and can be read but not written`,
        span.startLine,
        span.startCol,
        span.file,
      );
    }
  }

  /** A block handed in as an input cannot be run. */
  private checkPassedInstanceCall(
    expr: FunctionCallExpression,
    scope: Scope,
  ): void {
    if (expr.functionName.includes(".")) return;
    const passed = this.passedInstance(expr.functionName, scope);
    if (passed?.isInput !== true) return;
    this.addError(
      `'${expr.functionName}' is an input of type '${passed.fb.name}' and cannot be called`,
      expr.sourceSpan.startLine,
      expr.sourceSpan.startCol,
      expr.sourceSpan.file,
    );
  }

  /** The function block a name is an instance of, if it is one. */
  private fbTypeOf(
    name: string,
    scope: Scope,
  ): FunctionBlockSymbol | undefined {
    const sym = scope.lookup(name);
    if (!sym || sym.kind !== "variable") return undefined;
    return this.symbolTables.lookupFunctionBlock(sym.declaration.type.name);
  }

  /**
   * A block's parameters in declaration order, its parents' first. A library
   * block carries its interface as three lists instead of a declaration, so
   * both shapes are read.
   */
  private fbSlots(fb: FunctionBlockSymbol): InOutSlot[] {
    const slots: InOutSlot[] = [];
    for (const block of this.fbLineage(fb).reverse()) {
      if (block.declaration.varBlocks.length > 0) {
        slots.push(...this.slotsFromVarBlocks(block.declaration.varBlocks));
        continue;
      }
      const flat = (
        vars: VariableSymbol[],
        kind: InOutSlot["kind"],
      ): InOutSlot[] =>
        vars.map((v) => slot(v.name, kind, v.declaration.type.name));
      slots.push(
        ...flat(block.inputs, "input"),
        ...flat(block.inouts, "inout"),
        ...flat(block.outputs, "output"),
      );
    }
    return slots;
  }

  /** A block followed by the blocks it EXTENDS, nearest first. */
  private fbLineage(fb: FunctionBlockSymbol): FunctionBlockSymbol[] {
    const lineage: FunctionBlockSymbol[] = [];
    let block: FunctionBlockSymbol | undefined = fb;
    while (block && !lineage.includes(block)) {
      lineage.push(block);
      const parent: string | undefined = block.declaration.extends;
      block =
        parent !== undefined && parent !== ""
          ? this.symbolTables.lookupFunctionBlock(parent)
          : undefined;
    }
    return lineage;
  }

  private slotsFromVarBlocks(blocks: VarBlock[]): InOutSlot[] {
    const slots: InOutSlot[] = [];
    for (const block of blocks) {
      const kind =
        block.blockType === "VAR_INPUT"
          ? "input"
          : block.blockType === "VAR_IN_OUT"
            ? "inout"
            : block.blockType === "VAR_OUTPUT"
              ? "output"
              : undefined;
      if (!kind) continue;
      for (const decl of block.declarations) {
        for (const name of decl.names)
          slots.push(slot(name, kind, decl.type.name));
      }
    }
    return slots;
  }

  /**
   * What a call names and its parameters, or undefined when it names nothing
   * whose interface is known here. The callee may be an instance reached
   * through fields and elements — `pumps[2](...)`, `cell.timer(...)` — a
   * method of one, or a function. A standard function is left out: its
   * named arguments are bound by bindStdFunctionArguments.
   */
  private resolveCallee(
    expr: FunctionCallExpression,
    scope: Scope,
  ): Callee | undefined {
    let base: string;
    let path: AccessStep[];
    if (expr.instance?.kind === "VariableExpression") {
      base = expr.instance.name;
      path = expr.instance.accessChain ?? [];
    } else if (expr.instance) {
      return undefined;
    } else {
      const [head, ...fields] = expr.functionName.split(".");
      base = head!;
      path = fields.map((name) => ({ kind: "field", name }));
    }

    const sym = scope.lookup(base);
    if (sym?.kind === "function" && path.length === 0) {
      const name = expr.functionName.toUpperCase();
      if (
        this.stdRegistry.lookup(name) ||
        this.stdRegistry.resolveConversion(name)
      ) {
        return undefined;
      }
      const slots =
        sym.declaration.varBlocks.length > 0
          ? this.slotsFromVarBlocks(sym.declaration.varBlocks)
          : sym.parameters.map((p) =>
              slot(
                p.name,
                p.isInOut ? "inout" : p.isOutput ? "output" : "input",
                p.declaration.type.name,
              ),
            );
      return { what: `function '${sym.name}'`, slots };
    }
    if (sym?.kind !== "variable") return undefined;

    // A trailing field may name a method of the instance before it.
    const last = path[path.length - 1];
    if (last?.kind === "field") {
      const owner = this.typeAlongPath(
        sym.declaration.type.name,
        path.slice(0, -1),
      );
      const fb =
        owner === undefined
          ? undefined
          : this.symbolTables.lookupFunctionBlock(owner);
      const wanted = last.name.toUpperCase();
      for (const block of fb === undefined ? [] : this.fbLineage(fb)) {
        const method = block.declaration.methods.find(
          (m) => m.name.toUpperCase() === wanted,
        );
        if (method) {
          return {
            what: `method '${block.name}.${method.name}'`,
            slots: this.slotsFromVarBlocks(method.varBlocks),
          };
        }
      }
    }

    const typeName = this.typeAlongPath(sym.declaration.type.name, path);
    const fb =
      typeName === undefined
        ? undefined
        : this.symbolTables.lookupFunctionBlock(typeName);
    if (fb === undefined) return undefined;
    return { what: `function block '${fb.name}'`, slots: this.fbSlots(fb) };
  }

  /** The parameters of whatever a call names, or undefined if it names none. */
  private calleeSlots(
    expr: FunctionCallExpression,
    scope: Scope,
  ): InOutSlot[] | undefined {
    return this.resolveCallee(expr, scope)?.slots;
  }

  /**
   * The type reached from a declared type by following fields and elements,
   * or undefined once a step leads somewhere this cannot see.
   */
  private typeAlongPath(
    typeName: string,
    path: readonly AccessStep[],
  ): string | undefined {
    let current: string | undefined = typeName;
    for (const step of path) {
      if (current === undefined) return undefined;
      if (step.kind === "dereference") continue;
      current =
        step.kind === "subscript"
          ? this.elementTypeOf(current)
          : this.memberTypeOf(current, step.name);
    }
    return current;
  }

  /** A type with its aliases followed to the definition behind them. */
  private typeDefinitionOf(typeName: string): {
    name: string;
    definition: TypeDefinition | undefined;
  } {
    let name = typeName;
    for (let depth = 0; depth < 32; depth++) {
      const definition =
        // A built-in system type (`__SYSTEM.AnyType`) registers no declaration.
        this.symbolTables.lookupType(name)?.declaration?.definition;
      if (
        definition?.kind !== "TypeReference" ||
        definition.name.toUpperCase() === name.toUpperCase()
      ) {
        return { name, definition };
      }
      name = definition.name;
    }
    return { name, definition: undefined };
  }

  private elementTypeOf(typeName: string): string | undefined {
    const synthetic = arrayElementTypeName(typeName);
    if (synthetic !== undefined) return synthetic;
    const { definition } = this.typeDefinitionOf(typeName);
    return definition?.kind === "ArrayDefinition"
      ? definition.elementType.name
      : undefined;
  }

  private memberTypeOf(typeName: string, member: string): string | undefined {
    const wanted = member.toUpperCase();
    const { name, definition } = this.typeDefinitionOf(typeName);
    if (definition?.kind === "StructDefinition") {
      const field = definition.fields.find((f) =>
        f.names.some((n) => n.toUpperCase() === wanted),
      );
      return field?.type.name;
    }
    const fb = this.symbolTables.lookupFunctionBlock(name);
    for (const block of fb === undefined ? [] : this.fbLineage(fb)) {
      for (const varBlock of block.declaration.varBlocks) {
        const decl = varBlock.declarations.find((d) =>
          d.names.some((n) => n.toUpperCase() === wanted),
        );
        if (decl) return decl.type.name;
      }
      const flat = [
        ...block.inputs,
        ...block.outputs,
        ...block.inouts,
        ...block.locals,
      ].find((v) => v.name.toUpperCase() === wanted);
      if (flat) return flat.declaration.type.name;
    }
    return undefined;
  }

  /**
   * Every named argument of a call names a parameter of the callee, on the
   * side it travels: an input or in-out is assigned with `:=`, an output is
   * read with `=>`. EN and ENO are every POU's implicit input and output
   * (IEC 61131-3), so they need no declaration. Without this a misspelt pin
   * passes the check and reaches C++ as a member the block does not have.
   */
  private checkCallParameterNames(
    expr: FunctionCallExpression,
    scope: Scope,
  ): void {
    const callee = this.resolveCallee(expr, scope);
    if (!callee) return;
    const byName = new Map(callee.slots.map((s) => [s.name, s]));

    for (const arg of expr.arguments) {
      if (arg.name === undefined) continue;
      const name = arg.name.toUpperCase();
      const target = byName.get(name);
      const span = arg.sourceSpan ?? expr.sourceSpan;
      const report = (message: string): void =>
        this.addError(message, span.startLine, span.startCol, span.file);

      if (!target) {
        if (name === "EN") {
          if (arg.isOutput) {
            report(
              `'EN' is the implicit input of ${callee.what}: assign it with ':='`,
            );
          }
        } else if (name === "ENO") {
          if (!arg.isOutput) {
            report(
              `'ENO' is the implicit output of ${callee.what}: read it with '=>'`,
            );
          }
        } else {
          const side = arg.isOutput ? "output" : "input";
          const offered = callee.slots
            .filter((s) =>
              arg.isOutput ? s.kind === "output" : s.kind !== "output",
            )
            .map((s) => s.name);
          report(
            `${capitalize(callee.what)} has no ${side} '${name}'` +
              (offered.length > 0
                ? ` (its ${side}s are ${offered.join(", ")})`
                : ` (it has no ${side}s)`),
          );
        }
        continue;
      }
      if (target.kind === "input" && arg.isOutput) {
        report(
          `'${name}' is an input of ${callee.what}: assign it with ':=', not '=>'`,
        );
      } else if (target.kind === "output" && !arg.isOutput) {
        report(
          `'${name}' is an output of ${callee.what}: read it with '=>', not ':='`,
        );
      }
      // An in-out captured with '=>' is reported by checkCallInOuts.
    }
  }

  /**
   * Every in-out of a call must be assigned, and assigned something the callee
   * can write back to.
   */
  private checkCallInOuts(expr: FunctionCallExpression, scope: Scope): void {
    const slots = this.calleeSlots(expr, scope);
    if (!slots || !slots.some((s) => s.kind === "inout")) return;

    const byName = new Map<string, Argument>();
    const captured = new Set<string>();
    const positional: Argument[] = [];
    for (const arg of stripEnEno(expr.arguments)) {
      if (arg.name === undefined) positional.push(arg);
      else if (arg.isOutput) captured.add(arg.name.toUpperCase());
      else byName.set(arg.name.toUpperCase(), arg);
    }
    // A parameter list without names fills the slots it has not already
    // claimed, in order.
    let next = 0;
    for (const s of slots) {
      if (next >= positional.length) break;
      if (byName.has(s.name) || captured.has(s.name)) continue;
      byName.set(s.name, positional[next]!);
      next++;
    }

    const callee = expr.functionName.toUpperCase();
    const span = expr.sourceSpan;
    for (const s of slots) {
      if (s.kind !== "inout") continue;
      if (captured.has(s.name)) {
        this.addError(
          `'${callee}' captures in-out '${s.name}' with '=>' — an in-out is assigned with ':='`,
          span.startLine,
          span.startCol,
          span.file,
        );
        continue;
      }
      const arg = byName.get(s.name);
      if (!arg) {
        this.addError(
          `'${callee}' leaves in-out '${s.name}' unassigned — every in-out must be assigned in the call`,
          span.startLine,
          span.startCol,
          span.file,
        );
        continue;
      }
      this.checkInOutActual(callee, s, arg, scope);
    }
  }

  /** What a call may assign to an in-out. */
  private checkInOutActual(
    callee: string,
    target: InOutSlot,
    arg: Argument,
    scope: Scope,
  ): void {
    const slotName = target.name;
    let value = arg.value;
    while (value.kind === "ParenthesizedExpression") value = value.expression;
    const span = value.sourceSpan;

    if (value.kind !== "VariableExpression") {
      this.addError(
        `Only a variable may be assigned to in-out '${slotName}' of '${callee}' — a literal or the result of an expression has nowhere to write back to`,
        span.startLine,
        span.startCol,
        span.file,
      );
      return;
    }

    // An element or field of a variable is still that variable, so the root of
    // the chain is what has to be writable.
    const sym = scope.lookup(value.name);
    if (!sym) return;
    if (sym.kind === "constant") {
      this.addError(
        `'${value.name}' is CONSTANT and cannot be assigned to in-out '${slotName}' of '${callee}'`,
        span.startLine,
        span.startCol,
        span.file,
      );
      return;
    }
    if (sym.kind !== "variable") return;
    if (sym.isInput) {
      this.addError(
        `'${value.name}' is a VAR_INPUT and cannot be assigned to in-out '${slotName}' of '${callee}' — the callee may write to it`,
        span.startLine,
        span.startCol,
        span.file,
      );
      return;
    }

    // The callee writes back through the caller's own storage, so both sides
    // must be the same type — nothing is widened either way. Only a whole
    // elementary variable is compared; an element or field would need its type
    // resolved through the chain first.
    if (
      value.subscripts.length > 0 ||
      value.fieldAccess.length > 0 ||
      value.isDereference
    ) {
      return;
    }
    const actual = sym.declaration.type.name.toUpperCase();
    if (
      actual === target.type ||
      ELEMENTARY_TYPES[actual] === undefined ||
      ELEMENTARY_TYPES[target.type] === undefined
    ) {
      return;
    }
    this.addError(
      `'${value.name}' is ${actual} but in-out '${slotName}' of '${callee}' is ${target.type} — an in-out is not converted`,
      span.startLine,
      span.startCol,
      span.file,
    );
  }

  /** An in-out belongs to the block's own body and to the call, nowhere else. */
  private checkRemoteInOutAccess(expr: VariableExpression, scope: Scope): void {
    const field = expr.fieldAccess[0];
    if (field === undefined) return;
    const fb = this.fbTypeOf(expr.name, scope);
    if (!fb) return;
    const wanted = field.toUpperCase();
    if (
      !this.fbSlots(fb).some((s) => s.kind === "inout" && s.name === wanted)
    ) {
      return;
    }
    this.addError(
      `'${expr.name}.${field}' reaches an in-out of '${fb.name}' from outside it — an in-out is available only in the block's own body and in the call`,
      expr.sourceSpan.startLine,
      expr.sourceSpan.startCol,
      expr.sourceSpan.file,
    );
  }

  /** A method cannot reach the in-outs of the block that owns it. */
  private checkMethodInOutAccess(
    method: MethodDeclaration,
    methodScope: Scope,
    fbScope: Scope,
  ): void {
    for (const stmt of method.body) {
      walkAST(stmt, (node) => {
        if (node.kind !== "VariableExpression") return;
        const expr = node as VariableExpression;
        if (methodScope.lookupLocal(expr.name)) return;
        const outer = fbScope.lookupLocal(expr.name);
        if (outer?.kind !== "variable" || !outer.isInOut) return;
        this.addError(
          `'${expr.name}' is an in-out of the function block and is not available in a method`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
      });
    }
  }

  /**
   * Collect located CONFIGURATION VAR_GLOBALs.
   *
   * These are NOT gathered by buildVarBlockSymbols: that runs per POU scope
   * (program / function / functionBlock) over ast.programs et al, while
   * configuration globals live in ast.configurations[].varBlocks. Without this
   * they escaped every located-variable rule, so a POU-local `VAR ... AT %MX0.0`
   * and a `VAR_GLOBAL ... AT %MX0.0` could both claim the same image slot — and
   * they are serviced by different paths (the owning task vs. the dispatcher at
   * the quiescent frame boundary), which makes the outcome nondeterministic.
   *
   * Globals sharing a name across configurations are one canonical global (codegen
   * emits a single file-scope singleton, deduping by name), so dedupe here too —
   * otherwise a project declaring the same global in two configurations would
   * report a spurious duplicate-address error against itself.
   */
  private collectConfigurationLocatedVars(
    ast: CompilationUnit,
  ): LocatedVarInfo[] {
    const collected: LocatedVarInfo[] = [];
    const seen = new Set<string>();

    for (const config of ast.configurations) {
      for (const block of config.varBlocks) {
        if (block.blockType !== "VAR_GLOBAL") continue;
        for (const decl of block.declarations) {
          if (!decl.address) continue;
          for (const name of decl.names) {
            const key = name.toUpperCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const parsed = parseAddress(decl.address);
            if (!parsed) {
              this.addError(
                unusableAddressMessage(decl),
                decl.sourceSpan.startLine,
                decl.sourceSpan.startCol,
                decl.sourceSpan.file,
              );
              continue;
            }
            collected.push({
              name,
              address: decl.address,
              parsed,
              typeName: decl.type.name,
              scopeType: "configuration",
              scopeName: config.name,
              declaration: decl,
            });
          }
        }
      }
    }
    return collected;
  }

  /**
   * How many times each PROGRAM type is instantiated across all configurations.
   * Keyed by upper-cased program type name.
   */
  private countProgramInstantiations(
    ast: CompilationUnit,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const config of ast.configurations) {
      for (const resource of config.resources) {
        for (const instance of resource.programInstances) {
          const key = instance.programType.toUpperCase();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    return counts;
  }

  /**
   * Validate located variables for IEC 61131-3 compliance.
   * Checks:
   * - Located variables not allowed in function blocks
   * - Located variables not allowed in a PROGRAM instantiated more than once
   * - No duplicate addresses (POU-local and configuration globals together)
   * - Type must be compatible with address size
   * - Bit index must be 0-7 for bit addresses
   */
  private validateLocatedVariables(ast: CompilationUnit): void {
    /** Slot ranges already claimed, keyed by bank (`area + size`). */
    const claimedSlots = new Map<
      string,
      Array<{ start: number; end: number; owner: LocatedVarInfo }>
    >();
    const instanceCounts = this.countProgramInstantiations(ast);

    // Configuration globals participate in every rule below, above all in the
    // duplicate-address check they were previously invisible to.
    const allLocatedVars = [
      ...this.locatedVars,
      ...this.collectConfigurationLocatedVars(ast),
    ];

    for (const locVar of allLocatedVars) {
      const decl = locVar.declaration;

      // Rule 1: Located variables not allowed in function blocks
      if (locVar.scopeType === "functionBlock") {
        this.addError(
          `Located variable '${locVar.name}' at ${locVar.address} not allowed in FUNCTION_BLOCK '${locVar.scopeName}'. Located variables can only be declared in PROGRAM or VAR_GLOBAL scope.`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
          decl.sourceSpan.file,
        );
        continue;
      }

      // Rule 1b: a fully specified address cannot live in a PROGRAM that is
      // instantiated more than once. Same reasoning as Rule 1 for function
      // blocks: a physical address belongs to exactly one point of hardware, so
      // several instances of one POU type cannot each own it. IEC 61131-3 permits
      // multiple program instances, and its answer for per-instance addressing is
      // a partly specified location (`AT %I*`) resolved by VAR_CONFIG — which is
      // not supported here, so the fully specified form must be rejected.
      //
      // Left unchecked this fails silently rather than loudly: codegen allocates
      // one locatedVars[] slot per *declaration*, and each instance's constructor
      // overwrites its pointer, so the last instance constructed wins and the
      // other instances' copies of the variable are never serviced at all.
      if (locVar.scopeType === "program") {
        const instances =
          instanceCounts.get(locVar.scopeName.toUpperCase()) ?? 0;
        if (instances > 1) {
          this.addError(
            `Located variable '${locVar.name}' at ${locVar.address} not allowed in PROGRAM '${locVar.scopeName}': the program is instantiated ${instances} times, and a physical address cannot be shared by several instances. Declare the variable in CONFIGURATION VAR_GLOBAL and access it with VAR_EXTERNAL, or instantiate '${locVar.scopeName}' only once.`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
            decl.sourceSpan.file,
          );
          continue;
        }
      }

      // Rule 2: the type must fit the address size, and (for an array) the
      // array must have a linear run of addresses to occupy at all.
      const shape = resolveLocatedShape(decl.type, ast);
      if (shape.reason !== undefined) {
        this.addError(
          `Located variable '${locVar.name}' at ${locVar.address} cannot be placed: ${shape.reason}.`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
          decl.sourceSpan.file,
        );
        continue;
      }

      const compatibleTypes = getCompatibleTypes(locVar.parsed.size);
      if (!compatibleTypes.includes(shape.elementTypeName.toUpperCase())) {
        // For an array the mismatch is in the ELEMENT type, so say so —
        // "Type 'ARRAY [0..66] OF STRING'" would point at the wrong half of
        // the declaration.
        const subject =
          shape.slotCount > 1
            ? `Array element type '${shape.elementTypeName}'`
            : `Type '${shape.elementTypeName}'`;
        this.addError(
          `${subject} is not compatible with address size '${locVar.parsed.size}' in '${locVar.address}'. Expected one of: ${compatibleTypes.join(", ")}`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
          decl.sourceSpan.file,
        );
      }

      // Rule 3: Validate bit index is 0-7 for bit addresses
      if (
        locVar.parsed.size === "X" &&
        (locVar.parsed.bitIndex < 0 || locVar.parsed.bitIndex > 7)
      ) {
        this.addError(
          `Bit index ${locVar.parsed.bitIndex} out of range (0-7) in address '${locVar.address}'`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
          decl.sourceSpan.file,
        );
      }

      // Rule 4: no two declarations may claim the same slot.
      //
      // Overlap, not equality: an array occupies `slotCount` consecutive
      // slots, so `x AT %MW60 : ARRAY [0..66] OF WORD` collides with a plain
      // `y AT %MW61 : WORD` even though the two addresses differ. Comparing
      // addresses for equality (which is all that was needed while every
      // declaration took exactly one slot) would let the second variable
      // silently share storage with an element of the first.
      const bank = bankKey(locVar.parsed);
      const start = firstSlot(locVar.parsed);
      const end = start + shape.slotCount - 1;

      const claimsInBank = claimedSlots.get(bank) ?? [];
      const clash = claimsInBank.find((c) => start <= c.end && c.start <= end);
      if (clash) {
        this.addError(
          `Duplicate address ${locVar.address}: variable '${locVar.name}' conflicts with '${clash.owner.name}'${
            clash.end > clash.start || end > start
              ? ` (${clash.owner.name} occupies ${clash.owner.address} onwards)`
              : ""
          }`,
          decl.sourceSpan.startLine,
          decl.sourceSpan.startCol,
          decl.sourceSpan.file,
        );
      } else {
        claimsInBank.push({ start, end, owner: locVar });
        claimedSlots.set(bank, claimsInBank);
      }
    }
  }

  /**
   * Validate variable block modifiers (CONSTANT, RETAIN).
   * Checks:
   * - RETAIN + CONSTANT mutual exclusion
   * - CONSTANT requires initializer
   * - Block type restrictions for CONSTANT
   * - Block type restrictions for RETAIN
   */
  /**
   * Validate variable block modifiers (CONSTANT, RETAIN, NON_RETAIN,
   * PERSISTENT).
   *
   * PERSISTENT has already folded into `isRetain` by the time it gets here (see
   * `VarBlock.isRetain`), so there is nothing PERSISTENT-specific to check.
   * NON_RETAIN is the default spelled out, so it is accepted wherever a plain
   * `VAR` would be — including on `VAR_TEMP`, where it is redundant but true,
   * and rejecting a correct statement would fail a CODESYS import for no gain.
   */
  private validateVarModifiers(
    block: VarBlock,
    hasInstanceState: boolean,
  ): void {
    const blockType = block.blockType;

    // ---- Contradictions, checked first: once two qualifiers disagree there is
    // no single intent left to validate the rest against. ------------------
    if (block.isRetain && block.isConstant) {
      this.addError(
        "Variable cannot be both RETAIN and CONSTANT",
        block.sourceSpan.startLine,
        block.sourceSpan.startCol,
        block.sourceSpan.file,
      );
      return;
    }

    if (block.isNonRetain && block.isRetain) {
      this.addError(
        "Variable cannot be both RETAIN and NON_RETAIN",
        block.sourceSpan.startLine,
        block.sourceSpan.startCol,
        block.sourceSpan.file,
      );
      return;
    }

    if (block.isNonRetain && block.isConstant) {
      this.addError(
        "Variable cannot be both CONSTANT and NON_RETAIN",
        block.sourceSpan.startLine,
        block.sourceSpan.startCol,
        block.sourceSpan.file,
      );
      return;
    }

    // ---- CONSTANT ---------------------------------------------------------
    if (block.isConstant) {
      // CONSTANT requires initializer (except VAR_INPUT — caller provides value
      // — and VAR_EXTERNAL, whose value is the global's)
      if (blockType !== "VAR_INPUT" && blockType !== "VAR_EXTERNAL") {
        for (const decl of block.declarations) {
          if (!decl.initialValue) {
            const names = decl.names.join(", ");
            this.addError(
              `CONSTANT variable '${names}' must have an initializer`,
              decl.sourceSpan.startLine,
              decl.sourceSpan.startCol,
              decl.sourceSpan.file,
            );
          }
        }
      }

      if (blockType === "VAR_OUTPUT") {
        this.addError(
          "VAR_OUTPUT cannot be CONSTANT",
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
          block.sourceSpan.file,
        );
      } else if (blockType === "VAR_IN_OUT") {
        this.addError(
          "VAR_IN_OUT cannot be CONSTANT",
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
          block.sourceSpan.file,
        );
      }
    }

    // ---- RETAIN -----------------------------------------------------------
    if (block.isRetain) {
      // No instance, no state to retain. A FUNCTION is re-entered from scratch
      // on every call and a METHOD's locals live on the stack, so RETAIN there
      // is not a restriction we are imposing — it has nothing to describe.
      // Previously accepted in silence, which is the worst outcome: the user
      // believes a value survives a power cycle and it never did.
      if (!hasInstanceState) {
        this.addError(
          // Deliberately unnamed: the only scope name in reach here is the
          // owning FB's, and a method-level RETAIN reported against the FB
          // name reads as a lie — RETAIN on the FB's own VAR is legal. The
          // source span points at the offending block.
          "RETAIN is not allowed in a FUNCTION or METHOD: there is no instance, so the variables have nothing to retain",
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
          block.sourceSpan.file,
        );
        return;
      }

      // VAR_INPUT and VAR_OUTPUT are deliberately absent: IEC 61131-3 permits
      // RETAIN on VAR, VAR_INPUT, VAR_OUTPUT and VAR_GLOBAL, and CODESYS
      // accepts all four. Refusing the first two rejected function blocks that
      // are valid everywhere else.
      //
      // The three below have no retainable storage of their own:
      //   VAR_IN_OUT   — a reference; the retention belongs to whatever it
      //                  points at.
      //   VAR_TEMP     — transient by definition, re-initialised every
      //                  invocation.
      //   VAR_EXTERNAL — a view onto a VAR_GLOBAL; that declaration is where
      //                  RETAIN belongs, and putting it here would suggest two
      //                  independent answers for one storage location.
      const invalidRetainTypes = ["VAR_IN_OUT", "VAR_TEMP", "VAR_EXTERNAL"];

      if (invalidRetainTypes.includes(blockType)) {
        this.addError(
          `${blockType} cannot be RETAIN`,
          block.sourceSpan.startLine,
          block.sourceSpan.startCol,
          block.sourceSpan.file,
        );
      }
    }

    // ---- VAR_IN_OUT declaration shape -------------------------------------
    if (blockType === "VAR_IN_OUT") {
      for (const decl of block.declarations) {
        // The caller supplies the variable, so there is nothing to initialise.
        if (decl.initialValue) {
          this.addError(
            `VAR_IN_OUT '${decl.names.join(", ")}' cannot have an initial value — the caller supplies the variable`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
            decl.sourceSpan.file,
          );
        }
        // An in-out already refers to the caller's variable.
        if (decl.type.referenceKind !== "none") {
          this.addError(
            `VAR_IN_OUT '${decl.names.join(", ")}' cannot be a reference type`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
            decl.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Add an error message.
   */
  private addError(
    message: string,
    line: number,
    column: number,
    file?: string,
  ): void {
    this.errors.push({
      message,
      line,
      column,
      severity: "error",
      ...(file ? { file } : {}),
    });
  }

  /**
   * Validate that property names don't collide with member variable names
   * within the same function block. A collision causes the setter parameter
   * to silently shadow the member variable.
   */
  private validatePropertyNameCollisions(ast: CompilationUnit): void {
    for (const fb of ast.functionBlocks) {
      if (fb.properties.length === 0) continue;

      // Collect all declared member variable names (case-insensitive)
      const memberNames = new Set<string>();
      for (const block of fb.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            memberNames.add(name.toUpperCase());
          }
        }
      }

      // Check each property name against member names
      for (const prop of fb.properties) {
        if (memberNames.has(prop.name.toUpperCase())) {
          this.addWarning(
            `Property '${prop.name}' in FUNCTION_BLOCK '${fb.name}' has the same name as a member variable. ` +
              `The setter parameter will shadow the member variable.`,
            prop.sourceSpan.startLine,
            prop.sourceSpan.startCol,
            prop.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Validate OOP modifier contradictions on function blocks and methods.
   */
  private validateOOPModifiers(ast: CompilationUnit): void {
    // Build FB lookup map for OVERRIDE and IMPLEMENTS validation
    const fbMap = new Map<string, FunctionBlockDeclaration>();
    for (const fb of ast.functionBlocks) {
      fbMap.set(fb.name.toUpperCase(), fb);
    }

    // Build interface lookup map
    const ifaceMap = new Map<string, Set<string>>();
    for (const iface of ast.interfaces) {
      const methodNames = new Set<string>();
      for (const m of iface.methods) {
        methodNames.add(m.name.toUpperCase());
      }
      ifaceMap.set(iface.name.toUpperCase(), methodNames);
    }

    for (const fb of ast.functionBlocks) {
      // ABSTRACT + FINAL on same FB is contradictory
      if (fb.isAbstract && fb.isFinal) {
        this.addError(
          `FUNCTION_BLOCK '${fb.name}' cannot be both ABSTRACT and FINAL.`,
          fb.sourceSpan.startLine,
          fb.sourceSpan.startCol,
          fb.sourceSpan.file,
        );
      }

      // Collect parent methods for OVERRIDE / FINAL validation
      const parentMethods = this.collectParentMethods(fb, fbMap);

      // Cannot extend a FINAL FB
      if (fb.extends) {
        const parentFB = fbMap.get(fb.extends.toUpperCase());
        if (parentFB && parentFB.isFinal) {
          this.addError(
            `Cannot extend FINAL FUNCTION_BLOCK '${fb.extends}'.`,
            fb.sourceSpan.startLine,
            fb.sourceSpan.startCol,
            fb.sourceSpan.file,
          );
        }
      }

      // ABSTRACT method in non-abstract FB is an error
      for (const method of fb.methods) {
        if (method.isAbstract && !fb.isAbstract) {
          this.addError(
            `Method '${method.name}' is ABSTRACT but FUNCTION_BLOCK '${fb.name}' is not ABSTRACT. ` +
              `ABSTRACT methods can only appear in ABSTRACT function blocks.`,
            method.sourceSpan.startLine,
            method.sourceSpan.startCol,
            method.sourceSpan.file,
          );
        }

        // ABSTRACT + FINAL on same method is contradictory
        if (method.isAbstract && method.isFinal) {
          this.addError(
            `Method '${method.name}' in '${fb.name}' cannot be both ABSTRACT and FINAL.`,
            method.sourceSpan.startLine,
            method.sourceSpan.startCol,
            method.sourceSpan.file,
          );
        }

        // OVERRIDE validation
        if (method.isOverride) {
          if (!fb.extends) {
            this.addError(
              `Method '${method.name}' in '${fb.name}' is marked OVERRIDE but '${fb.name}' does not extend any function block.`,
              method.sourceSpan.startLine,
              method.sourceSpan.startCol,
              method.sourceSpan.file,
            );
          } else {
            const parentMethod = parentMethods.get(method.name.toUpperCase());
            if (!parentMethod) {
              this.addError(
                `Method '${method.name}' in '${fb.name}' is marked OVERRIDE but no method '${method.name}' exists in parent '${fb.extends}'.`,
                method.sourceSpan.startLine,
                method.sourceSpan.startCol,
                method.sourceSpan.file,
              );
            } else {
              // Cannot override a FINAL method
              if (parentMethod.isFinal) {
                this.addError(
                  `Cannot override FINAL method '${method.name}' from '${fb.extends}'.`,
                  method.sourceSpan.startLine,
                  method.sourceSpan.startCol,
                  method.sourceSpan.file,
                );
              }
              // Signature must match parent
              this.validateOverrideSignature(
                method,
                parentMethod,
                fb.name,
                fb.extends,
              );
            }
          }
        }
      }

      // IMPLEMENTS contract validation: check all interface methods are provided
      if (fb.implements && !fb.isAbstract) {
        const fbMethodNames = new Set<string>();
        for (const m of fb.methods) {
          fbMethodNames.add(m.name.toUpperCase());
        }
        // Include inherited methods
        for (const name of parentMethods.keys()) {
          fbMethodNames.add(name);
        }

        for (const ifaceName of fb.implements) {
          const requiredMethods = ifaceMap.get(ifaceName.toUpperCase());
          if (requiredMethods) {
            for (const reqMethod of requiredMethods) {
              if (!fbMethodNames.has(reqMethod)) {
                this.addError(
                  `FUNCTION_BLOCK '${fb.name}' implements '${ifaceName}' but does not provide method '${reqMethod}'.`,
                  fb.sourceSpan.startLine,
                  fb.sourceSpan.startCol,
                  fb.sourceSpan.file,
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Collect all methods from the parent chain of a function block.
   * Returns a map of uppercase method name → nearest parent MethodDeclaration.
   */
  private collectParentMethods(
    fb: FunctionBlockDeclaration,
    fbMap: Map<string, FunctionBlockDeclaration>,
  ): Map<string, MethodDeclaration> {
    const methods = new Map<string, MethodDeclaration>();
    let current = fb.extends;
    const visited = new Set<string>(); // prevent infinite loops on circular extends
    while (current) {
      const upper = current.toUpperCase();
      if (visited.has(upper)) break;
      visited.add(upper);
      const parent = fbMap.get(upper);
      if (!parent) break;
      for (const m of parent.methods) {
        const key = m.name.toUpperCase();
        // Only store the nearest parent's version (first encountered wins)
        if (!methods.has(key)) {
          methods.set(key, m);
        }
      }
      current = parent.extends;
    }
    return methods;
  }

  /**
   * Validate that an OVERRIDE method has the same signature as the parent method.
   */
  private validateOverrideSignature(
    method: MethodDeclaration,
    parentMethod: MethodDeclaration,
    fbName: string,
    parentFBName: string,
  ): void {
    // Extract VAR_INPUT parameters from both methods
    const childParams = this.extractMethodParams(method);
    const parentParams = this.extractMethodParams(parentMethod);

    // Compare parameter count and types
    const childSig = childParams.map((p) => p.type).join(", ") || "void";
    const parentSig = parentParams.map((p) => p.type).join(", ") || "void";

    let mismatch = false;
    if (childParams.length !== parentParams.length) {
      mismatch = true;
    } else {
      for (let i = 0; i < childParams.length; i++) {
        if (
          childParams[i]!.type.toUpperCase() !==
          parentParams[i]!.type.toUpperCase()
        ) {
          mismatch = true;
          break;
        }
      }
    }

    // Compare return types
    const childReturn = method.returnType?.name?.toUpperCase() ?? "";
    const parentReturn = parentMethod.returnType?.name?.toUpperCase() ?? "";
    if (childReturn !== parentReturn) {
      mismatch = true;
    }

    if (mismatch) {
      const childRetStr = method.returnType?.name ?? "void";
      const parentRetStr = parentMethod.returnType?.name ?? "void";
      this.addError(
        `Method '${method.name}' in '${fbName}' has different signature than parent method in '${parentFBName}'. ` +
          `Expected: (${parentSig}) : ${parentRetStr}, got: (${childSig}) : ${childRetStr}.`,
        method.sourceSpan.startLine,
        method.sourceSpan.startCol,
        method.sourceSpan.file,
      );
    }
  }

  /**
   * Extract VAR_INPUT parameter names and types from a method declaration.
   */
  private extractMethodParams(
    method: MethodDeclaration,
  ): Array<{ name: string; type: string }> {
    const params: Array<{ name: string; type: string }> = [];
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push({ name, type: decl.type.name });
          }
        }
      }
    }
    return params;
  }

  /**
   * Validate that abstract function blocks are not instantiated directly.
   */
  private validateAbstractInstantiation(ast: CompilationUnit): void {
    // Build set of abstract FB names
    const abstractFBs = new Set<string>();
    for (const fb of ast.functionBlocks) {
      if (fb.isAbstract) {
        abstractFBs.add(fb.name.toUpperCase());
      }
    }
    if (abstractFBs.size === 0) return;

    // Check variable declarations in programs
    for (const prog of ast.programs) {
      this.checkVarBlocksForAbstractInstantiation(prog.varBlocks, abstractFBs);
    }

    // Check variable declarations in function blocks
    for (const fb of ast.functionBlocks) {
      this.checkVarBlocksForAbstractInstantiation(fb.varBlocks, abstractFBs);
    }

    // Check variable declarations in functions
    for (const func of ast.functions) {
      this.checkVarBlocksForAbstractInstantiation(func.varBlocks, abstractFBs);
    }
  }

  /**
   * Check var blocks for instantiation of abstract FBs.
   */
  private checkVarBlocksForAbstractInstantiation(
    varBlocks: VarBlock[],
    abstractFBs: Set<string>,
  ): void {
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        if (abstractFBs.has(decl.type.name.toUpperCase())) {
          this.addError(
            `Cannot instantiate ABSTRACT FUNCTION_BLOCK '${decl.type.name}'.`,
            decl.sourceSpan.startLine,
            decl.sourceSpan.startCol,
            decl.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Validate that properties without setters are not written to.
   * Best-effort check for direct `x.Property := value;` assignments.
   */
  private validatePropertyAccess(ast: CompilationUnit): void {
    // Build property info map: "FBNAME.PROPNAME" → { hasSetter }
    const propertyInfo = new Map<string, { hasSetter: boolean }>();
    for (const fb of ast.functionBlocks) {
      for (const prop of fb.properties) {
        const key = `${fb.name.toUpperCase()}.${prop.name.toUpperCase()}`;
        propertyInfo.set(key, { hasSetter: prop.setter !== undefined });
      }
    }
    if (propertyInfo.size === 0) return;

    // Build a map of variable name (uppercase) → FB type name (uppercase) for each scope
    const checkStatementsInScope = (
      stmts: Statement[],
      varTypeMap: Map<string, string>,
    ) => {
      this.walkStatementsForPropertyWrites(stmts, varTypeMap, propertyInfo);
    };

    // Check programs
    for (const prog of ast.programs) {
      const varTypeMap = this.buildVarTypeMap(prog.varBlocks);
      checkStatementsInScope(prog.body, varTypeMap);
    }

    // Check function blocks (body and method bodies)
    for (const fb of ast.functionBlocks) {
      const varTypeMap = this.buildVarTypeMap(fb.varBlocks);
      checkStatementsInScope(fb.body, varTypeMap);
      for (const method of fb.methods) {
        const methodVarMap = new Map(varTypeMap);
        // Add method-local vars
        for (const [k, v] of this.buildVarTypeMap(method.varBlocks)) {
          methodVarMap.set(k, v);
        }
        checkStatementsInScope(method.body, methodVarMap);
      }
    }

    // Check functions
    for (const func of ast.functions) {
      const varTypeMap = this.buildVarTypeMap(func.varBlocks);
      checkStatementsInScope(func.body, varTypeMap);
    }
  }

  /**
   * Build a map of variable name (uppercase) → type name (uppercase) from var blocks.
   */
  private buildVarTypeMap(varBlocks: VarBlock[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          map.set(name.toUpperCase(), decl.type.name.toUpperCase());
        }
      }
    }
    return map;
  }

  /**
   * Walk statements looking for assignments to read-only properties.
   */
  private walkStatementsForPropertyWrites(
    stmts: Statement[],
    varTypeMap: Map<string, string>,
    propertyInfo: Map<string, { hasSetter: boolean }>,
  ): void {
    for (const stmt of stmts) {
      if (stmt.kind === "AssignmentStatement") {
        const target = stmt.target;
        // Check for x.Property := value pattern
        if (
          target.kind === "VariableExpression" &&
          target.fieldAccess.length === 1
        ) {
          const varType = varTypeMap.get(target.name.toUpperCase());
          if (varType) {
            const fieldName = target.fieldAccess[0]!;
            const propKey = `${varType}.${fieldName.toUpperCase()}`;
            const info = propertyInfo.get(propKey);
            if (info && !info.hasSetter) {
              this.addError(
                `Property '${fieldName}' of '${varType}' is read-only (no SET accessor).`,
                stmt.sourceSpan.startLine,
                stmt.sourceSpan.startCol,
                stmt.sourceSpan.file,
              );
            }
          }
        }
      }
      // Recurse into control flow
      this.recurseStatementsForPropertyWrites(stmt, varTypeMap, propertyInfo);
    }
  }

  /**
   * Recurse into control flow statements for property write checks.
   */
  private recurseStatementsForPropertyWrites(
    stmt: Statement,
    varTypeMap: Map<string, string>,
    propertyInfo: Map<string, { hasSetter: boolean }>,
  ): void {
    if (stmt.kind === "IfStatement") {
      const s = stmt as unknown as {
        thenStatements: Statement[];
        elsifClauses: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      this.walkStatementsForPropertyWrites(
        s.thenStatements,
        varTypeMap,
        propertyInfo,
      );
      for (const clause of s.elsifClauses) {
        this.walkStatementsForPropertyWrites(
          clause.statements,
          varTypeMap,
          propertyInfo,
        );
      }
      this.walkStatementsForPropertyWrites(
        s.elseStatements,
        varTypeMap,
        propertyInfo,
      );
    } else if (stmt.kind === "ForStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForPropertyWrites(s.body, varTypeMap, propertyInfo);
    } else if (stmt.kind === "WhileStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForPropertyWrites(s.body, varTypeMap, propertyInfo);
    } else if (stmt.kind === "RepeatStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForPropertyWrites(s.body, varTypeMap, propertyInfo);
    } else if (stmt.kind === "CaseStatement") {
      const s = stmt as unknown as {
        cases: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      for (const c of s.cases) {
        this.walkStatementsForPropertyWrites(
          c.statements,
          varTypeMap,
          propertyInfo,
        );
      }
      this.walkStatementsForPropertyWrites(
        s.elseStatements,
        varTypeMap,
        propertyInfo,
      );
    }
  }

  // =============================================================================
  // Bit Access & ADR Expression Validation
  // =============================================================================

  // IEC_TYPE_BITS removed — use getTypeBits() from type-utils.ts

  /**
   * Validate expressions across all programs, functions, and FBs.
   * Checks std function argument counts, bit access bounds, and ADR l-value targets.
   */
  private validateExpressions(ast: CompilationUnit): void {
    for (const prog of ast.programs) {
      const varTypeMap = this.buildVarTypeMap(prog.varBlocks);
      this.walkStatementsForExpressionValidation(prog.body, varTypeMap, ast);
    }
    for (const func of ast.functions) {
      const varTypeMap = this.buildVarTypeMap(func.varBlocks);
      this.walkStatementsForExpressionValidation(func.body, varTypeMap, ast);
    }
    for (const fb of ast.functionBlocks) {
      const varTypeMap = this.buildVarTypeMap(fb.varBlocks);
      this.walkStatementsForExpressionValidation(fb.body, varTypeMap, ast);
      for (const method of fb.methods) {
        const methodVarTypeMap = this.buildVarTypeMap(method.varBlocks);
        // Merge FB vars into method scope (method can access FB members)
        for (const [k, v] of varTypeMap) {
          if (!methodVarTypeMap.has(k)) methodVarTypeMap.set(k, v);
        }
        this.walkStatementsForExpressionValidation(
          method.body,
          methodVarTypeMap,
          ast,
        );
      }
    }
  }

  /**
   * Walk statements checking expressions for bit access bounds and ADR l-value issues.
   */
  private walkStatementsForExpressionValidation(
    stmts: Statement[],
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    for (const stmt of stmts) {
      // Check expressions in assignments
      if (stmt.kind === "AssignmentStatement") {
        this.validateExpression(stmt.target, varTypeMap, ast);
        this.validateExpression(stmt.value, varTypeMap, ast);
      } else if (stmt.kind === "RefAssignStatement") {
        this.validateExpression(stmt.target, varTypeMap, ast);
        this.validateExpression(stmt.source, varTypeMap, ast);
      } else if (stmt.kind === "FunctionCallStatement") {
        this.validateExpression(stmt.call, varTypeMap, ast);
      }
      // Recurse into control flow
      this.recurseStatementsForExpressionValidation(stmt, varTypeMap, ast);
    }
  }

  /**
   * Recurse into control flow statements for expression validation.
   */
  private recurseStatementsForExpressionValidation(
    stmt: Statement,
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    if (stmt.kind === "IfStatement") {
      this.validateExpression(stmt.condition, varTypeMap, ast);
      this.walkStatementsForExpressionValidation(
        stmt.thenStatements,
        varTypeMap,
        ast,
      );
      for (const clause of stmt.elsifClauses) {
        this.validateExpression(clause.condition, varTypeMap, ast);
        this.walkStatementsForExpressionValidation(
          clause.statements,
          varTypeMap,
          ast,
        );
      }
      this.walkStatementsForExpressionValidation(
        stmt.elseStatements,
        varTypeMap,
        ast,
      );
    } else if (stmt.kind === "ForStatement") {
      this.validateExpression(stmt.start, varTypeMap, ast);
      this.validateExpression(stmt.end, varTypeMap, ast);
      if (stmt.step) this.validateExpression(stmt.step, varTypeMap, ast);
      this.walkStatementsForExpressionValidation(stmt.body, varTypeMap, ast);
    } else if (stmt.kind === "WhileStatement") {
      this.validateExpression(stmt.condition, varTypeMap, ast);
      this.walkStatementsForExpressionValidation(stmt.body, varTypeMap, ast);
    } else if (stmt.kind === "RepeatStatement") {
      this.walkStatementsForExpressionValidation(stmt.body, varTypeMap, ast);
      this.validateExpression(stmt.condition, varTypeMap, ast);
    } else if (stmt.kind === "CaseStatement") {
      this.validateExpression(stmt.selector, varTypeMap, ast);
      for (const c of stmt.cases) {
        this.walkStatementsForExpressionValidation(
          c.statements,
          varTypeMap,
          ast,
        );
      }
      this.walkStatementsForExpressionValidation(
        stmt.elseStatements,
        varTypeMap,
        ast,
      );
    }
  }

  /**
   * Validate a single expression recursively for std function args, bit access, and ADR issues.
   */
  private validateExpression(
    expr: Expression,
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    // Check bit access bounds on variable expressions
    if (expr.kind === "VariableExpression") {
      this.checkBitAccess(expr, varTypeMap, ast, expr.subscripts.length > 0);
      this.checkMemberAccess(expr, varTypeMap);
    }
    if (expr.kind === "FunctionCallExpression") {
      this.checkCalleeMemberAccess(expr, varTypeMap);
    }

    // Validate arguments bound to a generic parameter
    if (expr.kind === "FunctionCallExpression") {
      this.checkGenericArgs(expr, varTypeMap, ast);
    }

    // Validate standard function argument counts and ADR l-value requirement
    if (
      expr.kind === "FunctionCallExpression" &&
      !expr.functionName.includes(".")
    ) {
      this.checkStdFunctionArgs(expr);
      this.checkVarInfoArg(expr, varTypeMap);
    }

    // Recurse into sub-expressions
    if (expr.kind === "BinaryExpression") {
      this.validateExpression(expr.left, varTypeMap, ast);
      this.validateExpression(expr.right, varTypeMap, ast);
    } else if (expr.kind === "UnaryExpression") {
      this.validateExpression(expr.operand, varTypeMap, ast);
    } else if (expr.kind === "FunctionCallExpression") {
      for (const arg of expr.arguments) {
        this.validateExpression(arg.value, varTypeMap, ast);
      }
    } else if (expr.kind === "MethodCallExpression") {
      this.validateExpression(expr.object, varTypeMap, ast);
      for (const arg of expr.arguments) {
        this.validateExpression(arg.value, varTypeMap, ast);
      }
    } else if (expr.kind === "ParenthesizedExpression") {
      this.validateExpression(expr.expression, varTypeMap, ast);
    }
  }

  /**
   * Check if an expression is a valid l-value (can have its address taken).
   */
  private isLValue(expr: Expression): boolean {
    return (
      expr.kind === "VariableExpression" ||
      (expr.kind === "ParenthesizedExpression" &&
        this.isLValue(expr.expression))
    );
  }

  /**
   * Validate standard function argument counts and special constraints (e.g., ADR l-value).
   * Covers all registered std functions and *_TO_* conversion functions.
   *
   * EN and ENO are implicit IEC 61131-3 pins — they gate execution and signal
   * success around the call site, but they are not part of any function's
   * declared signature. Strip them before counting against the registry.
   */
  /**
   * Check arguments passed to a generic parameter. Two rules, both CODESYS's:
   * the argument must be a variable, since the parameter is an address; and
   * its type must be one the declared generic accepts. Concrete parameters are
   * left to C++, but a REAL handed to an ANY_INT still produces valid C++ —
   * a descriptor stamped TYPE_REAL — so this check is the only guard.
   */
  private checkGenericArgs(
    expr: FunctionCallExpression,
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
  ): void {
    // The callee is an FB instance; its declared type names the FB.
    const instanceType = varTypeMap.get(expr.functionName.toUpperCase());
    if (!instanceType) return;

    const fb = ast.functionBlocks.find(
      (candidate) =>
        candidate.name.toUpperCase() === instanceType.toUpperCase(),
    );
    if (!fb) return;

    // Which of its VAR_INPUTs are generic, and with which family.
    const generics = new Map<string, string>();
    for (const block of fb.varBlocks) {
      if (block.blockType !== "VAR_INPUT") continue;
      for (const decl of block.declarations) {
        if (!isDeclarableGenericType(decl.type.name)) continue;
        for (const name of decl.names) {
          generics.set(name.toUpperCase(), decl.type.name.toUpperCase());
        }
      }
    }
    if (generics.size === 0) return;

    for (const arg of expr.arguments) {
      if (!arg.name) continue;
      const generic = generics.get(arg.name.toUpperCase());
      if (!generic) continue;

      const where = `argument '${arg.name}' of '${fb.name}'`;

      if (arg.value.kind !== "VariableExpression") {
        this.addError(
          `Only a variable may be passed to the generic parameter '${arg.name}' of '${fb.name}' — ` +
            "a literal, a constant or the result of an expression has no address to pass",
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
        continue;
      }

      // The type of the ARGUMENT, not of the variable it starts from:
      // `aTemps[i]` is a VariableExpression carrying subscripts, so a lookup
      // keyed on the name reports the array and refuses the element, which
      // CODESYS admits. The type checker has already walked the chain, so
      // prefer its answer; the map is the fallback for a plain variable.
      const resolved = arg.value.resolvedType;
      const argType =
        resolved?.typeKind === "elementary"
          ? (resolved as ElementaryType).name
          : varTypeMap.get(arg.value.name.toUpperCase());
      if (!argType) continue;

      // A composite is accepted, and the class names the composite: an array
      // arrives as TYPE_ARRAY, a structure TYPE_USERDEF, an enumeration
      // TYPE_ENUM.
      const categories = this.genericCategoriesFor(argType);
      if (!categories) {
        this.addError(
          `Type '${argType}' cannot be passed as ${where}: a generic parameter takes an elementary type, an array, a structure or an enumeration`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
        continue;
      }

      if (!categories.includes(generic)) {
        this.addError(
          `Type '${argType}' cannot be passed as ${where}, declared '${generic}'`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
      }
    }
  }

  /**
   * `__VARINFO(x)` describes a VARIABLE, so the argument has to be one.
   *
   * Checked here, not left to codegen: an argument codegen cannot describe
   * used to reach the generated C++ as a call to a nonexistent function.
   */
  private checkVarInfoArg(
    expr: FunctionCallExpression,
    varTypeMap: Map<string, string>,
  ): void {
    if (expr.functionName.toUpperCase() !== "__VARINFO") return;
    const arg = stripEnEno(expr.arguments)[0]?.value;
    if (!arg) return;

    if (arg.kind !== "VariableExpression") {
      this.addError(
        "Only a variable may be passed to __VARINFO — it describes where a " +
          "variable lives, and a literal or an expression has no storage to describe",
        expr.sourceSpan.startLine,
        expr.sourceSpan.startCol,
        expr.sourceSpan.file,
      );
      return;
    }

    // A descriptor describes another variable; describing the descriptor
    // itself is almost certainly a mistake, and nothing downstream can render
    // one as a TYPE_CLASS.
    const typeName = varTypeMap.get(arg.name.toUpperCase());
    if (typeName === undefined) return;
    if (isAnyDescriptorType(typeName) || isVarInfoType(typeName)) {
      this.addError(
        `'${typeName}' cannot be passed to __VARINFO: it already describes a ` +
          "variable rather than being one",
        expr.sourceSpan.startLine,
        expr.sourceSpan.startCol,
        expr.sourceSpan.file,
      );
    }
  }

  private checkStdFunctionArgs(expr: FunctionCallExpression): void {
    const nameUpper = expr.functionName.toUpperCase();
    const userArgs = stripEnEno(expr.arguments);
    const argCount = userArgs.length;

    // Look up in std function registry
    const desc = this.stdRegistry.lookup(nameUpper);
    if (desc) {
      if (desc.isVariadic) {
        const minArgs = desc.minArgs ?? desc.params.length;
        if (argCount < minArgs) {
          this.addError(
            `'${nameUpper}' requires at least ${minArgs} argument(s), got ${argCount}`,
            expr.sourceSpan.startLine,
            expr.sourceSpan.startCol,
            expr.sourceSpan.file,
          );
        }
      } else {
        const expected = desc.params.length;
        if (argCount !== expected) {
          this.addError(
            `'${nameUpper}' requires ${expected} argument(s), got ${argCount}`,
            expr.sourceSpan.startLine,
            expr.sourceSpan.startCol,
            expr.sourceSpan.file,
          );
        }
      }
    } else if (this.stdRegistry.resolveConversion(nameUpper)) {
      // *_TO_* conversion functions always take exactly 1 argument
      if (argCount !== 1) {
        this.addError(
          `'${nameUpper}' requires 1 argument, got ${argCount}`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
      }
    } else {
      // Library or user-defined function (not a built-in registry function).
      // Every input WITHOUT an initial value is mandatory; inputs WITH one are
      // optional (the compiler supplies the default). A call that leaves a
      // mandatory input unsupplied — e.g. a graphical block with an
      // unconnected required pin, or hand-written ST missing an argument — is
      // a compile error here, instead of a confusing failure further down
      // (the C++ compiler for library functions, or silent zero-fill for
      // user functions). Function-block invocations resolve to a variable,
      // not a function, so their optional inputs never reach this path.
      const sym = this.symbolTables.globalScope.lookup(nameUpper);
      if (sym?.kind === "function") {
        this.checkRequiredFunctionInputs(expr, sym, userArgs);
      }
    }

    // Additional ADR / REF_LINK constraint: argument must be an l-value
    // (you can only take the address of / a reference to a variable).
    if ((nameUpper === "ADR" || nameUpper === "REF_LINK") && argCount > 0) {
      const arg = userArgs[0]!.value;
      if (!this.isLValue(arg)) {
        this.addError(
          `${nameUpper}() requires a variable reference, not an expression`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
      }
    }

    // EN/ENO type sanity. The codegen wrapper expects EN to evaluate to a
    // boolean and ENO to bind to a boolean l-value; bail early with a clear
    // message rather than letting the C++ compiler explode downstream.
    for (const arg of expr.arguments) {
      if (isEnArgument(arg)) {
        const t = arg.value.resolvedType;
        if (t) {
          const isBool =
            t.typeKind === "elementary" &&
            (t as ElementaryType).name.toUpperCase() === "BOOL";
          if (!isBool) {
            this.addError(
              `'EN' input must be a BOOL expression, got ${describeType(t)}`,
              arg.value.sourceSpan.startLine,
              arg.value.sourceSpan.startCol,
              arg.value.sourceSpan.file,
            );
          }
        }
      } else if (isEnoArgument(arg)) {
        if (!this.isLValue(arg.value)) {
          this.addError(
            "'ENO' output must be bound to a variable",
            arg.value.sourceSpan.startLine,
            arg.value.sourceSpan.startCol,
            arg.value.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Ordered input parameters of a function, each flagged optional when it
   * declares an initial value. Handles both symbol shapes:
   *   - Library functions carry resolved `parameters` (a VariableSymbol per
   *     param; its `initialValue` string marks an optional input).
   *   - User-defined functions carry their VAR_INPUT declarations on
   *     `declaration.varBlocks` (an AST `initialValue` marks an optional one).
   */
  private functionInputParams(
    sym: FunctionSymbol,
  ): Array<{ name: string; optional: boolean }> {
    if (sym.parameters.length > 0) {
      return sym.parameters
        .filter((p) => p.isInput)
        .map((p) => ({
          name: p.name.toUpperCase(),
          optional: p.initialValue !== undefined,
        }));
    }
    const params: Array<{ name: string; optional: boolean }> = [];
    for (const block of sym.declaration.varBlocks) {
      if (block.blockType !== "VAR_INPUT") continue;
      for (const decl of block.declarations) {
        const optional = decl.initialValue !== undefined;
        for (const n of decl.names)
          params.push({ name: n.toUpperCase(), optional });
      }
    }
    return params;
  }

  /**
   * Option A: every input without an initial value is mandatory. Resolve the
   * call's named/positional arguments to parameter slots (mirroring the
   * codegen's argument reordering) and error if any mandatory input is left
   * unsupplied.
   */
  private checkRequiredFunctionInputs(
    expr: FunctionCallExpression,
    sym: FunctionSymbol,
    userArgs: Argument[],
  ): void {
    const inputParams = this.functionInputParams(sym);
    const required = inputParams.filter((p) => !p.optional);
    if (required.length === 0) return;

    // Slots claimed by name; remaining positional args fill the rest in order.
    const satisfied = new Set<string>();
    const positional: Argument[] = [];
    for (const arg of userArgs) {
      if (arg.isOutput) continue; // `=> var` outputs don't fill inputs
      if (arg.name !== undefined) satisfied.add(arg.name.toUpperCase());
      else positional.push(arg);
    }
    let pi = 0;
    for (const p of inputParams) {
      if (pi >= positional.length) break;
      if (satisfied.has(p.name)) continue;
      satisfied.add(p.name);
      pi++;
    }

    const missing = required
      .filter((p) => !satisfied.has(p.name))
      .map((p) => p.name);
    if (missing.length > 0) {
      this.addError(
        `'${expr.functionName.toUpperCase()}' is missing required input${
          missing.length > 1 ? "s" : ""
        }: ${missing.join(", ")}`,
        expr.sourceSpan.startLine,
        expr.sourceSpan.startCol,
        expr.sourceSpan.file,
      );
    }
  }

  /** Descriptor members beyond the three a generic pin carries elsewhere. */
  private static readonly EXTENDED_DESCRIPTOR_FIELDS = new Set([
    "DICOUNT",
    "DISTRIDE",
    "ELEMCLASS",
  ]);

  /**
   * Accepted, and reported: these members are an extension, so a POU reading
   * one does not port to a toolchain that carries only the first three.
   */
  private checkGenericDescriptorField(
    expr: {
      name: string;
      fieldAccess: string[];
      sourceSpan: { startLine: number; startCol: number; file?: string };
    },
    varTypeMap: Map<string, string>,
  ): void {
    const typeName = varTypeMap.get(expr.name.toUpperCase());
    if (!typeName) return;
    if (!isDeclarableGenericType(typeName) && !isAnyDescriptorType(typeName))
      return;

    for (const field of expr.fieldAccess) {
      const upper = field.toUpperCase();
      if (!SemanticAnalyzer.EXTENDED_DESCRIPTOR_FIELDS.has(upper)) continue;
      this.addWarning(
        `${upper} is an extension to the generic descriptor — the portable members are ` +
          `TYPECLASS, PVALUE and DISIZE`,
        expr.sourceSpan.startLine,
        expr.sourceSpan.startCol,
        expr.sourceSpan.file,
      );
      return;
    }
  }

  /**
   * Every element named in an access path is a member of the type it is
   * applied to. IEC 61131-3 §6.4.4.6.1: an element of a structured variable is
   * named by "two or more identifiers or array accesses separated by single
   * periods", the later identifiers naming "the sequence of element names" of
   * the data structure; §6.6.3.4, Table 41 features 6a and 7: an instance's
   * inputs and outputs are reached as `FB_Instance.Input` / `.Output`. A name
   * the type does not declare names nothing — without this, `s.nosuch := TRUE`
   * compiled and only the C++ compiler rejected it, with no ST location.
   *
   * Applied to reads and writes alike: every expression and assignment target
   * goes through validateExpression. The path is walked step by step — fields,
   * array elements and dereferences, nested to any depth — and only a type
   * whose whole member list is known here is judged; anything else (an
   * elementary type, a generic, an interface, a library function block, whose
   * manifest omits inherited members, methods and properties) ends the walk
   * without a verdict.
   */
  private checkMemberAccess(
    expr: VariableExpression,
    varTypeMap: Map<string, string>,
  ): void {
    let steps: readonly AccessStep[];
    if (expr.accessChain && expr.accessChain.length > 0) {
      steps = expr.accessChain;
    } else if (expr.subscripts.length === 0) {
      steps = expr.fieldAccess.map((name) => ({ kind: "field", name }));
    } else {
      return; // legacy shape: field / subscript interleaving unknown
    }
    if (!steps.some((step) => step.kind === "field")) return;
    const base = this.declaredTypeOfName(expr.name, varTypeMap);
    if (base === undefined) return;
    this.checkMemberPath(base, steps, expr.sourceSpan);
  }

  /**
   * The same rule for the instance a call names — `cell.timer(...)`,
   * `pumps[2].valve(...)` — the access paths resolveCallee follows. A trailing
   * field may name a method of the instance before it, so only the steps up to
   * the called instance are judged here; the named-argument check reports a
   * callee that is not a block.
   */
  private checkCalleeMemberAccess(
    expr: FunctionCallExpression,
    varTypeMap: Map<string, string>,
  ): void {
    let baseName: string;
    let steps: AccessStep[];
    if (expr.instance?.kind === "VariableExpression") {
      baseName = expr.instance.name;
      steps = [...(expr.instance.accessChain ?? [])];
      if (steps.length === 0 && expr.instance.fieldAccess.length > 0) {
        if (expr.instance.subscripts.length > 0) return;
        steps = expr.instance.fieldAccess.map((name) => ({
          kind: "field",
          name,
        }));
      }
    } else if (expr.instance) {
      return;
    } else {
      const [head, ...fields] = expr.functionName.split(".");
      baseName = head!;
      steps = fields.map((name) => ({ kind: "field", name }));
    }
    const last = steps[steps.length - 1];
    if (last?.kind === "field") {
      const base = this.declaredTypeOfName(baseName, varTypeMap);
      if (base === undefined) return;
      const owner = this.checkMemberPath(
        base,
        steps.slice(0, -1),
        expr.sourceSpan,
      );
      if (owner === undefined) return;
      // The called element itself: a member instance, or a method.
      const fb = this.symbolTables.lookupFunctionBlock(owner);
      const wanted = last.name.toUpperCase();
      const isMethod = (fb === undefined ? [] : this.fbLineage(fb)).some(
        (block) =>
          block.declaration.methods.some(
            (m) => m.name.toUpperCase() === wanted,
          ),
      );
      if (!isMethod) this.checkMemberPath(owner, [last], expr.sourceSpan);
      return;
    }
    if (!steps.some((step) => step.kind === "field")) return;
    const base = this.declaredTypeOfName(baseName, varTypeMap);
    if (base === undefined) return;
    this.checkMemberPath(base, steps, expr.sourceSpan);
  }

  /** A name's declared type: the POU's own declaration, else a global's. */
  private declaredTypeOfName(
    name: string,
    varTypeMap: Map<string, string>,
  ): string | undefined {
    const local = varTypeMap.get(name.toUpperCase());
    if (local !== undefined) return local;
    const sym = this.symbolTables.globalScope.lookup(name);
    return sym?.kind === "variable" ? sym.declaration?.type?.name : undefined;
  }

  /**
   * Walk `steps` from `typeName`, reporting the first field that the type it
   * is applied to does not declare. A type whose member list is not fully
   * known (a library block) gives no verdict, but a member it does list is
   * still followed, so `lib_fb.out.nosuch` is judged against `out`'s type.
   * Returns the type reached, or undefined once a step leads somewhere that
   * cannot be resolved (or after an error, so one bad path is reported once).
   */
  private checkMemberPath(
    typeName: string,
    steps: readonly AccessStep[],
    span: { startLine: number; startCol: number; file?: string },
  ): string | undefined {
    let current: string | undefined = typeName;
    for (const step of steps) {
      if (current === undefined) return undefined;
      if (step.kind === "dereference") continue;
      if (step.kind === "subscript") {
        current = this.elementTypeOf(current);
        continue;
      }
      // A partial access (`w.3`, `w.%B1`) is checked by checkBitAccess.
      if (parsePartialAccess(step.name)) return undefined;
      const owner = this.declaredMembersOf(current);
      if (owner !== undefined && !owner.members.has(step.name.toUpperCase())) {
        this.addError(
          `'${step.name}' is not a member of ${owner.what}`,
          span.startLine,
          span.startCol,
          span.file,
        );
        return undefined;
      }
      current = this.memberTypeOf(current, step.name);
    }
    return current;
  }

  /**
   * Every member a structure or function block type declares — or undefined
   * when that list is not fully known here, so nothing is reported against it.
   *
   * A structure's elements come from its declaration, local or from a library
   * manifest that exports its fields. A user function block's members are its
   * variables of every section, its methods and properties, those of the
   * blocks it extends, and the implicit EN / ENO (IEC 61131-3 §6.6.3.2, Table
   * 40 note 9). A library block is left out: its manifest carries only its
   * own variables, not what it inherits, nor its methods or properties.
   */
  private declaredMembersOf(
    typeName: string,
  ): { what: string; members: Set<string> } | undefined {
    const { name, definition } = this.typeDefinitionOf(typeName);
    if (definition?.kind === "StructDefinition") {
      const members = new Set<string>();
      for (const field of definition.fields) {
        for (const n of field.names) members.add(n.toUpperCase());
      }
      const declared =
        this.symbolTables.lookupType(name)?.declaration?.declaredName ?? name;
      return { what: `structure type ${declared}`, members };
    }
    if (definition !== undefined) return undefined;
    const fb = this.symbolTables.lookupFunctionBlock(name);
    if (fb === undefined) return undefined;
    const members = new Set<string>(["EN", "ENO"]);
    const lineage = this.fbLineage(fb);
    const top = lineage[lineage.length - 1]!;
    const parent = top.declaration.extends;
    if (parent !== undefined && parent !== "") return undefined; // unknown base
    for (const block of lineage) {
      if (block.libraryName !== undefined) return undefined;
      for (const varBlock of block.declaration.varBlocks) {
        for (const decl of varBlock.declarations) {
          for (const n of decl.names) members.add(n.toUpperCase());
        }
      }
      for (const v of [
        ...block.inputs,
        ...block.outputs,
        ...block.inouts,
        ...block.locals,
      ]) {
        members.add(v.name.toUpperCase());
      }
      for (const m of block.declaration.methods) {
        members.add(m.name.toUpperCase());
      }
      for (const p of block.declaration.properties) {
        members.add(p.name.toUpperCase());
      }
    }
    return { what: `function block type ${fb.name}`, members };
  }

  /**
   * Check bit access bounds on a variable expression.
   * Detects patterns like `var.31` where 31 exceeds the bit width of var's type.
   */
  private checkBitAccess(
    expr: {
      name: string;
      fieldAccess: string[];
      sourceSpan: { startLine: number; startCol: number; file?: string };
    },
    varTypeMap: Map<string, string>,
    ast: CompilationUnit,
    hasSubscripts: boolean,
  ): void {
    if (expr.fieldAccess.length === 0) return;

    this.checkGenericDescriptorField(expr, varTypeMap);

    // Find the first partial access — a bare bit index (`var.31`) or a sized
    // part (`var.%B3`).
    for (let i = 0; i < expr.fieldAccess.length; i++) {
      const field = expr.fieldAccess[i]!;
      const part = parsePartialAccess(field);
      if (!part) continue;

      // Resolve the type of the field chain up to (but not including) the bit index
      let typeName = varTypeMap.get(expr.name.toUpperCase());
      if (!typeName) return;

      // If the variable has subscripts (array indexing), resolve to the element type
      if (i === 0 && hasSubscripts) {
        const elemType = resolveArrayElementType(typeName, ast);
        if (elemType) {
          typeName = elemType;
        } else {
          return; // Can't resolve element type — skip validation
        }
      }

      // Walk intermediate fields to resolve the type
      for (let j = 0; j < i; j++) {
        const intermediateField = expr.fieldAccess[j]!;
        // An earlier partial access — nothing further can be resolved from it.
        if (parsePartialAccess(intermediateField)) return;
        typeName = resolveFieldType(typeName, intermediateField, ast);
        if (!typeName) return;
      }

      const typeUpper = typeName.toUpperCase();
      const bits = getBitAccessWidth(typeUpper);
      if (bits === undefined) {
        // Type doesn't support partial access (REAL, STRING, user-defined, …).
        this.addError(
          `${partLabel(part)} access is not valid on type ${typeName}`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
        return;
      }

      // A part exists only where it is strictly narrower than the variable: a
      // WORD has bytes and bits but no words, and nothing has a part as wide
      // as itself. The count of parts follows from the widths.
      const parts = Math.floor(bits / part.widthBits);
      if (parts <= 1) {
        this.addError(
          `${partLabel(part)} access is not valid on type ${typeName}, which is ${bits} bits wide`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
        return;
      }
      if (part.index >= parts) {
        this.addError(
          `${partLabel(part)} index ${part.index} is out of range for type ${typeName} (0..${parts - 1})`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
        return;
      }

      // Well formed, but on an integer rather than a bit-field type: accepted,
      // and reported. After the bounds checks, so a malformed access gets one
      // clear error rather than an error and an aside.
      if (!isStandardPartialAccessType(typeUpper)) {
        this.addWarning(
          `Partial access on type ${typeName} is an extension — the standard set is BYTE, WORD, DWORD and LWORD`,
          expr.sourceSpan.startLine,
          expr.sourceSpan.startCol,
          expr.sourceSpan.file,
        );
      }
      return; // Only check the first partial access
    }
  }

  // resolveStructFieldType and resolveArrayElementType removed
  // — use resolveFieldType() and resolveArrayElementType() from type-utils.ts

  /**
   * Validate access modifier enforcement for method calls.
   * PRIVATE methods only callable from within same FB.
   * PROTECTED only from same FB or derived FBs.
   */
  private validateAccessModifiers(ast: CompilationUnit): void {
    // Build method visibility map: "FBNAME.METHODNAME" → Visibility
    const methodVisibility = new Map<string, Visibility>();
    for (const fb of ast.functionBlocks) {
      for (const method of fb.methods) {
        const key = `${fb.name.toUpperCase()}.${method.name.toUpperCase()}`;
        methodVisibility.set(key, method.visibility);
      }
    }

    // Build inheritance chain: FB name → set of ancestor FB names (uppercase)
    const fbMap = new Map<string, FunctionBlockDeclaration>();
    for (const fb of ast.functionBlocks) {
      fbMap.set(fb.name.toUpperCase(), fb);
    }

    const getAncestors = (fbName: string): Set<string> => {
      const ancestors = new Set<string>();
      let current = fbMap.get(fbName.toUpperCase())?.extends;
      const visited = new Set<string>();
      while (current) {
        const upper = current.toUpperCase();
        if (visited.has(upper)) break;
        visited.add(upper);
        ancestors.add(upper);
        current = fbMap.get(upper)?.extends;
      }
      return ancestors;
    };

    // Check method calls in programs (caller context: not in any FB)
    for (const prog of ast.programs) {
      const varTypeMap = this.buildVarTypeMap(prog.varBlocks);
      this.walkStatementsForAccessViolations(
        prog.body,
        varTypeMap,
        methodVisibility,
        null,
        getAncestors,
      );
    }

    // Check method calls in functions
    for (const func of ast.functions) {
      const varTypeMap = this.buildVarTypeMap(func.varBlocks);
      this.walkStatementsForAccessViolations(
        func.body,
        varTypeMap,
        methodVisibility,
        null,
        getAncestors,
      );
    }

    // Check method calls in FBs and their methods
    for (const fb of ast.functionBlocks) {
      const varTypeMap = this.buildVarTypeMap(fb.varBlocks);
      this.walkStatementsForAccessViolations(
        fb.body,
        varTypeMap,
        methodVisibility,
        fb.name.toUpperCase(),
        getAncestors,
      );
      for (const method of fb.methods) {
        const methodVarMap = new Map(varTypeMap);
        for (const [k, v] of this.buildVarTypeMap(method.varBlocks)) {
          methodVarMap.set(k, v);
        }
        this.walkStatementsForAccessViolations(
          method.body,
          methodVarMap,
          methodVisibility,
          fb.name.toUpperCase(),
          getAncestors,
        );
      }
    }
  }

  /**
   * Walk statements looking for method calls that violate access modifiers.
   */
  private walkStatementsForAccessViolations(
    stmts: Statement[],
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null, // uppercase name of the FB we're inside, or null
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    for (const stmt of stmts) {
      // Check method calls in FunctionCallStatement
      if (stmt.kind === "FunctionCallStatement") {
        const fcStmt = stmt as unknown as {
          call: {
            kind: string;
            functionName?: string;
            object?: Expression;
            methodName?: string;
            arguments: Array<{ value: Expression }>;
            sourceSpan: { startLine: number; startCol: number; file?: string };
          };
        };
        // Handle dotted FunctionCallExpression: m.Method() → functionName = "m.Method"
        if (
          fcStmt.call.kind === "FunctionCallExpression" &&
          fcStmt.call.functionName?.includes(".")
        ) {
          this.checkDottedFunctionCallAccess(
            fcStmt.call.functionName,
            fcStmt.call.sourceSpan,
            varTypeMap,
            methodVisibility,
            callerFB,
            getAncestors,
          );
        }
        // Handle MethodCallExpression: chained calls
        if (fcStmt.call.kind === "MethodCallExpression") {
          this.checkMethodCallAccess(
            fcStmt.call as {
              object: Expression;
              methodName: string;
              sourceSpan: {
                startLine: number;
                startCol: number;
                file?: string;
              };
            },
            varTypeMap,
            methodVisibility,
            callerFB,
            getAncestors,
          );
        }
      }

      // Check assignment RHS for method calls
      if (stmt.kind === "AssignmentStatement") {
        const value = (stmt as { value: Expression }).value;
        this.walkExpressionForAccessViolations(
          value,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }

      // Recurse into control flow
      this.recurseStatementsForAccessViolations(
        stmt,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    }
  }

  /**
   * Walk an expression tree looking for method calls that violate access modifiers.
   */
  private walkExpressionForAccessViolations(
    expr: Expression,
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    if (expr.kind === "MethodCallExpression") {
      this.checkMethodCallAccess(
        expr as {
          object: Expression;
          methodName: string;
          sourceSpan: { startLine: number; startCol: number; file?: string };
        },
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
      // Also check arguments
      const args = (expr as { arguments: Array<{ value: Expression }> })
        .arguments;
      for (const arg of args) {
        this.walkExpressionForAccessViolations(
          arg.value,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
    } else if (expr.kind === "FunctionCallExpression") {
      const args = (expr as { arguments: Array<{ value: Expression }> })
        .arguments;
      for (const arg of args) {
        this.walkExpressionForAccessViolations(
          arg.value,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
    } else if (expr.kind === "BinaryExpression") {
      const bin = expr as { left: Expression; right: Expression };
      this.walkExpressionForAccessViolations(
        bin.left,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
      this.walkExpressionForAccessViolations(
        bin.right,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (expr.kind === "UnaryExpression") {
      const un = expr as { operand: Expression };
      this.walkExpressionForAccessViolations(
        un.operand,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (expr.kind === "ParenthesizedExpression") {
      const paren = expr as { expression: Expression };
      this.walkExpressionForAccessViolations(
        paren.expression,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    }
  }

  /**
   * Check a dotted FunctionCallExpression (e.g., functionName="m.InternalCalc")
   * for access modifier violations.
   */
  private checkDottedFunctionCallAccess(
    functionName: string,
    sourceSpan: { startLine: number; startCol: number; file?: string },
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    const dotIndex = functionName.indexOf(".");
    if (dotIndex < 0) return;
    const objName = functionName.substring(0, dotIndex);
    const methodName = functionName.substring(dotIndex + 1);

    const calleeFBType = varTypeMap.get(objName.toUpperCase());
    if (!calleeFBType) return;

    const visKey = `${calleeFBType}.${methodName.toUpperCase()}`;
    const visibility = methodVisibility.get(visKey);
    if (!visibility) return;

    if (visibility === "PRIVATE") {
      if (callerFB !== calleeFBType) {
        this.addError(
          `Cannot call PRIVATE method '${methodName}' of '${calleeFBType}' from outside '${calleeFBType}'.`,
          sourceSpan.startLine,
          sourceSpan.startCol,
          sourceSpan.file,
        );
      }
    } else if (visibility === "PROTECTED") {
      if (callerFB !== calleeFBType) {
        const ancestors = callerFB ? getAncestors(callerFB) : new Set<string>();
        if (!ancestors.has(calleeFBType)) {
          this.addError(
            `Cannot call PROTECTED method '${methodName}' of '${calleeFBType}' from '${callerFB ?? "PROGRAM"}'.`,
            sourceSpan.startLine,
            sourceSpan.startCol,
            sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Check a single method call for access modifier violations.
   */
  private checkMethodCallAccess(
    call: {
      object: Expression;
      methodName: string;
      sourceSpan: { startLine: number; startCol: number; file?: string };
    },
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    // Only handle obj.Method() where obj is a simple VariableExpression
    if (call.object.kind !== "VariableExpression") return;
    const varExpr = call.object as { name: string; fieldAccess: string[] };
    if (varExpr.fieldAccess.length > 0) return; // skip chained access for now

    const calleeFBType = varTypeMap.get(varExpr.name.toUpperCase());
    if (!calleeFBType) return;

    const visKey = `${calleeFBType}.${call.methodName.toUpperCase()}`;
    const visibility = methodVisibility.get(visKey);
    if (!visibility) return;

    if (visibility === "PRIVATE") {
      if (callerFB !== calleeFBType) {
        this.addError(
          `Cannot call PRIVATE method '${call.methodName}' of '${calleeFBType}' from outside '${calleeFBType}'.`,
          call.sourceSpan.startLine,
          call.sourceSpan.startCol,
          call.sourceSpan.file,
        );
      }
    } else if (visibility === "PROTECTED") {
      if (callerFB !== calleeFBType) {
        // Check if caller is a derived FB
        const ancestors = callerFB ? getAncestors(callerFB) : new Set<string>();
        if (!ancestors.has(calleeFBType)) {
          this.addError(
            `Cannot call PROTECTED method '${call.methodName}' of '${calleeFBType}' from '${callerFB ?? "PROGRAM"}'.`,
            call.sourceSpan.startLine,
            call.sourceSpan.startCol,
            call.sourceSpan.file,
          );
        }
      }
    }
  }

  /**
   * Recurse into control flow statements for access violation checks.
   */
  private recurseStatementsForAccessViolations(
    stmt: Statement,
    varTypeMap: Map<string, string>,
    methodVisibility: Map<string, Visibility>,
    callerFB: string | null,
    getAncestors: (fbName: string) => Set<string>,
  ): void {
    if (stmt.kind === "IfStatement") {
      const s = stmt as unknown as {
        thenStatements: Statement[];
        elsifClauses: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      this.walkStatementsForAccessViolations(
        s.thenStatements,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
      for (const clause of s.elsifClauses) {
        this.walkStatementsForAccessViolations(
          clause.statements,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
      this.walkStatementsForAccessViolations(
        s.elseStatements,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "ForStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForAccessViolations(
        s.body,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "WhileStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForAccessViolations(
        s.body,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "RepeatStatement") {
      const s = stmt as unknown as { body: Statement[] };
      this.walkStatementsForAccessViolations(
        s.body,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    } else if (stmt.kind === "CaseStatement") {
      const s = stmt as unknown as {
        cases: Array<{ statements: Statement[] }>;
        elseStatements: Statement[];
      };
      for (const c of s.cases) {
        this.walkStatementsForAccessViolations(
          c.statements,
          varTypeMap,
          methodVisibility,
          callerFB,
          getAncestors,
        );
      }
      this.walkStatementsForAccessViolations(
        s.elseStatements,
        varTypeMap,
        methodVisibility,
        callerFB,
        getAncestors,
      );
    }
  }

  // =============================================================================
  // Undefined Type Validation
  // =============================================================================

  /**
   * Check if a type name is known (registered in symbol tables or a synthetic internal type).
   */
  private isKnownType(name: string): boolean {
    const upper = name.toUpperCase();
    // Whitelist synthetic internal types
    if (upper.startsWith("__VLA_") || upper.startsWith("__INLINE_ARRAY_")) {
      return true;
    }
    const sym = this.symbolTables.globalScope.lookup(upper);
    if (!sym) return false;
    return (
      sym.kind === "type" ||
      sym.kind === "functionBlock" ||
      sym.kind === "program"
    );
  }

  /**
   * Validate a single TypeReference node. Reports an error if the referenced type is unknown.
   */
  private validateSingleTypeReference(
    typeRef: TypeReference,
    context: string,
    genericsPermitted = false,
  ): void {
    // Skip empty or VOID type names
    if (!typeRef.name || typeRef.name.toUpperCase() === "VOID") return;

    // For inline arrays, validate the element type instead
    const nameToCheck = typeRef.elementTypeName ?? typeRef.name;

    if (!this.isKnownType(nameToCheck)) {
      this.addError(
        `Undefined type '${nameToCheck}'${context ? " in " + context : ""}`,
        typeRef.sourceSpan.startLine,
        typeRef.sourceSpan.startCol,
        typeRef.sourceSpan.file,
      );
      return;
    }

    // A generic names a family rather than a layout, so it can only be a
    // parameter the caller supplies a concrete argument for. `permitted`
    // defaults false and VAR_INPUT opts in. `ARRAY [*] OF ANY` cannot be
    // written at all: a variable-length array is VAR_IN_OUT only, a generic
    // VAR_INPUT only.
    if (isDeclarableGenericType(nameToCheck)) {
      const asArrayElement = typeRef.elementTypeName !== undefined;
      if (!genericsPermitted || asArrayElement) {
        this.addError(
          `Generic type '${nameToCheck.toUpperCase()}'${context ? " in " + context : ""} — ` +
            "a generic type may only be declared on a VAR_INPUT of a FUNCTION, FUNCTION_BLOCK or METHOD, " +
            "and not as an array element",
          typeRef.sourceSpan.startLine,
          typeRef.sourceSpan.startCol,
          typeRef.sourceSpan.file,
        );
      }
    }
  }

  /**
   * Validate all type references in the AST.
   * Walks variable declarations, return types, EXTENDS/IMPLEMENTS clauses,
   * method parameters, properties, global var blocks, and type definitions.
   */
  private validateTypeReferences(ast: CompilationUnit): void {
    // Helper to validate var blocks
    const validateVarBlocks = (
      varBlocks: VarBlock[],
      context: string,
      // CODESYS declares generics on FUNCTION, FUNCTION_BLOCK and METHOD, and
      // nowhere else. A PROGRAM is not in that list, so it does not opt in.
      genericsAllowedHere = false,
    ) => {
      for (const block of varBlocks) {
        for (const decl of block.declarations) {
          this.validateSingleTypeReference(
            decl.type,
            context,
            genericsAllowedHere && block.blockType === "VAR_INPUT",
          );
        }
      }
    };

    // Programs
    for (const prog of ast.programs) {
      validateVarBlocks(prog.varBlocks, `PROGRAM '${prog.name}'`);
    }

    // Functions — var blocks + return type
    for (const func of ast.functions) {
      validateVarBlocks(func.varBlocks, `FUNCTION '${func.name}'`, true);
      this.validateSingleTypeReference(
        func.returnType,
        `FUNCTION '${func.name}' return type`,
      );
    }

    // Function blocks — var blocks, methods, properties, EXTENDS, IMPLEMENTS
    for (const fb of ast.functionBlocks) {
      validateVarBlocks(fb.varBlocks, `FUNCTION_BLOCK '${fb.name}'`, true);

      // EXTENDS clause
      if (fb.extends) {
        if (!this.isKnownType(fb.extends)) {
          this.addError(
            `Undefined type '${fb.extends}' in EXTENDS clause of FUNCTION_BLOCK '${fb.name}'`,
            fb.sourceSpan.startLine,
            fb.sourceSpan.startCol,
            fb.sourceSpan.file,
          );
        }
      }

      // IMPLEMENTS clause
      if (fb.implements) {
        for (const ifaceName of fb.implements) {
          if (!this.isKnownType(ifaceName)) {
            this.addError(
              `Undefined type '${ifaceName}' in IMPLEMENTS clause of FUNCTION_BLOCK '${fb.name}'`,
              fb.sourceSpan.startLine,
              fb.sourceSpan.startCol,
              fb.sourceSpan.file,
            );
          }
        }
      }

      // Methods — return type + var blocks (parameters)
      for (const method of fb.methods) {
        if (method.returnType) {
          this.validateSingleTypeReference(
            method.returnType,
            `METHOD '${method.name}' of '${fb.name}' return type`,
          );
        }
        validateVarBlocks(
          method.varBlocks,
          `METHOD '${method.name}' of '${fb.name}'`,
          true,
        );
      }

      // Properties
      for (const prop of fb.properties) {
        this.validateSingleTypeReference(
          prop.type,
          `PROPERTY '${prop.name}' of '${fb.name}'`,
        );
      }
    }

    // Interfaces — methods (return type + parameters), EXTENDS
    for (const iface of ast.interfaces) {
      if (iface.extends) {
        for (const baseName of iface.extends) {
          if (!this.isKnownType(baseName)) {
            this.addError(
              `Undefined type '${baseName}' in EXTENDS clause of INTERFACE '${iface.name}'`,
              iface.sourceSpan.startLine,
              iface.sourceSpan.startCol,
              iface.sourceSpan.file,
            );
          }
        }
      }
      for (const method of iface.methods) {
        if (method.returnType) {
          this.validateSingleTypeReference(
            method.returnType,
            `METHOD '${method.name}' of INTERFACE '${iface.name}' return type`,
          );
        }
        // An interface method is a METHOD, which is one of the three scopes
        // CODESYS names. Refusing it here would make a generic method
        // undeclarable in an interface while the function block implementing
        // it declared one happily — so the pair could never be written.
        validateVarBlocks(
          method.varBlocks,
          `METHOD '${method.name}' of INTERFACE '${iface.name}'`,
          true,
        );
      }
    }

    // Global var blocks
    for (const block of ast.globalVarBlocks) {
      for (const decl of block.declarations) {
        this.validateSingleTypeReference(decl.type, "VAR_GLOBAL");
      }
    }

    // Type definitions (struct fields, array element types, subrange base types, etc.)
    for (const typeDecl of ast.types) {
      this.validateTypeDefinitionReferences(typeDecl.name, typeDecl.definition);
    }
  }

  /**
   * Validate type references within a type definition (struct fields, array elements, etc.).
   */
  private validateTypeDefinitionReferences(
    typeName: string,
    def: TypeDefinition,
  ): void {
    switch (def.kind) {
      case "StructDefinition":
        for (const field of def.fields) {
          this.validateSingleTypeReference(field.type, `STRUCT '${typeName}'`);
        }
        break;
      case "ArrayDefinition":
        this.validateSingleTypeReference(
          def.elementType,
          `ARRAY type '${typeName}'`,
        );
        break;
      case "SubrangeDefinition":
        this.validateSingleTypeReference(
          def.baseType,
          `subrange type '${typeName}'`,
        );
        break;
      case "EnumDefinition":
        if (def.baseType) {
          this.validateSingleTypeReference(def.baseType, `ENUM '${typeName}'`);
        }
        break;
      case "TypeReference":
        // Type alias — validate the target type
        this.validateSingleTypeReference(def, `type alias '${typeName}'`);
        break;
    }
  }

  // =============================================================================
  // Undeclared Variable Validation
  // =============================================================================

  /**
   * Validate that all variable references in POU bodies refer to declared variables.
   */
  private validateUndeclaredVariables(ast: CompilationUnit): void {
    // Programs
    for (const prog of ast.programs) {
      const scope = this.symbolTables.getProgramScope(prog.name);
      if (scope) {
        this.walkStatementsForUndeclaredVars(prog.body, scope, {});
      }
    }

    // Functions
    for (const func of ast.functions) {
      const scope = this.symbolTables.getFunctionScope(func.name);
      if (scope) {
        this.walkStatementsForUndeclaredVars(func.body, scope, {
          functionName: func.name,
        });
      }
    }

    // Function blocks
    for (const fb of ast.functionBlocks) {
      const scope = this.symbolTables.getFBScope(fb.name);
      if (scope) {
        this.walkStatementsForUndeclaredVars(fb.body, scope, {
          fbName: fb.name,
        });
        for (const method of fb.methods) {
          const methodScope = this.symbolTables.getMethodScope(
            fb.name,
            method.name,
          );
          this.walkStatementsForUndeclaredVars(
            method.body,
            methodScope ?? scope,
            {
              fbName: fb.name,
              methodName: method.name,
            },
          );
        }
        for (const prop of fb.properties) {
          if (prop.getter) {
            this.walkStatementsForUndeclaredVars(prop.getter, scope, {
              fbName: fb.name,
              propertyName: prop.name,
            });
          }
          if (prop.setter) {
            this.walkStatementsForUndeclaredVars(prop.setter, scope, {
              fbName: fb.name,
              propertyName: prop.name,
            });
          }
        }
      }
    }
  }

  /**
   * Walk statements checking for undeclared variable usage.
   */
  private walkStatementsForUndeclaredVars(
    stmts: Statement[],
    scope: Scope,
    ctx: UndeclaredVarContext,
  ): void {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "AssignmentStatement":
          this.checkExpressionForUndeclaredVars(stmt.target, scope, ctx);
          this.checkExpressionForUndeclaredVars(stmt.value, scope, ctx);
          break;
        case "RefAssignStatement":
          this.checkExpressionForUndeclaredVars(stmt.target, scope, ctx);
          this.checkExpressionForUndeclaredVars(stmt.source, scope, ctx);
          break;
        case "FunctionCallStatement":
          this.checkExpressionForUndeclaredVars(stmt.call, scope, ctx);
          break;
        case "DeleteStatement":
          this.checkExpressionForUndeclaredVars(stmt.pointer, scope, ctx);
          break;
        case "ForStatement":
          this.checkNameDeclared(
            stmt.controlVariable,
            scope,
            ctx,
            stmt.sourceSpan,
          );
          this.checkExpressionForUndeclaredVars(stmt.start, scope, ctx);
          this.checkExpressionForUndeclaredVars(stmt.end, scope, ctx);
          if (stmt.step) {
            this.checkExpressionForUndeclaredVars(stmt.step, scope, ctx);
          }
          this.walkStatementsForUndeclaredVars(stmt.body, scope, ctx);
          break;
        case "IfStatement":
          this.checkExpressionForUndeclaredVars(stmt.condition, scope, ctx);
          this.walkStatementsForUndeclaredVars(stmt.thenStatements, scope, ctx);
          for (const clause of stmt.elsifClauses) {
            this.checkExpressionForUndeclaredVars(clause.condition, scope, ctx);
            this.walkStatementsForUndeclaredVars(clause.statements, scope, ctx);
          }
          this.walkStatementsForUndeclaredVars(stmt.elseStatements, scope, ctx);
          break;
        case "WhileStatement":
          this.checkExpressionForUndeclaredVars(stmt.condition, scope, ctx);
          this.walkStatementsForUndeclaredVars(stmt.body, scope, ctx);
          break;
        case "RepeatStatement":
          this.walkStatementsForUndeclaredVars(stmt.body, scope, ctx);
          this.checkExpressionForUndeclaredVars(stmt.condition, scope, ctx);
          break;
        case "CaseStatement":
          this.checkExpressionForUndeclaredVars(stmt.selector, scope, ctx);
          for (const c of stmt.cases) {
            for (const label of c.labels) {
              this.checkExpressionForUndeclaredVars(label.start, scope, ctx);
              if (label.end) {
                this.checkExpressionForUndeclaredVars(label.end, scope, ctx);
              }
            }
            this.walkStatementsForUndeclaredVars(c.statements, scope, ctx);
          }
          this.walkStatementsForUndeclaredVars(stmt.elseStatements, scope, ctx);
          break;
      }
    }
  }

  /**
   * Recursively check an expression for undeclared variable usage.
   */
  private checkExpressionForUndeclaredVars(
    expr: Expression,
    scope: Scope,
    ctx: UndeclaredVarContext,
  ): void {
    switch (expr.kind) {
      case "VariableExpression": {
        // CODESYS's `__SYSTEM.TYPE_CLASS.TYPE_INT`: a constant, not a variable
        const typeClassMember = systemTypeClassMember(expr);
        if (typeClassMember !== undefined) {
          if (!TYPE_CLASS_MEMBERS.includes(typeClassMember)) {
            this.addError(
              `'${typeClassMember}' is not a member of __SYSTEM.TYPE_CLASS`,
              expr.sourceSpan.startLine,
              expr.sourceSpan.startCol,
              expr.sourceSpan.file,
            );
          }
          break;
        }
        this.checkNameDeclared(expr.name, scope, ctx, expr.sourceSpan, true);
        // Reject member access on a type-level symbol (FB / program / type).
        // Resolves the bug where `RED_YELLOW_GREEN.GREENTIME := …` is
        // silently accepted by the analyzer but blows up at C++
        // compile time as `expected unqualified-id before '.' token`,
        // because strucpp's codegen emits the FB name as a struct
        // type, not a struct instance.  Locally-shadowed names (a
        // `VAR foo : Foo;` declaration of the same identifier) are
        // honoured because `scope.lookup` walks the chain — the
        // shadowing variable wins.
        this.checkInstanceAccess(expr, scope);
        this.checkEnumValue(expr, scope);
        if (expr.accessChain) {
          // accessChain is the authoritative ordered chain — walk its subscripts
          for (const step of expr.accessChain) {
            if (step.kind === "subscript") {
              for (const idx of step.indices) {
                this.checkExpressionForUndeclaredVars(idx, scope, ctx);
              }
            }
          }
        } else {
          // Legacy path: no accessChain, use subscripts directly
          for (const sub of expr.subscripts) {
            this.checkExpressionForUndeclaredVars(sub, scope, ctx);
          }
        }
        break;
      }
      case "FunctionCallExpression":
        // For dotted names (fb.method), check only the object part
        if (expr.functionName.includes(".")) {
          const objName = expr.functionName.substring(
            0,
            expr.functionName.indexOf("."),
          );
          this.checkNameDeclared(objName, scope, ctx, expr.sourceSpan);
        }
        // An FB instance reached through an expression (`units[0]()`) — check
        // the instance and its subscripts, which are ordinary variables.
        if (expr.instance) {
          this.checkExpressionForUndeclaredVars(expr.instance, scope, ctx);
        }
        // Don't check non-dotted function names — they're function/FB symbols
        for (const arg of expr.arguments) {
          this.checkExpressionForUndeclaredVars(arg.value, scope, ctx);
        }
        break;
      case "MethodCallExpression":
        this.checkExpressionForUndeclaredVars(expr.object, scope, ctx);
        for (const arg of expr.arguments) {
          this.checkExpressionForUndeclaredVars(arg.value, scope, ctx);
        }
        break;
      case "BinaryExpression":
        this.checkExpressionForUndeclaredVars(expr.left, scope, ctx);
        this.checkExpressionForUndeclaredVars(expr.right, scope, ctx);
        break;
      case "UnaryExpression":
        this.checkExpressionForUndeclaredVars(expr.operand, scope, ctx);
        break;
      case "ParenthesizedExpression":
        this.checkExpressionForUndeclaredVars(expr.expression, scope, ctx);
        break;
      case "RefExpression":
        this.checkExpressionForUndeclaredVars(expr.operand, scope, ctx);
        break;
      case "DrefExpression":
        this.checkExpressionForUndeclaredVars(expr.operand, scope, ctx);
        break;
      case "ArrayLiteralExpression":
        for (const elem of expr.elements) {
          this.checkExpressionForUndeclaredVars(elem, scope, ctx);
        }
        break;
      case "NewExpression":
        if (expr.arraySize) {
          this.checkExpressionForUndeclaredVars(expr.arraySize, scope, ctx);
        }
        break;
    }
  }

  /**
   * Reject `Type.member` patterns where `Type` is a type-level
   * symbol (function block, program, or user-defined TYPE) rather
   * than an instance.  In IEC 61131-3 a function block can only be
   * accessed through an instance variable — `VAR x : MyFB;` then
   * `x.member` — never via the FB name directly.  Strucpp's codegen
   * emits the FB name as a C++ struct type, so `MyFB.member` lands
   * in g++ as `expected unqualified-id before '.' token`; catching
   * it here lets the diagnostic point at the actual ST line.
   *
   * Locally-shadowed names (a `VAR foo : Foo;` declaration of the
   * same identifier) are honoured because `scope.lookup` walks the
   * chain — the shadowing variable wins and no error fires.
   *
   * `enumValue` symbols also live in the global scope (for
   * autocomplete) but they're values, not types; member access on
   * them is rejected by the type system elsewhere, so we skip them
   * here.
   */
  private checkInstanceAccess(expr: VariableExpression, scope: Scope): void {
    const hasFieldAccess =
      expr.fieldAccess.length > 0 ||
      (expr.accessChain?.some((step) => step.kind === "field") ?? false);
    if (!hasFieldAccess) return;

    const sym = scope.lookup(expr.name);
    if (!sym) return; // undeclared — separate diagnostic from checkNameDeclared

    let noun: string | null = null;
    if (sym.kind === "functionBlock") noun = "function block";
    else if (sym.kind === "program") noun = "program";
    // Enum TYPEs intentionally allow `EnumType.Member` qualified
    // access — that's how the language disambiguates a member
    // shared between two enums.  Only flag non-enum type symbols
    // (STRUCT, ARRAY, SUBRANGE, …) where bare `.member` is
    // genuinely invalid.
    else if (sym.kind === "type" && sym.resolvedType?.typeKind !== "enum")
      noun = "type";
    if (noun === null) return;

    this.addError(
      `Cannot access members of ${noun} '${expr.name}' directly — declare a variable of type '${expr.name}' first.`,
      expr.sourceSpan.startLine,
      expr.sourceSpan.startCol,
      expr.sourceSpan.file,
    );
  }

  /**
   * `Mode.Auto` and `Mode#Auto` name a value the enumerated type has.
   * Without this a misspelt value reached C++ as `MODE::AUTOO`.
   */
  private checkEnumValue(expr: VariableExpression, scope: Scope): void {
    const first = expr.accessChain?.[0];
    const member = first?.kind === "field" ? first.name : expr.fieldAccess[0];
    if (member === undefined) return;
    const sym = scope.lookup(expr.name);
    if (sym?.kind !== "type" || sym.resolvedType?.typeKind !== "enum") return;
    const values = (sym.resolvedType as EnumType).values.map((v) =>
      v.toUpperCase(),
    );
    if (values.includes(member.toUpperCase())) return;
    this.addError(
      `'${member}' is not a value of the enumerated type '${sym.name}' (its values are ${values.join(", ")})`,
      expr.sourceSpan.startLine,
      expr.sourceSpan.startCol,
      expr.sourceSpan.file,
    );
  }

  /**
   * Check whether a name is declared in the current scope chain or context.
   */
  private checkNameDeclared(
    name: string,
    scope: Scope,
    ctx: UndeclaredVarContext,
    sourceSpan: { startLine: number; startCol: number; file?: string },
    asValue = false,
  ): void {
    const upper = name.toUpperCase();

    // 1. Scope chain lookup (local → parent → globalScope).
    //    `enumValue` hits are deliberately ignored here — the symbol
    //    table only carries them for autocomplete; the ambiguity-
    //    aware resolution path at step 6 (via `enumMemberMap`) is
    //    the source of truth for bare enum references.  Letting an
    //    enumValue match short-circuit here would swallow the
    //    "Ambiguous enum member" diagnostic.
    const scopeHit = scope.lookup(upper);
    // A function read as a value is checked after its own return variable.
    const isFunction = asValue && scopeHit?.kind === "function";
    if (scopeHit && scopeHit.kind !== "enumValue" && !isFunction) return;

    // 1b. Inherited FB member variables (walk EXTENDS chain)
    if (ctx.fbName) {
      const fbSym = this.symbolTables.globalScope.lookup(ctx.fbName);
      if (fbSym?.kind === "functionBlock") {
        let parentName = fbSym.declaration.extends;
        const visited = new Set<string>();
        while (parentName) {
          const parentUpper = parentName.toUpperCase();
          if (visited.has(parentUpper)) break;
          visited.add(parentUpper);
          const parentScope = this.symbolTables.getFBScope(parentName);
          if (parentScope?.lookupLocal(upper)) return;
          const parentSym = this.symbolTables.globalScope.lookup(parentUpper);
          if (parentSym?.kind !== "functionBlock") break;
          parentName = parentSym.declaration.extends;
        }
      }
    }

    // 2. Function return variable (FuncName := value)
    if (ctx.functionName && upper === ctx.functionName.toUpperCase()) return;

    // 3. Method/property return variable
    if (ctx.methodName && upper === ctx.methodName.toUpperCase()) return;
    if (ctx.propertyName && upper === ctx.propertyName.toUpperCase()) return;

    // 4. THIS / SUPER keywords (valid in FB/method/property context)
    if ((upper === "THIS" || upper === "SUPER") && ctx.fbName) return;

    // 5. Standard functions (safety net)
    const isStandardFunction = this.stdRegistry.isStandardFunction(name);
    if (isStandardFunction && !asValue) return;

    // 6. Enum member names (bare enum values like Stopped, Running, Manual)
    const enumEntry = this.enumMemberMap.get(upper);
    if (enumEntry) {
      if (enumEntry.typeName === null) {
        // Ambiguous — member exists in multiple enum types
        const types = enumEntry.conflictingTypes.join("' or '");
        this.addError(
          `Ambiguous enum member '${name}' — qualify as '${types}'`,
          sourceSpan.startLine,
          sourceSpan.startCol,
          sourceSpan.file,
        );
      }
      return;
    }

    // 7. A function named without a call: `d := CURRENT_DT;`
    if (isFunction || isStandardFunction) {
      this.addError(
        `'${name}' is a function, not a variable: call it as '${name}()'`,
        sourceSpan.startLine,
        sourceSpan.startCol,
        sourceSpan.file,
      );
      return;
    }

    // 8. Not found
    this.addError(
      `Undeclared variable '${name}'`,
      sourceSpan.startLine,
      sourceSpan.startCol,
      sourceSpan.file,
    );
  }

  // =============================================================================
  // Test File Analysis
  // =============================================================================

  /**
   * Analyze a parsed test file against source symbol tables.
   * Validates type references in var blocks and undeclared variable usage
   * in SETUP, TEARDOWN, and TEST bodies.
   */
  analyzeTestFile(
    testFile: TestFile,
    sourceSymbolTables: SymbolTables,
  ): { errors: CompileError[]; warnings: CompileError[] } {
    this.errors = [];
    this.warnings = [];
    this.symbolTables = sourceSymbolTables;

    this.bindStdFunctionArguments([
      ...(testFile.setup?.varBlocks ?? []),
      ...(testFile.setup?.body ?? []),
      ...(testFile.teardown?.body ?? []),
      ...testFile.testCases.flatMap((tc) => [...tc.varBlocks, ...tc.body]),
    ]);

    // Build enum member map from source symbol tables for bare enum resolution
    const enumDescriptors: Array<{ name: string; members: string[] }> = [];
    for (const sym of sourceSymbolTables.globalScope.getAllSymbols()) {
      if (sym.kind === "type" && sym.resolvedType?.typeKind === "enum") {
        const enumType = sym.resolvedType as EnumType;
        enumDescriptors.push({ name: enumType.name, members: enumType.values });
      }
    }
    this.enumMemberMap = buildEnumMemberMap(enumDescriptors);

    // Validate type references in SETUP and TEST var blocks
    if (testFile.setup) {
      this.validateTestVarBlocks(testFile.setup.varBlocks, "SETUP");
    }
    for (const tc of testFile.testCases) {
      this.validateTestVarBlocks(tc.varBlocks, `TEST '${tc.name}'`);
    }

    // Build SETUP scope (parented to globalScope)
    const setupScope = this.buildTestScope(
      testFile.setup?.varBlocks ?? [],
      this.symbolTables.globalScope,
    );

    // Walk SETUP body
    if (testFile.setup) {
      this.walkTestStatementsForUndeclaredVars(testFile.setup.body, setupScope);
    }

    // Walk TEARDOWN body (runs in setup context)
    if (testFile.teardown) {
      this.walkTestStatementsForUndeclaredVars(
        testFile.teardown.body,
        setupScope,
      );
    }

    // Walk each TEST body with scope = SETUP vars + TEST-local vars
    for (const tc of testFile.testCases) {
      const testScope = this.buildTestScope(tc.varBlocks, setupScope);
      this.walkTestStatementsForUndeclaredVars(tc.body, testScope);
    }

    return { errors: [...this.errors], warnings: [...this.warnings] };
  }

  /**
   * Validate type references in test var blocks.
   */
  private validateTestVarBlocks(varBlocks: VarBlock[], context: string): void {
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        this.validateSingleTypeReference(decl.type, context);
      }
    }
  }

  /**
   * Build a Scope from test var blocks, parented to the given parent scope.
   */
  private buildTestScope(varBlocks: VarBlock[], parent: Scope): Scope {
    const scope = new Scope("test", parent);
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        for (const varName of decl.names) {
          try {
            scope.define({
              name: varName,
              kind: "variable",
              declaration: decl,
              isInput: false,
              isOutput: false,
              isInOut: false,
              isExternal: false,
              isGlobal: false,
              isRetain: false,
            });
          } catch {
            // Ignore duplicates within test blocks
          }
        }
      }
    }
    return scope;
  }

  /**
   * Walk test statements checking for undeclared variable usage.
   * Handles test-specific statement kinds (AssertCall, AdvanceTime, Mock*).
   */
  private walkTestStatementsForUndeclaredVars(
    stmts: TestStatement[],
    scope: Scope,
  ): void {
    const ctx: UndeclaredVarContext = {};
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case "AssertCall":
          this.validateAssertArgCount(stmt);
          for (const arg of stmt.args) {
            this.checkExpressionForUndeclaredVars(arg, scope, ctx);
          }
          break;
        case "AdvanceTimeStatement":
          this.checkExpressionForUndeclaredVars(stmt.duration, scope, ctx);
          break;
        case "MockFunctionStatement":
          this.validateMockFunction(stmt);
          this.checkExpressionForUndeclaredVars(stmt.returnValue, scope, ctx);
          break;
        case "MockVerifyCallCountStatement":
          this.validateMockInstancePath(
            stmt.instancePath,
            stmt.sourceSpan,
            scope,
          );
          this.checkExpressionForUndeclaredVars(stmt.expectedCount, scope, ctx);
          break;
        case "MockFBStatement":
          this.validateMockInstancePath(
            stmt.instancePath,
            stmt.sourceSpan,
            scope,
          );
          break;
        case "MockVerifyCalledStatement":
          this.validateMockInstancePath(
            stmt.instancePath,
            stmt.sourceSpan,
            scope,
          );
          break;
        default:
          // Regular Statement — delegate to existing walker
          this.walkStatementsForUndeclaredVars([stmt as Statement], scope, ctx);
          break;
      }
    }
  }

  /**
   * Validate assert call argument count matches the expected count for each assert type.
   */
  private validateAssertArgCount(assert: AssertCall): void {
    const expectedArgCounts: Record<string, number> = {
      ASSERT_TRUE: 1,
      ASSERT_FALSE: 1,
      ASSERT_EQ: 2,
      ASSERT_NEQ: 2,
      ASSERT_GT: 2,
      ASSERT_LT: 2,
      ASSERT_GE: 2,
      ASSERT_LE: 2,
      ASSERT_NEAR: 3,
    };
    const expected = expectedArgCounts[assert.assertType];
    if (expected !== undefined && assert.args.length !== expected) {
      this.addError(
        `${assert.assertType} expects ${expected} argument${expected !== 1 ? "s" : ""}, got ${assert.args.length}`,
        assert.sourceSpan.startLine,
        assert.sourceSpan.startCol,
      );
    }
  }

  /**
   * Validate MOCK_FUNCTION target exists in global scope or std function registry.
   */
  private validateMockFunction(stmt: MockFunctionStatement): void {
    const name = stmt.functionName.toUpperCase();
    const inGlobal = this.symbolTables.globalScope.lookup(name);
    const inStd = this.stdRegistry.isStandardFunction(name);
    if (!inGlobal && !inStd) {
      this.addWarning(
        `Unknown function '${stmt.functionName}' in MOCK_FUNCTION statement`,
        stmt.sourceSpan.startLine,
        stmt.sourceSpan.startCol,
      );
    }
  }

  /**
   * Validate that the first segment of a MOCK/MOCK_VERIFY instance path is a declared variable.
   */
  private validateMockInstancePath(
    instancePath: string[],
    span: SourceSpan,
    scope: Scope,
  ): void {
    if (instancePath.length === 0) return;
    const rootName = instancePath[0]!.toUpperCase();
    const found = scope.lookup(rootName);
    if (!found) {
      this.addWarning(
        `Unknown variable '${instancePath[0]}' in MOCK statement`,
        span.startLine,
        span.startCol,
      );
    }
  }

  /**
   * Add a warning message.
   * Used in Phase 3+ for semantic validation warnings.
   */
  protected addWarning(
    message: string,
    line: number,
    column: number,
    file?: string,
  ): void {
    this.warnings.push({
      message,
      line,
      column,
      severity: "warning",
      ...(file ? { file } : {}),
    });
  }
}

/**
 * Analyze a compilation unit.
 * Convenience function that creates an analyzer and runs analysis.
 */
export function analyze(
  ast: CompilationUnit,
  existingSymbolTables?: SymbolTables,
): SemanticAnalysisResult {
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(ast, existingSymbolTables);
}

/**
 * Analyze a test file against source symbol tables.
 * Convenience function that creates an analyzer and runs test file analysis.
 */
export function analyzeTestFile(
  testFile: TestFile,
  sourceSymbolTables: SymbolTables,
): { errors: CompileError[]; warnings: CompileError[] } {
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyzeTestFile(testFile, sourceSymbolTables);
}
