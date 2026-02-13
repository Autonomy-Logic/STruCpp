# Phase 8.2: Complete Assert Library and Test Organization

**Status**: PENDING

**Duration**: 1-2 weeks

**Prerequisites**: Phase 8.1 (Core Test Infrastructure)

**Goal**: Extend the testing framework with a comprehensive assert library covering all IEC 61131-3 data types, add SETUP/TEARDOWN support for shared test initialization, optional assertion messages, and support for multiple test files in a single invocation

## Overview

Phase 8.1 delivers the core `ASSERT_EQ`, `ASSERT_TRUE`, and `ASSERT_FALSE` functions. This phase completes the assert library with numerical comparisons, range/tolerance checks for REAL types, and organizational features (SETUP/TEARDOWN) that reduce test boilerplate.

## Scope

### Complete Assert Library

| Function | Signature | Description |
|----------|-----------|-------------|
| `ASSERT_EQ` | `(actual, expected [, msg])` | Exact equality (all elementary types) |
| `ASSERT_NEQ` | `(actual, expected [, msg])` | Not equal |
| `ASSERT_TRUE` | `(condition [, msg])` | Boolean is TRUE |
| `ASSERT_FALSE` | `(condition [, msg])` | Boolean is FALSE |
| `ASSERT_GT` | `(actual, threshold [, msg])` | Greater than |
| `ASSERT_LT` | `(actual, threshold [, msg])` | Less than |
| `ASSERT_GE` | `(actual, threshold [, msg])` | Greater than or equal |
| `ASSERT_LE` | `(actual, threshold [, msg])` | Less than or equal |
| `ASSERT_NEAR` | `(actual, expected, tolerance [, msg])` | Within tolerance (REAL/LREAL) |

All assert functions accept an optional final STRING parameter for a custom failure message.

### Optional Message Parameter

Every assert supports a trailing string message:

```st
ASSERT_EQ(uut.count, 10, 'Count should be 10 after 10 cycles');
ASSERT_NEAR(uut.temperature, 98.6, 0.1, 'Temperature within tolerance');
ASSERT_TRUE(uut.running, 'Motor should be running after start');
```

On failure, the custom message is displayed alongside the standard failure details:

```
  [FAIL] Motor control test
         ASSERT_TRUE failed: uut.running expected TRUE, got FALSE
         Message: Motor should be running after start
         at test_motor.st:15
```

### SETUP / END_SETUP and TEARDOWN / END_TEARDOWN

Shared initialization and cleanup code that runs before/after each TEST block:

```st
(* test_motor.st *)

SETUP
  VAR
    motor : MotorControl;
    sensor : TemperatureSensor;
  END_VAR
  motor.max_speed := 1500;
  motor.enabled := FALSE;
  sensor.offset := 0;
END_SETUP

TEARDOWN
  (* Cleanup actions if needed *)
  motor.enabled := FALSE;
END_TEARDOWN

TEST 'Motor starts when enabled'
  motor.enabled := TRUE;
  motor();
  ASSERT_TRUE(motor.running);
END_TEST

TEST 'Motor respects speed limit'
  motor.enabled := TRUE;
  motor.speed_setpoint := 9999;
  motor();
  ASSERT_LE(motor.actual_speed, 1500, 'Should not exceed max_speed');
END_TEST

TEST 'Sensor reads correctly'
  sensor.raw_value := 1000;
  sensor();
  ASSERT_NEAR(sensor.temperature, 25.0, 0.5);
END_TEST
```

**Behavior:**
- SETUP variables are accessible in all TEST blocks within the same file
- Before each TEST block: a fresh SETUP scope is created, SETUP body executes
- After each TEST block: TEARDOWN body executes (even if test failed)
- SETUP and TEARDOWN are optional (zero or one of each per test file)
- TEST blocks can declare additional local variables that are NOT accessible in other TEST blocks

**Generated C++ structure:**

```cpp
struct TestSetup {
    Program_MotorControl motor;
    Program_TemperatureSensor sensor;

    void setup() {
        motor.max_speed = 1500;
        motor.enabled = false;
        sensor.offset = 0;
    }

    void teardown() {
        motor.enabled = false;
    }
};

bool test_1(strucpp::TestContext& ctx) {
    TestSetup s;
    s.setup();
    // TEST 'Motor starts when enabled'
    s.motor.enabled = true;
    s.motor.run();
    bool result = ctx.assert_true(
        static_cast<bool>(s.motor.running), "motor.running", 15);
    s.teardown();
    return result;
}
```

