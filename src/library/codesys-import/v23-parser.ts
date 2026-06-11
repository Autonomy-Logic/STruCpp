// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * CODESYS V2.3 .lib file parser.
 *
 * Extracts POU / GVL / data-type source from the binary container format used by
 * CODESYS 2.3 (magic "CoDeSys+"). The container is an MFC-style serialized object
 * graph: each text artefact (a POU declaration, an implementation body, a global
 * variable list, a data-type definition, an object name) is stored as a
 * **length-prefixed string** — a 4-byte little-endian length immediately followed by
 * exactly that many latin1 bytes. Objects are separated by class descriptors, 0xCD
 * uninitialised-memory filler and null padding.
 *
 * Per POU the layout is:
 *   [4-byte LE decl-length] [declaration text]
 *   [0x12 separator] [4-byte LE impl-length] [implementation text]
 * GVLs and data types are a single length-prefixed declaration with no body.
 *
 * We locate each artefact by scanning for its leading ST keyword and then reading the
 * length prefix that sits immediately before it, extracting EXACTLY that many bytes.
 * This is what keeps the extraction clean: an earlier approach regex-scanned the whole
 * latin1-decoded blob for `VAR_GLOBAL … END_VAR`, which let the match run past the real
 * end of a (often empty) GVL and swallow the surrounding container framing — null
 * padding and 0xCD filler. Reading the length-prefixed record bounds the text exactly,
 * and a final printable-text guard rejects any misread that still straddles binary.
 */

import {
  bytesEqual,
  bytesToHex,
  bytesToLatin1,
  findSubArray,
  readUInt32LE,
  utf8ToBytes,
} from "../../byte-utils.js";
import type { ExtractedPOU, POUType } from "./types.js";

const CODESYS_V23_MAGIC = utf8ToBytes("CoDeSys+");

/** Min/max plausible length for a length-prefixed declaration record. */
const MIN_DECL_LEN = 10;
const MAX_DECL_LEN = 100_000;
const MAX_IMPL_LEN = 500_000;

/** Implementation-section separator byte that follows a POU declaration record. */
const IMPL_SEPARATOR = 0x12;

/** Keyword patterns that begin a length-prefixed record, in scan order. */
const RECORD_KEYWORDS: Array<{
  bytes: Uint8Array;
  type: POUType;
  hasImpl: boolean;
}> = [
  {
    bytes: utf8ToBytes("FUNCTION_BLOCK "),
    type: "FUNCTION_BLOCK",
    hasImpl: true,
  },
  { bytes: utf8ToBytes("FUNCTION "), type: "FUNCTION", hasImpl: true },
  { bytes: utf8ToBytes("PROGRAM "), type: "PROGRAM", hasImpl: true },
  { bytes: utf8ToBytes("VAR_GLOBAL"), type: "GVL", hasImpl: false },
  { bytes: utf8ToBytes("TYPE "), type: "TYPE", hasImpl: false },
];

/** Regex for extracting POU names from declaration text. */
const POU_NAME_RE =
  /^\s*(?:FUNCTION_BLOCK\s+(\w+)|FUNCTION\s+(\w+)|PROGRAM\s+(\w+))/;

/** Regex for extracting the type name from a `TYPE Name : …` declaration. */
const TYPE_NAME_RE = /^\s*TYPE\s+(\w+)\s*:/;

/**
 * True if `text` is clean ST source: printable characters plus tab/CR/LF only.
 * Rejects NUL and other C0 control bytes (a length-prefix misread that ran into
 * container padding/filler) as well as long runs of 0xCD filler.
 */
function isCleanText(text: string): boolean {
  let cdRun = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x00) return false;
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return false;
    cdRun = c === 0xcd ? cdRun + 1 : 0;
    if (cdRun >= 3) return false; // 0xCD uninitialised-memory filler
  }
  return true;
}

/**
 * Validate that a buffer starts with the CODESYS V2.3 magic bytes.
 */
export function isV23Library(data: Uint8Array): boolean {
  return data.length >= 8 && bytesEqual(data.subarray(0, 8), CODESYS_V23_MAGIC);
}

/**
 * Given the byte offset where a record's text begins, walk back over up to two
 * leading whitespace bytes (some declarations are stored with a leading tab/space)
 * and return the real text start, or `idx` unchanged.
 */
function withLeadingWhitespace(data: Uint8Array, idx: number): number {
  let textStart = idx;
  for (let lookback = 1; lookback <= 2; lookback++) {
    const b = data[idx - lookback];
    if (idx >= lookback && (b === 0x09 || b === 0x20))
      textStart = idx - lookback;
    else break;
  }
  return textStart;
}

/**
 * Read the length-prefixed declaration record whose text starts at `textStart`.
 * Returns the decoded text + the offset just past it, or null if the 4-byte length
 * prefix is implausible or the bytes aren't clean ST.
 */
