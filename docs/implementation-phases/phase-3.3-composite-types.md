# Phase 3.3: Composite Type Access

**Status**: PENDING

**Duration**: 3-4 weeks

**Goal**: Implement array element access, structure member access, array literals, and array intrinsic functions

## Overview

This phase adds expression-level support for arrays and structures. The runtime library (`iec_array.hpp`, `iec_struct.hpp`) and type declaration code generation are already complete. This phase focuses on:

1. Accessing array elements (`arr[i]`, `arr[i,j]`)
2. Accessing structure members (`point.x`)
3. Array literal expressions (`[1, 2, 3]`)
4. Array intrinsic functions (`SIZEOF`, `LOWER_BOUND`, `UPPER_BOUND`)

## Current Implementation Status

### Already Implemented

| Component | Status | Notes |
|-----------|--------|-------|
| Runtime: `IEC_ARRAY_1D/2D/3D` | ✅ Complete | Full bounds support, element forcing |
| Runtime: `IEC_STRUCT_Base` | ✅ Complete | Field wrappers, inheritance |
| Parser: Array subscript syntax | ✅ Complete | `arr[i]`, `arr[i,j]` recognized |
| Parser: Struct member syntax | ✅ Complete | `point.x` recognized |
| AST: `VariableExpression` | ⚠️ Partial | `fieldAccess` works, `subscripts` empty |
| Type codegen: Array types | ✅ Complete | `using T = Array1D<...>` |
| Type codegen: Struct types | ✅ Complete | `struct T { ... }` |

### To Be Implemented

- AST builder: Extract array subscript expressions
- Code generation: Array element access expressions
- Code generation: Structure member access expressions
- Code generation: Array literals
- Code generation: `SIZEOF`, `LOWER_BOUND`, `UPPER_BOUND`
- Semantic analysis: Type checking for all above

## Scope

### Array Element Access

```st
VAR
    arr : ARRAY[1..10] OF INT;
    matrix : ARRAY[0..2, 0..2] OF REAL;
    i, j : INT;
END_VAR

arr[1] := 100;           // Single dimension
arr[i] := arr[i-1] + 1;  // Variable index
matrix[0, 0] := 1.0;     // Multi-dimensional
matrix[i, j] := 0.0;     // Variable indices
```

### Structure Member Access

```st
TYPE
    Point : STRUCT
        x : INT;
        y : INT;
    END_STRUCT;

    Line : STRUCT
        start : Point;
        endPt : Point;
    END_STRUCT;
END_TYPE

VAR
    p : Point;
    line : Line;
END_VAR

p.x := 10;
p.y := 20;
line.start.x := 0;       // Nested struct access
line.endPt := p;         // Struct assignment
```

### Combined Access

```st
VAR
    points : ARRAY[1..10] OF Point;
    i : INT;
END_VAR

points[1].x := 100;              // Array of structs
points[i].y := points[i-1].y;    // Variable index with member access
```

### Array Literals

```st
VAR
    arr : ARRAY[1..5] OF INT := [1, 2, 3, 4, 5];
    matrix : ARRAY[1..2, 1..3] OF INT := [[1, 2, 3], [4, 5, 6]];
END_VAR

arr := [10, 20, 30, 40, 50];     // Array literal assignment
```

### Array Intrinsic Functions

```st
VAR
    arr : ARRAY[5..15] OF INT;
    size, lower, upper : DINT;
END_VAR

size := SIZEOF(arr);              // Size in bytes
lower := LOWER_BOUND(arr, 1);     // Returns 5 (first dimension lower bound)
upper := UPPER_BOUND(arr, 1);     // Returns 15 (first dimension upper bound)
```

## Deliverables

### 1. AST Builder Enhancement

**File**: `src/frontend/ast-builder.ts`

Fix `buildVariableExpression()` to extract subscript expressions:

```typescript
// Current (broken):
subscripts: []  // Always empty

// Fixed:
subscripts: this.buildSubscriptExpressions(children)  // Extract from parser
```

### 2. Expression Code Generation

**File**: `src/backend/codegen.ts`

#### Array Element Access
```st
(* ST *)
arr[i] := 10;
x := arr[j];
```
```cpp
// Generated C++
arr[i].set(10);
x.set(arr[j].get());
```

#### Multi-dimensional Arrays
```st
(* ST *)
matrix[i, j] := 1.0;
```
```cpp
// Generated C++
matrix[i][j].set(1.0);
```

#### Structure Member Access
```st
(* ST *)
point.x := 5;
y := point.y;
```
```cpp
// Generated C++
point.x.set(5);
y.set(point.y.get());
```

#### Combined Access
```st
(* ST *)
points[i].x := 100;
```
```cpp
// Generated C++
points[i].x.set(100);
```

### 3. Array Literals

**Parser**: May need grammar extension for array literal syntax `[...]`

