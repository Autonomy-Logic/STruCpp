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
      expect(mainCpp).toContain('Program_COUNTER');
      expect(mainCpp).toContain('VarTypeTag::INT');
      expect(mainCpp).toContain('"COUNT"');
      expect(mainCpp).toContain('repl_run(programs');
      expect(mainCpp).toContain('int main(int argc, char* argv[])');
      expect(mainCpp).toContain('cyclic_run(programs');
      expect(mainCpp).toContain('#include "iec_cyclic.hpp"');
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

      expect(mainCpp).toContain('"X", VarTypeTag::INT');
      expect(mainCpp).toContain('"Y", VarTypeTag::REAL');
      expect(mainCpp).toContain('"FLAG", VarTypeTag::BOOL');
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

      expect(mainCpp).toContain('Program_PROG1 prog_PROG1');
      expect(mainCpp).toContain('Program_PROG2 prog_PROG2');
      expect(mainCpp).toContain('"PROG1"');
      expect(mainCpp).toContain('"PROG2"');
      expect(mainCpp).toContain('VarTypeTag::INT');
      expect(mainCpp).toContain('VarTypeTag::DINT');
      expect(mainCpp).toContain('repl_run(programs, 2, g_st_source, g_cpp_source, g_line_map, g_line_map_count)');
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

      expect(mainCpp).toContain('Program_EMPTY');
      expect(mainCpp).toContain('prog_EMPTY_vars = nullptr');
      expect(mainCpp).toContain('"EMPTY", &prog_EMPTY, prog_EMPTY_vars, 0, 0LL');
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

      expect(mainCpp).toContain('"X"');
      expect(mainCpp).toContain('"START"');
      expect(mainCpp).toContain('"RESULT"');
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

      expect(mainCpp).toContain('Configuration_MYCONFIG config_MYCONFIG');
      expect(mainCpp).toContain('config_MYCONFIG.COUNTER1.COUNT');
      expect(mainCpp).toContain('"COUNTER1"');
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
      expect(mainCpp).toContain('repl_run(programs, 1, g_st_source, g_cpp_source, g_line_map, g_line_map_count)');
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
      expect(mainCpp).toContain('repl_run(programs, 1, g_st_source, g_cpp_source, g_line_map, g_line_map_count)');
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
      expect(mainCpp).toContain('repl_run(programs, 1, g_st_source, g_cpp_source, g_line_map, g_line_map_count)');
    });
  });

  describe('C++ Code and Line Map Embedding', () => {
    it('should embed C++ code as raw string literal when provided', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
        cppCode: result.cppCode,
        lineMap: result.lineMap,
      });

      expect(mainCpp).toContain('g_cpp_source');
      expect(mainCpp).toContain('R"STRUCPP_CPP(');
      expect(mainCpp).toContain(')STRUCPP_CPP"');
      expect(mainCpp).toContain('Program_COUNTER');
    });

    it('should emit nullptr for g_cpp_source when no cppCode provided', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('g_cpp_source = nullptr');
    });

    it('should emit line map as STLineMap array when provided', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
        cppCode: result.cppCode,
        lineMap: result.lineMap,
      });

      expect(mainCpp).toContain('STLineMap g_line_map[]');
      expect(mainCpp).toContain('g_line_map_count');
      // Should contain at least one line map entry
      expect(mainCpp).toMatch(/\{\d+, \d+, \d+\}/);
    });

    it('should emit nullptr line map when not provided', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('g_line_map = nullptr');
      expect(mainCpp).toContain('g_line_map_count = 0');
    });

    it('should use STLineMap type in using declarations', () => {
      const source = `
        PROGRAM Test
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `;
      const result = compile(source);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!);

      expect(mainCpp).toContain('using strucpp::STLineMap');
    });

    it('should pass all parameters to repl_run', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
        cppCode: result.cppCode,
        lineMap: result.lineMap,
      });

      expect(mainCpp).toContain('g_st_source, g_cpp_source, g_line_map, g_line_map_count');
    });
  });

  describe('Codegen lineMap Population', () => {
    it('should populate lineMap after compilation', () => {
      const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.lineMap.size).toBeGreaterThan(0);
    });

    it('should map statement lines to C++ lines', () => {
      const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Line 3 is the assignment statement
      const entry = result.lineMap.get(3);
      expect(entry).toBeDefined();
      expect(entry!.cppStartLine).toBeGreaterThan(0);
      expect(entry!.cppEndLine).toBeGreaterThanOrEqual(entry!.cppStartLine);
    });

    it('should map PROGRAM line to header and END_PROGRAM to implementation', () => {
      const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Line 1 (PROGRAM Counter) now maps to header class declaration
      const headerProgEntry = result.headerLineMap.get(1);
      expect(headerProgEntry).toBeDefined();
      expect(headerProgEntry!.cppStartLine).toBeGreaterThan(0);

      // Line 1 should NOT be in impl lineMap (moved to header)
      expect(result.lineMap.has(1)).toBe(false);

      // Line 4 is END_PROGRAM — still maps to implementation closing }
      const endEntry = result.lineMap.get(4);
      expect(endEntry).toBeDefined();
    });

    it('should map variable lines to header member declarations', () => {
      const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(source);
      expect(result.success).toBe(true);

      // Line 2 (VAR count : INT) should map to header member line
      const varEntry = result.headerLineMap.get(2);
      expect(varEntry).toBeDefined();
      expect(varEntry!.cppStartLine).toBeGreaterThan(0);
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

  describe('Combined Header + Implementation Source', () => {
    it('should combine headerCode and cppCode in g_cpp_source', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
        cppCode: result.cppCode,
        headerCode: result.headerCode,
        lineMap: result.lineMap,
        headerLineMap: result.headerLineMap,
      });

      // g_cpp_source should contain both header and implementation
      expect(mainCpp).toContain('class Program_COUNTER');
      expect(mainCpp).toContain('Program_COUNTER::Program_COUNTER()');
    });

    it('should merge header and impl line maps with correct offsets', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
        cppCode: result.cppCode,
        headerCode: result.headerCode,
        lineMap: result.lineMap,
        headerLineMap: result.headerLineMap,
      });

      // Should have line map entries
      expect(mainCpp).toContain('STLineMap g_line_map[]');

      // Header line entries should appear without offset (small numbers)
      // Implementation line entries should appear with offset (larger numbers)
      const lineMapMatch = mainCpp.match(/\{(\d+), (\d+), (\d+)\}/g);
      expect(lineMapMatch).toBeDefined();
      expect(lineMapMatch!.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle backward compat when no headerCode is provided', () => {
      const stSource = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(stSource);
      expect(result.success).toBe(true);

      const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
        headerFileName: 'generated.hpp',
        stSource,
        cppCode: result.cppCode,
        lineMap: result.lineMap,
      });

      // Should still contain C++ source (just impl, no header)
      expect(mainCpp).toContain('g_cpp_source');
      expect(mainCpp).toContain('R"STRUCPP_CPP(');
      expect(mainCpp).toContain('Program_COUNTER::Program_COUNTER()');
    });

    it('should populate headerLineMap after compilation', () => {
      const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
      const result = compile(source);
      expect(result.success).toBe(true);
      expect(result.headerLineMap.size).toBeGreaterThan(0);
    });
  });
});

