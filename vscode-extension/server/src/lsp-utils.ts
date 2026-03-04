// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * LSP Utility Helpers
 *
 * Thin converters between STruC++ compiler coordinates (1-indexed)
 * and LSP coordinates (0-indexed).
 */

import { Range, Position } from "vscode-languageserver/node.js";
import type { SourceSpan } from "strucpp";
import type { DocumentState } from "./document-manager.js";

/**
 * Convert a compiler SourceSpan (1-indexed) to an LSP Range (0-indexed).
 */
export function sourceSpanToRange(span: SourceSpan): Range {
  return Range.create(
    Position.create(span.startLine - 1, span.startCol - 1),
    Position.create(span.endLine - 1, span.endCol - 1),
  );
}

/**
 * Convert an LSP Position (0-indexed) to compiler coordinates (1-indexed).
 */
export function lspPositionToCompiler(pos: Position): {
  line: number;
  column: number;
} {
  return { line: pos.line + 1, column: pos.character + 1 };
}

/**
 * Map a compiler fileName to a document URI.
 * The compiler uses bare filenames (e.g., "main.st"), while the LSP uses URIs.
 */
export function fileNameToUri(
  fileName: string,
  allDocs: Map<string, DocumentState>,
): string | undefined {
  for (const [uri, state] of allDocs) {
    // Match by basename — compiler uses bare filenames
    if (uri.endsWith(fileName) || uri.endsWith("/" + fileName)) {
      return uri;
    }
    // Also check if the state's URI contains the fileName
    if (state.uri.endsWith(fileName)) {
      return state.uri;
    }
  }
  return undefined;
}
