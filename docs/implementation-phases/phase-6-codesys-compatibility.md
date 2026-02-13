# Phase 6: CODESYS Compatibility

**Status**: PENDING
**Duration**: 8-12 weeks
**Goal**: Close the remaining gaps between STruC++ and CODESYS V3 Structured Text, enabling compilation of real-world CODESYS programs

**Prerequisites**: Phase 5 (Function Blocks, OOP, Standard FB Library, Advanced FB Patterns) must be completed.

## Overview

A comprehensive gap analysis comparing CODESYS V3 ST capabilities against STruC++ identified 25 features present in CODESYS that are missing from STruC++. These gaps are grouped into 6 sub-phases ordered by impact and dependency. Each gap is ranked by its impact on CODESYS program compatibility and estimated implementation complexity.

### Impact Ranking

| Rank | Meaning |
|------|---------|
| **CRITICAL** | Blocks compilation of common CODESYS programs |
| **HIGH** | Blocks compilation of many real-world programs |
| **MEDIUM** | Blocks specific patterns/libraries but not core programs |
| **LOW** | Edge cases, advanced features, or CODESYS-proprietary extensions |

### Complexity Estimates

| Level | Meaning |
|-------|---------|
| **S** (Small) | 1-2 days. Token + simple codegen, no new AST nodes |
| **M** (Medium) | 3-5 days. New parser rules, AST nodes, codegen handler |
| **L** (Large) | 1-2 weeks. Cross-cutting changes across lexer/parser/AST/semantic/codegen |
| **XL** (Extra Large) | 2-3 weeks. Major new subsystem or significant architectural additions |

---

## Gap Summary

| # | Gap | Impact | Complexity | Sub-Phase |
|---|-----|--------|------------|-----------|
| 1 | `POINTER TO` type declarations | CRITICAL | L | 6.1 |
| 2 | `UNION` type | HIGH | M | 6.1 |
| 3 | `FB_Init` / `FB_Exit` / `FB_Reinit` lifecycle methods | HIGH | L | 6.2 |
| 4 | `__QUERYINTERFACE` / `__QUERYPOINTER` | HIGH | L | 6.2 |
| 5 | `__ISVALIDREF` | MEDIUM | S | 6.2 |
| 6 | Output assignment operator (`=>`) in FB calls | MEDIUM | M | 6.2 |
| 7 | Bit access on integer types (`var.N`) | MEDIUM | M | 6.3 |
| 8 | Typed literals (`INT#100`, `REAL#3.14`) | MEDIUM | M | 6.3 |
| 9 | Enum base types and `{attribute 'qualified_only'}` | MEDIUM | M | 6.3 |
| 10 | `INTERNAL` access specifier | MEDIUM | S | 6.3 |
| 11 | `LTIME` / `LDATE` / `LDT` / `LTOD` (64-bit time types) | MEDIUM | L | 6.3 |
| 12 | Subrange types (`INT(1..100)`) | LOW | M | 6.3 |
| 13 | `ACTION` POU type | MEDIUM | M | 6.4 |
| 14 | `AND_THEN` / `OR_ELSE` short-circuit operators | LOW | S | 6.4 |
| 15 | `JMP` / Labels (GOTO) | LOW | M | 6.4 |
| 16 | `BIT` type (true 1-bit in structs) | LOW | M | 6.4 |
| 17 | `__TRY` / `__CATCH` / `__FINALLY` / `__ENDTRY` | LOW | L | 6.5 |
| 18 | `VAR_GENERIC CONSTANT` (compile-time generics) | LOW | XL | 6.5 |
| 19 | `INI(fb)` re-initialize FB instance | LOW | S | 6.5 |
| 20 | `__POUNAME` / `__POSITION` intrinsics | LOW | S | 6.5 |
| 21 | `BITADR` / `XSIZEOF` operators | LOW | S | 6.5 |
| 22 | Multicore/atomic operators (`TEST_AND_SET`, `__COMPARE_AND_SWAP`, `__XADD`) | LOW | M | 6.6 |
| 23 | Conditional compilation pragmas (`{IF defined(...)}`) | LOW | XL | 6.6 |
| 24 | Extended attribute pragmas (`pack_mode`, `no_assign`, `qualified_only`, etc.) | LOW | L | 6.6 |
| 25 | Property on GVL and Interface | LOW | S | 6.6 |

---

## Sub-Phase 6.1: Type System Gaps

**Duration**: 2-3 weeks
**Focus**: POINTER TO declarations and UNION type -- the most fundamental type system gaps

### 6.1.1: `POINTER TO` Type Declarations [CRITICAL | Complexity: L]

