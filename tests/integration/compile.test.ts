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
      expect(result.headerCode).toContain('Program_Main');
    });

    it('should accept compilation options', () => {
      const result = compile('PROGRAM Main END_PROGRAM', {
        debug: true,
        lineMapping: false,
      });
      expect(result).toBeDefined();
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
      expect(result.headerCode).toContain('Configuration_MyConfig');
      expect(result.headerCode).toContain('Program_Main');
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
      expect(result.headerCode).toContain('Configuration_MultiResourceConfig');
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
      expect(result.headerCode).toContain('globalCounter');
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
      expect(result.headerCode).toContain('Program_Main');
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
      expect(result.errors.some(e => e.message.includes('nonExistentVar'))).toBe(true);
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
      expect(result.errors.some(e => e.message.includes('NonExistentTask'))).toBe(true);
    });
  });
});

describe('Parse Function Tests', () => {
  it('should parse valid program and return AST', () => {
    const result = parse('PROGRAM Main END_PROGRAM');
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should return errors for invalid syntax', () => {
    const result = parse('PROGRAM Main VAR x : ; END_VAR END_PROGRAM');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should parse empty input', () => {
    const result = parse('');
    expect(result).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse configuration with resources', () => {
    const source = `
      CONFIGURATION MyConfig
        RESOURCE MyResource ON PLC
          TASK MainTask(PRIORITY := 1);
          PROGRAM MainInstance WITH MainTask : Main;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM Main
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse program with VAR blocks', () => {
    const source = `
      PROGRAM Main
        VAR
          counter : INT;
          flag : BOOL := TRUE;
        END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse program with VAR_EXTERNAL', () => {
    const source = `
      PROGRAM Main
        VAR_EXTERNAL
          globalVar : INT;
        END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Function and Function Block Parsing Tests', () => {
  it('should parse a simple function declaration', () => {
    const source = `
      FUNCTION Add : INT
        VAR_INPUT a, b : INT; END_VAR
        Add := a + b;
      END_FUNCTION
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse a function with multiple VAR blocks', () => {
    const source = `
      FUNCTION Calculate : REAL
        VAR_INPUT x : REAL; END_VAR
        VAR_OUTPUT result : REAL; END_VAR
        VAR temp : REAL; END_VAR
        temp := x * 2.0;
        result := temp;
        Calculate := result;
      END_FUNCTION
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse a function block declaration', () => {
    const source = `
      FUNCTION_BLOCK Counter
        VAR_INPUT enable : BOOL; END_VAR
        VAR_OUTPUT count : INT; END_VAR
        VAR internal : INT; END_VAR
      END_FUNCTION_BLOCK
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse a function block with statements', () => {
    const source = `
      FUNCTION_BLOCK Timer
        VAR_INPUT start : BOOL; END_VAR
        VAR_OUTPUT done : BOOL; END_VAR
        VAR elapsed : INT; END_VAR
        elapsed := elapsed + 1;
      END_FUNCTION_BLOCK
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Expression Parsing Tests', () => {
  it('should parse arithmetic expressions with addition', () => {
    const source = `
      PROGRAM Main
        VAR x, y, z : INT; END_VAR
        z := x + y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse arithmetic expressions with subtraction', () => {
    const source = `
      PROGRAM Main
        VAR x, y, z : INT; END_VAR
        z := x - y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse arithmetic expressions with multiplication', () => {
    const source = `
      PROGRAM Main
        VAR x, y, z : INT; END_VAR
        z := x * y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse arithmetic expressions with division', () => {
    const source = `
      PROGRAM Main
        VAR x, y, z : INT; END_VAR
        z := x / y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse arithmetic expressions with MOD', () => {
    const source = `
      PROGRAM Main
        VAR x, y, z : INT; END_VAR
        z := x MOD y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse power expressions', () => {
    const source = `
      PROGRAM Main
        VAR x, y : REAL; END_VAR
        y := x ** 2;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse comparison expressions', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; flag : BOOL; END_VAR
        flag := x < y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse equality expressions', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; flag : BOOL; END_VAR
        flag := x = y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse inequality expressions', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; flag : BOOL; END_VAR
        flag := x <> y;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse logical AND expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c : BOOL; END_VAR
        c := a AND b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse logical OR expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c : BOOL; END_VAR
        c := a OR b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse logical XOR expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c : BOOL; END_VAR
        c := a XOR b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse logical NOT expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b : BOOL; END_VAR
        b := NOT a;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse unary minus expressions', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; END_VAR
        y := -x;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse complex nested expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : INT; result : BOOL; END_VAR
        result := (a + b) * c > d AND (a < b OR c = d);
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse literal expressions', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; y : REAL; s : STRING; b : BOOL; END_VAR
        x := 42;
        y := 3.14;
        s := 'hello';
        b := TRUE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Chained Expression Tests', () => {
  it('should parse chained OR expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : BOOL; END_VAR
        d := a OR b OR c;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse chained XOR expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : BOOL; END_VAR
        d := a XOR b XOR c;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse chained AND expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : BOOL; END_VAR
        d := a AND b AND c;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse chained addition expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : INT; END_VAR
        d := a + b + c;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse chained multiplication expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : INT; END_VAR
        d := a * b * c;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse power expressions with parentheses', () => {
    const source = `
      PROGRAM Main
        VAR x, y : REAL; END_VAR
        y := (x ** 2) * (x ** 3);
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse all comparison operators', () => {
    const source = `
      PROGRAM Main
        VAR a, b : INT; r1, r2, r3, r4, r5, r6 : BOOL; END_VAR
        r1 := a = b;
        r2 := a <> b;
        r3 := a < b;
        r4 := a > b;
        r5 := a <= b;
        r6 := a >= b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse mixed arithmetic operators', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d, e : INT; END_VAR
        e := a + b - c * d / 2 MOD 3;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse parenthesized expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c : INT; END_VAR
        c := (a + b) * (a - b);
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse deeply nested expressions', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : INT; result : BOOL; END_VAR
        result := ((a + b) > (c - d)) AND ((a * b) < (c / d));
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Literal Types Tests', () => {
  it('should parse integer literals', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 12345;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse real literals', () => {
    const source = `
      PROGRAM Main
        VAR x : REAL; END_VAR
        x := 3.14159;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse scientific notation', () => {
    const source = `
      PROGRAM Main
        VAR x : REAL; END_VAR
        x := 1.5e10;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse boolean literals', () => {
    const source = `
      PROGRAM Main
        VAR a, b : BOOL; END_VAR
        a := TRUE;
        b := FALSE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse string literals', () => {
    const source = `
      PROGRAM Main
        VAR s : STRING; END_VAR
        s := 'Hello, World!';
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse time literals with various units', () => {
    const source = `
      CONFIGURATION TimeConfig
        RESOURCE MainResource ON PLC
          TASK Task1(INTERVAL := T#1d);
          TASK Task2(INTERVAL := T#2h);
          TASK Task3(INTERVAL := T#30m);
          TASK Task4(INTERVAL := T#45s);
          TASK Task5(INTERVAL := T#500ms);
          TASK Task6(INTERVAL := T#1000us);
          TASK Task7(INTERVAL := T#1000000ns);
          PROGRAM MainInstance WITH Task1 : Main;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM Main
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Direct Address Tests', () => {
  it('should parse direct input address', () => {
    const source = `
      PROGRAM Main
        VAR x AT %IX0.0 : BOOL; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse direct output address', () => {
    const source = `
      PROGRAM Main
        VAR y AT %QX0.0 : BOOL; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse direct memory address', () => {
    const source = `
      PROGRAM Main
        VAR m AT %MW100 : INT; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Type Declaration Tests', () => {
  it('should parse simple type declaration', () => {
    const source = `
      TYPE MyInt : INT; END_TYPE
      PROGRAM Main
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Additional Expression Edge Cases', () => {
  it('should parse greater than or equal comparison', () => {
    const source = `
      PROGRAM Main
        VAR a, b : INT; result : BOOL; END_VAR
        result := a >= b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse less than or equal comparison', () => {
    const source = `
      PROGRAM Main
        VAR a, b : INT; result : BOOL; END_VAR
        result := a <= b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse multiple statements in sequence', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c : INT; END_VAR
        a := 1;
        b := 2;
        c := a + b;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse nested IF statements', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; END_VAR
        IF x > 0 THEN
          IF y > 0 THEN
            x := x + y;
          END_IF;
        END_IF;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse nested loops', () => {
    const source = `
      PROGRAM Main
        VAR i, j, sum : INT; END_VAR
        FOR i := 1 TO 10 DO
          FOR j := 1 TO 10 DO
            sum := sum + 1;
          END_FOR;
        END_FOR;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse WHILE with complex condition', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; running : BOOL; END_VAR
        WHILE (x < 100) AND (y > 0) AND running DO
          x := x + 1;
          y := y - 1;
        END_WHILE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Multiple POU Tests', () => {
  it('should parse multiple programs', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
      END_PROGRAM

      PROGRAM Secondary
        VAR y : INT; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse program with function', () => {
    const source = `
      FUNCTION Add : INT
        VAR_INPUT a, b : INT; END_VAR
        Add := a + b;
      END_FUNCTION

      PROGRAM Main
        VAR x, y, z : INT; END_VAR
        z := Add;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse program with function block', () => {
    const source = `
      FUNCTION_BLOCK Counter
        VAR_INPUT enable : BOOL; END_VAR
        VAR_OUTPUT count : INT; END_VAR
        VAR internal : INT; END_VAR
      END_FUNCTION_BLOCK

      PROGRAM Main
        VAR myCounter : Counter; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse configuration with multiple resources', () => {
    const source = `
      CONFIGURATION MultiResource
        RESOURCE Resource1 ON PLC
          TASK Task1(PRIORITY := 1);
          PROGRAM Prog1 WITH Task1 : Main;
        END_RESOURCE
        RESOURCE Resource2 ON PLC
          TASK Task2(PRIORITY := 2);
          PROGRAM Prog2 WITH Task2 : Main;
        END_RESOURCE
      END_CONFIGURATION

      PROGRAM Main
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Variable Declaration Tests', () => {
  it('should parse multiple variables in one declaration', () => {
    const source = `
      PROGRAM Main
        VAR a, b, c, d : INT; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse VAR_INPUT block', () => {
    const source = `
      FUNCTION Test : INT
        VAR_INPUT x, y : INT; END_VAR
        Test := x + y;
      END_FUNCTION
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse VAR_OUTPUT block', () => {
    const source = `
      FUNCTION_BLOCK Test
        VAR_OUTPUT result : INT; END_VAR
      END_FUNCTION_BLOCK
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse VAR_IN_OUT block', () => {
    const source = `
      FUNCTION_BLOCK Test
        VAR_IN_OUT data : INT; END_VAR
      END_FUNCTION_BLOCK
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse VAR_TEMP block', () => {
    const source = `
      PROGRAM Main
        VAR_TEMP temp : INT; END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse variable with initialization', () => {
    const source = `
      PROGRAM Main
        VAR
          counter : INT := 0;
          flag : BOOL := TRUE;
          value : REAL := 3.14;
        END_VAR
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Control Flow Parsing Tests', () => {
  it('should parse IF-THEN-END_IF statement', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        IF x > 0 THEN
          x := x - 1;
        END_IF;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse IF-THEN-ELSE-END_IF statement', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        IF x > 0 THEN
          x := x - 1;
        ELSE
          x := x + 1;
        END_IF;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse IF-THEN-ELSIF-ELSE-END_IF statement', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        IF x > 10 THEN
          x := 10;
        ELSIF x > 5 THEN
          x := 5;
        ELSE
          x := 0;
        END_IF;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse FOR loop', () => {
    const source = `
      PROGRAM Main
        VAR i, sum : INT; END_VAR
        sum := 0;
        FOR i := 1 TO 10 DO
          sum := sum + i;
        END_FOR;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse FOR loop with BY clause', () => {
    const source = `
      PROGRAM Main
        VAR i, sum : INT; END_VAR
        sum := 0;
        FOR i := 0 TO 100 BY 10 DO
          sum := sum + 1;
        END_FOR;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse WHILE loop', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 10;
        WHILE x > 0 DO
          x := x - 1;
        END_WHILE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse REPEAT-UNTIL loop', () => {
    const source = `
      PROGRAM Main
        VAR x : INT; END_VAR
        x := 0;
        REPEAT
          x := x + 1;
        UNTIL x >= 10
        END_REPEAT;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse EXIT statement', () => {
    const source = `
      PROGRAM Main
        VAR i : INT; END_VAR
        FOR i := 1 TO 100 DO
          IF i > 50 THEN
            EXIT;
          END_IF;
        END_FOR;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse RETURN statement', () => {
    const source = `
      FUNCTION Test : INT
        VAR_INPUT x : INT; END_VAR
        IF x < 0 THEN
          RETURN;
        END_IF;
        Test := x * 2;
      END_FUNCTION
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse CASE statement', () => {
    const source = `
      PROGRAM Main
        VAR x, y : INT; END_VAR
        CASE x OF
          1: y := 10;
          2: y := 20;
        END_CASE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Complex Program Tests', () => {
  it('should parse program with all statement types', () => {
    const source = `
      PROGRAM AllStatements
        VAR i, x, y : INT; flag : BOOL; END_VAR
        
        x := 10;
        y := 20;
        
        IF x > 0 THEN
          x := x - 1;
        ELSIF x < 0 THEN
          x := x + 1;
        ELSE
          x := 0;
        END_IF;
        
        FOR i := 1 TO 10 BY 2 DO
          y := y + i;
        END_FOR;
        
        WHILE flag DO
          flag := FALSE;
        END_WHILE;
        
        REPEAT
          x := x + 1;
        UNTIL x > 100
        END_REPEAT;
        
        CASE x OF
          1: y := 10;
          2: y := 20;
          3: y := 30;
        END_CASE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse program with all expression types', () => {
    const source = `
      PROGRAM AllExpressions
        VAR a, b, c, d, e : INT; 
            x, y, z : REAL;
            p, q, r, s : BOOL;
        END_VAR
        
        a := 1 + 2 - 3;
        b := 4 * 5 / 6;
        c := 7 MOD 8;
        x := y ** 2;
        
        p := a < b;
        q := a > b;
        r := a <= b;
        s := a >= b;
        p := a = b;
        q := a <> b;
        
        p := q AND r;
        q := r OR s;
        r := p XOR q;
        s := NOT p;
        
        a := -b;
        c := (a + b) * (c - d);
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse program with all literal types', () => {
    const source = `
      PROGRAM AllLiterals
        VAR i : INT; r : REAL; b : BOOL; s : STRING; END_VAR
        i := 42;
        i := 16#FF;
        r := 3.14;
        r := 1.5e-10;
        b := TRUE;
        b := FALSE;
        s := 'Hello World';
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

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

  it('should parse function with all VAR block types', () => {
    const source = `
      FUNCTION CompleteFunction : INT
        VAR_INPUT in1, in2 : INT; END_VAR
        VAR_OUTPUT out1 : INT; END_VAR
        VAR_IN_OUT inout1 : INT; END_VAR
        VAR local1 : INT; END_VAR
        VAR_TEMP temp1 : INT; END_VAR
        
        local1 := in1 + in2;
        out1 := local1;
        inout1 := inout1 + 1;
        CompleteFunction := out1;
      END_FUNCTION
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should parse function block with all VAR block types', () => {
    const source = `
      FUNCTION_BLOCK CompleteFB
        VAR_INPUT enable : BOOL; reset : BOOL; END_VAR
        VAR_OUTPUT count : INT; done : BOOL; END_VAR
        VAR_IN_OUT data : INT; END_VAR
        VAR internal : INT; END_VAR
        VAR_TEMP temp : INT; END_VAR
        
        IF reset THEN
          internal := 0;
        ELSIF enable THEN
          internal := internal + 1;
        END_IF;
        count := internal;
        done := internal > 100;
      END_FUNCTION_BLOCK
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });
});

describe('Edge Case Tests', () => {
  it('should handle empty program body', () => {
    const source = `
      PROGRAM Empty
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should handle empty function body', () => {
    const source = `
      FUNCTION EmptyFunc : INT
        EmptyFunc := 0;
      END_FUNCTION
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should handle empty function block body', () => {
    const source = `
      FUNCTION_BLOCK EmptyFB
      END_FUNCTION_BLOCK
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should handle deeply nested control structures', () => {
    const source = `
      PROGRAM DeepNesting
        VAR i, j, k : INT; flag : BOOL; END_VAR
        FOR i := 1 TO 10 DO
          FOR j := 1 TO 10 DO
            IF i > j THEN
              WHILE flag DO
                k := k + 1;
                IF k > 100 THEN
                  EXIT;
                END_IF;
              END_WHILE;
            END_IF;
          END_FOR;
        END_FOR;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should handle complex boolean expressions', () => {
    const source = `
      PROGRAM ComplexBool
        VAR a, b, c, d, e : BOOL; END_VAR
        e := (a AND b) OR (c AND d) XOR (NOT a AND NOT b);
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should handle multiple ELSIF clauses', () => {
    const source = `
      PROGRAM MultiElsif
        VAR x, y : INT; END_VAR
        IF x = 1 THEN
          y := 10;
        ELSIF x = 2 THEN
          y := 20;
        ELSIF x = 3 THEN
          y := 30;
        ELSIF x = 4 THEN
          y := 40;
        ELSE
          y := 0;
        END_IF;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should handle CASE with multiple values', () => {
    const source = `
      PROGRAM MultiCase
        VAR selector, result : INT; END_VAR
        CASE selector OF
          1: result := 10;
          2: result := 20;
          3: result := 30;
          4: result := 40;
          5: result := 50;
        END_CASE;
      END_PROGRAM
    `;
    const result = parse(source);
    expect(result.ast).toBeDefined();
    expect(result.errors).toHaveLength(0);
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
      const runMethodMatch = result.cppCode?.match(/void Program_TestPlacement::run\(\)\s*\{([^}]*int localVar = 42;[^}]*)\}/);
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
    expect(result.cppCode).toContain('class Program_Main');
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
    expect(result.cppCode).toContain('IEC_INT Add(');
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
    expect(result.cppCode).toContain('class Counter');
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
