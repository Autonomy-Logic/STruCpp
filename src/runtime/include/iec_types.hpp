/**
 * STruC++ Runtime - IEC Type Definitions
 *
 * This header defines the C++ type aliases for IEC 61131-3 data types.
 * These types are used by generated code and provide the foundation
 * for the STruC++ runtime library.
 */

#pragma once

#include <cstdint>
#include <cstddef>

namespace strucpp {

// =============================================================================
// Elementary Types - Bit Strings
// =============================================================================

/** IEC BOOL - Boolean value (TRUE/FALSE) */
using BOOL_t = bool;

/** IEC BYTE - 8-bit bit string */
using BYTE_t = uint8_t;

/** IEC WORD - 16-bit bit string */
using WORD_t = uint16_t;

/** IEC DWORD - 32-bit bit string */
using DWORD_t = uint32_t;

/** IEC LWORD - 64-bit bit string (IEC v3) */
using LWORD_t = uint64_t;

// =============================================================================
// Elementary Types - Signed Integers
// =============================================================================

/** IEC SINT - Short integer (8-bit signed) */
using SINT_t = int8_t;

/** IEC INT - Integer (16-bit signed) */
using INT_t = int16_t;

/** IEC DINT - Double integer (32-bit signed) */
using DINT_t = int32_t;

/** IEC LINT - Long integer (64-bit signed) */
using LINT_t = int64_t;

// =============================================================================
// Elementary Types - Unsigned Integers
// =============================================================================

/** IEC USINT - Unsigned short integer (8-bit) */
using USINT_t = uint8_t;

/** IEC UINT - Unsigned integer (16-bit) */
using UINT_t = uint16_t;

/** IEC UDINT - Unsigned double integer (32-bit) */
using UDINT_t = uint32_t;

/** IEC ULINT - Unsigned long integer (64-bit) */
using ULINT_t = uint64_t;

// =============================================================================
// Elementary Types - Real Numbers
// =============================================================================

/** IEC REAL - Single precision floating point (32-bit IEEE 754) */
using REAL_t = float;

/** IEC LREAL - Double precision floating point (64-bit IEEE 754) */
using LREAL_t = double;

// =============================================================================
// Elementary Types - Time and Date
// =============================================================================

/** IEC TIME - Duration in nanoseconds */
using TIME_t = int64_t;

/** IEC DATE - Calendar date (days since epoch) */
using DATE_t = int64_t;

/** IEC TIME_OF_DAY - Time of day in nanoseconds since midnight */
using TOD_t = int64_t;

/** IEC DATE_AND_TIME - Combined date and time */
using DT_t = int64_t;

// IEC v3 Long variants (extended precision/range)

/** IEC LTIME - Long duration in nanoseconds (IEC v3) */
using LTIME_t = int64_t;

/** IEC LDATE - Long calendar date (days since epoch, IEC v3) */
using LDATE_t = int64_t;

/** IEC LTOD - Long time of day in nanoseconds since midnight (IEC v3) */
using LTOD_t = int64_t;

/** IEC LDT - Long combined date and time (IEC v3) */
using LDT_t = int64_t;

// =============================================================================
// Platform Pointer-Width Integer
// =============================================================================

/** Platform-width integer for pointer-to-integer conversions (CODESYS compat).
 *  On 64-bit platforms this is uint64_t; on 32-bit platforms uint32_t.
 *  Use this instead of DWORD for storing pointer addresses portably. */
#if UINTPTR_MAX > UINT32_MAX
using PTR_INT_t = uint64_t;
#else
using PTR_INT_t = uint32_t;
#endif

// =============================================================================
// Elementary Types - Characters
// =============================================================================

/** IEC CHAR - Single-byte character */
using CHAR_t = char;

/** IEC WCHAR - Wide character (UTF-16) */
using WCHAR_t = char16_t;

// =============================================================================
// Type Category Tags
// =============================================================================

/** Tag for ANY_BIT types */
struct AnyBitTag {};

/** Tag for ANY_INT types */
struct AnyIntTag {};

/** Tag for ANY_REAL types */
struct AnyRealTag {};

/** Tag for ANY_NUM types (ANY_INT | ANY_REAL) */
struct AnyNumTag {};

/** Tag for ANY_DATE types */
struct AnyDateTag {};

/** Tag for ANY_STRING types */
struct AnyStringTag {};

// =============================================================================
// Type Traits
// =============================================================================

/**
 * Type trait to get the category tag for an IEC type.
 */
template<typename T>
struct IECTypeCategory;

// Note: Some IEC types share the same underlying C++ type, so we only define
// one specialization per unique C++ type. The type category is determined by
// the primary use case of that underlying type.

// Boolean type
template<> struct IECTypeCategory<bool> { using type = AnyBitTag; };

// 8-bit types (BYTE_t/USINT_t are both uint8_t, SINT_t is int8_t)
template<> struct IECTypeCategory<uint8_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<int8_t> { using type = AnyIntTag; };

// 16-bit types (WORD_t/UINT_t are both uint16_t, INT_t is int16_t)
template<> struct IECTypeCategory<uint16_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<int16_t> { using type = AnyIntTag; };

// 32-bit types (DWORD_t/UDINT_t are both uint32_t, DINT_t is int32_t)
template<> struct IECTypeCategory<uint32_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<int32_t> { using type = AnyIntTag; };

// 64-bit types (LWORD_t/ULINT_t are both uint64_t)
// Note: LINT_t, TIME_t, DATE_t, TOD_t, DT_t, LTIME_t, LDATE_t, LTOD_t, LDT_t are all int64_t
template<> struct IECTypeCategory<uint64_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<int64_t> { using type = AnyIntTag; };

// Real types
template<> struct IECTypeCategory<float> { using type = AnyRealTag; };
template<> struct IECTypeCategory<double> { using type = AnyRealTag; };

// Character types
template<> struct IECTypeCategory<char> { using type = AnyStringTag; };
template<> struct IECTypeCategory<char16_t> { using type = AnyStringTag; };

// =============================================================================
// C++20 Concepts (when available)
// =============================================================================

#if __cplusplus >= 202002L

#include <concepts>

/** Concept for ANY_BIT types */
template<typename T>
concept IECAnyBit = std::is_same_v<typename IECTypeCategory<T>::type, AnyBitTag>;

/** Concept for ANY_INT types */
template<typename T>
concept IECAnyInt = std::is_same_v<typename IECTypeCategory<T>::type, AnyIntTag>;

/** Concept for ANY_REAL types */
template<typename T>
concept IECAnyReal = std::is_same_v<typename IECTypeCategory<T>::type, AnyRealTag>;

/** Concept for ANY_NUM types */
template<typename T>
concept IECAnyNum = IECAnyInt<T> || IECAnyReal<T>;

/** Concept for ANY_DATE types */
template<typename T>
concept IECAnyDate = std::is_same_v<typename IECTypeCategory<T>::type, AnyDateTag>;

#endif // C++20

} // namespace strucpp
