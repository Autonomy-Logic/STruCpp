# Phase 1.6: Standard Functions and Library

**Status**: PENDING

**Duration**: 2-3 weeks

**Goal**: Implement IEC 61131-3 standard functions including numeric, type conversion, and variadic functions using C++ templates

## Overview

This sub-phase implements the IEC 61131-3 standard function library. Unlike MatIEC's macro-heavy approach, STruC++ uses C++ templates and function overloading to provide type-safe, efficient implementations. The standard library is designed to be compiled from canonical ST source where possible, with intrinsic functions implemented directly in C++.

## Scope

### Standard Function Categories

**Numeric Functions**:
- Arithmetic: ABS, SQRT, LN, LOG, EXP, EXPT (power)
- Trigonometric: SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2
- Rounding: TRUNC, ROUND (IEC v3)

**Type Conversion Functions**:
- Integer conversions: INT_TO_DINT, DINT_TO_INT, etc.
- Real conversions: INT_TO_REAL, REAL_TO_INT, etc.
- String conversions: INT_TO_STRING, STRING_TO_INT, etc.
- Time conversions: TIME_TO_DINT, DINT_TO_TIME, etc.
- BCD conversions: BCD_TO_INT, INT_TO_BCD

**Bit String Functions**:
- Shift: SHL, SHR
- Rotate: ROL, ROR
- Bit access (IEC v3)

**Selection Functions**:
- SEL (binary selection)
- MAX, MIN (variadic)
- LIMIT (range limiting)
- MUX (multiplexer)

**Comparison Functions**:
- GT, GE, EQ, LE, LT, NE (variadic)

**Variadic Arithmetic Functions**:
- ADD, MUL (variable argument count)
- AND, OR, XOR (for bit strings)

### MatIEC Reference

MatIEC implements standard functions in `lib/C/iec_std_functions.h` using macros:

```c
// Type conversion macro
#define __convert_type(from, to, ...) \
static inline to from##_TO_##to(EN_ENO_PARAMS, from op) {\
  TEST_EN(to)\
  return (to)op;\
}

// Variadic ADD using macro expansion
#define __arith_expand(fname, TYPENAME, OP) \
static inline TYPENAME fname##TYPENAME(EN_ENO_PARAMS, UINT param_count, TYPENAME op1, ...){\
  va_list ap;\
  UINT i;\
  TEST_EN(TYPENAME)\
  va_start(ap, op1);\
  for(i = 1; i < param_count; i++){\
    op1 = op1 OP va_arg(ap, VA_ARGS_##TYPENAME);\
  }\
  va_end(ap);\
  return op1;\
}
```

### STruC++ Design

STruC++ uses C++ templates and variadic templates:

```cpp
// Type conversion using templates
template<typename To, typename From>
constexpr To convert(From value) {
    return static_cast<To>(value);
}

// Variadic ADD using fold expressions (C++17)
template<AnyNum T, AnyNum... Args>
constexpr auto ADD(T first, Args... rest) {
    return (first + ... + rest);
}

// Or using variadic templates for mixed types
template<typename T>
constexpr T ADD(T value) { return value; }

template<typename T, typename... Args>
constexpr auto ADD(T first, Args... rest) {
    return first + ADD(rest...);
}
```

## Deliverables

### 1. Numeric Functions

**`include/iec_numeric.hpp`**:

