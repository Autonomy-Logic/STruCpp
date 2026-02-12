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

  // User-Defined Data Types (Phase 2.2) Compilation Tests

  it('should compile a simple struct type', () => {
    const source = `
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE

      PROGRAM UseStruct
        VAR p : Point; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'simple_struct');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a struct with multiple field types', () => {
    const source = `
      TYPE
        SensorData : STRUCT
          id : INT;
          value : REAL;
          active : BOOL;
          timestamp : DINT;
        END_STRUCT;
      END_TYPE

      PROGRAM UseSensorData
        VAR sensor : SensorData; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'struct_multi_fields');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a simple enum type', () => {
    const source = `
      TYPE
        TrafficLight : (RED, YELLOW, GREEN);
      END_TYPE

      PROGRAM UseEnum
        VAR light : TrafficLight; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'simple_enum');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a typed enum with explicit values', () => {
    const source = `
      TYPE
        MachineState : INT (IDLE := 0, RUNNING := 1, PAUSED := 2, STOPPED := 3);
      END_TYPE

      PROGRAM UseTypedEnum
        VAR state : MachineState; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'typed_enum');
    expect(cppResult.success).toBe(true);
  });

  it('should compile an array type', () => {
    const source = `
      TYPE
        IntArray : ARRAY[0..9] OF INT;
      END_TYPE

      PROGRAM UseArray
        VAR arr : IntArray; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'array_type');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a multi-dimensional array type', () => {
    const source = `
      TYPE
        Matrix : ARRAY[0..2, 0..2] OF REAL;
      END_TYPE

      PROGRAM UseMatrix
        VAR m : Matrix; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'multi_dim_array');
    expect(cppResult.success).toBe(true);
  });

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
    expect(result.cppCode).toContain('m(0, 0)');
    expect(result.cppCode).toContain('m(1, 2)');
    expect(result.cppCode).toContain('m(i, j)');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'array_2d_access');
    expect(cppResult.success).toBe(true);
  });

  it('should compile 2D array access in a loop', () => {
    const source = `
      TYPE
        Matrix4x4 : ARRAY[1..4, 1..4] OF INT;
      END_TYPE

      PROGRAM Test2DLoop
        VAR
          m : Matrix4x4;
          i : INT;
          j : INT;
        END_VAR
        FOR i := 1 TO 4 DO
          FOR j := 1 TO 4 DO
            IF i = j THEN
              m[i, j] := 1;
            ELSE
              m[i, j] := 0;
            END_IF;
          END_FOR;
        END_FOR;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'array_2d_loop');
    expect(cppResult.success).toBe(true);
  });

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
    expect(result.cppCode).toContain('row[1]');
    expect(result.cppCode).toContain('grid(1, 1)');
    expect(result.cppCode).toContain('grid(i, i)');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'mixed_1d_2d_access');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a subrange type', () => {
    const source = `
      TYPE
        Percentage : INT(0..100);
      END_TYPE

      PROGRAM UseSubrange
        VAR pct : Percentage; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'subrange_type');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a type alias to elementary type', () => {
    const source = `
      TYPE
        MyInt : INT;
        MyReal : REAL;
      END_TYPE

      PROGRAM UseTypeAlias
        VAR
          a : MyInt;
          b : MyReal;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'type_alias');
    expect(cppResult.success).toBe(true);
  });

  it('should compile multiple user-defined types together', () => {
    const source = `
      TYPE
        MyInt : INT;
        TrafficLight : (RED, YELLOW, GREEN);
        MachineState : INT (IDLE := 0, RUNNING := 1, STOPPED := 2);
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
        IntArray : ARRAY[0..9] OF INT;
        Percentage : INT(0..100);
      END_TYPE

      PROGRAM UseAllTypes
        VAR
          a : MyInt;
          light : TrafficLight;
          state : MachineState;
          p : Point;
          arr : IntArray;
          pct : Percentage;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'all_user_types');
    expect(cppResult.success).toBe(true);
  });

  it('should compile user-defined types with elementary type variables', () => {
    const source = `
      TYPE
        Point : STRUCT
          x : INT;
          y : INT;
        END_STRUCT;
      END_TYPE

      PROGRAM MixedTypes
        VAR
          p : Point;
          counter : INT;
          enabled : BOOL;
          value : REAL;
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'mixed_types');
    expect(cppResult.success).toBe(true);
  });

  it('should compile TYPE block without program usage', () => {
    const source = `
      TYPE
        Color : (RED, GREEN, BLUE);
        Coordinate : STRUCT
          x : REAL;
          y : REAL;
          z : REAL;
        END_STRUCT;
      END_TYPE
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'types_only');
    expect(cppResult.success).toBe(true);
  });

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
    expect(result.headerCode).toContain('IEC_INT& remainder');

    // Verify the call site passes r directly
    expect(result.cppCode).toContain('Divide(10, 3, r)');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'func_var_output');
    expect(cppResult.success).toBe(true);
  });

  // =============================================================================
  // Nested Comments Tests (Phase 2.5)
  // =============================================================================

  it('should compile a program with nested block comments', () => {
    const source = `
      PROGRAM NestedComments
        (* This is a comment with (* nested content *) inside *)
        VAR x : INT; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'nested_comments');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with deeply nested comments', () => {
    const source = `
      PROGRAM DeeplyNested
        (* Level 1
           (* Level 2
              (* Level 3 - deepest *)
              Back to level 2
           *)
           Back to level 1
        *)
        VAR counter : DINT; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'deeply_nested');
    expect(cppResult.success).toBe(true);
  });

  it('should compile a program with mixed comment styles', () => {
    const source = `
      PROGRAM MixedComments
        // Single-line comment
        (* Block comment *)
        (* Nested (* block *) comment *)
        VAR
          a : INT; // inline comment
          b : REAL; (* inline block *)
        END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'mixed_comments');
    expect(cppResult.success).toBe(true);
  });

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
    expect(result.cppCode).toContain('accumulated');

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
    expect(result.headerCode).toContain('enum class MotorState');
    expect(result.headerCode).toContain('struct Point');

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
    expect(result.headerCode).toContain('class Counter {');

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
    expect(result.headerCode).toContain('class Configuration_TestConfig');

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
          if (enable.get()) {
            count.set(count.get() + 1);
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
          int doubled = x.get() * 2;
          ExternalFunc_result.set(doubled);
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

    Program_Main prog;
    prog.run();

    std::cout << "q=" << static_cast<int>(prog.q.get()) << std::endl;

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

    Program_Main prog;
    prog.run();

    std::cout << "q=" << static_cast<int>(prog.q.get()) << std::endl;
    std::cout << "r=" << static_cast<int>(prog.r.get()) << std::endl;

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
  const runtimeIncludePath = path.resolve(__dirname, '../../src/runtime/include');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-external-test-'));
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
    const headerPath = path.join(tempDir, 'generated.hpp');
    const cppPath = path.join(tempDir, `${testName}.cpp`);
    const binPath = path.join(tempDir, testName);

    fs.writeFileSync(headerPath, headerCode);
    const fullCpp = `${cppCode}\n\n${mainCode}\n`;
    fs.writeFileSync(cppPath, fullCpp);

    try {
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
    strucpp::Program_PrintTest prog;
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
          counter.set(counter.get() + 10);
          flag.set(true);
        }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_VarAccessTest prog;
    // Run twice to verify accumulation
    prog.run();
    prog.run();
    printf("counter=%d\\n", static_cast<int>(prog.counter.get()));
    printf("flag=%d\\n", static_cast<int>(prog.flag.get()));
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
          result.set(sum);
        }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_ControlFlowTest prog;
    prog.run();
    // sum of even numbers 1..5: 2 + 4 = 6
    printf("result=%d\\n", static_cast<int>(prog.result.get()));
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
        {external x.set(1); }
        {external x.set(x.get() * 3); }
        {external x.set(x.get() + 7); }
      END_PROGRAM
    `;

    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_MultiPragmaTest prog;
    prog.run();
    // 1 * 3 + 7 = 10
    printf("x=%d\\n", static_cast<int>(prog.x.get()));
    return 0;
}
`;

    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'external_multi_pragma');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('x=10');
  });
});
