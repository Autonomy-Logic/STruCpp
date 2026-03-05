// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Document Formatting Provider (Phase 5.2)
 *
 * Text-based formatter that handles keyword uppercasing, indentation
 * normalization, and operator spacing while preserving comments and strings.
 */

import {
  TextEdit,
  Range,
  Position,
} from "vscode-languageserver/node.js";

// LSP FormattingOptions shape (avoid importing from vscode-languageserver types)
interface FormattingOpts {
  tabSize: number;
  insertSpaces: boolean;
}

// ---------------------------------------------------------------------------
// Keyword lists
// ---------------------------------------------------------------------------

/** Keywords that increase indentation after the line they appear on. */
const INDENT_AFTER = new Set([
  "PROGRAM", "FUNCTION", "FUNCTION_BLOCK", "INTERFACE",
  "METHOD", "PROPERTY",
  "THEN", "DO", "REPEAT", "CASE",
  "VAR", "VAR_INPUT", "VAR_OUTPUT", "VAR_IN_OUT",
  "VAR_GLOBAL", "VAR_TEMP", "VAR_EXTERNAL",
  "TYPE", "STRUCT",
  "CONFIGURATION", "RESOURCE",
]);

/** Keywords that decrease indentation on the line they appear on. */
const DEDENT_BEFORE = new Set([
  "END_PROGRAM", "END_FUNCTION", "END_FUNCTION_BLOCK", "END_INTERFACE",
  "END_METHOD", "END_PROPERTY",
  "END_IF", "END_FOR", "END_WHILE", "END_REPEAT", "END_CASE",
  "UNTIL",
  "END_VAR", "END_TYPE", "END_STRUCT",
  "END_CONFIGURATION", "END_RESOURCE",
]);

/** Keywords that dedent on current line then indent for following lines (ELSE, ELSIF). */
const DEDENT_INDENT = new Set(["ELSE", "ELSIF"]);

/** All IEC 61131-3 keywords for uppercasing (sorted longest-first for regex). */
const ALL_KEYWORDS = [
  "END_FUNCTION_BLOCK", "END_CONFIGURATION", "END_RESOURCE",
  "FUNCTION_BLOCK", "CONFIGURATION", "VAR_EXTERNAL", "REFERENCE_TO",
  "DATE_AND_TIME", "TIME_OF_DAY",
  "END_FUNCTION", "END_INTERFACE", "END_PROPERTY", "END_PROGRAM",
  "END_METHOD", "END_REPEAT", "END_STRUCT", "END_WHILE",
  "VAR_IN_OUT", "VAR_OUTPUT", "VAR_GLOBAL", "VAR_INPUT", "VAR_TEMP",
  "IMPLEMENTS", "INTERFACE", "PROTECTED",
  "END_CASE", "END_FOR", "END_IF", "END_VAR", "END_TYPE",
  "FUNCTION", "PROPERTY", "CONSTANT", "CONTINUE", "ABSTRACT",
  "OVERRIDE", "INTERNAL", "RESOURCE",
  "PROGRAM", "PRIVATE", "EXTENDS", "WSTRING", "METHOD",
  "REPEAT", "RETURN", "STRING", "PUBLIC",
  "STRUCT", "RETAIN", "REF_TO",
  "WHILE", "ELSIF", "ARRAY", "ULINT", "UDINT", "USINT",
  "LWORD", "DWORD", "LREAL",
  "UNTIL", "FALSE",
  "FINAL",
  "CASE", "THEN", "ELSE", "TYPE", "BOOL", "BYTE", "WORD",
  "SINT", "DINT", "LINT", "UINT", "REAL",
  "TIME", "DATE", "TASK", "WITH",
  "TRUE",
  "FOR", "END", "VAR", "AND", "XOR", "NOT", "MOD", "REF",
  "INT", "TOD",
  "IF", "DO", "TO", "BY", "OF", "OR", "AT", "DT",
  "EXIT",
];

