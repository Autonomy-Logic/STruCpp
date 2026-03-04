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

/**
 * Replace comments and string literals with spaces, preserving line structure.
 * Handles: // line comments, (* *) block comments (with nesting), '...' and "..."
 * string literals (with IEC 61131-3 $ escape character).
 *
 * Line breaks are preserved so that line/column positions remain valid.
 */
export function stripCommentsAndStrings(text: string): string {
  const chars = text.split("");
  let i = 0;

  while (i < chars.length) {
    // Block comment (* ... *) — supports nesting
    if (chars[i] === "(" && chars[i + 1] === "*") {
      let depth = 1;
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 2;
      while (i < chars.length && depth > 0) {
        if (chars[i] === "(" && i + 1 < chars.length && chars[i + 1] === "*") {
          depth++;
          chars[i] = " ";
          chars[i + 1] = " ";
          i += 2;
        } else if (chars[i] === "*" && i + 1 < chars.length && chars[i + 1] === ")") {
          depth--;
          chars[i] = " ";
          chars[i + 1] = " ";
          i += 2;
        } else {
          if (chars[i] !== "\n") chars[i] = " ";
          i++;
        }
      }
      continue;
    }

    // Line comment //
    if (chars[i] === "/" && i + 1 < chars.length && chars[i + 1] === "/") {
      while (i < chars.length && chars[i] !== "\n") {
        chars[i] = " ";
        i++;
      }
      continue;
    }

    // String literal '...' or "..." (with $ escape char per IEC 61131-3)
    if (chars[i] === "'" || chars[i] === '"') {
      const quote = chars[i];
      chars[i] = " ";
      i++;
      while (i < chars.length) {
        if (chars[i] === "$" && i + 1 < chars.length) {
          chars[i] = " ";
          i++;
          if (chars[i] !== "\n") chars[i] = " ";
          i++;
          continue;
        }
        if (chars[i] === quote) {
          chars[i] = " ";
          i++;
          break;
        }
        if (chars[i] !== "\n") chars[i] = " ";
        i++;
      }
      continue;
    }

    i++;
  }

  return chars.join("");
}

