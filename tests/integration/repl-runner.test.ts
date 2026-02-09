/**
 * STruC++ Phase 3.6 REPL Runner Integration Tests
 *
 * These tests compile ST → C++ → executable binary with REPL,
 * then run the binary with piped stdin commands and verify output.
 * Requires g++ with C++17 support.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile } from '../../src/index.js';
import { generateReplMain } from '../../src/backend/repl-main-gen.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Skip if g++ is not available
const hasGpp = (() => {
  try {
    execSync('which g++', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp('REPL Runner Integration Tests', () => {
  let tempDir: string;
  const runtimeIncludePath = path.resolve(__dirname, '../../src/runtime/include');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-repl-test-'));
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
    });
    fs.writeFileSync(mainPath, mainCpp);

    // Compile
    execSync(
      `g++ -std=c++17 -I"${runtimeIncludePath}" -I"${tempDir}" "${mainPath}" "${cppPath}" -o "${binPath}" 2>&1`,
      { encoding: 'utf-8' },
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
    expect(output).toContain('Counter');
    expect(output).toContain('1 variables');
  });

  it('should execute cycles and show updated values', () => {
    const source = `
      PROGRAM Counter
        VAR count : INT; END_VAR
        count := count + 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'run 3\nvars Counter\nquit', 'counter_run');
    expect(output).toContain('Executed 3 cycle(s)');
    expect(output).toContain('Counter.count : INT = 3');
  });

  it('should get and set variables', () => {
    const source = `
      PROGRAM Test
        VAR x : INT; y : BOOL; END_VAR
        x := x + 1;
      END_PROGRAM
    `;
    const commands = [
      'set Test.x 42',
      'get Test.x',
      'set Test.y TRUE',
      'get Test.y',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'get_set');
    expect(output).toContain('Test.x = 42');
    expect(output).toContain('Test.x : INT = 42');
    expect(output).toContain('Test.y = TRUE');
    expect(output).toContain('Test.y : BOOL = TRUE');
  });

  it('should force and unforce variables', () => {
    const source = `
      PROGRAM Test
        VAR counter : INT; END_VAR
        counter := counter + 1;
      END_PROGRAM
    `;
    const commands = [
      'force Test.counter 100',
      'run 5',
      'get Test.counter',
      'unforce Test.counter',
      'run 1',
      'get Test.counter',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'force');
    expect(output).toContain('FORCED = 100');
    // After forcing, running cycles should not change the value
    expect(output).toContain('Test.counter : INT = 100');
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
    expect(output).toContain('Prog1');
    expect(output).toContain('Prog2');
    expect(output).toContain('Prog1.a : INT = 2');
    expect(output).toContain('Prog2.b : DINT = 20');
  });

  it('should show help text', () => {
    const source = `
      PROGRAM Test
        VAR x : INT; END_VAR
        x := 1;
      END_PROGRAM
    `;
    const output = buildAndRun(source, 'help\nquit', 'help');
    expect(output).toContain('Commands:');
    expect(output).toContain('run [N]');
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
      'set Test.x 3.14',
      'get Test.x',
      'quit',
    ].join('\n');
    const output = buildAndRun(source, commands, 'real_type');
    expect(output).toContain('REAL');
    expect(output).toContain('3.14');
  });
});
