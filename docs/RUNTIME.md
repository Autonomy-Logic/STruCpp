# C++ Runtime Library

The STruC++ runtime is a header-only C++17 library in `src/runtime/include/`. Every compiled ST program includes these headers. The runtime provides IEC 61131-3 type wrappers, variable forcing, and standard function implementations.

## Type Definitions (`iec_types.hpp`)

All types live in the `strucpp` namespace:

```cpp
// Bit strings
using BOOL_t  = bool;
using BYTE_t  = uint8_t;
using WORD_t  = uint16_t;
using DWORD_t = uint32_t;
using LWORD_t = uint64_t;

// Signed integers
using SINT_t = int8_t;
using INT_t  = int16_t;
using DINT_t = int32_t;
using LINT_t = int64_t;

// Unsigned integers
using USINT_t = uint8_t;
using UINT_t  = uint16_t;
using UDINT_t = uint32_t;
using ULINT_t = uint64_t;

// Floating point
using REAL_t  = float;
using LREAL_t = double;

// Time/date (nanosecond precision, stored as int64_t)
using TIME_t  = int64_t;
using DATE_t  = int64_t;
using TOD_t   = int64_t;  // TIME_OF_DAY
using DT_t    = int64_t;  // DATE_AND_TIME
using LTIME_t = int64_t;  // 64-bit time (nanosecond precision)
using LDATE_t = int64_t;
using LTOD_t  = int64_t;
using LDT_t   = int64_t;
```

## IECVar Wrapper (`iec_var.hpp`)

`IECVar<T>` wraps every program variable to support variable forcing:

```cpp
template<typename T>
class IECVar {
    T value_;
    bool forced_;
    T forced_value_;

public:
    // Read: returns forced value when forcing is active
    operator T() const;

    // Write: ignored when forcing is active
    IECVar& operator=(T v);

    // Forcing API
    void force(T v);
    void unforce();
    bool is_forced() const;

    // Raw pointer for I/O memory binding
    T* raw_ptr();

    // Const pointer to the value a READER should see (force-aware)
    const T* read_ptr() const;

    // Cross-type converting constructor (enables implicit widening)
    template<typename U> IECVar(const IECVar<U>& other);
};
```

The implicit `operator T()` and `operator=(T)` make IECVar transparent in expressions -- ST code like `counter := counter + 1` generates natural C++.

### Forcing

Variable forcing is a PLC debugging feature that overrides a variable's value regardless of program logic. When `force(v)` is called, all reads return the forced value and all writes are silently ignored until `unforce()` is called.

### Struct Field Forcing

Struct fields use IECVar-wrapped elementary types (e.g., `IEC_INT` = `IECVar<int16_t>`) for per-field forcing. This means individual struct members can be forced independently:

```cpp
struct Point {
    IEC_REAL x;  // IECVar<float> -- independently forceable
    IEC_REAL y;
};
```

Array elements store raw types; the calling variable wraps the entire array.

### Located Variables

Located variables (`AT %IX0.0`) use `raw_ptr()` to bind to an I/O image table at runtime. The code generator produces a descriptor array (`__located_vars_[]`) with metadata for each located variable (area, size, byte/bit indices) and accessor methods (`getLocatedVars()`, `getLocatedVarCount()`).

### `raw_ptr()` vs `read_ptr()`

Two pointers into an `IECVar`, and picking the wrong one is silently wrong for exactly one kind of variable.

| | Points at | Use for |
|---|---|---|
| `raw_ptr()` | `value_`, always | **Binding** — the I/O image writes through it every scan |
| `read_ptr()` | `forced_value_` while forced, `value_` otherwise | **Reading** — anything serving the value to a person or a protocol |

`force()` writes through to `value_`, so for an ordinary variable the two agree the moment a force is applied. A **located** variable is the exception: the PLC program drives `value_` directly through the image binding every scan, without going through `set()`, so `raw_ptr()` would show the program's value while `get()` still reports the forced one. `read_ptr()` is `get()`'s semantics with `get()`'s copy removed, which is what an external reader needs to serve a value without copying it. `IECStringVar::c_str()` resolves the force the same way.

The debug dispatch's pointer op (`handle_ptr`, and through it OPC-UA's zero-copy read) uses `read_ptr()` for that reason. The pointer it returns is valid only until the variable is next written **or its force state changes** — an `unforce()` moves the value back to a different object, and a retained pointer keeps reporting the stale forced one.

## Type Traits (`iec_traits.hpp`)

Template traits for compile-time type categorization:

```cpp
template<typename T> struct is_any_int;     // SINT, INT, DINT, LINT, USINT, ...
template<typename T> struct is_any_real;    // REAL, LREAL
template<typename T> struct is_any_num;     // is_any_int || is_any_real
template<typename T> struct is_any_bit;     // BOOL, BYTE, WORD, DWORD, LWORD
template<typename T> struct is_any_string;  // IECString, IECWString
```

Used by standard function templates for type-safe dispatch.

## String Types (`iec_string.hpp`, `iec_wstring.hpp`)

```cpp
template<size_t N = 254>
class IECString {
    char data_[N + 1];
    size_t len_;
    // ...
};

template<size_t N = 254>
class IECWString {
    char32_t data_[N + 1];
    size_t len_;
    // ...
};
```

Fixed-capacity strings matching IEC semantics. `N` defaults to 254 (IEC standard) but can be parameterized via `STRING(100)` declarations. String functions (LEFT, RIGHT, MID, CONCAT, FIND, etc.) have explicit overloads for `IECString<N>` to work around C++ template deduction limitations with implicit conversions.

