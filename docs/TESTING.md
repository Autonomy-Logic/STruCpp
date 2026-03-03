# STruC++ Testing Framework

STruC++ includes a built-in testing framework for writing and running unit tests against Structured Text programs. Tests are written in a dedicated syntax, compiled to C++, and executed natively.

## Quick Start

Given a source file `counter.st`:

```iec
FUNCTION_BLOCK Counter
VAR_INPUT
    reset : BOOL;
END_VAR
VAR_OUTPUT
    count : INT;
END_VAR
VAR
    _count : INT := 0;
END_VAR

IF reset THEN
    _count := 0;
ELSE
    _count := _count + 1;
END_IF;
count := _count;
END_FUNCTION_BLOCK
```

Write a test file `test_counter.st`:

```
SETUP
VAR
    c : Counter;
END_VAR
END_SETUP

TEST "increments on each call"
    c(reset := FALSE);
    ASSERT_EQ(c.count, 1);
    c(reset := FALSE);
    ASSERT_EQ(c.count, 2);
END_TEST

TEST "reset clears count"
    c(reset := FALSE);
    c(reset := FALSE);
    c(reset := TRUE);
    ASSERT_EQ(c.count, 0);
END_TEST
```

Run with:

```bash
strucpp counter.st --test test_counter.st
```

## Test File Syntax

A test file contains an optional SETUP block, an optional TEARDOWN block, and one or more TEST blocks.

### SETUP / TEARDOWN

```
SETUP
VAR
    timer : TON;
    counter : INT := 0;
END_VAR
    counter := 0;
END_SETUP

TEARDOWN
    counter := 0;
END_TEARDOWN
```

SETUP runs before each test case. TEARDOWN runs after each test case. Variables declared in SETUP are accessible in all TEST blocks within the same file.

### TEST Blocks

```
TEST "descriptive test name"
VAR
    result : INT;
END_VAR
    result := Add(3, 4);
    ASSERT_EQ(result, 7);
END_TEST
```

Each TEST block is an isolated test case. Tests can declare local variables in a VAR block. Any ST statement is valid inside a test (assignments, function calls, FB invocations, control flow).

## Assertions

All assertions accept an optional trailing message argument for custom failure output.

| Assertion | Description | Example |
|-----------|-------------|---------|
| `ASSERT_EQ(a, b)` | Equal | `ASSERT_EQ(x, 42)` |
| `ASSERT_NEQ(a, b)` | Not equal | `ASSERT_NEQ(x, 0)` |
| `ASSERT_TRUE(expr)` | Is true | `ASSERT_TRUE(flag)` |
| `ASSERT_FALSE(expr)` | Is false | `ASSERT_FALSE(error)` |
| `ASSERT_GT(a, b)` | Greater than | `ASSERT_GT(count, 0)` |
| `ASSERT_LT(a, b)` | Less than | `ASSERT_LT(temp, 100)` |
| `ASSERT_GE(a, b)` | Greater or equal | `ASSERT_GE(level, min)` |
| `ASSERT_LE(a, b)` | Less or equal | `ASSERT_LE(speed, max)` |
| `ASSERT_NEAR(a, b, tol)` | Within tolerance | `ASSERT_NEAR(pi, 3.14, 0.01)` |

With custom message:

```
ASSERT_EQ(result, expected, "calculation should match");
```

A failed assertion stops the current test immediately (remaining statements are skipped) and reports the failure with source location.

## Time Advancement

For testing time-dependent logic (timers, delays):

```
TEST "TON timer fires after preset"
    timer(IN := TRUE, PT := T#100ms);
    ASSERT_FALSE(timer.Q);

    ADVANCE_TIME(100000000);    (* 100ms in nanoseconds *)

    timer(IN := TRUE, PT := T#100ms);
    ASSERT_TRUE(timer.Q);
END_TEST
```

`ADVANCE_TIME(nanoseconds)` increments the global scan-cycle time. This lets you simulate the passage of time between FB invocations without real-world delays.

## Mocking

### Mock Function Blocks

Skip a FB's execution while tracking that it was called:

```
TEST "controller uses sensor"
    MOCK mySensor;

    controller();

    MOCK_VERIFY_CALLED(mySensor);
    MOCK_VERIFY_CALL_COUNT(mySensor, 1);
END_TEST
```

`MOCK instance` prevents the FB's body from executing but preserves its output values and tracks call count. Nested paths are supported: `MOCK config.device.sensor`.

### Mock Functions

Replace a function with a fixed return value:

```
TEST "uses mocked Add"
    MOCK_FUNCTION Add RETURNS 42;

    result := Add(1, 2);
    ASSERT_EQ(result, 42);
END_TEST
```

The mock is scoped to the current test -- the real function is restored for the next test.

### Mock Verification

| Statement | Description |
|-----------|-------------|
| `MOCK_VERIFY_CALLED(instance)` | Assert the mocked FB was invoked at least once |
| `MOCK_VERIFY_CALL_COUNT(instance, n)` | Assert exact invocation count |

## How It Works

The `--test` mode:

1. Compiles the source ST file with test infrastructure enabled
2. Parses test files into a test AST (SETUP/TEARDOWN/TEST blocks, assertions, mocks)
3. Validates test files against the source's symbol tables
4. Generates a C++ test runner (`test_main.cpp`) with:
   - A setup struct per test file (if SETUP exists)
   - A test function per TEST block
   - Test registration in `main()`
5. Compiles the test binary with g++ (C++17)
6. Runs the binary and reports results

The exit code is 0 if all tests pass, non-zero otherwise.

## Output

```
[test_counter.st]
  PASS: increments on each call
  FAIL: reset clears count
    Assertion failed at line 15: ASSERT_EQ(c.count, 0) - got 3

Results: 1 passed, 1 failed
```