**Code Generation**:
```st
(* ST *)
arr := [1, 2, 3, 4, 5];
```
```cpp
// Generated C++ (initialization)
arr = IEC_ARRAY_1D<IEC_INT, 1, 5>{{1, 2, 3, 4, 5}};

// Or element-wise for IECVar wrapper compatibility
arr[1].set(1); arr[2].set(2); arr[3].set(3); arr[4].set(4); arr[5].set(5);
```

### 4. Array Intrinsic Functions

**Code Generation**:

```st
(* ST *)
size := SIZEOF(arr);
lower := LOWER_BOUND(arr, 1);
upper := UPPER_BOUND(arr, 1);
```
```cpp
// Generated C++
size.set(sizeof(arr));
lower.set(arr.lower_bound());   // For 1D, or arr.lower_bound<0>() for multi-dim
upper.set(arr.upper_bound());
```

**Note**: The runtime library already provides `.lower_bound()` and `.upper_bound()` methods.

### 5. Semantic Analysis

**Type Checking**:
- Array subscript count must match array dimensions
- Subscript expressions must be integer types
- Structure member must exist in struct type
- `LOWER_BOUND`/`UPPER_BOUND` dimension argument must be valid

**Type Inference**:
- `arr[i]` has type = array element type
- `point.x` has type = field type
- `SIZEOF(arr)` returns `UDINT`
- `LOWER_BOUND`/`UPPER_BOUND` return `DINT`

### 6. Testing

- Parser tests for array literals
- AST builder tests for subscript extraction
- Code generation tests for all access patterns
- Integration tests that compile and execute
- Edge cases: empty arrays, single-element arrays, max dimensions

## Success Criteria

- Array element access generates correct C++ code
- Structure member access generates correct C++ code
- Array literals compile and initialize correctly
- Intrinsic functions return correct values at runtime
- Type checking catches dimension mismatches and invalid members
- All integration tests pass with g++/clang++

## Validation Examples

### Test 1: Array Access and Assignment
```st
PROGRAM TestArrayAccess
    VAR
        arr : ARRAY[1..5] OF INT;
        sum : INT := 0;
        i : INT;
    END_VAR

    FOR i := 1 TO 5 DO
        arr[i] := i * 10;
    END_FOR;

    FOR i := 1 TO 5 DO
        sum := sum + arr[i];
    END_FOR;
END_PROGRAM
```
Expected: sum = 150 (10+20+30+40+50)

### Test 2: Structure Access
```st
TYPE
    Point : STRUCT
        x : INT;
        y : INT;
    END_STRUCT;
END_TYPE

PROGRAM TestStructAccess
    VAR
        p1, p2 : Point;
        dist : INT;
    END_VAR

    p1.x := 0;
    p1.y := 0;
    p2.x := 3;
    p2.y := 4;

    dist := (p2.x - p1.x) + (p2.y - p1.y);  // Simplified distance
END_PROGRAM
```
Expected: dist = 7

### Test 3: Array of Structures
```st
PROGRAM TestArrayOfStruct
    VAR
        points : ARRAY[1..3] OF Point;
        i : INT;
    END_VAR

    FOR i := 1 TO 3 DO
        points[i].x := i;
        points[i].y := i * 2;
    END_FOR;
END_PROGRAM
```
Expected: points[3].x = 3, points[3].y = 6

### Test 4: Array Intrinsics
```st
PROGRAM TestIntrinsics
    VAR
        arr : ARRAY[5..15] OF INT;
        lower, upper, size : DINT;
    END_VAR

    lower := LOWER_BOUND(arr, 1);
    upper := UPPER_BOUND(arr, 1);
    size := SIZEOF(arr);
END_PROGRAM
```
Expected: lower = 5, upper = 15, size = 44 (11 elements × 4 bytes)

### Test 5: Array Literal
```st
PROGRAM TestArrayLiteral
    VAR
        arr : ARRAY[1..5] OF INT := [10, 20, 30, 40, 50];
        sum : INT := 0;
        i : INT;
    END_VAR

    FOR i := 1 TO 5 DO
        sum := sum + arr[i];
    END_FOR;
END_PROGRAM
```
Expected: sum = 150

## Notes

### Relationship to Other Phases
- **Phase 3.1**: Uses expression evaluation infrastructure
- **Phase 3.2**: Control flow (FOR loops) used in array examples
- **Phase 3.4**: Variable-length arrays build on this foundation

### Implementation Order

1. AST builder fix (subscript extraction) - enables all downstream work
2. Simple array access (`arr[i]`)
3. Structure member access (`point.x`)
4. Multi-dimensional arrays (`arr[i,j]`)
5. Combined access (`points[i].x`)
6. Intrinsic functions
7. Array literals (may need parser work)

### Runtime Library Support

The runtime already provides:
- `arr[i]` - operator[] for element access (returns `IECVar<T>&`)
- `arr.at(i)` - bounds-checked access
- `arr.lower_bound()` / `arr.upper_bound()` - bound queries
- `arr.length()` - element count

### What Phase 3.3 Does NOT Include
- Variable-length arrays (`ARRAY[*]`) - Phase 3.4
- Dynamic array allocation - vendor extension, future consideration
- Array slicing - not standard IEC 61131-3
