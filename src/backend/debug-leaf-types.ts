// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Leaf primitives shared by everything that flattens IEC state into debug
 * leaves.
 *
 * Split out of `debug-table-gen.ts` so the library compiler can flatten a
 * library's function blocks with the SAME tables and the SAME flag rules the
 * debug table uses, without the two importing each other. Nothing here knows
 * about buckets, addresses or manifests — those stay with their generators.
 */

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
export function applyBlockFlags(
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
 * Render an entry's flags byte as C++.
 *
 * Emits the named constant rather than a literal so `generated_debug.cpp`
 * reads as intent — a reviewer scanning the table sees which leaves are
 * gated without decoding a bitmask — and so a stale generated file fails to
 * compile against a header that renamed the flag instead of silently setting
 * the wrong bit.
 */
export function flagsLiteral(flags: number): string {
  const names: string[] = [];
  if (flags & LEAF_FLAG_READONLY) names.push("LEAF_FLAG_READONLY");
  if (flags & LEAF_FLAG_RETAIN) names.push("LEAF_FLAG_RETAIN");
  return names.length > 0 ? names.join(" | ") : "0";
}

export const TAG_NAME_BY_VALUE: Record<number, TagName> = Object.fromEntries(
  Object.entries(TAG).map(([k, v]) => [v, k as TagName]),
) as Record<number, TagName>;

/** Map IEC type name (upper case) → TagName (canonical). Handles aliases. */
export const IEC_NAME_TO_TAG: Record<string, TagName> = {
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
export const IEC_NAME_TO_SIZE: Record<string, number> = {
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
