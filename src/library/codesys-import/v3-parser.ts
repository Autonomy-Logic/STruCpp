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
 *   monotonically-increasing range — a useful signal for distinguishing
 *   real-content varints from shared/junk pointers reused across POUs.
 * - Object files: UUID.object — per-POU binary with two sub-objects:
 *   1) Implementation (code body): records 1..boundary, column A
 *   2) Declaration (VAR blocks + header): records after boundary, column A
 *   Records are 3-varint tuples delimited by 8 zero bytes.
 *   A "boundary" record (the first record after R0 with >3 varints)
 *   separates the two sub-objects.
 *
 * Boundary-record packing (the source of most extraction subtleties):
 *   When a POU's implementation fits in fewer than ~127 lines, the
 *   boundary record is small (n in [4..16]) and its column A holds
 *   simply the LAST impl line — typically the closing `*)` of a
 *   trailing block comment whose body lived in the records just before.
 *   For longer implementations, CODESYS packs the overflow into the
 *   boundary record at stride-10 positions: varint[0], [10], [20], ….
 *   We read both layouts here (the old `i < boundary` was off-by-one).
 *
 * Object file binary layout:
 *   [20-byte header: magic 02200928 + 12 zeros + uint32LE data length]
 *   [Record 0: 9+ varints + 8-zero terminator]  (metadata)
 *   [Records 1..N: 3 varints + 8-zero terminator]  (implementation lines)
 *   [Boundary record: 6+ varints + 8-zero terminator]
 *   [Records: 3-4 varints + 8-zero terminator]  (declaration lines)
 *   [Final record: varints, NO terminator]
 *
 * KNOWN REVERSE-ENGINEERING GAPS (TODO):
 * 1. Long-impl boundary records (~600+ varints) for the largest OSCAT
 *    POUs (DCF77, UTC_TO_LTIME) transition from stride-10 to a non-
 *    uniform stride (~11) partway through. Empirical analysis of DCF77
 *    R62 (n=1484) shows real-content varints at stride-10 positions
 *    0..1280 and at irregular positions 1302/1313/1335/… afterwards,
 *    plus the closing `*)` at position 1445 (varint=11, a low/shared
 *    string value that filters by `varint > maxCol0` would miss).
 *    The transition point appears related to row metadata that the
 *    parser doesn't yet decode. Pure stride-10 over-reads (picks up
 *    junk shared strings from later rows); pure varint-filter under-
 *    reads (drops legitimate-but-shared lines like `END_IF;`, `ELSE`,
 *    `*)`). Net result: 2/559 OSCAT POUs cannot be cleanly extracted
 *    today, so OSCAT's .stlib stays tracked in libs/ as a build
 *    artifact exception until this is resolved.
 * 2. VAR_GLOBAL extraction misses the OSCAT GVL that instantiates
 *    LANGUAGE/MATH/PHYS/SETUP/LOCATION as instances of the CONSTANTS_*
 *    struct types. The struct TYPEs themselves are extracted cleanly;
 *    only the global variable instances are missing. POUs that
 *    reference `LANGUAGE.WEEKDAYS[…]` etc. (HOLIDAY, SUN_POS, the
 *    date-localisation helpers) would compile-fail without those
 *    globals.
 *
 * Both are tracked in TODO comments at the relevant code sites below.
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

/**
 * Extract a POU from a parsed object file's record stream.
 *
 * Object files contain two sub-objects:
 *   1) Implementation: records 1..boundary-1, varint[0] = string index
 *   2) Declaration: records boundary+1..end
 *
 * The boundary record is the first record after record 0 with > 3 varints.
 *
 * The POU/TYPE header string is found in the first 4-varint record at or
 * after the boundary, at varint[1].  For TYPEs (boundary=1, no impl), this
 * is the boundary itself; for FBs/FUNCTIONs, it's the first decl record.
 */
