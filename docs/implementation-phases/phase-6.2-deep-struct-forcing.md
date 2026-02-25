# Phase 6.2: Deep Struct Forcing (Element-Level Forcing for Composite Types)

## Problem Statement

STruC++ supports variable forcing via the `IECVar<T>` wrapper, which is essential for OpenPLC debugging. For elementary types (INT, REAL, BOOL, etc.) and elementary array elements, forcing works correctly — each `IECVar<T>` element can be independently forced from a debugger.

However, **struct fields are generated as raw C++ types** (`INT_t`, `REAL_t`, etc.), not as `IECVar<T>` wrappers. This means:

1. **Individual struct fields cannot be forced.** A debugger cannot force `my_struct.x` because `x` is a plain `INT_t` with no forcing infrastructure.
2. **Whole-struct forcing is bypassed by member access.** `IECVar<T>::operator->()` returns `&value_`, bypassing `forced_value_`. Any field access through `->` reads/writes the unforced storage.
3. **Hierarchical forcing is impossible.** Deeply nested paths like `my_array[3].outer.inner.x` cannot be forced at any intermediate or leaf level.

This gap affects the core debugging experience for any PLC program using structs.

## Current Architecture

### How struct types are generated today

```
ST:                           C++:
TYPE Point2D : STRUCT         struct Point2D {
  X : INT;          →             INT_t X{};        ← raw type, no forcing
  Y : INT;          →             INT_t Y{};        ← raw type, no forcing
END_STRUCT                    };
END_TYPE                      using IEC_Point2D = IECVar<Point2D>;
```

Source: `src/backend/type-codegen.ts`, `generateStructType()` (line 203)

### How arrays store elements

```cpp
// iec_array.hpp — elements are IECVar<T>, individually forceable
template<typename T, typename Bounds>
class IEC_ARRAY_1D {
    std::array<IECVar<T>, Bounds::size> data_;   // ← IECVar wrapper per element
};
```

For `ARRAY[1..10] OF INT`:
- `my_array[3]` returns `IECVar<INT_t>&` — **forceable** ✓
- `my_array[3].force(42)` works, `get()` respects forcing, `set()` blocked ✓

For `ARRAY[1..10] OF Point2D`:
- `my_array[3]` returns `IECVar<Point2D>&` — wrapper exists but broken
- `my_array[3]->X` calls `operator->()` which returns `&value_` — **bypasses forcing** ✗
- Cannot force `my_array[3].X` independently — `X` is raw `INT_t` ✗

### The operator-> bypass

`iec_var.hpp` line 178-179:
```cpp
template<typename U = T, std::enable_if_t<std::is_class_v<U>, int> = 0>
T* operator->() noexcept { return &value_; }  // Returns raw storage, not forced
```

Even if a whole `IECVar<Point2D>` is forced via `force({10, 20})`, subsequent access via `->X` reads/writes `value_.X`, not `forced_value_.X`. The `set()` blocking and `get()` redirection are completely bypassed.

### Components affected

| Component | File | Current Behavior |
|-----------|------|-----------------|
| Struct codegen | `src/backend/type-codegen.ts:203-252` | Fields emitted as raw `INT_t`, `REAL_t`, etc. |
| IECVar wrapper | `src/runtime/include/iec_var.hpp:177-193` | `operator->`, `operator[]`, `operator()` all bypass forcing |
| Array template | `src/runtime/include/iec_array.hpp:40-41` | Elements are `IECVar<T>` — correct for elementary types |
| Variable codegen | `src/backend/codegen.ts:2714` | After subscript, emits `->field` (uses IECVar::operator->) |
| FB class codegen | `src/backend/codegen.ts` | FB member vars emitted as raw types in class body |

## Target Behavior

After this phase, every elementary leaf field in a composite hierarchy must be individually forceable from a debugger. For example:

```st
TYPE Inner : STRUCT
  x : INT;
  y : REAL;
END_STRUCT END_TYPE

TYPE Outer : STRUCT
  inner : Inner;
  values : ARRAY[1..5] OF INT;
  flag : BOOL;
END_STRUCT END_TYPE

VAR
  data : ARRAY[1..3] OF Outer;
END_VAR
```

