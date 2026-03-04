// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Cursor Context Detection
 *
 * Determines what kind of completion context the cursor is in by
 * scanning raw text (not AST) — because when the user types `myFB.`
 * or `x : `, the token is incomplete and has no AST node.
 */

import type { AnalysisResult, EnclosingScope } from "strucpp";
import { findEnclosingPOU } from "strucpp";
import { stripCommentsAndStrings } from "./lsp-utils.js";

export type CursorContext =
  | { kind: "top-level" }
  | { kind: "var-block"; pouScope: EnclosingScope }
  | { kind: "type-annotation"; pouScope: EnclosingScope }
  | { kind: "dot-access"; prefixExpr: string; pouScope: EnclosingScope }
  | { kind: "body"; pouScope: EnclosingScope };

/**
 * Determine the cursor context for completion purposes.
 *
 * @param analysis  Current analysis result (for AST-based POU detection)
 * @param fileName  Compiler file name (e.g., "main.st")
 * @param line      1-indexed line
 * @param column    1-indexed column
 * @param source    Full source text of the document
 */
export function getCursorContext(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  source: string,
): CursorContext {
  // Strip comments and strings so that keywords/parens inside them
  // don't confuse the text-based scanning.
  const stripped = stripCommentsAndStrings(source);
  const lines = stripped.split("\n");

  let pouScope = analysis.ast
    ? findEnclosingPOU(analysis.ast, fileName, line, column)
    : { kind: "global" as const, name: "<global>" };

  // When the AST is stale or broken (e.g., user is mid-edit), findEnclosingPOU
  // may return "global" even though the cursor is inside a POU. Fall back to
  // text-based POU detection so dot-access and body completions still work.
  if (pouScope.kind === "global") {
    pouScope = detectPOUFromText(lines, line);
  }

  if (pouScope.kind === "global") {
    return { kind: "top-level" };
  }

  // line is 1-indexed
  const currentLine = lines[line - 1] ?? "";
  const prefix = currentLine.substring(0, column - 1);

  // Check dot-access: prefix ends with identifier chain + "."
  const dotMatch = prefix.match(/([\w]+(?:\.[\w]+)*)\.\s*$/);
  if (dotMatch) {
    return {
      kind: "dot-access",
      prefixExpr: dotMatch[1],
      pouScope,
    };
  }

  const inVarBlock = isInsideVarBlock(lines, line);

  if (inVarBlock) {
    // Check type-annotation: has `: ` pattern before cursor
    if (/:\s*\w*$/.test(prefix)) {
      return { kind: "type-annotation", pouScope };
    }
    return { kind: "var-block", pouScope };
  }

  return { kind: "body", pouScope };
}

/**
 * Scan backwards from the cursor line to determine if we're inside
 * a VAR..END_VAR block. Uses simple keyword counting (strips comments).
 */
function isInsideVarBlock(lines: string[], cursorLine: number): boolean {
  let depth = 0;

  for (let i = cursorLine - 1; i >= 0; i--) {
    const upper = lines[i].toUpperCase();

    // Count END_VAR first (they close blocks when scanning backwards)
    const endVarCount = countOccurrences(upper, /\bEND_VAR\b/g);
    depth -= endVarCount;

    // Count VAR openers
    const varCount = countOccurrences(
      upper,
      /\b(?:VAR|VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_TEMP|VAR_EXTERNAL|VAR_GLOBAL)\b/g,
    );
    depth += varCount;

    if (depth > 0) return true;
  }

  return false;
}

/**
 * Text-based fallback for POU detection. Scans backwards from cursor
 * looking for PROGRAM/FUNCTION_BLOCK/FUNCTION/METHOD keywords that
 * haven't been closed by their END_* counterpart.
 */
function detectPOUFromText(lines: string[], cursorLine: number): EnclosingScope {
  // Track nesting: when scanning backwards, END_* increases depth, openers decrease
  const pouPatterns: Array<{
    end: RegExp;
    open: RegExp;
    kind: EnclosingScope["kind"];
  }> = [
    { end: /\bEND_METHOD\b/g, open: /\bMETHOD\b/g, kind: "method" },
    { end: /\bEND_FUNCTION_BLOCK\b/g, open: /\bFUNCTION_BLOCK\b/g, kind: "functionBlock" },
    { end: /\bEND_FUNCTION(?!_BLOCK)\b/g, open: /\bFUNCTION(?!_BLOCK)\b/g, kind: "function" },
    { end: /\bEND_PROGRAM\b/g, open: /\bPROGRAM\b/g, kind: "program" },
  ];

  // Simple approach: scan backwards for the nearest unmatched POU opener
  const maxLine = Math.min(cursorLine - 1, lines.length - 1);
  for (const { end, open, kind } of pouPatterns) {
    let depth = 0;
    for (let i = maxLine; i >= 0; i--) {
      const upper = lines[i].toUpperCase();
      depth -= countOccurrences(upper, end);
      const opens = countOccurrences(upper, open);
      depth += opens;
      if (depth > 0) {
        // Extract name from the opener line
        const nameMatch = upper.match(
          new RegExp(`\\b(?:PROGRAM|FUNCTION_BLOCK|FUNCTION|METHOD)\\s+(\\w+)`),
        );
        return { kind, name: nameMatch?.[1] ?? "unknown" };
      }
    }
  }

  return { kind: "global", name: "<global>" };
}

/** Count regex matches in a string. */
function countOccurrences(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}
