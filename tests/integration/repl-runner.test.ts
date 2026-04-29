/**
 * STruC++ Phase 3.6 REPL Runner Integration Tests
 *
 * These tests compile ST → C++ → executable binary with REPL,
 * then run the binary with piped stdin commands and verify output.
 * Requires g++ with C++17 support and a C compiler (cc).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile } from '../../src/index.js';
import { generateReplMain } from '../../src/backend/repl-main-gen.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  hasGpp,
  hasCc,
  createPCH,
  precompileIsocline,
  RUNTIME_INCLUDE_PATH,
  REPL_PATH,
  cxxEnv,
} from './test-helpers.js';

const describeIfCompilers = hasGpp && hasCc ? describe : describe.skip;

describeIfCompilers('REPL Runner Integration Tests', () => {
  let tempDir: string;
  let pchPath: string;
  let isoclineObj: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-repl-test-'));
    pchPath = createPCH(tempDir);
    isoclineObj = precompileIsocline(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function buildAndRun(
    stSource: string,
    replCommands: string,
    testName: string,
  ): string {
    const result = compile(stSource, { headerFileName: 'generated.hpp' });
    if (!result.success) {
      throw new Error(`Compilation failed: ${result.errors.map(e => e.message).join(', ')}`);
    }

    const headerPath = path.join(tempDir, 'generated.hpp');
    const cppPath = path.join(tempDir, `${testName}.cpp`);
    const mainPath = path.join(tempDir, `${testName}_main.cpp`);
    const binPath = path.join(tempDir, testName);

    fs.writeFileSync(headerPath, result.headerCode);
    fs.writeFileSync(cppPath, result.cppCode);

    const mainCpp = generateReplMain(result.ast!, result.projectModel!, {
      headerFileName: 'generated.hpp',
      stSource,
      cppCode: result.cppCode,
      headerCode: result.headerCode,
      lineMap: result.lineMap,
      headerLineMap: result.headerLineMap,
    });
    fs.writeFileSync(mainPath, mainCpp);

    // Compile C++ and link with pre-compiled isocline.o + PCH
    execSync(
      `g++ -std=c++17 -include "${pchPath}" -I"${RUNTIME_INCLUDE_PATH}" -I"${REPL_PATH}" -I"${tempDir}" "${mainPath}" "${cppPath}" "${isoclineObj}" -o "${binPath}" 2>&1`,
      { encoding: 'utf-8', env: cxxEnv },
    );

    // Run with piped commands
    const output = execSync(
      `echo "${replCommands}" | "${binPath}"`,
      { encoding: 'utf-8', timeout: 10000 },
    );

    return output;
  }

  it('should compile and run a simple counter program', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'programs\nquit', 'counter');
    expect(output).toContain('STruC++ Interactive PLC Test REPL');
    expect(output).toContain('COUNTER');
  });

  it('should execute cycles and show updated values', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'run 3\nvars COUNTER\nquit', 'counter_run');
    expect(output).toContain('Executed 3 cycle(s)');
    expect(output).toContain('COUNTER.COUNT');
    expect(output).toContain('INT');
    expect(output).toContain('3');
  });

  it('should get and set variables', () => {
    const source = `
      PROGRAM Test
        VAR x : INT; y : BOOL; END_VAR
        x := x + 1;
      END_PROGRAM
    `;
    const commands = [
      'set TEST.X 42',
      'get TEST.X',
      'set TEST.Y TRUE',
      'get TEST.Y',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'get_set');
    expect(output).toContain('TEST.X');
    expect(output).toContain('42');
    expect(output).toContain('TEST.Y');
    expect(output).toContain('TRUE');
  });

  it('should force and unforce variables', () => {
    const source = `
      PROGRAM Test
        VAR counter : INT; END_VAR
        counter := counter + 1;
      END_PROGRAM
    `;
    const commands = [
      'force TEST.COUNTER 100',
      'run 5',
      'get TEST.COUNTER',
      'unforce TEST.COUNTER',
      'run 1',
      'get TEST.COUNTER',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'force');
    expect(output).toContain('FORCED');
    expect(output).toContain('100');
    expect(output).toContain('unforced');
  });

  it('should handle multiple programs', () => {
    const source = `
      PROGRAM Prog1
        VAR a : INT; END_VAR
        a := a + 1;
      END_PROGRAM

      PROGRAM Prog2
        VAR b : DINT; END_VAR
        b := b + 10;
      END_PROGRAM
    `;
    const commands = [
      'programs',
      'run 2',
      'vars',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'multi');
    expect(output).toContain('PROG1');
    expect(output).toContain('PROG2');
    expect(output).toContain('2');
    expect(output).toContain('20');
  });

  it('should show help text', () => {
    const source = `
      PROGRAM Test
        VAR x : INT; END_VAR
        x := 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'help\nquit', 'help');
    expect(output).toContain('Commands');
    expect(output).toContain('run');
    expect(output).toContain('vars');
    expect(output).toContain('get');
    expect(output).toContain('set');
    expect(output).toContain('force');
    expect(output).toContain('unforce');
    expect(output).toContain('quit');
  });

  it('should handle REAL type variables', () => {
    const source = `
      PROGRAM Test
        VAR x : REAL; END_VAR
        x := x + 1.5;
      END_PROGRAM
    `;
    const commands = [
      'set TEST.X 3.14',
      'get TEST.X',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'real_type');
    expect(output).toContain('REAL');
    expect(output).toContain('3.14');
  });

  it('should show source line count in welcome banner', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'quit', 'source_banner');
    expect(output).toContain('lines loaded');
  });

  it('should execute step command as alias for run 1', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const commands = [
      'step',
      'step',
      'get COUNTER.COUNT',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'step_cmd');
    expect(output).toContain('Executed 1 cycle(s)');
    expect(output).toContain('2');
  });

  it('should display source code with code command', () => {
    const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
    const commands = [
      'code',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'code_cmd');
    expect(output).toContain('PROGRAM Counter');
    expect(output).toContain('count := count + 1');
    // Should have line numbers
    expect(output).toMatch(/\d+ \|/);
  });

  it('should display code around a specific line', () => {
    const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
    const commands = [
      'code 2',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'code_line');
    expect(output).toContain('VAR count');
  });

  it('should add and display watched variables', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const commands = [
      'watch COUNTER.COUNT',
      'run 3',
      'watch list',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'watch_cmd');
    expect(output).toContain('Watching:');
    expect(output).toContain('--- watch ---');
    expect(output).toContain('COUNTER.COUNT');
    expect(output).toContain('3');
  });

  it('should clear watch list', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const commands = [
      'watch COUNTER.COUNT',
      'watch clear',
      'watch list',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'watch_clear');
    expect(output).toContain('Watch list cleared');
    expect(output).toContain('Watch list is empty');
  });

  it('should show dashboard with variables and source', () => {
    const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
    const commands = [
      'run 5',
      'dashboard',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'dashboard_cmd');
    expect(output).toContain('Dashboard');
    expect(output).toContain('Cycle: 5');
    expect(output).toContain('Variables');
    expect(output).toContain('COUNTER.COUNT');
    expect(output).toContain('Source');
    expect(output).toContain('PROGRAM Counter');
  });

  it('should show step and code in help text', () => {
    const source = `
      PROGRAM Test
        VAR x : INT; END_VAR
        x := 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'help\nquit', 'help_new');
    expect(output).toContain('step');
    expect(output).toContain('code');
    expect(output).toContain('watch');
    expect(output).toContain('dashboard');
  });

  it('should display side-by-side ST and C++ code', () => {
    const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
    const commands = [
      'code',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'code_sbs');
    // Should have both ST and C++ headers
    expect(output).toContain('ST');
    expect(output).toContain('C++');
    // Should show ST source
    expect(output).toContain('PROGRAM Counter');
    // Should show C++ generated code (run method)
    expect(output).toContain('Program_COUNTER');
    // Should have separator
    expect(output).toContain('|');
  });

  it('should show C++ line numbers in side-by-side display', () => {
    const source = `PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM`;
    const commands = [
      'code',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'code_sbs_nums');
    // C++ side should show class definition alongside PROGRAM/VAR
    expect(output).toContain('class Program_COUNTER');
    expect(output).toContain('IEC_INT COUNT');
    // C++ side should also show statement code
    expect(output).toContain('COUNT = COUNT + 1');
  });
});
