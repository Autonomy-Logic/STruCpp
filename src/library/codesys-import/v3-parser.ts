// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * CODESYS V3 .library file parser.
 *
 * Extracts POU source code from CODESYS V3 .library files (ZIP archives).
 *
 * Format overview (reverse-engineered, undocumented):
 * - ZIP archive containing GUID-named .meta/.object pairs + auxiliary files.
 * - String table: __shared_data_storage_string_table__.auxiliary
 *   All source text stored as sequential LEB128-indexed UTF-8 entries.
 *   Strings are added to the table in the order POUs are saved, so the
 *   indices for any single POU's lines tend to form a contiguous
 *   monotonically-increasing range. Common lines like "ELSE", "END_IF;",
 *   "" (empty), "*)" reuse low-varint shared entries — this matters
 *   because filtering rows by varint range would drop legitimate source
 *   that happens to use a shared string.
 * - Object files: UUID.object — per-POU binary with two sub-objects:
 *   1) Implementation (code body): records 1..boundary
 *   2) Declaration (header + VAR blocks + comment): records after boundary
 *   Records are varint tuples delimited by 8 zero bytes.
 *
 * Object file binary layout:
 *   [20-byte header: magic 02200928 + 12 zeros + uint32LE data length]
 *   [Record 0 — metadata, n=9: varint[5] = total impl line count]
 *   [Records 1..N-1 — thin impl rows, n=3: col 0 = line content]
 *   [Boundary record — fat row-packed overflow, holds remaining impl lines]
 *   [Header record — col 0 (or col 1 for n=4) = "FUNCTION_BLOCK X" / etc.]
 *   [Decl thin records — col 0 = decl line]
 *   [Final record — variable, no terminator]
 *
 * Boundary record (fat) row layout:
 *   The boundary record packs the trailing impl-section lines that didn't
 *   fit in thin records. Each "row" begins with the line-content varint at
 *   col 0, followed by 0+ non-zero metadata varints, followed by exactly
 *   7+ zero varints as padding. The next row's col 0 starts immediately
 *   after the zero run. We don't rely on a fixed stride: per-row width
 *   varies (observed 10 cols for short impls, 11 cols partway through long
 *   ones — the extra column appears once additional row metadata kicks in
 *   for the trailing comment block). A zero-run delimiter is the only
 *   reliable boundary, and the total row count is bounded by R0[5] minus
 *   the thin record count, which lets us stop before any post-impl junk.
 *
 * For very short impls (boundary record n in [4..16]), the boundary
 * record's col 0 is simply the last impl line (often "*)" closing a
 * trailing block comment) and the row detector terminates after one row.
 *
 * Folder hierarchy:
 *   The ZIP also contains every POU's matching `<UUID>.meta` file plus
 *   "folder placeholder" entries (tiny `.meta` + 23-byte `.object` pairs)
 *   that describe the project explorer tree (CODESYS Library Manager
 *   shows them as `POUs/Time&Date/DCF77` etc.). Each .meta carries the
 *   own GUID, a parent-folder GUID, and a display-name string-table
 *   index, so walking the parent chain from any POU's .meta resolves to
 *   a slash-separated path that we surface as `ExtractedPOU.category`.
 *   Library-root and namespace-scope GUIDs (which appear in *every* meta
 *   and would otherwise be misread as a parent) are filtered out by
 *   reference-frequency: they're the most-referenced GUIDs in the file.
 */

import { inflateRawSync } from "zlib";
import type { ExtractedPOU, POUType } from "./types.js";

/** String table magic bytes: 0xFA 0x53. */
const STRING_TABLE_MAGIC = Buffer.from([0xfa, 0x53]);

/** String table filename within the ZIP archive. */
const STRING_TABLE_NAME = "__shared_data_storage_string_table__.auxiliary";

/** 8 zero bytes used as record delimiter in object files. */
const RECORD_DELIMITER = Buffer.alloc(8, 0);

/** Object file header size (magic + padding + length field). */
const OBJECT_HEADER_SIZE = 20;

/** Minimum useful object file size (header + at least a few records). */
const MIN_OBJECT_SIZE = 30;