```cpp
#pragma once
#include <cmath>
#include "iec_types.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// Absolute value
template<AnyNum T>
constexpr T ABS(T value) {
    if constexpr (is_any_uint_v<T>) {
        return value;  // Unsigned types are always positive
    } else {
        return value < T{0} ? -value : value;
    }
}

// Square root (only for ANY_REAL)
template<AnyReal T>
T SQRT(T value) {
    return static_cast<T>(std::sqrt(static_cast<double>(value)));
}

// Natural logarithm
template<AnyReal T>
T LN(T value) {
    return static_cast<T>(std::log(static_cast<double>(value)));
}

// Base-10 logarithm
template<AnyReal T>
T LOG(T value) {
    return static_cast<T>(std::log10(static_cast<double>(value)));
}

// Exponential (e^x)
template<AnyReal T>
T EXP(T value) {
    return static_cast<T>(std::exp(static_cast<double>(value)));
}

// Power (base^exponent)
template<AnyReal T>
T EXPT(T base, T exponent) {
    return static_cast<T>(std::pow(static_cast<double>(base), 
                                    static_cast<double>(exponent)));
}

// Trigonometric functions
template<AnyReal T>
T SIN(T value) {
    return static_cast<T>(std::sin(static_cast<double>(value)));
}

template<AnyReal T>
T COS(T value) {
    return static_cast<T>(std::cos(static_cast<double>(value)));
}

template<AnyReal T>
T TAN(T value) {
    return static_cast<T>(std::tan(static_cast<double>(value)));
}

template<AnyReal T>
T ASIN(T value) {
    return static_cast<T>(std::asin(static_cast<double>(value)));
}

template<AnyReal T>
T ACOS(T value) {
    return static_cast<T>(std::acos(static_cast<double>(value)));
}

template<AnyReal T>
T ATAN(T value) {
    return static_cast<T>(std::atan(static_cast<double>(value)));
}

template<AnyReal T>
T ATAN2(T y, T x) {
    return static_cast<T>(std::atan2(static_cast<double>(y), 
                                      static_cast<double>(x)));
}

// Truncation (toward zero)
template<AnyReal T>
T TRUNC(T value) {
    return static_cast<T>(std::trunc(static_cast<double>(value)));
}

// Rounding (to nearest integer)
template<AnyReal T>
T ROUND(T value) {
    return static_cast<T>(std::round(static_cast<double>(value)));
}

}  // namespace strucpp
```

### 2. Type Conversion Functions

**`include/iec_conversions.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"
#include "iec_traits.hpp"
#include "iec_string.hpp"
#include "iec_time.hpp"

namespace strucpp {

// Generic conversion template
template<typename To, typename From>
constexpr To IEC_CONVERT(From value);

// Integer to integer conversions
// SINT_TO_INT, INT_TO_DINT, etc.
#define DEFINE_INT_CONVERSION(FROM, TO) \
template<> \
constexpr IEC_##TO##_Value IEC_CONVERT<IEC_##TO##_Value, IEC_##FROM##_Value>( \
    IEC_##FROM##_Value value) { \
    return static_cast<IEC_##TO##_Value>(value); \
}

// Integer to real conversions
// INT_TO_REAL, DINT_TO_LREAL, etc.
template<AnyInt From, AnyReal To>
constexpr To INT_TO_REAL_impl(From value) {
    return static_cast<To>(value);
}

// Real to integer conversions (truncation)
// REAL_TO_INT, LREAL_TO_DINT, etc.
template<AnyReal From, AnyInt To>
constexpr To REAL_TO_INT_impl(From value) {
    return static_cast<To>(std::trunc(value));
}

// Named conversion functions (IEC style)
inline IEC_INT_Value SINT_TO_INT(IEC_SINT_Value v) { return static_cast<int16_t>(v); }
inline IEC_DINT_Value INT_TO_DINT(IEC_INT_Value v) { return static_cast<int32_t>(v); }
inline IEC_LINT_Value DINT_TO_LINT(IEC_DINT_Value v) { return static_cast<int64_t>(v); }
inline IEC_SINT_Value INT_TO_SINT(IEC_INT_Value v) { return static_cast<int8_t>(v); }
inline IEC_INT_Value DINT_TO_INT(IEC_DINT_Value v) { return static_cast<int16_t>(v); }
inline IEC_DINT_Value LINT_TO_DINT(IEC_LINT_Value v) { return static_cast<int32_t>(v); }

// Unsigned conversions
inline IEC_UINT_Value USINT_TO_UINT(IEC_USINT_Value v) { return static_cast<uint16_t>(v); }
inline IEC_UDINT_Value UINT_TO_UDINT(IEC_UINT_Value v) { return static_cast<uint32_t>(v); }
inline IEC_ULINT_Value UDINT_TO_ULINT(IEC_UDINT_Value v) { return static_cast<uint64_t>(v); }

// Real conversions
inline IEC_REAL_Value INT_TO_REAL(IEC_INT_Value v) { return static_cast<float>(v); }
inline IEC_REAL_Value DINT_TO_REAL(IEC_DINT_Value v) { return static_cast<float>(v); }
inline IEC_LREAL_Value INT_TO_LREAL(IEC_INT_Value v) { return static_cast<double>(v); }
inline IEC_LREAL_Value DINT_TO_LREAL(IEC_DINT_Value v) { return static_cast<double>(v); }
inline IEC_LREAL_Value REAL_TO_LREAL(IEC_REAL_Value v) { return static_cast<double>(v); }
inline IEC_REAL_Value LREAL_TO_REAL(IEC_LREAL_Value v) { return static_cast<float>(v); }

inline IEC_INT_Value REAL_TO_INT(IEC_REAL_Value v) { return static_cast<int16_t>(std::trunc(v)); }
inline IEC_DINT_Value REAL_TO_DINT(IEC_REAL_Value v) { return static_cast<int32_t>(std::trunc(v)); }
inline IEC_INT_Value LREAL_TO_INT(IEC_LREAL_Value v) { return static_cast<int16_t>(std::trunc(v)); }
inline IEC_DINT_Value LREAL_TO_DINT(IEC_LREAL_Value v) { return static_cast<int32_t>(std::trunc(v)); }

// Boolean conversions
inline IEC_BOOL_Value INT_TO_BOOL(IEC_INT_Value v) { return v != 0; }
inline IEC_INT_Value BOOL_TO_INT(IEC_BOOL_Value v) { return v ? 1 : 0; }

// Time conversions
inline IEC_TIME_Value DINT_TO_TIME(IEC_DINT_Value ms) { 
    return IEC_TIME_Value::from_milliseconds(ms); 
}
inline IEC_DINT_Value TIME_TO_DINT(const IEC_TIME_Value& t) { 
    return static_cast<int32_t>(t.milliseconds()); 
}

// String conversions (basic implementations)
template<size_t MaxLen>
IEC_STRING_Value<MaxLen> INT_TO_STRING(IEC_INT_Value v);

template<size_t MaxLen>
IEC_INT_Value STRING_TO_INT(const IEC_STRING_Value<MaxLen>& s);

// BCD conversions
inline IEC_INT_Value BCD_TO_INT(IEC_WORD_Value bcd);
inline IEC_WORD_Value INT_TO_BCD(IEC_INT_Value value);

}  // namespace strucpp
```

