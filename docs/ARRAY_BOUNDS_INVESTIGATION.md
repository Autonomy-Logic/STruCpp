# Array out-of-bounds handling — investigation & fix

## Problem (observed on OpenPLC Runtime v4, aarch64)

An IEC program writing past the end of an array:

```iecst
PROGRAM faulter
  VAR
    arr : ARRAY[0..3] OF INT;
    idx : INT;
  END_VAR
  idx := idx + 1;
  arr[idx] := 7;   (* idx eventually exceeds 3 *)
END_PROGRAM
```

did **not** raise a clean IEC fault. It silently wrote past `arr`, corrupted
adjacent memory in the program's `Configuration` object, and eventually
**SIGSEGV'd** — taking down not just the faulting task but an adjacent task
whose data/vtable got clobbered. (The runtime's per-thread signal recovery
contained it — both crashing threads terminated and the PLC stayed RUNNING —
but a clean, localized fault is obviously preferable to memory corruption.)

## Root cause

`IecArray` (and `IEC_ARRAY_2D`) in `src/runtime/include/iec_array.hpp` already
have **two** accessors:

- `operator[]` / `operator()` — **unchecked**, `constexpr`, `noexcept`. Raw
  index into the backing `std::array`. Intentionally so: the debug-table
  generator emits `&g_config.foo.MY_ARRAY[i]` as a *constant expression*
  (required for AVR PROGMEM placement of the pointer table), which needs a
  constexpr, non-throwing `operator[]`.
- `at()` — **bounds-checked**: on an out-of-range index it does
  `throw std::out_of_range(...)` when `STRUCPP_HAS_EXCEPTIONS`, else
  `iec_runtime_fault(IecFault::ArrayBounds)`. This is exactly the
  cross-platform fault path we want.

But codegen (`src/backend/codegen.ts`) emitted **`operator[]` / `operator()`**
for POU array accesses — so every array read/write in user logic used the
*unchecked* path. The checked `at()` was never reached from generated code.

## Fix

Codegen now emits **`.at(...)`** for POU array subscripts (both the legacy flat
path and the interleaved access-chain path; 1-D and N-D). `operator[]` is left
untouched and continues to serve the debug-table generator's constexpr
`&arr[i]` address-of expressions. Net effect per target:

| Target | `STRUCPP_HAS_EXCEPTIONS` | Out-of-bounds behaviour |
|--------|--------------------------|-------------------------|
| OpenPLC Runtime v4 (Linux/Windows, hosted) | 1 | `throw std::out_of_range` → caught by the runtime's per-task `try/catch`; that task logs `terminated by unhandled exception: Array index out of bounds` and stops, **other tasks keep running** |
| Microcontroller firmware (AVR/SAMD/RP2040/STM32, `-fno-exceptions`) | 0 | `iec_runtime_fault(IecFault::ArrayBounds)` — the weak halt default, overridable by a VPP HAL (blink LED, etc.) |

This is the same dual path the rest of the runtime faults (`iec_pointer`,
`iec_located`) already use, so array OOB now behaves consistently with null
dereference / bad-located faults.

## Notes / follow-ups

- **Performance:** `.at()` adds one in-range comparison per subscript. For IEC
  semantics this is the correct default (CODESYS and most runtimes bounds-check
  arrays). If a perf escape hatch is ever wanted, a compile flag could map
  `.at()` back to `operator[]` — but unchecked array access in a PLC is a
  memory-safety hole, so checked-by-default is the right call.
- **Golden tests:** codegen golden tests that assert `arr[i]` in the emitted C++
  must be updated to `arr.at(i)` / `arr.at(i, j)`.
- **Debug table unaffected:** `debug-table-gen.ts` keeps using `operator[]`
  (constexpr `&arr[i]`), so AVR PROGMEM placement is preserved.
