// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Library Utilities — pure helpers.
 *
 * The Node-only `discoverSTFiles(dir)` helper lives in
 * `src/node/library-utils.ts`.  This module stays browser-safe.
 */

/**
 * Extract the body inside `namespace ... { ... }` from generated C++ code.
 * Strips includes, pragma once, and the namespace wrapper.
 *
 * Handles multiple namespace blocks in the same input — the codegen
 * splits implementation across one TU per POU plus a shared
 * configuration TU, and library-compiler concatenates all .cpp files
 * before extracting. Each block contributes its body; the closing `}`
 * of one block ends extraction for that block, and we keep scanning
 * for further `namespace ... {` openings.
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
      }
      continue;
    }

    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }

    if (braceDepth <= 0) {
      // End of this namespace block — keep walking the rest of the
      // input in case more blocks follow (multi-file concat).
      inNamespace = false;
      braceDepth = 0;
      continue;
    }
    if (/^\s*using namespace strucpp;/.test(line)) continue;

    bodyLines.push(line);
  }

  return bodyLines.join("\n");
}
