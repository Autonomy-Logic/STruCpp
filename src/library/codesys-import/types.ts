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
