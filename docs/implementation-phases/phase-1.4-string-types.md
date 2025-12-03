# Phase 1.4: String Types

**Status**: PENDING

**Duration**: 1 week

**Goal**: Implement C++ wrapper classes for IEC 61131-3 STRING and WSTRING types with standard string operations

## Overview

String handling in IEC 61131-3 differs significantly from C/C++ strings. IEC strings have a fixed maximum length declared at compile time, and string operations must respect these bounds. This sub-phase implements STRING and WSTRING types that match IEC semantics while providing a clean C++ interface.

## Scope

### IEC String Types

**STRING**:
- Single-byte character string (typically ASCII or ISO 8859-1)
- Fixed maximum length (default 254 characters per IEC 61131-3)
- Length is tracked separately from capacity
- Syntax: `STRING`, `STRING[80]` (custom max length)

**WSTRING**:
- Wide character string (Unicode, typically UTF-16)
- Fixed maximum length (default 254 characters)
- Syntax: `WSTRING`, `WSTRING[100]`

### MatIEC Reference

MatIEC defines strings in `lib/C/iec_types.h`:

```c
#define STR_MAX_LEN 254

typedef struct {
    __strlen_t len;
    u8 body[STR_MAX_LEN];
} IEC_STRING;
```

String operations are implemented as macros and functions in `lib/C/iec_std_lib.h`:

```c
static inline __strlen_t __len(IEC_STRING str) { return str.len; }
static inline IEC_STRING __left(IEC_STRING str, __strlen_t len);
static inline IEC_STRING __right(IEC_STRING str, __strlen_t len);
static inline IEC_STRING __mid(IEC_STRING str, __strlen_t len, __strlen_t pos);
static inline IEC_STRING __concat(int num, ...);  // Variadic
static inline __strlen_t __find(IEC_STRING str1, IEC_STRING str2);
// ... etc
```

### STruC++ Design

STruC++ uses a template class for strings with compile-time maximum length:

```cpp
template<size_t MaxLen = 254>
class IEC_STRING_Value {
private:
    std::array<char, MaxLen + 1> data_;  // +1 for null terminator
    size_t length_;
    
public:
    // Standard string operations
    size_t len() const { return length_; }
    IEC_STRING_Value left(size_t n) const;
    IEC_STRING_Value right(size_t n) const;
    IEC_STRING_Value mid(size_t pos, size_t n) const;
    // ... etc
};

// Wrapper with forcing support
template<size_t MaxLen = 254>
using IEC_STRING = IECVar<IEC_STRING_Value<MaxLen>>;
```

## Deliverables

### 1. STRING Type Implementation

**`include/iec_string.hpp`**:

```cpp
#pragma once
#include <array>
#include <cstring>
#include <string>
#include <string_view>
#include "iec_types.hpp"

namespace strucpp {

// Default maximum string length per IEC 61131-3
constexpr size_t IEC_STRING_DEFAULT_MAX_LEN = 254;

// Internal value class for STRING
template<size_t MaxLen = IEC_STRING_DEFAULT_MAX_LEN>
class IEC_STRING_Value {
private:
    std::array<char, MaxLen + 1> data_;  // +1 for null terminator
    size_t length_;
    
public:
    // Constants
    static constexpr size_t max_length = MaxLen;
    
    // Constructors
    constexpr IEC_STRING_Value() : data_{}, length_(0) {
        data_[0] = '\0';
    }
    
    IEC_STRING_Value(const char* str);
    IEC_STRING_Value(const std::string& str);
    IEC_STRING_Value(std::string_view str);
    
    // Literal parsing (STRING#'Hello')
    static IEC_STRING_Value from_literal(const std::string& literal);
    
    // Accessors
    constexpr size_t len() const { return length_; }
    constexpr size_t capacity() const { return MaxLen; }
    constexpr bool empty() const { return length_ == 0; }
    const char* c_str() const { return data_.data(); }
    std::string_view view() const { return {data_.data(), length_}; }
    
    // Character access
    char operator[](size_t index) const;
    char& operator[](size_t index);
    
    // Assignment
    IEC_STRING_Value& operator=(const char* str);
    IEC_STRING_Value& operator=(const std::string& str);
    IEC_STRING_Value& operator=(std::string_view str);
    
    // Comparison
    bool operator==(const IEC_STRING_Value& other) const;
    bool operator!=(const IEC_STRING_Value& other) const;
    bool operator<(const IEC_STRING_Value& other) const;
    bool operator<=(const IEC_STRING_Value& other) const;
    bool operator>(const IEC_STRING_Value& other) const;
    bool operator>=(const IEC_STRING_Value& other) const;
    
    // Concatenation
    IEC_STRING_Value operator+(const IEC_STRING_Value& other) const;
    IEC_STRING_Value& operator+=(const IEC_STRING_Value& other);
    
    // IEC 61131-3 Standard String Functions
    size_t LEN() const { return length_; }
    IEC_STRING_Value LEFT(size_t n) const;
    IEC_STRING_Value RIGHT(size_t n) const;
    IEC_STRING_Value MID(size_t pos, size_t n) const;
    IEC_STRING_Value INSERT(const IEC_STRING_Value& str, size_t pos) const;
    IEC_STRING_Value DELETE(size_t pos, size_t n) const;
    IEC_STRING_Value REPLACE(const IEC_STRING_Value& str, size_t pos, size_t n) const;
    size_t FIND(const IEC_STRING_Value& str) const;  // Returns 0 if not found, 1-based index otherwise
    
    // Conversion to/from other types (implemented in Phase 1.6)
    // These are declared here but implemented with type conversion functions
};

// Wrapped type with forcing support
template<size_t MaxLen = IEC_STRING_DEFAULT_MAX_LEN>
using IEC_STRING = IECVar<IEC_STRING_Value<MaxLen>>;

// Type alias for default string
using STRING = IEC_STRING<>;

}  // namespace strucpp
```

