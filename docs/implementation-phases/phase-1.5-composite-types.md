# Phase 1.5: Composite Types

**Status**: COMPLETED

**Duration**: 1-2 weeks

**Goal**: Implement C++ support for IEC 61131-3 composite types: arrays, structures, and enumerations

## Overview

Composite types allow users to create complex data structures in IEC 61131-3. This sub-phase implements the runtime support for arrays, structures (STRUCT), and enumerations (ENUM). These types must integrate with the forcing mechanism and support the type traits system from Phase 1.2.

## Scope

### IEC Composite Types

**Arrays**:
- Single-dimensional: `ARRAY[1..10] OF INT`
- Multi-dimensional: `ARRAY[1..5, 1..10] OF REAL`
- Variable bounds (subranges): `ARRAY[start..end] OF type`
- Arrays of any type (including other arrays, structs, FBs)

**Structures**:
- User-defined record types
- Nested structures
- Structures containing arrays
- Syntax: `TYPE name : STRUCT ... END_STRUCT; END_TYPE`

**Enumerations**:
- Named constants with optional values
- Typed enumerations (IEC v3)
- Syntax: `TYPE name : (VAL1, VAL2, VAL3); END_TYPE`

### MatIEC Reference

MatIEC defines arrays in `lib/C/iec_types_all.h`:

```c
#define __DECLARE_ARRAY_TYPE(base, size)\
typedef struct {\
  base table size;\
} __ARRAY_OF_##base##_##size;
```

Array access uses macros:

```c
#define __GET_VAR(name, ...) name.value __VA_ARGS__
// Array access: __GET_VAR(arr, [index])
```

**Important Note**: In MatIEC, array elements are NOT wrapper types (they lack `.flags` and `.value` fields), which means individual array elements cannot be forced. This is a long-standing limitation. STruC++ should address this by making array elements be wrapper types.

### STruC++ Design

STruC++ uses C++ templates for arrays with integrated forcing support:

```cpp
template<typename T, size_t... Dims>
class IEC_ARRAY {
private:
    // For forcing support, elements are IECVar<T>, not raw T
    std::array<IECVar<T>, (Dims * ...)> data_;
    
public:
    // Multi-dimensional access
    IECVar<T>& operator()(size_t... indices);
    const IECVar<T>& operator()(size_t... indices) const;
    
    // Bounds checking
    static constexpr std::array<size_t, sizeof...(Dims)> dimensions();
};
```

## Deliverables

### 1. Array Type Implementation

**`include/iec_array.hpp`**:

```cpp
#pragma once
#include <array>
#include <stdexcept>
#include "iec_types.hpp"

namespace strucpp {

// Array bounds specification
template<int64_t Lower, int64_t Upper>
struct ArrayBounds {
    static constexpr int64_t lower = Lower;
    static constexpr int64_t upper = Upper;
    static constexpr size_t size = Upper - Lower + 1;
    
    static constexpr bool in_bounds(int64_t index) {
        return index >= Lower && index <= Upper;
    }
};

// Single-dimensional array
template<typename T, typename Bounds>
class IEC_ARRAY_1D {
public:
    using element_type = T;
    using bounds_type = Bounds;
    static constexpr size_t size = Bounds::size;
    
private:
    std::array<IECVar<T>, size> data_;
    
public:
    // Default constructor - initializes all elements
    IEC_ARRAY_1D() : data_{} {}
    
    // Initializer list constructor
    IEC_ARRAY_1D(std::initializer_list<T> init);
    
    // Element access (1-based IEC indexing)
    IECVar<T>& operator[](int64_t index);
    const IECVar<T>& operator[](int64_t index) const;
    
    // Bounds-checked access
    IECVar<T>& at(int64_t index);
    const IECVar<T>& at(int64_t index) const;
    
    // Iterators for range-based for loops
    auto begin() { return data_.begin(); }
    auto end() { return data_.end(); }
    auto begin() const { return data_.begin(); }
    auto end() const { return data_.end(); }
    
    // Size information
    static constexpr size_t length() { return size; }
    static constexpr int64_t lower_bound() { return Bounds::lower; }
    static constexpr int64_t upper_bound() { return Bounds::upper; }
    
    // Raw data access (for interop)
    IECVar<T>* data() { return data_.data(); }
    const IECVar<T>* data() const { return data_.data(); }
};

// Multi-dimensional array (2D)
template<typename T, typename Bounds1, typename Bounds2>
class IEC_ARRAY_2D {
public:
    using element_type = T;
    static constexpr size_t rows = Bounds1::size;
    static constexpr size_t cols = Bounds2::size;
    static constexpr size_t total_size = rows * cols;
    
private:
    std::array<IECVar<T>, total_size> data_;
    
    constexpr size_t linear_index(int64_t i, int64_t j) const {
        return (i - Bounds1::lower) * cols + (j - Bounds2::lower);
    }
    
public:
    IEC_ARRAY_2D() : data_{} {}
    
    // Element access (1-based IEC indexing)
    IECVar<T>& operator()(int64_t i, int64_t j);
    const IECVar<T>& operator()(int64_t i, int64_t j) const;
    
    // Bounds-checked access
    IECVar<T>& at(int64_t i, int64_t j);
    const IECVar<T>& at(int64_t i, int64_t j) const;
    
    // Size information
    static constexpr size_t dim1_size() { return rows; }
    static constexpr size_t dim2_size() { return cols; }
};

// Convenience type aliases
template<typename T, int64_t Lower, int64_t Upper>
using Array1D = IEC_ARRAY_1D<T, ArrayBounds<Lower, Upper>>;

template<typename T, int64_t L1, int64_t U1, int64_t L2, int64_t U2>
using Array2D = IEC_ARRAY_2D<T, ArrayBounds<L1, U1>, ArrayBounds<L2, U2>>;

}  // namespace strucpp
```