/** Regex to identify POU declaration strings. */
const POU_DECL_RE = /^\s*(FUNCTION_BLOCK|FUNCTION|PROGRAM)\s+(\w+)/;

/** Regex to identify TYPE declarations. */
const TYPE_DECL_RE = /^TYPE\s+(\w+)/;

/** Regex to identify Global Variable Lists. */
const GVL_DECL_RE = /^VAR_GLOBAL/;

/**
 * Read a LEB128 (unsigned) variable-length integer from a buffer.
 * Returns the decoded value and the new offset.
 * Limited to 28-bit shift to stay within JS 32-bit signed integer range.
 */
export function readLEB128(data: Buffer, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  while (offset < data.length) {
    const byte = data[offset]!;
    offset++;
    value |= (byte & 0x7f) << shift;
    shift += 7;
    if (!(byte & 0x80)) break;
    if (shift >= 28) break; // Prevent overflow beyond 32-bit signed range
  }
  return [value, offset];
}

/**
 * Parse the string table auxiliary file.
 *
 * Format:
 *   [0xFA 0x53] [flag byte] [GUID length byte] [GUID ASCII string]
 *   Repeated: [LEB128 index] [LEB128 length] [UTF-8 string bytes]
 */
export function parseStringTable(data: Buffer): {
  strings: Map<number, string>;
  guid: string;
} {
  if (data.length < 4 || !data.subarray(0, 2).equals(STRING_TABLE_MAGIC)) {
    throw new Error(
      `Invalid string table magic: ${data.subarray(0, 2).toString("hex")}`,
    );
  }

  const guidLen = data[3]!;
  const guid = data.subarray(4, 4 + guidLen).toString("ascii");
  let offset = 4 + guidLen;

  const strings = new Map<number, string>();
  while (offset < data.length) {
    const [idx, o1] = readLEB128(data, offset);
    const [length, o2] = readLEB128(data, o1);
    offset = o2;
    if (offset + length > data.length) break;
    strings.set(idx, data.subarray(offset, offset + length).toString("utf-8"));
    offset += length;
  }

  return { strings, guid };
}

/**
 * Decode all LEB128-encoded values from a binary buffer.
 */
export function decodeObjectIndices(data: Buffer): number[] {
  const indices: number[] = [];
  let offset = 0;
  while (offset < data.length) {
    const [value, newOffset] = readLEB128(data, offset);
    indices.push(value);
    offset = newOffset;
  }
  return indices;
}

/**
 * Parse an object file into records delimited by 8 zero bytes.
 * Skips the 20-byte header.
 */
function parseObjectRecords(data: Buffer): number[][] {
  if (data.length < OBJECT_HEADER_SIZE) return [];

  let offset = OBJECT_HEADER_SIZE;
  const records: number[][] = [];
  let current: number[] = [];

  while (offset < data.length) {
    const [val, newOffset] = readLEB128(data, offset);
    current.push(val);
    offset = newOffset;

    // Check for 8-zero-byte record delimiter
    if (
      offset + 7 <= data.length &&
      data.subarray(offset, offset + 8).equals(RECORD_DELIMITER)
    ) {
      records.push(current);
      current = [];
      offset += 8;
    }
  }

  // Final record (no terminator)
  if (current.length > 0) {
    records.push(current);
  }

  return records;
}

/** GUID format used in CODESYS .meta files. */
const META_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Special "no parent" / "root" GUID. */
const META_ROOT_GUID = "00000000-0000-0000-0000-000000000000";

/** Per-object metadata extracted from an UUID.meta file. */
interface MetaInfo {
  /** Display name (for folder placeholders) — empty for POU metas. */
  displayName: string;
  /** All non-self GUID references found in the meta varints, in order. */
  guidRefs: string[];
}

/**
 * Decode every LEB128 varint in a binary buffer (skipping the 20-byte
 * header that .meta files share with .object files).
 */
function decodeVarintsAfterHeader(data: Buffer): number[] {
  if (data.length < OBJECT_HEADER_SIZE) return [];
  const out: number[] = [];
  let offset = OBJECT_HEADER_SIZE;
  while (offset < data.length) {
    const [val, newOffset] = readLEB128(data, offset);
    out.push(val);
    offset = newOffset;
  }
  return out;
}

