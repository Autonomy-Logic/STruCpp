// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-backed implementation of `WorkspaceFs`.
 *
 * Kept in its own module so the browser bundle never pulls in
 * `node:fs` transitively — the browser entry uses `NullWorkspaceFs`
 * from `./workspace-fs.js` and never imports this file.
 */

import * as fs from "node:fs";
import type { WorkspaceFs, WorkspaceFsEntry } from "./workspace-fs.js";

export const NodeWorkspaceFs: WorkspaceFs = {
  readFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  },
  realpath(dir: string): string | null {
    try {
      return fs.realpathSync(dir);
    } catch {
      return null;
    }
  },
  readDir(dir: string): WorkspaceFsEntry[] | null {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        isSymbolicLink: e.isSymbolicLink(),
      }));
    } catch {
      return null;
    }
  },
};
