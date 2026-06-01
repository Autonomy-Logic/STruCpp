// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - IEC DATE_AND_TIME Standard Functions
 *
 * IEC 61131-3 standard functions on the DATE_AND_TIME (DT) and LDT
 * combined types.  DT / LDT are stored as signed nanoseconds since
 * the Unix epoch (1970-01-01 00:00:00) in `IECVar<DT_t>` — the same
 * generic per-variable wrapper used everywhere.  Codegen emits DT
 * variables as `IEC_DT` (the `IECVar<DT_t>` alias) and the functions
 * below take/return `IEC_DT` so they're directly callable from
 * generated POU code.
 *
 * Scope: only the standard arithmetic / comparison / split-join
 * functions.  Calendar/clock component accessors (DT_YEAR,
 * DT_MONTH, DT_DAY, DT_HOUR, …) are intentionally NOT here — those
 * are OSCAT-style extensions and user libraries (OSCAT, codesys-v23
 * stdlib imports) ship their own implementations.  Providing them
 * here would create overload ambiguity when a project imports such
 * a library.
 *
 * Historical note: an earlier `DateTimeValue<T>` + `IECDtVar<T>`
 * value-class design lived here.  Codegen never adopted it; the
 * parallel API was dead from generated code's perspective.  Removed
 * in favour of a single IECVar-based surface.  See `iec_time.hpp`
 * for the matching note on the TIME family.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_date.hpp"
#include "iec_tod.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// ---------------------------------------------------------------------------
// Nanosecond unit constant
// ---------------------------------------------------------------------------
// Duplicated from iec_time.hpp on purpose: clients sometimes include
// iec_dt.hpp without iec_time.hpp, and the `DT_FROM_*` helpers below
// need the unit factor.  C++ tolerates redeclaration of inline
// constexpr at namespace scope as long as the value matches.
inline constexpr int64_t DT_NS_PER_DAY = 24LL * 60LL * 60LL * 1000000000LL;

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------
inline IEC_DT DT_FROM_COMPONENTS(
    int year, int month, int day,
    int hour, int minute, int second,
    int millisecond = 0, int microsecond = 0, int nanosecond = 0) noexcept {
    const int a = (14 - month) / 12;
    const int y = year + 4800 - a;
    const int m = month + 12 * a - 3;
    const int jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    constexpr int UNIX_EPOCH_JDN = 2440588;
    const int64_t days = jdn - UNIX_EPOCH_JDN;

    const int64_t ns = days * DT_NS_PER_DAY +
                       static_cast<int64_t>(hour) * 3600LL * 1000000000LL +
                       static_cast<int64_t>(minute) * 60LL * 1000000000LL +
                       static_cast<int64_t>(second) * 1000000000LL +
                       static_cast<int64_t>(millisecond) * 1000000LL +
                       static_cast<int64_t>(microsecond) * 1000LL +
                       nanosecond;
    return IEC_DT(static_cast<DT_t>(ns));
}

inline IEC_DT DT_FROM_NS(int64_t ns) noexcept {
    return IEC_DT(static_cast<DT_t>(ns));
}

inline IEC_DT DT_FROM_SECONDS(int64_t s) noexcept {
    return IEC_DT(static_cast<DT_t>(s * 1000000000LL));
}

// IEC 61131-3 `CONCAT_DATE_TOD`: combine a calendar date and a
// time-of-day into a single DT value.  Stored as
// `date_days * NS_PER_DAY + tod_nanoseconds`.
inline IEC_DT CONCAT_DATE_TOD(IEC_DATE date, IEC_TOD tod) noexcept {
    return IEC_DT(static_cast<DT_t>(iec_unwrap(date) * DT_NS_PER_DAY + iec_unwrap(tod)));
}

// IEC 61131-3 `DT_TO_DATE` and `DT_TO_TOD`: split a DT back into its
// date and time-of-day parts.  Handles negative pre-epoch values by
// keeping `tod_ns` in the canonical [0, 24h) range and spilling the
// borrow into the day count.
inline IEC_DATE DATE_OF_DT(IEC_DT dt) noexcept {
    const DT_t ns = iec_unwrap(dt);
    DT_t days = ns / DT_NS_PER_DAY;
    DT_t tod_ns = ns % DT_NS_PER_DAY;
    if (tod_ns < 0) days -= 1;
    return IEC_DATE(static_cast<DATE_t>(days));
}

inline IEC_TOD TOD_OF_DT(IEC_DT dt) noexcept {
    const DT_t ns = iec_unwrap(dt);
    DT_t tod_ns = ns % DT_NS_PER_DAY;
    if (tod_ns < 0) tod_ns += DT_NS_PER_DAY;
    return IEC_TOD(static_cast<TOD_t>(tod_ns));
}

inline int64_t DT_TO_NS(IEC_DT dt) noexcept {
    return iec_unwrap(dt);
}

inline int64_t DT_TO_MS(IEC_DT dt) noexcept {
    return iec_unwrap(dt) / 1000000LL;
}

inline int64_t DT_TO_SECONDS(IEC_DT dt) noexcept {
    return iec_unwrap(dt) / 1000000000LL;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------
inline IEC_DT ADD_DT(IEC_DT dt, int64_t ns) noexcept {
    return IEC_DT(iec_unwrap(dt) + static_cast<DT_t>(ns));
}

inline IEC_DT SUB_DT(IEC_DT dt, int64_t ns) noexcept {
    return IEC_DT(iec_unwrap(dt) - static_cast<DT_t>(ns));
}

inline int64_t DIFF_DT(IEC_DT a, IEC_DT b) noexcept {
    return iec_unwrap(a) - iec_unwrap(b);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
inline bool GT_DT(IEC_DT a, IEC_DT b) noexcept { return iec_unwrap(a) >  iec_unwrap(b); }
inline bool GE_DT(IEC_DT a, IEC_DT b) noexcept { return iec_unwrap(a) >= iec_unwrap(b); }
inline bool EQ_DT(IEC_DT a, IEC_DT b) noexcept { return iec_unwrap(a) == iec_unwrap(b); }
inline bool NE_DT(IEC_DT a, IEC_DT b) noexcept { return iec_unwrap(a) != iec_unwrap(b); }
inline bool LE_DT(IEC_DT a, IEC_DT b) noexcept { return iec_unwrap(a) <= iec_unwrap(b); }
inline bool LT_DT(IEC_DT a, IEC_DT b) noexcept { return iec_unwrap(a) <  iec_unwrap(b); }

} // namespace strucpp