/**
 * Pull the parent-GUID-candidate list and display name out of a .meta file.
 *
 * .meta layout (reverse-engineered):
 *   offset[2] = string-table index of OWN GUID
 *   offset[4] = string-table index of display name (folder placeholders only)
 *   Various GUID-resolved indices appear at higher positions; one of them
 *   is the parent folder's GUID, and a couple are namespace/library-root
 *   GUIDs that appear in EVERY meta (filtered separately by frequency).
 */
function parseMetaInfo(
  data: Buffer,
  ownGuid: string,
  strings: Map<number, string>,
): MetaInfo {
  const varints = decodeVarintsAfterHeader(data);
  const guidRefs: string[] = [];
  let displayName = "";
  for (let i = 0; i < varints.length; i++) {
    const s = strings.get(varints[i]!);
    if (s === undefined) continue;
    if (META_GUID_RE.test(s)) {
      if (s !== ownGuid && s !== META_ROOT_GUID) guidRefs.push(s);
    } else if (i === 4 && !displayName && s.length > 0) {
      // Display-name slot (only meaningful for folder placeholders).
      displayName = s;
    }
  }
  return { displayName, guidRefs };
}

/**
 * Build the folder-path map (POU GUID → "Folder/Subfolder" string) by
 * walking every .meta file in the archive.
 *
 * Two-pass algorithm:
 *   1. Collect every meta's GUID refs and compute reference frequency.
 *      The library-namespace and scope-root GUIDs appear in all ~600
 *      metas, so they sit at the top of the frequency table and are
 *      filtered out as "ambient" references rather than parent links.
 *   2. For each meta, pick the first remaining GUID ref as its parent.
 *      Walk the parent chain to construct the slash-separated path.
 *
 * V3 .library files without folders (or whose folder records were
 * stripped) just produce empty paths — every POU lives at the root.
 */
function buildFolderPaths(
  entries: Map<string, Buffer>,
  strings: Map<number, string>,
): Map<string, string> {
  // Pass 1: parse every .meta, count GUID-reference frequency.
  const metaByGuid = new Map<string, MetaInfo>();
  const refCount = new Map<string, number>();
  for (const [name, buf] of entries) {
    if (!name.endsWith(".meta")) continue;
    const guid = name.replace(/\.meta$/, "");
    const info = parseMetaInfo(buf, guid, strings);
    metaByGuid.set(guid, info);
    for (const ref of info.guidRefs) {
      refCount.set(ref, (refCount.get(ref) ?? 0) + 1);
    }
  }

  // GUIDs referenced by more metas than there are folders are ambient
  // (library namespace, scope root). The hand-decoded sample showed 4
  // such GUIDs in OSCAT, each appearing in 545+ metas. A folder, by
  // contrast, can only be the parent of however many objects sit in it,
  // and folders bottom out at a few dozen references at most. So any
  // GUID with reference count above the largest folder size is noise —
  // we err generous (top half of the metas) to keep the heuristic stable
  // across smaller libraries.
  const ambientThreshold = Math.floor(metaByGuid.size / 2);
  const ambient = new Set<string>();
  for (const [guid, count] of refCount) {
    if (count > ambientThreshold) ambient.add(guid);
  }

  // Resolve each meta's "real" parent GUID (first non-ambient ref).
  const parentByGuid = new Map<string, string>();
  for (const [guid, info] of metaByGuid) {
    const parent = info.guidRefs.find((r) => !ambient.has(r));
    if (parent) parentByGuid.set(guid, parent);
  }

  // Walk the parent chain to build path strings (folder names only —
  // POU metas have empty displayName so they don't contribute their own
  // segment, just their parent's path).
  const pathByGuid = new Map<string, string>();
  function pathOf(startGuid: string): string {
    if (pathByGuid.has(startGuid)) return pathByGuid.get(startGuid)!;
    const segments: string[] = [];
    const seen = new Set<string>();
    let cur: string | undefined = parentByGuid.get(startGuid);
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const meta = metaByGuid.get(cur);
      if (!meta) break;
      if (meta.displayName) segments.unshift(meta.displayName);
      cur = parentByGuid.get(cur);
    }
    const path = segments.join("/");
    pathByGuid.set(startGuid, path);
    return path;
  }
  for (const guid of metaByGuid.keys()) pathOf(guid);
  return pathByGuid;
}

