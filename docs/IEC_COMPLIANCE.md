# IEC 61131-3 Compliance

STruC++ implements the Structured Text (ST) language from IEC 61131-3. This document lists supported features and known gaps. The compiler also supports common CODESYS extensions where noted.

## Data Types

| Type | Status | Notes |
|------|--------|-------|
| BOOL | Supported | |
| BYTE, WORD, DWORD, LWORD | Supported | |
| SINT, INT, DINT, LINT | Supported | |
| USINT, UINT, UDINT, ULINT | Supported | |
| REAL, LREAL | Supported | |
| TIME | Supported | Nanosecond precision, int64_t storage |
| DATE | Supported | |
| TIME_OF_DAY | Supported | |
| DATE_AND_TIME | Supported | |
| LTIME, LTOD, LDT | Supported | 64-bit nanoseconds, sharing TIME/TOD/DT storage. Literals `LT#`, `LTIME#`, `LTOD#`, `LDT#`; implicit TIME→LTIME, TOD→LTOD, DT→LDT |
| LDATE | Not implemented | Needs nanoseconds; DATE stores whole days, so it cannot share DATE's representation |
| STRING | Supported | Parameterized length: STRING(N), default 254 |
| WSTRING | Supported | Parameterized length: WSTRING(N) |
| CHAR, WCHAR | Supported | |

### Derived Types

| Type | Status | Notes |
|------|--------|-------|
| TYPE ... END_TYPE | Supported | Type aliases |
| STRUCT ... END_STRUCT | Supported | With nested structs |
| Enumerations | Supported | With optional base type |
| Initialized type declarations | Supported | A type may carry its own default (`Setpoint : REAL := 25.0;`, `Origin : Point := (x := 0.0);`), inherited by every declaration of the type that has no initializer |
| ARRAY (1D) | Supported | Arbitrary bounds: ARRAY[1..10] OF INT |
| ARRAY (2D) | Supported | ARRAY[1..3, 1..4] OF REAL |
| ARRAY (3D) | Supported | ARRAY[1..3, 1..4, 1..5] OF INT |
| ARRAY OF function block | Supported | Declaration, member access, and element invocation (`units[i](step := 1.0)`). A *method* call on an element (`units[0].M()`) is not yet parsed |
| ARRAY[*] (VLA) | Supported | Variable-length array parameters |
| Subranges | Supported | Runtime validation |
| REF_TO | Supported | IEC reference type (explicit dereference) |
| REFERENCE_TO | Supported | CODESYS reference type (implicit dereference) |
| POINTER TO | Supported | CODESYS pointer type with dereference via ^ |

### Not Implemented

| Type | Notes |
|------|-------|
| UNION | CODESYS extension |

## Program Organization Units

| POU | Status | Notes |
|-----|--------|-------|
| PROGRAM | Supported | With CONFIGURATION/RESOURCE/TASK structure |
| FUNCTION | Supported | With return type, all parameter modes |
| FUNCTION_BLOCK | Supported | Instantiation, invocation, member access |
| INTERFACE | Supported | Method and property signatures |

## Variable Declarations

| Feature | Status | Notes |
|---------|--------|-------|
| VAR | Supported | Local variables |
| VAR_INPUT | Supported | Input parameters |
| VAR_OUTPUT | Supported | Output parameters |
| VAR_IN_OUT | Supported | In-out parameters — see below |
| VAR_EXTERNAL | Supported | References either a CONFIGURATION or a file-level VAR_GLOBAL |
| VAR_GLOBAL | Supported | Global variables (CONFIGURATION-scoped or file-level) |
| CONSTANT | Supported | Compile-time constants |
| RETAIN | Supported | Allowed on `VAR`, `VAR_INPUT`, `VAR_OUTPUT` and `VAR_GLOBAL`, per IEC 61131-3. Rejected on `VAR_IN_OUT` / `VAR_TEMP` / `VAR_EXTERNAL`, and inside a `FUNCTION` or `METHOD` (no instance, nothing to retain) |
| PERSISTENT | Partial | Accepted and treated as `RETAIN`. CODESYS also keeps a PERSISTENT value across a program download; that is not implemented, so the weaker shared guarantee is what is claimed |
| NON_RETAIN | Supported | Accepted and treated as the default (a plain `VAR` is already non-retained). Rejected when combined with `RETAIN` or `CONSTANT` |
| AT %IX0.0 | Supported | Located variables (I/Q/M areas, X/B/W/D/L sizes) |
| Multiple names | Supported | `a, b, c : INT := 0;` |
| Initialization | Supported | `:= expression` |
| Array initialization | Supported | `:= [1, 2, 3]` and the bracket-less `:= 1, 2, 3`. Multi-dimensional arrays take either a flat row-major list or a nested one (`:= [[1, 2], [3, 4]]`), where each inner list fills one row from its own bound. Nesting depth and value count are validated against the declared dimensions |
| Array repetition | Supported | `:= [10(0)]`, `:= [3(1), 2(5)]`, `:= [7, 4(2), 9]`. The repeated value may be a structure initializer. Max count 65536 |
| Structure initialization | Supported | `:= (x := 1.0, y := 2.0)`; nested, in array literals, and for FB instances. Omitted elements keep their own declared default. Only valid as a declaration's initial value, as in the standard — one written inside a statement is rejected |
| STRUCT element defaults | Supported | Scalar, array-literal and structure-initializer defaults on a STRUCT element all carry their values |

