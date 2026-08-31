// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Library Manifest Types
 *
 * Defines the JSON manifest format for external libraries.
 * Libraries can be either built-in C++ libraries or compiled ST libraries.
 */

/**
 * Library function entry in a manifest.
 *
 * Parameter and return types are stored as bare type names (`"INT"`,
 * `"ANY_NUM"`, etc.). Generic types like `ANY_NUM` / `ANY_INT` /
 * `ANY_REAL` / `ANY_BIT` / `ANY_STRING` / `ANY_ELEMENTARY` / `ANY` are
 * IEC 61131-3 type categories — when they appear in this entry the
 * tooling must unify identically-named generics across params and
 * return type to find a concrete type at instantiation. The strucpp
 * synthetic `iec-std-functions.stlib` (built from `StdFunctionRegistry`)
 * uses these directly; library compilers for ordinary .st sources only
 * emit concrete IEC type names.
 */
export interface LibraryFunctionEntry {
  /** Function name */
  name: string;
  /** Return type name (concrete IEC type or generic — see above) */
  returnType: string;
  /** Parameter list */
  parameters: Array<{
    name: string;
    type: string;
    direction: "input" | "output" | "inout";
    /** Initial (default) value of the parameter, as an ST expression string
     *  (e.g. "255", "10.0", "T#100ms"). Present only for inputs declared with
     *  an initial value. Semantics: an input WITH an `initialValue` is
     *  OPTIONAL at the call site (the compiler supplies the default when the
     *  argument is omitted); an input WITHOUT one is MANDATORY (omitting it is
     *  a compile error). Captured by the library compiler from VAR_INPUT
     *  initial values in the source ST — including ST produced by the CODESYS
     *  v2/v3 importers, which preserve declarations verbatim. */
    initialValue?: string;
  }>;
  /** Variadic call shape. When set, `parameters` describes the leading
   *  required parameters and the function accepts any number of
   *  additional arguments matching the LAST parameter's type. `minArgs`
   *  is the minimum total argument count (typically `parameters.length`
   *  for variadic-after-required, e.g. `ADD(IN1, IN2, …)` has 2 declared
   *  params and minArgs=2). Only used by tooling to validate call sites
   *  / render extensible blocks; codegen reads it from compiler-internal
   *  metadata directly. */
  variadic?: { minArgs: number };
  /** Function-level help text shown in editor hover dialogs. Authored
   *  in the library's `library.json` and merged into the manifest at
   *  build time (see scripts/generate-*.mjs). */
  documentation?: string;
  /** Folder path within the library, slash-separated (e.g. "POUs/Time&Date").
   *  Empty/undefined means the entry lives at the root. Hierarchy is
   *  metadata-only — codegen is unaffected. The disk source layout,
   *  imported library folder structure, or any future tooling-driven
   *  organization populates this; consumers (editor library trees,
   *  decompile-to-folder extraction) read it back. */
  category?: string;
}

/**
 * Variable type reference in a library manifest.
 * Stores enough metadata for the codegen to reconstruct the full C++ type,
 * including inline array dimensions and pointer/reference qualifiers.
 */
export interface LibraryVarType {
  /** Type name */
  name: string;
  /** Type kind for the variable itself */
  type: string;
  /** Array dimensions for inline array types (e.g., ARRAY[0..255] OF BYTE) */
  arrayDimensions?: Array<{ start: number; end: number }>;
  /** Element type name for inline array types */
  elementTypeName?: string;
  /** Reference/pointer qualifier ("pointer_to" | "reference_to") */
  referenceKind?: string;
  /**
   * The C++ member name, when it differs from `name`.
   *
   * Emitted only when the library's own codegen mangled it — a member whose
   * name matches its own user-defined type's name, or one colliding with a
   * method of an interface the block implements (see member-mangling.ts).
   * Both are decided against the DECLARING unit, so a consumer cannot always
   * re-derive them; carrying the answer costs one optional string in the rare
   * case and nothing in the common one. Across the five bundled archives —
   * 224 function blocks, 7,639 leaves — it is currently emitted zero times.
   */
  cppName?: string;
  /** The declaring block was `VAR CONSTANT`: read-only in every instance. */
  readOnly?: true;
  /** The declaring block was `VAR RETAIN`: retained in every instance, whether
   *  or not the instance itself was declared RETAIN. */
  retain?: true;
}

