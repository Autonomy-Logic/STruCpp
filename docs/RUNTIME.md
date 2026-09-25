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

## Generic Parameters and Struct Layout (`iec_any.hpp`, `iec_typedesc.hpp`)

A `VAR_INPUT` declared `ANY` (or `ANY_INT`, `ANY_BIT`, …) is not passed by
value. Codegen replaces it with an `IEC_ANY` descriptor and passes the argument
by reference, which is why only a variable may be supplied — a literal has no
address to take.

`IEC_ANY`'s first three fields are CODESYS's `__SYSTEM.AnyType` field for field
(`TYPECLASS`, `PVALUE`, `DISIZE`), so an imported CODESYS POU reading them by
position still works. OpenPLC appends to that, never reorders it: `DICOUNT`,
`DISTRIDE`, `ELEMCLASS`, and now `TYPEDESC`.

`PVALUE` addresses the payload rather than the `IECVar<T>` wrapper around it,
and the descriptor *aliases* its operand — so writing `*(T*)any.PVALUE` writes
what the caller passed, which is how a callee writes values back.

A STRUCT reaches an `ANY` pin as `TYPE_USERDEF`, but a pointer and a byte count
describe nothing a callee can act on: a structure is heterogeneous, so unlike
an array it cannot be walked from a base and a stride. `TYPEDESC` closes that —
a `const TypeDesc` emitted beside the generated struct, naming every member
with its payload offset, kind, elementary tag and capacity:

```cpp
const strucpp::TypeDesc* d = any.TYPEDESC;
for (uint16_t i = 0; i < d->MEMBERCOUNT; ++i) {
    const strucpp::MemberDesc& m = d->MEMBERS[i];
    handle(m.NAME, any.PVALUE + m.BYTEOFFSET, m.TYPECLASS);  // "speedRpm", &value, TYPE_REAL
}
```

`TypeDesc` and `MemberDesc` use **CODESYS's `VAR_INFO` vocabulary** —
`TYPECLASS`, `BASETYPECLASS`, `BYTEOFFSET`, `NUMELEMENTS`, `BITSIZE`,
`ELEMBITSIZE`, `TYPENAME` — and the same `TYPE_CLASS` enumeration
`IEC_ANY::TYPECLASS` uses, so a block never has to learn a second set of type
constants. `NAME`, `NESTED`, `STRIDE` and `CAP` are additions `VAR_INFO` has no
need for; `TYPENAME` is a `const char*` rather than `STRING(79)` so the tables
stay constant-initialised in flash instead of landing in `.bss` with a startup
constructor.

Because the fields are spelled as CODESYS spells them, a C++ POU must not name
one of its own pins after one — the editor binds a POU's Variables Table with
`#define <NAME> (*(vars-><NAME>))`. That has always been true of `IEC_ANY`'s
`TYPECLASS` and `PVALUE`; the answer is the same, rename the pin.

`BYTEOFFSET` addresses the member's **payload**, not the wrapper — each wrapper's
`value_field_offset()` is added in, and pinned at 0 by `static_assert`. A block
reading the wrapper instead would get the forcing flag back as data.

A STRING member's payload is the characters, with no header in front. The
length is cached in a field *after* them, so a block that writes a string
member must have it recomputed; codegen emits
`strucpp::sync_strings(&v, &T__TYPEDESC)` after any call that passes a struct
holding one. Nested structs and arrays of structs carry `NESTED`. `member_info(m, base)` converts one member into a real `VAR_INFO`.

### Naming the argument

`TYPEDESC` names a struct's *type* and its *members*. Neither is the name of
the variable the caller wired up, and a scalar has no `TYPEDESC` at all — so
`NAME` and `TYPENAME` are filled for **every** argument:

| argument | `NAME` | `TYPENAME` | `TYPEDESC` |
|---|---|---|---|
| `setpoint : REAL` | `setpoint` | `REAL` | null |
| `myText : STRING(20)` | `myText` | `STRING` | null |
| `mode : E` (enum) | `mode` | `E` | null |
| `trend : ARRAY[0..2] OF INT` | `trend` | `ARRAY OF INT` | null |
| `trend[2]` | `trend[2]` | `INT` | null |
| `plant : S_Plant` | `plant` | `S_Plant` | `&S_PLANT__TYPEDESC` |
| `plant.speedRpm` | `plant.speedRpm` | `INT` | null |

So a callee can name a scalar pin from `NAME`, and each member of a struct pin
from the member's own name. Both are null only on an unwired pin.

#### Case

Every name in a descriptor — `MemberDesc::NAME`, `TypeDesc::NAME`,
`IEC_ANY::NAME` and `IEC_ANY::TYPENAME` for a user-defined type — carries the
spelling its **declaration** used. `spPressureAlt` stays `spPressureAlt`.

IEC 61131-3 §6.1.2 makes identifiers case-insensitive, so the compiler folds
every name it resolves on, and debug-map paths — an internal address table —
stay folded with it. Descriptor strings are reported rather than resolved on,
and the declared spelling is the only form they can still be recovered from.

Two consequences for a callee:

- Compare case-**insensitively** against anything an engineer typed, because ST
  resolution does. Read the string as it stands.
