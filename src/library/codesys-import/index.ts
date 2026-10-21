// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * CODESYS Library Import — public API barrel export.
 *
 * The browser-safe surface takes bytes (`Uint8Array`).  Node-only
 * file-path wrappers live in `strucpp/node`.
 */

export {
  detectFormat,
  importCodesysLibraryFromBytes,
} from "./codesys-importer.js";
export type {
  CodesysFormat,
  CodesysImportResult,
  ExtractedPOU,
  POUType,
} from "./types.js";
export { formatPOU, pouToSources } from "./pou-formatter.js";
export { isV23Library, parseV23Library } from "./v23-parser.js";
export {
  decodeObjectIndices,
  parseStringTable,
  parseV3Library,
  readLEB128,
} from "./v3-parser.js";
