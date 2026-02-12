# Phase 5.5: Advanced FB Patterns and CODESYS Compatibility

**Status**: PENDING
**Duration**: 2-3 weeks
**Goal**: Implement parameterized string types, pointer dereference, method chaining, and CODESYS system functions required for real-world CODESYS-compatible programs

**Prerequisites**: Phase 5.1 (FB Instances and Invocations) and Phase 5.2 (OOP Extensions) must be completed first.

## Overview

Phases 5.1-5.2 deliver the core FB and OOP mechanics (declarations, invocations, methods, interfaces, inheritance). However, real-world CODESYS programs use several additional patterns that fall through the cracks of those phases. This was discovered when compiling a CODESYS forum sample that uses:

- `STRING(n)` parameterized string length declarations
- `THIS^` for returning the current instance from a method (fluent pattern)
- Method chaining (`fb.m1(args).m2(args).m3(args)`)
- CODESYS system functions: `ADR()`, `SIZEOF()`, `memcpy()`

These features are individually small but collectively essential for CODESYS program compatibility.

### Motivating Example

The following valid CODESYS program exercises all the missing features:

```st
INTERFACE I_MultipleConcat

METHOD concatString : I_MultipleConcat
VAR_INPUT
    sTarget : STRING;
END_VAR
END_METHOD

METHOD getResult
VAR_IN_OUT
   sRetrieveResult : STRING(1000);
END_VAR
END_METHOD

END_INTERFACE

FUNCTION_BLOCK FB_MultipleConcat IMPLEMENTS I_MultipleConcat

VAR_OUTPUT
    uiLen : UINT;
END_VAR
VAR
    sResult : STRING(1000);
END_VAR

METHOD concatString : I_MultipleConcat
VAR_INPUT
    sTarget : STRING;
END_VAR

IF uiLen + INT_TO_UINT(LEN(sTarget)) <= (SIZEOF(sResult)-1)
THEN
    memcpy(ADR(sResult) + uiLen, ADR(sTarget), LEN(sTarget));
    uiLen := uiLen + INT_TO_UINT(LEN(sTarget));
END_IF

concatString := THIS^;
END_METHOD

END_FUNCTION_BLOCK

PROGRAM Main
VAR
    testing : FB_MultipleConcat;
    outString : STRING;
END_VAR
    (* Fluent method chaining *)
    testing.concatString('Test1 ').concatString('Test 2').getResult(outString);
END_PROGRAM
```

### Current Error Output

Compiling the above produces 8 parse errors -- all traced to missing features:

| Error | Line | Root Cause |
|-------|------|-----------|
| Expecting Semicolon, found `(` | 18, 30, 54 | `STRING(1000)` not parsed |
| Expecting Dot, found `^` | 48 | `THIS^` dereference not generated |
| Expecting Assign, found `(` | 100 | Method chaining not parsed |
| Expecting Semicolon, found `.` | 100 | Method chaining not parsed |

## Scope

### 5.5.1: Parameterized String Types -- `STRING(n)` / `WSTRING(n)`

IEC 61131-3 allows declaring strings with a maximum length:

```st
VAR
    short : STRING;                (* Default 254 chars *)
    long : STRING(1000);           (* Max 1000 chars *)
    wide : WSTRING(500);           (* Wide string, max 500 chars *)
END_VAR
```

**Current state**: The parser handles `STRING` and `WSTRING` as plain type identifiers. The `(n)` length parameter is not recognized, causing a parse error at `(`.

**Changes needed**:

**Parser** (`src/frontend/parser.ts`):

Extend the `dataType` rule (or the variable declaration context where types appear) to recognize `STRING` and `WSTRING` followed by an optional `(expression)`:

```
dataType → STRING [ '(' expression ')' ]
         | WSTRING [ '(' expression ')' ]
         | Identifier [ '(' expression ')' ]   (* for user types with params *)
         | ... existing alternatives ...
```

The `(expression)` is a constant expression specifying the max length.

**AST** (`src/frontend/ast.ts`):

Add an optional `maxLength` field to the type reference:

```typescript
export interface TypeReference extends ASTNode {
  // ... existing fields ...
  maxLength?: Expression;    // For STRING(n) / WSTRING(n)
}
```