/**
 * Library function block entry in a manifest.
 */
export interface LibraryFBEntry {
  /** Function block name */
  name: string;
  /**
   * Body language, when the block is NOT compiled by STruC++.
   *
   * Absent on every ordinary ST/IL block — those are compiled here and their
   * C++ rides in `chunks`. Present on a block whose body is C/C++ or Python:
   * STruC++ recovered this interface from the file's ST header but never
   * parsed the body, emitted no chunk for it, and carried the authored file
   * verbatim in `sources`. A consumer seeing this field must lower the source
   * itself (through whatever native bridge it implements) instead of linking
   * a chunk; see `native-sources.ts` for why the body is transported rather
   * than compiled.
   */
  implementation?: "cpp" | "python";
  /**
   * File in `sources` holding this block's body. Set alongside
   * `implementation` so a consumer can find the source without inferring the
   * file name from the block name — the two need not match, and a
   * case-insensitive guess would be wrong on a case-sensitive filesystem.
   */
  sourceFile?: string;
  /** Input variables */
  inputs: LibraryVarType[];
  /** Output variables */
  outputs: LibraryVarType[];
  /** In-out variables */
  inouts: LibraryVarType[];
  /**
   * `VAR` members — the block's own internal state, declared exactly as the
   * interface arrays are.
   *
   * Needed because a RETAINed instance retains everything the block runs on,
   * not just its interface: a TON restored with Q and ET but without its
   * STATE and start timestamp comes back in a configuration it could never
   * have reached by running.
   *
   * Declarative rather than pre-flattened, so one entry describes
   * `buf : ARRAY[0..99] OF REAL` instead of a hundred. The consumer already
   * walks declarations exactly this way for user-defined FBs, and every type a
   * local can name — library structs, nested FB types — is already exported in
   * `types` / `functionBlocks`, so the same walk resolves them here.
   *
   * Optional. An archive built before this field exists still loads, and a
   * RETAINed instance of one of its blocks retains the visible surface only —
   * with a compile warning naming the block, because a partial retain that
   * nobody is told about is the thing this field exists to prevent.
   */
  locals?: LibraryVarType[];
  /** Block-level help text shown in editor hover dialogs. Authored in
   *  the library's `library.json` and merged into the manifest at build
   *  time (see scripts/generate-*.mjs). Optional so existing archives
   *  without docs still load. */
  documentation?: string;
  /** Folder path within the library — see `LibraryFunctionEntry.category`. */
  category?: string;
}

/**
 * Library type entry in a manifest.
 */
export interface LibraryTypeEntry {
  /** Type name */
  name: string;
  /** Type kind (struct, enum, alias) */
  kind: "struct" | "enum" | "alias";
  /** Base type (for alias/enum) */
  baseType?: string;
  /** Struct member fields (name + declared type), so a consuming compilation
   *  can type member access on a dependency struct (e.g. `MATH.PI`). Only set
   *  for `kind: "struct"`; optional for backward compatibility. */
  fields?: Array<{ name: string; type: string }>;
  /** Type-level help text — same lifecycle as `LibraryFBEntry.documentation`,
   *  populated automatically from the structured doc-block slot in CODESYS
   *  imports (typically the type's revision-history comment for OSCAT) and
   *  overridable via `library.json`. */
  documentation?: string;
  /** Folder path within the library — see `LibraryFunctionEntry.category`. */
  category?: string;
}