### 2. Structure Support

**`include/iec_struct.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"

namespace strucpp {

// Base class for generated structs (optional, for RTTI)
class IEC_STRUCT_Base {
public:
    virtual ~IEC_STRUCT_Base() = default;
    
    // Optional: reflection support
    // virtual const char* type_name() const = 0;
    // virtual size_t field_count() const = 0;
};

// Macro for declaring struct fields with forcing support
// Usage: IEC_FIELD(INT, counter)
// Expands to: IECVar<IEC_INT_Value> counter;
#define IEC_FIELD(type, name) IECVar<IEC_##type##_Value> name

// Example generated struct:
// TYPE Point : STRUCT
//     x : REAL;
//     y : REAL;
// END_STRUCT;
// END_TYPE
//
// Generates:
// struct Point : public IEC_STRUCT_Base {
//     IECVar<IEC_REAL_Value> x;
//     IECVar<IEC_REAL_Value> y;
//     
//     Point() : x{}, y{} {}
// };

}  // namespace strucpp
```

**Note**: Actual struct definitions are generated by the compiler based on user TYPE declarations. This file provides the infrastructure and conventions.

### 3. Enumeration Support

**`include/iec_enum.hpp`**:

```cpp
#pragma once
#include <cstdint>
#include <string_view>
#include "iec_types.hpp"

namespace strucpp {

// Base template for IEC enumerations
// Enumerations in IEC 61131-3 are strongly typed
template<typename EnumType>
class IEC_ENUM_Value {
private:
    EnumType value_;
    
public:
    constexpr IEC_ENUM_Value() : value_{} {}
    constexpr IEC_ENUM_Value(EnumType val) : value_(val) {}
    
    // Implicit conversion to underlying enum
    constexpr operator EnumType() const { return value_; }
    
    // Assignment
    IEC_ENUM_Value& operator=(EnumType val) {
        value_ = val;
        return *this;
    }
    
    // Comparison
    constexpr bool operator==(const IEC_ENUM_Value& other) const {
        return value_ == other.value_;
    }
    constexpr bool operator!=(const IEC_ENUM_Value& other) const {
        return value_ != other.value_;
    }
    
    // Get underlying value
    constexpr EnumType get() const { return value_; }
};

// Wrapper with forcing support
template<typename EnumType>
using IEC_ENUM = IECVar<IEC_ENUM_Value<EnumType>>;

// Example generated enumeration:
// TYPE TrafficLight : (RED, YELLOW, GREEN); END_TYPE
//
// Generates:
// enum class TrafficLight : int16_t {
//     RED = 0,
//     YELLOW = 1,
//     GREEN = 2
// };
// using TrafficLight_Var = IEC_ENUM<TrafficLight>;

// Typed enumeration (IEC v3):
// TYPE Status : INT (IDLE := 0, RUNNING := 1, ERROR := -1); END_TYPE
//
// Generates:
// enum class Status : int16_t {
//     IDLE = 0,
//     RUNNING = 1,
//     ERROR = -1
// };

}  // namespace strucpp
```

### 4. Subrange Types

**`include/iec_subrange.hpp`**:

