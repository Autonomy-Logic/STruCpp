# Phase 3: Core ST Translation (Expressions and Statements)

**Status**: PENDING

**Duration**: 4-6 weeks

**Goal**: Implement parser and code generator for basic ST expressions, assignments, and simple statements to fill in program .run() methods

## Overview

This phase implements the core Structured Text translation capability. It parses ST code inside PROGRAM bodies and generates C++ code to fill in the .run() method implementations created in Phase 2.

**Note**: This phase also includes several features deferred from Phase 2.x that require expression/statement translation infrastructure.

## Scope

### Language Features

- Elementary data types: BOOL, INT, DINT, REAL, LREAL
- Literals: integer, real, boolean
- Simple expressions: arithmetic (+, -, *, /), comparison (=, <>, <, >, <=, >=), logical (AND, OR, NOT)
- Assignment statements
- Variable references (local VAR and VAR_EXTERNAL)

### Deferred Items from Phase 2.x

The following items were deferred from Phase 2.x because they require expression analysis infrastructure:

#### From Phase 2.4 (References and Pointers)
- Code generation for `REF_TO<T>` type declarations
- Code generation for `REFERENCE_TO<T>` type declarations
- Code generation for `REF()` calls
- Code generation for `deref()` calls (`^` and `DREF` operators)
- Code generation for null comparisons (`ref <> NULL`)
- Code generation for `REF=` as `bind()` calls
- Nested `REF_TO REF_TO` type support

#### From Phase 2.6 (Variable Modifiers)
- Validate assignments don't target CONSTANT variables
- Unit test: Assignment to CONSTANT produces error

#### From Phase 2.7 (Namespaces)
- Handle qualified type names in declarations (e.g., `MotorLib.FB_Motor`)
- Handle qualified names in function/FB calls (e.g., `MotorLib.Calculate()`)
- Validate namespace references exist
- Error messages for unknown namespaces
- Cross-namespace type references in generated code

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
- **[From 2.6]** Validate assignments don't target CONSTANT variables
- **[From 2.7]** Qualified name resolution in type references and calls

### Code Generation
- C++ code generator for expressions and assignments
- Fill in .run() method bodies in program classes
- Line mapping implementation
- Use Phase 1 IEC type wrappers and Phase 2 program structure
- **[From 2.4]** Generate `REF_TO<T>` and `REFERENCE_TO<T>` declarations
- **[From 2.4]** Generate `REF()`, `deref()`, null comparisons, and `REF=` calls
- **[From 2.7]** Convert qualified names (`Lib.Type`) to C++ syntax (`Lib::Type`)

### Testing
- Unit tests for parser, type checker, code generator
- Golden file tests (ST input -> expected C++ output)
- Runtime tests (compile and execute generated C++)
- **[From 2.4]** Unit tests for reference type code generation
- **[From 2.4]** Unit tests for null dereference exception
- **[From 2.4]** Integration tests for reference operations
- **[From 2.6]** Unit test: Assignment to CONSTANT produces error

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
- **Phase 2.4**: Completes reference/pointer code generation deferred from Phase 2.4
- **Phase 2.6**: Completes CONSTANT assignment validation deferred from Phase 2.6
- **Phase 2.7**: Completes qualified name handling deferred from Phase 2.7
- **Phase 4**: Will add function calls and user-defined functions

### What Phase 3 Does NOT Include
- Function calls (Phase 4)
- Function blocks (Phase 5)
- Control flow statements (IF, CASE, FOR, WHILE) - Phase 3.2
- Arrays and structures - Phase 3.2

### Deferred Items Summary

The following table summarizes all items deferred to Phase 3 from earlier phases:

| Source Phase | Feature | Status in Source | Reason Deferred |
|-------------|---------|------------------|-----------------|
| 2.4 | REF_TO code generation | Parser complete | Requires expression codegen |
| 2.4 | REFERENCE_TO code generation | Parser complete | Requires expression codegen |
| 2.4 | REF() operator codegen | Parser complete | Requires expression codegen |
| 2.4 | Dereference (^, DREF) codegen | Parser complete | Requires expression codegen |
| 2.4 | Null comparison codegen | Parser complete | Requires expression codegen |
| 2.4 | REF= binding codegen | Parser complete | Requires statement codegen |
| 2.4 | Nested REF_TO REF_TO | Skipped | Requires grammar extension |
| 2.6 | CONSTANT assignment validation | Deferred | Requires expression analysis |
| 2.7 | Qualified type name resolution | Helper ready | Requires type reference codegen |
| 2.7 | Qualified function/FB calls | Helper ready | Requires call expression codegen |
| 2.7 | Namespace validation errors | Deferred | Requires semantic analysis |
| 2.7 | Cross-namespace references | Helper ready | Requires type mapping in codegen |
