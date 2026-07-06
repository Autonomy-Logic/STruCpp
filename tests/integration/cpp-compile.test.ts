/**
 * STruC++ C++ Compilation Tests
 *
 * These tests verify that the generated C++ code actually compiles
 * with a C++ compiler (g++). This ensures the generated code is
 * syntactically correct and links properly with the runtime library.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
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

  it('compiles composite/array shared-global access (with_lock) — threaded and non-threaded', () => {
    // A struct + array-of-struct global exercised via field/bit/element/FB-inout
    // access, all routed through GlobalVar::with_lock. Must compile both with the
    // per-global mutex active (-DSTRUCPP_THREADED) and with it compiled out.
    const source = `
      TYPE Item : STRUCT v : INT; END_STRUCT END_TYPE
      TYPE Cplx : STRUCT
        x : INT;
        cw : UINT;
        nums : ARRAY[1..4] OF INT;
        items : ARRAY[1..3] OF Item;
      END_STRUCT END_TYPE
      FUNCTION_BLOCK Touch VAR_IN_OUT a : Cplx; END_VAR a.x := a.x + 1; END_FUNCTION_BLOCK
      PROGRAM Main
        VAR_EXTERNAL g : Cplx; END_VAR
        VAR i : INT; v : INT; b : BOOL; t : Touch; END_VAR
        v := g.x;
        g.x := v + 1;
        g.cw.3 := b;
        b := g.cw.5;
        g.nums[i] := v;
        v := g.items[i].v;
        t(a := g);
      END_PROGRAM
      CONFIGURATION Config0
        VAR_GLOBAL g : Cplx; END_VAR
        RESOURCE Res0 ON PLC
          TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
          TASK task1(INTERVAL := T#10ms, PRIORITY := 2);
          PROGRAM inst0 WITH task0 : Main;
          PROGRAM inst1 WITH task1 : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('->with_lock(');

    const runtimeInclude = path.resolve(__dirname, '../../src/runtime/include');
    const hpp = path.join(tempDir, 'generated.hpp');
    const cpp = path.join(tempDir, 'composite_global.cpp');
    fs.writeFileSync(hpp, result.headerCode);
    fs.writeFileSync(cpp, `${result.cppCode}\n\nint main(){ return 0; }\n`);

    for (const threaded of [false, true]) {
      const flag = threaded ? '-DSTRUCPP_THREADED' : '';
      const out = path.join(tempDir, `composite_global_${threaded}.out`);
      let ok = true;
      let diag = '';
      try {
        execSync(`g++ -std=c++17 ${flag} -I"${runtimeInclude}" "${cpp}" -o "${out}"`, {
          stdio: 'pipe',
        });
      } catch (e) {
        ok = false;
        diag = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
      }
      expect(ok, `g++ ${threaded ? 'threaded' : 'non-threaded'} failed:\n${diag}`).toBe(true);
    }
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

  /**
   * Regression: ADD_TIME (and the rest of the IEC TIME / DATE / DT / TOD
   * standard functions) used to fail at the C++ compile step with
   * `'ADD_TIME' was not declared in this scope` — `iec_std_lib.hpp`
   * didn't transitively pull in `iec_time.hpp`, so the symbol was
   * never reachable from the generated `pou_*.cpp` TUs that did
   * `#include "generated.hpp"`.  A deeper bug followed: the time-
   * family functions were templated on `TimeValue<T>` (a dead value
   * class) instead of `IECVar<T>` (the wrapper codegen actually emits
   * for TIME variables), so even with the include in place the
   * overload couldn't bind.  Both branches are fixed; this test pins
   * the end-to-end behaviour on the canonical IECVar surface.
   *
   * See https://github.com/Autonomy-Logic/STruCpp/pull/<TBD> for the
   * full diagnosis.
   */
  it('compiles IEC TIME / DATE / DT / TOD standard arithmetic (regression)', () => {
    const source = `
      FUNCTION_BLOCK Scheduler
        VAR_INPUT
          enable : BOOL;
        END_VAR
        VAR_OUTPUT
          elapsed     : TIME;
          next_day    : DATE;
          next_moment : DATE_AND_TIME;
          next_tod    : TIME_OF_DAY;
          duration_s  : LINT;
        END_VAR
        VAR
          base_time : TIME := T#5s;
          one_hour  : TIME := T#1h;
          today     : DATE;
          moment    : DATE_AND_TIME;
          now       : TIME_OF_DAY;
        END_VAR
        IF enable THEN
          elapsed     := ADD_TIME(base_time, one_hour);
          next_day    := ADD_DATE(today, 1);
          next_moment := ADD_DT(moment, T#1h);
          next_tod    := ADD_TOD(now, T#30m);
          duration_s  := TIME_TO_S(elapsed);
        END_IF;
      END_FUNCTION_BLOCK

      PROGRAM main
        VAR sched : Scheduler; END_VAR
        sched(enable := TRUE);
      END_PROGRAM

      CONFIGURATION cfg
        RESOURCE res ON cpu
          TASK fast(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM mainInst WITH fast : main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    // The fix lives in `iec_std_lib.hpp` (it now transitively includes
    // the time-family headers).  Generated header still emits the same
    // single include, so the regression guard is that the resulting
    // C++ compiles — not that the include list changed shape.
    expect(result.headerCode).toContain('#include "iec_std_lib.hpp"');

    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'iec_time_date_dt_tod_arith');
    expect(cppResult.success).toBe(true);
    if (!cppResult.success) {
      // Surface the g++ diagnostic so the failure mode is obvious if
      // this test ever regresses.
      console.error(cppResult.error);
    }
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
    expect(result.headerCode).toContain('Array1D<IEC_INT, 3, 7>');

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
    expect(result.headerCode).toContain('Array1D<IEC_REAL, 1, 10>');

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
    expect(result.headerCode).toContain('Array2D<IEC_DINT, 1, 3, 5, 8>');

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
    expect(result.headerCode).toContain('Array3D<IEC_SINT, 1, 2, 3, 5, 10, 12>');

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
    expect(result.cppCode).toContain('M.at(0, 0)');
    expect(result.cppCode).toContain('M.at(1, 2)');
    expect(result.cppCode).toContain('M.at(I, J)');

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
    expect(result.cppCode).toContain('ROW.at(1)');
    expect(result.cppCode).toContain('GRID.at(1, 1)');
    expect(result.cppCode).toContain('GRID.at(I, I)');

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

  // ---------------------------------------------------------------------------
  // References (REF_TO / REFERENCE TO)
  // ---------------------------------------------------------------------------

  it('compiles REF_TO: declare, := REF(), and ^ read/write', () => {
    const source = `
      PROGRAM Main
        VAR
          v1 : INT;
          v2 : INT := 7;
          rv : REF_TO INT;
        END_VAR
        rv := REF(v2);
        rv^ := 12;
        v1 := rv^;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain('IEC_REF_TO<INT_t>');
    expect(result.headerCode).toContain('#include "iec_pointer.hpp"');
    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'ref_to_basic');
    expect(cppResult.success).toBe(true);
  });

  it('compiles REFERENCE_TO: declare, REF= bind, implicit read/write', () => {
    const source = `
      PROGRAM Main
        VAR
          target : INT := 10;
          other : INT := 99;
          myref : REFERENCE_TO INT;
          x : INT;
        END_VAR
        myref REF= target;
        myref := 42;
        x := myref;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain('IEC_REFERENCE_TO<INT_t>');
    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'reference_to_basic');
    expect(cppResult.success).toBe(true);
  });

  it('compiles a FUNCTION_BLOCK with a REF_TO input rebound via REF= (link_reference)', () => {
    // Regression: a REF_TO target lowers REF= to `= REF(src)` (IEC_REF_TO has
    // no bind()), not `.bind()`. Previously emitted IEC_INT + .bind() -> error.
    const source = `
      FUNCTION_BLOCK link_reference
        VAR_INPUT
          ref_in : REF_TO INT;
          var_in : INT;
        END_VAR
        ref_in REF= var_in;
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain('IEC_REF_TO<INT_t>');
    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'fb_ref_to_input');
    expect(cppResult.success).toBe(true);
  });

  it('compiles the REF_LINK block (assignment + graphical EN/IN/ENO call forms)', () => {
    // REF_LINK is the callable form of the REF() operator (REF is a reserved
    // token and cannot take the EN/IN/ENO block-call form). It lowers to
    // REF(x); assigning to a REF_TO variable binds it.
    const source = `
      PROGRAM Main
        VAR
          another_var : INT := 43;
          ref_a : REF_TO INT;
          ref_b : REF_TO INT;
          done_b : BOOL;
          result : INT;
        END_VAR
        ref_a := REF_LINK(another_var);
        ref_b := REF_LINK(EN := TRUE, IN := another_var, ENO => done_b);
        ref_a^ := 100;
        result := ref_b^;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('REF(ANOTHER_VAR)');
    const cppResult = compileWithGpp(result.headerCode, result.cppCode, 'ref_link_block');
    expect(cppResult.success).toBe(true);
  });

  // Regression: codegen/runtime gaps surfaced compiling the full OSCAT building
  // library all the way to a binary.

  it('compiles STRING_TO_TIME / TOD / DATE / DT (string-parse conversions)', () => {
    // OSCAT's TIMER_EVENT_DECODE parses time/tod literals out of a string; the
    // runtime previously only had numeric TO_TIME (static_cast<long long>(string)
    // failed to compile).
    const source = `
      FUNCTION_BLOCK ParseFB
        VAR
          dur : STRING;
          t : TIME; tod : TOD; d : DATE; dt : DT;
        END_VAR
        t := STRING_TO_TIME(dur);
        tod := STRING_TO_TOD(dur);
        d := STRING_TO_DATE(dur);
        dt := STRING_TO_DT(dur);
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.errors).toHaveLength(0);
    const cpp = compileWithGpp(result.headerCode, result.cppCode, 'string_to_time');
    expect(cpp.success, cpp.error).toBe(true);
  });

  it('compiles a 2D array with an aggregate initializer', () => {
    // OSCAT's WATER_CP/WATER_ENTHALPY use `ARRAY[1..3,0..1] OF REAL := [..]`;
    // IEC_ARRAY_2D needed a flat (row-major) initializer-list constructor.
    const source = `
      FUNCTION Lookup : REAL
        VAR
          DATA : ARRAY[1..3,0..1] OF REAL := [0.0, 4.2, 10.0, 4.19, 20.0, 4.18];
        END_VAR
        Lookup := DATA[2,1];
      END_FUNCTION
    `;
    const result = compile(source);
    expect(result.errors).toHaveLength(0);
    const cpp = compileWithGpp(result.headerCode, result.cppCode, 'array2d_init');
    expect(cpp.success, cpp.error).toBe(true);
  });

  it('compiles an FB member whose type is shadowed by a sibling member', () => {
    // OSCAT's F_LAMP has both `ONTIME : UDINT` and `RUNTIME : ONTIME` (an FB);
    // the data member ONTIME hides the type, so the declaration needs an
    // elaborated `class` specifier.
    const source = `
      FUNCTION_BLOCK ONTIME
        VAR_OUTPUT done : BOOL; END_VAR
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK Uses
        VAR
          ONTIME : UDINT;
          RUNTIME : ONTIME;
        END_VAR
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.errors).toHaveLength(0);
    const cpp = compileWithGpp(result.headerCode, result.cppCode, 'member_shadows_type');
    expect(cpp.success, cpp.error).toBe(true);
  });

  it('compiles an ST identifier that collides with a C stdlib macro', () => {
    // OSCAT's T_AVG24 declares `TMP_MAX`, which <cstdio> #defines.
    const source = `
      FUNCTION_BLOCK MacroName
        VAR TMP_MAX : INT; END_VAR
        TMP_MAX := 5;
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.errors).toHaveLength(0);
    const cpp = compileWithGpp(result.headerCode, result.cppCode, 'macro_collision');
    expect(cpp.success, cpp.error).toBe(true);
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

  // Regression: NOT() over a comparison expression. IECVar's `==` returns
  // a raw `bool`, so `NOT(a == b)` instantiates the primary template with
  // T = bool. The bitwise path (`~bool` → integer-promoted `~1 == -2` →
  // back to bool == true) used to swallow both polarities and return
  // `true` regardless of inputs, so any IF NOT(a = b) THEN body fired
  // unconditionally. Fixed by adding a raw-bool specialization that uses
  // logical `!`.
  it('NOT(comparison) returns the correct boolean', () => {
    const source = `
      PROGRAM Main
        VAR a : INT := 5; END_VAR
        VAR b : INT := 5; END_VAR
        VAR c : INT := 7; END_VAR
        VAR equal_pos : BOOL; END_VAR
        VAR equal_neg : BOOL; END_VAR

        equal_pos := NOT (a = b);   (* a == b → NOT(true) → false *)
        equal_neg := NOT (a = c);   (* a != c → NOT(false) → true *)
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);

    const mainCode = `
#include <cstdio>
int main() {
    strucpp::Program_MAIN prog;
    prog.run();
    std::cout << "pos=" << static_cast<int>(prog.EQUAL_POS.get()) << std::endl;
    std::cout << "neg=" << static_cast<int>(prog.EQUAL_NEG.get()) << std::endl;
    return 0;
}
`;
    const runResult = compileAndRun(result.headerCode, result.cppCode, mainCode, 'not_comparison');
    expect(runResult.success).toBe(true);
    expect(runResult.output).toContain('pos=0');
    expect(runResult.output).toContain('neg=1');
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

/**
 * Pin the cross-sign-class semantics of the comparison templates in
 * iec_std_lib.hpp. C++ usual arithmetic conversions promote the signed
 * operand to unsigned when the unsigned operand is wider-or-equal — so
 * `EQ(IEC_UINT(0xFFFF), -1)` is TRUE because -1 wraps to 0xFFFF before
 * the compare. The templates intentionally don't insert a guard against
 * this: see the doc comment on `enable_if_two_elementary` for why.
 *
 * If anyone tightens the comparators (e.g. adds a `same-sign-class`
 * static_assert), these expectations flip and the change becomes a
 * deliberate one rather than a silent behavior shift.
 */
describeIfGpp('iec_std_lib comparison sign-class semantics', () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-cmpsign-test-'));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('mixed-sign comparisons follow C++ usual arithmetic conversions', () => {
    // Wrapping is only observable when the unsigned operand has rank >=
    // int, since otherwise both sides promote up to int and the compare
    // happens in signed land. Use UDINT (uint32_t) where the rank ties
    // and the signed operand converts to unsigned.
    const mainCode = `
int main() {
    using namespace strucpp;
    IEC_UDINT u_max = IEC_UDINT(0xFFFFFFFFu);
    IEC_DINT  neg_one = -1;
    IEC_UDINT zero_u = 0;

    // -1 promotes to UDINT (uint32_t) = 0xFFFFFFFF, so EQ is TRUE.
    std::cout << "eq_max_neg=" << static_cast<int>(EQ(u_max, neg_one)) << std::endl;
    std::cout << "ne_max_neg=" << static_cast<int>(NE(u_max, neg_one)) << std::endl;

    // For (zero_u, -1): -1 -> 0xFFFFFFFF, so 0 < 0xFFFFFFFF -> LT is TRUE,
    // 0 > 0xFFFFFFFF -> GT is FALSE. Counterintuitive vs. mathematical
    // ordering, which is exactly the foot-gun the doc warns about.
    std::cout << "lt_zero_neg=" << static_cast<int>(LT(zero_u, neg_one)) << std::endl;
    std::cout << "gt_zero_neg=" << static_cast<int>(GT(zero_u, neg_one)) << std::endl;

    // For UINT (uint16_t) vs INT, both sides promote up to int and the
    // compare is signed — no wrap, intuitive answers.
    IEC_UINT u16_max = IEC_UINT(0xFFFF);
    IEC_INT  neg_int = -1;
    std::cout << "eq_uint_neg=" << static_cast<int>(EQ(u16_max, neg_int)) << std::endl;
    return 0;
}
`;
    const stdout = compileAndRunHelper({
      tempDir,
      pchPath,
      headerCode: '',
      cppCode: '',
      testName: 'cmp_sign_class',
      mainCode,
    });
    // Wrapping cases (UDINT vs signed)
    expect(stdout).toContain('eq_max_neg=1');
    expect(stdout).toContain('ne_max_neg=0');
    expect(stdout).toContain('lt_zero_neg=1');
    expect(stdout).toContain('gt_zero_neg=0');
    // Non-wrapping case (UINT vs INT — both promote to int)
    expect(stdout).toContain('eq_uint_neg=0');
  });
});

/**
 * Codegen splits implementation across one TU per POU (programs, FBs,
 * functions) plus a shared `configuration.cpp`. The runtime build can
 * then run `make -j$(nproc)` and ccache can reuse .o files for unchanged
 * POUs. These tests pin the split shape so it doesn't regress and so
 * the legacy `cppCode` concatenation stays consistent with `cppFiles`.
 */
describe('Multi-file codegen output', () => {
  it('emits one TU per POU plus configuration.cpp', () => {
    const source = `
      FUNCTION_BLOCK FB_A
        VAR_INPUT x : INT; END_VAR
        VAR_OUTPUT y : INT; END_VAR
        y := x;
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK FB_B
        VAR_INPUT a : BOOL; END_VAR
        VAR_OUTPUT b : BOOL; END_VAR
        b := a;
      END_FUNCTION_BLOCK
      FUNCTION SQUARE : INT
        VAR_INPUT v : INT; END_VAR
        SQUARE := v * v;
      END_FUNCTION
      PROGRAM Main
        VAR fa : FB_A; result : INT; END_VAR
        fa(x := 3);
        result := SQUARE(v := fa.y);
      END_PROGRAM
      CONFIGURATION CONFIG0
        RESOURCE R ON PLC
          TASK T(INTERVAL := T#100ms, PRIORITY := 1);
          PROGRAM I WITH T : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    // Configuration TU + one per POU (POU names land uppercased in
    // file names because the codegen uppercases them in declarations).
    const names = result.cppFiles.map((f) => f.name).sort();
    expect(names).toEqual(
      ['configuration.cpp', 'pou_FB_A.cpp', 'pou_FB_B.cpp', 'pou_MAIN.cpp', 'pou_SQUARE.cpp'].sort(),
    );

    // Every TU must include the shared header and open the strucpp
    // namespace — splitting must not leak orphan code outside.
    for (const f of result.cppFiles) {
      expect(f.content).toContain(`#include "generated.hpp"`);
      expect(f.content).toContain('namespace strucpp {');
      expect(f.content).toMatch(/}\s+\/\/\s+namespace strucpp/);
    }

    // Each POU's body lives in its own TU, not in any other.
    const fbAContent = result.cppFiles.find((f) => f.name === 'pou_FB_A.cpp')!.content;
    const fbBContent = result.cppFiles.find((f) => f.name === 'pou_FB_B.cpp')!.content;
    expect(fbAContent).toMatch(/FB_A::/);
    expect(fbAContent).not.toMatch(/FB_B::/);
    expect(fbBContent).toMatch(/FB_B::/);
    expect(fbBContent).not.toMatch(/FB_A::/);

    // Configuration TU owns the located-vars table and the
    // configuration class implementation; per-POU TUs do not.
    const configContent = result.cppFiles.find((f) => f.name === 'configuration.cpp')!.content;
    expect(configContent).toContain('locatedVars');
    expect(fbAContent).not.toContain('LocatedVar locatedVars');

    // Legacy `cppCode` is the concatenation in emit order, with the
    // configuration TU first so consumers that scan for the
    // configuration class (REPL, library compiler) still find it.
    expect(result.cppCode.startsWith(configContent)).toBe(true);
    const concatenated = result.cppFiles.map((f) => f.content).join('\n');
    expect(result.cppCode).toBe(concatenated);
  });

  it('emits pouIncludes after the shared header in every per-POU TU', () => {
    // The editor uses this to plumb c_blocks.h through so generated POU
    // bodies that reference user-defined `<NAME>_VARS` structs and
    // `<name>_setup` / `<name>_loop` extern functions resolve at C++
    // compile time.
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := x + 1;
      END_PROGRAM
      CONFIGURATION CONFIG0
        RESOURCE R ON PLC
          TASK T(INTERVAL := T#100ms, PRIORITY := 1);
          PROGRAM I WITH T : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source, { pouIncludes: ['c_blocks.h', 'extras.h'] });
    expect(result.success).toBe(true);

    const pouFiles = result.cppFiles.filter((f) => f.name.startsWith('pou_'));
    expect(pouFiles.length).toBeGreaterThan(0);
    for (const f of pouFiles) {
      expect(f.content).toContain('#include "generated.hpp"');
      expect(f.content).toContain('#include "c_blocks.h"');
      expect(f.content).toContain('#include "extras.h"');
      // Order must be: shared header first, then extras, before namespace open.
      const headerIdx = f.content.indexOf('#include "generated.hpp"');
      const cBlocksIdx = f.content.indexOf('#include "c_blocks.h"');
      const nsIdx = f.content.indexOf('namespace strucpp');
      expect(headerIdx).toBeLessThan(cBlocksIdx);
      expect(cBlocksIdx).toBeLessThan(nsIdx);
    }
  });

  it('omits pouIncludes by default', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := x + 1;
      END_PROGRAM
      CONFIGURATION CONFIG0
        RESOURCE R ON PLC
          TASK T(INTERVAL := T#100ms, PRIORITY := 1);
          PROGRAM I WITH T : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source);
    const pouFile = result.cppFiles.find((f) => f.name.startsWith('pou_'))!;
    expect(pouFile.content).not.toContain('c_blocks.h');
  });
});