```cpp
#pragma once
#include <stdexcept>
#include "iec_types.hpp"

namespace strucpp {

// Subrange type with compile-time bounds
template<typename BaseType, auto Lower, auto Upper>
class IEC_SUBRANGE_Value {
private:
    BaseType value_;
    
    static constexpr bool in_range(BaseType val) {
        return val >= Lower && val <= Upper;
    }
    
public:
    static constexpr auto lower_bound = Lower;
    static constexpr auto upper_bound = Upper;
    
    constexpr IEC_SUBRANGE_Value() : value_(Lower) {}
    
    constexpr IEC_SUBRANGE_Value(BaseType val) : value_(val) {
        // Note: In release builds, this check may be disabled
        // for performance in real-time systems
        #ifdef IEC_RANGE_CHECK
        if (!in_range(val)) {
            // Handle out-of-range (implementation-defined)
        }
        #endif
    }
    
    // Implicit conversion to base type
    constexpr operator BaseType() const { return value_; }
    
    // Assignment with range check
    IEC_SUBRANGE_Value& operator=(BaseType val) {
        #ifdef IEC_RANGE_CHECK
        if (!in_range(val)) {
            // Handle out-of-range
        }
        #endif
        value_ = val;
        return *this;
    }
    
    // Arithmetic operators (result is base type, not subrange)
    BaseType operator+(const IEC_SUBRANGE_Value& other) const {
        return value_ + other.value_;
    }
    // ... other operators
};

// Wrapper with forcing support
template<typename BaseType, auto Lower, auto Upper>
using IEC_SUBRANGE = IECVar<IEC_SUBRANGE_Value<BaseType, Lower, Upper>>;

// Example:
// TYPE Percentage : INT (0..100); END_TYPE
//
// Generates:
// using Percentage = IEC_SUBRANGE<int16_t, 0, 100>;

}  // namespace strucpp
```

### 5. Type Traits Extensions

**Update `include/iec_traits.hpp`**:

```cpp
// Add traits for composite types

template<typename T> struct is_iec_array : std::false_type {};
template<typename T, typename B>
struct is_iec_array<IEC_ARRAY_1D<T, B>> : std::true_type {};
template<typename T, typename B1, typename B2>
struct is_iec_array<IEC_ARRAY_2D<T, B1, B2>> : std::true_type {};

template<typename T> struct is_iec_struct : std::false_type {};
// Specializations added for each generated struct

template<typename T> struct is_iec_enum : std::false_type {};
template<typename E>
struct is_iec_enum<IEC_ENUM_Value<E>> : std::true_type {};

template<typename T> struct is_iec_subrange : std::false_type {};
template<typename B, auto L, auto U>
struct is_iec_subrange<IEC_SUBRANGE_Value<B, L, U>> : std::true_type {};

// ANY_DERIVED category
template<typename T>
struct is_any_derived : std::bool_constant<
    is_iec_array<T>::value ||
    is_iec_struct<T>::value ||
    is_iec_enum<T>::value ||
    is_iec_subrange<T>::value
> {};
```

### 6. Unit Tests

**Test File**: `tests/unit/test_iec_composite.cpp`

Test cases:
- Array construction and initialization
- Array element access (1-based indexing)
- Array bounds checking
- Multi-dimensional array access
- Array element forcing
- Struct field access
- Struct field forcing
- Enumeration values
- Enumeration comparison
- Subrange bounds checking
- Nested structures
- Arrays of structures
- Structures containing arrays

## Success Criteria

- Arrays support 1-based indexing (IEC convention)
- Array elements can be individually forced (unlike MatIEC)
- Multi-dimensional arrays work correctly
- Structures support nested types
- Enumerations are strongly typed
- Subranges enforce bounds (optionally)
- Type traits correctly identify composite types
- Unit tests achieve >95% coverage
- No memory safety issues
- Compilation with -Wall -Wextra produces no warnings

## Validation Examples

### Example 1: Single-Dimensional Array

```cpp
#include "iec_array.hpp"

void test_1d_array() {
    // ARRAY[1..10] OF INT
    Array1D<IEC_INT_Value, 1, 10> values;
    
    // Initialize
    for (int64_t i = 1; i <= 10; ++i) {
        values[i] = static_cast<int16_t>(i * 10);
    }
    
    assert(values[1] == 10);
    assert(values[10] == 100);
    
    // Force individual element
    values[5].force(999);
    values[5] = 50;  // Ignored
    assert(values[5] == 999);
}
```

### Example 2: Multi-Dimensional Array

```cpp
void test_2d_array() {
    // ARRAY[1..3, 1..4] OF REAL
    Array2D<IEC_REAL_Value, 1, 3, 1, 4> matrix;
    
    // Initialize
    for (int64_t i = 1; i <= 3; ++i) {
        for (int64_t j = 1; j <= 4; ++j) {
            matrix(i, j) = static_cast<float>(i * 10 + j);
        }
    }
    
    assert(matrix(1, 1) == 11.0f);
    assert(matrix(3, 4) == 34.0f);
}
```

