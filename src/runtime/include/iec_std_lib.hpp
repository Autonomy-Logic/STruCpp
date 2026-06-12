// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Runtime - IEC Standard Library
 *
 * This header provides the standard IEC 61131-3 functions and utilities.
 * Functions are implemented as C++ templates with IEC type constraints
 * for type safety and compliance with IEC 61131-3 type system.
 *
 * Type constraints follow IEC 61131-3 ANY type hierarchy:
 * - ANY_NUM: Numeric types (integers + reals)
 * - ANY_INT: Integer types (signed + unsigned)
 * - ANY_REAL: Floating point types (REAL, LREAL)
 * - ANY_BIT: Bit string types (BOOL, BYTE, WORD, DWORD, LWORD)
 * - ANY_ELEMENTARY: All elementary types
 * - ANY_MAGNITUDE: Numeric + time types
 */

#pragma once

#include "iec_var.hpp"
#include "iec_traits.hpp"
#include "iec_retain.hpp"
#include "iec_ptr.hpp"
#include "iec_string.hpp"
#include "iec_wstring.hpp"
// IEC 61131-3 temporal types — pulled in here so the standard
// library entry point exposes every standard function (`ADD_TIME`,
// `ADD_DATE`, `ADD_DT`, `ADD_TOD`, `CONCAT_DATE_TOD`, etc.) without
// the caller having to chase the right per-type header.  `codegen.ts`
// emits a single `#include "iec_std_lib.hpp"` into every
// generated.hpp, so the only way a generated POU using TIME or
// calendar arithmetic can resolve those symbols is through this
// transitive chain.  Header guards make each include idempotent.
#include "iec_time.hpp"
#include "iec_date.hpp"
#include "iec_dt.hpp"
#include "iec_tod.hpp"
#include <cmath>
#include <algorithm>
#include <chrono>
#include <cstddef>
#include <cstdlib>
#include <cstring>
#include <type_traits>

// Undefine AVR `<time.h>` macros that collide with common IEC
// identifiers.  `<chrono>` above pulls in `<ctime>` → `<time.h>`,
// and AVR-libc's `time.h` defines a handful of all-caps duration /
// epoch constants that would silently rewrite a user's similarly-
// named variable into a numeric literal before the C++ parser sees
// it.  The collisions surface as cryptic `expected unqualified-id
// before numeric constant` errors on lines like
// `IEC_TIME ONE_HOUR;`.
//
// Same pattern as the `#undef OVERFLOW` codegen emits into every
// `generated.hpp` to neutralise `<math.h>`'s SVID error code.
// Header guards make each include idempotent, so doing the undef
// right after the time-family includes is fine: any later include
// of `<time.h>` directly would re-define the macros, but no
// strucpp-side header does that.
#undef ONE_HOUR
#undef ONE_DEGREE
#undef ONE_DAY
#undef UNIX_OFFSET
#undef NTP_OFFSET

namespace strucpp {

// =============================================================================
// Base Classes for Runtime
// =============================================================================

// Forward declaration for retain support
struct RetainVarInfo;

/**
 * Base class for all program instances.
 * Provides the interface for the runtime scheduler.
 */
struct ProgramBase {
    virtual ~ProgramBase() = default;

    /** Execute one cycle of the program */
    virtual void run() = 0;

    /**
     * Get the array of retain variable descriptors.
     * Override in generated code if the program has RETAIN variables.
     * @return Pointer to static array, or nullptr if no retain variables
     */
    virtual const RetainVarInfo* getRetainVars() const { return nullptr; }

    /**
     * Get the number of retain variables.
     * Override in generated code if the program has RETAIN variables.
     * @return Count of retain variables
     */
    virtual size_t getRetainCount() const { return 0; }

    // -------------------------------------------------------------------------
    // Threaded-runtime hooks (appended at the end of the vtable so run() stays
    // at slot 1 -- a runtime that predates these still works, it just never
    // calls them). No-ops by default; generated code overrides them ONLY when
    // compiled with STRUCPP_THREADED. The OpenPLC threaded runtime calls
    // sync_in() before run() and sync_out() after, around a per-task private
    // working copy of this program's VAR_EXTERNAL globals (so task bodies run
    // without holding a global lock). located_range() reports this program's
    // contiguous slice of the global locatedVars[] table so the runtime can
    // copy its located I/O in/out scoped to the owning task.
    // -------------------------------------------------------------------------

    /** Copy this program's VAR_EXTERNAL globals from canonical storage into
     *  its private working copies. Called by the runtime before run(). */
    virtual void sync_in() {}

    /** Commit this program's changed VAR_EXTERNAL globals from its working
     *  copies back to canonical storage. Called by the runtime after run(). */
    virtual void sync_out() {}

    /** Report this program's slice [offset, offset+count) of the project-wide
     *  locatedVars[] table. count == 0 means the program has no located I/O. */
    virtual void located_range(uint32_t* offset, uint32_t* count) const {
        *offset = 0;
        *count = 0;
    }
};

/**
 * Task instance descriptor.
 * Describes a task's scheduling properties and associated program instances.
 */
struct TaskInstance {
    const char* name;           ///< Task name
    int64_t interval_ns;        ///< Execution interval in nanoseconds (0 = event-driven)
    int32_t priority;           ///< Task priority (higher = more important)
    ProgramBase** programs;     ///< Array of program instances for this task
    size_t program_count;       ///< Number of programs in this task

    TaskInstance() noexcept
        : name(nullptr), interval_ns(0), priority(0), programs(nullptr), program_count(0) {}

    TaskInstance(const char* n, int64_t interval, int32_t prio,
                 ProgramBase** progs, size_t count) noexcept
        : name(n), interval_ns(interval), priority(prio), programs(progs), program_count(count) {}
};

/**
 * Resource instance descriptor.
 * Describes a resource (processor) and its associated tasks.
 */
struct ResourceInstance {
    const char* name;           ///< Resource name
    const char* processor;      ///< Processor type (from ON clause)
    TaskInstance* tasks;        ///< Array of tasks in this resource
    size_t task_count;          ///< Number of tasks

    ResourceInstance() noexcept
        : name(nullptr), processor(nullptr), tasks(nullptr), task_count(0) {}

    ResourceInstance(const char* n, const char* proc,
                     TaskInstance* t, size_t count) noexcept
        : name(n), processor(proc), tasks(t), task_count(count) {}
};

/**
 * Base class for configuration instances.
 * Provides the interface for the runtime to access project structure.
 */
struct ConfigurationInstance {
    virtual ~ConfigurationInstance() = default;

    /** Get configuration name */
    virtual const char* get_name() const = 0;

    /** Get array of resources */
    virtual ResourceInstance* get_resources() = 0;