### 2. WSTRING Type Implementation

**`include/iec_wstring.hpp`**:

```cpp
#pragma once
#include <array>
#include <string>
#include <string_view>
#include "iec_types.hpp"

namespace strucpp {

// Default maximum wide string length
constexpr size_t IEC_WSTRING_DEFAULT_MAX_LEN = 254;

// Internal value class for WSTRING
template<size_t MaxLen = IEC_WSTRING_DEFAULT_MAX_LEN>
class IEC_WSTRING_Value {
private:
    std::array<char16_t, MaxLen + 1> data_;  // UTF-16 code units
    size_t length_;  // Number of code units (not code points)
    
public:
    // Constants
    static constexpr size_t max_length = MaxLen;
    
    // Constructors
    constexpr IEC_WSTRING_Value() : data_{}, length_(0) {
        data_[0] = u'\0';
    }
    
    IEC_WSTRING_Value(const char16_t* str);
    IEC_WSTRING_Value(const std::u16string& str);
    IEC_WSTRING_Value(std::u16string_view str);
    
    // Literal parsing (WSTRING#"Hello")
    static IEC_WSTRING_Value from_literal(const std::string& literal);
    
    // Accessors
    constexpr size_t len() const { return length_; }
    constexpr size_t capacity() const { return MaxLen; }
    constexpr bool empty() const { return length_ == 0; }
    const char16_t* c_str() const { return data_.data(); }
    std::u16string_view view() const { return {data_.data(), length_}; }
    
    // Character access
    char16_t operator[](size_t index) const;
    char16_t& operator[](size_t index);
    
    // Assignment
    IEC_WSTRING_Value& operator=(const char16_t* str);
    IEC_WSTRING_Value& operator=(const std::u16string& str);
    IEC_WSTRING_Value& operator=(std::u16string_view str);
    
    // Comparison
    bool operator==(const IEC_WSTRING_Value& other) const;
    bool operator!=(const IEC_WSTRING_Value& other) const;
    bool operator<(const IEC_WSTRING_Value& other) const;
    bool operator<=(const IEC_WSTRING_Value& other) const;
    bool operator>(const IEC_WSTRING_Value& other) const;
    bool operator>=(const IEC_WSTRING_Value& other) const;
    
    // Concatenation
    IEC_WSTRING_Value operator+(const IEC_WSTRING_Value& other) const;
    IEC_WSTRING_Value& operator+=(const IEC_WSTRING_Value& other);
    
    // IEC 61131-3 Standard String Functions
    size_t LEN() const { return length_; }
    IEC_WSTRING_Value LEFT(size_t n) const;
    IEC_WSTRING_Value RIGHT(size_t n) const;
    IEC_WSTRING_Value MID(size_t pos, size_t n) const;
    IEC_WSTRING_Value INSERT(const IEC_WSTRING_Value& str, size_t pos) const;
    IEC_WSTRING_Value DELETE(size_t pos, size_t n) const;
    IEC_WSTRING_Value REPLACE(const IEC_WSTRING_Value& str, size_t pos, size_t n) const;
    size_t FIND(const IEC_WSTRING_Value& str) const;
};

// Wrapped type with forcing support
template<size_t MaxLen = IEC_WSTRING_DEFAULT_MAX_LEN>
using IEC_WSTRING = IECVar<IEC_WSTRING_Value<MaxLen>>;

// Type alias for default wide string
using WSTRING = IEC_WSTRING<>;

}  // namespace strucpp
```

