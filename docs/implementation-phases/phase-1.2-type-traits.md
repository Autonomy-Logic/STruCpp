# Phase 1.2: Type Categories and Traits

**Status**: COMPLETED

**Duration**: 1 week

**Goal**: Implement C++ type traits and concepts for IEC 61131-3 type categories to enable type-safe generic programming

## Overview

IEC 61131-3 defines a hierarchy of type categories (ANY, ANY_NUM, ANY_INT, etc.) that determine which operations are valid for which types. This sub-phase implements C++ type traits and concepts that mirror this hierarchy, enabling compile-time type checking and generic function implementations.

## Scope

### IEC Type Hierarchy

The IEC 61131-3 type hierarchy is:

```
ANY
├── ANY_DERIVED
│   ├── ANY_ELEMENTARY
│   │   ├── ANY_MAGNITUDE
│   │   │   ├── ANY_NUM
│   │   │   │   ├── ANY_REAL (REAL, LREAL)
│   │   │   │   └── ANY_INT
│   │   │   │       ├── ANY_SIGNED (SINT, INT, DINT, LINT)
│   │   │   │       └── ANY_UNSIGNED (USINT, UINT, UDINT, ULINT)
│   │   │   └── ANY_DURATION (TIME, LTIME)
│   │   ├── ANY_BIT (BOOL, BYTE, WORD, DWORD, LWORD)
│   │   ├── ANY_STRING (STRING, WSTRING)
│   │   ├── ANY_DATE (DATE, LDATE)
│   │   └── ANY_DATE_AND_TIME (DT, LDT, TOD, LTOD)
│   └── ANY_DERIVED (user-defined types)
└── ANY (catch-all)
```

### MatIEC Reference

MatIEC uses macro expansion to handle type categories in `lib/C/iec_types_all.h`:

```c
#define __ANY_INT(DO)   __ANY_SINT(DO) __ANY_UINT(DO)
#define __ANY_SINT(DO)  DO(SINT) DO(INT) DO(DINT) DO(LINT)
#define __ANY_UINT(DO)  DO(USINT) DO(UINT) DO(UDINT) DO(ULINT)
#define __ANY_REAL(DO)  DO(REAL) DO(LREAL)
#define __ANY_NUM(DO)   __ANY_INT(DO) __ANY_REAL(DO)
#define __ANY_BIT(DO)   DO(BOOL) DO(BYTE) DO(WORD) DO(DWORD) DO(LWORD)
// ... etc
```

This approach generates code for each type through macro expansion, which is error-prone and difficult to debug.

### STruC++ Design

STruC++ uses C++20 concepts (or C++17 type traits with SFINAE) to express type categories:

```cpp
// Type traits for category membership
template<typename T> struct is_any_int : std::false_type {};
template<> struct is_any_int<IEC_SINT> : std::true_type {};
template<> struct is_any_int<IEC_INT> : std::true_type {};
// ... etc

// C++20 concepts
template<typename T>
concept AnyInt = is_any_int<T>::value;

template<typename T>
concept AnyNum = AnyInt<T> || is_any_real<T>::value;

// Usage in generic functions
template<AnyNum T>
T ADD(T a, T b) { return a + b; }
```

## Deliverables

### 1. Type Traits Header

**`include/iec_traits.hpp`**:

```cpp
#pragma once
#include <type_traits>
#include "iec_types.hpp"

namespace strucpp {

// Primary templates (default to false)
template<typename T> struct is_iec_type : std::false_type {};
template<typename T> struct is_any_bool : std::false_type {};
template<typename T> struct is_any_sint : std::false_type {};
template<typename T> struct is_any_uint : std::false_type {};
template<typename T> struct is_any_int : std::false_type {};
template<typename T> struct is_any_real : std::false_type {};
template<typename T> struct is_any_num : std::false_type {};
template<typename T> struct is_any_bit : std::false_type {};
template<typename T> struct is_any_string : std::false_type {};
template<typename T> struct is_any_date : std::false_type {};
template<typename T> struct is_any_time : std::false_type {};
template<typename T> struct is_any_magnitude : std::false_type {};
template<typename T> struct is_any_elementary : std::false_type {};

// Specializations for each type...

// Helper variable templates (C++17)
template<typename T>
inline constexpr bool is_iec_type_v = is_iec_type<T>::value;

template<typename T>
inline constexpr bool is_any_int_v = is_any_int<T>::value;

// ... etc
}
```

