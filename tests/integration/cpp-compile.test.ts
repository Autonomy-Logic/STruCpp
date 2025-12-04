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