**AST Builder** (`src/frontend/ast-builder.ts`):

When building a type reference, check for the optional `(expression)` after STRING/WSTRING and populate `maxLength`.

**Code Generation** (`src/backend/codegen.ts`):

Map parameterized string types to the C++ runtime:

```cpp
// STRING         -> IEC_STRING           (default 254)
// STRING(1000)   -> IEC_STRING<1000>     (templated max length)
// WSTRING(500)   -> IEC_WSTRING<500>
```

If the C++ runtime `IEC_STRING` doesn't support a template parameter for max length, the simplest approach is to use `std::string` (which is dynamically sized) and enforce length limits at runtime, or to add a template parameter to the runtime header.

### 5.5.2: Pointer Dereference Operator (`^`) and `THIS^`

IEC 61131-3 uses `^` as a postfix dereference operator for pointer/reference types. The most common usage is `THIS^` -- dereferencing the implicit `THIS` pointer to return the current FB instance.

```st
(* Return self for fluent chaining *)
concatString := THIS^;

(* General pointer dereference *)
pValue : POINTER TO INT;
x := pValue^;     (* dereference pointer *)
```

**Current state**: The lexer has a `Caret` token and the parser collects it as `isDereference: boolean` on `VariableExpression`, but the code generator ignores this flag entirely.

**Changes needed**:

**Code Generation** (`src/backend/codegen.ts`):

When generating a `VariableExpression` with `isDereference: true`:

```typescript
// For THIS^:
//   ST: THIS^         -> C++: (*this)
//   In method context, concatString := THIS^  -> return *this;

// For general pointers:
//   ST: ptr^           -> C++: (*ptr)
```

The `THIS^` case is special because:
- It must resolve to `(*this)` in C++
- When assigned to a method return variable, it means "return the current instance"
- This enables the fluent pattern where methods return `I_MultipleConcat` (the interface type)

**Method return type for interfaces**:

When a method's return type is an interface, and the method assigns `THIS^` to its return variable, the codegen must generate a reference return:

```cpp
// ST: METHOD concatString : I_MultipleConcat
//       concatString := THIS^;
//     END_METHOD

// C++:
virtual I_MultipleConcat& concatString(IEC_STRING sTarget) {
    // ... body ...
    return *this;
}
```

The return type should be a reference (`I_MultipleConcat&`) when the method returns an interface/FB type, to avoid slicing and enable chaining.

### 5.5.3: Method Chaining (Fluent Interface Pattern)

Method chaining allows calling methods on the return value of a previous method call:

```st
testing.concatString('Test1 ').concatString('Test 2').getResult(outString);
```

This is syntactically: `expression.method(args)` where `expression` can itself be a method call result.

**Current state**: The parser handles a single method call on an FB instance (`fb.method(args)`) but does not support chaining -- the result of a method call cannot be used as the base for another `.method()` call.

**Changes needed**:

**Parser** (`src/frontend/parser.ts`):

The grammar needs to support postfix method calls as a chain. The expression rule should allow:

```
postfixExpression → primaryExpression { '.' Identifier '(' argumentList ')' }
                  | primaryExpression { '.' Identifier }
```

This means after parsing a primary expression (which could be `fb.method(args)`), the parser continues to look for additional `.method(args)` suffixes.

One approach is to make method call chaining part of the `memberAccess` / expression postfix rules:

```
chainedCall → expression '.' Identifier '(' [ argumentList ] ')'
```

Where `expression` on the left can be any expression, including another `chainedCall`.

**AST** (`src/frontend/ast.ts`):

Add a new expression node for method call chains, or extend the existing `FunctionCallExpression` to support an `object` expression:

```typescript
export interface MethodCallExpression extends ASTNode {
  kind: "MethodCallExpression";
  object: Expression;         // The expression to call the method on
  methodName: string;
  arguments: Argument[];
}

// Add to Expression union type
export type Expression =
  | ... existing ...
  | MethodCallExpression;
```

Alternatively, method chaining can be represented as nested `MethodCallExpression` nodes:

