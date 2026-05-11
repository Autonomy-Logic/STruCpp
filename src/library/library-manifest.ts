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
}

/**
 * Library function block entry in a manifest.
 */
export interface LibraryFBEntry {
  /** Function block name */
  name: string;
  /** Input variables */
  inputs: LibraryVarType[];
  /** Output variables */
  outputs: LibraryVarType[];
  /** In-out variables */
  inouts: LibraryVarType[];
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
  /** Type-level help text — same lifecycle as `LibraryFBEntry.documentation`,
   *  populated automatically from the structured doc-block slot in CODESYS
   *  imports (typically the type's revision-history comment for OSCAT) and
   *  overridable via `library.json`. */
  documentation?: string;
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
 */
export interface StlibArchive {
  /** Format version for forward compatibility */
  formatVersion: 1;
  /** Library metadata (function/FB/type signatures for symbol registration) */
  manifest: LibraryManifest;
  /** Compiled C++ declarations (namespace body only — no includes/pragma/wrapper) */
  headerCode: string;
  /** Compiled C++ implementations (namespace body only) */
  cppCode: string;
  /** Per-symbol chunks. Populated from Phase 2 onward; Phase 1 ships
   *  the field as optional so existing emitters keep producing valid
   *  archives without yet populating it. From Phase 4 this becomes
   *  the authoritative emission source and `headerCode` / `cppCode`
   *  are retired. */
  chunks?: LibraryChunk[];
  /** Original ST source files (omitted for closed-source distribution).
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