/**
 * Test if a string is a recognized POU/TYPE/GVL header.
 */
function isHeaderString(s: string): boolean {
  return POU_DECL_RE.test(s) || TYPE_DECL_RE.test(s) || GVL_DECL_RE.test(s);
}

/**
 * Find the header record's column where the keyword lives.
 *
 * Header encoding varies by POU type:
 *   - FUNCTION_BLOCK / PROGRAM / TYPE: typically n=4 with col 1 holding the
 *     keyword and col 0 = 0 (padding).
 *   - FUNCTION (and a few others): n=3 with col 0 holding the keyword.
 *   - GVL (VAR_GLOBAL): n=4 with col 1, same shape as FUNCTION_BLOCK.
 *
 * Returns [columnIndex, headerString] or null.
 */
function findHeaderInRecord(
  rec: number[],
  strings: Map<number, string>,
): { col: number; header: string } | null {
  if (rec.length === 4) {
    const s = strings.get(rec[1]!) ?? "";
    if (isHeaderString(s)) return { col: 1, header: s };
  }
  if (rec.length >= 1) {
    const s = strings.get(rec[0]!) ?? "";
    if (isHeaderString(s)) return { col: 0, header: s };
  }
  return null;
}

/**
 * Extract impl lines from a fat boundary record using row-delimiter detection.
 *
 * Each row in the fat record consists of:
 *   - 1 content varint (col 0 = line text; can be any value, including
 *     empty strings or shared low-varint references like `*)`, `ELSE`)
 *   - 0+ non-zero metadata varints
 *   - 7+ zero varints as padding
 *
 * The next row's col 0 starts immediately after the zero run. Stops once
 * `expected` rows have been emitted (R0[5] gives the total impl line count,
 * so we always know exactly how many rows to read).
 */
function extractBoundaryRows(
  br: number[],
  strings: Map<number, string>,
  expected: number,
): string[] {
  const lines: string[] = [];
  let pos = 0;
  while (pos < br.length && lines.length < expected) {
    lines.push(strings.get(br[pos]!) ?? "");
    pos++;
    while (pos < br.length && br[pos] !== 0) pos++;
    let zeroRun = 0;
    while (pos < br.length && br[pos] === 0) {
      pos++;
      zeroRun++;
    }
    // No trailing zero run means the record doesn't follow row-packed format
    // (e.g. a non-overflow boundary). Bail out — the caller will have already
    // captured what's available.
    if (zeroRun === 0 && pos < br.length) break;
  }
  return lines;
}

/**
 * Extract the POU documentation from the trailing decl records.
 *
 * CODESYS's editor renders a POU in two panes: a declarations pane (top)
 * and a body pane (bottom). The decl sub-object in the .object file
 * mirrors the top pane exactly, and CODESYS reserves the slot AFTER the
 * last `END_VAR` (or `END_TYPE` for type definitions) for the POU's
 * documentation comment — that's why a `(* foo *)` written as the first
 * line of the body still ends up in the body sub-object, while the doc
 * block always lives in this trailing decl slot regardless of what the
 * user types where in either pane.
 *
 * Structural extraction:
 *   1. Walk the decl records and remember the index of the LAST one whose
 *      col 0 is "END_VAR" or "END_TYPE".
 *   2. Concatenate col 0 of every record after that anchor.
 *   3. Pull the first complete `(* … *)` block from the joined text.
 *      That's the POU's doc — no content heuristics, no trigger words.
 *
 * Returns null when no anchor is found, when the trailing tail is empty,
 * or when no closed `(* … *)` block is present (e.g. plain TYPE structs
 * with no comment, or POUs that omit a doc entirely).
 */