## Array Types (`iec_array.hpp`)

```cpp
template<typename T, int Lower, int Upper>
class Array1D;

template<typename T, int L1, int U1, int L2, int U2>
class Array2D;

template<typename T, int L1, int U1, int L2, int U2, int L3, int U3>
class Array3D;
```

IEC arrays use 1-based (or arbitrary-based) indexing. The template parameters encode bounds for compile-time size calculation. Bounds checking is performed at runtime in debug builds.

## Pointer and Reference Types

### POINTER TO (`iec_pointer.hpp`)

```cpp
template<typename T>
class IEC_Ptr {
    T* ptr_;
public:
    T& operator*();        // Dereference
    T* operator->();
    IEC_Ptr& operator=(T* p);
    explicit operator bool() const;  // Null check
};
```

Supports CODESYS-style `POINTER TO` declarations with dereference via `^` operator.

### REF_TO and REFERENCE_TO (`iec_ptr.hpp`)

```cpp
template<typename T> class IEC_REF_TO;       // Explicit dereference with ^
template<typename T> class IEC_REFERENCE_TO;  // Implicit dereference (CODESYS style)
```

`REF_TO` follows the IEC standard (requires explicit dereference). `REFERENCE_TO` follows the CODESYS convention (implicit dereference -- the reference behaves like the referenced variable).

### ADR Function

`ADR(variable)` returns the memory address of a variable as `ULINT`. Implemented in `iec_std_lib.hpp`.

## Memory Management (`iec_memory.hpp`)

Dynamic allocation for CODESYS compatibility:

```cpp
template<typename T> T* iec_new();                  // __NEW(Type)
template<typename T> T* iec_new_array(size_t n);    // __NEW(Type, size)
template<typename T> void iec_delete(T*& ptr);       // __DELETE(ptr)
template<typename T> void iec_delete_array(T*& ptr); // __DELETE(array_ptr)
```

Uses `malloc`/`free` with placement new. Sets pointer to `nullptr` after deletion.

## Composite Types

- **Structs** (`iec_struct.hpp`): Plain C++ structs with IECVar-wrapped fields
- **Enums** (`iec_enum.hpp`): C++ `enum class` with configurable underlying type
- **Subranges** (`iec_subrange.hpp`): Runtime range validation on assignment

## Time Types (`iec_time.hpp`, `iec_date.hpp`, `iec_dt.hpp`, `iec_tod.hpp`)

All time/date types use nanosecond-precision `int64_t` storage. Arithmetic operations (`+`, `-`, comparison) are defined. Time literal parsing handles the IEC format: `T#1h2m3s4ms5us6ns`. LTIME types share the same int64_t representation with nanosecond precision.

## Standard Functions (`iec_std_lib.hpp`)

Template implementations of all IEC 61131-3 standard functions:

| Category | Functions |
|----------|-----------|
| Numeric | ABS, SQRT, EXPT, LN, LOG, EXP |
| Trigonometric | SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2 |
| Selection | SEL, MIN, MAX, LIMIT, MUX |
| Comparison | GT, GE, EQ, LE, LT, NE |
| Bitwise | AND, OR, XOR, NOT, MOVE |
| Bit Shift | SHL, SHR, ROR, ROL |
| Conversion | *_TO_* functions (INT_TO_REAL, REAL_TO_INT, etc.) |
| String | LEN, LEFT, RIGHT, MID, CONCAT, FIND, REPLACE, INSERT, DELETE, UPPER, LOWER, TRIM |
| System | ADR, SIZEOF |

Variadic functions (ADD, MUL, MIN, MAX) accept 2+ arguments via template parameter packs.

## REPL Runtime (`runtime/repl/`)

The interactive REPL binary uses [isocline](https://github.com/daanx/isocline) (MIT licensed) for line editing with syntax highlighting, tab completion, and command history. `iec_repl.hpp` provides the STruC++ REPL harness that wraps compiled programs with an interactive shell for variable inspection, function invocation, and time advancement for FB testing.

## Header Summary

| Header | Purpose |
|--------|---------|
| `iec_types.hpp` | Elementary type aliases (including LTIME/LDATE/LTOD/LDT) |
| `iec_var.hpp` | IECVar wrapper with forcing |
| `iec_traits.hpp` | Type category traits |
| `iec_string.hpp` | STRING type and functions |
| `iec_wstring.hpp` | WSTRING type and functions |
| `iec_char.hpp` | CHAR type |
| `iec_array.hpp` | Array templates (1D, 2D, 3D) |
| `iec_struct.hpp` | Struct support |
| `iec_enum.hpp` | Enum support |
| `iec_subrange.hpp` | Subrange type with validation |
| `iec_time.hpp` | TIME/LTIME types and arithmetic |
| `iec_date.hpp` | DATE/LDATE type |
| `iec_tod.hpp` | TIME_OF_DAY/LTOD type |
| `iec_dt.hpp` | DATE_AND_TIME/LDT type |
| `iec_located.hpp` | Located variable (AT %IX0.0) support |
| `iec_pointer.hpp` | POINTER TO type |
| `iec_ptr.hpp` | REF_TO, REFERENCE_TO, and ADR support |
| `iec_retain.hpp` | RETAIN variable tracking |
| `iec_memory.hpp` | Dynamic allocation (__NEW/__DELETE) |
| `iec_std_lib.hpp` | Standard function implementations |
