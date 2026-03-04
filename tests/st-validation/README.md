# ST Validation Suite

Self-validation test suite for STruC++. Each category contains source `.st` files paired with `test_*.st` test files that exercise end-to-end compilation and execution.

## Convention

- Source: `<name>.st` defines PROGRAMs, FUNCTIONs, FUNCTION_BLOCKs, or TYPEs
- Test: `test_<name>.st` contains `TEST` blocks that instantiate and verify the source
- The orchestrator (`tests/integration/st-validation.test.ts`) auto-discovers pairs

## Categories

| Category         | Pairs | Coverage                                                                                         |
| ---------------- | ----- | ------------------------------------------------------------------------------------------------ |
| expressions      | 4     | Arithmetic, boolean, comparison, type conversion                                                 |
| control_flow     | 7     | IF/ELSIF/ELSE, CASE, FOR, WHILE, REPEAT, EXIT, nested loops                                      |
| variables        | 3     | Initialization, type defaults, constants                                                         |
| data_types       | 12    | Integers, reals, booleans, arrays, structs, subranges, time                                      |
| composite_access | 2     | Struct member, nested access                                                                     |
| functions        | 3     | Basic functions, function calls, std functions                                                   |
| function_blocks  | 15    | Basic FB, state, composition, methods, inheritance, interfaces, OOP extensions                   |
| standard_fbs     | 4     | TON/TOF/TP timers, CTU/CTD/CTUD counters, R_TRIG/F_TRIG, SR/RS bistables                         |
| oscat            | 10    | OSCAT basic library: math, trig, hyperbolic, bits, logic, string, convert, encoding, control, FB |
| programs         | 2     | Multi-program, configuration                                                                     |

## Running

```bash
npx vitest run tests/integration/st-validation.test.ts
```

Requires `g++` with C++17 support. Tests are auto-skipped if g++ is unavailable.