### 3. Bit String Functions

**`include/iec_bitstring.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// Shift left
template<AnyBit T>
constexpr T SHL(T value, IEC_UINT_Value n) {
    return static_cast<T>(static_cast<iec_underlying_type_t<T>>(value) << n);
}

// Shift right
template<AnyBit T>
constexpr T SHR(T value, IEC_UINT_Value n) {
    return static_cast<T>(static_cast<iec_underlying_type_t<T>>(value) >> n);
}

// Rotate left
template<AnyBit T>
constexpr T ROL(T value, IEC_UINT_Value n) {
    constexpr size_t bits = iec_bit_size_v<T>;
    n = n % bits;
    auto v = static_cast<iec_underlying_type_t<T>>(value);
    return static_cast<T>((v << n) | (v >> (bits - n)));
}

// Rotate right
template<AnyBit T>
constexpr T ROR(T value, IEC_UINT_Value n) {
    constexpr size_t bits = iec_bit_size_v<T>;
    n = n % bits;
    auto v = static_cast<iec_underlying_type_t<T>>(value);
    return static_cast<T>((v >> n) | (v << (bits - n)));
}

// Bitwise NOT
template<AnyBit T>
constexpr T NOT(T value) {
    return static_cast<T>(~static_cast<iec_underlying_type_t<T>>(value));
}

// Bitwise AND (variadic)
template<AnyBit T>
constexpr T AND(T value) { return value; }

template<AnyBit T, AnyBit... Args>
constexpr T AND(T first, Args... rest) {
    return static_cast<T>(static_cast<iec_underlying_type_t<T>>(first) & 
                          static_cast<iec_underlying_type_t<T>>(AND(rest...)));
}

// Bitwise OR (variadic)
template<AnyBit T>
constexpr T OR(T value) { return value; }

template<AnyBit T, AnyBit... Args>
constexpr T OR(T first, Args... rest) {
    return static_cast<T>(static_cast<iec_underlying_type_t<T>>(first) | 
                          static_cast<iec_underlying_type_t<T>>(OR(rest...)));
}

// Bitwise XOR (variadic)
template<AnyBit T>
constexpr T XOR(T value) { return value; }

template<AnyBit T, AnyBit... Args>
constexpr T XOR(T first, Args... rest) {
    return static_cast<T>(static_cast<iec_underlying_type_t<T>>(first) ^ 
                          static_cast<iec_underlying_type_t<T>>(XOR(rest...)));
}

}  // namespace strucpp
```

