// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Rename Symbol Provider (Phase 4.2)
 *
 * prepareRename validates the symbol under cursor is renameable.
 * getRenameEdits uses getReferences to build a WorkspaceEdit.
 */

import {
  Range,
  WorkspaceEdit,
  TextEdit,
} from "vscode-languageserver/node.js";
import type { AnalysisResult } from "strucpp";
import { resolveSymbolAtPosition } from "./resolve-symbol.js";
import { sourceSpanToRange, restoreCase, type FileNameResolver } from "./lsp-utils.js";
import { getReferences, type DocumentInfo } from "./references.js";

/** IEC 61131-3 keywords that cannot be renamed. */
const IEC_KEYWORDS = new Set([
  "IF", "THEN", "ELSE", "ELSIF", "END_IF",
  "WHILE", "DO", "END_WHILE",
  "FOR", "TO", "BY", "END_FOR",
  "REPEAT", "UNTIL", "END_REPEAT",
  "CASE", "OF", "END_CASE",
  "VAR", "VAR_INPUT", "VAR_OUTPUT", "VAR_IN_OUT", "VAR_GLOBAL",
  "VAR_TEMP", "VAR_EXTERNAL", "VAR_ACCESS", "VAR_CONFIG",
  "CONSTANT", "RETAIN", "PERSISTENT", "END_VAR",
  "PROGRAM", "END_PROGRAM",
  "FUNCTION", "END_FUNCTION",
  "FUNCTION_BLOCK", "END_FUNCTION_BLOCK",
  "METHOD", "END_METHOD",
  "PROPERTY", "END_PROPERTY",
  "INTERFACE", "END_INTERFACE",
  "TYPE", "END_TYPE", "STRUCT", "END_STRUCT",
  "ARRAY", "STRING", "WSTRING",
  "TRUE", "FALSE",
  "AND", "OR", "XOR", "NOT", "MOD",
  "RETURN", "EXIT", "CONTINUE",
  "REF_TO", "REFERENCE_TO", "REF",
  "EXTENDS", "IMPLEMENTS", "ABSTRACT", "FINAL",
  "PUBLIC", "PRIVATE", "PROTECTED", "INTERNAL",
  "OVERRIDE",
  "CONFIGURATION", "END_CONFIGURATION",
  "RESOURCE", "END_RESOURCE",
  "TASK", "WITH",
  "AT",
  "BOOL", "BYTE", "WORD", "DWORD", "LWORD",
  "SINT", "INT", "DINT", "LINT",
  "USINT", "UINT", "UDINT", "ULINT",
  "REAL", "LREAL",
  "TIME", "DATE", "TIME_OF_DAY", "DATE_AND_TIME",
  "TOD", "DT",
]);

/**
 * Validate that the symbol at cursor can be renamed.
 * Returns the symbol range and placeholder text, or null if not renameable.
 */
export function prepareRename(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  caseMap?: ReadonlyMap<string, string>,
): { range: Range; placeholder: string } | null {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved) return null;

  const { symbol, stdFunction, node } = resolved;

  // Standard functions cannot be renamed
  if (stdFunction && !symbol) return null;
  if (!symbol) return null;

  // Keywords cannot be renamed
  if (IEC_KEYWORDS.has(symbol.name.toUpperCase())) return null;

  // Must have a source span for the node
  if (!node.sourceSpan) return null;

  return {
    range: sourceSpanToRange(node.sourceSpan),
    placeholder: restoreCase(symbol.name, caseMap),
  };
}


/**
 * Produce a WorkspaceEdit that renames the symbol at cursor across all documents.
 */
export function getRenameEdits(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  newName: string,
  uri: string,
  allDocuments: ReadonlyMap<string, DocumentInfo>,
  resolveFileName?: FileNameResolver,
): WorkspaceEdit | null {
  // Validate first
  if (!prepareRename(analysis, fileName, line, column)) return null;

  // Get all reference locations including the declaration
  const locations = getReferences(
    analysis,
    fileName,
    line,
    column,
    uri,
    allDocuments,
    resolveFileName,
    /* includeDeclaration */ true,
  );

  if (locations.length === 0) return null;

  // Group by URI and build TextEdits
  const changes: Record<string, TextEdit[]> = {};
  for (const loc of locations) {
    if (!changes[loc.uri]) {
      changes[loc.uri] = [];
    }
    changes[loc.uri].push(TextEdit.replace(loc.range, newName));
  }

  return { changes };
}
