# Phase 8.3: Function and Function Block Testing

**Status**: PENDING

**Duration**: 2-3 weeks

**Prerequisites**: Phase 4 (Functions), Phase 5.1 (Function Blocks Core), Phase 8.2 (Assert Library)

**Goal**: Extend the testing framework to support direct function calls, function block instantiation and invocation, method calls, output parameter access, and interface-based testing

## Overview

Phases 8.1-8.2 support testing PROGRAMs only. This phase adds the ability to test **Functions** (Phase 4) and **Function Blocks** (Phase 5) - the primary unit-testable constructs in IEC 61131-3. This is where the testing framework becomes truly powerful, enabling POU-oriented unit testing as described in academic literature.

With Function Blocks, tests can:
- Instantiate FBs with independent state
- Invoke FBs and verify input/output behavior
- Test state persistence across multiple invocations
- Call methods on FB instances (Phase 5.2)
- Test FB behavior through interface references
- Verify constructor initialization

## Scope

### Function Testing

Functions (Phase 4) are stateless POUs with inputs and a return value. Tests call them directly:

```st
(* Source: math_utils.st *)
FUNCTION SQUARE : INT
  VAR_INPUT x : INT; END_VAR
  SQUARE := x * x;
END_FUNCTION

FUNCTION CLAMP : REAL
  VAR_INPUT
    value : REAL;
    min_val : REAL;
    max_val : REAL;
  END_VAR
  IF value < min_val THEN
    CLAMP := min_val;
  ELSIF value > max_val THEN
    CLAMP := max_val;
  ELSE
    CLAMP := value;
  END_IF;
END_FUNCTION
```

```st
(* Test: test_math_utils.st *)

TEST 'SQUARE of positive number'
  ASSERT_EQ(SQUARE(5), 25);
END_TEST

TEST 'SQUARE of zero'
  ASSERT_EQ(SQUARE(0), 0);
END_TEST

TEST 'SQUARE of negative number'
  ASSERT_EQ(SQUARE(-3), 9);
END_TEST

TEST 'CLAMP within range passes through'
  ASSERT_NEAR(CLAMP(5.0, 0.0, 10.0), 5.0, 0.001);
END_TEST

TEST 'CLAMP below minimum returns minimum'
  ASSERT_NEAR(CLAMP(-5.0, 0.0, 10.0), 0.0, 0.001);
END_TEST

TEST 'CLAMP above maximum returns maximum'
  ASSERT_NEAR(CLAMP(15.0, 0.0, 10.0), 10.0, 0.001);
END_TEST
```

**Generated C++ for function call in test:**
```cpp
// ASSERT_EQ(SQUARE(5), 25)
ctx.assert_eq<INT_t>(SQUARE(INT_t(5)), INT_t(25), "SQUARE(5)", "25", 3);
```

Functions are stateless, so every call is naturally context-independent. No special handling needed.

### Function Block Instantiation and Invocation

Function blocks (Phase 5.1) are stateful POUs. Tests instantiate them as local variables:

```st
(* Source: timer_fb.st *)
FUNCTION_BLOCK Debounce
  VAR_INPUT
    signal : BOOL;
    threshold : INT;
  END_VAR
  VAR_OUTPUT
    stable : BOOL;
  END_VAR
  VAR
    count : INT;
  END_VAR

  IF signal THEN
    count := count + 1;
  ELSE
    count := 0;
  END_IF;

  stable := count >= threshold;
END_FUNCTION_BLOCK
```

```st
(* Test: test_debounce.st *)

TEST 'Debounce requires sustained signal'
  VAR db : Debounce; END_VAR

  db(signal := TRUE, threshold := 3);
  ASSERT_FALSE(db.stable, 'Not stable after 1 cycle');

  db(signal := TRUE, threshold := 3);
  ASSERT_FALSE(db.stable, 'Not stable after 2 cycles');

  db(signal := TRUE, threshold := 3);
  ASSERT_TRUE(db.stable, 'Should be stable after 3 cycles');
END_TEST

TEST 'Debounce resets on signal loss'
  VAR db : Debounce; END_VAR

  db(signal := TRUE, threshold := 2);
  db(signal := TRUE, threshold := 2);
  ASSERT_TRUE(db.stable);

  db(signal := FALSE, threshold := 2);
  ASSERT_FALSE(db.stable, 'Should reset when signal drops');

  db(signal := TRUE, threshold := 2);
  ASSERT_FALSE(db.stable, 'Counter should restart from 0');
END_TEST

TEST 'Two instances are independent'
  VAR db1 : Debounce; db2 : Debounce; END_VAR

  db1(signal := TRUE, threshold := 1);
  db2(signal := FALSE, threshold := 1);

  ASSERT_TRUE(db1.stable);
  ASSERT_FALSE(db2.stable, 'Instances should be independent');
END_TEST
```

