# Phase 9: IEC 61131-3 Testing Framework

**Status**: PENDING

**Duration**: 8-12 weeks

**Goal**: Provide a vendor-agnostic, offline unit testing framework for IEC 61131-3 Structured Text programs, with tests written in ST itself

## Overview

STruC++ is uniquely positioned to fill a major gap in the IEC 61131-3 ecosystem: **there is no vendor-agnostic, open-source, offline unit testing tool for Structured Text programs**. Every existing solution (TcUnit, CfUnit, CODESYS Test Manager, Siemens Test Suite) requires a vendor-specific PLC runtime environment.

Because STruC++ compiles ST to native C++17, tests can compile and execute on any platform with a C++ compiler. No PLC hardware, no vendor IDE, no Windows dependency. Tests run at native CPU speed with sub-second feedback loops.

This phase implements a testing framework inspired by [ceedling](https://github.com/ThrowTheSwitch/Ceedling) (the embedded C testing framework), where **test files are written in Structured Text** with testing extensions. Just as ceedling test files are C files that call functions and assert values, STruC++ test files are ST files that instantiate POUs, invoke them, and assert results.

### Design Principles

1. **Tests in ST** - Test authors write in the language they already know, with minimal testing-specific extensions
2. **Single command** - `strucpp source.st --test test_source.st` compiles, builds, runs, and reports results in one pass
3. **Context isolation** - Each TEST block gets fresh POU instances; no state leaks between tests
4. **Direct POU invocation** - Tests call POUs directly (not just cycle-based execution), enabling true unit testing
5. **Dual purpose** - The framework serves both ST program developers and STruC++ compiler validation
6. **CI/CD native** - Exit code 0/1, structured output, no interactive prompts

### Relationship to Existing REPL (Phase 3.6)

The `--build` REPL and `--test` runner share infrastructure but serve different purposes:

| Aspect | REPL (`--build`) | Test Runner (`--test`) |
|--------|-------------------|------------------------|
| Purpose | Interactive debugging | Automated validation |
| Execution | User-driven, exploratory | Automated, deterministic |
| State | Persistent across commands | Fresh per TEST block |
| Output | Interactive terminal | Pass/fail report |
| Target user | Developer debugging | CI/CD pipeline |

Both generate C++ harnesses from the same AST/ProjectModel infrastructure. The test runner reuses the same compilation pipeline but generates `test_main.cpp` instead of `repl_main.cpp`.

## Industry Context

### Existing IEC 61131-3 Testing Tools

| Tool | Platform | Requires Runtime | Open Source | Offline |
|------|----------|-----------------|-------------|---------|
| TcUnit | TwinCAT 3 | Yes (Beckhoff) | MIT | No |
| CfUnit | CODESYS | Yes (CODESYS) | MIT | No |
| CODESYS Test Manager | CODESYS | Yes (CODESYS) | No | No |
| Siemens Test Suite | TIA Portal | Yes (PLCSIM) | No | No |
| CPTest+ | CPDev | Yes (CPDev) | No | Partial |
| **STruC++ Test Runner** | **Any (g++)** | **No** | **Yes** | **Yes** |

### Academic References

- **POU-oriented Unit Testing** (Jamro, IEEE 2015) - Proposed the concept of testing individual Program Organization Units
- **CPTest+** - Dedicated test definition language for IEC 61131-3 (academic, CPDev only)
- **K-ST** - Formal executable semantics used to validate ST compilers by comparing program behavior
- **STAutoTester** - Dynamic symbolic execution for automatic ST test case generation

## Test File Format

Test files are Structured Text with testing extensions (`TEST/END_TEST` blocks and `ASSERT_*` built-in functions):

```st
(* test_counter.st - Tests for the Counter program *)

TEST 'Counter increments by 1 each cycle'
  VAR uut : Counter; END_VAR
  uut();
  ASSERT_EQ(uut.count, 1);
  uut();
  ASSERT_EQ(uut.count, 2);
END_TEST

TEST 'Counter works with preset value'
  VAR uut : Counter; END_VAR
  uut.count := 100;
  uut();
  ASSERT_EQ(uut.count, 101);
END_TEST

TEST 'Multiple independent instances'
  VAR a : Counter; b : Counter; END_VAR
  a();
  b();
  ASSERT_EQ(a.count, 1);
  ASSERT_EQ(b.count, 1);
END_TEST
```

### Comparison with ceedling

| ceedling (C) | STruC++ Test Runner (ST) |
|-------------|--------------------------|
| `#include "module.h"` | Source file passed via `--test` CLI |
| `void test_function(void) { ... }` | `TEST 'description' ... END_TEST` |
| `setUp(void)` / `tearDown(void)` | `SETUP ... END_SETUP` / `TEARDOWN ... END_TEARDOWN` |
| `TEST_ASSERT_EQUAL(expected, actual)` | `ASSERT_EQ(actual, expected)` |
| `TEST_ASSERT_TRUE(condition)` | `ASSERT_TRUE(condition)` |
| Local variables in test function | `VAR ... END_VAR` in TEST block |
| Each test function = fresh state | Each TEST block = fresh state |

## CLI Usage

```bash
# Run tests for a single source file
strucpp counter.st --test test_counter.st

# Multiple source files
strucpp main.st motor.st safety.st --test test_motor.st

# Multiple test files
strucpp counter.st --test test_basic.st test_edge_cases.st

# Verbose output
strucpp counter.st --test test_counter.st --test-verbose

# JUnit XML output for CI (Phase 9.6)
strucpp counter.st --test test_counter.st --test-output junit
```

The `--test` flag triggers a complete pipeline in a single invocation:
1. Compile all source `.st` files to C++
2. Parse test `.st` files
3. Generate `test_main.cpp` with embedded test logic
4. Compile everything with g++ to a temporary binary
5. Execute the binary
6. Display results on stdout
7. Clean up temporary files
8. Exit with code 0 (all pass) or 1 (any failure)

## Output Format

```
STruC++ Test Runner v1.0

test_counter.st
  [PASS] Counter increments by 1 each cycle
  [PASS] Counter works with preset value
  [FAIL] Multiple independent instances
         ASSERT_EQ failed: b.count expected 1, got 0
         at test_counter.st:18

-----------------------------------------
3 tests, 2 passed, 1 failed
```

## Sub-phases

This phase is divided into sub-phases that can be implemented incrementally:

- [Phase 9.1: Core Test Infrastructure](phase-9.1-core-test-infrastructure.md) - Parser extensions, basic asserts, CLI integration, program testing
- [Phase 9.2: Complete Assert Library and Test Organization](phase-9.2-assert-library.md) - Full assert set, SETUP/TEARDOWN, multiple test files, messages
- [Phase 9.3: Function and Function Block Testing](phase-9.3-function-fb-testing.md) - Direct function calls, FB instantiation, method invocation, interface testing
- [Phase 9.4: Mocking Framework](phase-9.4-mocking-framework.md) - Per-TEST MOCK declarations for FBs and Functions, mock verification, selective mocking
- [Phase 9.5: STruC++ Self-Validation Suite](phase-9.5-self-validation-suite.md) - ST test files for compiler validation, Vitest integration, CI pipeline
- [Phase 9.6: Advanced Testing Features](phase-9.6-advanced-testing.md) - JUnit XML/TAP output, verbose mode, test filtering, timing

## Prerequisites

All external prerequisites are satisfied (Phases 1-5 are complete):

- **Phase 3.6** (REPL Runner) - Provides C++ compilation pipeline infrastructure (`repl-main-gen.ts` as reference pattern, g++ invocation, runtime include paths)
- **Phase 4** (Functions) - Complete. Enables function testing in Phase 9.3
- **Phase 5.1-5.4** (Function Blocks, OOP, Standard FBs) - Complete. Enables FB/method/interface testing in Phase 9.3, mocking in Phase 9.4

All sub-phases can proceed sequentially: 9.1→9.2→9.3→9.4→9.5→9.6. Phase 9.5 can optionally start in parallel with 9.4, and Phase 9.6 can start after 9.2.

## Architecture

```
                    ┌──────────────────┐
                    │  source.st       │  (program under test)
                    └────────┬─────────┘
                             │ compile()
                    ┌────────▼─────────┐
                    │  C++ header/impl │
                    └────────┬─────────┘
                             │
    ┌──────────────────┐     │
    │  test_source.st  │     │
    └────────┬─────────┘     │
             │ parseTestFile()
    ┌────────▼─────────┐     │
    │   TestModel      │     │
    └────────┬─────────┘     │
             │ generateTestMain()
    ┌────────▼─────────┐     │
    │  test_main.cpp   │     │
    └────────┬─────────┘     │
             │               │
             └───────┬───────┘
                     │ g++ compile + link
              ┌──────▼──────┐
              │   binary    │  (in /tmp)
              └──────┬──────┘
                     │ execute + capture stdout
              ┌──────▼──────┐
              │   results   │  (pass/fail, exit code)
              └─────────────┘
```

### New Files

| File | Description |
|------|-------------|
| `src/testing/test-parser.ts` | Parse test ST files into TestModel |
| `src/testing/test-model.ts` | TestFile, TestCase, AssertStatement types |
| `src/backend/test-main-gen.ts` | Generate `test_main.cpp` from TestModel |
| `src/runtime/test/iec_test.hpp` | C++ test runner runtime (TestRunner, assertions) |
| `tests/frontend/test-parser.test.ts` | Unit tests for test file parser |
| `tests/backend/test-main-gen.test.ts` | Unit tests for test main generator |
| `tests/integration/test-runner.test.ts` | Integration tests (requires g++) |

### Modified Files

| File | Change |
|------|--------|
| `src/cli.ts` | Add `--test`, `--test-verbose`, `--test-output` flags |
| `src/frontend/lexer.ts` | Add TEST, END_TEST, SETUP, END_SETUP, TEARDOWN, END_TEARDOWN, ASSERT_* tokens |
| `src/frontend/parser.ts` | Add test file parsing rules |
| `src/frontend/ast.ts` | Add TestFile, TestCase, AssertCall node types |
| `src/frontend/ast-builder.ts` | Build test AST nodes |

## Generated C++ Structure

Each TEST block compiles to an isolated function with its own scope:

**ST test:**
```st
TEST 'Counter increments by 1'
  VAR uut : Counter; END_VAR
  uut();
  ASSERT_EQ(uut.count, 1);
END_TEST
```

**Generated C++ (`test_main.cpp`):**
```cpp
#include "generated.hpp"
#include "iec_test.hpp"

using namespace strucpp;

bool test_1(strucpp::TestContext& ctx) {
    // TEST 'Counter increments by 1'
    Program_Counter uut;
    uut.run();
    if (!ctx.assert_eq<INT_t>(
        static_cast<INT_t>(uut.count), INT_t(1),
        "uut.count", "1", "test_counter.st", 4)) return false;
    return true;
}

int main() {
    strucpp::TestRunner runner("test_counter.st");
    runner.add("Counter increments by 1", test_1);
    return runner.run();
}
```

## Notes

### Assert Argument Order Convention

STruC++ asserts follow the **actual-first** convention (Google Test / Jest style):

```st
ASSERT_EQ(actual, expected);
ASSERT_EQ(uut.count, 42);       (* actual value first, expected second *)
ASSERT_GT(uut.speed, 0);        (* actual > threshold *)
```

This differs from the xUnit/ceedling convention where expected comes first (`TEST_ASSERT_EQUAL(expected, actual)`). The actual-first convention was chosen because:
1. It reads more naturally in English ("assert that uut.count equals 42")
2. It's consistent with the majority of modern testing frameworks
3. The ST expression being tested is more prominent in the first position

### Library System Integration

Tests that reference POUs from external libraries (including the standard FB library) work automatically because:
1. Source files are compiled through the normal `compile()` pipeline, which loads all configured libraries
2. Library symbols are registered in the SymbolTables, making them available for test file resolution
3. The standard FB library (TON, CTU, R_TRIG, etc.) is loaded by default via `getStdFBLibraryManifest()`
4. Library C++ code is included in the g++ compilation step

The `--test` flag can be combined with `-L` (library paths) to test code that depends on user libraries:
```bash
strucpp source.st -L ./my-libs --test test_source.st
```

### CONFIGURATION/RESOURCE/TASK in Tests

Test blocks create POU instances directly (bypassing CONFIGURATION/RESOURCE/TASK structure). This is intentional - unit tests test individual POUs in isolation, not the runtime scheduling model. Configuration-level testing is outside the scope of Phase 9 and would require integration with the OpenPLC runtime (Phase 7).

Located variables (`AT %IX0.0`) in tested POUs are treated as regular variables in the test context, with no hardware binding. This enables testing POU logic independently of I/O configuration.

### Why Tests in ST (Not a Custom DSL)

Writing tests in ST itself (rather than a custom `.stt` format or external language) provides several advantages:

1. **Zero learning curve** - ST developers already know the syntax
2. **Full language power** - Loops, conditionals, variables, expressions all available in tests
3. **IDE support** - Existing ST syntax highlighting and tooling works for test files
4. **Consistency with ceedling** - Proven approach from the embedded C testing ecosystem
5. **Parser reuse** - The existing STruC++ parser handles most of the test file syntax; only TEST/ASSERT extensions are needed

### Why Phase 9 Is Ready Now

With Phases 1-5 complete, the full IEC 61131-3 language is available in STruC++:
- Phase 4 (Functions) enables testing individual functions
- Phase 5 (Function Blocks) enables testing FBs with state, methods, and interfaces
- Phase 3.6 (REPL) provides the C++ compilation pipeline infrastructure

This means Phase 9 can be implemented with full-featured testing from the start - no need to limit early sub-phases to PROGRAM-only testing. All sub-phases should proceed in order: 9.1→9.2→9.3→9.4→9.5→9.6.

### Dual Purpose: User Testing + Compiler Validation

The same framework serves two audiences:

**ST Developers** write tests to validate their program logic:
```bash
strucpp my_program.st --test test_my_program.st
```

**STruC++ Developers** write tests to validate compiler correctness:
```
tests/st-validation/
  expressions/arithmetic.st + test_arithmetic.st     # Validates arithmetic codegen
  control_flow/for_loop.st + test_for_loop.st        # Validates FOR loop codegen
  function_blocks/basic_fb.st + test_basic_fb.st     # Validates FB instantiation
  ...
```

If any assertion fails, it means STruC++ generated incorrect C++ code for a known-good ST program. This provides end-to-end compiler validation without inspecting generated C++.

### Replacing the --build REPL for E2E Testing

The current end-to-end tests use the `--build` REPL approach, which is interactive and not ideal for CI/CD:
- REPL tests require scripting stdin/stdout interaction
- Test assertions are implicit (comparing output strings)
- No structured pass/fail reporting

The `--test` framework replaces this with:
- Declarative test definitions in ST
- Explicit assertions with clear pass/fail semantics
- Structured output (JUnit XML, TAP) for CI integration
- Self-contained test execution with automatic cleanup

Phase 9.5 (Self-Validation Suite) specifically creates the ST test pairs that serve as the compiler's own regression test suite, run automatically via `npm test`.
