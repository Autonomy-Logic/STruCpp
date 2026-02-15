# Phase 5.3: IEC 61131-3 Standard Function Block Library

**Status**: COMPLETE
**Duration**: 2-3 weeks
**Goal**: Provide all IEC 61131-3 standard function blocks as a compiled ST library using the library system from Phase 4.5

**Prerequisites**: Phase 5.1 (FB Instances and Invocations) must be completed. Phase 5.2 (OOP) is not required -- standard FBs use only basic FB features.

## Overview

The IEC 61131-3 standard defines a set of standard function blocks for common automation tasks: timers, counters, edge detection, and bistable latches. Rather than hardcoding these into the compiler, this phase implements them as a **compiled ST library** using the library system from Phase 4.5.

### Strategy: Library, Not Built-in

Standard function blocks are intentionally **not** built into the compiler core. Instead:

1. The standard FBs are written as plain Structured Text source files
2. They are compiled into a library using the Phase 4.5 library compiler (`compileLibrary()`)
3. The library is bundled with the compiler distribution and auto-loaded
4. Users can also load custom FB libraries the same way

This strategy provides:
- **Separation of concerns** -- compiler core vs. library code
- **Inspectability** -- users can read the ST source for standard FBs
- **Extensibility** -- same mechanism for standard and custom libraries
- **Maintainability** -- update standard FBs without changing the compiler

### Exception: Low-Level Built-in Functions

Some functions **cannot** be written in ST and must be built into the C++ runtime:
- Type conversion functions (`*_TO_*`) -- require C++ template specialization
- `TIME()` -- requires runtime system clock access (returns absolute runtime time, CODESYS-compatible)
- Math functions (SIN, COS, etc.) -- require C++ `<cmath>`

These are already handled by the Phase 4.2 standard function registry and the C++ runtime headers. Standard FBs can freely call these built-in functions.

## Standard Function Blocks

### Category 1: Edge Detection

Simple, stateless-pattern FBs. Can be written entirely in ST.

| FB | Description | Inputs | Outputs | Internal |
|----|-------------|--------|---------|----------|
| **R_TRIG** | Rising edge detector | CLK: BOOL | Q: BOOL | M: BOOL (RETAIN) |
| **F_TRIG** | Falling edge detector | CLK: BOOL | Q: BOOL | M: BOOL (RETAIN) |

**Source** (from IEC 61131-3 standard, matches MatIEC `edge_detection.txt`):
```st
FUNCTION_BLOCK R_TRIG
  VAR_INPUT CLK: BOOL; END_VAR
  VAR_OUTPUT Q: BOOL; END_VAR
  VAR RETAIN M: BOOL; END_VAR
  Q := CLK AND NOT M;
  M := CLK;
END_FUNCTION_BLOCK

FUNCTION_BLOCK F_TRIG
  VAR_INPUT CLK: BOOL; END_VAR
  VAR_OUTPUT Q: BOOL; END_VAR
  VAR RETAIN M: BOOL; END_VAR
  Q := NOT CLK AND NOT M;
  M := NOT CLK;
END_FUNCTION_BLOCK
```

### Category 2: Bistable Latches

| FB | Description | Inputs | Outputs |
|----|-------------|--------|---------|
| **SR** | Set-dominant latch | S1, R: BOOL | Q1: BOOL |
| **RS** | Reset-dominant latch | S, R1: BOOL | Q1: BOOL |

```st
FUNCTION_BLOCK SR
  VAR_INPUT S1, R : BOOL; END_VAR
  VAR_OUTPUT Q1 : BOOL; END_VAR
  Q1 := S1 OR ((NOT R) AND Q1);
END_FUNCTION_BLOCK

FUNCTION_BLOCK RS
  VAR_INPUT S, R1 : BOOL; END_VAR
  VAR_OUTPUT Q1 : BOOL; END_VAR
  Q1 := (NOT R1) AND (S OR Q1);
END_FUNCTION_BLOCK
```

### Category 3: Counters

Counters use FB composition (contain R_TRIG instances internally for edge detection).

