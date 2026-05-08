// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * CODESYS Library Importer — unified public API.
 *
 * Auto-detects the library format (V2.3 or V3) and extracts ST source files
 * that can be fed directly to `compileStlib()`.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import type {
  CodesysImportResult,
  CodesysFormat,
  ExtractedPOU,
} from "./types.js";
import { isV23Library, parseV23Library } from "./v23-parser.js";
import { parseV3Library } from "./v3-parser.js";
import { pouToSources } from "./pou-formatter.js";

/** ZIP local file header magic (PK\x03\x04). */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * Detect the CODESYS library format from binary content.
 * Returns null if the format is unrecognized.
 */
export function detectFormat(data: Buffer): CodesysFormat | null {
  if (isV23Library(data)) return "v23";
  if (data.length >= 4 && data.subarray(0, 4).equals(ZIP_MAGIC)) return "v3";
  return null;
}

/**
 * Count POUs by type for metadata reporting.
 */
function countByType(pous: ExtractedPOU[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pou of pous) {
    counts[pou.type] = (counts[pou.type] ?? 0) + 1;
  }
  return counts;
}

/**
 * Import a CODESYS library from a file path.
 *
 * Auto-detects V2.3 (.lib) vs V3 (.library) format and extracts
 * all POUs as individual .st source files.
 *
 * @param filePath - Path to the CODESYS .lib or .library file
 * @returns Import result with extracted sources ready for `compileStlib()`
 */
export function importCodesysLibrary(filePath: string): CodesysImportResult {
  const resolvedPath = resolve(filePath);
  let data: Buffer;
  try {
    data = readFileSync(resolvedPath);
  } catch (e) {
    return {
      success: false,
      sources: [],
      globalConstants: {},
      metadata: { format: "v23", pouCount: 0, counts: {} },
      warnings: [],
      errors: [
        `Cannot read file: ${resolvedPath}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const format = detectFormat(data);
  if (!format) {
    return {
      success: false,
      sources: [],
      globalConstants: {},
      metadata: { format: "v23", pouCount: 0, counts: {} },
      warnings: [],
      errors: [
        `Unrecognized file format (not CODESYS V2.3 or V3). ` +
          `Magic bytes: ${data.subarray(0, 8).toString("hex")}`,
      ],
    };
  }

  if (format === "v23") {
    return importV23(data);
  }

  return importV3(data);
}

/**
 * Import a CODESYS V2.3 library from pre-read binary data.
 */
function importV23(data: Buffer): CodesysImportResult {
  const { pous, warnings } = parseV23Library(data);

  if (pous.length === 0) {
    return {
      success: false,
      sources: [],
      globalConstants: {},
      metadata: { format: "v23", pouCount: 0, counts: {} },
      warnings,
      errors: ["No POUs found in library file."],
    };
  }

  const sources = pouToSources(pous);
  const counts = countByType(pous);

  return {
    success: true,
    sources,
    globalConstants: {},
    metadata: { format: "v23", pouCount: pous.length, counts },
    warnings,
    errors: [],
  };
}

/**
 * Import a CODESYS V3 library from pre-read ZIP binary data.
 */
function importV3(data: Buffer): CodesysImportResult {
  const { pous, guid, globalConstants, warnings } = parseV3Library(data);

  if (pous.length === 0) {
    return {
      success: false,
      sources: [],
      globalConstants,
      metadata: { format: "v3", pouCount: 0, guid, counts: {} },
      warnings,
      errors: ["No POUs found in library archive."],
    };
  }

  const sources = pouToSources(pous);
  const counts = countByType(pous);

  return {
    success: true,
    sources,
    globalConstants,
    metadata: { format: "v3", pouCount: pous.length, guid, counts },
    warnings,
    errors: [],
  };
}
