// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Canonical IEC Base Type Metadata
 *
 * Single source of truth for every IEC 61131-3 elementary type strucpp
 * recognizes. Every other consumer — strucpp's own type-checker /
 * codegen, the OpenPLC Editor's variables table / debugger / XML
 * emitter, future tooling — derives its type knowledge from this list
 * (or, for external repos, from the `libs/iec-types.json` artifact this
 * file is built into).
 *
 * Adding a new elementary type goes here first, then a downstream
 * artifact rebuild (`npm run build`) refreshes `libs/iec-types.json`.
 *
 * Aliases (TIME_OF_DAY/TOD, DATE_AND_TIME/DT) are listed under their
 * canonical entry rather than getting their own row. The parser
 * accepts either spelling; everything downstream sees only canonical
 * names.
 */

/**
 * Wire format identifier — keys a small dispatcher in editor runtime
 * tooling that maps a strucpp type to byte-decoding (debugger watch
 * panel) and byte-encoding (force value) logic. Adding a new format
 * here means handling it on both ends; that's intentional friction.
 */
export type IECWireFormat =
  | "bool"
  | "int8"
  | "uint8"
  | "int16"
  | "uint16"
  | "int32"
  | "uint32"
  | "int64"
  | "uint64"
  | "float32"
  | "float64"
  /** TIME — int64 nanoseconds duration, formatted as `T#…` */
  | "duration-ns-i64"
  /** DT — int64 nanoseconds since Unix epoch, formatted as `DT#…` */
  | "datetime-ns-i64"
  /** DATE — int64 nanoseconds since Unix epoch (date portion only),
   *  formatted as `D#YYYY-MM-DD` */
  | "date-ns-i64"
  /** TOD — int64 nanoseconds since midnight, formatted as `TOD#…` */
  | "tod-ns-i64"
  /** STRING — 1 length byte + 126 UTF-8 bytes (strucpp default cap). */
  | "len8-utf8"
  /** WSTRING — 1 length byte + 126 UTF-16 LE code units. */
  | "len8-utf16le";

/**
 * Single elementary type entry. Keep field order stable — it's what
 * gets serialised into `libs/iec-types.json` for downstream consumers.
 */
export interface IECTypeMetadata {
  /** Canonical IEC 61131-3 name (uppercase). */
  name: string;
  /** Alternate names the parser accepts as the same type. Empty if
   *  the canonical name is the only spelling. */
  aliases: readonly string[];
  /** Byte width on the wire / in memory. `0` for variable-width
   *  string types (where the actual width is determined by the
   *  STRING_LENGTH global constant or per-declaration override). */
  byteSize: number;
  /** Logical IEC bit width — equals `byteSize * 8` for every type
   *  except BOOL, which is `1` bit logically but stored as a single
   *  byte on the wire (`byteSize: 1`). `0` for variable-width strings.
   *
   *  Type-checker widening / compatibility rules read this rather
   *  than `byteSize` so a SINT-into-BOOL coercion (8 logical bits to
   *  1) gets caught the same way the IEC spec calls it out. */
  bits: number;
  /** True ⇒ signed integer / IEC duration. False ⇒ unsigned. `null`
   *  for non-numeric types (BOOL, STRING, WSTRING). */
  signed: boolean | null;
  /** C++ type alias from `runtime/include/iec_types.hpp`. Generated
   *  code emits `strucpp::<cppType>` for variables of this type. */
  cppType: string;
  /** Wire format identifier — see {@link IECWireFormat}. */
  wireFormat: IECWireFormat;
  /** PLCopen TC6 v0201 XML mapping. */
  xml: {
    /** Element name in PLCopen TC6 wire shape. Lowercase for
     *  parameterized types (`string`, `wstring`), uppercase
     *  otherwise. Editors should emit `<elementName/>` for
     *  PLCopen-standard types and `<derived name="X"/>` for
     *  everything else. */
    elementName: string;
    /** True iff this type is in the PLCopen TC6 XSD elementaryTypes
     *  group (a closed `<choice>`, no extension allowed). False ⇒
     *  emit `<derived/>` instead. */
    plcopenStandard: boolean;
  };
  /** Hint for editors / pretty-printers showing literals of this
   *  type. Optional — only set where it's specific enough to be
   *  useful (e.g. `"TRUE/FALSE"` for BOOL, `"T#1d2h3m"` for TIME). */
  literalDisplay?: string;
}

