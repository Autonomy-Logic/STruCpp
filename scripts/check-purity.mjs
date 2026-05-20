#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Architecture guard: scan every `.ts` file under `src/` outside the
 * `src/node/` subdirectory and verify it doesn't reach for any
 * Node-only API.  Run from CI so a future change can't silently
 * break browser-runnability.
 *
 * What counts as a violation:
 *   - `import … from "node:*"` (any `node:` prefix)
 *   - `import … from "fs" | "path" | "os" | "child_process"`
 *     and the rest of the Node built-in list
 *   - A bare `Buffer` identifier (Node global; not in browser)
 *   - `process.X` accesses (we tolerate `process.env` since
 *     `import.meta.env` plus the env-aware browser bundler is the
 *     other allowed pattern, but everything else trips)
 *
 * False positives can be opted out with `// purity-ok: <reason>` on
 * the offending line.  Reach for that escape hatch carefully —
 * each one is a future bug magnet if the surrounding code grows.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..")
const SRC = join(ROOT, "src")
const NODE_ONLY_DIR = join(SRC, "node")

const NODE_BUILTINS = [
  "fs",
  "path",
  "os",
  "child_process",
  "url",
  "util",
  "zlib",
  "stream",
  "crypto",
  "buffer",
  "tty",
  "vm",
  "v8",
  "worker_threads",
  "cluster",
]

const importPattern = new RegExp(
  String.raw`(?:^|;)\s*(?:import|export)\b[^;]*?\bfrom\s*` +
    `["'](?:node:[\\w/]+|(?:${NODE_BUILTINS.join("|")}))["']`,
  "m",
)
const bufferIdentifier = /(?<![\w.])Buffer(?:\.|\b)/
const processAccess = /\bprocess\.(?!env\b)\w+/
const purityOkComment = /\/\/\s*purity-ok\b/

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full === NODE_ONLY_DIR) continue
      yield* walk(full)
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield full
    }
  }
}

/**
 * Skip lines that are inside JSDoc / block / line comments.  We
 * don't run a full tokenizer — every reference we care about
 * shows up either at the top of a file (imports) or inside
 * regular code, and the false-positive surface is dominated by
 * JSDoc lines starting with ` * `.  This heuristic covers them
 * plus single-line comments without becoming a tokenizer.
 */
function stripCommentLines(text) {
  const out = []
  let inBlock = false
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim()
    if (inBlock) {
      if (trimmed.endsWith("*/")) inBlock = false
      out.push("")
      continue
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.endsWith("*/")) inBlock = true
      out.push("")
      continue
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      out.push("")
      continue
    }
    out.push(raw)
  }
  return out
}

const violations = []
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf-8")
  const lines = stripCommentLines(text)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (purityOkComment.test(line)) continue
    if (importPattern.test(line)) {
      violations.push({
        file,
        line: i + 1,
        match: line.trim(),
        rule: "node-builtin import",
      })
    }
    if (bufferIdentifier.test(line) && !/\bUint8Array\b/.test(line)) {
      violations.push({
        file,
        line: i + 1,
        match: line.trim(),
        rule: "Buffer identifier",
      })
    }
    if (processAccess.test(line)) {
      violations.push({
        file,
        line: i + 1,
        match: line.trim(),
        rule: "process.* access (only process.env tolerated)",
      })
    }
  }
}

if (violations.length === 0) {
  console.log(
    "[check-purity] ✓ Browser-runnable source surface is clean " +
      `(${[...walk(SRC)].length} files scanned, src/node/ excluded).`,
  )
  // Use NODE_ONLY_DIR + statSync just to silence unused-import lints
  // from leaner toolchains; the value is used by the directory walker.
  statSync(NODE_ONLY_DIR)
  process.exit(0)
}

console.error(
  `[check-purity] ✗ ${violations.length} violation(s) found:\n`,
)
for (const v of violations) {
  console.error(`  ${relative(ROOT, v.file)}:${v.line}`)
  console.error(`    ${v.rule}`)
  console.error(`    ${v.match}\n`)
}
process.exit(1)
