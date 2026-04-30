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

/** Diagnostic emitted by extractPOURegions when a POU is malformed. */
export interface POURegionError {
  message: string;
  line: number;
  column: number;
}

export interface ExtractPOURegionsResult {
  regions: POURegion[];
  errors: POURegionError[];
}

/**
 * Replace every comment ((* ... *) and // ... to end of line) and every
 * string literal ('...' and "...") in the source with same-length spaces.
 * This preserves byte offsets and line numbers so subsequent regex scans
 * report correct positions while no longer false-matching POU keywords
 * inside comments or strings. Newlines inside multi-line comments are
 * preserved so line counters stay accurate.
 */
export function maskCommentsAndStrings(source: string): string {
  const out: string[] = new Array<string>(source.length);
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const c2 = source[i + 1];
    // Multi-line (* ... *) comment.
    if (c === "(" && c2 === "*") {
      const end = source.indexOf("*)", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      for (let k = i; k < stop; k++) out[k] = source[k] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    // Single-line // comment (non-IEC but accepted by several PLC vendors and
    // commonly produced by OpenPLC tooling — strip it for scanning purposes).
    if (c === "/" && c2 === "/") {
      const nl = source.indexOf("\n", i);
      const stop = nl < 0 ? source.length : nl;
      for (let k = i; k < stop; k++) out[k] = " ";
      i = stop;
      continue;
    }
    // String literal (single quotes — IEC) or double quotes — accept both.
    if (c === "'" || c === '"') {
      const quote = c;
      out[i] = " ";
      i++;
      while (i < source.length) {
        const ch = source[i]!;
        if (ch === "\\" && i + 1 < source.length) {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (ch === quote) {
          out[i] = " ";
          i++;
          break;
        }
        out[i] = ch === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    out[i] = c;
    i++;
  }
  return out.join("");
}

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
 * Removes inline (* ... *) comments and trailing // comments. Multi-line
 * (* ... *) comment tracking across lines is handled by the caller.
 */
function stripLineComment(line: string): string {
  return line
    .replace(/\(\*.*?\*\)/g, "")
    .replace(/\/\/.*$/, "")
    .trim();
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

    // ST uses `:=` for assignment; IL does not — except inside CAL formal
    // parameter lists (`CAL fb(IN := TRUE)`), where `:=` is part of an IL
    // construct. Disambiguate: a `:=` *before* any opening paren means
    // top-level assignment (ST). A `:=` *after* the opening paren is the
    // CAL-param form (IL). This catches `s := 'foo';` even though `S` is
    // also a single-letter IL operator.
    const colEqIdx = line.indexOf(":=");
    const parenIdx = line.indexOf("(");
    if (colEqIdx >= 0 && (parenIdx < 0 || colEqIdx < parenIdx)) return false;

    // ST statements end with semicolons; IL does not. Catch ST function
    // calls like `func();` or `r();` here, before the IL operator pattern
    // — otherwise single-letter operators (S, R) would false-match the
    // identifier in `<func>(...)`.
    if (line.endsWith(";")) return false;

    // Check for IL operator pattern.
    if (IL_LINE_PATTERN.test(line)) return true;
    if (LABEL_ONLY_PATTERN.test(line)) return true;
    if (CLOSE_PAREN_PATTERN.test(line)) return true;

    // No IL pattern, no semicolon — assume ST.
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
export function extractPOURegions(source: string): ExtractPOURegionsResult {
  const regions: POURegion[] = [];
  const errors: POURegionError[] = [];

  // Scan against a masked view so POU keywords appearing inside comments
  // or string literals can't trigger false positives. Offsets are preserved
  // because masking replaces ranges with same-length whitespace.
  const masked = maskCommentsAndStrings(source);
  const upperMasked = masked.toUpperCase();

  // Find every POU opener and pair it with the next END_* of the same kind,
  // anywhere later in the source. This works even when POUs appear out of
  // order or interleaved.
  for (const pair of POU_PAIRS) {
    // Use exec with lastIndex to scan all occurrences in the masked view.
    const openRe = new RegExp(pair.open.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = openRe.exec(upperMasked)) !== null) {
      const pouStart = m.index;

      // Find the matching closing keyword in the masked view (guards us
      // from matching an END_FUNCTION inside a comment).
      const closeRe = new RegExp(pair.close.source, "i");
      const tail = upperMasked.substring(pouStart + m[0].length);
      const closeMatch = closeRe.exec(tail);
      if (!closeMatch) break;

      const closeStart = pouStart + m[0].length + closeMatch.index;
      const closeEnd = closeStart + closeMatch[0].length;

      // Locate the last END_VAR in the masked POU text. A POU without any
      // VAR/END_VAR block is malformed for our purposes — the boundary
      // between header and body is undefined. Emit a clear diagnostic.
      const pouMasked = upperMasked.substring(pouStart, closeStart);
      const lastEndVarIdx = pouMasked.lastIndexOf("END_VAR");

      // Compute the POU's start line for diagnostic positioning.
      const pouStartLine = source.substring(0, pouStart).split("\n").length;

      // Extract the POU's name from the original source (header line).
      const headerLineMatch = source
        .substring(pouStart)
        .match(/^\s*\w+\s+(\w+)/);
      const pouName = headerLineMatch?.[1] ?? "<anonymous>";

      if (lastEndVarIdx < 0) {
        errors.push({
          message:
            `${pair.closeText.replace(/^END_/, "")} '${pouName}' has no variable declaration block. ` +
            `Add a 'VAR ... END_VAR' (or 'VAR_INPUT', 'VAR_OUTPUT', etc.) section between the header and body, ` +
            `even if empty.`,
          line: pouStartLine,
          column: 1,
        });
        // Advance past this POU so we don't re-enter it.
        openRe.lastIndex = closeEnd;
        continue;
      }

      // Skip past "END_VAR" and any trailing whitespace/newline
      let bodyStart = lastEndVarIdx + "END_VAR".length;
      const afterEndVar = source.substring(pouStart + bodyStart, closeStart);
      const nlMatch = afterEndVar.match(/^[^\S\n]*\n?/);
      if (nlMatch) bodyStart += nlMatch[0].length;

      const headerText = source.substring(pouStart, pouStart + bodyStart);
      const bodyText = source.substring(pouStart + bodyStart, closeStart);
      const closingText = source.substring(closeStart, closeEnd);
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

      // Advance past this POU so the outer scan continues after END_*.
      openRe.lastIndex = closeEnd;
    }
  }

  // Sort by start offset (POUs may be found out of order due to separate searches)
  regions.sort((a, b) => a.startOffset - b.startOffset);
  errors.sort((a, b) => a.line - b.line);

  return { regions, errors };
}
