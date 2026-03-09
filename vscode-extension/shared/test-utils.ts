// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared test file detection utility.
 * Used by both server (document-manager.ts) and client (test-controller.ts).
 */

/**
 * Quick check if ST source is a test file by examining its first keyword.
 * Test files start with TEST or SETUP (after stripping comments and whitespace).
 */
export function isTestFile(source: string): boolean {
  const stripped = source
    .replace(/^\uFEFF/, "")             // strip UTF-8 BOM
    .replace(/\/\/.*$/gm, "")           // remove line comments
    .replace(/\(\*[\s\S]*?\*\)/g, "")   // remove block comments
    .trimStart();
  return /^(TEST|SETUP)\b/i.test(stripped);
}

/**
 * Extract the word (identifier) at a given position in source text.
 * Returns the full word and its start column (0-indexed), or undefined
 * if no identifier is found at the position.
 */
export function getWordAt(
  source: string,
  line: number,
  column: number,
): { word: string; startCol: number } | undefined {
  const lines = source.split("\n");
  const lineText = lines[line - 1];
  if (!lineText) return undefined;

  const col = column - 1; // 0-indexed
  // Expand left and right to find word boundaries
  let start = col;
  let end = col;
  while (start > 0 && /[\w]/.test(lineText[start - 1])) start--;
  while (end < lineText.length && /[\w]/.test(lineText[end])) end++;

  if (start === end) return undefined;
  return { word: lineText.substring(start, end), startCol: start };
}