### 3. String Function Implementations

**Standard IEC 61131-3 String Functions**:

| Function | Description | Signature |
|----------|-------------|-----------|
| `LEN` | String length | `INT LEN(STRING s)` |
| `LEFT` | Left substring | `STRING LEFT(STRING s, INT n)` |
| `RIGHT` | Right substring | `STRING RIGHT(STRING s, INT n)` |
| `MID` | Middle substring | `STRING MID(STRING s, INT n, INT pos)` |
| `CONCAT` | Concatenation | `STRING CONCAT(STRING s1, STRING s2, ...)` |
| `INSERT` | Insert substring | `STRING INSERT(STRING s1, STRING s2, INT pos)` |
| `DELETE` | Delete substring | `STRING DELETE(STRING s, INT n, INT pos)` |
| `REPLACE` | Replace substring | `STRING REPLACE(STRING s1, STRING s2, INT n, INT pos)` |
| `FIND` | Find substring | `INT FIND(STRING s1, STRING s2)` |

**Implementation Notes**:
- Position parameters are 1-based (IEC convention)
- Out-of-bounds operations are handled gracefully (no exceptions)
- CONCAT is variadic (handled in Phase 1.6)

### 4. Character Type

**`include/iec_char.hpp`**:

```cpp
#pragma once
#include "iec_types.hpp"

namespace strucpp {

// CHAR type (single character)
using IEC_CHAR_Value = char;
using IEC_CHAR = IECVar<IEC_CHAR_Value>;

// WCHAR type (wide character)
using IEC_WCHAR_Value = char16_t;
using IEC_WCHAR = IECVar<IEC_WCHAR_Value>;

}  // namespace strucpp
```

### 5. Unit Tests

**Test File**: `tests/unit/test_iec_string.cpp`

Test cases:
- STRING construction and assignment
- STRING literal parsing
- String comparison operators
- String concatenation
- LEN, LEFT, RIGHT, MID functions
- INSERT, DELETE, REPLACE functions
- FIND function
- Boundary conditions (empty strings, max length)
- Truncation behavior when exceeding max length
- WSTRING equivalents of all above
- Forcing behavior for string types

## Success Criteria

- STRING and WSTRING types are implemented with configurable max length
- All standard string functions work correctly
- Position parameters use 1-based indexing (IEC convention)
- Strings truncate gracefully when exceeding max length
- Forcing mechanism works for string types
- Unit tests achieve >95% coverage
- No buffer overflows or memory safety issues
- Compilation with -Wall -Wextra produces no warnings

## Validation Examples

### Example 1: Basic String Operations

```cpp
#include "iec_string.hpp"

void test_basic_string() {
    IEC_STRING<80> message;
    message = "Hello, World!";
    
    assert(message.len() == 13);
    assert(message[0] == 'H');
    
    // Concatenation
    IEC_STRING<80> greeting;
    greeting = "Hello";
    IEC_STRING<80> name;
    name = "PLC";
    
    IEC_STRING<80> result = greeting + ", " + name + "!";
    assert(result == "Hello, PLC!");
}
```

### Example 2: Standard String Functions

```cpp
void test_string_functions() {
    IEC_STRING<80> str;
    str = "Hello, World!";
    
    // LEN
    assert(str.LEN() == 13);
    
    // LEFT
    auto left5 = str.LEFT(5);
    assert(left5 == "Hello");
    
    // RIGHT
    auto right6 = str.RIGHT(6);
    assert(right6 == "World!");
    
    // MID (1-based position)
    auto mid = str.MID(8, 5);  // Start at position 8, length 5
    assert(mid == "World");
    
    // FIND (returns 1-based position, 0 if not found)
    assert(str.FIND("World") == 8);
    assert(str.FIND("xyz") == 0);
}
```

### Example 3: String Modification Functions

