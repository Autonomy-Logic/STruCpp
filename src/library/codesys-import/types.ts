// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared types for CODESYS library import.
 *
 * Both V2.3 and V3 parsers produce the same intermediate representation,
 * which is then formatted into .st source files and fed to compileStlib().
 */

/** POU type categories extracted from CODESYS libraries. */
export type POUType =
  | "FUNCTION"
  | "FUNCTION_BLOCK"
  | "PROGRAM"
  | "TYPE"
  | "GVL";

/**
 * Intermediate representation of a single POU extracted from a CODESYS binary.
 * Both V2.3 and V3 parsers produce this same structure.
 */
export interface ExtractedPOU {
  /** POU category */
  type: POUType;
  /** POU identifier (e.g. "ALARM_2") */
  name: string;
  /** Declaration section: FUNCTION/FB header + VAR blocks + doc comments */
  declaration: string;
  /** Implementation section: body code */
  implementation: string;
  /** Byte offset in original file (for ordering) */
  offset: number;
  /** Folder path within the library (slash-separated, e.g. "POUs/Time&Date").
   *  Empty/undefined → POU lives at the library root. V3 .library files
   *  encode this in their per-object .meta records (parent-folder GUID
   *  chain); V2.3 .lib files predate folders and always omit it. */
  category?: string;
  /**
   * POU documentation pulled from the structurally-anchored slot CODESYS
   * reserves for the variables-pane comment (the records after the last
   * `END_VAR` / `END_TYPE` in the decl sub-object). Independent of any
   * trigger-word convention: whatever comment lives in that slot becomes
   * the POU's doc. Body comments end up in the impl sub-object so they
   * never bleed in. Undefined when the POU has no comment in that slot.
   */
  documentation?: string;
}

/** Detected CODESYS library format. */
export type CodesysFormat = "v23" | "v3";

/**
 * Result of importing a CODESYS library file.
 * The `sources` array can be passed directly to `compileStlib()`.
 */
export interface CodesysImportResult {
  success: boolean;
  /** Extracted ST source files ready for compilation */
  sources: Array<{ fileName: string; source: string }>;
  /**
   * Compile-time integer constants extracted from any VAR_GLOBAL CONSTANT
   * blocks in the imported library. These need to flow into compileStlib
   * via its `globalConstants` option (rather than living in `sources` as a
   * runtime GVL) so the C++ codegen can fold them into template parameters
   * — e.g. OSCAT's STRING_LENGTH gets used as `IECStringVar<STRING_LENGTH>`,
   * which requires a constexpr value, not a runtime variable.
   */
  globalConstants: Record<string, number>;
  /** Import metadata */
  metadata: {
    format: CodesysFormat;
    pouCount: number;
    /** Library GUID (V3 only) */
    guid?: string;
    /** Counts by POU type */
    counts: Record<string, number>;
  };
  /** Non-fatal warnings during extraction */
  warnings: string[];
  /** Fatal errors */
  errors: string[];
}