function extractDocFromDeclRecords(
  records: number[][],
  declStartIdx: number,
  strings: Map<number, string>,
): string | null {
  let anchorIdx = -1;
  for (let i = declStartIdx; i < records.length; i++) {
    const line = (strings.get(records[i]![0]!) ?? "").trim();
    if (line === "END_VAR" || line === "END_TYPE") anchorIdx = i;
  }
  if (anchorIdx === -1) return null;

  const tailLines: string[] = [];
  for (let i = anchorIdx + 1; i < records.length; i++) {
    if (records[i]!.length === 0) continue;
    tailLines.push(strings.get(records[i]![0]!) ?? "");
  }
  const tail = tailLines.join("\n");
  const docMatch = tail.match(/\(\*([\s\S]*?)\*\)/);
  if (!docMatch) return null;
  const inner = docMatch[1]!.trim();
  return inner.length > 0 ? inner : null;
}

/**
 * Extract a POU from a parsed object file's record stream.
 *
 * Layout:
 *   R0 — metadata, n=9. R0[5] = total impl line count (authoritative).
 *   R1..R(boundary-1) — thin impl rows (col 0 = line).
 *   R(boundary) — fat impl row-packed overflow (or small "last line" record
 *                 when impl fits in thin records alone).
 *   Header record — col 0 or col 1 holds "FUNCTION X" / "FUNCTION_BLOCK X"
 *                   / "PROGRAM X" / "TYPE X :" / "VAR_GLOBAL [CONSTANT|...]".
 *   Subsequent thin records — col 0 = decl line.
 *
 * The boundary is the first record after R0 with > 3 varints; this record
 * may carry overflow (fat impl) or just one trailing impl line (small).
 * Records between the boundary and the header record are post-impl noise
 * (compiler scratch / shared-string slots) and are skipped.
 */
function extractFromRecords(
  records: number[][],
  strings: Map<number, string>,
): {
  declaration: string;
  implementation: string;
  documentation?: string;
} | null {
  if (records.length < 3) return null;

  // R0[5] = total impl line count, but only for POU-shaped objects whose
  // R0 has 9 varints. TYPE and GVL objects use a different R0 layout (n=7
  // with semantic varints in different positions); they have no impl
  // section, so we treat their impl count as 0 and let the regular
  // boundary/header logic skip impl extraction entirely.
  const r0 = records[0]!;
  const totalImplLines = r0.length === 9 ? r0[5]! : 0;

  // Find boundary: first record after record 0 with more than 3 varints.
  let boundary = -1;
  for (let i = 1; i < records.length; i++) {
    if (records[i]!.length > 3) {
      boundary = i;
      break;
    }
  }
  if (boundary === -1) return null;

  // Impl: thin rows R1..R(boundary-1) col 0, then row-detector on boundary.
  const implLines: string[] = [];
  for (let i = 1; i < boundary; i++) {
    const rec = records[i]!;
    if (rec.length > 0) {
      implLines.push(strings.get(rec[0]!) ?? "");
    }
  }
  let cursor = boundary;
  if (totalImplLines > implLines.length) {
    const want = totalImplLines - implLines.length;
    implLines.push(...extractBoundaryRows(records[boundary]!, strings, want));
    cursor = boundary + 1;
  }

  // Header: scan from cursor, accept col 0 (n>=3) or col 1 (n=4). Records
  // between the boundary and the header that aren't themselves header
  // records carry the few impl lines that didn't fit in the boundary's
  // row-packed overflow (e.g. a single trailing `*)` of a block comment
  // for some FUNCTION-shaped POUs); their col 0 picks those up while we
  // still need more impl lines per R0[5].
  const declLines: string[] = [];
  let headerRecIdx = -1;
  let headerCol = -1;
  for (let i = cursor; i < records.length; i++) {
    const rec = records[i]!;
    const found = findHeaderInRecord(rec, strings);
    if (found) {
      declLines.push(found.header);
      headerRecIdx = i;
      headerCol = found.col;
      break;
    }
    if (implLines.length < totalImplLines && rec.length > 0) {
      implLines.push(strings.get(rec[0]!) ?? "");
    }
  }

  // Decl body: col 0 of every record after the header. We skip records
  // _before_ the header (post-impl junk: trailing block-comment closer
  // packed into a wide pseudo-record, etc.) but include all records after
  // it — including wide n=4 records like the closing `END_VAR` of a GVL,
  // whose col 0 holds the keyword and whose remaining columns are zero.
  if (headerRecIdx !== -1) {
    for (let i = headerRecIdx + 1; i < records.length; i++) {
      const rec = records[i]!;
      if (rec.length === 0) continue;
      declLines.push(strings.get(rec[0]!) ?? "");
    }
  }
  void headerCol;

  // Documentation — pulled structurally from the slot CODESYS reserves
  // for the POU's variables-pane comment (after the last END_VAR /
  // END_TYPE in the decl records). See extractDocFromDeclRecords for
  // the rationale; returning a `documentation` field instead of
  // re-discovering it via text regex downstream eliminates the risk of
  // mistaking a body comment or a `(* Initialize variables *)` inline
  // annotation for the POU doc.
  const documentation =
    headerRecIdx !== -1
      ? extractDocFromDeclRecords(records, headerRecIdx + 1, strings)
      : null;

  const result: {
    declaration: string;
    implementation: string;
    documentation?: string;
  } = {
    declaration: declLines.join("\n"),
    implementation: implLines.join("\n"),
  };
  if (documentation) result.documentation = documentation;
  return result;
}

