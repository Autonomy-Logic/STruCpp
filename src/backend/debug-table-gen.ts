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

import type {
  CompilationUnit,
  ProgramDeclaration,
  TypeReference,
  StructDefinition,
  VarDeclaration,
} from "../frontend/ast.js";
import type { ProjectModel } from "../project-model.js";
import type { SymbolTables } from "../semantic/symbol-table.js";
import { isElementaryType } from "../semantic/type-registry.js";
import { evalIntConst } from "../semantic/type-utils.js";
import { formatArrayElementAccess } from "./codegen-utils.js";
import { mangledMemberName } from "./member-mangling.js";

// ---------------------------------------------------------------------------
// Type tags — MUST match TypeTag enum in runtime/include/debug_dispatch.hpp.
// ---------------------------------------------------------------------------
export const TAG = {
  BOOL: 0,
  SINT: 1,
  USINT: 2,
  INT: 3,
  UINT: 4,
  DINT: 5,
  UDINT: 6,
  LINT: 7,
  ULINT: 8,
  REAL: 9,
  LREAL: 10,
  BYTE: 11,
  WORD: 12,
  DWORD: 13,
  LWORD: 14,
  TIME: 15,
  DATE: 16,
  TOD: 17,
  DT: 18,
  STRING: 19,
  WSTRING: 20,
} as const;

export type TagName = keyof typeof TAG;

// ---------------------------------------------------------------------------
// Per-leaf flag bits — MUST match LEAF_FLAG_* in
// runtime/include/debug_table.hpp. ABI: append only, never renumber.
//
// Carried down the leaf walk as an explicit parameter rather than a mutable
// `currentFlags`, because a bit can be *cleared* partway down a subtree —
// today nothing does, but the retain work adds exactly that (a NON_RETAIN
// member inside a RETAIN function-block instance), and a shared mutable
// would leak the cleared value into the following sibling.
// ---------------------------------------------------------------------------
export const LEAF_FLAG_READONLY = 1 << 0;
/** Mirrors LEAF_FLAG_RETAIN in runtime/include/debug_table.hpp. */
export const LEAF_FLAG_RETAIN = 1 << 1;

/**
 * Apply one var block's qualifiers to the flags inherited from its container.
 *
 * RETAIN is inherited: declaring `VAR RETAIN inst : FB;` retains every leaf
 * inside `inst`, which is the CODESYS rule. NON_RETAIN is how a member opts
 * back out, so it CLEARS the bit rather than merely failing to set it — and
 * that is exactly why the walk passes flags down as a parameter instead of
 * mutating shared state: a cleared bit must not leak into the next sibling.
 */
function applyBlockFlags(
  inherited: number,
  block: { isConstant: boolean; isRetain: boolean; isNonRetain: boolean },
): number {
  let flags = inherited;
  if (block.isConstant) flags |= LEAF_FLAG_READONLY;
  if (block.isRetain) flags |= LEAF_FLAG_RETAIN;
  if (block.isNonRetain) flags &= ~LEAF_FLAG_RETAIN;
  return flags;
}

/**
 * Mirrors `strucpp::retain::HEADER_SIZE` in runtime/include/iec_retain.hpp.
 * Changing one without the other makes the editor's capacity gate disagree
 * with the firmware's own arithmetic.
 */
const RETAIN_HEADER_SIZE = 14;

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

/**
 * Render an entry's flags byte as C++.
 *
 * Emits the named constant rather than a literal so `generated_debug.cpp`
 * reads as intent — a reviewer scanning the table sees which leaves are
 * gated without decoding a bitmask — and so a stale generated file fails to
 * compile against a header that renamed the flag instead of silently setting
 * the wrong bit.
 */
function flagsLiteral(flags: number): string {
  const names: string[] = [];
  if (flags & LEAF_FLAG_READONLY) names.push("LEAF_FLAG_READONLY");
  if (flags & LEAF_FLAG_RETAIN) names.push("LEAF_FLAG_RETAIN");
  return names.length > 0 ? names.join(" | ") : "0";
}

