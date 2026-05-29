// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - IEC TIME_OF_DAY Standard Functions
 *
 * IEC 61131-3 standard functions on the TIME_OF_DAY (TOD) and LTOD
 * types.  TOD / LTOD are stored as signed nanoseconds since midnight
 * in `IECVar<TOD_t>`, normalised into the [0, 24h) range by the
 * `TOD_NORMALIZE` helper used by the construction + arithmetic
 * functions below.  Codegen emits TOD variables as `IEC_TOD` (the
 * `IECVar<TOD_t>` alias) and the functions take/return `IEC_TOD` so
 * they're directly callable from generated POU code.
 *
 * Scope: only the standard arithmetic / comparison / round-trip
 * functions.  Calendar/clock component accessors (HOUR, MINUTE,
 * SECOND, …) are intentionally NOT here — those are OSCAT-style
 * extensions and user libraries (OSCAT, codesys-v23 stdlib imports)
 * ship their own implementations.  Providing them here would create
 * overload ambiguity when a project imports such a library.
 *
 * Historical note: an earlier `TimeOfDayValue<T>` + `IECTodVar<T>`
 * value-class design lived here.  Codegen never adopted it; the
 * parallel API was dead from generated code's perspective.  Removed
 * in favour of a single IECVar-based surface.  See `iec_time.hpp`
 * for the matching note on the TIME family.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Mirror of iec_time.hpp's NS_PER_X but scoped here too so iec_tod.hpp is
// self-contained.  Duplicate inline-constexpr declarations at namespace
// scope are legal as long as the value matches; clients including both
// headers see one definition.
inline constexpr int64_t TOD_NS_PER_DAY = 24LL * 60LL * 60LL * 1000000000LL;

// Normalise a signed nanosecond count into the canonical [0, 24h) TOD
// range.  Negative inputs roll over from "before midnight today" to
// "before midnight yesterday"; values ≥ 24h wrap to the next day.
inline TOD_t TOD_NORMALIZE(int64_t ns) noexcept {
    TOD_t result = static_cast<TOD_t>(ns % TOD_NS_PER_DAY);
    if (result < 0) result += static_cast<TOD_t>(TOD_NS_PER_DAY);
    return result;
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------
inline IEC_TOD TOD_FROM_HMS(int hour, int minute, int second,
                            int millisecond = 0, int microsecond = 0,
                            int nanosecond = 0) noexcept {
    const int64_t ns = static_cast<int64_t>(hour) * 3600LL * 1000000000LL +
                       static_cast<int64_t>(minute) * 60LL * 1000000000LL +
                       static_cast<int64_t>(second) * 1000000000LL +
                       static_cast<int64_t>(millisecond) * 1000000LL +
                       static_cast<int64_t>(microsecond) * 1000LL +
                       nanosecond;
    return IEC_TOD(TOD_NORMALIZE(ns));
}

inline IEC_TOD TOD_FROM_NS(int64_t ns) noexcept {
    return IEC_TOD(TOD_NORMALIZE(ns));
}

inline IEC_TOD TOD_FROM_MS(int64_t ms) noexcept {
    return IEC_TOD(TOD_NORMALIZE(ms * 1000000LL));
}

inline int64_t TOD_TO_NS(IEC_TOD tod) noexcept {
    return iec_unwrap(tod);
}

inline int64_t TOD_TO_MS(IEC_TOD tod) noexcept {
    return iec_unwrap(tod) / 1000000LL;
}

// ---------------------------------------------------------------------------
// Arithmetic — results normalised back into the [0, 24h) range.
// `DIFF_TOD` returns a raw (signed) difference in (-24h, +24h);
// callers decide whether to treat negatives as "tomorrow" or
// "yesterday".
// ---------------------------------------------------------------------------
inline IEC_TOD ADD_TOD(IEC_TOD tod, int64_t ns) noexcept {
    return IEC_TOD(TOD_NORMALIZE(iec_unwrap(tod) + ns));
}

inline IEC_TOD SUB_TOD(IEC_TOD tod, int64_t ns) noexcept {
    return IEC_TOD(TOD_NORMALIZE(iec_unwrap(tod) - ns));
}

inline int64_t DIFF_TOD(IEC_TOD a, IEC_TOD b) noexcept {
    return iec_unwrap(a) - iec_unwrap(b);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
inline bool GT_TOD(IEC_TOD a, IEC_TOD b) noexcept { return iec_unwrap(a) >  iec_unwrap(b); }
inline bool GE_TOD(IEC_TOD a, IEC_TOD b) noexcept { return iec_unwrap(a) >= iec_unwrap(b); }
inline bool EQ_TOD(IEC_TOD a, IEC_TOD b) noexcept { return iec_unwrap(a) == iec_unwrap(b); }
inline bool NE_TOD(IEC_TOD a, IEC_TOD b) noexcept { return iec_unwrap(a) != iec_unwrap(b); }
inline bool LE_TOD(IEC_TOD a, IEC_TOD b) noexcept { return iec_unwrap(a) <= iec_unwrap(b); }
inline bool LT_TOD(IEC_TOD a, IEC_TOD b) noexcept { return iec_unwrap(a) <  iec_unwrap(b); }

} // namespace strucpp
