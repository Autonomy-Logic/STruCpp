/**
 * STruC++ Integration Tests
 *
 * End-to-end tests for the complete compilation pipeline.
 */

import { describe, it, expect } from 'vitest';
import { compile, parse, getVersion, defaultOptions } from '../../src/index.js';

describe('STruC++ Compiler', () => {
  describe('getVersion', () => {
    it('should return version string', () => {
      const version = getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('defaultOptions', () => {
    it('should have sensible defaults', () => {
      expect(defaultOptions.debug).toBe(false);
      expect(defaultOptions.lineMapping).toBe(true);
      expect(defaultOptions.optimizationLevel).toBe(0);
    });
  });

  describe('compile', () => {
    it('should return a result object', () => {
      const result = compile('');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('cppCode');
      expect(result).toHaveProperty('headerCode');
      expect(result).toHaveProperty('lineMap');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    it('should compile a simple program successfully', () => {
      const result = compile('PROGRAM Main END_PROGRAM');
      // Phase 2.1: Compiler now generates code for programs
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('Program_MAIN');
    });

    it('should accept compilation options', () => {
      const result = compile('PROGRAM Main END_PROGRAM', {
        debug: true,
        lineMapping: false,
      });
      expect(result).toBeDefined();
    });

    it('should compile CODESYS-style chained assignment (a := b := expr)', () => {
      // Used by OSCAT (e.g. BOILER: `flag_0 := boost_mode := FALSE;`). Desugars to a
      // right-to-left cascade so every target receives the value: b := expr; a := b.
      const result = compile(
        'FUNCTION_BLOCK FB\n' +
          'VAR a : BOOL; b : BOOL; c : INT; d : INT; END_VAR\n' +
          'a := b := FALSE;\n' +
          'c := d := 5;\n' +
          'END_FUNCTION_BLOCK',
      );
      expect(result.errors).toHaveLength(0);
      expect(result.success).toBe(true);
      const body = result.cppCode.replace(/\s+/g, ' ');
      // cascade: rightmost target gets the value first, then propagates left.
      expect(body).toContain('B = false;');
      expect(body).toContain('A = B;');
      expect(body).toContain('D = 5;');
      expect(body).toContain('C = D;');
    });

    it('should evaluate a chained-assignment RHS once into the rightmost target', () => {
      // a := b := c := 7  →  c := 7; b := c; a := b  (three targets, one value)
      const result = compile(
        'FUNCTION_BLOCK FB\n' +
          'VAR a : INT; b : INT; c : INT; END_VAR\n' +
          'a := b := c := 7;\n' +
          'END_FUNCTION_BLOCK',
      );
      expect(result.success).toBe(true);
      const body = result.cppCode.replace(/\s+/g, ' ');
      expect(body).toContain('C = 7;');
      expect(body).toContain('B = C;');
      expect(body).toContain('A = B;');
    });
  });
});

describe('Phase 2.1 - Project Structure Tests', () => {
  describe('Configuration and Resource', () => {
    it('should compile a configuration with resource', () => {
      const source = `
        CONFIGURATION MyConfig
          RESOURCE MyResource ON PLC
            TASK MainTask(INTERVAL := T#10ms, PRIORITY := 1);
            PROGRAM MainInstance WITH MainTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('Configuration_MYCONFIG');
      expect(result.headerCode).toContain('Program_MAIN');
    });

    it('should compile multiple resources in a configuration', () => {
      const source = `
        CONFIGURATION MultiResourceConfig
          RESOURCE Resource1 ON PLC
            TASK Task1(INTERVAL := T#100ms);
            PROGRAM Prog1 WITH Task1 : Main;
          END_RESOURCE
          RESOURCE Resource2 ON PLC
            TASK Task2(INTERVAL := T#50ms);
            PROGRAM Prog2 WITH Task2 : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('Configuration_MULTIRESOURCECONFIG');
    });
  });

  describe('VAR_GLOBAL and VAR_EXTERNAL', () => {
    it('should compile program with VAR_GLOBAL', () => {
      const source = `
        CONFIGURATION GlobalConfig
          VAR_GLOBAL
            globalCounter : INT;
            globalFlag : BOOL;
          END_VAR
          RESOURCE MainResource ON PLC
            TASK MainTask(INTERVAL := T#10ms);
            PROGRAM MainInstance WITH MainTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
          VAR_EXTERNAL
            globalCounter : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('GLOBALCOUNTER');
    });

    it('should compile program with VAR_GLOBAL CONSTANT', () => {
      const source = `
        CONFIGURATION ConstConfig
          VAR_GLOBAL CONSTANT
            MAX_VALUE : INT := 100;
          END_VAR
          RESOURCE MainResource ON PLC
            PROGRAM MainInstance : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile program with VAR_GLOBAL RETAIN', () => {
      const source = `
        CONFIGURATION RetainConfig
          VAR_GLOBAL RETAIN
            persistentValue : INT;
          END_VAR
          RESOURCE MainResource ON PLC
            PROGRAM MainInstance : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Task Scheduling', () => {
    it('should compile task with INTERVAL property', () => {
      const source = `
        CONFIGURATION TaskConfig
          RESOURCE MainResource ON PLC
            TASK PeriodicTask(INTERVAL := T#100ms);
            PROGRAM MainInstance WITH PeriodicTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile task with PRIORITY property', () => {
      const source = `
        CONFIGURATION PriorityConfig
          RESOURCE MainResource ON PLC
            TASK HighPriorityTask(PRIORITY := 1);
            TASK LowPriorityTask(PRIORITY := 10);
            PROGRAM HighProg WITH HighPriorityTask : Main;
            PROGRAM LowProg WITH LowPriorityTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile program instance without task assignment', () => {
      const source = `
        CONFIGURATION NoTaskConfig
          RESOURCE MainResource ON PLC
            TASK DefaultTask(INTERVAL := T#10ms);
            PROGRAM MainInstance : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Should have a warning about no task assignment
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Program Variables', () => {
    it('should compile program with VAR block', () => {
      const source = `
        PROGRAM Main
          VAR
            localVar : INT;
            anotherVar : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerCode).toContain('Program_MAIN');
    });

    it('should compile program with initialized variables', () => {
      const source = `
        PROGRAM Main
          VAR
            counter : INT := 0;
            flag : BOOL := TRUE;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should compile program with VAR CONSTANT', () => {
      const source = `
        PROGRAM Main
          VAR CONSTANT
            MAX_COUNT : INT := 100;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Time Literals', () => {
    it('should parse millisecond time literals', () => {
      const source = `
        CONFIGURATION TimeConfig
          RESOURCE MainResource ON PLC
            TASK FastTask(INTERVAL := T#1ms);
            PROGRAM MainInstance WITH FastTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should parse second time literals', () => {
      const source = `
        CONFIGURATION TimeConfig
          RESOURCE MainResource ON PLC
            TASK SlowTask(INTERVAL := T#1s);
            PROGRAM MainInstance WITH SlowTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should parse minute time literals', () => {
      const source = `
        CONFIGURATION TimeConfig
          RESOURCE MainResource ON PLC
            TASK VerySlowTask(INTERVAL := T#1m);
            PROGRAM MainInstance WITH VerySlowTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });
  });
});

describe('Error Handling Tests', () => {
  describe('Parse Errors', () => {
    it('should report syntax errors for invalid program', () => {
      const source = `
        PROGRAM Main
          VAR x : ; END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty input gracefully', () => {
      const result = compile('');
      // Empty input is valid - produces boilerplate output with empty namespace
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('namespace strucpp');
      expect(result.headerCode).toContain('namespace strucpp');
    });

    it('should report error for incomplete configuration', () => {
      const source = `
        CONFIGURATION MyConfig
          RESOURCE MyResource ON PLC
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
    });

    it('should report error for missing program definition', () => {
      const source = `
        CONFIGURATION MyConfig
          RESOURCE MyResource ON PLC
            PROGRAM MainInstance : NonExistentProgram;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
    });
  });

  describe('VAR_EXTERNAL Validation', () => {
    it('should report error for VAR_EXTERNAL without matching VAR_GLOBAL', () => {
      const source = `
        CONFIGURATION MyConfig
          VAR_GLOBAL
            globalVar : INT;
          END_VAR
          RESOURCE MyResource ON PLC
            PROGRAM MainInstance : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
          VAR_EXTERNAL
            nonExistentVar : INT;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('NONEXISTENTVAR'))).toBe(true);
    });

    it('should report error for VAR_EXTERNAL with type mismatch', () => {
      const source = `
        CONFIGURATION MyConfig
          VAR_GLOBAL
            globalVar : INT;
          END_VAR
          RESOURCE MyResource ON PLC
            PROGRAM MainInstance : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
          VAR_EXTERNAL
            globalVar : BOOL;
          END_VAR
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('Type mismatch'))).toBe(true);
    });
  });

  // Shared globals use a per-global-mutex model: each CONFIGURATION VAR_GLOBAL
  // is a GlobalVar<V> (value + mutex) and each VAR_EXTERNAL is a pointer to it.
  // Scalars get full read()/write() codegen; composite globals (struct / array
  // / function-block) can be declared + debugged but their in-body access is
  // gated (fail-loud) until locked field/element/call codegen lands.
  describe('Shared globals (mutex model)', () => {
    it('compiles a scalar located shared global end-to-end', () => {
      const source = `
        PROGRAM Main
          VAR_EXTERNAL run AT %QX0.0 : BOOL; END_VAR
          VAR seed : BOOL := TRUE; END_VAR
          run := seed;
        END_PROGRAM

        CONFIGURATION Config0
          VAR_GLOBAL run AT %QX0.0 : BOOL; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Scalar external access is rewritten through the GlobalVar pointer.
      expect(result.cppCode).toContain('RUN->write(');
      // The config global is a GlobalVar<V> member and the located image binds
      // through its `.value`.
      expect(result.headerCode).toContain('GlobalVar<IEC_BOOL> RUN;');
      expect(result.cppCode).toContain('RUN.value.raw_ptr()');
    });

    it('allows declaring a composite (struct) shared global', () => {
      const source = `
        TYPE Point : STRUCT x : INT; y : INT; END_STRUCT END_TYPE
        PROGRAM Main
          VAR_EXTERNAL pt : Point; END_VAR
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL pt : Point; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('reads a composite shared global field via the canonical value pointer', () => {
      // Composite shared globals are accessed directly through the GlobalVar
      // pointer's `->value` (single-task access; used by SoftMotion axes).
      const source = `
        TYPE Point : STRUCT x : INT; y : INT; END_STRUCT END_TYPE
        PROGRAM Main
          VAR_EXTERNAL pt : Point; END_VAR
          VAR v : INT; END_VAR
          v := pt.x;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL pt : Point; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('PT->value.X');
    });

    it('writes a composite shared global field via the canonical value pointer', () => {
      const source = `
        TYPE Point : STRUCT x : INT; y : INT; END_STRUCT END_TYPE
        PROGRAM Main
          VAR_EXTERNAL pt : Point; END_VAR
          pt.x := 3;
        END_PROGRAM
        CONFIGURATION Config0
          VAR_GLOBAL pt : Point; END_VAR
          RESOURCE Res0 ON PLC
            TASK t(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM p WITH t : Main;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('PT->value.X = ');
    });
  });

  describe('Task Validation', () => {
    it('should report error for undefined task reference', () => {
      const source = `
        CONFIGURATION MyConfig
          RESOURCE MyResource ON PLC
            PROGRAM MainInstance WITH NonExistentTask : Main;
          END_RESOURCE
        END_CONFIGURATION

        PROGRAM Main
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('NONEXISTENTTASK'))).toBe(true);
    });
  });
});

describe('Parse Function Tests', () => {

  it('should return errors for invalid syntax', () => {
    const result = parse('PROGRAM Main VAR x : ; END_VAR END_PROGRAM');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should parse empty input', () => {
    const result = parse('');
    expect(result).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

});

describe('Complex Program Tests', () => {

  it('should parse configuration with VAR_GLOBAL and programs with VAR_EXTERNAL', () => {
    const source = `
      CONFIGURATION CompleteConfig
        VAR_GLOBAL
          sharedCounter : INT := 0;
          sharedFlag : BOOL := FALSE;
        END_VAR
        
        RESOURCE MainResource ON PLC
          TASK FastTask(INTERVAL := T#10ms, PRIORITY := 1);
          TASK SlowTask(INTERVAL := T#100ms, PRIORITY := 2);
          PROGRAM FastProgram WITH FastTask : FastProg;
          PROGRAM SlowProgram WITH SlowTask : SlowProg;
        END_RESOURCE
      END_CONFIGURATION
      
      PROGRAM FastProg
        VAR_EXTERNAL
          sharedCounter : INT;
        END_VAR
        VAR local : INT; END_VAR
        local := sharedCounter + 1;
      END_PROGRAM
      
      PROGRAM SlowProg
        VAR_EXTERNAL
          sharedFlag : BOOL;
        END_VAR
        VAR temp : BOOL; END_VAR
        temp := sharedFlag;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
  });

});

describe('Compiler Options Tests', () => {
  it('should accept debug option', () => {
    const result = compile('PROGRAM Main END_PROGRAM', { debug: true });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should accept lineMapping option', () => {
    const result = compile('PROGRAM Main END_PROGRAM', { lineMapping: false });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should accept optimizationLevel option', () => {
    const result = compile('PROGRAM Main END_PROGRAM', { optimizationLevel: 2 });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should accept all options together', () => {
    const result = compile('PROGRAM Main END_PROGRAM', {
      debug: true,
      lineMapping: true,
      optimizationLevel: 1,
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

describe('External Code Pragma Tests (Phase 2.8)', () => {
  describe('compile with external pragma', () => {
    it('should compile program with external pragma', () => {
      const source = `
        PROGRAM Main
          VAR x : INT; END_VAR
          {external printf("x = %d", x); }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should include external code in generated output', () => {
      const source = `
        PROGRAM Main
          {external printf("Hello from C++"); }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('printf("Hello from C++")');
    });

    it('should preserve nested braces in external code', () => {
      const source = `
        PROGRAM Main
          {external
            if (x > 0) {
              y = x;
            }
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('if (x > 0)');
      expect(result.cppCode).toContain('y = x;');
    });

    it('should compile multiple external pragmas', () => {
      const source = `
        PROGRAM Main
          {external int a = 1; }
          {external int b = 2; }
          {external int c = a + b; }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('int a = 1;');
      expect(result.cppCode).toContain('int b = 2;');
      expect(result.cppCode).toContain('int c = a + b;');
    });

    it('should compile external pragma in function', () => {
      const source = `
        FUNCTION AddWithLog : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          {external printf("AddWithLog called"); }
          AddWithLog := a + b;
        END_FUNCTION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('printf("AddWithLog called")');
    });

    it('should compile external pragma in function block', () => {
      const source = `
        FUNCTION_BLOCK Logger
          VAR_INPUT message : INT; END_VAR
          {external std::cout << "FB executed" << std::endl; }
        END_FUNCTION_BLOCK
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('std::cout << "FB executed"');
    });

    it('should handle external pragma with C++ comments', () => {
      const source = `
        PROGRAM Main
          {external
            // This is a C++ comment
            int x = 10;
            /* Multi-line
               comment */
            int y = 20;
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('// This is a C++ comment');
      expect(result.cppCode).toContain('int x = 10;');
      expect(result.cppCode).toContain('int y = 20;');
    });

    it('should handle external pragma with string containing braces', () => {
      const source = `
        PROGRAM Main
          {external printf("braces: {} and more {}"); }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('printf("braces: {} and more {}")');
    });

    it('should handle deeply nested C++ code structures', () => {
      const source = `
        PROGRAM Main
          {external
            void processData() {
              if (condition) {
                while (running) {
                  for (int i = 0; i < 10; i++) {
                    if (data[i] > 0) {
                      result += data[i];
                    }
                  }
                }
              }
            }
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('void processData()');
      expect(result.cppCode).toContain('if (condition)');
      expect(result.cppCode).toContain('while (running)');
      expect(result.cppCode).toContain('for (int i = 0; i < 10; i++)');
    });

    it('should handle C++ class/struct definitions', () => {
      const source = `
        PROGRAM Main
          {external
            struct SensorData {
              int id;
              float value;
              SensorData(int i, float v) : id(i), value(v) {}
            };
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('struct SensorData');
      expect(result.cppCode).toContain('int id;');
      expect(result.cppCode).toContain('float value;');
    });

    it('should handle C++ lambda expressions', () => {
      const source = `
        PROGRAM Main
          {external
            auto callback = [](int x) { return x * 2; };
            auto complex = [&](int a, int b) {
              return a + b;
            };
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('auto callback = [](int x) { return x * 2; };');
      expect(result.cppCode).toContain('auto complex = [&](int a, int b)');
    });

    it('should handle C++ template usage', () => {
      const source = `
        PROGRAM Main
          {external
            std::vector<int> numbers;
            std::map<std::string, std::vector<int>> data;
            numbers.push_back(42);
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('std::vector<int> numbers');
      expect(result.cppCode).toContain('std::map<std::string, std::vector<int>> data');
    });

    it('should handle empty external pragma', () => {
      const source = `
        PROGRAM Main
          {external }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
    });

    it('should handle preprocessor directives', () => {
      const source = `
        PROGRAM Main
          {external
            #ifdef ARDUINO
            analogWrite(PWM_PIN, speed);
            #else
            printf("Not on Arduino\\n");
            #endif
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('#ifdef ARDUINO');
      expect(result.cppCode).toContain('#endif');
    });

    it('should place external code inside run() method', () => {
      const source = `
        PROGRAM TestPlacement
          {external int localVar = 42; }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      // Verify code appears after run() { and before closing }
      const runMethodMatch = result.cppCode?.match(/void Program_TESTPLACEMENT::run\(\)\s*\{([^}]*int localVar = 42;[^}]*)\}/);
      expect(runMethodMatch).not.toBeNull();
    });

    it('should handle real-world OpenPLC-style hardware access pattern', () => {
      const source = `
        PROGRAM HardwareControl
          VAR
            motorSpeed : INT;
            sensorInput : INT;
          END_VAR

          {external
            // Direct hardware access
            #ifdef ARDUINO
            int rawValue = analogRead(A0);
            sensorInput.set(rawValue);
            analogWrite(PWM_PIN, motorSpeed.get());
            #endif
          }
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.cppCode).toContain('analogRead(A0)');
      expect(result.cppCode).toContain('sensorInput.set(rawValue)');
      expect(result.cppCode).toContain('motorSpeed.get()');
    });
  });

  describe('error cases', () => {
    it('should fail to compile with unclosed external pragma', () => {
      const source = `
        PROGRAM Main
          {external printf("test");
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail to compile with unclosed nested braces in external pragma', () => {
      const source = `
        PROGRAM Main
          {external if (x) { y = 1; }
        END_PROGRAM
      `;
      // The pragma consumes up to the first unmatched }, leaving the rest unparseable
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail to compile with completely unclosed external pragma', () => {
      const source = `
        PROGRAM Main
          {external int x = 0;
      `;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('AST representation', () => {
    it('should create ExternalCodePragma AST node', () => {
      const source = `
        PROGRAM Main
          {external printf("test"); }
        END_PROGRAM
      `;
      const result = parse(source);
      expect(result.ast).toBeDefined();
      expect(result.errors).toHaveLength(0);

      // Check that the program has a body with the external pragma
      const program = result.ast?.programs[0];
      expect(program).toBeDefined();
      expect(program?.body).toHaveLength(1);
      expect(program?.body[0]?.kind).toBe('ExternalCodePragma');
    });

    it('should extract code content correctly', () => {
      const source = `
        PROGRAM Main
          {external int x = 42; }
        END_PROGRAM
      `;
      const result = parse(source);
      const program = result.ast?.programs[0];
      const pragma = program?.body[0];

      expect(pragma?.kind).toBe('ExternalCodePragma');
      if (pragma?.kind === 'ExternalCodePragma') {
        expect(pragma.code).toContain('int x = 42;');
      }
    });
  });
});

describe('Future Integration Tests', () => {
  // These tests are placeholders for Phase 3+ when the compiler is implemented

  it.skip('should compile a simple program', () => {
    const source = `
      PROGRAM Main
        VAR counter : INT; END_VAR
        counter := counter + 1;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('class Program_MAIN');
  });

  it.skip('should compile a function', () => {
    const source = `
      FUNCTION Add : INT
        VAR_INPUT a, b : INT; END_VAR
        Add := a + b;
      END_FUNCTION
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('IEC_INT ADD(');
  });

  it.skip('should compile a function block', () => {
    const source = `
      FUNCTION_BLOCK Counter
        VAR_INPUT enable : BOOL; END_VAR
        VAR_OUTPUT count : INT; END_VAR
        VAR internal : INT; END_VAR
        IF enable THEN
          internal := internal + 1;
          count := internal;
        END_IF;
      END_FUNCTION_BLOCK
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain('class COUNTER');
  });

  it.skip('should generate line mapping', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 1;
        x := x + 1;
      END_PROGRAM
    `;
    const result = compile(source, { lineMapping: true });
    expect(result.success).toBe(true);
    expect(result.lineMap.size).toBeGreaterThan(0);
  });

  it.skip('should report syntax errors', () => {
    const source = `
      PROGRAM Main
        VAR x : ; END_VAR
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.skip('should report type errors', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; y : STRING; END_VAR
        x := y;
      END_PROGRAM
    `;
    const result = compile(source);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('type'))).toBe(true);
  });
});