### Example 3: Structure

```cpp
// Generated from:
// TYPE Point : STRUCT
//     x : REAL;
//     y : REAL;
// END_STRUCT;
// END_TYPE

struct Point {
    IECVar<IEC_REAL_Value> x;
    IECVar<IEC_REAL_Value> y;
};

void test_struct() {
    Point p;
    p.x = 10.5f;
    p.y = 20.5f;
    
    assert(p.x == 10.5f);
    assert(p.y == 20.5f);
    
    // Force individual field
    p.x.force(100.0f);
    p.x = 0.0f;  // Ignored
    assert(p.x == 100.0f);
}
```

### Example 4: Enumeration

```cpp
// Generated from:
// TYPE State : (IDLE, RUNNING, STOPPED, ERROR); END_TYPE

enum class State : int16_t {
    IDLE = 0,
    RUNNING = 1,
    STOPPED = 2,
    ERROR = 3
};

void test_enum() {
    IEC_ENUM<State> current_state;
    current_state = State::IDLE;
    
    assert(current_state == State::IDLE);
    
    current_state = State::RUNNING;
    assert(current_state == State::RUNNING);
    
    // Force
    current_state.force(State::ERROR);
    current_state = State::IDLE;  // Ignored
    assert(current_state == State::ERROR);
}
```

### Example 5: Array of Structures

```cpp
void test_array_of_struct() {
    // ARRAY[1..5] OF Point
    Array1D<Point, 1, 5> points;
    
    for (int64_t i = 1; i <= 5; ++i) {
        points[i].x = static_cast<float>(i);
        points[i].y = static_cast<float>(i * 2);
    }
    
    assert(points[3].x == 3.0f);
    assert(points[3].y == 6.0f);
    
    // Force field within array element
    points[2].x.force(100.0f);
    assert(points[2].x == 100.0f);
}
```

### Example 6: Subrange

```cpp
void test_subrange() {
    // TYPE Percentage : INT (0..100); END_TYPE
    IEC_SUBRANGE<int16_t, 0, 100> percent;
    
    percent = 50;
    assert(percent == 50);
    
    percent = 100;
    assert(percent == 100);
    
    // With range checking enabled:
    // percent = 150;  // Would trigger range error
}
```

## Dependencies

- Phase 1.1 (Core IEC Type Wrappers) must be complete
- Phase 1.2 (Type Categories and Traits) must be complete
- C++17 or later
- Standard library headers: `<array>`, `<cstdint>`, `<type_traits>`

## Output Files

```
include/
├── iec_types.hpp       # From Phase 1.1
├── iec_traits.hpp      # From Phase 1.2 (updated)
├── iec_time.hpp        # From Phase 1.3
├── iec_string.hpp      # From Phase 1.4
├── iec_array.hpp       # Array types
├── iec_struct.hpp      # Structure support
├── iec_enum.hpp        # Enumeration support
└── iec_subrange.hpp    # Subrange types

tests/unit/
├── test_iec_types.cpp
├── test_iec_traits.cpp
├── test_iec_time.cpp
├── test_iec_string.cpp
└── test_iec_composite.cpp  # Composite type tests
```

## Notes

### Design Decisions

1. **Array Elements as Wrappers**: Unlike MatIEC where array elements cannot be forced, STruC++ makes array elements be `IECVar<T>` so each element can be individually forced. This addresses a long-standing MatIEC limitation.

2. **1-Based Indexing**: IEC 61131-3 uses 1-based array indexing. The array classes translate this to 0-based internal storage.

3. **Compile-Time Bounds**: Array bounds are template parameters, allowing compile-time size calculation and bounds checking.

4. **Generated Structures**: Actual struct definitions are generated by the compiler. This file provides the infrastructure and conventions that generated code will follow.

5. **Strongly Typed Enums**: Using C++ `enum class` ensures type safety and prevents implicit conversions.

### Comparison with MatIEC

| Aspect | MatIEC | STruC++ |
|--------|--------|---------|
| Array Elements | Raw values (no forcing) | Wrapper types (forceable) |
| Array Bounds | Runtime | Compile-time template |
| Structs | C structs | C++ classes |
| Enums | C enums | C++ enum class |
| Type Safety | Weak | Strong |
| Multi-dimensional | Macro-based | Template-based |

### Real-Time Considerations

- All array operations are O(1) for access
- No dynamic memory allocation
- Bounds checking can be disabled for release builds
- Memory layout is contiguous and predictable
- Suitable for hard real-time applications

### Limitations

- Maximum array dimensions limited by template recursion depth
- Very large arrays may increase compile time
- Struct reflection is limited (no runtime field enumeration)