### VAR_IN_OUT rules

| Rule | Notes |
|------|-------|
| Assigned at every call | An in-out left unassigned is an error, including on a later call to an instance an earlier call assigned |
| Argument is a variable | A literal or an expression result is refused. An array element, a struct field or the calling POU's own in-out are accepted — the root of the access chain is what is checked |
| Argument is writable | Must be a non-`CONSTANT` variable from `VAR`, `VAR_TEMP`, `VAR_OUTPUT`, `VAR_IN_OUT` or `VAR_EXTERNAL` of the calling POU. The caller's own `VAR_INPUT` is refused |
| No implicit conversion | The argument's type must match the parameter's. Checked for a whole elementary variable; an element or field is left to C++ |
| Unnamed arguments allowed | They fill the slots the named ones did not claim, in declaration order |
| Used only in the body and the call | `inst.someInOut` is refused for read and write, as is capturing one with `=>` |
| Out of reach from a method | A method cannot use the in-outs of the block that owns it; it may declare its own |
| No qualifier | `CONSTANT`, `RETAIN` and `NON_RETAIN` are refused |
| No initial value | `:= value` on an in-out declaration is refused |
| Not a reference type | `REF_TO` / `REFERENCE TO` is refused. Not enforced for an interface imported from a library |
| Passing mechanism | Function block instances and `ARRAY [*]` are passed by reference; scalars, structures and fixed-bound arrays are copied in and back |
| Function block instance | On `VAR_INPUT` read-only and not callable; on `VAR_IN_OUT` read, written and callable, held as a pointer with no copy back; on `VAR_EXTERNAL` callable. Its outputs are readable but not writable in all three |

### Initialization gaps

| Form | Notes |
|------|-------|
| Repetition with no value | `:= [10()]` (ten copies of the element default) — write `:= [10(0)]`, or omit the elements entirely. Matches matiec and CODESYS, which also require a value |

## Operators and Expressions

| Category | Operators | Status |
|----------|-----------|--------|
| Arithmetic | `+`, `-`, `*`, `/`, `MOD`, `**` | Supported |
| Comparison | `=`, `<>`, `<`, `>`, `<=`, `>=` | Supported |
| Logical | `AND`, `OR`, `XOR`, `NOT` | Supported |
| Bitwise | `AND`, `OR`, `XOR`, `NOT` (on bit types) | Supported |
| Bit shift | `SHL`, `SHR`, `ROL`, `ROR` | Supported |
| Assignment | `:=` | Supported |
| Reference assign | `REF=` | Supported |
| Dereference | `^`, `DREF()` | Supported |
| Reference | `REF()` | Supported |
| Parentheses | `( )` | Supported |
| Function call | `name(args)` | Supported (positional + named) |
| Method call | `obj.method(args)` | Supported |
| Array access | `arr[i]`, `arr[i, j]` | Supported — the index count is validated against the declared rank |
| Field access | `struct.field` | Supported |
| Partial access | `var.0`, `var.%X0`, `var.%B1`, `var.%W0`, `var.%D1` | Supported — read and write. Also accepted on the integer types, which warns, as CODESYS's SA0148 does |
| Typed literals | `INT#5`, `DINT#42`, `REAL#3.14` | Supported |
| Integer literals | `9223372036854775807`, `16#FF`, `1_000` | Supported — the full 64-bit LINT/ULINT range is preserved exactly; a value wider than ULINT is rejected |
| NEW | `__NEW(type)`, `__NEW(type, size)` | Supported |
| DELETE | `__DELETE(ptr)` | Supported |

## Control Structures