CODESYS supports fully typed pointer declarations, pointer arithmetic, and pointer-based FB instantiation. This is the single most impactful gap -- any CODESYS program using typed pointers will fail to compile.

**CODESYS syntax:**
```st
VAR
    pInt   : POINTER TO INT;
    pFB    : POINTER TO MyFB;
    pArr   : POINTER TO ARRAY[1..10] OF REAL;
END_VAR
pInt := ADR(iValue);
pInt^ := 42;                    (* Write through pointer *)
iResult := pInt^;               (* Read through pointer *)
(pInt + 3)^ := 100;             (* Pointer arithmetic *)
```

**Current state**: Phase 2.4 implements `REF_TO` / `REFERENCE TO` (safe references), and Phase 5.5 plans `ADR()` and `THIS^` dereference. However, `POINTER TO <type>` as a **type declaration** is not handled by the parser's `dataType` rule.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `POINTER` token (if not already present) |
| `src/frontend/parser.ts` | Extend `dataType` rule: `POINTER TO dataType` as an alternative |
| `src/frontend/ast.ts` | Add `PointerType` interface with `pointedType: TypeReference` |
| `src/frontend/ast-builder.ts` | Build `PointerType` nodes from CST |
| `src/semantic/symbol-table.ts` | Track pointer-typed variables for type checking |
| `src/backend/codegen.ts` | Map `POINTER TO INT` to `IEC_INT*`; pointer dereference `^` to `(*ptr)` |
| `src/backend/type-codegen.ts` | Generate pointer type declarations |

**C++ mapping:**
```cpp
// POINTER TO INT     -> IEC_INT*
// POINTER TO MyFB    -> MyFB*
// pInt^              -> (*pInt)
// ADR(x)             -> &x
// (pInt + 3)^        -> (*(pInt + 3))
```

**Notes:**
- Pointer arithmetic naturally works in C++ when the pointer type is correct
- `ADR()` from Phase 5.5 returns `uintptr_t`; for typed pointers, it should return the correct pointer type
- FB pointers (`POINTER TO MyFB`) enable dynamic dispatch patterns common in CODESYS libraries
- Array of pointers and pointer-to-array both need support

### 6.1.2: `UNION` Type [HIGH | Complexity: M]

CODESYS UNION type allows multiple members to share the same memory, commonly used for protocol parsing, hardware register overlays, and type punning.

**CODESYS syntax:**
```st
TYPE U_Data :
UNION
    wValue  : WORD;
    abBytes : ARRAY[0..1] OF BYTE;
END_UNION
END_TYPE
```

**Current state**: Not implemented. The parser handles `STRUCT` but not `UNION`.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `UNION` and `END_UNION` tokens |
| `src/frontend/parser.ts` | Add `unionDeclaration` rule mirroring `structDeclaration` |
| `src/frontend/ast.ts` | Add `UnionDeclaration` interface (similar to `StructDeclaration`) |
| `src/frontend/ast-builder.ts` | Build union AST nodes |
| `src/backend/codegen.ts` | Generate C++ `union` with proper member declarations |
| `src/backend/type-codegen.ts` | Handle UNION in type declaration codegen |

**C++ mapping:**
```cpp
union U_Data {
    IEC_WORD wValue;
    std::array<IEC_BYTE, 2> abBytes;
};
```