/**
 * Classify the extracted content into an ExtractedPOU.
 * Determines the POU type and name from the declaration header.
 */
function classifyPOU(
  declaration: string,
  implementation: string,
  gvlCounter: { value: number },
): ExtractedPOU | null {
  const lines = declaration.split("\n");

  // Check for standard POU headers
  for (const line of lines) {
    const pouMatch = line.match(POU_DECL_RE);
    if (pouMatch) {
      return {
        type: pouMatch[1] as POUType,
        name: pouMatch[2]!,
        declaration,
        implementation,
        offset: 0,
      };
    }

    const typeMatch = line.match(TYPE_DECL_RE);
    if (typeMatch) {
      // TYPE declarations: everything is in the declaration, no implementation
      return {
        type: "TYPE",
        name: typeMatch[1]!,
        declaration,
        implementation: "",
        offset: 0,
      };
    }

    if (GVL_DECL_RE.test(line)) {
      // Empty GVLs (header followed immediately by END_VAR with no variable
      // declarations between) carry no semantic content and can use VAR_GLOBAL
      // qualifier combinations the strucpp parser doesn't recognize
      // (e.g. `VAR_GLOBAL PERSISTENT RETAIN`). Drop them — the resulting
      // archive is identical with or without an empty global section.
      const hasVars = lines.some((l) => /^\s*\w+\s*:/.test(l));
      if (!hasVars) return null;
      return {
        type: "GVL",
        name: `GVL_${gvlCounter.value++}`,
        declaration,
        implementation: "",
        offset: 0,
      };
    }
  }

  return null;
}

/**
 * Build a map of TYPE names from the string table.
 * Used to match bare STRUCT objects to their parent TYPE declaration.
 */
function buildTypeMap(strings: Map<number, string>): Map<string, string> {
  const typeMap = new Map<string, string>();
  const sortedIndices = [...strings.keys()].sort((a, b) => a - b);

  for (let i = 0; i < sortedIndices.length; i++) {
    const text = strings.get(sortedIndices[i]!)!;
    const match = text.match(/^TYPE\s+(\w+)\s*:/);
    if (match) {
      // Find the struct body that follows — look for STRUCT in nearby strings
      for (let j = i + 1; j < Math.min(i + 5, sortedIndices.length); j++) {
        const next = strings.get(sortedIndices[j]!) ?? "";
        if (next.trim().startsWith("STRUCT")) {
          // Map struct field content to TYPE name
          typeMap.set(next, match[1]!);
          break;
        }
      }
    }
  }

  return typeMap;
}

/**
 * Try to extract a POU from a bare STRUCT object (no TYPE header).
 * These are TYPE inner bodies — we match them to TYPE names via the string table.
 */
