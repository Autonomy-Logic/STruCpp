# Phase 2.6: Variable Modifiers (RETAIN, CONSTANT)

**Status**: COMPLETED

**Duration**: 1-2 weeks

**Goal**: Complete implementation of variable modifiers RETAIN and CONSTANT with proper code generation

## Overview

IEC 61131-3 defines variable modifiers that affect storage and mutability:

- **CONSTANT** - Variables that cannot be modified after initialization
- **RETAIN** - Variables that preserve their values across power cycles

The lexer and parser already recognize these keywords and set AST flags (`isRetain`, `isConstant`), but the code generator does not yet use them.

## Design Decisions

### Key Architectural Choices

1. **CONSTANT uses C++ `const` qualifier** - Simple, standard C++ semantics. The `const` qualifier prevents calling `set()` on `IECVar<T>` while `get()` remains accessible.

2. **RETAIN uses static variable table** - Generate a table of retain variable metadata that the runtime can use to save/restore values. No special wrapper types needed.

3. **Semantic validation required** - CONSTANT variables must have initializers, cannot be assigned after initialization, and certain combinations are invalid.

## Scope

### Current Implementation Status

**Already Implemented:**
- Lexer tokens: `CONSTANT`, `RETAIN` (`src/frontend/lexer.ts:80-81`)
- Parser rules for VAR blocks with modifiers (`src/frontend/parser.ts:119-120`)
- AST flags: `isConstant`, `isRetain` on VarBlock (`src/frontend/ast.ts:175-176`)
- AST Builder extracts flags (`src/frontend/ast-builder.ts:722-723`)
- Symbol table stores `isRetain` on variables (`src/semantic/symbol-table.ts:58`)
- Semantic analyzer sets `kind: "constant"` for constant symbols (`src/semantic/analyzer.ts:214-217`)

**Not Implemented:**
- Code generation for CONSTANT (`const` qualifier)
- Code generation for RETAIN (variable table)
- Semantic validation (initializer required, assignment prohibited)
- Error messages for invalid modifier combinations

### Example ST Syntax

```st
VAR CONSTANT
    PI : REAL := 3.14159;
    MAX_SIZE : INT := 100;
END_VAR

VAR RETAIN
    total_count : DINT;
    last_state : BOOL;
END_VAR

VAR_GLOBAL RETAIN
    system_hours : UDINT;
END_VAR
```

## CONSTANT Implementation

### Code Generation

**ST Source:**
```st
VAR CONSTANT
    PI : REAL := 3.14159;
    MAX_SIZE : INT := 100;
END_VAR
```

**Generated C++:**
```cpp
const IEC_REAL PI{3.14159f};
const IEC_INT MAX_SIZE{100};
```

