# Phase 6: OSCAT Basic g++ Compilation Gaps

## Status: Pending (Next PR after transpilation pass)

This document captures the full analysis of g++ compilation failures when compiling the OSCAT Basic 335 library's transpiled C++ output. The STruC++ transpiler successfully converts all 551 ST files to C++, but the generated code has **504 g++ errors** across **20 distinct categories** when compiled with `g++ -std=c++17 -fsyntax-only`.

This analysis was performed on branch `feat/oscat-basic-compatibility` after the transpilation pass was complete.

---

## Error Summary (504 total)

| # | Category | Count | % | Root Cause |
|---|----------|-------|---|------------|
| 1 | `no matching function for call to X` | 98 | 19.4% | Missing overloads / template deduction failures |
| 2 | `use of undeclared identifier X` | 93 | 18.5% | Missing TO_TIME, TO_STRING, TO_DATE, TO_DT, TO_TOD |
| 3 | `no member named X in IECVar<Struct>` | 80 | 15.9% | Array elements wrapped in IECVar hide struct members |
| 4 | `indirection requires pointer operand` | 76 | 15.1% | `*var` emitted for POINTER TO on non-pointer IECVar |
| 5 | `incompatible pointer types assigning` | 46 | 9.1% | ADR() type mismatches (BYTE* from STRING*, DWORD* from REAL*) |
| 6 | `type X does not provide a subscript operator` | 29 | 5.8% | GVL struct access `SETUP.CHARNAMES[i]` on bare struct |
| 7 | `type X does not provide a call operator` | 24 | 4.8% | Array access `arr(i, j)` using `()` instead of `[]` + member access on array elements |
| 8 | `unknown type name X` | 17 | 3.4% | `IEC___INLINE_ARRAY_*` fallback + `IEC_CLK_PRG` program-as-type |
| 9 | `no viable conversion from int to Array*` | 10 | 2.0% | Struct fields with array type initialized to `= 0` |
| 10 | `no viable overloaded '='` | 10 | 2.0% | Assignment type mismatches |
| 11 | `invalid operands to binary expression` | 6 | 1.2% | Pointer arithmetic on IECVar pointers |
| 12 | `invalid suffix on floating constant` | 2 | 0.4% | `5e-7.0` invalid C++ literal |
| 13 | Other (5 categories, 1 each) | 5 | 1.0% | Edge cases |

---

## Detailed Root Cause Analysis

### RC-1: Missing Type Conversion Functions (93 errors)

**Problem**: OSCAT uses `TO_TIME`, `TO_STRING`, `TO_DATE`, `TO_DT`, `TO_TOD` conversion functions extensively. These are IEC 61131-3 standard but are not yet implemented in the STruC++ runtime.

**Affected functions**: `TO_TIME` (42 calls), `TO_STRING` (30 calls), `TO_DATE` (12 calls), `TO_DT` (9 calls), `TO_TOD` (7 calls)

**Generated C++ (example)**:
```cpp
// In CLK_PRG::operator()()
TX = TO_TIME(T_PLC_MS());  // error: use of undeclared identifier 'TO_TIME'

// In DATE_ADD::operator()()
DT1 = TO_DT(D);            // error: use of undeclared identifier 'TO_DT'
```

**Fix location**: `src/runtime/include/iec_std_lib.hpp`

**Required implementations**:
```cpp
// TO_TIME: Convert DWORD (milliseconds) to IEC_TIME
inline IEC_TIME TO_TIME(IEC_DWORD ms) noexcept { return IEC_TIME(ms); }
inline IEC_TIME TO_TIME(IEC_UDINT ms) noexcept { return IEC_TIME(ms); }
inline IEC_TIME TO_TIME(IEC_INT val) noexcept { return IEC_TIME(val); }

// TO_DATE: Convert DT or string to IEC_DATE
inline IEC_DATE TO_DATE(IEC_DT dt) noexcept { /* extract date portion */ }

// TO_DT: Convert DATE + TOD to DT, or from DWORD
inline IEC_DT TO_DT(IEC_DATE d) noexcept { /* date to DT */ }

// TO_TOD: Convert DT or DWORD to TOD
inline IEC_TOD TO_TOD(IEC_DT dt) noexcept { /* extract TOD portion */ }

// TO_STRING: Convert any numeric type to IECString
template<typename T>
inline IECStringVar<STRING_LENGTH> TO_STRING(T val) noexcept { /* format to string */ }
```

