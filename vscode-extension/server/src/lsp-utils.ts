// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * LSP Utility Helpers
 *
 * Thin converters between STruC++ compiler coordinates (1-indexed)
 * and LSP coordinates (0-indexed).
 */

import { Range, Position } from "vscode-languageserver/node.js";
import type { ConstantSymbol, SourceSpan, VariableSymbol } from "strucpp";
import { typeName } from "strucpp";

/** Any symbol carrying a declared type — variables and constants both do. */
type TypedSymbol = VariableSymbol | ConstantSymbol;

/** Resolves a bare compiler fileName to a file:// URI. */
export type FileNameResolver = (fileName: string) => string | undefined;

/**
 * The inline-ARRAY facts the AST records alongside the synthetic type name.
 * `undefined` when the declaration isn't a fixed-bound inline array (a plain
 * type, a named array TYPE, or a variable-length `ARRAY[*]`).
 */
export interface InlineArrayInfo {
  elementType: string;
  dimensions: Array<{ start: number; end: number }>;
}

export function inlineArrayInfo(sym: TypedSymbol): InlineArrayInfo | undefined {
  const decl = sym.declaration?.type;
  if (!decl?.elementTypeName) return undefined;
  const dimensions = decl.arrayDimensions;
  if (!dimensions || dimensions.length === 0) return undefined;
  return { elementType: decl.elementTypeName, dimensions };
}

/**
 * Render a variable's type the way the user wrote it in ST.
 *
 * The AST names inline arrays with synthetic internal identifiers
 * (`__INLINE_ARRAY_BOOL`, `__VLA_1D_INT`) and keeps the real element type and
 * bounds beside them on the same `TypeReference`. Publishing the raw name
 * leaks a compiler internal across the LSP boundary and destroys the only
 * information a client needs to make sense of the symbol: an editor sees
 * `__INLINE_ARRAY_BOOL` where it expected `ARRAY [0..10] OF BOOL`, cannot tell
 * the element type, and rejects `someArray[0]` as an unknown expression.
 *
 * Reconstruct the declaration instead. Anything not reconstructible falls back
 * to the declared name, which for every non-array type is already exactly what
 * the user typed.
 *
 * Every LSP surface that shows a variable's type — completion detail, hover,
 * signature help — must go through here, so no internal name can escape.
 */
export function renderVariableType(sym: TypedSymbol): string | undefined {
  const array = inlineArrayInfo(sym);
  if (array) {
    const dims = array.dimensions.map((d) => `${d.start}..${d.end}`).join(", ");
    return `ARRAY [${dims}] OF ${array.elementType}`;
  }
  return sym.declaration?.type?.name ?? (sym.type ? typeName(sym.type) : undefined);
}

/**
 * Restore an identifier's original casing using the workspace case map.
 * Falls back to the uppercased name if not found.
 */
export function restoreCase(
  name: string,
  caseMap?: ReadonlyMap<string, string>,
): string {
  if (!caseMap) return name;
  return caseMap.get(name.toUpperCase()) ?? name;
}
/**
 * Convert a compiler SourceSpan (1-indexed, inclusive end) to an LSP Range
 * (0-indexed, exclusive end).
 *
 * Chevrotain's endColumn points AT the last character (inclusive).
 * LSP Range.end points PAST the last character (exclusive).
 * So: startCol - 1 (0-index), but endCol stays as-is (inclusive→exclusive cancel out).
 */
export function sourceSpanToRange(span: SourceSpan): Range {
  return Range.create(
    Position.create(span.startLine - 1, span.startCol - 1),
    Position.create(span.endLine - 1, span.endCol),
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
/**
 * Resolve a SourceSpan's file to a URI, falling back to the current document URI.
 */
export function resolveUri(
  span: SourceSpan,
  currentUri: string,
  resolveFileName?: FileNameResolver,
): string {
  if (!span.file) return currentUri;

  // If the span's file matches the current file, stay in the same document
  const currentBasename = currentUri.split("/").pop() ?? "";
  if (span.file === currentBasename) return currentUri;

  // Try to resolve via the file name resolver (searches open docs + workspace)
  if (resolveFileName) {
    const found = resolveFileName(span.file);
    if (found) return found;
  }

  return currentUri;
}

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