function readDeclRecord(
  data: Uint8Array,
  textStart: number,
): { text: string; end: number } | null {
  if (textStart < 4) return null;
  const len = readUInt32LE(data, textStart - 4);
  if (len < MIN_DECL_LEN || len > MAX_DECL_LEN) return null;
  if (textStart + len > data.length) return null;
  const text = bytesToLatin1(data.subarray(textStart, textStart + len));
  if (!isCleanText(text)) return null;
  return { text, end: textStart + len };
}

/**
 * Read the optional implementation record that follows a POU declaration:
 * `[0x12][4-byte LE impl-length][implementation text]`. Returns "" when absent.
 */
function readImplRecord(data: Uint8Array, declEnd: number): string {
  if (declEnd >= data.length || data[declEnd] !== IMPL_SEPARATOR) return "";
  if (declEnd + 5 > data.length) return "";
  const len = readUInt32LE(data, declEnd + 1);
  if (len === 0 || len > MAX_IMPL_LEN || declEnd + 5 + len > data.length)
    return "";
  const text = bytesToLatin1(data.subarray(declEnd + 5, declEnd + 5 + len));
  return isCleanText(text) ? text : "";
}

/**
 * Recover a GVL's name (CODESYS 2.3 stores it as a length-prefixed identifier in the
 * object metadata that precedes the VAR_GLOBAL text, e.g. "Constants", "MATH"). Scans
 * backward for the nearest preceding length-prefixed identifier; falls back to a stable
 * `GVL_<index>` when none is found (e.g. the default global list in the file header).
 */
function recoverGvlName(
  data: Uint8Array,
  recordStart: number,
  fallbackIndex: number,
): string {
  const isIdent = (a: number, n: number): boolean => {
    if (n < 1 || n > 64) return false;
    for (let i = a; i < a + n; i++) {
      const c = data[i]!;
      const ok =
        (c >= 0x30 && c <= 0x39) ||
        (c >= 0x41 && c <= 0x5a) ||
        (c >= 0x61 && c <= 0x7a) ||
        c === 0x5f;
      if (!ok) return false;
    }
    return true;
  };
  for (let p = recordStart - 5; p >= Math.max(0, recordStart - 400); p--) {
    const len = readUInt32LE(data, p);
    if (
      len >= 1 &&
      len <= 64 &&
      p + 4 + len <= recordStart &&
      isIdent(p + 4, len)
    ) {
      return bytesToLatin1(data.subarray(p + 4, p + 4 + len));
    }
  }
  return `GVL_${fallbackIndex}`;
}

/**
 * Scan the binary for every length-prefixed record beginning with a known ST keyword
 * and extract it cleanly. POUs additionally carry an implementation record.
 */
function findRecords(data: Uint8Array): ExtractedPOU[] {
  const out: ExtractedPOU[] = [];
  const seen = new Set<number>(); // text-start offsets, to avoid duplicate detections
  let gvlIndex = 0;

  for (const { bytes: pattern, type, hasImpl } of RECORD_KEYWORDS) {
    let offset = 0;
    for (;;) {
      const idx = findSubArray(data, pattern, offset);
      if (idx === -1) break;
      offset = idx + 1;

      const textStart = withLeadingWhitespace(data, idx);
      if (seen.has(textStart)) continue;

      const decl = readDeclRecord(data, textStart);
      if (!decl) continue;

      let name: string;
      if (type === "GVL") {
        // GVL text is just `VAR_GLOBAL [modifier]\n…\nEND_VAR`; its name lives in the
        // preceding object metadata.
        if (!/^\s*VAR_GLOBAL\b/.test(decl.text)) continue;
        name = recoverGvlName(data, textStart, gvlIndex++);
      } else if (type === "TYPE") {
        const m = decl.text.match(TYPE_NAME_RE);
        if (!m) continue;
        name = m[1]!;
      } else {
        const m = decl.text.match(POU_NAME_RE);
        if (!m) continue;
        name = m[1] ?? m[2] ?? m[3] ?? "";
      }

      seen.add(textStart);
      out.push({
        type,
        name,
        declaration: decl.text.trimStart(),
        implementation: hasImpl ? readImplRecord(data, decl.end) : "",
        offset: textStart,
      });
    }
  }

  out.sort((a, b) => a.offset - b.offset);
  return out;
}

/**
 * Parse a CODESYS V2.3 .lib buffer and extract all POUs / GVLs / data types.
 *
 * @param data - Raw binary content of the .lib file
 * @returns Array of extracted artefacts sorted by offset
 */
export function parseV23Library(data: Uint8Array): {
  pous: ExtractedPOU[];
  warnings: string[];
} {
  if (!isV23Library(data)) {
    return {
      pous: [],
      warnings: [
        `Not a CODESYS V2.3 library (magic: ${bytesToHex(data.subarray(0, 8))})`,
      ],
    };
  }

  return { pous: findRecords(data), warnings: [] };
}
