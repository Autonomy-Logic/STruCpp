// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - Debugger Dispatch
 *
 * Per-entry force/unforce/read operations for the OpenPLC debugger protocol.
 *
 * Each leaf variable in a compiled project (including array elements, struct
 * fields, and FB internals) is registered in a compile-time Entry table with
 * {void* ptr, uint8_t tag}. The pointer is to the leaf's own IECVar<T>; the
 * tag indexes this file's type_ops table, which holds templated function
 * pointers that know how to force/unforce/read that concrete T.
 *
 * The table itself is emitted per-project by STruC++ into generated_debug.cpp.
 * This header provides the shared, project-agnostic dispatch logic.
 */

#pragma once

// `debug_table.hpp` is the AVR-clean header generated_debug.cpp also
// includes — it carries the Entry / TypeTag / STRUCPP_DEBUG_FLASH bits
// shared between the table emitter and the dispatch helpers.  Importing
// it here (rather than redefining) keeps the ABI definitions in exactly
// one place.  See debug_table.hpp's preamble for why
// `<avr/pgmspace.h>` no longer lives in the same TU as user variable
// references.
#include "debug_table.hpp"

#include "iec_types.hpp"
#include "iec_traits.hpp"
#include "iec_var.hpp"
#include "iec_string.hpp"
#include "iec_wstring.hpp"
#include <algorithm>
#include <cstdint>
#include <cstddef>
#include <cstring>

#ifdef __AVR__
// `read_entry` and friends use `pgm_read_word_far` / `pgm_read_byte` /
// `pgm_get_far_address`, which live here.  Only the runtime translation
// unit (arduino_runtime_glue.cpp / runtime_v4_entry.cpp) ever needs
// this dispatch header; `generated_debug.cpp` consumes only
// `debug_table.hpp` so it never sees the AVR register-macro contamination
// `<avr/io.h>` brings in transitively.
#include <avr/pgmspace.h>
#endif