    /** Get number of resources */
    virtual size_t get_resource_count() const = 0;
};

// =============================================================================
// Numeric Functions (ANY_NUM -> ANY_NUM, or ANY_REAL -> ANY_REAL)
// =============================================================================

/**
 * ABS - Absolute value
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 */
template<typename T, enable_if_any_num<T> = 0>
inline T ABS(T value) noexcept {
    auto v = iec_unwrap(value);
    if constexpr (std::is_floating_point_v<decltype(v)>) {
        return T(std::abs(v));
    } else if constexpr (std::is_signed_v<decltype(v)>) {
        return T(v < 0 ? -v : v);
    } else {
        return value;
    }
}

/**
 * SQRT - Square root
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T SQRT(T value) noexcept {
    return T(std::sqrt(static_cast<double>(iec_unwrap(value))));
}

/**
 * LN - Natural logarithm
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T LN(T value) noexcept {
    return T(std::log(static_cast<double>(iec_unwrap(value))));
}

/**
 * LOG - Base-10 logarithm
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T LOG(T value) noexcept {
    return T(std::log10(static_cast<double>(iec_unwrap(value))));
}

/**
 * EXP - Exponential (e^x)
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T EXP(T value) noexcept {
    return T(std::exp(static_cast<double>(iec_unwrap(value))));
}

/**
 * EXPT - Exponentiation (base^exponent)
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T EXPT(T base, T exponent) noexcept {
    return T(std::pow(static_cast<double>(iec_unwrap(base)), static_cast<double>(iec_unwrap(exponent))));
}

// Mixed-type EXPT: allows e.g. EXPT(INT, REAL) → returns LREAL
template<typename T1, typename T2,
         typename = std::enable_if_t<!std::is_same_v<std::decay_t<T1>, std::decay_t<T2>>>>
inline IEC_LREAL EXPT(T1 base, T2 exponent) noexcept {
    return IEC_LREAL(std::pow(static_cast<double>(iec_unwrap(base)), static_cast<double>(iec_unwrap(exponent))));
}

// Same-type EXPT for non-REAL types (CODESYS extension: EXPT(INT, INT))
template<typename T,
    std::enable_if_t<(is_any_int_v<T> || is_any_bit_v<T>) && !is_any_real_v<T>, int> = 0>
inline IEC_LREAL EXPT(T base, T exponent) noexcept {
    return IEC_LREAL(std::pow(static_cast<double>(iec_unwrap(base)), static_cast<double>(iec_unwrap(exponent))));
}

// =============================================================================
// Trigonometric Functions (ANY_REAL -> ANY_REAL)
// =============================================================================

/**
 * SIN - Sine
 * Input: ANY_REAL (radians), Output: ANY_REAL
 */
template<typename T, enable_if_any_real<T> = 0>
inline T SIN(T value) noexcept {
    return T(std::sin(static_cast<double>(iec_unwrap(value))));
}

/**
 * COS - Cosine
 * Input: ANY_REAL (radians), Output: ANY_REAL
 */
template<typename T, enable_if_any_real<T> = 0>
inline T COS(T value) noexcept {
    return T(std::cos(static_cast<double>(iec_unwrap(value))));
}

/**
 * TAN - Tangent
 * Input: ANY_REAL (radians), Output: ANY_REAL
 */
template<typename T, enable_if_any_real<T> = 0>
inline T TAN(T value) noexcept {
    return T(std::tan(static_cast<double>(iec_unwrap(value))));
}

/**
 * ASIN - Arc sine
 * Input: ANY_REAL, Output: ANY_REAL (radians)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ASIN(T value) noexcept {
    return T(std::asin(static_cast<double>(iec_unwrap(value))));
}

/**
 * ACOS - Arc cosine
 * Input: ANY_REAL, Output: ANY_REAL (radians)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ACOS(T value) noexcept {
    return T(std::acos(static_cast<double>(iec_unwrap(value))));
}

/**
 * ATAN - Arc tangent
 * Input: ANY_REAL, Output: ANY_REAL (radians)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ATAN(T value) noexcept {
    return T(std::atan(static_cast<double>(iec_unwrap(value))));
}

/**
 * ATAN2 - Arc tangent of y/x (two-argument form)
 * Input: ANY_REAL, Output: ANY_REAL (radians between -PI and PI)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ATAN2(T y, T x) noexcept {
    return T(std::atan2(static_cast<double>(iec_unwrap(y)), static_cast<double>(iec_unwrap(x))));
}

/**
 * TRUNC - Truncate toward zero
 * Input: ANY_REAL, Output: ANY_REAL (integer part)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T TRUNC(T value) noexcept {
    return T(std::trunc(static_cast<double>(iec_unwrap(value))));
}

/**
 * ROUND - Round to nearest integer
 * Input: ANY_REAL, Output: ANY_REAL
 * Rounds half away from zero (banker's rounding not used)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ROUND(T value) noexcept {
    return T(std::round(static_cast<double>(iec_unwrap(value))));
}

// =============================================================================
// Selection Functions (ANY_ELEMENTARY for comparisons)
// =============================================================================

/**
 * SEL - Binary selection
 * Input: BOOL selector, ANY values, Output: ANY (same type as inputs)
 * Returns in1 if g is FALSE, in0 if g is TRUE
 */
template<typename T>
inline T SEL(IEC_BOOL g, T in0, T in1) noexcept {
    return iec_unwrap(g) ? in1 : in0;
}

/**
 * MAX - Maximum of two values
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline T MAX(T a, T b) noexcept {
    return iec_unwrap(a) > iec_unwrap(b) ? a : b;
}

/**
 * MIN - Minimum of two values
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline T MIN(T a, T b) noexcept {
    return iec_unwrap(a) < iec_unwrap(b) ? a : b;
}

/**
 * LIMIT - Limit value to range [mn, mx]
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline T LIMIT(T mn, T in, T mx) noexcept {
    if (iec_unwrap(in) < iec_unwrap(mn)) return mn;
    if (iec_unwrap(in) > iec_unwrap(mx)) return mx;
    return in;
}

// Mixed-type MIN/MAX/LIMIT/SEL overloads (OSCAT mixes e.g. INT with DINT)
template<typename T, typename U,
    std::enable_if_t<!std::is_same_v<std::decay_t<T>, std::decay_t<U>>, int> = 0>
inline auto MAX(T a, U b) noexcept {
    using CT = std::common_type_t<decltype(iec_unwrap(a)), decltype(iec_unwrap(b))>;
    auto va = static_cast<CT>(iec_unwrap(a));
    auto vb = static_cast<CT>(iec_unwrap(b));
    return va > vb ? va : vb;
}

template<typename T, typename U,
    std::enable_if_t<!std::is_same_v<std::decay_t<T>, std::decay_t<U>>, int> = 0>
inline auto MIN(T a, U b) noexcept {
    using CT = std::common_type_t<decltype(iec_unwrap(a)), decltype(iec_unwrap(b))>;
    auto va = static_cast<CT>(iec_unwrap(a));
    auto vb = static_cast<CT>(iec_unwrap(b));
    return va < vb ? va : vb;
}

template<typename T1, typename T2, typename T3>
inline auto LIMIT(T1 mn, T2 in, T3 mx) noexcept
    -> std::enable_if_t<
        !(std::is_same_v<std::decay_t<T1>, std::decay_t<T2>> &&
          std::is_same_v<std::decay_t<T2>, std::decay_t<T3>>),
        std::common_type_t<decltype(iec_unwrap(mn)), decltype(iec_unwrap(in)), decltype(iec_unwrap(mx))>> {
    using CT = std::common_type_t<decltype(iec_unwrap(mn)), decltype(iec_unwrap(in)), decltype(iec_unwrap(mx))>;
    auto vmn = static_cast<CT>(iec_unwrap(mn));
    auto vin = static_cast<CT>(iec_unwrap(in));
    auto vmx = static_cast<CT>(iec_unwrap(mx));
    if (vin < vmn) return vmn;
    if (vin > vmx) return vmx;
    return vin;
}

template<typename T, typename U,
    std::enable_if_t<!std::is_same_v<std::decay_t<T>, std::decay_t<U>>, int> = 0>
inline auto SEL(IEC_BOOL g, T in0, U in1) noexcept {
    using CT = std::common_type_t<decltype(iec_unwrap(in0)), decltype(iec_unwrap(in1))>;
    return iec_unwrap(g) ? static_cast<CT>(iec_unwrap(in1)) : static_cast<CT>(iec_unwrap(in0));
}

/**
 * MUX - Multiplexer (extensible — IEC 61131-3 minArgs=3, K + at least
 * two inputs).  Returns the input selected by the zero-based `k`:
 *
 *     MUX(0, A, B, C, D) == A
 *     MUX(2, A, B, C, D) == C
 *
 * The single-input terminator `MUX(k, in0)` exists only to anchor
 * the variadic recursion; callers should not invoke it directly
 * (the IEC contract requires K + ≥2 inputs).  When `k` is out of
 * range we fall through to the last input, matching the editor's
 * legacy 2-input behaviour and consistent with how CODESYS clamps
 * over-range selectors.
 */
template<typename T>
inline T MUX([[maybe_unused]] IEC_INT k, T in0) noexcept {
    return in0;
}

template<typename T, typename... Args>
inline T MUX(IEC_INT k, T in0, T in1, Args... rest) noexcept {
    if (iec_unwrap(k) == 0) return in0;
    return MUX(IEC_INT(iec_unwrap(k) - 1), in1, rest...);
}

// =============================================================================
// Comparison Functions (ANY_ELEMENTARY -> BOOL)
// =============================================================================

// Comparison operators take two arguments deduced independently — that way
// `LE(real_var, 0.0)` (where the literal is double / IEC_LREAL) and
// `EQ(my_int, 0)` (where the literal is int / IEC_INT) both type-check
// without forcing the caller to wrap every literal in a cast. Each side
// only has to land on an IEC elementary type after `iec_unwrap`; the
// comparison itself uses C++'s usual arithmetic conversions to find a
// common type.
//
// CONVERSION SEMANTICS — read this before writing cross-sign tests:
// Mixing signed and unsigned operands follows C++'s usual arithmetic
// conversions, not an IEC rule.
//
//   - When the unsigned operand has *lower* integer rank than `int`
//     (IEC_USINT, IEC_UINT — uint8/uint16), both sides are promoted to
//     `int` and the compare happens in signed land. No wrap.
//
//   - When the unsigned operand has rank >= `int` (IEC_UDINT, IEC_ULINT —
//     uint32/uint64) the signed operand converts to the unsigned type
//     and a negative value wraps to a large unsigned. So
//     `EQ(IEC_UDINT(0xFFFFFFFFu), -1)` is TRUE because -1 becomes
//     0xFFFFFFFF before the compare.
//
// STruC++ does not insert extra guards: IEC 61131-3 doesn't define
// cross-sign-class comparison, and we want the generated C++ to behave
// predictably under standard rules. If a project needs sign-strict
// comparisons, cast both sides to the same type before calling
// EQ/NE/LT/LE/GT/GE.
template<typename A, typename B>
using enable_if_two_elementary = std::enable_if_t<
    is_any_elementary_v<iec_underlying_type_t<std::decay_t<A>>> &&
        is_any_elementary_v<iec_underlying_type_t<std::decay_t<B>>>,
    int>;

/**
 * GT - Greater than
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename A, typename B, enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL GT(A a, B b) noexcept {
    return IEC_BOOL(iec_unwrap(a) > iec_unwrap(b));
}

/**
 * GE - Greater than or equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename A, typename B, enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL GE(A a, B b) noexcept {
    return IEC_BOOL(iec_unwrap(a) >= iec_unwrap(b));
}

/**
 * EQ - Equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename A, typename B, enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL EQ(A a, B b) noexcept {
    return IEC_BOOL(iec_unwrap(a) == iec_unwrap(b));
}

/**
 * LE - Less than or equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename A, typename B, enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL LE(A a, B b) noexcept {
    return IEC_BOOL(iec_unwrap(a) <= iec_unwrap(b));
}

/**
 * LT - Less than
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename A, typename B, enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL LT(A a, B b) noexcept {
    return IEC_BOOL(iec_unwrap(a) < iec_unwrap(b));
}

/**
 * NE - Not equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename A, typename B, enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL NE(A a, B b) noexcept {
    return IEC_BOOL(iec_unwrap(a) != iec_unwrap(b));
}

// ---------------------------------------------------------------------------
// Variadic chain forms for GT / GE / EQ / LE / LT / NE
// ---------------------------------------------------------------------------
//
// IEC 61131-3 defines the comparison functions as extensible:
// `GT(a, b, c)` means `(a > b) AND (b > c)`.  These overloads
// implement the chain semantic and live alongside the binary forms
// above so the codegen can emit the same C++ name for any arity.
//
// Same heterogeneous-type signature as the binary forms — every
// adjacent pair goes through `iec_unwrap` independently so mixed
// IECVar / underlying types compare cleanly.

template<typename A, typename B, typename C, typename... Rest,
         enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL GT(A a, B b, C c, Rest... rest) noexcept {
    if (!(iec_unwrap(a) > iec_unwrap(b))) return IEC_BOOL(false);
    return GT(b, c, rest...);
}

template<typename A, typename B, typename C, typename... Rest,
         enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL GE(A a, B b, C c, Rest... rest) noexcept {
    if (!(iec_unwrap(a) >= iec_unwrap(b))) return IEC_BOOL(false);
    return GE(b, c, rest...);
}

template<typename A, typename B, typename C, typename... Rest,
         enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL EQ(A a, B b, C c, Rest... rest) noexcept {
    if (!(iec_unwrap(a) == iec_unwrap(b))) return IEC_BOOL(false);
    return EQ(b, c, rest...);
}

template<typename A, typename B, typename C, typename... Rest,
         enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL LE(A a, B b, C c, Rest... rest) noexcept {
    if (!(iec_unwrap(a) <= iec_unwrap(b))) return IEC_BOOL(false);
    return LE(b, c, rest...);
}

template<typename A, typename B, typename C, typename... Rest,
         enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL LT(A a, B b, C c, Rest... rest) noexcept {
    if (!(iec_unwrap(a) < iec_unwrap(b))) return IEC_BOOL(false);
    return LT(b, c, rest...);
}

template<typename A, typename B, typename C, typename... Rest,
         enable_if_two_elementary<A, B> = 0>
inline IEC_BOOL NE(A a, B b, C c, Rest... rest) noexcept {
    if (!(iec_unwrap(a) != iec_unwrap(b))) return IEC_BOOL(false);
    return NE(b, c, rest...);
}

// =============================================================================
// Bit Shift Functions (ANY_BIT -> ANY_BIT)
// =============================================================================

/**
 * SHL - Shift left
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T SHL(T in, IEC_INT n) noexcept {
    auto shift = iec_unwrap(n);
    if (shift <= 0) return shift == 0 ? in : T(0);
    return T(iec_unwrap(in) << shift);
}

// Mixed-type shift count overloads (OSCAT uses various integer types for shift amount)
template<typename T, typename N,
    enable_if_any_bit<T> = 0,
    std::enable_if_t<!std::is_same_v<std::decay_t<N>, IEC_INT>, int> = 0>
inline T SHL(T in, N n) noexcept {
    auto shift = static_cast<int>(iec_unwrap(n));
    if (shift <= 0) return shift == 0 ? in : T(0);
    return T(iec_unwrap(in) << shift);
}

/**
 * SHR - Shift right
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T SHR(T in, IEC_INT n) noexcept {
    auto shift = iec_unwrap(n);
    if (shift <= 0) return shift == 0 ? in : T(0);
    return T(iec_unwrap(in) >> shift);
}

// Mixed-type shift count overloads
template<typename T, typename N,
    enable_if_any_bit<T> = 0,
    std::enable_if_t<!std::is_same_v<std::decay_t<N>, IEC_INT>, int> = 0>
inline T SHR(T in, N n) noexcept {
    auto shift = static_cast<int>(iec_unwrap(n));
    if (shift <= 0) return shift == 0 ? in : T(0);
    return T(iec_unwrap(in) >> shift);
}

// SHL/SHR for signed integer types (CODESYS extension, used by OSCAT)
// IEC standard restricts to ANY_BIT, but CODESYS allows ANY_INT
template<typename T, typename N,
    std::enable_if_t<is_any_int_v<T> && !is_any_bit_v<T>, int> = 0>
inline T SHL(T in, N n) noexcept {
    auto shift = static_cast<int>(iec_unwrap(n));
    if (shift <= 0) return shift == 0 ? in : T(0);
    using UT = std::make_unsigned_t<iec_underlying_type_t<T>>;
    return T(static_cast<iec_underlying_type_t<T>>(
        static_cast<UT>(iec_unwrap(in)) << shift));
}

template<typename T, typename N,
    std::enable_if_t<is_any_int_v<T> && !is_any_bit_v<T>, int> = 0>
inline T SHR(T in, N n) noexcept {
    auto shift = static_cast<int>(iec_unwrap(n));
    if (shift <= 0) return shift == 0 ? in : T(0);
    return T(iec_unwrap(in) >> shift);
}

/**
 * ROL - Rotate left
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T ROL(T in, IEC_INT n) noexcept {
    constexpr int bits = sizeof(iec_underlying_type_t<T>) * 8;
    auto v = iec_unwrap(in);
    auto shift = iec_unwrap(n) % bits;
    if (shift < 0) shift += bits; // IEC 61131-3: negative N reverses direction
    if (shift == 0) return in;
    return T((v << shift) | (v >> (bits - shift)));
}

// Mixed-type rotate overloads
template<typename T, typename N,
    enable_if_any_bit<T> = 0,
    std::enable_if_t<!std::is_same_v<std::decay_t<N>, IEC_INT>, int> = 0>
inline T ROL(T in, N n) noexcept {
    constexpr int bits = sizeof(iec_underlying_type_t<T>) * 8;
    auto v = iec_unwrap(in);
    auto shift = static_cast<int>(iec_unwrap(n)) % bits;
    if (shift < 0) shift += bits; // IEC 61131-3: negative N reverses direction
    if (shift == 0) return in;
    return T((v << shift) | (v >> (bits - shift)));
}

/**
 * ROR - Rotate right
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T ROR(T in, IEC_INT n) noexcept {
    constexpr int bits = sizeof(iec_underlying_type_t<T>) * 8;
    auto v = iec_unwrap(in);
    auto shift = iec_unwrap(n) % bits;
    if (shift < 0) shift += bits; // IEC 61131-3: negative N reverses direction
    if (shift == 0) return in;
    return T((v >> shift) | (v << (bits - shift)));
}

// Mixed-type rotate overloads
template<typename T, typename N,
    enable_if_any_bit<T> = 0,
    std::enable_if_t<!std::is_same_v<std::decay_t<N>, IEC_INT>, int> = 0>
inline T ROR(T in, N n) noexcept {
    constexpr int bits = sizeof(iec_underlying_type_t<T>) * 8;
    auto v = iec_unwrap(in);
    auto shift = static_cast<int>(iec_unwrap(n)) % bits;
    if (shift < 0) shift += bits; // IEC 61131-3: negative N reverses direction
    if (shift == 0) return in;
    return T((v >> shift) | (v << (bits - shift)));
}

// =============================================================================
// Type Conversion Functions
// =============================================================================

/**
 * Helper: round-then-cast for REAL→integer conversions per IEC 61131-3
 */
template<typename ToVal, typename FromVal>
inline ToVal iec_convert_value(FromVal value) noexcept {
    // IEC 61131-3: REAL/LREAL to integer types use rounding (nearest)
    if constexpr (std::is_floating_point_v<FromVal> && std::is_integral_v<ToVal>) {
        return static_cast<ToVal>(std::round(static_cast<double>(value)));
    } else {
        return static_cast<ToVal>(value);
    }
}

/**
 * Generic type conversion (IECVar → IECVar)
 */
template<typename To, typename From>
inline auto CONVERT(From value) noexcept
    -> std::enable_if_t<!std::is_arithmetic_v<From>, To> {
    return To(iec_convert_value<typename To::value_type>(iec_unwrap(value)));
}

/**
 * Generic type conversion (arithmetic → IECVar)
 */
template<typename To, typename From>
inline auto CONVERT(From value) noexcept
    -> std::enable_if_t<std::is_arithmetic_v<From>, To> {
    return To(iec_convert_value<typename To::value_type>(value));
}

// Specific conversion functions (aliases for clarity)
template<typename T> inline IEC_BOOL TO_BOOL(T v) noexcept { return CONVERT<IEC_BOOL>(v); }
template<typename T> inline IEC_SINT TO_SINT(T v) noexcept { return CONVERT<IEC_SINT>(v); }
template<typename T> inline IEC_INT TO_INT(T v) noexcept { return CONVERT<IEC_INT>(v); }
template<typename T> inline IEC_DINT TO_DINT(T v) noexcept { return CONVERT<IEC_DINT>(v); }
template<typename T> inline IEC_LINT TO_LINT(T v) noexcept { return CONVERT<IEC_LINT>(v); }
template<typename T> inline IEC_USINT TO_USINT(T v) noexcept { return CONVERT<IEC_USINT>(v); }
template<typename T> inline IEC_UINT TO_UINT(T v) noexcept { return CONVERT<IEC_UINT>(v); }
template<typename T> inline IEC_UDINT TO_UDINT(T v) noexcept { return CONVERT<IEC_UDINT>(v); }
template<typename T> inline IEC_ULINT TO_ULINT(T v) noexcept { return CONVERT<IEC_ULINT>(v); }
template<typename T> inline IEC_REAL TO_REAL(T v) noexcept { return CONVERT<IEC_REAL>(v); }
template<typename T> inline IEC_LREAL TO_LREAL(T v) noexcept { return CONVERT<IEC_LREAL>(v); }
template<typename T> inline IEC_BYTE TO_BYTE(T v) noexcept { return CONVERT<IEC_BYTE>(v); }
template<typename T> inline IEC_WORD TO_WORD(T v) noexcept { return CONVERT<IEC_WORD>(v); }
template<typename T> inline IEC_DWORD TO_DWORD(T v) noexcept { return CONVERT<IEC_DWORD>(v); }
template<typename T> inline IEC_LWORD TO_LWORD(T v) noexcept { return CONVERT<IEC_LWORD>(v); }

// Time/Date conversion functions
// All time types are int64_t aliases, so IEC_TIME/IEC_DATE/IEC_TOD/IEC_DT
// are all IECVar<int64_t>. We use a single template for each target type.
// OSCAT calls TO_TIME with integer values (ms) — we convert ms → ns.
// For TIME→TIME (same underlying type), the static_cast is identity and
// the multiply still applies, but this matches CODESYS behavior where
// integer values passed to TO_TIME are treated as milliseconds.

template<typename T> inline IEC_TIME TO_TIME(T v) noexcept {
    // If the input is already an IECVar<int64_t> (TIME/DATE/DT/TOD), this
    // treats the raw nanosecond value as milliseconds — but in practice
    // OSCAT only calls TO_TIME on integer types, not on TIME values.
    return IEC_TIME(static_cast<TIME_t>(iec_unwrap(v)) * 1000000);
}

template<typename T> inline IEC_DATE TO_DATE(T v) noexcept {
    return IEC_DATE(static_cast<DATE_t>(iec_unwrap(v)));
}

template<typename T> inline IEC_DT TO_DT(T v) noexcept {
    return IEC_DT(static_cast<DT_t>(iec_unwrap(v)));
}

template<typename T> inline IEC_TOD TO_TOD(T v) noexcept {
    return IEC_TOD(static_cast<TOD_t>(iec_unwrap(v)));
}

// ---------------------------------------------------------------------------
// STRING -> TIME / TOD / DATE / DT parsing
//
// The frontend lowers STRING_TO_TIME / STRING_TO_TOD / STRING_TO_DATE /
// STRING_TO_DT to TO_TIME / TO_TOD / TO_DATE / TO_DT. The numeric overloads
// above treat their argument as a raw count; the string overloads below PARSE
// the textual IEC literal (used by e.g. OSCAT's TIMER_EVENT_DECODE). Formats,
// each with an optional `PREFIX#`:
//   TIME : [T#]  (<num>(d|h|m|s|ms|us|ns))+        -> nanoseconds
//   TOD  : [TOD#] HH:MM[:SS[.fff]]                 -> ns since midnight
//   DATE : [D#] YYYY-MM-DD                         -> days since 1970-01-01
//   DT   : [DT#] YYYY-MM-DD-HH:MM[:SS[.fff]]       -> ns since the Unix epoch
// Lenient and exception-free (AVR-safe); unparseable input yields 0.
namespace iec_strparse {

// Skip a leading `IDENT#` literal prefix (e.g. "T#", "TOD#") if present.
inline const char* skip_literal_prefix(const char* s) noexcept {
    for (const char* p = s; *p; ++p) {
        if (*p == '#') return p + 1;
        const char c = *p;
        const bool idish = c == '_' || (c >= '0' && c <= '9') ||
                           (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
        if (!idish) break;
    }
    return s;
}

inline int64_t parse_time_ns(const char* s) noexcept {
    s = skip_literal_prefix(s);
    int64_t total = 0;
    while (*s) {
        char* end = nullptr;
        const double val = std::strtod(s, &end);
        if (end == s) { ++s; continue; }
        s = end;
        const char u0 = (*s >= 'A' && *s <= 'Z') ? static_cast<char>(*s + 32) : *s;
        const char u1 =
            (s[0] && s[1] >= 'A' && s[1] <= 'Z') ? static_cast<char>(s[1] + 32) : s[1];
        int64_t mult = 1000000LL; // default unit: milliseconds
        if (u0 == 'm' && u1 == 's') { mult = 1000000LL; s += 2; }
        else if (u0 == 'u' && u1 == 's') { mult = 1000LL; s += 2; }
        else if (u0 == 'n' && u1 == 's') { mult = 1LL; s += 2; }
        else if (u0 == 'd') { mult = 86400000000000LL; s += 1; }
        else if (u0 == 'h') { mult = 3600000000000LL; s += 1; }
        else if (u0 == 'm') { mult = 60000000000LL; s += 1; }
        else if (u0 == 's') { mult = 1000000000LL; s += 1; }
        total += static_cast<int64_t>(val * static_cast<double>(mult));
    }
    return total;
}

inline void read_int(const char*& s, long long& out) noexcept {
    char* end = nullptr;
    out = std::strtoll(s, &end, 10);
    if (end != s) s = end;
}

inline int64_t parse_tod_ns(const char* s) noexcept {
    s = skip_literal_prefix(s);
    long long hh = 0, mm = 0, ss = 0;
    double frac = 0;
    read_int(s, hh);
    if (*s == ':') { ++s; read_int(s, mm); }
    if (*s == ':') { ++s; read_int(s, ss); }
    if (*s == '.') { char* e = nullptr; frac = std::strtod(s, &e); if (e != s) s = e; }
    return hh * 3600000000000LL + mm * 60000000000LL + ss * 1000000000LL +
           static_cast<int64_t>(frac * 1e9);
}

// Days from 1970-01-01 for a proleptic-Gregorian date (Hinnant's algorithm).
inline int64_t days_from_civil(long long y, long long m, long long d) noexcept {
    y -= (m <= 2);
    const long long era = (y >= 0 ? y : y - 399) / 400;
    const long long yoe = y - era * 400;
    const long long doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
    const long long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + doe - 719468;
}

inline int64_t parse_date_days(const char* s) noexcept {
    s = skip_literal_prefix(s);
    long long y = 0, mo = 0, d = 0;
    read_int(s, y);
    if (*s == '-') { ++s; read_int(s, mo); }
    if (*s == '-') { ++s; read_int(s, d); }
    return days_from_civil(y, mo ? mo : 1, d ? d : 1);
}

inline int64_t parse_dt_ns(const char* s) noexcept {
    s = skip_literal_prefix(s);
    long long y = 0, mo = 0, d = 0, hh = 0, mm = 0, ss = 0;
    read_int(s, y);
    if (*s == '-') { ++s; read_int(s, mo); }
    if (*s == '-') { ++s; read_int(s, d); }
    if (*s == '-') { ++s; read_int(s, hh); }
    if (*s == ':') { ++s; read_int(s, mm); }
    if (*s == ':') { ++s; read_int(s, ss); }
    return days_from_civil(y, mo ? mo : 1, d ? d : 1) * 86400000000000LL +
           hh * 3600000000000LL + mm * 60000000000LL + ss * 1000000000LL;
}

} // namespace iec_strparse

// String overloads (more specialized than the numeric TO_* templates, so they
// win overload resolution for STRING arguments).
template<size_t N> inline IEC_TIME TO_TIME(const IECString<N>& s) noexcept { return IEC_TIME(iec_strparse::parse_time_ns(s.c_str())); }
template<size_t N> inline IEC_TIME TO_TIME(const IECStringVar<N>& s) noexcept { return IEC_TIME(iec_strparse::parse_time_ns(s.get().c_str())); }
template<size_t N> inline IEC_TOD TO_TOD(const IECString<N>& s) noexcept { return IEC_TOD(iec_strparse::parse_tod_ns(s.c_str())); }
template<size_t N> inline IEC_TOD TO_TOD(const IECStringVar<N>& s) noexcept { return IEC_TOD(iec_strparse::parse_tod_ns(s.get().c_str())); }
template<size_t N> inline IEC_DATE TO_DATE(const IECString<N>& s) noexcept { return IEC_DATE(iec_strparse::parse_date_days(s.c_str())); }
template<size_t N> inline IEC_DATE TO_DATE(const IECStringVar<N>& s) noexcept { return IEC_DATE(iec_strparse::parse_date_days(s.get().c_str())); }
template<size_t N> inline IEC_DT TO_DT(const IECString<N>& s) noexcept { return IEC_DT(iec_strparse::parse_dt_ns(s.c_str())); }
template<size_t N> inline IEC_DT TO_DT(const IECStringVar<N>& s) noexcept { return IEC_DT(iec_strparse::parse_dt_ns(s.get().c_str())); }

// =============================================================================
// String / Wide String Conversion
// =============================================================================
//
// STRING ↔ WSTRING per IEC 61131-3 §6.5.4.6: codepoint-by-codepoint
// transcoding. Anything outside the BMP would require surrogate
// handling that the runtime does not implement; OpenPLC programs in
// practice deal in 7-bit ASCII or simple Latin-1, so a lossy narrow
// (truncate the high byte) is documented behaviour rather than a
// surprise. Callers that need full Unicode round-tripping should keep
// data in WSTRING throughout.

template<size_t SrcLen>
inline IECWString<SrcLen> STRING_TO_WSTRING(const IECString<SrcLen>& src) noexcept {
    IECWString<SrcLen> result;
    const size_t n = src.length();
    for (size_t i = 0; i < n; ++i) {
        // Treat each STRING byte as a codepoint in the U+0000–U+00FF
        // range. Multi-byte UTF-8 sequences pass through byte-for-byte
        // and end up as Latin-1 — wrong for non-ASCII, but the IEC
        // standard doesn't define UTF-8/UTF-16 transcoding either.
        result.append(static_cast<char16_t>(static_cast<unsigned char>(src[i])));
    }
    return result;
}

// Overload for the per-variable wrapper (handles auto-unwrap).
template<size_t SrcLen>
inline IECWString<SrcLen> STRING_TO_WSTRING(const IECStringVar<SrcLen>& src) noexcept {
    return STRING_TO_WSTRING(iec_unwrap(src));
}

template<size_t SrcLen>
inline IECString<SrcLen> WSTRING_TO_STRING(const IECWString<SrcLen>& src) noexcept {
    IECString<SrcLen> result;
    const size_t n = src.length();
    for (size_t i = 0; i < n; ++i) {
        // Truncate to the low byte. Codepoints > U+00FF lose
        // information; surrogate pairs (rare in IEC programs) collapse
        // to garbage. Document as "ASCII / Latin-1 only" round-trip.
        result.append(static_cast<char>(src[i] & 0xFF));
    }
    return result;
}

template<size_t SrcLen>
inline IECString<SrcLen> WSTRING_TO_STRING(const IECWStringVar<SrcLen>& src) noexcept {
    return WSTRING_TO_STRING(iec_unwrap(src));
}

// `*_TO_*` resolution in the frontend collapses STRING_TO_WSTRING /
// WSTRING_TO_STRING to plain TO_WSTRING / TO_STRING calls (cppName is
// `TO_${toType}`), so provide the matching aliases. Templated on the
// source type so they bind to either the bare class or the *Var
// wrapper without relying on conversions.

template<typename T>
inline auto TO_WSTRING(const T& src) noexcept -> decltype(STRING_TO_WSTRING(src)) {
    return STRING_TO_WSTRING(src);
}

template<typename T>
inline auto TO_STRING(const T& src) noexcept -> decltype(WSTRING_TO_STRING(src)) {
    return WSTRING_TO_STRING(src);
}

// =============================================================================
// WSTRING → Numeric Conversions
// =============================================================================
//
// IEC 61131-3: WSTRING_TO_INT / WSTRING_TO_REAL / etc. all route through
// WSTRING_TO_STRING (lossy narrow-to-ASCII; same caveat the standard
// transcoding helpers document) and then reuse the STRING parsers
// already defined in iec_string.hpp.  This keeps the parsing semantics
// (strtoul / strtol / strtod) byte-identical between the STRING and
// WSTRING surfaces, and the narrow conversion is correct for the
// numeric ASCII / Latin-1 subset users actually write into STRING
// literals.

template<size_t N>
inline IEC_BOOL TO_BOOL(const IECWString<N>& s) noexcept {
    return TO_BOOL(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_BOOL TO_BOOL(const IECWStringVar<N>& s) noexcept {
    return TO_BOOL(s.get());
}

template<size_t N>
inline IEC_SINT TO_SINT(const IECWString<N>& s) noexcept {
    return TO_SINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_SINT TO_SINT(const IECWStringVar<N>& s) noexcept {
    return TO_SINT(s.get());
}

template<size_t N>
inline IEC_INT TO_INT(const IECWString<N>& s) noexcept {
    return TO_INT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_INT TO_INT(const IECWStringVar<N>& s) noexcept {
    return TO_INT(s.get());
}

template<size_t N>
inline IEC_DINT TO_DINT(const IECWString<N>& s) noexcept {
    return TO_DINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_DINT TO_DINT(const IECWStringVar<N>& s) noexcept {
    return TO_DINT(s.get());
}

template<size_t N>
inline IEC_LINT TO_LINT(const IECWString<N>& s) noexcept {
    return TO_LINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_LINT TO_LINT(const IECWStringVar<N>& s) noexcept {
    return TO_LINT(s.get());
}

template<size_t N>
inline IEC_USINT TO_USINT(const IECWString<N>& s) noexcept {
    return TO_USINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_USINT TO_USINT(const IECWStringVar<N>& s) noexcept {
    return TO_USINT(s.get());
}

template<size_t N>
inline IEC_UINT TO_UINT(const IECWString<N>& s) noexcept {
    return TO_UINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_UINT TO_UINT(const IECWStringVar<N>& s) noexcept {
    return TO_UINT(s.get());
}

template<size_t N>
inline IEC_UDINT TO_UDINT(const IECWString<N>& s) noexcept {
    return TO_UDINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_UDINT TO_UDINT(const IECWStringVar<N>& s) noexcept {
    return TO_UDINT(s.get());
}

template<size_t N>
inline IEC_ULINT TO_ULINT(const IECWString<N>& s) noexcept {
    return TO_ULINT(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_ULINT TO_ULINT(const IECWStringVar<N>& s) noexcept {
    return TO_ULINT(s.get());
}

template<size_t N>
inline IEC_REAL TO_REAL(const IECWString<N>& s) noexcept {
    return TO_REAL(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_REAL TO_REAL(const IECWStringVar<N>& s) noexcept {
    return TO_REAL(s.get());
}

template<size_t N>
inline IEC_LREAL TO_LREAL(const IECWString<N>& s) noexcept {
    return TO_LREAL(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_LREAL TO_LREAL(const IECWStringVar<N>& s) noexcept {
    return TO_LREAL(s.get());
}

template<size_t N>
inline IEC_BYTE TO_BYTE(const IECWString<N>& s) noexcept {
    return TO_BYTE(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_BYTE TO_BYTE(const IECWStringVar<N>& s) noexcept {
    return TO_BYTE(s.get());
}

template<size_t N>
inline IEC_WORD TO_WORD(const IECWString<N>& s) noexcept {
    return TO_WORD(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_WORD TO_WORD(const IECWStringVar<N>& s) noexcept {
    return TO_WORD(s.get());
}

template<size_t N>
inline IEC_DWORD TO_DWORD(const IECWString<N>& s) noexcept {
    return TO_DWORD(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_DWORD TO_DWORD(const IECWStringVar<N>& s) noexcept {
    return TO_DWORD(s.get());
}

template<size_t N>
inline IEC_LWORD TO_LWORD(const IECWString<N>& s) noexcept {
    return TO_LWORD(WSTRING_TO_STRING(s));
}
template<size_t N>
inline IEC_LWORD TO_LWORD(const IECWStringVar<N>& s) noexcept {
    return TO_LWORD(s.get());
}

// =============================================================================
// Time Utilities
// =============================================================================

/**
 * Create a TIME value from milliseconds
 */
inline IEC_TIME TIME_FROM_MS(int64_t ms) noexcept {
    return IEC_TIME(ms * 1000000); // Convert to nanoseconds
}

/**
 * Create a TIME value from seconds
 */
inline IEC_TIME TIME_FROM_S(double s) noexcept {
    return IEC_TIME(static_cast<int64_t>(s * 1000000000.0));
}

/**
 * Get milliseconds from a TIME value
 */
inline int64_t TIME_TO_MS(IEC_TIME t) noexcept {
    return iec_unwrap(t) / 1000000;
}

/**
 * Get seconds from a TIME value
 */
inline double TIME_TO_S(IEC_TIME t) noexcept {
    return static_cast<double>(iec_unwrap(t)) / 1000000000.0;
}

// =============================================================================
// Variadic Arithmetic Functions (ANY_NUM -> ANY_NUM)
// =============================================================================

/**
 * NEG - Negation (unary minus)
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 */
template<typename T, enable_if_any_num<T> = 0>
inline T NEG(T value) noexcept {
    return T(-iec_unwrap(value));
}

/**
 * ADD - Addition (variadic)
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Adds two or more values together
 */
template<typename T, enable_if_any_num<T> = 0>
inline T ADD(T a, T b) noexcept {
    return T(iec_unwrap(a) + iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_num<T> = 0>
inline T ADD(T first, T second, Args... rest) noexcept {
    return ADD(T(iec_unwrap(first) + iec_unwrap(second)), rest...);
}

/**
 * MUL - Multiplication (variadic)
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Multiplies two or more values together
 */
template<typename T, enable_if_any_num<T> = 0>
inline T MUL(T a, T b) noexcept {
    return T(iec_unwrap(a) * iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_num<T> = 0>
inline T MUL(T first, T second, Args... rest) noexcept {
    return MUL(T(iec_unwrap(first) * iec_unwrap(second)), rest...);
}

/**
 * SUB - Subtraction
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Subtracts second value from first
 */
template<typename T, enable_if_any_num<T> = 0>
inline T SUB(T a, T b) noexcept {
    return T(iec_unwrap(a) - iec_unwrap(b));
}

/**
 * DIV - Division
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Divides first value by second
 */
template<typename T, enable_if_any_num<T> = 0>
inline T DIV(T a, T b) noexcept {
    return T(iec_unwrap(a) / iec_unwrap(b));
}

/**
 * MOD - Modulo
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Returns remainder of division
 */
template<typename T, enable_if_any_num<T> = 0>
inline T MOD(T a, T b) noexcept {
    if constexpr (std::is_floating_point_v<iec_underlying_type_t<T>>) {
        return T(std::fmod(static_cast<double>(iec_unwrap(a)), static_cast<double>(iec_unwrap(b))));
    } else {
        return T(iec_unwrap(a) % iec_unwrap(b));
    }
}

// =============================================================================
// Variadic Bitwise Functions (ANY_BIT -> ANY_BIT)
// =============================================================================

/**
 * NOT - Bitwise NOT (one's complement)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 *
 * BOOL needs logical negation, not bitwise: `~bool(true)` integer-promotes
 * to `~1 == -2`, and converting back via `bool(-2)` is `true` (any non-zero
 * is true), so the bitwise path returns `true` for both inputs. The
 * IEC_BOOL specialization handles wrapped booleans, but expressions like
 * `NOT(a == b)` instantiate the primary template with `T = bool` (raw)
 * because IECVar's comparison operators return plain `bool`. Add a
 * raw-bool specialization that uses `!` so NOT(comparison) works.
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T NOT(T value) noexcept {
    return T(~iec_unwrap(value));
}

template<>
inline bool NOT(bool value) noexcept {
    return !value;
}

template<>
inline IEC_BOOL NOT(IEC_BOOL value) noexcept {
    return IEC_BOOL(!iec_unwrap(value));
}

/**
 * AND - Bitwise AND (variadic)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T AND(T a, T b) noexcept {
    return T(iec_unwrap(a) & iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_bit<T> = 0>
inline T AND(T first, T second, Args... rest) noexcept {
    return AND(T(iec_unwrap(first) & iec_unwrap(second)), rest...);
}

/**
 * OR - Bitwise OR (variadic)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T OR(T a, T b) noexcept {
    return T(iec_unwrap(a) | iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_bit<T> = 0>
inline T OR(T first, T second, Args... rest) noexcept {
    return OR(T(iec_unwrap(first) | iec_unwrap(second)), rest...);
}

/**
 * XOR - Bitwise XOR (variadic)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T XOR(T a, T b) noexcept {
    return T(iec_unwrap(a) ^ iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_bit<T> = 0>
inline T XOR(T first, T second, Args... rest) noexcept {
    return XOR(T(iec_unwrap(first) ^ iec_unwrap(second)), rest...);
}

// =============================================================================
// Variadic Selection Functions (ANY_ELEMENTARY)
// =============================================================================

/**
 * MAX - Maximum (variadic)
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 * Returns the maximum of two or more values
 */
template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline T MAX(T first, T second, Args... rest) noexcept {
    T current_max = iec_unwrap(first) > iec_unwrap(second) ? first : second;
    if constexpr (sizeof...(rest) > 0) {
        return MAX(current_max, rest...);
    } else {
        return current_max;
    }
}

/**
 * MIN - Minimum (variadic)
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 * Returns the minimum of two or more values
 */
template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline T MIN(T first, T second, Args... rest) noexcept {
    T current_min = iec_unwrap(first) < iec_unwrap(second) ? first : second;
    if constexpr (sizeof...(rest) > 0) {
        return MIN(current_min, rest...);
    } else {
        return current_min;
    }
}

/**
 * MOVE - Copy value (identity function)
 * Input: ANY, Output: ANY (same type)
 * Used for explicit value copying in ST
 */
template<typename T>
inline T MOVE(T value) noexcept {
    return value;
}

// =============================================================================
// Scan-Cycle Time (CODESYS/MatIEC-compatible)
// =============================================================================

/**
 * Global scan-cycle time in nanoseconds.
 * Advanced by the runtime before each scan cycle.
 * - REPL advances by common_ticktime each cycle.
 * - OpenPLC runtime advances before each task execution.
 * - Test runner resets to 0 before each test case.
 *
 * All calls to TIME() within the same cycle return the same value,
 * matching CODESYS behavior.
 */
inline int64_t __CURRENT_TIME_NS = 0;

/**
 * Returns the current scan-cycle time.
 * CODESYS-compatible: TIME() returns the same value for the entire cycle.
 */
inline IEC_TIME TIME() {
    return IEC_TIME(static_cast<TIME_t>(__CURRENT_TIME_NS));
}

/**
 * Wall-clock date-and-time override slot, in nanoseconds since the
 * Unix epoch.
 *
 * Platform integrations that *can* deliver real wall-clock time
 * (VPP packages with a DS3231 RTC chip wired up, Wi-Fi targets that
 * pull NTP, etc.) populate this before each scan and CURRENT_DT()
 * returns it verbatim. Targets without that capability leave it at 0
 * and CURRENT_DT() falls back to a meaningful-but-not-wall-clock
 * value — see the function comment for the full priority order.
 */
inline int64_t __CURRENT_DT_NS = 0;

/**
 * CURRENT_DT() — wall-clock date-and-time.
 *
 * Returns the current absolute time as IEC_DT (nanoseconds since the
 * Unix epoch). Distinct from TIME() which returns the scan-cycle's
 * monotonic elapsed time, not a date.
 *
 * Used by the Additional Function Blocks library's RTC FB, which under
 * MatIEC consumed a `__CURRENT_TIME` global the runtime injected before
 * each scan. STruC++ exposes the same capability through this regular
 * function so RTC's body can call it without compiler-specific pragmas.
 *
 * Resolution priority (highest first):
 *   1. `__CURRENT_DT_NS` when non-zero — the platform integration
 *      delivered a real wall-clock value (RTC chip, NTP, host syscall
 *      wired by an OpenPLC v4 runtime, etc.). Honoured on every
 *      target.
 *   2. std::chrono::system_clock on hosted targets — covers REPL, test
 *      runner, and any g++ build that didn't populate
 *      `__CURRENT_DT_NS`. Inherits CLOCK_REALTIME's quirks (can step
 *      backwards if the system clock is corrected); code needing
 *      strict monotonicity should use TIME() instead.
 *   3. `__CURRENT_TIME_NS` (time since program start) on bare-metal
 *      targets where std::chrono::system_clock isn't available.
 *      avr-gcc's libstdc++ ships `<chrono>` but omits `system_clock`,
 *      so we can't reach for it on Arduino / AVR. Returning uptime
 *      keeps the IEC_DT value monotonically advancing — programs that
 *      diff two CURRENT_DT() readings still see meaningful elapsed
 *      time, just expressed in seconds-since-boot rather than seconds-
 *      since-1970.
 *
 * VPP packages targeting hardware with an RTC override (1) by writing
 * `__CURRENT_DT_NS` from their platform glue. Nothing else in the
 * runtime needs to change to enable that path.
 */
inline IEC_DT CURRENT_DT() {
    if (__CURRENT_DT_NS != 0) {
        return IEC_DT(static_cast<DT_t>(__CURRENT_DT_NS));
    }
#ifdef __AVR__
    // No system_clock on avr-gcc. `__CURRENT_TIME_NS` advances
    // monotonically as the runtime drives the scan cycle, giving us
    // time-since-boot — meaningful for diffing timestamps even when
    // no RTC is wired up.
    return IEC_DT(static_cast<DT_t>(__CURRENT_TIME_NS));
#else
    using namespace std::chrono;
    auto now = system_clock::now();
    auto ns  = duration_cast<nanoseconds>(now.time_since_epoch()).count();
    return IEC_DT(static_cast<DT_t>(ns));
#endif
}

// =============================================================================
// CODESYS System Functions
// =============================================================================

/**
 * ADR(variable) - Returns the memory address of a variable.
 * CODESYS extension. Maps to address-of in C++, returning uintptr_t
 * for compatibility with pointer arithmetic.
 */
template<typename T>
inline IEC_ULINT ADR(T& var) {
    return static_cast<IEC_ULINT>(reinterpret_cast<std::uintptr_t>(&var));
}

/**
 * IEC_SIZEOF(var) - Returns the logical IEC type size in bytes.
 * For IECVar<T> types, returns sizeof(T) (the underlying type),
 * not sizeof(IECVar<T>) which includes the forcing wrapper overhead.
 * Matches CODESYS SIZEOF behavior: SIZEOF(INT) = 2, SIZEOF(DINT) = 4, etc.
 */
template<typename T>
inline IEC_UDINT IEC_SIZEOF(const IECVar<T>&) noexcept {
    return static_cast<IEC_UDINT>(sizeof(T));
}
template<typename T>
inline IEC_UDINT IEC_SIZEOF(const T&) noexcept {
    return static_cast<IEC_UDINT>(sizeof(T));
}

/**
 * MEMCPY(dest, src, n) - Copies n bytes from src to dest.
 * CODESYS extension. Accepts uintptr_t addresses from ADR() for
 * pointer arithmetic compatibility.
 */
inline IEC_ULINT MEMCPY(IEC_ULINT dest, IEC_ULINT src, std::size_t n) {
    std::memcpy(reinterpret_cast<void*>(static_cast<std::uintptr_t>(dest)),
                reinterpret_cast<const void*>(static_cast<std::uintptr_t>(src)), n);
    return dest;
}

} // namespace strucpp
