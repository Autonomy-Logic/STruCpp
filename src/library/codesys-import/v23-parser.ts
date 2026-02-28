// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * CODESYS V2.3 .lib file parser.
 *
 * Extracts POU source code from the binary format used by CODESYS 2.3.
 *
 * Binary layout per POU:
 *   [binary header] [4-byte LE decl-length] [declaration text]
 *   [0x12 separator] [4-byte LE impl-length] [implementation text]
 *
 * Magic: "CoDeSys+" (8 bytes)
 */

import type { ExtractedPOU } from "./types.js";

const CODESYS_V23_MAGIC = Buffer.from("CoDeSys+", "ascii");

/** Keyword patterns to scan for in the binary data. */
const POU_PATTERNS: Array<{ bytes: Buffer; type: ExtractedPOU["type"] }> = [
  { bytes: Buffer.from("FUNCTION_BLOCK ", "ascii"), type: "FUNCTION_BLOCK" },
  { bytes: Buffer.from("FUNCTION ", "ascii"), type: "FUNCTION" },
  { bytes: Buffer.from("PROGRAM ", "ascii"), type: "PROGRAM" },
];

/** Regex for extracting POU names from declaration text. */
const POU_NAME_RE =
  /^\s*(?:FUNCTION_BLOCK\s+(\w+)|FUNCTION\s+(\w+)|PROGRAM\s+(\w+))/;

/** Regex for TYPE declarations (includes END_TYPE). */
const TYPE_RE = /TYPE\s+(\w+)\s*:.*?END_TYPE/gs;

/** Regex for Global Variable Lists. */
const GVL_RE = /VAR_GLOBAL(?:\s+\w+)?\s*\r?\n.*?END_VAR/gs;

/**
 * Validate that a buffer starts with the CODESYS V2.3 magic bytes.
 */
export function isV23Library(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(CODESYS_V23_MAGIC);
}

/**
 * Find all FUNCTION / FUNCTION_BLOCK / PROGRAM declarations in the binary.
 */
function findPOUDeclarations(data: Buffer): ExtractedPOU[] {
  const pous: ExtractedPOU[] = [];
  const seen = new Set<number>(); // track offsets to avoid duplicates

  for (const { bytes: pattern, type } of POU_PATTERNS) {
    let offset = 0;
    for (;;) {
      const idx = data.indexOf(pattern, offset);
      if (idx === -1) break;
      offset = idx + 1;

      // The declaration text may start with leading whitespace before the keyword.
      // Check up to 2 bytes back for tab/space.
      let textStart = idx;
      for (let lookback = 1; lookback <= 2; lookback++) {
        if (
          idx >= lookback &&
          (data[idx - lookback] === 0x09 || data[idx - lookback] === 0x20)
        ) {
          textStart = idx - lookback;
        } else {
          break;
        }
      }

      // Verify by reading the 4-byte LE length field before the text start
      if (textStart < 4) continue;
      const declLen = data.readUInt32LE(textStart - 4);

      // Sanity check: reasonable length range
      if (declLen < 10 || declLen > 100000) continue;
      if (textStart + declLen > data.length) continue;

      // Avoid duplicate detections at the same offset
      if (seen.has(textStart)) continue;
      seen.add(textStart);

      // Decode declaration text
      const declText = data.subarray(textStart, textStart + declLen);
      let declStr: string;
      try {
        declStr = declText.toString("latin1");
      } catch {
        continue;
      }

      // Validate POU name
      const nameMatch = declStr.match(POU_NAME_RE);
      if (!nameMatch) continue;
      const name = nameMatch[1] ?? nameMatch[2] ?? nameMatch[3] ?? "";

      // Strip leading whitespace from declaration
      declStr = declStr.trimStart();

      // Read implementation section (after 0x12 separator)
      let implStr = "";
      const implOffset = textStart + declLen;
      if (implOffset < data.length) {
        const sep = data[implOffset];
        if (sep === 0x12 && implOffset + 5 <= data.length) {
          const implLen = data.readUInt32LE(implOffset + 1);
          if (implLen < 500000 && implOffset + 5 + implLen <= data.length) {
            implStr = data
              .subarray(implOffset + 5, implOffset + 5 + implLen)
              .toString("latin1");
          }
        }
      }

      pous.push({
        type,
        name,
        declaration: declStr,
        implementation: implStr,
        offset: textStart,
      });
    }
  }

  // Sort by offset to maintain original order
  pous.sort((a, b) => a.offset - b.offset);
  return pous;
}

/**
 * Find TYPE declarations (structs, enums) in the binary data.
 */
function findTypeDeclarations(data: Buffer): ExtractedPOU[] {
  const text = data.toString("latin1");
  const types: ExtractedPOU[] = [];

  TYPE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TYPE_RE.exec(text)) !== null) {
    types.push({
      type: "TYPE",
      name: m[1]!,
      declaration: m[0],
      implementation: "",
      offset: m.index,
    });
  }

  return types;
}

/**
 * Find Global Variable Lists in the binary data.
 */
function findGVLDeclarations(data: Buffer): ExtractedPOU[] {
  const text = data.toString("latin1");
  const gvls: ExtractedPOU[] = [];

  GVL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let gvlIdx = 0;
  while ((m = GVL_RE.exec(text)) !== null) {
    const start = m.index;
    // Try to find the GVL name from binary context before the match
    const contextStart = Math.max(0, start - 200);
    const context = text.substring(contextStart, start).trim();
    const nameMatch = context.match(/([A-Za-z_]\w*)\s*$/);
    const name = nameMatch ? nameMatch[1]! : `GVL_${gvlIdx}`;

    gvls.push({
      type: "GVL",
      name,
      declaration: m[0],
      implementation: "",
      offset: start,
    });
    gvlIdx++;
  }

  return gvls;
}

/**
 * Parse a CODESYS V2.3 .lib buffer and extract all POUs.
 *
 * @param data - Raw binary content of the .lib file
 * @returns Array of extracted POUs sorted by offset
 */
export function parseV23Library(data: Buffer): {
  pous: ExtractedPOU[];
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!isV23Library(data)) {
    return {
      pous: [],
      warnings: [
        `Not a CODESYS V2.3 library (magic: ${data.subarray(0, 8).toString("hex")})`,
      ],
    };
  }

  const pous = findPOUDeclarations(data);
  const types = findTypeDeclarations(data);
  const gvls = findGVLDeclarations(data);

  // Merge all items and sort by offset
  const all = [...pous, ...types, ...gvls];
  all.sort((a, b) => a.offset - b.offset);

  return { pous: all, warnings };
}