| Structure | Status | Notes |
|-----------|--------|-------|
| IF / ELSIF / ELSE / END_IF | Supported | |
| FOR / TO / BY / DO / END_FOR | Supported | With optional BY (step) |
| WHILE / DO / END_WHILE | Supported | |
| REPEAT / UNTIL / END_REPEAT | Supported | |
| CASE / OF / END_CASE | Supported | Integer, bit, and enum selectors |
| EXIT | Supported | Break from loop |
| RETURN | Supported | Early return from POU |

## OOP Extensions

| Feature | Status | Notes |
|---------|--------|-------|
| Methods | Supported | On FUNCTION_BLOCK, with return types |
| Properties (GET/SET) | Supported | Virtual getter/setter methods in C++ |
| Inheritance (EXTENDS) | Supported | Single inheritance |
| Interfaces (IMPLEMENTS) | Supported | Multiple interfaces, generates C++ abstract classes |
| ABSTRACT | Supported | Abstract FB (no instantiation) and abstract methods (pure virtual) |
| FINAL | Supported | Sealed FB and methods |
| OVERRIDE | Supported | Method override with C++ override specifier |
| PUBLIC/PRIVATE/PROTECTED | Supported | Access modifiers |
| THIS | Supported | Self-reference in methods |

## Standard Functions

All IEC 61131-3 standard functions are implemented in the C++ runtime:

| Category | Functions |
|----------|-----------|
| Numeric | ABS, SQRT, LN, LOG, EXP, EXPT |
| Trigonometric | SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2 |
| Selection | SEL, MIN, MAX, LIMIT, MUX |
| Comparison | GT, GE, EQ, LE, LT, NE |
| Bitwise | AND, OR, XOR, NOT, MOVE |
| Bit Shift | SHL, SHR, ROL, ROR |
| Type Conversion | *_TO_* (INT_TO_REAL, DINT_TO_STRING, etc.) |
| String | LEN, LEFT, RIGHT, MID, CONCAT, FIND, REPLACE, INSERT, DELETE, UPPER, LOWER, TRIM |
| System | ADR, SIZEOF |

## Standard Function Blocks

Bundled as a compiled `.stlib` library (`libs/iec-standard-fb.stlib`):

| FB | Description |
|----|-------------|
| TON | On-delay timer |
| TOF | Off-delay timer |
| TP | Pulse timer |
| CTU | Count-up counter |
| CTD | Count-down counter |
| CTUD | Up/down counter |
| R_TRIG | Rising edge detector |
| F_TRIG | Falling edge detector |
| SR | Set-dominant bistable |
| RS | Reset-dominant bistable |

## Project Structure

| Feature | Status | Notes |
|---------|--------|-------|
| CONFIGURATION | Supported | |
| RESOURCE ... ON | Supported | |
| TASK ... WITH INTERVAL | Supported | |
| Program instances | Supported | `name : programType` with task assignment |
| VAR_GLOBAL in configuration | Supported | |
| Namespace configuration | Supported | Via pragmas |

## Language Extensions

| Feature | Status | Notes |
|---------|--------|-------|
| Nested comments `(* (* *) *)` | Supported | Arbitrary nesting depth |
| Pragmas `{...}` | Supported | Including `{external}` for inline C++ |
| Inline C++ | Supported | Via `{external ...}` pragma blocks |
| Inline function calls | Supported | Via `{call ...}` pragma |
| Global constants (`-D`) | Supported | CLI `-D NAME=VALUE`, emits `constexpr` |
| Dynamic memory | Supported | `__NEW(type)`, `__DELETE(ptr)` |
| POINTER TO | Supported | Full pointer type with dereference |
| Typed literals | Supported | `INT#5`, `DINT#42`, `REAL#3.14` |
| `__VARINFO` | Supported | CODESYS variable information; yields `__SYSTEM.VAR_INFO`. `Area` is always -1 and `BitAddress` 0 — OpenPLC has no device memory-area numbering |
| Generic parameters | Supported | `ANY`, `ANY_INT`, … on `VAR_INPUT` of a FUNCTION, FUNCTION_BLOCK or METHOD. Takes an elementary type, an array, an enumeration or a structure: the class names the composite (`TYPE_ARRAY`, `TYPE_ENUM`, `TYPE_USERDEF`). A structure also arrives with `TYPEDESC`, its member layout. Descriptor type `__SYSTEM.AnyType`, usable as an array element to carry arguments of mixed type |

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| UNION | CODESYS union type |
| FB_Init / FB_Exit | Constructor/destructor lifecycle methods |
| __QUERYINTERFACE | Runtime interface query |
| ACTION blocks | Named action blocks |
| TRY/CATCH/FINALLY | Exception handling |
| Generics | Parameterized types |
| Conditional compilation | Preprocessor-style conditionals |