**Constraints:**
- Minimum 2 members required
- Total size equals the largest member
- Cannot use `IECVar<T>` wrapper (forcing doesn't make sense for overlapped memory)
- UNION members should not have initializers (undefined which member's init applies)

---

## Sub-Phase 6.2: FB Lifecycle and Runtime Type System

**Duration**: 2-3 weeks
**Focus**: FB_Init/FB_Exit/FB_Reinit lifecycle, interface querying, reference validation, and output assignment

### 6.2.1: `FB_Init` / `FB_Exit` / `FB_Reinit` [HIGH | Complexity: L]

CODESYS FBs have implicit lifecycle methods that act as constructors/destructors. `FB_Init` is particularly important because it can accept additional custom parameters, functioning as a parameterized constructor.

**CODESYS syntax:**
```st
FUNCTION_BLOCK FB_Logger
VAR
    _logLevel : INT;
END_VAR

METHOD FB_Init : BOOL
VAR_INPUT
    bInitRetains : BOOL;    (* Standard parameter *)
    bInCopyCode  : BOOL;    (* Standard parameter *)
    logLevel     : INT;     (* Custom constructor parameter *)
END_VAR
    _logLevel := logLevel;
END_METHOD

METHOD FB_Exit : BOOL
VAR_INPUT
    bInCopyCode : BOOL;
END_VAR
    (* Cleanup resources *)
END_METHOD
END_FUNCTION_BLOCK

(* Instantiation with custom init parameter: *)
VAR
    logger : FB_Logger(logLevel := 3);
END_VAR
```

**Current state**: Phase 5.2 implements methods and inheritance but does not recognize `FB_Init`/`FB_Exit`/`FB_Reinit` as special lifecycle methods.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/semantic/symbol-table.ts` | Detect `FB_Init`/`FB_Exit`/`FB_Reinit` method names as lifecycle methods |
| `src/semantic/analyzer.ts` | Validate lifecycle method signatures; extract custom parameters from `FB_Init` |
| `src/frontend/parser.ts` | Support FB instantiation with parameters: `myFB : FBType(param := val)` |
| `src/frontend/ast.ts` | Add optional `initArguments` field to variable declarations |
| `src/backend/codegen.ts` | Map `FB_Init` → C++ constructor, `FB_Exit` → destructor, `FB_Reinit` → reinit method |

**C++ mapping:**
```cpp
class FB_Logger {
public:
    IEC_INT _logLevel;

    // FB_Init maps to constructor
    FB_Logger(IEC_INT logLevel = 0) : _logLevel(logLevel) {}

    // FB_Exit maps to destructor
    ~FB_Logger() { /* cleanup */ }

    // FB_Reinit maps to a reinit method called after copy
    void FB_Reinit() { /* post-copy reinitialization */ }
};

// Instantiation with parameter:
FB_Logger logger{3};
```

**Inheritance calling order:**
- Init: parent constructor first, then child (C++ default)
- Exit: child destructor first, then parent (C++ default)
- Reinit: parent first, then child (must be explicitly chained)

### 6.2.2: `__QUERYINTERFACE` / `__QUERYPOINTER` [HIGH | Complexity: L]

CODESYS provides runtime interface casting, essential for polymorphic patterns like the Strategy/Observer patterns commonly used in CODESYS libraries.

**CODESYS syntax:**
```st
VAR
    iBase  : IBase;
    iChild : IChild;
    pFB    : POINTER TO FB_Concrete;
    bOk    : BOOL;
END_VAR
bOk := __QUERYINTERFACE(iBase, iChild);    (* Interface-to-interface cast *)
bOk := __QUERYPOINTER(iBase, pFB);         (* Interface-to-pointer cast *)
```

**Current state**: Phase 5.2 implements interfaces and `IMPLEMENTS` but does not support runtime type interrogation. The interfaces are generated as C++ abstract classes, but without RTTI support for querying.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `__QUERYINTERFACE` and `__QUERYPOINTER` tokens |
| `src/frontend/parser.ts` | Parse as special built-in function call expressions |
| `src/frontend/ast.ts` | Add `QueryInterfaceExpression` and `QueryPointerExpression` nodes |
| `src/backend/codegen.ts` | Map to C++ `dynamic_cast<>` |

**C++ mapping:**
```cpp
// __QUERYINTERFACE(iBase, iChild) ->
IChild* __tmp = dynamic_cast<IChild*>(iBase);
if (__tmp) { iChild = __tmp; bOk = true; } else { bOk = false; }

// __QUERYPOINTER(iBase, pFB) ->
FB_Concrete* __tmp = dynamic_cast<FB_Concrete*>(iBase);
if (__tmp) { pFB = __tmp; bOk = true; } else { bOk = false; }
```

**Prerequisites:**
- Phase 5.2 interfaces must generate classes with virtual destructors (for `dynamic_cast` to work)
- Compile with RTTI enabled (`-frtti`, which is the g++ default)
- Interface-typed variables must be stored as pointers internally

### 6.2.3: `__ISVALIDREF` [MEDIUM | Complexity: S]

Checks if a `REFERENCE TO` variable points to a valid target.

**CODESYS syntax:**
```st
VAR refInt : REFERENCE TO INT; END_VAR
IF __ISVALIDREF(refInt) THEN
    refInt := 42;
END_IF
```

**Current state**: Phase 2.4 implements `REFERENCE TO` but not the validity check operator.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `__ISVALIDREF` token |
| `src/semantic/std-function-registry.ts` | Register as built-in, return type `BOOL` |
| `src/backend/codegen.ts` | Map to null-pointer check: `(&refInt != nullptr)` |

### 6.2.4: Output Assignment Operator (`=>`) in FB Calls [MEDIUM | Complexity: M]

CODESYS allows inline capture of FB outputs during invocation using the `=>` operator.

**CODESYS syntax:**
```st
fbTimer(IN := start, PT := T#5s, Q => isDone, ET => elapsed);
```

**Current state**: Phase 5.1 plans input assignment (`:=`) in FB calls. The `=>` output assignment is not mentioned.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `OutputAssign` (`=>`) token (may exist for other purposes) |
| `src/frontend/parser.ts` | Extend argument list to allow `name => variable` alongside `name := expression` |
| `src/frontend/ast.ts` | Add `isOutput` flag to `Argument` interface |
| `src/backend/codegen.ts` | Generate output reads after the FB call: `isDone = fbTimer.Q;` |

**C++ mapping:**
```cpp
// fbTimer(IN := start, PT := T#5s, Q => isDone, ET => elapsed)
// becomes:
fbTimer.IN = start;
fbTimer.PT = IEC_TIME::from_ms(5000);
fbTimer();
isDone = fbTimer.Q;
elapsed = fbTimer.ET;
```

---

## Sub-Phase 6.3: Literals, Type Refinements, and Time Types

**Duration**: 2-3 weeks
**Focus**: Typed literals, bit access, enum enhancements, 64-bit time types, and subranges

### 6.3.1: Bit Access on Integer Types [MEDIUM | Complexity: M]

CODESYS allows accessing individual bits of integer/word types using dot notation with a numeric index.

**CODESYS syntax:**
```st
VAR wFlags : WORD; dwReg : DWORD; END_VAR
wFlags.0 := TRUE;              (* Set bit 0 *)
bBit := dwReg.31;              (* Read bit 31 *)
```

**Current state**: Not implemented. The parser would interpret `wFlags.0` as a member access with `0` as the member name, which would fail since `0` is not an Identifier.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/parser.ts` | Extend member access rule to allow `expression.IntegerLiteral` for bit access |
| `src/frontend/ast.ts` | Add `BitAccessExpression` with `variable: Expression` and `bitIndex: number` |
| `src/frontend/ast-builder.ts` | Detect numeric member access and build `BitAccessExpression` |
| `src/backend/codegen.ts` | Read: `((wFlags >> N) & 1)`, Write: `wFlags \|= (1 << N)` / `wFlags &= ~(1 << N)` |

**Constraints:**
- Bit index must be a constant (not a variable) in CODESYS
- 0-based indexing
- Works on BYTE (0..7), WORD (0..15), DWORD (0..31), LWORD (0..63)

### 6.3.2: Typed Literals [MEDIUM | Complexity: M]

CODESYS allows type-prefixed literal constants to explicitly specify the data type of a constant value.

**CODESYS syntax:**
```st
iVal  := INT#100;
bFlag := BOOL#TRUE;
rVal  := REAL#3.14;
wMask := WORD#16#FF00;
```

**Current state**: The lexer handles numeric base prefixes (`16#`, `8#`, `2#`) but not the `TYPE#value` syntax.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Recognize `TYPE#literal` pattern as a single token or handle in parser |
| `src/frontend/parser.ts` | Parse `TypeName # literal` as a typed literal expression |
| `src/frontend/ast.ts` | Add `TypedLiteral` node with `typeName: string` and `value: Literal` |
| `src/backend/codegen.ts` | Map to C++ `static_cast<IEC_TYPE>(value)` |

**Supported types**: BOOL, SINT, USINT, BYTE, INT, UINT, WORD, DINT, UDINT, DWORD, LINT, ULINT, LWORD, REAL, LREAL

### 6.3.3: Enum Base Types and `qualified_only` [MEDIUM | Complexity: M]

CODESYS enums support explicit base types and the `qualified_only` attribute for scoped access.

**CODESYS syntax:**
```st
{attribute 'qualified_only'}
TYPE E_State : UINT (Idle := 0, Running := 1, Error := 99);
END_TYPE

(* Usage: E_State.Idle, NOT just Idle *)
```

**Current state**: Phase 2.2 implements basic enums with default INT base. Explicit base type and `qualified_only` are not supported.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/parser.ts` | Allow optional base type before enum value list: `TypeName (values...)` |
| `src/frontend/ast.ts` | Add `baseType?: string` to `EnumDeclaration` |
| `src/backend/codegen.ts` | Use specified base type in C++ `enum class : uint16_t` |
| `src/semantic/analyzer.ts` | Enforce `qualified_only` attribute (require `E_State.Idle` syntax) |

**C++ mapping:**
```cpp
enum class E_State : uint16_t {
    Idle = 0,
    Running = 1,
    Error = 99
};
```

Note: C++ `enum class` is naturally qualified, which aligns well with CODESYS `qualified_only`.

### 6.3.4: `INTERNAL` Access Specifier [MEDIUM | Complexity: S]

CODESYS supports `INTERNAL` visibility for methods/properties, restricting access to the current namespace/library.

**Current state**: Phase 5.2 plans PUBLIC, PRIVATE, PROTECTED but not INTERNAL.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `INTERNAL` token |
| `src/frontend/parser.ts` | Add to access specifier alternatives |
| `src/semantic/analyzer.ts` | Enforce library/namespace boundary checks |
| `src/backend/codegen.ts` | Map to C++ comment annotation (no direct C++ equivalent; enforcement is compile-time only) |

### 6.3.5: `LTIME` / `LDATE` / `LDT` / `LTOD` (64-bit Time Types) [MEDIUM | Complexity: L]

CODESYS supports 64-bit time and date types with nanosecond resolution, used for high-precision timing.

**CODESYS syntax:**
```st
VAR
    lt : LTIME := LTIME#100ns;
    ld : LDATE := LDATE#2024-01-15;
    ldt : LDT := LDT#2024-01-15-14:30:00;
    ltod : LTOD := LTOD#08:15:00.000000100;
END_VAR
```

**Current state**: Phase 1.3 implements TIME, DATE, DT, TOD (32-bit). The C++ runtime has `IEC_TIME` etc. but no 64-bit variants.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/runtime/include/iec_time.hpp` | Add `IEC_LTIME`, `IEC_LDATE`, `IEC_LDT`, `IEC_LTOD` types using 64-bit storage |
| `src/frontend/lexer.ts` | Add `LTIME`, `LDATE`, `LDT`, `LTOD` tokens and literal prefixes |
| `src/frontend/parser.ts` | Recognize `LTIME#`, `LDATE#`, `LDT#`, `LTOD#` literals |
| `src/semantic/std-function-registry.ts` | Add conversion functions for 64-bit time types |
| `src/backend/codegen.ts` | Map to C++ 64-bit time types |

**Value ranges:**
- LTIME: nanosecond resolution duration (int64_t)
- LDATE: nanoseconds since 1970-01-01 (int64_t)
- LDT: nanoseconds since 1970-01-01 (int64_t)
- LTOD: nanoseconds since midnight (uint64_t)

### 6.3.6: Subrange Types [LOW | Complexity: M]

CODESYS supports integer types with constrained value ranges.

**CODESYS syntax:**
```st
TYPE T_Percent : INT(0..100); END_TYPE
TYPE T_Index : DINT(1..1000); END_TYPE
```

**Current state**: Phase 1.5 mentions subrange types in composite types but they are not implemented in the parser.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/parser.ts` | Parse `TypeName(low..high)` in type declarations |
| `src/frontend/ast.ts` | Add `SubrangeType` with `baseType`, `low`, `high` |
| `src/backend/codegen.ts` | Map to base type with optional runtime bounds checking |

---

## Sub-Phase 6.4: Control Flow and POU Extensions

**Duration**: 1-2 weeks
**Focus**: ACTION blocks, short-circuit operators, JMP/labels, BIT type

### 6.4.1: `ACTION` POU Type [MEDIUM | Complexity: M]

Actions are subordinate code blocks belonging to a POU. They share the parent POU's variables and are primarily used in SFC programs, but also appear in ST code.

**CODESYS syntax:**
```st
PROGRAM MyProg
VAR counter : INT; END_VAR
    MyAction;           (* Call the action *)
END_PROGRAM

ACTION MyAction:
    counter := counter + 1;
END_ACTION
```

**Current state**: Not implemented in any phase.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `ACTION` and `END_ACTION` tokens |
| `src/frontend/parser.ts` | Add `actionDeclaration` rule inside POU declarations |
| `src/frontend/ast.ts` | Add `ActionDeclaration` with `name: string` and `body: Statement[]` |
| `src/backend/codegen.ts` | Generate as a method on the parent class, called by name |

**C++ mapping:**
```cpp
class MyProg {
public:
    IEC_INT counter;

    void MyAction() {     // Action becomes a method
        counter = counter + 1;
    }

    void operator()() {
        MyAction();       // Action call
    }
};
```

### 6.4.2: `AND_THEN` / `OR_ELSE` Short-Circuit Operators [LOW | Complexity: S]

CODESYS extension for short-circuit boolean evaluation. The second operand is not evaluated if the result is already determined from the first.

**CODESYS syntax:**
```st
IF pData <> 0 AND_THEN pData^.valid THEN ...
IF bFast OR_ELSE SlowCheck() THEN ...
```

**Current state**: Standard `AND`/`OR` in IEC 61131-3 evaluate both operands. STruC++ doesn't support the short-circuit variants.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `AND_THEN` and `OR_ELSE` tokens |
| `src/frontend/parser.ts` | Add as binary operator alternatives alongside `AND`/`OR` |
| `src/backend/codegen.ts` | Map `AND_THEN` to C++ `&&`, `OR_ELSE` to C++ `\|\|` |

### 6.4.3: `JMP` / Labels [LOW | Complexity: M]

CODESYS supports `JMP` (goto) with labels in Structured Text, though it's discouraged.

**CODESYS syntax:**
```st
myLabel:
    (* ... code ... *)
    JMP myLabel;
```

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `JMP` token |
| `src/frontend/parser.ts` | Parse label declarations (`Identifier Colon`) and `JMP Identifier` statements |
| `src/frontend/ast.ts` | Add `LabelDeclaration` and `JumpStatement` nodes |
| `src/backend/codegen.ts` | Map to C++ `goto` and labels |

### 6.4.4: `BIT` Type [LOW | Complexity: M]

CODESYS-specific true 1-bit type (vs BOOL which is 8 bits), used in structs for bit packing.

**CODESYS syntax:**
```st
TYPE S_Flags :
STRUCT
    bReady   : BIT;
    bRunning : BIT;
    bError   : BIT;
END_STRUCT
END_TYPE
```

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `BIT_TYPE` token |
| `src/runtime/include/iec_types.hpp` | Define `IEC_BIT` type |
| `src/backend/codegen.ts` | Inside structs, map `BIT` to C++ bitfields: `bool bReady : 1;` |

---

## Sub-Phase 6.5: CODESYS Extension Operators

**Duration**: 2-3 weeks
**Focus**: Exception handling, compile-time generics, and minor built-in operators

### 6.5.1: `__TRY` / `__CATCH` / `__FINALLY` / `__ENDTRY` [LOW | Complexity: L]

CODESYS provides structured exception handling for runtime errors like divide-by-zero and access violations.

**CODESYS syntax:**
```st
VAR exc : __SYSTEM.ExceptionCode; END_VAR
__TRY
    iResult := iNum / iDenom;
__CATCH(exc)
    CASE exc OF
        __SYSTEM.ExceptionCode.DIVIDE_BY_ZERO:
            iResult := 0;
    END_CASE
__FINALLY
    bDone := TRUE;
__ENDTRY
```

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `__TRY`, `__CATCH`, `__FINALLY`, `__ENDTRY` tokens |
| `src/frontend/parser.ts` | Add `tryStatement` rule with catch and finally clauses |
| `src/frontend/ast.ts` | Add `TryCatchStatement` with `tryBody`, `catchVariable`, `catchBody`, `finallyBody` |
| `src/runtime/include/iec_exceptions.hpp` | Define `ExceptionCode` enum with standard codes |
| `src/backend/codegen.ts` | Map to C++ `try { } catch (ExceptionCode& e) { } finally { }` |

**Note**: C++ doesn't have `finally`; codegen must use RAII or a scope-guard pattern. Division-by-zero and access violations are not C++ exceptions by default -- this may require platform-specific signal handling or compile-time checks.

### 6.5.2: `VAR_GENERIC CONSTANT` (Compile-Time Generics) [LOW | Complexity: XL] - DO NOT IMPLEMENT: DEFERRED FOR LATER DUE TO XL COMPLEXITY

CODESYS extension for template-like parameterization of FBs with compile-time constants.

**CODESYS syntax:**
```st
FUNCTION_BLOCK FB_Buffer
VAR_GENERIC CONSTANT
    SIZE : UDINT := 100;
END_VAR
VAR
    data : ARRAY[0..SIZE-1] OF BYTE;
END_VAR
END_FUNCTION_BLOCK

VAR
    buf1 : FB_Buffer<10>;
    buf2 : FB_Buffer<1000>;
END_VAR
```

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `VAR_GENERIC` token |
| `src/frontend/parser.ts` | Parse `VAR_GENERIC CONSTANT ... END_VAR` section; parse angle-bracket instantiation `FBType<value>` |
| `src/frontend/ast.ts` | Add `GenericConstantDeclaration` and extend FB instantiation with generic args |
| `src/semantic/analyzer.ts` | Resolve generic constants, substitute into array dimensions and expressions |
| `src/backend/codegen.ts` | Map to C++ templates: `template<size_t SIZE = 100> class FB_Buffer { ... }` |

**C++ mapping:**
```cpp
template<IEC_UDINT SIZE = 100>
class FB_Buffer {
    std::array<IEC_BYTE, SIZE> data;
};

FB_Buffer<10> buf1;
FB_Buffer<1000> buf2;
```

### 6.5.3: `INI(fb)` -- Re-initialize FB Instance [LOW | Complexity: S]

Reinitializes an FB instance to its default state at runtime.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/semantic/std-function-registry.ts` | Register `INI` as built-in |
| `src/backend/codegen.ts` | Map `INI(fb)` to placement-new or assignment: `fb = FBType();` |

### 6.5.4: `__POUNAME` / `__POSITION` Intrinsics [LOW | Complexity: S]

Compile-time intrinsics returning the current POU name and source line number, useful for debug logging.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add `__POUNAME` and `__POSITION` tokens |
| `src/backend/codegen.ts` | Replace at compile-time: `__POUNAME` → string literal of current POU name, `__POSITION` → integer literal of current line |

### 6.5.5: `BITADR` / `XSIZEOF` Operators [LOW | Complexity: S]

`BITADR(x)` returns the bit offset of a variable within its container. `XSIZEOF(x)` is an extended platform-aware SIZEOF.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/semantic/std-function-registry.ts` | Register `BITADR` and `XSIZEOF` |
| `src/backend/codegen.ts` | `BITADR` → `offsetof` based calculation; `XSIZEOF` → `sizeof` (same as SIZEOF in C++ targets) |

---

## Sub-Phase 6.6: Advanced Pragmas, Atomics, and Miscellaneous

**Duration**: 2-3 weeks (optional -- lowest priority)
**Focus**: Conditional compilation, extended attribute pragmas, multicore operators

### 6.6.1: Multicore/Atomic Operators [LOW | Complexity: M]

CODESYS provides `TEST_AND_SET`, `__COMPARE_AND_SWAP`, and `__XADD` for thread-safe operations in multi-task environments.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Add tokens for each operator |
| `src/semantic/std-function-registry.ts` | Register as built-in functions |
| `src/backend/codegen.ts` | Map to C++ `std::atomic` operations |

**C++ mapping:**
```cpp
// TEST_AND_SET(flag)        -> flag.test_and_set()
// __COMPARE_AND_SWAP(ptr, old, new) -> std::atomic_compare_exchange_strong(ptr, &old, new)
// __XADD(ptr, val)          -> std::atomic_fetch_add(ptr, val)
```

### 6.6.2: Conditional Compilation Pragmas [LOW | Complexity: XL]

CODESYS provides a rich preprocessor-like conditional compilation system.

**CODESYS syntax:**
```st
{IF defined (MY_DEBUG)}
    (* Debug code *)
{ELSIF defined (IsSimulationMode)}
    (* Simulation code *)
{ELSE}
    (* Production code *)
{END_IF}

{define MY_FLAG}
{undefine MY_FLAG}
```

**Available operators**: `defined()`, `defined(variable: x)`, `defined(type: x)`, `defined(pou: x)`, `hasattribute()`, `hastype()`, `hasvalue()`, `project_defined()`, `NOT`, `AND`, `OR`

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Recognize `{IF`, `{ELSIF`, `{ELSE`, `{END_IF}`, `{define`, `{undefine` pragma tokens |
| `src/frontend/preprocessor.ts` | **New file**: Implement a preprocessing pass before parsing |
| `src/semantic/analyzer.ts` | Provide symbol table queries for `defined(variable:)`, `hasattribute()`, etc. |

**Implementation approach**: Two-pass -- preprocessor runs first, strips/includes code blocks, then feeds clean source to the parser. Perhaps an easier approach could make use of C++ preprocessor directives like #ifdef and others instead of processing the code directly. Analyze if this is a better approach which could reduce significantly the complexity of this task.

### 6.6.3: Extended Attribute Pragmas [LOW | Complexity: L] - DO NOT IMPLEMENT: DEFERRED FOR LATER DUE TO L COMPLEXITY

CODESYS defines many predefined attribute pragmas that affect compilation behavior.

**Key pragmas to support:**

| Pragma | Effect | Complexity |
|--------|--------|------------|
| `{attribute 'qualified_only'}` | Force qualified access on GVLs and enums | M |
| `{attribute 'pack_mode' := 'N'}` | Control struct alignment | S |
| `{attribute 'no_assign'}` | Prevent FB instance assignment | S |
| `{attribute 'enable_dynamic_creation'}` | Allow use with `__NEW` | S |
| `{attribute 'noinit'}` | Skip variable initialization | S |
| `{attribute 'obsolete' := 'msg'}` | Deprecation warning | S |
| `{attribute 'call_after_init'}` | Post-initialization callback | M |
| `{attribute 'hide'}` | Hide from IDE (no codegen impact) | - |
| `{attribute 'monitoring' := '...'}` | IDE monitoring (no codegen impact) | - |
| `{attribute 'displaymode' := '...'}` | Display format (no codegen impact) | - |

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/parser.ts` | Extend pragma parsing to capture attribute name-value pairs |
| `src/semantic/analyzer.ts` | Apply attribute effects during semantic analysis |
| `src/backend/codegen.ts` | `pack_mode` → `#pragma pack(N)`, `no_assign` → deleted copy assignment, `noinit` → skip initializer |

**Note**: Many CODESYS attributes are IDE-specific (hide, monitoring, displaymode) and have no codegen impact. These can be parsed and silently ignored.

### 6.6.4: Property on GVL and Interface [LOW | Complexity: S]

CODESYS allows properties on Global Variable Lists and Interfaces, not just Function Blocks.

**Current state**: Phase 5.2 plans properties on FBs only.

**Changes needed:**

| File | Changes |
|------|---------|
| `src/frontend/parser.ts` | Allow `PROPERTY` declaration inside `INTERFACE` and GVL scopes |
| `src/backend/codegen.ts` | Generate getter/setter functions in the appropriate scope |

---

## Implementation Order

The sub-phases should be implemented in order due to dependencies:

```
6.1 (POINTER TO, UNION) ─────────────────────────┐
                                                    ├─→ 6.5 (Exceptions, Generics, Misc)
6.2 (FB Lifecycle, QueryInterface, =>) ───────────┤
                                                    ├─→ 6.6 (Pragmas, Atomics)
6.3 (Literals, Bit Access, Enums, 64-bit Time) ───┤
                                                    │
6.4 (ACTION, Short-circuit, JMP, BIT) ────────────┘
```

- **6.1** is foundational (POINTER TO is needed by 6.2's `__QUERYPOINTER`)
- **6.2** depends on 6.1 for pointer types
- **6.3** and **6.4** are independent of each other and can be parallelized
- **6.5** and **6.6** are lowest priority and can be deferred

### Recommended Minimum Viable CODESYS Compatibility

For a practical "CODESYS-compatible" milestone, implement sub-phases **6.1 through 6.4** (approximately 7-11 weeks). This covers all CRITICAL and HIGH gaps plus the most commonly used MEDIUM gaps. Sub-phases 6.5 and 6.6 can be deferred until specific CODESYS programs require them.

---

## Success Criteria

- Programs using `POINTER TO` declarations compile and generate correct C++ pointer types
- `UNION` types produce C++ unions with correct overlapping memory layout
- `FB_Init` with custom parameters generates C++ constructors with those parameters
- `__QUERYINTERFACE` and `__QUERYPOINTER` produce correct `dynamic_cast<>` code
- `__ISVALIDREF` generates null-pointer checks
- FB calls with `=>` output assignment generate correct post-call reads
- Bit access (`var.N`) generates correct bitwise operations
- Typed literals generate correct C++ casts
- Enums with explicit base types generate `enum class : base_type`
- 64-bit time types (LTIME, LDATE, LDT, LTOD) compile to 64-bit C++ types
- ACTION blocks generate methods callable from the parent POU
- `AND_THEN`/`OR_ELSE` generate C++ `&&`/`||`
- All generated C++ compiles with g++ -std=c++17
- All new tests pass with 75%+ branch coverage

## Notes

### Features Intentionally NOT Included

The following CODESYS features are excluded from this phase as they are either IDE-specific, require a full runtime environment, or have negligible real-world impact:

- **SFC (Sequential Function Chart)** -- Separate language; OpenPLC Editor converts SFC to ST before compilation
- **IL (Instruction List)** / **LD (Ladder Diagram)** / **FBD (Function Block Diagram)** -- Same as above
- **Online change** -- Runtime feature, not a compiler feature
- **Visualization** -- IDE feature
- **`__SYSTEM.IQueryInterface`** implicit base -- Can be approximated by ensuring all interfaces have virtual destructors
- **`__VARINFO`** -- Deep runtime introspection, rarely used in application code
- **`__POOL`** -- Memory pool access, highly runtime-specific
- **`INDEXOF`** -- Internal POU indexing, runtime-specific
- **Platform-dependent types** (`__UXINT`, `__XINT`, `__XWORD`) -- Can be added as type aliases if needed
