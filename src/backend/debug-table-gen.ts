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
  STRING: 0, // variable-length — Phase 4b
  WSTRING: 0, // variable-length — Phase 4b
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
}

export interface DebugMapV2 {
  version: 2;
  md5: string;
  typeTags: Record<string, number>;
  arrays: Array<{ index: number; count: number }>;
  leaves: DebugLeaf[];
}

export interface DebugTableResult {
  /** Contents for generated_debug.cpp (ready to write to disk). */
  debugTableCpp: string;
  /** Structured manifest for the editor (ready to JSON.stringify). */
  debugMap: DebugMapV2;
  /** Any leaves that couldn't be classified (unsupported type construct,
   *  user-defined enum, reference, etc.). Useful for warnings. */
  skipped: Array<{ path: string; reason: string }>;
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

  // Buckets of entries — grown in order, flushed at program boundary or size cap.
  const arrays: Entry[][] = [[]];
  const leaves: DebugLeaf[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];

  const tail = (): Entry[] => arrays[arrays.length - 1]!;

  const ensureRoom = () => {
    if (tail().length >= maxEntries) arrays.push([]);
  };

  const addLeaf = (path: string, cppExpr: string, iecName: string) => {
    const tagName = IEC_NAME_TO_TAG[iecName.toUpperCase()];
    if (tagName === undefined) {
      skipped.push({ path, reason: `unknown elementary type: ${iecName}` });
      return;
    }
    const size = IEC_NAME_TO_SIZE[iecName.toUpperCase()] ?? 0;
    // Phase 4a: skip STRING/WSTRING because variable-length encoding isn't
    // defined yet.
    if (tagName === "STRING" || tagName === "WSTRING") {
      skipped.push({ path, reason: `string types deferred to Phase 4b` });
      return;
    }
    ensureRoom();
    const bucket = tail();
    const arrIdx = arrays.length - 1;
    const elemIdx = bucket.length;
    bucket.push({ cppExpr, tagName, path, type: tagName, size });
    leaves.push({ arrayIdx: arrIdx, elemIdx, path, type: tagName, size });
  };

