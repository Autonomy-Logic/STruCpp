/**
 * Typed literals (IEC 61131-3 §6.3): every `<type>#<value>` form parses,
 * compiles, and holds its value at run time.
 *
 * STRING#'…', WSTRING#"…" and a signed value (INT#-5) used to stop the lexer
 * at the `#`. Enumerated values with their type (Mode#Auto) and BOOL#TRUE /
 * BOOL#FALSE come from the parser's enumeration literal (DOPE-687); they are
 * checked here wherever that parser is present.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { parse } from "../../src/frontend/parser.js";
import {
  hasGpp,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const NS = 1_000_000_000;
const DAY = 86_400;
const days = (iso: string): number =>
  Date.parse(`${iso}T00:00:00Z`) / 1000 / DAY;

const CONFIG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

/** Compile, build with g++, run, and return what the checks printed. */
function run(dir: string, source: string, checks: string): string {
  const result = compile(source, { headerFileName: "generated.hpp" });
  expect(result.errors.map((e) => `${e.line}: ${e.message}`)).toEqual([]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
  fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
  fs.writeFileSync(
    path.join(dir, "main.cpp"),
    `#include "generated.hpp"
#include <cstdio>
#include <string>
strucpp::Configuration_CONFIG0 g_config;
static int fails = 0;
static void check(const char* what, double got, double want) {
  if (got != want) { printf("FAIL %s: got %.17g want %.17g\\n", what, got, want); ++fails; }
}
static void check_s(const char* what, const std::string& got, const char* want) {
  if (got != want) { printf("FAIL %s: got '%s' want '%s'\\n", what, got.c_str(), want); ++fails; }
}
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
${checks}
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
  );
  const bin = path.join(dir, "typed");
  execSync(
    `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
      `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
    { encoding: "utf-8", env: cxxEnv },
  );
  try {
    return execSync(`"${bin}"`, { encoding: "utf-8" }).trim();
  } catch (e) {
    return ((e as { stdout?: string }).stdout ?? String(e)).trim();
  }
}

const enumLiteralsParse =
  parse("PROGRAM p VAR m : INT; END_VAR m := E#A; END_PROGRAM").errors
    .length === 0;

describeIfGpp("typed literals", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-typed-lit-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("numbers, strings, times and dates hold their values", () => {
    const source = `
PROGRAM Main
VAR
  i1, i2, i3, slen : INT;
  u1 : UINT;
  by1 : BYTE;
  w1 : WORD;
  d1 : DINT;
  r1, r2 : REAL;
  lr1 : LREAL;
  b2, b4 : BOOL;
  s1, s2, s3 : STRING;
  s4 : STRING := STRING#'init';
  ws1 : WSTRING;
  t1, t2, t3 : TIME;
  lt1 : LTIME;
  da1, da2 : DATE;
  tod1 : TOD;
  dt1 : DT;
END_VAR
  i1 := INT#5;
  i2 := INT#-5;
  i3 := INT#+7;
  u1 := UINT#16#FF;
  by1 := BYTE#2#1010;
  w1 := WORD#8#17;
  d1 := DINT#-100000;
  r1 := REAL#1.5;
  r2 := REAL#-0.25;
  lr1 := LREAL#1E3;
  b2 := BOOL#1;
  b4 := BOOL#0;
  s1 := STRING#'abc';
  s2 := CONCAT(STRING#'x', 'y');
  s3 := STRING#'it$'s';
  ws1 := WSTRING#"wide";
  slen := LEN(STRING#'four');
  t1 := TIME#1s;
  t2 := T#1h2m;
  t3 := TIME#1.5s;
  lt1 := LTIME#5m_30s;
  da1 := DATE#2026-10-08;
  da2 := D#2026-10-09;
  tod1 := TOD#12:00:00;
  dt1 := DT#2026-10-08-12:00:00;
END_PROGRAM
${CONFIG}`;
    const checks = `
  check("INT#5", p.I1, 5);
  check("INT#-5", p.I2, -5);
  check("INT#+7", p.I3, 7);
  check("UINT#16#FF", p.U1, 255);
  check("BYTE#2#1010", p.BY1, 10);
  check("WORD#8#17", p.W1, 15);
  check("DINT#-100000", p.D1, -100000);
  check("REAL#1.5", p.R1, 1.5);
  check("REAL#-0.25", p.R2, -0.25);
  check("LREAL#1E3", p.LR1, 1000);
  check("BOOL#1", p.B2, 1);
  check("BOOL#0", p.B4, 0);
  check_s("STRING#", p.S1.get().c_str(), "abc");
  check_s("CONCAT", p.S2.get().c_str(), "xy");
  check_s("escape", p.S3.get().c_str(), "it's");
  check_s("initial value", p.S4.get().c_str(), "init");
  check("WSTRING#", strucpp::WLEN(p.WS1.get()), 4);
  check("LEN", p.SLEN, 4);
  check("TIME#1s", p.T1, ${NS});
  check("T#1h2m", p.T2, ${(3600 + 120) * NS});
  check("TIME#1.5s", p.T3, ${1.5 * NS});
  check("LTIME#5m_30s", p.LT1, ${330 * NS});
  check("DATE#", p.DA1, ${days("2026-10-08")});
  check("D#", p.DA2, ${days("2026-10-09")});
  check("TOD#", p.TOD1, ${12 * 3600 * NS});
  check("DT#", p.DT1, ${(days("2026-10-08") * DAY + 12 * 3600) * NS});
`;
    expect(run(path.join(tempDir, "values"), source, checks)).toBe("ALL_OK");
  });

  it.runIf(enumLiteralsParse)(
    "enumerated values and BOOL#TRUE hold their values",
    () => {
      const source = `
TYPE Mode : (Manual, Auto, Off); END_TYPE
TYPE Valve : (Shut, Open, Off); END_TYPE
PROGRAM Main
VAR
  b1, b3, isOff, notAuto : BOOL;
  m1, m2 : Mode := Mode#Manual;
  v1 : Valve := Valve#Off;
  n1, n2 : INT;
END_VAR
  b1 := BOOL#TRUE;
  b3 := BOOL#FALSE;
  m1 := Mode#Auto;
  IF m1 = Mode#Auto THEN n1 := 1; END_IF;
  CASE m1 OF
    Mode#Manual: n2 := 10;
    Mode#Auto: n2 := 20;
  END_CASE;
  IF v1 = Valve#Off THEN m2 := Mode#Off; END_IF;
  isOff := m2 = Mode#Off;
  notAuto := m2 <> Mode#Auto;
END_PROGRAM
${CONFIG}`;
      const checks = `
  check("BOOL#TRUE", p.B1, 1);
  check("BOOL#FALSE", p.B3, 0);
  check("= Mode#Auto", p.N1, 1);
  check("CASE Mode#", p.N2, 20);
  check("Valve#Off / Mode#Off", p.ISOFF, 1);
  check("<> Mode#Auto", p.NOTAUTO, 1);
`;
      expect(run(path.join(tempDir, "enums"), source, checks)).toBe("ALL_OK");
    },
  );
});

describe("typed literal mistakes", () => {
  const program = (body: string) =>
    compile(`TYPE Mode : (Manual, Auto); END_TYPE
PROGRAM Main
  VAR m : Mode; b : BOOL; END_VAR
  ${body}
END_PROGRAM`);

  it("rejects a value the enumerated type does not have", () => {
    expect(program("m := Mode.Bogus;").errors.map((e) => e.message)).toEqual([
      "'BOGUS' is not a value of the enumerated type 'MODE' (its values are MANUAL, AUTO)",
    ]);
  });

  it.runIf(enumLiteralsParse)("rejects it written with the type's #", () => {
    expect(program("m := Mode#Bogus;").errors.map((e) => e.message)).toEqual([
      "'BOGUS' is not a value of the enumerated type 'MODE' (its values are MANUAL, AUTO)",
    ]);
  });

  it("rejects a BOOL other than 0 or 1", () => {
    expect(program("b := BOOL#2;").errors.map((e) => e.message)).toEqual([
      "'BOOL#2' is not a BOOL: write BOOL#0, BOOL#1, BOOL#TRUE or BOOL#FALSE",
    ]);
  });
});
