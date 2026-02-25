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
#include <cmath>
#include <algorithm>
#include <cstddef>
#include <cstring>
#include <type_traits>

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
 * MUX - Multiplexer (select from multiple inputs)
 * Input: ANY_INT selector, ANY values, Output: ANY (same type as inputs)
 * Note: This is a simplified 2-input version.
 */
template<typename T>
inline T MUX(IEC_INT k, T in0, T in1) noexcept {
    return iec_unwrap(k) == 0 ? in0 : in1;
}

// =============================================================================
// Comparison Functions (ANY_ELEMENTARY -> BOOL)
// =============================================================================

/**
 * GT - Greater than
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GT(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) > iec_unwrap(b));
}

/**
 * GE - Greater than or equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GE(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) >= iec_unwrap(b));
}

/**
 * EQ - Equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL EQ(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) == iec_unwrap(b));
}

/**
 * LE - Less than or equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LE(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) <= iec_unwrap(b));
}

/**
 * LT - Less than
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LT(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) < iec_unwrap(b));
}

/**
 * NE - Not equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL NE(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) != iec_unwrap(b));
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
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T NOT(T value) noexcept {
    return T(~iec_unwrap(value));
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
 * MUX - Multiplexer (variadic)
 * Input: ANY_INT selector, ANY values, Output: ANY (same type as inputs)
 * Selects one of multiple inputs based on selector k
 * k=0 returns first input, k=1 returns second, etc.
 */
template<typename T>
inline T MUX_V([[maybe_unused]] IEC_INT k, T in0) noexcept {
    return in0;
}

template<typename T, typename... Args>
inline T MUX_V(IEC_INT k, T in0, Args... rest) noexcept {
    if (iec_unwrap(k) == 0) return in0;
    return MUX_V(IEC_INT(iec_unwrap(k) - 1), rest...);
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
// Variadic Comparison Functions (Chain Support) (ANY_ELEMENTARY -> BOOL)
// =============================================================================

/**
 * GT_CHAIN - Greater than chain
 * Input: ANY_ELEMENTARY, Output: BOOL
 * Returns TRUE if all values are in strictly decreasing order
 * GT_CHAIN(a, b, c) = (a > b) AND (b > c)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GT_CHAIN(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) > iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GT_CHAIN(T first, T second, Args... rest) noexcept {
    if (iec_unwrap(first) <= iec_unwrap(second)) return IEC_BOOL(false);
    if constexpr (sizeof...(rest) > 0) {
        return GT_CHAIN(second, rest...);
    } else {
        return IEC_BOOL(true);
    }
}

/**
 * GE_CHAIN - Greater than or equal chain
 * Input: ANY_ELEMENTARY, Output: BOOL
 * Returns TRUE if all values are in non-increasing order
 * GE_CHAIN(a, b, c) = (a >= b) AND (b >= c)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GE_CHAIN(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) >= iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GE_CHAIN(T first, T second, Args... rest) noexcept {
    if (iec_unwrap(first) < iec_unwrap(second)) return IEC_BOOL(false);
    if constexpr (sizeof...(rest) > 0) {
        return GE_CHAIN(second, rest...);
    } else {
        return IEC_BOOL(true);
    }
}

/**
 * EQ_CHAIN - Equality chain
 * Input: ANY_ELEMENTARY, Output: BOOL
 * Returns TRUE if all values are equal
 * EQ_CHAIN(a, b, c) = (a == b) AND (b == c)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL EQ_CHAIN(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) == iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL EQ_CHAIN(T first, T second, Args... rest) noexcept {
    if (iec_unwrap(first) != iec_unwrap(second)) return IEC_BOOL(false);
    if constexpr (sizeof...(rest) > 0) {
        return EQ_CHAIN(second, rest...);
    } else {
        return IEC_BOOL(true);
    }
}

/**
 * LE_CHAIN - Less than or equal chain
 * Input: ANY_ELEMENTARY, Output: BOOL
 * Returns TRUE if all values are in non-decreasing order
 * LE_CHAIN(a, b, c) = (a <= b) AND (b <= c)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LE_CHAIN(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) <= iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LE_CHAIN(T first, T second, Args... rest) noexcept {
    if (iec_unwrap(first) > iec_unwrap(second)) return IEC_BOOL(false);
    if constexpr (sizeof...(rest) > 0) {
        return LE_CHAIN(second, rest...);
    } else {
        return IEC_BOOL(true);
    }
}

/**
 * LT_CHAIN - Less than chain
 * Input: ANY_ELEMENTARY, Output: BOOL
 * Returns TRUE if all values are in strictly increasing order
 * LT_CHAIN(a, b, c) = (a < b) AND (b < c)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LT_CHAIN(T a, T b) noexcept {
    return IEC_BOOL(iec_unwrap(a) < iec_unwrap(b));
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LT_CHAIN(T first, T second, Args... rest) noexcept {
    if (iec_unwrap(first) >= iec_unwrap(second)) return IEC_BOOL(false);
    if constexpr (sizeof...(rest) > 0) {
        return LT_CHAIN(second, rest...);
    } else {
        return IEC_BOOL(true);
    }
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
