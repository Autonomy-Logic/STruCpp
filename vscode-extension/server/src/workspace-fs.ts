// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Workspace filesystem adapter.
 *
 * DocumentManager needs to read `.st` files from disk to assemble
 * multi-file analysis contexts.  The Node language server can do
 * that directly with `node:fs`; the browser language server cannot
 * (no filesystem in a Web Worker).
 *
 * This module abstracts the three fs operations DocumentManager
 * actually uses (`readFile`, `realpath`, `readDir`) so the browser
 * server can pass a `NullWorkspaceFs` that always reports "nothing
 * on disk", forcing all sources to flow through LSP `didOpen`
 * notifications instead.  Tests can pass in-memory adapters to
 * exercise discovery logic without touching the real filesystem.
 *
 * Keeping the interface narrow (three methods) avoids leaking the
 * full `fs` surface into the abstraction.  Anything DocumentManager
 * doesn't already use stays out.
 */

export interface WorkspaceFsEntry {
  /** Entry name relative to the parent directory. */
  name: string;
  /** True if the entry is a directory. */
  isDirectory: boolean;
  /** True if the entry is a symbolic link. */
  isSymbolicLink: boolean;
}

export interface WorkspaceFs {
  /**
   * Read a file's text content.  Returns `null` if the file is
   * unreadable, missing, or the adapter doesn't support disk access.
   * Implementations must NOT throw — discovery code treats `null` as
   * "skip this file".
   */
  readFile(filePath: string): string | null;

  /**
   * Resolve symbolic links to a canonical path so the discovery
   * walker can detect cycles.  Returns `null` if the directory does
   * not exist or the adapter doesn't track real paths.
   */
  realpath(dir: string): string | null;

  /**
   * List the entries of a directory.  Returns `null` when the
   * directory is unreadable or doesn't exist.  Implementations must
   * NOT throw.
   */
  readDir(dir: string): WorkspaceFsEntry[] | null;
}

/**
 * Workspace adapter that always reports an empty filesystem.
 *
 * Used by the browser language server: every workspace .st source
 * is expected to arrive via LSP `didOpen`, never from disk.
 * Discovery walks short-circuit immediately because `readDir`
 * returns `null`.
 */
export const NullWorkspaceFs: WorkspaceFs = {
  readFile() {
    return null;
  },
  realpath() {
    return null;
  },
  readDir() {
    return null;
  },
};
