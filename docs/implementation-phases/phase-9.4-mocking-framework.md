# Phase 8.4: Mocking Framework

**Status**: PENDING

**Duration**: 2-3 weeks

**Prerequisites**: Phase 8.3 (Function and Function Block Testing), Phase 5.1 (Function Blocks Core)

**Goal**: Add per-TEST mocking support for Function Blocks and Functions, enabling isolation of units under test from their dependencies. Inspired by CMock (ceedling's mocking companion) but adapted for IEC 61131-3's class-based POU model.

## Overview

Real-world IEC 61131-3 programs compose multiple POUs together: a motor controller uses a PID function block, which uses a sensor function block, which reads from I/O. To unit test the motor controller in isolation, its dependencies must be replaceable with controlled test doubles.

This phase adds `MOCK` declarations that operate **per-TEST block**, allowing some tests to run with mocked dependencies while others use real implementations. This is a significant advantage over CMock's link-time replacement, which applies globally.

### Comparison with CMock

| Aspect | CMock (ceedling) | STruC++ Mocking |
|--------|-----------------|-----------------|
| Scope | Per-file (link-time) | Per-TEST block (instance-level) |
| Generation | Ruby parses C headers | Compiler has full AST access |
| Mechanism | Link-time function replacement | Instance-level flag + dispatch |
| Granularity | All-or-nothing per function | Selective per-instance |
| Setup | Separate mock files generated | MOCK keyword in TEST block |
| FB/Class mocking | N/A (C has no classes) | Native support via class instances |
| Call verification | ExpectAndReturn, InOrder | MOCK_VERIFY_CALLED, input asserts |

### Key Design Decisions

1. **Per-TEST, not per-file** - MOCK declarations are inside TEST blocks, so different tests can mock different dependencies (or none at all)
2. **Instance-level mocking** - Mocking targets specific FB instances by path (e.g., `MOCK ctrl.sensor`), not entire types globally
3. **Body skipping** - A mocked FB's body (`operator()`) is skipped; outputs retain their pre-set values
4. **Input verification for free** - Inputs are still assigned even when body is skipped, so standard ASSERT_EQ works to verify what was passed
5. **Test-build only** - Mock infrastructure (`__mocked_` flag, `__mock_state_`) only exists in test-compiled code, zero overhead in production builds

## Scope

### Function Block Mocking

FB mocking works by adding an instance-level `__mocked_` boolean flag to every FB class in test builds. When `true`, the FB's `operator()` skips the body but still accepts input assignments.

**Source under test (`motor_controller.st`):**
```st
FUNCTION_BLOCK MotorController
  VAR_INPUT
    setpoint : REAL;
  END_VAR
  VAR_OUTPUT
    motor_speed : REAL;
  END_VAR
  VAR
    pid : PIDController;
    sensor : TemperatureSensor;
    temp : REAL;
  END_VAR

  sensor();
  temp := sensor.value;
  pid(setpoint := setpoint, actual := temp);
  motor_speed := pid.output;
END_FUNCTION_BLOCK
```

**Test file (`test_motor_controller.st`):**
```st
TEST 'Motor controller uses PID output as speed'
  VAR ctrl : MotorController; END_VAR

  (* Mock the sensor and PID - control their outputs *)
  MOCK ctrl.sensor;
  MOCK ctrl.pid;

  (* Pre-set mock outputs *)
  ctrl.sensor.value := 25.0;
  ctrl.pid.output := 75.0;

  (* Run the controller *)
  ctrl(setpoint := 100.0);

  (* Verify the controller used the PID output *)
  ASSERT_NEAR(ctrl.motor_speed, 75.0, 0.001);
END_TEST

TEST 'Motor controller passes correct values to PID'
  VAR ctrl : MotorController; END_VAR

  MOCK ctrl.sensor;
  MOCK ctrl.pid;

  ctrl.sensor.value := 30.0;
  ctrl(setpoint := 80.0);

  (* Verify inputs passed to PID - these were assigned even though body was skipped *)
  ASSERT_NEAR(ctrl.pid.setpoint, 80.0, 0.001, 'PID should receive motor setpoint');
  ASSERT_NEAR(ctrl.pid.actual, 30.0, 0.001, 'PID should receive sensor value');
END_TEST

TEST 'Full integration - no mocks'
  VAR ctrl : MotorController; END_VAR

  (* No MOCK declarations - everything runs for real *)
  ctrl(setpoint := 50.0);
  ASSERT_GT(ctrl.motor_speed, 0.0, 'Should produce non-zero output');
END_TEST
```

### How FB Mocking Works

In test builds, every FB class gets an additional `__mocked_` flag:

```cpp
// Generated C++ for FB (test build)
class FB_PIDController {
public:
    // Normal members
    IECVar<REAL_t> setpoint;
    IECVar<REAL_t> actual;
    IECVar<REAL_t> output;

    // Test-only members (behind #ifdef STRUCPP_TEST_BUILD)
    bool __mocked_ = false;
    struct {
        int call_count = 0;
    } __mock_state_;

    void operator()() {
        #ifdef STRUCPP_TEST_BUILD
        if (__mocked_) {
            __mock_state_.call_count++;
            return;  // Skip body, outputs retain pre-set values
        }
        #endif
        // Normal body...
        output = /* PID calculation */;
    }
};
```

The `MOCK ctrl.sensor;` statement generates:

```cpp
ctrl.sensor.__mocked_ = true;
```

Since each TEST block creates fresh instances, mock state is automatically cleaned up between tests. No teardown logic needed.

### Instance-Path Mocking

MOCK targets specific instances by their access path within the unit under test:

```st
(* Mock a nested FB instance *)
MOCK ctrl.sensor;          (* ctrl's sensor member *)
MOCK ctrl.pid;             (* ctrl's PID member *)

(* Mock a deeply nested FB *)
MOCK ctrl.subsystem.valve; (* ctrl's subsystem's valve member *)

(* Mock a local FB instance *)
VAR myFB : SomeFB; END_VAR
MOCK myFB;                 (* Direct local instance *)
```

Each path is resolved at code generation time to the corresponding C++ member access:

```cpp
ctrl.sensor.__mocked_ = true;
ctrl.pid.__mocked_ = true;
ctrl.subsystem.valve.__mocked_ = true;
myFB.__mocked_ = true;
```

### Selective Mocking

A key advantage of per-TEST mocking is selectivity. Within a single TEST, you can mock some dependencies while keeping others real:

```st
TEST 'Motor controller with real PID but mocked sensor'
  VAR ctrl : MotorController; END_VAR

  (* Only mock the sensor - PID runs for real *)
  MOCK ctrl.sensor;
  ctrl.sensor.value := 25.0;

  ctrl(setpoint := 100.0);

  (* PID calculated a real output based on the mocked sensor reading *)
  ASSERT_GT(ctrl.pid.output, 0.0, 'PID should compute real output');
  ASSERT_NEAR(ctrl.motor_speed, ctrl.pid.output, 0.001);
END_TEST
```

### Function Mocking

Functions (Phase 4) are stateless free functions, not classes. They require a different mechanism: a dispatch function pointer that can be swapped per-test.

**Source under test:**
```st
FUNCTION ReadSensorRaw : INT
  VAR_INPUT channel : INT; END_VAR
  (* Hardware-dependent implementation *)
  ReadSensorRaw := (* ... I/O read ... *);
END_FUNCTION

FUNCTION_BLOCK SensorProcessor
  VAR_INPUT channel : INT; END_VAR
  VAR_OUTPUT processed : REAL; END_VAR
  VAR raw : INT; END_VAR

  raw := ReadSensorRaw(channel := channel);
  processed := INT_TO_REAL(raw) * 0.01;
END_FUNCTION_BLOCK
```

**Test file:**
```st
TEST 'SensorProcessor scales raw value'
  VAR sp : SensorProcessor; END_VAR

  MOCK_FUNCTION ReadSensorRaw RETURNS 4200;

  sp(channel := 1);
  ASSERT_NEAR(sp.processed, 42.0, 0.001, '4200 * 0.01 = 42.0');
END_TEST

TEST 'SensorProcessor with real function'
  VAR sp : SensorProcessor; END_VAR

  (* No mock - uses real ReadSensorRaw *)
  sp(channel := 1);
  ASSERT_GT(sp.processed, 0.0);
END_TEST
```

**Generated C++ for function mocking:**

```cpp
// Original function
INT_t ReadSensorRaw_real(INT_t channel) {
    // ... original body
}

// Function pointer for dispatch
#ifdef STRUCPP_TEST_BUILD
INT_t (*ReadSensorRaw_dispatch)(INT_t) = ReadSensorRaw_real;
INT_t ReadSensorRaw(INT_t channel) {
    return ReadSensorRaw_dispatch(channel);
}
#else
INT_t ReadSensorRaw(INT_t channel) {
    return ReadSensorRaw_real(channel);
}
#endif
```

The `MOCK_FUNCTION ReadSensorRaw RETURNS 4200;` statement generates:

```cpp
// Lambda that returns the fixed value
ReadSensorRaw_dispatch = [](INT_t) -> INT_t { return INT_t(4200); };
```

Since each TEST block is a separate C++ function, the dispatch pointer is reset to the real implementation at the start of each test:

```cpp
bool test_1(strucpp::TestContext& ctx) {
    // Reset all function dispatchers to real implementations
    ReadSensorRaw_dispatch = ReadSensorRaw_real;

    // ... MOCK_FUNCTION sets dispatch to mock lambda ...
    // ... test body ...
}
```

### Mock Verification

After running the unit under test, you can verify that mocked FBs were actually called:

```st
TEST 'Controller calls sensor exactly once per cycle'
  VAR ctrl : MotorController; END_VAR

  MOCK ctrl.sensor;
  ctrl.sensor.value := 25.0;

  ctrl(setpoint := 100.0);

  (* Verify the sensor was called *)
  MOCK_VERIFY_CALLED(ctrl.sensor);
  MOCK_VERIFY_CALL_COUNT(ctrl.sensor, 1);
END_TEST

TEST 'Safety check calls sensor twice'
  VAR safety : SafetyCheck; END_VAR

  MOCK safety.primary_sensor;
  MOCK safety.backup_sensor;

  safety.primary_sensor.value := 50.0;
  safety.backup_sensor.value := 50.5;

  safety();

  MOCK_VERIFY_CALLED(safety.primary_sensor);
  MOCK_VERIFY_CALLED(safety.backup_sensor);
  MOCK_VERIFY_CALL_COUNT(safety.primary_sensor, 1);
  MOCK_VERIFY_CALL_COUNT(safety.backup_sensor, 1);
END_TEST
```

**Generated C++ for verification:**

```cpp
// MOCK_VERIFY_CALLED(ctrl.sensor)
ctx.assert_true(ctrl.sensor.__mock_state_.call_count > 0,
    "MOCK_VERIFY_CALLED(ctrl.sensor)", line);

// MOCK_VERIFY_CALL_COUNT(ctrl.sensor, 1)
ctx.assert_eq<int>(ctrl.sensor.__mock_state_.call_count, 1,
    "ctrl.sensor call count", "1", file, line);
```

### Input Verification (No Special API Needed)

One of the cleanest aspects of instance-level mocking: inputs are still assigned even when the body is skipped, so standard ASSERT_EQ works for input verification:

```st
TEST 'Verify inputs passed to mocked FB'
  VAR ctrl : MotorController; END_VAR

  MOCK ctrl.pid;
  ctrl(setpoint := 100.0);

  (* PID.setpoint was assigned by the controller before PID() was called *)
  (* Even though PID body was skipped, the input is there *)
  ASSERT_NEAR(ctrl.pid.setpoint, 100.0, 0.001);
END_TEST
```

This is equivalent to CMock's `ExpectWithArg` but requires no special mock API - the natural IEC 61131-3 input assignment model makes it automatic.

## Implementation

### Lexer Additions

```typescript
// Mock-related tokens
export const MOCK = createToken({
    name: "MOCK", pattern: /MOCK/i, longer_alt: Identifier
});
export const MOCK_FUNCTION = createToken({
    name: "MOCK_FUNCTION", pattern: /MOCK_FUNCTION/i, longer_alt: Identifier
});
export const MOCK_VERIFY_CALLED = createToken({
    name: "MOCK_VERIFY_CALLED", pattern: /MOCK_VERIFY_CALLED/i, longer_alt: Identifier
});
export const MOCK_VERIFY_CALL_COUNT = createToken({
    name: "MOCK_VERIFY_CALL_COUNT", pattern: /MOCK_VERIFY_CALL_COUNT/i, longer_alt: Identifier
});
export const RETURNS = createToken({
    name: "RETURNS", pattern: /RETURNS/i, longer_alt: Identifier
});
```

### Parser Extensions

```typescript
// Inside testStatement rule
mockStatement() {
    this.OR([
        { ALT: () => {
            // MOCK instance.path ;
            this.CONSUME(MOCK);
            this.SUBRULE(this.qualifiedIdentifier);  // instance path
            this.CONSUME(Semicolon);
        }},
        { ALT: () => {
            // MOCK_FUNCTION FuncName RETURNS expression ;
            this.CONSUME(MOCK_FUNCTION);
            this.CONSUME(Identifier);   // function name
            this.CONSUME(RETURNS);
            this.SUBRULE(this.expression);  // return value
            this.CONSUME2(Semicolon);
        }},
    ]);
}

// Mock verification statements
mockVerifyStatement() {
    this.OR([
        { ALT: () => {
            // MOCK_VERIFY_CALLED(instance.path);
            this.CONSUME(MOCK_VERIFY_CALLED);
            this.CONSUME(LParen);
            this.SUBRULE(this.qualifiedIdentifier);
            this.CONSUME(RParen);
            this.CONSUME(Semicolon);
        }},
        { ALT: () => {
            // MOCK_VERIFY_CALL_COUNT(instance.path, count);
            this.CONSUME(MOCK_VERIFY_CALL_COUNT);
            this.CONSUME2(LParen);
            this.SUBRULE2(this.qualifiedIdentifier);
            this.CONSUME(Comma);
            this.SUBRULE(this.expression);  // expected count
            this.CONSUME2(RParen);
            this.CONSUME2(Semicolon);
        }},
    ]);
}
```

### AST Additions

```typescript
export interface MockFBStatement {
    kind: "MockFBStatement";
    instancePath: string[];  // e.g., ["ctrl", "sensor"]
    sourceSpan: SourceSpan;
}

export interface MockFunctionStatement {
    kind: "MockFunctionStatement";
    functionName: string;
    returnValue: Expression;
    sourceSpan: SourceSpan;
}

export interface MockVerifyCalledStatement {
    kind: "MockVerifyCalledStatement";
    instancePath: string[];
    sourceSpan: SourceSpan;
}

export interface MockVerifyCallCountStatement {
    kind: "MockVerifyCallCountStatement";
    instancePath: string[];
    expectedCount: Expression;
    sourceSpan: SourceSpan;
}

// Update TestStatement union type
export type TestStatement =
    | Statement
    | AssertCall
    | MockFBStatement
    | MockFunctionStatement
    | MockVerifyCalledStatement
    | MockVerifyCallCountStatement;
```

### Code Generation

The test-main generator handles mock statements:

```typescript
// In test-main-gen.ts

function generateMockFB(stmt: MockFBStatement): string {
    const path = stmt.instancePath.join('.');
    return `${path}.__mocked_ = true;\n`;
}

function generateMockFunction(stmt: MockFunctionStatement): string {
    const name = stmt.functionName;
    const retVal = generateExpression(stmt.returnValue);
    return `${name}_dispatch = [](auto...) -> decltype(${name}_real(std::declval<auto>()...)) { return ${retVal}; };\n`;
}

function generateMockVerifyCalled(stmt: MockVerifyCalledStatement, ctx: GenContext): string {
    const path = stmt.instancePath.join('.');
    return `if (!ctx.assert_true(${path}.__mock_state_.call_count > 0, ` +
        `"MOCK_VERIFY_CALLED(${path})", "${ctx.file}", ${ctx.line})) return false;\n`;
}

function generateMockVerifyCallCount(stmt: MockVerifyCallCountStatement, ctx: GenContext): string {
    const path = stmt.instancePath.join('.');
    const expected = generateExpression(stmt.expectedCount);
    return `if (!ctx.assert_eq<int>(${path}.__mock_state_.call_count, ${expected}, ` +
        `"${path} call count", "${expected}", "${ctx.file}", ${ctx.line})) return false;\n`;
}
```

### FB Code Generation Changes (Test Build)

When `--test` flag is active, FB code generation adds mock infrastructure:

```typescript
// In codegen.ts, when generating FB class

function generateFBClass(fb: FunctionBlockDecl, isTestBuild: boolean): string {
    let code = `class FB_${fb.name} {\npublic:\n`;

    // ... normal member generation ...

    if (isTestBuild) {
        code += `\n    // Test infrastructure\n`;
        code += `    #ifdef STRUCPP_TEST_BUILD\n`;
        code += `    bool __mocked_ = false;\n`;
        code += `    struct { int call_count = 0; } __mock_state_;\n`;
        code += `    #endif\n`;
    }

    // operator() with mock check
    code += `\n    void operator()() {\n`;
    if (isTestBuild) {
        code += `        #ifdef STRUCPP_TEST_BUILD\n`;
        code += `        if (__mocked_) { __mock_state_.call_count++; return; }\n`;
        code += `        #endif\n`;
    }
    code += `        // ... normal body ...\n`;
    code += `    }\n`;

    code += `};\n`;
    return code;
}
```

### Function Code Generation Changes (Test Build)

```typescript
// In codegen.ts, when generating functions