/**
 * Library global-variable entry in a manifest.
 *
 * One per name declared in a library's `VAR_GLOBAL` blocks (e.g. OSCAT's
 * `MATH : CONSTANTS_MATH`). The variable's storage is emitted by the library
 * as an `inlineGlobal` chunk; this entry is what lets a *consuming* compilation
 * see the symbol so `MATH.PI` resolves. Globals from every imported library are
 * registered into the same shared global scope, so a program importing two
 * libraries sees both libraries' globals together (additively).
 */
export interface LibraryGlobalEntry {
  /** Global variable name (as declared). */
  name: string;
  /** Declared type name (elementary or a library type, e.g. CONSTANTS_MATH). */
  type: string;
  /** True for `VAR_GLOBAL CONSTANT` entries. */
  constant?: boolean;
  /** Folder path within the library — see `LibraryFunctionEntry.category`. */
  category?: string;
}

/**
 * Library manifest describing a compiled library's public interface.
 */
export interface LibraryManifest {
  /** Library name (kebab-case identifier; matches the .stlib filename
   *  and is what dependency declarations reference). */
  name: string;
  /** Optional human-readable label for tooling that surfaces libraries
   *  to end users (editor library trees, package managers). When unset,
   *  consumers fall back to `name`. Authored in `library.json` and
   *  carried unchanged through compile. */
  displayName?: string;
  /** Library version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** C++ namespace for the library */
  namespace: string;
  /** Exported functions */
  functions: LibraryFunctionEntry[];
  /** Exported function blocks */
  functionBlocks: LibraryFBEntry[];
  /** Exported types */
  types: LibraryTypeEntry[];
  /** Exported global variables (from the library's VAR_GLOBAL blocks).
   *  Optional for backward compatibility with archives compiled before
   *  globals were exported — consumers treat a missing field as empty. */
  globals?: LibraryGlobalEntry[];
  /** C++ headers to include */
  headers: string[];
  /** Whether this is a built-in C++ runtime library */
  isBuiltin: boolean;
  /** Original ST source files (for ST libraries) */
  sourceFiles?: string[];
}

/**
 * Reference to another symbol from a library chunk's dep graph.
 *
 * Recorded by the library compiler when it scans a chunk's body for
 * cross-symbol references. Codegen walks these edges to compute the
 * reachable-from-the-user's-AST closure and only emit those chunks.
 */
export interface LibraryChunkDep {
  /** Owning archive name (matches `LibraryManifest.name`). The library
   *  compiler resolves edges at compile time, so this is always the
   *  actual archive name — including for same-archive deps (no `"this"`
   *  sentinel). Consumers can index every dep through the
   *  symbol→archive map without a separate normalisation step. */
  library: string;
  /** Referenced symbol's uppercase name (matches `LibraryChunk.name`
   *  in the target archive). */
  name: string;
}

/**
 * Per-symbol chunk in a compiled library.
 *
 * One chunk per top-level declaration: function, function block, type
 * (struct/enum/alias group), or inline global. `header` + `cpp`
 * concatenated in chunk-array order reproduce the legacy library-wide
 * header/cpp blobs — the chunked form is a refinement, not a rewrite,
 * of what the codegen used to emit as one chunk per library.
 *
 * The chunks-and-deps representation is what enables function-level
 * tree-shaking: codegen walks the user's AST, seeds the closure with
 * referenced names, BFS-traverses `deps`, then emits only the chunks
 * in the closure. Symbols that no reachable chunk depends on never
 * appear in the user's `generated.hpp`/`generated.cpp`.
 */
