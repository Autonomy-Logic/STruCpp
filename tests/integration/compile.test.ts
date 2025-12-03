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

    // Note: Full type checking for VAR_EXTERNAL is planned for Phase 3+
    it('should compile VAR_EXTERNAL with type mismatch (type checking not yet implemented)', () => {
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
      // Currently compiles - full type checking will be added in Phase 3+
      expect(result.success).toBe(true);
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
