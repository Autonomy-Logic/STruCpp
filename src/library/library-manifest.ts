/**
 * STruC++ Library Manifest Types
 *
 * Defines the JSON manifest format for external libraries.
 * Libraries can be either built-in C++ libraries or compiled ST libraries.
 */

/**
 * Library function entry in a manifest.
 */
export interface LibraryFunctionEntry {
  /** Function name */
  name: string;
  /** Return type name */
  returnType: string;
  /** Parameter list */
  parameters: Array<{
    name: string;
    type: string;
    direction: "input" | "output" | "inout";
  }>;
}

/**
 * Library function block entry in a manifest.
 */
export interface LibraryFBEntry {
  /** Function block name */
  name: string;
  /** Input variables */
  inputs: Array<{ name: string; type: string }>;
  /** Output variables */
  outputs: Array<{ name: string; type: string }>;
  /** In-out variables */
  inouts: Array<{ name: string; type: string }>;
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
}

/**
 * Library manifest describing a compiled library's public interface.
 */
export interface LibraryManifest {
  /** Library name */
  name: string;
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
  /** Original ST source files (omitted for closed-source distribution) */
  sources?: Array<{ fileName: string; source: string }>;
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
