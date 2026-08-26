// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-only library utilities.  Browser / worker consumers don't
 * need filesystem walking — they either fetch source files
 * individually or receive them already loaded.
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { LIBRARY_SOURCE_EXTENSIONS } from "../library/native-sources.js";

/**
 * Recursively discover every library source file in a directory: the ST/IL
 * files STruC++ compiles, plus the C/C++ and Python files it transports for
 * the consumer to lower (see `library/native-sources.ts`).
 *
 * A native file is picked up on the same footing as an ST one — the author
 * drops `Block.py` in the folder next to `Other.st` and both end up in the
 * archive. Sorting the result keeps `sourceFiles` and diagnostics stable
 * across filesystems that enumerate in different orders.
 *
 * @param dir - Directory to scan
 * @returns Sorted absolute paths of every recognised library source
 */
export function discoverSTFiles(dir: string): string[] {
  const resolvedDir = resolve(dir);
  const entries = readdirSync(resolvedDir, {
    withFileTypes: true,
    recursive: true,
  });
  const found: string[] = [];
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (
      entry.isFile() &&
      LIBRARY_SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext))
    ) {
      // entry.parentPath is available in Node 20+; fallback to entry.path
      const parentPath =
        (entry as { parentPath?: string }).parentPath ??
        (entry as { path?: string }).path ??
        resolvedDir;
      found.push(join(parentPath, entry.name));
    }
  }
  return found.sort();
}
