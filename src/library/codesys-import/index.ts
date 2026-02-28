// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * CODESYS Library Import — public API barrel export.
 */

export { importCodesysLibrary, detectFormat } from "./codesys-importer.js";
export type {
  CodesysImportResult,
  CodesysFormat,
  ExtractedPOU,
  POUType,
} from "./types.js";
export { formatPOU, pouToSources } from "./pou-formatter.js";
export { parseV23Library, isV23Library } from "./v23-parser.js";
export {
  parseV3Library,
  parseStringTable,
  readLEB128,
  decodeObjectIndices,
} from "./v3-parser.js";