**Complexity**: Medium — requires implementing time/date conversion logic that matches IEC 61131-3 semantics.

---

### RC-2: No Matching Function Overloads (98 errors)

**Problem**: Several standard functions have overly restrictive template signatures that fail C++ template argument deduction when called with mixed types or IECVar-wrapped arguments.

**Affected functions and counts**:
- `SHR` — 16 calls: `SHR(IEC_DWORD, IEC_INT)` fails because template expects `SHR(T, IEC_INT)` but `T` deduction fails when first arg is a different IECVar type
- `SHL` — 10 calls: Same issue as SHR
- `MIN` — 14 calls: `MIN(T, T)` requires same type, but called with `MIN(IEC_INT, IEC_DINT)`
- `MAX` — 6 calls: Same as MIN
- `LIMIT` — 13 calls: `LIMIT(T, T, T)` requires all same type, called with mixed types like `LIMIT(0, SX, 3)` where `0` is `int`, `SX` is `IEC_INT`, `3` is `int`
- `SEL` — 6 calls: `SEL(BOOL, T, T)` same-type restriction
- `CONCAT` — 10 calls: Missing `const char*` overloads, e.g. `CONCAT("&", STR)` where first arg is a string literal
- `CODE` — 3 calls: May not exist in runtime
- `TRIM` — 2 calls: Missing or signature mismatch
- `LOWERCASE` — 2 calls: Not implemented in runtime

**Generated C++ (examples)**:
```cpp
// SHR with DWORD input and arithmetic expression as shift count
TB = SHR(SHL(IN, 31 - BIT_N), 31 - BIT_N + BIT_0);
// Template: SHR<T>(T in, IEC_INT n) — T deduction fails when
// SHL returns a different type than the second arg expects

// LIMIT with integer literals and IECVar
STATE = LIMIT(0, SX, 3);
// Template: LIMIT<T>(T mn, T in, T mx) — int vs IECVar<short>

// CONCAT with const char* literal
SEARCH = CONCAT("&", STR);
// Template requires IECString/IECStringVar, not const char*
```

**Fix location**: `src/runtime/include/iec_std_lib.hpp`, `src/runtime/include/iec_string.hpp`

**Required changes**:
1. Add mixed-type overloads for `SHR`, `SHL`, `MIN`, `MAX`, `LIMIT`, `SEL` using SFINAE to handle implicit widening
2. Add `const char*` overloads for `CONCAT`, `FIND`, `REPLACE`, `INSERT`
3. Implement `CODE(string, pos)`, `TRIM(string)`, `LOWERCASE(string)` functions
4. Consider using `std::common_type` or explicit conversion in template signatures

**Complexity**: Medium — many small overloads needed, must be careful with template deduction order.

---

### RC-3: Struct Member Access Through IECVar Wrapper (80 errors)

**Problem**: When a struct (e.g., `ESR_DATA`) is stored in an `Array1D<ESR_DATA, ...>`, the array's `operator[]` returns `IECVar<ESR_DATA>&`. The `IECVar<T>` wrapper provides `operator T()` for implicit conversion but does NOT provide `operator->()` or delegate member access. So `array[i].member` fails because `IECVar<ESR_DATA>` has no member named `TYP`, `DS`, `ADRESS`, etc.

