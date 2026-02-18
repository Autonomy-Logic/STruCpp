/**
 * STruC++ C++ Compilation Tests
 *
 * These tests verify that the generated C++ code actually compiles
 * with a C++ compiler (g++). This ensures the generated code is
 * syntactically correct and links properly with the runtime library.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile } from '../../src/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  hasGpp,
  createPCH,
  compileWithGpp as compileWithGppHelper,
  compileAndRunStandalone as compileAndRunHelper,
} from './test-helpers.js';

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp('C++ Compilation Tests', () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-test-'));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileWithGpp(
    headerCode: string,
    cppCode: string,
    testName: string,
  ): { success: boolean; error?: string } {
    return compileWithGppHelper({ tempDir, pchPath, headerCode, cppCode, testName });
  }

  // Basic program, variable, FB, and function compilation tests removed —
  // covered by st-validation behavioral tests.

  it('should compile a configuration with resource and task', () => {
    const source = `
      CONFIGURATION TestConfig
        RESOURCE TestResource ON PLC
          TASK MainTask(INTERVAL := T#100ms, PRIORITY := 1);
          PROGRAM MainInstance WITH MainTask : MainProgram;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM MainProgram
        VAR counter : INT; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'config_resource');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with VAR_GLOBAL and VAR_EXTERNAL', () => {
    const source = `
      CONFIGURATION GlobalConfig
        VAR_GLOBAL
          sharedCounter : INT;
        END_VAR
        RESOURCE MainResource ON PLC
          TASK CycleTask(INTERVAL := T#50ms, PRIORITY := 1);
          PROGRAM Instance1 WITH CycleTask : CounterProgram;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM CounterProgram
        VAR_EXTERNAL
          sharedCounter : INT;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'global_external');
    expect(cppResult.success).toBe(true);
  });

  // "multiple programs" test removed — covered by st-validation/programs/multi_program.

  it('should compile a program with time literal intervals', () => {
    const source = `
      CONFIGURATION TimerConfig
        RESOURCE TimerResource ON PLC
          TASK FastTask(INTERVAL := T#10ms, PRIORITY := 1);
          TASK SlowTask(INTERVAL := T#1s, PRIORITY := 2);
          PROGRAM FastProgram WITH FastTask : FastProg;
          PROGRAM SlowProgram WITH SlowTask : SlowProg;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM FastProg
        VAR tick : INT; END_VAR
      END_PROGRAM

      PROGRAM SlowProg
        VAR count : INT; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'time_intervals');
    expect(cppResult.success).toBe(true);
  });

  // UDT syntax-only tests (struct, enum, array, multi-dim) removed —
  // covered by st-validation/data_types/ behavioral tests.

  it('should compile a non-zero-based array type (ARRAY[3..7])', () => {
    const source = `
      TYPE
        OffsetArray : ARRAY[3..7] OF INT;
      END_TYPE

      PROGRAM UseOffsetArray
        VAR arr : OffsetArray; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify the generated code uses Array1D with correct bounds
    expect(result.headerCode).toContain('Array1D<INT_t, 3, 7>');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'offset_array');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a 1-based array type (IEC convention)', () => {
    const source = `
      TYPE
        OneBasedArray : ARRAY[1..10] OF REAL;
      END_TYPE

      PROGRAM UseOneBasedArray
        VAR arr : OneBasedArray; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify the generated code uses Array1D with 1-based bounds
    expect(result.headerCode).toContain('Array1D<REAL_t, 1, 10>');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'one_based_array');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a multi-dimensional non-zero-based array', () => {
    const source = `
      TYPE
        OffsetMatrix : ARRAY[1..3, 5..8] OF DINT;
      END_TYPE

      PROGRAM UseOffsetMatrix
        VAR m : OffsetMatrix; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify the generated code uses Array2D with correct bounds
    expect(result.headerCode).toContain('Array2D<DINT_t, 1, 3, 5, 8>');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'offset_matrix');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a 3D non-zero-based array', () => {
    const source = `
      TYPE
        Cube3D : ARRAY[1..2, 3..5, 10..12] OF SINT;
      END_TYPE

      PROGRAM UseCube3D
        VAR c : Cube3D; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify the generated code uses Array3D with correct bounds
    expect(result.headerCode).toContain('Array3D<SINT_t, 1, 2, 3, 5, 10, 12>');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'cube_3d');
    expect(cppResult.success).toBe(true);
  });

  it('should compile 2D array element access with subscripts', () => {
    const source = `
      TYPE
        Matrix3x3 : ARRAY[0..2, 0..2] OF REAL;
      END_TYPE

      PROGRAM Test2DAccess
        VAR
          m : Matrix3x3;
          i : INT;
          j : INT;
        END_VAR
        m[0, 0] := 1.0;
        m[1, 2] := 3.14;
        m[i, j] := m[0, 0] + m[1, 2];
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify 2D access uses operator() syntax, not chained brackets
    expect(result.cppCode).toContain('M(0, 0)');
    expect(result.cppCode).toContain('M(1, 2)');
    expect(result.cppCode).toContain('M(I, J)');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'array_2d_access');
    expect(cppResult.success).toBe(true);
  });

  // "2D array access in a loop" removed — covered by st-validation/data_types/multidim_arrays.

  it('should compile mixed 1D bracket and 2D call-syntax access', () => {
    const source = `
      TYPE
        Row5 : ARRAY[1..5] OF INT;
        Grid3x3 : ARRAY[1..3, 1..3] OF INT;
      END_TYPE

      PROGRAM TestMixedAccess
        VAR
          row : Row5;
          grid : Grid3x3;
          i : INT;
        END_VAR
        row[1] := 10;
        row[2] := 20;
        grid[1, 1] := row[1] + row[2];
        FOR i := 1 TO 3 DO
          grid[i, i] := row[i];
        END_FOR;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // 1D uses brackets, 2D uses parenthesized call syntax
    expect(result.cppCode).toContain('ROW[1]');
    expect(result.cppCode).toContain('GRID(1, 1)');
    expect(result.cppCode).toContain('GRID(I, I)');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'mixed_1d_2d_access');
    expect(cppResult.success).toBe(true);
  });

  // Subrange, type alias, combined UDT, and types-only tests removed —
  // covered by st-validation/data_types/ behavioral tests.

  // =============================================================================
  // Function VAR_OUTPUT Call-Site Tests (Phase 4.3)
  // =============================================================================

  it('should compile a function with VAR_OUTPUT and => call syntax', () => {
    const source = `
      FUNCTION Divide : INT
        VAR_INPUT dividend : INT; divisor : INT; END_VAR
        VAR_OUTPUT remainder : INT; END_VAR
        remainder := dividend MOD divisor;
        Divide := dividend / divisor;
      END_FUNCTION

      PROGRAM Main
        VAR q : INT; r : INT; END_VAR
        q := Divide(dividend := 10, divisor := 3, remainder => r);
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify the function signature has reference parameter
    expect(result.headerCode).toContain('IEC_INT& REMAINDER');

    // Verify the call site passes r directly
    expect(result.cppCode).toContain('DIVIDE(10, 3, R)');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'func_var_output');
    expect(cppResult.success).toBe(true);
  });

  // Nested comment syntax-only tests removed — comments are exercised
  // by all st-validation tests. Error case kept below.

  it('should fail to compile with unclosed nested comment', () => {
    const source = `
      PROGRAM UnclosedComment
        (* This comment (* has a nested part but is not closed properly
        VAR x : INT; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.message.toLowerCase().includes('unclosed') || e.message.toLowerCase().includes('comment'))).toBe(true);
  });

  // =============================================================================
  // Variable Modifiers Tests (Phase 2.6)
  // =============================================================================

  it('should compile a program with CONSTANT variables', () => {
    const source = `
      PROGRAM ConstantVars
        VAR CONSTANT
          PI : REAL := 3.14159;
          MAX_SIZE : INT := 100;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify const qualifier is generated
    expect(result.headerCode).toContain('const IEC_REAL PI');
    expect(result.headerCode).toContain('const IEC_INT MAX_SIZE');
    // Note: PI and MAX_SIZE are already uppercase in ST source

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'constant_vars');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with RETAIN variables', () => {
    const source = `
      PROGRAM RetainVars
        VAR RETAIN
          counter : DINT;
          last_state : BOOL;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify retain table is generated
    expect(result.headerCode).toContain('__retain_vars');
    expect(result.headerCode).toContain('getRetainVars');
    expect(result.headerCode).toContain('getRetainCount');
    expect(result.cppCode).toContain('RetainVarInfo');
    // Variable names in retain table are uppercased (COUNTER, LAST_STATE)

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'retain_vars');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with mixed CONSTANT and RETAIN variables', () => {
    const source = `
      PROGRAM MixedModifiers
        VAR CONSTANT
          MAX_VALUE : INT := 1000;
        END_VAR
        VAR RETAIN
          accumulated : DINT;
        END_VAR
        VAR
          temp : INT;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify const qualifier
    expect(result.headerCode).toContain('const IEC_INT MAX_VALUE');
    // Verify retain table (only for retained vars)
    expect(result.headerCode).toContain('__retain_vars[1]');
    expect(result.cppCode).toContain('ACCUMULATED');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'mixed_modifiers');
    expect(cppResult.success).toBe(true);
  });

  it('should fail semantic validation for CONSTANT without initializer', () => {
    const source = `
      PROGRAM NoInitializer
        VAR CONSTANT
          missing : INT;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.message.includes('CONSTANT') && e.message.includes('initializer'))).toBe(true);
  });

  // =============================================================================
  // Namespace Tests (Phase 2.7)
  // =============================================================================

  it('should compile a program with correct namespace wrapping', () => {
    const source = `
      PROGRAM NamespaceTest
        VAR
          counter : INT;
          flag : BOOL;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify namespace structure in header
    expect(result.headerCode).toContain('namespace strucpp {');
    expect(result.headerCode).toContain('}  // namespace strucpp');

    // Verify namespace structure in source
    expect(result.cppCode).toContain('namespace strucpp {');
    expect(result.cppCode).toContain('}  // namespace strucpp');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'namespace_test');
    expect(cppResult.success).toBe(true);
  });

  it('should compile user-defined types in namespace', () => {
    const source = `
      TYPE
        MotorState : (Stopped, Running, Error);
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE

      PROGRAM TypesInNamespace
        VAR
          state : MotorState;
          position : Point;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify types are in namespace
    expect(result.headerCode).toContain('namespace strucpp {');
    expect(result.headerCode).toContain('enum class MOTORSTATE');
    expect(result.headerCode).toContain('struct POINT');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'types_in_namespace');
    expect(cppResult.success).toBe(true);
  });

  it('should compile function blocks in namespace', () => {
    // Note: FB instance variables not tested here due to pre-existing
    // type mapping issue (IEC_ prefix applied to user types).
    // That will be addressed in Phase 3+ expression/type handling.
    const source = `
      FUNCTION_BLOCK Counter
        VAR_INPUT
          enable : BOOL;
        END_VAR
        VAR_OUTPUT
          count : INT;
        END_VAR
        VAR
          internal : INT;
        END_VAR
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify FB is in namespace
    expect(result.headerCode).toContain('namespace strucpp {');
    expect(result.headerCode).toContain('class COUNTER {');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'fb_in_namespace');
    if (!cppResult.success) {
      console.log('C++ compile error:', cppResult.error);
      console.log('Header code:\n', result.headerCode);
      console.log('CPP code:\n', result.cppCode);
    }
    expect(cppResult.success).toBe(true);
  });

  it('should compile complete configuration in namespace', () => {
    const source = `
      PROGRAM MainProg
        VAR
          x : INT;
        END_VAR
      END_PROGRAM

      CONFIGURATION TestConfig
        RESOURCE res1 ON PLC
          TASK mainTask(INTERVAL := T#20ms, PRIORITY := 1);
          PROGRAM instance1 WITH mainTask : MainProg;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify configuration is in namespace
    expect(result.headerCode).toContain('namespace strucpp {');
    expect(result.headerCode).toContain('class Configuration_TESTCONFIG');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'config_in_namespace');
    expect(cppResult.success).toBe(true);
  });

  // =============================================================================
  // External Code Pragma Tests (Phase 2.8)
  // =============================================================================

  it('should compile a program with simple external pragma', () => {
    const source = `
      PROGRAM ExternalSimple
        {external
          int local_var = 42;
          if (local_var > 0) { local_var--; }
        }
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_simple');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with external pragma using C++ stdlib', () => {
    const source = `
      PROGRAM ExternalStdLib
        {external
          std::string msg = "hello";
          int len = static_cast<int>(msg.size());
        }
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_stdlib');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with multiple external pragmas', () => {
    const source = `
      PROGRAM ExternalMultiple
        {external int a = 1; }
        {external int b = 2; }
        {external int c = a + b; }
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_multiple');
    expect(cppResult.success).toBe(true);
  });

  it('should compile external pragma in function block', () => {
    const source = `
      FUNCTION_BLOCK ExternalFB
        VAR_INPUT enable : BOOL; END_VAR
        VAR_OUTPUT count : INT; END_VAR
        {external
          if (ENABLE.get()) {
            COUNT.set(COUNT.get() + 1);
          }
        }
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_fb');
    expect(cppResult.success).toBe(true);
  });

  it('should compile external pragma in function', () => {
    const source = `
      FUNCTION ExternalFunc : INT
        VAR_INPUT x : INT; END_VAR
        {external
          int doubled = X.get() * 2;
          EXTERNALFUNC_result.set(doubled);
        }
      END_FUNCTION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_func');
    expect(cppResult.success).toBe(true);
  });

  it('should compile external pragma with struct definition', () => {
    const source = `
      PROGRAM ExternalStruct
        {external
          struct LocalPoint {
            int x;
            int y;
            LocalPoint() : x(0), y(0) {}
          };
          LocalPoint p;
          p.x = 10;
          p.y = 20;
        }
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_struct');
    expect(cppResult.success).toBe(true);
  });

  it('should compile external pragma with lambda', () => {
    const source = `
      PROGRAM ExternalLambda
        {external
          auto square = [](int x) { return x * x; };
          int result = square(5);
        }
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_lambda');
    expect(cppResult.success).toBe(true);
  });

  it('should compile external pragma with C++ comments and preprocessor', () => {
    const source = `
      PROGRAM ExternalComments
        {external
          // Single-line comment
          /* Block comment */
          int x = 0;
          #ifdef NEVER_DEFINED
          int unreachable = 999;
          #endif
        }
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'external_comments');
    expect(cppResult.success).toBe(true);
  });
});