function generateFunction(func: FunctionDecl, isTestBuild: boolean): string {
    const retType = mapType(func.returnType);
    const params = func.params.map(p => `${mapType(p.type)} ${p.name}`).join(', ');

    let code = '';

    // Real implementation (always generated)
    code += `${retType} ${func.name}_real(${params}) {\n`;
    code += `    // ... function body ...\n`;
    code += `}\n\n`;

    if (isTestBuild) {
        // Dispatch pointer and wrapper (test build only)
        code += `#ifdef STRUCPP_TEST_BUILD\n`;
        code += `${retType} (*${func.name}_dispatch)(${params}) = ${func.name}_real;\n`;
        code += `${retType} ${func.name}(${params}) {\n`;
        code += `    return ${func.name}_dispatch(${paramNames});\n`;
        code += `}\n`;
        code += `#else\n`;
        code += `${retType} ${func.name}(${params}) {\n`;
        code += `    return ${func.name}_real(${paramNames});\n`;
        code += `}\n`;
        code += `#endif\n`;
    } else {
        code += `${retType} ${func.name}(${params}) {\n`;
        code += `    return ${func.name}_real(${paramNames});\n`;
        code += `}\n`;
    }

    return code;
}
```

### Test Main Generation

Each test function resets mock state at the start:

```cpp
bool test_1(strucpp::TestContext& ctx) {
    // Reset function dispatch pointers
    ReadSensorRaw_dispatch = ReadSensorRaw_real;
    ComputeOffset_dispatch = ComputeOffset_real;

    // Fresh FB instances (mock flags default to false)
    FB_MotorController ctrl;

    // MOCK ctrl.sensor;
    ctrl.sensor.__mocked_ = true;

    // MOCK_FUNCTION ReadSensorRaw RETURNS 4200;
    ReadSensorRaw_dispatch = [](INT_t) -> INT_t { return INT_t(4200); };

    // Pre-set outputs
    ctrl.sensor.value = REAL_t(25.0);

    // Run unit under test
    ctrl.setpoint = REAL_t(100.0);
    ctrl();

    // Assertions
    if (!ctx.assert_near<REAL_t>(
        static_cast<REAL_t>(ctrl.motor_speed), REAL_t(75.0), REAL_t(0.001),
        "ctrl.motor_speed", "75.0", "0.001", nullptr, "test_motor_controller.st", 12))
        return false;

    // Verify mock was called
    if (!ctx.assert_true(ctrl.sensor.__mock_state_.call_count > 0,
        "MOCK_VERIFY_CALLED(ctrl.sensor)", "test_motor_controller.st", 15))
        return false;

    return true;
}
```

## Deliverables

### Modified Files
- [ ] `src/frontend/lexer.ts` - Add MOCK, MOCK_FUNCTION, MOCK_VERIFY_CALLED, MOCK_VERIFY_CALL_COUNT, RETURNS tokens
- [ ] `src/frontend/parser.ts` - Add mock statement and verify rules to test parsing
- [ ] `src/frontend/ast.ts` - Add MockFBStatement, MockFunctionStatement, MockVerify* types
- [ ] `src/frontend/ast-builder.ts` - Build mock AST nodes
- [ ] `src/testing/test-model.ts` - Add mock-related statement types to TestStatement union
- [ ] `src/testing/test-parser.ts` - Handle mock statements in test file parsing
- [ ] `src/backend/test-main-gen.ts` - Generate mock setup, dispatch reset, verify assertions
- [ ] `src/backend/codegen.ts` - Add `__mocked_`/`__mock_state_` to FB classes and dispatch wrappers to functions in test builds

### New Files
- [ ] `src/testing/mock-gen.ts` - Mock infrastructure generation utilities (FB flag injection, function dispatch wrappers)

### Test Files
- [ ] `tests/frontend/test-mock-parser.test.ts` - Parse MOCK, MOCK_FUNCTION, MOCK_VERIFY_* statements
- [ ] `tests/integration/test-mock-runner.test.ts` - End-to-end mock tests (requires g++)

## Testing

### Unit Tests
- Parse `MOCK instance.path;` statement
- Parse `MOCK ctrl.subsystem.valve;` (deep path)
- Parse `MOCK_FUNCTION FuncName RETURNS 42;`
- Parse `MOCK_VERIFY_CALLED(instance.path);`
- Parse `MOCK_VERIFY_CALL_COUNT(instance.path, 3);`
- Error on MOCK outside of TEST block
- Error on MOCK_FUNCTION with missing RETURNS
- Error on MOCK_VERIFY_CALLED with invalid path

### Integration Tests
- Mocked FB body is skipped (outputs retain pre-set values)
- Mocked FB inputs are still assigned by caller
- Non-mocked FB in same TEST block runs normally
- Same FB type: one instance mocked, another real
- MOCK_VERIFY_CALLED passes when FB was called
- MOCK_VERIFY_CALLED fails when FB was not called
- MOCK_VERIFY_CALL_COUNT matches exact count
- MOCK_FUNCTION replaces function return value
- Function mock is scoped to single TEST block (next test uses real function)
- Nested FB mocking (ctrl.subsystem.sensor)
- No mock infrastructure present in non-test builds (compile without STRUCPP_TEST_BUILD)
- Test with no MOCK declarations uses all real implementations

## Success Criteria

- FB instances can be mocked per-TEST with `MOCK instance.path;`
- Functions can be mocked per-TEST with `MOCK_FUNCTION name RETURNS value;`
- Mocked FB bodies are skipped, outputs retain pre-set values
- Inputs to mocked FBs are still assigned (enabling input verification via ASSERT_EQ)
- Mock state is automatically fresh per TEST block (no manual cleanup)
- Selective mocking works: some dependencies mocked, others real, in the same TEST
- MOCK_VERIFY_CALLED and MOCK_VERIFY_CALL_COUNT work correctly
- No performance overhead in production builds (mock code behind `#ifdef`)
- All existing tests pass with no regressions