### 4. Selection Functions

**`include/iec_selection.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// Binary selection: SEL(G, IN0, IN1) returns IN0 if G=FALSE, IN1 if G=TRUE
template<typename T>
constexpr T SEL(IEC_BOOL_Value g, T in0, T in1) {
    return g ? in1 : in0;
}

// Maximum (variadic)
template<typename T>
constexpr T MAX(T value) { return value; }

template<typename T, typename... Args>
constexpr T MAX(T first, T second, Args... rest) {
    return MAX((first > second) ? first : second, rest...);
}

// Minimum (variadic)
template<typename T>
constexpr T MIN(T value) { return value; }

template<typename T, typename... Args>
constexpr T MIN(T first, T second, Args... rest) {
    return MIN((first < second) ? first : second, rest...);
}

// Limit: LIMIT(MN, IN, MX) returns IN clamped to [MN, MX]
template<typename T>
constexpr T LIMIT(T mn, T in, T mx) {
    if (in < mn) return mn;
    if (in > mx) return mx;
    return in;
}

// Multiplexer: MUX(K, IN0, IN1, ..., INn) returns INk
// K is 0-based index
template<typename T>
constexpr T MUX(IEC_UINT_Value k, T in0) {
    return in0;  // Only one input
}

template<typename T, typename... Args>
constexpr T MUX(IEC_UINT_Value k, T in0, Args... rest) {
    if (k == 0) return in0;
    return MUX(k - 1, rest...);
}

// MOVE function (identity, but useful for forcing evaluation)
template<typename T>
constexpr T MOVE(T value) {
    return value;
}

}  // namespace strucpp
```

### 5. Comparison Functions

**`include/iec_comparison.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// Greater than (variadic: returns TRUE if all in descending order)
template<typename T>
constexpr IEC_BOOL_Value GT(T a) { return true; }

template<typename T, typename... Args>
constexpr IEC_BOOL_Value GT(T first, T second, Args... rest) {
    if (!(first > second)) return false;
    return GT(second, rest...);
}

// Greater than or equal
template<typename T>
constexpr IEC_BOOL_Value GE(T a) { return true; }

template<typename T, typename... Args>
constexpr IEC_BOOL_Value GE(T first, T second, Args... rest) {
    if (!(first >= second)) return false;
    return GE(second, rest...);
}

// Equal (variadic: returns TRUE if all equal)
template<typename T>
constexpr IEC_BOOL_Value EQ(T a) { return true; }

template<typename T, typename... Args>
constexpr IEC_BOOL_Value EQ(T first, T second, Args... rest) {
    if (!(first == second)) return false;
    return EQ(second, rest...);
}

// Less than or equal
template<typename T>
constexpr IEC_BOOL_Value LE(T a) { return true; }

template<typename T, typename... Args>
constexpr IEC_BOOL_Value LE(T first, T second, Args... rest) {
    if (!(first <= second)) return false;
    return LE(second, rest...);
}

// Less than
template<typename T>
constexpr IEC_BOOL_Value LT(T a) { return true; }

template<typename T, typename... Args>
constexpr IEC_BOOL_Value LT(T first, T second, Args... rest) {
    if (!(first < second)) return false;
    return LT(second, rest...);
}

// Not equal (binary only in IEC)
template<typename T>
constexpr IEC_BOOL_Value NE(T a, T b) {
    return a != b;
}

}  // namespace strucpp
```

### 6. Variadic Arithmetic Functions

