/**
 * Configuration VAR_GLOBALs are declared `extern` in the generated header and
 * defined once, in configuration.cpp.
 *
 * They used to be `inline GlobalVar<V>` definitions in the header, so every
 * translation unit that included it carried its own guarded copy of every
 * global's constructor (GlobalVar's is not constexpr): about 6.7 KB per TU on
 * a board build, 568 KB of static initialisers across a 96-TU project. Built
 * here the way a board or runtime build compiles it — one object per TU,
 * linked together.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { compile } from '../../src/index.js';
import { hasGpp, CXX_STD } from './test-helpers.js';

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp('configuration globals across translation units', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-globals-tu-'));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('defines each configuration global once, in configuration.cpp, and links across translation units', () => {
    // An `inline GlobalVar<V>` in the header gave every TU that includes it a
    // guarded copy of every global's constructor (GlobalVar's is not
    // constexpr) — about 6.7 KB per TU on a board build. The header declares
    // them `extern`; configuration.cpp holds the one definition.
    const source = `
      FUNCTION_BLOCK Bumper
        VAR_EXTERNAL counter : INT; END_VAR
        counter := counter + 1;
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR_EXTERNAL maxcount : INT; flags : ARRAY[0..1] OF BOOL; END_VAR
        VAR b : Bumper; END_VAR
        b();
        flags[1] := maxcount = 7;
      END_PROGRAM
      PROGRAM Other
        VAR_EXTERNAL counter : INT; END_VAR
        counter := counter + 10;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL
          counter : INT := 0;
          maxcount : INT := 7;
          flags : ARRAY[0..1] OF BOOL;
        END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
          PROGRAM other WITH t : Other;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = compile(source, { headerFileName: 'generated.hpp' });
    expect(result.success).toBe(true);
    expect(result.headerCode).not.toContain('inline GlobalVar<');
    for (const decl of [
      'extern GlobalVar<IEC_INT> COUNTER;',
      'extern GlobalVar<IEC_INT> MAXCOUNT;',
      'extern GlobalVar<Array1D<IEC_BOOL, 0, 1>> FLAGS;',
    ]) {
      expect(result.headerCode).toContain(decl);
    }
    const definitions = (name: string): string[] =>
      result.cppFiles.flatMap((f) =>
        f.content
          .split('\n')
          .filter((l) => l.startsWith('GlobalVar<') && l.includes(` ${name}{`))
          .map(() => f.name),
      );
    for (const name of ['COUNTER', 'MAXCOUNT', 'FLAGS']) {
      expect(definitions(name)).toEqual(['configuration.cpp']);
    }
    expect(result.cppFiles.length).toBeGreaterThan(2);

    const runtimeInclude = path.resolve(__dirname, '../../src/runtime/include');
    const dir = path.join(tempDir, 'multi_tu_globals');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'generated.hpp'), result.headerCode);
    const units = result.cppFiles.map((f) => {
      const file = path.join(dir, f.name);
      fs.writeFileSync(file, f.content);
      return file;
    });
    const main = path.join(dir, 'main.cpp');
    fs.writeFileSync(
      main,
      `#include "generated.hpp"
strucpp::Configuration_CFG g_config;
int main() {
  g_config.INST.run();
  g_config.OTHER.run();
  if (strucpp::COUNTER.read() != 11) return 1;
  if (!strucpp::FLAGS.read()[1]) return 2;
  return strucpp::MAXCOUNT.read() == 7 ? 0 : 3;
}
`,
    );
    for (const threaded of [false, true]) {
      const flag = threaded ? '-DSTRUCPP_THREADED' : '';
      const out = path.join(dir, `multi_tu_${threaded}.out`);
      let ok = true;
      let diag = '';
      try {
        const objects = [...units, main].map((src) => {
          const obj = `${src}.${threaded}.o`;
          execSync(`g++ -std=${CXX_STD} ${flag} -c -I"${runtimeInclude}" -I"${dir}" "${src}" -o "${obj}"`, {
            stdio: 'pipe',
          });
          return `"${obj}"`;
        });
        execSync(`g++ ${objects.join(' ')} -o "${out}" ${threaded ? '-pthread' : ''}`, { stdio: 'pipe' });
        execSync(`"${out}"`, { stdio: 'pipe' });
      } catch (e) {
        ok = false;
        diag =
          ((e as { stderr?: Buffer }).stderr?.toString() ?? '') +
          `status=${(e as { status?: number }).status ?? '?'} ${String(e).slice(0, 300)}`;
      }
      expect(ok, `multi-TU ${threaded ? 'threaded' : 'non-threaded'} failed:\n${diag}`).toBe(true);
    }
  });
});
