// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Hover Provider — IEC 61131-3 data type documentation
 *
 * Returns markdown hover content when the cursor is on a built-in IEC type name.
 */

export const DATA_TYPE_HOVER: Readonly<Record<string, string>> = {
  BOOL: "**BOOL** (*Boolean*)\n\nSingle-bit boolean. Values: `TRUE` or `FALSE`.\n\n**Size:** 1 bit (typically 1 byte in memory)",
  BYTE: "**BYTE** (*Byte*)\n\nUnsigned 8-bit integer. Range: `0` to `255`.\n\n**Size:** 8 bits",
  WORD: "**WORD** (*Word*)\n\nUnsigned 16-bit integer. Range: `0` to `65535`.\n\n**Size:** 16 bits",
  DWORD:
    "**DWORD** (*Double Word*)\n\nUnsigned 32-bit integer. Range: `0` to `4294967295`.\n\n**Size:** 32 bits",
  LWORD:
    "**LWORD** (*Long Word*)\n\nUnsigned 64-bit integer. Range: `0` to `2⁶⁴-1`.\n\n**Size:** 64 bits",
  SINT: "**SINT** (*Short Integer*)\n\nSigned 8-bit integer. Range: `-128` to `127`.\n\n**Size:** 8 bits",
  INT: "**INT** (*Integer*)\n\nSigned 16-bit integer. Range: `-32768` to `32767`.\n\n**Size:** 16 bits",
  DINT: "**DINT** (*Double Integer*)\n\nSigned 32-bit integer. Range: `-2147483648` to `2147483647`.\n\n**Size:** 32 bits",
  LINT: "**LINT** (*Long Integer*)\n\nSigned 64-bit integer. Range: `-2⁶³` to `2⁶³-1`.\n\n**Size:** 64 bits",
  USINT:
    "**USINT** (*Unsigned Short Integer*)\n\nUnsigned 8-bit integer. Range: `0` to `255`.\n\n**Size:** 8 bits",
  UINT: "**UINT** (*Unsigned Integer*)\n\nUnsigned 16-bit integer. Range: `0` to `65535`.\n\n**Size:** 16 bits",
  UDINT:
    "**UDINT** (*Unsigned Double Integer*)\n\nUnsigned 32-bit integer. Range: `0` to `4294967295`.\n\n**Size:** 32 bits",
  ULINT:
    "**ULINT** (*Unsigned Long Integer*)\n\nUnsigned 64-bit integer. Range: `0` to `2⁶⁴-1`.\n\n**Size:** 64 bits",
  REAL: "**REAL** (*Real*)\n\nSingle-precision IEEE 754 floating-point. Range: ±3.4×10³⁸ (~7 significant digits).\n\n**Size:** 32 bits",
  LREAL:
    "**LREAL** (*Long Real*)\n\nDouble-precision IEEE 754 floating-point. Range: ±1.8×10³⁰⁸ (~15 significant digits).\n\n**Size:** 64 bits",
  TIME: "**TIME** (*Time*)\n\nDuration value. Literal syntax: `T#1h30m0s` or `TIME#500ms`.\n\n**Size:** 32 bits (milliseconds)",
  LTIME:
    "**LTIME** (*Long Time*)\n\nHigh-resolution duration value. Literal syntax: `LTIME#1h30m0s500ms`.\n\n**Size:** 64 bits (nanoseconds)",
  DATE: "**DATE** (*Date*)\n\nCalendar date. Literal syntax: `D#2024-01-31` or `DATE#2024-01-31`.\n\n**Size:** 32 bits",
  TIME_OF_DAY:
    "**TIME_OF_DAY** (*Time of Day*)\n\nTime within a day. Literal syntax: `TOD#12:30:00` or `TIME_OF_DAY#08:00:00.500`.\n\n**Size:** 32 bits",
  TOD: "**TOD** (*Time of Day*)\n\nShort alias for `TIME_OF_DAY`. Literal syntax: `TOD#12:30:00`.\n\n**Size:** 32 bits",
  DATE_AND_TIME:
    "**DATE_AND_TIME** (*Date and Time*)\n\nCombined date and time. Literal syntax: `DT#2024-01-31-12:30:00`.\n\n**Size:** 32 bits",
  DT: "**DT** (*Date and Time*)\n\nShort alias for `DATE_AND_TIME`. Literal syntax: `DT#2024-01-31-12:30:00`.\n\n**Size:** 32 bits",
  STRING:
    "**STRING** (*String*)\n\nFixed-length single-byte character string. Default max length: 80 characters.\n\nOptional length: `STRING[255]`.",
  WSTRING:
    "**WSTRING** (*Wide String*)\n\nFixed-length wide (Unicode) character string.\n\nOptional length: `WSTRING[255]`.",
  CHAR: "**CHAR** (*Character*)\n\nSingle single-byte character.\n\n**Size:** 8 bits",
  WCHAR:
    "**WCHAR** (*Wide Character*)\n\nSingle Unicode character.\n\n**Size:** 16 bits",
};

/**
 * Return markdown hover text for a word if it is a built-in IEC data type.
 * Lookup is case-insensitive. Returns null if the word is not a known type.
 */
export function getHoverForWord(word: string): string | null {
  return DATA_TYPE_HOVER[word.toUpperCase()] ?? null;
}

/**
 * Extract the identifier word at a zero-indexed character offset within a line.
 * Returns null if the cursor is not on an identifier character.
 */
export function getWordAtOffset(line: string, offset: number): string | null {
  const identifierRe = /[A-Za-z_][A-Za-z0-9_]*/g;
  let match: RegExpExecArray | null;
  while ((match = identifierRe.exec(line)) !== null) {
    if (match.index <= offset && offset < match.index + match[0].length) {
      return match[0];
    }
  }
  return null;
}