/**
 * C++ Runtime Behavior Tests
 *
 * These tests verify that the generated C++ code executes correctly
 * with a minimal runtime scheduler. They validate that:
 * - Task intervals are correctly extracted from the configuration
 * - Program run() methods are called at the correct intervals
 * - Multiple tasks with different intervals work correctly
 */
describeIfGpp('C++ Runtime Behavior Tests', () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-runtime-test-'));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileAndRun(
    headerCode: string,
    cppCode: string,
    mainCode: string,
    testName: string,
  ): { success: boolean; output?: string; error?: string } {
    try {
      const output = compileAndRunHelper({
        tempDir, pchPath, headerCode, cppCode, testName, mainCode,
      });
      return { success: true, output };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Compilation failed') || msg.includes('g++ compilation failed')) {
        return { success: false, error: msg };
      }
      // Execution failure
      return { success: false, error: `Execution failed: ${msg}` };
    }
  }

  it('should execute programs at correct task intervals with simulated time', () => {
    // Configuration with two tasks: FastTask at 50ms and SlowTask at 100ms
    // Over 250ms of simulated time:
    // - FastTask should run at t=0, 50, 100, 150, 200 (5 times)
    // - SlowTask should run at t=0, 100, 200 (3 times)
    const source = `
      CONFIGURATION RuntimeTestConfig
        RESOURCE TestResource ON PLC
          TASK FastTask(INTERVAL := T#50ms, PRIORITY := 1);
          TASK SlowTask(INTERVAL := T#100ms, PRIORITY := 2);
          PROGRAM FastInstance WITH FastTask : FastProgram;
          PROGRAM SlowInstance WITH SlowTask : SlowProgram;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM FastProgram
        VAR counter : INT; END_VAR
      END_PROGRAM

      PROGRAM SlowProgram
        VAR counter : INT; END_VAR
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    // Minimal runtime scheduler with simulated time
    const mainCode = `
#include <iostream>
#include <cstdint>
#include <limits>

int main() {
    using namespace strucpp;

    Configuration_RUNTIMETESTCONFIG config;

    ResourceInstance* resources = config.get_resources();
    size_t resource_count = config.get_resource_count();

    // Find minimum interval for time stepping
    int64_t min_interval_ns = std::numeric_limits<int64_t>::max();
    for (size_t r = 0; r < resource_count; ++r) {
        ResourceInstance& res = resources[r];
        for (size_t t = 0; t < res.task_count; ++t) {
            TaskInstance& task = res.tasks[t];
            if (task.interval_ns > 0 && task.interval_ns < min_interval_ns) {
                min_interval_ns = task.interval_ns;
            }
        }
    }

    // Simulate 250ms of runtime (5 iterations of 50ms task, 3 of 100ms task)
    const int64_t total_time_ns = 250000000LL; // 250ms in nanoseconds

    int fast_calls = 0;
    int slow_calls = 0;

    // Get pointers to program instances for identification
    ProgramBase* fast_prog = &config.FASTINSTANCE;
    ProgramBase* slow_prog = &config.SLOWINSTANCE;

    // Simulated time loop
    for (int64_t now = 0; now < total_time_ns; now += min_interval_ns) {
        for (size_t r = 0; r < resource_count; ++r) {
            ResourceInstance& res = resources[r];
            for (size_t t = 0; t < res.task_count; ++t) {
                TaskInstance& task = res.tasks[t];
                if (task.interval_ns <= 0) continue; // Skip event-driven tasks

                // Check if this task should run at current time
                if (now % task.interval_ns == 0) {
                    for (size_t p = 0; p < task.program_count; ++p) {
                        ProgramBase* prog = task.programs[p];

                        // Count calls by program
                        if (prog == fast_prog) ++fast_calls;
                        else if (prog == slow_prog) ++slow_calls;

                        // Actually call the program's run method
                        prog->run();
                    }
                }
            }
        }
    }

    std::cout << "FastProgram_runs=" << fast_calls << std::endl;
    std::cout << "SlowProgram_runs=" << slow_calls << std::endl;
    std::cout << "min_interval_ns=" << min_interval_ns << std::endl;

    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'runtime_test');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toBeDefined();

    // Parse output and verify call counts
    const fastMatch = /FastProgram_runs=(\d+)/.exec(runResult.output!);
    const slowMatch = /SlowProgram_runs=(\d+)/.exec(runResult.output!);
    const intervalMatch = /min_interval_ns=(\d+)/.exec(runResult.output!);

    expect(fastMatch).not.toBeNull();
    expect(slowMatch).not.toBeNull();
    expect(intervalMatch).not.toBeNull();

    const fastCalls = Number(fastMatch![1]);
    const slowCalls = Number(slowMatch![1]);
    const minInterval = Number(intervalMatch![1]);

    // Verify minimum interval is 50ms (50,000,000 ns)
    expect(minInterval).toBe(50000000);

    // Verify call counts:
    // FastTask (50ms) over 250ms: runs at t=0, 50, 100, 150, 200 = 5 times
    // SlowTask (100ms) over 250ms: runs at t=0, 100, 200 = 3 times
    expect(fastCalls).toBe(5);
    expect(slowCalls).toBe(3);
  });

  it('should handle three tasks with different intervals', () => {
    // Configuration with three tasks at 20ms, 40ms, and 100ms
    // Over 200ms of simulated time:
    // - Task20ms should run at t=0, 20, 40, 60, 80, 100, 120, 140, 160, 180 (10 times)
    // - Task40ms should run at t=0, 40, 80, 120, 160 (5 times)
    // - Task100ms should run at t=0, 100 (2 times)
    const source = `
      CONFIGURATION MultiTaskConfig
        RESOURCE TestResource ON PLC
          TASK Task20ms(INTERVAL := T#20ms, PRIORITY := 1);
          TASK Task40ms(INTERVAL := T#40ms, PRIORITY := 2);
          TASK Task100ms(INTERVAL := T#100ms, PRIORITY := 3);
          PROGRAM Prog20 WITH Task20ms : Program20;
          PROGRAM Prog40 WITH Task40ms : Program40;
          PROGRAM Prog100 WITH Task100ms : Program100;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM Program20
        VAR tick : INT; END_VAR
      END_PROGRAM

      PROGRAM Program40
        VAR tick : INT; END_VAR
      END_PROGRAM

      PROGRAM Program100
        VAR tick : INT; END_VAR
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <iostream>
#include <cstdint>
#include <limits>

int main() {
    using namespace strucpp;

    Configuration_MULTITASKCONFIG config;

    ResourceInstance* resources = config.get_resources();
    size_t resource_count = config.get_resource_count();

    // Find minimum interval
    int64_t min_interval_ns = std::numeric_limits<int64_t>::max();
    for (size_t r = 0; r < resource_count; ++r) {
        ResourceInstance& res = resources[r];
        for (size_t t = 0; t < res.task_count; ++t) {
            TaskInstance& task = res.tasks[t];
            if (task.interval_ns > 0 && task.interval_ns < min_interval_ns) {
                min_interval_ns = task.interval_ns;
            }
        }
    }

    const int64_t total_time_ns = 200000000LL; // 200ms

    int calls_20 = 0;
    int calls_40 = 0;
    int calls_100 = 0;

    ProgramBase* prog_20 = &config.PROG20;
    ProgramBase* prog_40 = &config.PROG40;
    ProgramBase* prog_100 = &config.PROG100;

    for (int64_t now = 0; now < total_time_ns; now += min_interval_ns) {
        for (size_t r = 0; r < resource_count; ++r) {
            ResourceInstance& res = resources[r];
            for (size_t t = 0; t < res.task_count; ++t) {
                TaskInstance& task = res.tasks[t];
                if (task.interval_ns <= 0) continue;

                if (now % task.interval_ns == 0) {
                    for (size_t p = 0; p < task.program_count; ++p) {
                        ProgramBase* prog = task.programs[p];

                        if (prog == prog_20) ++calls_20;
                        else if (prog == prog_40) ++calls_40;
                        else if (prog == prog_100) ++calls_100;

                        prog->run();
                    }
                }
            }
        }
    }

    std::cout << "Program20_runs=" << calls_20 << std::endl;
    std::cout << "Program40_runs=" << calls_40 << std::endl;
    std::cout << "Program100_runs=" << calls_100 << std::endl;

    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'multi_task_test');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toBeDefined();

    const match20 = /Program20_runs=(\d+)/.exec(runResult.output!);
    const match40 = /Program40_runs=(\d+)/.exec(runResult.output!);
    const match100 = /Program100_runs=(\d+)/.exec(runResult.output!);

    expect(match20).not.toBeNull();
    expect(match40).not.toBeNull();
    expect(match100).not.toBeNull();

    // Verify call counts
    expect(Number(match20![1])).toBe(10);  // 20ms task over 200ms
    expect(Number(match40![1])).toBe(5);   // 40ms task over 200ms
    expect(Number(match100![1])).toBe(2);  // 100ms task over 200ms
  });

  it('should correctly extract task intervals from configuration', () => {
    // Test that verifies task interval extraction is correct
    const source = `
      CONFIGURATION IntervalTestConfig
        RESOURCE TestResource ON PLC
          TASK Task10ms(INTERVAL := T#10ms, PRIORITY := 1);
          TASK Task500ms(INTERVAL := T#500ms, PRIORITY := 2);
          TASK Task1s(INTERVAL := T#1s, PRIORITY := 3);
          PROGRAM Prog10 WITH Task10ms : Program10;
          PROGRAM Prog500 WITH Task500ms : Program500;
          PROGRAM Prog1s WITH Task1s : Program1s;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM Program10
        VAR x : INT; END_VAR
      END_PROGRAM

      PROGRAM Program500
        VAR x : INT; END_VAR
      END_PROGRAM

      PROGRAM Program1s
        VAR x : INT; END_VAR
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <iostream>
#include <cstdint>

int main() {
    using namespace strucpp;

    Configuration_INTERVALTESTCONFIG config;

    ResourceInstance* resources = config.get_resources();

    // Print all task intervals
    ResourceInstance& res = resources[0];
    for (size_t t = 0; t < res.task_count; ++t) {
        TaskInstance& task = res.tasks[t];
        std::cout << task.name << "_interval_ns=" << task.interval_ns << std::endl;
    }

    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'interval_extract_test');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toBeDefined();

    // Verify intervals are correctly extracted
    // T#10ms = 10,000,000 ns
    // T#500ms = 500,000,000 ns
    // T#1s = 1,000,000,000 ns
    const match10 = /TASK10MS_interval_ns=(\d+)/.exec(runResult.output!);
    const match500 = /TASK500MS_interval_ns=(\d+)/.exec(runResult.output!);
    const match1s = /TASK1S_interval_ns=(\d+)/.exec(runResult.output!);

    expect(match10).not.toBeNull();
    expect(match500).not.toBeNull();
    expect(match1s).not.toBeNull();

    expect(Number(match10![1])).toBe(10000000);      // 10ms in ns
    expect(Number(match500![1])).toBe(500000000);   // 500ms in ns
    expect(Number(match1s![1])).toBe(1000000000);   // 1s in ns
  });

  it('should execute function with omitted VAR_OUTPUT using temp variable', () => {
    const source = `
      FUNCTION Divide : INT
        VAR_INPUT dividend : INT; divisor : INT; END_VAR
        VAR_OUTPUT remainder : INT; END_VAR
        remainder := dividend MOD divisor;
        Divide := dividend / divisor;
      END_FUNCTION

      PROGRAM Main
        VAR q : INT; END_VAR
        q := Divide(10, 3);
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    // Verify a temp variable is emitted
    expect(result.cppCode).toContain('__output_tmp_');

    const mainCode = `
#include <iostream>

int main() {
    using namespace strucpp;

    Program_MAIN prog;
    prog.run();

    std::cout << "q=" << static_cast<int>(prog.Q.get()) << std::endl;

    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'var_output_omitted');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toBeDefined();

    // 10 / 3 = 3
    expect(runResult.output).toContain('q=3');
  });

  it('should execute function with VAR_OUTPUT and => call-site syntax correctly', () => {
    const source = `
      FUNCTION Divide : INT
        VAR_INPUT dividend : INT; divisor : INT; END_VAR
        VAR_OUTPUT remainder : INT; END_VAR
        remainder := dividend MOD divisor;
        Divide := dividend / divisor;
      END_FUNCTION

      PROGRAM Main
        VAR q : INT; r : INT; END_VAR
        q := Divide(dividend := 10, divisor := 3, remainder => r);
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <iostream>

int main() {
    using namespace strucpp;

    Program_MAIN prog;
    prog.run();

    std::cout << "q=" << static_cast<int>(prog.Q.get()) << std::endl;
    std::cout << "r=" << static_cast<int>(prog.R.get()) << std::endl;

    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'var_output_runtime');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toBeDefined();

    // 10 / 3 = 3, 10 MOD 3 = 1
    expect(runResult.output).toContain('q=3');
    expect(runResult.output).toContain('r=1');
  });
});

/**
 * External Code Pragma Runtime Tests (Phase 2.8)
 *
 * These tests verify that external C/C++ code embedded via {external ...}
 * pragmas actually compiles, links, and executes correctly.
 */
describeIfGpp('External Code Pragma Runtime Tests', () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-external-test-'));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function compileAndRun(
    headerCode: string,
    cppCode: string,
    mainCode: string,
    testName: string,
  ): { success: boolean; output?: string; error?: string } {
    try {
      const output = compileAndRunHelper({
        tempDir, pchPath, headerCode, cppCode, testName, mainCode,
      });
      return { success: true, output };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Compilation failed') || msg.includes('g++ compilation failed')) {
        return { success: false, error: msg };
      }
      return { success: false, error: `Execution failed: ${msg}` };
    }
  }

  it('should execute external pragma code that prints output', () => {
    const source = `
      PROGRAM PrintTest
        {external
          printf("EXTERNAL_OK\\n");
        }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_PRINTTEST prog;
    prog.run();
    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'external_print');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('EXTERNAL_OK');
  });

  it('should execute external pragma that reads and writes IEC variables', () => {
    const source = `
      PROGRAM VarAccessTest
        VAR
          counter : INT;
          flag : BOOL;
        END_VAR
        {external
          COUNTER.set(COUNTER.get() + 10);
          FLAG.set(true);
        }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_VARACCESSTEST prog;
    // Run twice to verify accumulation
    prog.run();
    prog.run();
    printf("counter=%d\\n", static_cast<int>(prog.COUNTER.get()));
    printf("flag=%d\\n", static_cast<int>(prog.FLAG.get()));
    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'external_var_access');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('counter=20');
    expect(runResult.output).toContain('flag=1');
  });

  it('should execute external pragma with control flow and nested braces', () => {
    const source = `
      PROGRAM ControlFlowTest
        VAR result : INT; END_VAR
        {external
          int sum = 0;
          for (int i = 1; i <= 5; i++) {
            if (i % 2 == 0) {
              sum += i;
            }
          }
          RESULT.set(sum);
        }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_CONTROLFLOWTEST prog;
    prog.run();
    // sum of even numbers 1..5: 2 + 4 = 6
    printf("result=%d\\n", static_cast<int>(prog.RESULT.get()));
    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'external_control_flow');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('result=6');
  });

  it('should execute multiple external pragmas in sequence', () => {
    const source = `
      PROGRAM MultiPragmaTest
        VAR x : INT; END_VAR
        {external X.set(1); }
        {external X.set(X.get() * 3); }
        {external X.set(X.get() + 7); }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_MULTIPRAGMATEST prog;
    prog.run();
    // 1 * 3 + 7 = 10
    printf("x=%d\\n", static_cast<int>(prog.X.get()));
    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'external_multi_pragma');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('x=10');
  });
});
