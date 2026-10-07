// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Code Generator
 *
 * Generates C++ code from the typed AST or IR.
 * Produces readable, debuggable C++ that maintains line correspondence with ST source.
 */

import type {
  CompilationUnit,
  VarDeclaration,
  Statement,
  Expression,
  AssignmentStatement,
  RefAssignStatement,
  IfStatement,
  CaseStatement,
  ForStatement,
  WhileStatement,
  RepeatStatement,
  FunctionCallExpression,
  Argument,
  MethodCallExpression,
  BinaryExpression,
  UnaryExpression,
  LiteralExpression,
  VariableExpression,
  ReferenceKind,
  TypeReference,
  AccessStep,
  ExternalCodePragma,
  MethodDeclaration,
  InterfaceDeclaration,
  PropertyDeclaration,
  Visibility,
} from "../frontend/ast.js";
import type { SymbolTables } from "../semantic/symbol-table.js";
import type { LineMapEntry, SourceSpan } from "../types.js";
import { StdFunctionRegistry } from "../semantic/std-function-registry.js";
import type {
  ProjectModel,
  ConfigurationDecl,
  ProgramDecl,
  ProjectVarDeclaration,
} from "../project-model.js";
import type {
  LibraryChunk,
  StlibArchive,
} from "../library/library-manifest.js";
import {
  collectFileScopeGlobals,
  getProjectNamespace,
  lockedGlobals,
  parseDateLiteralToDays,
  parseDtLiteralToNs,
  parseTimeLiteral,
  parseTodLiteralToNs,
} from "../project-model.js";
import { isElementaryType, TypeRegistry } from "../semantic/type-registry.js";
import { TypeClassifier } from "./type-descriptor-gen.js";
import { wrapReferenceChain } from "./reference-types.js";
import { TypeCodeGenerator, IEC_TO_CPP_VAR_TYPE } from "./type-codegen.js";
import {
  formatArrayType,
  formatIntegerLiteral,
  iecBaseToCppLiteral,
  translateIECString,
} from "./codegen-utils.js";
import { mangledMemberName, needsMemberMangling } from "./member-mangling.js";
import {
  arrayElementTypeName,
  buildEnumMemberMap,
  getTypeBits,
  getTypeCategory,
  isAnyDescriptorType,
  isVarInfoType,
  isDeclarableGenericType,
  isImplicitlyConvertible,
  parsePartialAccess,
  resolveAccessType,
  resolveArrayElementAccessType,
  resolveFieldDeclaration as resolveFieldDeclarationUtil,
  type AccessLookup,
  resolveArrayElementType as resolveArrayElementTypeUtil,
  resolveArrayShapeByName,
  resolveFieldType as resolveFieldTypeUtil,
  type EnumMemberEntry,
  type PartialAccess,
  TYPE_CLASS_BY_IEC_TYPE,
  systemTypeClassMember,
  typeName as typeNameUtil,
} from "../semantic/type-utils.js";
import {
  generateInitializerValue,
  isStructInitializerValue,
  type StructInitEmitter,
} from "./struct-init-codegen.js";

// =============================================================================
// Located Variable Support
// =============================================================================

/** `__VLA_<rank>D_<ElementType>`, the AST builder's name for an `ARRAY [*]`. */
const VLA_TYPE_NAME = /^__VLA_(\d+)D_(.+)$/;

/** The parts of a type reference that decide its C++ type. */
interface TypeShape {
  name: string;
  maxLength?: number | string;
  referenceKind?: string;
  referenceChain?: ReferenceKind[];
  arrayDimensions?: Array<{ start: number; end: number }>;
  elementTypeName?: string;
  /** Declared length of an inline array's ELEMENT — `ARRAY [0..3] OF STRING(23)`. */
  elementMaxLength?: number;
  elementReferenceChain?: ReferenceKind[];
}

/** What codegen keeps about a library FB member's type. */
interface LibraryFieldShape {
  arrayDimensions?: Array<{ start: number; end: number }>;
  elementTypeName?: string;
  referenceKind?: ReferenceKind;
}

/** A library FB member as read from its manifest. */
interface LibraryField extends LibraryFieldShape {
  name: string;
  type: string;
}

/**
 * Information about a located variable for code generation.
 */
interface LocatedVarDescriptor {
  varName: string;
  address: string;
  area: "Input" | "Output" | "Memory";
  size: "Bit" | "Byte" | "Word" | "DWord" | "LWord";
  byteIndex: number;
  bitIndex: number;
  typeName: string;
  programName: string;
  /**
   * IEC index of the array element this descriptor binds, for a located
   * ARRAY. Absent for a scalar.
   *
   * A located array is emitted as one descriptor PER ELEMENT, laid out over
   * consecutive addresses -- `AT %MW60 : ARRAY [0..66] OF WORD` becomes 67
   * descriptors at %MW60..%MW126. The descriptor table is flat and carries no
   * notion of an aggregate, so the element index is what tells the pointer
   * initialiser to bind `arr[i]` rather than `arr` (openplc-editor#565).
   */
  elementIndex?: number;
}

/** How a POU body reaches one `GlobalVar<V>`: its VAR_EXTERNAL pointer. */
interface GlobalRef {
  /** Member-access prefix: `G->`. */
  acc: string;
  /** Struct / array / FB / derived type: accessed through with_lock(). */
  composite: boolean;
}

/**
 * Parse a located variable address and return descriptor info.
 */
function parseLocatedAddress(address: string): {
  area: "Input" | "Output" | "Memory";
  size: "Bit" | "Byte" | "Word" | "DWord" | "LWord";
  byteIndex: number;
  bitIndex: number;
} | null {
  const match = address.match(/^%([IQM])([XBWDL]?)(\d+)(?:\.(\d+))?$/i);
  if (!match) return null;

  const areaChar = match[1]!.toUpperCase();
  const sizeChar = match[2]?.toUpperCase() || "X";
  const byteIndex = parseInt(match[3]!, 10);
  const bitIndex = match[4] ? parseInt(match[4], 10) : 0;

  const areaMap: Record<string, "Input" | "Output" | "Memory"> = {
    I: "Input",
    Q: "Output",
    M: "Memory",
  };

  const sizeMap: Record<string, "Bit" | "Byte" | "Word" | "DWord" | "LWord"> = {
    X: "Bit",
    B: "Byte",
    W: "Word",
    D: "DWord",
    L: "LWord",
  };

  const area = areaMap[areaChar];
  const size = sizeMap[sizeChar];

  if (!area || !size) return null;

  return {
    area,
    size,
    byteIndex,
    bitIndex,
  };
}

// =============================================================================
// Code Generation Options
// =============================================================================

/**
 * Options for code generation.
 */
export interface CodeGenOptions {
  /** Include #line directives for debugging */
  lineDirectives: boolean;

  /** Include ST source as comments */
  sourceComments: boolean;

  /** Indentation string (default: 4 spaces) */
  indent: string;

  /** Line ending (default: \n) */
  lineEnding: string;

  /** Header filename to use in #include directive (default: "generated.hpp") */
  headerFileName: string;

  /** Additional library headers to include in the generated header */
  libraryHeaders: string[];

  /** Extra `#include "..."` lines to emit at the top of every per-POU
   *  translation unit (after the shared header include). Used by the
   *  editor to plumb in `c_blocks.h` so POU bodies that reference
   *  user-defined C/C++ block structs and extern functions resolve. */
  pouIncludes: string[];

  /** Whether this is a test build (adds mock infrastructure to FB classes) */
  isTestBuild: boolean;

  /** Global constants injected as constexpr into the header preamble (before namespace) */
  globalConstants: Record<string, number>;

  /** ST source filename for #line directives (default: "main.st") */
  fileName: string;

  /** Override filename used in #line directives (absolute path for debugger).
   *  Falls back to fileName when not set. */
  lineDirectiveFileName?: string;

  /** Emit `//@chunk:begin/end:<kind>:<NAME>` comment markers around each
   *  top-level declaration in both header and cpp output. The library
   *  compiler uses these to slice emitted code into per-symbol chunks
   *  for function-level tree-shaking. Off by default — production
   *  compiles produce identical output regardless. */
  emitChunkMarkers?: boolean;
}

/**
 * How each IEC temporal type is exchanged with an integer, per CODESYS.
 *
 * `toUnit` converts our internal representation to the unit a conversion must
 * yield; `fromUnit` converts back. `undefined` means the internal
 * representation already IS that unit, so no call is emitted.
 *
 * Internally every temporal type is nanoseconds since its own zero, except
 * DATE, which is whole days. CODESYS uses 32-bit seconds for DATE and DT,
 * 32-bit milliseconds for TOD and TIME, and 64-bit nanoseconds for all four
 * `L` variants — so the `L` rows are pass-through and the rest scale.
 *
 * One table rather than a chain of `if`s because the two directions have to
 * agree: OSCAT converts out and back inside a single expression, and a unit
 * that disagreed between them would round-trip to nonsense. See DOPE-618.
 */
interface TemporalUnitInfo {
  /** internal → CODESYS unit, for a temporal source. */
  toUnit: string | undefined;
  /** CODESYS unit → internal, for a temporal target. */
  fromUnit: string | undefined;
}

const TEMPORAL_CONVERSION_UNITS = new Map<string, TemporalUnitInfo>([
  // milliseconds
  ["TIME", { toUnit: "TIME_TO_MS", fromUnit: "TIME_FROM_MS" }],
  ["TOD", { toUnit: "TOD_TO_MS", fromUnit: "TOD_FROM_MS" }],
  ["TIME_OF_DAY", { toUnit: "TOD_TO_MS", fromUnit: "TOD_FROM_MS" }],
  // seconds
  ["DT", { toUnit: "DT_TO_SECONDS", fromUnit: "DT_FROM_SECONDS" }],
  ["DATE_AND_TIME", { toUnit: "DT_TO_SECONDS", fromUnit: "DT_FROM_SECONDS" }],
  ["DATE", { toUnit: "DATE_TO_SECONDS", fromUnit: "DATE_FROM_SECONDS" }],
  ["D", { toUnit: "DATE_TO_SECONDS", fromUnit: "DATE_FROM_SECONDS" }],
  // nanoseconds — the 64-bit variants. TIME, TOD and DT are already stored in
  // nanoseconds, so those need no call at all; DATE is stored in days and
  // still has to be scaled.
  ["LTIME", { toUnit: undefined, fromUnit: undefined }],
  ["LTOD", { toUnit: undefined, fromUnit: undefined }],
  ["LTIME_OF_DAY", { toUnit: undefined, fromUnit: undefined }],
  ["LDT", { toUnit: undefined, fromUnit: undefined }],
  ["LDATE_AND_TIME", { toUnit: undefined, fromUnit: undefined }],
  ["LDATE", { toUnit: "DATE_TO_NS", fromUnit: "DATE_FROM_NS" }],
]);

/**
 * Numeric and bit-string targets for the `TO_*` family — i.e. every elementary
 * type whose runtime representation is "just an integer or a float."
 *
 * Gates BOTH directions of the temporal scaling. A temporal source is scaled
 * only when the target is in here; a numeric source is scaled into a temporal
 * target only when the SOURCE is in here. STRING / WSTRING need a format
 * pipeline rather than a scale, and temporal types stay out so that
 * temporal→temporal conversions are left alone.
 *
 * This set and `TEMPORAL_CONVERSION_UNITS` are disjoint, which is what makes
 * the two directions mutually exclusive: no type is both a temporal type and a
 * numeric target.
 */
const NUMERIC_OR_BIT_CONVERSION_TARGETS = new Set([
  "BOOL",
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
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
]);

/**
 * Default code generation options.
 */
export const defaultCodeGenOptions: CodeGenOptions = {
  lineDirectives: false,
  sourceComments: true,
  indent: "    ",
  lineEnding: "\n",
  headerFileName: "generated.hpp",
  libraryHeaders: [],
  pouIncludes: [],
  isTestBuild: false,
  globalConstants: {},
  fileName: "main.st",
};

// =============================================================================
// Code Generation Result
// =============================================================================

/**
 * Result of code generation.
 */
export interface CodeGenResult {
  /**
   * One emit bucket per output file. Always contains
   * `configuration.cpp` (library preambles, located-var defs,
   * configuration glue) plus one `pou_<NAME>.cpp` per program/FB/
   * function. The single-string `cppCode` is the legacy concatenated
   * view — derived from this map by the public `compile()` wrapper.
   */
  cppFiles: Array<{ name: string; content: string }>;

  /** Generated C++ implementation code (concatenation of cppFiles). */
  cppCode: string;

  /** Generated C++ header code */
  headerCode: string;

  /** Line mapping from ST to C++ implementation lines */
  lineMap: Map<number, LineMapEntry>;

  /** Line mapping from ST to C++ header lines */
  headerLineMap: Map<number, LineMapEntry>;

  /** Warnings emitted during code generation */
  warnings: Array<{
    message: string;
    line?: number;
    column?: number;
    file?: string;
  }>;
}

// =============================================================================
// Code Generator
// =============================================================================

/**
 * C++ code generator for IEC 61131-3 programs.
 */

/** Marks a TU STruC++ generated; see {@link guardedIdentifiers}. */
export const GENERATED_TU_MACRO = "STRUCPP_GENERATED_TU";
const MACRO_GUARD_PLACEHOLDER = "// @@STRUCPP_MACRO_GUARD@@";

/** Macros the STruC++ runtime headers define. Never removed. */
const RUNTIME_MACROS = new Set([
  "IEC_REGISTER_FUNDAMENTAL_WIDTH",
  "IEC_REGISTER_SIGNED_FUNDAMENTAL",
  "IEC_REGISTER_UNSIGNED_FUNDAMENTAL",
  "STRUCPP_DEBUG_FLASH",
  "STRUCPP_IEC_GLOBAL_HPP",
  "STRUCPP_V4_EXPORT",
]);

/**
 * The upper-case identifiers a block of generated declarations uses, sorted.
 * ST identifiers are emitted upper case, so this is every ST name in them
 * plus runtime type names (IEC_REAL, …), which no platform defines and which
 * removing as a macro does not touch. Preprocessor lines and comments are
 * skipped; the runtime's own macros and reserved names are never included.
 */