### Multiple Test Files

Support passing multiple test files in a single invocation:

```bash
strucpp motor.st sensor.st --test test_motor.st test_sensor.st test_integration.st
```

Each test file is compiled into a separate section of test_main.cpp. Results are grouped by file:

```
STruC++ Test Runner v1.0

test_motor.st
  [PASS] Motor starts when enabled
  [PASS] Motor respects speed limit

test_sensor.st
  [PASS] Sensor reads correctly
  [PASS] Sensor handles offset

test_integration.st
  [PASS] Motor reacts to sensor input

-----------------------------------------
5 tests, 5 passed, 0 failed
```

### Numerical Comparison Asserts

```st
TEST 'Numerical comparisons'
  VAR uut : Calculator; END_VAR

  uut.a := 10;
  uut.b := 3;
  uut();

  ASSERT_GT(uut.result, 0, 'Result should be positive');
  ASSERT_LT(uut.result, 100, 'Result should be reasonable');
  ASSERT_GE(uut.result, 3, 'At least 3');
  ASSERT_LE(uut.result, 10, 'At most 10');
  ASSERT_NEQ(uut.result, 0, 'Should not be zero');
END_TEST
```

### REAL/LREAL Tolerance with ASSERT_NEAR

Floating-point comparisons need tolerance-based checking:

```st
TEST 'PID controller output within tolerance'
  VAR pid : PIDController; END_VAR

  pid.setpoint := 100.0;
  pid.process_value := 98.5;
  pid();

  ASSERT_NEAR(pid.output, 1.5, 0.01, 'PID output should be approximately 1.5');
END_TEST
```

**Generated C++:**
```cpp
ctx.assert_near(
    static_cast<REAL_t>(pid.output), REAL_t(1.5), REAL_t(0.01),
    "pid.output", "1.5", "0.01", "PID output should be approximately 1.5", 8);
```

The C++ implementation uses `std::abs(actual - expected) <= tolerance`.

## Implementation

### Lexer Additions

```typescript
// Additional assert tokens
export const ASSERT_NEQ = createToken({ name: "ASSERT_NEQ", pattern: /ASSERT_NEQ/i, longer_alt: Identifier });
export const ASSERT_GT = createToken({ name: "ASSERT_GT", pattern: /ASSERT_GT/i, longer_alt: Identifier });
export const ASSERT_LT = createToken({ name: "ASSERT_LT", pattern: /ASSERT_LT/i, longer_alt: Identifier });
export const ASSERT_GE = createToken({ name: "ASSERT_GE", pattern: /ASSERT_GE/i, longer_alt: Identifier });
export const ASSERT_LE = createToken({ name: "ASSERT_LE", pattern: /ASSERT_LE/i, longer_alt: Identifier });
export const ASSERT_NEAR = createToken({ name: "ASSERT_NEAR", pattern: /ASSERT_NEAR/i, longer_alt: Identifier });

// SETUP/TEARDOWN
export const SETUP = createToken({ name: "SETUP", pattern: /SETUP/i, longer_alt: Identifier });
export const END_SETUP = createToken({ name: "END_SETUP", pattern: /END_SETUP/i, longer_alt: Identifier });
export const TEARDOWN = createToken({ name: "TEARDOWN", pattern: /TEARDOWN/i, longer_alt: Identifier });
export const END_TEARDOWN = createToken({ name: "END_TEARDOWN", pattern: /END_TEARDOWN/i, longer_alt: Identifier });
```

### Parser Extensions

```typescript
// Extended test file rule with optional SETUP/TEARDOWN
testFile() {
  this.OPTION(() => { this.SUBRULE(this.setupBlock); });
  this.OPTION(() => { this.SUBRULE(this.teardownBlock); });
  this.MANY(() => {
    this.SUBRULE(this.testCase);
  });
}

setupBlock() {
  this.CONSUME(SETUP);
  this.MANY(() => { this.SUBRULE(this.varBlock); });
  this.SUBRULE(this.testStatementList);
  this.CONSUME(END_SETUP);
}

teardownBlock() {
  this.CONSUME(TEARDOWN);
  this.SUBRULE(this.testStatementList);
  this.CONSUME(END_TEARDOWN);
}

// Assert call with variable argument count and optional message
assertCall() {
  // ... assert token consumption
  this.CONSUME(LParen);
  this.SUBRULE(this.expression);  // First arg (always required)
  this.MANY(() => {
    this.CONSUME(Comma);
    this.SUBRULE2(this.expression);  // Additional args
  });
  this.CONSUME(RParen);
  this.CONSUME(Semicolon);
}
```