export interface LibraryChunk {
  /** Symbol name (uppercase). Matches an entry in
   *  `manifest.functions`, `manifest.functionBlocks`, `manifest.types`,
   *  or names an inline global owned by this library. */
  name: string;
  /** Top-level kind. Drives forward-decl ordering during emission
   *  (function blocks need forward decls so circular FB-to-FB
   *  references resolve; types and functions don't). */
  kind: "function" | "functionBlock" | "type" | "inlineGlobal";
  /** Slice of this library's emitted header code that declares this
   *  symbol — class declaration, struct body, function prototype, or
   *  inline-global definition — plus any same-line `using IEC_X = X;`
   *  alias that conventionally accompanies it. Concatenating every
   *  chunk's `header` in array order reproduces the legacy
   *  library-wide `headerCode` blob byte-for-byte. */
  header: string;
  /** Slice of this library's emitted cpp code that implements this
   *  symbol — constructor + `operator()` bodies for FBs, function
   *  bodies for free functions. Empty string for types and inline
   *  globals whose entire materialisation lives in `header`. */
  cpp: string;
  /** Symbols this chunk references in its body. Same-archive entries
   *  use `library: "this"`; cross-archive entries name the owning
   *  archive's `manifest.name`. The codegen treats these as edges
   *  in the chunk-reachability graph. */
  deps: LibraryChunkDep[];
}

/**
 * Result of compiling a library.
 */
export interface LibraryCompileResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** The library manifest */
  manifest: LibraryManifest;
  /** Generated C++ header */
  headerCode: string;
  /** Generated C++ implementation */
  cppCode: string;
  /** Per-symbol chunks. Populated from Phase 2 onward; Phase 1 ships
   *  the type definition only so consumers can be migrated
   *  incrementally. When non-empty, concatenating chunks in array
   *  order reproduces `headerCode` / `cppCode`. */
  chunks?: LibraryChunk[];
  /** Compilation errors */
  errors: Array<{ message: string; file?: string; line?: number }>;
}

/**
 * Single-file `.stlib` archive format containing metadata + compiled C++ code.
 *
 * Emission to a consumer is per-symbol via `chunks` — the codegen
 * tree-shake walks the user's AST and emits only reachable chunks
 * into the final `generated.hpp` / `generated.cpp`. There is no
 * library-wide blob field: the legacy `headerCode` / `cppCode` were
 * retired in Phase 4 of the function-level tree-shaking work.
 */
export interface StlibArchive {
  /** Format version for forward compatibility */
  formatVersion: 1;
  /** Library metadata (function/FB/type signatures for symbol registration) */
  manifest: LibraryManifest;
  /** Per-symbol chunks. One entry per top-level declaration emitted
   *  by the library compiler: function, function block, type, or
   *  inline global. Each chunk owns its header/cpp slices plus the
   *  dep edges to other chunks (in this archive or any declared dep).
   *  Empty for synthetic libraries that bypass `compileLibrary`
   *  (e.g. `iec-std-functions` is built from the std-function registry
   *  and contributes only symbol-table entries, no C++ output). */
  chunks: LibraryChunk[];
  /** Original source files (ST omitted for closed-source distribution).
   *
   *  `--no-source` / `noSource` strips the ST entries, whose symbols are
   *  already compiled into `chunks` and therefore usable without them. It
   *  does NOT strip native (C/C++, Python) entries: those have no chunk, so
   *  their source IS the deliverable and an archive without it is unbuildable
   *  by any consumer. Closed-source distribution of a native block is not a
   *  thing this format can express.
   *  `category` mirrors the manifest entry category for the POUs declared
   *  in this file so `--decompile-lib` can recreate the folder hierarchy
   *  on disk without re-parsing the source. Sources that span multiple
   *  POUs (e.g. iec-standard-fb's counter.st) all share one category by
   *  construction — every POU declared in the same file came from the
   *  same input folder. */
  sources?: Array<{ fileName: string; source: string; category?: string }>;
  /** Global constants required by this library (e.g., STRING_LENGTH, LIST_LENGTH) */
  globalConstants?: Record<string, number>;
  /** Reserved for future library-to-library dependency resolution */
  dependencies: Array<{ name: string; version: string }>;
}

/**
 * Result of compiling an ST library into a `.stlib` archive.
 */
export interface StlibCompileResult {
  /** Whether compilation succeeded */
  success: boolean;
  /** The compiled archive */
  archive: StlibArchive;
  /** Compilation errors */
  errors: Array<{ message: string; file?: string; line?: number }>;
}
