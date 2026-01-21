# Phase 3.2: Control Flow Statements

**Status**: PENDING

**Duration**: 2-3 weeks

**Goal**: Implement code generation for control flow statements (IF, CASE, FOR, WHILE, REPEAT, EXIT, RETURN)

## Overview

This phase implements code generation for all IEC 61131-3 control flow statements. The parser, AST definitions, and AST builder are already complete - this phase focuses solely on semantic analysis and C++ code generation.

## Current Implementation Status

| Component | Status | Location |
|-----------|--------|----------|
| Lexer tokens | **Complete** | `src/frontend/lexer.ts` |
| Parser grammar | **Complete** | `src/frontend/parser.ts:471-611` |
| AST node types | **Complete** | `src/frontend/ast.ts:336-467` |
| AST builder | **Complete** | `src/frontend/ast-builder.ts:847-1070` |
| Semantic analysis | **Not implemented** | `src/semantic/analyzer.ts` |
| Code generation | **Not implemented** | `src/backend/codegen.ts` |

## Scope

### Statements to Implement

| Statement | ST Syntax | C++ Output |
|-----------|-----------|------------|
| IF | `IF cond THEN ... ELSIF ... ELSE ... END_IF` | `if (cond) { ... } else if (...) { ... } else { ... }` |
| CASE | `CASE sel OF 1: ... 2,3: ... ELSE ... END_CASE` | `switch (sel) { case 1: ... case 2: case 3: ... default: ... }` |
| FOR | `FOR i := 1 TO 10 BY 2 DO ... END_FOR` | `for (auto i = 1; i <= 10; i += 2) { ... }` |
| WHILE | `WHILE cond DO ... END_WHILE` | `while (cond) { ... }` |
| REPEAT | `REPEAT ... UNTIL cond END_REPEAT` | `do { ... } while (!(cond));` |
| EXIT | `EXIT;` | `break;` |
| RETURN | `RETURN;` | `return;` |

## Code Generation

### IF Statement

**ST Source:**
```st
IF x > 10 THEN
    y := 1;
ELSIF x > 5 THEN
    y := 2;
ELSE
    y := 3;
END_IF;
```

**Generated C++:**
```cpp
if (x.get() > 10) {
    y.set(1);
} else if (x.get() > 5) {
    y.set(2);
} else {
    y.set(3);
}
```

### CASE Statement

**ST Source:**
```st
CASE state OF
    0: output := FALSE;
    1, 2: output := TRUE;
    3..5: output := FALSE;
ELSE
    output := TRUE;
END_CASE;
```

**Generated C++:**
```cpp
switch (state.get()) {
    case 0:
        output.set(false);
        break;
    case 1:
    case 2:
        output.set(true);
        break;
    case 3:
    case 4:
    case 5:
        output.set(false);
        break;
    default:
        output.set(true);
        break;
}
```

**Note:** Range labels (`3..5`) expand to individual cases.

### FOR Statement

**ST Source:**
```st
FOR i := 1 TO 10 BY 2 DO
    sum := sum + i;
END_FOR;
```

**Generated C++:**
```cpp
for (IEC_INT i{1}; i.get() <= 10; i.set(i.get() + 2)) {
    sum.set(sum.get() + i.get());
}
```

**Alternative (optimized):** Use raw `int` for loop variable since it's local and doesn't need forcing:
```cpp
for (int i = 1; i <= 10; i += 2) {
    sum.set(sum.get() + i);
}
```

### WHILE Statement

**ST Source:**
```st
WHILE running DO
    counter := counter + 1;
END_WHILE;
```

**Generated C++:**
```cpp
while (running.get()) {
    counter.set(counter.get() + 1);
}
```

### REPEAT Statement

**ST Source:**
```st
REPEAT
    counter := counter + 1;
UNTIL counter > 10 END_REPEAT;
```

**Generated C++:**
```cpp
do {
    counter.set(counter.get() + 1);
} while (!(counter.get() > 10));
```

### EXIT Statement

**ST Source:**
```st
FOR i := 1 TO 100 DO
    IF found THEN
        EXIT;
    END_IF;
END_FOR;
```

**Generated C++:**
```cpp
for (int i = 1; i <= 100; i += 1) {
    if (found.get()) {
        break;
    }
}
```

### RETURN Statement

**ST Source:**
```st
IF error THEN
    RETURN;
END_IF;
```

**Generated C++:**
```cpp
if (error.get()) {
    return;
}
```

## Semantic Analysis

### Validation Rules