  // visitTypeRef walks a TypeReference: elementary type → leaf, inline array
  // → per-element recursion, named user type (struct / FB / elementary alias)
  // → recurse into definition.
  const visitTypeRef = (
    path: string,
    cppExpr: string,
    typeRef: TypeReference,
  ): void => {
    // Inline array: `ARRAY[0..4] OF INT` → has arrayDimensions + elementTypeName
    if (typeRef.arrayDimensions && typeRef.elementTypeName) {
      walkArrayDims(
        path,
        cppExpr,
        typeRef.arrayDimensions,
        0,
        typeRef.elementTypeName,
      );
      return;
    }

    const name = typeRef.name.toUpperCase();

    // Named elementary type (or alias thereof).
    if (IEC_NAME_TO_TAG[name] !== undefined) {
      addLeaf(path, cppExpr, name);
      return;
    }

    // Named type — covers user-defined TYPE..END_TYPE and library-registered
    // types (struct/enum/alias). The symbol table is the unified source.
    const ts = symbolTables.lookupType(name);
    if (ts) {
      const def = ts.declaration.definition;
      if (def.kind === "StructDefinition") {
        visitStructFields(path, cppExpr, def);
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
        );
        return;
      }
      if (def.kind === "EnumDefinition") {
        // Enums are stored as their base type; treat as a scalar whose tag
        // matches the base. Default INT if no baseType.
        const baseName = def.baseType?.name?.toUpperCase() ?? "INT";
        if (IEC_NAME_TO_TAG[baseName] !== undefined) {
          addLeaf(path, cppExpr, baseName);
          return;
        }
        skipped.push({ path, reason: `enum base type ${baseName} unknown` });
        return;
      }
      if (def.kind === "SubrangeDefinition") {
        const baseName = def.baseType.name.toUpperCase();
        if (IEC_NAME_TO_TAG[baseName] !== undefined) {
          addLeaf(path, cppExpr, baseName);
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
        visitTypeRef(path, cppExpr, def);
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
      if (interfaceVars.length > 0) {
        for (const v of interfaceVars) {
          visitTypeRef(
            `${path}.${v.name.toUpperCase()}`,
            `${cppExpr}.${v.name}`,
            v.declaration.type,
          );
        }
      } else {
        for (const block of fbSym.declaration.varBlocks) {
          if (
            block.blockType === "VAR" ||
            block.blockType === "VAR_INPUT" ||
            block.blockType === "VAR_OUTPUT" ||
            block.blockType === "VAR_IN_OUT"
          ) {
            for (const fieldDecl of block.declarations) {
              for (const fieldName of fieldDecl.names) {
                visitTypeRef(
                  `${path}.${fieldName.toUpperCase()}`,
                  `${cppExpr}.${fieldName}`,
                  fieldDecl.type,
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
  ): void => {
    for (const fieldDecl of def.fields) {
      for (const fieldName of fieldDecl.names) {
        visitTypeRef(
          `${path}.${fieldName.toUpperCase()}`,
          `${cppExpr}.${fieldName}`,
          fieldDecl.type,
        );
      }
    }
  };

  const walkArrayDims = (
    path: string,
    cppExpr: string,
    dims: Array<{ start: number; end: number }>,
    dimIdx: number,
    elementTypeName: string,
  ): void => {
    if (dimIdx >= dims.length) {
      // Innermost element — visit as a TypeReference with the element type
      // name. Manufacture a minimal TypeReference for recursion.
      visitTypeRef(path, cppExpr, {
        kind: "TypeReference",
        name: elementTypeName,
        isReference: false,
        referenceKind: "none",
      } as TypeReference);
      return;
    }
    const { start, end } = dims[dimIdx]!;
    for (let i = start; i <= end; i++) {
      walkArrayDims(
        `${path}[${i}]`,
        `${cppExpr}[${i}]`,
        dims,
        dimIdx + 1,
        elementTypeName,
      );
    }
  };

  const visitVarDecl = (
    path: string,
    cppExpr: string,
    decl: VarDeclaration,
  ): void => {
    for (const varName of decl.names) {
      visitTypeRef(
        `${path}.${varName.toUpperCase()}`,
        `${cppExpr}.${varName}`,
        decl.type,
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
  // C++ expression is `${configGlobal}.${name}` because globals are
  // emitted as members of the Configuration class (see codegen.ts
  // `generateConfigurationFromAST`).
  for (const config of ast.configurations) {
    for (const block of config.varBlocks) {
      if (block.blockType !== "VAR_GLOBAL") continue;
      for (const decl of block.declarations) {
        for (const varName of decl.names) {
          visitTypeRef(
            varName.toUpperCase(),
            `${configGlobal}.${varName}`,
            decl.type,
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
            for (const decl of block.declarations) {
              visitVarDecl(basePath, baseCpp, decl);
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
  const debugTableCpp = renderCpp(arrays, configGlobal, configName);
  const debugMap: DebugMapV2 = {
    version: 2,
    md5,
    typeTags: { ...TAG },
    arrays: arrays.map((a, i) => ({ index: i, count: a.length })),
    leaves,
  };

  return { debugTableCpp, debugMap, skipped };
}

// ---------------------------------------------------------------------------
// C++ rendering
// ---------------------------------------------------------------------------

function renderCpp(
  arrays: Entry[][],
  configGlobal: string,
  configName: string,
): string {
  const lines: string[] = [];
  lines.push("// SPDX-License-Identifier: GPL-3.0-or-later");
  lines.push("// Generated by STruC++ debug-table-gen - Do not edit by hand.");
  lines.push("//");
  lines.push("// Per-project debugger pointer tables consumed by");
  lines.push("// strucpp::debug::handle_*() in debug_dispatch.hpp.");
  lines.push("");
  lines.push('#include "generated.hpp"');
  lines.push('#include "debug_dispatch.hpp"');
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
          `    { (void*)&${e.cppExpr}, TAG_${e.tagName}, 0 },  // ${e.path}`,
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
  lines.push("} } // namespace strucpp::debug");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Expression helpers
// ---------------------------------------------------------------------------

/** Evaluate a compile-time integer Expression; returns undefined on failure. */
function evalIntConst(e: unknown): number | undefined {
  if (!e || typeof e !== "object") return undefined;
  const expr = e as {
    kind?: string;
    value?: unknown;
    operand?: unknown;
    operator?: string;
  };
  if (expr.kind === "LiteralExpression") {
    if (typeof expr.value === "number") return expr.value;
    if (typeof expr.value === "bigint") {
      const n = Number(expr.value);
      if (Number.isSafeInteger(n)) return n;
    }
  }
  if (expr.kind === "UnaryExpression" && expr.operator === "-") {
    const inner = evalIntConst(expr.operand);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

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
