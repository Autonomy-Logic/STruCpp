# IEC 61131-3 Compliance

STruC++ implements the Structured Text (ST) language from IEC 61131-3. This document lists supported features and known gaps. The compiler also supports common CODESYS extensions where noted.

## Data Types

| Type | Status | Notes |
|------|--------|-------|
| BOOL | Supported | |
| BYTE, WORD, DWORD, LWORD | Supported | |
| SINT, INT, DINT, LINT | Supported | |
| USINT, UINT, UDINT, ULINT | Supported | |
| REAL, LREAL | Supported | REAL arithmetic and REAL functions (SQRT, SIN, COS, ...) compute in single precision; an untyped real literal (`1.5`) takes the type of its context, so it is a float next to a REAL and a double next to an LREAL |
| TIME | Supported | Nanosecond precision, int64_t storage |
| DATE | Supported | |
| TIME_OF_DAY | Supported | |
| DATE_AND_TIME | Supported | |
| LTIME, LDATE, LTOD, LDT | Supported | 64-bit time types with nanosecond precision |
| STRING | Supported | Parameterized length: STRING(N) (CODESYS) or STRING[N] (IEC 61131-3 Ed. 3), default 254; array elements keep their declared length |
| WSTRING | Supported | Parameterized length: WSTRING(N) or WSTRING[N] |
| CHAR, WCHAR | Supported | |

### Derived Types

| Type | Status | Notes |
|------|--------|-------|
| TYPE ... END_TYPE | Supported | Type aliases |
| STRUCT ... END_STRUCT | Supported | With nested structs |
| Enumerations | Supported | With optional base type. Conversions `TO_<ENUM>(x)` / `<TYPE>_TO_<ENUM>(x)` give the member with that integer value; `TO_<TYPE>(e)` / `<ENUM>_TO_<TYPE>(e)` give the member's integer value. A user or library FUNCTION with one of these names is called instead |
| Initialized type declarations | Supported | A type may carry its own default (`Setpoint : REAL := 25.0;`, `Origin : Point := (x := 0.0);`), inherited by every declaration of the type that has no initializer |
| ARRAY (1D) | Supported | Arbitrary bounds: ARRAY[1..10] OF INT |
| ARRAY (2D) | Supported | ARRAY[1..3, 1..4] OF REAL |
| ARRAY (3D) | Supported | ARRAY[1..3, 1..4, 1..5] OF INT |
| ARRAY OF function block | Supported | Declaration, member access, element invocation (`units[i](step := 1.0)`) and method calls on elements (`units[0].M()`) |
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
| INTERFACE | Supported | Method and property signatures; a property lists GET, SET or both without bodies, and an implementing block must provide it with the same type and those accessors. Methods and properties implementing an interface member must be PUBLIC. Interface-typed variables, arrays and structure fields hold a reference to an implementing instance (`itf := fb`, `itf.M()`, `itf = 0`); a method returning an interface returns such a reference, which may be 0. Interfaces of a linked library are used like the unit's own: as variable types, in `IMPLEMENTS`, and for calls and properties |

## Variable Declarations

| Feature | Status | Notes |
|---------|--------|-------|
| VAR | Supported | Local variables |
| VAR_INPUT | Supported | Input parameters |
| VAR_OUTPUT | Supported | Output parameters |
| VAR_IN_OUT | Supported | Pass-by-reference parameters |
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

### Initialization gaps

| Form | Notes |
|------|-------|
| Repetition with no value | `:= [10()]` (ten copies of the element default) — write `:= [10(0)]`, or omit the elements entirely. Matches matiec and CODESYS, which also require a value |

## Operators and Expressions