function handleBareStruct(
  declaration: string,
  typeMap: Map<string, string>,
): ExtractedPOU | null {
  const firstLine = declaration.split("\n")[0] ?? "";
  if (!firstLine.trim().startsWith("STRUCT")) return null;

  // Try to find the TYPE name from the type map
  const typeName = typeMap.get(firstLine);
  if (!typeName) return null;

  // Reconstruct the full TYPE declaration
  const fullDecl = `TYPE ${typeName} :\n${declaration}\nEND_TYPE`;
  return {
    type: "TYPE",
    name: typeName,
    declaration: fullDecl,
    implementation: "",
    offset: 0,
  };
}

/**
 * Recognized integer ST types whose VAR_GLOBAL CONSTANT entries can be
 * promoted to compile-time globalConstants. Booleans, strings, and
 * floating-point types stay as runtime GVL variables — only integer
 * widths fold cleanly into compileStlib's globalConstants map (which
 * targets C++ template parameters that demand a constexpr value).
 */
const INTEGER_ST_TYPES = new Set([
  "BYTE",
  "SINT",
  "USINT",
  "WORD",
  "INT",
  "UINT",
  "DWORD",
  "DINT",
  "UDINT",
  "LWORD",
  "LINT",
  "ULINT",
]);

/**
 * Parse a `VAR_GLOBAL CONSTANT` block and return the integer constants it
 * declares. Used to promote constants like OSCAT's STRING_LENGTH /
 * LIST_LENGTH into compile-time values that can be used as C++ template
 * parameters; the GVL itself is dropped to avoid a duplicate definition.
 *
 * Returns null if the declaration isn't a CONSTANT block, or if any
 * non-integer / non-numeric entries are present (the caller keeps the
 * GVL as a runtime variable in that case).
 */
function extractConstantGlobals(
  declaration: string,
): Record<string, number> | null {
  const lines = declaration.split("\n");
  let inConstantBlock = false;
  const out: Record<string, number> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^VAR_GLOBAL\s+CONSTANT\b/.test(line)) {
      inConstantBlock = true;
      continue;
    }
    if (line === "END_VAR") {
      inConstantBlock = false;
      continue;
    }
    if (
      line.startsWith("(*") ||
      line.startsWith("//") ||
      line.startsWith("*")
    ) {
      continue;
    }
    if (!inConstantBlock) continue;

    const match = line.match(/^(\w+)\s*:\s*(\w+)\s*:=\s*([+-]?\d+)\s*;?\s*$/);
    if (!match) return null;
    const [, name, type, valueStr] = match;
    if (!INTEGER_ST_TYPES.has(type!.toUpperCase())) return null;
    const value = Number.parseInt(valueStr!, 10);
    if (!Number.isFinite(value)) return null;
    out[name!] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Try to extract a GVL from an object whose declaration starts with
 * VAR_INPUT or VAR_GLOBAL or variable declarations directly.
 */
function handleBareGVL(
  declaration: string,
  gvlCounter: { value: number },
): ExtractedPOU | null {
  const stripped = declaration.trim();
  if (
    stripped.startsWith("VAR_GLOBAL") ||
    stripped.startsWith("VAR_INPUT") ||
    /^\t[A-Z_]\w+\s*:\s*\w+/.test(stripped)
  ) {
    // Empty GVLs (no `name : type` lines) are dropped here for the same
    // reason as in `classifyPOU` — see comment there.
    const lines = declaration.split("\n");
    const hasVars = lines.some((l) => /^\s*\w+\s*:/.test(l));
    if (!hasVars) return null;

    const name = `GVL_${gvlCounter.value++}`;
    // Wrap bare variable lists in VAR_GLOBAL if needed
    let body = declaration;
    if (
      !stripped.startsWith("VAR_GLOBAL") &&
      !stripped.startsWith("VAR_INPUT")
    ) {
      body = `VAR_GLOBAL\n${declaration}\nEND_VAR`;
    }
    return {
      type: "GVL",
      name,
      declaration: body,
      implementation: "",
      offset: 0,
    };
  }
  return null;
}

/**
 * Unzip entries from a buffer using Node.js built-in zlib.
 * Handles Stored (method 0) and Deflated (method 8) entries.
 */
