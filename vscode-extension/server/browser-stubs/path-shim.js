// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
//
// Browser shim for `path` / `node:path`.
//
// strucpp's DocumentManager uses `path.basename`, `path.dirname`,
// and `path.join` to derive readable file names from in-memory
// URIs (`inmemory://pou/<name>.st`).  These are pure string
// operations — perfectly fine in a Web Worker — but the bundle
// has no `path` module unless we provide one.  Earlier the
// `node-empty.js` throw-stub was the alias target; that crashed
// the moment DocumentManager processed an LSP didChange.
//
// We implement only the surface DocumentManager actually uses.
// Behaviour mirrors Node's `posix` semantics — the only consumer
// is a worker that sees `/`-separated URI paths.  Trailing slashes
// are stripped before lookup, the way Node does.

function stripTrailingSlash(p) {
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47 /* "/" */) end--;
  return p.slice(0, end);
}

export function basename(p, ext) {
  if (typeof p !== "string") return "";
  const trimmed = stripTrailingSlash(p);
  const slash = trimmed.lastIndexOf("/");
  let name = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  if (typeof ext === "string" && ext.length > 0 && name.endsWith(ext)) {
    name = name.slice(0, name.length - ext.length);
  }
  return name;
}

export function dirname(p) {
  if (typeof p !== "string") return ".";
  const trimmed = stripTrailingSlash(p);
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return ".";
  if (slash === 0) return "/";
  return trimmed.slice(0, slash);
}

export function join(...parts) {
  const segments = [];
  for (const part of parts) {
    if (typeof part !== "string" || part.length === 0) continue;
    segments.push(part);
  }
  if (segments.length === 0) return ".";
  // Normalise: collapse double slashes that arise when "/a" follows
  // "b" → "b//a"; we keep behaviour close to posix.join's
  // observable string output.
  return segments
    .join("/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "") || "/";
}

export function resolve(...parts) {
  // DocumentManager doesn't actually need cwd-relative resolution,
  // but library-loader's `discoverStlibs` calls `resolve(dirPath)`.
  // Treat resolve as join's last-segment behaviour for our use.
  return join(...parts) || "/";
}

export function extname(p) {
  if (typeof p !== "string") return "";
  const base = basename(p);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return ""; // leading-dot files have no extension
  return base.slice(dot);
}

export const sep = "/";
export const delimiter = ":";

export default {
  basename,
  dirname,
  join,
  resolve,
  extname,
  sep,
  delimiter,
};