```
testing.concatString('Test1 ').concatString('Test 2').getResult(outString)

becomes:

MethodCallExpression {
  object: MethodCallExpression {
    object: MethodCallExpression {
      object: VariableExpression { name: "testing" },
      methodName: "concatString",
      arguments: [{ value: 'Test1 ' }]
    },
    methodName: "concatString",
    arguments: [{ value: 'Test 2' }]
  },
  methodName: "getResult",
  arguments: [{ name: undefined, value: VariableExpression { name: "outString" } }]
}
```

**AST Builder** (`src/frontend/ast-builder.ts`):

Build `MethodCallExpression` nodes from the CST. When the parser produces a chain of `.method(args)` postfixes, the builder should nest them left-to-right.

**Code Generation** (`src/backend/codegen.ts`):

Generate chained C++ method calls directly:

```typescript
private generateMethodCallExpression(node: MethodCallExpression): string {
  const obj = this.generateExpression(node.object);
  const args = node.arguments.map(a => this.generateExpression(a.value)).join(", ");
  return `${obj}.${node.methodName}(${args})`;
}
```

This naturally chains: `testing.concatString("Test1 ").concatString("Test 2").getResult(outString)`.

**Statement form**: Method chaining can appear as a standalone statement (like in the motivating example). The existing `expressionStatement` handling or a dedicated method call statement handler must support this.

### 5.5.4: CODESYS System Functions -- `ADR`, `SIZEOF`, `memcpy`

These are CODESYS extensions not in the IEC 61131-3 standard, but they are widely used in real-world programs for low-level memory operations.

#### `ADR(variable)` -- Address-of operator

Returns a pointer to a variable's memory location.

```st
pAddr := ADR(myVar);    (* Get address of myVar *)
```

**C++ mapping**: `&myVar` or a helper that returns the raw address.

**Implementation**:

- **Std function registry**: Register `ADR` as a built-in function
- **Codegen**: Map `ADR(x)` to `reinterpret_cast<POINTER_T>(&(x))` or simply `&(x)` depending on the pointer model
- **Return type**: `POINTER TO <type of argument>` -- but since STruC++ may not fully support `POINTER TO`, a simplified approach maps to `std::uintptr_t` or a raw pointer

```typescript
// std-function-registry.ts
{ name: 'ADR', cppName: 'ADR', returnConstraint: 'specific',
  specificReturnType: 'PVOID', params: [{ name: 'var', type: 'ANY' }],
  isVariadic: false, isConversion: false, category: 'system' }
```

**C++ runtime helper** (`src/runtime/include/iec_std_lib.hpp`):
```cpp
template<typename T>
inline std::uintptr_t ADR(T& var) {
    return reinterpret_cast<std::uintptr_t>(&var);
}
```

#### `SIZEOF(variable_or_type)` -- Size operator

Returns the size in bytes of a variable or type.

```st
size := SIZEOF(myString);    (* Byte size of variable *)
```

**C++ mapping**: `sizeof(variable)`.

**Implementation**:

- **Std function registry**: Register `SIZEOF` as a built-in function
- **Codegen**: Map `SIZEOF(x)` to `sizeof(x)`

```typescript
// std-function-registry.ts
{ name: 'SIZEOF', cppName: 'sizeof', returnConstraint: 'specific',
  specificReturnType: 'UDINT', params: [{ name: 'var', type: 'ANY' }],
  isVariadic: false, isConversion: false, category: 'system' }
```

Since `sizeof` is a C++ keyword (not a function), the codegen should handle `SIZEOF` specially -- emitting `sizeof(expr)` instead of `sizeof(expr)` as a function call. (The parenthesized form `sizeof(x)` works for both variables and types in C++.)

#### `memcpy(dest, src, n)` -- Memory copy

Copies `n` bytes from `src` to `dest`.

```st
memcpy(ADR(dest) + offset, ADR(src), LEN(src));
```

**C++ mapping**: `std::memcpy(dest, src, n)`.

**Implementation**:

- **Std function registry**: Register `memcpy` as a system function
- **C++ runtime**: Include `<cstring>` for `std::memcpy`

