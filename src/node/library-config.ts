// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-only file-shaped wrappers around the pure library-config
 * parsers.  Browser / worker consumers fetch the JSON text
 * themselves and call `loadLibraryConfigFromString` directly.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  loadLibraryConfigFromString,
  type LibraryConfig,
} from "../library/library-config.js";

/**
 * Read `<sourcesDir>/library.json` and parse it.  Returns `null` if
 * the file is absent — callers fall back to their own defaults.
 */
export function loadLibraryConfig(sourcesDir: string): LibraryConfig | null {
  const path = resolve(sourcesDir, "library.json");
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return loadLibraryConfigFromString(raw, path);
}