**Generated C++ for FB invocation:**
```cpp
// db(signal := TRUE, threshold := 3)
db.signal = true;
db.threshold = 3;
db();   // Calls operator()

// db.stable access
ctx.assert_false(static_cast<bool>(db.stable), "db.stable", 6);
```

### FB Input Parameter Syntax

IEC 61131-3 supports named parameter assignment for FB calls:

```st
fb_instance(input1 := value1, input2 := value2);
```

This maps to setting input members then calling the FB body:

```cpp
fb_instance.input1 = value1;
fb_instance.input2 = value2;
fb_instance();
```

Tests can also set inputs directly before calling:

```st
TEST 'Direct input setting'
  VAR db : Debounce; END_VAR
  db.signal := TRUE;
  db.threshold := 5;
  db();
  ASSERT_EQ(db.count, 1);
END_TEST
```

### VAR_OUTPUT and VAR_IN_OUT Access

Tests can read output variables after FB invocation:

```st
TEST 'Output variables accessible after call'
  VAR db : Debounce; END_VAR
  db(signal := TRUE, threshold := 1);

  (* Access VAR_OUTPUT *)
  ASSERT_TRUE(db.stable);

  (* Access internal VAR for white-box testing *)
  ASSERT_EQ(db.count, 1);
END_TEST
```

For functions with VAR_IN_OUT parameters:

```st
TEST 'SWAP function exchanges values'
  VAR a : INT := 10; b : INT := 20; END_VAR
  SWAP(a := a, b := b);
  ASSERT_EQ(a, 20);
  ASSERT_EQ(b, 10);
END_TEST
```

### FB State Persistence Within a TEST Block

Within a single TEST block, FB instances maintain state between calls (context-aware):

```st
TEST 'Counter FB accumulates over calls'
  VAR ctu : CTU; END_VAR

  ctu(CU := TRUE, PV := 5);
  ASSERT_EQ(ctu.CV, 1);

  ctu(CU := TRUE, PV := 5);
  ASSERT_EQ(ctu.CV, 2);

  ctu(CU := TRUE, PV := 5);
  ctu(CU := TRUE, PV := 5);
  ctu(CU := TRUE, PV := 5);
  ASSERT_EQ(ctu.CV, 5);
  ASSERT_TRUE(ctu.Q, 'Counter should reach preset');
END_TEST
```

Between TEST blocks, state is completely fresh (context-independent):

```st
TEST 'First test - counter starts at 0'
  VAR ctu : CTU; END_VAR
  ASSERT_EQ(ctu.CV, 0);
  ctu(CU := TRUE, PV := 10);
  ASSERT_EQ(ctu.CV, 1);
END_TEST

TEST 'Second test - counter is fresh again'
  VAR ctu : CTU; END_VAR
  ASSERT_EQ(ctu.CV, 0);  (* Fresh instance, not 1 *)
END_TEST
```

### Method Calls (Phase 5.2)

When OOP extensions are available, tests can call methods on FB instances:

```st
(* Source: motor.st *)
FUNCTION_BLOCK Motor
  VAR
    _speed : INT;
    _running : BOOL;
  END_VAR

  METHOD PUBLIC Start
    _running := TRUE;
  END_METHOD

  METHOD PUBLIC Stop
    _running := FALSE;
    _speed := 0;
  END_METHOD

  METHOD PUBLIC SetSpeed
    VAR_INPUT newSpeed : INT; END_VAR
    _speed := newSpeed;
  END_METHOD

  METHOD PUBLIC GetSpeed : INT
    GetSpeed := _speed;
  END_METHOD
END_FUNCTION_BLOCK
```

