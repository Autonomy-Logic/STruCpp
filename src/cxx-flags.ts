// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Pure C++ flag-string parsers.
 *
 * Extracted from `build-utils.ts` so the Node-only build helpers
 * can be split into `strucpp/node`.  These two functions are
 * string math — they don't touch the filesystem or spawn processes
 * and are safe to import from a browser worker.
 */

/**
 * Split a --cxx-flags string into individual arguments,
 * respecting double-quoted segments (e.g. '-I"/path with spaces"').
 */
export function splitCxxFlags(flags: string): string[] {
  if (!flags || !flags.trim()) return [];
  const parts = flags.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((p) => p.replace(/^"|"$/g, ""));
}

/**
 * Extract `-I` include paths from a compiler flags string.
 * Handles: `-I/path`, `-I /path`, `-I"/path with spaces"`.
 */
export function extractIncludePaths(flags: string): string[] {
  const paths: string[] = [];
  const parts = flags.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i] ?? "";
    const part = raw.replace(/^"|"$/g, "");
    if (part === "-I" && i + 1 < parts.length) {
      i++;
      paths.push((parts[i] ?? "").replace(/^"|"$/g, ""));
    } else if (part.startsWith("-I")) {
      paths.push(part.slice(2));
    }
  }
  return paths;
}
