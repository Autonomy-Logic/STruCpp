// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * CODESYS Library Importer — unified public API.
 *
 * Auto-detects the library format (V2.3 or V3) and extracts ST source files
 * that can be fed directly to `compileStlib()`.
 *
 * The importer is bytes-first: callers hand in a `Uint8Array` they
 * already obtained (HTTP fetch, FileReader, Electron IPC, Node
 * `readFileSync`).  A Node-only convenience wrapper that takes a
 * file path lives in `strucpp/node`.
 */

import { bytesEqual, bytesToHex } from "../../byte-utils.js";
import { isV23Library, parseV23Library } from "./v23-parser.js";
import type {
  CodesysFormat,
  CodesysImportResult,
  ExtractedPOU,
} from "./types.js";
import { pouToSources } from "./pou-formatter.js";
import { extractConstantGlobals, parseV3Library } from "./v3-parser.js";

/** ZIP local file header magic (PK\x03\x04). */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

/**
 * Detect the CODESYS library format from binary content.
 * Returns null if the format is unrecognised.
 */
export function detectFormat(data: Uint8Array): CodesysFormat | null {
  if (isV23Library(data)) return "v23";
  if (data.length >= 4 && bytesEqual(data.subarray(0, 4), ZIP_MAGIC))
    return "v3";
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
 * Import a CODESYS library from raw bytes.
 *
 * Auto-detects V2.3 (.lib) vs V3 (.library) format and extracts
 * all POUs as individual `.st` sources.  Async because V3 archives
 * use DEFLATE compression that we decompress through the platform's
 * `DecompressionStream`.
 *
 * @param data - Raw bytes of the CODESYS library file
 * @returns Import result with extracted sources ready for `compileStlib()`
 */
export async function importCodesysLibraryFromBytes(
  data: Uint8Array,
): Promise<CodesysImportResult> {
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
          `Magic bytes: ${bytesToHex(data.subarray(0, 8))}`,
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
function importV23(data: Uint8Array): CodesysImportResult {
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

  // Promote VAR_GLOBAL CONSTANT integer blocks to compile-time constants and drop the
  // GVL from the runtime sources — mirroring the V3 path. OSCAT's STRING_LENGTH /
  // LIST_LENGTH need to be constexpr (they parameterise IECStringVar<…>), and emitting
  // them as a runtime GVL as well collides with the compiler's global scope.
  const globalConstants: Record<string, number> = {};
  const kept: typeof pous = [];
  for (const pou of pous) {
    if (pou.type === "GVL") {
      const constants = extractConstantGlobals(pou.declaration);
      if (constants) {
        Object.assign(globalConstants, constants);
        continue;
      }
    }
    kept.push(pou);
  }

  const sources = pouToSources(kept);
  const counts = countByType(kept);

  return {
    success: true,
    sources,
    globalConstants,
    metadata: { format: "v23", pouCount: kept.length, counts },
    warnings,
    errors: [],
  };
}

/**
 * Import a CODESYS V3 library from pre-read ZIP binary data.
 */
async function importV3(data: Uint8Array): Promise<CodesysImportResult> {
  const { pous, guid, globalConstants, warnings } = await parseV3Library(data);

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
