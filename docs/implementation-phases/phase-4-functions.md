# Phase 4: Functions and Function Calls

**Status**: PENDING

**Duration**: 4-6 weeks

**Goal**: Add support for user-defined functions and standard library functions

## Overview

This phase extends the compiler to support FUNCTION declarations and function calls in expressions. It includes implementing standard library functions (ADD, SUB, MUL, DIV, ABS, SQRT, etc.) and user-defined functions with proper overload resolution.

## Scope

### Language Features
- FUNCTION declarations with return type
- VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT parameters
- Function calls in expressions
- Standard library functions (ADD, SUB, MUL, DIV, ABS, SQRT, etc.)
- Function overloading (same name, different parameter types)
- Extensible functions (variable argument count)

### Example ST Code

```st
FUNCTION ADD_THREE : INT
    VAR_INPUT
        a : INT;
        b : INT;
        c : INT;
    END_VAR
    ADD_THREE := a + b + c;
END_FUNCTION

PROGRAM Main
    VAR
        result : INT;
    END_VAR
    result := ADD_THREE(10, 20, 30);
END_PROGRAM
```

## Deliverables

### Frontend
- Grammar extensions for FUNCTION declarations
- AST nodes for function declarations and calls
- Parameter list parsing

### Semantic Analysis
- Function signature extraction
- Overload resolution
- Parameter type checking
- Return type validation

### IR and Backend
- IR nodes for function calls
- C++ function generation
- Standard library function mapping
- Parameter passing (by value, by reference)

### Standard Library
- Implement IEC 61131-3 standard functions
- Numeric functions (ABS, SQRT, LN, EXP, SIN, COS, etc.)
- Bit string functions (SHL, SHR, ROL, ROR, etc.)
- Selection functions (SEL, MAX, MIN, LIMIT, MUX)
- Comparison functions

### Testing
- Function declaration and call tests
- Overload resolution tests
- Standard library function tests
- Parameter passing tests (value, reference)

## Success Criteria

- Can declare and call user-defined functions
- Overload resolution works correctly
- Standard library functions are available
- Parameter passing is correct (value vs. reference)
- Generated C++ is efficient (inline where appropriate)
- All tests pass

## Validation Examples

### Test 1: User-Defined Function
```st
FUNCTION SQUARE : INT
    VAR_INPUT x : INT; END_VAR
    SQUARE := x * x;
END_FUNCTION

PROGRAM Main
    VAR result : INT; END_VAR
    result := SQUARE(5);
END_PROGRAM
```
Expected: result = 25

### Test 2: Function Overloading
```st
(* Standard library provides ADD for different types *)
PROGRAM Main
    VAR
        int_result : INT;
        real_result : REAL;
    END_VAR
    int_result := ADD(10, 20);        (* INT version *)
    real_result := ADD(1.5, 2.5);     (* REAL version *)
END_PROGRAM
```
Expected: int_result = 30, real_result = 4.0

### Test 3: VAR_IN_OUT Parameters
```st
FUNCTION SWAP
    VAR_IN_OUT a, b : INT; END_VAR
    VAR temp : INT; END_VAR
    temp := a;
    a := b;
    b := temp;
END_FUNCTION

PROGRAM Main
    VAR x, y : INT; END_VAR
    x := 10;
    y := 20;
    SWAP(a := x, b := y);
END_PROGRAM
```
Expected: x = 20, y = 10

## Notes

### Relationship to Other Phases
- **Phase 3**: Builds on expression and statement compilation
- **Phase 5**: Function blocks extend functions with state