**Affected struct types and their members**:
- `ESR_DATA` — members: `TYP` (32 accesses), `DS` (12), `ADRESS` (12), `TS` (12), `DATA` (12)
- `HOLIDAY_DATA` — members: `USE` (4), `NAME` (3), `MONTH` (3), `DAY` (2)

**Generated C++ (example)**:
```cpp
// ESR_DATA struct definition (correct):
struct ESR_DATA {
    BYTE_t TYP{};
    IECString<10> ADRESS{};
    DT_t DS{};
    TIME_t TS{};
};
using IEC_ESR_DATA = IECVar<ESR_DATA>;

// Array of ESR_DATA in FB member (correct raw type):
Array1D<ESR_DATA, 0, 3> ESR_OUT;

// Access pattern that FAILS:
ESR_OUT[CNT].TYP = 10 + TO_BYTE(S0);
// ^^^^^^^^^^^^^^^^ error: no member named 'TYP' in 'IECVar<ESR_DATA>'
// Because Array1D<ESR_DATA>::operator[] returns IECVar<ESR_DATA>&
```

**Fix options** (pick one):

**Option A: Add `operator->()` to IECVar** (recommended)
```cpp
template<typename T>
class IECVar {
    // ... existing members ...
    T* operator->() noexcept { return &value_; }
    const T* operator->() const noexcept { return &value_; }
};
```
BUT this changes `array[i].member` to require `array[i]->member` syntax. The codegen would need to emit `->` for struct array element access.

**Option B: Store raw structs in arrays, not IECVar-wrapped**
Change `Array1D` to store `T` directly (not `IECVar<T>`) when `T` is a struct type. This is the most natural fix since struct types don't need IECVar forcing semantics.

**Option C: Codegen emits explicit `.get()` unwrap**
Change codegen to detect array-of-struct access and emit `static_cast<ESR_DATA&>(ESR_OUT[CNT]).TYP` or `ESR_OUT[CNT].get().TYP`.

**Fix location**: `src/runtime/include/iec_array.hpp` (Option B) or `src/runtime/include/iec_types.hpp` + `src/backend/codegen.ts` (Options A/C)

**Complexity**: Medium — needs careful design to avoid breaking existing array semantics. Option B is cleanest but requires runtime changes.

---

### RC-4: Pointer Dereference on Non-Pointer (76 errors)

**Problem**: OSCAT uses `POINTER TO REAL` / `POINTER TO BYTE` patterns extensively for low-level memory access (e.g., `ARRAY_AVG`, `ARRAY_SORT`). The codegen emits `*var` (dereference) for POINTER TO access, but the generated C++ variable is `IECVar<float>`, not `float*`. The POINTER TO → C++ pointer mapping is incomplete.

**Breakdown**: 52 errors on `IECVar<float>`, 24 errors on `IECVar<unsigned char>`

**Generated C++ (example)**:
```cpp
// ST source: FUNCTION ARRAY_AVG : REAL
//   VAR_INPUT PT : POINTER TO REAL; SIZE : UINT; END_VAR
//   ARRAY_AVG := PT[0];  (* dereference pointer and index *)

// Generated C++ (WRONG):
IEC_REAL ARRAY_AVG(IEC_REAL PT, IEC_UINT SIZE) {
    ARRAY_AVG_result = (*PT[0]);        // error: indirection requires pointer operand
    for (I = 1; I <= STOP; I++) {
        ARRAY_AVG_result = ARRAY_AVG_result + (*PT[I]);  // same error
    }
}
```

**What it should generate**:
```cpp
REAL_t ARRAY_AVG(REAL_t* PT, UINT_t SIZE) {
    REAL_t ARRAY_AVG_result{};
    ARRAY_AVG_result = PT[0];
    for (UINT_t I = 1; I <= STOP; I++) {
        ARRAY_AVG_result = ARRAY_AVG_result + PT[I];
    }
}
```