## Notes

### Why Instance-Level Mocking (Not Type-Level)

CMock replaces functions at link time, meaning ALL callers get the mock. STruC++ mocks at the instance level, which is more precise:

```st
TEST 'Only mock the primary sensor, keep backup real'
  VAR sys : DualSensorSystem; END_VAR

  MOCK sys.primary_sensor;        (* This one is mocked *)
  sys.primary_sensor.value := 0.0;
  (* sys.backup_sensor runs for real *)

  sys();
  ASSERT_TRUE(sys.using_backup, 'Should fall back to backup sensor');
END_TEST
```

If mocking were type-level (all TemperatureSensor instances mocked), this test would be impossible.

### Why Per-TEST (Not Per-File)

Per-file mocking (like CMock) means all tests in a file share the same mock configuration. This forces splitting tests into separate files based on mock needs. Per-TEST mocking is more flexible:

```st
(* All in the same test file *)

TEST 'Unit test with mocks'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  (* ... isolated unit test ... *)
END_TEST

TEST 'Integration test without mocks'
  VAR ctrl : Controller; END_VAR
  (* ... full integration test ... *)
END_TEST

TEST 'Partial mock test'
  VAR ctrl : Controller; END_VAR
  MOCK ctrl.sensor;
  (* ctrl.actuator runs for real *)
  (* ... focused integration test ... *)
END_TEST
```

### Future Extensions

**MOCK_FUNCTION with Dynamic Returns (Future):**
```st
(* Return different values on successive calls *)
MOCK_FUNCTION ReadSensor RETURNS_SEQUENCE [100, 200, 300];
```

**Mock Callbacks (Future):**
```st
(* Custom mock behavior *)
MOCK_FUNCTION ComputeChecksum WITH_CALLBACK MyChecksumMock;
```

**Argument Matchers (Future):**
```st
(* Verify specific arguments were passed *)
MOCK_VERIFY_CALLED_WITH(ctrl.pid, setpoint := 100.0);
```

These are deferred to a future phase as the basic MOCK + MOCK_FUNCTION + MOCK_VERIFY covers the vast majority of testing needs.
