// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Portable byte-handling primitives.
 *
 * The CODESYS importer and a few binary helpers used to lean on
 * Node's `Buffer` class — `Buffer.from(...)`, `.equals(...)`,
 * `.toString("utf-8")`, `.readUInt32LE(...)`, `zlib.inflateRawSync`,
 * and friends.  None of those are available in a browser worker.
 *
 * `Uint8Array` is the portable substitute that works on both
 * platforms.  This module provides the small handful of operations
 * that map directly from the Buffer surface our parsers need.  Each
 * helper is a one-liner; the point is to keep the call sites
 * readable and free of `new TextDecoder().decode(...)` ceremony.
 */

const utf8Decoder = new TextDecoder("utf-8");
// Latin-1 ("windows-1252" with the same mapping for the first 256
// codepoints) is what the CODESYS V2.3 binary format stores POU
// declarations in.  The decoder is constructed once at module load.
const latin1Decoder = new TextDecoder("latin1");
const utf8Encoder = new TextEncoder();

/** Compare two byte sequences for value-equality. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Lower-case hex dump of a byte sequence (no separator, no prefix). */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/** Decode a byte slice as UTF-8 text. */
export function bytesToUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

/**
 * Decode a byte slice as Latin-1 text (1:1 mapping bytes → U+0000…U+00FF).
 * Used by the CODESYS V2.3 binary parser, where POU declarations
 * are stored in an 8-bit single-byte encoding rather than UTF-8.
 */
export function bytesToLatin1(bytes: Uint8Array): string {
  return latin1Decoder.decode(bytes);
}

/**
 * Find the first occurrence of `needle` in `haystack` at or after
 * `offset`.  Returns the matching index, or -1 if not found.  The
 * built-in `Uint8Array#indexOf` only works on single bytes; this
 * helper handles multi-byte patterns the way Node's `Buffer#indexOf`
 * does.
 */
export function findSubArray(
  haystack: Uint8Array,
  needle: Uint8Array,
  offset = 0,
): number {
  if (needle.length === 0) return offset;
  const limit = haystack.length - needle.length;
  outer: for (let i = offset; i <= limit; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Encode a string as UTF-8 bytes. */
export function utf8ToBytes(text: string): Uint8Array {
  return utf8Encoder.encode(text);
}

/** Read a little-endian unsigned 32-bit integer at `offset`. */
export function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(
    0,
    true,
  );
}

/** Read a little-endian unsigned 16-bit integer at `offset`. */
export function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(
    0,
    true,
  );
}

/**
 * Inflate a raw DEFLATE (zlib) stream.
 *
 * Uses the standard `DecompressionStream` API available in modern
 * browsers (Chrome 80+, Firefox 113+, Safari 16.4+) and Node 18+.
 * Both platforms run the same code path — no fork between worker
 * and Node CLI.
 */
export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const decompressionStream = new DecompressionStream("deflate-raw");
  const decompressedStream = new Blob([bytes])
    .stream()
    .pipeThrough(decompressionStream);
  const buffer = await new Response(decompressedStream).arrayBuffer();
  return new Uint8Array(buffer);
}