| Rule | Error Message |
|------|---------------|
| EXIT outside loop | "EXIT statement is only valid inside FOR, WHILE, or REPEAT loops" |
| FOR variable must be integer | "FOR loop control variable must be an integer type" |
| FOR variable cannot be modified | "FOR loop control variable 'i' cannot be assigned inside the loop" |
| CASE selector must be integer/enum | "CASE selector must be an integer or enumeration type" |
| CASE label type mismatch | "CASE label type must match selector type" |
| Duplicate CASE label | "Duplicate CASE label value: 5" |

### Loop Context Tracking

Track loop nesting to validate EXIT statements:

```typescript
private loopDepth: number = 0;

visitForStatement(node: ForStatement): void {
    this.loopDepth++;
    // visit body
    this.loopDepth--;
}

visitExitStatement(node: ExitStatement): void {
    if (this.loopDepth === 0) {
        this.error(node, "EXIT statement is only valid inside a loop");
    }
}
```

## Implementation

### Code Generator Changes

Add to `src/backend/codegen.ts`:

```typescript
/**
 * Generate code for a statement.
 */
private generateStatement(stmt: Statement): void {
    switch (stmt.kind) {
        case "AssignmentStatement":
            this.generateAssignment(stmt);
            break;
        case "IfStatement":
            this.generateIfStatement(stmt);
            break;
        case "CaseStatement":
            this.generateCaseStatement(stmt);
            break;
        case "ForStatement":
            this.generateForStatement(stmt);
            break;
        case "WhileStatement":
            this.generateWhileStatement(stmt);
            break;
        case "RepeatStatement":
            this.generateRepeatStatement(stmt);
            break;
        case "ExitStatement":
            this.emit("break;");
            break;
        case "ReturnStatement":
            this.emit("return;");
            break;
        case "FunctionCallStatement":
            this.generateFunctionCallStatement(stmt);
            break;
    }
}
```

### Program Body Generation

Update the empty `run()` method to generate actual code:

```typescript
private generateProgramBody(prog: ProgramDeclaration): void {
    this.emit(`void Program_${prog.name}::run() {`);
    for (const stmt of prog.body) {
        this.generateStatement(stmt);
    }
    this.emit("}");
}
```

## Deliverables

### Semantic Analyzer
- [ ] Add loop depth tracking
- [ ] Validate EXIT only inside loops
- [ ] Validate FOR control variable type
- [ ] Validate FOR control variable immutability
- [ ] Validate CASE selector type
- [ ] Validate CASE label types match selector
- [ ] Detect duplicate CASE labels

### Code Generator
- [ ] `generateStatement()` dispatcher method
- [ ] `generateIfStatement()` with ELSIF/ELSE support
- [ ] `generateCaseStatement()` with range expansion
- [ ] `generateForStatement()` with optional BY clause
- [ ] `generateWhileStatement()`
- [ ] `generateRepeatStatement()` (do-while with negated condition)
- [ ] EXIT → `break;`
- [ ] RETURN → `return;`
- [ ] Update `generateProgramBody()` to call statement generator

### Testing
- [ ] Unit tests for each statement type parsing (verify existing)
- [ ] Unit tests for semantic validation errors
- [ ] Integration tests: generated C++ compiles
- [ ] Runtime tests: generated C++ executes correctly
- [ ] Golden file tests: ST input → expected C++ output

## Success Criteria

- All control flow statements generate correct C++
- Generated C++ compiles without warnings
- EXIT validation catches misuse
- FOR loop variable constraints enforced
- CASE statement range labels expand correctly
- CASE duplicate detection works
- All existing tests continue to pass
- >90% test coverage for control flow

## Files to Modify

| File | Changes |
|------|---------|
| `src/semantic/analyzer.ts` | Add control flow validation |
| `src/backend/codegen.ts` | Add statement generation methods |

## Notes

### Relationship to Other Phases

- **Phase 3**: Uses expression code generation from Phase 3
- **Phase 4**: Function calls inside control flow use Phase 4 call codegen
- **Phase 5.1**: FB calls inside control flow work the same way

### Design Decisions

1. **FOR loop variable as raw int** - Since FOR loop variables are local and cannot be forced, we can use plain `int` instead of `IECVar<INT_t>` for better performance.

2. **CASE range expansion** - Ranges like `3..5` are expanded at compile time to individual `case 3: case 4: case 5:` labels. This matches how CODESYS handles ranges.

3. **REPEAT condition negation** - C++ `do-while` loops while the condition is true, but IEC `REPEAT-UNTIL` loops until the condition is true. We negate the condition: `while (!(cond))`.

4. **No CONTINUE statement** - IEC 61131-3 doesn't have CONTINUE. Only EXIT (break) is supported.
