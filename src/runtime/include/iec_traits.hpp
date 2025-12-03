/**
 * STruC++ Runtime - IEC Type Traits
 *
 * This header provides C++ type traits and concepts for IEC 61131-3 type categories.
 * These traits enable compile-time type checking and generic programming for
 * standard library functions.
 */

#pragma once

#include <type_traits>
#include <cstdint>
#include <cstddef>
#include "iec_types.hpp"

namespace strucpp {

// Forward declarations
template<typename T> class IECVar;

// =============================================================================
// Primary Type Traits (default to false)
// =============================================================================

/** Check if T is an IEC type */
template<typename T> struct is_iec_type : std::false_type {};

/** Check if T is ANY_BOOL (just BOOL) */
template<typename T> struct is_any_bool : std::false_type {};

/** Check if T is ANY_SINT (signed integers) */
template<typename T> struct is_any_sint : std::false_type {};

/** Check if T is ANY_UINT (unsigned integers) */
template<typename T> struct is_any_uint : std::false_type {};

/** Check if T is ANY_INT (all integers) */
template<typename T> struct is_any_int : std::false_type {};

/** Check if T is ANY_REAL (floating point) */
template<typename T> struct is_any_real : std::false_type {};

/** Check if T is ANY_NUM (numeric: integers + reals) */
template<typename T> struct is_any_num : std::false_type {};

/** Check if T is ANY_BIT (bit strings including BOOL) */
template<typename T> struct is_any_bit : std::false_type {};

/** Check if T is ANY_STRING (strings and characters) */
template<typename T> struct is_any_string : std::false_type {};

/** Check if T is ANY_DATE (date/time types) */
template<typename T> struct is_any_date : std::false_type {};

/** Check if T is ANY_TIME (duration types: TIME, LTIME) */
template<typename T> struct is_any_time : std::false_type {};

/** Check if T is ANY_MAGNITUDE (numeric + time) */
template<typename T> struct is_any_magnitude : std::false_type {};

/** Check if T is ANY_ELEMENTARY (all elementary types) */
template<typename T> struct is_any_elementary : std::false_type {};

// =============================================================================
// Specializations for Raw C++ Types
// =============================================================================
// Note: IEC types share underlying C++ types, so we specialize on the actual
// C++ types. The categorization reflects the primary IEC use case.

// Boolean (BOOL_t = bool)
template<> struct is_iec_type<bool> : std::true_type {};
template<> struct is_any_bool<bool> : std::true_type {};
template<> struct is_any_bit<bool> : std::true_type {};
template<> struct is_any_elementary<bool> : std::true_type {};

// 8-bit unsigned (BYTE_t/USINT_t = uint8_t) - categorized as bit string
template<> struct is_iec_type<uint8_t> : std::true_type {};
template<> struct is_any_bit<uint8_t> : std::true_type {};
template<> struct is_any_uint<uint8_t> : std::true_type {};
template<> struct is_any_int<uint8_t> : std::true_type {};
template<> struct is_any_num<uint8_t> : std::true_type {};
template<> struct is_any_magnitude<uint8_t> : std::true_type {};
template<> struct is_any_elementary<uint8_t> : std::true_type {};

// 8-bit signed (SINT_t = int8_t)
template<> struct is_iec_type<int8_t> : std::true_type {};
template<> struct is_any_sint<int8_t> : std::true_type {};
template<> struct is_any_int<int8_t> : std::true_type {};
template<> struct is_any_num<int8_t> : std::true_type {};
template<> struct is_any_magnitude<int8_t> : std::true_type {};
template<> struct is_any_elementary<int8_t> : std::true_type {};

// 16-bit unsigned (WORD_t/UINT_t = uint16_t) - categorized as bit string
template<> struct is_iec_type<uint16_t> : std::true_type {};
template<> struct is_any_bit<uint16_t> : std::true_type {};
template<> struct is_any_uint<uint16_t> : std::true_type {};
template<> struct is_any_int<uint16_t> : std::true_type {};
template<> struct is_any_num<uint16_t> : std::true_type {};
template<> struct is_any_magnitude<uint16_t> : std::true_type {};
template<> struct is_any_elementary<uint16_t> : std::true_type {};

// 16-bit signed (INT_t = int16_t)
template<> struct is_iec_type<int16_t> : std::true_type {};
template<> struct is_any_sint<int16_t> : std::true_type {};
template<> struct is_any_int<int16_t> : std::true_type {};
template<> struct is_any_num<int16_t> : std::true_type {};
template<> struct is_any_magnitude<int16_t> : std::true_type {};
template<> struct is_any_elementary<int16_t> : std::true_type {};

// 32-bit unsigned (DWORD_t/UDINT_t = uint32_t) - categorized as bit string
template<> struct is_iec_type<uint32_t> : std::true_type {};
template<> struct is_any_bit<uint32_t> : std::true_type {};
template<> struct is_any_uint<uint32_t> : std::true_type {};
template<> struct is_any_int<uint32_t> : std::true_type {};
template<> struct is_any_num<uint32_t> : std::true_type {};
template<> struct is_any_magnitude<uint32_t> : std::true_type {};
template<> struct is_any_elementary<uint32_t> : std::true_type {};

// 32-bit signed (DINT_t = int32_t)
template<> struct is_iec_type<int32_t> : std::true_type {};
template<> struct is_any_sint<int32_t> : std::true_type {};
template<> struct is_any_int<int32_t> : std::true_type {};
template<> struct is_any_num<int32_t> : std::true_type {};
template<> struct is_any_magnitude<int32_t> : std::true_type {};
template<> struct is_any_elementary<int32_t> : std::true_type {};

// 64-bit unsigned (LWORD_t/ULINT_t = uint64_t) - categorized as bit string
template<> struct is_iec_type<uint64_t> : std::true_type {};
template<> struct is_any_bit<uint64_t> : std::true_type {};
template<> struct is_any_uint<uint64_t> : std::true_type {};
template<> struct is_any_int<uint64_t> : std::true_type {};
template<> struct is_any_num<uint64_t> : std::true_type {};
template<> struct is_any_magnitude<uint64_t> : std::true_type {};
template<> struct is_any_elementary<uint64_t> : std::true_type {};

// 64-bit signed (LINT_t/TIME_t/DATE_t/TOD_t/DT_t/etc = int64_t)
// Note: This type is used for both integers and date/time types
template<> struct is_iec_type<int64_t> : std::true_type {};
template<> struct is_any_sint<int64_t> : std::true_type {};
template<> struct is_any_int<int64_t> : std::true_type {};
template<> struct is_any_num<int64_t> : std::true_type {};
template<> struct is_any_time<int64_t> : std::true_type {};
template<> struct is_any_date<int64_t> : std::true_type {};
template<> struct is_any_magnitude<int64_t> : std::true_type {};
template<> struct is_any_elementary<int64_t> : std::true_type {};

// Single precision float (REAL_t = float)
template<> struct is_iec_type<float> : std::true_type {};
template<> struct is_any_real<float> : std::true_type {};
template<> struct is_any_num<float> : std::true_type {};
template<> struct is_any_magnitude<float> : std::true_type {};
template<> struct is_any_elementary<float> : std::true_type {};

// Double precision float (LREAL_t = double)
template<> struct is_iec_type<double> : std::true_type {};
template<> struct is_any_real<double> : std::true_type {};
template<> struct is_any_num<double> : std::true_type {};
template<> struct is_any_magnitude<double> : std::true_type {};
template<> struct is_any_elementary<double> : std::true_type {};

// Character (CHAR_t = char)
template<> struct is_iec_type<char> : std::true_type {};
template<> struct is_any_string<char> : std::true_type {};
template<> struct is_any_elementary<char> : std::true_type {};

// Wide character (WCHAR_t = char16_t)
template<> struct is_iec_type<char16_t> : std::true_type {};
template<> struct is_any_string<char16_t> : std::true_type {};
template<> struct is_any_elementary<char16_t> : std::true_type {};

// =============================================================================
// Specializations for IECVar<T> Wrapped Types
// =============================================================================

template<typename T>
struct is_iec_type<IECVar<T>> : is_iec_type<T> {};

template<typename T>
struct is_any_bool<IECVar<T>> : is_any_bool<T> {};

template<typename T>
struct is_any_sint<IECVar<T>> : is_any_sint<T> {};

template<typename T>
struct is_any_uint<IECVar<T>> : is_any_uint<T> {};

template<typename T>
struct is_any_int<IECVar<T>> : is_any_int<T> {};

template<typename T>
struct is_any_real<IECVar<T>> : is_any_real<T> {};

template<typename T>
struct is_any_num<IECVar<T>> : is_any_num<T> {};

template<typename T>
struct is_any_bit<IECVar<T>> : is_any_bit<T> {};

template<typename T>
struct is_any_string<IECVar<T>> : is_any_string<T> {};

template<typename T>
struct is_any_date<IECVar<T>> : is_any_date<T> {};

template<typename T>
struct is_any_time<IECVar<T>> : is_any_time<T> {};

template<typename T>
struct is_any_magnitude<IECVar<T>> : is_any_magnitude<T> {};

template<typename T>
struct is_any_elementary<IECVar<T>> : is_any_elementary<T> {};

// =============================================================================
// Helper Variable Templates (C++17)
// =============================================================================

template<typename T>
inline constexpr bool is_iec_type_v = is_iec_type<T>::value;

template<typename T>
inline constexpr bool is_any_bool_v = is_any_bool<T>::value;

template<typename T>
inline constexpr bool is_any_sint_v = is_any_sint<T>::value;

template<typename T>
inline constexpr bool is_any_uint_v = is_any_uint<T>::value;

template<typename T>
inline constexpr bool is_any_int_v = is_any_int<T>::value;

template<typename T>
inline constexpr bool is_any_real_v = is_any_real<T>::value;

template<typename T>
inline constexpr bool is_any_num_v = is_any_num<T>::value;

template<typename T>
inline constexpr bool is_any_bit_v = is_any_bit<T>::value;

template<typename T>
inline constexpr bool is_any_string_v = is_any_string<T>::value;

template<typename T>
inline constexpr bool is_any_date_v = is_any_date<T>::value;

template<typename T>
inline constexpr bool is_any_time_v = is_any_time<T>::value;

template<typename T>
inline constexpr bool is_any_magnitude_v = is_any_magnitude<T>::value;

template<typename T>
inline constexpr bool is_any_elementary_v = is_any_elementary<T>::value;

// =============================================================================
// Type Size Traits
// =============================================================================

/** Get the size in bits for an IEC type */
template<typename T> struct iec_bit_size;

// Note: Using actual C++ types to avoid duplicate specializations
template<> struct iec_bit_size<bool> : std::integral_constant<size_t, 1> {};
template<> struct iec_bit_size<uint8_t> : std::integral_constant<size_t, 8> {};
template<> struct iec_bit_size<int8_t> : std::integral_constant<size_t, 8> {};
template<> struct iec_bit_size<uint16_t> : std::integral_constant<size_t, 16> {};
template<> struct iec_bit_size<int16_t> : std::integral_constant<size_t, 16> {};
template<> struct iec_bit_size<uint32_t> : std::integral_constant<size_t, 32> {};
template<> struct iec_bit_size<int32_t> : std::integral_constant<size_t, 32> {};
template<> struct iec_bit_size<uint64_t> : std::integral_constant<size_t, 64> {};
template<> struct iec_bit_size<int64_t> : std::integral_constant<size_t, 64> {};
template<> struct iec_bit_size<float> : std::integral_constant<size_t, 32> {};
template<> struct iec_bit_size<double> : std::integral_constant<size_t, 64> {};
template<> struct iec_bit_size<char> : std::integral_constant<size_t, 8> {};
template<> struct iec_bit_size<char16_t> : std::integral_constant<size_t, 16> {};

// IECVar wrapper
template<typename T>
struct iec_bit_size<IECVar<T>> : iec_bit_size<T> {};

template<typename T>
inline constexpr size_t iec_bit_size_v = iec_bit_size<T>::value;

// =============================================================================
// Underlying Type Traits
// =============================================================================

/** Get the underlying C++ type for an IEC type */
template<typename T> struct iec_underlying_type { using type = T; };

// IECVar wrapper - extract the underlying type
template<typename T>
struct iec_underlying_type<IECVar<T>> { using type = T; };

template<typename T>
using iec_underlying_type_t = typename iec_underlying_type<T>::type;

// =============================================================================
// Type Limits
// =============================================================================

/** Get the minimum and maximum values for an IEC type */
template<typename T> struct iec_limits;

// Note: Using actual C++ types to avoid duplicate specializations
template<> struct iec_limits<int8_t> {
    static constexpr int8_t min() { return -128; }
    static constexpr int8_t max() { return 127; }
};

template<> struct iec_limits<int16_t> {
    static constexpr int16_t min() { return -32768; }
    static constexpr int16_t max() { return 32767; }
};

template<> struct iec_limits<int32_t> {
    static constexpr int32_t min() { return -2147483648; }
    static constexpr int32_t max() { return 2147483647; }
};

template<> struct iec_limits<int64_t> {
    static constexpr int64_t min() { return INT64_MIN; }
    static constexpr int64_t max() { return INT64_MAX; }
};

template<> struct iec_limits<uint8_t> {
    static constexpr uint8_t min() { return 0; }
    static constexpr uint8_t max() { return 255; }
};

template<> struct iec_limits<uint16_t> {
    static constexpr uint16_t min() { return 0; }
    static constexpr uint16_t max() { return 65535; }
};

template<> struct iec_limits<uint32_t> {
    static constexpr uint32_t min() { return 0; }
    static constexpr uint32_t max() { return 4294967295U; }
};

template<> struct iec_limits<uint64_t> {
    static constexpr uint64_t min() { return 0; }
    static constexpr uint64_t max() { return UINT64_MAX; }
};

// IECVar wrapper
template<typename T>
struct iec_limits<IECVar<T>> : iec_limits<T> {};

// =============================================================================
// C++17 SFINAE Helpers
// =============================================================================

template<typename T>
using enable_if_any_int = std::enable_if_t<is_any_int_v<T>, int>;

template<typename T>
using enable_if_any_real = std::enable_if_t<is_any_real_v<T>, int>;

template<typename T>
using enable_if_any_num = std::enable_if_t<is_any_num_v<T>, int>;

template<typename T>
using enable_if_any_bit = std::enable_if_t<is_any_bit_v<T>, int>;

template<typename T>
using enable_if_any_string = std::enable_if_t<is_any_string_v<T>, int>;

template<typename T>
using enable_if_any_date = std::enable_if_t<is_any_date_v<T>, int>;

template<typename T>
using enable_if_any_time = std::enable_if_t<is_any_time_v<T>, int>;

template<typename T>
using enable_if_any_magnitude = std::enable_if_t<is_any_magnitude_v<T>, int>;

// =============================================================================
// C++20 Concepts (when available)
// =============================================================================

#if __cplusplus >= 202002L

#include <concepts>

/** Concept for IEC types */
template<typename T>
concept IECType = is_iec_type_v<T>;

/** Concept for ANY_BOOL types */
template<typename T>
concept AnyBool = is_any_bool_v<T>;

/** Concept for ANY_SINT types (signed integers) */
template<typename T>
concept AnySInt = is_any_sint_v<T>;

/** Concept for ANY_UINT types (unsigned integers) */
template<typename T>
concept AnyUInt = is_any_uint_v<T>;

/** Concept for ANY_INT types (all integers) */
template<typename T>
concept AnyInt = is_any_int_v<T>;

/** Concept for ANY_REAL types */
template<typename T>
concept AnyReal = is_any_real_v<T>;

/** Concept for ANY_NUM types */
template<typename T>
concept AnyNum = is_any_num_v<T>;

/** Concept for ANY_BIT types */
template<typename T>
concept AnyBit = is_any_bit_v<T>;

/** Concept for ANY_STRING types */
template<typename T>
concept AnyString = is_any_string_v<T>;

/** Concept for ANY_DATE types */
template<typename T>
concept AnyDate = is_any_date_v<T>;

/** Concept for ANY_TIME types (durations) */
template<typename T>
concept AnyTime = is_any_time_v<T>;

/** Concept for ANY_MAGNITUDE types */
template<typename T>
concept AnyMagnitude = is_any_magnitude_v<T>;

/** Concept for ANY_ELEMENTARY types */
template<typename T>
concept AnyElementary = is_any_elementary_v<T>;

#endif // C++20

} // namespace strucpp