const KEYWORD_REGEX = new RegExp(
  `\\b(${ALL_KEYWORDS.join("|")})\\b`,
  "gi",
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a Structured Text document.
 * Returns TextEdits for lines that changed.
 */
export function formatDocument(
  source: string,
  options: FormattingOpts,
): TextEdit[] {
  const lines = source.split("\n");
  const indentStr = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";

  // Pass 1: Build comment/string masks and track block comment state
  const { masks, blockCommentLines } = buildMasks(lines);

  // Pass 2: Compute indentation depth per line
  const depths = computeIndentDepths(lines, masks);

  // Pass 3: Apply formatting
  const edits: TextEdit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const trimmed = original.trim();

    // Blank lines: preserve but ensure no trailing whitespace
    if (trimmed === "") {
      if (original !== "") {
        edits.push(replaceLineEdit(i, original, ""));
      }
      continue;
    }

    let formatted: string;

    if (blockCommentLines[i]) {
      // Line is entirely inside a block comment — only adjust indentation
      formatted = indentStr.repeat(depths[i]) + trimmed;
    } else {
      // Apply keyword casing and operator spacing on code portions
      const codePart = applyCodeFormatting(original, masks[i]);
      const trimmedFormatted = codePart.trim();
      formatted = indentStr.repeat(depths[i]) + trimmedFormatted;
    }

    if (formatted !== original) {
      edits.push(replaceLineEdit(i, original, formatted));
    }
  }

  return edits;
}

// ---------------------------------------------------------------------------
// Pass 1: Comment/string mask builder
// ---------------------------------------------------------------------------

interface MaskResult {
  /** Per-line boolean arrays: true = code, false = comment/string */
  masks: boolean[][];
  /** Per-line flag: true if the entire line is inside a block comment */
  blockCommentLines: boolean[];
}

