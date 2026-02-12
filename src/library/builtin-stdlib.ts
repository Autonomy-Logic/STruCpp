/**
 * STruC++ Built-in Standard Library
 *
 * Generates a LibraryManifest representing the built-in IEC 61131-3 standard
 * functions. These are always available and backed by C++ runtime templates.
 */

import type { LibraryManifest } from "./library-manifest.js";
import { StdFunctionRegistry } from "../semantic/std-function-registry.js";

/**
 * Generate a LibraryManifest for the IEC 61131-3 standard function blocks.
 * These FBs are auto-loaded so users can reference TON, CTU, R_TRIG, etc.
 * without any import directive.
 *
 * The actual ST source files live in src/stdlib/iec-standard-fb/ and can be
 * compiled independently via compileLibrary(). This hardcoded manifest avoids
 * a build-time compilation step while keeping the FB signatures available.
 */
export function getStdFBLibraryManifest(): LibraryManifest {
  return {
    name: "iec-standard-fb",
    version: "1.0.0",
    description: "IEC 61131-3 Standard Function Blocks",
    namespace: "strucpp",
    functions: [],
    functionBlocks: [
      // Edge Detection
      {
        name: "R_TRIG",
        inputs: [{ name: "CLK", type: "BOOL" }],
        outputs: [{ name: "Q", type: "BOOL" }],
        inouts: [],
      },
      {
        name: "F_TRIG",
        inputs: [{ name: "CLK", type: "BOOL" }],
        outputs: [{ name: "Q", type: "BOOL" }],
        inouts: [],
      },
      // Bistable Latches
      {
        name: "SR",
        inputs: [
          { name: "S1", type: "BOOL" },
          { name: "R", type: "BOOL" },
        ],
        outputs: [{ name: "Q1", type: "BOOL" }],
        inouts: [],
      },
      {
        name: "RS",
        inputs: [
          { name: "S", type: "BOOL" },
          { name: "R1", type: "BOOL" },
        ],
        outputs: [{ name: "Q1", type: "BOOL" }],
        inouts: [],
      },
      // Counters (INT)
      {
        name: "CTU",
        inputs: [
          { name: "CU", type: "BOOL" },
          { name: "R", type: "BOOL" },
          { name: "PV", type: "INT" },
        ],
        outputs: [
          { name: "Q", type: "BOOL" },
          { name: "CV", type: "INT" },
        ],
        inouts: [],
      },
      {
        name: "CTD",
        inputs: [
          { name: "CD", type: "BOOL" },
          { name: "LD", type: "BOOL" },
          { name: "PV", type: "INT" },
        ],
        outputs: [
          { name: "Q", type: "BOOL" },
          { name: "CV", type: "INT" },
        ],
        inouts: [],
      },
      {
        name: "CTUD",
        inputs: [
          { name: "CU", type: "BOOL" },
          { name: "CD", type: "BOOL" },
          { name: "R", type: "BOOL" },
          { name: "LD", type: "BOOL" },
          { name: "PV", type: "INT" },
        ],
        outputs: [
          { name: "QU", type: "BOOL" },
          { name: "QD", type: "BOOL" },
          { name: "CV", type: "INT" },
        ],
        inouts: [],
      },
      // Counter type variants (DINT, LINT, UDINT, ULINT)
      ...["DINT", "LINT", "UDINT", "ULINT"].flatMap((t) => [
        {
          name: `CTU_${t}`,
          inputs: [
            { name: "CU", type: "BOOL" },
            { name: "R", type: "BOOL" },
            { name: "PV", type: t },
          ],
          outputs: [
            { name: "Q", type: "BOOL" },
            { name: "CV", type: t },
          ],
          inouts: [],
        },
        {
          name: `CTD_${t}`,
          inputs: [
            { name: "CD", type: "BOOL" },
            { name: "LD", type: "BOOL" },
            { name: "PV", type: t },
          ],
          outputs: [
            { name: "Q", type: "BOOL" },
            { name: "CV", type: t },
          ],
          inouts: [],
        },
        {
          name: `CTUD_${t}`,
          inputs: [
            { name: "CU", type: "BOOL" },
            { name: "CD", type: "BOOL" },
            { name: "R", type: "BOOL" },
            { name: "LD", type: "BOOL" },
            { name: "PV", type: t },
          ],
          outputs: [
            { name: "QU", type: "BOOL" },
            { name: "QD", type: "BOOL" },
            { name: "CV", type: t },
          ],
          inouts: [],
        },
      ]),
      // Timers
      {
        name: "TON",
        inputs: [
          { name: "IN", type: "BOOL" },
          { name: "PT", type: "TIME" },
        ],
        outputs: [
          { name: "Q", type: "BOOL" },
          { name: "ET", type: "TIME" },
        ],
        inouts: [],
      },
      {
        name: "TOF",
        inputs: [
          { name: "IN", type: "BOOL" },
          { name: "PT", type: "TIME" },
        ],
        outputs: [
          { name: "Q", type: "BOOL" },
          { name: "ET", type: "TIME" },
        ],
        inouts: [],
      },
      {
        name: "TP",
        inputs: [
          { name: "IN", type: "BOOL" },
          { name: "PT", type: "TIME" },
        ],
        outputs: [
          { name: "Q", type: "BOOL" },
          { name: "ET", type: "TIME" },
        ],
        inouts: [],
      },
    ],
    types: [],
    headers: [],
    isBuiltin: true,
  };
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