### 2. C++20 Concepts (Optional, with fallback)

**`include/iec_concepts.hpp`**:

```cpp
#pragma once
#include "iec_traits.hpp"

namespace strucpp {

#if __cplusplus >= 202002L
// C++20 concepts

template<typename T>
concept IECType = is_iec_type_v<T>;

template<typename T>
concept AnyBool = is_any_bool_v<T>;

template<typename T>
concept AnySInt = is_any_sint_v<T>;

template<typename T>
concept AnyUInt = is_any_uint_v<T>;

template<typename T>
concept AnyInt = is_any_int_v<T>;

template<typename T>
concept AnyReal = is_any_real_v<T>;

template<typename T>
concept AnyNum = is_any_num_v<T>;

template<typename T>
concept AnyBit = is_any_bit_v<T>;

template<typename T>
concept AnyString = is_any_string_v<T>;

template<typename T>
concept AnyDate = is_any_date_v<T>;

template<typename T>
concept AnyTime = is_any_time_v<T>;

template<typename T>
concept AnyMagnitude = is_any_magnitude_v<T>;

template<typename T>
concept AnyElementary = is_any_elementary_v<T>;

#else
// C++17 fallback using SFINAE
// Concepts are emulated using std::enable_if

#define REQUIRES_ANY_INT(T) \
    std::enable_if_t<is_any_int_v<T>, int> = 0

#define REQUIRES_ANY_NUM(T) \
    std::enable_if_t<is_any_num_v<T>, int> = 0

// ... etc

#endif

}
```

### 3. Type Size and Range Traits

**Additional traits for type properties**:

```cpp
// Size in bits
template<typename T> struct iec_bit_size;
template<> struct iec_bit_size<IEC_SINT> : std::integral_constant<size_t, 8> {};
template<> struct iec_bit_size<IEC_INT> : std::integral_constant<size_t, 16> {};
template<> struct iec_bit_size<IEC_DINT> : std::integral_constant<size_t, 32> {};
template<> struct iec_bit_size<IEC_LINT> : std::integral_constant<size_t, 64> {};
// ... etc

template<typename T>
inline constexpr size_t iec_bit_size_v = iec_bit_size<T>::value;

// Underlying C++ type
template<typename T> struct iec_underlying_type;
template<> struct iec_underlying_type<IEC_SINT> { using type = int8_t; };
template<> struct iec_underlying_type<IEC_INT> { using type = int16_t; };
// ... etc

template<typename T>
using iec_underlying_type_t = typename iec_underlying_type<T>::type;

// Range limits
template<typename T> struct iec_limits;
template<> struct iec_limits<IEC_SINT> {
    static constexpr int8_t min() { return -128; }
    static constexpr int8_t max() { return 127; }
};
// ... etc
```

### 4. Type Promotion Rules

**Traits for determining result types of operations**:

```cpp
// Result type of arithmetic operations
template<typename T1, typename T2>
struct iec_common_type;

// Same types -> same result
template<typename T>
struct iec_common_type<T, T> { using type = T; };

// INT + REAL -> REAL
template<>
struct iec_common_type<IEC_INT, IEC_REAL> { using type = IEC_REAL; };

// Smaller int + larger int -> larger int
template<>
struct iec_common_type<IEC_SINT, IEC_INT> { using type = IEC_INT; };

// ... etc

template<typename T1, typename T2>
using iec_common_type_t = typename iec_common_type<T1, T2>::type;
```

### 5. Unit Tests

**Test File**: `tests/unit/test_iec_traits.cpp`

Test cases:
- Type category membership for all types
- Concept satisfaction (C++20)
- Type size traits
- Underlying type traits
- Type promotion rules
- Compile-time trait evaluation

## Success Criteria

- All IEC type categories are represented as C++ traits
- Type traits are evaluated at compile time (no runtime overhead)
- C++20 concepts work correctly where supported
- C++17 fallback works correctly
- Type promotion rules match IEC 61131-3 specification
- Unit tests achieve >95% coverage
- No compilation warnings with -Wall -Wextra

## Validation Examples

### Example 1: Type Category Checking

