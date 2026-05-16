// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-only file-shaped wrappers around the pure library-loader.
 *
 * Browser / worker consumers fetch bytes themselves and use the
 * pure `loadStlibArchive` / `loadStlibFromString` /
 * `loadStlibFromBuffer` / `loadLibraryManifest` helpers exported
 * from `strucpp`.  This module provides the convenience surface
 * for tooling that runs on disk — the CLI, the openplc-editor
 * compile pipeline, the rebuild scripts.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  LibraryManifestError,
  loadLibraryManifest,
  loadStlibFromString,
} from "../library/library-loader.js";
import type {
  LibraryManifest,
  StlibArchive,
} from "../library/library-manifest.js";

/**
 * Load a library manifest from a `.stlib.json` file on disk.
 */
export function loadLibraryFromFile(manifestPath: string): LibraryManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch (e) {
    throw new LibraryManifestError(
      `Cannot read library manifest: ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new LibraryManifestError(
      `Invalid JSON in library manifest: ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return loadLibraryManifest(json);
}

/**
 * Discover and load all library manifests (`*.stlib.json`) in a directory.
 */
export function discoverLibraries(dirPath: string): LibraryManifest[] {
  const resolvedDir = resolve(dirPath);
  let entries: string[];
  try {
    entries = readdirSync(resolvedDir);
  } catch (e) {
    throw new LibraryManifestError(
      `Cannot read library directory: ${resolvedDir}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const manifests: LibraryManifest[] = [];
  for (const entry of entries) {
    if (entry.endsWith(".stlib.json")) {
      manifests.push(loadLibraryFromFile(join(resolvedDir, entry)));
    }
  }
  return manifests;
}

/**
 * Load a `.stlib` archive from a file on disk.
 */
export function loadStlibFromFile(path: string): StlibArchive {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new LibraryManifestError(
      `Cannot read stlib archive: ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return loadStlibFromString(raw, path);
}

/**
 * Discover and load all `.stlib` archives in a directory (non-recursive).
 */
export function discoverStlibs(dirPath: string): StlibArchive[] {
  const resolvedDir = resolve(dirPath);
  let entries: string[];
  try {
    entries = readdirSync(resolvedDir);
  } catch (e) {
    throw new LibraryManifestError(
      `Cannot read library directory: ${resolvedDir}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const archives: StlibArchive[] = [];
  for (const entry of entries) {
    if (entry.endsWith(".stlib")) {
      archives.push(loadStlibFromFile(join(resolvedDir, entry)));
    }
  }
  return archives;
}