**Required changes**:
1. **Parser/AST**: Ensure `POINTER TO <type>` is parsed and stored in the AST's TypeReference (may already be partially handled with REF_TO)
2. **Codegen type mapping**: Map `POINTER TO REAL` → `REAL_t*` (raw pointer), `POINTER TO BYTE` → `BYTE_t*`
3. **Codegen expressions**: When accessing through a pointer type, emit `PT[i]` directly without `*` wrapper, or emit `*(PT + i)` correctly
4. **ADR() function**: Map to `&` (address-of operator) — already partially implemented but type mismatches remain

**Fix location**: `src/frontend/ast.ts`, `src/backend/codegen.ts`, `src/backend/type-codegen.ts`

**Complexity**: High — requires POINTER TO support through the full pipeline (parser → AST → semantic → codegen). This is part of Phase 6.1 in the CODESYS compatibility plan.

---

### RC-5: Incompatible Pointer Type Assignments (46 errors)

**Problem**: OSCAT uses `ADR()` to get byte-level pointers to strings and other types for low-level manipulation. The codegen maps `ADR(x)` to `&(x)`, but the resulting pointer type doesn't match the expected type.

**Patterns**:
- `IEC_BYTE*` from `IECStringVar<N>*` (19 errors) — `ADR(some_string)` assigned to `POINTER TO BYTE`
- `IEC_DWORD*` from `IEC_REAL*` (7 errors) — `ADR(some_real)` for bit-level manipulation
- `IEC_BYTE*` from `IECStringVar<20>*` (3 errors), `IECStringVar<10>*` (3 errors), etc.

**Generated C++ (example)**:
```cpp
// ST: PT : POINTER TO BYTE;  BIN : STRING;
//     PT := ADR(BIN);
IEC_BYTE* PT;
PT = &(BIN);  // error: incompatible pointer types assigning to
              // 'IEC_BYTE*' from 'IECStringVar<STRING_LENGTH>*'
```

**What it should generate**:
```cpp
BYTE_t* PT;
PT = reinterpret_cast<BYTE_t*>(&BIN);
// Or: PT = BIN.data();  // if IECString exposes raw byte access
```

**Fix**: ADR() codegen needs to emit `reinterpret_cast<target_type*>(&expr)` when the target pointer type differs from the source expression type. This requires knowing the target type at the assignment site, which means the codegen for assignment statements needs to detect pointer-type mismatches.

**Fix location**: `src/backend/codegen.ts` (ADR/address-of expression generation, assignment statements)

**Complexity**: Medium — tied to RC-4 (POINTER TO support).

---

### RC-6: GVL Struct Subscript Access (29 errors)

**Problem**: OSCAT defines Global Variable Lists (GVLs) as struct types containing array members. Functions access these as `SETUP.CHARNAMES[i]`. The generated C++ creates `CONSTANTS_SETUP SETUP;` as a bare struct, but `SETUP` is a `VAR_GLOBAL` instance. Functions reference the global directly, but since it's a bare struct (not `IECVar<CONSTANTS_SETUP>`), accessing members works. However, the subscript access fails because the codegen treats `SETUP.CHARNAMES` as an expression that should use `()` not `[]`.

**Actually**: Looking more carefully, the error says "type 'CONSTANTS_SETUP' does not provide a subscript operator" which means the codegen is generating `SETUP[I].CHARNAMES` (subscripting the struct itself) instead of `SETUP.CHARNAMES[I]` (subscripting the array member). This is likely a codegen issue where multi-level member + subscript access is emitted incorrectly.

**Generated C++ (example)**:
```cpp
// ST: POS := FIND(SETUP[I].CHARNAMES, SEARCH);
POS = FIND(SETUP[I].CHARNAMES, SEARCH);
// error: type 'CONSTANTS_SETUP' does not provide a subscript operator
// The `[I]` is being applied to SETUP instead of CHARNAMES
```

**What it should generate**:
```cpp
POS = FIND(SETUP.CHARNAMES[I], SEARCH);
```

