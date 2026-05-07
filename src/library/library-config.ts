// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Library configuration file (`library.json`).
 *
 * Each library on disk lives in `libs/sources/<lib-name>/` and ships a
 * `library.json` next to its `.st` source files. The JSON carries every
 * field of the .stlib manifest that ISN'T derivable from the ST sources:
 *
 *   - identity (name, version, namespace)
 *   - human-readable description
 *   - the `isBuiltin` flag
 *   - block-level documentation prose (one entry per FUNCTION_BLOCK)
 *   - function-level documentation prose (one entry per FUNCTION)
 *
 * The build flow is:
 *
 *   1. Read library.json from the library's source directory
 *      (loadLibraryConfig).
 *   2. Read all .st files alongside it.
 *   3. Call compileStlib(sources, options-from-config).
 *   4. Merge per-block / per-function documentation into the resulting
 *      manifest entries (applyLibraryConfigDocumentation), validating
 *      that every doc'd name actually appears in the compiled output.
 *
 * library.json is the single source of truth for library metadata.
 * Build scripts may still hardcode defaults for libraries that haven't
 * been migrated yet — loadLibraryConfig returns null when the file is
 * absent, and the caller falls back to its own constants.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import type { StlibArchive } from "./library-manifest.js";

/**
 * Parsed shape of a `library.json` file.
 *
 * Required fields mirror the corresponding `.stlib` manifest fields so a
 * library with no .st sources at all (purely-imported lib, e.g. OSCAT)
 * could in theory ship just a `library.json` + `.stlib` archive.
 *
 * `blocks` and `functions` are name-keyed maps so the JSON file reads
 * naturally — one block per top-level entry — and the build script can
 * cross-check each name against the compiled manifest's `functionBlocks[]`
 * / `functions[]`.
 */
export interface LibraryConfig {
  /** Library identity. Must match what the consumer references. */
  name: string;
  /** SemVer-like version string. */
  version: string;
  /** C++ namespace the compiled archive lives in. */
  namespace: string;
  /** Human-readable summary surfaced in tooling. */
  description?: string;
  /** Marks the library as a built-in runtime library (vs. user-installed). */
  isBuiltin?: boolean;
  /** Block-level documentation, keyed by FB name. */
  blocks?: Record<string, { documentation: string }>;
  /** Function-level documentation, keyed by function name. */
  functions?: Record<string, { documentation: string }>;
}

/**
 * Read the `library.json` sitting at `<sourcesDir>/library.json`. Returns
 * `null` if the file is absent — callers fall back to their own defaults.
 *
 * Throws on parse errors (malformed JSON) and on schema violations
 * (missing required fields, wrong type) so build failures are loud and
 * pinpoint the misconfigured file.
 */
export function loadLibraryConfig(sourcesDir: string): LibraryConfig | null {
  const path = resolve(sourcesDir, "library.json");
  if (!existsSync(path)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${path}: invalid JSON — ${msg}`);
  }

  return validateLibraryConfig(raw, path);
}

function validateLibraryConfig(raw: unknown, path: string): LibraryConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${path}: top-level value must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  for (const required of ["name", "version", "namespace"]) {
    if (typeof obj[required] !== "string" || obj[required] === "") {
      throw new Error(`${path}: missing or non-string field "${required}"`);
    }
  }

  const config: LibraryConfig = {
    name: obj.name as string,
    version: obj.version as string,
    namespace: obj.namespace as string,
  };
  if (typeof obj.description === "string") config.description = obj.description;
  if (typeof obj.isBuiltin === "boolean") config.isBuiltin = obj.isBuiltin;

  if (obj.blocks !== undefined) {
    config.blocks = validateDocMap(obj.blocks, "blocks", path);
  }
  if (obj.functions !== undefined) {
    config.functions = validateDocMap(obj.functions, "functions", path);
  }
  return config;
}

function validateDocMap(
  value: unknown,
  field: string,
  path: string,
): Record<string, { documentation: string }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: "${field}" must be an object map`);
  }
  const map = value as Record<string, unknown>;
  const out: Record<string, { documentation: string }> = {};
  for (const [name, entry] of Object.entries(map)) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(
        `${path}: ${field}["${name}"] must be an object with a "documentation" field`,
      );
    }
    const entryObj = entry as Record<string, unknown>;
    if (typeof entryObj.documentation !== "string") {
      throw new Error(
        `${path}: ${field}["${name}"].documentation must be a string`,
      );
    }
    out[name] = { documentation: entryObj.documentation };
  }
  return out;
}

/**
 * Result of merging documentation into a compiled archive.
 * `unknownBlockDocs` / `unknownFunctionDocs` carry names that appeared
 * in `library.json` but don't exist in the compiled manifest — usually
 * a typo or a stale entry left behind when an FB was renamed. Build
 * scripts should treat this as a hard error.
 */
export interface ApplyDocumentationResult {
  /** Number of FBs that received documentation. */
  blocksDocumented: number;
  /** Number of functions that received documentation. */
  functionsDocumented: number;
  /** Block names doc'd in library.json but absent from the manifest. */
  unknownBlockDocs: string[];
  /** Function names doc'd in library.json but absent from the manifest. */
  unknownFunctionDocs: string[];
}

/**
 * Merge `LibraryConfig.blocks` and `.functions` documentation into the
 * compiled archive's manifest, in place. Returns a report of what was
 * applied and what was unmatched so the caller can fail the build on
 * mismatch.
 *
 * Names are matched case-sensitively — STruC++ FB / function names are
 * uppercased by the parser before they reach the manifest, so the
 * library.json keys must use the same casing the source declares.
 */
export function applyLibraryConfigDocumentation(
  archive: StlibArchive,
  config: LibraryConfig,
): ApplyDocumentationResult {
  const result: ApplyDocumentationResult = {
    blocksDocumented: 0,
    functionsDocumented: 0,
    unknownBlockDocs: [],
    unknownFunctionDocs: [],
  };

  if (config.blocks) {
    const fbByName = new Map(
      archive.manifest.functionBlocks.map((fb) => [fb.name, fb]),
    );
    for (const [name, entry] of Object.entries(config.blocks)) {
      const fb = fbByName.get(name);
      if (!fb) {
        result.unknownBlockDocs.push(name);
        continue;
      }
      fb.documentation = entry.documentation;
      result.blocksDocumented++;
    }
  }

  if (config.functions) {
    const fnByName = new Map(
      archive.manifest.functions.map((fn) => [fn.name, fn]),
    );
    for (const [name, entry] of Object.entries(config.functions)) {
      const fn = fnByName.get(name);
      if (!fn) {
        result.unknownFunctionDocs.push(name);
        continue;
      }
      fn.documentation = entry.documentation;
      result.functionsDocumented++;
    }
  }

  return result;
}
