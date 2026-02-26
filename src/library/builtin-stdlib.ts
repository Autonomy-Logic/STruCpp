/**
 * STruC++ Built-in Standard Library
 *
 * Provides the pre-compiled IEC 61131-3 standard function block library
 * (as a StlibArchive) and a LibraryManifest for the built-in C++ runtime
 * standard functions.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { LibraryManifest } from "./library-manifest.js";
import type { StlibArchive } from "./library-manifest.js";
import { loadStlibArchive } from "./library-loader.js";
import { StdFunctionRegistry } from "../semantic/std-function-registry.js";

/**
 * Find the generated `.stlib` file. It lives in src/stdlib/iec-standard-fb/
 * and is reachable from both src/ (test imports), dist/ (production),
 * and pkg-bundled binaries.
 */
function findStlibPath(): string {
  const target = "iec-standard-fb.stlib";
  const candidates: string[] = [];

  // From import.meta.url (ESM / ts-node / vitest)
  try {
    if (typeof import.meta?.url === "string") {
      const metaDir = dirname(fileURLToPath(import.meta.url));
      // src/library/ → ../stdlib/iec-standard-fb/
      candidates.push(resolve(metaDir, "../stdlib/iec-standard-fb", target));
      // dist/library/ → ../../src/stdlib/iec-standard-fb/
      candidates.push(
        resolve(metaDir, "../../src/stdlib/iec-standard-fb", target),
      );
    }
  } catch {
    // unavailable in CJS bundle / pkg binary
  }

  // From __dirname (CJS bundle via esbuild)
  if (typeof __dirname === "string") {
    candidates.push(resolve(__dirname, "../stdlib/iec-standard-fb", target));
    candidates.push(
      resolve(__dirname, "../../src/stdlib/iec-standard-fb", target),
    );
    candidates.push(resolve(__dirname, "src/stdlib/iec-standard-fb", target));
  }

  // Relative to binary (pkg binary in dist/bin/)
  const execDir = dirname(process.execPath);
  for (const base of [
    execDir,
    resolve(execDir, ".."),
    resolve(execDir, "..", ".."),
  ]) {
    candidates.push(resolve(base, "src/stdlib/iec-standard-fb", target));
  }

  // CWD fallback
  candidates.push(resolve(process.cwd(), "src/stdlib/iec-standard-fb", target));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Standard FB library archive not found. Run 'npm run build' to generate it.\n` +
      `  Searched:\n${candidates.map((c) => `    ${c}`).join("\n")}`,
  );
}

/** Cached archive loaded from the generated `.stlib` file */
let cachedStdFBArchive: StlibArchive | undefined;

/**
 * Load the IEC 61131-3 standard function block library as a StlibArchive.
 *
 * The archive is generated at build time from the ST source files in
 * src/stdlib/iec-standard-fb/ by scripts/generate-stdlib.mjs.
 * It contains the manifest, pre-compiled C++ code, and original ST sources.
 */
export function getStdFBLibrary(): StlibArchive {
  if (cachedStdFBArchive) return cachedStdFBArchive;

  const stlibPath = findStlibPath();
  const json: unknown = JSON.parse(readFileSync(stlibPath, "utf-8"));
  cachedStdFBArchive = loadStlibArchive(json);
  return cachedStdFBArchive;
}

/**
 * Reset the cached archive (used by tests after regeneration).
 */
export function resetStdFBCache(): void {
  cachedStdFBArchive = undefined;
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