- The spelling is the declaration's, not the call site's. `Plant` declared and
  `PLANT` wired to the pin is one variable, and reports `Plant` either way —
  otherwise one variable would be reported under two spellings depending on
  how the pin happened to be typed.

The generated C++ *symbols* stay folded: `S_PLANT__TYPEDESC` is a name only
generated code uses. Elementary type names (`INT`, `STRING`) stay upper
case because they are words of the standard's grammar rather than names anyone
chose — which is how CODESYS reports them in `VAR_INFO.TypeName` too.

### `__VARINFO` — a separate feature

`__VARINFO(x)` is implemented and yields `__SYSTEM.VAR_INFO` — CODESYS's
structure field for field: `ByteAddress`, `ByteOffset`, `Area`, `BitNr`,
`BitSize`, `BitAddress`, `TypeClass`, `TypeName`, `NumElements`,
`BaseTypeClass`, `ElemBitSize`.

```iecst
VAR
    iCounter : INT;
    info : __SYSTEM.VAR_INFO;
END_VAR
info := __VARINFO(iCounter);     (* info.TypeClass = TYPE_INT, info.BitSize = 16 *)
```

It describes **one variable named in source**, resolved at compile time. It has
nothing to do with `TYPEDESC` above and cannot substitute for it: `VAR_INFO`
carries no member list. The struct descriptors borrow its field names so a
codebase using both has one vocabulary, and that is the whole of the
relationship.

`__VARINFO` covers every declared type: the elementary types, an alias or
subrange (reported as the elementary type it derives from, per IEC 61131-3
§6.4.3 rule 1), an enumeration, a DUT, a function block instance, an array —
inline or declared as its own TYPE — and a `POINTER TO` / `REFERENCE TO`
(`TYPE_POINTER` / `TYPE_REFERENCE`, not the type pointed at). `__XWORD` has no
fixed enumerator, so its class is chosen by the target's pointer width.

It refuses two things, as ST errors rather than as broken C++: a literal or
expression, which has no storage to describe, and a `__SYSTEM.AnyType` or
`__SYSTEM.VAR_INFO`, which already describes a variable rather than being one.

An `__SYSTEM.VAR_INFO` variable is not a debug-map leaf, so the online debugger
cannot watch `info.TypeClass` directly — only values a POU derives from it. The
same is true of `__SYSTEM.AnyType`.

Two honest deviations: `Area` is always -1 and `BitAddress` always 0, because
OpenPLC has no device-dependent memory-area numbering and CODESYS documents -1
as "not global in memory, but relative to an instance or on the stack" — true
of every variable here. `ByteAddress` is platform-width rather than `DWORD`,
because a 32-bit field truncates a 64-bit address on the OpenPLC Runtime.

**Descriptions are not available.** The OpenPLC Editor holds a `documentation`
string per variable in `project.json`, but it is not emitted into the generated
ST, so the compiler never sees it and no runtime field can carry it.

A STRUCT that cannot be laid out gets **no** table rather than a partial one —
a callee trusts `MEMBERCOUNT`, so a short table reads as a struct missing the
member. That is reported as a compiler **warning** naming the struct, the
member and the reason, because the symptom otherwise is a member that is simply
absent at run time with nothing to point at. A `POINTER TO` or `REFERENCE TO`
member is refused (the descriptor cannot vouch for what it addresses or how
long that lives), as is a function block instance member and an `__XWORD`.

`TYPEDESC` is null for an elementary type, an enumeration, an array of
elementary types, and a function block instance. IEC 61131-3 §6.4.3 scopes
`ANY_DERIVED` to the user-defined *data* types of Table 11 (a function block is
a POU, not one of those), CODESYS documents only elementary arguments, and a
generated FB class may carry a vptr or an `EXTENDS` base where `offsetof` is
not answerable.

IEC 61131-3 defines no reflection at all, and §6.4.3 puts generic parameters in
user-declared POUs beyond the standard's scope to begin with. This is an
OpenPLC extension in the CODESYS family, declared as one — the same footing as
`__XWORD`, `ADR` and `SIZEOF`.

CODESYS's nearest equivalent is **`IecVarAccess3`**, which does enumerate
members at runtime (`VarAccBrowseGetRoot2`, then `VarAccBrowseDown3` /
`VarAccBrowseGetChildByIndex2`). It is not usable here: its category is
`Intern|SymbolConfiguration`, so it browses the symbol list an engineer
populates in the IDE; it addresses `IBaseTreeNode`s reached from a root, so
there is no route from the pointer an `ANY` pin carries back to a node; and it
is a runtime component with handles and init/exit lifetimes rather than a
language feature. `TYPEDESC` is the same type information resolved at compile
time into `const` data — zero configuration and zero allocation, at the cost of
not being able to browse a variable the compiler never saw.

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
| `iec_any.hpp` | Generic (`ANY`) parameter descriptor — CODESYS `__SYSTEM.AnyType` |
| `iec_type_class.hpp` | `__SYSTEM.TYPE_CLASS`, shared by `IEC_ANY`, `VAR_INFO` and `MemberDesc` |
| `iec_typedesc.hpp` | STRUCT member layout tables reached through `IEC_ANY::TYPEDESC` |
| `iec_varinfo.hpp` | `__SYSTEM.VAR_INFO`, what `__VARINFO(x)` yields |
| `iec_std_lib.hpp` | Standard function implementations |