### TestModel Extensions

```typescript
export interface TestFile {
  fileName: string;
  setup?: SetupBlock;
  teardown?: TeardownBlock;
  testCases: TestCase[];
}

export interface SetupBlock {
  varBlocks: VarBlock[];
  body: Statement[];
  sourceSpan: SourceSpan;
}

export interface TeardownBlock {
  body: Statement[];
  sourceSpan: SourceSpan;
}

export interface AssertCall {
  kind: "AssertCall";
  assertType: "ASSERT_EQ" | "ASSERT_NEQ" | "ASSERT_TRUE" | "ASSERT_FALSE"
            | "ASSERT_GT" | "ASSERT_LT" | "ASSERT_GE" | "ASSERT_LE"
            | "ASSERT_NEAR";
  args: Expression[];
  message?: string;     // Optional message (last STRING arg)
  sourceSpan: SourceSpan;
}
```

### C++ Runtime Extensions (`iec_test.hpp`)

```cpp
template<typename T>
bool assert_neq(T actual, T expected, /* ... */) {
    if (actual != expected) return true;
    // report failure
}

template<typename T>
bool assert_gt(T actual, T threshold, /* ... */) {
    if (actual > threshold) return true;
    // report failure
}

template<typename T>
bool assert_lt(T actual, T threshold, /* ... */) {
    if (actual < threshold) return true;
    // report failure
}

template<typename T>
bool assert_ge(T actual, T threshold, /* ... */) {
    if (actual >= threshold) return true;
    // report failure
}

template<typename T>
bool assert_le(T actual, T threshold, /* ... */) {
    if (actual <= threshold) return true;
    // report failure
}

template<typename T>
bool assert_near(T actual, T expected, T tolerance, /* ... */) {
    if (std::abs(actual - expected) <= tolerance) return true;
    // report failure with tolerance info
}
```

## Deliverables

### Modified Files
- [ ] `src/frontend/lexer.ts` - Add ASSERT_NEQ/GT/LT/GE/LE/NEAR, SETUP/TEARDOWN tokens
- [ ] `src/frontend/parser.ts` - Add SETUP/TEARDOWN rules, extend assert parsing
- [ ] `src/frontend/ast.ts` - Add SetupBlock, TeardownBlock types, extend AssertCall
- [ ] `src/frontend/ast-builder.ts` - Build SETUP/TEARDOWN nodes
- [ ] `src/testing/test-model.ts` - Add SetupBlock, TeardownBlock, message field
- [ ] `src/testing/test-parser.ts` - Handle SETUP/TEARDOWN, message extraction
- [ ] `src/backend/test-main-gen.ts` - Generate setup struct, teardown calls, multiple files
- [ ] `src/runtime/test/iec_test.hpp` - Add all assert methods with message support
- [ ] `src/cli.ts` - Support multiple `--test` file arguments

### Test Files
- [ ] `tests/frontend/test-parser.test.ts` - Extend with SETUP/TEARDOWN, new asserts
- [ ] `tests/integration/test-runner.test.ts` - Extend with new assert types, SETUP/TEARDOWN

## Testing

### Unit Tests
- Parse SETUP block with VAR declarations and statements
- Parse TEARDOWN block
- Parse all assert types with correct argument counts
- Parse optional message parameter on asserts
- Parse ASSERT_NEAR with three arguments
- Error on ASSERT_NEAR with fewer than three arguments
- Error on multiple SETUP blocks in one file

### Integration Tests
- SETUP variables accessible in all TEST blocks
- State is fresh before each TEST (SETUP re-runs)
- TEARDOWN runs after each TEST (including failures)
- ASSERT_GT/LT/GE/LE work with integer types
- ASSERT_NEAR works with REAL values and tolerance
- ASSERT_NEQ correctly detects inequality
- Custom message appears in failure output
- Multiple test files produce grouped output
- Exit code reflects overall result across all files

## Success Criteria

- All nine assert functions work correctly
- Optional message parameter displays on failure
- SETUP/TEARDOWN execute per TEST block with correct scoping
- Multiple test files can be passed via `--test file1.st file2.st`
- Output groups results by test file
- ASSERT_NEAR handles floating-point comparison correctly
- TEARDOWN runs even when a TEST block fails
- All tests pass with no regressions from Phase 8.1
