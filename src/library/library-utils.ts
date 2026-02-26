/**
 * STruC++ Library Utilities
 *
 * Shared utility functions used by the library compiler, build scripts,
 * and the compilation pipeline.
 */

import { readdirSync } from "fs";
import { resolve, join } from "path";

/**
 * Extract the body inside `namespace ... { ... }` from generated C++ code.
 * Strips includes, pragma once, and the namespace wrapper.
 */
export function extractNamespaceBody(code: string): string {
  const lines = code.split("\n");
  let inNamespace = false;
  let braceDepth = 0;
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (!inNamespace) {
      if (/^namespace\s+\w+\s*\{/.test(line)) {
        inNamespace = true;
        braceDepth = 1;
        continue;
      }
      continue;
    }

    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }

    if (braceDepth <= 0) break;
    if (/^\s*using namespace strucpp;/.test(line)) continue;

    bodyLines.push(line);
  }

  return bodyLines.join("\n");
}

/**
 * Recursively discover all `.st` files in a directory.
 *
 * @param dir - Directory to scan
 * @returns Array of absolute paths to `.st` files
 */
export function discoverSTFiles(dir: string): string[] {
  const resolvedDir = resolve(dir);
  const entries = readdirSync(resolvedDir, {
    withFileTypes: true,
    recursive: true,
  });
  const stFiles: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".st")) {
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
