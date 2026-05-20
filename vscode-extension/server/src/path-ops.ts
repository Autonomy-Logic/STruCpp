// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Tiny path-string helpers used by DocumentManager.
 *
 * The Node server runs against real disk paths (POSIX `/` on
 * macOS / Linux, Windows `\`).  The browser server only sees
 * synthetic in-memory URIs (`inmemory://pou/<name>.st`) and never
 * touches the filesystem.  These helpers handle both — they split
 * on either separator and join with `/` (Node accepts forward
 * slashes everywhere it accepts backslashes, including on Windows).
 *
 * Pure string operations only.  No `node:path` import, so this
 * module is safe to pull into the browser bundle.
 */

/** Return the final segment of a path, treating both `/` and `\` as separators. */
export function basename(p: string): string {
  if (!p) return ""
  // Strip trailing slashes (a single slash represents root → return "").
  let end = p.length
  while (end > 1) {
    const c = p.charCodeAt(end - 1)
    if (c !== 47 /* "/" */ && c !== 92 /* "\\" */) break
    end--
  }
  let start = end
  while (start > 0) {
    const c = p.charCodeAt(start - 1)
    if (c === 47 || c === 92) break
    start--
  }
  return p.slice(start, end)
}

/**
 * Return everything up to (but not including) the last separator.
 * Returns "." when the path has no separator, matching POSIX
 * `dirname` semantics.
 */
export function dirname(p: string): string {
  if (!p) return "."
  let end = p.length
  // Trim trailing separators first.
  while (end > 1) {
    const c = p.charCodeAt(end - 1)
    if (c !== 47 && c !== 92) break
    end--
  }
  let i = end
  while (i > 0) {
    const c = p.charCodeAt(i - 1)
    if (c === 47 || c === 92) break
    i--
  }
  if (i === 0) return "."
  if (i === 1) return p.charAt(0) === "/" || p.charAt(0) === "\\" ? p.charAt(0) : "."
  return p.slice(0, i - 1)
}

/**
 * Join path segments with `/`.  Drops empty segments and collapses
 * runs of separators, matching the behaviour we depend on.  We
 * always emit `/` because Node accepts it on every platform.
 */
export function join(...parts: string[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    out.push(part)
  }
  if (out.length === 0) return "."
  return out
    .join("/")
    .replace(/[\\/]{2,}/g, "/")
    .replace(/[\\/]$/, "") || "/"
}
