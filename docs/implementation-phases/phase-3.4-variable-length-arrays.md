# Phase 3.4: Variable-Length Arrays

**Status**: PENDING

**Duration**: 2-3 weeks

**Goal**: Implement IEC 61131-3 Edition 3 variable-length array parameters (`ARRAY[*]`)

## Overview

IEC 61131-3 Edition 3 introduced variable-length arrays, allowing functions and function blocks to accept arrays of different sizes through `VAR_IN_OUT` parameters. This enables writing generic array-processing functions without knowing array bounds at compile time.

**Reference**: [IEC 61131-3: Arrays with variable length](https://stefanhenneken.net/2016/09/27/iec-61131-3-arrays-with-variable-length/)

## Language Feature

### Variable-Length Array Declaration

```st
FUNCTION SumArray : INT
    VAR_IN_OUT
        arr : ARRAY[*] OF INT;    // Variable-length array parameter
    END_VAR
    VAR
        i : INT;
        sum : INT := 0;
        lower, upper : DINT;
    END_VAR

    lower := LOWER_BOUND(arr, 1);
    upper := UPPER_BOUND(arr, 1);

    FOR i := lower TO upper DO
        sum := sum + arr[i];
    END_FOR;

    SumArray := sum;
END_FUNCTION
```

### Calling with Different Array Sizes

```st
PROGRAM Main
    VAR
        small : ARRAY[1..5] OF INT := [1, 2, 3, 4, 5];
        large : ARRAY[1..100] OF INT;
        result1, result2 : INT;
    END_VAR

    result1 := SumArray(small);    // Works with 5-element array
    result2 := SumArray(large);    // Works with 100-element array
END_PROGRAM
```

### Multi-Dimensional Variable-Length Arrays

```st
FUNCTION MatrixSum : REAL
    VAR_IN_OUT
        matrix : ARRAY[*, *] OF REAL;    // 2D variable-length
    END_VAR
    VAR
        i, j : INT;
        sum : REAL := 0.0;
    END_VAR

    FOR i := LOWER_BOUND(matrix, 1) TO UPPER_BOUND(matrix, 1) DO
        FOR j := LOWER_BOUND(matrix, 2) TO UPPER_BOUND(matrix, 2) DO
            sum := sum + matrix[i, j];
        END_FOR;
    END_FOR;

    MatrixSum := sum;
END_FUNCTION
```

## IEC 61131-3 Constraints

Per the standard, variable-length arrays have specific limitations:

1. **VAR_IN_OUT only**: `ARRAY[*]` can only be used in `VAR_IN_OUT` sections
2. **Not for VAR_INPUT/VAR_OUTPUT**: Cannot pass by value or return variable-length arrays
3. **Static underlying storage**: The actual array passed must have fixed bounds
4. **Runtime bound queries**: Must use `LOWER_BOUND`/`UPPER_BOUND` to determine bounds

## Deliverables

### 1. Parser Extension

**File**: `src/frontend/parser.ts`

Add support for `ARRAY[*]` syntax:

```typescript
arrayDimension = RULE("arrayDimension", () => {
  OR([
    { ALT: () => {
      // Fixed bounds: ARRAY[1..10]
      SUBRULE(this.expression);
      CONSUME(tokens.DoubleDot);
      SUBRULE2(this.expression);
    }},
    { ALT: () => {
      // Variable length: ARRAY[*]
      CONSUME(tokens.Asterisk);  // New: recognize * as dimension
    }},
  ]);
});
```

### 2. AST Extension

**File**: `src/frontend/ast.ts`

```typescript
interface ArrayDimension extends ASTNode {
  kind: "ArrayDimension";
  isVariableLength: boolean;      // NEW: true for ARRAY[*]
  start?: Expression;             // undefined for variable-length
  end?: Expression;               // undefined for variable-length
}

interface ArrayType extends IECType {
  typeKind: "array";
  elementType: IECType;
  dimensions: Array<{
    isVariableLength: boolean;    // NEW
    start?: number;
    end?: number;
  }>;
}
```

### 3. Semantic Analysis

**Validation Rules**:
- `ARRAY[*]` only allowed in `VAR_IN_OUT` sections
- Cannot declare local variables with `ARRAY[*]`
- Cannot use `ARRAY[*]` in `VAR_INPUT` or `VAR_OUTPUT`
- At call site, argument must be a concrete array (not variable-length)

**Type Checking**:
- Variable-length array is compatible with any concrete array of same element type
- Dimension count must still match

### 4. Code Generation

**C++ Implementation Strategy**:

Use C++ templates or `std::span` (C++20) for variable-length array parameters:

```st
(* ST *)
FUNCTION SumArray : INT
    VAR_IN_OUT
        arr : ARRAY[*] OF INT;
    END_VAR
```

**Option A: Template-based (C++17)**
```cpp
template<size_t Lower, size_t Upper>
IEC_INT SumArray(IEC_ARRAY_1D<IEC_INT, Lower, Upper>& arr) {
    IEC_INT sum = 0;
    for (size_t i = Lower; i <= Upper; ++i) {
        sum = sum + arr[i].get();
    }
    return sum;
}
```

**Option B: Type-erased wrapper**
```cpp
// Runtime wrapper that stores bounds
class ArrayView1D_INT {
    IEC_INT* data_;
    int64_t lower_, upper_;
public:
    template<size_t L, size_t U>
    ArrayView1D_INT(IEC_ARRAY_1D<IEC_INT, L, U>& arr)
        : data_(&arr[L]), lower_(L), upper_(U) {}

    IEC_INT& operator[](int64_t i) { return data_[i - lower_]; }
    int64_t lower_bound() const { return lower_; }
    int64_t upper_bound() const { return upper_; }
};

IEC_INT SumArray(ArrayView1D_INT arr) {
    IEC_INT sum = 0;
    for (int64_t i = arr.lower_bound(); i <= arr.upper_bound(); ++i) {
        sum = sum + arr[i].get();
    }
    return sum;
}
```

**Option C: std::span (C++20)**
```cpp
IEC_INT SumArray(std::span<IECVar<IEC_INT>> arr, int64_t lower) {
    IEC_INT sum = 0;
    for (auto& elem : arr) {
        sum = sum + elem.get();
    }
    return sum;
}
```

**Recommendation**: Option B (ArrayView) for C++17 compatibility with full bounds support.

### 5. Runtime Library Extension

**File**: `src/runtime/include/iec_array.hpp`

Add ArrayView types for variable-length array support:

```cpp
// Type-erased array view for variable-length array parameters
template<typename T>
class ArrayView1D {
    IECVar<T>* data_;
    int64_t lower_, upper_;

public:
    template<int64_t L, int64_t U>
    ArrayView1D(IEC_ARRAY_1D<T, L, U>& arr)
        : data_(&arr[L]), lower_(L), upper_(U) {}

    IECVar<T>& operator[](int64_t i) {
        return data_[i - lower_];
    }

    const IECVar<T>& operator[](int64_t i) const {
        return data_[i - lower_];
    }

    int64_t lower_bound() const { return lower_; }
    int64_t upper_bound() const { return upper_; }
    int64_t length() const { return upper_ - lower_ + 1; }
};

// 2D and 3D variants
template<typename T>
class ArrayView2D { /* ... */ };

template<typename T>
class ArrayView3D { /* ... */ };
```

### 6. LOWER_BOUND/UPPER_BOUND for Variable-Length

The intrinsics must work with both concrete arrays and ArrayView:

```cpp
// For concrete arrays (compile-time)
template<typename T, int64_t L, int64_t U>
constexpr int64_t LOWER_BOUND(const IEC_ARRAY_1D<T, L, U>&, int dim) {
    return L;
}

// For ArrayView (runtime)
template<typename T>
int64_t LOWER_BOUND(const ArrayView1D<T>& arr, int dim) {
    return arr.lower_bound();
}
```

## Testing

### Test 1: Basic Variable-Length Function
```st
FUNCTION ArraySum : INT
    VAR_IN_OUT
        arr : ARRAY[*] OF INT;
    END_VAR
    VAR
        i : INT;
        sum : INT := 0;
    END_VAR
    FOR i := LOWER_BOUND(arr, 1) TO UPPER_BOUND(arr, 1) DO
        sum := sum + arr[i];
    END_FOR;
    ArraySum := sum;
END_FUNCTION

PROGRAM TestVLA
    VAR
        small : ARRAY[1..3] OF INT := [10, 20, 30];
        large : ARRAY[1..5] OF INT := [1, 2, 3, 4, 5];
        r1, r2 : INT;
    END_VAR
    r1 := ArraySum(small);  // Expected: 60
    r2 := ArraySum(large);  // Expected: 15
END_PROGRAM
```

### Test 2: Non-Zero-Based Arrays
```st
PROGRAM TestNonZeroBased
    VAR
        arr : ARRAY[10..15] OF INT := [1, 2, 3, 4, 5, 6];
        result : INT;
    END_VAR
    result := ArraySum(arr);  // Expected: 21
END_PROGRAM
```

### Test 3: Multi-Dimensional Variable-Length
```st
FUNCTION Matrix2DSum : REAL
    VAR_IN_OUT
        m : ARRAY[*, *] OF REAL;
    END_VAR
    // ... sum all elements
END_FUNCTION

PROGRAM TestMatrix
    VAR
        m2x2 : ARRAY[1..2, 1..2] OF REAL := [[1.0, 2.0], [3.0, 4.0]];
        m3x3 : ARRAY[0..2, 0..2] OF REAL;
        r1, r2 : REAL;
    END_VAR
    r1 := Matrix2DSum(m2x2);  // Expected: 10.0
    r2 := Matrix2DSum(m3x3);  // Works with different bounds
END_PROGRAM
```

### Test 4: Semantic Error - Invalid Usage
```st
FUNCTION BadUsage : INT
    VAR_INPUT
        arr : ARRAY[*] OF INT;  // ERROR: ARRAY[*] only allowed in VAR_IN_OUT
    END_VAR
END_FUNCTION

PROGRAM BadLocal
    VAR
        arr : ARRAY[*] OF INT;  // ERROR: Cannot declare local variable-length array
    END_VAR
END_PROGRAM
```

## Success Criteria

- Parser recognizes `ARRAY[*]` syntax
- Semantic analysis enforces VAR_IN_OUT restriction
- Code generator produces working C++ for variable-length parameters
- Functions can accept arrays of different sizes
- `LOWER_BOUND`/`UPPER_BOUND` work correctly at runtime
- All semantic error cases are caught with clear messages

## Notes

### Relationship to Other Phases
- **Phase 3.3**: Requires array access and intrinsics from Phase 3.3
- **Phase 4**: Functions - variable-length arrays are function parameters
- **Phase 5**: Function blocks - can also have VAR_IN_OUT with ARRAY[*]

### What Phase 3.4 Does NOT Include
- Dynamic array allocation (`__NEW`) - vendor extension, not standard
- Returning variable-length arrays - not allowed by standard
- Variable-length arrays as VAR_INPUT - not allowed by standard

### Future Consideration: Dynamic Arrays

Some vendors (Beckhoff, CODESYS) support dynamic memory allocation:

```st
// VENDOR EXTENSION - Not standard IEC 61131-3
VAR
    pArr : POINTER TO ARRAY[1..100] OF INT;
END_VAR
pArr := __NEW(ARRAY[1..100] OF INT);
// ... use array ...
__DELETE(pArr);
```

This is **not standard** IEC 61131-3 and would require:
- Heap allocation support in runtime
- Garbage collection or manual memory management
- Pointer safety considerations

If desired, this could be a future Phase 8+ feature as a vendor extension.

## References

- [IEC 61131-3: Arrays with variable length - Stefan Henneken](https://stefanhenneken.net/2016/09/27/iec-61131-3-arrays-with-variable-length/)
- IEC 61131-3 Edition 3.0, Section 2.4.3.1 - Array data types
- IEC 61131-3 Edition 4.0 (2025) - Maintains same array semantics
