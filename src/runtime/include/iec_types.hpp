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

// Bit string types
template<> struct IECTypeCategory<BOOL_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<BYTE_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<WORD_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<DWORD_t> { using type = AnyBitTag; };
template<> struct IECTypeCategory<LWORD_t> { using type = AnyBitTag; };

// Signed integer types
template<> struct IECTypeCategory<SINT_t> { using type = AnyIntTag; };
template<> struct IECTypeCategory<INT_t> { using type = AnyIntTag; };
template<> struct IECTypeCategory<DINT_t> { using type = AnyIntTag; };
template<> struct IECTypeCategory<LINT_t> { using type = AnyIntTag; };

// Unsigned integer types
template<> struct IECTypeCategory<USINT_t> { using type = AnyIntTag; };
template<> struct IECTypeCategory<UINT_t> { using type = AnyIntTag; };
template<> struct IECTypeCategory<UDINT_t> { using type = AnyIntTag; };
template<> struct IECTypeCategory<ULINT_t> { using type = AnyIntTag; };

// Real types
template<> struct IECTypeCategory<REAL_t> { using type = AnyRealTag; };
template<> struct IECTypeCategory<LREAL_t> { using type = AnyRealTag; };

// Date/Time types
template<> struct IECTypeCategory<TIME_t> { using type = AnyDateTag; };
template<> struct IECTypeCategory<DATE_t> { using type = AnyDateTag; };
template<> struct IECTypeCategory<TOD_t> { using type = AnyDateTag; };
template<> struct IECTypeCategory<DT_t> { using type = AnyDateTag; };

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
