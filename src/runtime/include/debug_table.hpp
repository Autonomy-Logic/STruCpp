// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - Debug Table Types
 *
 * Minimal header included by the per-project `generated_debug.cpp` to declare
 * the debug Entry table.  Carries exactly three things:
 *
 *   1. `STRUCPP_DEBUG_FLASH` — placement attribute applied to the table
 *      arrays (`PROGMEM` on AVR, no-op elsewhere).
 *   2. `TypeTag` enum — the ABI between strucpp's code generator and the
 *      runtime's per-type dispatch.
 *   3. `Entry` struct — the per-leaf record shape.
 *
 * Crucially, this header does NOT include `<avr/pgmspace.h>` — and that's the
 * entire reason it exists.  On AVR targets, `<pgmspace.h>` transitively pulls
 * `<avr/io.h>` which defines `SP`, `SREG`, `OCR0A`, `TCNT0`, `DDRA`, etc. as
 * preprocessor macros expanding to register-pointer casts.  IEC 61131-3
 * function blocks routinely use those identifiers as field names (PID's
 * `SP` setpoint, for example), so the moment a TU that names a user variable
 * sees `<avr/io.h>` the preprocessor mangles `g_config.INSTANCE0.SP` into
 * `g_config.INSTANCE0.(*(volatile uint16_t *)(0x3D))` and the C++ parser
 * dies at the `(`.
 *
 * The dispatch helpers (`read_entry`, `handle_set`, …) genuinely need the
 * AVR-specific accessors `pgm_read_word_far` / `pgm_read_byte` / etc., so
 * they stay in `debug_dispatch.hpp`.  But the runtime translation unit
 * that #includes that header doesn't name user variables — `generated_debug.cpp`
 * is the only TU that does, and it doesn't need the dispatch helpers.  By
 * having `generated_debug.cpp` include THIS file instead of
 * `debug_dispatch.hpp`, AVR's register macros never enter the user-variable
 * TU and identifier collisions become structurally impossible.
 *
 * `debug_dispatch.hpp` includes this file too, so the `TypeTag` enum and
 * `Entry` struct stay defined exactly once — the dispatch side and the
 * table-emit side cannot drift.
 */

#pragma once

#include <cstdint>

// ---------------------------------------------------------------------------
// Flash-placement attribute for per-project pointer tables.
//
// `PROGMEM` (avr-libc) ultimately expands to `__attribute__((__progmem__))`,
// which is a plain GCC section attribute that the avr-gcc driver understands
// natively — `<avr/pgmspace.h>` is not required to USE the attribute, only
// to call the `pgm_read_*` accessors.  Defining it directly here keeps this
// header AVR-clean.
// ---------------------------------------------------------------------------
#ifdef __AVR__
#define STRUCPP_DEBUG_FLASH __attribute__((__progmem__))
#else
#define STRUCPP_DEBUG_FLASH
#endif

namespace strucpp { namespace debug {

// ---------------------------------------------------------------------------
// Type tags.  Order is ABI — matches the indices generated into
// `generated_debug.cpp`'s `Entry{.tag}` fields, and must match `type_ops[]`
// in `debug_dispatch.hpp`.  When extending: append only, never reorder.
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
// Debug entry: one per leaf variable.  Layout is ABI; see notes in
// debug_dispatch.hpp's runtime dispatch for the per-platform size:
// 4 bytes on 16-bit-pointer AVR, 16 bytes on 64-bit platforms (pad absorbs
// alignment).
// ---------------------------------------------------------------------------
struct Entry {
    void* ptr;
    uint8_t tag;
    uint8_t _pad;
};

// ---------------------------------------------------------------------------
// Per-project tables — DECLARED here, DEFINED by generated_debug.cpp.
//
// These MUST be declared `extern` here even though generated_debug.cpp's
// definitions are themselves `const`.  C++ rule: a namespace-scope `const`
// variable gets INTERNAL linkage by default — which would hide the
// definitions from every other translation unit (debug_dispatch.hpp's
// `read_entry` / `handle_*` accessors, the runtime entry, the simulator's
// ModbusSlave) and the linker would fail with `undefined reference to
// strucpp::debug::debug_arrays`.  Putting the `extern` declaration
// FIRST in the TU forces external linkage for the subsequent `const`
// definitions.
//
// The decls live here (not in debug_dispatch.hpp) because
// `generated_debug.cpp` includes only this header — pulling in
// `debug_dispatch.hpp` from the table-emit TU drags `<avr/pgmspace.h>`
// → `<avr/io.h>` into user-variable land, which is the whole reason
// this header exists.  Consumers that need the accessors (read_entry,
// handle_set, …) include `debug_dispatch.hpp` separately and get the
// extern declarations transitively through this header.
//
// `STRUCPP_DEBUG_FLASH` placement is part of the declared signature so
// the linker sees matching `__attribute__((__progmem__))` on both sides.
// ---------------------------------------------------------------------------
extern const Entry* const debug_arrays[]       STRUCPP_DEBUG_FLASH;
extern const uint16_t     debug_array_counts[] STRUCPP_DEBUG_FLASH;
extern const uint8_t      debug_array_count;

} } // namespace strucpp::debug