| FB | Description | Inputs | Outputs | Variants |
|----|-------------|--------|---------|----------|
| **CTU** | Up counter | CU, R: BOOL; PV: INT | Q: BOOL; CV: INT | CTU_DINT, CTU_LINT, CTU_UDINT, CTU_ULINT |
| **CTD** | Down counter | CD, LD: BOOL; PV: INT | Q: BOOL; CV: INT | CTD_DINT, CTD_LINT, CTD_UDINT, CTD_ULINT |
| **CTUD** | Up-down counter | CU, CD, R, LD: BOOL; PV: INT | QU, QD: BOOL; CV: INT | CTUD_DINT, CTUD_LINT, CTUD_UDINT, CTUD_ULINT |

**CTU example** (demonstrates FB composition):
```st
FUNCTION_BLOCK CTU
  VAR_INPUT
    CU : BOOL;
    R : BOOL;
    PV : INT;
  END_VAR
  VAR_OUTPUT
    Q : BOOL;
    CV : INT;
  END_VAR
  VAR
    CU_T: R_TRIG;    (* FB composition -- edge detector instance *)
  END_VAR
  CU_T(CLK := CU);   (* Call nested FB *)
  IF R THEN CV := 0;
  ELSIF CU_T.Q AND (CV < PV)
    THEN CV := CV + 1;
  END_IF;
  Q := (CV >= PV);
END_FUNCTION_BLOCK
```

### Category 4: Timers

Timers require access to the current system time. In the MatIEC implementation, this is done via a compiler pragma (`{__SET_VAR(data__->,CURRENT_TIME,,__CURRENT_TIME)}`). STruC++ uses a built-in `TIME()` function instead, matching CODESYS behavior. `TIME()` returns the absolute time for the runtime (elapsed time since the runtime started). Timer FBs call `TIME()` from pure ST, and the C++ runtime provides the implementation. This keeps the library pure ST and decoupled from runtime specifics.

| FB | Description | Inputs | Outputs |
|----|-------------|--------|---------|
| **TP** | Pulse timer | IN: BOOL; PT: TIME | Q: BOOL; ET: TIME |
| **TON** | On-delay timer | IN: BOOL; PT: TIME | Q: BOOL; ET: TIME |
| **TOF** | Off-delay timer | IN: BOOL; PT: TIME | Q: BOOL; ET: TIME |

**TON example** (state machine implementation):
```st
FUNCTION_BLOCK TON
  VAR_INPUT
    IN : BOOL;
    PT : TIME;
  END_VAR
  VAR_OUTPUT
    Q : BOOL := FALSE;
    ET : TIME := T#0s;
  END_VAR
  VAR
    STATE : SINT := 0;
    PREV_IN : BOOL := FALSE;
    CURRENT_TIME, START_TIME : TIME;
  END_VAR

  CURRENT_TIME := TIME();

  IF ((STATE = 0) AND NOT(PREV_IN) AND IN) THEN
    STATE := 1;
    Q := FALSE;
    START_TIME := CURRENT_TIME;
  ELSE
    IF (NOT(IN)) THEN
      ET := T#0s;
      Q := FALSE;
      STATE := 0;
    ELSIF (STATE = 1) THEN
      IF ((START_TIME + PT) <= CURRENT_TIME) THEN
        STATE := 2;
        Q := TRUE;
        ET := PT;
      ELSE
        ET := CURRENT_TIME - START_TIME;
      END_IF;
    END_IF;
  END_IF;

  PREV_IN := IN;
END_FUNCTION_BLOCK
```

### Category 5: Analog/Advanced (Optional)

These are defined in the IEC standard but not universally implemented. They can be added as a separate library or deferred.

| FB | Description | Notes |
|----|-------------|-------|
| **DERIVATIVE** | Derivative function | Uses REAL math and TIME |
| **INTEGRAL** | Integral function | Uses REAL math and TIME |
| **PID** | PID controller | Composes INTEGRAL + DERIVATIVE |
| **HYSTERESIS** | Hysteresis comparator | Pure REAL comparison |
| **RAMP** | Ramp generator | Uses TIME |
| **RTC** | Real-time clock | Needs DATE_AND_TIME |
| **SEMA** | Semaphore | Simple BOOL logic |

These demonstrate FB composition (PID uses INTEGRAL and DERIVATIVE internally) and can serve as validation that the library system handles complex FB hierarchies.

## Library Structure

### File Organization