```st
(* Test: test_motor.st *)

TEST 'Motor starts and stops correctly'
  VAR m : Motor; END_VAR

  m.Start();
  ASSERT_TRUE(m._running, 'Should be running after Start');

  m.Stop();
  ASSERT_FALSE(m._running, 'Should stop after Stop');
  ASSERT_EQ(m._speed, 0, 'Speed should reset on stop');
END_TEST

TEST 'Motor SetSpeed and GetSpeed'
  VAR m : Motor; speed : INT; END_VAR

  m.Start();
  m.SetSpeed(newSpeed := 750);
  speed := m.GetSpeed();
  ASSERT_EQ(speed, 750);
END_TEST
```

**Generated C++:**
```cpp
bool test_1(strucpp::TestContext& ctx) {
    Motor m;
    m.Start();
    if (!ctx.assert_true(static_cast<bool>(m._running),
        "m._running", 5)) return false;
    m.Stop();
    if (!ctx.assert_false(static_cast<bool>(m._running),
        "m._running", 8)) return false;
    if (!ctx.assert_eq<INT_t>(static_cast<INT_t>(m._speed), INT_t(0),
        "m._speed", "0", 9)) return false;
    return true;
}
```

### Testing with Inheritance (Phase 5.2)

Tests can verify inheritance and polymorphism:

```st
(* Source: controllers.st *)
FUNCTION_BLOCK ABSTRACT BaseController
  VAR _setpoint : REAL; END_VAR

  METHOD PUBLIC ABSTRACT Calculate : REAL
    VAR_INPUT input : REAL; END_VAR
  END_METHOD
END_FUNCTION_BLOCK

FUNCTION_BLOCK PController EXTENDS BaseController
  VAR Kp : REAL := 1.0; END_VAR

  METHOD PUBLIC Calculate : REAL
    VAR_INPUT input : REAL; END_VAR
    Calculate := Kp * (_setpoint - input);
  END_METHOD
END_FUNCTION_BLOCK
```

```st
(* Test: test_controllers.st *)

TEST 'P controller proportional response'
  VAR ctrl : PController; output : REAL; END_VAR
  ctrl._setpoint := 100.0;
  ctrl.Kp := 2.0;
  output := ctrl.Calculate(input := 90.0);
  ASSERT_NEAR(output, 20.0, 0.001, 'Error * Kp = 10 * 2 = 20');
END_TEST

TEST 'P controller zero error'
  VAR ctrl : PController; output : REAL; END_VAR
  ctrl._setpoint := 50.0;
  output := ctrl.Calculate(input := 50.0);
  ASSERT_NEAR(output, 0.0, 0.001, 'No error = no output');
END_TEST
```

### Standard Function Block Testing

Test the standard FBs (TON, TOF, CTU, CTD, R_TRIG, F_TRIG, SR, RS):

```st
TEST 'R_TRIG detects rising edge'
  VAR rt : R_TRIG; END_VAR

  rt(CLK := FALSE);
  ASSERT_FALSE(rt.Q, 'No edge on first FALSE');

  rt(CLK := TRUE);
  ASSERT_TRUE(rt.Q, 'Rising edge detected');

  rt(CLK := TRUE);
  ASSERT_FALSE(rt.Q, 'No edge on sustained TRUE');

  rt(CLK := FALSE);
  ASSERT_FALSE(rt.Q, 'No edge on falling');

  rt(CLK := TRUE);
  ASSERT_TRUE(rt.Q, 'Second rising edge detected');
END_TEST

TEST 'CTU counts up to preset'
  VAR counter : CTU; i : INT; END_VAR

  FOR i := 1 TO 5 DO
    counter(CU := TRUE, PV := 5);
  END_FOR;

  ASSERT_TRUE(counter.Q, 'Should reach preset');
  ASSERT_EQ(counter.CV, 5);
END_TEST
```

## Implementation

### Code Generation Changes

The test main generator needs to handle three new call patterns:

**1. Function calls in expressions:**
```st
ASSERT_EQ(SQUARE(5), 25);
```
→ Functions are already generated as C++ free functions. The assert wraps the call:
```cpp
ctx.assert_eq<INT_t>(SQUARE(INT_t(5)), INT_t(25), "SQUARE(5)", "25", line);
```

