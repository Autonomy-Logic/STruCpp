# Phase 3.5: Dynamic Memory Allocation

**Status**: PENDING

**Duration**: 3-4 weeks

**Goal**: Implement CODESYS-compatible dynamic memory allocation with `__NEW` and `__DELETE` operators

## Overview

This phase implements dynamic memory allocation as a CODESYS-compatible extension. While not part of the IEC 61131-3 standard, these operators are widely used in CODESYS and TwinCAT environments for creating dynamically-sized arrays and function block instances at runtime.

**References**:
- [CODESYS __NEW Operator](https://content.helpme-codesys.com/en/CODESYS%20Development%20System/_cds_operator_new.html)
- [Beckhoff TwinCAT __NEW](https://infosys.beckhoff.com/content/1033/tc3_plc_intro/2529171083.html)

## Language Features

### Basic Syntax

```st
(* Allocate memory *)
<pointer> := __NEW( <type> );
<pointer> := __NEW( <type>, <size> );  // For arrays

(* Deallocate memory *)
__DELETE( <pointer> );
```

### Supported Allocation Types

#### 1. Scalar Types
```st
VAR
    pInt : POINTER TO INT;
    pReal : POINTER TO REAL;
END_VAR

pInt := __NEW(INT);
pInt^ := 42;
__DELETE(pInt);
```

#### 2. Dynamic Arrays
```st
VAR
    pArr : POINTER TO INT;
    size : UINT := 100;
    i : INT;
END_VAR

pArr := __NEW(INT, size);  // Allocate array of 'size' INTs

FOR i := 0 TO size - 1 DO
    pArr[i] := i * 10;
END_FOR;

__DELETE(pArr);
```

#### 3. User-Defined Types (Structs)
```st
TYPE
    {attribute 'enable_dynamic_creation'}
    Point : STRUCT
        x : REAL;
        y : REAL;
    END_STRUCT;
END_TYPE

VAR
    pPoint : POINTER TO Point;
END_VAR

pPoint := __NEW(Point);
pPoint^.x := 10.0;
pPoint^.y := 20.0;
__DELETE(pPoint);
```

#### 4. Function Blocks
```st
FUNCTION_BLOCK {attribute 'enable_dynamic_creation'} FB_Counter
    VAR
        count : INT;
    END_VAR

    METHOD Increment
        count := count + 1;
    END_METHOD
END_FUNCTION_BLOCK

VAR
    pCounter : POINTER TO FB_Counter;
END_VAR

pCounter := __NEW(FB_Counter);  // Calls FB_Init
pCounter^.Increment();
__DELETE(pCounter);              // Calls FB_Exit, then frees memory
```

### Enable Dynamic Creation Attribute

Types that can be dynamically allocated must be marked with the pragma:

```st
{attribute 'enable_dynamic_creation'}
FUNCTION_BLOCK MyFB
    // ...
END_FUNCTION_BLOCK

TYPE
    {attribute 'enable_dynamic_creation'}
    MyStruct : STRUCT
        // ...
    END_STRUCT;
END_TYPE
```

**Exceptions**: Library function blocks and standard types don't require this attribute.

### Function Block Lifecycle

When dynamically creating function blocks:

1. **`__NEW(FB)`**: Allocates memory, then calls `FB_Init` method if defined
2. **`__DELETE(pFB)`**: Calls `FB_Exit` method if defined, then frees memory

```st
FUNCTION_BLOCK {attribute 'enable_dynamic_creation'} FB_Resource
    VAR
        pData : POINTER TO BYTE;
    END_VAR

    METHOD FB_Init : BOOL
        VAR_INPUT
            bInitRetains : BOOL;
            bInCopyCode : BOOL;
        END_VAR
        pData := __NEW(BYTE, 1024);  // Allocate internal resources
        FB_Init := TRUE;
    END_METHOD

    METHOD FB_Exit : BOOL
        VAR_INPUT
            bInCopyCode : BOOL;
        END_VAR
        __DELETE(pData);             // Free internal resources
        FB_Exit := TRUE;
    END_METHOD
END_FUNCTION_BLOCK
```

## Deliverables

### 1. Parser Extension

**File**: `src/frontend/lexer.ts`

Add new keywords:
```typescript
createToken({ name: "__NEW", pattern: /__NEW/i }),
createToken({ name: "__DELETE", pattern: /__DELETE/i }),
```

**File**: `src/frontend/parser.ts`

Add grammar rules:
```typescript
newExpression = RULE("newExpression", () => {
  CONSUME(tokens.__NEW);
  CONSUME(tokens.LParen);
  SUBRULE(this.typeName);
  OPTION(() => {
    CONSUME(tokens.Comma);
    SUBRULE(this.expression);  // size for arrays
  });
  CONSUME(tokens.RParen);
});

deleteStatement = RULE("deleteStatement", () => {
  CONSUME(tokens.__DELETE);
  CONSUME(tokens.LParen);
  SUBRULE(this.variable);      // pointer to delete
  CONSUME(tokens.RParen);
  CONSUME(tokens.Semicolon);
});
```

### 2. AST Nodes

**File**: `src/frontend/ast.ts`

```typescript
interface NewExpression extends TypedNode {
  kind: "NewExpression";
  allocationType: TypeReference;
  arraySize?: Expression;        // For __NEW(TYPE, size)
}

interface DeleteStatement extends Statement {
  kind: "DeleteStatement";
  pointer: VariableExpression;
}

interface AttributePragma extends ASTNode {
  kind: "AttributePragma";
  name: string;                  // e.g., "enable_dynamic_creation"
  value?: string;
}
```

### 3. Semantic Analysis

**Validation Rules**:
- Target of `__NEW` assignment must be `POINTER TO <type>`
- Type must have `{attribute 'enable_dynamic_creation'}` (or be standard/library type)
- `__DELETE` argument must be a pointer
- Warn on potential memory leaks (pointer reassignment without delete)

**Type Inference**:
- `__NEW(T)` returns `POINTER TO T`
- `__NEW(T, size)` returns `POINTER TO T` (array)
- `__DELETE` has no return value

### 4. Runtime Library Extension

**File**: `src/runtime/include/iec_memory.hpp`

```cpp
#pragma once

#include <cstdlib>
#include <new>
#include <type_traits>

namespace strucpp {

// Memory allocation result
template<typename T>
T* iec_new() {
    T* ptr = static_cast<T*>(std::malloc(sizeof(T)));
    if (ptr) {
        new (ptr) T();  // Placement new for construction
    }
    return ptr;  // Returns nullptr (0) on failure
}

// Array allocation
template<typename T>
T* iec_new_array(size_t count) {
    T* ptr = static_cast<T*>(std::malloc(sizeof(T) * count));
    if (ptr) {
        for (size_t i = 0; i < count; ++i) {
            new (&ptr[i]) T();  // Construct each element
        }
    }
    return ptr;
}

// Deallocation for non-FB types
template<typename T>
void iec_delete(T*& ptr) {
    if (ptr) {
        ptr->~T();  // Call destructor
        std::free(ptr);
        ptr = nullptr;
    }
}

// Array deallocation (requires size tracking or sentinel)
template<typename T>
void iec_delete_array(T*& ptr, size_t count) {
    if (ptr) {
        for (size_t i = 0; i < count; ++i) {
            ptr[i].~T();
        }
        std::free(ptr);
        ptr = nullptr;
    }
}

// Function block allocation with FB_Init call
template<typename FB>
FB* iec_new_fb() {
    FB* ptr = static_cast<FB*>(std::malloc(sizeof(FB)));
    if (ptr) {
        new (ptr) FB();
        // Call FB_Init if it exists
        if constexpr (requires { ptr->FB_Init(false, false); }) {
            ptr->FB_Init(false, false);
        }
    }
    return ptr;
}

// Function block deallocation with FB_Exit call
template<typename FB>
void iec_delete_fb(FB*& ptr) {
    if (ptr) {
        // Call FB_Exit if it exists
        if constexpr (requires { ptr->FB_Exit(false); }) {
            ptr->FB_Exit(false);
        }
        ptr->~FB();
        std::free(ptr);
        ptr = nullptr;
    }
}

}  // namespace strucpp
```

### 5. Code Generation

**File**: `src/backend/codegen.ts`

#### __NEW for Scalar/Struct
```st
(* ST *)
pPoint := __NEW(Point);
```
```cpp
// Generated C++
pPoint = strucpp::iec_new<Point>();
```

#### __NEW for Array
```st
(* ST *)
pArr := __NEW(INT, 100);
```
```cpp
// Generated C++
pArr = strucpp::iec_new_array<IEC_INT>(100);
```

#### __NEW for Function Block
```st
(* ST *)
pFB := __NEW(MyFB);
```
```cpp
// Generated C++
pFB = strucpp::iec_new_fb<MyFB>();
```

#### __DELETE
```st
(* ST *)
__DELETE(pPoint);
__DELETE(pArr);
__DELETE(pFB);
```
```cpp
// Generated C++
strucpp::iec_delete(pPoint);
strucpp::iec_delete_array(pArr, /* tracked size */);
strucpp::iec_delete_fb(pFB);
```

### 6. Attribute Pragma Support

**Parser**: Recognize `{attribute 'name'}` syntax before declarations

**Code Generation**:
- Check for `enable_dynamic_creation` attribute
- Generate appropriate C++ markers or validation

### 7. Testing

#### Unit Tests - Lexer (`tests/frontend/lexer-dynamic.test.ts`)
- [ ] Tokenize `__NEW` keyword
- [ ] Tokenize `__DELETE` keyword
- [ ] Tokenize `__NEW(INT)`
- [ ] Tokenize `__NEW(INT, 100)`
- [ ] Tokenize `__DELETE(ptr)`

#### Unit Tests - Parser (`tests/frontend/parser-dynamic.test.ts`)
- [ ] Parse `__NEW(INT)` as expression
- [ ] Parse `__NEW(MyStruct)` as expression
- [ ] Parse `__NEW(MyFB)` as expression
- [ ] Parse `__NEW(INT, size)` with size expression
- [ ] Parse `__NEW(INT, 100)` with literal size
- [ ] Parse `__DELETE(ptr)` as statement
- [ ] Parse assignment with __NEW: `ptr := __NEW(INT)`
- [ ] Reject __NEW without type argument
- [ ] Reject __DELETE without pointer argument

#### Unit Tests - AST Builder (`tests/frontend/ast-builder-dynamic.test.ts`)
- [ ] Build NewExpression with scalar type
- [ ] Build NewExpression with struct type
- [ ] Build NewExpression with FB type
- [ ] Build NewExpression with array size
- [ ] Build DeleteStatement with pointer variable

#### Unit Tests - Semantic Analysis (`tests/semantic/dynamic-memory.test.ts`)
- [ ] __NEW target must be POINTER TO type
- [ ] __NEW returns POINTER TO <type>
- [ ] __NEW(Type) requires enable_dynamic_creation for UDT
- [ ] __NEW(Type) requires enable_dynamic_creation for FB
- [ ] __NEW(INT) doesn't require attribute (standard type)
- [ ] __NEW(INT, size) - size must be integer
- [ ] __DELETE argument must be pointer type
- [ ] __DELETE on non-pointer produces error
- [ ] Warn on pointer reassignment without __DELETE (potential leak)

#### Unit Tests - Code Generation (`tests/backend/codegen-dynamic.test.ts`)
- [ ] __NEW(INT) generates `iec_new<IEC_INT>()`
- [ ] __NEW(MyStruct) generates `iec_new<MyStruct>()`
- [ ] __NEW(MyFB) generates `iec_new_fb<MyFB>()`
- [ ] __NEW(INT, 100) generates `iec_new_array<IEC_INT>(100)`
- [ ] __NEW(INT, size) generates `iec_new_array<IEC_INT>(size.get())`
- [ ] __DELETE(ptr) generates `iec_delete(ptr)`
- [ ] __DELETE(pFB) generates `iec_delete_fb(pFB)`
- [ ] __DELETE(pArr) generates `iec_delete_array(pArr, ...)`

#### Unit Tests - Runtime Library (`tests/runtime/iec-memory.test.cpp`)
- [ ] iec_new<T>() allocates and constructs
- [ ] iec_new<T>() returns nullptr on failure (simulate)
- [ ] iec_delete(ptr) destroys and frees
- [ ] iec_delete(ptr) sets ptr to nullptr
- [ ] iec_delete(nullptr) is safe (no-op)
- [ ] iec_new_array<T>(n) allocates n elements
- [ ] iec_new_array<T>(n) constructs each element
- [ ] iec_delete_array properly destructs all elements
- [ ] iec_new_fb<FB>() calls FB_Init
- [ ] iec_delete_fb(pFB) calls FB_Exit before destruction

#### Golden File Tests (`tests/golden/dynamic-memory/`)
- [ ] `new-scalar.st` → `new-scalar.cpp`
- [ ] `new-struct.st` → `new-struct.cpp`
- [ ] `new-array.st` → `new-array.cpp`
- [ ] `new-fb.st` → `new-fb.cpp`
- [ ] `delete-all.st` → `delete-all.cpp`

#### Integration Tests (`tests/integration/dynamic-memory.test.ts`)
- [ ] Allocate and use scalar (compile & run)
- [ ] Allocate and use dynamic array (compile & run)
- [ ] Allocate and use struct (compile & run)
- [ ] Allocate and use function block (compile & run)
- [ ] FB_Init called on __NEW (compile & run, verify side effect)
- [ ] FB_Exit called on __DELETE (compile & run, verify side effect)
- [ ] Allocation failure returns 0 (compile & run with check)
- [ ] __DELETE sets pointer to 0 (compile & run)
- [ ] Double delete is safe (compile & run)

#### Memory Safety Tests (`tests/integration/memory-safety.test.ts`)
- [ ] No memory leak with proper __DELETE (valgrind)
- [ ] Memory leak detected without __DELETE (valgrind, expect leak)
- [ ] No use-after-free crashes (sanitizer)
- [ ] No double-free crashes (sanitizer)

#### Error Case Tests (`tests/semantic/dynamic-errors.test.ts`)
- [ ] `x := __NEW(INT)` where x is INT → type mismatch error
- [ ] `__NEW(MyStruct)` without attribute → error
- [ ] `__NEW(MyFB)` without attribute → error
- [ ] `__DELETE(x)` where x is INT → not a pointer error
- [ ] `__NEW(INT, 3.14)` → size must be integer error

## Success Criteria

- `__NEW` allocates memory and returns typed pointer
- `__NEW` returns 0 (nullptr) on allocation failure
- `__DELETE` frees memory and sets pointer to 0
- Function blocks have `FB_Init`/`FB_Exit` called appropriately
- Semantic analysis catches invalid usage
- No memory leaks in generated code (verified with valgrind)
- CODESYS-compatible syntax and behavior

## Validation Examples

### Test 1: Dynamic Array
```st
PROGRAM TestDynamicArray
    VAR
        pArr : POINTER TO INT;
        size : UINT := 10;
        sum : INT := 0;
        i : INT;
    END_VAR

    pArr := __NEW(INT, size);

    IF pArr <> 0 THEN
        FOR i := 0 TO size - 1 DO
            pArr[i] := i + 1;
        END_FOR;

        FOR i := 0 TO size - 1 DO
            sum := sum + pArr[i];
        END_FOR;

        __DELETE(pArr);
    END_IF;
END_PROGRAM
```
Expected: sum = 55 (1+2+...+10)

### Test 2: Dynamic Struct
```st
TYPE
    {attribute 'enable_dynamic_creation'}
    Vector3D : STRUCT
        x, y, z : REAL;
    END_STRUCT;
END_TYPE

PROGRAM TestDynamicStruct
    VAR
        pVec : POINTER TO Vector3D;
        length : REAL;
    END_VAR

    pVec := __NEW(Vector3D);

    IF pVec <> 0 THEN
        pVec^.x := 3.0;
        pVec^.y := 4.0;
        pVec^.z := 0.0;

        length := SQRT(pVec^.x * pVec^.x + pVec^.y * pVec^.y);

        __DELETE(pVec);
    END_IF;
END_PROGRAM
```
Expected: length = 5.0

### Test 3: Dynamic Function Block with Lifecycle
```st
FUNCTION_BLOCK {attribute 'enable_dynamic_creation'} FB_Logger
    VAR
        logCount : INT;
        initialized : BOOL;
    END_VAR

    METHOD FB_Init : BOOL
        VAR_INPUT
            bInitRetains : BOOL;
            bInCopyCode : BOOL;
        END_VAR
        initialized := TRUE;
        logCount := 0;
        FB_Init := TRUE;
    END_METHOD

    METHOD FB_Exit : BOOL
        VAR_INPUT
            bInCopyCode : BOOL;
        END_VAR
        // Cleanup code here
        FB_Exit := TRUE;
    END_METHOD

    METHOD Log
        logCount := logCount + 1;
    END_METHOD
END_FUNCTION_BLOCK

PROGRAM TestDynamicFB
    VAR
        pLogger : POINTER TO FB_Logger;
    END_VAR

    pLogger := __NEW(FB_Logger);  // FB_Init called

    IF pLogger <> 0 THEN
        pLogger^.Log();
        pLogger^.Log();
        // pLogger^.logCount should be 2

        __DELETE(pLogger);        // FB_Exit called
    END_IF;
END_PROGRAM
```

### Test 4: Allocation Failure Handling
```st
PROGRAM TestAllocFailure
    VAR
        pHuge : POINTER TO BYTE;
        success : BOOL;
    END_VAR

    // Try to allocate impossibly large array
    pHuge := __NEW(BYTE, 16#FFFFFFFF);

    IF pHuge = 0 THEN
        success := FALSE;  // Expected: allocation failed
    ELSE
        success := TRUE;
        __DELETE(pHuge);
    END_IF;
END_PROGRAM
```

### Test 5: Semantic Error - Missing Attribute
```st
TYPE
    // Missing {attribute 'enable_dynamic_creation'}
    BadStruct : STRUCT
        x : INT;
    END_STRUCT;
END_TYPE

PROGRAM TestMissingAttribute
    VAR
        pBad : POINTER TO BadStruct;
    END_VAR

    pBad := __NEW(BadStruct);  // ERROR: Type not enabled for dynamic creation
END_PROGRAM
```

## Notes

### Relationship to Other Phases
- **Phase 2.4**: Uses POINTER TO and dereference operators
- **Phase 3.4**: Variable-length arrays complement dynamic arrays
- **Phase 4**: Functions can return dynamically allocated pointers
- **Phase 5**: Function blocks can be dynamically created

### Memory Management Considerations

1. **No Garbage Collection**: User must explicitly call `__DELETE`
2. **Memory Leaks**: Reassigning pointer without delete leaks memory
3. **Double Delete**: Runtime should handle gracefully (pointer set to 0)
4. **Thread Safety**: Not guaranteed - user must implement synchronization

### CODESYS Compatibility Notes

- Syntax matches CODESYS 3.x exactly
- `{attribute 'enable_dynamic_creation'}` pragma supported
- `FB_Init`/`FB_Exit` lifecycle for function blocks
- Returns 0 on allocation failure (not exception)

### What Phase 3.5 Does NOT Include
- Garbage collection
- Automatic reference counting
- Smart pointers (could be future extension)
- Memory pool configuration (runtime-specific)

### Future Considerations

For production use, consider:
- Memory pool pre-allocation for deterministic timing
- Memory usage tracking and limits
- Debug mode with allocation tracking
- Integration with OpenPLC memory management
