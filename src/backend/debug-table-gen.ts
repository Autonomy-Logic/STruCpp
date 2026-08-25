// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Debug Table Generator
 *
 * Emits two artifacts alongside the normal compile() output:
 *
 *   1. `debugTableCpp` — contents for generated_debug.cpp, the per-project
 *      pointer tables consumed by strucpp::debug::handle_*() in the runtime
 *      header debug_dispatch.hpp.
 *
 *   2. `debugMap` — a JSON-serializable manifest the editor uses to translate
 *      variable paths (e.g. "INSTANCE0.speeds[5]") into the (arrayIdx,
 *      elemIdx) address pairs the target expects.
 *
 * Every leaf variable — including array elements, struct fields, and FB
 * input/output/inout members — gets its own entry. Leaves are packed into
 * arrays capped at 8,000 entries to stay below AVR GCC's 32,767-byte
 * single-object limit. A new array is also started at each program-instance
 * boundary so per-program edits don't cascade down the table.
 */

import type { CompilationUnit, ProgramDeclaration } from "../frontend/ast.js";
import type { ProjectModel } from "../project-model.js";
import type { SymbolTables } from "../semantic/symbol-table.js";
import {
  applyBlockFlags,
  flagsLiteral,
  IEC_NAME_TO_SIZE,
  IEC_NAME_TO_TAG,
  LEAF_FLAG_READONLY,
  LEAF_FLAG_RETAIN,
  TAG,
  TAG_NAME_BY_VALUE,
  type TagName,
} from "./debug-leaf-types.js";
import { createLeafWalker } from "./leaf-walker.js";

// ---------------------------------------------------------------------------
// Leaf primitives (tags, flag bits, the flag-inheritance rule, the IEC type
// tables) live in debug-leaf-types.ts, shared with the library compiler so the
// two flatteners cannot drift. Re-exported here because callers have always
// imported them from this module.
// ---------------------------------------------------------------------------
export {
  LEAF_FLAG_READONLY,
  LEAF_FLAG_RETAIN,
  TAG,
  type TagName,
} from "./debug-leaf-types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * FNV-1a (32-bit) over the retain layout — the ordered `path|typeTag` of every
 * retained leaf.
 *
 * Identity of the LAYOUT, deliberately not of the program: a body edit leaves
 * this unchanged and retained values survive, while adding, removing, retyping
 * or reordering a retained variable changes it and the stored blob is refused.
 * The project MD5 would have discarded retained state on every unrelated edit.
 *
 * FNV-1a rather than a cryptographic digest because this is a collision-check
 * against accident, not against an attacker, and it has to be computable in a
 * few lines on an AVR as well as here.
 */
/**
 * Mirrors `strucpp::retain::HEADER_SIZE` in runtime/include/iec_retain.hpp.
 * Changing one without the other makes the editor's capacity gate disagree
 * with the firmware's own arithmetic.
 */
const RETAIN_HEADER_SIZE = 14;

