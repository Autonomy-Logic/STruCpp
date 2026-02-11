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


# Phase 4: Functions - Architecture Plan

## Context

STruC++ has completed Phases 1-3.6 (C++ runtime, parser, AST, codegen for expressions/control flow/composites/VLAs/dynamic memory). Phase 4 adds full function support: user-defined functions, standard library function integration, multi-file compilation, and an external library system. The existing parser already handles function declarations and calls, and the codegen has basic function generation -- but **two blockers in the AST builder silently drop all function calls**, making functions unusable.

This plan replaces the existing `docs/implementation-phases/phase-4-functions.md` with six sub-phase documents (4.1-4.6), following the established documentation pattern.

## Architecture Overview

### Design Principles
1. **No IMPORT keyword** -- IEC 61131-3 has no import directive. Libraries are specified via compile options and CLI flags (like gcc's `-I`)
2. **Two-tier library system** -- Built-in functions are C++ templates in the runtime; higher-level libraries are ST source compiled separately
3. **Standard functions need no AST** -- They exist only as C++ templates; the compiler just needs a registry of their signatures for type checking and name mapping
4. **Multi-file = merged ASTs** -- Multiple ST files are parsed independently, then their ASTs are merged before semantic analysis

### Sub-Phase Dependency Graph
```
4.1 (Fix Pipeline) ──────────────────────────────────────┐
       │                                                  │
       v                                                  v
4.2 (Std Registry) ──> 4.3 (Enhanced Codegen) ──> 4.4 (Multi-File) ──> 4.5 (Libraries)
                                                          │
                                                          v
                                                    4.6 (Testing)
                                                  (runs throughout)
```

---

## Phase 4.1: Fix Core Function Call Pipeline

**Goal**: Wire function calls through the full AST builder so they stop being silently dropped.

### The Blockers

**Blocker 1** -- `src/frontend/ast-builder.ts` `buildPrimaryExpression()` (line 1619):
- Checks for: literal, refExpression, drefExpression, newExpression, variable, parenthesized expression
- **Missing**: `if (children.functionCall)` -- function call expressions are dropped

**Blocker 2** -- `src/frontend/ast-builder.ts` `buildStatement()` (line 918):
- Checks for: refAssign, assignment, if, for, while, repeat, case, exit, return, externalCodePragma, delete
- **Missing**: `if (children.functionCallStatement)` -- function call statements are dropped

### Changes Required

**File: `src/frontend/ast-builder.ts`**
1. Add import of `FunctionCallExpression`, `FunctionCallStatement`, `Argument` from `./ast.js`
2. Add `buildFunctionCallExpression(node: CstNode): FunctionCallExpression` method
   - Extracts `Identifier` token for function name
   - Iterates `argumentList > argument` children
   - Calls `buildArgument()` for each
3. Add `buildArgument(node: CstNode): Argument` method
   - Checks for named argument pattern: `Identifier (Assign | OutputAssign)`
   - Sets `isOutput = true` if OutputAssign (`=>`) is used
   - Builds the value expression
4. Add `if (children.functionCall)` check in `buildPrimaryExpression()` -- **before** the `variable` check (both start with Identifier, parser disambiguates them)
5. Add `if (children.functionCallStatement)` check in `buildStatement()`

**No changes needed to**: `parser.ts`, `lexer.ts`, `ast.ts` (all already correct)

### Verification
```
ST input:  result := MyFunc(a, 10);
CST:       assignmentStatement > expression > primaryExpression > functionCall
AST:       AssignmentStatement { value: FunctionCallExpression { functionName: "MyFunc", arguments: [...] } }
C++ out:   result = MyFunc(a, 10);
```

---

## Phase 4.2: Standard Library Function Registry

**Goal**: Create a compile-time registry mapping IEC standard function names to C++ implementations so the compiler knows they exist for type checking and codegen name mapping.

### Key Insight
The C++ runtime (`src/runtime/include/iec_std_lib.hpp`, `iec_string.hpp`) already implements all standard functions as templates. The compiler just needs metadata about them -- no new C++ code is needed for most functions.

### New File: `src/semantic/std-function-registry.ts`

```typescript
export type TypeConstraint =
  | 'ANY' | 'ANY_NUM' | 'ANY_INT' | 'ANY_REAL' | 'ANY_BIT'
  | 'ANY_ELEMENTARY' | 'ANY_STRING' | 'BOOL' | 'specific';

export interface StdFunctionParam {
  name: string;
  constraint: TypeConstraint;
  specificType?: string;
  isByRef: boolean;
}

export interface StdFunctionDescriptor {
  name: string;           // IEC name (e.g., "ABS")
  cppName: string;        // C++ name (may differ for conversions)
  returnConstraint: TypeConstraint;
  returnMatchesFirstParam: boolean;
  params: StdFunctionParam[];
  isVariadic: boolean;
  minArgs?: number;
  isConversion: boolean;
  category: 'numeric' | 'trig' | 'selection' | 'comparison' |
            'bitwise' | 'bitshift' | 'conversion' | 'arithmetic' |
            'string' | 'time';
}

export class StdFunctionRegistry {
  private functions: Map<string, StdFunctionDescriptor>;

  lookup(name: string): StdFunctionDescriptor | undefined;
  isStandardFunction(name: string): boolean;
  resolveConversion(name: string): { fromType: string; toType: string; cppName: string } | undefined;
  getAll(): StdFunctionDescriptor[];
}
```

### Registration Categories

| Category | Functions | C++ Location |
|----------|-----------|--------------|
| Numeric | ABS, SQRT, LN, LOG, EXP, EXPT, TRUNC, ROUND, NEG | `iec_std_lib.hpp` |
| Trig | SIN, COS, TAN, ASIN, ACOS, ATAN, ATAN2 | `iec_std_lib.hpp` |
| Arithmetic | ADD, SUB, MUL, DIV, MOD | `iec_std_lib.hpp` |
| Selection | SEL, MAX, MIN, LIMIT, MUX, MOVE | `iec_std_lib.hpp` |
| Comparison | GT, GE, EQ, LE, LT, NE (+ chain variants) | `iec_std_lib.hpp` |
| Bitwise | NOT, AND, OR, XOR | `iec_std_lib.hpp` |
| Bit shift | SHL, SHR, ROL, ROR | `iec_std_lib.hpp` |
| Conversion | *_TO_* pattern (e.g., INT_TO_REAL -> TO_REAL) | `iec_std_lib.hpp` |
| String | LEN, LEFT, RIGHT, MID, CONCAT, INSERT, DELETE, REPLACE, FIND | `iec_string.hpp` |
| Time | TIME_FROM_MS, TIME_FROM_S, TIME_TO_MS, TIME_TO_S | `iec_std_lib.hpp` |

### Extensible (Variadic) Functions -- IEC 61131-3 Compliance

The IEC 61131-3 standard defines certain functions as "extensible" -- they accept a variable number of arguments (2 or more). This is fully supported across all layers:

**Extensible standard functions**: ADD, MUL, MAX, MIN, AND, OR, XOR, CONCAT, GT, GE, EQ, LE, LT, NE

**How each layer handles them**:

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **C++ Runtime** | C++ variadic templates (`typename... Args`) | Done in `iec_std_lib.hpp` |
| **Parser** | `argumentList` uses `AT_LEAST_ONE_SEP` -- accepts N arguments | Done |
| **AST** | `FunctionCallExpression.arguments: Argument[]` -- unbounded array | Done |
| **AST Builder** | Iterates all argument children, builds array | Phase 4.1 |
| **Codegen** | Emits `funcName(a1, a2, ..., aN)` -- C++ templates expand | Done |
| **Type Checker** | Registry has `isVariadic: true, minArgs: 2` -- validates count | Phase 4.2 |

**Example flow**: `result := ADD(5, 10, 5, 2, 3);`
```
Parser CST:   functionCall { Identifier:"ADD", argumentList { argument x5 } }
AST:          FunctionCallExpression { functionName: "ADD", arguments: [5 args] }
Type checker: Registry lookup -> ADD.isVariadic=true, ADD.minArgs=2 -> 5 >= 2 -> OK
Codegen:      ADD(IEC_INT(5), IEC_INT(10), IEC_INT(5), IEC_INT(2), IEC_INT(3))
C++ resolve:  ADD(T, T, Args...) variadic template -> recursive expansion
```

**Registry entries for extensible functions**:
```typescript
{ name: 'ADD', isVariadic: true, minArgs: 2, returnMatchesFirstParam: true,
  returnConstraint: 'ANY_NUM', category: 'arithmetic' }
{ name: 'MAX', isVariadic: true, minArgs: 2, returnMatchesFirstParam: true,
  returnConstraint: 'ANY_ELEMENTARY', category: 'selection' }
{ name: 'CONCAT', isVariadic: true, minArgs: 2, returnMatchesFirstParam: true,
  returnConstraint: 'ANY_STRING', category: 'string' }
```

**CONCAT note**: The C++ runtime currently has a 2-argument `CONCAT()`. For variadic CONCAT (e.g., `CONCAT(s1, s2, s3)`), a variadic template overload needs to be added to `iec_string.hpp` in Phase 4.2.

### Conversion Function Resolution
The `*_TO_*` pattern (e.g., `INT_TO_REAL`) is resolved dynamically via regex rather than enumerating all N*N combinations:
```typescript
resolveConversion(name: string): { fromType, toType, cppName } | undefined {
  const match = name.match(/^([A-Z_]+)_TO_([A-Z_]+)$/);
  // Validate both are elementary types
  // Return { fromType: 'INT', toType: 'REAL', cppName: 'TO_REAL' }
}
```

### String Function Note
The C++ runtime uses `DELETE_STR` instead of `DELETE` (to avoid conflict with C++ keyword). The registry maps `DELETE` -> `DELETE_STR` in codegen.

### Files to Create/Modify
- **Create**: `src/semantic/std-function-registry.ts`
- **Modify**: `src/semantic/analyzer.ts` -- instantiate registry, use during analysis
- **Modify**: `src/semantic/type-checker.ts` -- add `checkFunctionCall()` method

---

## Phase 4.3: Enhanced Codegen for Function Calls

**Goal**: Generate correct C++ for all function call variations: standard function name mapping, `*_TO_*` conversions, named argument reordering, VAR_OUTPUT parameters.

### Changes to `src/backend/codegen.ts`

1. **Accept StdFunctionRegistry** -- Constructor takes optional registry instance

2. **Enhanced `generateFunctionCallExpression()`**:
   ```
   Check order:
   1. Is it a *_TO_* conversion? -> emit TO_REAL(x), TO_INT(x), etc.
   2. Is it a standard function? -> emit directly (C++ templates handle it)
   3. Is it DELETE (string)? -> emit DELETE_STR(...)
   4. Has named arguments? -> reorder to match declaration, emit positionally
   5. Default: emit funcName(arg1, arg2, ...)
   ```

3. **Named argument reordering** -- Look up function in project model, match named args to parameter order, emit positionally

4. **VAR_OUTPUT handling in `generateFunctionParams()`** -- Add VAR_OUTPUT parameters as `T&` references (currently only handles VAR_INPUT and VAR_IN_OUT)

5. **VAR_OUTPUT capture at call site** -- When an argument has `isOutput: true` and `name`, pass the target variable by reference

### Files to Modify
- `src/backend/codegen.ts` -- Enhanced function call generation
- `src/index.ts` -- Pass StdFunctionRegistry to CodeGenerator

---

## Phase 4.4: Multi-File Compilation

**Goal**: Enable compiling multiple ST source files together with cross-file symbol resolution, plus CLI support for include paths (like `-I` in gcc).

### Extended CompileOptions (`src/types.ts`)
```typescript
export interface CompileOptions {
  // ... existing fields ...

  /** Additional ST source files to compile together */
  additionalSources?: Array<{
    source: string;
    fileName: string;
  }>;

  /** Library search paths (like -I in gcc) */
  libraryPaths?: string[];
}
```

### Compilation Flow
```
1. Parse each source file independently -> CompilationUnit[]
2. Set sourceSpan.file on each AST from fileName
3. mergeCompilationUnits() -> single CompilationUnit
4. Build project model from merged AST
5. Semantic analysis (detects duplicate definitions)
6. Codegen (produces single .hpp/.cpp pair)
```

### New File: `src/merge.ts`
```typescript
export function mergeCompilationUnits(units: CompilationUnit[]): CompilationUnit;
```
Concatenates programs, functions, FBs, types, configurations from all units. Duplicate detection is deferred to semantic analysis.

### Source File Tracking
Extend `buildAST()` to accept `fileName` parameter and propagate it to `sourceSpan.file` on all nodes. This enables error messages like `"math.st:5:3: Unknown type 'FOOBAR'"`.

### CLI Integration
The REPL/CLI binary (`src/repl/`) is extended to accept:
- Multiple `.st` file arguments
- `-L <path>` flag for library search paths (consistent with gcc conventions)

### Files to Create/Modify
- **Create**: `src/merge.ts`
- **Modify**: `src/types.ts` -- Add fields to CompileOptions
- **Modify**: `src/index.ts` -- Multi-source compilation pipeline
- **Modify**: `src/frontend/ast-builder.ts` -- Accept fileName, set on sourceSpan
- **Modify**: `src/repl/` (if exists) or CLI entry point -- Accept multiple files and `-L` flags

---

## Phase 4.5: Library System

**Goal**: Design a clean library system with two tiers: built-in C++ libraries (standard functions) and external ST libraries compiled separately.

### Library Manifest Format
Libraries are described by a JSON manifest (`*.stlib.json`):
```typescript
// New file: src/library/library-manifest.ts
export interface LibraryManifest {
  name: string;
  version: string;
  description?: string;
  namespace: string;
  functions: LibraryFunctionEntry[];
  functionBlocks: LibraryFBEntry[];
  types: LibraryTypeEntry[];
  headers: string[];       // C++ headers to #include
  isBuiltin: boolean;      // true for C++ runtime libraries
  sourceFiles?: string[];  // Original ST sources (for ST libraries)
}
```

### Two-Tier Architecture

**Tier 1: Built-in Libraries** (always available, no manifest files needed)
- The standard function registry (Phase 4.2) serves as the implicit built-in library
- C++ runtime headers are always included
- No user action required -- standard functions just work

**Tier 2: ST Libraries** (compiled from ST source, distributed as manifest + C++ output)
```
Library creation:  ST source -> compile() -> { manifest.json, lib.hpp, lib.cpp }
Library usage:     compile(source, { libraryPaths: ['/path/to/libs'] })
                   -> loader reads manifest -> registers symbols -> adds #include to codegen
```

### Library Compilation Pipeline
```typescript
// New file: src/library/library-compiler.ts
export function compileLibrary(
  sources: Array<{ source: string; fileName: string }>,
  options: { name: string; version: string; namespace: string }
): LibraryCompileResult;
```
This is essentially `compile()` but outputs a manifest instead of a program binary.

### Library Loading
```typescript
// New file: src/library/library-loader.ts
export function loadLibrary(manifestPath: string): LibraryManifest;
export function registerLibrarySymbols(manifest: LibraryManifest, symbolTables: SymbolTables): void;
```

### Integration with Codegen
When libraries are loaded, the code generator emits additional `#include` directives for library headers.

### Files to Create
- `src/library/library-manifest.ts` -- Manifest types
- `src/library/builtin-stdlib.ts` -- Built-in stdlib manifest generation
- `src/library/library-compiler.ts` -- ST library compilation
- `src/library/library-loader.ts` -- Library loading and symbol registration

### Files to Modify
- `src/index.ts` -- Library loading in compile pipeline
- `src/backend/codegen.ts` -- Library header inclusion

---

## Phase 4.6: Testing Strategy

### Test Files to Create

| File | Phase | Tests |
|------|-------|-------|
| `tests/frontend/ast-builder-functions.test.ts` | 4.1 | Function call AST building, named args, output args |
| `tests/semantic/std-function-registry.test.ts` | 4.2 | Registry lookup, conversion resolution, variadic detection |
| `tests/backend/codegen-functions.test.ts` | 4.3 | Function call codegen, named arg reordering, conversions |
| `tests/integration/multi-file.test.ts` | 4.4 | Cross-file function calls |
| `tests/integration/cpp-compile-functions.test.ts` | 4.1-4.3 | Generated C++ compiles with g++ |
| `tests/library/library-system.test.ts` | 4.5 | Library compilation, loading, symbol registration |

### Key Test Scenarios

**Phase 4.1**: Function call in expression context, function call as statement, named arguments with `:=`, output arguments with `=>`, nested function calls `f(g(x))`

**Phase 4.2**: All standard functions recognized, `INT_TO_REAL` conversion resolution, case-insensitive lookup, variadic function detection, string function registration

**Phase 4.3**: `INT_TO_REAL(x)` -> `TO_REAL(x)`, `ABS(-5)` -> `ABS(-5)` (direct passthrough), named args reordered to match declaration, `DELETE(s,l,p)` -> `DELETE_STR(s,l,p)`

**Phase 4.4**: Function defined in file A called from file B, type defined in file A used in file B, duplicate definition detection across files

**Phase 4.5**: Compile ST library, load manifest, use library functions in compilation

### C++ Compilation Integration Tests
Tests that compile generated C++ with g++ and validate output. These verify the full pipeline end-to-end including the C++ runtime templates.

---

## Implementation Sequence

| Week | Phase | Description |
|------|-------|-------------|
| 1 | 4.1 | Fix AST builder blockers (small, critical) |
| 1-2 | 4.2 | Standard function registry (parallel with 4.1 testing) |
| 2-3 | 4.3 | Enhanced codegen (depends on 4.1 + 4.2) |
| 3-4 | 4.4 | Multi-file compilation |
| 4-5 | 4.5 | Library system |
| 1-5 | 4.6 | Testing (continuous throughout) |

## Critical Files Summary

| File | Action | Phases |
|------|--------|--------|
| `src/frontend/ast-builder.ts` | Modify | 4.1, 4.4 |
| `src/semantic/std-function-registry.ts` | Create | 4.2 |
| `src/semantic/analyzer.ts` | Modify | 4.2 |
| `src/semantic/type-checker.ts` | Modify | 4.2 |
| `src/backend/codegen.ts` | Modify | 4.3, 4.5 |
| `src/types.ts` | Modify | 4.4 |
| `src/index.ts` | Modify | 4.3, 4.4, 4.5 |
| `src/merge.ts` | Create | 4.4 |
| `src/library/library-manifest.ts` | Create | 4.5 |
| `src/library/builtin-stdlib.ts` | Create | 4.5 |
| `src/library/library-compiler.ts` | Create | 4.5 |
| `src/library/library-loader.ts` | Create | 4.5 |
| `docs/implementation-phases/phase-4.1-*.md` through `phase-4.6-*.md` | Create | All |

## Verification

After full implementation:
1. `npm run build` succeeds
2. `npm test` passes with 75%+ coverage
3. User-defined functions compile end-to-end:
   ```st
   FUNCTION Square : INT
     VAR_INPUT x : INT; END_VAR
     Square := x * x;
   END_FUNCTION
   PROGRAM Main
     VAR r : INT; END_VAR
     r := Square(5);
   END_PROGRAM
   ```
4. Standard functions work: `r := ABS(-5);`, `r := INT_TO_REAL(i);`
5. Multi-file: function in `math.st` callable from `main.st`
6. Generated C++ compiles with g++ (integration tests)
