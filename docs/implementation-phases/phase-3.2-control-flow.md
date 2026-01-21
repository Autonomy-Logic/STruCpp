# Phase 3.2: Control Flow Statements

**Status**: PENDING

**Duration**: 2-3 weeks

**Goal**: Implement code generation and semantic analysis for control flow statements (IF, CASE, FOR, WHILE, REPEAT, EXIT, RETURN)

## Overview

This phase completes the control flow statement support in STruC++. The parser and AST infrastructure for all control flow statements are already implemented - this phase focuses on semantic analysis and C++ code generation.

**Note**: The parsing and AST building for control flow statements was completed as part of the initial parser implementation. This phase adds the semantic validation and code generation layers.

## Current Implementation Status

### Already Implemented (Parser/AST)

The following are already complete in the codebase:

- **AST Node Types** (`src/frontend/ast.ts`):
  - `IfStatement`, `ElsifClause`
  - `CaseStatement`, `CaseElement`, `CaseRange`
  - `ForStatement`
  - `WhileStatement`
  - `RepeatStatement`
  - `ExitStatement`
  - `ReturnStatement`

- **Parser Rules** (`src/frontend/parser.ts`):
  - `ifStatement`, `elsifClause`
  - `caseStatement`, `caseElement`, `caseRange`
  - `forStatement`
  - `whileStatement`
  - `repeatStatement`
  - `exitStatement`
  - `returnStatement`

- **AST Builder** (`src/frontend/ast-builder.ts`):
  - `buildIfStatement()`
  - `buildCaseStatement()`
  - `buildForStatement()`
  - `buildWhileStatement()`
  - `buildRepeatStatement()`
  - `buildExitStatement()`
  - `buildReturnStatement()`

### To Be Implemented

- **Semantic Analysis**: Type checking, scope validation, control flow validation
- **Code Generation**: C++ translation in `codegen.ts`

## Scope

### Language Features

#### IF Statement
```st
IF condition THEN
    statements
ELSIF condition THEN
    statements
ELSE
    statements
END_IF;
```

#### CASE Statement
```st
CASE selector OF
    1: statements;
    2, 3: statements;
    4..10: statements;
ELSE
    statements;
END_CASE;
```

#### FOR Statement
```st
FOR counter := start TO end BY step DO
    statements
END_FOR;
```

#### WHILE Statement
```st
WHILE condition DO
    statements
END_WHILE;
```

#### REPEAT Statement
```st
REPEAT
    statements
UNTIL condition
END_REPEAT;
```

#### EXIT Statement
```st
FOR i := 1 TO 100 DO
    IF error THEN
        EXIT;  // Break out of loop
    END_IF;
END_FOR;
```

#### RETURN Statement
```st
FUNCTION Calculate : INT
    IF error THEN
        RETURN;  // Early return
    END_IF;
    Calculate := result;
END_FUNCTION
```

## Deliverables

### Semantic Analysis

- **IF Statement**:
  - Condition must be BOOL or implicitly convertible to BOOL
  - All ELSIF conditions must be BOOL

- **CASE Statement**:
  - Selector must be integer type (INT, DINT, UINT, etc.) or enumeration
  - Case labels must be compatible with selector type
  - Case ranges must have start <= end
  - Duplicate case labels produce error
  - ELSE clause is optional

- **FOR Statement**:
  - Control variable must be integer type
  - Start, end, and step expressions must be compatible with control variable
  - BY clause is optional (defaults to 1)
  - Control variable cannot be modified inside loop body

- **WHILE Statement**:
  - Condition must be BOOL

- **REPEAT Statement**:
  - UNTIL condition must be BOOL

- **EXIT Statement**:
  - Must be inside FOR, WHILE, or REPEAT loop
  - Error if used outside loop context

- **RETURN Statement**:
  - Valid in FUNCTION and FUNCTION_BLOCK
  - In FUNCTION: can optionally set return value before RETURN
  - In PROGRAM: RETURN exits program execution cycle

### Code Generation

#### IF Statement → C++ if
```cpp
// ST: IF a > b THEN x := 1; ELSIF a = b THEN x := 2; ELSE x := 3; END_IF;
if (a > b) {
    x = 1;
} else if (a == b) {
    x = 2;
} else {
    x = 3;
}
```

#### CASE Statement → C++ switch
```cpp
// ST: CASE state OF 1: x := 10; 2, 3: x := 20; 4..6: x := 30; ELSE x := 0; END_CASE;
switch (state) {
    case 1:
        x = 10;
        break;
    case 2:
    case 3:
        x = 20;
        break;
    case 4:
    case 5:
    case 6:
        x = 30;
        break;
    default:
        x = 0;
        break;
}
```

