// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * gcc-style diagnostic formatter.
 *
 * Renders CompileError entries as:
 *
 *   foo.st:5:10: error: undefined variable 'x'
 *       5 |     y := x + 1;
 *         |          ^
 *
 * Multi-line spans are clamped to the first line; `endColumn`, when
 * present and on the same line as `column`, widens the underline to
 * `^~~~`.  When source text is unavailable (no map entry, line out of
 * range) the formatter falls back to the bare location/severity/message
 * line so callers can hand it any error without crashing.
 */

import type { CompileError, Severity } from "./types.js";

/** A single ST source available for snippet rendering. */
export interface DiagnosticSource {
  /** Filename that errors reference via `error.file`. Use the basename. */
  fileName: string;
  /** Full file contents. */
  source: string;
}

interface ColorPalette {
  reset: string;
  bold: string;
  red: string;
  yellow: string;
  cyan: string;
  green: string;
}

const NO_COLOR_PALETTE: ColorPalette = {
  reset: "",
  bold: "",
  red: "",
  yellow: "",
  cyan: "",
  green: "",
};

const ANSI_PALETTE: ColorPalette = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
};

function getPalette(): ColorPalette {
  // Evaluated per-call so NO_COLOR / TTY changes during the process lifetime
  // (notably between tests) take effect immediately.
  if (typeof process === "undefined") return NO_COLOR_PALETTE;
  if (process.env.NO_COLOR !== undefined) return NO_COLOR_PALETTE;
  if (process.stderr === undefined || process.stderr.isTTY !== true) {
    return NO_COLOR_PALETTE;
  }
  return ANSI_PALETTE;
}

function severityColor(severity: Severity, palette: ColorPalette): string {
  switch (severity) {
    case "error":
      return palette.red;
    case "warning":
      return palette.yellow;
    default:
      return palette.cyan;
  }
}

/**
 * Build a fast lookup map from `fileName` -> source. Pass everything the CLI
 * has read: the primary input plus any additional sources / library sources.
 */
export function buildSourceMap(
  sources: DiagnosticSource[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of sources) {
    map.set(s.fileName, s.source);
  }
  return map;
}

/** Look up the Nth (1-indexed) line of `source`, or undefined if out of range. */
function getSourceLine(source: string, line: number): string | undefined {
  if (line < 1) return undefined;
  // Note: split() preserves trailing empty strings, so line counting is stable
  // even when files end without a final newline.
  const lines = source.split(/\r\n|\r|\n/);
  return lines[line - 1];
}

/**
 * Format a single diagnostic in gcc style. Returns a multi-line string with
 * no trailing newline.
 */
export function formatDiagnostic(
  error: CompileError,
  sourceMap: Map<string, string>,
): string {
  const palette = getPalette();
  const sevColor = severityColor(error.severity, palette);
  const fileLabel = error.file ?? "<input>";
  const header =
    `${palette.bold}${fileLabel}:${error.line}:${error.column}:${palette.reset} ` +
    `${sevColor}${palette.bold}${error.severity}:${palette.reset} ` +
    `${error.message}` +
    (error.code ? ` [${error.code}]` : "");

  const source = error.file ? sourceMap.get(error.file) : undefined;
  const sourceLine =
    source !== undefined ? getSourceLine(source, error.line) : undefined;

  if (sourceLine === undefined) {
    return header;
  }

  // Render gutter with the line number right-aligned to a 4-space minimum,
  // matching gcc's typical output width.
  const lineNumStr = String(error.line);
  const gutterWidth = Math.max(lineNumStr.length, 4);
  const lineGutter = `${palette.cyan}${lineNumStr.padStart(gutterWidth)} | ${palette.reset}`;
  const blankGutter = `${palette.cyan}${" ".repeat(gutterWidth)} | ${palette.reset}`;

  // Caret span. column is 1-indexed; clamp to the printed line width so we
  // never emit a caret past end-of-line for stale columns.
  const col = Math.max(1, error.column);
  const sameLineEnd =
    error.endLine !== undefined && error.endLine !== error.line
      ? sourceLine.length + 1
      : (error.endColumn ?? col + 1);
  const endCol = Math.max(
    col + 1,
    Math.min(sameLineEnd, sourceLine.length + 1),
  );
  const underlineLen = endCol - col;

  // Use the original line's whitespace under the caret so tabs line up with
  // the source rather than getting collapsed to a single space.
  const padding = sourceLine.substring(0, col - 1).replace(/[^\t]/g, " ");
  const caret = `${sevColor}${palette.bold}^${"~".repeat(Math.max(0, underlineLen - 1))}${palette.reset}`;

  let out = `${header}\n${lineGutter}${sourceLine}\n${blankGutter}${padding}${caret}`;

  if (error.suggestion) {
    out += `\n${blankGutter}${palette.green}note:${palette.reset} ${error.suggestion}`;
  }
  return out;
}

/**
 * Format a list of diagnostics, one per entry, separated by blank lines.
 * Convenience wrapper over `formatDiagnostic`.
 */
export function formatDiagnostics(
  errors: CompileError[],
  sources: DiagnosticSource[],
): string {
  const map = buildSourceMap(sources);
  return errors.map((e) => formatDiagnostic(e, map)).join("\n");
}