**Root cause**: The ST source uses `SETUP[I].CHARNAMES` where `SETUP` is the GVL constant struct and `[I]` is an index into the `LANGUAGE` array member. But the parser/codegen is misinterpreting the access chain. Actually looking at `CONSTANTS_LOCATION` which has `LANGUAGE : ARRAY[1..5] OF INT`, the ST code `SETUP[I].CHARNAMES` doesn't make sense for SETUP type — it should be `SETUP.CHARNAMES[I]`. The ST source itself may use a different syntax pattern that's being mis-parsed.

**Further investigation needed**: Read the original ST source for functions like `CHARCODE` and `CHARNAME` to see how they actually access GVL struct members with array subscripts.

**Fix location**: `src/backend/codegen.ts` (member access + array index expression generation)

**Complexity**: Medium — need to understand the exact CST/AST structure for chained member+subscript access.

---

### RC-7: Array Call Operator vs Subscript (24 errors)

**Problem**: Two distinct issues are merged in this category:

**7a.** 2D array access `arr(i, j)` — The codegen emits `ESR_OUT(CNT, 0)` for 2D array indexing, but `Array1D` doesn't have a call operator `operator()`. Actually, `ESR_OUT` is 1D (`Array1D<ESR_DATA, 0, 3>`) and the `(CNT, 0)` is trying to access it as 2D. This is a codegen bug where the dot-chained access `ESR_OUT[CNT].DATA` is being miscompiled as `ESR_OUT(CNT, 0).DATA`.

**Generated C++ (example)**:
```cpp
ESR_OUT(CNT, 0).DATA = BYTE_OF_DWORD((*P0), static_cast<IEC_BYTE>(0));
// error: type 'Array1D<ESR_DATA, 0, 3>' does not provide a call operator
```

**7b.** `CONSTANTS_LANGUAGE` struct used with call operator (8 errors):
```cpp
LANGUAGE[I].WEEKDAYS  // or similar
// error: type 'CONSTANTS_LANGUAGE' does not provide a call operator
```
Same GVL access chain confusion as RC-6.

**Fix location**: `src/backend/codegen.ts` (expression code generation for chained access)

---

### RC-8: Unknown Inline Array Types (17 errors)

**Problem**: Two distinct sub-issues:

**8a. `IEC___INLINE_ARRAY_*` fallback (15 errors)**:

When a function block has a member declared as `ARRAY[0..n] OF DWORD` where `n` is a `VAR CONSTANT` (not an integer literal), the AST builder's `extractIntegerFromExpression()` cannot resolve the constant reference. It falls back to the synthetic type name `__INLINE_ARRAY_DWORD`, and the codegen emits `IEC___INLINE_ARRAY_DWORD` which doesn't exist.

**Affected FB members**:
```
FIFO_16:   FIFO : ARRAY[0..15] OF DWORD   → IEC___INLINE_ARRAY_DWORD  (4 errors)
FIFO_32:   FIFO : ARRAY[0..31] OF DWORD   → IEC___INLINE_ARRAY_DWORD  (4 errors)
STACK_16:  STACK : ARRAY[0..15] OF DWORD  → IEC___INLINE_ARRAY_DWORD  (4 errors)
STACK_32:  STACK : ARRAY[0..31] OF DWORD  → IEC___INLINE_ARRAY_DWORD  (4 errors)
LIST_NEXT: PT/PO : POINTER TO ARRAY OF BYTE → IEC___INLINE_ARRAY_BYTE (3 errors — also RC-4)
```

The bounds ARE integer literals in these cases (0..15, 0..31), so the issue is likely that `extractIntegerFromExpression()` isn't being called for FB member variable declarations, only for function parameter declarations. **Needs investigation**: check whether the `arrayDimensions`/`elementTypeName` fields are populated for FB `VAR` block inline arrays.

**8b. `IEC_CLK_PRG` — Program used as type (2 errors)**:

