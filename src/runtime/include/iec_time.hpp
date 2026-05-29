// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - IEC TIME Standard Functions
 *
 * IEC 61131-3 standard functions on the TIME (and LTIME) duration types.
 * TIME / LTIME are stored as signed nanoseconds in `IECVar<TIME_t>` (the
 * generic per-variable wrapper).  Codegen emits TIME variables as
 * `IEC_TIME` (the `IECVar<TIME_t>` alias) and time literals as raw
 * nanosecond `int64_t` values that the IECVar `operator=(T)` assigns
 * directly, so every function here takes/returns `IEC_TIME` for
 * symmetry — no separate value class wraps the IEC variable form.
 *
 * Historical note: an earlier `TimeValue<T>` + `IECTimeVar<T>` value-
 * class design lived here.  Codegen never adopted it (TIME variables
 * were always declared as `IEC_TIME`), so the parallel API was dead
 * from generated code's perspective.  Removed in favour of a single
 * IECVar-based surface.
 */

#pragma once

#include <cstdint>
#include "iec_types.hpp"
#include "iec_var.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// ---------------------------------------------------------------------------
// Nanosecond conversion constants
// ---------------------------------------------------------------------------
// Storage unit for both TIME and LTIME is nanoseconds.  Conversion helpers
// below scale the underlying `int64_t` by these factors; user code can also
// import them for arithmetic that mixes literal scalars with TIME values
// (e.g. `MUL_TIME(t, 60)` for a 1-minute multiplier without recomputing the
// constant).
inline constexpr int64_t NS_PER_US = 1000LL;
inline constexpr int64_t NS_PER_MS = 1000000LL;
inline constexpr int64_t NS_PER_S = 1000000000LL;
inline constexpr int64_t NS_PER_M = 60LL * NS_PER_S;
inline constexpr int64_t NS_PER_H = 60LL * NS_PER_M;
inline constexpr int64_t NS_PER_D = 24LL * NS_PER_H;

// ---------------------------------------------------------------------------
// Conversion: TIME → integer count of the requested unit (truncated)
// ---------------------------------------------------------------------------
// The millisecond / second variants live in `iec_std_lib.hpp` next to the
// generic numeric conversions.  Other units stay here so the per-type
// surface is self-contained.
//
// Functions are inline but not constexpr: `IECVar<T>`'s default constructor
// is non-constexpr (storage has a runtime `forced_` flag and forced-value
// slot the debugger flips through `force()`), so passing one by value to
// a constexpr context isn't allowed.  Inline gives us identical codegen
// without the literal-type constraint.
inline int64_t TIME_TO_NS(IEC_TIME t) noexcept {
    return iec_unwrap(t);
}

inline int64_t TIME_TO_US(IEC_TIME t) noexcept {
    return iec_unwrap(t) / NS_PER_US;
}

inline int64_t TIME_TO_M(IEC_TIME t) noexcept {
    return iec_unwrap(t) / NS_PER_M;
}

inline int64_t TIME_TO_H(IEC_TIME t) noexcept {
    return iec_unwrap(t) / NS_PER_H;
}

inline int64_t TIME_TO_D(IEC_TIME t) noexcept {
    return iec_unwrap(t) / NS_PER_D;
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------
inline IEC_TIME ABS_TIME(IEC_TIME t) noexcept {
    const TIME_t ns = iec_unwrap(t);
    return IEC_TIME(ns >= 0 ? ns : -ns);
}

inline IEC_TIME ADD_TIME(IEC_TIME a, IEC_TIME b) noexcept {
    return IEC_TIME(iec_unwrap(a) + iec_unwrap(b));
}

inline IEC_TIME SUB_TIME(IEC_TIME a, IEC_TIME b) noexcept {
    return IEC_TIME(iec_unwrap(a) - iec_unwrap(b));
}

template<typename S>
inline IEC_TIME MUL_TIME(IEC_TIME t, S scalar) noexcept {
    return IEC_TIME(static_cast<TIME_t>(iec_unwrap(t) * scalar));
}

template<typename S>
inline IEC_TIME DIV_TIME(IEC_TIME t, S scalar) noexcept {
    return IEC_TIME(static_cast<TIME_t>(iec_unwrap(t) / scalar));
}

// DIVTIME(a, b) returns the integer count of `b`-durations that fit in `a`
// (i.e. `floor(a / b)`).  Different return type from `DIV_TIME(t, scalar)`
// because the operands carry units that cancel — the result is unitless.
inline int64_t DIVTIME(IEC_TIME a, IEC_TIME b) noexcept {
    return iec_unwrap(a) / iec_unwrap(b);
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------
inline bool GT_TIME(IEC_TIME a, IEC_TIME b) noexcept { return iec_unwrap(a) >  iec_unwrap(b); }
inline bool GE_TIME(IEC_TIME a, IEC_TIME b) noexcept { return iec_unwrap(a) >= iec_unwrap(b); }
inline bool EQ_TIME(IEC_TIME a, IEC_TIME b) noexcept { return iec_unwrap(a) == iec_unwrap(b); }
inline bool NE_TIME(IEC_TIME a, IEC_TIME b) noexcept { return iec_unwrap(a) != iec_unwrap(b); }
inline bool LE_TIME(IEC_TIME a, IEC_TIME b) noexcept { return iec_unwrap(a) <= iec_unwrap(b); }
inline bool LT_TIME(IEC_TIME a, IEC_TIME b) noexcept { return iec_unwrap(a) <  iec_unwrap(b); }

} // namespace strucpp
