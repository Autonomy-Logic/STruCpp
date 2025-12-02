# Phase 3: Core ST Translation (Expressions and Statements)

**Status**: PENDING

**Duration**: 4-6 weeks

**Goal**: Implement parser and code generator for basic ST expressions, assignments, and simple statements to fill in program .run() methods

## Overview

This phase implements the core Structured Text translation capability. It parses ST code inside PROGRAM bodies and generates C++ code to fill in the .run() method implementations created in Phase 2.

## Scope

### Language Features

- Elementary data types: BOOL, INT, DINT, REAL, LREAL
- Literals: integer, real, boolean
- Simple expressions: arithmetic (+, -, *, /), comparison (=, <>, <, >, <=, >=), logical (AND, OR, NOT)
- Assignment statements
- Variable references (local VAR and VAR_EXTERNAL)

### Example ST Program Body

```st
PROGRAM Test
    VAR
        x : INT;
        y : INT;
        result : BOOL;
    END_VAR
    
    x := 10;
    y := 20;
    result := x < y;
END_PROGRAM
```

This phase fills in the `.run()` method for programs created in Phase 2.

## Deliverables

### Frontend
- Chevrotain grammar rules for expression subset
- Lexer and parser implementation for ST expressions and assignments
- AST node interfaces for expressions and statements
- Source location tracking

### Semantic Analysis
- Symbol table implementation for local scopes
- Type inference for literals and expressions
- Type checking for assignments and operators
- Basic error reporting with source locations

### Code Generation
- C++ code generator for expressions and assignments
- Fill in .run() method bodies in program classes
- Line mapping implementation
- Use Phase 1 IEC type wrappers and Phase 2 program structure

### Testing
- Unit tests for parser, type checker, code generator
- Golden file tests (ST input -> expected C++ output)
- Runtime tests (compile and execute generated C++)

## Success Criteria

- Can parse simple program bodies with expressions and assignments
- Type checking correctly identifies type errors
- Generated C++ compiles with g++/clang++
- Generated C++ produces correct results when executed
- Line mapping is accurate (1:1 for simple statements)
- Test coverage >90% for implemented features
- All golden file tests pass

## Validation Examples

### Test 1: Simple Assignment
```st
PROGRAM SimpleAssign
    VAR
        x : INT;
        y : INT;
    END_VAR
    x := 10;
    y := x + 5;
END_PROGRAM
```
Expected: y = 15

### Test 2: Boolean Expression
```st
PROGRAM BoolExpr
    VAR
        a : INT;
        b : INT;
        result : BOOL;
    END_VAR
    a := 10;
    b := 20;
    result := (a < b) AND (b > 15);
END_PROGRAM
```
Expected: result = TRUE

### Test 3: Arithmetic Operations
```st
PROGRAM Arithmetic
    VAR
        x : REAL;
        y : REAL;
        sum : REAL;
        product : REAL;
    END_VAR
    x := 3.5;
    y := 2.0;
    sum := x + y;
    product := x * y;
END_PROGRAM
```
Expected: sum = 5.5, product = 7.0

## Notes

### Relationship to Other Phases
- **Phase 2**: Uses program classes and structure created in Phase 2
- **Phase 4**: Will add function calls and user-defined functions

### What Phase 3 Does NOT Include
- Function calls (Phase 4)
- Function blocks (Phase 5)
- Control flow statements (IF, CASE, FOR, WHILE) - Phase 7
- Arrays and structures - Phase 7
