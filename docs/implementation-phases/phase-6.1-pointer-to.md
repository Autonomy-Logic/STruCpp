# Phase 6.1: POINTER TO Type System

## Goal

Enable the 74 OSCAT files that use `POINTER TO` to compile and generate valid C++.

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| Lexer: POINTER token | Done | Already in `keywordTokens[]` and `allTokens[]` |
| Parser: `dataType` rule | Done | Accepts `POINTER TO Identifier` |
| Parser: `varDeclaration` | Done | Accepts `POINTER TO ARRAY[...] OF T` |
| AST: `ReferenceKind` | Done | Includes `"pointer_to"` |
| AST: `TypeReference` | Done | `referenceKind` field populated |
| AST builder: `buildTypeReference` | Done | Detects POINTER token, sets `pointer_to` |
| AST builder: `buildVarDeclaration` | Done | Propagates `pointer_to` for POINTER TO ARRAY |
| Codegen: `mapTypeRefToCpp` | Done | `pointer_to` → appends `*` to base type |
| Codegen: `ADR()` | Done | `ADR(x)` → `&(x)` |
| Codegen: `^` dereference | Done | `expr.isDereference` → `(*expr)` |
| Type codegen: struct fields | Done | Pointer fields emit `T* name = nullptr;` |
| **Codegen: function local vars** | **MISSING** | VAR blocks in FUNCTIONs are not emitted as C++ locals |
| **Semantic: pointer validation** | **MISSING** | No type checking for pointer ops |

## OSCAT Usage Patterns

From the 74 POINTER TO files:

```st
(* Pattern 1: Pointer to array — most common (41 files) *)
FUNCTION ARRAY_AVG : REAL
VAR_INPUT
  pt : POINTER TO ARRAY[0..32000] OF REAL;
  size : UINT;
END_VAR
VAR
  i : UINT;
  stop : UINT;
END_VAR
  pt := ADR(some_array);
  result := pt^[0];
  FOR i := 1 TO stop DO
    result := result + pt^[i];
  END_FOR;

(* Pattern 2: Pointer to scalar — type punning (15 files) *)
FUNCTION CHK_REAL : BYTE
VAR
  pt : POINTER TO DWORD;
END_VAR
  pt := ADR(X);
  tmp := ROL(pt^, 1);

(* Pattern 3: Pointer to byte — string buffer manipulation (18 files) *)
FUNCTION BIN_TO_BYTE : BYTE
VAR
  pt : POINTER TO BYTE;
END_VAR
  pt := ADR(bin);
  x := pt^;
```

Key observations:
- All 74 files are **FUNCTIONs** (not FBs or PROGRAMs)
- Pointers are always in **VAR** (local) blocks, never VAR_INPUT
- All use `ADR()` to obtain pointers and `^` to dereference
- Array pointers always use subscript after dereference: `pt^[i]`

## Implementation Steps

### Step 1: Emit function local variables as C++ locals

**File:** `src/backend/codegen.ts` — `generateFunctionImplementation()`

Currently, function codegen only emits parameters (VAR_INPUT, VAR_IN_OUT, VAR_OUTPUT) and the result variable. VAR and VAR_TEMP blocks are silently dropped.

**Change:** After emitting `retType funcName_result;`, iterate over `func.varBlocks` and emit any `VAR` / `VAR_TEMP` declarations as local C++ variables:

```typescript
// After: this.emit(`    ${retType} ${func.name}_result;`);
// Add:
for (const block of func.varBlocks) {
  if (block.blockType === "VAR" || block.blockType === "VAR_TEMP") {
    for (const decl of block.declarations) {
      const cppType = this.mapTypeRefToCpp(decl.type);
      for (const name of decl.names) {
        if (decl.initialValue) {
          const initExpr = this.generateExpression(decl.initialValue);
          this.emit(`    ${cppType} ${name} = ${initExpr};`);
        } else if (decl.type.referenceKind === "pointer_to") {
          this.emit(`    ${cppType} ${name} = nullptr;`);
        } else {
          this.emit(`    ${cppType} ${name}{};`);
        }
      }
    }
  }
}
```

