# Phase 5.1: Function Block Instances and Invocations

**Status**: COMPLETE
**Duration**: 3-4 weeks
**Goal**: Complete Function Block support by adding FB instantiation, invocation (call) syntax, and member access

## Overview

Phase 5.1 builds on the existing FUNCTION_BLOCK declaration and class skeleton codegen to deliver the remaining core mechanics: declaring FB instances as variables, invoking FBs with named parameter syntax, and accessing FB output members. These are the prerequisite mechanics that all higher-level features (OOP, standard FB libraries) depend on.

**What already works** (from prior implementation):
- `FUNCTION_BLOCK` declarations parse and produce `FunctionBlockDeclaration` AST nodes
- Basic C++ class skeleton generation (`operator()`, member variables, constructor)
- `LibraryFBEntry` interface in the library manifest system
- FB symbol registration in the global symbol table

**What this phase adds**:
- FB instance declarations (`myTimer : TON;`)
- FB invocation as statements (`myTimer(IN := TRUE, PT := T#5s);`)
- FB output member access (`output := myTimer.Q;`)
- FB input member write (`myTimer.IN := TRUE;`)
- FB-to-FB composition (FB instances inside other FBs)
- Semantic validation for FB usage

## Scope

### Language Features

```st
(* 1. FB instance declaration *)
PROGRAM Main
VAR
    timer1 : TON;                  (* Simple instance *)
    timer2 : TON;                  (* Multiple instances of same type *)
    counter : CTU;
END_VAR

(* 2. FB invocation with named parameters *)
    timer1(IN := start_signal, PT := T#5s);

(* 3. FB output access *)
    done := timer1.Q;
    elapsed := timer1.ET;

(* 4. FB input write *)
    timer1.IN := TRUE;

(* 5. FB composition - FBs inside FBs *)
FUNCTION_BLOCK MyController
VAR
    edge : R_TRIG;              (* FB instance inside another FB *)
    count : CTU;
END_VAR
    edge(CLK := input);
    IF edge.Q THEN
        count(CU := TRUE, PV := 10);
    END_IF;
END_FUNCTION_BLOCK
```

### Generated C++

```cpp
// FB instance declaration becomes a member
class Main {
public:
    TON timer1;       // FB instances are class members
    TON timer2;
    CTU counter;

    void operator()() {
        // FB invocation -> call operator()
        timer1.IN = start_signal;
        timer1.PT = IEC_TIME::from_ms(5000);
        timer1();

        // FB output access -> direct member access
        done = timer1.Q;
        elapsed = timer1.ET;

        // FB input write -> direct member assignment
        timer1.IN = true;
    }
};
```

## Architecture

### FB Instance Resolution

When the parser sees a variable declaration like `timer1 : TON;`, it currently treats `TON` as an ordinary type name (an Identifier in the `dataType` rule). The key change is in **semantic analysis**: the type resolver must check whether the type name refers to a known function block. If so, the variable is an **FB instance** rather than an elementary/composite variable.

```
Parse:     VAR timer1 : TON; END_VAR
                         ^^^ resolves to FunctionBlockDeclaration
Codegen:   TON timer1;  (C++ class instance)
```

### FB Invocation Detection

FB calls look syntactically identical to function calls: `timer1(IN := TRUE, PT := T#5s);`. The parser already handles this as a `functionCallStatement`. The distinction happens during **semantic analysis**:

1. Look up the identifier (`timer1`) in the local symbol table
2. If it resolves to an FB instance variable -> FB invocation
3. If it resolves to a function name -> function call
4. This discrimination must propagate to the AST (either a new node kind or a flag)

### Member Access

FB member access (`timer1.Q`) is already handled by the parser's `memberAccess` rule (used for struct field access). The semantic analyzer must resolve the base variable to an FB type and validate the member name against the FB's declared variables.

## Detailed Changes

### 5.1.1: AST Additions

**File: `src/frontend/ast.ts`**