namespace strucpp { namespace debug {

// ---------------------------------------------------------------------------
// Status codes used by the protocol helpers below.
// Match the values the MatIEC-era ModbusSlave expected (0x7E / 0x81 / 0x82)
// so wire-format parsers on the editor don't need to change.
// ---------------------------------------------------------------------------
constexpr uint8_t STATUS_OK              = 0x7E;
constexpr uint8_t STATUS_OUT_OF_BOUNDS   = 0x81;
constexpr uint8_t STATUS_DATA_TOO_LARGE  = 0x82;

// ---------------------------------------------------------------------------
// Templated per-type helpers. One instantiation per IEC elementary type;
// type_ops[] below wires them into a runtime-indexable table.
// ---------------------------------------------------------------------------
template <typename T>
inline void force_impl(void* p, const uint8_t* bytes) noexcept {
    T v;
    std::memcpy(&v, bytes, sizeof(T));
    static_cast<IECVar<T>*>(p)->force(v);
}

// Specialization: memcpy-into-bool is technically UB for non-{0,1} byte
// values, and some AVR GCC versions have optimizer behavior around bool
// that can surprise. Normalize explicitly.
template <>
inline void force_impl<bool>(void* p, const uint8_t* bytes) noexcept {
    const bool v = bytes[0] != 0;
    static_cast<IECVar<bool>*>(p)->force(v);
}

template <typename T>
inline void unforce_impl(void* p) noexcept {
    static_cast<IECVar<T>*>(p)->unforce();
}

// Soft write — updates the underlying value_ via IECVar::set(). Respects
// existing forces (set() is a no-op while forced_ is true), so a force in
// place stays authoritative until the user explicitly unforces.
//
// Distinct from force_impl: that one pins the variable indefinitely; this
// one writes a value the program can overwrite on the next scan cycle.
// Used by external clients (OPC-UA, future BACnet, etc.) that want
// regular write semantics rather than debugger-style forcing.
template <typename T>
inline void write_impl(void* p, const uint8_t* bytes) noexcept {
    T v;
    std::memcpy(&v, bytes, sizeof(T));
    static_cast<IECVar<T>*>(p)->set(v);
}

// memcpy-into-bool is technically UB for non-{0,1} byte values; normalize
// explicitly. Same reasoning as force_impl<bool>.
template <>
inline void write_impl<bool>(void* p, const uint8_t* bytes) noexcept {
    const bool v = bytes[0] != 0;
    static_cast<IECVar<bool>*>(p)->set(v);
}

template <typename T>
inline void read_impl(const void* p, uint8_t* dest) noexcept {
    T v = static_cast<const IECVar<T>*>(p)->get();
    std::memcpy(dest, &v, sizeof(T));
}

// STRING / WSTRING live in `IECStringVar<254>` / `IECWStringVar<254>`,
// the force-aware wrappers around `IECString<254>` / `IECWString<254>`.
// Both wrappers carry their own length, capped at 254 bytes / 254 wide
// code units of storage.
//
// Wire format (matches the editor decoder in
// `src/frontend/utils/variable-sizes.ts` — `len8-utf8` / `len8-utf16le`):
//
//   STRING:  [ uint8 length ][ DEBUG_STRING_CAP bytes UTF-8 payload ]
//            ^ 1 byte         ^ 126 bytes (always — content past the
//                               declared length is unused but the
//                               wire width is fixed)
//
//   WSTRING: [ uint8 length ][ DEBUG_STRING_CAP * 2 bytes UTF-16LE ]
//            ^ 1 byte         ^ 252 bytes (126 little-endian code units)
//
// The length prefix is a uint8 because that's what the wire reserves
// (`DEBUG_STRING_CAP = 126` in the editor); a string longer than 126
// is truncated at the boundary on the way out.  The editor reads
// exactly the prefix and uses it to decode `min(length, CAP)` content
// units; the remaining bytes in the fixed window are ignored.
//
// We zero-fill the unused tail of the window on every read so stale
// bus contents from a previous read can't leak into the editor — which
// would otherwise show garbage after the legitimate content if a
// reader misuses the cap.
//
// All four ops are force-aware (read sees the forced value when active;
// write/set is a no-op on a forced variable per `IECStringVar::set`'s
// own guard; force/unforce manipulate the force state directly).
constexpr uint8_t DEBUG_STRING_CAP   = 126;            // chars / code units
constexpr uint8_t DEBUG_STRING_WIDTH = 1 + DEBUG_STRING_CAP;          // 127 bytes on the wire
constexpr uint8_t DEBUG_WSTRING_WIDTH = 1 + DEBUG_STRING_CAP * 2;     // 253 bytes on the wire

// --- STRING (IECStringVar<254>) ---------------------------------------

inline void read_string(const void* p, uint8_t* dest) noexcept {
    const auto* var = static_cast<const IECStringVar<254>*>(p);
    const std::size_t actual_len = var->length();
    const uint8_t wire_len = static_cast<uint8_t>(
        actual_len < DEBUG_STRING_CAP ? actual_len : DEBUG_STRING_CAP);
    dest[0] = wire_len;
    if (wire_len > 0) {
        std::memcpy(dest + 1, var->c_str(), wire_len);
    }
    if (wire_len < DEBUG_STRING_CAP) {
        std::memset(dest + 1 + wire_len, 0, DEBUG_STRING_CAP - wire_len);
    }
}

inline void write_string(void* p, const uint8_t* bytes) noexcept {
    auto* var = static_cast<IECStringVar<254>*>(p);
    const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
    var->set(IECString<254>(reinterpret_cast<const char*>(bytes + 1), wire_len));
}

inline void force_string(void* p, const uint8_t* bytes) noexcept {
    auto* var = static_cast<IECStringVar<254>*>(p);
    const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
    var->force(IECString<254>(reinterpret_cast<const char*>(bytes + 1), wire_len));
}

inline void unforce_string(void* p) noexcept {
    static_cast<IECStringVar<254>*>(p)->unforce();
}

// --- WSTRING (IECWStringVar<254>) -------------------------------------

inline void read_wstring(const void* p, uint8_t* dest) noexcept {
    const auto* var = static_cast<const IECWStringVar<254>*>(p);
    const std::size_t actual_len = var->length();
    const uint8_t wire_len = static_cast<uint8_t>(
        actual_len < DEBUG_STRING_CAP ? actual_len : DEBUG_STRING_CAP);
    dest[0] = wire_len;
    const char16_t* src = var->c_str();
    for (uint8_t i = 0; i < wire_len; ++i) {
        // Little-endian 16-bit code unit — explicit byte split so the
        // wire format is host-endianness-independent (AVR is LE in
        // practice but ARM-BE targets, however rare, would otherwise
        // serialise the wrong way around).
        dest[1 + i * 2]     = static_cast<uint8_t>(src[i] & 0xFF);
        dest[1 + i * 2 + 1] = static_cast<uint8_t>((src[i] >> 8) & 0xFF);
    }
    const std::size_t used = 1 + static_cast<std::size_t>(wire_len) * 2;
    if (used < DEBUG_WSTRING_WIDTH) {
        std::memset(dest + used, 0, DEBUG_WSTRING_WIDTH - used);
    }
}

inline void write_wstring(void* p, const uint8_t* bytes) noexcept {
    auto* var = static_cast<IECWStringVar<254>*>(p);
    const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
    char16_t buf[DEBUG_STRING_CAP];
    for (uint8_t i = 0; i < wire_len; ++i) {
        buf[i] = static_cast<char16_t>(bytes[1 + i * 2])
               | static_cast<char16_t>(static_cast<char16_t>(bytes[1 + i * 2 + 1]) << 8);
    }
    var->set(IECWString<254>(buf, wire_len));
}

inline void force_wstring(void* p, const uint8_t* bytes) noexcept {
    auto* var = static_cast<IECWStringVar<254>*>(p);
    const uint8_t wire_len = bytes[0] < DEBUG_STRING_CAP ? bytes[0] : DEBUG_STRING_CAP;
    char16_t buf[DEBUG_STRING_CAP];
    for (uint8_t i = 0; i < wire_len; ++i) {
        buf[i] = static_cast<char16_t>(bytes[1 + i * 2])
               | static_cast<char16_t>(static_cast<char16_t>(bytes[1 + i * 2 + 1]) << 8);
    }
    var->force(IECWString<254>(buf, wire_len));
}

inline void unforce_wstring(void* p) noexcept {
    static_cast<IECWStringVar<254>*>(p)->unforce();
}

// ---------------------------------------------------------------------------
// Dispatch table entry. The `size` field is the byte width consumed/produced
// by force/read (for strings: reserved, handled specially).
// ---------------------------------------------------------------------------
struct TypeOps {
    void (*force)  (void*, const uint8_t*);
    void (*unforce)(void*);
    void (*read)   (const void*, uint8_t*);
    void (*write)  (void*, const uint8_t*);
    uint8_t size;
};

// ---------------------------------------------------------------------------
// type_ops[]: one row per TypeTag, in tag order.
// Kept inline so it's flash-resident with no separate .cpp required.
// ---------------------------------------------------------------------------
inline constexpr TypeOps type_ops[TAG__COUNT] = {
    /*BOOL    */ { &force_impl<BOOL_t>,   &unforce_impl<BOOL_t>,   &read_impl<BOOL_t>,   &write_impl<BOOL_t>,   sizeof(BOOL_t)   },
    /*SINT    */ { &force_impl<SINT_t>,   &unforce_impl<SINT_t>,   &read_impl<SINT_t>,   &write_impl<SINT_t>,   sizeof(SINT_t)   },
    /*USINT   */ { &force_impl<USINT_t>,  &unforce_impl<USINT_t>,  &read_impl<USINT_t>,  &write_impl<USINT_t>,  sizeof(USINT_t)  },
    /*INT     */ { &force_impl<INT_t>,    &unforce_impl<INT_t>,    &read_impl<INT_t>,    &write_impl<INT_t>,    sizeof(INT_t)    },
    /*UINT    */ { &force_impl<UINT_t>,   &unforce_impl<UINT_t>,   &read_impl<UINT_t>,   &write_impl<UINT_t>,   sizeof(UINT_t)   },
    /*DINT    */ { &force_impl<DINT_t>,   &unforce_impl<DINT_t>,   &read_impl<DINT_t>,   &write_impl<DINT_t>,   sizeof(DINT_t)   },
    /*UDINT   */ { &force_impl<UDINT_t>,  &unforce_impl<UDINT_t>,  &read_impl<UDINT_t>,  &write_impl<UDINT_t>,  sizeof(UDINT_t)  },
    /*LINT    */ { &force_impl<LINT_t>,   &unforce_impl<LINT_t>,   &read_impl<LINT_t>,   &write_impl<LINT_t>,   sizeof(LINT_t)   },
    /*ULINT   */ { &force_impl<ULINT_t>,  &unforce_impl<ULINT_t>,  &read_impl<ULINT_t>,  &write_impl<ULINT_t>,  sizeof(ULINT_t)  },
    /*REAL    */ { &force_impl<REAL_t>,   &unforce_impl<REAL_t>,   &read_impl<REAL_t>,   &write_impl<REAL_t>,   sizeof(REAL_t)   },
    /*LREAL   */ { &force_impl<LREAL_t>,  &unforce_impl<LREAL_t>,  &read_impl<LREAL_t>,  &write_impl<LREAL_t>,  sizeof(LREAL_t)  },
    /*BYTE    */ { &force_impl<BYTE_t>,   &unforce_impl<BYTE_t>,   &read_impl<BYTE_t>,   &write_impl<BYTE_t>,   sizeof(BYTE_t)   },
    /*WORD    */ { &force_impl<WORD_t>,   &unforce_impl<WORD_t>,   &read_impl<WORD_t>,   &write_impl<WORD_t>,   sizeof(WORD_t)   },
    /*DWORD   */ { &force_impl<DWORD_t>,  &unforce_impl<DWORD_t>,  &read_impl<DWORD_t>,  &write_impl<DWORD_t>,  sizeof(DWORD_t)  },
    /*LWORD   */ { &force_impl<LWORD_t>,  &unforce_impl<LWORD_t>,  &read_impl<LWORD_t>,  &write_impl<LWORD_t>,  sizeof(LWORD_t)  },
    /*TIME    */ { &force_impl<TIME_t>,   &unforce_impl<TIME_t>,   &read_impl<TIME_t>,   &write_impl<TIME_t>,   sizeof(TIME_t)   },
    /*DATE    */ { &force_impl<DATE_t>,   &unforce_impl<DATE_t>,   &read_impl<DATE_t>,   &write_impl<DATE_t>,   sizeof(DATE_t)   },
    /*TOD     */ { &force_impl<TOD_t>,    &unforce_impl<TOD_t>,    &read_impl<TOD_t>,    &write_impl<TOD_t>,    sizeof(TOD_t)    },
    /*DT      */ { &force_impl<DT_t>,     &unforce_impl<DT_t>,     &read_impl<DT_t>,     &write_impl<DT_t>,     sizeof(DT_t)     },
    /*STRING  */ { &force_string,         &unforce_string,         &read_string,         &write_string,         DEBUG_STRING_WIDTH  },
    /*WSTRING */ { &force_wstring,        &unforce_wstring,        &read_wstring,        &write_wstring,        DEBUG_WSTRING_WIDTH },
};

// ---------------------------------------------------------------------------
// Per-project tables are declared in `debug_table.hpp` (which we
// include above).  They live there — not here — because the table-emit
// translation unit (`generated_debug.cpp`) needs the `extern`
// declarations to force external linkage on its `const` definitions,
// and pulling `debug_dispatch.hpp` into generated_debug.cpp drags
// `<avr/pgmspace.h>` → `<avr/io.h>` into a TU that names user
// variables.  See debug_table.hpp's preamble for the rationale.
//
// On AVR these tables are in PROGMEM; the accessors below use
// pgm_read_*_far() when the chip exposes RAMPZ (Mega2560, ATmega32U4,
// ATmega1280, etc.) and fall back to near pgm_read_word() on the
// atmega328p / atmega168 family (Uno, Nano, Pro Mini), whose entire
// flash always fits in 16 bits.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// read_entry(): fetches Entry for (array_idx, elem_idx).
// On AVR uses PROGMEM reads (far when the chip has RAMPZ, near otherwise);
// elsewhere a plain array access. Returns {nullptr, 0} on out-of-bounds so
// callers can cheaply check.
//
// `defined(RAMPZ)` is the same predicate avr-libc's <avr/pgmspace.h> uses to
// gate declarations of `pgm_read_*_far` and `pgm_get_far_address`. Chips
// without RAMPZ (atmega328p / atmega168 family — Uno, Nano, Pro Mini) lack
// the ELPM instruction and the avr-libc headers don't expose the _far
// variants, so referencing them is a hard compile error. Chips with RAMPZ
// (atmega2560 — Mega, atmega1280, atmega32u4 — Micro / Leonardo, etc.)
// keep the far-addressing path since their tables may live above 64 KB
// (Mega) or because the same code is benign-but-correct when flash is
// ≤64 KB (32u4: ELPM with RAMPZ=0 behaves as LPM).
// ---------------------------------------------------------------------------
inline Entry read_entry(uint8_t arr, uint16_t elem) noexcept {
    Entry out{nullptr, 0, 0};
    if (arr >= debug_array_count) return out;

#if defined(__AVR__) && defined(RAMPZ)
    // Fetch elem count (uint16_t in PROGMEM) first
    uint32_t counts_base = pgm_get_far_address(debug_array_counts);
    uint16_t count = pgm_read_word_far(counts_base + arr * sizeof(uint16_t));
    if (elem >= count) return out;

    // Fetch Entry* (pointer-to-PROGMEM, 16-bit on AVR but stored in far flash)
    uint32_t arrays_base = pgm_get_far_address(debug_arrays);
    // pointers in PROGMEM are 16-bit near pointers on AVR (entry arrays live
    // in their own PROGMEM regions which near pointers can still reach, since
    // each array < 32 KB. But debug_arrays itself can be far.)
    uintptr_t table_ptr = pgm_read_word_far(arrays_base + arr * sizeof(void*));

    // Read the 4-byte Entry. We assume the array is in the lower 64 KB; if
    // it's past, we would need pgm_read_word_far on the element too. For
    // Phase 4a we accept the <64 KB constraint per entry array.
    const uint8_t* entry_addr = reinterpret_cast<const uint8_t*>(table_ptr) + elem * sizeof(Entry);
    uintptr_t ptr_val = pgm_read_word(entry_addr);
    uint8_t tag_val   = pgm_read_byte(entry_addr + sizeof(void*));
    out.ptr = reinterpret_cast<void*>(ptr_val);
    out.tag = tag_val;
#elif defined(__AVR__)
    // AVR without RAMPZ — flash is ≤64 KB on these chips, so every PROGMEM
    // address fits in a 16-bit pointer and near accessors are sufficient.
    uint16_t count = pgm_read_word(&debug_array_counts[arr]);
    if (elem >= count) return out;

    const Entry* table = reinterpret_cast<const Entry*>(pgm_read_word(&debug_arrays[arr]));
    const uint8_t* entry_addr = reinterpret_cast<const uint8_t*>(table) + elem * sizeof(Entry);
    uintptr_t ptr_val = pgm_read_word(entry_addr);
    uint8_t tag_val   = pgm_read_byte(entry_addr + sizeof(void*));
    out.ptr = reinterpret_cast<void*>(ptr_val);
    out.tag = tag_val;
#else
    uint16_t count = debug_array_counts[arr];
    if (elem >= count) return out;
    out = debug_arrays[arr][elem];
#endif
    return out;
}

// ---------------------------------------------------------------------------
// Per-entry operations. These are what ModbusSlave / Runtime v4 call.
// ---------------------------------------------------------------------------

/** Set (force or unforce) a variable. Returns STATUS_* code. */
inline uint8_t handle_set(uint8_t arr, uint16_t elem, bool forcing,
                          const uint8_t* bytes, uint16_t len) noexcept {
    Entry e = read_entry(arr, elem);
    if (!e.ptr || e.tag >= TAG__COUNT) return STATUS_OUT_OF_BOUNDS;

    if (forcing) {
        uint8_t expected = type_ops[e.tag].size;
        // size == 0 is the string stub — Phase 4a rejects for now
        if (expected == 0) return STATUS_DATA_TOO_LARGE;
        if (len < expected) return STATUS_DATA_TOO_LARGE;
        type_ops[e.tag].force(e.ptr, bytes);
    } else {
        type_ops[e.tag].unforce(e.ptr);
    }
    return STATUS_OK;
}

/** Read one variable into `dest`. Writes type_ops[tag].size bytes.
 *  Returns bytes written, or 0 on out-of-bounds. */
inline uint16_t handle_read(uint8_t arr, uint16_t elem, uint8_t* dest) noexcept {
    Entry e = read_entry(arr, elem);
    if (!e.ptr || e.tag >= TAG__COUNT) return 0;
    uint8_t n = type_ops[e.tag].size;
    if (n == 0) return 0;  // string stub
    type_ops[e.tag].read(e.ptr, dest);
    return n;
}

/** Soft write (non-forcing). Updates the underlying value via
 *  IECVar::set(). If the variable is currently forced, the write is
 *  silently ignored — forcing remains authoritative until unforced.
 *  This matches OPC-UA / BACnet write semantics: the next scan cycle
 *  may overwrite the written value, unlike force which pins it.
 *  Returns STATUS_* code. */
inline uint8_t handle_write(uint8_t arr, uint16_t elem,
                            const uint8_t* bytes, uint16_t len) noexcept {
    Entry e = read_entry(arr, elem);
    if (!e.ptr || e.tag >= TAG__COUNT) return STATUS_OUT_OF_BOUNDS;
    uint8_t expected = type_ops[e.tag].size;
    if (expected == 0) return STATUS_DATA_TOO_LARGE;  // string stub
    if (len < expected) return STATUS_DATA_TOO_LARGE;
    type_ops[e.tag].write(e.ptr, bytes);
    return STATUS_OK;
}

/** Variable size for (arr, elem) — 0 if unknown/out-of-bounds. */
inline uint16_t handle_size(uint8_t arr, uint16_t elem) noexcept {
    Entry e = read_entry(arr, elem);
    if (!e.ptr || e.tag >= TAG__COUNT) return 0;
    return type_ops[e.tag].size;
}

/** Total number of arrays. */
inline uint8_t handle_array_count() noexcept {
    return debug_array_count;
}

/** Element count for a given array — 0 if `arr` out-of-bounds.
 *  AVR branch mirrors `read_entry` above: RAMPZ-equipped chips use far
 *  accessors, others fall back to near reads. */
inline uint16_t handle_elem_count(uint8_t arr) noexcept {
    if (arr >= debug_array_count) return 0;
#if defined(__AVR__) && defined(RAMPZ)
    uint32_t counts_base = pgm_get_far_address(debug_array_counts);
    return pgm_read_word_far(counts_base + arr * sizeof(uint16_t));
#elif defined(__AVR__)
    return pgm_read_word(&debug_array_counts[arr]);
#else
    return debug_array_counts[arr];
#endif
}

} } // namespace strucpp::debug