**`include/iec_arithmetic.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"
#include "iec_traits.hpp"

namespace strucpp {

// ADD (variadic)
template<AnyNum T>
constexpr T ADD(T value) { return value; }

template<AnyNum T, AnyNum... Args>
constexpr auto ADD(T first, Args... rest) {
    return first + ADD(rest...);
}

// Alternative using C++17 fold expressions
template<AnyNum... Args>
constexpr auto ADD_fold(Args... args) {
    return (args + ...);
}

// MUL (variadic)
template<AnyNum T>
constexpr T MUL(T value) { return value; }

template<AnyNum T, AnyNum... Args>
constexpr auto MUL(T first, Args... rest) {
    return first * MUL(rest...);
}

// SUB (binary only)
template<AnyNum T>
constexpr T SUB(T a, T b) {
    return a - b;
}

// DIV (binary only)
template<AnyNum T>
constexpr T DIV(T a, T b) {
    return a / b;
}

// MOD (modulo, for integers)
template<AnyInt T>
constexpr T MOD(T a, T b) {
    return a % b;
}

// Negation
template<AnyNum T>
constexpr T NEG(T value) {
    return -value;
}

}  // namespace strucpp
```

### 7. Standard Library Header

**`include/iec_stdlib.hpp`**:

```cpp
#pragma once

// Include all standard function headers
#include "iec_numeric.hpp"
#include "iec_conversions.hpp"
#include "iec_bitstring.hpp"
#include "iec_selection.hpp"
#include "iec_comparison.hpp"
#include "iec_arithmetic.hpp"

// String functions are in iec_string.hpp
// Time functions are in iec_time.hpp

namespace strucpp {

// Standard library version
constexpr int IEC_STDLIB_VERSION_MAJOR = 1;
constexpr int IEC_STDLIB_VERSION_MINOR = 0;

}  // namespace strucpp
```

### 8. Unit Tests

**Test File**: `tests/unit/test_iec_stdlib.cpp`

Test cases:
- Numeric functions (ABS, SQRT, trigonometric, etc.)
- Type conversion functions (all combinations)
- Bit string functions (SHL, SHR, ROL, ROR)
- Selection functions (SEL, MAX, MIN, LIMIT, MUX)
- Comparison functions (GT, GE, EQ, LE, LT, NE)
- Variadic arithmetic (ADD, MUL with multiple arguments)
- Edge cases (overflow, division by zero behavior)
- Type safety (compile-time errors for invalid types)

## Success Criteria

- All IEC 61131-3 standard functions are implemented
- Functions use C++ templates for type safety
- Variadic functions work with any number of arguments
- Type conversions handle all IEC type combinations
- Functions are constexpr where possible
- Unit tests achieve >95% coverage
- No runtime overhead compared to hand-written code
- Compilation with -Wall -Wextra produces no warnings

## Validation Examples

### Example 1: Numeric Functions

```cpp
#include "iec_stdlib.hpp"

void test_numeric() {
    IEC_REAL_Value x = 2.0f;
    
    auto sqrt_x = SQRT(x);      // 1.414...
    auto sin_x = SIN(x);        // 0.909...
    auto abs_neg = ABS(-5.0f);  // 5.0
    
    IEC_INT_Value i = -10;
    auto abs_i = ABS(i);        // 10
}
```

### Example 2: Type Conversions

```cpp
void test_conversions() {
    IEC_INT_Value i = 100;
    IEC_REAL_Value r = INT_TO_REAL(i);  // 100.0
    
    IEC_REAL_Value pi = 3.14159f;
    IEC_INT_Value truncated = REAL_TO_INT(pi);  // 3
    
    IEC_DINT_Value ms = 5000;
    IEC_TIME_Value t = DINT_TO_TIME(ms);  // T#5s
}
```

### Example 3: Variadic Functions

```cpp
void test_variadic() {
    // ADD with multiple arguments
    IEC_INT_Value sum = ADD(1, 2, 3, 4, 5);  // 15
    
    // MUL with multiple arguments
    IEC_INT_Value product = MUL(2, 3, 4);  // 24
    
    // MAX with multiple arguments
    IEC_INT_Value maximum = MAX(5, 2, 8, 1, 9, 3);  // 9
    
    // Comparison chain
    IEC_BOOL_Value descending = GT(10, 5, 3, 1);  // TRUE
    IEC_BOOL_Value all_equal = EQ(5, 5, 5, 5);    // TRUE
}
```

