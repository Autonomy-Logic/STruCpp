/**
 * STruC++ Built-in Standard Library
 *
 * Provides LibraryManifest objects for the built-in IEC 61131-3 standard
 * functions and standard function blocks.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { LibraryManifest } from "./library-manifest.js";
import { StdFunctionRegistry } from "../semantic/std-function-registry.js";

/**
 * Find the generated manifest file. It lives in src/stdlib/iec-standard-fb/
 * and is reachable from both src/ (test imports) and dist/ (production).
 */
function findManifestPath(): string {
  const __dir = dirname(fileURLToPath(import.meta.url));

  // When running from src/library/ → ../stdlib/iec-standard-fb/manifest.json
  const fromSrc = resolve(__dir, "../stdlib/iec-standard-fb/manifest.json");
  if (existsSync(fromSrc)) return fromSrc;

  // When running from dist/library/ → ../../src/stdlib/iec-standard-fb/manifest.json
  const fromDist = resolve(
    __dir,
    "../../src/stdlib/iec-standard-fb/manifest.json",
  );
  if (existsSync(fromDist)) return fromDist;

  throw new Error(
    `Standard FB library manifest not found. Run 'npm run build' to generate it.\n` +
      `  Searched: ${fromSrc}\n  Searched: ${fromDist}`,
  );
}

/** Cached manifest loaded from the generated JSON file */
let cachedStdFBManifest: LibraryManifest | undefined;

/**
 * Load the IEC 61131-3 standard function block library manifest.
 *
 * The manifest is generated at build time from the ST source files in
 * src/stdlib/iec-standard-fb/ by scripts/generate-stdlib-manifest.mjs.
 * This ensures the manifest always matches the actual ST source signatures.
 *
 * Users can reference TON, CTU, R_TRIG, etc. without any import directive.
 */
export function getStdFBLibraryManifest(): LibraryManifest {
  if (cachedStdFBManifest) return cachedStdFBManifest;

  const manifestPath = findManifestPath();
  const json = readFileSync(manifestPath, "utf-8");
  cachedStdFBManifest = JSON.parse(json) as LibraryManifest;
  return cachedStdFBManifest;
}

/**
 * Reset the cached manifest (used by tests after regeneration).
 */
export function resetStdFBManifestCache(): void {
  cachedStdFBManifest = undefined;
}

/**
 * Generate a LibraryManifest for the built-in standard library.
 * This manifest describes all standard functions for documentation and
 * library discovery purposes. The actual implementations live in the
 * C++ runtime headers.
 */
export function getBuiltinStdlibManifest(): LibraryManifest {
  const registry = new StdFunctionRegistry();
  const allFuncs = registry.getAll();

  return {
    name: "iec-stdlib",
    version: "1.0.0",
    description: "IEC 61131-3 standard function library",
    namespace: "strucpp",
    functions: allFuncs.map((fn) => ({
      name: fn.name,
      returnType: fn.specificReturnType ?? fn.returnConstraint,
      parameters: fn.params.map((p) => ({
        name: p.name,
        type: p.specificType ?? p.constraint,
        direction: p.isByRef ? ("inout" as const) : ("input" as const),
      })),
    })),
    functionBlocks: [],
    types: [],
    headers: [
      "iec_std_lib.hpp",
      "iec_string.hpp",
      "iec_time.hpp",
      "iec_date.hpp",
      "iec_dt.hpp",
      "iec_tod.hpp",
    ],
    isBuiltin: true,
  };
}