function retainLayoutHashOf(
  vars: Array<{ path: string; tagName: TagName }>,
): string {
  let hash = 0x811c9dc5;
  for (const v of vars) {
    for (const ch of `${v.path}|${v.tagName}`) {
      hash ^= ch.codePointAt(0) ?? 0;
      // >>> 0 after the multiply: JS bitwise ops are on int32, and FNV needs the
      // product truncated to 32 unsigned bits at every step.
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

export interface DebugLeaf {
  arrayIdx: number;
  elemIdx: number;
  /** Path from instance root, e.g. "INSTANCE0.SPEEDS[5]" or
   *  "INSTANCE0.FB_INST.COUNTER". */
  path: string;
  /** IEC type tag name (e.g. "INT", "BOOL", "REAL"). */
  type: string;
  /** Byte size of the leaf (matches type_ops[].size in the runtime). */
  size: number;
  /**
   * Present and `true` only for a leaf the debugger must not modify — an IEC
   * CONSTANT. Omitted otherwise, rather than written as `false`, because a
   * project's map holds thousands of leaves and the flag is rare.
   *
   * Advisory: it exists so the editor can hide the force control instead of
   * offering an action that will be refused. The refusal itself is enforced
   * in the runtime (`LEAF_FLAG_READONLY`), which is what makes an older
   * editor build — or an OPC-UA client that never reads this map — safe.
   *
   * Deliberately additive: `version` stays at 2 so an editor built against
   * the previous manifest keeps loading these maps unchanged. `debug-parser.ts`
   * rejects anything but 2 outright, so bumping it would break every editor
   * pinned to an older strucpp release.
   */
  readOnly?: true;
  /**
   * Present and `true` for a leaf declared `RETAIN` (or inherited from a
   * retained function-block instance). Omitted otherwise — a project's map
   * holds thousands of leaves and the flag is rare.
   */
  retain?: true;
}

export interface DebugMapV2 {
  version: 2;
  md5: string;
  typeTags: Record<string, number>;
  arrays: Array<{ index: number; count: number }>;
  leaves: DebugLeaf[];
  /**
   * The retained leaves, in the order the retain blob packs them. Additive, so
   * `version` stays at 2 — the editor's `debug-parser.ts` rejects anything else
   * outright, and an older editor simply ignores this field.
   */
  retainVars?: Array<{
    arrayIdx: number;
    elemIdx: number;
    path: string;
    size: number;
  }>;
  /**
   * Total bytes the retain blob occupies: the 14-byte header plus one payload
   * slot per retained leaf. Matches `strucpp::retain::blob_size()` exactly.
   *
   * Emitted so a build can be REFUSED when the target cannot hold it. Without
   * it the firmware links, runs, finds the blob too large for its buffer and
   * degrades to NON_RETAIN in silence — the same class of failure as retaining
   * half a function block. A retained TON is 36 bytes, so a 512-byte board
   * cap is reached at around fourteen of them; this is a limit real programs
   * meet.
   */
  retainBlobSize?: number;
  /**
   * Identity of the retain LAYOUT, not of the program.
   *
   * FNV-1a over `path|typeTag` for each retained leaf in table order, so a body
   * edit keeps retained values while adding, removing, retyping or reordering a
   * retained variable invalidates them. Keying on the program MD5 instead would
   * discard retained state on every unrelated edit.
   */
  retainLayoutHash?: string;
}

export interface DebugTableResult {
  /** Contents for generated_debug.cpp (ready to write to disk). */
  debugTableCpp: string;
  /** Structured manifest for the editor (ready to JSON.stringify). */
  debugMap: DebugMapV2;
  /** Any leaves that couldn't be classified (unsupported type construct,
   *  user-defined enum, reference, etc.). Useful for warnings. */
  skipped: Array<{ path: string; reason: string }>;
  /**
   * State the walk was asked to retain and could not reach.
   *
   * Separate from `skipped` because the caller must FAIL on these rather than
   * warn. A skipped leaf is merely invisible to the debugger; an unreachable
   * retained leaf produces firmware that runs, restores part of a function
   * block, and leaves it in a state it could never have reached by running —
   * a fault that shows up as inexplicable behaviour after a power cycle, with
   * nothing in the build to point at.
   */
  incomplete: Array<{ path: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DebugTableGenOptions {
  /** Max entries per debug array. Default 8000 — safe under AVR's 32767-byte
   *  per-object limit assuming sizeof(Entry) == 4. */
  maxEntriesPerArray?: number;
  /** Name of the global configuration instance the generated table references.
   *  The sketch / runtime must declare this with external linkage. */
  configGlobalName?: string;
  /** MD5 to embed in the debug map. Caller computes over (program.st,
   *  strucpp version, projectModel) so the editor can detect staleness. */
  md5?: string;
}

const DEFAULTS: Required<Omit<DebugTableGenOptions, "md5">> = {
  maxEntriesPerArray: 8000,
  configGlobalName: "g_config",
};

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

interface Entry {
  cppExpr: string;
  tagName: TagName;
  path: string;
  type: TagName;
  size: number;
  /** Bitwise OR of LEAF_FLAG_*, emitted into the entry's `flags` byte. */
  flags: number;
}

export function generateDebugTable(
  ast: CompilationUnit,
  projectModel: ProjectModel,
  symbolTables: SymbolTables,
  opts: DebugTableGenOptions = {},
): DebugTableResult {
  const maxEntries = opts.maxEntriesPerArray ?? DEFAULTS.maxEntriesPerArray;
  const configGlobal = opts.configGlobalName ?? DEFAULTS.configGlobalName;
  const md5 = opts.md5 ?? "";

  // Buckets of entries — grown in order, flushed at program boundary or size cap.
  const arrays: Entry[][] = [[]];
  const leaves: DebugLeaf[] = [];
  /** Retained leaves in walk order — the order the blob packs them. */
  const retainVars: Array<{
    arrayIdx: number;
    elemIdx: number;
    path: string;
    size: number;
    tagName: TagName;
  }> = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  /**
   * State the walk was asked to cover and could not — today only a RETAIN that
   * reaches into a library archive built before flattened leaves existed.
   *
   * Kept apart from `skipped`, which is a normal and expected list (opaque
   * library types, variable-length arrays) that nobody reads on a good build.
   * These are promoted to compile errors by the caller, because the failure
   * they describe is invisible at runtime: the program builds, runs, and
   * restores a function block into a state it could never have reached.
   */
  const incomplete: Array<{ path: string; reason: string }> = [];

  const tail = (): Entry[] => arrays[arrays.length - 1]!;

  const ensureRoom = () => {
    if (tail().length >= maxEntries) arrays.push([]);
  };

  const addLeaf = (
    path: string,
    cppExpr: string,
    iecName: string,
    flags: number,
  ) => {
    const tagName = IEC_NAME_TO_TAG[iecName.toUpperCase()];
    if (tagName === undefined) {
      skipped.push({ path, reason: `unknown elementary type: ${iecName}` });
      return;
    }
    const size = IEC_NAME_TO_SIZE[iecName.toUpperCase()] ?? 0;
    ensureRoom();
    const bucket = tail();
    const arrIdx = arrays.length - 1;
    const elemIdx = bucket.length;
    bucket.push({ cppExpr, tagName, path, type: tagName, size, flags });
    leaves.push({
      arrayIdx: arrIdx,
      elemIdx,
      path,
      type: tagName,
      size,
      ...(flags & LEAF_FLAG_READONLY ? { readOnly: true as const } : {}),
      ...(flags & LEAF_FLAG_RETAIN ? { retain: true as const } : {}),
    });
    if (flags & LEAF_FLAG_RETAIN) {
      retainVars.push({ arrayIdx: arrIdx, elemIdx, path, size, tagName });
    }
  };

  // Programs live only in the user AST (libraries ship no PROGRAM blocks), and
  // the instance walk below resolves each instance's program type through here.
  const programByName = new Map<string, ProgramDeclaration>();
  for (const p of ast.programs) programByName.set(p.name.toUpperCase(), p);

  // The walk itself lives in leaf-walker.ts — see that module for why it is
  // shared rather than duplicated. Here it is wired to a sink that turns each
  // leaf into a table entry.
  const { visitTypeRef, visitVarDecl } = createLeafWalker(ast, symbolTables, {
    leaf: addLeaf,
    skip: (path, reason) => skipped.push({ path, reason }),
    incomplete: (path, reason) => incomplete.push({ path, reason }),
  });
  const seenGlobals = new Set<string>();
  for (const config of ast.configurations) {
    for (const block of config.varBlocks) {
      if (block.blockType !== "VAR_GLOBAL") continue;
      for (const decl of block.declarations) {
        for (const varName of decl.names) {
          // File-scope singletons are deduped by name; mirror that here so the
          // debug table doesn't emit duplicate entries for a shared global.
          const key = varName.toUpperCase();
          if (seenGlobals.has(key)) continue;
          seenGlobals.add(key);
          visitTypeRef(
            key,
            `${varName}.value`,
            decl.type,
            applyBlockFlags(0, block),
          );
        }
      }
    }
  }

  // Walk configurations → resources → tasks → instances.
  for (const config of projectModel.configurations) {
    for (const resource of config.resources) {
      for (const task of resource.tasks) {
        for (const instance of task.programInstances) {
          // Program-instance boundary flush (unless current bucket is empty).
          if (tail().length > 0) arrays.push([]);

          const prog = programByName.get(instance.programType.toUpperCase());
          if (!prog) continue;

          const instName = instance.instanceName.toUpperCase();
          const basePath = instName;
          const baseCpp = `${configGlobal}.${instance.instanceName}`;

          for (const block of prog.varBlocks) {
            // Exclude VAR_EXTERNAL (points to globals handled separately) and
            // VAR_TEMP / VAR_IN_OUT (not persistent state). Debugger address
            // persistent local/input/output state.
            if (
              block.blockType !== "VAR" &&
              block.blockType !== "VAR_INPUT" &&
              block.blockType !== "VAR_OUTPUT"
            ) {
              continue;
            }
            const declFlags = applyBlockFlags(0, block);
            for (const decl of block.declarations) {
              visitVarDecl(basePath, baseCpp, decl, declFlags);
            }
          }
        }
      }
    }
  }

  // Drop trailing empty bucket if present.
  if (arrays.length > 0 && tail().length === 0) {
    arrays.pop();
  }
  // If everything is empty, keep one empty array for a valid table.
  if (arrays.length === 0) arrays.push([]);

  const configName = projectModel.configurations[0]?.name ?? "CONFIG0";
  const debugTableCpp = renderCpp(
    arrays,
    configGlobal,
    configName,
    retainVars,
    retainLayoutHashOf(retainVars),
  );
  const debugMap: DebugMapV2 = {
    version: 2,
    md5,
    typeTags: { ...TAG },
    arrays: arrays.map((a, i) => ({ index: i, count: a.length })),
    leaves,
    // Omitted entirely when nothing is retained, so a project that uses no
    // RETAIN carries no retain fields at all and the runtime's `count == 0`
    // fast path is the only thing it ever sees.
    ...(retainVars.length > 0
      ? {
          retainVars: retainVars.map(({ arrayIdx, elemIdx, path, size }) => ({
            arrayIdx,
            elemIdx,
            path,
            size,
          })),
          retainLayoutHash: retainLayoutHashOf(retainVars),
          // 14 == strucpp::retain::HEADER_SIZE (iec_retain.hpp).
          retainBlobSize:
            RETAIN_HEADER_SIZE +
            retainVars.reduce((total, v) => total + v.size, 0),
        }
      : {}),
  };

  return { debugTableCpp, debugMap, skipped, incomplete };
}

// ---------------------------------------------------------------------------
// C++ rendering
// ---------------------------------------------------------------------------

function renderCpp(
  arrays: Entry[][],
  configGlobal: string,
  configName: string,
  retainVars: Array<{ arrayIdx: number; elemIdx: number; path: string }>,
  retainLayoutHash: string,
): string {
  const lines: string[] = [];
  lines.push("// SPDX-License-Identifier: GPL-3.0-or-later");
  lines.push("// Generated by STruC++ debug-table-gen - Do not edit by hand.");
  lines.push("//");
  lines.push("// Per-project debugger pointer tables consumed by");
  lines.push("// strucpp::debug::handle_*() in debug_dispatch.hpp.");
  lines.push("");
  lines.push('#include "generated.hpp"');
  // `debug_table.hpp` carries the AVR-clean subset (Entry, TypeTag,
  // STRUCPP_DEBUG_FLASH).  Including `debug_dispatch.hpp` here would
  // pull `<avr/pgmspace.h>` → `<avr/io.h>` into the only TU that
  // names user variables — AVR register macros (`SP`, `SREG`, …)
  // would then mangle identifiers like PID's `SP` setpoint.  See
  // runtime/include/debug_table.hpp.
  lines.push('#include "debug_table.hpp"');
  lines.push("");
  lines.push(
    `// The sketch/runtime must define this global with external linkage:`,
  );
  lines.push(`//   strucpp::Configuration_${configName} ${configGlobal};`);
  lines.push(`// The debug table below reaches into it via compile-time`);
  lines.push(`// address-of expressions — so it must be a real object, not a`);
  lines.push(`// static-local or a pointer.`);
  lines.push(`extern ::strucpp::Configuration_${configName} ${configGlobal};`);
  lines.push("");
  lines.push("namespace strucpp { namespace debug {");
  lines.push("");

  for (let ai = 0; ai < arrays.length; ai++) {
    const bucket = arrays[ai]!;
    lines.push(
      `const Entry debug_arr_${ai}[${bucket.length || 1}] STRUCPP_DEBUG_FLASH = {`,
    );
    if (bucket.length === 0) {
      lines.push(`    { nullptr, 0, 0 },  // placeholder — array is empty`);
    } else {
      for (const e of bucket) {
        lines.push(
          // The `(void*)` cast is load-bearing AND lossy: a CONSTANT member is
          // declared `const`, and a C-style cast strips that silently where
          // `static_cast` would refuse. The flags byte is what carries the
          // qualifier through to the runtime so the write paths can honour it.
          `    { (void*)&${e.cppExpr}, TAG_${e.tagName}, ${flagsLiteral(e.flags)} },  // ${e.path}`,
        );
      }
    }
    lines.push("};");
    lines.push("");
  }

  const arrNames = arrays.map((_, i) => `debug_arr_${i}`);
  lines.push(
    `const Entry* const debug_arrays[${arrays.length}] STRUCPP_DEBUG_FLASH = {`,
  );
  for (const n of arrNames) lines.push(`    ${n},`);
  lines.push("};");
  lines.push("");

  lines.push(
    `const uint16_t debug_array_counts[${arrays.length}] STRUCPP_DEBUG_FLASH = {`,
  );
  for (const b of arrays) lines.push(`    ${b.length},`);
  lines.push("};");
  lines.push("");

  lines.push(`const uint8_t debug_array_count = ${arrays.length};`);
  lines.push("");

  // --- Retain table --------------------------------------------------------
  //
  // Retained leaves addressed the same way the debugger addresses everything
  // else: (arr, elem) into the tables above. No offsets, no sizeof — the host
  // reads and writes each leaf through `handle_read` / `handle_write`, so it
  // moves the VALUE and never the IECVar wrapper's forcing state, and a nested
  // function-block member or a configuration global needs no special case.
  //
  // Order is the walk order, and it IS the blob's packing order.
  lines.push("// Retained leaves, in the order the retain blob packs them.");
  lines.push(
    `const RetainVar retain_vars[${retainVars.length || 1}] STRUCPP_DEBUG_FLASH = {`,
  );
  if (retainVars.length === 0) {
    lines.push("    { 0, 0 },  // placeholder — nothing is retained");
  } else {
    for (const v of retainVars) {
      lines.push(`    { ${v.arrayIdx}, ${v.elemIdx} },  // ${v.path}`);
    }
  }
  lines.push("};");
  lines.push("");
  lines.push(`const uint16_t retain_var_count = ${retainVars.length};`);
  lines.push("");
  lines.push(
    "// Identity of the retain LAYOUT (ordered path|typeTag), not of the",
  );
  lines.push(
    "// program: a body edit keeps retained values, a declaration change",
  );
  lines.push("// invalidates them.");
  lines.push(`const uint32_t retain_layout_hash = 0x${retainLayoutHash};`);
  lines.push("");
  lines.push("} } // namespace strucpp::debug");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Expression helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers exposed for tests
// ---------------------------------------------------------------------------

export function tagNameForTypeName(name: string): TagName | undefined {
  return IEC_NAME_TO_TAG[name.toUpperCase()];
}

export function sizeForTypeName(name: string): number {
  return IEC_NAME_TO_SIZE[name.toUpperCase()] ?? 0;
}

/** For debugging / testing: reverse lookup tag → name. */
export function tagNameByValue(tag: number): TagName | undefined {
  return TAG_NAME_BY_VALUE[tag];
}