`CLK_PRG` is defined as a `PROGRAM` in OSCAT, but two FBs reference it as a local variable type (`VAR CLK : CLK_PRG; END_VAR`). The codegen emits `IEC_CLK_PRG` which doesn't exist as a type alias. Programs aren't types in standard IEC 61131-3 but CODESYS allows instantiating them. This requires either:
- Generating program classes (like FB classes) that can be instantiated
- Or treating programs-as-types in the type mapper

**Fix location**: `src/frontend/ast-builder.ts` (8a), `src/backend/codegen.ts` + `src/backend/type-codegen.ts` (8a + 8b)

**Complexity**: 8a is Low (fix dimension extraction for FB members), 8b is Medium (programs-as-types).

---

### RC-9: Array Field Initialization with Integer (10 errors)

**Problem**: Struct fields of array type are initialized with `= 0` in the generated C++ header, but `Array1D<T, Lower, Upper>` and `Array2D<...>` have no conversion constructor from `int`.

**Generated C++ (example)**:
```cpp
struct CONSTANTS_LANGUAGE {
    INT_t DEFAULT = 1;
    Array2D<IECString<254>, 1, 3, 1, 7> WEEKDAYS = 0;  // error: no viable conversion
    Array1D<INT_t, 1, 5> LANGUAGE = 0;                   // error: no viable conversion
};
```

**What it should generate**:
```cpp
struct CONSTANTS_LANGUAGE {
    INT_t DEFAULT = 1;
    Array2D<IECString<254>, 1, 3, 1, 7> WEEKDAYS{};  // value-initialize (zeros)
    Array1D<INT_t, 1, 5> LANGUAGE{};                   // value-initialize (zeros)
};
```

**Fix**: In `type-codegen.ts`, when generating struct field initializers, detect array types and emit `{}` instead of `= 0`.

**Fix location**: `src/backend/type-codegen.ts` (struct field initialization)

**Complexity**: Low — simple conditional in initializer generation.

---

### RC-10: Assignment Type Mismatches (10 errors)

**Problem**: `no viable overloaded '='` errors occur when assigning between incompatible IECVar types (e.g., assigning string to byte, or complex struct assignments). These cascade from other issues (RC-3, RC-5) — fixing those will likely resolve most of these.

---

### RC-11: Invalid Operands to Binary Expression (6 errors)

**Problem**: Pointer arithmetic on IECVar pointers — e.g., `IEC_BYTE* + IEC_DWORD` fails because the addition operand is `IECVar<unsigned int>`, not a raw integer. Cascades from RC-4/RC-5 (POINTER TO support).

---

### RC-12: Invalid Float Literal Suffix (2 errors)

**Problem**: OSCAT source contains the ST literal `5E-7` which gets codegen'd as part of a larger expression `5e-7.0`. The `.0` suffix from an adjacent REAL literal merges with the exponent form.

**Generated C++**:
```cpp
I = (IN + IN_LAST) * 5e-7.0 * KI * TC + I;
// error: invalid suffix '.0' on floating constant
```

**What it should generate**:
```cpp
I = (IN + IN_LAST) * 5e-7 * KI * TC + I;
// Or: I = (IN + IN_LAST) * 5.0e-7 * KI * TC + I;
```

**Root cause**: The codegen's numeric literal formatter appends `.0` to ensure REAL type, but this conflicts with scientific notation that already has a decimal indicator (the `e`).

**Fix**: In codegen literal generation, check if the number string already contains `e` or `E` before appending `.0`.

**Fix location**: `src/backend/codegen.ts` (numeric literal generation)

**Complexity**: Low — simple regex check.

---

### RC-13: Miscellaneous (5 errors, 1 each)

- `non-object type is not assignable` — cascades from pointer issues
- `comparison between pointer and integer` — cascades from pointer issues
- `cannot increment value of type` — `FIND(str, pattern)++` where FIND returns a function type, not a value
- `cannot convert X to Y without conversion operator` — cascades from type system issues
- `no matching conversion for static_cast` — explicit cast to incompatible IECVar type