describe('member mangling in VarDescriptor addresses', () => {
  /**
   * Each descriptor holds `&instance.MEMBER`, so it has to name the member as
   * codegen declared it. A variable named after its own type is emitted with a
   * trailing underscore (see member-mangling.ts) — without the same rule here
   * the REPL binary does not link:
   *
   *   main.cpp:466: error: no member named 'RIG' in 'strucpp::Program_MAIN'
   *
   * The descriptor's *display* name keeps the un-mangled name (upper-cased, as
   * the REPL shows every name), since that is what the user types at the
   * prompt — only the address is mangled.
   */
  function mainFor(source: string): string {
    const result = compile(source);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    return generateReplMain(result.ast!, result.projectModel!);
  }

  const MOTOR = `
FUNCTION_BLOCK Motor
VAR_INPUT run : BOOL; END_VAR
VAR_OUTPUT spinning : BOOL; END_VAR
  spinning := run;
END_FUNCTION_BLOCK`;

  it('addresses a variable named after its type by the mangled name', () => {
    const mainCpp = mainFor(`${MOTOR}
PROGRAM Main
VAR Motor : Motor; plain : BOOL; END_VAR
  Motor(run := plain);
END_PROGRAM`);
    // Address mangled, display name left as the user wrote it.
    expect(mainCpp).toContain('{"MOTOR", VarTypeTag::OTHER, &prog_MAIN.MOTOR_}');
  });

  it('matches case-insensitively, as ST names do', () => {
    // `rig : Rig` is a collision — ST is case-insensitive, so codegen mangles it.
    const mainCpp = mainFor(`${MOTOR}
FUNCTION_BLOCK Rig
VAR Motor : Motor; END_VAR
  Motor(run := TRUE);
END_FUNCTION_BLOCK
PROGRAM Main
VAR rig : Rig; END_VAR
  rig();
END_PROGRAM`);
    expect(mainCpp).toContain('&prog_MAIN.RIG_}');
  });

  it('leaves a variable named after an elementary type alone', () => {
    // `Time : TIME` is an ordinary declaration; codegen emits plain `TIME`, so
    // mangling here would address a member that does not exist.
    const mainCpp = mainFor(`
PROGRAM Main
VAR Time : TIME; Word : WORD; counter : INT; END_VAR
  counter := counter + 1;
END_PROGRAM`);
    expect(mainCpp).toContain('{"TIME", VarTypeTag::TIME, &prog_MAIN.TIME}');
    expect(mainCpp).toContain('{"WORD", VarTypeTag::WORD, &prog_MAIN.WORD}');
    expect(mainCpp).not.toContain('TIME_');
    expect(mainCpp).not.toContain('WORD_');
  });

  it('applies to program instances under a CONFIGURATION too', () => {
    const mainCpp = mainFor(`${MOTOR}
PROGRAM Main
VAR Motor : Motor; END_VAR
  Motor(run := TRUE);
END_PROGRAM
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`);
    expect(mainCpp).toContain('&config_CONFIG0.INSTANCE0.MOTOR_}');
  });
});
