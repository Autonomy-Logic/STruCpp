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

