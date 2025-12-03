# STruC++ Runtime Library

This directory contains the C++ runtime library for STruC++, providing IEC 61131-3 type wrappers and standard library functions used by generated code.

## Building and Testing

### Prerequisites

- CMake 3.14 or higher
- C++17 compatible compiler (GCC 7+, Clang 5+, MSVC 2017+)
- Google Test (automatically downloaded by CMake)

### Build Instructions

From the repository root:

```bash
mkdir build
cd build
cmake ../src/runtime
make -j4
```

### Running Tests

After building, run the test suite:

```bash
cd build
ctest --output-on-failure
```

Or run the test executable directly for more detailed output:

```bash
./runtime_tests
```

### Expected Output

All 62 tests should pass:

```
100% tests passed, 0 tests failed out of 62
```

## Header Files

| Header            | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `iec_types.hpp`   | Base type definitions (BOOL, INT, REAL, TIME, etc.)     |
| `iec_var.hpp`     | IECVar template with forcing support for debugging      |
| `iec_traits.hpp`  | Type traits (is_any_int, is_any_real, is_any_bit, etc.) |
| `iec_time.hpp`    | TIME/LTIME value classes with duration arithmetic       |
| `iec_date.hpp`    | DATE/LDATE value classes for calendar dates             |
| `iec_tod.hpp`     | TOD/LTOD value classes for time-of-day                  |
| `iec_dt.hpp`      | DT/LDT value classes for combined date-time             |
| `iec_string.hpp`  | STRING template with fixed-length storage               |
| `iec_wstring.hpp` | WSTRING template for wide strings (UTF-16)              |
| `iec_char.hpp`    | CHAR/WCHAR types with character functions               |
| `iec_std_lib.hpp` | Standard library functions (math, conversions, etc.)    |

## Variable Forcing

The `IECVar<T>` template provides forcing support for PLC debugging:

```cpp
IEC_INT myVar(100);

// Normal operation
myVar.set(200);
assert(myVar.get() == 200);

// Force the variable
myVar.force(999);
assert(myVar.is_forced() == true);
assert(myVar.get() == 999);  // Returns forced value

myVar.set(300);              // Ignored while forced
assert(myVar.get() == 999);  // Still returns forced value

// Unforce to resume normal operation
myVar.unforce();
assert(myVar.get() == 300);  // Now returns the set value
```

## Type Aliasing Note

Some IEC types share the same underlying C++ type due to language limitations:

- `BYTE_t` and `USINT_t` are both `uint8_t`
- `WORD_t` and `UINT_t` are both `uint16_t`
- `TIME_t`, `DATE_t`, `LINT_t` are all `int64_t`

This means type traits cannot distinguish between these types at compile time. The generated code uses the appropriate wrapper classes (e.g., `IEC_TIME_Value`, `IEC_DATE_Value`) to maintain semantic distinction.
