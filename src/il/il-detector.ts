// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ IL Detector
 *
 * Identifies POU regions in a source file and determines whether each
 * POU's body uses Instruction List (IL) or Structured Text (ST).
 */

import type { POURegion } from "./il-types.js";
import { IL_OPERATORS } from "./il-types.js";

/**
 * POU opening keywords and their matching closing keywords.
 */
const POU_PAIRS: Array<{ open: RegExp; close: RegExp; closeText: string }> = [
  {
    open: /\bFUNCTION_BLOCK\b/i,
    close: /\bEND_FUNCTION_BLOCK\b/i,
    closeText: "END_FUNCTION_BLOCK",
  },
  {
    open: /\bFUNCTION\b/i,
    close: /\bEND_FUNCTION\b/i,
    closeText: "END_FUNCTION",
  },
  {
    open: /\bPROGRAM\b/i,
    close: /\bEND_PROGRAM\b/i,
    closeText: "END_PROGRAM",
  },
];

/**
 * Regex pattern matching the first token of an IL instruction line.
 * An IL line starts with an optional label ("name:") followed by an
 * IL operator keyword, or is just a label, or is a closing paren ")".
 */
const IL_LINE_PATTERN = new RegExp(
  `^\\s*(?:\\w+\\s*:\\s*)?(?:${[...IL_OPERATORS].join("|")})(?:\\s|\\(|$)`,
  "i",
);

/** Matches a label-only line: "name:" with nothing after it. */
const LABEL_ONLY_PATTERN = /^\s*\w+\s*:\s*$/;

/** Matches a closing paren line. */
const CLOSE_PAREN_PATTERN = /^\s*\)\s*$/;

/**
 * Strip IL/ST comments from a line for detection purposes.
 * Only strips single-line (* ... *) comments. Multi-line tracking
 * is handled by the caller.
 */
function stripLineComment(line: string): string {
  return line.replace(/\(\*.*?\*\)/g, "").trim();
}

/**
 * Detect whether a POU body contains IL or ST.
 *
 * Heuristic: examine the first non-blank, non-comment line of the body.
 * - If it matches an IL operator pattern (with no semicolons), it's IL.
 * - Otherwise it's ST.
 */
export function isILBody(bodyText: string): boolean {
  const lines = bodyText.split("\n");
  let inComment = false;

  for (const rawLine of lines) {
    // Track multi-line comments
    let line = rawLine;
    if (inComment) {
      const endIdx = line.indexOf("*)");
      if (endIdx >= 0) {
        line = line.substring(endIdx + 2);
        inComment = false;
      } else {
        continue;
      }
    }

    // Strip single-line comments
    line = stripLineComment(line);

    // Check for opening multi-line comment without close
    const openIdx = line.indexOf("(*");
    if (openIdx >= 0 && line.indexOf("*)", openIdx) < 0) {
      line = line.substring(0, openIdx).trim();
      inComment = true;
    }

    if (line.length === 0) continue;

    // First substantive line determines the language
    // IL lines don't end with semicolons (ST statements do)
    if (line.endsWith(";")) return false;

    // Check for IL operator pattern
    if (IL_LINE_PATTERN.test(line)) return true;
    if (LABEL_ONLY_PATTERN.test(line)) return true;
    if (CLOSE_PAREN_PATTERN.test(line)) return true;

    // If it doesn't match IL, assume ST
    return false;
  }

  // Empty body — treat as ST
  return false;
}

/**
 * Extract POU regions from a source file.
 *
 * Each region includes the header (POU keyword through last END_VAR),
 * the body (executable code), and the closing keyword. The body is
 * tested for IL vs ST.
 */
export function extractPOURegions(source: string): POURegion[] {
  const regions: POURegion[] = [];
  const upperSource = source.toUpperCase();

  for (const pair of POU_PAIRS) {
    let searchFrom = 0;

    while (searchFrom < source.length) {
      // Find the next POU opening keyword
      const openMatch = pair.open.exec(upperSource.substring(searchFrom));
      if (!openMatch) break;

      const pouStart = searchFrom + openMatch.index;

      // Find the matching closing keyword
      const closeMatch = pair.close.exec(
        upperSource.substring(pouStart + openMatch[0].length),
      );
      if (!closeMatch) break;

      const closeStart = pouStart + openMatch[0].length + closeMatch.index;
      const closeEnd = closeStart + closeMatch[0].length;

      // Find the last END_VAR in this POU to split header from body
      const pouText = source.substring(pouStart, closeStart);
      const lastEndVarIdx = pouText.toUpperCase().lastIndexOf("END_VAR");

      if (lastEndVarIdx < 0) {
        // No VAR blocks — the entire POU text is body
        // This is unusual but handle it
        searchFrom = closeEnd;
        continue;
      }

      // Skip past "END_VAR" and any trailing whitespace/newline
      let bodyStart = lastEndVarIdx + "END_VAR".length;
      // Advance past the newline after END_VAR
      const afterEndVar = pouText.substring(bodyStart);
      const nlMatch = afterEndVar.match(/^[^\S\n]*\n?/);
      if (nlMatch) bodyStart += nlMatch[0].length;

      const headerText = source.substring(pouStart, pouStart + bodyStart);
      const bodyText = source.substring(pouStart + bodyStart, closeStart);
      const closingText = source.substring(closeStart, closeEnd);

      // Calculate body start line (1-based)
      const bodyStartLine = source
        .substring(0, pouStart + bodyStart)
        .split("\n").length;

      regions.push({
        startOffset: pouStart,
        endOffset: closeEnd,
        headerText,
        bodyText,
        closingText,
        bodyStartLine,
        isIL: isILBody(bodyText),
      });

      searchFrom = closeEnd;
    }
  }

  // Sort by start offset (POUs may be found out of order due to separate searches)
  regions.sort((a, b) => a.startOffset - b.startOffset);

  return regions;
}
