# Phase 1.1: Core IEC Type Wrappers

**Status**: COMPLETED

**Duration**: 1-2 weeks

**Goal**: Implement C++ wrapper classes for all IEC 61131-3 v3 base types with integrated forcing support

## Overview

This sub-phase establishes the foundational type system for STruC++. Unlike MatIEC's macro-based approach using simple C typedefs with separate wrapper structs, STruC++ uses C++ template classes that encapsulate both the value and forcing mechanism in a clean, type-safe design.

## Scope

### IEC Base Types to Implement

The following IEC 61131-3 v3 base types must be wrapped:

**Boolean Type**:
- `BOOL` - Boolean (true/false)

**Integer Types**:
- `SINT` - Short integer (8-bit signed)
- `INT` - Integer (16-bit signed)
- `DINT` - Double integer (32-bit signed)
- `LINT` - Long integer (64-bit signed)
- `USINT` - Unsigned short integer (8-bit unsigned)
- `UINT` - Unsigned integer (16-bit unsigned)
- `UDINT` - Unsigned double integer (32-bit unsigned)
- `ULINT` - Unsigned long integer (64-bit unsigned)

**Floating Point Types**:
- `REAL` - Single precision (32-bit IEEE 754)
- `LREAL` - Double precision (64-bit IEEE 754)

**Bit String Types**:
- `BYTE` - 8-bit bit string
- `WORD` - 16-bit bit string
- `DWORD` - 32-bit bit string
- `LWORD` - 64-bit bit string

### MatIEC Reference

MatIEC defines types in `lib/C/iec_types.h` as simple typedefs:

```c
typedef uint8_t  IEC_BOOL;
typedef int8_t   IEC_SINT;
typedef int16_t  IEC_INT;
typedef int32_t  IEC_DINT;
typedef int64_t  IEC_LINT;
// ... etc
```

And creates wrapper structs in `lib/C/iec_types_all.h` for forcing support:

```c
#define __DECLARE_IEC_TYPE(type)\
typedef IEC_##type type;\
\
typedef struct {\
  IEC_##type value;\
  IEC_BYTE flags;\
} __IEC_##type##_t;\
\
typedef struct {\
  IEC_##type *value;\
  IEC_BYTE flags;\
  IEC_##type fvalue;\
} __IEC_##type##_p;
```

### STruC++ Design

STruC++ uses a single template class that combines value storage and forcing:

```cpp
template<typename T>
class IECVar {
private:
    T value_;
    T forced_value_;
    uint8_t flags_;
    
public:
    // Implicit conversion for reading
    operator T() const {
        return (flags_ & FORCE_FLAG) ? forced_value_ : value_;
    }
    
    // Assignment respects forcing
    IECVar& operator=(const T& new_value) {
        if (!(flags_ & FORCE_FLAG)) {
            value_ = new_value;
        }
        return *this;
    }
    
    // Forcing API
    void force(const T& val);
    void unforce();
    bool is_forced() const;
    
    // Debug/monitoring API
    T get_actual() const;  // Returns value_ regardless of forcing
    T get_forced() const;  // Returns forced_value_
};
```

## Deliverables

### 1. Core Header Files

**`include/iec_types.hpp`**:
- Template class `IECVar<T>` with forcing support
- Type aliases for all IEC base types:
  ```cpp
  using IEC_BOOL = IECVar<bool>;
  using IEC_SINT = IECVar<int8_t>;
  using IEC_INT = IECVar<int16_t>;
  using IEC_DINT = IECVar<int32_t>;
  using IEC_LINT = IECVar<int64_t>;
  using IEC_USINT = IECVar<uint8_t>;
  using IEC_UINT = IECVar<uint16_t>;
  using IEC_UDINT = IECVar<uint32_t>;
  using IEC_ULINT = IECVar<uint64_t>;
  using IEC_REAL = IECVar<float>;
  using IEC_LREAL = IECVar<double>;
  using IEC_BYTE = IECVar<uint8_t>;
  using IEC_WORD = IECVar<uint16_t>;
  using IEC_DWORD = IECVar<uint32_t>;
  using IEC_LWORD = IECVar<uint64_t>;
  ```

### 2. Forcing Mechanism

**Flag Constants**:
```cpp
constexpr uint8_t IEC_FORCE_FLAG  = 0x01;  // Variable is forced
constexpr uint8_t IEC_RETAIN_FLAG = 0x02;  // Variable is retained
constexpr uint8_t IEC_OUTPUT_FLAG = 0x04;  // Variable is an output
constexpr uint8_t IEC_DEBUG_FLAG  = 0x08;  // Variable is being monitored
```