const TAG_NAME_BY_VALUE: Record<number, TagName> = Object.fromEntries(
  Object.entries(TAG).map(([k, v]) => [v, k as TagName]),
) as Record<number, TagName>;

/** Map IEC type name (upper case) → TagName (canonical). Handles aliases. */
const IEC_NAME_TO_TAG: Record<string, TagName> = {
  BOOL: "BOOL",
  SINT: "SINT",
  USINT: "USINT",
  INT: "INT",
  UINT: "UINT",
  DINT: "DINT",
  UDINT: "UDINT",
  LINT: "LINT",
  ULINT: "ULINT",
  REAL: "REAL",
  LREAL: "LREAL",
  BYTE: "BYTE",
  WORD: "WORD",
  DWORD: "DWORD",
  LWORD: "LWORD",
  // __XWORD is platform-width; the debug surface targets the native host
  // (where pointers are 64-bit), so it reads as an LWORD-tagged 8-byte value.
  __XWORD: "LWORD",
  TIME: "TIME",
  LTIME: "TIME",
  DATE: "DATE",
  LDATE: "DATE",
  TOD: "TOD",
  TIME_OF_DAY: "TOD",
  LTOD: "TOD",
  DT: "DT",
  DATE_AND_TIME: "DT",
  LDT: "DT",
  STRING: "STRING",
  WSTRING: "WSTRING",
};