function* unzipEntries(
  data: Buffer,
): Generator<{ name: string; data: Buffer }> {
  let offset = 0;
  const LOCAL_FILE_HEADER = 0x04034b50;

  while (offset + 30 <= data.length) {
    const sig = data.readUInt32LE(offset);
    if (sig !== LOCAL_FILE_HEADER) break;

    const compressionMethod = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const nameLen = data.readUInt16LE(offset + 26);
    const extraLen = data.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = data
      .subarray(nameStart, nameStart + nameLen)
      .toString("utf-8");
    const dataStart = nameStart + nameLen + extraLen;

    let entryData: Buffer;
    if (compressionMethod === 0) {
      entryData = data.subarray(dataStart, dataStart + compressedSize);
    } else if (compressionMethod === 8) {
      const compressed = data.subarray(dataStart, dataStart + compressedSize);
      entryData = inflateRawSync(compressed) as Buffer;
    } else {
      offset = dataStart + compressedSize;
      continue;
    }

    yield { name, data: entryData };
    offset = dataStart + compressedSize;
  }
}

/**
 * Parse a CODESYS V3 .library buffer and extract all POUs.
 *
 * Uses object file record parsing for complete extraction of:
 * - POU headers, VAR_INPUT/VAR_OUTPUT/VAR blocks, documentation
 * - Full implementation code
 *
 * @param data - Raw binary content of the .library ZIP archive
 * @returns Array of extracted POUs, library GUID, and any warnings
 */
export function parseV3Library(data: Buffer): {
  pous: ExtractedPOU[];
  guid: string;
  globalConstants: Record<string, number>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const globalConstants: Record<string, number> = {};

  // Extract all ZIP entries
  const entries = new Map<string, Buffer>();
  for (const entry of unzipEntries(data)) {
    entries.set(entry.name, entry.data);
  }

  // Parse string table
  const stData = entries.get(STRING_TABLE_NAME);
  if (!stData) {
    return {
      pous: [],
      guid: "",
      globalConstants,
      warnings: ["String table not found in ZIP archive."],
    };
  }

  let strings: Map<number, string>;
  let guid: string;
  try {
    const result = parseStringTable(stData);
    strings = result.strings;
    guid = result.guid;
  } catch (e) {
    return {
      pous: [],
      guid: "",
      globalConstants,
      warnings: [
        `Failed to parse string table: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  // Build TYPE name map for matching bare STRUCT objects
  const typeMap = buildTypeMap(strings);

  // Build folder-path map (POU GUID → "Folder/Subfolder"). Empty paths
  // (POUs at the library root) just produce no `category` on the result.
  const folderPaths = buildFolderPaths(entries, strings);

  // Process each .object file
  const pous: ExtractedPOU[] = [];
  const seenNames = new Set<string>();
  const gvlCounter = { value: 0 };

  const objectEntries = [...entries.entries()].filter(([name]) =>
    name.endsWith(".object"),
  );

  for (const [name, objData] of objectEntries) {
    // Skip tiny metadata objects
    if (objData.length < MIN_OBJECT_SIZE) continue;

    const records = parseObjectRecords(objData);
    const extracted = extractFromRecords(records, strings);
    if (!extracted) continue;

    const { declaration, implementation, documentation } = extracted;

    // VAR_GLOBAL CONSTANT integer blocks promote to compile-time constants
    // and the GVL is dropped — see extractConstantGlobals for the rationale.
    const constants = extractConstantGlobals(declaration);
    if (constants) {
      Object.assign(globalConstants, constants);
      continue;
    }

    // Try standard POU classification first
    let pou = classifyPOU(declaration, implementation, gvlCounter);

    // Try bare STRUCT → TYPE matching
    if (!pou) {
      pou = handleBareStruct(declaration, typeMap);
    }

    // Try bare GVL extraction
    if (!pou) {
      pou = handleBareGVL(declaration, gvlCounter);
    }

    if (pou && !seenNames.has(pou.name)) {
      const objGuid = name.replace(/\.object$/, "");
      const path = folderPaths.get(objGuid);
      if (path) pou.category = path;
      if (documentation) pou.documentation = documentation;
      seenNames.add(pou.name);
      pous.push(pou);
    }
  }

  // Sort by name for deterministic output
  pous.sort((a, b) => a.name.localeCompare(b.name));

  return { pous, guid, globalConstants, warnings };
}