```typescript
// std-function-registry.ts
{ name: 'MEMCPY', cppName: 'std::memcpy', returnConstraint: 'specific',
  specificReturnType: 'PVOID',
  params: [
    { name: 'dest', type: 'ANY' },
    { name: 'src', type: 'ANY' },
    { name: 'n', type: 'UDINT' }
  ],
  isVariadic: false, isConversion: false, category: 'system' }
```

**Note**: CODESYS `memcpy` is case-insensitive. The registry should handle both `memcpy` and `MEMCPY`. Since IEC 61131-3 is case-insensitive, the existing case normalization should handle this.

### 5.5.5: Pointer Arithmetic

The motivating example uses pointer arithmetic with `ADR`:

```st
memcpy(ADR(sResult) + uiLen, ADR(sTarget), LEN(sTarget));
```

Here `ADR(sResult) + uiLen` performs pointer arithmetic -- adding an offset to an address. Since `ADR()` returns an integer-like pointer value (`std::uintptr_t`), standard integer arithmetic applies and no special handling is needed beyond ensuring `ADR()` returns a numeric type that supports `+`.

If `ADR()` returns `std::uintptr_t`, then `ADR(sResult) + uiLen` naturally compiles as integer addition in C++. The `memcpy` call then casts this back to a void pointer via `reinterpret_cast`.

**C++ runtime helper update**:
```cpp
// memcpy wrapper that accepts uintptr_t for pointer-arithmetic compatibility
inline void* MEMCPY(std::uintptr_t dest, std::uintptr_t src, std::size_t n) {
    return std::memcpy(reinterpret_cast<void*>(dest),
                       reinterpret_cast<const void*>(src), n);
}
```

## Detailed Changes

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/frontend/parser.ts` | Modify | STRING(n) in dataType rule; method chaining in expression rules |
| `src/frontend/ast.ts` | Modify | Add `maxLength` to TypeReference; add `MethodCallExpression` node |
| `src/frontend/ast-builder.ts` | Modify | Build STRING(n) type refs; build method chain expressions |
| `src/backend/codegen.ts` | Modify | Generate `IEC_STRING<n>`; handle `isDereference`/`THIS^`; generate method chains; handle SIZEOF specially |
| `src/semantic/std-function-registry.ts` | Modify | Register ADR, SIZEOF, MEMCPY |
| `src/runtime/include/iec_std_lib.hpp` | Modify | Add `ADR()` template, `MEMCPY()` wrapper; include `<cstring>` |
| `tests/frontend/parser-advanced.test.ts` | Create | STRING(n), method chaining, THIS^ parsing |
| `tests/frontend/ast-builder-advanced.test.ts` | Create | AST building for new features |
| `tests/backend/codegen-advanced.test.ts` | Create | Codegen for STRING(n), THIS^, chaining, system functions |
| `tests/integration/cpp-compile-advanced.test.ts` | Create | End-to-end C++ compilation with advanced patterns |

## Validation Examples

### Test 1: Parameterized String

```st
PROGRAM Main
VAR
    short : STRING;
    long : STRING(1000);
    wide : WSTRING(500);
END_VAR
    long := 'Hello';
END_PROGRAM
```

Expected C++:
```cpp
class Main {
public:
    IEC_STRING short_var;
    IEC_STRING<1000> long_var;
    IEC_WSTRING<500> wide_var;

    void operator()() {
        long_var = "Hello";
    }
};
```

### Test 2: THIS^ Return Self

```st
FUNCTION_BLOCK Builder
VAR
    _value : INT;
END_VAR

METHOD SetValue : Builder
VAR_INPUT
    v : INT;
END_VAR
    _value := v;
    SetValue := THIS^;
END_METHOD

END_FUNCTION_BLOCK
```

Expected C++:
```cpp
class Builder {
public:
    IEC_INT _value;

    virtual Builder& SetValue(IEC_INT v) {
        _value = v;
        return *this;
    }
};
```

### Test 3: Method Chaining

```st
PROGRAM Main
VAR
    b : Builder;
    result : INT;
END_VAR
    b.SetValue(10).SetValue(20);
    result := b.GetValue();
END_PROGRAM
```

Expected C++:
```cpp
class Main {
public:
    Builder b;
    IEC_INT result;

