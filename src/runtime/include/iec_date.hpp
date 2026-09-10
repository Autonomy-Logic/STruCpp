// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - IEC DATE Standard Functions
 *
 * IEC 61131-3 standard functions on the DATE (and LDATE) calendar
 * types.  DATE / LDATE are stored as signed days since the Unix epoch
 * (1970-01-01) in `IECVar<DATE_t>` — the same generic per-variable
 * wrapper used for every other elementary type.  Codegen emits DATE
 * variables as `IEC_DATE` (the `IECVar<DATE_t>` alias) and the
 * functions below take/return `IEC_DATE` so they're directly callable
 * from generated POU code.
 *
 * Scope: only the standard arithmetic / comparison / round-trip
 * functions.  Calendar component accessors (YEAR, MONTH, DAY,
 * DAY_OF_WEEK, DAY_OF_YEAR, …) are intentionally NOT here — those are
 * OSCAT-style extensions and user libraries (OSCAT, codesys-v23
 * stdlib imports, …) ship their own implementations.  Providing them
 * here would create overload ambiguity when a project imports such a
 * library.
 *
 * Historical note: an earlier `DateValue<T>` + `IECDateVar<T>` value-
 * class design lived here.  Codegen never adopted it (DATE variables
 * were always declared as `IEC_DATE`), so the parallel API was dead
 * from generated code's perspective.  Removed in favour of a single
 * IECVar-based surface.  See `iec_time.hpp` for the matching note on
 * the TIME family.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------
// `DATE_FROM_YMD(2024, 3, 15)` converts a Gregorian (year, month, day)
// triple into a DATE by way of the Julian Day Number.  Branch-free
// integer arithmetic.
inline IEC_DATE DATE_FROM_YMD(int year, int month, int day) noexcept {
    const int a = (14 - month) / 12;
    const int y = year + 4800 - a;
    const int m = month + 12 * a - 3;
    const int jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    constexpr int UNIX_EPOCH_JDN = 2440588;
    return IEC_DATE(static_cast<DATE_t>(jdn - UNIX_EPOCH_JDN));
}

inline IEC_DATE DATE_FROM_DAYS(int64_t days) noexcept {
    return IEC_DATE(static_cast<DATE_t>(days));
}

inline int64_t DATE_TO_DAYS(IEC_DATE d) noexcept {
    return iec_unwrap(d);
}

// DATE is stored as whole days, but CODESYS holds DATE in the same memory
// format as DT — seconds since 1970-01-01, truncated to a day boundary — and
// its DATE_TO_* conversions yield that: `DATE_TO_DINT(D#1970-01-02)` is 86400,
// not 1. LDATE is the 64-bit form and yields nanoseconds. These four convert
// between our day count and the two units the conversions have to produce.
/**
 * Floor division, so a pre-epoch input borrows a day instead of rounding
 * toward zero.
 *
 * `-1 / 86400` is 0 in C++, which would put one second before the epoch on
 * 1970-01-01 rather than 1969-12-31. `DATE_OF_DT` already spills that borrow
 * explicitly, and these helpers are fed arbitrary user expressions through
 * `DINT_TO_DATE(x)` rather than only literals, so the two have to agree.
 * Pre-1970 DATE is outside CODESYS's documented domain, but nothing rejects
 * it, and a silent off-by-one-day is worse than an unsupported value.
 */
inline constexpr int64_t iec_floor_div(int64_t n, int64_t d) noexcept {
    const int64_t q = n / d;
    return (n % d != 0 && ((n < 0) != (d < 0))) ? q - 1 : q;
}

inline constexpr int64_t DATE_SECONDS_PER_DAY = IEC_SECONDS_PER_DAY;
inline constexpr int64_t DATE_NS_PER_DAY = IEC_NS_PER_DAY;

inline int64_t DATE_TO_SECONDS(IEC_DATE d) noexcept {
    return iec_unwrap(d) * DATE_SECONDS_PER_DAY;
}

inline IEC_DATE DATE_FROM_SECONDS(int64_t s) noexcept {
    return IEC_DATE(static_cast<DATE_t>(iec_floor_div(s, DATE_SECONDS_PER_DAY)));
}

inline int64_t DATE_TO_NS(IEC_DATE d) noexcept {
    return iec_unwrap(d) * DATE_NS_PER_DAY;
}

inline IEC_DATE DATE_FROM_NS(int64_t ns) noexcept {
    return IEC_DATE(static_cast<DATE_t>(iec_floor_div(ns, DATE_NS_PER_DAY)));
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------
inline IEC_DATE ADD_DATE(IEC_DATE d, int64_t days) noexcept {
    return IEC_DATE(iec_unwrap(d) + static_cast<DATE_t>(days));
}

inline IEC_DATE SUB_DATE(IEC_DATE d, int64_t days) noexcept {
    return IEC_DATE(iec_unwrap(d) - static_cast<DATE_t>(days));
}

inline int64_t DIFF_DATE(IEC_DATE a, IEC_DATE b) noexcept {
    return iec_unwrap(a) - iec_unwrap(b);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
inline bool GT_DATE(IEC_DATE a, IEC_DATE b) noexcept { return iec_unwrap(a) >  iec_unwrap(b); }
inline bool GE_DATE(IEC_DATE a, IEC_DATE b) noexcept { return iec_unwrap(a) >= iec_unwrap(b); }
inline bool EQ_DATE(IEC_DATE a, IEC_DATE b) noexcept { return iec_unwrap(a) == iec_unwrap(b); }
inline bool NE_DATE(IEC_DATE a, IEC_DATE b) noexcept { return iec_unwrap(a) != iec_unwrap(b); }
inline bool LE_DATE(IEC_DATE a, IEC_DATE b) noexcept { return iec_unwrap(a) <= iec_unwrap(b); }
inline bool LT_DATE(IEC_DATE a, IEC_DATE b) noexcept { return iec_unwrap(a) <  iec_unwrap(b); }

} // namespace strucpp