| Category | Operators | Status |
|----------|-----------|--------|
| Arithmetic | `+`, `-`, `*`, `/`, `MOD`, `**` | Supported; REAL `**` computes like `EXPT`, in single precision |
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
| Method call | `obj.method(args)`, `arr[i].method(args)`, `p^.method(args)`, `a.b.method(args)` | Supported |
| Array access | `arr[i]`, `arr[i, j]` | Supported — the index count is validated against the declared rank |
| Field access | `struct.field` | Supported |
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
| Properties (GET/SET) | Supported | Virtual getter/setter methods in C++; a GET may call methods. Inside its block a property is reached as `THIS^.P` (a bare `P` is not resolved) |
| Inheritance (EXTENDS) | Supported | Single inheritance |
| Interfaces (IMPLEMENTS) | Supported | Multiple interfaces, generates C++ abstract classes |
| ABSTRACT | Supported | Abstract FB (no instantiation, including a linked library's; a `POINTER TO` or `REFERENCE TO` one is allowed) and abstract methods (pure virtual) |
| FINAL | Supported | Sealed FB and methods |
| OVERRIDE | Supported | Method override with C++ override specifier. A method named like a PRIVATE method of a base block, or an INTERNAL method of a linked library's base block, is an error, with or without OVERRIDE. Any other override keeps the base method's access modifier (none is PUBLIC), as CODESYS requires |
| PUBLIC/PRIVATE/PROTECTED/INTERNAL | Supported | Enforced on methods and on property reads and writes: PRIVATE only from the declaring FB; PROTECTED from the declaring FB or a derived one, through `THIS^`/`SUPER^`/an unqualified call or an instance of the caller's own lineage; INTERNAL only within the compilation unit (library) that declares it. The same rules apply to members of a linked library's blocks, which a consumer may extend and `OVERRIDE` like its own; a block extending a library block uses the variables it inherits. An interface named like one of a linked library is an error. INTERNAL remains usable as a variable, type, enumeration member, method or property name |
| THIS | Supported | Self-reference in methods: `THIS^`, and `THIS^.path` with any variable path (members, subscripts, dereferences), optionally called: `THIS^.s.v`, `THIS^.s.M()`, `THIS^.arr[1].M()`, `THIS^.fbs[0](x := 1)` (also `THIS.path`) |

## Diagnostics beyond the standard

| Check | Notes |
|-------|-------|
| Unknown member | `fb.x`, `s.x` on a function block, structure or interface that declares no `x` is an error; `ENO` is a member of every function block. A library archive built before members were exported lists only a block's variables, so calls and properties on its blocks are not checked |
| Unknown method | `x.m()` where the type of `x` has no method `m` (a function block member that is an FB instance, say) is an error |
| Unknown FB argument | `fb(x := ...)` where `x` is not an input, output or in-out of the block is an error, for local and library blocks |
| Members named like methods | A variable named like a method of its block's class hierarchy is a warning and is emitted under a mangled C++ name; so is a method named like a variable inherited from a block of the same unit. A method named like a variable inherited from a library block is an error, since the library's member names are fixed. A method-local variable hides a member of the same name, and the block's methods stay callable |
| Interface arguments | Passing a block that does not implement an interface to an interface-typed input of an FB, function or method is an error, as in assignments |
| ADR of an unrelated block | `p := ADR(b)` with `p` a `POINTER TO A` (a function block or interface) and `b` a block that is neither `A`, derived from it nor implementing it is a warning: a method call through `p` is undefined |

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

Both counting inputs are sampled on the rising edge, as IEC 61131-3 declares them
(`CU : BOOL R_EDGE`, `CD : BOOL R_EDGE`). A count is registered on the scan where
the input goes FALSE to TRUE, for `CD` exactly as for `CU`.

The counting range follows CODESYS rather than the standard's `PVmin`/`PVmax`:
counting up stops at `PV`, which CODESYS documents as the "upper limit for
incrementing", and counting down stops at 0, which it decrements towards "as long
as `CV` is greater than 0". CODESYS reaches that range by typing `CV` and `PV` as
`WORD`, a deviation from IEC that it documents; these blocks keep the IEC types
and express the same range through the `PV` and 0 guards.

`CTUD` keeps the standard's `IF NOT (CU AND CD)` guard, so simultaneous rising
edges on `CU` and `CD` leave `CV` unchanged. CODESYS does not document that case.

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
| Pragmas `{...}` | Supported | Including `{external}` for inline C++; CODESYS `{attribute 'name' [:= 'value']}` pragmas attach to the declaration that follows them (POU, method, property, interface, type, variable block, variable, structure field or enumeration value; only whitespace, comments and other pragmas in between). Library manifests keep them on every exported declaration except variable blocks and enumeration values, which manifests do not record. They do not change the generated code |
| Inline C++ | Supported | Via `{external ...}` pragma blocks |
| Inline function calls | Supported | Via `{call ...}` pragma |
| Global constants (`-D`) | Supported | CLI `-D NAME=VALUE`, emits `constexpr` |
| Dynamic memory | Supported | `__NEW(type)`, `__DELETE(ptr)` |
| POINTER TO | Supported | Full pointer type with dereference; `POINTER TO <FB>` from `ADR()` dispatches methods virtually |
| Typed literals | Supported | `INT#5`, `DINT#42`, `REAL#3.14` |

## Not Yet Implemented

| Feature | Notes |
|---------|-------|
| UNION | CODESYS union type |
| FB_Init / FB_Exit | Constructor/destructor lifecycle methods |
| __QUERYINTERFACE | Runtime interface query |
| Bit access (var.%X0) | Individual bit addressing |
| ACTION blocks | Named action blocks |
| TRY/CATCH/FINALLY | Exception handling |
| Generics | Parameterized types |
| Conditional compilation | Preprocessor-style conditionals |