```typescript
// New AST node for FB invocation statements
export interface FBInvocationStatement extends ASTNode {
  kind: "FBInvocationStatement";
  instanceName: string;         // The FB instance variable name
  arguments: Argument[];        // Named parameters (same Argument type as function calls)
}

// Add to Statement union type
export type Statement =
  | ... existing ...
  | FBInvocationStatement;
```

The `FBInvocationStatement` is distinct from `FunctionCallStatement` because:
- FB calls operate on an existing instance (stateful), not a stateless function
- Codegen must assign inputs then call `operator()`, rather than passing arguments
- No return value (FBs return void; outputs accessed via members)

### 5.1.2: Semantic Analysis -- FB Instance Detection

**File: `src/semantic/symbol-table.ts`**

Extend the symbol table to track which variables are FB instances:

```typescript
export interface VariableSymbol {
  // ... existing fields ...
  isFBInstance?: boolean;         // true if this var is an FB instance
  fbTypeName?: string;            // the FB type name (e.g., "TON")
}
```

**File: `src/semantic/analyzer.ts`** (or wherever type resolution happens)

When processing `VarDeclaration`:
1. Resolve the declared type name
2. Check if it matches a registered `functionBlock` in the global symbol table
3. If yes: mark the variable as `isFBInstance = true`, store `fbTypeName`
4. This enables downstream discrimination between FB calls and function calls

### 5.1.3: AST Builder -- FB Call Discrimination

**File: `src/frontend/ast-builder.ts`**

The AST builder sees `functionCallStatement` CST nodes for both function calls and FB invocations. Since the AST builder doesn't have type information, two approaches are possible:

**Approach A (recommended): Defer to semantic phase**
- Build all call statements as `FunctionCallStatement` initially
- During semantic analysis, check if the callee is an FB instance
- If so, transform the node to `FBInvocationStatement`
- This keeps the AST builder simple and type-unaware

**Approach B: Two-pass AST builder**
- First pass builds declarations (collects FB names)
- Second pass can discriminate based on known FB names
- More complex, but avoids post-hoc node transformation

Recommendation: **Approach A** -- matches how the function call pipeline already works, and the transformation is straightforward.

### 5.1.4: Code Generation

**File: `src/backend/codegen.ts`**

**FB Instance Declaration**:
When generating variable declarations, if the variable's type resolves to a function block, emit the FB class name directly (no `IECVar<>` wrapper):

```typescript
// Regular variable:     IEC_INT myVar{0};
// FB instance:          TON timer1;      (plain class instance)
```

**FB Invocation**:
```typescript
private generateFBInvocation(node: FBInvocationStatement): void {
  const instanceName = node.instanceName;

  // Assign each named input parameter
  for (const arg of node.arguments) {
    if (arg.name && !arg.isOutput) {
      this.emit(`${instanceName}.${arg.name} = ${this.generateExpression(arg.value)};`);
    }
  }

  // Call the FB execution body
  this.emit(`${instanceName}();`);

  // Capture output arguments (if any use => syntax)
  for (const arg of node.arguments) {
    if (arg.name && arg.isOutput) {
      this.emit(`${this.generateExpression(arg.value)} = ${instanceName}.${arg.name};`);
    }
  }
}
```

**FB Member Access**:
Already handled by struct member access codegen (`a.b` -> `a.b`). No changes needed for the basic case. The type checker just needs to validate that the member exists on the FB type.

### 5.1.5: FB Composition

FBs can contain other FB instances as local variables (e.g., CTU has `CU_T: R_TRIG;` internally). This is handled naturally:
- The FB's `VAR` block declares an FB instance
- Codegen emits it as a class member
- The FB's body invokes the nested FB instance

This requires **no special handling** beyond the basic FB instance support -- it's recursive application of the same rules.

## Validation Examples

### Test 1: Basic FB Instance and Call

