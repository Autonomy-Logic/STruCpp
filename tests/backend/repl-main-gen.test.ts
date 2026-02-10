/**
 * STruC++ Phase 3.6 REPL Main Generator Tests
 *
 * Tests for main.cpp generation with variable descriptors and REPL bootstrap.
 */

import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import { generateReplMain } from '../../src/backend/repl-main-gen.js';

describe('Phase 3.6 - REPL Main Generator', () => {
  describe('Standalone Programs (no CONFIGURATION)', () => {
    it('should generate main.cpp for a simple program', () => {
      const source = `
        PROGRAM Counter
          VAR count : INT; END_VAR
          count := count + 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.projectModel).toBeDefined();

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('#include "generated.hpp"');
      expect(mainCpp).toContain('#include "iec_repl.hpp"');
      expect(mainCpp).toContain('Program_Counter');
      expect(mainCpp).toContain('VarTypeTag::INT');
      expect(mainCpp).toContain('"count"');
      expect(mainCpp).toContain('repl_run(programs');
      expect(mainCpp).toContain('int main()');
    });

    it('should generate VarDescriptor for multiple variables', () => {
      const source = `
        PROGRAM Test
          VAR
            x : INT;
            y : REAL;
            flag : BOOL;
          END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('"x", VarTypeTag::INT');
      expect(mainCpp).toContain('"y", VarTypeTag::REAL');
      expect(mainCpp).toContain('"flag", VarTypeTag::BOOL');
    });

    it('should handle multiple programs', () => {
      const source = `
        PROGRAM Prog1
          VAR a : INT; END_VAR
          a := 1;
        END_PROGRAM

        PROGRAM Prog2
          VAR b : DINT; END_VAR
          b := 2;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('Program_Prog1 prog_Prog1');
      expect(mainCpp).toContain('Program_Prog2 prog_Prog2');
      expect(mainCpp).toContain('"Prog1"');
      expect(mainCpp).toContain('"Prog2"');
      expect(mainCpp).toContain('VarTypeTag::INT');
      expect(mainCpp).toContain('VarTypeTag::DINT');
      expect(mainCpp).toContain('repl_run(programs, 2, g_st_source)');
    });

    it('should use custom header filename', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'my_output.hpp',
      });

      expect(mainCpp).toContain('#include "my_output.hpp"');
    });

    it('should handle all elementary types', () => {
      const source = `
        PROGRAM AllTypes
          VAR
            v_bool : BOOL;
            v_sint : SINT;
            v_int : INT;
            v_dint : DINT;
            v_lint : LINT;
            v_usint : USINT;
            v_uint : UINT;
            v_udint : UDINT;
            v_ulint : ULINT;
            v_real : REAL;
            v_lreal : LREAL;
            v_byte : BYTE;
            v_word : WORD;
            v_dword : DWORD;
            v_lword : LWORD;
            v_time : TIME;
          END_VAR
          v_int := 0;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('VarTypeTag::BOOL');
      expect(mainCpp).toContain('VarTypeTag::SINT');
      expect(mainCpp).toContain('VarTypeTag::INT');
      expect(mainCpp).toContain('VarTypeTag::DINT');
      expect(mainCpp).toContain('VarTypeTag::LINT');
      expect(mainCpp).toContain('VarTypeTag::USINT');
      expect(mainCpp).toContain('VarTypeTag::UINT');
      expect(mainCpp).toContain('VarTypeTag::UDINT');
      expect(mainCpp).toContain('VarTypeTag::ULINT');
      expect(mainCpp).toContain('VarTypeTag::REAL');
      expect(mainCpp).toContain('VarTypeTag::LREAL');
      expect(mainCpp).toContain('VarTypeTag::BYTE');
      expect(mainCpp).toContain('VarTypeTag::WORD');
      expect(mainCpp).toContain('VarTypeTag::DWORD');
      expect(mainCpp).toContain('VarTypeTag::LWORD');
      expect(mainCpp).toContain('VarTypeTag::TIME');
    });

    it('should handle program with no variables', () => {
      const source = `
        PROGRAM Empty
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('Program_Empty');
      expect(mainCpp).toContain('prog_Empty_vars = nullptr');
      expect(mainCpp).toContain('"Empty", &prog_Empty, prog_Empty_vars, 0');
    });

    it('should include VAR_INPUT and VAR_OUTPUT but skip VAR_EXTERNAL', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          VAR_INPUT start : BOOL; END_VAR
          VAR_OUTPUT result : DINT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('"x"');
      expect(mainCpp).toContain('"start"');
      expect(mainCpp).toContain('"result"');
    });
  });

  describe('With CONFIGURATION', () => {
    it('should generate main.cpp for configuration with program instances', () => {
      const source = `
        PROGRAM Counter
          VAR count : INT; END_VAR
          count := count + 1;
        END_PROGRAM

        CONFIGURATION MyConfig
          RESOURCE MyRes ON PLC
            TASK MainTask(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM counter1 WITH MainTask : Counter;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('Configuration_MyConfig config_MyConfig');
      expect(mainCpp).toContain('config_MyConfig.counter1.count');
      expect(mainCpp).toContain('"counter1"');
      expect(mainCpp).toContain('VarTypeTag::INT');
      expect(mainCpp).toContain('repl_run(programs');
    });
  });

  describe('ST Source Embedding', () => {
    it('should embed ST source as raw string literal when provided', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
      });

      expect(mainCpp).toContain('g_st_source');
      expect(mainCpp).toContain('R"STRUCPP_SRC(');
      expect(mainCpp).toContain(')STRUCPP_SRC"');
      expect(mainCpp).toContain('PROGRAM Counter');
      expect(mainCpp).toContain('count := count + 1;');
      expect(mainCpp).toContain('repl_run(programs, 1, g_st_source)');
    });

    it('should emit nullptr when no source provided', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('g_st_source = nullptr');
      expect(mainCpp).toContain('repl_run(programs, 1, g_st_source)');
    });

    it('should pass g_st_source in configuration mode too', () => {
      const source = `
        PROGRAM Counter
          VAR count : INT; END_VAR
          count := count + 1;
        END_PROGRAM

        CONFIGURATION MyConfig
          RESOURCE MyRes ON PLC
            TASK MainTask(INTERVAL := T#20ms, PRIORITY := 1);
            PROGRAM counter1 WITH MainTask : Counter;
          END_RESOURCE
        END_CONFIGURATION
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource: source,
      });

      expect(mainCpp).toContain('g_st_source');
      expect(mainCpp).toContain('R"STRUCPP_SRC(');
      expect(mainCpp).toContain('repl_run(programs, 1, g_st_source)');
    });
  });

  describe('CompileResult fields', () => {
    it('should populate ast and projectModel on success', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.ast!.kind).toBe('CompilationUnit');
      expect(result.ast!.programs.length).toBe(1);
      expect(result.projectModel).toBeDefined();
      expect(result.projectModel!.programs.size).toBe(1);
    });

    it('should not populate ast/projectModel on failure', () => {
      const source = `INVALID SYNTAX`;
      const result = compile(source);
      expect(result.success).toBe(false);
      expect(result.ast).toBeUndefined();
      expect(result.projectModel).toBeUndefined();
    });
  });
});
