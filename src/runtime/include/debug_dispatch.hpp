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

#include "iec_types.hpp"
#include "iec_traits.hpp"
#include "iec_var.hpp"
#include <cstdint>
#include <cstddef>
#include <cstring>

// ---------------------------------------------------------------------------
// Flash-placement macro for per-project pointer tables.
// Defined here so generated_debug.cpp stays target-neutral — the runtime
// header decides the placement attribute.
// ---------------------------------------------------------------------------
#ifdef __AVR__
#include <avr/pgmspace.h>
#define STRUCPP_DEBUG_FLASH PROGMEM
#else
#define STRUCPP_DEBUG_FLASH
#endif

namespace strucpp { namespace debug {

// ---------------------------------------------------------------------------
// Type tags. Order is ABI — matches the indices generated into
// generated_debug.cpp's Entry{.tag} fields, and must match type_ops[] below.
// ---------------------------------------------------------------------------
enum TypeTag : uint8_t {
    TAG_BOOL    = 0,
    TAG_SINT    = 1,
    TAG_USINT   = 2,
    TAG_INT     = 3,
    TAG_UINT    = 4,
    TAG_DINT    = 5,
    TAG_UDINT   = 6,
    TAG_LINT    = 7,
    TAG_ULINT   = 8,
    TAG_REAL    = 9,
    TAG_LREAL   = 10,
    TAG_BYTE    = 11,
    TAG_WORD    = 12,
    TAG_DWORD   = 13,
    TAG_LWORD   = 14,
    TAG_TIME    = 15,
    TAG_DATE    = 16,
    TAG_TOD     = 17,
    TAG_DT      = 18,
    TAG_STRING  = 19,
    TAG_WSTRING = 20,
    TAG__COUNT
};

// ---------------------------------------------------------------------------
// Debug entry: one per leaf variable. 4 bytes on 16-bit-pointer AVR,
// 16 bytes on 64-bit platforms (pad absorbs alignment).
// ---------------------------------------------------------------------------
struct Entry {
    void* ptr;
    uint8_t tag;
    uint8_t _pad;
};

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

template <typename T>
inline void unforce_impl(void* p) noexcept {
    static_cast<IECVar<T>*>(p)->unforce();
}

template <typename T>
inline void read_impl(const void* p, uint8_t* dest) noexcept {
    T v = static_cast<const IECVar<T>*>(p)->get();
    std::memcpy(dest, &v, sizeof(T));
}

// STRING/WSTRING live in IEC_STRING<N>/IEC_WSTRING<N> which carry their own
// length. The debugger surfaces them as a fixed-width byte window:
// - read copies up to IEC_STRING_MAX_LENGTH bytes of current content + length byte
// - force replaces content (length byte + bytes)
// For Phase 4a we use a conservative fixed size via sizeof() of the default
// IEC_STRING type. Variable-length encoding is a Phase 4b refinement.
//
// NOTE: string support in Phase 4a is a stub that just memcpy's the raw
// storage bytes. Full variable-length semantics come in Phase 4b.
inline void force_string_stub(void* /*p*/, const uint8_t* /*bytes*/) noexcept {
    // Phase 4a: no-op. Forcing strings is disabled until variable-length
    // wire encoding is defined.
}
inline void unforce_string_stub(void* /*p*/) noexcept {
    // Phase 4a: no-op.
}
inline void read_string_stub(const void* /*p*/, uint8_t* dest) noexcept {
    // Phase 4a: zero-fill. Editor displays "<debugger string read N/A>".
    dest[0] = 0;
}

// ---------------------------------------------------------------------------
// Dispatch table entry. The `size` field is the byte width consumed/produced
// by force/read (for strings: reserved, handled specially).
// ---------------------------------------------------------------------------
struct TypeOps {
    void (*force)  (void*, const uint8_t*);
    void (*unforce)(void*);
    void (*read)   (const void*, uint8_t*);
    uint8_t size;
};

// ---------------------------------------------------------------------------
// type_ops[]: one row per TypeTag, in tag order.
// Kept inline so it's flash-resident with no separate .cpp required.
// ---------------------------------------------------------------------------
inline constexpr TypeOps type_ops[TAG__COUNT] = {
    /*BOOL    */ { &force_impl<BOOL_t>,   &unforce_impl<BOOL_t>,   &read_impl<BOOL_t>,   sizeof(BOOL_t)   },
    /*SINT    */ { &force_impl<SINT_t>,   &unforce_impl<SINT_t>,   &read_impl<SINT_t>,   sizeof(SINT_t)   },
    /*USINT   */ { &force_impl<USINT_t>,  &unforce_impl<USINT_t>,  &read_impl<USINT_t>,  sizeof(USINT_t)  },
    /*INT     */ { &force_impl<INT_t>,    &unforce_impl<INT_t>,    &read_impl<INT_t>,    sizeof(INT_t)    },
    /*UINT    */ { &force_impl<UINT_t>,   &unforce_impl<UINT_t>,   &read_impl<UINT_t>,   sizeof(UINT_t)   },
    /*DINT    */ { &force_impl<DINT_t>,   &unforce_impl<DINT_t>,   &read_impl<DINT_t>,   sizeof(DINT_t)   },
    /*UDINT   */ { &force_impl<UDINT_t>,  &unforce_impl<UDINT_t>,  &read_impl<UDINT_t>,  sizeof(UDINT_t)  },
    /*LINT    */ { &force_impl<LINT_t>,   &unforce_impl<LINT_t>,   &read_impl<LINT_t>,   sizeof(LINT_t)   },
    /*ULINT   */ { &force_impl<ULINT_t>,  &unforce_impl<ULINT_t>,  &read_impl<ULINT_t>,  sizeof(ULINT_t)  },
    /*REAL    */ { &force_impl<REAL_t>,   &unforce_impl<REAL_t>,   &read_impl<REAL_t>,   sizeof(REAL_t)   },
    /*LREAL   */ { &force_impl<LREAL_t>,  &unforce_impl<LREAL_t>,  &read_impl<LREAL_t>,  sizeof(LREAL_t)  },
    /*BYTE    */ { &force_impl<BYTE_t>,   &unforce_impl<BYTE_t>,   &read_impl<BYTE_t>,   sizeof(BYTE_t)   },
    /*WORD    */ { &force_impl<WORD_t>,   &unforce_impl<WORD_t>,   &read_impl<WORD_t>,   sizeof(WORD_t)   },
    /*DWORD   */ { &force_impl<DWORD_t>,  &unforce_impl<DWORD_t>,  &read_impl<DWORD_t>,  sizeof(DWORD_t)  },
    /*LWORD   */ { &force_impl<LWORD_t>,  &unforce_impl<LWORD_t>,  &read_impl<LWORD_t>,  sizeof(LWORD_t)  },
    /*TIME    */ { &force_impl<TIME_t>,   &unforce_impl<TIME_t>,   &read_impl<TIME_t>,   sizeof(TIME_t)   },
    /*DATE    */ { &force_impl<DATE_t>,   &unforce_impl<DATE_t>,   &read_impl<DATE_t>,   sizeof(DATE_t)   },
    /*TOD     */ { &force_impl<TOD_t>,    &unforce_impl<TOD_t>,    &read_impl<TOD_t>,    sizeof(TOD_t)    },
    /*DT      */ { &force_impl<DT_t>,     &unforce_impl<DT_t>,     &read_impl<DT_t>,     sizeof(DT_t)     },
    /*STRING  */ { &force_string_stub,    &unforce_string_stub,    &read_string_stub,    0 },
    /*WSTRING */ { &force_string_stub,    &unforce_string_stub,    &read_string_stub,    0 },
};

// ---------------------------------------------------------------------------
// Per-project tables — DECLARED here, DEFINED by generated_debug.cpp.
// Using `extern` so the linker ties them together without the runtime header
// needing to know the array counts at compile time.
//
// On AVR these are in PROGMEM; the accessors below use pgm_read_*_far() to
// work regardless of flash location.
// ---------------------------------------------------------------------------
extern const Entry* const debug_arrays[]     STRUCPP_DEBUG_FLASH;
extern const uint16_t     debug_array_counts[] STRUCPP_DEBUG_FLASH;
extern const uint8_t      debug_array_count;

// ---------------------------------------------------------------------------
// read_entry(): fetches Entry for (array_idx, elem_idx).
// On AVR uses far PROGMEM reads; elsewhere a plain array access.
// Returns {nullptr, 0} on out-of-bounds so callers can cheaply check.
// ---------------------------------------------------------------------------
inline Entry read_entry(uint8_t arr, uint16_t elem) noexcept {
    Entry out{nullptr, 0, 0};
    if (arr >= debug_array_count) return out;

#ifdef __AVR__
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

/** Element count for a given array — 0 if `arr` out-of-bounds. */
inline uint16_t handle_elem_count(uint8_t arr) noexcept {
    if (arr >= debug_array_count) return 0;
#ifdef __AVR__
    uint32_t counts_base = pgm_get_far_address(debug_array_counts);
    return pgm_read_word_far(counts_base + arr * sizeof(uint16_t));
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

} // extern "C"

#undef STRUCPP_V4_EXPORT
#endif // STRUCPP_V4_DEBUG_EXPORTS_DEFINE
