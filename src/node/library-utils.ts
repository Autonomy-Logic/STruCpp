// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-only library utilities.  Browser / worker consumers don't
 * need filesystem walking — they either fetch source files
 * individually or receive them already loaded.
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Recursively discover all `.st` and `.il` files in a directory.
 *
 * @param dir - Directory to scan
 * @returns Array of absolute paths to `.st` and `.il` files
 */
export function discoverSTFiles(dir: string): string[] {
  const resolvedDir = resolve(dir);
  const entries = readdirSync(resolvedDir, {
    withFileTypes: true,
    recursive: true,
  });
  const stFiles: string[] = [];
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (entry.isFile() && (lower.endsWith(".st") || lower.endsWith(".il"))) {
      // entry.parentPath is available in Node 20+; fallback to entry.path
      const parentPath =
        (entry as { parentPath?: string }).parentPath ??
        (entry as { path?: string }).path ??
        resolvedDir;
      stFiles.push(join(parentPath, entry.name));
    }
  }
  return stFiles.sort();
}