All of the following must be independently forceable:
- `data[1].flag` — elementary field in struct in array
- `data[2].inner.x` — nested struct elementary field
- `data[3].values[4]` — array element inside struct inside array
- `data[1].inner.y` — deeply nested REAL field

## Implementation Strategy

The core change: **struct fields of elementary types must be wrapped in `IECVar<T>`** instead of using raw types. Fields of struct/array/FB types remain as-is (they recursively contain `IECVar<T>` leaves).

### New struct generation target

```
ST:                           C++:
TYPE Point2D : STRUCT         struct Point2D {
  X : INT;          →             IECVar<INT_t> X{};     ← forceable
  Y : REAL;         →             IECVar<REAL_t> Y{};     ← forceable
END_STRUCT                    };
END_TYPE                      using IEC_Point2D = IECVar<Point2D>;
```

For nested structs:
```
TYPE Outer : STRUCT           struct Outer {
  inner : Inner;    →             Inner inner{};          ← NOT wrapped (composite)
  count : INT;      →             IECVar<INT_t> count{};  ← wrapped (elementary)
END_STRUCT                    };
END_TYPE
```

The rule: **wrap leaf types (elementary), don't wrap branch types (struct/array/FB).**

## Implementation Phases

### Phase 6.2.1: Type codegen — wrap elementary struct fields in IECVar

**File:** `src/backend/type-codegen.ts`

**Changes:**
- In `generateStructType()`, when the field type is elementary (checked via `isElementaryType()`), emit `IECVar<CppType>` instead of `CppType`
- When the field type is a struct, enum, or array (composite), emit the type name directly (no wrapping)
- Update the `IEC_TO_CPP_TYPE` mapping usage to go through `IECVar<>` for struct field context
- Handle STRING fields: `IECStringVar<N>` already has forcing support, no change needed
- Handle ARRAY fields inside structs: arrays already store `IECVar<T>` elements, no wrapping needed
- Handle POINTER TO fields: raw pointers should not be wrapped (use `IEC_Ptr<T>` which has no forcing)

**Decision matrix for field wrapping:**

| Field Type | Wrap in IECVar? | Reason |
|-----------|----------------|--------|
| Elementary (INT, REAL, BOOL, BYTE, etc.) | Yes | Leaf — needs forcing |
| STRING / WSTRING | No | `IECStringVar<N>` already has forcing |
| Enum | Yes | Leaf value — needs forcing |
| Struct (user-defined) | No | Composite — recursively contains forceable leaves |
| Array (inline or typedef) | No | `IEC_ARRAY_*D` already stores `IECVar<T>` elements |
| POINTER TO | No | Raw pointer / IEC_Ptr — forcing not applicable |
| REFERENCE TO | No | Reference semantics — forcing not applicable |
| Function Block | No | Composite — recursively contains forceable leaves |

### Phase 6.2.2: Codegen — update field access to work with IECVar-wrapped fields

**File:** `src/backend/codegen.ts`

**Changes:**
- **Remove the `->` accessor after subscript.** With wrapped fields, `array[i].X` is correct C++ because `IECVar<T>` has `operator T()` implicit conversion, and `X` is now `IECVar<INT_t>` (a class type), so `.X` accesses the field directly.
- **Update `generateAccessChain()`:** The `prevKind === "subscript"` check that emits `->` instead of `.` is no longer needed for struct field access when the field is IECVar-wrapped. After a subscript, the result is `IECVar<StructType>&`. Accessing `.fieldName` works because `IECVar<StructType>` has... wait — this needs careful analysis.

Actually, the access pattern changes fundamentally:

**Current (raw fields):**
```cpp
// POINTS[1]->X = 100;
// POINTS[1] : IECVar<Point2D>&
// operator->() returns Point2D* → ->X accesses INT_t X
```

**New (IECVar-wrapped fields):**
```cpp
// Need: POINTS[1].value_.X = 100;  — but value_ is private!
// OR: static_cast<Point2D&>(POINTS[1]).X = 100;
```

