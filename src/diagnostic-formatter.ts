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

function getPalette(enableColor: boolean): ColorPalette {
  return enableColor ? ANSI_PALETTE : NO_COLOR_PALETTE;
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
 * Options for {@link formatDiagnostic}.  All fields are optional; the
 * default rendering matches the long-standing CLI / vscode-extension
 * behaviour — programmatic consumers opt in to the newer behaviours.
 */
export interface FormatDiagnosticOptions {
  /**
   * When `true`, body-attributed diagnostics (`error.section === 'body'`
   * with `error.bodyLine` set) are rendered with the body-relative
   * line number in both the header column and the snippet gutter,
   * matching what an editor like the OpenPLC Editor shows in its
   * Monaco body view.  The source content is still read from the
   * raw `error.line` in the per-POU file under the hood; only the
   * displayed numbers change.
   *
   * Default: `false` (preserves the absolute file line in every
   * field — this is what `strucpp` CLI users and the vscode
   * extension see today).
   */
  preferBodyLine?: boolean;

  /**
   * When `true`, the formatter wraps severity / location / source
   * markers in ANSI escape sequences.  Default `false` so a
   * formatter call from a browser or a test always returns plain
   * text.  The CLI flips this based on `process.env.NO_COLOR` /
   * `process.stderr.isTTY`.
   */
  enableColor?: boolean;
}

/**
 * Format a single diagnostic in gcc style. Returns a multi-line string with
 * no trailing newline.
 */
export function formatDiagnostic(
  error: CompileError,
  sourceMap: Map<string, string>,
  options?: FormatDiagnosticOptions,
): string {
  const palette = getPalette(options?.enableColor === true);
  const sevColor = severityColor(error.severity, palette);
  const fileLabel = error.file ?? "<input>";

  // Body-relative numbering is opt-in: CLI and vscode users keep the
  // absolute (file, line) reporting they've always had; programmatic
  // consumers like the OpenPLC Editor pass `preferBodyLine: true` to
  // get numbers that match their Monaco body view.
  const displayLine =
    options?.preferBodyLine === true &&
    error.section === "body" &&
    error.bodyLine !== undefined
      ? error.bodyLine
      : error.line;

  const header =
    `${palette.bold}${fileLabel}:${displayLine}:${error.column}:${palette.reset} ` +
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
  const lineNumStr = String(displayLine);
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
  options?: FormatDiagnosticOptions,
): string {
  const map = buildSourceMap(sources);
  return errors.map((e) => formatDiagnostic(e, map, options)).join("\n");
}
