// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-only file-path wrapper around the bytes-first CODESYS
 * importer.  Browser / worker consumers fetch the bytes themselves
 * and call `importCodesysLibraryFromBytes` directly.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { importCodesysLibraryFromBytes } from "../library/codesys-import/index.js";
import type { CodesysImportResult } from "../library/codesys-import/index.js";

/**
 * Import a CODESYS library from a file on disk.  Auto-detects V2.3
 * vs V3 format and extracts POUs as `.st` sources.
 */
export async function importCodesysLibraryFromFile(
  filePath: string,
): Promise<CodesysImportResult> {
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
  // Node's Buffer extends Uint8Array; the importer accepts the
  // broader type so the cast is purely for TypeScript narrowness.
  return importCodesysLibraryFromBytes(data);
}