function buildMasks(lines: string[]): MaskResult {
  const masks: boolean[][] = [];
  const blockCommentLines: boolean[] = [];
  let inBlockComment = 0; // nesting depth

  for (const line of lines) {
    const mask = new Array<boolean>(line.length).fill(true);
    const entirelyInBlock = inBlockComment > 0;
    let i = 0;

    while (i < line.length) {
      if (inBlockComment > 0) {
        // Inside block comment
        mask[i] = false;
        if (line[i] === "(" && i + 1 < line.length && line[i + 1] === "*") {
          inBlockComment++;
          mask[i + 1] = false;
          i += 2;
        } else if (line[i] === "*" && i + 1 < line.length && line[i + 1] === ")") {
          inBlockComment--;
          mask[i + 1] = false;
          i += 2;
        } else {
          i++;
        }
        continue;
      }

      // Block comment start
      if (line[i] === "(" && i + 1 < line.length && line[i + 1] === "*") {
        inBlockComment++;
        mask[i] = false;
        mask[i + 1] = false;
        i += 2;
        continue;
      }

      // Line comment
      if (line[i] === "/" && i + 1 < line.length && line[i + 1] === "/") {
        for (let j = i; j < line.length; j++) mask[j] = false;
        break;
      }

      // String literal
      if (line[i] === "'" || line[i] === '"') {
        const quote = line[i];
        mask[i] = false;
        i++;
        while (i < line.length) {
          mask[i] = false;
          if (line[i] === "$" && i + 1 < line.length) {
            i++;
            mask[i] = false;
            i++;
            continue;
          }
          if (line[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }

      i++;
    }

    masks.push(mask);
    blockCommentLines.push(entirelyInBlock);
  }

  return { masks, blockCommentLines };
}

// ---------------------------------------------------------------------------
// Pass 2: Indentation depth computation
// ---------------------------------------------------------------------------

function computeIndentDepths(lines: string[], masks: boolean[][]): number[] {
  const depths: number[] = [];
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const codeLine = extractCode(lines[i], masks[i]).toUpperCase();

    // Check for dedent-before keywords
    let dedentBefore = false;
    let dedentIndent = false;
    for (const kw of DEDENT_BEFORE) {
      if (hasKeyword(codeLine, kw)) {
        dedentBefore = true;
        break;
      }
    }
    if (!dedentBefore) {
      for (const kw of DEDENT_INDENT) {
        if (hasKeyword(codeLine, kw)) {
          dedentIndent = true;
          break;
        }
      }
    }

    if (dedentBefore) {
      depth = Math.max(0, depth - 1);
    } else if (dedentIndent) {
      depth = Math.max(0, depth - 1);
    }

    depths.push(depth);

    // Check for indent-after keywords
    if (dedentIndent) {
      // ELSE/ELSIF: already dedented, now re-indent for body
      depth++;
    } else {
      for (const kw of INDENT_AFTER) {
        if (hasKeyword(codeLine, kw)) {
          depth++;
          break;
        }
      }
    }
  }

  return depths;
}

/** Check if a keyword appears at a word boundary in the line. */
function hasKeyword(upperLine: string, keyword: string): boolean {
  const idx = upperLine.indexOf(keyword);
  if (idx < 0) return false;
  const before = idx > 0 ? upperLine[idx - 1] : " ";
  const after = idx + keyword.length < upperLine.length ? upperLine[idx + keyword.length] : " ";
  return !/\w/.test(before) && !/\w/.test(after);
}

/** Extract only code characters from a line using the mask. */
function extractCode(line: string, mask: boolean[]): string {
  return line
    .split("")
    .map((ch, i) => (mask[i] ? ch : " "))
    .join("");
}

// ---------------------------------------------------------------------------
// Pass 3: Code formatting
// ---------------------------------------------------------------------------

function applyCodeFormatting(line: string, mask: boolean[]): string {
  const chars = line.split("");

  // Uppercase keywords (only in code regions)
  let result = chars.join("");
  result = result.replace(KEYWORD_REGEX, (matched, _kw, offset: number) => {
    // Check that all characters of the match are in code regions
    for (let j = offset; j < offset + matched.length; j++) {
      if (j < mask.length && !mask[j]) return matched; // inside comment/string
    }
    return matched.toUpperCase();
  });

  // Normalize operator spacing (only in code regions)
  result = normalizeSpacing(result, mask);

  return result;
}

function normalizeSpacing(line: string, mask: boolean[]): string {
  // We rebuild the line character by character, applying spacing rules
  // only where the mask indicates code.
  // For simplicity, work with regex replacements and verify positions.

  // Assignment operator :=
  line = replaceInCode(line, mask, /\s*:=\s*/g, " := ");

  // Rebuild mask after potential length changes
  // Since we're doing replacements that may shift positions, we apply
  // spacing rules conservatively: only if surrounding chars are code.

  // Declaration colon (not part of :=)
  // Match `:` that's not preceded by `:` and not followed by `=`
  line = replaceInCode(line, mask, /\s*:\s*(?!=)/g, " : ", (match, offset, str) => {
    // Don't modify if this is part of :=
    if (offset > 0 && str[offset - 1] === ":") return false;
    // Only apply in declaration context (heuristic: inside VAR blocks)
    // This is tricky — for safety, only fix `:` that touches a non-space
    if (match === " : ") return false; // already correct
    return true;
  });

  // Comma spacing
  line = replaceInCode(line, mask, /\s*,\s*/g, ", ");

  // No space before semicolon
  line = replaceInCode(line, mask, /\s+;/g, ";");

  return line;
}

/**
 * Replace pattern matches in code regions only.
 * `shouldApply` is an optional filter.
 */
function replaceInCode(
  line: string,
  mask: boolean[],
  pattern: RegExp,
  replacement: string,
  shouldApply?: (match: string, offset: number, str: string) => boolean,
): string {
  // Since replacements change string length, we must rebuild the mask.
  // For simplicity, apply one replacement at a time from right to left.
  const matches: Array<{ start: number; end: number; matched: string }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags);
  while ((m = re.exec(line)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
  }

  // Apply from right to left to preserve positions
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, matched } = matches[i];

    // Check that start is in a code region
    if (start < mask.length && !mask[start]) continue;

    // Optional filter
    if (shouldApply && !shouldApply(matched, start, line)) continue;

    line = line.slice(0, start) + replacement + line.slice(end);
  }

  return line;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function replaceLineEdit(lineNum: number, original: string, newText: string): TextEdit {
  return TextEdit.replace(
    Range.create(Position.create(lineNum, 0), Position.create(lineNum, original.length)),
    newText,
  );
}