function extractFromRecords(
  records: number[][],
  strings: Map<number, string>,
): { declaration: string; implementation: string } | null {
  if (records.length < 3) return null;

  // Find boundary: first record after record 0 with more than 3 varints
  let boundary = -1;
  for (let i = 1; i < records.length; i++) {
    if (records[i]!.length > 3) {
      boundary = i;
      break;
    }
  }

  if (boundary === -1) return null;

  // Implementation extraction.
  //
  // Records 1..boundary-1 are "thin" rows (n=3) carrying one impl line
  // each in varint[0]. The boundary record itself is special: when the
  // implementation fits in fewer than ~127 lines it shows up as a
  // medium-sized record (n in [4..16]) whose varint[0] is the LAST impl
  // line (often the closing `*)` of a trailing block comment). When the
  // implementation is longer, CODESYS packs the overflow into a much
  // larger boundary record where additional impl lines live at
  // stride-10 positions: varint[0], [10], [20], ..., [stride*k].
  //
  // The non-stride positions in a fat boundary record carry per-line
  // metadata (column-name pointers, junk shared strings) that's
  // irrelevant for source extraction. The pattern was observed across
  // every OSCAT POU with > ~127 impl lines (HOLIDAY, DCF77, _ARRAY_SORT,
  // SEQUENCE_4/8, ESR_MON_B8, etc.); without reading the stride
  // overflow we'd drop the tail of the implementation, leaving
  // unclosed block comments and dangling IF/END_IF pairs that fail to
  // recompile.
  const STRIDE_OVERFLOW = 10;
  const implLines: string[] = [];
  for (let i = 1; i < boundary; i++) {
    const rec = records[i]!;
    if (rec.length > 0) {
      implLines.push(strings.get(rec[0]!) ?? "");
    }
  }
  // Boundary record: varint[0] always; varint[10*k] for fat boundaries.
  const boundaryRec = records[boundary]!;
  if (boundaryRec.length > 0) {
    implLines.push(strings.get(boundaryRec[0]!) ?? "");
  }
  for (let k = STRIDE_OVERFLOW; k < boundaryRec.length; k += STRIDE_OVERFLOW) {
    implLines.push(strings.get(boundaryRec[k]!) ?? "");
  }

  // Find the POU/TYPE header: scan from boundary for first 4-varint record
  // whose rec[1] resolves to a recognized header string.
  const declLines: string[] = [];
  let headerRecIdx = -1;

  for (let i = boundary; i < records.length; i++) {
    const rec = records[i]!;
    if (rec.length === 4 && rec.length <= 4) {
      const headerStr = strings.get(rec[1]!) ?? "";
      if (POU_DECL_RE.test(headerStr) || /^TYPE\s+\w+/.test(headerStr)) {
        declLines.push(headerStr);
        headerRecIdx = i;
        break;
      }
    }
  }

  // Declaration body: records after boundary (skipping the header record)
  for (let i = boundary + 1; i < records.length; i++) {
    if (i === headerRecIdx) continue; // already handled
    const rec = records[i]!;
    if (rec.length > 0) {
      declLines.push(strings.get(rec[0]!) ?? "");
    }
  }

  return {
    declaration: declLines.join("\n"),
    implementation: implLines.join("\n"),
  };
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
  warnings: string[];
} {
  const warnings: string[] = [];

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
      warnings: [
        `Failed to parse string table: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  // Build TYPE name map for matching bare STRUCT objects
  const typeMap = buildTypeMap(strings);

  // Process each .object file
  const pous: ExtractedPOU[] = [];
  const seenNames = new Set<string>();
  const gvlCounter = { value: 0 };

  const objectEntries = [...entries.entries()].filter(([name]) =>
    name.endsWith(".object"),
  );

  for (const [, objData] of objectEntries) {
    // Skip tiny metadata objects
    if (objData.length < MIN_OBJECT_SIZE) continue;

    const records = parseObjectRecords(objData);
    const extracted = extractFromRecords(records, strings);
    if (!extracted) continue;

    const { declaration, implementation } = extracted;

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
      seenNames.add(pou.name);
      pous.push(pou);
    }
  }

  // Sort by name for deterministic output
  pous.sort((a, b) => a.name.localeCompare(b.name));

  return { pous, guid, warnings };
}