---

## Recommended Implementation Order

### Phase 6.A — Quick Wins (14 errors, ~1 hour)
1. **RC-9**: Array field init `= 0` → `= {}` (10 errors)
2. **RC-12**: Float literal `5e-7.0` fix (2 errors)
3. **RC-8b**: Forward-declare `CLK_PRG` program class (2 errors)

### Phase 6.B — Runtime Function Overloads (191 errors, ~4 hours)
1. **RC-1**: Implement `TO_TIME`, `TO_DATE`, `TO_DT`, `TO_TOD`, `TO_STRING` (93 errors)
2. **RC-2**: Add mixed-type overloads for SHR/SHL/MIN/MAX/LIMIT/SEL/CONCAT/CODE/TRIM/LOWERCASE (98 errors)

### Phase 6.C — IECVar Struct Member Access (80 errors, ~2 hours)
1. **RC-3**: Fix struct member access through IECVar wrapper — either add `operator->()` to IECVar or change Array1D to store raw structs

### Phase 6.D — POINTER TO Support (122 errors, ~6 hours)
1. **RC-4**: Full POINTER TO pipeline — parser, AST, type mapping, codegen (76 errors)
2. **RC-5**: ADR() with reinterpret_cast for cross-type pointer assignment (46 errors)

### Phase 6.E — Expression Codegen Fixes (53 errors, ~3 hours)
1. **RC-6**: Fix GVL struct + array member subscript chain (29 errors)
2. **RC-7**: Fix 2D vs 1D array access and chained member access (24 errors)

### Phase 6.F — Inline Array Fallback (15 errors, ~1 hour)
1. **RC-8a**: Fix `extractIntegerFromExpression()` for FB member inline arrays

### Phase 6.G — Cascading Fixes (~21 errors, verify after above)
1. **RC-10**, **RC-11**, **RC-13**: Should be mostly resolved by fixes in phases A-F

---

## Files Requiring Changes

| File | Phases | Description |
|------|--------|-------------|
| `src/runtime/include/iec_std_lib.hpp` | B | TO_* conversions, mixed-type overloads |
| `src/runtime/include/iec_string.hpp` | B | const char* CONCAT/FIND overloads, TRIM, LOWERCASE |
| `src/runtime/include/iec_types.hpp` | C | IECVar operator->() for struct types |
| `src/runtime/include/iec_array.hpp` | C | Possibly change element storage for struct types |
| `src/backend/codegen.ts` | A, D, E, F | Literal format, POINTER TO, expression chains |
| `src/backend/type-codegen.ts` | A | Array field init = {} |
| `src/frontend/ast.ts` | D | POINTER TO in TypeReference |
| `src/frontend/ast-builder.ts` | D, F | POINTER TO parsing, inline array bounds |
| `src/semantic/analyzer.ts` | D | POINTER TO type checking |

---

## Testing Strategy

Each sub-phase should be verified with:
1. `npm run build` — TypeScript compiles
2. `npm test` — no regression in existing 1126 tests
3. `npx vitest run tests/integration/oscat-gpp-compile.test.ts` — error count decreases
4. `npx vitest run tests/integration/st-validation.test.ts` — more OSCAT E2E tests pass

The OSCAT g++ test currently caps at 200 errors (`-ferror-limit=200`). To see the full 504, use `-ferror-limit=1000`.

---

## Relationship to Existing Plans

This work overlaps with the **Phase 6 CODESYS Compatibility** plan (`docs/implementation-phases/phase-6.1-pointer-to.md`):
- **RC-4/RC-5** (POINTER TO) = Phase 6.1
- **RC-8b** (programs-as-types) = CODESYS extension
- **RC-1** (TO_TIME etc.) = standard IEC functions not yet in runtime
- **RC-2** (function overloads) = runtime completeness

The OSCAT gaps provide a concrete, testable target for Phase 6 work. Each fix can be validated against the OSCAT g++ compilation test.