**2. FB invocation with named parameters:**
```st
db(signal := TRUE, threshold := 3);
```
→ Set inputs, call operator():
```cpp
db.signal = true;
db.threshold = 3;
db();
```

**3. Method calls:**
```st
m.Start();
output := m.GetSpeed();
```
→ Direct C++ method calls:
```cpp
m.Start();
output = m.GetSpeed();
```

### Type Resolution in Test Context

The test parser needs access to the symbol table from the compiled source to:
- Resolve POU names to their generated C++ classes (`Counter` → `Program_Counter`, `Debounce` → `FB_Debounce`)
- Determine parameter types for assert type specialization
- Validate member access (`uut.count` exists and has type INT)
- Resolve function return types for expression typing

### Test File → Source File Binding

Test files reference POUs defined in source files. The binding happens through:
1. Source files are compiled first, producing a symbol table
2. Test file parser uses the symbol table to resolve POU references
3. Generated test_main.cpp includes the source header

```cpp
// test_main.cpp
#include "generated.hpp"    // Contains all POU class definitions
#include "iec_test.hpp"     // Test runtime

// Test functions can instantiate any POU class from generated.hpp
```

## Deliverables

### Modified Files
- [ ] `src/testing/test-parser.ts` - Handle function calls, FB invocations, method calls
- [ ] `src/backend/test-main-gen.ts` - Generate C++ for function/FB/method test patterns
- [ ] `src/runtime/test/iec_test.hpp` - Ensure assert templates work with all POU output types

### Test Files
- [ ] `tests/frontend/test-parser.test.ts` - Parse function calls, FB invocations, named parameters, method calls
- [ ] `tests/integration/test-runner.test.ts` - End-to-end tests for function, FB, and method testing

## Testing

### Unit Tests
- Parse direct function call in assert: `ASSERT_EQ(FUNC(x), y)`
- Parse FB invocation with named params: `fb(input := value)`
- Parse method call: `fb.Method()`
- Parse method call with return: `result := fb.Method()`
- Parse FB output access: `fb.output_var`

### Integration Tests
- Function call returns correct value
- FB state persists within TEST block
- FB state is fresh between TEST blocks
- FB named parameter assignment works
- FB output variables are readable after invocation
- Method call on FB instance works correctly
- Method with return value assigns correctly
- Two FB instances in same TEST are independent
- Standard FBs (CTU, R_TRIG) work in tests
- Inherited FB methods accessible in tests

## Success Criteria

- Functions can be called directly in test expressions and assertions
- FB instances can be created, invoked, and inspected in TEST blocks
- Named parameter syntax works for FB invocation
- VAR_OUTPUT and internal VAR variables are accessible for assertions
- Methods can be called on FB instances
- State persists within a TEST block but resets between blocks
- Standard function blocks work correctly in test context
- All tests pass with no regressions

## Notes

### White-Box vs Black-Box Testing

The framework supports both approaches:

**Black-box** (test through inputs/outputs only):
```st
TEST 'Black box - only check outputs'
  VAR db : Debounce; END_VAR
  db(signal := TRUE, threshold := 3);
  db(signal := TRUE, threshold := 3);
  db(signal := TRUE, threshold := 3);
  ASSERT_TRUE(db.stable);  (* Only check VAR_OUTPUT *)
END_TEST
```

**White-box** (inspect internal state):
```st
TEST 'White box - check internal counter'
  VAR db : Debounce; END_VAR
  db(signal := TRUE, threshold := 3);
  ASSERT_EQ(db.count, 1);  (* Check internal VAR *)
END_TEST
```

In STruC++, all member variables of generated C++ classes are public (they are `IECVar<T>` members), so internal state is always accessible. This is a deliberate design choice that enables thorough testing.

### Relationship to Phase 4 and 5

This phase cannot be implemented until Functions (Phase 4) and Function Blocks (Phase 5.1) are complete. Method testing additionally requires Phase 5.2 (OOP Extensions). The implementation can be staged:

1. First: Function testing (after Phase 4)
2. Then: FB instantiation and invocation testing (after Phase 5.1)
3. Finally: Method and interface testing (after Phase 5.2)
