// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * POU Formatter — shared by V2.3 and V3 parsers.
 *
 * Converts ExtractedPOU intermediate representations into clean .st source text.
 */

import type { ExtractedPOU } from "./types.js";

/** Map POU type to its END marker. */
const END_MARKERS: Record<string, string> = {
  FUNCTION: "END_FUNCTION",
  FUNCTION_BLOCK: "END_FUNCTION_BLOCK",
  PROGRAM: "END_PROGRAM",
};

/**
 * Format a single ExtractedPOU into a complete .st source string.
 * Normalizes line endings, trims whitespace, and adds proper END markers.
 */
export function formatPOU(pou: ExtractedPOU): string {
  const decl = pou.declaration.replace(/\r\n/g, "\n").trimEnd();
  const impl = pou.implementation.replace(/\r\n/g, "\n").trimEnd();

  // TYPE and GVL are already self-contained with their own END markers
  if (pou.type === "TYPE" || pou.type === "GVL") {
    return decl + "\n";
  }

  const endMarker = END_MARKERS[pou.type] ?? `END_${pou.type}`;
  const parts: string[] = [decl];

  if (impl) {
    parts.push(""); // blank line between declaration and implementation
    parts.push(impl);
  }

  parts.push("");
  parts.push(endMarker);
  parts.push("");

  return parts.join("\n");
}

/**
 * Convert an array of ExtractedPOUs into source file entries suitable
 * for `compileStlib()`. The POU's `category` (folder path inside the
 * source library) and `documentation` (variables-pane doc block) are
 * forwarded so the compiler can attach them to the resulting manifest
 * entries — sources stay flat in the archive, but the manifest carries
 * the metadata the upstream binary preserved.
 */
export function pouToSources(pous: ExtractedPOU[]): Array<{
  fileName: string;
  source: string;
  category?: string;
  documentation?: string;
}> {
  return pous.map((pou) => {
    const entry: {
      fileName: string;
      source: string;
      category?: string;
      documentation?: string;
    } = {
      fileName: pou.type === "GVL" ? `${pou.name}.gvl.st` : `${pou.name}.st`,
      source: formatPOU(pou),
    };
    if (pou.category) entry.category = pou.category;
    if (pou.documentation) entry.documentation = pou.documentation;
    return entry;
  });
}