export function guardedIdentifiers(lines: readonly string[]): string[] {
  const names = new Set<string>();
  for (const line of lines) {
    const code = line.replace(/\/\/.*$/, "");
    if (/^\s*#/.test(code)) continue;
    for (const m of code.matchAll(
      /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b[A-Z][A-Z0-9_]*\b/g,
    )) {
      const name = m[0];
      if (name.startsWith('"') || name.startsWith("'")) continue;
      if (RUNTIME_MACROS.has(name) || name.startsWith("STRUCPP_")) continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

export class CodeGenerator {
  private options: CodeGenOptions;

  /**
   * One emit bucket per output .cpp file. The codegen splits POU
   * implementations across files so the runtime build can run
   * `make -j$(nproc)` and ccache can keep .o files for unchanged
   * POUs across rebuilds. `output` always points at the bucket for
   * the currently-active file; `setOutputFile` swaps it. The
   * bucket map preserves insertion order, which determines emit
   * order for the legacy `cppCode` concatenation.
   */
  private outputFiles: Map<string, string[]> = new Map();
  protected output: string[] = []; // currently-active bucket
  private currentLine = 1; // line counter within currently-active file

  private headerOutput: string[] = [];
  private lineMap: Map<number, LineMapEntry> = new Map();
  private headerLineMap: Map<number, LineMapEntry> = new Map();
  private currentHeaderLine = 1;
  private projectModel?: ProjectModel;

  /** Track located variables for descriptor array generation */
  private locatedVars: LocatedVarDescriptor[] = [];

  /** UPPER(name) → access for the current PROGRAM / FUNCTION_BLOCK body's
   *  VAR_EXTERNAL globals (set while that body is emitted). */
  private globalRefs: Map<string, GlobalRef> = new Map();

  /** Set while an expression is rendered inside one global's with_lock():
   *  reads of that global render through `(*__glk)`; any other lock-taking
   *  sub-expression is evaluated by `hoist` into a temporary before the lock. */
  private lockCtx:
    | { rootUpper: string; hoist: (code: string) => string }
    | undefined;

  /** Store AST for looking up program bodies when using project model */
  protected ast?: CompilationUnit;

  /** Current function name (for redirecting function name := to result variable) */
  private currentFunctionName: string | undefined;

  /** Standard function registry for name mapping and conversion resolution */
  private stdRegistry: StdFunctionRegistry;

  /** Warnings collected during code generation */
  private codegenWarnings: Array<{
    message: string;
    line?: number;
    column?: number;
    file?: string;
  }> = [];

  /** Counter for generating unique temporary variable names */
  private tempVarCounter = 0;

  /**
   * Stack of loop exit labels for EXIT codegen. C++ `break` only escapes the
   * innermost switch/loop, so `EXIT` inside a `CASE` nested in a loop must
   * goto past the loop instead. Each loop pushes a fresh label; an inner
   * `EXIT` records `used=true` so the closing emitter only writes the label
   * when something jumps to it.
   */
  private loopExitLabelStack: Array<{ name: string; used: boolean }> = [];
  private loopExitLabelCounter = 0;

  /** Current statement indent level (set by generateStatement before expression generation) */
  private currentStatementIndent = "    ";

  /** Set of known function block type names (upper case) for FB instance detection */
  protected knownFBTypes: Set<string> = new Set();

  /** Set of known interface type names (upper case) */
  protected knownInterfaceTypes: Set<string> = new Set();

  /** Set of known struct/UDT type names (upper case) */
  protected knownStructTypes: Set<string> = new Set();
  /** UPPER(names) of STRUCT types that got a layout table beside them, so a
   *  generic argument can hand its callee a descriptor. Not every struct
   *  qualifies — see type-descriptor-gen.ts. */
  protected describedStructTypes: Set<string> = new Set();
  /** UPPER(name) → definition, for walking a STRUCT's members without a
   *  symbol-table round trip. Populated alongside `knownStructTypes`. */
  protected structDefs: Map<
    string,
    import("../frontend/ast.js").StructDefinition
  > = new Map();

  /** Classifies a declared type into TYPE_CLASS. Shared with the struct
   *  descriptors so `__VARINFO(x)` and a member's descriptor answer
   *  identically for the same type. */
  protected typeClassifier: TypeClassifier = new TypeClassifier([]);

  /** Map of enum type name (upper case) → set of member names (upper case) for :: emission */
  protected enumTypeMembers: Map<string, Set<string>> = new Map();

  /** Reverse map: enum member name (upper case) → owning enum type (for bare enum qualification) */
  protected enumMemberToType: Map<string, EnumMemberEntry> = new Map();

  /** Lazily built hooks for structure-initializer lowering (see getStructInitEmitter). */
  private structInitEmitter?: StructInitEmitter;

  /** Lazily built set of file-level VAR_GLOBAL names (see fileScopeGlobalNames). */
  private fileScopeGlobalNameCache?: Set<string>;

  /** Library FB field type map: "FBNAME.FIELDNAME" → type name (for field mangling in test codegen) */
  private libraryFBFieldTypes: Map<string, string> = new Map();

  /** Extended type metadata for library FB fields (array dims, reference kind) */
  private libraryFBFieldTypeRefs: Map<string, LibraryFieldShape> = new Map();

  /** Set of known program type names (upper case) for program invocation detection */
  protected knownProgramTypes: Set<string> = new Set();

  /** Map of variable name (upper case) → type name (original case) for current scope */
  protected currentScopeVarTypes: Map<string, string> = new Map();

  /** Map of variable name (upper case) → referenceKind ("ref_to" | "reference_to"
   *  | "pointer_to") for current scope. Only reference/pointer vars are present;
   *  used e.g. to pick the correct lowering for a REF= rebind. */
  protected currentScopeVarRefKinds: Map<string, string> = new Map();

  /** UPPER(name) -> the spelling the declaration used, for the scope being
   *  generated. Everything else matches on the folded name; this exists for
   *  the descriptor strings a callee reads back — `IEC_ANY::NAME` and
   *  `TYPENAME` — which report the name as declared. */
  protected currentScopeDeclaredNames: Map<string, string> = new Map();

  /** Map of variable name (upper case) → declared type, for current scope. */
  protected currentScopeVarTypeRefs: Map<string, TypeReference> = new Map();

  /** Parent class name of current FB (for SUPER resolution) */
  private currentFBExtends: string | undefined;

  /** When generating a method that returns an interface type, assignments to the
   *  result variable should be converted to return statements */
  private interfaceReturnMethod = false;

  /** Map of UPPER(typeName).UPPER(methodName) → declared method name for case normalization */
  protected methodNameMap: Map<string, string> = new Map();

  /** Map of UPPER(interfaceName) → Set of UPPER(methodName) for variable/method collision detection */
  protected interfaceMethodsByInterface: Map<string, Set<string>> = new Map();

  /** Map of UPPER(typeName).UPPER(propName) → declared property name for property access codegen */
  protected propertyNameMap: Map<string, string> = new Map();

  /** Current FB name (set during generateFBImplementation for property resolution) */
  private currentFBName: string | undefined;

  /** Mapping of VAR_INST names (upper case) to mangled class member names */
  private varInstMangledNames: Map<string, string> = new Map();

  /** Mapping of member names (upper case) that collide with their type name
   *  or interface method names to mangled names (e.g., SENSOR → SENSOR_) */
  private memberMangledNames: Map<string, string> = new Map();

  /** Interface method names for the current FB (UPPER case), used for variable/method collision detection */
  private currentFBInterfaceMethods: Set<string> = new Set();

  /** Map of UPPER(fbName) → Set of UPPER(interfaceMethodName) for external field access mangling */
  protected fbInterfaceMethodNames: Map<string, Set<string>> = new Map();

  /** Current FB's var blocks, kept so method scopes can see FB member types */
  private currentFBVarBlocks: CompilationUnit["programs"][0]["varBlocks"] = [];

  /** Topologically sorted function blocks (computed once in generate(), used by header + impl) */
  private sortedFBs: CompilationUnit["functionBlocks"] = [];

  /** UPPER(typeName) → the function block classes a structure must follow. */
  private fbBearingTypeDeps: Map<string, Set<string>> = new Map();

  /** Those types, until the classes they name have been emitted. */
  private pendingFbBearingTypes: CompilationUnit["types"] = [];

  /** UPPER(name) of every type a library declares, from its `type` chunks. */
  private libraryTypeNames: Set<string> = new Set();

  /** UPPER(typeName) of every structure that reaches one of those. */
  private libraryTypeBearingTypes: Set<string> = new Set();

  /** Per-archive reachable-chunk emission state.
   *
   *  Built by `addLibraryChunks` — one entry per library the consumer
   *  pulled at least one chunk from. The emission loop iterates this
   *  in insertion order (= the order index.ts hands archives over,
   *  which is library load order). For each library, only chunks
   *  whose name appears in `reachable` are emitted; the array order
   *  matches the library's `chunks[]` declaration order so symbol
   *  layout in the user's `generated.hpp` is stable across builds. */
  private libraryEmissions: Array<{
    archive: StlibArchive;
    reachable: Set<string>;
  }> = [];

  /** Map of UPPER(fbTypeName) → ordered VAR_INPUT parameter names (UPPER case).
   *  Used to resolve positional arguments in FB invocations. */
  private fbInputParams: Map<string, string[]> = new Map();

  /** UPPER(fbTypeName) → UPPER(paramName) → its generic type (`ANY`,
   *  `ANY_INT`, …). Such a parameter takes an `IEC_ANY` built at the call
   *  site, not the argument's value. Local and library FBs alike. */
  private fbGenericParams: Map<string, Map<string, string>> = new Map();

  /** UPPER(fbTypeName) → its VAR_IN_OUT parameters declared `ARRAY [*] OF …`.
   *  Such a parameter is an `ArrayView` onto the caller's array, so it needs
   *  no copy back and cannot have one: view and array are distinct types. */
  private fbVlaInoutParams: Map<string, Set<string>> = new Map();

  /** Map of UPPER(fbTypeName) → VAR_IN_OUT parameters whose type is a function
   *  block. Those are pointer members bound to the caller's own instance, so a
   *  call through one drives the caller's block rather than a copy. */
  private fbRefInoutParams: Map<string, Set<string>> = new Map();

  /** The FB-typed inout parameters of the POU being generated, so a use of one
   *  inside the body dereferences the pointer. */
  private currentRefInouts: Set<string> = new Set();

  /** Map of `UPPER(fbType).UPPER(method)` → its VAR_INPUT parameter names in
   *  declaration order, so a positional argument can be matched to one. */
  private methodInputOrder: Map<string, string[]> = new Map();

  /** Map of `UPPER(fbType).UPPER(method)` → UPPER(paramName) → the generic
   *  type it was declared with.
   *
   *  METHOD is one of the three scopes CODESYS declares generics in, so a
   *  method call has to build the same descriptor a function block call does. */
  private methodGenericParams: Map<string, Map<string, string>> = new Map();

  /** Enums an imported library declares, with their members.
   *
   *  Merged into the bare-enumerator lookup that `generate()` builds, which is
   *  otherwise the project's own types only — so a member of a library enum
   *  would emit unqualified and fail to compile. */
  private libraryEnumDescriptors: Array<{ name: string; members: string[] }> =
    [];

  /** Map of UPPER(functionName) → UPPER(paramName) → the generic type it was
   *  declared with.
   *
   *  FUNCTION is the third scope CODESYS declares a generic in, and a call to
   *  one needs the same descriptor an FB or method call builds. */
  private functionGenericParams: Map<string, Map<string, string>> = new Map();

  /** Map of UPPER(functionName) → its parameter names in declaration order,
   *  so a positional argument can be matched to the parameter it fills. */
  private functionParamOrder: Map<string, string[]> = new Map();

  /** UPPER(functionName) → its VAR_IN_OUT and VAR_OUTPUT parameters (UPPER),
   *  which the C++ function takes by reference. */
  private functionByRefParams: Map<string, Set<string>> = new Map();

  /** UPPER names of the functions declared without a return value. */
  private voidFunctions: Set<string> = new Set();

  /** Code that stands in for an argument expression while a call that binds
   *  a shared global by reference is rendered (see renderGlobalByRefCall). */
  private argOverrides: Map<Expression, string> | undefined;

  /** UPPER(POU) → whether running it may take a shared global's lock. */
  private pouLockMemo: Map<string, boolean> = new Map();

  /** Statements re-caching a string length after this one handed a STRING,
   *  WSTRING or a STRUCT holding one to a generic parameter. `raw_ptr()` gives
   *  the characters, not the cached length. Whole statements, because a struct
   *  syncs via `sync_strings()` and a scalar via `sync_length()`. */
  private pendingStringSyncs: string[] = [];

  /** Map of UPPER(fbTypeName) → set of VAR_IN_OUT parameter names (UPPER case).
   *  FB inout params are stored as by-value members with copy-in at the call
   *  site; this set drives the matching copy-back after the call so a callee's
   *  mutations propagate to the caller's variable (true inout semantics). */
  private fbInoutParams: Map<string, Set<string>> = new Map();

  /** Map of UPPER(fbTypeName) → every parameter name in declaration order, so
   *  an argument given without a name can be matched to the slot it fills. */
  private fbParamOrder: Map<string, string[]> = new Map();

  // IEC_TYPE_BITS and IEC_TYPE_CAT removed — use getTypeBits()/getTypeCategory() from type-utils.ts

  constructor(
    private readonly _symbolTables?: SymbolTables,
    options: Partial<CodeGenOptions> = {},
  ) {
    this.options = { ...defaultCodeGenOptions, ...options };
    this.stdRegistry = new StdFunctionRegistry();
  }

  /** TypeCodeGenerator instance for type mapping */
  private typeCodeGen = new TypeCodeGenerator();

  /** Get symbol tables (for future use in Phase 3+) */
  get symbolTables(): SymbolTables {
    if (!this._symbolTables) {
      throw new Error("SymbolTables not available (test codegen mode)");
    }
    return this._symbolTables;
  }

  /**
   * Map a variable type name to its C++ type string.
   * Handles VLA synthetic names (__VLA_1D_INT → ArrayView1D<INT_t>)
   * and regular types (INT → IEC_INT).
   */
  protected mapVarTypeToCpp(
    typeName: string,
    maxLength?: number | string,
  ): string {
    // Every generic family is one `IEC_ANY` at the ABI; the family only
    // constrains what the call site may pass. Listed rather than left to the
    // `IEC_<NAME>` rule below: `IEC_ANY_INT` does not exist, and a dot is not
    // a C++ name.
    if (isDeclarableGenericType(typeName) || isAnyDescriptorType(typeName)) {
      return "IEC_ANY";
    }

    // `__SYSTEM.VAR_INFO` — same reason as `__SYSTEM.AnyType` above: a dot is
    // not a C++ name.
    if (isVarInfoType(typeName)) {
      return "strucpp::VAR_INFO";
    }

    // Handle VLA synthetic names: __VLA_{ndims}D_{elementType}
    // Use IECVar-wrapped types to match concrete Array1D<IEC_T, ...> elements
    const vlaMatch = VLA_TYPE_NAME.exec(typeName);
    if (vlaMatch) {
      const ndims = vlaMatch[1];
      const elemType = this.mapVarTypeToCpp(vlaMatch[2]!);
      return `ArrayView${ndims}D<${elemType}>`;
    }
    // Handle parameterized STRING(n) / WSTRING(n) / STRING(CONSTANT_NAME)
    if (maxLength !== undefined) {
      const upper = typeName.toUpperCase();
      if (upper === "STRING") {
        return `IECStringVar<${maxLength}>`;
      }
      if (upper === "WSTRING") {
        return `IECWStringVar<${maxLength}>`;
      }
    }
    // User-defined types fall into two camps:
    //   1. FBs / interfaces / structs / arrays — fields already wrap leaves
    //      in IECVar internally, so the bare class name is used directly.
    //   2. Enums (`enum class`) — the raw C++ enum has no value_/forced_/
    //      forced_value_ layout, so the debugger's `read_impl<int16_t>`
    //      cast walks past the 2-byte enum into adjacent memory and
    //      returns garbage when nearby variables are forced. Use the
    //      `IEC_<name>` wrapper (= `IEC_ENUM<name>`) so enum-typed fields
    //      have proper IECVar shape with forcing support.
    if (this.isUserDefinedType(typeName)) {
      // Programs use Program_NAME class naming convention
      if (this.knownProgramTypes.has(typeName.toUpperCase())) {
        return `Program_${typeName}`;
      }
      if (this.enumTypeMembers.has(typeName.toUpperCase())) {
        return `IEC_${typeName}`;
      }
      return typeName;
    }
    // Elementary types: use the canonical IECVar alias map so names whose
    // wrapper isn't simply `IEC_<NAME>` (e.g. __XWORD → IEC_XWORD) resolve
    // correctly; all standard types map to `IEC_<NAME>` as before.
    return IEC_TO_CPP_VAR_TYPE[typeName.toUpperCase()] ?? `IEC_${typeName}`;
  }

  /**
   * Map a TypeReference to its C++ type string, including parameterized length
   * and pointer/reference qualifiers.
   */
  /**
   * Build a TypeReference shape suitable for emitting a parameter type.
   *
   * Preserves array/pointer metadata (so inline ARRAY parameters become
   * `Array1D<T, L, U>&` and pointer params become `IEC_Ptr<T>&`) but
   * strips STRING/WSTRING maxLength so any size string binds to the
   * &-reference — matching the previous behavior of the call sites that
   * went through `mapVarTypeToCpp(decl.type.name)` without maxLength.
   */
  protected toParamTypeRef<T extends TypeShape>(typeRef: T): TypeShape {
    const upper = typeRef.name.toUpperCase();
    const isString = upper === "STRING" || upper === "WSTRING";
    return {
      name: typeRef.name,
      ...(!isString && typeRef.maxLength !== undefined
        ? { maxLength: typeRef.maxLength }
        : {}),
      ...(typeRef.arrayDimensions !== undefined
        ? { arrayDimensions: typeRef.arrayDimensions }
        : {}),
      ...(typeRef.elementTypeName !== undefined
        ? { elementTypeName: typeRef.elementTypeName }
        : {}),
      ...(typeRef.elementReferenceChain !== undefined
        ? { elementReferenceChain: typeRef.elementReferenceChain }
        : {}),
      ...(typeRef.referenceKind !== undefined
        ? { referenceKind: typeRef.referenceKind }
        : {}),
      ...(typeRef.referenceChain !== undefined
        ? { referenceChain: typeRef.referenceChain }
        : {}),
    };
  }

  /**
   * The C++ type of a `VAR_EXTERNAL`, which is a POINTER to the canonical
   * `GlobalVar<V>` rather than a parameter.
   *
   * Not `toParamTypeRef`: that widens `STRING(n)`, which a parameter may do
   * and a pointer may not. All three emission sites use this.
   */
  private externalTypeRefCpp(ext: {
    typeName: string;
    maxLength?: number | string;
    arrayDimensions?: Array<{ start: number; end: number }>;
    elementTypeName?: string;
    referenceKind?: string;
  }): string {
    return this.mapTypeRefToCpp(this.projectVarToTypeRef(ext));
  }

  /**
   * Convert a project-model record (ProjectVarDeclaration /
   * VarExternalDeclaration) into a TypeReference shape suitable for
   * `mapTypeRefToCpp` / `toParamTypeRef`. Project-model records keep the
   * type name in `.typeName` and reserve `.name` for the variable name;
   * this helper rewires the fields so the shape matches what the
   * type-resolution helpers expect.
   */
  private projectVarToTypeRef(
    spec: Omit<TypeShape, "name"> & { typeName: string },
  ): TypeShape {
    return {
      name: spec.typeName,
      ...(spec.maxLength !== undefined ? { maxLength: spec.maxLength } : {}),
      ...(spec.arrayDimensions !== undefined
        ? { arrayDimensions: spec.arrayDimensions }
        : {}),
      ...(spec.elementTypeName !== undefined
        ? { elementTypeName: spec.elementTypeName }
        : {}),
      ...(spec.elementReferenceChain !== undefined
        ? { elementReferenceChain: spec.elementReferenceChain }
        : {}),
      ...(spec.referenceKind !== undefined
        ? { referenceKind: spec.referenceKind }
        : {}),
      ...(spec.referenceChain !== undefined
        ? { referenceChain: spec.referenceChain }
        : {}),
    };
  }

  /**
   * The type a pointer or reference wraps: the raw struct / FB / program name
   * for a user type, the raw value type (`INT_t`) for an elementary one. The
   * wrappers hold an IECVar<T> themselves.
   */
  private rawReferencedType(name: string): string {
    if (this.isUserDefinedType(name)) {
      return this.knownProgramTypes.has(name.toUpperCase())
        ? `Program_${name}`
        : name;
    }
    return this.typeCodeGen.mapTypeToCpp(name);
  }

  protected mapTypeRefToCpp(typeRef: TypeShape): string {
    let baseType: string;

    // Handle inline array types with dimension info
    // Array1D stores T directly — use IECVar-wrapped types for elementary elements
    // and bare names for composites (whose fields already contain IECVar leaves)
    if (typeRef.arrayDimensions && typeRef.elementTypeName) {
      const elemCpp = typeRef.elementReferenceChain
        ? // ARRAY OF POINTER TO / REF_TO: each element is the wrapper a variable gets.
          wrapReferenceChain(
            typeRef.elementReferenceChain,
            this.rawReferencedType(typeRef.elementTypeName),
          )
        : this.isUserDefinedType(typeRef.elementTypeName)
          ? typeRef.elementTypeName
          : // The element's own declared length — `ARRAY [0..3] OF STRING(23)`.
            // Without it every element falls back to the 254-character default.
            this.mapVarTypeToCpp(
              typeRef.elementTypeName,
              typeRef.elementMaxLength,
            );
      baseType = formatArrayType(elemCpp, typeRef.arrayDimensions);
    } else if (
      typeRef.elementReferenceChain &&
      VLA_TYPE_NAME.test(typeRef.name)
    ) {
      // ARRAY[*] OF POINTER TO / REF_TO: a view over the same wrappers.
      const [, ndims, elem] = VLA_TYPE_NAME.exec(typeRef.name)!;
      const elemCpp = wrapReferenceChain(
        typeRef.elementReferenceChain,
        this.rawReferencedType(elem!),
      );
      baseType = `ArrayView${ndims}D<${elemCpp}>`;
    } else {
      baseType = this.mapVarTypeToCpp(
        typeRef.name,
        typeof typeRef.maxLength === "number" ? typeRef.maxLength : undefined,
      );
    }

    if (
      typeRef.referenceKind === "pointer_to" ||
      typeRef.referenceKind === "ref_to" ||
      typeRef.referenceKind === "reference_to"
    ) {
      // Pointer (IEC_Ptr<T>) and reference (IEC_REF_TO<T> / IEC_REFERENCE_TO<T>)
      // wrappers all take the raw element type (not IECVar-wrapped); they wrap
      // an IECVar<T> internally.
      // Array pointer/reference: baseType is already raw (Array1D<...>)
      const elemType =
        typeRef.arrayDimensions && typeRef.elementTypeName
          ? baseType
          : this.rawReferencedType(typeRef.name);
      // Nested levels (`POINTER TO REF_TO INT`) wrap innermost first.
      return wrapReferenceChain(
        typeRef.referenceChain ?? [typeRef.referenceKind],
        elemType,
      );
    }
    // For STRING(CONSTANT_NAME), emit template with the constant name
    if (typeof typeRef.maxLength === "string") {
      const upper = typeRef.name.toUpperCase();
      if (upper === "STRING") {
        return `IECStringVar<${typeRef.maxLength}>`;
      }
      if (upper === "WSTRING") {
        return `IECWStringVar<${typeRef.maxLength}>`;
      }
    }
    return baseType;
  }

  /**
   * Set the project model for enhanced code generation.
   */
  setProjectModel(model: ProjectModel): void {
    this.projectModel = model;
  }

  /**
   * Register FB type names from libraries so codegen can distinguish
   * FB invocations from regular function calls. Private — use registerLibraryArchives().
   */
  private registerLibraryFBTypes(
    fbs: Array<{
      name: string;
      inputNames: string[];
      inoutNames: string[];
      fields: Array<LibraryField>;
    }>,
  ): void {
    for (const fb of fbs) {
      const fbUpper = fb.name.toUpperCase();
      this.knownFBTypes.add(fbUpper);
      if (fb.inputNames.length > 0) {
        this.fbInputParams.set(
          fbUpper,
          fb.inputNames.map((n) => n.toUpperCase()),
        );
      }
      if (fb.inoutNames.length > 0) {
        this.fbInoutParams.set(
          fbUpper,
          new Set(fb.inoutNames.map((n) => n.toUpperCase())),
        );
      }
      const order = [
        ...fb.inputNames.map((n) => n.toUpperCase()),
        ...fb.inoutNames.map((n) => n.toUpperCase()),
      ];
      if (order.length > 0) this.fbParamOrder.set(fbUpper, order);
      for (const f of fb.fields) {
        this.libraryFBFieldTypes.set(
          `${fbUpper}.${f.name.toUpperCase()}`,
          f.type,
        );
        if (isDeclarableGenericType(f.type)) {
          this.noteGenericParam(fbUpper, f.name, f.type);
        }
        // Store array metadata for inline array type reconstruction
        if (f.arrayDimensions || f.elementTypeName || f.referenceKind) {
          const ref: LibraryFieldShape = {};
          if (f.arrayDimensions) ref.arrayDimensions = f.arrayDimensions;
          if (f.elementTypeName) ref.elementTypeName = f.elementTypeName;
          if (f.referenceKind) ref.referenceKind = f.referenceKind;
          this.libraryFBFieldTypeRefs.set(
            `${fbUpper}.${f.name.toUpperCase()}`,
            ref,
          );
        }
      }
    }
  }

  /**
   * Register type info from library manifests (enum types for :: emission,
   * struct types for known-type detection). Private — use registerLibraryArchives().
   */
  private registerLibraryTypes(
    types: Array<{ name: string; kind: string; members?: string[] }>,
  ): void {
    for (const t of types) {
      const nameUpper = t.name.toUpperCase();
      if (t.kind === "enum") {
        // The name alone is enough for `::` emission in
        // generateVariableExpression; the members, when the archive carries
        // them, are what lets a bare enumerator be qualified.
        const members = t.members ?? [];
        if (!this.enumTypeMembers.has(nameUpper)) {
          this.enumTypeMembers.set(
            nameUpper,
            new Set(members.map((m) => m.toUpperCase())),
          );
        }
        if (members.length > 0) {
          this.libraryEnumDescriptors.push({ name: t.name, members });
        }
      }
      this.knownStructTypes.add(nameUpper);
    }
  }

  /**
   * Register all type and FB metadata from library archives.
   * Single entry point used by both compile() and generateTestMain().
   */
  registerLibraryArchives(archives: StlibArchive[]): void {
    for (const archive of archives) {
      this.registerLibraryFBTypes(
        archive.manifest.functionBlocks.map((fb) => {
          const mapVar = (v: LibraryField): LibraryField => {
            const entry: LibraryField = { name: v.name, type: v.type };
            if (v.arrayDimensions) entry.arrayDimensions = v.arrayDimensions;
            if (v.elementTypeName) entry.elementTypeName = v.elementTypeName;
            if (v.referenceKind) entry.referenceKind = v.referenceKind;
            return entry;
          };
          return {
            name: fb.name,
            inputNames: fb.inputs.map((i) => i.name),
            inoutNames: fb.inouts.map((i) => i.name),
            fields: [
              ...fb.inputs.map(mapVar),
              ...fb.outputs.map(mapVar),
              ...fb.inouts.map(mapVar),
            ],
          };
        }),
      );
      if (archive.manifest.types) {
        this.registerLibraryTypes(archive.manifest.types);
      }
      this.registerLibraryFunctions(archive.manifest.functions);
    }

    // An FB-typed inout is a pointer, not a copy. Resolved once every archive
    // is registered, so a type from a later archive still matches.
    for (const archive of archives) {
      for (const fb of archive.manifest.functionBlocks) {
        const fbUpper = fb.name.toUpperCase();
        for (const io of fb.inouts) {
          // An `ARRAY [*] OF …` inout is an ArrayView onto the caller's array,
          // as for a local FB: no copy back (view and array are distinct types).
          if (io.type.toUpperCase().startsWith("__VLA_")) {
            let vlas = this.fbVlaInoutParams.get(fbUpper);
            if (!vlas) {
              vlas = new Set();
              this.fbVlaInoutParams.set(fbUpper, vlas);
            }
            vlas.add(io.name.toUpperCase());
            continue;
          }
          if (!this.knownFBTypes.has(io.type.toUpperCase())) continue;
          let refs = this.fbRefInoutParams.get(fbUpper);
          if (!refs) {
            refs = new Set();
            this.fbRefInoutParams.set(fbUpper, refs);
          }
          refs.add(io.name.toUpperCase());
        }
      }
    }
  }

  /** Record that function `key` takes parameter `name` by reference. */
  private noteFunctionByRefParam(key: string, name: string): void {
    let set = this.functionByRefParams.get(key);
    if (!set) {
      set = new Set();
      this.functionByRefParams.set(key, set);
    }
    set.add(name.toUpperCase());
  }

  /**
   * A library function's parameter order and generic slots, from the manifest
   * rather than the AST. Without the generic slots an argument bound to one is
   * emitted as the variable itself instead of a descriptor.
   */
  private registerLibraryFunctions(
    functions:
      | Array<{
          name: string;
          returnType?: string;
          parameters?: Array<{
            name: string;
            type: string;
            direction?: string;
          }>;
        }>
      | undefined,
  ): void {
    for (const fn of functions ?? []) {
      const key = fn.name.toUpperCase();
      if (fn.returnType?.toUpperCase() === "VOID") this.voidFunctions.add(key);
      const order: string[] = [];
      for (const param of fn.parameters ?? []) {
        order.push(param.name.toUpperCase());
        if (param.direction === "output" || param.direction === "inout") {
          this.noteFunctionByRefParam(key, param.name);
        }
        // A generic is VAR_INPUT only.
        if (
          param.direction !== "output" &&
          isDeclarableGenericType(param.type)
        ) {
          let params = this.functionGenericParams.get(key);
          if (!params) {
            params = new Map();
            this.functionGenericParams.set(key, params);
          }
          params.set(param.name.toUpperCase(), param.type.toUpperCase());
        }
      }
      if (order.length > 0 && !this.functionParamOrder.has(key)) {
        this.functionParamOrder.set(key, order);
      }
    }
  }

  /**
   * Hand the codegen a library archive and the set of chunk names
   * the consumer determined to be reachable from the user's AST.
   * Only those chunks are emitted into the final header/cpp.
   *
   * Single per-call entry point: nothing else mutates
   * `libraryEmissions`. The caller (index.ts) computes the reachable
   * set via function-level tree-shake before invoking this method.
   */
  addLibraryChunks(archive: StlibArchive, reachable: Set<string>): void {
    this.libraryEmissions.push({ archive, reachable });
    // A user type naming one of these cannot precede the library section that
    // declares it — see collectLibraryTypeBearingTypes.
    for (const chunk of archive.chunks ?? []) {
      if (chunk.kind === "type")
        this.libraryTypeNames.add(chunk.name.toUpperCase());
    }
  }

  /**
   * Emit a chunk-boundary marker in the active header stream. No-op
   * when `emitChunkMarkers` is off. See `CodeGenOptions.emitChunkMarkers`
   * — the markers exist so the library compiler can slice emitted code
   * into per-symbol chunks for function-level tree-shaking.
   */
  protected emitHeaderChunkMarker(
    boundary: "begin" | "end",
    kind: "function" | "functionBlock" | "type" | "inlineGlobal",
    name: string,
  ): void {
    if (!this.options.emitChunkMarkers) return;
    this.emitHeader(`//@chunk:${boundary}:${kind}:${name}`);
  }

  /** Emit a chunk-boundary marker in the active cpp stream. */
  protected emitCppChunkMarker(
    boundary: "begin" | "end",
    kind: "function" | "functionBlock" | "type" | "inlineGlobal",
    name: string,
  ): void {
    if (!this.options.emitChunkMarkers) return;
    this.emit(`//@chunk:${boundary}:${kind}:${name}`);
  }

  /**
   * Switch the active emit bucket. Creates a new bucket if the file
   * name hasn't been seen before; otherwise resumes appending to the
   * existing one. Caller is responsible for emitting the per-TU
   * preamble (license, #include, namespace open) on the first switch
   * to a file via `startTranslationUnit`.
   *
   * `currentLine` keeps its global value across switches — lineMap
   * entries reference positions in the legacy concatenated `cppCode`,
   * which is what the REPL line-mapping display and gdb debug info
   * (via #line directives) consume. Splitting only affects which
   * physical .cpp file a line lands in; the logical numbering for
   * the source-map is end-to-end across all files.
   */
  private setOutputFile(name: string): void {
    let bucket = this.outputFiles.get(name);
    if (!bucket) {
      bucket = [];
      this.outputFiles.set(name, bucket);
    }
    this.output = bucket;
  }

  /**
   * Begin a new translation unit. Emits the standard preamble (banner,
   * #include for the shared header, opening namespace) into the file's
   * bucket. Pair with `endTranslationUnit` after emitting POU bodies.
   */
  private startTranslationUnit(name: string): void {
    this.setOutputFile(name);
    const ns = this.projectModel
      ? getProjectNamespace(this.projectModel)
      : "strucpp";
    this.emit(
      "// Generated by STruC++ - IEC 61131-3 Structured Text to C++ Compiler",
    );
    this.emit("// Do not edit this file manually.");
    this.emit("");
    // STruC++'s own TU: the header keeps platform macros named like ST
    // identifiers removed rather than restoring them at its end.
    this.emit(`#define ${GENERATED_TU_MACRO}`);
    this.emit(`#include "${this.options.headerFileName}"`);
    for (const extra of this.options.pouIncludes) {
      this.emit(`#include "${extra}"`);
    }
    this.emit("");
    this.emit(`namespace ${ns} {`);
    this.emit("");
  }

  /**
   * Close the namespace on the currently-active translation unit.
   * Mirrors `startTranslationUnit`.
   */
  private endTranslationUnit(): void {
    const ns = this.projectModel
      ? getProjectNamespace(this.projectModel)
      : "strucpp";
    this.emit(`}  // namespace ${ns}`);
  }

  /**
   * Build a deterministic .cpp file name for a POU. Names already
   * conform to C identifier rules (the parser enforces it), so we
   * just lowercase + prefix; per-POU uniqueness is the caller's
   * concern (multiple POUs with the same name would already be a
   * semantic error caught earlier).
   */
  private pouFileName(pouName: string): string {
    return `pou_${pouName}.cpp`;
  }

  /**
   * Generate C++ code from a compilation unit.
   */
  generate(ast: CompilationUnit): CodeGenResult {
    this.outputFiles = new Map();
    this.output = [];
    this.headerOutput = [];
    this.lineMap = new Map();
    this.headerLineMap = new Map();
    this.currentLine = 1;
    this.currentHeaderLine = 1;
    this.locatedVars = [];
    this.codegenWarnings = [];
    this.tempVarCounter = 0;
    this.ast = ast; // Store AST for looking up program bodies

    // Every FB name first, so the parameter scan below resolves a type declared
    // later in the unit. Library FB types are already registered.
    for (const fb of ast.functionBlocks) {
      this.knownFBTypes.add(fb.name.toUpperCase());
    }

    for (const fb of ast.functionBlocks) {
      // Build ordered input parameter names for positional argument resolution
      const inputNames: string[] = [];
      const inoutNames: string[] = [];
      const paramOrder: string[] = [];
      for (const block of fb.varBlocks) {
        if (
          block.blockType === "VAR_INPUT" ||
          block.blockType === "VAR_IN_OUT" ||
          block.blockType === "VAR_OUTPUT"
        ) {
          for (const decl of block.declarations) {
            for (const name of decl.names) paramOrder.push(name.toUpperCase());
          }
        }
        if (block.blockType === "VAR_INPUT") {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              inputNames.push(name.toUpperCase());
              if (isDeclarableGenericType(decl.type.name)) {
                this.noteGenericParam(
                  fb.name.toUpperCase(),
                  name,
                  decl.type.name,
                );
              }
            }
          }
        } else if (block.blockType === "VAR_IN_OUT") {
          for (const decl of block.declarations) {
            const isVla = decl.type.name.toUpperCase().startsWith("__VLA_");
            const isFb = this.knownFBTypes.has(decl.type.name.toUpperCase());
            for (const name of decl.names) {
              inoutNames.push(name.toUpperCase());
              if (isFb) {
                let refs = this.fbRefInoutParams.get(fb.name.toUpperCase());
                if (!refs) {
                  refs = new Set();
                  this.fbRefInoutParams.set(fb.name.toUpperCase(), refs);
                }
                refs.add(name.toUpperCase());
              }
              if (isVla) {
                let vlas = this.fbVlaInoutParams.get(fb.name.toUpperCase());
                if (!vlas) {
                  vlas = new Set();
                  this.fbVlaInoutParams.set(fb.name.toUpperCase(), vlas);
                }
                vlas.add(name.toUpperCase());
              }
            }
          }
        }
      }
      // Methods carry their own parameter lists, and their own generics.
      for (const method of fb.methods ?? []) {
        const key = `${fb.name.toUpperCase()}.${method.name.toUpperCase()}`;
        const order: string[] = [];
        for (const block of method.varBlocks ?? []) {
          if (block.blockType !== "VAR_INPUT") continue;
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              order.push(name.toUpperCase());
              if (isDeclarableGenericType(decl.type.name)) {
                let params = this.methodGenericParams.get(key);
                if (!params) {
                  params = new Map();
                  this.methodGenericParams.set(key, params);
                }
                params.set(name.toUpperCase(), decl.type.name.toUpperCase());
              }
            }
          }
        }
        if (order.length > 0) this.methodInputOrder.set(key, order);
      }

      if (inputNames.length > 0) {
        this.fbInputParams.set(fb.name.toUpperCase(), inputNames);
      }
      if (inoutNames.length > 0) {
        this.fbInoutParams.set(fb.name.toUpperCase(), new Set(inoutNames));
      }
      if (paramOrder.length > 0) {
        this.fbParamOrder.set(fb.name.toUpperCase(), paramOrder);
      }
    }

    // Functions declare generics too — the third scope, alongside FB and
    // METHOD. Every parameter block feeds the order, because an argument list
    // fills VAR_INPUT, VAR_IN_OUT and VAR_OUTPUT slots in declaration order.
    for (const func of ast.functions) {
      const key = func.name.toUpperCase();
      const order: string[] = [];
      if (func.returnType.name.toUpperCase() === "VOID") {
        this.voidFunctions.add(key);
      }
      for (const block of func.varBlocks) {
        if (
          block.blockType !== "VAR_INPUT" &&
          block.blockType !== "VAR_IN_OUT" &&
          block.blockType !== "VAR_OUTPUT"
        ) {
          continue;
        }
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            order.push(name.toUpperCase());
            if (block.blockType !== "VAR_INPUT") {
              this.noteFunctionByRefParam(key, name);
            }
            if (
              block.blockType === "VAR_INPUT" &&
              isDeclarableGenericType(decl.type.name)
            ) {
              let params = this.functionGenericParams.get(key);
              if (!params) {
                params = new Map();
                this.functionGenericParams.set(key, params);
              }
              params.set(name.toUpperCase(), decl.type.name.toUpperCase());
            }
          }
        }
      }
      if (order.length > 0) this.functionParamOrder.set(key, order);
    }

    // Build set of known interface types, method name map, and per-interface method sets
    for (const iface of ast.interfaces) {
      this.knownInterfaceTypes.add(iface.name.toUpperCase());
      const ifaceMethods = new Set<string>();
      for (const method of iface.methods) {
        this.methodNameMap.set(
          `${iface.name.toUpperCase()}.${method.name.toUpperCase()}`,
          method.name,
        );
        ifaceMethods.add(method.name.toUpperCase());
      }
      this.interfaceMethodsByInterface.set(
        iface.name.toUpperCase(),
        ifaceMethods,
      );
    }

    // Build method name map, property name map, and interface method names for FBs
    for (const fb of ast.functionBlocks) {
      for (const method of fb.methods) {
        this.methodNameMap.set(
          `${fb.name.toUpperCase()}.${method.name.toUpperCase()}`,
          method.name,
        );
      }
      for (const prop of fb.properties) {
        this.propertyNameMap.set(
          `${fb.name.toUpperCase()}.${prop.name.toUpperCase()}`,
          prop.name,
        );
      }
      // Precompute interface method names for each FB (for field access mangling)
      const ifaceMethods = this.getInterfaceMethodNames(fb);
      if (ifaceMethods.size > 0) {
        this.fbInterfaceMethodNames.set(fb.name.toUpperCase(), ifaceMethods);
      }
    }

    // Build set of known struct/UDT types and enum member maps
    const enumDescriptors: Array<{ name: string; members: string[] }> = [];
    this.typeClassifier = new TypeClassifier(ast.types);
    for (const td of ast.types) {
      this.knownStructTypes.add(td.name.toUpperCase());
      if (td.definition.kind === "StructDefinition") {
        this.structDefs.set(td.name.toUpperCase(), td.definition);
      }
      if (td.definition.kind === "EnumDefinition") {
        const memberNames = td.definition.members.map((m) => m.name);
        const members = new Set(memberNames.map((m) => m.toUpperCase()));
        this.enumTypeMembers.set(td.name.toUpperCase(), members);
        if (td.inline?.owner === undefined) {
          enumDescriptors.push({ name: td.name, members: memberNames });
        }
      }
    }
    // The project's own last, so a name declared on both sides is reported as
    // ambiguous rather than quietly taking the library's.
    this.enumMemberToType = buildEnumMemberMap([
      ...this.libraryEnumDescriptors,
      ...enumDescriptors,
    ]);

    // Register program names as types (CODESYS allows instantiating PROGRAMs like FBs)
    for (const prog of ast.programs) {
      this.knownProgramTypes.add(prog.name.toUpperCase());
    }

    // Which structures hold a block instance, before the sort consults it.
    this.fbBearingTypeDeps = this.collectFbBearingTypes(ast);

    // And which reach a type a library declares — both decide where the
    // structure, and the file-scope global of that structure, can be emitted.
    this.libraryTypeBearingTypes = this.collectLibraryTypeBearingTypes(ast);

    // Topologically sort FBs once (used in both header and implementation)
    this.sortedFBs = this.topologicalSortFBs(ast.functionBlocks);

    // Generate header
    this.generateHeader(ast);

    // Generate implementation
    this.generateImplementation(ast);

    const eol = this.options.lineEnding;
    const cppFiles = Array.from(this.outputFiles.entries()).map(
      ([name, lines]) => ({ name, content: lines.join(eol) }),
    );
    return {
      cppFiles,
      // Legacy concatenation — preserves the historical single-blob
      // shape for callers (CLI single-file output, library compiler,
      // REPL preview, tests) that don't care about per-TU split. The
      // public compile() wrapper exposes this verbatim.
      cppCode: cppFiles.map((f) => f.content).join(eol),
      headerCode: this.headerOutput.join(eol),
      lineMap: this.lineMap,
      headerLineMap: this.headerLineMap,
      warnings: this.codegenWarnings,
    };
  }

  /**
   * Generate the C++ header file.
   */
  private generateHeader(ast: CompilationUnit): void {
    // Determine the namespace for this project
    const ns = this.projectModel
      ? getProjectNamespace(this.projectModel)
      : "strucpp";

    this.emitHeader("#pragma once");
    this.emitHeader("");
    this.emitHeader(
      "// Generated by STruC++ - IEC 61131-3 Structured Text to C++ Compiler",
    );
    this.emitHeader("// Do not edit this file manually.");
    this.emitHeader("");
    this.emitHeader('#include "iec_types.hpp"');
    this.emitHeader('#include "iec_var.hpp"');
    this.emitHeader('#include "iec_global.hpp"');
    this.emitHeader('#include "iec_array.hpp"');
    this.emitHeader('#include "iec_located.hpp"');
    this.emitHeader('#include "iec_std_lib.hpp"');
    this.emitHeader('#include "iec_enum.hpp"');
    this.emitHeader('#include "iec_struct.hpp"');
    this.emitHeader('#include "iec_memory.hpp"');
    this.emitHeader('#include "iec_pointer.hpp"');
    this.emitHeader('#include "iec_string.hpp"');
    this.emitHeader('#include "iec_wstring.hpp"');
    this.emitHeader("#include <array>");
    this.emitHeader("#include <cstddef>");
    this.emitHeader("#include <string>");

    // Undefine C standard-library macros that collide with legal ST identifiers
    // (e.g. OSCAT's T_AVG24 has a local `TMP_MAX`, which <cstdio> #defines).
    // Done after the runtime includes so the runtime still sees the real macros;
    // user code below only ever uses these names as ordinary identifiers.
    this.emitHeader("");
    this.emitHeader(
      "// Avoid clashes between ST identifiers and C stdlib macros",
    );
    for (const m of [
      "TMP_MAX",
      "EOF",
      "BUFSIZ",
      "FOPEN_MAX",
      "FILENAME_MAX",
      "RAND_MAX",
      "EXIT_SUCCESS",
      "EXIT_FAILURE",
    ]) {
      this.emitHeader(`#ifdef ${m}`);
      this.emitHeader(`#undef ${m}`);
      this.emitHeader(`#endif`);
    }

    // Include library headers
    if (this.options.libraryHeaders.length > 0) {
      this.emitHeader("");
      this.emitHeader("// Library headers");
      for (const header of this.options.libraryHeaders) {
        this.emitHeader(`#include "${header}"`);
      }
    }

    // Undefine macros that collide with IEC identifiers.
    //
    // `<math.h>` (transitively included via `<cmath>` in iec_std_lib.hpp)
    // defines `OVERFLOW` as a legacy SVID numeric-error constant on both
    // glibc/macOS and avr-libc. That collides with several OSCAT FB
    // struct fields named OVERFLOW, and the preprocessor expansion would
    // turn those into integer literals before the C++ parser sees them.
    // The architecturally-correct fixes — wrapping in a namespace,
    // renaming the IEC identifier — either don't help (macros expand
    // before scope resolution) or break IEC FB ABI. The `#undef` has
    // zero cost on platforms where the macro isn't defined.
    //
    // (`<avr/io.h>`'s `SP` macro used to need the same treatment, but
    // post the Arduino-glue split no TU that parses `generated.hpp`
    // also pulls in `<avr/io.h>`, so the SP undef was retired.)
    this.emitHeader("");
    this.emitHeader("#undef OVERFLOW");

    // Every ST identifier is emitted upper case, and platform headers #define
    // thousands of upper-case words: Arduino's PI and ANALOG, Xtensa register
    // names such as WINDOWSTART. A TU that includes those headers before this
    // one (a C/C++ block's TU, the Arduino glue) would expand them inside the
    // declarations below. So every identifier the declarations use is saved
    // and removed here, and restored at the end of the header for a TU that is
    // not STruC++'s own. Filled in once the declarations exist.
    const macroGuardAt = this.headerOutput.length;
    this.emitHeader(MACRO_GUARD_PLACEHOLDER);

    // Emit global constants (before namespace, so they work as template parameters)
    const globalConsts = Object.entries(this.options.globalConstants);
    if (globalConsts.length > 0) {
      this.emitHeader("");
      this.emitHeader("// Global constants");
      for (const [name, value] of globalConsts) {
        this.emitHeader(`constexpr size_t ${name} = ${value};`);
      }
    }

    this.emitHeader("");

    // Open namespace
    this.emitHeader(`namespace ${ns} {`);
    this.emitHeader("");

    // If using a custom namespace, import strucpp types
    if (ns !== "strucpp") {
      this.emitHeader("using namespace strucpp;  // Runtime types");
      this.emitHeader("");
    }

    // Forward-declare the POU classes before the user-defined types.
    //
    // A TYPE may name a function block — `AccumGrid : ARRAY[0..1,0..1] OF Accum`
    // emits `using ACCUMGRID = Array2D<ACCUM, …>`, and an alias to a class
    // template needs the argument to at least be declared. An incomplete type is
    // enough here because the alias doesn't instantiate anything; instantiation
    // happens where the alias is used as a member, by which point the full
    // definition has been emitted. Repeated below with the rest of the forward
    // declarations, which is harmless — redundant class declarations are legal.
    this.emitPouForwardDeclarations(ast);

    // Generate user-defined types (Phase 2.2). A structure is held back when
    // it names something the library section has not declared yet: an FB
    // instance (see emitFbBearingTypes), or a library type, released at the
    // first flush.
    const heldBack = (td: CompilationUnit["types"][number]): boolean =>
      this.fbBearingTypeDeps.has(td.name.toUpperCase()) ||
      this.libraryTypeBearingTypes.has(td.name.toUpperCase());
    this.pendingFbBearingTypes = ast.types.filter(heldBack);
    this.emitTypeDeclarations(ast.types.filter((td) => !heldBack(td)));

    // Generate top-level global variables (GVL files)
    if (ast.globalVarBlocks.length > 0) {
      this.emitHeader("// Global variables");
      for (const block of ast.globalVarBlocks) {
        const constQualifier = block.isConstant ? "const " : "";
        for (const decl of block.declarations) {
          const cppType = this.mapTypeRefToCpp(decl.type);
          for (const name of decl.names) {
            // `inline`, not a static-local behind a reference: the debug table takes
            // their address into PROGMEM, which needs a constant.
            this.emitHeaderChunkMarker("begin", "inlineGlobal", name);
            if (decl.initialValue) {
              const initExpr = this.generateInitializer(
                decl.initialValue,
                cppType,
                decl.type.name,
              );
              this.emitHeader(
                `${constQualifier}inline ${cppType} ${name} = ${initExpr};`,
              );
            } else {
              this.emitHeader(`inline ${cppType} ${name}{};`);
            }
            this.emitHeaderChunkMarker("end", "inlineGlobal", name);
          }
        }
      }
      this.emitHeader("");
    }

    // Inject reachable library chunks (header side).
    //
    // Per archive: emit `// Library: <name>` header, then `class X;`
    // forward decls for every reachable functionBlock chunk
    // (libraries' FB classes are sometimes mutually-referential and
    // the bodies are emitted in declaration order — the forward
    // decls ahead of any body keep the layout linkable in every
    // ordering). Then emit each reachable chunk's `header` slice in
    // chunk-array order; types come first, FBs next, functions last
    // because that's the order the library compiler emitted them
    // before slicing.
    for (const { archive, reachable } of this.libraryEmissions) {
      const reachableChunks: LibraryChunk[] = [];
      for (const chunk of archive.chunks ?? []) {
        if (chunk.header.length === 0) continue;
        if (reachable.has(chunk.name)) reachableChunks.push(chunk);
      }
      if (reachableChunks.length === 0) continue;

      this.emitHeader(`// Library: ${archive.manifest.name}`);

      for (const chunk of reachableChunks) {
        if (chunk.kind === "functionBlock") {
          this.emitHeader(`class ${chunk.name};`);
        }
      }

      for (const chunk of reachableChunks) {
        for (const line of chunk.header.split("\n")) {
          this.emitHeader(line);
        }
      }

      this.emitHeader("");
    }

    // Generate forward declarations
    this.emitPouForwardDeclarations(ast);

    // Generate interface declarations (before FBs since FBs may implement interfaces)
    for (const iface of ast.interfaces) {
      this.emitHeaderChunkMarker("begin", "type", iface.name);
      this.generateInterfaceHeaderDeclaration(iface);
      this.emitHeaderChunkMarker("end", "type", iface.name);
    }

    // Configuration VAR_GLOBALs as file-scope singletons — emitted before the
    // FB/program classes so their bodies (and FB constructors that bind a
    // VAR_EXTERNAL pointer to a global) can name them.
    this.emitFileScopeGlobals("early");

    // Generate function block class declarations (topologically sorted by dependency)
    const emittedFBs = new Set<string>();
    for (const fb of this.sortedFBs) {
      this.emitHeaderChunkMarker("begin", "functionBlock", fb.name);
      this.generateFBHeaderDeclaration(fb);
      this.emitHeaderChunkMarker("end", "functionBlock", fb.name);
      emittedFBs.add(fb.name.toUpperCase());
      this.emitFbBearingTypes(emittedFBs);
    }
    // Anything still held back names a block that never arrived; emit it rather
    // than drop it, and let the compiler report the missing type.
    this.emitTypeDeclarations(this.pendingFbBearingTypes);
    this.pendingFbBearingTypes = [];

    // Globals of those types follow them.
    this.emitFileScopeGlobals("late");

    // Generate program class declarations
    if (this.projectModel) {
      // Use project model for enhanced generation with VAR_EXTERNAL support
      for (const prog of this.projectModel.programs.values()) {
        this.emitHeaderChunkMarker(
          "begin",
          "functionBlock",
          `Program_${prog.name}`,
        );
        this.generateProgramHeaderFromModel(prog);
        this.emitHeaderChunkMarker(
          "end",
          "functionBlock",
          `Program_${prog.name}`,
        );
      }
    } else {
      // Fallback to AST-based generation
      for (const prog of ast.programs) {
        this.emitHeaderChunkMarker(
          "begin",
          "functionBlock",
          `Program_${prog.name}`,
        );
        this.generateProgramHeaderDeclaration(prog);
        this.emitHeaderChunkMarker(
          "end",
          "functionBlock",
          `Program_${prog.name}`,
        );
      }
    }

    // Generate function declarations
    for (const func of ast.functions) {
      this.emitHeaderChunkMarker("begin", "function", func.name);
      this.generateFunctionHeaderDeclaration(func);
      this.emitHeaderChunkMarker("end", "function", func.name);
    }

    // Generate configuration class declarations
    if (this.projectModel) {
      for (const config of this.projectModel.configurations) {
        this.generateConfigurationHeaderFromModel(config);
      }
    } else {
      for (const config of ast.configurations) {
        this.generateConfigurationHeaderDeclaration(config);
      }
    }

    // Generate located variables descriptor array declaration
    this.generateLocatedVarsDeclaration();

    this.emitHeader(`}  // namespace ${ns}`);

    const guarded = guardedIdentifiers(
      this.headerOutput.slice(macroGuardAt + 1),
    );
    const guardLines = [
      "// ST identifiers that platform headers may #define (see the end of file)",
      ...guarded.flatMap((m) => [`#pragma push_macro("${m}")`, `#undef ${m}`]),
    ];
    this.headerOutput.splice(macroGuardAt, 1, ...guardLines);
    // Header lines recorded below the placeholder moved down with it.
    const placeholderLine = macroGuardAt + 1;
    const shift = guardLines.length - 1;
    this.currentHeaderLine += shift;
    for (const entry of this.headerLineMap.values()) {
      if (entry.cppStartLine > placeholderLine) entry.cppStartLine += shift;
      if (entry.cppEndLine > placeholderLine) entry.cppEndLine += shift;
    }
    this.emitHeader("");
    this.emitHeader(`#ifndef ${GENERATED_TU_MACRO}`);
    for (const m of guarded) this.emitHeader(`#pragma pop_macro("${m}")`);
    this.emitHeader("#endif");
  }

  /**
   * Generate the C++ implementation files.
   *
   * Splits across multiple translation units so the runtime build can
   * run `make -j$(nproc)` and ccache can keep .o files for unchanged
   * POUs across rebuilds:
   *
   *   configuration.cpp     library preambles, located-vars definition,
   *                         configuration glue (must be exactly one TU
   *                         to avoid duplicate symbol errors at link).
   *   pou_<NAME>.cpp        one TU per program / FB / function.
   *
   * All files share `generated.hpp`, so editing a POU's *body* leaves
   * other TUs' preprocessed source unchanged → ccache reuses them.
   * Editing a declaration invalidates the header and forces a full
   * rebuild — same as any C++ project.
   */
  private generateImplementation(ast: CompilationUnit): void {
    // 1. Shared TU: library preambles, located-vars def, configurations.
    //    Anything that must have exactly one definition in the .so
    //    lives here (multiple-TU defs would link-fail with "multiple
    //    definition of …").
    this.startTranslationUnit("configuration.cpp");

    // Inject reachable library chunks (cpp side). Same per-archive
    // iteration order as the header side; only chunks whose `cpp`
    // slice is non-empty get emitted (types and inline globals are
    // header-only).
    for (const { archive, reachable } of this.libraryEmissions) {
      const reachableChunks: LibraryChunk[] = [];
      for (const chunk of archive.chunks ?? []) {
        if (chunk.cpp.length === 0) continue;
        if (reachable.has(chunk.name)) reachableChunks.push(chunk);
      }
      if (reachableChunks.length === 0) continue;

      this.emit(`// Library: ${archive.manifest.name}`);
      for (const chunk of reachableChunks) {
        for (const line of chunk.cpp.split("\n")) {
          this.emit(line);
        }
      }
      this.emit("");
    }

    this.generateLocatedVarsDefinition();

    if (this.projectModel) {
      for (const config of this.projectModel.configurations) {
        this.generateConfigurationImplementationFromModel(config);
      }
    } else {
      for (const config of ast.configurations) {
        this.generateConfigurationImplementation(config);
      }
    }

    this.endTranslationUnit();

    // 2. One TU per program.
    if (this.projectModel) {
      for (const prog of this.projectModel.programs.values()) {
        this.startTranslationUnit(this.pouFileName(prog.name));
        this.emitCppChunkMarker(
          "begin",
          "functionBlock",
          `Program_${prog.name}`,
        );
        this.generateProgramImplementationFromModel(prog);
        this.emitCppChunkMarker("end", "functionBlock", `Program_${prog.name}`);
        this.endTranslationUnit();
      }
    } else {
      for (const prog of ast.programs) {
        this.startTranslationUnit(this.pouFileName(prog.name));
        this.emitCppChunkMarker(
          "begin",
          "functionBlock",
          `Program_${prog.name}`,
        );
        this.generateProgramImplementation(prog);
        this.emitCppChunkMarker("end", "functionBlock", `Program_${prog.name}`);
        this.endTranslationUnit();
      }
    }

    // 3. One TU per function block. Topological order doesn't matter
    //    here (each impl just sees the shared header's full set of
    //    class declarations); ordering only mattered for the header.
    for (const fb of this.sortedFBs) {
      this.startTranslationUnit(this.pouFileName(fb.name));
      this.emitCppChunkMarker("begin", "functionBlock", fb.name);
      this.generateFBImplementation(fb);
      this.emitCppChunkMarker("end", "functionBlock", fb.name);
      this.endTranslationUnit();
    }

    // 4. One TU per function.
    for (const func of ast.functions) {
      this.startTranslationUnit(this.pouFileName(func.name));
      this.emitCppChunkMarker("begin", "function", func.name);
      this.generateFunctionImplementation(func);
      this.emitCppChunkMarker("end", "function", func.name);
      this.endTranslationUnit();
    }
  }

  /**
   * Collect a function block's VAR_EXTERNAL references to CONFIGURATION
   * VAR_GLOBALs. IEC 61131-3 lets an FB access globals this way; each becomes a
   * `GlobalVar<V>*` bound to the file-scope canonical.
   *
   * References to a **file-level** VAR_GLOBAL are excluded: that storage is a
   * plain file-scope object the FB body already reaches by name, so it needs no
   * pointer member — and adding one would shadow the global it references. Same
   * rule the project model applies to PROGRAMs (see `addVarExternal`).
   */
  private collectFBExternals(
    fb: CompilationUnit["functionBlocks"][0],
  ): Array<{ name: string; typeName: string; cppType: string }> {
    const fileScopeGlobals = this.fileScopeGlobalNames();
    const externals: Array<{
      name: string;
      typeName: string;
      cppType: string;
    }> = [];
    for (const block of fb.varBlocks) {
      if (block.blockType !== "VAR_EXTERNAL") continue;
      for (const decl of block.declarations) {
        const cppType = this.mapTypeRefToCpp(decl.type);
        for (const name of decl.names) {
          if (fileScopeGlobals.has(name.toUpperCase())) continue;
          externals.push({ name, typeName: decl.type.name, cppType });
        }
      }
    }
    return externals;
  }

  /** Upper-case names of the compilation unit's file-level VAR_GLOBALs. */
  private fileScopeGlobalNames(): Set<string> {
    if (!this.fileScopeGlobalNameCache) {
      this.fileScopeGlobalNameCache = this.ast
        ? new Set(collectFileScopeGlobals(this.ast).keys())
        : new Set<string>();
    }
    return this.fileScopeGlobalNameCache;
  }

  // ===========================================================================
  // Shared-global access
  // ===========================================================================

  /** How the current body reaches global `name`, or undefined when it is not
   *  one of the body's VAR_EXTERNAL globals. */
  private globalRefOf(name: string): GlobalRef | undefined {
    return this.globalRefs.get(name.toUpperCase());
  }

  /** Access records for a PROGRAM's or FUNCTION_BLOCK's VAR_EXTERNALs. */
  private externalRefs(
    externals: Array<{ name: string; typeName: string }>,
  ): Map<string, GlobalRef> {
    return new Map(
      externals.map((e) => [
        e.name.toUpperCase(),
        { acc: `${e.name}->`, composite: !isElementaryType(e.typeName) },
      ]),
    );
  }

  /** A direct access to a shared global (not through a dereference). */
  private isGlobalAccess(expr: VariableExpression): boolean {
    return !expr.isDereference && this.globalRefOf(expr.name) !== undefined;
  }

  /** True for a call whose callee is ST code (user or library FUNCTION, a
   *  method): it may take global locks, so it never runs under one. */
  private isUserCall(expr: Expression): boolean {
    if (expr.kind === "MethodCallExpression") return true;
    if (expr.kind !== "FunctionCallExpression") return false;
    const upper = expr.functionName.toUpperCase();
    if (upper.includes(".") || upper === "SUPER") return true;
    if (["ADR", "REF_LINK", "LOWER_BOUND", "UPPER_BOUND"].includes(upper)) {
      return false;
    }
    return (
      !this.stdRegistry.resolveConversion(upper) &&
      !this.stdRegistry.lookup(upper)
    );
  }

  /** Whether evaluating `expr` may take a global lock: it reads a global or
   *  calls ST code. */
  private mayTakeLock(expr: Expression): boolean {
    return this.someSubExpression(
      expr,
      (e) =>
        (e.kind === "VariableExpression" && this.isGlobalAccess(e)) ||
        this.isUserCall(e),
    );
  }

  /**
   * Whether running the FUNCTION_BLOCK or FUNCTION `name` may take a shared
   * global's lock: it, a block it holds or a function it calls has a
   * VAR_EXTERNAL; an interface it holds may be anything. Library POUs cannot
   * reach the project's globals.
   */
  private pouMayTakeGlobalLock(name: string): boolean {
    const upper = name.toUpperCase();
    const memo = this.pouLockMemo.get(upper);
    if (memo !== undefined) return memo;
    this.pouLockMemo.set(upper, false); // recursion guard
    const ast = this.ast;
    const pou =
      ast?.functionBlocks.find((f) => f.name.toUpperCase() === upper) ??
      ast?.functions.find((f) => f.name.toUpperCase() === upper);
    let result = false;
    if (pou) {
      if (pou.kind === "FunctionBlockDeclaration" && pou.extends) {
        result = this.pouMayTakeGlobalLock(pou.extends);
      }
      result = result || this.nodeMayTakeGlobalLock(pou, new Set());
    }
    this.pouLockMemo.set(upper, result);
    return result;
  }

  /** Whether a user type may take a shared global's lock when used. */
  private typeMayTakeGlobalLock(name: string, seen: Set<string>): boolean {
    const upper = name.toUpperCase();
    const ast = this.ast;
    if (!ast || seen.has(upper)) return false;
    seen.add(upper);
    if (ast.interfaces.some((i) => i.name.toUpperCase() === upper)) return true;
    if (
      ast.functionBlocks.some((f) => f.name.toUpperCase() === upper) ||
      ast.functions.some((f) => f.name.toUpperCase() === upper)
    ) {
      return this.pouMayTakeGlobalLock(upper);
    }
    const type = ast.types.find((t) => t.name.toUpperCase() === upper);
    return type !== undefined && this.nodeMayTakeGlobalLock(type, seen);
  }

  /** Scan of an AST subtree for {@link pouMayTakeGlobalLock}. */
  private nodeMayTakeGlobalLock(node: object, seen: Set<string>): boolean {
    const n = node as {
      kind?: string;
      blockType?: string;
      name?: string;
      elementTypeName?: string;
      functionName?: string;
    };
    if (n.kind === "VarBlock" && n.blockType === "VAR_EXTERNAL") return true;
    if (n.kind === "TypeReference") {
      for (const t of [n.name, n.elementTypeName]) {
        if (t !== undefined && this.typeMayTakeGlobalLock(t, seen)) return true;
      }
    }
    if (n.kind === "FunctionCallExpression" && n.functionName !== undefined) {
      const callee = n.functionName.split(".")[0]!;
      if (
        this.ast?.functions.some(
          (f) => f.name.toUpperCase() === callee.toUpperCase(),
        ) === true &&
        this.pouMayTakeGlobalLock(callee)
      ) {
        return true;
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "sourceSpan" || value === null || typeof value !== "object") {
        continue;
      }
      if (this.nodeMayTakeGlobalLock(value as object, seen)) return true;
    }
    return false;
  }

  /** Whether `expr` reads the global `rootUpper` anywhere. */
  private expressionUsesRoot(expr: Expression, rootUpper: string): boolean {
    return this.someSubExpression(
      expr,
      (e) =>
        e.kind === "VariableExpression" &&
        this.isGlobalAccess(e) &&
        e.name.toUpperCase() === rootUpper,
    );
  }

  /** Depth-first search of an expression tree, index expressions included. */
  private someSubExpression(
    expr: Expression,
    pred: (e: Expression) => boolean,
  ): boolean {
    if (pred(expr)) return true;
    const any = (list: Expression[]): boolean =>
      list.some((e) => this.someSubExpression(e, pred));
    switch (expr.kind) {
      case "VariableExpression": {
        const idx: Expression[] = [...expr.subscripts];
        for (const step of expr.accessChain ?? []) {
          if (step.kind === "subscript") idx.push(...step.indices);
        }
        return any(idx);
      }
      case "BinaryExpression":
        return any([expr.left, expr.right]);
      case "UnaryExpression":
        return any([expr.operand]);
      case "ParenthesizedExpression":
        return any([expr.expression]);
      case "FunctionCallExpression":
        return (
          any(expr.arguments.map((a) => a.value)) ||
          (expr.instance !== undefined && any([expr.instance]))
        );
      case "MethodCallExpression":
        return any([expr.object, ...expr.arguments.map((a) => a.value)]);
      case "RefExpression":
      case "DrefExpression":
        return any([expr.operand]);
      case "ArrayLiteralExpression":
        return any(expr.elements);
      case "NewExpression":
        return expr.arraySize !== undefined && any([expr.arraySize]);
      default:
        return false;
    }
  }

  /**
   * Render code that runs inside `rootUpper`'s with_lock(): reads of that
   * global go through `(*__glk)`; every other lock-taking sub-expression is
   * evaluated first into an `auto __gwv_N` temporary emitted at `indent`.
   */
  private renderUnderLock<T>(
    rootUpper: string,
    indent: string,
    render: () => T,
  ): T {
    const saved = this.lockCtx;
    this.lockCtx = {
      rootUpper,
      hoist: (code: string): string => {
        const tmp = `__gwv_${this.tempVarCounter++}`;
        this.emit(`${indent}auto ${tmp} = ${code};`);
        return tmp;
      },
    };
    try {
      return render();
    } finally {
      this.lockCtx = saved;
    }
  }

  /** Inside {@link renderUnderLock}: evaluate `render` outside the lock into a
   *  temporary and return the temporary's name. */
  private hoistOutOfLock(render: () => string): string {
    const ctx = this.lockCtx!;
    this.lockCtx = undefined;
    let code: string;
    try {
      code = render();
    } finally {
      this.lockCtx = ctx;
    }
    return ctx.hoist(code);
  }

  /** Whether a variable expression has anything after its base name. */
  private hasAccessTail(expr: VariableExpression): boolean {
    return (
      (expr.accessChain?.length ?? 0) > 0 ||
      expr.subscripts.length > 0 ||
      expr.fieldAccess.length > 0
    );
  }

  /** `expr`'s access tail on `(*__glk)`; index expressions that take a lock
   *  are evaluated first, into `temps`. */
  private renderLockedTail(expr: VariableExpression, temps: string[]): string {
    return this.renderAccessTail(
      "(*__glk)",
      expr,
      expr.name.toUpperCase(),
      (idx) => {
        const code = this.generateExpression(idx);
        if (!this.mayTakeLock(idx)) return code;
        const tmp = `__gi${this.tempVarCounter++}`;
        temps.push(`auto ${tmp} = ${code};`);
        return tmp;
      },
    );
  }

  /**
   * A read of a global: `G->read()` for a scalar, else one with_lock()
   * returning the addressed part. Lock-taking index expressions are evaluated
   * first, into temporaries of an immediately-invoked lambda.
   */
  private renderGlobalRead(expr: VariableExpression, ref: GlobalRef): string {
    if (!ref.composite && !this.hasAccessTail(expr)) {
      return `${ref.acc}read()`;
    }
    const temps: string[] = [];
    const inner = this.renderLockedTail(expr, temps);
    const locked = `${ref.acc}with_lock([&](auto* __glk){ return ${inner}; })`;
    if (temps.length === 0) return locked;
    return `[&]{ ${temps.join(" ")} return ${locked}; }()`;
  }

  /** Split a target into the part it addresses and a trailing partial-access
   *  selector (`.3`, `.%B1`), if any. */
  private splitBitTarget(target: VariableExpression): {
    base: VariableExpression;
    part: PartialAccess | undefined;
  } {
    const chain = target.accessChain;
    const step =
      chain && chain.length > 0 ? chain[chain.length - 1] : undefined;
    const last =
      chain && chain.length > 0
        ? step?.kind === "field"
          ? step.name
          : undefined
        : target.fieldAccess[target.fieldAccess.length - 1];
    const part = last === undefined ? undefined : parsePartialAccess(last);
    if (!part) {
      return { base: target, part: undefined };
    }
    const base: VariableExpression = {
      ...target,
      fieldAccess: target.fieldAccess.slice(0, -1),
    };
    if (chain) {
      const trimmed = this.trimLastFieldFromAccessChain(chain);
      if (trimmed) base.accessChain = trimmed;
      else delete base.accessChain;
    }
    return { base, part };
  }

  /** `lv = <value>`, or the read-modify-write of one part of `lv` (see
   *  partialAccessWrite). */
  private renderStore(
    lv: string,
    part: PartialAccess | undefined,
    value: string,
  ): string {
    if (part === undefined) return `${lv} = ${value}`;
    return `${lv} = ${this.partialAccessWrite(lv, value, part)}`;
  }

  /**
   * Store rendered `value` (which takes no lock) into a global target:
   * `G->write(v)` for a whole scalar, else one with_lock() (a bit as one
   * read-modify-write). Lock-taking indices are evaluated before the lock.
   */
  private emitGlobalStore(
    target: VariableExpression,
    ref: GlobalRef,
    value: string,
    indent: string,
  ): void {
    const upper = target.name.toUpperCase();
    if (!ref.composite && !this.hasAccessTail(target)) {
      this.emit(`${indent}${ref.acc}write(${value});`);
      return;
    }
    const body = this.renderUnderLock(upper, indent, () => {
      const { base, part } = this.splitBitTarget(target);
      return this.renderStore(
        this.renderAccessTail("(*__glk)", base, upper),
        part,
        value,
      );
    });
    this.emit(`${indent}${ref.acc}with_lock([&](auto* __glk){ ${body}; });`);
  }

  /**
   * Assignment to a global target. When the right-hand side reads the same
   * global, the whole assignment is one locked step (other lock-taking parts
   * evaluated first); otherwise the value is computed first and stored under
   * the lock.
   */
  private emitGlobalAssignment(
    target: VariableExpression,
    ref: GlobalRef,
    valueExpr: Expression,
    indent: string,
  ): void {
    const upper = target.name.toUpperCase();
    if (!this.expressionUsesRoot(valueExpr, upper)) {
      if (!ref.composite && !this.hasAccessTail(target)) {
        this.emit(
          `${indent}${ref.acc}write(${this.generateExpression(valueExpr)});`,
        );
        return;
      }
      const tmp = `__gwv_${this.tempVarCounter++}`;
      this.emit(
        `${indent}auto ${tmp} = ${this.generateExpression(valueExpr)};`,
      );
      this.emitGlobalStore(target, ref, tmp, indent);
      return;
    }
    const body = this.renderUnderLock(upper, indent, () => {
      const value = this.generateExpression(valueExpr);
      const { base, part } = this.splitBitTarget(target);
      const lv = this.hasAccessTail(base)
        ? this.renderAccessTail("(*__glk)", base, upper)
        : "(*__glk)";
      return this.renderStore(lv, part, value);
    });
    this.emit(`${indent}${ref.acc}with_lock([&](auto* __glk){ ${body}; });`);
  }

  /** The type `expr` names: its variable's type through its subscripts and
   *  fields, or undefined when unknown. */
  private accessType(expr: VariableExpression): string | undefined {
    let type = this.currentScopeVarTypes.get(expr.name.toUpperCase());
    const steps: AccessStep[] = expr.accessChain ?? [
      ...(expr.subscripts.length > 0
        ? [{ kind: "subscript" as const, indices: expr.subscripts }]
        : []),
      ...expr.fieldAccess.map((name) => ({ kind: "field" as const, name })),
    ];
    for (const step of steps) {
      if (type === undefined) return undefined;
      if (step.kind === "subscript") {
        type = this.ast
          ? resolveArrayElementTypeUtil(type, this.ast)
          : undefined;
      } else if (step.kind === "field") {
        type = this.resolveMemberType(type, step.name);
      } else {
        return undefined;
      }
    }
    return type;
  }

  /** A method of `typeName` (or of a function block it extends). */
  private findMethodDecl(
    typeName: string | undefined,
    methodName: string,
  ): MethodDeclaration | undefined {
    const seen = new Set<string>();
    let current = typeName;
    while (
      current !== undefined &&
      this.ast !== undefined &&
      !seen.has(current.toUpperCase())
    ) {
      const upper = current.toUpperCase();
      seen.add(upper);
      const fb = this.ast.functionBlocks.find(
        (f) => f.name.toUpperCase() === upper,
      );
      if (!fb) return undefined;
      const method = fb.methods.find(
        (m) => m.name.toUpperCase() === methodName.toUpperCase(),
      );
      if (method) return method;
      current = fb.extends;
    }
    return undefined;
  }

  /** Whether each positional parameter of a method is passed by reference. */
  private methodParamByRef(method: MethodDeclaration | undefined): boolean[] {
    const byRef: boolean[] = [];
    for (const block of method?.varBlocks ?? []) {
      const kind = block.blockType;
      if (
        kind !== "VAR_INPUT" &&
        kind !== "VAR_IN_OUT" &&
        kind !== "VAR_OUTPUT"
      ) {
        continue;
      }
      for (const decl of block.declarations) {
        for (let i = 0; i < decl.names.length; i++) {
          byRef.push(kind !== "VAR_INPUT");
        }
      }
    }
    return byRef;
  }

  /**
   * Call of `method` on a function block instance held in a shared global
   * (the global, an element or a member of it), under that global's lock.
   * By-value arguments and indices that take a lock are evaluated first.
   */
  private renderGlobalMethodCall(
    object: VariableExpression,
    ref: GlobalRef,
    objectType: string | undefined,
    method: string,
    args: Argument[],
  ): string {
    const byRef = this.methodParamByRef(
      this.findMethodDecl(objectType, method),
    );
    const temps: string[] = [];
    // Generic parameters take a descriptor, as in an unlocked method call.
    const codes = this.generateCallArguments(objectType, method, args);
    const callArgs = args.map((a, i) => {
      const code = codes[i]!;
      if (byRef[i] === true || !this.mayTakeLock(a.value)) return code;
      const tmp = `__gma${this.tempVarCounter++}`;
      temps.push(`auto ${tmp} = ${code};`);
      return tmp;
    });
    const target = this.renderLockedTail(object, temps);
    const call = `${ref.acc}with_lock([&](auto* __glk){ return ${target}.${method}(${callArgs.join(", ")}); })`;
    return temps.length === 0
      ? call
      : `[&]{ ${temps.join(" ")} return ${call}; }()`;
  }

  /**
   * Generate header declaration for a function block.
   */
  private generateFBHeaderDeclaration(
    fb: CompilationUnit["functionBlocks"][0],
  ): void {
    // Populate interface method names for variable/method collision detection
    this.currentFBInterfaceMethods = this.getInterfaceMethodNames(fb);

    // Build inheritance clause
    const bases: string[] = [];
    if (fb.extends) {
      bases.push(`public ${fb.extends}`);
    }
    if (fb.implements) {
      for (const iface of fb.implements) {
        bases.push(`public ${iface}`);
      }
    }
    const inheritance = bases.length > 0 ? ` : ${bases.join(", ")}` : "";
    const finalSpec = fb.isFinal ? " final" : "";

    this.emitHeaderLineDirective(fb.sourceSpan.startLine);
    const classLine = this.currentHeaderLine;
    this.emitHeader(`class ${fb.name}${finalSpec}${inheritance} {`);
    this.emitHeader("public:");
    this.recordHeaderLineMapping(fb.sourceSpan.startLine, classLine);

    // Member names in this FB — used to detect a member that shadows the type
    // of a sibling member (e.g. F_LAMP has both `ONTIME : UDINT` and
    // `RUNTIME : ONTIME`, where the FB type ONTIME also exists). C++ member
    // lookup would resolve the bare type name to the data member, so such a
    // member declaration needs an elaborated `class`/`struct` specifier.
    const fbMemberNames = new Set<string>();
    for (const block of fb.varBlocks) {
      for (const decl of block.declarations) {
        for (const n of decl.names) fbMemberNames.add(n.toUpperCase());
      }
    }

    // Generate member variables
    for (const block of fb.varBlocks) {
      // VAR_EXTERNAL is a reference to a configuration global, not a member of
      // the FB — emitted below as a GlobalVar<V>* pointing at the file-scope
      // canonical (mirrors the PROGRAM path). Handling it here as a plain member
      // would give the FB a private copy that never touches the shared global.
      if (block.blockType === "VAR_EXTERNAL") continue;

      const comment =
        block.blockType === "VAR_INPUT"
          ? "// Inputs"
          : block.blockType === "VAR_OUTPUT"
            ? "// Outputs"
            : block.blockType === "VAR_IN_OUT"
              ? "// In-Out"
              : "// Local variables";

      this.emitHeader(`    ${comment}`);
      for (const decl of block.declarations) {
        const cppType = this.mapTypeRefToCpp(decl.type);
        const tag = this.elaboratedTagIfShadowed(decl.type.name, fbMemberNames);
        // An FB passed as an inout is aliased, not copied: the callee reads and
        // writes the caller's instance and may call it.
        const byRef =
          block.blockType === "VAR_IN_OUT" &&
          this.knownFBTypes.has(decl.type.name.toUpperCase());
        for (const name of decl.names) {
          const memberName = this.mangleMemberIfNeeded(name, decl.type.name);
          this.emitHeaderLineDirective(decl.sourceSpan.startLine);
          const memberLine = this.currentHeaderLine;
          this.emitHeader(
            byRef
              ? `    ${tag}${cppType}* ${memberName} = nullptr;`
              : `    ${tag}${cppType} ${memberName};`,
          );
          this.recordHeaderLineMapping(decl.sourceSpan.startLine, memberLine);
        }
      }
    }

    // VAR_EXTERNAL members: a pointer to the file-scope canonical GlobalVar<V>
    // (same shape a PROGRAM uses). Bound in the constructor to &<ns>::<name>.
    const fbExternals = this.collectFBExternals(fb);
    if (fbExternals.length > 0) {
      this.emitHeader("    // External variables (pointers to shared globals)");
      for (const ext of fbExternals) {
        this.emitHeader(
          `    GlobalVar<${ext.cppType}>* ${ext.name} = nullptr;`,
        );
      }
    }

    // Generate VAR_INST mangled members from methods
    const varInstMembers = this.collectVarInstMembers(fb);
    if (varInstMembers.length > 0) {
      this.emitHeader("");
      this.emitHeader("    // Method instance variables (VAR_INST)");
      for (const m of varInstMembers) {
        this.emitHeader(`    ${m.cppType} ${m.mangledName};`);
      }
    }

    // IEC 61131-3 implicit ENO output. Mirrors EN at every call site, so
    // user code that does `IF inst.ENO THEN ...` after invoking the FB
    // resolves. Default is true so FBs invoked without an EN pin see ENO=1
    // (matches the standard: ENO defaults to TRUE when EN is omitted).
    // Only emitted on the leaf FB; if it extends another FB, the parent
    // already provides ENO.
    if (!fb.extends) {
      this.emitHeader("");
      this.emitHeader("    // Implicit IEC 61131-3 ENO pin (mirrors EN)");
      this.emitHeader("    IEC_BOOL ENO = true;");
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    ${fb.name}();`);
    this.emitHeader("");
    this.emitHeader("    // Execute function block");
    this.emitHeader("    void operator()();");

    // Generate method declarations (grouped by visibility)
    if (fb.methods.length > 0) {
      this.emitHeader("");
      this.generateMethodDeclarations(fb.methods);
    }

    // Generate property declarations
    if (fb.properties.length > 0) {
      this.emitHeader("");
      this.generatePropertyDeclarations(fb.properties);
    }

    // Virtual destructor (needed for classes with virtual methods)
    if (fb.methods.length > 0 || fb.properties.length > 0 || !fb.isFinal) {
      this.emitHeader("");
      this.emitHeader(`    virtual ~${fb.name}() = default;`);
    }

    // Test build: add mock infrastructure
    if (this.options.isTestBuild) {
      this.emitHeader("");
      this.emitHeader("    // Test mock infrastructure");
      this.emitHeader("    bool __mocked_ = false;");
      this.emitHeader("    struct { int call_count = 0; } __mock_state_;");
    }

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate header declaration for a program.
   */
  private generateProgramHeaderDeclaration(
    prog: CompilationUnit["programs"][0],
  ): void {
    this.emitHeaderLineDirective(prog.sourceSpan.startLine);
    const classLine = this.currentHeaderLine;
    this.emitHeader(`class Program_${prog.name} : public ProgramBase {`);
    this.emitHeader("public:");
    this.recordHeaderLineMapping(prog.sourceSpan.startLine, classLine);

    // Generate member variables and collect located variables
    for (const block of prog.varBlocks) {
      for (const decl of block.declarations) {
        const cppType = this.mapTypeRefToCpp(decl.type);
        for (const name of decl.names) {
          const memberName = this.mangleMemberIfNeeded(name, decl.type.name);
          this.emitHeaderLineDirective(decl.sourceSpan.startLine);
          const memberLine = this.currentHeaderLine;
          if (decl.address) {
            // Generate variable with optional address comment
            this.emitHeader(
              `    ${cppType} ${memberName};  // AT ${decl.address}`,
            );
            // Collect located variable info
            this.collectLocatedVar(name, decl, prog.name);
          } else {
            this.emitHeader(`    ${cppType} ${memberName};`);
          }
          this.recordHeaderLineMapping(decl.sourceSpan.startLine, memberLine);
        }
      }
    }

    this.emitHeader("");
    // Implicit IEC 61131-3 ENO pin. Mirrors EN at every call site, so
    // user code that does `IF prog.ENO THEN ...` after invoking the
    // program (or the test framework that wraps a program as a UUT and
    // invokes it like an FB) resolves. Default true matches the
    // standard's "ENO defaults to TRUE when EN is omitted".
    this.emitHeader("    // Implicit IEC 61131-3 ENO pin (mirrors EN)");
    this.emitHeader("    IEC_BOOL ENO = true;");
    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    Program_${prog.name}();`);
    this.emitHeader("");
    this.emitHeader("    // Run program");
    this.emitHeader("    void run() override;");
    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate header declaration for a function.
   */
  private generateFunctionHeaderDeclaration(
    func: CompilationUnit["functions"][0],
  ): void {
    const params = this.generateFunctionParams(func);

    this.emitHeaderLineDirective(func.sourceSpan.startLine);
    const declLine = this.currentHeaderLine;
    this.emitHeader(
      `${this.mapTypeRefToCpp(func.returnType)} ${func.name}(${params.join(", ")});`,
    );
    this.recordHeaderLineMapping(func.sourceSpan.startLine, declLine);
  }

  /**
   * Generate function parameter list including VAR_INPUT and VAR_IN_OUT.
   * VAR_IN_OUT parameters are passed by reference.
   * VLA types use ArrayView instead of IECVar reference.
   */
  protected generateFunctionParams(
    func: CompilationUnit["functions"][0],
  ): string[] {
    const params: string[] = [];
    for (const block of func.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(
              `${this.mapTypeRefToCpp(decl.type)} ${this.functionVarName(name, decl.type.name)}`,
            );
          }
        }
      } else if (block.blockType === "VAR_IN_OUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // VLA types (ArrayView) are already reference-like; others need &
            const pname = this.functionVarName(name, decl.type.name);
            if (decl.type.name.startsWith("__VLA_")) {
              params.push(`${this.mapTypeRefToCpp(decl.type)} ${pname}`);
            } else {
              // mapTypeRefToCpp preserves arrayDimensions / elementTypeName
              // (so inline ARRAY params emit Array1D<...>) but we still want
              // STRING/WSTRING maxLength dropped so any string size binds to
              // the &-reference — strip it on a shallow copy of the typeRef.
              params.push(
                `${this.mapTypeRefToCpp(this.toParamTypeRef(decl.type))}& ${pname}`,
              );
            }
          }
        }
      } else if (block.blockType === "VAR_OUTPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // Same metadata-aware lookup as VAR_IN_OUT — see the comment above.
            params.push(
              `${this.mapTypeRefToCpp(this.toParamTypeRef(decl.type))}& ${this.functionVarName(name, decl.type.name)}`,
            );
          }
        }
      }
    }
    return params;
  }

  /** The C++ name of a function parameter or local: `<name>_` when it is
   *  named like its own user type, as the body refers to it (enterScope). */
  private functionVarName(name: string, typeName: string): string {
    return this.isUserDefinedType(typeName) &&
      name.toUpperCase() === typeName.toUpperCase()
      ? `${name}_`
      : name;
  }

  // ===========================================================================
  // OOP Code Generation (Phase 5.2)
  // ===========================================================================

  /**
   * Generate header declaration for an interface.
   * Interfaces become abstract classes with pure virtual methods.
   */
  private generateInterfaceHeaderDeclaration(
    iface: InterfaceDeclaration,
  ): void {
    const extendsClause =
      iface.extends && iface.extends.length > 0
        ? ` : ${iface.extends.map((e) => `public ${e}`).join(", ")}`
        : "";

    this.emitHeaderLineDirective(iface.sourceSpan.startLine);
    const classLine = this.currentHeaderLine;
    this.emitHeader(`class ${iface.name}${extendsClause} {`);
    this.emitHeader("public:");
    this.emitHeader(`    virtual ~${iface.name}() = default;`);
    this.recordHeaderLineMapping(iface.sourceSpan.startLine, classLine);

    for (const method of iface.methods) {
      const isIfaceReturn =
        method.returnType && this.isInterfaceType(method.returnType.name);
      const returnType = method.returnType
        ? `${this.mapTypeRefToCpp(method.returnType)}${isIfaceReturn ? "&" : ""}`
        : "void";
      const params = this.generateMethodParamList(method);
      if (method.sourceSpan) {
        this.emitHeaderLineDirective(method.sourceSpan.startLine);
        const methodLine = this.currentHeaderLine;
        this.emitHeader(
          `    virtual ${returnType} ${method.name}(${params}) = 0;`,
        );
        this.recordHeaderLineMapping(method.sourceSpan.startLine, methodLine);
      } else {
        this.emitHeader(
          `    virtual ${returnType} ${method.name}(${params}) = 0;`,
        );
      }
    }

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Collect VAR_INST members from all methods of a function block.
   * These become name-mangled class members: __MethodName__varName
   */
  private collectVarInstMembers(
    fb: CompilationUnit["functionBlocks"][0],
  ): Array<{ mangledName: string; cppType: string }> {
    const result: Array<{ mangledName: string; cppType: string }> = [];
    for (const method of fb.methods) {
      for (const block of method.varBlocks) {
        if (block.blockType === "VAR_INST") {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              result.push({
                mangledName: `__${method.name}__${name}`,
                cppType: this.mapTypeRefToCpp(decl.type),
              });
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Generate method declarations in the class header, grouped by visibility.
   */
  private generateMethodDeclarations(methods: MethodDeclaration[]): void {
    // Group by visibility
    const groups: Record<Visibility, MethodDeclaration[]> = {
      PUBLIC: [],
      PRIVATE: [],
      PROTECTED: [],
    };
    for (const method of methods) {
      groups[method.visibility].push(method);
    }

    // Track current visibility section (class starts as public:)
    let currentVisibility = "public";

    for (const [visibility, visMethods] of Object.entries(groups) as [
      Visibility,
      MethodDeclaration[],
    ][]) {
      if (visMethods.length === 0) continue;

      const cppVisibility = visibility.toLowerCase();
      if (cppVisibility !== currentVisibility) {
        this.emitHeader(`${cppVisibility}:`);
        currentVisibility = cppVisibility;
      }

      for (const method of visMethods) {
        const isIfaceReturn =
          method.returnType && this.isInterfaceType(method.returnType.name);
        const returnType = method.returnType
          ? `${this.mapTypeRefToCpp(method.returnType)}${isIfaceReturn ? "&" : ""}`
          : "void";
        const params = this.generateMethodParamList(method);

        // Build declaration with appropriate specifiers
        let prefix: string;
        let suffix: string;

        if (method.isAbstract) {
          prefix = "virtual ";
          suffix = " = 0";
        } else if (method.isOverride) {
          prefix = "";
          suffix = " override";
          if (method.isFinal) suffix += " final";
        } else {
          prefix = "virtual ";
          suffix = method.isFinal ? " final" : "";
        }

        this.emitHeaderLineDirective(method.sourceSpan.startLine);
        const methodLine = this.currentHeaderLine;
        this.emitHeader(
          `    ${prefix}${returnType} ${method.name}(${params})${suffix};`,
        );
        this.recordHeaderLineMapping(method.sourceSpan.startLine, methodLine);
      }
    }

    // Restore public section if we changed it (for destructor etc.)
    if (currentVisibility !== "public") {
      this.emitHeader("public:");
    }
  }

  /**
   * Generate parameter list string for a method declaration.
   * VAR_INPUT, VAR_OUTPUT (by ref), VAR_IN_OUT (by ref) become C++ params.
   */
  private generateMethodParamList(method: MethodDeclaration): string {
    const params: string[] = [];
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(`${this.mapTypeRefToCpp(decl.type)} ${name}`);
          }
        }
      } else if (block.blockType === "VAR_IN_OUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            // mapTypeRefToCpp preserves arrayDimensions / elementTypeName
            // (so inline ARRAY params emit Array1D<...>) while
            // toParamTypeRef strips STRING/WSTRING maxLength so any
            // string size binds to the &-reference.
            params.push(
              `${this.mapTypeRefToCpp(this.toParamTypeRef(decl.type))}& ${name}`,
            );
          }
        }
      } else if (block.blockType === "VAR_OUTPUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            params.push(
              `${this.mapTypeRefToCpp(this.toParamTypeRef(decl.type))}& ${name}`,
            );
          }
        }
      }
    }
    return params.join(", ");
  }

  /**
   * Generate property getter/setter declarations in the class header.
   */
  private generatePropertyDeclarations(
    properties: PropertyDeclaration[],
  ): void {
    this.emitHeader("    // Properties");
    for (const prop of properties) {
      const type = this.mapTypeRefToCpp(prop.type);
      this.emitHeaderLineDirective(prop.sourceSpan.startLine);
      const propLine = this.currentHeaderLine;
      if (prop.getter) {
        this.emitHeader(`    virtual ${type} get_${prop.name}() const;`);
      }
      if (prop.setter) {
        this.emitHeader(
          `    virtual void set_${prop.name}(${type} ${prop.name});`,
        );
      }
      this.recordHeaderLineMapping(prop.sourceSpan.startLine, propLine);
    }
  }

  /**
   * Generate implementation for a method (in the .cpp file).
   * Follows the same return-variable pattern as functions.
   */
  private generateMethodImplementation(
    method: MethodDeclaration,
    className: string,
  ): void {
    const isIfaceReturn =
      method.returnType && this.isInterfaceType(method.returnType.name);
    const returnType = method.returnType
      ? `${this.mapTypeRefToCpp(method.returnType)}${isIfaceReturn ? "&" : ""}`
      : "void";
    const params = this.generateMethodParamList(method);

    this.emitLineDirective(method.sourceSpan.startLine);
    const implLine = this.currentLine;
    this.emit(`${returnType} ${className}::${method.name}(${params}) {`);

    // Declare return variable if method has return type
    if (method.returnType) {
      if (isIfaceReturn) {
        // Interface return: assignments to result become return statements
        this.interfaceReturnMethod = true;
      } else {
        this.emit(
          `    ${this.mapTypeRefToCpp(method.returnType)} ${method.name}_result;`,
        );
      }
      this.currentFunctionName = method.name;
    }

    // Set up VAR_INST name mangling
    this.varInstMangledNames.clear();
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR_INST") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            this.varInstMangledNames.set(
              name.toUpperCase(),
              `__${method.name}__${name}`,
            );
          }
        }
      }
    }

    // Merge FB scope + method scope so FB member types are visible (same pattern as properties)
    this.enterScope([...this.currentFBVarBlocks, ...method.varBlocks]);

    // Declare local variables (VAR, VAR_TEMP)
    for (const block of method.varBlocks) {
      if (block.blockType === "VAR" || block.blockType === "VAR_TEMP") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            const cppType = this.mapTypeRefToCpp(decl.type);
            const initValue = decl.initialValue
              ? ` = ${this.generateInitializer(decl.initialValue, cppType, decl.type.name)}`
              : "";
            this.emit(`    ${cppType} ${name}${initValue};`);
          }
        }
      }
    }

    // Generate body
    if (method.body.length > 0) {
      this.generateStatements(method.body);
    }

    // Return if method has return type
    if (method.returnType) {
      if (!isIfaceReturn) {
        this.emit(`    return ${method.name}_result;`);
      }
      this.currentFunctionName = undefined;
      this.interfaceReturnMethod = false;
    }

    // Clean up
    this.exitScope();
    this.varInstMangledNames.clear();

    this.emitLineDirective(method.sourceSpan.endLine);
    this.emit("}");
    this.emit("");
    this.recordLineMapping(method.sourceSpan.startLine, implLine);
  }

  /**
   * Generate implementation for a property (getter and/or setter in the .cpp file).
   */
  private generatePropertyImplementation(
    prop: PropertyDeclaration,
    className: string,
  ): void {
    const type = this.mapTypeRefToCpp(prop.type);

    // Getter
    if (prop.getter) {
      this.emitLineDirective(prop.sourceSpan.startLine);
      const getterLine = this.currentLine;
      this.emit(`${type} ${className}::get_${prop.name}() const {`);
      this.emit(`    ${type} ${prop.name}_result;`);
      this.currentFunctionName = prop.name;
      this.generateStatements(prop.getter);
      this.emit(`    return ${prop.name}_result;`);
      this.currentFunctionName = undefined;
      this.emit("}");
      this.emit("");
      this.recordLineMapping(prop.sourceSpan.startLine, getterLine);
    }

    // Setter
    if (prop.setter) {
      this.emitLineDirective(prop.sourceSpan.startLine);
      const setterLine = this.currentLine;
      this.emit(`void ${className}::set_${prop.name}(${type} ${prop.name}) {`);
      // In setter, prop.name refers to the input parameter (no redirection)
      this.generateStatements(prop.setter);
      this.emit("}");
      this.emit("");
      this.recordLineMapping(prop.sourceSpan.startLine, setterLine);
    }
  }

  /**
   * Generate implementation for a program.
   */
  private generateProgramImplementation(
    prog: CompilationUnit["programs"][0],
  ): void {
    // Constructor
    this.emit(`Program_${prog.name}::Program_${prog.name}() {`);
    this.emit("    // Initialize variables");
    for (const block of prog.varBlocks) {
      for (const decl of block.declarations) {
        if (decl.initialValue !== undefined) {
          const initExpr = this.generateInitializer(
            decl.initialValue,
            this.mapTypeRefToCpp(decl.type),
            decl.type.name,
          );
          for (const name of decl.names) {
            this.emit(`    ${name} = ${initExpr};`);
          }
        }
      }
    }

    // Initialize located variable pointers
    this.generateLocatedVarPointerInit(prog.name);

    this.emit("}");
    this.emit("");
    // PROGRAM line now maps to header class declaration, not constructor

    // Run method
    this.emit(`void Program_${prog.name}::run() {`);
    this.enterScope(prog.varBlocks);
    if (prog.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(prog.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty program body");
    }
    this.exitScope();
    this.emitLineDirective(prog.sourceSpan.endLine);
    const closingBraceLine = this.currentLine;
    this.emit("}");
    this.emit("");
    this.recordLineMapping(prog.sourceSpan.endLine, closingBraceLine);
  }

  /**
   * Generate implementation for a function block.
   */
  private generateFBImplementation(
    fb: CompilationUnit["functionBlocks"][0],
  ): void {
    this.currentFBName = fb.name;
    this.currentFBExtends = fb.extends;
    this.currentFBVarBlocks = fb.varBlocks;
    this.currentRefInouts =
      this.fbRefInoutParams.get(fb.name.toUpperCase()) ?? new Set();
    this.currentFBInterfaceMethods = this.getInterfaceMethodNames(fb);

    // VAR_EXTERNAL: body access (operator(), methods, properties) is rewritten
    // to go through the GlobalVar pointer (g->read()/write()/with_lock), exactly
    // like a PROGRAM. Set for the whole implementation, cleared at the end.
    const externalDecls = this.collectFBExternals(fb);
    this.globalRefs = this.externalRefs(externalDecls);

    // Constructor with initializer list for variables with defaults
    const fbInits: string[] = [];
    // Bind each VAR_EXTERNAL pointer to the file-scope canonical global. The
    // namespace qualifier disambiguates the global from the same-named pointer
    // member being initialized. File-scope visibility means this works no
    // matter how deeply the FB is instantiated — no pointer threading.
    if (externalDecls.length > 0) {
      const ns = this.projectModel
        ? getProjectNamespace(this.projectModel)
        : "strucpp";
      for (const e of externalDecls) {
        fbInits.push(`${e.name}(&${ns}::${e.name})`);
      }
    }
    for (const block of fb.varBlocks) {
      if (block.blockType === "VAR_EXTERNAL") continue;
      for (const decl of block.declarations) {
        if (decl.initialValue) {
          const cppType = this.mapTypeRefToCpp(decl.type);
          const initExpr = this.generateInitializer(
            decl.initialValue,
            cppType,
            decl.type.name,
          );
          for (const name of decl.names) {
            const memberName = this.mangleMemberIfNeeded(name, decl.type.name);
            fbInits.push(`${memberName}(${initExpr})`);
          }
        }
      }
    }
    if (fbInits.length > 0) {
      this.emit(`${fb.name}::${fb.name}()`);
      this.emit(`    : ${fbInits.join(", ")}`);
      this.emit("{");
    } else {
      this.emit(`${fb.name}::${fb.name}() {`);
    }
    this.emit("    // Initialize variables");
    this.emit("}");
    this.emit("");

    // Operator()
    this.emitLineDirective(fb.sourceSpan.startLine);
    const fbImplLine = this.currentLine;
    this.emit(`void ${fb.name}::operator()() {`);
    if (this.options.isTestBuild) {
      this.emit("    if (__mocked_) { __mock_state_.call_count++; return; }");
    }
    this.enterScope(fb.varBlocks);
    if (fb.body.length > 0) {
      this.generateStatements(fb.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty function block body");
    }
    this.exitScope();
    this.emitLineDirective(fb.sourceSpan.endLine);
    this.emit("}");
    this.emit("");
    this.recordLineMapping(fb.sourceSpan.startLine, fbImplLine);

    // Method implementations
    for (const method of fb.methods) {
      if (!method.isAbstract) {
        this.generateMethodImplementation(method, fb.name);
      }
    }

    // Property implementations (enter FB scope so FB member types are visible)
    for (const prop of fb.properties) {
      this.enterScope(fb.varBlocks);
      this.generatePropertyImplementation(prop, fb.name);
      this.exitScope();
    }

    this.currentRefInouts = new Set();
    this.currentFBName = undefined;
    this.currentFBExtends = undefined;
    this.currentFBVarBlocks = [];
    this.currentFBInterfaceMethods = new Set();
    this.globalRefs = new Map();
  }

  /**
   * Generate implementation for a function.
   */
  private generateFunctionImplementation(
    func: CompilationUnit["functions"][0],
  ): void {
    const params = this.generateFunctionParams(func);
    const retType = this.mapTypeRefToCpp(func.returnType);

    // Helper to emit local variable declarations (VAR/VAR_TEMP) and body
    const emitFunctionBody = (funcName: string) => {
      this.emit(`    ${retType} ${funcName}_result;`);
      this.currentFunctionName = func.name;
      this.enterScope(func.varBlocks);

      // Declare local variables (VAR, VAR_TEMP) — same pattern as method locals
      for (const block of func.varBlocks) {
        if (block.blockType === "VAR" || block.blockType === "VAR_TEMP") {
          for (const decl of block.declarations) {
            for (const name of decl.names) {
              const cppType = this.mapTypeRefToCpp(decl.type);
              const initValue = decl.initialValue
                ? ` = ${this.generateInitializer(decl.initialValue, cppType, decl.type.name)}`
                : "";
              this.emit(
                `    ${cppType} ${this.functionVarName(name, decl.type.name)}${initValue};`,
              );
            }
          }
        }
      }

      if (func.body.length > 0) {
        this.generateStatements(func.body);
      } else if (this.options.sourceComments) {
        this.emit("    // Empty function body");
      }
      this.exitScope();
      this.currentFunctionName = undefined;
      this.emit(`    return ${funcName}_result;`);
    };

    if (this.options.isTestBuild) {
      // Test build: generate _real, dispatch pointer, and wrapper
      // 1. _real implementation (original body with renamed function)
      this.emitLineDirective(func.sourceSpan.startLine);
      const realLine = this.currentLine;
      this.emit(`${retType} ${func.name}_real(${params.join(", ")}) {`);
      emitFunctionBody(func.name);
      this.emit("}");
      this.emit("");
      this.recordLineMapping(func.sourceSpan.startLine, realLine);

      // 2. Dispatch pointer (defaults to real implementation)
      this.emit(
        `${retType} (*${func.name}_dispatch)(${params.join(", ")}) = ${func.name}_real;`,
      );
      this.emit("");

      // 3. Wrapper that calls through dispatch pointer
      const paramNames = this.generateFunctionParamNames(func);
      this.emit(`${retType} ${func.name}(${params.join(", ")}) {`);
      this.emit(`    return ${func.name}_dispatch(${paramNames.join(", ")});`);
      this.emit("}");
      this.emit("");
    } else {
      // Production build: normal function
      this.emitLineDirective(func.sourceSpan.startLine);
      const funcImplLine = this.currentLine;
      this.emit(`${retType} ${func.name}(${params.join(", ")}) {`);
      emitFunctionBody(func.name);
      this.emit("}");
      this.emit("");
      this.recordLineMapping(func.sourceSpan.startLine, funcImplLine);
    }
  }

  /**
   * Generate function parameter name list (just names, no types).
   */
  private generateFunctionParamNames(
    func: CompilationUnit["functions"][0],
  ): string[] {
    const names: string[] = [];
    for (const block of func.varBlocks) {
      if (block.blockType === "VAR_INPUT" || block.blockType === "VAR_IN_OUT") {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            names.push(this.functionVarName(name, decl.type.name));
          }
        }
      }
    }
    return names;
  }

  // ===========================================================================
  // Project Model-based Generation (Phase 2.1)
  // ===========================================================================

  /**
   * Generate header declaration for a program from the project model.
   * Handles VAR_EXTERNAL as reference members.
   */
  private generateProgramHeaderFromModel(prog: ProgramDecl): void {
    const className = `Program_${prog.name}`;

    // Look up AST program for source spans
    const astProg = this.ast?.programs.find(
      (p) => p.name.toUpperCase() === prog.name.toUpperCase(),
    );

    if (astProg) {
      this.emitHeaderLineDirective(astProg.sourceSpan.startLine);
    }
    const classLine = this.currentHeaderLine;
    this.emitHeader(`class ${className} : public ProgramBase {`);
    this.emitHeader("public:");

    // Map PROGRAM line → class declaration
    if (astProg) {
      this.recordHeaderLineMapping(astProg.sourceSpan.startLine, classLine);
    }

    // Build name→sourceLine lookup from AST for variable mappings
    const varSourceLines = new Map<string, number>();
    if (astProg) {
      for (const block of astProg.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            varSourceLines.set(name, decl.sourceSpan.startLine);
          }
        }
      }
    }

    // Generate local variable members and collect located variables
    if (prog.varDeclarations.length > 0) {
      this.emitHeader("    // Local variables");
      for (const decl of prog.varDeclarations) {
        const constQualifier = decl.isConstant ? "const " : "";

        // Use mapTypeRefToCpp so inline ARRAY types (where typeName looks
        // like __INLINE_ARRAY_<T> and the bounds live alongside on the
        // ProjectVarDeclaration) get expanded to Array1D<T, L, U>. Going
        // through mapVarTypeToCpp directly would emit IEC___INLINE_ARRAY_<T>.
        const cppType = this.mapTypeRefToCpp({
          name: decl.typeName,
          ...(decl.maxLength !== undefined
            ? { maxLength: decl.maxLength }
            : {}),
          ...(decl.arrayDimensions !== undefined
            ? { arrayDimensions: decl.arrayDimensions }
            : {}),
          ...(decl.elementTypeName !== undefined
            ? { elementTypeName: decl.elementTypeName }
            : {}),
          ...(decl.elementMaxLength !== undefined
            ? { elementMaxLength: decl.elementMaxLength }
            : {}),
          ...(decl.elementReferenceChain !== undefined
            ? { elementReferenceChain: decl.elementReferenceChain }
            : {}),
          ...(decl.referenceKind !== undefined
            ? { referenceKind: decl.referenceKind }
            : {}),
          ...(decl.referenceChain !== undefined
            ? { referenceChain: decl.referenceChain }
            : {}),
        });
        const memberName = this.mangleMemberIfNeeded(decl.name, decl.typeName);
        // Map variable ST line → header member line
        const stLine = varSourceLines.get(decl.name);
        if (stLine !== undefined) {
          this.emitHeaderLineDirective(stLine);
        }
        const memberLine = this.currentHeaderLine;
        if (decl.address) {
          this.emitHeader(
            `    ${constQualifier}${cppType} ${memberName};  // AT ${decl.address}`,
          );
          // Collect located variable info
          this.collectLocatedVarFromModel(decl, prog.name);
        } else {
          this.emitHeader(`    ${constQualifier}${cppType} ${memberName};`);
        }

        if (stLine !== undefined) {
          this.recordHeaderLineMapping(stLine, memberLine);
        }
      }
    }

    // Generate external variable members.
    //
    // A VAR_EXTERNAL reference to a CONFIGURATION VAR_GLOBAL is a pointer to the
    // single canonical GlobalVar<V> (which bundles the value + that global's own
    // mutex). Access goes through the pointer: `g->read()` / `g->write(v)` /
    // `g->with_lock(f)`. The lock is a no-op in the non-threaded build. Same
    // member shape and body code in both builds.
    if (prog.varExternal.length > 0) {
      // VAR_EXTERNAL records carry separate `name`/`typeName`;
      // projectVarToTypeRef + toParamTypeRef + mapTypeRefToCpp resolve the
      // C++ type the same way the constructor params do (must agree).
      const extTypes = prog.varExternal.map((ext) =>
        this.externalTypeRefCpp(ext),
      );
      this.emitHeader("    // External variables (pointers to shared globals)");
      for (let i = 0; i < prog.varExternal.length; i++) {
        const ext = prog.varExternal[i]!;
        // Every external — scalar or composite — is a pointer to its canonical
        // GlobalVar<V>; body access goes through it under the global's lock.
        this.emitHeader(
          `    GlobalVar<${extTypes[i]!}>* ${ext.name} = nullptr;`,
        );
      }
    }

    this.emitHeader("");
    // Implicit IEC 61131-3 ENO pin (see generateProgramHeaderDeclaration
    // for the rationale; this is the project-model code path, same shape).
    this.emitHeader("    // Implicit IEC 61131-3 ENO pin (mirrors EN)");
    this.emitHeader("    IEC_BOOL ENO = true;");
    this.emitHeader("");
    this.emitHeader("    // Constructor");
    if (prog.varExternal.length > 0) {
      // Constructor takes a pointer to each canonical GlobalVar<V> (the
      // configuration owns the storage + mutex; the program just points at it).
      const params = prog.varExternal
        .map((ext) => {
          const cppType = this.externalTypeRefCpp(ext);
          return `GlobalVar<${cppType}>* ${ext.name}_ref`;
        })
        .join(", ");
      this.emitHeader(`    explicit ${className}(${params});`);
    } else {
      this.emitHeader(`    ${className}();`);
    }
    this.emitHeader("");
    this.emitHeader("    // Run program");
    this.emitHeader("    void run() override;");

    // Threaded-runtime override (STRUCPP_THREADED only): this program's slice
    // of the located-vars table, for PROGRAM-LOCAL `VAR AT` only. Shared globals
    // no longer use sync_in/sync_out — VAR_EXTERNAL access goes through the
    // GlobalVar pointer (per-global-mutex locked). `sync_in`/`sync_out` remain
    // reserved no-op vtable slots in ProgramBase for ABI stability; we simply
    // don't override them. Config-scope located globals are copied at the
    // barrier (owned by the configuration), so this range covers only this
    // program's own `VAR AT` declarations.
    const threadedRange = this.locatedRangeForProgram(prog.name);
    if (threadedRange.count > 0) {
      this.emitHeader("");
      this.emitHeader("#ifdef STRUCPP_THREADED");
      this.emitHeader(
        `    void located_range(uint32_t* __off, uint32_t* __cnt) const override { *__off = ${threadedRange.offset}; *__cnt = ${threadedRange.count}; }`,
      );
      this.emitHeader("#endif");
    }

    // No per-program retain members are emitted. Retained leaves are listed
    // once, project-wide, in `generated_debug.cpp`'s `retain_vars[]` — see
    // backend/debug-table-gen.ts and runtime/include/iec_retain.hpp.
    //
    // `getRetainVars` / `getRetainCount` stay as no-op base methods on
    // ProgramBase and are deliberately NOT overridden: the v4 runtime's ABI
    // mirror pins their vtable positions, and renumbering would mis-dispatch
    // run() for any program built against a different version.

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate implementation for a program from the project model.
   */
  private generateProgramImplementationFromModel(prog: ProgramDecl): void {
    // Look up AST program for source span
    const astProg = this.ast?.programs.find(
      (p) => p.name.toUpperCase() === prog.name.toUpperCase(),
    );

    // Constructor
    if (prog.varExternal.length > 0) {
      // Same metadata-aware type resolution as the matching declaration
      // in generateProgramHeaderFromModel — must agree byte-for-byte or
      // the linker rejects the definition.
      const params = prog.varExternal
        .map((ext) => {
          const cppType = this.externalTypeRefCpp(ext);
          return `GlobalVar<${cppType}>* ${ext.name}_ref`;
        })
        .join(", ");
      this.emit(`Program_${prog.name}::Program_${prog.name}(${params})`);

      // Initializer list
      const inits: string[] = [];
      for (const decl of prog.varDeclarations) {
        const initVal = this.projectVarInitializer(decl);
        if (initVal) {
          // Name the member as `generateProgramHeaderFromModel` declared it —
          // `scale : Scale` is a collision (ST names are case-insensitive) and
          // is declared `SCALE_`, so an initializer list naming `SCALE` does not
          // compile. The FUNCTION_BLOCK constructor already does this.
          inits.push(
            `${this.mangleMemberIfNeeded(decl.name, decl.typeName)}(${initVal})`,
          );
        }
      }
      // External globals: bind the pointer member to the canonical GlobalVar<V>
      // passed by the configuration. Identical in both builds.
      const extInits = prog.varExternal.map(
        (ext) => `${ext.name}(${ext.name}_ref)`,
      );
      const combined = [...inits, ...extInits];
      if (combined.length > 0) {
        this.emit(`    : ${combined.join(", ")}`);
      }
      this.emit("{");

      // Initialize located variable pointers
      this.generateLocatedVarPointerInit(prog.name);

      this.emit("}");
    } else {
      this.emit(`Program_${prog.name}::Program_${prog.name}()`);
      // Initializer list for local variables
      const inits: string[] = [];
      for (const decl of prog.varDeclarations) {
        const initVal = this.projectVarInitializer(decl);
        if (initVal) {
          // Name the member as `generateProgramHeaderFromModel` declared it —
          // `scale : Scale` is a collision (ST names are case-insensitive) and
          // is declared `SCALE_`, so an initializer list naming `SCALE` does not
          // compile. The FUNCTION_BLOCK constructor already does this.
          inits.push(
            `${this.mangleMemberIfNeeded(decl.name, decl.typeName)}(${initVal})`,
          );
        }
      }
      if (inits.length > 0) {
        this.emit(`    : ${inits.join(", ")}`);
      }
      this.emit("{");

      // Initialize located variable pointers
      this.generateLocatedVarPointerInit(prog.name);

      this.emit("}");
    }
    this.emit("");
    // PROGRAM line now maps to header class declaration, not constructor

    // Run method
    this.emit(`void Program_${prog.name}::run() {`);
    // VAR_EXTERNAL names for this program: body access to these is rewritten to
    // go through the GlobalVar pointer (g->read()/write()/with_lock).
    this.globalRefs = this.externalRefs(prog.varExternal);
    if (astProg) {
      this.enterScope(astProg.varBlocks);
    }
    if (astProg && astProg.body.length > 0) {
      // Generate statements (Phase 2.8: only ExternalCodePragma; Phase 3+: all statements)
      this.generateStatements(astProg.body);
    } else if (this.options.sourceComments) {
      this.emit("    // Empty program body");
    }
    if (astProg) {
      this.exitScope();
      this.emitLineDirective(astProg.sourceSpan.endLine);
    }
    this.globalRefs = new Map();
    const closingBraceLine = this.currentLine;
    this.emit("}");
    this.emit("");
    if (astProg) {
      this.recordLineMapping(astProg.sourceSpan.endLine, closingBraceLine);
    }
  }

  /**
   * Emit configuration VAR_GLOBALs as file-scope `inline GlobalVar<V>`
   * singletons — one per unique name — instead of configuration-class members.
   *
   * File scope makes the single canonical storage (value + its own mutex)
   * reachable from every POU regardless of nesting: a program keeps receiving a
   * `GlobalVar<V>*` via the configuration constructor (which now hands over the
   * file-scope address), and a function block binds its VAR_EXTERNAL pointer
   * straight to `&<ns>::<name>` in its own constructor — no pointer threading
   * through containers. Must run before the FB/program/config classes so their
   * bodies can name the globals. Also registers located VAR_GLOBALs so the
   * runtime binds them to the I/O image.
   */
  /**
   * Forward-declare every interface, function block, program and configuration
   * class. Emitted twice: once ahead of the user-defined types, which may name a
   * function block, and once in the usual forward-declaration block.
   */
  private emitPouForwardDeclarations(ast: CompilationUnit): void {
    for (const iface of ast.interfaces) {
      this.emitHeader(`class ${iface.name};`);
    }
    for (const fb of ast.functionBlocks) {
      this.emitHeader(`class ${fb.name};`);
    }
    for (const prog of ast.programs) {
      this.emitHeader(`class Program_${prog.name};`);
    }
    for (const config of ast.configurations) {
      this.emitHeader(`class Configuration_${config.name};`);
    }
    if (
      ast.interfaces.length > 0 ||
      ast.functionBlocks.length > 0 ||
      ast.programs.length > 0 ||
      ast.configurations.length > 0
    ) {
      this.emitHeader("");
    }
  }

  /**
   * A global whose type holds a function block instance cannot precede that
   * class, so it is emitted with the types that were held back.
   */
  private globalFollowsBlocks(typeName: string): boolean {
    const upper = typeName.toUpperCase();
    // `GlobalVar<V>` holds V by value, so the storage cannot precede the
    // structure any more than the structure can precede what it names.
    return (
      this.knownFBTypes.has(upper) ||
      this.fbBearingTypeDeps.has(upper) ||
      this.libraryTypeBearingTypes.has(upper)
    );
  }

  private emitFileScopeGlobals(phase: "early" | "late"): void {
    if (!this.projectModel) return;
    const seen = new Set<string>();
    let emittedAny = false;
    for (const config of this.projectModel.configurations) {
      for (const gvar of config.globalVars) {
        const key = gvar.name.toUpperCase();
        if (this.globalFollowsBlocks(gvar.typeName) !== (phase === "late")) {
          continue;
        }
        // Same name across configurations = one canonical global (strucpp
        // already treats them as such); emit its storage once.
        if (seen.has(key)) continue;
        seen.add(key);

        const cppType = this.mapTypeRefToCpp(this.projectVarToTypeRef(gvar));
        // GlobalVar's initialising constructor is a template
        // (`template<typename T> explicit GlobalVar(T)`), so a bare braced list
        // has nothing to deduce from — name the type for aggregate initialisers
        // (array literals) and pass everything else straight through.
        const rawInit = this.projectVarInitializer(gvar) ?? "";
        const initVal = rawInit.startsWith("{")
          ? `${cppType}${rawInit}`
          : rawInit;

        if (!emittedAny) {
          this.emitHeader(
            "// Configuration VAR_GLOBAL storage — file-scope so every POU " +
              "(program or nested function block) reaches the one canonical " +
              "GlobalVar<V> (value + mutex).",
          );
          emittedAny = true;
        }
        // Must stay a real object — generated_debug.cpp takes `&name` into PROGMEM.
        this.emitHeader(
          `inline GlobalVar<${cppType}> ${gvar.name}{${initVal}};`,
        );

        // A located VAR_GLOBAL (`AT %IX/%QX/%MW ...`) enters the located-vars
        // descriptor so the runtime binds it to the I/O image. Owner "@config"
        // (not a real program) keeps it out of every program's located_range.
        if (gvar.address) {
          this.collectLocatedVarFromModel(
            {
              name: gvar.name,
              typeName: gvar.typeName,
              address: gvar.address,
              // Carried through so a located ARRAY global expands to one
              // descriptor per element rather than binding only its first.
              arrayDimensions: gvar.arrayDimensions,
            },
            "@config",
          );
        }
      }
    }
    if (emittedAny) this.emitHeader("");
  }

  /**
   * Generate header declaration for a configuration from the project model.
   */
  private generateConfigurationHeaderFromModel(
    config: ConfigurationDecl,
  ): void {
    this.emitHeader(
      `class Configuration_${config.name} : public ConfigurationInstance {`,
    );
    this.emitHeader("public:");

    // VAR_GLOBALs are emitted as file-scope singletons (see
    // emitFileScopeGlobals), not configuration-class members, so every POU can
    // reach them. Nothing to declare inside the class here.

    // Generate program instance members
    const allInstances = this.collectProgramInstances(config);
    if (allInstances.length > 0) {
      this.emitHeader("    // Program instances");
      for (const inst of allInstances) {
        this.emitHeader(
          `    Program_${inst.programType} ${inst.instanceName};`,
        );
      }
      this.emitHeader("");
    }

    // Generate task and resource storage
    const taskCount = this.countTasks(config);
    const resourceCount = config.resources.length;
    if (taskCount > 0) {
      this.emitHeader("    // Task storage");
      this.emitHeader(`    TaskInstance tasks_storage[${taskCount}];`);
      this.emitHeader(
        `    ProgramBase* task_programs_storage[${allInstances.length > 0 ? allInstances.length : 1}];`,
      );
    }
    if (resourceCount > 0) {
      this.emitHeader("    // Resource storage");
      this.emitHeader(
        `    ResourceInstance resources_storage[${resourceCount}];`,
      );
    }
    this.emitHeader("");

    // Constructor
    this.emitHeader("    // Constructor");
    this.emitHeader(`    Configuration_${config.name}();`);
    this.emitHeader("");

    // ConfigurationInstance interface
    this.emitHeader("    // ConfigurationInstance interface");
    this.emitHeader("    const char* get_name() const override;");
    this.emitHeader("    ResourceInstance* get_resources() override;");
    this.emitHeader("    size_t get_resource_count() const override;");

    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate implementation for a configuration from the project model.
   */
  private generateConfigurationImplementationFromModel(
    config: ConfigurationDecl,
  ): void {
    const allInstances = this.collectProgramInstances(config);

    // Constructor
    this.emit(`Configuration_${config.name}::Configuration_${config.name}()`);

    // Initializer list
    const inits: string[] = [];

    // VAR_GLOBALs self-initialize at file scope (see emitFileScopeGlobals), so
    // there's nothing to init here.

    // Initialize program instances (with external variable references).
    // `&${ext.name}` now resolves to the file-scope global (the class no longer
    // shadows it with a member), so programs receive the same canonical pointer.
    for (const inst of allInstances) {
      const prog = this.projectModel?.programs.get(
        inst.programType.toUpperCase(),
      );
      if (prog && prog.varExternal.length > 0) {
        // Pass a pointer to each canonical GlobalVar<V> member.
        const args = prog.varExternal.map((ext) => `&${ext.name}`).join(", ");
        inits.push(`${inst.instanceName}(${args})`);
      } else {
        inits.push(`${inst.instanceName}()`);
      }
    }

    if (inits.length > 0) {
      this.emit(`    : ${inits.join(",")}`);
    }
    this.emit("{");

    // Wire up tasks and resources
    if (this.options.sourceComments) {
      this.emit("    // Wire up tasks and resources");
    }

    let taskIndex = 0;
    let programIndex = 0;
    let resourceIndex = 0;

    for (const resource of config.resources) {
      const resourceTaskStart = taskIndex;

      for (const task of resource.tasks) {
        const taskProgramStart = programIndex;

        // Store program pointers for this task
        for (const inst of task.programInstances) {
          this.emit(
            `    task_programs_storage[${programIndex}] = &${inst.instanceName};`,
          );
          programIndex++;
        }

        // Initialize task
        const intervalNs = task.interval?.nanoseconds ?? 0;
        const priority = task.priority ?? 0;
        const programCount = task.programInstances.length;
        this.emit(
          `    tasks_storage[${taskIndex}] = TaskInstance("${task.name}", ${intervalNs}LL, ${priority}, &task_programs_storage[${taskProgramStart}], ${programCount});`,
        );
        taskIndex++;
      }

      // Initialize resource
      const taskCount = resource.tasks.length;
      this.emit(
        `    resources_storage[${resourceIndex}] = ResourceInstance("${resource.name}", "${resource.processor}", &tasks_storage[${resourceTaskStart}], ${taskCount});`,
      );
      resourceIndex++;
    }

    // #172: bind located VAR_GLOBAL descriptor pointers to the canonical
    // storage (through the GlobalVar<V> wrapper's `.value`). The runtime copies
    // the I/O image to/from these pointers (locking each global's mutex on the
    // threaded path).
    this.generateLocatedVarPointerInit("@config", "    ", ".value");

    this.emit("}");
    this.emit("");

    // get_name()
    this.emit(`const char* Configuration_${config.name}::get_name() const {`);
    this.emit(`    return "${config.name}";`);
    this.emit("}");
    this.emit("");

    // get_resources()
    this.emit(
      `ResourceInstance* Configuration_${config.name}::get_resources() {`,
    );
    this.emit("    return resources_storage;");
    this.emit("}");
    this.emit("");

    // get_resource_count()
    this.emit(
      `size_t Configuration_${config.name}::get_resource_count() const {`,
    );
    this.emit(`    return ${config.resources.length};`);
    this.emit("}");
    this.emit("");
  }

  /**
   * Generate header declaration for a configuration from AST (fallback).
   */
  private generateConfigurationHeaderDeclaration(
    config: CompilationUnit["configurations"][0],
  ): void {
    this.emitHeader(
      `class Configuration_${config.name} : public ConfigurationInstance {`,
    );
    this.emitHeader("public:");

    // Generate VAR_GLOBAL members
    for (const block of config.varBlocks) {
      if (block.blockType === "VAR_GLOBAL") {
        this.emitHeader("    // VAR_GLOBAL variables");
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            this.emitHeader(`    ${this.mapTypeRefToCpp(decl.type)} ${name};`);
          }
        }
      }
    }

    this.emitHeader("");
    this.emitHeader("    // Constructor");
    this.emitHeader(`    Configuration_${config.name}();`);
    this.emitHeader("");
    this.emitHeader("    // ConfigurationInstance interface");
    this.emitHeader("    const char* get_name() const override;");
    this.emitHeader("    ResourceInstance* get_resources() override;");
    this.emitHeader("    size_t get_resource_count() const override;");
    this.emitHeader("};");
    this.emitHeader("");
  }

  /**
   * Generate implementation for a configuration from AST (fallback).
   */
  private generateConfigurationImplementation(
    config: CompilationUnit["configurations"][0],
  ): void {
    this.emit(`Configuration_${config.name}::Configuration_${config.name}() {`);
    this.emit("    // Initialize configuration");
    this.emit("}");
    this.emit("");

    this.emit(`const char* Configuration_${config.name}::get_name() const {`);
    this.emit(`    return "${config.name}";`);
    this.emit("}");
    this.emit("");

    this.emit(
      `ResourceInstance* Configuration_${config.name}::get_resources() {`,
    );
    this.emit("    return nullptr;");
    this.emit("}");
    this.emit("");

    this.emit(
      `size_t Configuration_${config.name}::get_resource_count() const {`,
    );
    this.emit("    return 0;");
    this.emit("}");
    this.emit("");
  }

  // ===========================================================================
  // Statement Generation (Phase 2.8+)
  // ===========================================================================

  /**
   * Generate code for a statement.
   */
  protected generateStatement(stmt: Statement, indent: string = "    "): void {
    this.currentStatementIndent = indent;
    this.emitLineDirective(stmt.sourceSpan.startLine);
    const cppStartLine = this.currentLine;
    // Compound statements handle their own line mappings internally
    let isCompound = false;
    switch (stmt.kind) {
      case "AssignmentStatement":
        this.generateAssignmentStatement(stmt, indent);
        break;
      case "RefAssignStatement":
        this.generateRefAssignStatement(stmt, indent);
        break;
      case "FunctionCallStatement": {
        if (stmt.call.kind === "MethodCallExpression") {
          this.emit(
            `${indent}${this.generateMethodCallExpression(stmt.call)};`,
          );
        } else {
          const fbType = this.getFBInvocationType(
            stmt.call.functionName,
            stmt.call.instance !== undefined,
          );
          if (fbType) {
            this.generateFBInvocation(stmt.call, indent);
          } else if (
            stmt.call.kind === "FunctionCallExpression" &&
            this.hasEnEno(stmt.call.arguments)
          ) {
            // Non-FB function call statement with EN/ENO
            const { enExpr, enoVar, filteredArgs } = this.extractEnEno(
              stmt.call.arguments,
            );
            const modifiedCall: FunctionCallExpression = {
              ...stmt.call,
              arguments: filteredArgs,
            };
            const callExpr = this.generateFunctionCallExpression(modifiedCall);
            this.emitEnEnoWrapper(indent, enExpr, enoVar, (bi) => {
              this.emit(`${bi}${callExpr};`);
            });
          } else {
            this.emit(`${indent}${this.generateExpression(stmt.call)};`);
          }
        }
        break;
      }
      case "IfStatement":
        this.generateIfStatement(stmt, indent);
        isCompound = true;
        break;
      case "CaseStatement":
        this.generateCaseStatement(stmt, indent);
        isCompound = true;
        break;
      case "ForStatement":
        this.generateForStatement(stmt, indent);
        isCompound = true;
        break;
      case "WhileStatement":
        this.generateWhileStatement(stmt, indent);
        isCompound = true;
        break;
      case "RepeatStatement":
        this.generateRepeatStatement(stmt, indent);
        isCompound = true;
        break;
      case "ContinueStatement": {
        // `continue` is correct where EXIT needs a goto: a switch captures
        // `break` but never `continue`, so it always reaches the innermost
        // loop — ST's rule. A FOR still runs its increment, a WHILE or REPEAT
        // re-tests its condition.
        if (this.loopExitLabelStack.length > 0) {
          this.emit(`${indent}continue;`);
        } else {
          // CONTINUE outside a loop is invalid IEC ST, and a bare `continue`
          // would not compile. Emit nothing rather than crash codegen, matching
          // the defensive branch on EXIT below.
          this.emit(`${indent}; // CONTINUE outside a loop`);
        }
        break;
      }
      case "ExitStatement": {
        const top = this.loopExitLabelStack[this.loopExitLabelStack.length - 1];
        if (top) {
          top.used = true;
          this.emit(`${indent}goto ${top.name};`);
        } else {
          // EXIT outside a loop is invalid IEC ST; emit defensive break
          // rather than crash codegen.
          this.emit(`${indent}break;`);
        }
        break;
      }
      case "ReturnStatement":
        this.generateReturnStatement(indent);
        break;
      case "ExternalCodePragma":
        this.generateExternalCodePragma(stmt, indent);
        break;
      case "DeleteStatement":
        this.emit(
          `${indent}strucpp::iec_delete(${this.generateExpression(stmt.pointer)});`,
        );
        break;
      case "AssertCall":
        // Assert calls only appear in test files, not in normal source compilation
        break;
      default: {
        const _exhaustive: never = stmt;
        throw new Error(
          `Unhandled statement kind: ${(_exhaustive as Statement).kind}`,
        );
      }
    }
    this.flushStringSyncs(indent);
    if (!isCompound) {
      this.recordLineMapping(stmt.sourceSpan.startLine, cppStartLine);
    }
  }

  /**
   * Emit `sync_length()` for each STRING or WSTRING variable this statement
   * handed to a generic parameter.
   *
   * `PVALUE` is `raw_ptr()`, the characters only, so the cached length must be
   * recomputed after the call. Emitted after the statement; duplicates dropped.
   */
  private flushStringSyncs(indent: string): void {
    if (this.pendingStringSyncs.length === 0) return;
    const pending = this.pendingStringSyncs;
    this.pendingStringSyncs = [];
    const seen = new Set<string>();
    for (const stmt of pending) {
      if (seen.has(stmt)) continue;
      seen.add(stmt);
      this.emit(`${indent}${stmt}`);
    }
  }

  /**
   * Generate code for an assignment statement.
   * ST: target := value;  →  C++: target = value;
   */
  private generateAssignmentStatement(
    stmt: AssignmentStatement,
    indent: string,
  ): void {
    // A shared global (VAR_EXTERNAL) target is stored under its own lock.
    const globalRef =
      stmt.target.kind === "VariableExpression" &&
      this.isGlobalAccess(stmt.target)
        ? this.globalRefOf(stmt.target.name)
        : undefined;

    // Check for property write: m.Speed := 75 → m.set_Speed(75). On a global
    // FB instance the setter runs under the instance's lock.
    const propWrite = this.detectPropertyWrite(stmt.target);
    if (propWrite && globalRef && stmt.target.kind === "VariableExpression") {
      const target = stmt.target;
      const upper = target.name.toUpperCase();
      const tmp = `__gwv_${this.tempVarCounter++}`;
      this.emit(
        `${indent}auto ${tmp} = ${this.generateExpression(stmt.value)};`,
      );
      const obj = this.renderUnderLock(upper, indent, () => {
        const base: VariableExpression = {
          ...target,
          fieldAccess: target.fieldAccess.slice(0, -1),
        };
        if (target.accessChain) {
          const trimmed = this.trimLastFieldFromAccessChain(target.accessChain);
          if (trimmed) base.accessChain = trimmed;
          else delete base.accessChain;
        }
        return this.renderAccessTail("(*__glk)", base, upper);
      });
      this.emit(
        `${indent}${globalRef.acc}with_lock([&](auto* __glk){ ${obj}.set_${propWrite.propertyName}(${tmp}); });`,
      );
      return;
    }
    if (propWrite) {
      const value = this.generateExpression(stmt.value);
      this.emit(
        `${indent}${propWrite.objectCode}set_${propWrite.propertyName}(${value});`,
      );
      return;
    }

    // EN/ENO on function call assignment:
    // result := func(EN := cond, args..., ENO => eno_var);
    // → if (cond) { result = func(args); eno_var = true; } else { eno_var = false; }
    if (
      stmt.value.kind === "FunctionCallExpression" &&
      this.hasEnEno(stmt.value.arguments)
    ) {
      const { enExpr, enoVar, filteredArgs } = this.extractEnEno(
        stmt.value.arguments,
      );
      const target = globalRef ? "" : this.generateExpression(stmt.target);
      const modifiedCall: FunctionCallExpression = {
        ...stmt.value,
        arguments: filteredArgs,
      };
      const callExpr = this.generateFunctionCallExpression(modifiedCall);
      const targetExpr = stmt.target;
      this.emitEnEnoWrapper(indent, enExpr, enoVar, (bi) => {
        if (!globalRef) {
          this.emit(`${bi}${target} = ${callExpr};`);
          return;
        }
        // The call runs before the target's lock is taken.
        const tmp = `__gwv_${this.tempVarCounter++}`;
        this.emit(`${bi}auto ${tmp} = ${callExpr};`);
        this.emitCaptureToLvalue(targetExpr, tmp, bi);
      });
      return;
    }

    // Shared-global target: one locked step when the value reads the same
    // global, else the value first and a locked store.
    if (globalRef && stmt.target.kind === "VariableExpression") {
      this.emitGlobalAssignment(stmt.target, globalRef, stmt.value, indent);
      return;
    }

    // Partial access write: `var.N := v` and `var.%B1 := v` alike become a
    // read-modify-write of the whole variable. All arithmetic is 64-bit, so a
    // shift of 32 or more (LWORD.%D1, LWORD.33) is not undefined behaviour.
    const writePart =
      stmt.target.kind === "VariableExpression" &&
      stmt.target.fieldAccess.length > 0
        ? parsePartialAccess(
            stmt.target.fieldAccess[stmt.target.fieldAccess.length - 1]!,
          )
        : undefined;
    if (stmt.target.kind === "VariableExpression" && writePart) {
      // Build the base variable (without the bit index)
      const baseVar: VariableExpression = {
        ...stmt.target,
        fieldAccess: stmt.target.fieldAccess.slice(0, -1),
      };
      // Also trim the accessChain if present
      if (stmt.target.accessChain) {
        const trimmed = this.trimLastFieldFromAccessChain(
          stmt.target.accessChain,
        );
        if (trimmed) {
          baseVar.accessChain = trimmed;
        } else {
          delete baseVar.accessChain;
        }
      }
      const baseCode = this.generateExpression(baseVar);
      const value = this.generateExpression(stmt.value);
      this.emit(
        `${indent}${baseCode} = ${this.partialAccessWrite(baseCode, value, writePart)};`,
      );
      return;
    }

    const target = this.generateExpression(stmt.target);
    const value = this.generateExpression(stmt.value);

    // For interface-returning methods, convert assignment to result var into return statement
    if (
      this.interfaceReturnMethod &&
      this.currentFunctionName &&
      target === `${this.currentFunctionName}_result`
    ) {
      this.emit(`${indent}return ${value};`);
      return;
    }

    this.emit(`${indent}${target} = ${value};`);
  }

  /**
   * Generate code for a REF= rebind. The lowering depends on the target's
   * reference kind, because the two runtime wrappers expose different APIs:
   *
   *   REFERENCE TO (IEC_REFERENCE_TO)  →  target.bind(source);
   *   REF_TO       (IEC_REF_TO)        →  target = REF(source);
   *
   * IEC_REF_TO has no bind() — it rebinds via assignment from REF()/ADR() —
   * so emitting bind() unconditionally (the old behaviour) failed to compile
   * for REF_TO targets.
   */
  private generateRefAssignStatement(
    stmt: RefAssignStatement,
    indent: string,
  ): void {
    const target = this.generateExpression(stmt.target);
    const source = this.generateExpression(stmt.source);
    const targetKind =
      stmt.target.kind === "VariableExpression"
        ? this.refAssignTargetKind(stmt.target)
        : undefined;
    if (targetKind === "ref_to") {
      this.emit(`${indent}${target} = REF(${source});`);
    } else {
      // REFERENCE_TO (and the default) rebind via bind().
      this.emit(`${indent}${target}.bind(${source});`);
    }
  }

  /**
   * The reference kind of a REF= target: a variable's own, or for a member or
   * element (`s.r`, `arr[1]`) the declared kind of what it lands on.
   */
  private refAssignTargetKind(target: VariableExpression): string | undefined {
    const nameUpper = target.name.toUpperCase();
    const hasAccess =
      target.subscripts.length > 0 ||
      target.fieldAccess.length > 0 ||
      target.isDereference ||
      (target.accessChain !== undefined && target.accessChain.length > 0);
    if (!hasAccess) return this.currentScopeVarRefKinds.get(nameUpper);
    const base = this.currentScopeVarTypeRefs.get(nameUpper);
    if (base === undefined) return undefined;
    return resolveAccessType(base, target, this.accessLookup)?.referenceKind;
  }

  /** Member and element lookups over the AST and the library FBs. */
  private readonly accessLookup: AccessLookup = {
    field: (type, field) => {
      const local = this.ast
        ? resolveFieldDeclarationUtil(type, field, this.ast)
        : undefined;
      if (local) return local;
      // A library function block: its member types come from the manifest.
      const key = `${type.toUpperCase()}.${field.toUpperCase()}`;
      const name = this.libraryFBFieldTypes.get(key);
      if (name === undefined) return undefined;
      const kind = this.libraryFBFieldTypeRefs.get(key)?.referenceKind;
      return { type: { name, referenceKind: kind ?? "none" } };
    },
    arrayElement: (type) =>
      this.ast ? resolveArrayElementAccessType(type, this.ast) : undefined,
  };

  /**
   * Generate code for an external code pragma.
   * The code content is emitted AS-IS to the output.
   */
  private generateExternalCodePragma(
    pragma: ExternalCodePragma,
    indent: string,
  ): void {
    // Split the code into lines and emit each with proper indentation
    const lines = pragma.code.split(/\r?\n/);
    for (const line of lines) {
      // Emit the line with base indentation
      // The code is emitted AS-IS, but we add the base indent for consistency
      if (line.trim() === "") {
        this.emit("");
      } else {
        this.emit(`${indent}${line}`);
      }
    }
  }

  // ===========================================================================
  // Control Flow Statement Generation (Phase 3.2)
  // ===========================================================================

  /**
   * Generate code for an IF statement.
   * ST: IF/ELSIF/ELSE → C++: if/else if/else
   */
  private generateIfStatement(stmt: IfStatement, indent: string): void {
    const ifLine = this.currentLine;
    this.emit(`${indent}if (${this.generateExpression(stmt.condition)}) {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, ifLine);
    this.generateStatements(stmt.thenStatements, indent + this.options.indent);

    for (const elsif of stmt.elsifClauses) {
      this.emitLineDirective(elsif.sourceSpan.startLine);
      const elsifLine = this.currentLine;
      this.emit(
        `${indent}} else if (${this.generateExpression(elsif.condition)}) {`,
      );
      this.recordLineMapping(elsif.sourceSpan.startLine, elsifLine);
      this.generateStatements(elsif.statements, indent + this.options.indent);
    }

    if (stmt.elseStatements.length > 0) {
      // Map ELSE to the `} else {` line. Use endLine-1 as an approximation
      // for the ELSE keyword line (one line before END_IF).
      // The ELSE doesn't have its own AST node, so we derive from context.
      let elseStLine: number | undefined;
      if (stmt.elsifClauses.length > 0) {
        elseStLine =
          stmt.elsifClauses[stmt.elsifClauses.length - 1]!.sourceSpan.endLine +
          1;
      } else if (stmt.thenStatements.length > 0) {
        elseStLine =
          stmt.thenStatements[stmt.thenStatements.length - 1]!.sourceSpan
            .endLine + 1;
      }
      if (elseStLine !== undefined) {
        this.emitLineDirective(elseStLine);
      }
      const elseLine = this.currentLine;
      this.emit(`${indent}} else {`);
      if (elseStLine !== undefined) {
        this.recordLineMapping(elseStLine, elseLine);
      }
      this.generateStatements(
        stmt.elseStatements,
        indent + this.options.indent,
      );
    }

    this.emitLineDirective(stmt.sourceSpan.endLine);
    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a CASE statement.
   * ST: CASE/OF → C++: switch/case with range expansion
   */
  private generateCaseStatement(stmt: CaseStatement, indent: string): void {
    const switchLine = this.currentLine;
    this.emit(`${indent}switch (${this.generateExpression(stmt.selector)}) {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, switchLine);
    const innerIndent = indent + this.options.indent;
    const bodyIndent = innerIndent + this.options.indent;

    for (const caseElement of stmt.cases) {
      this.emitLineDirective(caseElement.sourceSpan.startLine);
      const caseLabelLine = this.currentLine;
      // Each branch body is its own block: a declaration in it (a temporary of
      // a shared-global write, say) must not be jumped over by a later label.
      const labelLines: string[] = [];
      for (const label of caseElement.labels) {
        if (label.end) {
          // Range: expand to individual case labels
          const startVal = this.evaluateLiteralInt(label.start);
          const endVal = this.evaluateLiteralInt(label.end);
          if (startVal !== undefined && endVal !== undefined) {
            for (let i = startVal; i <= endVal; i++) {
              labelLines.push(`${innerIndent}case ${i}:`);
            }
          } else {
            // Fallback: emit as comment with expression
            labelLines.push(
              `${innerIndent}case ${this.generateExpression(label.start)}: // range to ${this.generateExpression(label.end)}`,
            );
          }
        } else {
          labelLines.push(
            `${innerIndent}case ${this.generateExpression(label.start)}:`,
          );
        }
      }
      const last = labelLines.length - 1;
      if (last >= 0 && !labelLines[last]!.includes("//")) {
        labelLines[last] += " {";
      } else {
        labelLines.push(`${innerIndent}{`);
      }
      for (const line of labelLines) this.emit(line);
      this.recordLineMapping(caseElement.sourceSpan.startLine, caseLabelLine);
      this.generateStatements(caseElement.statements, bodyIndent);
      this.emit(`${bodyIndent}break;`);
      this.emit(`${innerIndent}}`);
    }

    if (stmt.elseStatements.length > 0) {
      this.emit(`${innerIndent}default: {`);
      this.generateStatements(stmt.elseStatements, bodyIndent);
      this.emit(`${bodyIndent}break;`);
      this.emit(`${innerIndent}}`);
    }

    this.emitLineDirective(stmt.sourceSpan.endLine);
    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a FOR statement.
   * ST: FOR i := start TO end BY step DO → C++: for (i = start; i <= end; i += step)
   */
  private generateForStatement(stmt: ForStatement, indent: string): void {
    // In function bodies, the control variable may be the function name (IEC ST return variable)
    let varName = stmt.controlVariable;
    if (
      this.currentFunctionName &&
      varName.toUpperCase() === this.currentFunctionName.toUpperCase()
    ) {
      varName = `${this.currentFunctionName}_result`;
    }
    const start = this.generateExpression(stmt.start);
    const end = this.generateExpression(stmt.end);

    const forLine = this.currentLine;
    if (stmt.step) {
      const stepExpr = this.generateExpression(stmt.step);
      // Determine direction from step when it's a literal
      const stepVal = this.evaluateLiteralInt(stmt.step);
      if (stepVal !== undefined && stepVal < 0) {
        this.emit(
          `${indent}for (${varName} = ${start}; ${varName} >= ${end}; ${varName} += ${stepExpr}) {`,
        );
      } else {
        this.emit(
          `${indent}for (${varName} = ${start}; ${varName} <= ${end}; ${varName} += ${stepExpr}) {`,
        );
      }
    } else {
      // Default step is 1, ascending
      this.emit(
        `${indent}for (${varName} = ${start}; ${varName} <= ${end}; ${varName}++) {`,
      );
    }
    this.recordLineMapping(stmt.sourceSpan.startLine, forLine);

    const exitLabel = {
      name: `__strucpp_loop_exit_${this.loopExitLabelCounter++}`,
      used: false,
    };
    this.loopExitLabelStack.push(exitLabel);
    this.generateStatements(stmt.body, indent + this.options.indent);
    this.loopExitLabelStack.pop();
    this.emitLineDirective(stmt.sourceSpan.endLine);
    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    if (exitLabel.used) this.emit(`${indent}${exitLabel.name}: ;`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a WHILE statement.
   * ST: WHILE condition DO → C++: while (condition)
   */
  private generateWhileStatement(stmt: WhileStatement, indent: string): void {
    const whileLine = this.currentLine;
    this.emit(`${indent}while (${this.generateExpression(stmt.condition)}) {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, whileLine);
    const exitLabel = {
      name: `__strucpp_loop_exit_${this.loopExitLabelCounter++}`,
      used: false,
    };
    this.loopExitLabelStack.push(exitLabel);
    this.generateStatements(stmt.body, indent + this.options.indent);
    this.loopExitLabelStack.pop();
    this.emitLineDirective(stmt.sourceSpan.endLine);
    const closingLine = this.currentLine;
    this.emit(`${indent}}`);
    if (exitLabel.used) this.emit(`${indent}${exitLabel.name}: ;`);
    this.recordLineMapping(stmt.sourceSpan.endLine, closingLine);
  }

  /**
   * Generate code for a REPEAT statement.
   * ST: REPEAT ... UNTIL condition → C++: do { ... } while (!(condition))
   */
  private generateRepeatStatement(stmt: RepeatStatement, indent: string): void {
    const doLine = this.currentLine;
    this.emit(`${indent}do {`);
    this.recordLineMapping(stmt.sourceSpan.startLine, doLine);
    const exitLabel = {
      name: `__strucpp_loop_exit_${this.loopExitLabelCounter++}`,
      used: false,
    };
    this.loopExitLabelStack.push(exitLabel);
    this.generateStatements(stmt.body, indent + this.options.indent);
    this.loopExitLabelStack.pop();
    this.emitLineDirective(stmt.sourceSpan.endLine);
    const untilLine = this.currentLine;
    this.emit(
      `${indent}} while (!(${this.generateExpression(stmt.condition)}));`,
    );
    if (exitLabel.used) this.emit(`${indent}${exitLabel.name}: ;`);
    this.recordLineMapping(stmt.sourceSpan.endLine, untilLine);
  }

  /**
   * Generate code for a RETURN statement.
   * In functions: return functionName_result;
   * In programs/FBs: return;
   */
  private generateReturnStatement(indent: string): void {
    if (this.interfaceReturnMethod) {
      // Interface-returning methods: the assignment-based return path (methodName := expr)
      // directly emits `return expr;`. A bare `RETURN;` has no value to return, so we
      // default to `return *this;` which is correct for the common pattern where the
      // method returns its own FB as the interface implementor. Edge case: if the method
      // should return a different object, the user must use the assignment form instead.
      this.emit(`${indent}return *this;`);
    } else if (this.currentFunctionName) {
      this.emit(`${indent}return ${this.currentFunctionName}_result;`);
    } else {
      this.emit(`${indent}return;`);
    }
  }

  /**
   * Evaluate an expression as a literal integer value (for CASE ranges and FOR step direction).
   * Returns undefined if the expression is not a compile-time integer constant.
   */
  private evaluateLiteralInt(expr: Expression): number | undefined {
    if (expr.kind === "LiteralExpression" && expr.literalType === "INT") {
      return typeof expr.value === "number"
        ? expr.value
        : parseInt(String(expr.value), 10);
    }
    if (
      expr.kind === "UnaryExpression" &&
      expr.operator === "-" &&
      expr.operand.kind === "LiteralExpression"
    ) {
      const val = this.evaluateLiteralInt(expr.operand);
      return val !== undefined ? -val : undefined;
    }
    return undefined;
  }

  /**
   * Generate code for a list of statements.
   */
  private generateStatements(
    stmts: Statement[],
    indent: string = "    ",
  ): void {
    for (const stmt of stmts) {
      this.generateStatement(stmt, indent);
    }
  }

  // ===========================================================================
  // Expression Generation (Phase 3.1)
  // ===========================================================================

  /**
   * Generate C++ code for an expression.
   * Returns the C++ expression as a string.
   */
  protected generateExpression(expr: Expression): string {
    const override = this.argOverrides?.get(expr);
    if (override !== undefined) return override;
    switch (expr.kind) {
      case "LiteralExpression":
        return this.generateLiteralExpression(expr);
      case "VariableExpression":
        return this.generateVariableExpression(expr);
      case "BinaryExpression":
        return this.generateBinaryExpression(expr);
      case "UnaryExpression":
        return this.generateUnaryExpression(expr);
      case "ParenthesizedExpression":
        return `(${this.generateExpression(expr.expression)})`;
      case "FunctionCallExpression":
        return this.generateFunctionCallExpression(expr);
      case "MethodCallExpression":
        return this.generateMethodCallExpression(expr);
      case "RefExpression":
        return `REF(${this.generateExpression(expr.operand)})`;
      case "DrefExpression":
        return `${this.generateExpression(expr.operand)}.deref()`;
      case "NewExpression": {
        const cppType = this.typeCodeGen.mapTypeToCpp(expr.allocationType.name);
        if (expr.arraySize) {
          return `strucpp::iec_new_array<${cppType}>(${this.generateExpression(expr.arraySize)})`;
        }
        return `strucpp::iec_new<${cppType}>()`;
      }
      case "ArrayLiteralExpression": {
        const elements = expr.elements.map((e) => this.generateExpression(e));
        return `{${elements.join(", ")}}`;
      }
      case "StructInitializerExpression":
        // A structure initializer needs the target's C++ type, which only a
        // declaration supplies — declarations route through
        // `generateInitializer` instead. It is not an expression IEC allows in a
        // statement either, and the analyzer rejects it there
        // (`validateStructInitializerPlacement`), so this is unreachable for any
        // unit that got past semantic analysis. Loud rather than silent: the
        // previous `return "{}"` value-initialised, which discarded every
        // element the initializer named and produced no diagnostic anywhere.
        throw new Error(
          `Internal error: structure initializer at ${expr.sourceSpan.startLine}:` +
            `${expr.sourceSpan.startCol} reached expression codegen, where the ` +
            `target type is unknown. It is only valid as a declaration's initial value.`,
        );
    }
  }

  /**
   * Generate C++ for a literal expression.
   */
  private generateLiteralExpression(expr: LiteralExpression): string {
    // Handle typed literals: BYTE#255 → static_cast<IEC_BYTE>(255)
    if (expr.typePrefix) {
      const cppType = `IEC_${expr.typePrefix}`;
      const hashIdx = expr.rawValue.indexOf("#");
      const valuePart = expr.rawValue.substring(hashIdx + 1);
      // An integer payload goes through the exact lowering too — `LINT#<64-bit>`
      // must not round, and `INT#0010` must not become a C++ octal constant.
      const cppValue =
        expr.literalType === "INT"
          ? formatIntegerLiteral(valuePart, expr.value as number)
          : iecBaseToCppLiteral(valuePart);
      return `static_cast<${cppType}>(${cppValue})`;
    }

    switch (expr.literalType) {
      case "BOOL":
        return expr.value === true ||
          expr.value === "TRUE" ||
          expr.rawValue?.toUpperCase() === "TRUE"
          ? "true"
          : "false";
      case "INT": {
        return formatIntegerLiteral(expr.rawValue, expr.value as number);
      }
      case "REAL": {
        const str = String(expr.value);
        // Ensure real literals have a decimal point (but not for scientific notation)
        return str.includes(".") || /[eE]/.test(str) ? str : str + ".0";
      }
      case "STRING": {
        // rawValue includes surrounding single quotes: 'hello' → strip them
        const inner = expr.rawValue.replace(/^'|'$/g, "");
        const escaped = translateIECString(inner);
        return `"${escaped}"`;
      }
      case "WSTRING": {
        // IEC WSTRING literals are double-quoted in source; strip either
        // form for safety. The C++ prefix is `u` (char16_t), not `L`
        // (wchar_t — wchar_t is 32-bit on Linux/AVR, so L"…" wouldn't
        // bind to IECWStringVar's char16_t* constructor).
        const wInner = expr.rawValue.replace(/^["']|["']$/g, "");
        const wEscaped = translateIECString(wInner);
        return `u"${wEscaped}"`;
      }
      case "TIME": {
        const timeVal = parseTimeLiteral(String(expr.value));
        return `${timeVal.nanoseconds}LL`;
      }
      case "DATE":
        // DATE: int64 days since Unix epoch (UTC).  `iec_date.hpp`
        // stores DATE as days (see `DT_FROM_DATE_AND_TOD`'s
        // `iec_unwrap(date) * DT_NS_PER_DAY` math).  Lowering to ns
        // here would break every conversion / arithmetic helper.
        return `${parseDateLiteralToDays(String(expr.value))}LL`;
      case "TIME_OF_DAY":
        // TOD: int64 nanoseconds since midnight.
        return `${parseTodLiteralToNs(String(expr.value))}LL`;
      case "DATE_AND_TIME":
        // DT: int64 nanoseconds since Unix epoch (UTC).
        return `${parseDtLiteralToNs(String(expr.value))}LL`;
      case "NULL":
        return "IEC_NULL";
      default:
        return String(expr.value);
    }
  }

  /**
   * Generate C++ for a variable expression.
   */
  /**
   * An operand as an LVALUE naming the storage itself, for anything that
   * aliases it rather than reading it.
   *
   * A shared global's read paths hand back a COPY (`read()`, `with_lock`), so
   * aliasing one points at a temporary that dies with the full expression.
   * The storage is named instead, which also keeps the operand a plain lvalue
   * — a `with_lock` lambda inside `sizeof` is C++20, and this targets C++17.
   * Anything else is already its own storage.
   */
  private generateAliasLvalue(expr: Expression): string {
    if (expr.kind === "VariableExpression" && !expr.isDereference) {
      const ref = this.globalRefOf(expr.name);
      if (ref) {
        return this.renderAccessTail(
          `${ref.acc}value`,
          expr,
          expr.name.toUpperCase(),
        );
      }
    }
    return this.generateExpression(expr);
  }

  /**
   * The address of an operand, for a parameter that aliases it.
   */
  private generateAddressOf(expr: Expression): string {
    return `&${this.generateAliasLvalue(expr)}`;
  }

  private generateVariableExpression(expr: VariableExpression): string {
    const nameUpper = expr.name.toUpperCase();

    // CODESYS's `__SYSTEM.TYPE_CLASS.TYPE_INT` (the analyzer has checked the member)
    const typeClassMember = systemTypeClassMember(expr);
    if (typeClassMember !== undefined) {
      return `strucpp::TYPE_CLASS::${typeClassMember}`;
    }

    // Shared global. Under this global's own lock it reads through `(*__glk)`;
    // under another global's lock it is read into a temporary before that lock
    // is taken; otherwise it is one locked read (see renderGlobalRead).
    const gref = expr.isDereference ? undefined : this.globalRefOf(expr.name);
    if (gref) {
      if (this.lockCtx) {
        if (this.lockCtx.rootUpper === nameUpper) {
          return this.renderAccessTail("(*__glk)", expr, nameUpper);
        }
        return this.hoistOutOfLock(() => this.renderGlobalRead(expr, gref));
      }
      return this.renderGlobalRead(expr, gref);
    }

    // Handle THIS reference
    if (nameUpper === "THIS") {
      // THIS^ (dereference) with no field access → (*this)
      if (expr.isDereference && expr.fieldAccess.length === 0) {
        return "(*this)";
      }
      // THIS.member or THIS^.member → this->member
      // Check if last field is a property → this->get_Prop()
      let result = "this->";
      if (expr.fieldAccess.length > 0) {
        let currentType = this.currentFBName;
        for (let i = 0; i < expr.fieldAccess.length; i++) {
          const field = expr.fieldAccess[i]!;
          const isLast = i === expr.fieldAccess.length - 1;
          if (isLast) {
            const propName = this.resolvePropertyName(currentType, field);
            if (propName) {
              result += `get_${propName}()`;
              return result;
            }
          }
          const fieldType = this.resolveMemberType(currentType, field);
          const fieldCppName = this.needsFieldMangling(
            field,
            fieldType,
            currentType,
          )
            ? `${field}_`
            : field;
          if (i > 0) result += ".";
          result += fieldCppName;
          if (!isLast) {
            currentType = fieldType;
          }
        }
      }
      return result;
    }

    // Handle SUPER reference → BaseClass::member
    // Check if last field is a property → BaseClass::get_Prop()
    if (nameUpper === "SUPER" && this.currentFBExtends) {
      let result = `${this.currentFBExtends}::`;
      if (expr.fieldAccess.length > 0) {
        let currentType: string | undefined = this.currentFBExtends;
        for (let i = 0; i < expr.fieldAccess.length; i++) {
          const field = expr.fieldAccess[i]!;
          const isLast = i === expr.fieldAccess.length - 1;
          if (isLast) {
            const propName = this.resolvePropertyName(currentType, field);
            if (propName) {
              result += `get_${propName}()`;
              return result;
            }
          }
          const fieldType = this.resolveMemberType(currentType, field);
          const fieldCppName = this.needsFieldMangling(
            field,
            fieldType,
            currentType,
          )
            ? `${field}_`
            : field;
          if (i > 0) result += ".";
          result += fieldCppName;
          if (!isLast) {
            currentType = fieldType;
          }
        }
      }
      return result;
    }

    // In function/method bodies, references to the function/method name redirect to the result variable
    let result: string;
    if (
      this.currentFunctionName &&
      nameUpper === this.currentFunctionName.toUpperCase()
    ) {
      result = `${this.currentFunctionName}_result`;
    } else {
      // Check for VAR_INST name mangling
      const mangledName = this.varInstMangledNames.get(nameUpper);
      if (this.currentRefInouts.has(nameUpper)) {
        // An FB-typed inout is a pointer to the caller's own instance, so a
        // read, a write or a call through it reaches the caller's block.
        result = `(*${this.memberMangledNames.get(nameUpper) ?? expr.name})`;
      } else if (mangledName) {
        result = mangledName;
      } else {
        // Check for member name collision mangling (SENSOR SENSOR → SENSOR SENSOR_)
        const memberMangled = this.memberMangledNames.get(nameUpper);
        if (memberMangled) {
          result = memberMangled;
        } else {
          result = this.resolveVariableBaseName(expr.name);
        }
      }
    }

    // Bare enum member: Stopped → Irrigation_State::Stopped
    // Only qualify if the name is NOT a declared variable in the current scope
    // (a local variable named RED should not be rewritten as Color::RED).
    const enumEntry = this.enumMemberToType.get(nameUpper);
    if (
      enumEntry?.typeName &&
      !this.currentScopeVarTypes.has(nameUpper) &&
      expr.fieldAccess.length === 0 &&
      (!expr.accessChain || expr.accessChain.length === 0)
    ) {
      return `${enumEntry.typeName}::${expr.name}`;
    }

    // Enum qualified access: TrafficState.RED → TrafficState::RED
    if (this.enumTypeMembers.has(nameUpper)) {
      if (
        expr.accessChain &&
        expr.accessChain.length === 1 &&
        expr.accessChain[0]!.kind === "field"
      ) {
        return `${expr.name}::${expr.accessChain[0]!.name}`;
      }
      if (expr.fieldAccess.length === 1) {
        return `${expr.name}::${expr.fieldAccess[0]}`;
      }
    }

    return this.renderAccessTail(result, expr, nameUpper);
  }

  /**
   * Render an expression's access chain (subscripts / field access / bit access /
   * dereference) onto a given base string. Factored out of
   * generateVariableExpression so the same access logic can be rendered onto a
   * different base — e.g. `(*p)` inside a composite shared-global `with_lock`
   * lambda.
   */
  private renderAccessTail(
    base: string,
    expr: VariableExpression,
    nameUpper: string,
    indexCode: (e: Expression) => string = (e) => this.generateExpression(e),
  ): string {
    let result = base;

    // Use ordered access chain when available (preserves interleaving)
    if (expr.accessChain && expr.accessChain.length > 0) {
      return this.generateAccessChain(
        result,
        expr.accessChain,
        nameUpper,
        indexCode,
      );
    }

    // Legacy path: flat subscripts/fieldAccess/dereference (no interleaving)
    // Subscripts (array access). Use the bounds-checked .at() accessor (1D and
    // 2D+) so an out-of-range index raises a clean fault — throw on exception
    // targets (caught by the runtime, stops the faulting task), or
    // iec_runtime_fault(ArrayBounds) on -fno-exceptions MCU targets — instead of
    // the unchecked operator[]/operator() that silently corrupts memory.
    if (expr.subscripts.length > 1) {
      const args = expr.subscripts.map(indexCode);
      result += `.at(${args.join(", ")})`;
    } else {
      for (const sub of expr.subscripts) {
        result += `.at(${indexCode(sub)})`;
      }
    }

    // Field access (struct members) — detect property reads and bit access on last field
    if (expr.fieldAccess.length > 0) {
      let currentType = this.currentScopeVarTypes.get(nameUpper);
      for (let i = 0; i < expr.fieldAccess.length; i++) {
        const field = expr.fieldAccess[i]!;
        const isLast = i === expr.fieldAccess.length - 1;
        // Partial access: `.0`/`.%X0` for a bit, `.%B1`, `.%W0`, `.%D1` for a
        // wider part. Shifted by the part's width, so index 0 is the least
        // significant.
        const part = parsePartialAccess(field);
        if (part) {
          result = this.partialAccessRead(result, part);
          continue;
        }
        if (isLast) {
          const propName = this.resolvePropertyName(currentType, field);
          if (propName) {
            result += `.get_${propName}()`;
            continue;
          }
        }
        // Check if this field needs mangling (name == type or interface method in parent)
        const fieldType = this.resolveMemberType(currentType, field);
        const fieldCppName = this.needsFieldMangling(
          field,
          fieldType,
          currentType,
        )
          ? `${field}_`
          : field;
        result += `.${fieldCppName}`;
        if (!isLast) {
          currentType = fieldType;
        }
      }
    }

    // Dereference (^ operator → pointer dereference)
    if (expr.isDereference) {
      result = `(*${result})`;
    }

    return result;
  }

  /**
   * Generate C++ code from an ordered access chain.
   * Handles correct interleaving of field accesses, subscripts, and dereferences.
   *
   * Key rules:
   * - field after subscript: use -> (because Array operator[] returns IECVar<T>&)
   * - field after field: use .
   * - field after dereference: use .
   * - subscript of 1 index: use [idx]
   * - subscript of 2+ indices: use (idx1, idx2) (multidim Array)
   * - dereference: wrap in (*...)
   */
  private generateAccessChain(
    base: string,
    chain: AccessStep[],
    baseNameUpper: string,
    indexCode: (e: Expression) => string = (e) => this.generateExpression(e),
  ): string {
    let result = base;
    let currentType = this.currentScopeVarTypes.get(baseNameUpper);

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i]!;
      const isLast = i === chain.length - 1;

      switch (step.kind) {
        case "field": {
          // Partial access — see partialAccessRead.
          const part = parsePartialAccess(step.name);
          if (part) {
            result = this.partialAccessRead(result, part);
            continue;
          }
          // Property access on the last step
          if (isLast) {
            const propName = this.resolvePropertyName(currentType, step.name);
            if (propName) {
              result += `.get_${propName}()`;
              return result;
            }
          }
          const fieldType = this.resolveMemberType(currentType, step.name);
          const fieldCppName = this.needsFieldMangling(
            step.name,
            fieldType,
            currentType,
          )
            ? `${step.name}_`
            : step.name;
          // Array elements store T directly — always use . for field access
          result += `.${fieldCppName}`;
          currentType = fieldType;
          break;
        }
        case "subscript": {
          // Bounds-checked .at() (not operator[]/operator()): an out-of-range
          // IEC array index raises a clean fault — `throw` on exception targets
          // (the runtime v4 dispatcher catches it and stops just the faulting
          // task) and iec_runtime_fault(IecFault::ArrayBounds) on -fno-exceptions
          // MCU targets. operator[] stays unchecked+constexpr for the debug-table
          // generator's &arr[i] address-of expressions; POU bodies use .at().
          if (step.indices.length > 1) {
            const args = step.indices.map(indexCode);
            result += `.at(${args.join(", ")})`;
          } else if (step.indices.length === 1) {
            result += `.at(${indexCode(step.indices[0]!)})`;
          }
          break;
        }
        case "dereference": {
          result = `(*${result})`;
          break;
        }
      }
    }

    return result;
  }

  /**
   * Operator mapping from ST to C++.
   */
  private static readonly BINARY_OP_MAP: Record<string, string> = {
    "+": "+",
    "-": "-",
    "*": "*",
    "/": "/",
    MOD: "%",
    AND: "&",
    OR: "|",
    XOR: "^",
    "=": "==",
    "<>": "!=",
    "<": "<",
    ">": ">",
    "<=": "<=",
    ">=": ">=",
  };

  /**
   * The runtime function for a DT → TOD or DT → DATE conversion
   * (IEC 61131-3 table 22: DT_TO_TOD, DT_TO_DATE and their LDT / long-name
   * forms), or undefined for any other pair.
   *
   * A DT is nanoseconds since 1970, a TOD nanoseconds since midnight and a
   * DATE a day count, so these are not casts: the value has to be split.
   * The plain TO_TOD / TO_DATE cast returned the whole DT.
   */
  private static dateTimeSplitFn(
    fromUpper: string,
    toUpper: string,
  ): string | undefined {
    const dt = ["DT", "DATE_AND_TIME", "LDT", "LDATE_AND_TIME"];
    const tod = ["TOD", "TIME_OF_DAY", "LTOD", "LTIME_OF_DAY"];
    if (!dt.includes(fromUpper)) return undefined;
    if (tod.includes(toUpper)) return "TOD_OF_DT";
    if (toUpper === "DATE" || toUpper === "LDATE") return "DATE_OF_DT";
    return undefined;
  }

  private static readonly COMPARISON_OPS: ReadonlySet<string> = new Set([
    "=",
    "<>",
    "<",
    ">",
    "<=",
    ">=",
  ]);

  /**
   * Generate C++ for a binary expression.
   */
  private generateBinaryExpression(expr: BinaryExpression): string {
    const left = this.generateExpression(expr.left);
    const right = this.generateExpression(expr.right);

    // Power operator needs special handling
    if (expr.operator === "**") {
      return `std::pow(static_cast<double>(${left}), static_cast<double>(${right}))`;
    }

    const cppOp = CodeGenerator.BINARY_OP_MAP[expr.operator] ?? expr.operator;

    // IEC 61131-3 AND/OR/XOR are always bitwise. C++ bitwise & | ^ have
    // higher precedence than comparison operators (== != < >), unlike ST
    // where AND/OR have lower precedence. Parenthesize operands to preserve
    // the correct evaluation order.
    if (
      expr.operator === "AND" ||
      expr.operator === "OR" ||
      expr.operator === "XOR"
    ) {
      // BOOL AND BOOL is BOOL. In C++ `bool & bool` promotes to int, which a
      // template such as NOT, SEL or MAX then deduces as INT and rejects
      // (`NOT(a > 0.0 AND b > 0.0)`), so a BOOL result is kept a bool.
      if (this.inferExprType(expr) === "BOOL") {
        return `static_cast<bool>((${left}) ${cppOp} (${right}))`;
      }
      return `(${left}) ${cppOp} (${right})`;
    }

    return `${left} ${cppOp} ${right}`;
  }

  /**
   * Generate C++ for a unary expression.
   */
  private generateUnaryExpression(expr: UnaryExpression): string {
    const operand = this.generateExpression(expr.operand);

    switch (expr.operator) {
      case "NOT": {
        // NOT on non-BOOL ANY_BIT types must use bitwise complement (~)
        const opType = this.inferExprType(expr.operand);
        if (opType) {
          const cat = getTypeCategory(opType.toUpperCase());
          if (cat === "BIT" && opType.toUpperCase() !== "BOOL") {
            return `~${operand}`;
          }
        }
        return `!${operand}`;
      }
      case "-":
        return `-${operand}`;
      case "+":
        return `+${operand}`;
    }
  }

  /**
   * Generate C++ for a method call expression (chained method calls).
   * e.g., fb.method1(args).method2(args) → fb.method1(args).method2(args)
   */
  /**
   * Arguments for a method call, with a descriptor built for any parameter
   * declared generic.
   *
   * Shared because a method call arrives as either a `MethodCallExpression`
   * or a `FunctionCallExpression` whose name carries the dot (`inst.Method`),
   * which is what `x := inst.Method(y)` produces.
   */
  private generateCallArguments(
    ownerType: string | undefined,
    methodName: string,
    args: ReadonlyArray<{ name?: string; value: Expression }>,
  ): string[] {
    const key = ownerType
      ? `${ownerType.toUpperCase()}.${methodName.toUpperCase()}`
      : undefined;
    const generics = key ? this.methodGenericParams.get(key) : undefined;
    const order = key ? this.methodInputOrder.get(key) : undefined;

    let positional = 0;
    return args.map((arg) => {
      const paramName = arg.name ?? order?.[positional];
      if (!arg.name) positional++;
      if (paramName && generics?.has(paramName.toUpperCase())) {
        const descriptor = this.generateAnyDescriptor(arg.value);
        if (descriptor) return descriptor;
      }
      return this.generateExpression(arg.value);
    });
  }

  private generateMethodCallExpression(expr: MethodCallExpression): string {
    // ST code never runs under a global's lock: evaluate it before the lock.
    if (this.lockCtx) {
      return this.hoistOutOfLock(() => this.generateMethodCallExpression(expr));
    }
    // Try type-specific resolution first (avoids collisions when two FBs share a method name)
    let resolvedName: string;
    if (expr.object.kind === "VariableExpression") {
      const varType = this.currentScopeVarTypes.get(
        expr.object.name.toUpperCase(),
      );
      resolvedName = varType
        ? this.resolveMethodName(varType, expr.methodName)
        : this.resolveMethodNameGlobal(expr.methodName);
      // A method of a global FB instance runs under the instance's lock.
      const ref = this.isGlobalAccess(expr.object)
        ? this.globalRefOf(expr.object.name)
        : undefined;
      if (ref) {
        return this.renderGlobalMethodCall(
          expr.object,
          ref,
          this.accessType(expr.object),
          resolvedName,
          expr.arguments,
        );
      }
    } else {
      resolvedName = this.resolveMethodNameGlobal(expr.methodName);
    }
    const obj = this.generateExpression(expr.object);
    const ownerTypeForArgs =
      expr.object.kind === "VariableExpression"
        ? this.currentScopeVarTypes.get(expr.object.name.toUpperCase())
        : undefined;
    const args = this.generateCallArguments(
      ownerTypeForArgs,
      expr.methodName,
      expr.arguments,
    ).join(", ");
    return `${obj}.${resolvedName}(${args})`;
  }

  // ===========================================================================
  // Implicit type widening / argument coercion helpers
  // ===========================================================================

  /**
   * Returns true when `source` can be implicitly widened to `target`.
   * Covers same-category widening (BYTE→DWORD), BIT→INT crossover (BYTE→INT),
   * and integer→REAL promotion.
   */
  private canImplicitWiden(source: string, target: string): boolean {
    return isImplicitlyConvertible(source, target);
  }

  /**
   * Lightweight type inference for an expression using the current scope's
   * variable type map. Returns the IEC type name (upper case) or undefined.
   */
  private inferExprType(expr: Expression): string | undefined {
    // Use pre-computed type from semantic analysis when available
    if (expr.resolvedType) {
      const name = typeNameUtil(expr.resolvedType);
      if (name) return name.toUpperCase();
    }
    // Fallback to ad-hoc inference for standalone codegen (tests without semantic analysis)
    switch (expr.kind) {
      case "VariableExpression": {
        // Walk `fieldAccess` so `FB_INSTANCE.OUTPUT` resolves to the
        // output's element type rather than the FB's type — without
        // this, type-driven literal casts (see `harmonizeStdFuncArgs`)
        // would synthesise `static_cast<IEC_<FB_TYPE>>(literal)`, and
        // `IEC_<FB_TYPE>` aliases don't exist (only types emit them).
        let type = this.currentScopeVarTypes.get(expr.name.toUpperCase());
        if (!type) return undefined;
        for (const field of expr.fieldAccess ?? []) {
          const next = this.resolveMemberType(type, field);
          if (!next) return undefined;
          type = next;
        }
        return type.toUpperCase();
      }
      case "LiteralExpression": {
        if (expr.typePrefix) return expr.typePrefix.toUpperCase();
        // Map literal types to IEC names
        switch (expr.literalType) {
          case "INT":
            return "INT";
          case "REAL":
            return "REAL";
          case "BOOL":
            return "BOOL";
          case "STRING":
            return "STRING";
          default:
            return undefined;
        }
      }
      case "UnaryExpression":
        return this.inferExprType(expr.operand);
      case "BinaryExpression": {
        if (CodeGenerator.COMPARISON_OPS.has(expr.operator)) return "BOOL";
        // For bitwise/arithmetic ops, infer from operands
        const lt = this.inferExprType(expr.left);
        const rt = this.inferExprType(expr.right);
        // Prefer variable types over literal types
        if (lt && rt) {
          const lBits = getTypeBits(lt) ?? 0;
          const rBits = getTypeBits(rt) ?? 0;
          return rBits > lBits ? rt : lt;
        }
        return lt ?? rt;
      }
      case "FunctionCallExpression": {
        const fnUpper = expr.functionName.toUpperCase();
        // Check user-defined functions
        if (this.ast) {
          const funcDecl = this.ast.functions.find(
            (f) => f.name.toUpperCase() === fnUpper,
          );
          if (funcDecl) return funcDecl.returnType?.name.toUpperCase();
        }
        // Check conversion functions (INT_TO_REAL → REAL)
        const conv = this.stdRegistry.resolveConversion(fnUpper);
        if (conv) return conv.toType.toUpperCase();
        // Check std functions with specific return type
        const std = this.stdRegistry.lookup(fnUpper);
        if (std?.specificReturnType)
          return std.specificReturnType.toUpperCase();
        // For generic functions returning same type as first param, infer from first arg
        if (std?.returnMatchesFirstParam && expr.arguments.length > 0) {
          return this.inferExprType(expr.arguments[0]!.value);
        }
        return undefined;
      }
      case "MethodCallExpression": {
        // Resolve object type → find FB declaration → find method → return type
        if (expr.object.kind === "VariableExpression") {
          const objType = this.currentScopeVarTypes.get(
            expr.object.name.toUpperCase(),
          );
          if (objType && this.ast) {
            const fb = this.ast.functionBlocks.find(
              (f) => f.name.toUpperCase() === objType.toUpperCase(),
            );
            if (fb) {
              const method = fb.methods.find(
                (m) => m.name.toUpperCase() === expr.methodName.toUpperCase(),
              );
              if (method?.returnType) {
                return method.returnType.name.toUpperCase();
              }
            }
          }
        }
        return undefined;
      }
      case "ParenthesizedExpression":
        return this.inferExprType(expr.expression);
      default:
        return undefined;
    }
  }

  /**
   * Extract ordered parameter types from a user-defined function declaration.
   * Returns undefined if function not found.
   */
  private getParamTypes(funcName: string): string[] | undefined {
    if (!this.ast) return undefined;
    const nameUpper = funcName.toUpperCase();
    const funcDecl = this.ast.functions.find(
      (f) => f.name.toUpperCase() === nameUpper,
    );
    if (!funcDecl) return undefined;
    const types: string[] = [];
    for (const block of funcDecl.varBlocks) {
      if (
        block.blockType === "VAR_INPUT" ||
        block.blockType === "VAR_IN_OUT" ||
        block.blockType === "VAR_OUTPUT"
      ) {
        for (const decl of block.declarations) {
          for (let i = 0; i < decl.names.length; i++) {
            types.push(decl.type.name.toUpperCase());
          }
        }
      }
    }
    return types.length > 0 ? types : undefined;
  }

  /**
   * Apply implicit widening casts to a list of argument strings for a
   * user-defined function call. Modifies `args` in place.
   */
  private coerceUserFuncArgs(
    args: string[],
    argExprs: FunctionCallExpression["arguments"],
    paramTypes: string[],
  ): void {
    const exprCount = argExprs.length;
    for (let i = 0; i < args.length && i < paramTypes.length; i++) {
      if (i >= exprCount) break; // padded temp vars have no expr to infer from
      const expr = argExprs[i]!.value;
      const argType = this.inferExprType(expr);
      if (!argType) continue;
      const paramType = paramTypes[i]!;
      if (argType === paramType) continue;
      // A generic parameter takes a descriptor, which is not the argument's
      // type and must not be cast to one.
      if (isDeclarableGenericType(paramType)) continue;
      // Bare literals (no typePrefix) are untyped — always castable to param type
      if (
        this.isBareLiteral(expr) ||
        this.canImplicitWiden(argType, paramType)
      ) {
        args[i] = `static_cast<IEC_${paramType}>(${args[i]})`;
      }
    }
  }

  /** Returns true if expr is a bare literal (no typePrefix), possibly negated */
  private isBareLiteral(expr: Expression): boolean {
    const inner = expr.kind === "UnaryExpression" ? expr.operand : expr;
    return inner.kind === "LiteralExpression" && !inner.typePrefix;
  }

  /**
   * Scale the argument of a `TO_*` conversion when a temporal type is on
   * either side of it.
   *
   * Why this lives in codegen and not in the runtime:
   *  - `IEC_TIME`, `IEC_LTIME`, `IEC_TOD`, `IEC_LTOD`, `IEC_DT`,
   *    `IEC_LDT`, `IEC_DATE`, `IEC_LDATE` are all
   *    `using ... = IECVar<int64_t>` aliases — they collapse to the same
   *    C++ type after preprocessing.
   *  - A runtime overload `TO_UINT(IEC_TIME)` therefore CANNOT be
   *    distinguished from `TO_UINT(IEC_DATE)`, and `TO_DT(seconds)`
   *    cannot be distinguished from `TO_DT(IEC_DT)`.
   *  - The IEC type label only survives at the language layer, so the
   *    scaling has to happen here, before the type identity is erased.
   *
   * The units are CODESYS's, which is what the IEC libraries we ship are
   * written against. From its documentation: DATE, DT and TOD are held in a
   * 32-bit DWORD with a 1970-01-01 epoch, at SECONDS resolution for DATE and
   * DT and MILLISECONDS for TOD; TIME is 32-bit milliseconds; and the 64-bit
   * LDATE / LDT / LTOD / LTIME are all nanoseconds. Its own examples pin this
   * down: `DT_TO_DINT(DT#2019-9-1-12:0:0.0)` = 1567339200 (seconds),
   * `DATE_TO_DINT(D#1970-1-2)` = 86400 (seconds, NOT 1 day — the prose on
   * that page says "days" and is wrong, the example is right), and
   * `TOD_TO_DINT(TOD#12:0:0)` = 43200000 (milliseconds).
   *
   * Getting this wrong is not a cosmetic scaling error. Milliseconds since
   * the epoch overflow a DWORD every ~49.7 days, so the result comes back
   * aliased rather than merely a factor of 1000 out, and CODESYS's documented
   * DT range (to 2106) only holds when the unit is seconds. See DOPE-618.
   */
  private temporalConversionUnit(
    typeUpper: string,
  ): TemporalUnitInfo | undefined {
    return TEMPORAL_CONVERSION_UNITS.get(typeUpper);
  }

  /**
   * Temporal SOURCE, numeric target: internal representation → CODESYS unit.
   */
  private wrapTemporalArgForNumericConversion(
    argExpr: string,
    fromTypeUpper: string,
    toTypeUpper: string,
  ): string {
    // STRING targets need a separate format pipeline, not a scale.
    if (!NUMERIC_OR_BIT_CONVERSION_TARGETS.has(toTypeUpper)) {
      return argExpr;
    }
    const unit = this.temporalConversionUnit(fromTypeUpper);
    if (!unit) return argExpr;
    return unit.toUnit === undefined ? argExpr : `${unit.toUnit}(${argExpr})`;
  }

  /**
   * Numeric SOURCE, temporal target: CODESYS unit → internal representation.
   *
   * The mirror of the above, and it has to move with it: OSCAT round-trips
   * through both in a single expression — `DWORD_TO_DT(DT_TO_DWORD(mez) -
   * 7200)` in DCF77, for one — so a fix to one direction alone would leave
   * those worse off than before.
   */
  private wrapNumericArgForTemporalConversion(
    argExpr: string,
    fromTypeUpper: string,
    toTypeUpper: string,
  ): string {
    // Only a genuinely numeric source. A temporal source is a
    // temporal→temporal conversion, which is a semantic question (does
    // DT_TO_DATE truncate to the day?) rather than a unit one, and is left
    // alone here.
    if (!NUMERIC_OR_BIT_CONVERSION_TARGETS.has(fromTypeUpper)) {
      return argExpr;
    }
    const unit = this.temporalConversionUnit(toTypeUpper);
    if (!unit) return argExpr;
    return unit.fromUnit === undefined
      ? argExpr
      : `${unit.fromUnit}(${argExpr})`;
  }

  /**
   * Apply whichever of the two directions fits this conversion.
   *
   * Branches on which side is temporal rather than on whether the first call
   * changed the string. A row whose scaling is a legitimate no-op — the `L`
   * variants are exactly that shape — returns its argument untouched, so a
   * value comparison cannot distinguish "this direction did not apply" from
   * "it applied and had nothing to do", and would fall through to the other
   * direction on a correct answer.
   *
   * That fall-through is harmless today because
   * `NUMERIC_OR_BIT_CONVERSION_TARGETS` and `TEMPORAL_CONVERSION_UNITS` are
   * disjoint, so the second guard rejects what the first already handled. But
   * that is a property of two separate tables agreeing, and this reads the
   * question directly instead of relying on it.
   */
  private scaleConversionArg(
    argExpr: string,
    fromTypeUpper: string,
    toTypeUpper: string,
  ): string {
    if (TEMPORAL_CONVERSION_UNITS.has(fromTypeUpper)) {
      return this.wrapTemporalArgForNumericConversion(
        argExpr,
        fromTypeUpper,
        toTypeUpper,
      );
    }
    if (TEMPORAL_CONVERSION_UNITS.has(toTypeUpper)) {
      return this.wrapNumericArgForTemporalConversion(
        argExpr,
        fromTypeUpper,
        toTypeUpper,
      );
    }
    return argExpr;
  }

  /**
   * For std-lib template functions (like LIMIT, MAX, MIN) where all params
   * share the same generic constraint, harmonize argument types so C++ template
   * deduction succeeds. Casts literals to the dominant variable type, or widens
   * all args to the widest type if variables differ.
   */
  private harmonizeStdFuncArgs(
    args: string[],
    argExprs: FunctionCallExpression["arguments"],
    stdFunc: { params: Array<{ constraint: string }> },
  ): void {
    // Only harmonize when all params share the same generic constraint
    if (stdFunc.params.length === 0) return;
    const firstConstraint = stdFunc.params[0]!.constraint;
    if (firstConstraint === "specific" || firstConstraint === "BOOL") return;
    const allSame = stdFunc.params.every(
      (p) => p.constraint === firstConstraint,
    );
    if (!allSame) return;

    // Infer types for all arguments
    const argTypes: (string | undefined)[] = argExprs.map((a) =>
      this.inferExprType(a.value),
    );

    // Separate variable types from literal types
    const varTypes: string[] = [];
    const literalIndices: number[] = [];
    for (let i = 0; i < argExprs.length && i < args.length; i++) {
      const expr = argExprs[i]!.value;
      const t = argTypes[i];
      if (!t) continue;
      if (
        expr.kind === "LiteralExpression" ||
        (expr.kind === "UnaryExpression" &&
          expr.operand.kind === "LiteralExpression")
      ) {
        literalIndices.push(i);
      } else {
        varTypes.push(t);
      }
    }

    // Find dominant type from variable types, or from literal types if all args are literals
    let dominant: string;
    if (varTypes.length === 0) {
      // All literals — pick the widest literal type as dominant
      const litTypes = literalIndices
        .map((i) => argTypes[i])
        .filter((t): t is string => !!t);
      if (litTypes.length === 0) return;
      dominant = litTypes[0]!;
      for (let i = 1; i < litTypes.length; i++) {
        const bits1 = getTypeBits(dominant) ?? 0;
        const bits2 = getTypeBits(litTypes[i]!) ?? 0;
        if (bits2 > bits1) dominant = litTypes[i]!;
      }
    } else {
      // Find dominant type: if all var types agree, use that; otherwise pick widest
      dominant = varTypes[0]!;
      for (let i = 1; i < varTypes.length; i++) {
        if (varTypes[i] !== dominant) {
          // Pick wider type
          const bits1 = getTypeBits(dominant) ?? 0;
          const bits2 = getTypeBits(varTypes[i]!) ?? 0;
          if (bits2 > bits1) dominant = varTypes[i]!;
        }
      }
    }

    // Cast literals to dominant type.
    // Bare literals (no typePrefix) are untyped — castable to dominant unless
    // this would narrow a REAL/LREAL literal to an integer type (losing
    // precision).  When the call also carries a variable argument we must
    // ALWAYS wrap bare literals: the variable side is an `IECVar<T>` but a
    // bare literal lowers to a raw `int`/`double`, so C++ template deduction
    // sees conflicting `T`s (`IECVar<int>` vs `int`) even when both share
    // the same IEC type name on our side.
    for (const i of literalIndices) {
      const litType = argTypes[i];
      if (!litType) continue;
      const expr = argExprs[i]!.value;
      const litCat = getTypeCategory(litType);
      const domCat = getTypeCategory(dominant);
      // Never narrow a REAL literal to integer — that truncates (e.g. 1.5 → 1)
      if (litCat === "REAL" && domCat !== "REAL" && this.isBareLiteral(expr)) {
        continue;
      }
      // Bare literal paired with at least one IEC variable: cast even when
      // the inferred IEC type matches `dominant`, to lift raw C++ literals
      // into the IECVar<> template space.
      if (this.isBareLiteral(expr) && varTypes.length > 0) {
        args[i] = `static_cast<IEC_${dominant}>(${args[i]})`;
        continue;
      }
      if (litType === dominant) continue;
      if (
        this.isBareLiteral(expr) ||
        this.canImplicitWiden(litType, dominant)
      ) {
        args[i] = `static_cast<IEC_${dominant}>(${args[i]})`;
      }
    }

    // Cast variable args that need widening to dominant type
    for (let i = 0; i < args.length && i < argExprs.length; i++) {
      if (literalIndices.includes(i)) continue;
      const t = argTypes[i];
      if (t && t !== dominant && this.canImplicitWiden(t, dominant)) {
        args[i] = `static_cast<IEC_${dominant}>(${args[i]})`;
      }
    }
  }

  /**
   * Generate C++ for a function call expression.
   * Handles: dotted method calls (THIS.method, SUPER.method, instance.method),
   * standard functions, *_TO_* conversions, DELETE->DELETE_STR mapping,
   * named argument reordering, and user-defined function calls.
   */
  protected generateFunctionCallExpression(
    expr: FunctionCallExpression,
  ): string {
    // ST code never runs under a global's lock: evaluate it before the lock.
    if (this.lockCtx && this.isUserCall(expr)) {
      return this.hoistOutOfLock(() =>
        this.generateFunctionCallExpression(expr),
      );
    }

    // Handle dotted method calls: THIS.method, SUPER.method, instance.method
    if (expr.functionName.includes(".")) {
      const dotIdx = expr.functionName.indexOf(".");
      const prefix = expr.functionName.substring(0, dotIdx);
      const methodName = expr.functionName.substring(dotIdx + 1);

      // Resolve method name case from declaration
      const varType = this.currentScopeVarTypes.get(prefix.toUpperCase());

      const resolvedMethod = varType
        ? this.resolveMethodName(varType, methodName)
        : this.resolveMethodNameGlobal(methodName);

      // A method of a global FB instance runs under the instance's lock.
      const ref = this.globalRefOf(prefix);
      if (ref) {
        return this.renderGlobalMethodCall(
          {
            kind: "VariableExpression",
            sourceSpan: expr.sourceSpan,
            name: prefix,
            subscripts: [],
            fieldAccess: [],
            isDereference: false,
          },
          ref,
          varType,
          resolvedMethod,
          expr.arguments,
        );
      }

      // A generic method parameter takes the same descriptor a generic
      // function block input does — METHOD is one of the three scopes a
      // generic may be declared in.
      const args = this.generateCallArguments(
        varType,
        methodName,
        expr.arguments,
      );
      if (prefix.toUpperCase() === "THIS") {
        return `this->${resolvedMethod}(${args.join(", ")})`;
      } else if (prefix.toUpperCase() === "SUPER" && this.currentFBExtends) {
        return `${this.currentFBExtends}::${resolvedMethod}(${args.join(", ")})`;
      } else {
        // instance.method() call
        return `${this.instanceBaseName(prefix)}.${resolvedMethod}(${args.join(", ")})`;
      }
    }

    const nameUpper = expr.functionName.toUpperCase();

    // SUPER^() — parent body call
    if (nameUpper === "SUPER" && this.currentFBExtends) {
      const args = expr.arguments.map((arg) =>
        this.generateExpression(arg.value),
      );
      return `${this.currentFBExtends}::operator()(${args.join(", ")})`;
    }

    // 0. ADR(x) → &(x) (CODESYS address-of operator)
    if (nameUpper === "ADR") {
      const args = expr.arguments.map((arg) =>
        this.generateExpression(arg.value),
      );
      return `&(${args[0] ?? ""})`;
    }

    // 0a. __VARINFO(x) → a strucpp::VAR_INFO describing x.
    if (nameUpper === "__VARINFO") {
      const arg = expr.arguments[0]?.value;
      const info = arg === undefined ? undefined : this.generateVarInfo(arg);
      if (info !== undefined) return info;
    }

    // 0b. REF_LINK(x) → REF(x) — callable form of the REF() reference operator
    // (REF is a reserved token and can't take the graphical EN/IN/ENO call
    // form). Assigning the result to a REF_TO variable binds it.
    if (nameUpper === "REF_LINK") {
      const args = expr.arguments.map((arg) =>
        this.generateExpression(arg.value),
      );
      return `REF(${args[0] ?? ""})`;
    }

    // 0b. LOWER_BOUND/UPPER_BOUND(arr, dim) → arr.lower_bound() / arr.upper_bound()
    if (nameUpper === "LOWER_BOUND" || nameUpper === "UPPER_BOUND") {
      const method =
        nameUpper === "LOWER_BOUND" ? "lower_bound" : "upper_bound";
      const arrExpr = this.generateExpression(expr.arguments[0]!.value);
      if (expr.arguments.length >= 2) {
        const dimExpr = this.generateExpression(expr.arguments[1]!.value);
        return `${arrExpr}.${method}(${dimExpr})`;
      }
      return `${arrExpr}.${method}()`;
    }

    // 1. Check for *_TO_* conversion pattern (e.g., INT_TO_REAL -> TO_REAL)
    const conversion = this.stdRegistry.resolveConversion(nameUpper);
    if (conversion) {
      const split = CodeGenerator.dateTimeSplitFn(
        conversion.fromType.toUpperCase(),
        conversion.toType.toUpperCase(),
      );
      if (split && expr.arguments.length === 1) {
        return `${split}(${this.generateExpression(expr.arguments[0]!.value)})`;
      }
      const args = expr.arguments.map((arg, idx) => {
        const generated = this.generateExpression(arg.value);
        if (idx !== 0) return generated;
        // Type-aware unit scaling, in whichever direction applies — a
        // temporal source going to an integer, or an integer going into a
        // temporal target. See `TEMPORAL_CONVERSION_UNITS` for the units and
        // why they are CODESYS's.
        //
        // It has to happen here rather than in the runtime because the C++
        // runtime aliases every temporal type to `IECVar<int64_t>`: a `TIME`
        // and a `DATE` are literally the same type after compilation, and the
        // codegen layer is the last place that still knows which one this
        // expression is. Without it `TO_UINT(time_var)` lowers to a
        // `static_cast<uint16_t>(raw_ns)` and the user sees the low 16 bits of
        // a nanosecond count.
        return this.scaleConversionArg(
          generated,
          conversion.fromType.toUpperCase(),
          conversion.toType.toUpperCase(),
        );
      });
      return `${conversion.cppName}(${args.join(", ")})`;
    }

    // 2. Check for standard function (may have different cppName)
    const stdFunc = this.stdRegistry.lookup(nameUpper);
    if (stdFunc) {
      if (
        stdFunc.isConversion &&
        stdFunc.specificReturnType &&
        expr.arguments.length === 1
      ) {
        const fromType = this.inferExprType(expr.arguments[0]!.value);
        const split = fromType
          ? CodeGenerator.dateTimeSplitFn(
              fromType.toUpperCase(),
              stdFunc.specificReturnType.toUpperCase(),
            )
          : undefined;
        if (split) {
          return `${split}(${this.generateExpression(expr.arguments[0]!.value)})`;
        }
      }
      const args = expr.arguments.map((arg, idx) => {
        let generated = this.generateExpression(arg.value);
        // For the bare `TO_xxx(temporal_var)` spelling, `nameUpper` is
        // a registered std function (not a `*_TO_*` form) so the source
        // type isn't in the name — infer it from the argument's IEC
        // type and apply the same temporal→ms wrap as the conversion
        // branch above.  Conversion std functions advertise
        // `isConversion: true` and carry the target in
        // `specificReturnType`, so we have everything needed without
        // adding a new schema field.
        if (idx === 0 && stdFunc.isConversion && stdFunc.specificReturnType) {
          const fromType = this.inferExprType(arg.value);
          if (fromType) {
            generated = this.scaleConversionArg(
              generated,
              fromType.toUpperCase(),
              stdFunc.specificReturnType.toUpperCase(),
            );
          }
        }
        return generated;
      });
      this.harmonizeStdFuncArgs(args, expr.arguments, stdFunc);
      return `${stdFunc.cppName}(${args.join(", ")})`;
    }

    // 2b. A shared global bound to a by-reference parameter.
    const byRefCall = this.renderGlobalByRefCall(expr);
    if (byRefCall !== undefined) return byRefCall;

    // 3. Check for named arguments that may need reordering
    const hasNamedArgs = expr.arguments.some((arg) => arg.name !== undefined);
    if (hasNamedArgs && this.ast) {
      const reordered = this.reorderNamedArguments(expr);
      if (reordered) {
        return `${expr.functionName}(${reordered.join(", ")})`;
      }
    }

    // 4. Default: emit as-is (with output argument validation)
    const generics = this.functionGenericParams.get(nameUpper);
    const paramOrder = this.functionParamOrder.get(nameUpper);
    let positionalSlot = 0;
    const args = expr.arguments.map((arg) => {
      const paramName = arg.name ?? paramOrder?.[positionalSlot];
      if (!arg.name) positionalSlot++;
      const generated =
        this.generateGenericArgument(generics, paramName, arg.value) ??
        this.generateExpression(arg.value);
      if (arg.isOutput && arg.value.kind !== "VariableExpression") {
        this.codegenWarnings.push({
          message: `Output argument '${arg.name ?? ""}' should be a variable, not an expression`,
          line: arg.sourceSpan.startLine,
          column: arg.sourceSpan.startCol,
          file: arg.sourceSpan.file,
        });
      }
      return generated;
    });

    // Pad missing trailing VAR_OUTPUT/VAR_IN_OUT params with temp variables
    if (this.ast) {
      const funcDecl = this.ast.functions.find(
        (f) => f.name.toUpperCase() === nameUpper,
      );
      if (funcDecl) {
        const paramInfo: Array<{ blockType: string; typeName: string }> = [];
        for (const block of funcDecl.varBlocks) {
          if (
            block.blockType === "VAR_INPUT" ||
            block.blockType === "VAR_IN_OUT" ||
            block.blockType === "VAR_OUTPUT"
          ) {
            for (const decl of block.declarations) {
              for (let ni = 0; ni < decl.names.length; ni++) {
                paramInfo.push({
                  blockType: block.blockType,
                  typeName: decl.type.name,
                });
              }
            }
          }
        }
        while (args.length < paramInfo.length) {
          const param = paramInfo[args.length]!;
          if (
            param.blockType === "VAR_OUTPUT" ||
            param.blockType === "VAR_IN_OUT"
          ) {
            args.push(this.emitOutputTempVar(param.typeName));
          } else {
            args.push(this.getTypeDefaultValue(param.typeName));
          }
        }
      }
    }

    // Apply implicit widening casts for user-defined function args
    const paramTypes = this.getParamTypes(nameUpper);
    if (paramTypes) {
      this.coerceUserFuncArgs(args, expr.arguments, paramTypes);
    }

    return `${expr.functionName}(${args.join(", ")})`;
  }

  /**
   * A call of a user function that binds a shared global (the global or a part
   * of it) to a VAR_IN_OUT or VAR_OUTPUT, or undefined when none does. When
   * the function takes no global lock, the call runs under the first such
   * global's lock with the parameter bound to that global's own storage, and
   * other lock-taking arguments are evaluated first. A global the call does
   * not hold the lock of is copied in and stored back after the call.
   */
  private renderGlobalByRefCall(
    expr: FunctionCallExpression,
  ): string | undefined {
    const nameUpper = expr.functionName.toUpperCase();
    const byRef = this.functionByRefParams.get(nameUpper);
    if (!byRef) return undefined;
    const generics = this.functionGenericParams.get(nameUpper);
    const order = this.functionParamOrder.get(nameUpper) ?? [];
    const slotOf = new Map<Argument, string>();
    const claimed = new Set<string>();
    for (const arg of expr.arguments) {
      if (arg.name) claimed.add(arg.name.toUpperCase());
    }
    let next = 0;
    for (const arg of expr.arguments) {
      if (arg.name) {
        slotOf.set(arg, arg.name.toUpperCase());
        continue;
      }
      while (next < order.length && claimed.has(order[next]!)) next++;
      if (next >= order.length) continue;
      slotOf.set(arg, order[next]!);
      claimed.add(order[next]!);
      next++;
    }
    const isByRef = (arg: Argument): boolean => {
      const slot = slotOf.get(arg);
      return (
        slot !== undefined && byRef.has(slot) && generics?.has(slot) !== true
      );
    };
    const boundGlobal = (arg: Argument): VariableExpression | undefined =>
      isByRef(arg) &&
      arg.value.kind === "VariableExpression" &&
      this.isGlobalAccess(arg.value) &&
      this.argOverrides?.has(arg.value) !== true
        ? arg.value
        : undefined;
    const bound = expr.arguments
      .map(boundGlobal)
      .filter((g): g is VariableExpression => g !== undefined);
    if (bound.length === 0) return undefined;

    // A bit or other part of a global is not addressable: always a copy.
    const lockable = bound.find(
      (g) => this.splitBitTarget(g).part === undefined,
    );
    const lockUpper =
      lockable === undefined || this.pouMayTakeGlobalLock(nameUpper)
        ? undefined
        : lockable.name.toUpperCase();
    const temps: string[] = [];
    const after: string[] = [];
    const overrides = new Map(this.argOverrides ?? []);
    for (const arg of expr.arguments) {
      const v = arg.value;
      const global = boundGlobal(arg);
      if (global !== undefined) {
        const upper = global.name.toUpperCase();
        const ref = this.globalRefOf(upper)!;
        const { base, part } = this.splitBitTarget(global);
        if (upper === lockUpper && part === undefined) {
          overrides.set(v, this.renderLockedTail(global, temps));
          continue;
        }
        const tmp = `__gca${this.tempVarCounter++}`;
        const tmpType = part === undefined ? "auto" : `IEC_${part.resultType}`;
        temps.push(
          `${tmpType} ${tmp} = ${this.renderGlobalRead(global, ref)};`,
        );
        overrides.set(v, tmp);
        if (!ref.composite && !this.hasAccessTail(global)) {
          after.push(`${ref.acc}write(${tmp});`);
        } else {
          const lv = this.hasAccessTail(base)
            ? this.renderLockedTail(base, after)
            : "(*__glk)";
          after.push(
            `${ref.acc}with_lock([&](auto* __glk){ ${this.renderStore(lv, part, tmp)}; });`,
          );
        }
      } else if (
        lockUpper !== undefined &&
        this.argOverrides?.has(v) !== true &&
        this.mayTakeLock(v)
      ) {
        // Evaluated before the lock, so no lock is taken inside it.
        const tmp = `__gca${this.tempVarCounter++}`;
        if (isByRef(arg)) {
          temps.push(`auto* ${tmp} = &(${this.generateExpression(v)});`);
          overrides.set(v, `(*${tmp})`);
        } else if (generics?.has(slotOf.get(arg) ?? "") !== true) {
          temps.push(`auto ${tmp} = ${this.generateExpression(v)};`);
          overrides.set(v, tmp);
        }
      }
    }

    const saved = this.argOverrides;
    this.argOverrides = overrides;
    let call: string;
    try {
      call = this.generateFunctionCallExpression(expr);
    } finally {
      this.argOverrides = saved;
    }
    if (lockUpper !== undefined) {
      const ref = this.globalRefOf(lockUpper)!;
      call = `${ref.acc}with_lock([&](auto* __glk){ return ${call}; })`;
    }
    if (temps.length === 0 && after.length === 0) return call;
    if (after.length === 0)
      return `[&]{ ${temps.join(" ")} return ${call}; }()`;
    if (this.voidFunctions.has(nameUpper)) {
      return `[&]{ ${temps.join(" ")} ${call}; ${after.join(" ")} }()`;
    }
    return `[&]{ ${temps.join(" ")} auto __r = ${call}; ${after.join(" ")} return __r; }()`;
  }

  /**
   * Reorder named arguments to match function declaration parameter order.
   * Positional args are placed first (in declaration order, skipping named slots),
   * then named args fill their declared slots. Unfilled parameters get default values.
   * Returns null if function not found in AST.
   */
  private reorderNamedArguments(expr: FunctionCallExpression): string[] | null {
    if (!this.ast) return null;

    // Find the function declaration in the AST
    const funcDecl = this.ast.functions.find(
      (f) => f.name.toUpperCase() === expr.functionName.toUpperCase(),
    );
    if (!funcDecl) return null;

    // Build parameter info from VAR_INPUT, VAR_IN_OUT, VAR_OUTPUT blocks
    const params: Array<{
      name: string;
      typeName: string;
      blockType: string;
      defaultExpr?: string;
    }> = [];
    for (const block of funcDecl.varBlocks) {
      if (
        block.blockType === "VAR_INPUT" ||
        block.blockType === "VAR_IN_OUT" ||
        block.blockType === "VAR_OUTPUT"
      ) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            const entry: {
              name: string;
              typeName: string;
              blockType: string;
              defaultExpr?: string;
            } = {
              name: name.toUpperCase(),
              typeName: decl.type.name,
              blockType: block.blockType,
            };
            if (decl.initialValue) {
              entry.defaultExpr = this.generateInitializer(
                decl.initialValue,
                this.mapTypeRefToCpp(decl.type),
                decl.type.name,
              );
            }
            params.push(entry);
          }
        }
      }
    }

    // Build set of parameter slots claimed by named arguments
    // (skip implicit EN/ENO — handled separately by EN/ENO codegen logic)
    const namedArgs = new Map<
      string,
      { value: Expression; isOutput: boolean }
    >();
    const claimedSlots = new Set<string>();
    for (const arg of expr.arguments) {
      if (arg.name !== undefined) {
        const upperName = arg.name.toUpperCase();
        if (upperName === "EN" || upperName === "ENO") continue;
        namedArgs.set(upperName, {
          value: arg.value,
          isOutput: arg.isOutput,
        });
        claimedSlots.add(upperName);

        // Validate output argument is a variable
        if (arg.isOutput && arg.value.kind !== "VariableExpression") {
          this.codegenWarnings.push({
            message: `Output argument '${arg.name}' should be a variable, not an expression`,
            line: arg.sourceSpan.startLine,
            column: arg.sourceSpan.startCol,
            file: arg.sourceSpan.file,
          });
        }
      }
    }

    // Warn about named args that don't match any declared parameter,
    // and check for direction mismatches (=> on VAR_INPUT)
    const paramLookup = new Map(params.map((p) => [p.name, p]));
    for (const [argName, argInfo] of namedArgs) {
      const param = paramLookup.get(argName);
      if (!param) {
        const span = expr.sourceSpan;
        this.codegenWarnings.push({
          message: `Named argument '${argName}' does not match any parameter of function '${expr.functionName}'`,
          line: span.startLine,
          column: span.startCol,
          file: span.file,
        });
      } else if (argInfo.isOutput && param.blockType === "VAR_INPUT") {
        const span = expr.sourceSpan;
        this.codegenWarnings.push({
          message: `Output argument '=>' used for input parameter '${param.name.toLowerCase()}' — did you mean ':='?`,
          line: span.startLine,
          column: span.startCol,
          file: span.file,
        });
      }
    }

    // Collect positional args (preserving source order). Rendered once the
    // slot each fills is known, since a generic slot takes a descriptor
    // instead of the value.
    const positionalArgs: Expression[] = [];
    for (const arg of expr.arguments) {
      if (arg.name === undefined) {
        positionalArgs.push(arg.value);
      }
    }
    const generics = this.functionGenericParams.get(
      expr.functionName.toUpperCase(),
    );
    const renderArg = (value: Expression, paramName: string): string =>
      this.generateGenericArgument(generics, paramName, value) ??
      this.generateExpression(value);

    // Assign positional args to unclaimed parameter slots (in declaration order)
    const result: (string | undefined)[] = new Array<string | undefined>(
      params.length,
    );
    let positionalIdx = 0;
    for (let i = 0; i < params.length; i++) {
      const param = params[i]!;
      if (claimedSlots.has(param.name)) {
        // This slot is reserved for a named arg - skip it for positional fill
        continue;
      }
      if (positionalIdx < positionalArgs.length) {
        result[i] = renderArg(positionalArgs[positionalIdx]!, param.name);
        positionalIdx++;
      }
    }

    // Fill named arg slots
    for (let i = 0; i < params.length; i++) {
      const param = params[i]!;
      const named = namedArgs.get(param.name);
      if (named !== undefined) {
        result[i] = renderArg(named.value, param.name);
      }
    }

    // Fill any remaining unfilled slots with defaults (or temp vars for output params)
    for (let i = 0; i < params.length; i++) {
      if (result[i] === undefined) {
        const param = params[i]!;
        if (
          param.blockType === "VAR_OUTPUT" ||
          param.blockType === "VAR_IN_OUT"
        ) {
          result[i] = this.emitOutputTempVar(param.typeName);
        } else {
          result[i] =
            param.defaultExpr ?? this.getTypeDefaultValue(param.typeName);
        }
      }
    }

    return result.map((v, i) => {
      if (v !== undefined) return v;
      const param = params[i]!;
      if (
        param.blockType === "VAR_OUTPUT" ||
        param.blockType === "VAR_IN_OUT"
      ) {
        return this.emitOutputTempVar(param.typeName);
      }
      return param.defaultExpr ?? this.getTypeDefaultValue(param.typeName);
    });
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Emit a temporary variable declaration for an omitted VAR_OUTPUT/VAR_IN_OUT argument.
   * The temp is emitted before the current statement line (since generateExpression()
   * runs before the statement's emit() call). Returns the temp variable name.
   */
  private emitOutputTempVar(typeName: string): string {
    const name = `__output_tmp_${this.tempVarCounter++}`;
    const cppType = this.mapVarTypeToCpp(typeName);
    this.emit(`${this.currentStatementIndent}${cppType} ${name};`);
    return name;
  }

  /**
   * Check if a type name refers to a known function block type.
   */
  private isFBType(typeName: string): boolean {
    return this.knownFBTypes.has(typeName.toUpperCase());
  }

  /**
   * When `typeName` (a member's declared type) is also the name of a sibling
   * member in the same scope, return the C++ elaborated-type-specifier keyword
   * (`class `/`struct `) needed so the bare type name isn't resolved to the data
   * member. Returns "" when there's no shadowing or the type isn't a composite.
   */
  private elaboratedTagIfShadowed(
    typeName: string,
    memberNames: Set<string>,
  ): string {
    const u = typeName.toUpperCase();
    if (!memberNames.has(u)) return "";
    // Enums are emitted as `using IEC_X = IEC_ENUM<X>` aliases, which cannot be
    // named with an elaborated `struct`/`class` specifier. They also never need
    // disambiguation here because the member is already mangled (name_).
    if (this.enumTypeMembers.has(u)) return "";
    if (this.knownFBTypes.has(u)) return "class ";
    if (this.knownStructTypes.has(u)) return "struct ";
    return "";
  }

  /**
   * Check if a type name refers to a known interface type.
   */
  private isInterfaceType(typeName: string): boolean {
    return this.knownInterfaceTypes.has(typeName.toUpperCase());
  }

  /**
   * Resolve the declared case of a method name given the type and method name.
   * Returns the declared name if found, or the original name if not.
   */
  private resolveMethodName(typeName: string, methodName: string): string {
    const key = `${typeName.toUpperCase()}.${methodName.toUpperCase()}`;
    return this.methodNameMap.get(key) ?? methodName;
  }

  /**
   * Resolve method name case by searching all known types.
   * Used when the object type is not easily determined (e.g., chained calls).
   */
  private resolveMethodNameGlobal(methodName: string): string {
    const upper = methodName.toUpperCase();
    for (const [key, declaredName] of this.methodNameMap) {
      if (key.endsWith(`.${upper}`)) {
        return declaredName;
      }
    }
    return methodName;
  }

  /**
   * Resolve a property name from the property name map.
   * Returns the declared property name if the field is a property, undefined otherwise.
   */
  private resolvePropertyName(
    typeName: string | undefined,
    fieldName: string,
  ): string | undefined {
    if (!typeName) return undefined;
    const key = `${typeName.toUpperCase()}.${fieldName.toUpperCase()}`;
    return this.propertyNameMap.get(key);
  }

  /**
   * Resolve the type of a member field on a given FB or struct type.
   * Used for chained access like ctrl.motor.Speed where we need to know
   * motor's type to check if Speed is a property.
   */
  protected resolveMemberType(
    typeName: string | undefined,
    memberName: string,
  ): string | undefined {
    if (!typeName) return undefined;
    if (this.ast) {
      const result = resolveFieldTypeUtil(typeName, memberName, this.ast);
      if (result) return result;
    }
    // Fallback: check library FB field types
    return this.libraryFBFieldTypes.get(
      `${typeName.toUpperCase()}.${memberName.toUpperCase()}`,
    );
  }

  /**
   * Detect if an assignment target is a property write (e.g., m.Speed := 75).
   * Returns the object code prefix and property name if so, undefined otherwise.
   */
  private detectPropertyWrite(
    target: Expression,
  ): { objectCode: string; propertyName: string } | undefined {
    if (target.kind !== "VariableExpression") return undefined;
    const expr = target;
    if (expr.fieldAccess.length === 0) return undefined;

    const nameUpper = expr.name.toUpperCase();
    const lastField = expr.fieldAccess[expr.fieldAccess.length - 1]!;

    // Resolve the type at the point just before the last field
    let currentType: string | undefined;
    if (nameUpper === "THIS") currentType = this.currentFBName;
    else if (nameUpper === "SUPER") currentType = this.currentFBExtends;
    else currentType = this.currentScopeVarTypes.get(nameUpper);

    for (let i = 0; i < expr.fieldAccess.length - 1; i++) {
      if (!currentType) break;
      currentType = this.resolveMemberType(currentType, expr.fieldAccess[i]!);
    }

    if (!currentType) return undefined;
    const propName = this.resolvePropertyName(currentType, lastField);
    if (!propName) return undefined;

    // Build the object code (everything except the last field)
    let objectCode: string;
    if (nameUpper === "THIS") {
      objectCode = "this->";
      let ct: string | undefined = this.currentFBName;
      for (let i = 0; i < expr.fieldAccess.length - 1; i++) {
        const f = expr.fieldAccess[i]!;
        const ft = this.resolveMemberType(ct, f);
        objectCode += (this.needsFieldMangling(f, ft, ct) ? `${f}_` : f) + ".";
        ct = ft;
      }
    } else if (nameUpper === "SUPER" && this.currentFBExtends) {
      objectCode = this.currentFBExtends + "::";
      let ct: string | undefined = this.currentFBExtends;
      for (let i = 0; i < expr.fieldAccess.length - 1; i++) {
        const f = expr.fieldAccess[i]!;
        const ft = this.resolveMemberType(ct, f);
        objectCode += (this.needsFieldMangling(f, ft, ct) ? `${f}_` : f) + ".";
        ct = ft;
      }
    } else {
      // Generate a VariableExpression with fieldAccess trimmed to all-but-last
      // Also trim the accessChain if present
      const baseExpr: VariableExpression = {
        ...expr,
        fieldAccess: expr.fieldAccess.slice(0, -1),
      };
      if (expr.accessChain) {
        const trimmed = this.trimLastFieldFromAccessChain(expr.accessChain);
        if (trimmed) {
          baseExpr.accessChain = trimmed;
        } else {
          delete baseExpr.accessChain;
        }
      }
      objectCode = this.generateVariableExpression(baseExpr) + ".";
    }

    return { objectCode, propertyName: propName };
  }

  /**
   * Read one part of a bit-field variable.
   *
   * `index` counts parts from the least significant end, so the shift is the
   * part's own width times its index: `Do.%B3` is `(Do >> 24) & 0xFF`. All of
   * it is done in 64 bits, so a shift of 32 or more is well defined.
   */
  private partialAccessRead(base: string, part: PartialAccess): string {
    const shift = part.index * part.widthBits;
    const mask =
      part.widthBits === 1
        ? "1"
        : `0x${((1n << BigInt(part.widthBits)) - 1n).toString(16).toUpperCase()}ULL`;
    return `((static_cast<uint64_t>(${base}) >> ${shift}) & ${mask})`;
  }

  /**
   * The right-hand side of a partial-access write: the whole variable with one
   * part replaced. Clears the part's bits, then ORs the value in masked to the
   * part's width, so a wider value cannot corrupt its neighbours. A bit keeps
   * `value ? 1 : 0`.
   */
  private partialAccessWrite(
    base: string,
    value: string,
    part: PartialAccess,
  ): string {
    const shift = part.index * part.widthBits;
    if (part.widthBits === 1) {
      return `(${base} & ~(1ULL << ${shift})) | ((${value} ? 1ULL : 0ULL) << ${shift})`;
    }
    const mask = `0x${((1n << BigInt(part.widthBits)) - 1n).toString(16).toUpperCase()}ULL`;
    return `(${base} & ~(${mask} << ${shift})) | ((static_cast<uint64_t>(${value}) & ${mask}) << ${shift})`;
  }

  /**
   * Remove the last field step from an access chain (for bit access / property trim).
   * Returns undefined if the chain becomes empty.
   */
  private trimLastFieldFromAccessChain(
    chain: AccessStep[],
  ): AccessStep[] | undefined {
    const trimmed = [...chain];
    for (let i = trimmed.length - 1; i >= 0; i--) {
      if (trimmed[i]!.kind === "field") {
        trimmed.splice(i, 1);
        break;
      }
    }
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Check if a type name refers to any user-defined type (FB, interface, or struct/UDT).
   * These types should NOT get the IEC_ prefix.
   */
  protected isUserDefinedType(typeName: string): boolean {
    const upper = typeName.toUpperCase();
    return (
      this.knownFBTypes.has(upper) ||
      this.knownInterfaceTypes.has(upper) ||
      this.knownStructTypes.has(upper) ||
      this.knownProgramTypes.has(upper)
    );
  }

  /**
   * Enter a new scope for code generation. Populates currentScopeVarTypes
   * from the variable blocks of a program or function block.
   */
  private enterScope(
    varBlocks: CompilationUnit["programs"][0]["varBlocks"],
  ): void {
    this.currentScopeVarTypes.clear();
    this.currentScopeVarRefKinds.clear();
    this.currentScopeDeclaredNames.clear();
    this.currentScopeVarTypeRefs.clear();
    this.memberMangledNames.clear();
    for (const block of varBlocks) {
      for (const decl of block.declarations) {
        const cppType = this.isUserDefinedType(decl.type.name)
          ? decl.type.name
          : `IEC_${decl.type.name}`;
        decl.names.forEach((name, i) => {
          this.currentScopeVarTypes.set(name.toUpperCase(), decl.type.name);
          const declared = decl.declaredNames?.[i];
          if (declared !== undefined) {
            this.currentScopeDeclaredNames.set(name.toUpperCase(), declared);
          }
          this.currentScopeVarTypeRefs.set(name.toUpperCase(), decl.type);
          if (
            decl.type.referenceKind !== undefined &&
            decl.type.referenceKind !== "none"
          ) {
            this.currentScopeVarRefKinds.set(
              name.toUpperCase(),
              decl.type.referenceKind,
            );
          }
          // Detect member name collisions with type name (GCC -Wchanges-meaning)
          if (
            this.isUserDefinedType(decl.type.name) &&
            name.toUpperCase() === cppType.toUpperCase()
          ) {
            this.memberMangledNames.set(name.toUpperCase(), `${name}_`);
          }
          // Detect member name collisions with interface method names
          if (this.currentFBInterfaceMethods.has(name.toUpperCase())) {
            this.memberMangledNames.set(name.toUpperCase(), `${name}_`);
          }
        });
      }
    }
  }

  /**
   * Exit the current scope, clearing variable type tracking.
   */
  private exitScope(): void {
    this.currentScopeVarTypes.clear();
    this.currentScopeDeclaredNames.clear();
  }

  /** Write out a set of user-defined type declarations. */
  private emitTypeDeclarations(types: CompilationUnit["types"]): void {
    if (types.length === 0) return;
    const typeRegistry = new TypeRegistry();
    typeRegistry.registerTypes(types);
    const typeCodeGen = new TypeCodeGenerator({
      indent: this.options.indent,
      lineEnding: this.options.lineEnding,
      emitChunkMarkers: this.options.emitChunkMarkers ?? false,
      // Struct fields must mangle by the same rule as everything else that
      // names them, and only codegen knows the FB / program type names.
      isUserDefinedType: (t): boolean => this.isUserDefinedType(t),
    });
    const typeCode = typeCodeGen.generateFromRegistry(typeRegistry);
    for (const t of typeCodeGen.describedTypes)
      this.describedStructTypes.add(t);
    // A struct with no layout table is not an error — it compiles and runs, and
    // a program that never puts it on a generic pin is unaffected. It IS worth
    // saying, because the symptom otherwise is a null `TYPEDESC` at run time
    // with nothing anywhere to explain it.
    for (const u of typeCodeGen.undescribedTypes) {
      this.codegenWarnings.push({
        message:
          `STRUCT '${u.typeName}' has no member layout, so a block given one on ` +
          `an ANY pin cannot walk it: member '${u.member}' cannot be described — ` +
          `${u.reason}`,
      });
    }
    for (const line of typeCode.split(this.options.lineEnding)) {
      this.emitHeader(line);
    }
  }

  /** Release each held-back type once every class it holds has been emitted. */
  private emitFbBearingTypes(emittedFBs: Set<string>): void {
    const ready = this.pendingFbBearingTypes.filter((td) => {
      const deps = this.fbBearingTypeDeps.get(td.name.toUpperCase());
      return !deps || [...deps].every((d) => emittedFBs.has(d));
    });
    if (ready.length === 0) return;
    this.pendingFbBearingTypes = this.pendingFbBearingTypes.filter(
      (td) => !ready.includes(td),
    );
    this.emitTypeDeclarations(ready);
  }

  /**
   * Structures that reach a type a LIBRARY declares — an enumeration or a
   * structure out of a `.stlib`.
   *
   * Library chunks are injected after the user's types, so a structure naming
   * one was emitted before its declaration and C++ reported it undeclared. A
   * structure holding a library FUNCTION BLOCK never hit this —
   * `collectFbBearingTypes` already defers that one. Nothing to wait for
   * beyond the library section, so these carry no dependency set.
   */
  private collectLibraryTypeBearingTypes(ast: CompilationUnit): Set<string> {
    if (this.libraryTypeNames.size === 0) return new Set();

    // Every definition kind can name a library type, not just a structure: an
    // alias IS a type reference, an array names its element, a subrange or
    // typed enum names its base. Each is its own declaration, so each can land
    // ahead of the library section.
    const referenced = new Map<string, string[]>();
    for (const td of ast.types) {
      const names: string[] = [];
      const definition = td.definition;
      switch (definition.kind) {
        case "StructDefinition":
          for (const field of definition.fields) {
            names.push(field.type.name);
            if (field.type.elementTypeName)
              names.push(field.type.elementTypeName);
          }
          break;
        case "ArrayDefinition":
          names.push(definition.elementType.name);
          if (definition.elementType.elementTypeName) {
            names.push(definition.elementType.elementTypeName);
          }
          break;
        case "SubrangeDefinition":
          names.push(definition.baseType.name);
          break;
        case "EnumDefinition":
          if (definition.baseType) names.push(definition.baseType.name);
          break;
        default:
          // A bare `TypeReference` is an alias for the type it names.
          names.push(definition.name);
          if (definition.elementTypeName)
            names.push(definition.elementTypeName);
          break;
      }
      referenced.set(
        td.name.toUpperCase(),
        names.map((name) => name.toUpperCase()),
      );
    }

    const found = new Set<string>();
    const visit = (name: string, seen: Set<string>): boolean => {
      if (found.has(name)) return true;
      if (seen.has(name)) return false;
      seen.add(name);
      for (const candidate of referenced.get(name) ?? []) {
        if (this.libraryTypeNames.has(candidate) || visit(candidate, seen)) {
          found.add(name);
          return true;
        }
      }
      return false;
    };
    for (const name of referenced.keys()) visit(name, new Set());
    return found;
  }

  /**
   * Structures that reach a function block instance, mapped to the classes
   * they need declared first. A member held by value needs the complete type,
   * so such a structure cannot precede the class it holds.
   */
  private collectFbBearingTypes(
    ast: CompilationUnit,
  ): Map<string, Set<string>> {
    const fields = new Map<string, VarDeclaration[]>();
    for (const td of ast.types) {
      if (td.definition.kind === "StructDefinition") {
        fields.set(td.name.toUpperCase(), td.definition.fields);
      }
    }
    const found = new Map<string, Set<string>>();
    const visit = (name: string, seen: Set<string>): Set<string> => {
      const done = found.get(name);
      if (done) return done;
      const blocks = new Set<string>();
      if (seen.has(name)) return blocks;
      seen.add(name);
      for (const field of fields.get(name) ?? []) {
        const type = field.type.name.toUpperCase();
        const element = field.type.elementTypeName?.toUpperCase();
        for (const candidate of [type, element]) {
          if (candidate === undefined) continue;
          if (this.knownFBTypes.has(candidate)) blocks.add(candidate);
          else for (const inner of visit(candidate, seen)) blocks.add(inner);
        }
      }
      if (blocks.size > 0) found.set(name, blocks);
      return blocks;
    };
    for (const name of fields.keys()) visit(name, new Set());
    return found;
  }

  /**
   * Topologically sort function blocks so that FBs containing instances of
   * other FBs are emitted after their dependencies (Kahn's algorithm).
   */
  private topologicalSortFBs(
    fbs: CompilationUnit["functionBlocks"],
  ): CompilationUnit["functionBlocks"] {
    if (fbs.length <= 1) return fbs;

    // Build name → FB mapping
    const fbMap = new Map<string, (typeof fbs)[0]>();
    for (const fb of fbs) {
      fbMap.set(fb.name.toUpperCase(), fb);
    }

    // Build adjacency: fbName → set of FB names it depends on (has as members)
    const deps = new Map<string, Set<string>>();
    for (const fb of fbs) {
      const fbDeps = new Set<string>();
      for (const block of fb.varBlocks) {
        for (const decl of block.declarations) {
          const typeName = decl.type.name.toUpperCase();
          if (fbMap.has(typeName) && typeName !== fb.name.toUpperCase()) {
            fbDeps.add(typeName);
          }
          // A structure holding an instance is emitted with those classes, so
          // a block using it has to follow them too.
          for (const held of this.fbBearingTypeDeps.get(typeName) ?? []) {
            if (fbMap.has(held) && held !== fb.name.toUpperCase()) {
              fbDeps.add(held);
            }
          }
        }
      }
      // Also check EXTENDS (parent FB must come first)
      if (fb.extends) {
        const parentUpper = fb.extends.toUpperCase();
        if (fbMap.has(parentUpper)) {
          fbDeps.add(parentUpper);
        }
      }
      deps.set(fb.name.toUpperCase(), fbDeps);
    }

    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    for (const fb of fbs) {
      inDegree.set(
        fb.name.toUpperCase(),
        deps.get(fb.name.toUpperCase())!.size,
      );
    }

    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const sorted: (typeof fbs)[0][] = [];
    while (queue.length > 0) {
      const name = queue.shift()!;
      sorted.push(fbMap.get(name)!);

      // Reduce in-degree for FBs that depend on this one
      for (const [fbName, fbDeps] of deps) {
        if (fbDeps.has(name)) {
          fbDeps.delete(name);
          const newDeg = inDegree.get(fbName)! - 1;
          inDegree.set(fbName, newDeg);
          if (newDeg === 0) queue.push(fbName);
        }
      }
    }

    // If cycle detected, append remaining in original order
    if (sorted.length < fbs.length) {
      for (const fb of fbs) {
        if (!sorted.includes(fb)) {
          sorted.push(fb);
        }
      }
    }

    return sorted;
  }

  /**
   * Check if a function call statement is actually an FB invocation.
   * Returns the FB type name if it is, undefined otherwise.
   *
   * `isElementCall` distinguishes `units[0]()` from `units()`: there the
   * declared type is the array, so the instance type is its element type.
   */
  private getFBInvocationType(
    functionName: string,
    isElementCall = false,
  ): string | undefined {
    const declaredType = this.currentScopeVarTypes.get(
      functionName.toUpperCase(),
    );
    if (!declaredType) {
      // A block reached through a structure: walk the members to its type.
      // A method name resolves to no member, so a method call falls through.
      if (!functionName.includes(".")) return undefined;
      const parts = functionName.split(".");
      let walked = this.currentScopeVarTypes.get(parts[0]!.toUpperCase());
      for (let i = 1; i < parts.length && walked; i++) {
        walked = this.resolveMemberType(walked, parts[i]!);
      }
      return walked && this.isFBType(walked) ? walked : undefined;
    }
    const varType = isElementCall
      ? this.ast
        ? resolveArrayElementTypeUtil(declaredType, this.ast)
        : undefined
      : declaredType;
    if (
      varType &&
      (this.isFBType(varType) ||
        this.knownProgramTypes.has(varType.toUpperCase()))
    ) {
      return varType;
    }
    return undefined;
  }

  /**
   * Extract implicit EN/ENO arguments from a function/FB call.
   * Returns the EN condition expression, ENO target variable, and the
   * remaining arguments with EN/ENO stripped out.
   */
  private extractEnEno(args: Argument[]): {
    enExpr: string | null;
    enoVar: string | null;
    filteredArgs: Argument[];
  } {
    let enExpr: string | null = null;
    let enoVar: string | null = null;
    const filteredArgs: Argument[] = [];

    for (const arg of args) {
      const nameUpper = arg.name?.toUpperCase();
      if (nameUpper === "EN" && !arg.isOutput) {
        enExpr = this.generateExpression(arg.value);
      } else if (nameUpper === "ENO" && arg.isOutput) {
        enoVar = this.generateExpression(arg.value);
      } else {
        filteredArgs.push(arg);
      }
    }

    return { enExpr, enoVar, filteredArgs };
  }

  /**
   * Check if a function call argument list contains EN or ENO implicit parameters.
   */
  private hasEnEno(args: Argument[]): boolean {
    return args.some((a) => {
      const n = a.name?.toUpperCase();
      return (n === "EN" && !a.isOutput) || (n === "ENO" && a.isOutput);
    });
  }

  /**
   * Emit an EN/ENO wrapper around a body-emitting callback.
   *
   * Two ENO sinks are reflected uniformly:
   *   - `enoVar`              — the caller's `ENO => var` binding, if any.
   *   - `instanceEnoTarget`   — the FB instance's implicit ENO member
   *                             (e.g. `inst.ENO`), passed for FB calls so
   *                             `IF inst.ENO THEN ...` reads the right
   *                             value.  null for plain function calls.
   *
   * Both sinks are written every time so they can't carry stale values
   * across calls.  Per IEC 61131-3 §6.4.1.3, ENO defaults to TRUE when
   * EN is omitted — so an unguarded call writes TRUE to every sink it
   * has, which also overwrites any FALSE left behind by a prior gated
   * invocation.
   */
  private emitEnEnoWrapper(
    indent: string,
    enExpr: string | null,
    enoVar: string | null,
    emitBody: (bodyIndent: string) => void,
    instanceEnoTarget: string | null = null,
  ): void {
    const targets = [enoVar, instanceEnoTarget].filter(
      (t): t is string => t !== null,
    );
    const writeTargets = (atIndent: string, value: boolean): void => {
      for (const t of targets) {
        this.emit(`${atIndent}${t} = ${value};`);
      }
    };

    if (enExpr !== null) {
      const bodyIndent = indent + this.options.indent;
      this.emit(`${indent}if (${enExpr}) {`);
      emitBody(bodyIndent);
      writeTargets(bodyIndent, true);
      this.emit(`${indent}} else {`);
      writeTargets(bodyIndent, false);
      this.emit(`${indent}}`);
    } else {
      emitBody(indent);
      writeTargets(indent, true);
    }
  }

  /**
   * Generate code for an FB invocation.
   * Pattern: assign inputs → call operator() → capture outputs
   */
  private generateFBInvocation(
    call: FunctionCallExpression,
    indent: string,
  ): void {
    const rawName = this.resolveVariableBaseName(call.functionName);

    // An instance held in a shared global (the global or an element of it) is
    // called in place under that global's lock.
    const instanceExpr: VariableExpression =
      call.instance?.kind === "VariableExpression"
        ? call.instance
        : {
            kind: "VariableExpression",
            sourceSpan: call.sourceSpan,
            name: call.functionName,
            subscripts: [],
            fieldAccess: [],
            isDereference: false,
          };
    if (this.isGlobalAccess(instanceExpr)) {
      this.generateLockedFBInvocation(
        call,
        instanceExpr.name.toUpperCase(),
        this.globalRefOf(instanceExpr.name)!,
        instanceExpr,
        this.getFBInvocationType(
          call.functionName,
          call.instance !== undefined,
        ),
        indent,
      );
      return;
    }

    // An in-out bound to a shared global is bound to the global's own storage
    // with the call under that global's lock, when the block takes no global
    // lock itself (no lock is ever taken inside another).
    const lockFbType = this.getFBInvocationType(
      call.functionName,
      call.instance !== undefined,
    );
    const boundGlobal = this.fbInoutBoundGlobal(call, lockFbType);
    if (
      boundGlobal !== undefined &&
      lockFbType !== undefined &&
      !this.pouMayTakeGlobalLock(lockFbType)
    ) {
      let target =
        call.instance !== undefined
          ? this.generateExpression(call.instance)
          : rawName.includes(".")
            ? this.dottedInstanceName(rawName, call.sourceSpan)
            : this.instanceBaseName(rawName);
      if (call.instance !== undefined && this.mayTakeLock(call.instance)) {
        const ptr = `__gfi${this.tempVarCounter++}`;
        this.emit(`${indent}auto* ${ptr} = &(${target});`);
        target = `(*${ptr})`;
      }
      this.generateLockedFBInvocation(
        call,
        boundGlobal.name.toUpperCase(),
        this.globalRefOf(boundGlobal.name)!,
        target,
        lockFbType,
        indent,
      );
      return;
    }

    // `units[0](…)` invokes an element rather than a bare instance: the target
    // is the subscripted expression, and the FB type is the array's element
    // type. Everything below (input assignment, the call, inout copy-back,
    // output capture) then works against that expression unchanged.
    // A shared global's mutex is bypassed here for the same reason binding one
    // to an inout bypasses it: the caller holds the instance across the call,
    // so a lock spanning it would not be the thing protecting it.
    const instanceName =
      call.instance !== undefined
        ? this.generateExpression(call.instance)
        : rawName.includes(".")
          ? this.dottedInstanceName(rawName, call.sourceSpan)
          : this.instanceBaseName(rawName);

    // Extract implicit EN/ENO parameters
    const { enExpr, enoVar, filteredArgs } = this.extractEnEno(call.arguments);

    // Resolve FB type for positional argument mapping
    const fbTypeName = this.getFBInvocationType(
      call.functionName,
      call.instance !== undefined,
    );
    const inputParamNames = fbTypeName
      ? this.fbInputParams.get(fbTypeName.toUpperCase())
      : undefined;

    // A function-block inout is bound to the caller's instance rather than
    // given a copy of it.
    const refInoutBind = fbTypeName
      ? this.fbRefInoutParams.get(fbTypeName.toUpperCase())
      : undefined;

    // Which parameter each argument fills. A named one says so; the rest take
    // the slots the named ones left, in declaration order.
    const slotOf = new Map<Argument, string>();
    const claimed = new Set<string>();
    for (const arg of filteredArgs) {
      if (arg.name) claimed.add(arg.name.toUpperCase());
    }
    const order =
      (fbTypeName
        ? this.fbParamOrder.get(fbTypeName.toUpperCase())
        : undefined) ??
      inputParamNames ??
      [];
    let nextSlot = 0;
    for (const arg of filteredArgs) {
      if (arg.name) {
        slotOf.set(arg, arg.name);
        continue;
      }
      while (nextSlot < order.length && claimed.has(order[nextSlot]!))
        nextSlot++;
      if (nextSlot >= order.length) continue;
      slotOf.set(arg, order[nextSlot]!);
      claimed.add(order[nextSlot]!);
      nextSlot++;
    }

    // An ARRAY[*] in-out bound to a shared global here (the block takes a
    // global lock, so the call cannot run under this one) views a copy that
    // is stored back after the call.
    const vlaGlobalCopies: Array<{ target: VariableExpression; tmp: string }> =
      [];
    const vlaParams = fbTypeName
      ? this.fbVlaInoutParams.get(fbTypeName.toUpperCase())
      : undefined;

    // Assign input parameters (named or positional)
    let positionalIndex = 0;
    for (const arg of filteredArgs) {
      if (arg.isOutput) continue;
      const paramName = slotOf.get(arg);
      const v = arg.value;

      if (
        paramName &&
        vlaParams?.has(paramName.toUpperCase()) === true &&
        v.kind === "VariableExpression" &&
        this.isGlobalAccess(v)
      ) {
        const tmp = `__gva${this.tempVarCounter++}`;
        this.emit(`${indent}auto ${tmp} = ${this.generateExpression(v)};`);
        this.emit(
          `${indent}${instanceName}.${this.fbParamMemberName(paramName, fbTypeName)} = ${tmp};`,
        );
        vlaGlobalCopies.push({ target: v, tmp });
      } else if (paramName && refInoutBind?.has(paramName.toUpperCase())) {
        this.emit(
          `${indent}${instanceName}.${this.fbParamMemberName(paramName, fbTypeName)} = ${this.generateAddressOf(arg.value)};`,
        );
      } else if (paramName && this.isOutputParam(fbTypeName, paramName)) {
        // An output filled positionally reads back after the call, not before.
        this.emit(
          `${indent}// WARNING: positional argument ${positionalIndex} could not be resolved`,
        );
        positionalIndex++;
      } else if (paramName) {
        this.emit(
          `${indent}${instanceName}.${this.fbParamMemberName(paramName, fbTypeName)} = ${this.generateArgumentValue(paramName, arg.value, fbTypeName)};`,
        );
        if (!arg.name) positionalIndex++;
      } else {
        // Positional argument without type info — emit as warning comment
        this.emit(
          `${indent}// WARNING: positional argument ${positionalIndex} could not be resolved`,
        );
        positionalIndex++;
      }
    }

    // Call the FB/program execution body, wrapped with EN/ENO logic.
    // Pass the FB instance's ENO field so source code can read
    // `inst.ENO` after the invocation and see the right value.
    this.emitEnEnoWrapper(
      indent,
      enExpr,
      enoVar,
      (bi) => {
        this.emitPOUCallLine(instanceName, call.functionName, bi);
      },
      `${instanceName}.ENO`,
    );

    for (const c of vlaGlobalCopies) {
      this.emitGlobalStore(
        c.target,
        this.globalRefOf(c.target.name)!,
        c.tmp,
        indent,
      );
    }

    // A value inout is stored by value and copied in before the call, so it has
    // to be copied back or the callee's writes are lost.
    const inoutParams = fbTypeName
      ? this.fbInoutParams.get(fbTypeName.toUpperCase())
      : undefined;
    const vlaInouts = fbTypeName
      ? this.fbVlaInoutParams.get(fbTypeName.toUpperCase())
      : undefined;
    const refInouts = fbTypeName
      ? this.fbRefInoutParams.get(fbTypeName.toUpperCase())
      : undefined;
    if (inoutParams && inoutParams.size > 0) {
      for (const arg of filteredArgs) {
        if (arg.isOutput) continue;
        const paramName = slotOf.get(arg);
        if (!paramName) continue;
        const upper = paramName.toUpperCase();
        // A variable-length parameter is a view onto the caller's own array,
        // so the callee's writes already landed there. Copying back would
        // assign an ArrayView to the array it points at: no such conversion,
        // and a self-assignment if there were.
        if (vlaInouts?.has(upper)) continue;
        // A function-block inout is a pointer at the caller's own instance, so
        // the callee wrote there directly.
        if (refInouts?.has(upper)) continue;
        if (inoutParams.has(upper)) {
          this.emitCaptureToLvalue(
            arg.value,
            `${instanceName}.${this.fbParamMemberName(paramName, fbTypeName)}`,
            indent,
          );
        }
      }
    }

    // Capture output arguments (=> syntax), excluding ENO (already handled)
    for (const arg of filteredArgs) {
      if (arg.name && arg.isOutput) {
        this.emitCaptureToLvalue(
          arg.value,
          `${instanceName}.${this.fbParamMemberName(arg.name, fbTypeName)}`,
          indent,
        );
      }
    }
  }

  /** Which parameter each argument of a call of `fbTypeName` fills: a named
   *  one says so; the rest take the slots left, in declaration order. */
  private fbArgSlots(
    args: Argument[],
    fbTypeName: string | undefined,
  ): Map<Argument, string> {
    const fbUpper = fbTypeName?.toUpperCase();
    const slotOf = new Map<Argument, string>();
    const claimed = new Set<string>();
    for (const arg of args) {
      if (arg.name) claimed.add(arg.name.toUpperCase());
    }
    const order =
      (fbUpper !== undefined
        ? (this.fbParamOrder.get(fbUpper) ?? this.fbInputParams.get(fbUpper))
        : undefined) ?? [];
    let nextSlot = 0;
    for (const arg of args) {
      if (arg.name) {
        slotOf.set(arg, arg.name);
        continue;
      }
      while (nextSlot < order.length && claimed.has(order[nextSlot]!))
        nextSlot++;
      if (nextSlot >= order.length) continue;
      slotOf.set(arg, order[nextSlot]!);
      claimed.add(order[nextSlot]!);
      nextSlot++;
    }
    return slotOf;
  }

  /** The first argument of an FB call that binds an in-out to a shared
   *  global (the global or a part of it), as that global's access path. */
  private fbInoutBoundGlobal(
    call: FunctionCallExpression,
    fbTypeName: string | undefined,
  ): VariableExpression | undefined {
    if (fbTypeName === undefined) return undefined;
    const inouts = this.fbInoutParams.get(fbTypeName.toUpperCase());
    const refs = this.fbRefInoutParams.get(fbTypeName.toUpperCase());
    const slots = this.fbArgSlots(call.arguments, fbTypeName);
    for (const arg of call.arguments) {
      if (arg.isOutput) continue;
      const slot = slots.get(arg)?.toUpperCase();
      if (slot === undefined) continue;
      if (inouts?.has(slot) !== true && refs?.has(slot) !== true) continue;
      if (
        arg.value.kind === "VariableExpression" &&
        this.isGlobalAccess(arg.value) &&
        this.splitBitTarget(arg.value).part === undefined
      ) {
        return arg.value;
      }
    }
    return undefined;
  }

  /**
   * Call of a function block under one shared global's lock (`lockUpper`):
   * an instance held in that global (`instance` is its access path), or a
   * local instance (`instance` is its C++) with an in-out bound into it.
   * In-outs bound into the locked global use its own storage: an ARRAY[*] or
   * block in-out points at it, a value in-out is copied in and back inside the
   * lock. Inputs and other lock-taking arguments are evaluated before the
   * lock; outputs, ENO and in-outs bound elsewhere go through temporaries
   * stored after the release, so no other global's lock is taken inside.
   */
  private generateLockedFBInvocation(
    call: FunctionCallExpression,
    lockUpper: string,
    ref: GlobalRef,
    instance: VariableExpression | string,
    fbTypeName: string | undefined,
    indent: string,
  ): void {
    if (fbTypeName === undefined) {
      throw new Error(
        `Internal error: no function block type for the call of '${call.functionName}'.`,
      );
    }
    let enArg: Expression | undefined;
    let enoTarget: Expression | undefined;
    const args: Argument[] = [];
    for (const arg of call.arguments) {
      const n = arg.name?.toUpperCase();
      if (n === "EN" && !arg.isOutput) enArg = arg.value;
      else if (n === "ENO" && arg.isOutput) enoTarget = arg.value;
      else args.push(arg);
    }

    const value = (
      e: Expression,
      code = this.generateExpression(e),
    ): string => {
      if (!this.mayTakeLock(e)) return code;
      const tmp = `__gfa${this.tempVarCounter++}`;
      this.emit(`${indent}auto ${tmp} = ${code};`);
      return tmp;
    };

    const fbUpper = fbTypeName.toUpperCase();
    const inoutParams = this.fbInoutParams.get(fbUpper);
    const vlaInouts = this.fbVlaInoutParams.get(fbUpper);
    const refInouts = this.fbRefInoutParams.get(fbUpper);
    const slotOf = this.fbArgSlots(args, fbTypeName);

    const inputs: Array<{ member: string; code: string }> = [];
    // Value in-outs copied back inside the lock, and arguments whose in-out
    // needs no copy back after it.
    const lockedBack: Array<{ lv: string; member: string }> = [];
    const settled = new Set<Argument>();
    // ARRAY[*] in-outs bound to another global: a copy, stored back after.
    const afterStores: Array<{ target: VariableExpression; tmp: string }> = [];
    let positionalIndex = 0;
    for (const arg of args) {
      if (arg.isOutput) continue;
      const paramName = slotOf.get(arg);
      const upper = paramName?.toUpperCase();
      const isRef = upper !== undefined && refInouts?.has(upper) === true;
      const isVla = upper !== undefined && vlaInouts?.has(upper) === true;
      const isInout =
        isRef ||
        isVla ||
        (upper !== undefined && inoutParams?.has(upper) === true);
      const v = arg.value;
      const global =
        v.kind === "VariableExpression" && this.isGlobalAccess(v)
          ? v
          : undefined;
      if (
        paramName &&
        isInout &&
        global?.name.toUpperCase() === lockUpper &&
        this.splitBitTarget(global).part === undefined
      ) {
        const lv = this.renderUnderLock(lockUpper, indent, () =>
          this.renderAccessTail("(*__glk)", global, lockUpper),
        );
        const member = this.fbParamMemberName(paramName, fbTypeName);
        inputs.push({ member, code: isRef ? `&${lv}` : lv });
        if (!isRef && !isVla) lockedBack.push({ lv, member });
        settled.add(arg);
      } else if (paramName && isRef) {
        // A function-block inout is bound to the caller's instance.
        inputs.push({
          member: this.fbParamMemberName(paramName, fbTypeName),
          code: this.generateAddressOf(v),
        });
      } else if (paramName && isVla && global) {
        const tmp = `__gfa${this.tempVarCounter++}`;
        this.emit(`${indent}auto ${tmp} = ${this.generateExpression(v)};`);
        inputs.push({
          member: this.fbParamMemberName(paramName, fbTypeName),
          code: tmp,
        });
        afterStores.push({ target: global, tmp });
        settled.add(arg);
      } else if (paramName && isInout && !global && this.mayTakeLock(v)) {
        // An index takes a lock: address the argument before the lock.
        const ptr = `__gfp${this.tempVarCounter++}`;
        this.emit(`${indent}auto* ${ptr} = &(${this.generateExpression(v)});`);
        const member = this.fbParamMemberName(paramName, fbTypeName);
        inputs.push({ member, code: `(*${ptr})` });
        if (!isVla) lockedBack.push({ lv: `(*${ptr})`, member });
        settled.add(arg);
      } else if (paramName && !this.isOutputParam(fbTypeName, paramName)) {
        // An input reading the locked global reads it inside the lock, so the
        // call sees one consistent state of it.
        const code =
          this.genericParamType(fbTypeName, paramName) === undefined &&
          this.expressionUsesRoot(v, lockUpper)
            ? this.renderUnderLock(lockUpper, indent, () =>
                this.generateExpression(v),
              )
            : value(v, this.generateArgumentValue(paramName, v, fbTypeName));
        inputs.push({
          member: this.fbParamMemberName(paramName, fbTypeName),
          code,
        });
        if (!arg.name) positionalIndex++;
      } else {
        this.emit(
          `${indent}// WARNING: positional argument ${positionalIndex} could not be resolved`,
        );
        positionalIndex++;
      }
    }
    const en = enArg !== undefined ? value(enArg) : null;

    // Values read out under the lock, stored to the caller's variables after.
    // A variable-length or function-block inout already wrote to the caller's
    // own storage, so it is not copied back.
    const fbCpp = this.mapVarTypeToCpp(fbTypeName);
    const captures: Array<{ tmp: string; member: string; target: Expression }> =
      [];
    for (const arg of args) {
      if (settled.has(arg)) continue;
      let paramName: string | undefined;
      if (arg.isOutput) {
        paramName = arg.name;
      } else {
        const slot = slotOf.get(arg);
        const upper = slot?.toUpperCase();
        if (
          upper !== undefined &&
          inoutParams?.has(upper) === true &&
          vlaInouts?.has(upper) !== true &&
          refInouts?.has(upper) !== true
        ) {
          paramName = slot;
        }
      }
      if (paramName === undefined) continue;
      captures.push({
        tmp: `__gfo${this.tempVarCounter++}`,
        member: this.fbParamMemberName(paramName, fbTypeName),
        target: arg.value,
      });
    }
    if (enoTarget !== undefined) {
      captures.push({
        tmp: `__gfo${this.tempVarCounter++}`,
        member: "ENO",
        target: enoTarget,
      });
    }
    for (const c of captures) {
      this.emit(`${indent}decltype(${fbCpp}::${c.member}) ${c.tmp};`);
    }

    let target: string;
    if (typeof instance === "string") {
      target = instance;
    } else {
      target = this.renderUnderLock(lockUpper, indent, () =>
        this.renderAccessTail("(*__glk)", instance, lockUpper),
      );
    }
    const inner = indent + this.options.indent;
    this.emit(`${indent}${ref.acc}with_lock([&](auto* __glk){`);
    this.emit(`${inner}auto& __fbi = ${target};`);
    for (const input of inputs) {
      this.emit(`${inner}__fbi.${input.member} = ${input.code};`);
    }
    this.emitEnEnoWrapper(
      inner,
      en,
      null,
      (bi) => {
        this.emitPOUCallLine("__fbi", call.functionName, bi);
      },
      "__fbi.ENO",
    );
    for (const b of lockedBack) {
      this.emit(`${inner}${b.lv} = __fbi.${b.member};`);
    }
    for (const c of captures) {
      this.emit(`${inner}${c.tmp} = __fbi.${c.member};`);
    }
    this.emit(`${indent}});`);
    for (const st of afterStores) {
      this.emitGlobalStore(
        st.target,
        this.globalRefOf(st.target.name)!,
        st.tmp,
        indent,
      );
    }
    for (const c of captures) {
      this.emitCaptureToLvalue(c.target, c.tmp, indent);
    }
  }

  /**
   * Emit `<target> = <source>` where `source` is an already-rendered C++
   * expression that takes no lock. A shared-global target is stored under its
   * lock (`write()` / with_lock). Used for FB VAR_IN_OUT copy-back and `=>`
   * output capture.
   */
  private emitCaptureToLvalue(
    target: Expression,
    source: string,
    indent: string,
  ): void {
    if (target.kind === "VariableExpression" && this.isGlobalAccess(target)) {
      this.emitGlobalStore(
        target,
        this.globalRefOf(target.name)!,
        source,
        indent,
      );
      return;
    }
    this.emit(`${indent}${this.generateExpression(target)} = ${source};`);
  }

  /**
   * Collect all interface method names (UPPER case) for a FB's IMPLEMENTS list.
   */
  protected getInterfaceMethodNames(fb: {
    implements?: string[];
  }): Set<string> {
    const result = new Set<string>();
    if (!fb.implements) return result;
    for (const ifaceName of fb.implements) {
      const methods = this.interfaceMethodsByInterface.get(
        ifaceName.toUpperCase(),
      );
      if (methods) {
        for (const m of methods) result.add(m);
      }
    }
    return result;
  }

  /**
   * If a member variable name collides with its C++ type name or an interface
   * method name (case-insensitive), append '_' to avoid C++ errors.
   * Populates memberMangledNames map and returns the (possibly mangled) name.
   */
  private mangleMemberIfNeeded(name: string, stTypeName: string): string {
    // Declaring a member of the FB currently being generated, so the interface
    // methods in scope are that FB's.
    const mangled = mangledMemberName(name, stTypeName, {
      isUserDefinedType: (t) => this.isUserDefinedType(t),
      interfaceMethods: this.currentFBInterfaceMethods,
    });
    if (mangled !== name) {
      this.memberMangledNames.set(name.toUpperCase(), mangled);
    }
    return mangled;
  }

  /**
   * C++ member name for a parameter of the function block being invoked, by the
   * same rule its declaration used (see member-mangling.ts).
   *
   * An FB whose input is named after its own type, or after an interface method
   * it implements, is declared with a trailing underscore — so assigning through
   * the bare name reaches a member that does not exist. Left alone when the FB
   * type is unknown, which only disables the check.
   */
  private fbParamMemberName(
    paramName: string,
    fbTypeName: string | undefined,
  ): string {
    if (fbTypeName === undefined) return paramName;
    return this.needsFieldMangling(
      paramName,
      this.resolveMemberType(fbTypeName, paramName),
      fbTypeName,
    )
      ? `${paramName}_`
      : paramName;
  }

  /**
   * Check if a field access needs mangling — true when the field name collides
   * with its type name (GCC -Wchanges-meaning) or with an interface method name.
   *
   * Reaching a member through a named owner rather than from inside it, so the
   * interface methods come from that owner's entry.
   */
  protected needsFieldMangling(
    fieldName: string,
    fieldTypeName: string | undefined,
    parentTypeName?: string,
  ): boolean {
    return needsMemberMangling(fieldName, fieldTypeName, {
      isUserDefinedType: (t) => this.isUserDefinedType(t),
      interfaceMethods:
        parentTypeName !== undefined
          ? this.fbInterfaceMethodNames.get(parentTypeName.toUpperCase())
          : undefined,
    });
  }

  /**
   * Resolve the base name for a variable. Subclasses can override to add
   * prefixes (e.g., "s." for SETUP variables in test codegen).
   */
  protected resolveVariableBaseName(name: string): string {
    return name;
  }

  /** Whether a parameter is one of the block's outputs. */
  private isOutputParam(
    fbTypeName: string | undefined,
    paramName: string,
  ): boolean {
    if (!fbTypeName) return false;
    const key = fbTypeName.toUpperCase();
    const upper = paramName.toUpperCase();
    if (!this.fbParamOrder.get(key)?.includes(upper)) return false;
    return (
      !this.fbInputParams.get(key)?.includes(upper) &&
      !this.fbInoutParams.get(key)?.has(upper)
    );
  }

  /**
   * The C++ name an FB instance is reached by — a dereference when the instance
   * is an FB-typed inout, which is held as a pointer.
   */
  private instanceBaseName(name: string): string {
    const raw = this.resolveVariableBaseName(name);
    const upper = raw.toUpperCase();
    // A shared global is held behind a pointer, so reach its value.
    const ref = this.globalRefOf(name);
    if (ref) return `${ref.acc}value`;
    const member = this.memberMangledNames.get(upper) ?? raw;
    return this.currentRefInouts.has(upper) ? `(*${member})` : member;
  }

  /**
   * The instance a call names, when it is written as a dotted path. Built as a
   * variable access so member mangling and the shared-global holder are
   * rendered the same way they are everywhere else.
   */
  private dottedInstanceName(name: string, span: SourceSpan): string {
    const parts = name.split(".");
    const head = parts[0]!;
    const expr: VariableExpression = {
      kind: "VariableExpression",
      sourceSpan: span,
      name: head,
      subscripts: [],
      fieldAccess: parts.slice(1),
      isDereference: false,
    };
    return this.renderAccessTail(
      this.instanceBaseName(head),
      expr,
      head.toUpperCase(),
    );
  }

  /**
   * Emit the call line for a POU (FB or program) invocation.
   * Subclasses can override the call pattern (e.g. ".run()" for programs).
   */
  /**
   * What to assign to one FB input member: the argument itself, or a
   * descriptor addressing it when the parameter was declared generic.
   */
  private generateArgumentValue(
    paramName: string,
    value: Expression,
    fbTypeName: string | undefined,
  ): string {
    if (this.genericParamType(fbTypeName, paramName)) {
      const descriptor = this.generateAnyDescriptor(value);
      if (descriptor) return descriptor;
    }
    return this.generateExpression(value);
  }

  /**
   * A descriptor for an argument filling a generic parameter, or undefined
   * when the parameter is not generic.
   */
  private generateGenericArgument(
    generics: Map<string, string> | undefined,
    paramName: string | undefined,
    value: Expression,
  ): string | undefined {
    if (!generics || !paramName) return undefined;
    if (!generics.has(paramName.toUpperCase())) return undefined;
    return this.generateAnyDescriptor(value);
  }

  /** Record that one FB parameter was declared with a generic type. */
  private noteGenericParam(
    fbUpper: string,
    paramName: string,
    genericType: string,
  ): void {
    let params = this.fbGenericParams.get(fbUpper);
    if (!params) {
      params = new Map();
      this.fbGenericParams.set(fbUpper, params);
    }
    params.set(paramName.toUpperCase(), genericType.toUpperCase());
  }

  /** The generic type a parameter was declared with, or undefined. */
  private genericParamType(
    fbTypeName: string | undefined,
    paramName: string,
  ): string | undefined {
    if (!fbTypeName) return undefined;
    return this.fbGenericParams
      .get(fbTypeName.toUpperCase())
      ?.get(paramName.toUpperCase());
  }

  /**
   * `__VARINFO(x)` — CODESYS's `__SYSTEM.VAR_INFO` for one named variable.
   *
   * Resolved at the call site, like the `ANY` descriptor: only codegen knows
   * the IEC type name, and a trait keyed on the C++ payload could not tell
   * `BYTE` from `USINT`. `AREA` -1, `BITADDRESS` 0, `BITNR` -1, `BYTEOFFSET`
   * 0 — see iec_varinfo.hpp.
   */
  private generateVarInfo(expr: Expression): string | undefined {
    const declaredType = this.inferExprType(expr);
    if (declaredType === undefined || declaredType === "") return undefined;

    const value = this.generateAliasLvalue(expr);
    const typeName = this.cppNameLiteral(
      this.declaredTypeDisplayName(declaredType),
    );

    // A POINTER TO / REF_TO / REFERENCE TO variable is an ADDRESS, not a value
    // of the type it points at. `inferExprType` reports the target, so a
    // `POINTER TO INT` claimed TYPE_INT without this.
    const refKind =
      expr.kind === "VariableExpression"
        ? this.currentScopeVarRefKinds.get(expr.name.toUpperCase())
        : undefined;
    if (refKind !== undefined) {
      const cls = refKind === "pointer_to" ? "TYPE_POINTER" : "TYPE_REFERENCE";
      // The type NAME has to say it is a pointer too. `inferExprType` reports
      // the target, so "INT" alone would read as an INT beside a
      // TYPE_POINTER class — two fields telling different stories.
      const refName = this.cppNameLiteral(
        `${refKind === "pointer_to" ? "POINTER TO" : "REFERENCE TO"} ` +
          this.declaredTypeDisplayName(declaredType),
      );
      return (
        `strucpp::VAR_INFO{ reinterpret_cast<uintptr_t>(&${value}), 0, -1, -1, ` +
        `static_cast<int16_t>(sizeof(${value}) * 8), 0, ` +
        `strucpp::TYPE_CLASS::${cls}, ${refName}, 0, ` +
        `strucpp::TYPE_CLASS::${cls}, ` +
        `static_cast<uint32_t>(sizeof(${value}) * 8) }`
      );
    }

    // An array, inline (`__INLINE_ARRAY_*`) or declared as its own TYPE. The
    // named case only became reachable once the classifier was shared: before
    // that, an ARRAY declared as a TYPE reported TYPE_USERDEF with no count.
    const element =
      arrayElementTypeName(declaredType) ??
      this.typeClassifier.namedArrayElement(declaredType)?.name;
    if (element !== undefined) {
      const payload = this.typeCodeGen.mapTypeToCpp(element);
      const elem = this.typeClassifier.classify(element);
      const base =
        elem === undefined
          ? "strucpp::TYPE_CLASS::TYPE_USERDEF"
          : `strucpp::TYPE_CLASS::${elem.typeClass}`;
      return (
        `strucpp::VAR_INFO{ reinterpret_cast<uintptr_t>(${value}.elements()), 0, -1, -1, ` +
        `static_cast<int16_t>(sizeof(${value}) * 8), 0, ` +
        `strucpp::TYPE_CLASS::TYPE_ARRAY, ${typeName}, ` +
        `static_cast<uint32_t>(${value}.element_count()), ${base}, ` +
        `static_cast<uint32_t>(sizeof(${payload}) * 8) }`
      );
    }

    // `__XWORD` has no single TYPE_CLASS enumerator — its width is the
    // target's pointer width. Choosing with `sizeof` is right on a 32-bit
    // controller and a 64-bit runtime alike, and stays a constant expression.
    if (declaredType.toUpperCase() === "__XWORD") {
      const cls =
        "(sizeof(strucpp::XWORD_t) == 8 ? strucpp::TYPE_CLASS::TYPE_LWORD" +
        " : sizeof(strucpp::XWORD_t) == 4 ? strucpp::TYPE_CLASS::TYPE_DWORD" +
        " : strucpp::TYPE_CLASS::TYPE_WORD)";
      return (
        `strucpp::VAR_INFO{ reinterpret_cast<uintptr_t>(&${value}), 0, -1, -1, ` +
        `static_cast<int16_t>(strucpp::IEC_SIZEOF(${value}) * 8), 0, ` +
        `${cls}, ${typeName}, 0, ${cls}, ` +
        `static_cast<uint32_t>(strucpp::IEC_SIZEOF(${value}) * 8) }`
      );
    }

    // The address comes from `&`, not `raw_ptr()`: an alias or subrange in a
    // POU is declared RAW (`INT_t A;`) and has no `raw_ptr()`. iec_var.hpp
    // pins `&x` and `x.raw_ptr()` to one address, so `&` serves both.
    const resolved = this.typeClassifier.classify(declaredType);
    if (resolved !== undefined && resolved.nestedStruct === undefined) {
      // An elementary type, an alias or subrange of one, or an enumeration:
      // each has its own payload pointer.
      return (
        `strucpp::VAR_INFO{ reinterpret_cast<uintptr_t>(&${value}), 0, -1, -1, ` +
        `static_cast<int16_t>(strucpp::IEC_SIZEOF(${value}) * 8), 0, ` +
        `strucpp::TYPE_CLASS::${resolved.typeClass}, ${typeName}, 0, ` +
        `strucpp::TYPE_CLASS::${resolved.typeClass}, ` +
        `static_cast<uint32_t>(strucpp::IEC_SIZEOF(${value}) * 8) }`
      );
    }

    if (this.isUserDefinedType(declaredType)) {
      // CODESYS reports TYPE_USERDEF for a DUT and a function block instance
      // alike; a structure is addressed whole, with no payload pointer.
      return (
        `strucpp::VAR_INFO{ reinterpret_cast<uintptr_t>(&${value}), 0, -1, -1, ` +
        `static_cast<int16_t>(sizeof(${value}) * 8), 0, ` +
        `strucpp::TYPE_CLASS::TYPE_USERDEF, ${typeName}, 0, ` +
        `strucpp::TYPE_CLASS::TYPE_USERDEF, ` +
        `static_cast<uint32_t>(sizeof(${value}) * 8) }`
      );
    }
    return undefined;
  }

  /**
   * `&<TYPE>__TYPEDESC` for a struct that has a layout table, else `nullptr`.
   *
   * Only a STRUCT gets one. IEC 61131-3 §6.4.3 scopes ANY_DERIVED to the DATA
   * types of Table 11 and an FB is a POU, and a generated FB class may carry a
   * vptr or an EXTENDS base subobject, where `offsetof` is unanswerable.
   */
  /**
   * Queue a `sync_strings()` for a struct that carries a string member.
   *
   * The scalar case one branch up, one level deeper: writing a STRING MEMBER
   * through the descriptor writes characters and leaves the cached length as
   * it was. Skipped when the struct holds no strings; one call however many it
   * holds, since the walk is the runtime's.
   */
  private noteStructStringSync(value: string, typeName: string): void {
    if (!this.structHoldsString(typeName)) return;
    this.pendingStringSyncs.push(
      `strucpp::sync_strings(&${value}, &${typeName}__TYPEDESC);`,
    );
  }

  /** Whether a STRUCT has a STRING or WSTRING anywhere beneath it. */
  private structHoldsString(typeName: string, depth = 0): boolean {
    if (depth > 16) return false; // a cycle; the analyzer reports it
    const def = this.structDefs.get(typeName.toUpperCase());
    if (!def) return false;
    for (const field of def.fields) {
      const names = [
        field.type.name,
        ...(field.type.elementTypeName !== undefined
          ? [field.type.elementTypeName]
          : []),
      ];
      for (const name of names) {
        const upper = name.toUpperCase();
        if (upper === "STRING" || upper === "WSTRING") return true;
        if (this.structHoldsString(name, depth + 1)) return true;
      }
    }
    return false;
  }

  /**
   * The argument as declared: "Plant", "motor.speedRpm", "profile[2]".
   *
   * Rebuilt from the AST, not sliced from the source, which would carry
   * whatever sat between the tokens. A non-constant subscript renders `[*]`.
   */
  private argumentSourceName(expr: Expression): string | undefined {
    if (expr.kind !== "VariableExpression") return undefined;
    const v = expr;
    // The DECLARATION's spelling, not the call site's. `Plant.spPressureAlt`
    // and `PLANT.SPPRESSUREALT` are one variable to IEC 61131-3 §6.1.2, so
    // taking the call site would report one variable under two spellings
    // depending on how the pin happened to be typed.
    let cursorType = this.currentScopeVarTypes.get(v.name.toUpperCase());
    let text =
      this.currentScopeDeclaredNames.get(v.name.toUpperCase()) ??
      v.name.toUpperCase();

    const renderIndex = (e: Expression): string =>
      e.kind === "LiteralExpression" ? String(e.value) : "*";

    /** Step into a member, returning its declared spelling and its type. */
    const field = (name: string): string => {
      const def =
        cursorType === undefined
          ? undefined
          : this.structDefs.get(cursorType.toUpperCase());
      const upper = name.toUpperCase();
      for (const decl of def?.fields ?? []) {
        const i = decl.names.findIndex((n) => n.toUpperCase() === upper);
        if (i === -1) continue;
        cursorType = decl.type.name;
        return decl.declaredNames?.[i] ?? decl.names[i]!;
      }
      // A function block member, or a type this pass never saw laid out.
      // Folded is the only spelling on hand, and it still names the member.
      cursorType = undefined;
      return upper;
    };

    if (v.accessChain !== undefined && v.accessChain.length > 0) {
      for (const step of v.accessChain) {
        if (step.kind === "field") text += `.${field(step.name)}`;
        else if (step.kind === "subscript") {
          text += `[${step.indices.map(renderIndex).join(",")}]`;
        } else text += "^";
      }
      return text;
    }
    // Older AST shape: subscripts then fields, which is the order the parser
    // produced before accessChain preserved the interleaving.
    if (v.subscripts.length > 0) {
      text += `[${v.subscripts.map(renderIndex).join(",")}]`;
    }
    for (const f of v.fieldAccess) text += `.${field(f)}`;
    return text;
  }

  /** A C++ string literal, or `nullptr` when there is nothing to say. */
  private cppNameLiteral(text: string | undefined): string {
    if (text === undefined || text === "") return "nullptr";
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }

  /**
   * `NAME` and `TYPENAME` for a generic argument, as a trailing field list.
   *
   * Emitted for every argument kind, not just a struct: a scalar wired to an
   * `ANY` pin is otherwise anonymous, and a block that has to name what it was
   * handed has nothing to name it with.
   */
  private anyIdentityFields(expr: Expression, declaredType: string): string {
    return (
      `${this.cppNameLiteral(this.argumentSourceName(expr))}, ` +
      `${this.cppNameLiteral(this.declaredTypeDisplayName(declaredType))}`
    );
  }

  /**
   * The declared type as an engineer would write it.
   *
   * An inline or variable-length array carries a synthetic name
   * (`__INLINE_ARRAY_INT`, `__VLA_1D_WORD`) that means nothing to a callee
   * reading `TYPENAME`, so it renders back into `ARRAY OF INT`.
   */
  private declaredTypeDisplayName(declaredType: string): string {
    const element = arrayElementTypeName(declaredType);
    const name = element ?? declaredType;
    const declared = this.typeClassifier.declaredTypeName(name);
    // `declaredTypeName` returns its argument untouched for a name with no
    // TYPE declaration — an elementary type, a word of the standard's grammar
    // (IEC 61131-3 Table 10). Those stay folded, as CODESYS reports them.
    const shown = declared === name ? name.toUpperCase() : declared;
    return element === undefined ? shown : `ARRAY OF ${shown}`;
  }

  private typeDescriptorArg(typeName: string | undefined): string {
    if (typeName === undefined || typeName === "") return "nullptr";
    const upper = typeName.toUpperCase();
    if (!this.knownStructTypes.has(upper)) return "nullptr";
    if (!this.describedStructTypes.has(upper)) return "nullptr";
    return `&${typeName}__TYPEDESC`;
  }

  /**
   * The `IEC_ANY` descriptor for an argument bound to a generic parameter.
   *
   * Three fields, as CODESYS defines them: `typeclass` from the DECLARED type
   * (the C++ payload cannot tell `BYTE` from `USINT`), `pvalue` from
   * `raw_ptr()` (the payload, which `force()` keeps current), `diSize` from
   * `IEC_SIZEOF`. Undefined for a type no generic accepts.
   */
  private generateAnyDescriptor(expr: Expression): string | undefined {
    const declaredType = this.inferExprType(expr);
    if (!declaredType) return undefined;

    // An IEC_ANY aliases its operand: it hands the callee a pointer the
    // callee keeps. So the operand has to name the storage, not a read of it
    // — see generateAliasLvalue.
    const value = this.generateAliasLvalue(expr);
    const element = arrayElementTypeName(declaredType);
    if (element) {
      return this.anyDescriptorForArray(
        value,
        element,
        this.anyIdentityFields(expr, declaredType),
      );
    }

    const typeClass = TYPE_CLASS_BY_IEC_TYPE[declaredType.toUpperCase()];
    if (typeClass) {
      if (typeClass === "TYPE_STRING" || typeClass === "TYPE_WSTRING") {
        // The characters travel through raw_ptr(); the cached length does not.
        this.pendingStringSyncs.push(`${value}.sync_length();`);
      }
      return (
        `strucpp::IEC_ANY{ strucpp::TYPE_CLASS::${typeClass}, ` +
        `reinterpret_cast<uint8_t*>(${value}.raw_ptr()), ` +
        `static_cast<int32_t>(strucpp::IEC_SIZEOF(${value})), 1, ` +
        `static_cast<int32_t>(sizeof(${value})), ` +
        `strucpp::TYPE_CLASS::${typeClass}, nullptr, ` +
        `${this.anyIdentityFields(expr, declaredType)} }`
      );
    }

    // A structure is TYPE_USERDEF and addressed whole; an enumeration is
    // TYPE_ENUM and has a payload pointer.
    if (this.isUserDefinedType(declaredType)) {
      const isEnum = this.enumTypeMembers.has(declaredType.toUpperCase());
      const cls = isEnum ? "TYPE_ENUM" : "TYPE_USERDEF";
      const ptr = isEnum
        ? `reinterpret_cast<uint8_t*>(${value}.raw_ptr())`
        : `reinterpret_cast<uint8_t*>(&${value})`;
      const size = isEnum
        ? `static_cast<int32_t>(strucpp::IEC_SIZEOF(${value}))`
        : `static_cast<int32_t>(sizeof(${value}))`;
      // An enumeration has no members to describe; a structure does.
      const desc = isEnum ? "nullptr" : this.typeDescriptorArg(declaredType);
      if (desc !== "nullptr") this.noteStructStringSync(value, declaredType);
      return (
        `strucpp::IEC_ANY{ strucpp::TYPE_CLASS::${cls}, ${ptr}, ${size}, 1, ` +
        `static_cast<int32_t>(sizeof(${value})), strucpp::TYPE_CLASS::${cls}, ` +
        `${desc}, ${this.anyIdentityFields(expr, declaredType)} }`
      );
    }
    return undefined;
  }

  /**
   * The descriptor for an array argument: `TYPE_ARRAY` whatever the elements
   * are, `DISIZE` the payload packed, `DISTRIDE` the wrapper's width.
   */
  private anyDescriptorForArray(
    value: string,
    elementTypeName: string,
    identity = "nullptr, nullptr",
  ): string {
    const payload = this.typeCodeGen.mapTypeToCpp(elementTypeName);
    const wrapper = this.typeCodeGen.mapStructFieldTypeToCpp(elementTypeName);
    const count = `static_cast<int32_t>(${value}.element_count())`;
    const elementClass = TYPE_CLASS_BY_IEC_TYPE[elementTypeName.toUpperCase()];
    const base = elementClass
      ? `reinterpret_cast<uint8_t*>(${value}.elements()->raw_ptr())`
      : `reinterpret_cast<uint8_t*>(${value}.elements())`;
    // The element's class is known here and nowhere downstream: TYPECLASS says
    // only TYPE_ARRAY, and the width cannot separate WORD from UINT.
    const elemClass = elementClass
      ? `strucpp::TYPE_CLASS::${elementClass}`
      : this.enumTypeMembers.has(elementTypeName.toUpperCase())
        ? "strucpp::TYPE_CLASS::TYPE_ENUM"
        : "strucpp::TYPE_CLASS::TYPE_USERDEF";
    // For an array of structures the layout that matters is the ELEMENT's —
    // DICOUNT and DISTRIDE already say how to step between them.
    const desc = this.typeDescriptorArg(elementTypeName);
    return (
      `strucpp::IEC_ANY{ strucpp::TYPE_CLASS::TYPE_ARRAY, ${base}, ` +
      `static_cast<int32_t>(${value}.element_count() * sizeof(${payload})), ` +
      `${count}, static_cast<int32_t>(sizeof(${wrapper})), ${elemClass}, ` +
      `${desc}, ${identity} }`
    );
  }

  protected emitPOUCallLine(
    instanceName: string,
    _rawName: string,
    indent: string,
  ): void {
    this.emit(`${indent}${instanceName}();`);
  }

  /**
   * Initialiser for a project-model variable, or undefined when the member
   * should be left to its default constructor.
   *
   * Shared by the PROGRAM constructor initialiser lists and the file-scope
   * VAR_GLOBAL definitions so all three agree on how a declaration initialises.
   */
  private projectVarInitializer(
    decl: ProjectVarDeclaration,
  ): string | undefined {
    // References (REF_TO / REFERENCE TO) and pointers (POINTER TO) wrap a
    // pointer internally and must be default-constructed (unbound/null) —
    // `name(0)` is ambiguous for IEC_REF_TO, and also for IEC_Ptr, which has an
    // integer-address ctor (the `0` literal matches both the nullptr_t and the
    // uintptr_t overload). The default ctor sets the pointer to nullptr, which
    // is exactly the IEC default. References are bound later via REF= / :=
    // REF(); pointers via := ADR()/&.
    if (
      decl.referenceKind === "ref_to" ||
      decl.referenceKind === "reference_to" ||
      decl.referenceKind === "pointer_to"
    ) {
      return undefined;
    }
    if (decl.initialValue) {
      return this.generateInitializer(
        decl.initialValue,
        this.mapTypeRefToCpp(this.projectVarToTypeRef(decl)),
        decl.typeName,
      );
    }
    // Composite types (struct, enum, array, FB instance) report no default here
    // (empty string) and are skipped, so their own default constructor runs.
    const typeDefault = this.getTypeDefaultValue(decl.typeName);
    return typeDefault === "" ? undefined : typeDefault;
  }

  /**
   * Emit C++ for a declaration initialiser.
   *
   * Everything but a structure initializer is an ordinary expression;
   * `structure_initialization` additionally needs the target's C++ type, which
   * only the declaration site knows, so it routes through
   * {@link generateInitializerValue}.
   */
  protected generateInitializer(
    value: Expression,
    cppType: string,
    stTypeName: string | undefined,
  ): string {
    if (!isStructInitializerValue(value)) {
      return this.generateExpression(value);
    }
    return generateInitializerValue(
      value,
      cppType,
      stTypeName,
      this.getStructInitEmitter(),
    );
  }

  /**
   * Hooks {@link generateInitializerValue} uses to resolve element names and
   * nested element types. Reuses the same member-mangling and field-resolution
   * helpers the statement path uses, so `p.X` in a body and `X :=` in an
   * initializer always name the same C++ member.
   */
  private getStructInitEmitter(): StructInitEmitter {
    this.structInitEmitter ??= {
      emitValue: (value: Expression): string => this.generateExpression(value),
      memberName: (
        fieldName: string,
        ownerTypeName: string | undefined,
      ): string =>
        this.needsFieldMangling(
          fieldName,
          this.resolveMemberType(ownerTypeName, fieldName),
          ownerTypeName,
        )
          ? `${fieldName}_`
          : fieldName,
      fieldTypeName: (
        fieldName: string,
        ownerTypeName: string | undefined,
      ): string | undefined => this.resolveMemberType(ownerTypeName, fieldName),
      arrayElementTypeName: (
        typeName: string | undefined,
      ): string | undefined =>
        typeName !== undefined && typeName !== "" && this.ast
          ? resolveArrayElementTypeUtil(typeName, this.ast)
          : undefined,
    };
    return this.structInitEmitter;
  }

  /**
   * Value-initialisation for a type that has no declared initialiser.
   *
   * Returns an empty string for composite types (structs, enums, arrays, FB
   * instances), whose default constructor already does the right thing — the
   * callers use that to skip the member entirely in a constructor initialiser
   * list.
   */
  private getTypeDefaultValue(typeName: string): string {
    const upperType = typeName.toUpperCase();
    if (upperType === "BOOL") return "false";
    if (upperType === "REAL" || upperType === "LREAL") return "0.0";
    if (upperType === "STRING") return '""';
    if (upperType === "WSTRING") return 'u""';

    // Check if it's an elementary type that uses numeric default
    const numericTypes = [
      "SINT",
      "INT",
      "DINT",
      "LINT",
      "USINT",
      "UINT",
      "UDINT",
      "ULINT",
      "BYTE",
      "WORD",
      "DWORD",
      "LWORD",
      "TIME",
      "DATE",
      "TOD",
      "DT",
      "LTIME",
      "LDATE",
      "LTOD",
      "LDT",
      "CHAR",
      "WCHAR",
    ];
    if (numericTypes.includes(upperType)) {
      return "0";
    }

    // User-defined types (structs, enums, arrays, subranges, type aliases)
    // use default initialization - return empty string to skip in initializer list
    return "";
  }

  /**
   * Collect all program instances from a configuration.
   */
  private collectProgramInstances(
    config: ConfigurationDecl,
  ): Array<{ instanceName: string; programType: string; taskName?: string }> {
    const instances: Array<{
      instanceName: string;
      programType: string;
      taskName?: string;
    }> = [];
    for (const resource of config.resources) {
      for (const task of resource.tasks) {
        for (const inst of task.programInstances) {
          instances.push(inst);
        }
      }
    }
    return instances;
  }

  /**
   * Count total tasks in a configuration.
   */
  private countTasks(config: ConfigurationDecl): number {
    let count = 0;
    for (const resource of config.resources) {
      count += resource.tasks.length;
    }
    return count;
  }

  /**
   * Push the descriptor(s) one located declaration produces.
   *
   * A scalar produces one. An ARRAY produces one PER ELEMENT, walking the
   * address forward by one slot each time, so `AT %MW60 : ARRAY [0..66] OF
   * WORD` fills %MW60..%MW126 (openplc-editor#565). The runtime table is flat
   * and knows nothing about aggregates -- the expansion happens here so that
   * every consumer of `locatedVars[]` (the descriptor array, the count, the
   * per-program range, the located-globals list) gets the element-level view
   * without any of them having to understand arrays.
   *
   * Bit addresses advance across the byte boundary (%IX0.7 -> %IX1.0), which
   * is why the step is computed on the linearised index rather than on
   * `byteIndex` alone.
   *
   * `dims` is `undefined` for a non-array. The semantic analyzer has already
   * rejected the array shapes that cannot be laid out linearly (multi-
   * dimensional, non-constant bounds), so anything reaching here with bounds
   * is a single dimension with a known extent.
   */
  /**
   * The dimensions a located declaration actually has, resolving a NAMED
   * ARRAY type the way the semantic analyzer already does.
   *
   * The AST builder writes bounds onto the TypeReference only for an INLINE
   * `ARRAY [a..b] OF T`. A named type (`TYPE Buf : ARRAY [0..9] OF WORD`) has
   * none, so reading `decl.type.arrayDimensions` alone made codegen see a
   * scalar where the analyzer had seen ten slots: one descriptor was emitted
   * and the pointer initialiser called `.raw_ptr()` on the array itself, which
   * does not compile. Resolving by name here keeps the two passes agreeing.
   *
   * Answers `undefined` for anything that is not a single fixed dimension --
   * multi-dimensional and variable-length shapes are rejected in semantics and
   * never reach codegen, so this is a fallback rather than a second opinion.
   */
  private resolveLocatedDims(
    typeName: string,
    dims: Array<{ start: number; end: number }> | undefined,
  ): Array<{ start: number; end: number }> | undefined {
    if (dims && dims.length > 0) return dims;
    if (!this.ast) return undefined;

    const shape = resolveArrayShapeByName(typeName, this.ast);
    if (!shape || shape.dims.length !== 1) return undefined;

    const dim = shape.dims[0];
    return dim ? [dim] : undefined;
  }

  private pushLocatedDescriptors(
    varName: string,
    address: string,
    typeName: string,
    programName: string,
    dims: Array<{ start: number; end: number }> | undefined,
  ): void {
    const parsed = parseLocatedAddress(address);
    if (!parsed) return;

    const resolved = this.resolveLocatedDims(typeName, dims);
    const dim = resolved?.length === 1 ? resolved[0] : undefined;
    if (!dim) {
      this.locatedVars.push({
        varName,
        address,
        area: parsed.area,
        size: parsed.size,
        byteIndex: parsed.byteIndex,
        bitIndex: parsed.bitIndex,
        typeName,
        programName,
      });
      return;
    }

    const isBit = parsed.size === "Bit";
    const baseSlot = isBit
      ? parsed.byteIndex * 8 + parsed.bitIndex
      : parsed.byteIndex;

    for (let iecIndex = dim.start; iecIndex <= dim.end; iecIndex++) {
      const slot = baseSlot + (iecIndex - dim.start);
      this.locatedVars.push({
        varName,
        address,
        area: parsed.area,
        size: parsed.size,
        byteIndex: isBit ? Math.floor(slot / 8) : slot,
        bitIndex: isBit ? slot % 8 : 0,
        typeName,
        programName,
        elementIndex: iecIndex,
      });
    }
  }

  /**
   * Collect a located variable for descriptor array generation.
   */
  private collectLocatedVar(
    varName: string,
    decl: VarDeclaration,
    programName: string,
  ): void {
    if (!decl.address) return;

    this.pushLocatedDescriptors(
      varName,
      decl.address,
      decl.type.name,
      programName,
      // Inline `ARRAY [a..b] OF T`: the AST builder resolves the bounds onto
      // the TypeReference. A named ARRAY type carries none here and is
      // handled by the model path, which resolves the alias first.
      decl.type.arrayDimensions,
    );
  }

  /**
   * Collect a located variable from project model for descriptor array generation.
   */
  private collectLocatedVarFromModel(
    decl: {
      name: string;
      typeName: string;
      address?: string;
      // Explicit `| undefined` (not just `?`): exactOptionalPropertyTypes is
      // on, and callers forward an optional field straight through.
      arrayDimensions?: Array<{ start: number; end: number }> | undefined;
    },
    programName: string,
  ): void {
    if (!decl.address) return;

    this.pushLocatedDescriptors(
      decl.name,
      decl.address,
      decl.typeName,
      programName,
      decl.arrayDimensions,
    );
  }

  /**
   * Generate the located variables descriptor array in the header.
   */
  private generateLocatedVarsDeclaration(): void {
    // Library compilations (no PROGRAM, no CONFIGURATION — only FBs /
    // functions / types) must NOT emit these symbols, otherwise the
    // consumer's program would see two definitions when its preamble
    // includes the library. Top-level program builds always emit them so
    // the runtime sketch can reference `locatedVars` / `locatedVarsCount`
    // unconditionally — including when the user has zero `AT %...`
    // declarations (then we emit a 1-element placeholder array because
    // C++ disallows zero-length arrays at namespace scope; the sketch's
    // binding loop iterates `i < locatedVarsCount` so the placeholder is
    // never accessed at runtime).
    const hasPrograms =
      !!this.projectModel && this.projectModel.programs.size > 0;
    if (!hasPrograms) return;

    const isEmpty = this.locatedVars.length === 0;
    const arrayLen = isEmpty ? 1 : this.locatedVars.length;

    this.emitHeader(
      "// =============================================================================",
    );
    this.emitHeader("// Located Variables Descriptor Array");
    this.emitHeader(
      "// =============================================================================",
    );
    this.emitHeader("");
    this.emitHeader("/**");
    this.emitHeader(" * Located variable descriptors for runtime I/O binding.");
    this.emitHeader(
      " * The runtime iterates this array to bind variables to I/O image tables.",
    );
    this.emitHeader(" */");
    this.emitHeader("");

    // Forward declarations for program instances.
    //
    // One line per DECLARATION, not per descriptor: a located array expands to
    // one descriptor per element, and repeating the same "AT %MW60" line 67
    // times would bury the rest of the header in noise.
    const listed = new Set<string>();
    for (const locVar of this.locatedVars) {
      const scope =
        locVar.programName === "@config"
          ? "configuration"
          : `Program_${locVar.programName}`;
      const line = `// Forward: ${locVar.varName} AT ${locVar.address} in ${scope}`;
      if (listed.has(line)) continue;
      listed.add(line);
      this.emitHeader(line);
    }
    if (isEmpty) {
      this.emitHeader("// (no located variables — placeholder entry only)");
    }
    this.emitHeader("");

    // The actual array will be defined in the implementation file
    // and initialized in the constructor
    this.emitHeader(`extern LocatedVar locatedVars[${arrayLen}];`);
    this.emitHeader(
      `constexpr uint32_t locatedVarsCount = ${this.locatedVars.length};`,
    );
    this.emitHeader("");

    // Located CONFIGURATION VAR_GLOBALs — see generateLocatedGlobalsDefinition()
    // for why the scope has to be stated rather than inferred by the runtime.
    const globalCount = this.locatedVars.filter(
      (v) => v.programName === "@config",
    ).length;
    this.emitHeader("#ifdef STRUCPP_THREADED");
    this.emitHeader(
      `extern void *locatedGlobals[${globalCount === 0 ? 1 : globalCount}];`,
    );
    this.emitHeader(`constexpr uint32_t locatedGlobalsCount = ${globalCount};`);
    this.emitHeader("#endif");
    this.emitHeader("");
  }

  /**
   * Generate the located variables array definition in the implementation.
   */
  private generateLocatedVarsDefinition(): void {
    // Mirror the declaration's library-skip + placeholder logic.
    const hasPrograms =
      !!this.projectModel && this.projectModel.programs.size > 0;
    if (!hasPrograms) return;

    const isEmpty = this.locatedVars.length === 0;
    const arrayLen = isEmpty ? 1 : this.locatedVars.length;

    this.emit(
      "// =============================================================================",
    );
    this.emit("// Located Variables Descriptor Array");
    this.emit(
      "// =============================================================================",
    );
    this.emit("");
    this.emit(`LocatedVar locatedVars[${arrayLen}] = {`);

    if (isEmpty) {
      this.emit(
        `    { LocatedArea::Input, LocatedSize::Bit, 0, 0, {0, 0, 0}, nullptr }  // placeholder; locatedVarsCount is 0`,
      );
    } else {
      for (let i = 0; i < this.locatedVars.length; i++) {
        const locVar = this.locatedVars[i]!;
        const comma = i < this.locatedVars.length - 1 ? "," : "";
        this.emit(
          `    { LocatedArea::${locVar.area}, LocatedSize::${locVar.size}, ` +
            `${locVar.byteIndex}, ${locVar.bitIndex}, {0, 0, 0}, nullptr }${comma}  // ${this.describeLocatedDescriptor(locVar)}`,
        );
      }
    }

    this.emit("};");
    this.emit("");

    this.generateLocatedGlobalsDefinition();
  }

  /**
   * Emit the located-globals pointer array plus its C-linkage accessors.
   *
   * `locatedVars[]` mixes two ownership classes: POU-local `VAR ... AT` (serviced
   * by the owning IEC task around run()) and CONFIGURATION `VAR_GLOBAL ... AT`
   * (owned by no task, so a host dispatcher must copy them at a quiescent frame
   * boundary). The descriptors carry no scope, and a runtime cannot recover it:
   * globals are file-scope singletons that appear nowhere in the configuration
   * object graph. Runtimes previously *inferred* the split from each entry's
   * position in locatedVars[], which broke as soon as a POU declared a located
   * variable and silently stopped servicing every located global.
   *
   * So state it here instead. locatedGlobals[] holds the canonical storage
   * pointer of every located VAR_GLOBAL — the same raw_ptr() value written into
   * locatedVars[].pointer — letting a runtime identify the config-scope entries by
   * pointer identity, independent of array order. Located variables are always
   * elementary types, so every entry is a scalar IECVar and raw_ptr() exists.
   *
   * Emitted only under STRUCPP_THREADED: freestanding targets bind every located
   * variable directly and have no dispatcher, so they would pay RAM for nothing.
   *
   * The accessors are emitted here rather than left to a host runtime's shim so
   * the generated code stays self-contained. A shim referencing these symbols
   * would fail to COMPILE against an older project's generated header, whereas an
   * accessor emitted beside its own array always matches. A runtime predating
   * this simply never resolves the symbols and skips located globals.
   */
  private generateLocatedGlobalsDefinition(): void {
    const globals = this.locatedVars.filter((v) => v.programName === "@config");
    // C++ forbids zero-length arrays at namespace scope; emit a placeholder and
    // report count 0, exactly as locatedVars[] does. That lets a runtime tell
    // "accessors absent" (older project — cannot service globals) apart from
    // "present but count 0" (project genuinely has no located globals).
    const arrayLen = globals.length === 0 ? 1 : globals.length;

    this.emit("#ifdef STRUCPP_THREADED");
    this.emit(
      "// Canonical storage pointers of the located CONFIGURATION VAR_GLOBALs.",
    );
    this.emit(
      "// Populated in the configuration constructor (like locatedVars[] above).",
    );
    this.emit(`void *locatedGlobals[${arrayLen}] = {`);
    if (globals.length === 0) {
      this.emit(`    nullptr  // placeholder; locatedGlobalsCount is 0`);
    } else {
      for (let i = 0; i < globals.length; i++) {
        const g = globals[i]!;
        const comma = i < globals.length - 1 ? "," : "";
        this.emit(
          `    nullptr${comma}  // ${this.describeLocatedDescriptor(g)}`,
        );
      }
    }
    this.emit("};");
    this.emit("");
    this.emit(
      "// C linkage: a host runtime is built once and loads many .so files, so it",
    );
    this.emit(
      "// cannot reach namespaced C++ symbols by mangled name portably.",
    );
    this.emit(
      'extern "C" void *const *strucpp_get_located_globals(void) { return locatedGlobals; }',
    );
    this.emit(
      'extern "C" uint32_t strucpp_get_located_global_count(void) { return locatedGlobalsCount; }',
    );
    this.emit("");
    this.generateGlobalLockHooks(globals);
    this.emit("#endif  // STRUCPP_THREADED");
    this.emit("");
  }

  /**
   * The C-linkage hooks a runtime service uses to take a global's lock by
   * index `g` (see {@link lockedGlobals} for the order), and to find the global
   * a located-global entry belongs to. Emitted inside the STRUCPP_THREADED
   * block of the configuration TU.
   */
  private generateGlobalLockHooks(located: LocatedVarDescriptor[]): void {
    const globals = lockedGlobals(this.projectModel);
    const index = new Map(globals.map((g, i) => [g.key, i]));
    this.emit("// Each CONFIGURATION global's lock, by index.");
    this.emit("static detail::GlobalMutex *strucpp_global_mutex(uint32_t g) {");
    if (globals.length === 0) {
      this.emit("    (void)g;");
      this.emit("    return nullptr;");
    } else {
      this.emit("    switch (g) {");
      globals.forEach((g, i) =>
        this.emit(`        case ${i}: return ${g.name}.lock_handle();`),
      );
      this.emit("        default: return nullptr;");
      this.emit("    }");
    }
    this.emit("}");
    this.emit(
      `extern "C" uint32_t strucpp_global_count(void) { return ${globals.length}; }`,
    );
    this.emit(
      'extern "C" bool strucpp_global_try_lock(uint32_t g) { return detail::global_try_lock(strucpp_global_mutex(g)); }',
    );
    this.emit(
      'extern "C" void strucpp_global_lock(uint32_t g) { detail::global_lock(strucpp_global_mutex(g)); }',
    );
    this.emit(
      'extern "C" void strucpp_global_unlock(uint32_t g) { detail::global_unlock(strucpp_global_mutex(g)); }',
    );
    this.emit("// locatedGlobals[k] -> the index of the global it is in.");
    this.emit('extern "C" int32_t strucpp_located_global_index(uint32_t k) {');
    if (located.length === 0) {
      this.emit("    (void)k;");
      this.emit("    return -1;");
    } else {
      const entries = located.map(
        (v) => index.get(v.varName.toUpperCase()) ?? -1,
      );
      this.emit(
        `    static const int32_t index[${entries.length}] = {${entries.join(", ")}};`,
      );
      this.emit(`    return k < ${entries.length} ? index[k] : -1;`);
    }
    this.emit("}");
  }

  /**
   * This program's contiguous slice [offset, offset+count) of the project-wide
   * locatedVars[] table. The table is built in program-iteration order, so a
   * single program's located vars are contiguous. Used by the STRUCPP_THREADED
   * located_range() override so the runtime can scope located I/O copy-in/out
   * to the owning task.
   */
  private locatedRangeForProgram(programName: string): {
    offset: number;
    count: number;
  } {
    let offset = -1;
    let count = 0;
    for (let i = 0; i < this.locatedVars.length; i++) {
      if (this.locatedVars[i]!.programName === programName) {
        if (offset < 0) offset = i;
        count++;
      }
    }
    return { offset: offset < 0 ? 0 : offset, count };
  }

  /**
   * Generate initialization code for located variable pointers.
   * Called from within a program constructor.
   */
  private generateLocatedVarPointerInit(
    programName: string,
    indent: string = "    ",
    // Member accessor between the variable name and `.raw_ptr()`. Empty for
    // program-local `VAR AT` (the member is the IEC value directly); ".value"
    // for configuration VAR_GLOBAL (the member is a GlobalVar<V> wrapper).
    memberAccess: string = "",
  ): void {
    const progVars = this.locatedVars.filter(
      (v) => v.programName === programName,
    );
    if (progVars.length === 0) return;

    this.emit(`${indent}// Initialize located variable pointers`);
    // Walk the global array by position rather than looking each entry back
    // up by name. A located ARRAY contributes one descriptor per element, all
    // sharing a varName, so a name lookup (`findIndex`) resolves every one of
    // them to the FIRST slot: element 0 would be bound N times and elements
    // 1..N-1 left null (openplc-editor#565). The index is right here anyway.
    for (let index = 0; index < this.locatedVars.length; index++) {
      const locVar = this.locatedVars[index]!;
      if (locVar.programName !== programName) continue;
      this.emit(
        `${indent}locatedVars[${index}].pointer = ${this.locatedStorageExpr(locVar, memberAccess)};`,
      );
    }

    // Configuration VAR_GLOBALs additionally record their storage pointer in
    // locatedGlobals[], which is what lets a host runtime tell config-scope
    // entries from POU-local ones without guessing from array position. Emitted
    // here (rather than as a static initializer) because raw_ptr() is not a
    // constant expression, and to keep it beside the locatedVars[] population it
    // must agree with.
    if (programName === "@config") {
      this.emit("#ifdef STRUCPP_THREADED");
      this.emit(`${indent}// Initialize located-global pointers`);
      for (let g = 0; g < progVars.length; g++) {
        const locVar = progVars[g]!;
        this.emit(
          `${indent}locatedGlobals[${g}] = ${this.locatedStorageExpr(locVar, memberAccess)};`,
        );
      }
      this.emit("#endif");
    }
  }

  /**
   * The C++ expression yielding the storage a descriptor binds to.
   *
   * Scalar: `name[.value].raw_ptr()`. Array element: `name[.value][i].raw_ptr()`,
   * where `i` is the IEC index — `IEC_ARRAY_1D::operator[]` maps the declared
   * index range onto its internal storage, so the declared index is what goes
   * in, not a zero-based offset.
   */
  private locatedStorageExpr(
    locVar: LocatedVarDescriptor,
    memberAccess: string,
  ): string {
    const element =
      locVar.elementIndex === undefined ? "" : `[${locVar.elementIndex}]`;
    return `${locVar.varName}${memberAccess}${element}.raw_ptr()`;
  }

  /**
   * How a descriptor labels itself in the generated table's trailing comment.
   *
   * For an array element this is the address the element actually occupies,
   * not the array's declared base — 67 rows all reading `AT %MW60` would tell
   * a reader nothing about which slot each row binds.
   */
  private describeLocatedDescriptor(locVar: LocatedVarDescriptor): string {
    if (locVar.elementIndex === undefined) {
      return `${locVar.varName} AT ${locVar.address}`;
    }
    const areaChar = { Input: "I", Output: "Q", Memory: "M" }[locVar.area];
    const sizeChar = {
      Bit: "X",
      Byte: "B",
      Word: "W",
      DWord: "D",
      LWord: "L",
    }[locVar.size];
    const offset =
      locVar.size === "Bit"
        ? `${locVar.byteIndex}.${locVar.bitIndex}`
        : `${locVar.byteIndex}`;
    return `${locVar.varName}[${locVar.elementIndex}] AT %${areaChar}${sizeChar}${offset}`;
  }

  /**
   * Emit a line to the implementation output.
   */
  protected emit(line: string): void {
    this.output.push(line);
    this.currentLine++;
  }

  /**
   * Emit a line to the header output.
   */
  private emitHeader(line: string): void {
    this.headerOutput.push(line);
    this.currentHeaderLine++;
  }

  /**
   * Emit a #line directive before implementation code for source-level debugging.
   */
  private emitLineDirective(stLine: number): void {
    if (this.options.lineDirectives) {
      const fn = (
        this.options.lineDirectiveFileName ?? this.options.fileName
      ).replaceAll("\\", "/");
      this.emit(`#line ${stLine} "${fn}"`);
    }
  }

  /**
   * Emit a #line directive before header code for source-level debugging.
   */
  private emitHeaderLineDirective(stLine: number): void {
    if (this.options.lineDirectives) {
      const fn = (
        this.options.lineDirectiveFileName ?? this.options.fileName
      ).replaceAll("\\", "/");
      this.emitHeader(`#line ${stLine} "${fn}"`);
    }
  }

  /**
   * Record a line mapping from ST to C++.
   * Used in Phase 3+ for debugging support.
   */
  private recordLineMapping(stLine: number, cppStartLine: number): void {
    // currentLine points to the *next* line to be emitted, so the last
    // emitted line is currentLine - 1.
    const lastEmittedLine = this.currentLine - 1;
    const existing = this.lineMap.get(stLine);
    if (existing !== undefined) {
      existing.cppEndLine = lastEmittedLine;
    } else {
      this.lineMap.set(stLine, {
        cppStartLine,
        cppEndLine: lastEmittedLine,
      });
    }
  }

  private recordHeaderLineMapping(
    stLine: number,
    headerStartLine: number,
  ): void {
    const lastEmittedHeaderLine = this.currentHeaderLine - 1;
    const existing = this.headerLineMap.get(stLine);
    if (existing !== undefined) {
      existing.cppEndLine = lastEmittedHeaderLine;
    } else {
      this.headerLineMap.set(stLine, {
        cppStartLine: headerStartLine,
        cppEndLine: lastEmittedHeaderLine,
      });
    }
  }
}

/**
 * Generate C++ code from a compilation unit.
 * Convenience function that creates a generator and runs code generation.
 */
export function generateCode(
  ast: CompilationUnit,
  symbolTables: SymbolTables,
  options?: Partial<CodeGenOptions>,
): CodeGenResult {
  const generator = new CodeGenerator(symbolTables, options);
  return generator.generate(ast);
}