This reveals a key challenge: **`IECVar<Point2D>` wraps the entire struct, but we need to access individual IECVar fields inside it.** The implicit conversion `operator T()` returns a copy, not a reference. `operator->()` returns `T*` which gives access to the fields, but it bypasses forcing (the original problem).

**Possible solutions:**

**Option A: Remove the outer `IECVar<T>` wrapper for structs entirely.**

Instead of `IECVar<Point2D>`, just use `Point2D` directly. Since all elementary fields inside are now `IECVar<T>`, forcing happens at the leaf level. There's no need for a whole-struct `IECVar` wrapper.

```cpp
// Arrays store Point2D directly (not IECVar<Point2D>)
// IEC_ARRAY_1D would need a specialization or the array element type changes
std::array<Point2D, 10> data_;  // Direct struct, no IECVar wrapper

// Access: data_[i].X is IECVar<INT_t> — directly forceable
```

This is the cleanest approach but requires changes to:
- Array templates: store `T` directly when `T` is a struct with IECVar fields (or always store `T` and rely on IECVar being at the leaf)
- Variable declarations: use `Point2D var` instead of `IECVar<Point2D> var`
- All codegen paths that use `IEC_<TypeName>` aliases for struct types
- The `using IEC_Point2D = IECVar<Point2D>` pattern must change to `using IEC_Point2D = Point2D`

**Option B: Add a `field()` accessor to `IECVar<T>` that returns a reference to the underlying struct.**

```cpp
template<typename U = T, std::enable_if_t<std::is_class_v<U>, int> = 0>
T& fields() noexcept { return value_; }
```

And change codegen to emit `.fields().X` instead of `->X`. This still bypasses whole-struct forcing but makes it explicit. Combined with IECVar-wrapped fields inside, leaf forcing works.

**Option A is recommended** because it eliminates the confusing `IECVar<Struct>` wrapper that can never properly support forcing anyway. Structs become "transparent" containers whose elementary leaves carry the forcing infrastructure.

### Phase 6.2.3: Array template changes

**File:** `src/runtime/include/iec_array.hpp`

**Changes with Option A:**
- `IEC_ARRAY_1D` currently stores `std::array<IECVar<T>, size>`. For struct types, this should store `std::array<T, size>` directly since `T` already contains `IECVar` leaves.
- Two approaches:
  1. **Always store `T` directly** (remove the `IECVar` wrapper from arrays). Elementary types like `INT_t` would need to be stored as `IECVar<INT_t>` — but this is `T` itself since the codegen would declare `Array1D<IECVar<INT_t>, ...>` or the variable uses `IECVar<INT_t>` as the element type.
  2. **Use template specialization** or a trait to detect whether `T` already contains IECVar fields (i.e., is a struct) vs. needs wrapping (elementary type).

The simplest approach: **arrays always store `T` directly** (no extra `IECVar` wrapper), and the caller controls whether `T` is `IECVar<INT_t>` (for elementary arrays) or `Point2D` (for struct arrays where fields are already IECVar-wrapped).

```cpp
template<typename T, typename Bounds>
class IEC_ARRAY_1D {
    std::array<T, Bounds::size> data_;   // Store T directly
    // ...
    T& operator[](int64_t index) noexcept {
        return data_[to_internal_index(index)];
    }
};
```

Codegen would emit:
- `Array1D<IECVar<INT_t>, 1, 10>` for `ARRAY[1..10] OF INT` — elements are `IECVar<INT_t>`
- `Array1D<Point2D, 1, 10>` for `ARRAY[1..10] OF Point2D` — elements are `Point2D` (fields are IECVar)

### Phase 6.2.4: FB member variable changes

**File:** `src/backend/codegen.ts`

Function Block instance variables follow the same pattern as struct fields. FB class member variables that are elementary types should be emitted as `IECVar<T>` instead of raw types. FB instances (composite types) remain unwrapped.

### Phase 6.2.5: Update codegen access patterns

**File:** `src/backend/codegen.ts`

With the changes above:
- `array[i].field` uses `.` (not `->`) because array elements are the struct directly
- `struct_var.field` uses `.` and accesses `IECVar<T>` directly
- Nested access `outer.inner.x` chains through plain structs until reaching an `IECVar<T>` leaf
- IECVar's implicit `operator T()` and `operator=(T)` handle reads/writes with forcing
- Remove the `prevKind === "subscript"` → `->` logic in `generateAccessChain()`