```
src/stdlib/
  iec-standard-fb/
    edge_detection.st       # R_TRIG, F_TRIG
    bistable.st             # SR, RS
    counter.st              # CTU, CTD, CTUD (+ type variants)
    timer.st                # TP, TON, TOF
    analog.st               # DERIVATIVE, INTEGRAL, PID, HYSTERESIS, RAMP (optional)
    utility.st              # RTC, SEMA (optional)
```

### Compilation Pipeline

The standard FB library is compiled at **build time** (during `npm run build`) and bundled with the compiler:

```
1. npm run build
   -> tsc compiles TypeScript
   -> build script compiles src/stdlib/iec-standard-fb/*.st
   -> outputs dist/stdlib/iec-standard-fb.stlib.json (manifest)
   -> outputs dist/stdlib/iec_std_fb.hpp
   -> outputs dist/stdlib/iec_std_fb.cpp

2. When user runs: strucpp main.st
   -> compiler auto-loads dist/stdlib/iec-standard-fb.stlib.json
   -> registers TON, TOF, TP, CTU, CTD, etc. in symbol table
   -> user code can use standard FBs without any import
```

### Auto-Loading

The standard FB library is **always loaded** (like the built-in standard functions from Phase 4.2). The compiler checks for the bundled manifest at startup and registers all FB symbols. User code can reference `TON`, `CTU`, etc. without any import directive.

```typescript
// In compile pipeline (src/index.ts)
function compile(source: string, options: CompileOptions): CompileResult {
  // ... existing pipeline ...

  // Auto-load standard FB library
  const stdFBManifest = loadBundledStdFBLibrary();
  if (stdFBManifest) {
    registerLibrarySymbols(stdFBManifest, symbolTables);
  }

  // ... continue compilation ...
}
```

### Library Manifest

The manifest follows the existing `LibraryManifest` format from Phase 4.5:

```json
{
  "name": "iec-standard-fb",
  "version": "1.0.0",
  "description": "IEC 61131-3 Standard Function Blocks",
  "namespace": "strucpp",
  "functions": [],
  "functionBlocks": [
    {
      "name": "R_TRIG",
      "inputs": [{ "name": "CLK", "type": "BOOL" }],
      "outputs": [{ "name": "Q", "type": "BOOL" }],
      "inouts": []
    },
    {
      "name": "TON",
      "inputs": [
        { "name": "IN", "type": "BOOL" },
        { "name": "PT", "type": "TIME" }
      ],
      "outputs": [
        { "name": "Q", "type": "BOOL" },
        { "name": "ET", "type": "TIME" }
      ],
      "inouts": []
    }
  ],
  "types": [],
  "headers": ["iec_std_fb.hpp"],
  "isBuiltin": false,
  "sourceFiles": ["edge_detection.st", "bistable.st", "counter.st", "timer.st"]
}
```

## Extracting from MatIEC

The MatIEC library at `/path/to/matiec/lib/` contains reference implementations:

| MatIEC File | STruC++ Target | Adaptations Needed |
|-------------|---------------|-------------------|
| `edge_detection.txt` | `edge_detection.st` | None -- pure ST |
| `bistable.txt` | `bistable.st` | Remove license headers |
| `counter.txt` | `counter.st` | None -- pure ST (uses R_TRIG composition) |
| `timer.txt` | `timer.st` | Replace `{__SET_VAR(...)}` pragma with `TIME()` call |
| `derivative_st.txt` | `analog.st` | Replace TIME_TO_REAL with built-in conversion |
| `integral_st.txt` | `analog.st` | Same as derivative |
| `pid_st.txt` | `analog.st` | FB composition (uses INTEGRAL + DERIVATIVE) |
| `hysteresis_st.txt` | `analog.st` | None -- pure ST |
| `ramp_st.txt` | `analog.st` | Replace TIME_TO_REAL |
| `rtc.txt` | `utility.st` | Replace `{__SET_VAR(...)}` with function call |
| `sema.txt` | `utility.st` | None -- pure ST |

### Key Adaptations

1. **Timer pragma replacement**: MatIEC uses `{__SET_VAR(data__->,CURRENT_TIME,,__CURRENT_TIME)}` to inject the current time. STruC++ replaces this with a clean `TIME()` function call (CODESYS-compatible).

2. **Counter type variants**: MatIEC defines CTU_DINT, CTU_LINT, etc. as separate FBs. These can be kept as-is (separate FBs) since IEC 61131-3 doesn't support generics.

