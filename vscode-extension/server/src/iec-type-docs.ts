// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Hover documentation for the built-in IEC 61131-3 elementary data types.
 *
 * Sizes/representations describe how STruC++ actually lowers each type (see
 * `src/runtime/include/iec_types.hpp`), not a generic PLC assumption — in
 * particular every temporal type (TIME/LTIME/DATE/TOD/DT) is a signed 64-bit
 * integer here, not the 32-bit milliseconds some controllers use.
 */

/** Built-in IEC type name (upper-case) → markdown hover text. */
export const IEC_TYPE_DOCS: Readonly<Record<string, string>> = {
  // --- Boolean / bit strings ---
  BOOL: "**BOOL** (*Boolean*)\n\nSingle-bit boolean. Values: `TRUE` or `FALSE`.\n\n**Size:** 1 bit (1 byte in memory)",
  BYTE: "**BYTE** (*Bit String 8*)\n\nUnsigned 8-bit value. Range: `0` … `255` (`16#00` … `16#FF`).\n\n**Size:** 8 bits",
  WORD: "**WORD** (*Bit String 16*)\n\nUnsigned 16-bit value. Range: `0` … `65535`.\n\n**Size:** 16 bits",
  DWORD:
    "**DWORD** (*Bit String 32*)\n\nUnsigned 32-bit value. Range: `0` … `4294967295`.\n\n**Size:** 32 bits",
  LWORD:
    "**LWORD** (*Bit String 64*)\n\nUnsigned 64-bit value. Range: `0` … `2⁶⁴-1`.\n\n**Size:** 64 bits",

  // --- Signed integers ---
  SINT: "**SINT** (*Short Integer*)\n\nSigned 8-bit integer. Range: `-128` … `127`.\n\n**Size:** 8 bits",
  INT: "**INT** (*Integer*)\n\nSigned 16-bit integer. Range: `-32768` … `32767`.\n\n**Size:** 16 bits",
  DINT: "**DINT** (*Double Integer*)\n\nSigned 32-bit integer. Range: `-2147483648` … `2147483647`.\n\n**Size:** 32 bits",
  LINT: "**LINT** (*Long Integer*)\n\nSigned 64-bit integer. Range: `-2⁶³` … `2⁶³-1`.\n\n**Size:** 64 bits",

  // --- Unsigned integers ---
  USINT:
    "**USINT** (*Unsigned Short Integer*)\n\nUnsigned 8-bit integer. Range: `0` … `255`.\n\n**Size:** 8 bits",
  UINT: "**UINT** (*Unsigned Integer*)\n\nUnsigned 16-bit integer. Range: `0` … `65535`.\n\n**Size:** 16 bits",
  UDINT:
    "**UDINT** (*Unsigned Double Integer*)\n\nUnsigned 32-bit integer. Range: `0` … `4294967295`.\n\n**Size:** 32 bits",
  ULINT:
    "**ULINT** (*Unsigned Long Integer*)\n\nUnsigned 64-bit integer. Range: `0` … `2⁶⁴-1`.\n\n**Size:** 64 bits",

  // --- Floating point ---
  REAL: "**REAL** (*Real*)\n\nSingle-precision IEEE-754 float. Range: ±3.4×10³⁸ (~7 significant digits).\n\n**Size:** 32 bits",
  LREAL:
    "**LREAL** (*Long Real*)\n\nDouble-precision IEEE-754 float. Range: ±1.8×10³⁰⁸ (~15 significant digits).\n\n**Size:** 64 bits",

  // --- Time / date (STruC++ represents all of these as signed int64) ---
  TIME: "**TIME** (*Duration*)\n\nSigned 64-bit duration counted in **nanoseconds**. Literal: `T#1h30m` or `TIME#500ms`.\n\n**Size:** 64 bits (nanoseconds)",
  LTIME:
    "**LTIME** (*Long Duration*)\n\nHigh-resolution duration, signed 64-bit **nanoseconds**. Literal: `LTIME#1h30m0s500ms`.\n\n**Size:** 64 bits (nanoseconds)",
  DATE: "**DATE** (*Date*)\n\nCalendar date as signed 64-bit **days** since the Unix epoch (UTC). Literal: `D#2024-01-31` or `DATE#2024-01-31`.\n\n**Size:** 64 bits (days)",
  TIME_OF_DAY:
    "**TIME_OF_DAY** (*Time of Day*)\n\nTime within a day as signed 64-bit **nanoseconds** since midnight. Literal: `TOD#12:30:00` or `TIME_OF_DAY#08:00:00.500`.\n\n**Size:** 64 bits (nanoseconds)",
  TOD: "**TOD** (*Time of Day*)\n\nShort alias for `TIME_OF_DAY` — signed 64-bit nanoseconds since midnight. Literal: `TOD#12:30:00`.\n\n**Size:** 64 bits (nanoseconds)",
  DATE_AND_TIME:
    "**DATE_AND_TIME** (*Date and Time*)\n\nCombined timestamp as signed 64-bit **nanoseconds** since the Unix epoch (UTC). Literal: `DT#2024-01-31-12:30:00`.\n\n**Size:** 64 bits (nanoseconds)",
  DT: "**DT** (*Date and Time*)\n\nShort alias for `DATE_AND_TIME` — signed 64-bit nanoseconds since the Unix epoch (UTC). Literal: `DT#2024-01-31-12:30:00`.\n\n**Size:** 64 bits (nanoseconds)",

  // --- Character strings ---
  STRING:
    "**STRING** (*String*)\n\nSingle-byte character string. Default capacity 80; declare a length with `STRING[255]`.",
  WSTRING:
    "**WSTRING** (*Wide String*)\n\nWide (UTF-16 / `char16_t`) character string. Declare a length with `WSTRING[255]`.",
  CHAR: "**CHAR** (*Character*)\n\nSingle single-byte character.\n\n**Size:** 8 bits",
  WCHAR:
    "**WCHAR** (*Wide Character*)\n\nSingle wide (UTF-16 / `char16_t`) character.\n\n**Size:** 16 bits",
};

/**
 * Markdown hover text for a word if it names a built-in IEC data type.
 * Case-insensitive (IEC identifiers are). Returns `null` otherwise.
 */
export function getIecTypeDoc(word: string): string | null {
  return IEC_TYPE_DOCS[word.toUpperCase()] ?? null;
}