/**
 * The full set of strucpp-recognised IEC 61131-3 elementary types.
 *
 * Order is intentional: groups bit-strings, signed ints, unsigned
 * ints, reals, time/date, strings — same flow as the IEC standard
 * tables and the iec_types.hpp typedef order. Editors that surface
 * this as a dropdown should preserve the order for user familiarity.
 */
export const IEC_BASE_TYPES: readonly IECTypeMetadata[] = [
  // ── Bit strings ──────────────────────────────────────────────────
  {
    name: "BOOL",
    aliases: [],
    byteSize: 1,
    bits: 1,
    signed: null,
    cppType: "BOOL_t",
    wireFormat: "bool",
    xml: { elementName: "BOOL", plcopenStandard: true },
    literalDisplay: "TRUE/FALSE",
  },
  {
    name: "BYTE",
    aliases: [],
    byteSize: 1,
    bits: 8,
    signed: false,
    cppType: "BYTE_t",
    wireFormat: "uint8",
    xml: { elementName: "BYTE", plcopenStandard: true },
  },
  {
    name: "WORD",
    aliases: [],
    byteSize: 2,
    bits: 16,
    signed: false,
    cppType: "WORD_t",
    wireFormat: "uint16",
    xml: { elementName: "WORD", plcopenStandard: true },
  },
  {
    name: "DWORD",
    aliases: [],
    byteSize: 4,
    bits: 32,
    signed: false,
    cppType: "DWORD_t",
    wireFormat: "uint32",
    xml: { elementName: "DWORD", plcopenStandard: true },
  },
  {
    name: "LWORD",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: false,
    cppType: "LWORD_t",
    wireFormat: "uint64",
    xml: { elementName: "LWORD", plcopenStandard: true },
  },
  {
    // CODESYS __XWORD: an unsigned integer whose width equals the target
    // pointer width (resolved in C++ via `#if __SIZEOF_POINTER__`). Used as
    // a generic address/pointer-sized value (ADR/REF_LINK return it; users
    // may declare it for generic pointer functions/blocks). The byteSize/bits
    // here are NOMINAL (max width); the type-checker exempts __XWORD from
    // width-narrowing checks since its real width is target-dependent.
    name: "__XWORD",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: false,
    cppType: "XWORD_t",
    wireFormat: "uint64",
    xml: { elementName: "__XWORD", plcopenStandard: false },
  },

  // ── Signed integers ──────────────────────────────────────────────
  {
    name: "SINT",
    aliases: [],
    byteSize: 1,
    bits: 8,
    signed: true,
    cppType: "SINT_t",
    wireFormat: "int8",
    xml: { elementName: "SINT", plcopenStandard: true },
  },
  {
    name: "INT",
    aliases: [],
    byteSize: 2,
    bits: 16,
    signed: true,
    cppType: "INT_t",
    wireFormat: "int16",
    xml: { elementName: "INT", plcopenStandard: true },
  },
  {
    name: "DINT",
    aliases: [],
    byteSize: 4,
    bits: 32,
    signed: true,
    cppType: "DINT_t",
    wireFormat: "int32",
    xml: { elementName: "DINT", plcopenStandard: true },
  },
  {
    name: "LINT",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: true,
    cppType: "LINT_t",
    wireFormat: "int64",
    xml: { elementName: "LINT", plcopenStandard: true },
  },

  // ── Unsigned integers ────────────────────────────────────────────
  {
    name: "USINT",
    aliases: [],
    byteSize: 1,
    bits: 8,
    signed: false,
    cppType: "USINT_t",
    wireFormat: "uint8",
    xml: { elementName: "USINT", plcopenStandard: true },
  },
  {
    name: "UINT",
    aliases: [],
    byteSize: 2,
    bits: 16,
    signed: false,
    cppType: "UINT_t",
    wireFormat: "uint16",
    xml: { elementName: "UINT", plcopenStandard: true },
  },
  {
    name: "UDINT",
    aliases: [],
    byteSize: 4,
    bits: 32,
    signed: false,
    cppType: "UDINT_t",
    wireFormat: "uint32",
    xml: { elementName: "UDINT", plcopenStandard: true },
  },
  {
    name: "ULINT",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: false,
    cppType: "ULINT_t",
    wireFormat: "uint64",
    xml: { elementName: "ULINT", plcopenStandard: true },
  },

  // ── Real numbers ─────────────────────────────────────────────────
  {
    name: "REAL",
    aliases: [],
    byteSize: 4,
    bits: 32,
    signed: true,
    cppType: "REAL_t",
    wireFormat: "float32",
    xml: { elementName: "REAL", plcopenStandard: true },
  },
  {
    name: "LREAL",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: true,
    cppType: "LREAL_t",
    wireFormat: "float64",
    xml: { elementName: "LREAL", plcopenStandard: true },
  },

  // ── Time and date ────────────────────────────────────────────────
  {
    name: "TIME",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: true,
    cppType: "TIME_t",
    wireFormat: "duration-ns-i64",
    xml: { elementName: "TIME", plcopenStandard: true },
    literalDisplay: "T#1d2h3m",
  },
  {
    name: "DATE",
    aliases: [],
    byteSize: 8,
    bits: 64,
    signed: true,
    cppType: "DATE_t",
    wireFormat: "date-ns-i64",
    xml: { elementName: "DATE", plcopenStandard: true },
    literalDisplay: "D#YYYY-MM-DD",
  },
  {
    name: "TOD",
    aliases: ["TIME_OF_DAY"],
    byteSize: 8,
    bits: 64,
    signed: true,
    cppType: "TOD_t",
    wireFormat: "tod-ns-i64",
    xml: { elementName: "TOD", plcopenStandard: true },
    literalDisplay: "TOD#HH:MM:SS",
  },
  {
    name: "DT",
    aliases: ["DATE_AND_TIME"],
    byteSize: 8,
    bits: 64,
    signed: true,
    cppType: "DT_t",
    wireFormat: "datetime-ns-i64",
    xml: { elementName: "DT", plcopenStandard: true },
    literalDisplay: "DT#YYYY-MM-DD-HH:MM:SS",
  },

  // ── Character strings ────────────────────────────────────────────
  // byteSize 0 ⇒ variable-width on the wire (the per-declaration cap
  // or the library's STRING_LENGTH constant decides the actual width).
  {
    name: "STRING",
    aliases: [],
    byteSize: 0,
    bits: 0,
    signed: null,
    cppType: "IECString",
    wireFormat: "len8-utf8",
    // PLCopen TC6 ships `string` lowercase and parameterized — see
    // the `<string length="N"/>` schema entry. The element name is
    // normalised here; downstream emitters can append `length=` when
    // a per-declaration cap exists.
    xml: { elementName: "string", plcopenStandard: true },
    literalDisplay: "'text'",
  },
  {
    name: "WSTRING",
    aliases: [],
    byteSize: 0,
    bits: 0,
    signed: null,
    cppType: "IECWString",
    wireFormat: "len8-utf16le",
    xml: { elementName: "wstring", plcopenStandard: true },
    literalDisplay: '"text"',
  },
];

/**
 * Lookup index keyed by the canonical name AND each alias, so callers
 * can resolve either spelling to the same metadata entry without
 * paying an O(n) scan per call. Built once at module load.
 */
const IEC_BASE_TYPE_INDEX: ReadonlyMap<string, IECTypeMetadata> = (() => {
  const m = new Map<string, IECTypeMetadata>();
  for (const t of IEC_BASE_TYPES) {
    m.set(t.name, t);
    for (const alias of t.aliases) m.set(alias, t);
  }
  return m;
})();

/**
 * Resolve a type name (canonical or alias, any case) to its metadata
 * entry. Returns `undefined` for non-elementary names so callers can
 * disambiguate between "elementary type unknown to strucpp" and
 * "user-defined type that's expected to look unknown".
 */
export function lookupBaseType(name: string): IECTypeMetadata | undefined {
  return IEC_BASE_TYPE_INDEX.get(name.toUpperCase());
}

/**
 * Whether a name (canonical or alias) refers to an IEC elementary type.
 */
export function isBaseTypeName(name: string): boolean {
  return IEC_BASE_TYPE_INDEX.has(name.toUpperCase());
}