The `const` qualifier:
- Allows calling `get()` to read the value
- Prevents calling `set()` (compile-time error)
- Prevents forcing (const objects can't be modified)

### Semantic Rules

| Rule | Example | Error Message |
|------|---------|---------------|
| Must have initializer | `VAR CONSTANT x : INT; END_VAR` | "CONSTANT variable 'x' must have an initializer" |
| Cannot be assigned | `PI := 3.0;` | "Cannot assign to CONSTANT variable 'PI'" |
| VAR_OUTPUT CONSTANT invalid | `VAR_OUTPUT CONSTANT x : INT := 0; END_VAR` | "VAR_OUTPUT cannot be CONSTANT" |
| VAR_IN_OUT CONSTANT invalid | `VAR_IN_OUT CONSTANT x : INT; END_VAR` | "VAR_IN_OUT cannot be CONSTANT" |

### Valid CONSTANT Combinations

| Block Type | CONSTANT Valid? | Notes |
|------------|-----------------|-------|
| VAR | Yes | Local constant |
| VAR_INPUT | Yes | Immutable input parameter |
| VAR_OUTPUT | No | Outputs must be writable |
| VAR_IN_OUT | No | In-out must be writable |
| VAR_TEMP | Yes | Temporary constant (unusual but valid) |
| VAR_GLOBAL | Yes | Global constant |
| VAR_EXTERNAL | Depends | Inherits from referenced global |

## RETAIN Implementation

### Retain Variable Table

Generate a static table containing metadata for all retain variables. The runtime uses this table to save/restore values.

**ST Source:**
```st
PROGRAM MainProgram
VAR RETAIN
    total_count : DINT;
    last_state : BOOL;
    error_log : ARRAY[1..10] OF INT;
END_VAR
END_PROGRAM
```

**Generated C++ (Header):**
```cpp
class Program_MainProgram : public ProgramBase {
public:
    // Retain variables
    IEC_DINT total_count;
    IEC_BOOL last_state;
    Array1D<INT_t, 1, 10> error_log;

    // ... constructor, run() method ...

    // Retain variable table
    static const RetainVarInfo __retain_vars[];
    static constexpr size_t __retain_count = 3;
};
```

**Generated C++ (Source):**
```cpp
const RetainVarInfo Program_MainProgram::__retain_vars[] = {
    {"total_count", offsetof(Program_MainProgram, total_count), sizeof(IEC_DINT)},
    {"last_state", offsetof(Program_MainProgram, last_state), sizeof(IEC_BOOL)},
    {"error_log", offsetof(Program_MainProgram, error_log), sizeof(Array1D<INT_t, 1, 10>)},
};
```

### RetainVarInfo Structure

Add to runtime library:

```cpp
namespace strucpp {

/**
 * Metadata for a retain variable.
 * Used by runtime to save/restore values across power cycles.
 */
struct RetainVarInfo {
    const char* name;      // Variable name for diagnostics
    size_t offset;         // Offset from object base (for member variables)
    size_t size;           // Size in bytes for serialization
};

}  // namespace strucpp
```

Using `offsetof` instead of raw pointers allows the table to be `constexpr` and works correctly with multiple program instances.

### Runtime Integration Interface

The generated code provides the table; the runtime (Phase 6) provides the persistence:

```cpp
// Runtime interface (defined in Phase 6)
class RetainStorage {
public:
    virtual void save(const void* instance, const RetainVarInfo* vars, size_t count) = 0;
    virtual void restore(void* instance, const RetainVarInfo* vars, size_t count) = 0;
};

// Program base class can have helper methods
class ProgramBase {
public:
    virtual const RetainVarInfo* getRetainVars() const { return nullptr; }
    virtual size_t getRetainCount() const { return 0; }
};
```

### Semantic Rules

| Rule | Example | Error Message |
|------|---------|---------------|
| RETAIN + CONSTANT invalid | `VAR RETAIN CONSTANT x : INT := 0; END_VAR` | "Variable cannot be both RETAIN and CONSTANT" |
| VAR_INPUT RETAIN invalid | `VAR_INPUT RETAIN x : INT; END_VAR` | "VAR_INPUT cannot be RETAIN" |
| VAR_OUTPUT RETAIN invalid | `VAR_OUTPUT RETAIN x : INT; END_VAR` | "VAR_OUTPUT cannot be RETAIN" |
| VAR_IN_OUT RETAIN invalid | `VAR_IN_OUT RETAIN x : INT; END_VAR` | "VAR_IN_OUT cannot be RETAIN" |
| VAR_TEMP RETAIN invalid | `VAR_TEMP RETAIN x : INT; END_VAR` | "VAR_TEMP cannot be RETAIN" |

### Valid RETAIN Combinations

| Block Type | RETAIN Valid? | Notes |
|------------|---------------|-------|
| VAR | Yes | Local retain variable |
| VAR_INPUT | No | Inputs are set each cycle |
| VAR_OUTPUT | No | Outputs are computed each cycle |
| VAR_IN_OUT | No | References, not stored values |
| VAR_TEMP | No | Temporary by definition |
| VAR_GLOBAL | Yes | Global retain variable |
| VAR_EXTERNAL | No | Reference to global (global may be retain) |

## Code Generator Changes

### Variable Declaration Generation

Update the variable generation logic in `src/backend/codegen.ts`:

```typescript
private generateVarDeclaration(
  block: VarBlock,
  decl: VarDeclaration,
  name: string
): string {
  const typeName = this.mapType(decl.type);
  const constQualifier = block.isConstant ? "const " : "";
  const initializer = decl.initialValue
    ? `{${this.generateExpression(decl.initialValue)}}`
    : "";

  return `${constQualifier}${typeName} ${name}${initializer};`;
}
```

### Retain Table Generation

Add method to generate retain variable tables:

```typescript
private generateRetainTable(
  className: string,
  retainVars: Array<{name: string, typeName: string}>
): void {
  if (retainVars.length === 0) return;

  this.emitSource(`const RetainVarInfo ${className}::__retain_vars[] = {`);
  for (const v of retainVars) {
    this.emitSource(
      `    {"${v.name}", offsetof(${className}, ${v.name}), sizeof(${v.typeName})},`
    );
  }
  this.emitSource("};");
}
```

### Header Includes

Add to generated header when retain variables are present:

```cpp
#include <cstddef>  // for offsetof
#include "strucpp/retain.hpp"  // for RetainVarInfo
```

## Semantic Analyzer Changes

### Validation Rules

Add to `src/semantic/analyzer.ts`:

```typescript
private validateVarModifiers(block: VarBlock): void {
  // RETAIN + CONSTANT is invalid
  if (block.isRetain && block.isConstant) {
    this.error(block, "Variable cannot be both RETAIN and CONSTANT");
  }

  // CONSTANT requires initializer
  if (block.isConstant) {
    for (const decl of block.declarations) {
      if (!decl.initialValue) {
        this.error(decl, `CONSTANT variable '${decl.names.join(", ")}' must have an initializer`);
      }
    }
  }

  // Block type restrictions
  if (block.isConstant && (block.blockType === "VAR_OUTPUT" || block.blockType === "VAR_IN_OUT")) {
    this.error(block, `${block.blockType} cannot be CONSTANT`);
  }

  if (block.isRetain && block.blockType !== "VAR" && block.blockType !== "VAR_GLOBAL") {
    this.error(block, `${block.blockType} cannot be RETAIN`);
  }
}
```

### Assignment Validation

Check assignments don't target constants:

```typescript
private validateAssignment(target: Expression, value: Expression): void {
  const symbol = this.resolveSymbol(target);
  if (symbol?.kind === "constant") {
    this.error(target, `Cannot assign to CONSTANT variable '${symbol.name}'`);
  }
}
```

## Deliverables

### Runtime Library
- [x] Add `RetainVarInfo` struct to new `iec_retain.hpp` header
- [x] Add `getRetainVars()` and `getRetainCount()` virtual methods to `ProgramBase`

### Semantic Analyzer
- [x] Add `validateVarModifiers()` method
- [x] Validate CONSTANT + RETAIN mutual exclusion (handled at parser level - grammar uses OR)
- [x] Validate CONSTANT requires initializer
- [x] Validate block type restrictions for CONSTANT
- [x] Validate block type restrictions for RETAIN
- [ ] Validate assignments don't target constants (deferred to Phase 3 - requires expression analysis)

### Code Generator
- [x] Generate `const` qualifier for CONSTANT variables
- [x] Collect retain variables during generation
- [x] Generate `__retain_vars[]` static table
- [x] Generate `__retain_count` (via getRetainCount() override)
- [x] Override `getRetainVars()` and `getRetainCount()` in generated classes
- [x] Add necessary `#include` directives (`<cstddef>` for offsetof)

### Testing
- [x] Unit test: CONSTANT generates `const` qualifier
- [x] Unit test: CONSTANT without initializer produces error
- [ ] Unit test: Assignment to CONSTANT produces error (deferred to Phase 3)
- [x] Unit test: RETAIN generates variable table
- [x] Unit test: RETAIN + CONSTANT produces error (parser level)
- [x] Unit test: Invalid block type + CONSTANT produces error
- [x] Unit test: Invalid block type + RETAIN produces error
- [x] Integration test: Generated C++ compiles correctly
- [x] Integration test: Const variables are truly immutable (C++ const enforces this)
- [ ] Golden file tests for generated code (not implemented - existing tests sufficient)

## Success Criteria

- CONSTANT variables generate `const` qualified declarations
- CONSTANT variables without initializers produce semantic errors
- Assignments to CONSTANT variables produce semantic errors
- RETAIN variables generate static metadata tables
- Invalid modifier combinations produce clear error messages
- Generated C++ compiles without errors
- All existing tests continue to pass
- New test coverage for modifier cases

## Files to Modify

| File | Changes |
|------|---------|
| `src/runtime/include/retain.hpp` | New file: RetainVarInfo struct |
| `src/runtime/include/program_base.hpp` | Add retain accessor virtual methods |
| `src/semantic/analyzer.ts` | Add modifier validation |
| `src/backend/codegen.ts` | Generate const qualifier and retain tables |

## Notes

### Why `offsetof` Instead of Pointers

Using `offsetof` for the retain table instead of direct pointers:
1. Allows the table to be `constexpr` (compile-time constant)
2. Works correctly with multiple instances of the same program class
3. The runtime computes actual addresses: `(char*)instance + offset`

### Relationship to Other Phases

- **Phase 1**: Uses `IECVar<T>` template (const qualifier works with it)
- **Phase 2.3**: Located variables may also be RETAIN (both flags can apply)
- **Phase 6**: OpenPLC integration implements actual persistence using the retain tables
- **Phase 3**: Assignment validation prevents writing to constants

### Future Considerations

**NON_RETAIN modifier**: IEC 61131-3 also defines `NON_RETAIN` to explicitly mark variables as non-persistent. This could be added later if needed.

**Retain for Function Blocks**: Function block instances can also be RETAIN, preserving all their internal state. The same table mechanism works.

**Selective Retain**: Some systems support retaining only specific fields of a structure. This would require more granular metadata.