### Phase 6.2.6: Debugger forcing API

**New file or extension:** Runtime API for hierarchical forcing.

The debugger needs a way to:
1. Enumerate forceable variables (all `IECVar<T>` instances)
2. Force/unforce by path (e.g., `"data[1].inner.x"`)
3. Read current value, forced value, and underlying value

This phase designs the API but implementation depends on the OpenPLC runtime integration (Phase 7).

### Phase 6.2.7: Update tests

- Update `tests/backend/type-codegen.test.ts` to verify IECVar-wrapped elementary fields
- Update `tests/backend/codegen-composite.test.ts` for new access patterns (`.` not `->`)
- Add forcing tests: force a struct field, verify reads return forced value, verify writes are blocked
- Add hierarchical forcing test: `array[i].struct.field` forcing chain
- Update C++ compilation integration tests

## Migration Impact

### Breaking changes to generated C++ output

1. Struct field types change from `INT_t` to `IECVar<INT_t>` — affects all struct definitions
2. Array element access patterns change (`.` instead of `->` for struct arrays)
3. `using IEC_<Name> = IECVar<Name>` changes to `using IEC_<Name> = Name` for structs
4. Struct initialization syntax may change (aggregate init for IECVar fields)

### OSCAT compatibility

OSCAT extensively uses structs with direct field access. The IECVar wrapper adds implicit conversion operators, so most arithmetic/comparison code continues to work. However:
- Aggregate initialization (`{val1, val2}`) would need to use `{IECVar<INT_t>(val1), IECVar<REAL_t>(val2)}`
- `sizeof()` changes (IECVar adds `forced_` bool and `forced_value_` overhead)
- Functions taking struct parameters by value may need updates

### Struct memory layout

Current (raw fields):
```
struct Point2D {       // 6 bytes (INT_t=2 + REAL_t=4, with padding)
    INT_t X;           // 2 bytes
    REAL_t Y;          // 4 bytes
};
```

With IECVar wrapping:
```
struct Point2D {       // ~24 bytes (each IECVar<T> = T + bool + T)
    IECVar<INT_t> X;   // 2 + 1 + 2 = 5 bytes (+ padding → 6)
    IECVar<REAL_t> Y;  // 4 + 1 + 4 = 9 bytes (+ padding → 12)
};
```

This ~4x size increase is significant for memory-constrained PLC targets. Consider:
- A compile-time flag to disable forcing (use raw types) for production builds
- A `STRUCPP_FORCE_SUPPORT` preprocessor macro that controls whether IECVar or raw types are used

## Effort Estimate

| Sub-phase | Effort | Risk |
|-----------|--------|------|
| 6.2.1: Type codegen (wrap elementary fields) | 2-3 hours | Low |
| 6.2.2: Codegen access patterns | 3-4 hours | Medium — many paths to update |
| 6.2.3: Array template changes | 2-3 hours | Medium — template specialization complexity |
| 6.2.4: FB member variables | 1-2 hours | Low — follows struct pattern |
| 6.2.5: Update codegen access | 2-3 hours | Medium — legacy path removal |
| 6.2.6: Debugger forcing API | 2-3 hours | Low — API design only |
| 6.2.7: Test updates | 3-4 hours | Low |
| **Total** | **~16-22 hours** | |

## Open Questions

1. **Should a compile-time flag disable forcing?** For production PLC builds, the 4x memory increase may be unacceptable. A `#ifdef STRUCPP_FORCE_SUPPORT` could toggle between `IECVar<T>` and raw `T` fields.
2. **How to handle struct initializer lists?** Aggregate initialization changes when fields are IECVar. May need constructor generation.
3. **Should enum fields in structs be wrapped?** Enums are leaf values and should be forceable, but `IECVar<enum class>` needs the arithmetic operators disabled.
4. **STRING fields inside structs?** `IECStringVar<N>` already has forcing. Should struct STRING fields use `IECStringVar<N>` instead of `IECString<N>`?