/** Byte size for each IEC elementary type — authoritative for debug. */
const IEC_NAME_TO_SIZE: Record<string, number> = {
  BOOL: 1,
  SINT: 1,
  USINT: 1,
  INT: 2,
  UINT: 2,
  DINT: 4,
  UDINT: 4,
  LINT: 8,
  ULINT: 8,
  REAL: 4,
  LREAL: 8,
  BYTE: 1,
  WORD: 2,
  DWORD: 4,
  LWORD: 8,
  __XWORD: 8,
  TIME: 8,
  LTIME: 8,
  DATE: 8,
  LDATE: 8,
  TOD: 8,
  TIME_OF_DAY: 8,
  LTOD: 8,
  DT: 8,
  DATE_AND_TIME: 8,
  LDT: 8,
  // STRING / WSTRING wire widths match `DEBUG_STRING_WIDTH` /
  // `DEBUG_WSTRING_WIDTH` in `runtime/include/debug_dispatch.hpp`.
  // The runtime always writes a full fixed-width window
  // (1 byte length + 126 bytes UTF-8 / 252 bytes UTF-16LE); the
  // editor decoder reads `min(length, 126)` from the prefix and
  // skips the remainder.  Pinning the same constants here keeps the
  // editor's batch-byte arithmetic aligned with what the runtime
  // actually sends per entry.
  STRING: 127,
  WSTRING: 253,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
   * Total bytes the retain blob occupies: a 14-byte header plus one payload
   * slot per retained leaf. Matches `strucpp::retain::blob_size()`.
   *
   * Emitted so a build can be REFUSED when the target cannot hold it. Without
   * it the firmware links, runs, finds the blob too large for its buffer and
   * degrades to NON_RETAIN in silence.
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
  /** Retained state the walk could not reach; surfaced as compile warnings. */
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

  // Programs only live in the user AST (libraries don't ship PROGRAM blocks),
  // so we index them locally. Types and function blocks come from the symbol
  // table — that's the unified source covering both user-defined declarations
  // and library-loaded entries.
  const programByName = new Map<string, ProgramDeclaration>();
  for (const p of ast.programs) programByName.set(p.name.toUpperCase(), p);

  // --- Inputs to the shared member-mangling rule (see member-mangling.ts) ----
  // The table addresses members by the name codegen declared them under, so
  // both predicates have to resolve the same way codegen's do.

  const interfaceNames = new Set(
    ast.interfaces.map((i) => i.name.toUpperCase()),
  );

  /**
   * Mirrors `CodeGenerator.isUserDefinedType`: a function block, interface,
   * STRUCT/UDT, or program. Elementary types are excluded explicitly — codegen
   * leaves `Time : TIME` unmangled, so mangling it here would name a member
   * that does not exist.
   */
  const isUserDefinedType = (typeName: string): boolean => {
    const upper = typeName.toUpperCase();
    if (isElementaryType(upper)) return false;
    return (
      symbolTables.lookupType(upper) !== undefined ||
      symbolTables.lookupFunctionBlock(upper) !== undefined ||
      interfaceNames.has(upper) ||
      programByName.has(upper)
    );
  };

  /**
   * FB type name → upper-cased method names of every interface it implements,
   * mirroring `CodeGenerator.fbInterfaceMethodNames`. Directly implemented
   * interfaces only, which is what codegen consults.
   */
  const fbInterfaceMethods = new Map<string, Set<string>>();
  {
    const methodsByInterface = new Map<string, Set<string>>();
    for (const iface of ast.interfaces) {
      methodsByInterface.set(
        iface.name.toUpperCase(),
        new Set(iface.methods.map((m) => m.name.toUpperCase())),
      );
    }
    for (const fb of ast.functionBlocks) {
      if (!fb.implements || fb.implements.length === 0) continue;
      const methods = new Set<string>();
      for (const ifaceName of fb.implements) {
        for (const m of methodsByInterface.get(ifaceName.toUpperCase()) ?? []) {
          methods.add(m);
        }
      }
      if (methods.size > 0) {
        fbInterfaceMethods.set(fb.name.toUpperCase(), methods);
      }
    }
  }

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
   * Retained state the walk could not reach — today only a RETAIN on a library
   * block whose manifest predates exported locals.
   *
   * Kept apart from `skipped`, which is a normal list nobody reads on a good
   * build. These are surfaced as compile WARNINGS: the program still builds
   * and its visible surface is still retained, because refusing would strand
   * anyone using a third-party .stlib they cannot rebuild. But a partial
   * retain that nobody is told about is exactly the failure this reports.
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

  // visitTypeRef walks a TypeReference: elementary type → leaf, inline array
  // → per-element recursion, named user type (struct / FB / elementary alias)
  // → recurse into definition.
  const visitTypeRef = (
    path: string,
    cppExpr: string,
    typeRef: TypeReference,
    flags: number,
  ): void => {
    // Inline array: `ARRAY[0..4] OF INT` → has arrayDimensions + elementTypeName
    if (typeRef.arrayDimensions && typeRef.elementTypeName) {
      walkArrayDims(
        path,
        cppExpr,
        typeRef.arrayDimensions,
        0,
        typeRef.elementTypeName,
        flags,
      );
      return;
    }

    const name = typeRef.name.toUpperCase();

    // Named elementary type (or alias thereof).
    if (IEC_NAME_TO_TAG[name] !== undefined) {
      addLeaf(path, cppExpr, name, flags);
      return;
    }

    // Named type — covers user-defined TYPE..END_TYPE and library-registered
    // types (struct/enum/alias). The symbol table is the unified source.
    const ts = symbolTables.lookupType(name);
    if (ts) {
      const def = ts.declaration.definition;
      if (def.kind === "StructDefinition") {
        visitStructFields(path, cppExpr, def, flags);
        return;
      }
      if (def.kind === "ArrayDefinition") {
        // TYPE MyArr: ARRAY[0..9] OF INT; END_TYPE
        const dims = def.dimensions
          .filter((d) => !d.isVariableLength)
          .map((d) => ({
            start: evalIntConst(d.start),
            end: evalIntConst(d.end),
          }));
        if (dims.some((d) => d.start === undefined || d.end === undefined)) {
          skipped.push({ path, reason: `array bounds not constant` });
          return;
        }
        walkArrayDims(
          path,
          cppExpr,
          dims as Array<{ start: number; end: number }>,
          0,
          def.elementType.name,
          flags,
        );
        return;
      }
      if (def.kind === "EnumDefinition") {
        // Enums are stored as their base type; treat as a scalar whose tag
        // matches the base. Default INT if no baseType.
        const baseName = def.baseType?.name?.toUpperCase() ?? "INT";
        if (IEC_NAME_TO_TAG[baseName] !== undefined) {
          addLeaf(path, cppExpr, baseName, flags);
          return;
        }
        skipped.push({ path, reason: `enum base type ${baseName} unknown` });
        return;
      }
      if (def.kind === "SubrangeDefinition") {
        const baseName = def.baseType.name.toUpperCase();
        if (IEC_NAME_TO_TAG[baseName] !== undefined) {
          addLeaf(path, cppExpr, baseName, flags);
          return;
        }
        skipped.push({ path, reason: `subrange base ${baseName} unknown` });
        return;
      }
      // TypeReference alias. The library loader registers library types
      // with `definition: TypeReference{ name: baseType ?? typeName }` —
      // an alias points at its base, but a struct with no baseType points
      // at itself (the manifest doesn't expose struct fields, so the
      // symbol carries only the type name). Treat self-referential
      // aliases as opaque library types: the debugger doesn't recurse
      // into them, just like it doesn't recurse into library FB locals.
      if (def.kind === "TypeReference") {
        if (def.name.toUpperCase() === name) {
          skipped.push({
            path,
            reason: `library type ${typeRef.name} is opaque to the debugger`,
          });
          return;
        }
        visitTypeRef(path, cppExpr, def, flags);
        return;
      }
      skipped.push({
        path,
        reason: `unsupported TYPE kind: ${(def as { kind: string }).kind}`,
      });
      return;
    }

    // Function block instance. The symbol table holds both user-defined
    // FBs (populated by the semantic analyzer from `ast.functionBlocks`)
    // and library FBs (populated by `registerLibrarySymbols` from the
    // .stlib manifest). The two paths intentionally surface different
    // amounts of state:
    //
    //   • Library FBs — only the public interface (inputs/outputs/inouts).
    //     Locals are implementation details that stay inside the
    //     compiled archive; the debugger treats library FBs as black
    //     boxes. The library loader leaves `locals` empty for this
    //     reason, so iterating the flat arrays gives just the
    //     interface.
    //
    //   • User-defined FBs — every persistent member, including VAR
    //     locals. The analyzer leaves the symbol's flat arrays empty
    //     and keeps the declarations in `declaration.varBlocks`, so we
    //     fall through to the AST walk and surface VAR alongside the
    //     interface blocks. VAR_TEMP / VAR_EXTERNAL are excluded —
    //     those are not persistent state.
    const fbSym = symbolTables.lookupFunctionBlock(name);
    if (fbSym) {
      const interfaceVars = [
        ...fbSym.inputs,
        ...fbSym.outputs,
        ...fbSym.inouts,
      ];
      // `name` is the FB type declaring these members, so it is the owner for
      // both mangling collisions.
      if (interfaceVars.length > 0) {
        for (const v of interfaceVars) {
          visitTypeRef(
            `${path}.${v.name.toUpperCase()}`,
            `${cppExpr}.${libraryMemberCppName(v, name)}`,
            v.declaration.type,
            flags,
          );
        }

        // The block's own VAR members, from the manifest's `locals`.
        //
        // Only when the instance is RETAINed. The debugger keeps its
        // black-box view of a library block everywhere else — the
        // long-standing contract, and what stops a project instantiating a few
        // hundred OSCAT blocks from paying for internals nobody addresses.
        // Retain overrides it because a block restored from half its state
        // comes back in a configuration it could never have run into: a TON
        // with Q and ET but no STATE restarts its wait on the next scan.
        // Two reasons to descend into a library block's own VAR members:
        // the instance is RETAINed, or the library itself declared one of them
        // `VAR RETAIN` — which retains it in every instance, exactly as it
        // does for a user-defined block.
        const instanceRetained = (flags & LEAF_FLAG_RETAIN) !== 0;
        const localsToWalk = instanceRetained
          ? fbSym.locals
          : fbSym.locals.filter((v) => v.isRetain);
        if (localsToWalk.length > 0 || instanceRetained) {
          if (instanceRetained && fbSym.locals.length === 0) {
            // An archive whose manifest does not export locals. Retain still
            // covers the visible surface — refusing the build would strand
            // anyone using a third-party .stlib they cannot rebuild — but it
            // is a partial retain, so it is said out loud rather than left to
            // be discovered after a power cycle.
            incomplete.push({
              path,
              reason:
                `RETAIN on ${typeRef.name}: this library does not export the ` +
                `block's internal variables, so only its inputs and outputs ` +
                `are retained. Rebuild the library with a current STruC++ to ` +
                `retain the rest.`,
            });
          }
          for (const v of localsToWalk) {
            visitTypeRef(
              `${path}.${v.name.toUpperCase()}`,
              `${cppExpr}.${libraryMemberCppName(v, name)}`,
              v.declaration.type,
              v.isRetain ? flags | LEAF_FLAG_RETAIN : flags,
            );
          }
        }
      } else {
        for (const block of fbSym.declaration.varBlocks) {
          if (
            block.blockType === "VAR" ||
            block.blockType === "VAR_INPUT" ||
            block.blockType === "VAR_OUTPUT" ||
            block.blockType === "VAR_IN_OUT"
          ) {
            // A `VAR CONSTANT` inside a function block is read-only for every
            // instance of it, and a `VAR RETAIN` member is retained in every
            // instance, so the block's own qualifiers are folded in here rather
            // than only at the program level.
            const memberFlags = applyBlockFlags(flags, block);
            for (const fieldDecl of block.declarations) {
              for (const fieldName of fieldDecl.names) {
                visitTypeRef(
                  `${path}.${fieldName.toUpperCase()}`,
                  `${cppExpr}.${memberCppName(fieldName, fieldDecl.type, name)}`,
                  fieldDecl.type,
                  memberFlags,
                );
              }
            }
          }
        }
      }
      return;
    }

    skipped.push({ path, reason: `unresolved type name: ${typeRef.name}` });
  };

  const visitStructFields = (
    path: string,
    cppExpr: string,
    def: StructDefinition,
    flags: number,
  ): void => {
    // `flags` passes straight through: IEC puts CONSTANT on a var *block*, and
    // a STRUCT declares fields without blocks, so a struct field can never
    // introduce or clear the bit — it only inherits whatever the declaration
    // that named the struct carried.
    for (const fieldDecl of def.fields) {
      for (const fieldName of fieldDecl.names) {
        visitTypeRef(
          `${path}.${fieldName.toUpperCase()}`,
          // No owner: a STRUCT implements no interfaces, so only the
          // field-name-matches-its-type collision can apply.
          `${cppExpr}.${memberCppName(fieldName, fieldDecl.type)}`,
          fieldDecl.type,
          flags,
        );
      }
    }
  };

  /**
   * Enumerate every element of an array, emitting one debug entry per element.
   *
   * Indices are collected across all dimensions and only turned into C++ at the
   * innermost level, because the accessor depends on the array's rank:
   * `Array2D`/`Array3D` take every index in one `operator()` call, so emitting a
   * subscript per dimension as we descend would produce `arr[i][j]` — which has
   * no matching operator on those containers and fails to compile.
   * {@link formatArrayElementAccess} owns that rank rule. The IEC display path
   * stays `[i][j]`, which is what the debug UI shows.
   */
  const walkArrayDims = (
    path: string,
    cppExpr: string,
    dims: Array<{ start: number; end: number }>,
    dimIdx: number,
    elementTypeName: string,
    flags: number,
    indices: number[] = [],
  ): void => {
    if (dimIdx >= dims.length) {
      // Innermost element — visit as a TypeReference with the element type
      // name. Manufacture a minimal TypeReference for recursion.
      visitTypeRef(
        path,
        formatArrayElementAccess(cppExpr, indices),
        {
          kind: "TypeReference",
          name: elementTypeName,
          isReference: false,
          referenceKind: "none",
        } as TypeReference,
        flags,
      );
      return;
    }
    const { start, end } = dims[dimIdx]!;
    for (let i = start; i <= end; i++) {
      walkArrayDims(
        `${path}[${i}]`,
        cppExpr,
        dims,
        dimIdx + 1,
        elementTypeName,
        flags,
        [...indices, i],
      );
    }
  };

  /**
   * C++ member name for a declaration, by the same rule codegen used to emit it
   * (see `member-mangling.ts`).
   *
   * The table addresses members by name, so it has to agree with the class
   * definition exactly, in *both* directions. Mangling too little named a member
   * that does not exist (`RunningLights : RunningLights` is declared
   * `RUNNINGLIGHTS_`); mangling too much would do the same in reverse, since
   * `Time : TIME` is declared plain `TIME`. Either way `generated_debug.cpp`
   * fails to compile and takes the whole firmware build with it — and nothing
   * catches it earlier, because `strucpp file.st` emits no debug table.
   *
   * `ownerTypeName` is the type declaring the member, needed for the
   * interface-method collision; undefined for a PROGRAM or a STRUCT, neither of
   * which can implement an interface.
   */
  /**
   * C++ member name for a member of a LIBRARY function block.
   *
   * Prefers the manifest's `cppName`, which the library recorded when its own
   * codegen mangled the member. Both mangling rules are decided against the
   * declaring unit — whether the member's type is user-defined THERE, and
   * which interface methods the block implements — and a consumer that
   * re-derives them can name a member the class does not declare, which fails
   * the build of generated_debug.cpp. Falling back to the shared rule covers
   * archives predating the field, where it is right in every case the bundled
   * libraries contain.
   */
  const libraryMemberCppName = (
    v: {
      name: string;
      declaration: VarDeclaration;
      cppName?: string | undefined;
    },
    ownerTypeName: string,
  ): string =>
    v.cppName ?? memberCppName(v.name, v.declaration.type, ownerTypeName);

  const memberCppName = (
    varName: string,
    typeRef: TypeReference | undefined,
    ownerTypeName?: string,
  ): string =>
    mangledMemberName(varName, typeRef?.name, {
      isUserDefinedType,
      interfaceMethods:
        ownerTypeName !== undefined
          ? fbInterfaceMethods.get(ownerTypeName.toUpperCase())
          : undefined,
    });

  const visitVarDecl = (
    path: string,
    cppExpr: string,
    decl: VarDeclaration,
    flags: number,
    ownerTypeName?: string,
  ): void => {
    for (const varName of decl.names) {
      visitTypeRef(
        `${path}.${varName.toUpperCase()}`,
        `${cppExpr}.${memberCppName(varName, decl.type, ownerTypeName)}`,
        decl.type,
        flags,
      );
    }
  };

  // Configurations carry both VAR_GLOBAL declarations and the
  // resource → task → program-instance tree. Globals go first so they own
  // a dedicated bucket at the head of the table — that way edits to a
  // program don't shift global addresses around.
  //
  // Path convention is bare uppercase name (no instance prefix): the
  // editor's `buildGlobalDebugPath()` returns `name.toUpperCase()` and
  // OPC-UA `GVL:foo` references resolve against the same key.
  // C++ expression is `${name}.value`: each global is emitted as a file-scope
  // `inline GlobalVar<V>` singleton (value + per-global mutex), so `.value`
  // reaches the underlying IEC storage the debugger reads/writes directly —
  // no configuration-instance prefix (see codegen.ts emitFileScopeGlobals,
  // iec_global.hpp).
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
  const retainLayoutHash = retainLayoutHashOf(retainVars);
  const debugTableCpp = renderCpp(
    arrays,
    configGlobal,
    configName,
    retainVars,
    retainLayoutHash,
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
          retainLayoutHash,
          // 14 == strucpp::retain::HEADER_SIZE (iec_retain.hpp). Emitted so a
          // build can be refused when the target cannot hold the blob.
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