```st
FUNCTION_BLOCK SimpleCounter
VAR_INPUT
    increment : BOOL;
END_VAR
VAR_OUTPUT
    count : INT;
END_VAR
    IF increment THEN
        count := count + 1;
    END_IF;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
    c : SimpleCounter;
    result : INT;
END_VAR
    c(increment := TRUE);
    result := c.count;
END_PROGRAM
```

Expected C++:
```cpp
class SimpleCounter {
public:
    IEC_BOOL increment;
    IEC_INT count;

    SimpleCounter() : increment(false), count(0) {}

    void operator()() {
        if (increment) {
            count = count + 1;
        }
    }
};

class Main {
public:
    SimpleCounter c;
    IEC_INT result;

    void operator()() {
        c.increment = true;
        c();
        result = c.count;
    }
};
```

### Test 2: FB Composition

```st
FUNCTION_BLOCK EdgeCounter
VAR_INPUT
    signal : BOOL;
END_VAR
VAR_OUTPUT
    edges : INT;
END_VAR
VAR
    edge : R_TRIG;
END_VAR
    edge(CLK := signal);
    IF edge.Q THEN
        edges := edges + 1;
    END_IF;
END_FUNCTION_BLOCK
```

### Test 3: Multiple Instances

```st
PROGRAM Main
VAR
    timer1 : TON;
    timer2 : TON;
    done1, done2 : BOOL;
END_VAR
    timer1(IN := TRUE, PT := T#5s);
    timer2(IN := TRUE, PT := T#10s);
    done1 := timer1.Q;
    done2 := timer2.Q;
END_PROGRAM
```

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/frontend/ast.ts` | Modify | Add `FBInvocationStatement` node, add to Statement union |
| `src/frontend/ast-builder.ts` | Modify | (Optional) Build FB calls if discriminating at AST level |
| `src/semantic/symbol-table.ts` | Modify | Add `isFBInstance`, `fbTypeName` to variable symbols |
| `src/semantic/analyzer.ts` | Modify | FB instance detection, call discrimination, member validation |
| `src/backend/codegen.ts` | Modify | FB instance declarations (no IECVar wrapper), FB invocation codegen |
| `tests/frontend/ast-builder-fb.test.ts` | Create | FB parsing and AST building tests |
| `tests/backend/codegen-fb.test.ts` | Create | FB codegen tests |
| `tests/integration/cpp-compile-fb.test.ts` | Create | End-to-end C++ compilation for FBs |

## Success Criteria

- FB instances can be declared in PROGRAM and FUNCTION_BLOCK VAR blocks
- FB invocation with named parameters generates correct C++ (assign inputs, call, capture outputs)
- FB member access works for reading outputs and writing inputs
- FB composition (FBs within FBs) works correctly
- Multiple instances of the same FB type are independent
- Generated C++ compiles with g++
- All new tests pass with 75%+ coverage

## Notes

### Relationship to Other Phases
- **Phase 4**: Function call infrastructure provides the named argument parsing/codegen foundation
- **Phase 5.2**: OOP extensions (methods, interfaces, inheritance) build directly on FB class generation
- **Phase 5.3**: Standard FB library requires all mechanics from this phase
- **Phase 6**: OpenPLC integration relies on FB instances for PLC program structure

### FB Instance vs Function Call -- Key Differences

| Aspect | Function Call | FB Invocation |
|--------|-------------|---------------|
| State | Stateless | Stateful (persists between calls) |
| Syntax | `result := Func(args)` | `fb(args); x := fb.Output;` |
| Return | Single return value | Multiple outputs via members |
| C++ | `result = Func(args)` | `fb.IN = x; fb(); y = fb.Q;` |
| Scope | Global function | Instance variable |

### IECVar Wrapper for FB Members

FB input/output members should still use `IECVar<T>` wrappers to support variable forcing (Phase 6 requirement). FB instances themselves are **not** wrapped -- they are plain C++ class instances. Only the scalar/composite members inside the FB use wrappers.
