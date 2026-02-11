/**
 * STruC++ Built-in Standard Library
 *
 * Generates a LibraryManifest representing the built-in IEC 61131-3 standard
 * functions. These are always available and backed by C++ runtime templates.
 */

import type { LibraryManifest } from "./library-manifest.js";
import { StdFunctionRegistry } from "../semantic/std-function-registry.js";

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