    void operator()() {
        b.SetValue(10).SetValue(20);
        result = b.GetValue();
    }
};
```

### Test 4: Full Fluent Pattern with Interface

```st
INTERFACE I_Chainable
METHOD DoWork : I_Chainable
VAR_INPUT x : INT; END_VAR
END_METHOD
END_INTERFACE

FUNCTION_BLOCK Worker IMPLEMENTS I_Chainable
VAR _total : INT; END_VAR
METHOD DoWork : I_Chainable
VAR_INPUT x : INT; END_VAR
    _total := _total + x;
    DoWork := THIS^;
END_METHOD
END_FUNCTION_BLOCK

PROGRAM Main
VAR w : Worker; END_VAR
    w.DoWork(1).DoWork(2).DoWork(3);
END_PROGRAM
```

### Test 5: CODESYS System Functions

```st
PROGRAM Main
VAR
    src : STRING := 'Hello';
    dest : STRING(100);
    size : UDINT;
END_VAR
    size := SIZEOF(src);
    memcpy(ADR(dest), ADR(src), LEN(src));
END_PROGRAM
```

Expected C++:
```cpp
class Main {
public:
    IEC_STRING src{"Hello"};
    IEC_STRING<100> dest;
    IEC_UDINT size;

    void operator()() {
        size = sizeof(src);
        MEMCPY(ADR(src), ADR(dest), LEN(src));
    }
};
```

## Implementation Order

The features should be implemented in this order due to dependencies:

1. **STRING(n)** -- No dependencies on other 5.5 features; unblocks variable declarations
2. **Pointer dereference codegen (`^` / `THIS^`)** -- No dependencies; unblocks fluent return
3. **ADR / SIZEOF / memcpy** -- No dependencies; unblocks system function calls
4. **Method chaining** -- Benefits from THIS^ being complete (for fluent patterns)

Each feature is independent at the parser/codegen level and can be developed and tested in isolation.

## Success Criteria

- `STRING(n)` and `WSTRING(n)` declarations parse and generate correct C++ template types
- `THIS^` in a method body generates `(*this)` / `return *this` in C++
- General pointer dereference (`ptr^`) generates correct dereference code
- Method chaining compiles and generates correct chained C++ calls
- `ADR()` generates address-of operations in C++
- `SIZEOF()` generates `sizeof()` in C++
- `memcpy()` generates `std::memcpy()` in C++
- The motivating example (`sample2.st`) compiles without errors
- Generated C++ compiles with g++
- All new tests pass with 75%+ coverage

## Notes

### Relationship to Other Phases

- **Phase 5.1**: FB invocation mechanics are required (this phase adds chaining on top)
- **Phase 5.2**: OOP methods and interfaces are required (this phase adds chaining and THIS^ codegen)
- **Phase 2.4**: References (`REF_TO`) partially overlap with pointer dereference; `^` may apply to both
- **Phase 1.4**: String type runtime (`IEC_STRING`) may need template parameter support for `STRING(n)`

### CODESYS vs IEC 61131-3 Standard

| Feature | IEC 61131-3 | CODESYS | Notes |
|---------|-------------|---------|-------|
| `STRING(n)` | Standard | Standard | Max length parameterization |
| `THIS^` | Edition 3 | Standard | THIS is a pointer; ^ dereferences |
| Method chaining | Not specified | Supported | De facto standard via interface returns |
| `ADR()` | Not standard | Extension | Widely used; essential for low-level ops |
| `SIZEOF()` | Not standard | Extension | Widely used; maps cleanly to C++ |
| `memcpy()` | Not standard | Extension | System library function |

`ADR`, `SIZEOF`, and `memcpy` are CODESYS extensions but are so widely used that practical CODESYS compatibility requires them. They map directly to C++ constructs, making implementation straightforward.

### Safety Considerations for ADR/memcpy

These functions provide raw memory access, bypassing IEC type safety. The compiler should:
1. Emit a warning when `ADR` or `memcpy` are used (optional, configurable)
2. Ensure `ADR` only accepts lvalue expressions (not temporaries)
3. Document that `memcpy` with incorrect sizes causes undefined behavior (same as C++)

For now, these are passed through to C++ without additional safety checks, matching CODESYS behavior.