3. **Platform-specific FBs**: MatIEC includes Arduino, STM32, P1AM, MQTT, etc. These are **not** part of the IEC standard and should be separate OpenPLC-specific libraries, not bundled with the compiler.

## C++ Runtime Additions

### TIME Function

A new built-in function `TIME()` must be added to the C++ runtime and the standard function registry. This function returns the absolute runtime time (elapsed time since the runtime started), matching CODESYS behavior for maximum compatibility.

**File: `src/runtime/include/iec_std_lib.hpp`** (or new header):
```cpp
// Returns the absolute runtime time (elapsed since runtime start)
// CODESYS-compatible: TIME() returns monotonic elapsed time
// Uses std::chrono — the compiler provides time access directly,
// unlike MatIEC which injected a __CURRENT_TIME global
inline IEC_TIME TIME() {
    static auto start = std::chrono::steady_clock::now();
    auto now = std::chrono::steady_clock::now();
    return IEC_TIME::from_ns(
        std::chrono::duration_cast<std::chrono::nanoseconds>(now - start).count()
    );
}
```

**File: `src/semantic/std-function-registry.ts`**:
```typescript
// Add to standard function registry (CODESYS-compatible TIME function)
{ name: 'TIME', cppName: 'TIME', returnConstraint: 'specific',
  returnMatchesFirstParam: false, params: [],
  isVariadic: false, isConversion: false, category: 'time',
  specificReturnType: 'TIME' }
```

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/stdlib/iec-standard-fb/edge_detection.st` | Create | R_TRIG, F_TRIG |
| `src/stdlib/iec-standard-fb/bistable.st` | Create | SR, RS |
| `src/stdlib/iec-standard-fb/counter.st` | Create | CTU, CTD, CTUD (+ variants) |
| `src/stdlib/iec-standard-fb/timer.st` | Create | TP, TON, TOF |
| `src/stdlib/iec-standard-fb/analog.st` | Create | DERIVATIVE, INTEGRAL, PID, HYSTERESIS, RAMP |
| `src/stdlib/iec-standard-fb/utility.st` | Create | RTC, SEMA |
| `src/runtime/include/iec_std_lib.hpp` | Modify | Add TIME() function |
| `src/semantic/std-function-registry.ts` | Modify | Register TIME |
| `src/library/builtin-stdlib.ts` | Modify | Add auto-loading of standard FB library |
| `src/index.ts` | Modify | Wire standard FB library into compile pipeline |
| `scripts/build-stdlib.ts` | Create | Build script to compile ST stdlib during npm run build |
| `tests/library/std-fb-library.test.ts` | Create | Standard FB library compilation and loading tests |
| `tests/integration/std-fb-behavior.test.ts` | Create | Behavioral tests for standard FBs |

## Success Criteria

- All standard FBs (R_TRIG, F_TRIG, SR, RS, CTU, CTD, CTUD, TP, TON, TOF) compile as a library
- Library manifest is generated correctly with all FB entries
- Standard FBs are auto-loaded and available in user programs without import
- FB composition works (CTU uses R_TRIG internally)
- Timer FBs work with TIME() function (CODESYS-compatible)
- Counter type variants (CTU_DINT, etc.) all compile and work
- Generated C++ compiles with g++
- Standard FBs produce correct behavior in integration tests

## Notes

### Relationship to Other Phases
- **Phase 4.5**: Library system provides the compilation/loading infrastructure
- **Phase 5.1**: FB instance and invocation mechanics must work first
- **Phase 5.2**: Not required -- standard FBs don't use OOP features
- **Phase 6**: OpenPLC runtime integration (TIME() is compiler-provided via `std::chrono`, not runtime-dependent)

### Why Not C++ Built-in?

Alternatives considered:
1. **C++ classes in runtime** -- Would work but hides implementation from ST users; no benefit over ST source
2. **Hardcoded in compiler** -- Tight coupling; every FB change requires compiler rebuild
3. **ST library** (chosen) -- Inspectable, extensible, uses same infrastructure as user libraries

### Future Libraries

The same library system will support:
- OpenPLC-specific FBs (Arduino, STM32, etc.) -- separate library
- Communication FBs (MQTT, Modbus) -- separate library
- User-defined FB libraries -- same compilation/loading mechanism