Also call `enterScope(func.varBlocks)` before generating statements so that `currentScopeVarTypes` is populated (needed for bit access, member mangling, type inference).

This must be done in both the production build path AND the test build `_real` path.

**Impact:** Fixes ALL 74 OSCAT POINTER TO files AND any other functions with local variables (which currently compile to C++ but the locals silently vanish — a latent bug for non-pointer locals too).

### Step 2: Add `enterScope` call for functions

**File:** `src/backend/codegen.ts` — `generateFunctionImplementation()`

Functions currently don't call `enterScope()`, so `currentScopeVarTypes` is empty during function body generation. This means type inference, bit access, and member mangling don't work inside functions.

Add `this.enterScope(func.varBlocks)` before `generateStatements(func.body)` and `this.exitScope()` after.

### Step 3: Initialize pointer locals to nullptr

**File:** `src/backend/codegen.ts`

When emitting local variables (Step 1), pointer types should initialize to `nullptr` instead of `{}` to avoid C++ compilation warnings. This is already shown in Step 1's code snippet above.

### Step 4: Integration tests

**File:** `tests/integration/cpp-compile.test.ts` (or `st-validation.test.ts`)

Add tests that compile with g++:

1. **Function with POINTER TO scalar:**
   ```st
   FUNCTION TestPtr : INT
   VAR_INPUT x : INT; END_VAR
   VAR pt : POINTER TO INT; END_VAR
     pt := ADR(x);
     TestPtr := pt^;
   END_FUNCTION
   ```

2. **Function with POINTER TO ARRAY:**
   ```st
   FUNCTION SumArr : REAL
   VAR_INPUT
     pt : POINTER TO ARRAY[0..99] OF REAL;
     count : INT;
   END_VAR
   VAR i : INT; sum : REAL; END_VAR
     sum := 0.0;
     FOR i := 0 TO count - 1 DO
       sum := sum + pt^[i];
     END_FOR;
     SumArr := sum;
   END_FUNCTION
   ```

3. **Function with local non-pointer VAR** (regression test for existing latent bug):
   ```st
   FUNCTION Calc : INT
   VAR_INPUT a : INT; b : INT; END_VAR
   VAR temp : INT; END_VAR
     temp := a + b;
     Calc := temp * 2;
   END_FUNCTION
   ```

### Step 5 (optional, post-merge): Semantic validation

**File:** `src/semantic/analyzer.ts`

Low priority — add warnings/errors for:
- Dereferencing non-pointer variables
- Assigning non-ADR values to pointer variables
- Pointer arithmetic (not supported in IEC 61131-3)

This is optional because OSCAT code is well-formed and doesn't need semantic guardrails to compile correctly.

## Effort Estimate

| Step | Effort | Priority |
|------|--------|----------|
| Step 1: Function local vars | ~30 min | Critical |
| Step 2: enterScope for functions | ~5 min | Critical |
| Step 3: nullptr init | Included in Step 1 | Critical |
| Step 4: Integration tests | ~20 min | High |
| Step 5: Semantic validation | ~1 hour | Low (post-merge) |

**Total critical path: ~1 hour**

## Risk Assessment

- **Low risk**: Steps 1-3 are additive — they emit new C++ code that was previously missing. No existing behavior changes.
- **Regression risk**: Emitting function locals could theoretically shadow parameters if names collide. However, IEC 61131-3 forbids this (VAR and VAR_INPUT names must be unique), and the semantic analyzer already enforces it.
- **The latent bug**: Functions with VAR locals (non-pointer) currently "work" only because the variables happen to be unused or the C++ compiler optimizes them out. Any function that actually uses a VAR local for intermediate computation is already broken. Step 1 fixes this for all types, not just pointers.