// ---------------------------------------------------------------------------
// C-linkage shims for the OpenPLC Runtime v4 .so interface.
//
// The runtime dlopen()s a libplc_<hash>.so and dlsym()s these symbols to
// speak the debug protocol without needing the C++ strucpp::debug namespace.
//
// Usage: in the .so's packaging step (Phase 5), compile ONE .cpp with
//
//     #define STRUCPP_V4_DEBUG_EXPORTS_DEFINE
//     #include "debug_dispatch.hpp"
//
// The symbols use `attribute((used, visibility("default")))` so they're
// retained even under LTO and appear in the dynamic symbol table.
//
// Embedded targets (Arduino) should NOT define the macro — the Flash cost
// of these extra symbols is unnecessary there (the ModbusSlave calls
// handle_* directly via C++ linkage).
// ---------------------------------------------------------------------------
#ifdef STRUCPP_V4_DEBUG_EXPORTS_DEFINE
#define STRUCPP_V4_EXPORT __attribute__((used, visibility("default")))

extern "C" {

STRUCPP_V4_EXPORT uint8_t strucpp_debug_array_count(void) {
    return strucpp::debug::handle_array_count();
}

STRUCPP_V4_EXPORT uint16_t strucpp_debug_elem_count(uint8_t arr) {
    return strucpp::debug::handle_elem_count(arr);
}

STRUCPP_V4_EXPORT uint16_t strucpp_debug_size(uint8_t arr, uint16_t elem) {
    return strucpp::debug::handle_size(arr, elem);
}

STRUCPP_V4_EXPORT uint8_t strucpp_debug_set(uint8_t arr, uint16_t elem,
                                             bool forcing,
                                             const uint8_t *bytes,
                                             uint16_t len) {
    return strucpp::debug::handle_set(arr, elem, forcing, bytes, len);
}

STRUCPP_V4_EXPORT uint16_t strucpp_debug_read(uint8_t arr, uint16_t elem,
                                               uint8_t *dest) {
    return strucpp::debug::handle_read(arr, elem, dest);
}

STRUCPP_V4_EXPORT uint8_t strucpp_debug_write(uint8_t arr, uint16_t elem,
                                               const uint8_t *bytes,
                                               uint16_t len) {
    return strucpp::debug::handle_write(arr, elem, bytes, len);
}

} // extern "C"

#undef STRUCPP_V4_EXPORT
#endif // STRUCPP_V4_DEBUG_EXPORTS_DEFINE