### Example 4: Selection Functions

```cpp
void test_selection() {
    IEC_BOOL_Value condition = true;
    IEC_INT_Value result = SEL(condition, 10, 20);  // 20 (condition is TRUE)
    
    IEC_INT_Value clamped = LIMIT(0, 150, 100);  // 100 (clamped to max)
    
    IEC_UINT_Value index = 2;
    IEC_INT_Value mux_result = MUX(index, 10, 20, 30, 40);  // 30 (index 2)
}
```

### Example 5: Bit String Functions

```cpp
void test_bitstring() {
    IEC_WORD_Value w = 0x00FF;
    
    auto shifted_left = SHL(w, 4);   // 0x0FF0
    auto shifted_right = SHR(w, 4);  // 0x000F
    auto rotated = ROL(w, 4);        // 0x0FF0 (for 16-bit)
    
    IEC_WORD_Value a = 0x0F0F;
    IEC_WORD_Value b = 0x00FF;
    auto and_result = AND(a, b);     // 0x000F
    auto or_result = OR(a, b);       // 0x0FFF
    auto xor_result = XOR(a, b);     // 0x0FF0
}
```

## Dependencies

- Phase 1.1 (Core IEC Type Wrappers) must be complete
- Phase 1.2 (Type Categories and Traits) must be complete
- Phase 1.3 (Time and Date Types) for time conversions
- Phase 1.4 (String Types) for string conversions
- C++17 or later (for fold expressions, if constexpr)
- Standard library headers: `<cmath>`, `<type_traits>`

## Output Files

```
include/
├── iec_types.hpp       # From Phase 1.1
├── iec_traits.hpp      # From Phase 1.2
├── iec_time.hpp        # From Phase 1.3
├── iec_string.hpp      # From Phase 1.4
├── iec_array.hpp       # From Phase 1.5
├── iec_numeric.hpp     # Numeric functions
├── iec_conversions.hpp # Type conversion functions
├── iec_bitstring.hpp   # Bit string functions
├── iec_selection.hpp   # Selection functions
├── iec_comparison.hpp  # Comparison functions
├── iec_arithmetic.hpp  # Variadic arithmetic
└── iec_stdlib.hpp      # Combined standard library header

tests/unit/
├── test_iec_types.cpp
├── test_iec_traits.cpp
├── test_iec_time.cpp
├── test_iec_string.cpp
├── test_iec_composite.cpp
└── test_iec_stdlib.cpp  # Standard library tests
```

## Notes

### Design Decisions

1. **Templates over Macros**: Using C++ templates instead of C macros provides type safety, better error messages, and easier debugging.

2. **Constexpr Functions**: Most functions are marked `constexpr` to allow compile-time evaluation where possible.

3. **Variadic Templates**: Using variadic templates for ADD, MUL, MAX, MIN, etc. provides type-safe variable argument handling without the pitfalls of C varargs.

4. **Concepts for Constraints**: Using C++20 concepts (or SFINAE for C++17) ensures functions only accept appropriate types.

5. **Named Functions**: Following IEC naming conventions (INT_TO_REAL, not int_to_real) for compatibility with ST code.

### Comparison with MatIEC

| Aspect | MatIEC | STruC++ |
|--------|--------|---------|
| Implementation | C macros | C++ templates |
| Type Safety | Weak | Strong (concepts) |
| Variadic Functions | C varargs | Variadic templates |
| Compile-time Evaluation | Limited | Full constexpr |
| Error Messages | Macro expansion errors | Clear template errors |
| Code Size | Macro expansion bloat | Template instantiation |

### Real-Time Considerations

- All functions are inline-able
- No dynamic memory allocation
- No exceptions (undefined behavior for invalid inputs like div by zero)
- Deterministic execution time
- Suitable for hard real-time applications

### EN/ENO Support

IEC 61131-3 functions can have optional EN (enable) and ENO (enable out) parameters. In STruC++, these are handled at the code generation level rather than in the runtime library. When EN is FALSE, the function is not called and ENO is set to FALSE.

### Future Extensions

- SIMD optimizations for array operations
- Hardware-specific intrinsics
- Additional IEC v3 functions
- User-defined function registration