#### FOR Statement → C++ for
```cpp
// ST: FOR i := 1 TO 10 BY 2 DO sum := sum + i; END_FOR;
for (i = 1; i <= 10; i += 2) {
    sum = sum + i;
}

// ST: FOR i := 10 TO 1 BY -1 DO ... END_FOR;
for (i = 10; i >= 1; i += -1) {
    // ...
}
```

**Note**: FOR loop direction is determined at compile time when possible, or runtime check generated when step is variable.

#### WHILE Statement → C++ while
```cpp
// ST: WHILE count < 100 DO count := count + 1; END_WHILE;
while (count < 100) {
    count = count + 1;
}
```

#### REPEAT Statement → C++ do-while
```cpp
// ST: REPEAT count := count + 1; UNTIL count >= 100 END_REPEAT;
do {
    count = count + 1;
} while (!(count >= 100));
```

**Note**: REPEAT-UNTIL executes at least once and continues UNTIL condition is TRUE, which is opposite of C++ do-while (continues WHILE condition is true), hence the negation.

#### EXIT Statement → C++ break
```cpp
// ST: EXIT;
break;
```

#### RETURN Statement → C++ return
```cpp
// ST: RETURN;
return;

// In function with return value already set:
// ST: Calculate := result; RETURN;
Calculate = result;
return Calculate;
```

### Testing

- Unit tests for semantic validation of each statement type
- Unit tests for code generation of each statement type
- Golden file tests comparing ST input to expected C++ output
- Integration tests that compile and execute generated C++
- Edge cases: empty bodies, deeply nested statements, complex conditions

## Success Criteria

- All control flow statements generate correct C++ code
- Semantic analysis catches all specified errors
- Generated C++ compiles without warnings
- Runtime behavior matches IEC 61131-3 specification
- Test coverage >90% for control flow implementation
- All golden file tests pass

## Validation Examples

### Test 1: Nested IF with ELSIF
```st
PROGRAM TestIf
    VAR
        x : INT := 10;
        result : INT;
    END_VAR

    IF x < 0 THEN
        result := -1;
    ELSIF x = 0 THEN
        result := 0;
    ELSE
        result := 1;
    END_IF;
END_PROGRAM
```
Expected: result = 1

### Test 2: CASE with Ranges
```st
PROGRAM TestCase
    VAR
        grade : INT := 85;
        letter : STRING[1];
    END_VAR

    CASE grade OF
        90..100: letter := 'A';
        80..89: letter := 'B';
        70..79: letter := 'C';
        60..69: letter := 'D';
    ELSE
        letter := 'F';
    END_CASE;
END_PROGRAM
```
Expected: letter = 'B'

### Test 3: FOR Loop with EXIT
```st
PROGRAM TestFor
    VAR
        sum : INT := 0;
        i : INT;
    END_VAR

    FOR i := 1 TO 100 DO
        sum := sum + i;
        IF sum > 50 THEN
            EXIT;
        END_IF;
    END_FOR;
END_PROGRAM
```
Expected: sum = 55 (1+2+3+4+5+6+7+8+9+10)

### Test 4: WHILE Loop
```st
PROGRAM TestWhile
    VAR
        count : INT := 0;
        sum : INT := 0;
    END_VAR

    WHILE count < 5 DO
        count := count + 1;
        sum := sum + count;
    END_WHILE;
END_PROGRAM
```
Expected: count = 5, sum = 15

### Test 5: REPEAT-UNTIL
```st
PROGRAM TestRepeat
    VAR
        n : INT := 1;
        factorial : INT := 1;
    END_VAR

    REPEAT
        factorial := factorial * n;
        n := n + 1;
    UNTIL n > 5
    END_REPEAT;
END_PROGRAM
```
Expected: factorial = 120 (5!)

## Notes

### Relationship to Other Phases
- **Phase 3.1**: Uses expression evaluation infrastructure
- **Phase 4**: FOR loops may call functions in expressions
- **Phase 5**: Control flow works within function block methods

### Implementation Order

Recommended implementation order:
1. IF/ELSIF/ELSE (simplest, most common)
2. WHILE (simple loop)
3. REPEAT-UNTIL (simple loop with negation)
4. FOR (more complex with counter management)
5. EXIT (requires loop context tracking)
6. CASE (most complex with ranges and fall-through)
7. RETURN (requires function context)

### Special Considerations

- **Loop Context Tracking**: Need to track whether we're inside a loop for EXIT validation
- **FOR Loop Direction**: Step can be positive or negative; comparison operator changes accordingly
- **CASE Ranges**: Need to expand ranges into individual case labels in generated C++
- **REPEAT Negation**: Remember to negate the UNTIL condition for C++ do-while