```cpp
void test_string_modification() {
    IEC_STRING<80> str;
    str = "Hello World";
    
    // INSERT (1-based position)
    auto inserted = str.INSERT(", Beautiful", 6);
    assert(inserted == "Hello, Beautiful World");
    
    // DELETE (1-based position)
    auto deleted = str.DELETE(6, 1);  // Delete 1 char at position 6
    assert(deleted == "HelloWorld");
    
    // REPLACE
    auto replaced = str.REPLACE("Universe", 7, 5);  // Replace 5 chars at pos 7
    assert(replaced == "Hello Universe");
}
```

### Example 4: String Truncation

```cpp
void test_truncation() {
    IEC_STRING<10> short_str;
    
    // Assignment truncates to max length
    short_str = "This is a very long string";
    assert(short_str.len() == 10);
    assert(short_str == "This is a ");
    
    // Concatenation also truncates
    IEC_STRING<10> a, b;
    a = "Hello";
    b = "World!";
    auto result = a + b;  // Would be 11 chars, truncated to 10
    assert(result.len() == 10);
}
```

### Example 5: String Forcing

```cpp
void test_string_forcing() {
    IEC_STRING<80> display;
    display = "Normal";
    
    // Force to specific value
    display.force("FORCED");
    
    // Assignment is ignored while forced
    display = "New Value";
    assert(display == "FORCED");
    
    // Unforce returns to normal
    display.unforce();
    display = "New Value";
    assert(display == "New Value");
}
```

### Example 6: WSTRING Usage

```cpp
#include "iec_wstring.hpp"

void test_wstring() {
    IEC_WSTRING<80> unicode_str;
    unicode_str = u"Hello, \u4E16\u754C!";  // "Hello, 世界!"
    
    assert(unicode_str.len() == 10);  // 10 UTF-16 code units
    
    auto left = unicode_str.LEFT(7);
    assert(left == u"Hello, ");
}
```

## Dependencies

- Phase 1.1 (Core IEC Type Wrappers) must be complete
- Phase 1.2 (Type Categories and Traits) for ANY_STRING trait
- C++17 or later
- Standard library headers: `<array>`, `<string>`, `<string_view>`, `<cstring>`

## Output Files

```
include/
├── iec_types.hpp       # From Phase 1.1
├── iec_traits.hpp      # From Phase 1.2
├── iec_time.hpp        # From Phase 1.3
├── iec_date.hpp        # From Phase 1.3
├── iec_tod.hpp         # From Phase 1.3
├── iec_dt.hpp          # From Phase 1.3
├── iec_string.hpp      # STRING type
├── iec_wstring.hpp     # WSTRING type
└── iec_char.hpp        # CHAR and WCHAR types

tests/unit/
├── test_iec_types.cpp  # From Phase 1.1
├── test_iec_traits.cpp # From Phase 1.2
├── test_iec_time.cpp   # From Phase 1.3
└── test_iec_string.cpp # String type tests
```

## Notes

### Design Decisions

1. **Template-based Max Length**: Using a template parameter for max length allows compile-time size checking and avoids dynamic allocation, which is important for real-time systems.

2. **Null Termination**: Strings are internally null-terminated for compatibility with C APIs, but the length is tracked separately for efficiency.

3. **1-Based Indexing for Functions**: IEC 61131-3 uses 1-based indexing for string positions. The member functions (LEFT, RIGHT, MID, etc.) follow this convention, while operator[] uses 0-based indexing for C++ compatibility.

4. **Graceful Truncation**: Rather than throwing exceptions, strings truncate silently when exceeding max length. This matches PLC behavior where runtime exceptions are undesirable.

5. **UTF-16 for WSTRING**: WSTRING uses UTF-16 (char16_t) rather than UTF-32 to match typical PLC implementations and Windows compatibility.

### Comparison with MatIEC

| Aspect | MatIEC | STruC++ |
|--------|--------|---------|
| Max Length | Fixed at compile time (254) | Template parameter |
| Storage | C struct with array | C++ std::array |
| Functions | C functions | Member functions + free functions |
| Concatenation | Variadic C function | Operator overloading |
| Type Safety | Weak | Strong |
| Unicode | Limited | Full WSTRING support |

### Real-Time Considerations

- No dynamic memory allocation in string operations
- All operations are bounded by max length
- No exceptions thrown (graceful truncation)
- Suitable for hard real-time applications
- Memory footprint is fixed and predictable

### Future Extensions

- String formatting functions (similar to printf)
- Regular expression support (optional, non-real-time)
- Conversion between STRING and WSTRING
- Integration with standard library string functions
