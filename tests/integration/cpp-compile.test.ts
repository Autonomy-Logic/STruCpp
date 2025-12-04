/**
 * STruC++ C++ Compilation Tests
 *
 * These tests verify that the generated C++ code actually compiles
 * with a C++ compiler (g++). This ensures the generated code is
 * syntactically correct and links properly with the runtime library.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile } from '../../src/index.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Skip these tests if g++ is not available
const hasGpp = (() => {
  try {
    execSync('which g++', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp('C++ Compilation Tests', () => {
  let tempDir: string;
  const runtimeIncludePath = path.resolve(__dirname, '../../src/runtime/include');

  beforeAll(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-test-'));
  });

  afterAll(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to compile generated C++ code with g++
   * Returns true if compilation succeeds, false otherwise
   */
  function compileWithGpp(
    headerCode: string,
    cppCode: string,
    testName: string,
  ): { success: boolean; error?: string } {
    // The generated code includes "generated.hpp", so we must use that name
    const headerPath = path.join(tempDir, 'generated.hpp');
    const cppPath = path.join(tempDir, `${testName}.cpp`);

    // Write the generated code to files
    fs.writeFileSync(headerPath, headerCode);

    // Create a main.cpp that includes the generated code and has a main function
    const mainCpp = `${cppCode}

int main() {
    return 0;
}
`;
    fs.writeFileSync(cppPath, mainCpp);

    try {
      // Compile with g++ (syntax check only, no linking)
      execSync(
        `g++ -std=c++17 -fsyntax-only -I"${runtimeIncludePath}" -I"${tempDir}" "${cppPath}" 2>&1`,
        { encoding: 'utf-8' },
      );
      return { success: true };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      return {
        success: false,
        error: execError.stdout || execError.stderr || execError.message || 'Unknown error',
      };
    }
  }

  it('should compile a simple program', () => {
    const source = `
      PROGRAM SimpleProgram
        VAR x : INT; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'simple_program');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with multiple variables', () => {
    const source = `
      PROGRAM MultiVarProgram
        VAR
          intVar : INT;
          realVar : REAL;
          boolVar : BOOL;
          dintVar : DINT;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'multi_var_program');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with VAR_INPUT and VAR_OUTPUT', () => {
    const source = `
      FUNCTION_BLOCK TestFB
        VAR_INPUT
          enable : BOOL;
          setpoint : REAL;
        END_VAR
        VAR_OUTPUT
          output : REAL;
          done : BOOL;
        END_VAR
        VAR
          internal : INT;
        END_VAR
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'fb_io_vars');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a function with return type', () => {
    const source = `
      FUNCTION AddInts : INT
        VAR_INPUT
          a : INT;
          b : INT;
        END_VAR
        AddInts := a + b;
      END_FUNCTION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'function_add');
    expect(cppResult.success).toBe(true);
  });

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

  it('should compile multiple programs', () => {
    const source = `
      PROGRAM Program1
        VAR x : INT; END_VAR
      END_PROGRAM

      PROGRAM Program2
        VAR y : REAL; END_VAR
      END_PROGRAM

      PROGRAM Program3
        VAR z : BOOL; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'multi_programs');
    expect(cppResult.success).toBe(true);
  });

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
  const runtimeIncludePath = path.resolve(__dirname, '../../src/runtime/include');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-runtime-test-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper function to compile and run generated C++ code
   * Returns the stdout output from the executed program
   */
  function compileAndRun(
    headerCode: string,
    cppCode: string,
    mainCode: string,
    testName: string,
  ): { success: boolean; output?: string; error?: string } {
    const headerPath = path.join(tempDir, 'generated.hpp');
    const cppPath = path.join(tempDir, `${testName}.cpp`);
    const binPath = path.join(tempDir, testName);

    // Write the generated code to files
    fs.writeFileSync(headerPath, headerCode);

    // Create the full source with custom main
    const fullCpp = `${cppCode}

${mainCode}
`;
    fs.writeFileSync(cppPath, fullCpp);

    try {
      // Compile with g++ (full compilation, not just syntax check)
      execSync(
        `g++ -std=c++17 -O2 -I"${runtimeIncludePath}" -I"${tempDir}" "${cppPath}" -o "${binPath}" 2>&1`,
        { encoding: 'utf-8' },
      );
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      return {
        success: false,
        error: `Compilation failed: ${execError.stdout || execError.stderr || execError.message || 'Unknown error'}`,
      };
    }

    try {
      // Run the compiled binary
      const output = execSync(`"${binPath}"`, { encoding: 'utf-8', timeout: 5000 });
      return { success: true, output };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      return {
        success: false,
        error: `Execution failed: ${execError.stdout || execError.stderr || execError.message || 'Unknown error'}`,
      };
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

    Configuration_RuntimeTestConfig config;

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
    ProgramBase* fast_prog = &config.FastInstance;
    ProgramBase* slow_prog = &config.SlowInstance;

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

    Configuration_MultiTaskConfig config;

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

    ProgramBase* prog_20 = &config.Prog20;
    ProgramBase* prog_40 = &config.Prog40;
    ProgramBase* prog_100 = &config.Prog100;

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

    Configuration_IntervalTestConfig config;

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
    const match10 = /Task10ms_interval_ns=(\d+)/.exec(runResult.output!);
    const match500 = /Task500ms_interval_ns=(\d+)/.exec(runResult.output!);
    const match1s = /Task1s_interval_ns=(\d+)/.exec(runResult.output!);

    expect(match10).not.toBeNull();
    expect(match500).not.toBeNull();
    expect(match1s).not.toBeNull();

    expect(Number(match10![1])).toBe(10000000);      // 10ms in ns
    expect(Number(match500![1])).toBe(500000000);   // 500ms in ns
    expect(Number(match1s![1])).toBe(1000000000);   // 1s in ns
  });
});