```cpp
#include "iec_traits.hpp"

static_assert(is_any_int_v<IEC_INT>, "INT should be ANY_INT");
static_assert(is_any_int_v<IEC_DINT>, "DINT should be ANY_INT");
static_assert(!is_any_int_v<IEC_REAL>, "REAL should not be ANY_INT");

static_assert(is_any_num_v<IEC_INT>, "INT should be ANY_NUM");
static_assert(is_any_num_v<IEC_REAL>, "REAL should be ANY_NUM");
static_assert(!is_any_num_v<IEC_BOOL>, "BOOL should not be ANY_NUM");

static_assert(is_any_bit_v<IEC_BOOL>, "BOOL should be ANY_BIT");
static_assert(is_any_bit_v<IEC_WORD>, "WORD should be ANY_BIT");
static_assert(!is_any_bit_v<IEC_INT>, "INT should not be ANY_BIT");
```

### Example 2: Generic Function with Concepts

```cpp
#include "iec_concepts.hpp"

// Only accepts numeric types
template<AnyNum T>
T multiply(T a, T b) {
    return a * b;
}

void test_concepts() {
    IEC_INT i1 = 10, i2 = 20;
    IEC_INT result_int = multiply(i1, i2);  // OK
    
    IEC_REAL r1 = 1.5, r2 = 2.0;
    IEC_REAL result_real = multiply(r1, r2);  // OK
    
    // IEC_BOOL b1 = true, b2 = false;
    // auto result_bool = multiply(b1, b2);  // Compile error!
}
```

### Example 3: Type Promotion

```cpp
#include "iec_traits.hpp"

void test_promotion() {
    using Result1 = iec_common_type_t<IEC_INT, IEC_INT>;
    static_assert(std::is_same_v<Result1, IEC_INT>);
    
    using Result2 = iec_common_type_t<IEC_INT, IEC_REAL>;
    static_assert(std::is_same_v<Result2, IEC_REAL>);
    
    using Result3 = iec_common_type_t<IEC_SINT, IEC_DINT>;
    static_assert(std::is_same_v<Result3, IEC_DINT>);
}
```

### Example 4: SFINAE-based Overloading (C++17)

```cpp
#include "iec_traits.hpp"

// Overload for integer types
template<typename T, REQUIRES_ANY_INT(T)>
T divide(T a, T b) {
    return a / b;  // Integer division
}

// Overload for real types
template<typename T, REQUIRES_ANY_REAL(T)>
T divide(T a, T b) {
    return a / b;  // Floating-point division
}

void test_overloading() {
    IEC_INT i1 = 7, i2 = 2;
    IEC_INT int_result = divide(i1, i2);  // Uses integer version, result = 3
    
    IEC_REAL r1 = 7.0, r2 = 2.0;
    IEC_REAL real_result = divide(r1, r2);  // Uses real version, result = 3.5
}
```

## Dependencies

- Phase 1.1 (Core IEC Type Wrappers) must be complete
- C++17 minimum, C++20 preferred for concepts
- Standard library headers: `<type_traits>`

## Output Files

```
include/
├── iec_types.hpp       # From Phase 1.1
├── iec_traits.hpp      # Type traits
└── iec_concepts.hpp    # C++20 concepts (optional)

tests/unit/
├── test_iec_types.cpp  # From Phase 1.1
└── test_iec_traits.cpp # Type traits tests
```

## Notes

### Design Decisions

1. **Traits vs. Inheritance**: Using type traits instead of class inheritance allows compile-time type checking without runtime overhead. IEC types don't need to inherit from a common base class.

2. **Concepts vs. SFINAE**: C++20 concepts provide cleaner syntax and better error messages. The SFINAE fallback ensures compatibility with C++17 compilers.

3. **Explicit Specializations**: Each type is explicitly specialized rather than using automatic detection. This ensures the type hierarchy exactly matches IEC 61131-3.

4. **Type Promotion**: The promotion rules follow IEC 61131-3 semantics, not C++ implicit conversion rules. This may differ from what C++ would naturally do.

### Comparison with MatIEC

| Aspect | MatIEC | STruC++ |
|--------|--------|---------|
| Type Categories | Macro expansion | Type traits |
| Compile-time Checking | Limited | Full |
| Error Messages | Macro errors | Clear concept errors |
| Extensibility | Add to macro | Add specialization |
| Debugging | Difficult | Standard C++ |
| Code Generation | Macro-based | Template instantiation |

### Future Extensions

The type traits system can be extended to support:
- User-defined types (structs, enums)
- Array types
- Reference types (REF_TO)
- Function block types
