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
#include <cmath>
#include <algorithm>
#include <type_traits>

namespace strucpp {

// =============================================================================
// Base Classes for Runtime
// =============================================================================

/**
 * Base class for all program instances.
 * Provides the interface for the runtime scheduler.
 */
struct ProgramBase {
    virtual ~ProgramBase() = default;

    /** Execute one cycle of the program */
    virtual void run() = 0;
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
    if constexpr (std::is_same_v<T, IEC_REAL> || std::is_same_v<T, IEC_LREAL>) {
        return T(std::abs(value.get()));
    } else if constexpr (std::is_signed_v<typename T::value_type>) {
        auto v = value.get();
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
    return T(std::sqrt(static_cast<double>(value.get())));
}

/**
 * LN - Natural logarithm
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T LN(T value) noexcept {
    return T(std::log(static_cast<double>(value.get())));
}

/**
 * LOG - Base-10 logarithm
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T LOG(T value) noexcept {
    return T(std::log10(static_cast<double>(value.get())));
}

/**
 * EXP - Exponential (e^x)
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T EXP(T value) noexcept {
    return T(std::exp(static_cast<double>(value.get())));
}

/**
 * EXPT - Exponentiation (base^exponent)
 * Input: ANY_REAL, Output: ANY_REAL (same type)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T EXPT(T base, T exponent) noexcept {
    return T(std::pow(static_cast<double>(base.get()), static_cast<double>(exponent.get())));
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
    return T(std::sin(static_cast<double>(value.get())));
}

/**
 * COS - Cosine
 * Input: ANY_REAL (radians), Output: ANY_REAL
 */
template<typename T, enable_if_any_real<T> = 0>
inline T COS(T value) noexcept {
    return T(std::cos(static_cast<double>(value.get())));
}

/**
 * TAN - Tangent
 * Input: ANY_REAL (radians), Output: ANY_REAL
 */
template<typename T, enable_if_any_real<T> = 0>
inline T TAN(T value) noexcept {
    return T(std::tan(static_cast<double>(value.get())));
}

/**
 * ASIN - Arc sine
 * Input: ANY_REAL, Output: ANY_REAL (radians)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ASIN(T value) noexcept {
    return T(std::asin(static_cast<double>(value.get())));
}

/**
 * ACOS - Arc cosine
 * Input: ANY_REAL, Output: ANY_REAL (radians)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ACOS(T value) noexcept {
    return T(std::acos(static_cast<double>(value.get())));
}

/**
 * ATAN - Arc tangent
 * Input: ANY_REAL, Output: ANY_REAL (radians)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ATAN(T value) noexcept {
    return T(std::atan(static_cast<double>(value.get())));
}

/**
 * ATAN2 - Arc tangent of y/x (two-argument form)
 * Input: ANY_REAL, Output: ANY_REAL (radians between -PI and PI)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ATAN2(T y, T x) noexcept {
    return T(std::atan2(static_cast<double>(y.get()), static_cast<double>(x.get())));
}

/**
 * TRUNC - Truncate toward zero
 * Input: ANY_REAL, Output: ANY_REAL (integer part)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T TRUNC(T value) noexcept {
    return T(std::trunc(static_cast<double>(value.get())));
}

/**
 * ROUND - Round to nearest integer
 * Input: ANY_REAL, Output: ANY_REAL
 * Rounds half away from zero (banker's rounding not used)
 */
template<typename T, enable_if_any_real<T> = 0>
inline T ROUND(T value) noexcept {
    return T(std::round(static_cast<double>(value.get())));
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
    return g.get() ? in1 : in0;
}

/**
 * MAX - Maximum of two values
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline T MAX(T a, T b) noexcept {
    return a.get() > b.get() ? a : b;
}

/**
 * MIN - Minimum of two values
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline T MIN(T a, T b) noexcept {
    return a.get() < b.get() ? a : b;
}

/**
 * LIMIT - Limit value to range [mn, mx]
 * Input: ANY_ELEMENTARY, Output: ANY_ELEMENTARY (same type)
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline T LIMIT(T mn, T in, T mx) noexcept {
    if (in.get() < mn.get()) return mn;
    if (in.get() > mx.get()) return mx;
    return in;
}

/**
 * MUX - Multiplexer (select from multiple inputs)
 * Input: ANY_INT selector, ANY values, Output: ANY (same type as inputs)
 * Note: This is a simplified 2-input version.
 */
template<typename T>
inline T MUX(IEC_INT k, T in0, T in1) noexcept {
    return k.get() == 0 ? in0 : in1;
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
    return IEC_BOOL(a.get() > b.get());
}

/**
 * GE - Greater than or equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GE(T a, T b) noexcept {
    return IEC_BOOL(a.get() >= b.get());
}

/**
 * EQ - Equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL EQ(T a, T b) noexcept {
    return IEC_BOOL(a.get() == b.get());
}

/**
 * LE - Less than or equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LE(T a, T b) noexcept {
    return IEC_BOOL(a.get() <= b.get());
}

/**
 * LT - Less than
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LT(T a, T b) noexcept {
    return IEC_BOOL(a.get() < b.get());
}

/**
 * NE - Not equal
 * Input: ANY_ELEMENTARY, Output: BOOL
 */
template<typename T, enable_if_any_elementary<T> = 0>
inline IEC_BOOL NE(T a, T b) noexcept {
    return IEC_BOOL(a.get() != b.get());
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
    return T(in.get() << n.get());
}

/**
 * SHR - Shift right
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T SHR(T in, IEC_INT n) noexcept {
    return T(in.get() >> n.get());
}

/**
 * ROL - Rotate left
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T ROL(T in, IEC_INT n) noexcept {
    constexpr int bits = sizeof(typename T::value_type) * 8;
    auto v = in.get();
    auto shift = n.get() % bits;
    return T((v << shift) | (v >> (bits - shift)));
}

/**
 * ROR - Rotate right
 * Input: ANY_BIT, ANY_INT (shift count), Output: ANY_BIT
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T ROR(T in, IEC_INT n) noexcept {
    constexpr int bits = sizeof(typename T::value_type) * 8;
    auto v = in.get();
    auto shift = n.get() % bits;
    return T((v >> shift) | (v << (bits - shift)));
}

// =============================================================================
// Type Conversion Functions
// =============================================================================

/**
 * Generic type conversion
 */
template<typename To, typename From>
inline To CONVERT(From value) noexcept {
    return To(static_cast<typename To::value_type>(value.get()));
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
    return t.get() / 1000000;
}

/**
 * Get seconds from a TIME value
 */
inline double TIME_TO_S(IEC_TIME t) noexcept {
    return static_cast<double>(t.get()) / 1000000000.0;
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
    return T(-value.get());
}

/**
 * ADD - Addition (variadic)
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Adds two or more values together
 */
template<typename T, enable_if_any_num<T> = 0>
inline T ADD(T a, T b) noexcept {
    return T(a.get() + b.get());
}

template<typename T, typename... Args, enable_if_any_num<T> = 0>
inline T ADD(T first, T second, Args... rest) noexcept {
    return ADD(T(first.get() + second.get()), rest...);
}

/**
 * MUL - Multiplication (variadic)
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Multiplies two or more values together
 */
template<typename T, enable_if_any_num<T> = 0>
inline T MUL(T a, T b) noexcept {
    return T(a.get() * b.get());
}

template<typename T, typename... Args, enable_if_any_num<T> = 0>
inline T MUL(T first, T second, Args... rest) noexcept {
    return MUL(T(first.get() * second.get()), rest...);
}

/**
 * SUB - Subtraction
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Subtracts second value from first
 */
template<typename T, enable_if_any_num<T> = 0>
inline T SUB(T a, T b) noexcept {
    return T(a.get() - b.get());
}

/**
 * DIV - Division
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Divides first value by second
 */
template<typename T, enable_if_any_num<T> = 0>
inline T DIV(T a, T b) noexcept {
    return T(a.get() / b.get());
}

/**
 * MOD - Modulo
 * Input: ANY_NUM, Output: ANY_NUM (same type)
 * Returns remainder of division
 */
template<typename T, enable_if_any_num<T> = 0>
inline T MOD(T a, T b) noexcept {
    if constexpr (std::is_floating_point_v<typename T::value_type>) {
        return T(std::fmod(static_cast<double>(a.get()), static_cast<double>(b.get())));
    } else {
        return T(a.get() % b.get());
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
    return T(~value.get());
}

/**
 * AND - Bitwise AND (variadic)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T AND(T a, T b) noexcept {
    return T(a.get() & b.get());
}

template<typename T, typename... Args, enable_if_any_bit<T> = 0>
inline T AND(T first, T second, Args... rest) noexcept {
    return AND(T(first.get() & second.get()), rest...);
}

/**
 * OR - Bitwise OR (variadic)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T OR(T a, T b) noexcept {
    return T(a.get() | b.get());
}

template<typename T, typename... Args, enable_if_any_bit<T> = 0>
inline T OR(T first, T second, Args... rest) noexcept {
    return OR(T(first.get() | second.get()), rest...);
}

/**
 * XOR - Bitwise XOR (variadic)
 * Input: ANY_BIT, Output: ANY_BIT (same type)
 */
template<typename T, enable_if_any_bit<T> = 0>
inline T XOR(T a, T b) noexcept {
    return T(a.get() ^ b.get());
}

template<typename T, typename... Args, enable_if_any_bit<T> = 0>
inline T XOR(T first, T second, Args... rest) noexcept {
    return XOR(T(first.get() ^ second.get()), rest...);
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
    T current_max = first.get() > second.get() ? first : second;
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
    T current_min = first.get() < second.get() ? first : second;
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
    if (k.get() == 0) return in0;
    return MUX_V(IEC_INT(k.get() - 1), rest...);
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
    return IEC_BOOL(a.get() > b.get());
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GT_CHAIN(T first, T second, Args... rest) noexcept {
    if (first.get() <= second.get()) return IEC_BOOL(false);
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
    return IEC_BOOL(a.get() >= b.get());
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL GE_CHAIN(T first, T second, Args... rest) noexcept {
    if (first.get() < second.get()) return IEC_BOOL(false);
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
    return IEC_BOOL(a.get() == b.get());
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL EQ_CHAIN(T first, T second, Args... rest) noexcept {
    if (first.get() != second.get()) return IEC_BOOL(false);
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
    return IEC_BOOL(a.get() <= b.get());
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LE_CHAIN(T first, T second, Args... rest) noexcept {
    if (first.get() > second.get()) return IEC_BOOL(false);
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
    return IEC_BOOL(a.get() < b.get());
}

template<typename T, typename... Args, enable_if_any_elementary<T> = 0>
inline IEC_BOOL LT_CHAIN(T first, T second, Args... rest) noexcept {
    if (first.get() >= second.get()) return IEC_BOOL(false);
    if constexpr (sizeof...(rest) > 0) {
        return LT_CHAIN(second, rest...);
    } else {
        return IEC_BOOL(true);
    }
}

} // namespace strucpp