**Forcing API**:
- `force(value)` - Force variable to specific value
- `unforce()` - Remove forcing, return to normal operation
- `is_forced()` - Check if variable is currently forced
- `get_actual()` - Get the actual (non-forced) value for monitoring
- `get_forced()` - Get the forced value

### 3. Operator Overloads

Each type wrapper must support:
- Implicit conversion to underlying type (for reading)
- Assignment operator (respects forcing)
- Comparison operators (==, !=, <, >, <=, >=)
- Arithmetic operators where applicable (+, -, *, /, %)
- Bitwise operators for bit string types (&, |, ^, ~, <<, >>)
- Compound assignment operators (+=, -=, *=, /=, etc.)

### 4. Unit Tests

**Test File**: `tests/unit/test_iec_types.cpp`

Test cases:
- Construction and initialization for each type
- Value assignment and retrieval
- Forcing and unforcing behavior
- Operator correctness
- Type conversion safety
- Edge cases (overflow, underflow, precision)

## Success Criteria

- All 16 IEC base types are implemented as C++ wrapper classes
- Forcing mechanism works correctly (forced variables ignore assignments)
- Implicit conversion allows natural usage in expressions
- All operators work correctly and respect forcing
- Unit tests achieve >95% code coverage
- No memory overhead beyond value + forced_value + flags (17 bytes for 64-bit types)
- Compilation with -Wall -Wextra produces no warnings

## Validation Examples

### Example 1: Basic Usage

```cpp
#include "iec_types.hpp"

void test_basic_usage() {
    IEC_INT counter;
    counter = 0;
    counter = counter + 1;  // counter is now 1
    
    int native = counter;   // Implicit conversion
    assert(native == 1);
}
```

### Example 2: Forcing Behavior

```cpp
void test_forcing() {
    IEC_BOOL output;
    output = false;
    
    // Force to true
    output.force(true);
    assert(output == true);
    
    // Assignment is ignored while forced
    output = false;
    assert(output == true);  // Still true!
    
    // Unforce returns to normal
    output.unforce();
    output = false;
    assert(output == false);
}
```

### Example 3: Arithmetic Operations

```cpp
void test_arithmetic() {
    IEC_DINT a = 100;
    IEC_DINT b = 50;
    
    IEC_DINT sum = a + b;      // 150
    IEC_DINT diff = a - b;     // 50
    IEC_DINT prod = a * b;     // 5000
    IEC_DINT quot = a / b;     // 2
    
    a += 10;                   // a is now 110
    assert(a == 110);
}
```

### Example 4: Bit String Operations

```cpp
void test_bitwise() {
    IEC_WORD flags = 0x00FF;
    IEC_WORD mask = 0x0F0F;
    
    IEC_WORD result = flags & mask;  // 0x000F
    result = flags | mask;           // 0x0FFF
    result = flags ^ mask;           // 0x0FF0
    result = ~flags;                 // 0xFF00
    result = flags << 4;             // 0x0FF0
    result = flags >> 4;             // 0x000F
}
```

## Dependencies

- C++17 or later (for `if constexpr`, structured bindings)
- Standard library headers: `<cstdint>`, `<type_traits>`

## Output Files

```
include/
└── iec_types.hpp       # All type wrappers and forcing mechanism

tests/unit/
└── test_iec_types.cpp  # Unit tests for type wrappers
```

## Notes

### Design Decisions

1. **Single Template vs. Multiple Classes**: Using a single `IECVar<T>` template reduces code duplication while allowing type-specific behavior through template specialization if needed.

2. **Implicit Conversion**: Allowing implicit conversion to the underlying type enables natural usage in expressions without explicit `.value()` calls. This matches how IEC variables behave in ST code.

3. **Forcing in Wrapper**: Unlike MatIEC which handles forcing through accessor macros, STruC++ integrates forcing directly into the type wrapper. This provides better encapsulation and type safety.

4. **No Virtual Functions**: The wrapper class uses no virtual functions to avoid vtable overhead, keeping the types suitable for real-time applications.

### Comparison with MatIEC

| Aspect | MatIEC | STruC++ |
|--------|--------|---------|
| Type Definition | C typedef + macro | C++ template class |
| Forcing | External macros | Integrated in wrapper |
| Type Safety | Weak (C) | Strong (C++) |
| Operator Support | Manual | Automatic via overloads |
| Memory Layout | struct with flags | class with flags |
| Extensibility | Macro expansion | Template specialization |
