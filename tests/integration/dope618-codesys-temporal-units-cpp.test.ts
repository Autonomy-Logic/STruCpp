/**
 * DOPE-618 — temporal/integer conversions must use CODESYS's units.
 *
 * Every temporal type is `IECVar<int64_t>` in C++, so the unit a conversion
 * yields cannot be decided in the runtime — a `TO_DINT(IEC_DT)` and a
 * `TO_DINT(IEC_DATE)` are the same call. Codegen decides it, from
 * `TEMPORAL_CONVERSION_UNITS`, and these tests are what pin the table to the
 * vendor's documented behaviour rather than to our own guess.
 *
 * CODESYS holds DATE, DT and TOD in a 32-bit DWORD with a 1970-01-01 epoch:
 * DATE and DT at seconds resolution, TOD at milliseconds, TIME at
 * milliseconds. Its own worked examples are the three assertions in the first
 * test below.
 *
 * We had TIME and TOD right and DT and DATE wrong — DT in milliseconds, DATE
 * left as a raw day count. That broke 20 OSCAT functions, because OSCAT is
 * written against CODESYS and divides DT by 86400 and DATE by 86400 expecting
 * seconds. The user-visible report was HOUR_OF_DT returning 11 for 15:36.
 *
 * These run the compiled program rather than asserting on emitted strings: the
 * failure was arithmetic, and a codegen-substring test would not have caught
 * the 32-bit aliasing that made the numbers look unrelated to the input.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { discoverStlibs } from "../../src/node/library-loader.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;
const LIBS_DIR = path.resolve(__dirname, "../../libs");

const CFG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : MAIN;
  END_RESOURCE
END_CONFIGURATION`;

describeIfGpp("DOPE-618 — CODESYS units for temporal conversions", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dope618-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Compile a program (with OSCAT available), run it, return stdout. */
  function run(
    vars: string,
    body: string,
    prints: string,
    name: string,
  ): string {
    const source = `PROGRAM MAIN\n  VAR\n${vars}\n  END_VAR\n${body}\nEND_PROGRAM${CFG}`;
    const result = compile(source, {
      headerFileName: "generated.hpp",
      libraries: discoverStlibs(LIBS_DIR),
    });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    return compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: name,
      mainCode: `#include <iostream>

int main() {
    using namespace strucpp;
    Program_MAIN p;
    p.run();
${prints}
    return 0;
}
`,
    });
  }

  it("reproduces the three worked examples from the CODESYS documentation", () => {
    // The whole fix hangs off these. Traceable to the vendor's own pages, so
    // a future reader can check the expectation rather than trust it.
    const out = run(
      `    dt : DT   := DT#2019-09-01-12:00:00;
    dd : DATE := DATE#1970-01-02;
    td : TOD  := TOD#12:00:00;
    a : DINT; b : DINT; c : DINT;`,
      `  a := DT_TO_DINT(dt);
  b := DATE_TO_DINT(dd);
  c := TOD_TO_DINT(td);`,
      `    // The three day constants used to be three private copies. They are
    // only ever the same number, and the conversion helpers now convert
    // BETWEEN the types, so a divergence would produce wrong values.
    static_assert(DT_NS_PER_DAY == IEC_NS_PER_DAY, "DT day constant drifted");
    static_assert(TOD_NS_PER_DAY == IEC_NS_PER_DAY, "TOD day constant drifted");
    static_assert(DATE_NS_PER_DAY == IEC_NS_PER_DAY, "DATE day constant drifted");
    static_assert(DATE_SECONDS_PER_DAY * 1000000000LL == IEC_NS_PER_DAY,
                  "DATE seconds/ns constants disagree");
    std::cout << (long long)p.A.get() << " " << (long long)p.B.get()
              << " " << (long long)p.C.get() << std::endl;`,
      "codesys_examples",
    );
    // DT -> seconds, DATE -> seconds (NOT 1 day), TOD -> milliseconds.
    expect(out).toBe("1567339200 86400 43200000");
  });

  it("extracts the right hour, minute and second from the reported DT", () => {
    // The forum report: DT#2026-09-02-15:36:55.360 gave 11 / 23 / 44.
    const out = run(
      `    d : DT := DT#2026-09-02-15:36:55.360;
    h : INT; m : INT; s : INT;`,
      `  h := HOUR_OF_DT(d);
  m := MINUTE_OF_DT(d);
  s := SECOND_OF_DT(d);`,
      `    std::cout << (int)p.H.get() << " " << (int)p.M.get()
              << " " << (int)p.S.get() << std::endl;`,
      "hour_of_dt",
    );
    expect(out).toBe("15 36 55");
  });

  it("keeps the TOD family working — it was already correct", () => {
    // TOD is the one temporal type OSCAT reads in milliseconds, and the one
    // our scaling already matched. It has to survive the DT/DATE change.
    const out = run(
      `    t : TOD := TOD#15:36:55.360;
    h : INT; m : INT; s : REAL;`,
      `  h := HOUR(t);
  m := MINUTE(t);
  s := SECOND(t);`,
      `    std::cout << (int)p.H.get() << " " << (int)p.M.get() << " "
              << (p.S.get() > 55.35f && p.S.get() < 55.37f ? "55.36" : "BAD")
              << std::endl;`,
      "tod_family",
    );
    expect(out).toBe("15 36 55.36");
  });

  it("gets DATE fields right across dates a constant answer would pass", () => {
    // DAY_OF_WEEK returned 4 for EVERY date before the fix, and 4 happened to
    // be right for the first date tried. YEAR_OF_DATE returned 1970 for every
    // date. Several dates, including a leap day and a year boundary, so a
    // constant cannot pass. DAY_OF_WEEK is ISO 8601 per OSCAT's own docs:
    // Monday = 1 ... Sunday = 7.
    const dates = [
      { lit: "2026-09-02", year: 2026, days: 20698, dow: 3 }, // Wednesday
      { lit: "2026-09-06", year: 2026, days: 20702, dow: 7 }, // Sunday
      { lit: "2026-09-07", year: 2026, days: 20703, dow: 1 }, // Monday
      { lit: "2020-02-29", year: 2020, days: 18321, dow: 6 }, // Saturday, leap day
      { lit: "1999-12-31", year: 1999, days: 10956, dow: 5 }, // Friday
    ];
    const vars = dates
      .map(
        (d, i) =>
          `    d${i} : DATE := DATE#${d.lit};\n    y${i} : INT; n${i} : DINT; w${i} : INT;`,
      )
      .join("\n");
    const body = dates
      .map(
        (_, i) =>
          `  y${i} := YEAR_OF_DATE(d${i});\n  n${i} := DAY_OF_DATE(d${i});\n  w${i} := DAY_OF_WEEK(d${i});`,
      )
      .join("\n");
    const prints = dates
      .map(
        (_, i) =>
          `    std::cout << (int)p.Y${i}.get() << " " << (long long)p.N${i}.get() << " " << (int)p.W${i}.get() << std::endl;`,
      )
      .join("\n");
    const out = run(vars, body, prints, "date_family");
    expect(out.split("\n").map((l) => l.trim())).toEqual(
      dates.map((d) => `${d.year} ${d.days} ${d.dow}`),
    );
  });

  it("round-trips a DT out to an integer and back, as OSCAT does inline", () => {
    // DCF77 computes DWORD_TO_DT(DT_TO_DWORD(mez) - 7200) in one expression,
    // so the two directions must agree on the unit. Subtracting 7200 has to
    // move the value back by exactly two hours, which is only true if the
    // integer is seconds on both sides.
    const out = run(
      `    d : DT := DT#2026-09-02-15:36:55;
    back : DT;
    minus2h : DT;
    okBack : BOOL; okShift : BOOL;`,
      `  back    := DWORD_TO_DT(DT_TO_DWORD(d));
  minus2h := DWORD_TO_DT(DT_TO_DWORD(d) - 7200);
  okBack  := back = d;
  okShift := HOUR_OF_DT(minus2h) = 13;`,
      `    std::cout << (p.OKBACK.get() ? "1" : "0") << " "
              << (p.OKSHIFT.get() ? "1" : "0") << std::endl;`,
      "dt_round_trip",
    );
    // Exact round trip (the literal has no sub-second part), and -7200
    // seconds moves 15:36 to 13:36.
    expect(out).toBe("1 1");
  });

  it("drops sub-second detail on a DT round trip, which is correct", () => {
    // Not a wart to fix: CODESYS DT has seconds resolution, so a millisecond
    // component cannot survive DT_TO_DWORD. Pinned so nobody "fixes" it back
    // to milliseconds and reopens DOPE-618.
    // The extraction happens in ST: HOUR_OF_DT and friends are OSCAT library
    // functions, not C++ runtime helpers, so they are not in scope in the
    // driver.
    const out = run(
      `    d : DT := DT#2026-09-02-15:36:55.360;
    back : DT;
    lost : BOOL;
    h : INT; m : INT; s : INT;`,
      `  back := DWORD_TO_DT(DT_TO_DWORD(d));
  lost := back <> d;
  h := HOUR_OF_DT(back);
  m := MINUTE_OF_DT(back);
  s := SECOND_OF_DT(back);`,
      `    std::cout << (p.LOST.get() ? "truncated" : "exact") << " "
              << (int)p.H.get() << ":" << (int)p.M.get()
              << ":" << (int)p.S.get() << std::endl;`,
      "dt_subsecond",
    );
    expect(out).toBe("truncated 15:36:55");
  });

  it("floors a pre-epoch DATE instead of rounding toward zero", () => {
    // Review follow-up. C++ integer division truncates toward zero, so
    // DATE_FROM_SECONDS(-1) landed on day 0 (1970-01-01) when the floor is
    // day -1 (1969-12-31). DATE_OF_DT already spilled that borrow explicitly,
    // so the runtime answered the same question two ways.
    //
    // Reachable from user code: these helpers take arbitrary expressions via
    // DINT_TO_DATE(x), not just literals, so the input is not bounded by
    // CODESYS's documented (post-1970) domain.
    const out = run(
      `    negSec : DINT := -1;
    negDay : DINT := -86400;
    d1 : DATE; d2 : DATE;
    n1 : DINT; n2 : DINT;`,
      `  d1 := DINT_TO_DATE(negSec);
  d2 := DINT_TO_DATE(negDay);
  n1 := DATE_TO_DINT(d1);
  n2 := DATE_TO_DINT(d2);`,
      `    std::cout << (long long)p.N1.get() << " " << (long long)p.N2.get() << std::endl;`,
      "date_pre_epoch",
    );
    // One second before the epoch floors to 1969-12-31, which is -86400
    // seconds; exactly one day before is unchanged at -86400.
    expect(out).toBe("-86400 -86400");
  });

  it("agrees with DATE_OF_DT on where a pre-epoch instant falls", () => {
    // The specific inconsistency the review found: two helpers, same
    // question, different answers. Asserted against each other rather than
    // against a hard-coded number, so they cannot drift apart again.
    const out = run(
      `    negSec : DINT := -1;
    viaInt : DATE;
    viaDT : DATE;
    same : BOOL;`,
      `  viaInt := DINT_TO_DATE(negSec);
  viaDT := DATE_OF_DT(DWORD_TO_DT(negSec));
  same := viaInt = viaDT;`,
      `    std::cout << (p.SAME.get() ? "agree" : "DISAGREE") << std::endl;`,
      "date_of_dt_agreement",
    );
    expect(out).toBe("agree");
  });

  it("still scales TIME to milliseconds after the runtime cast was neutered", () => {
    // The runtime `TO_TIME(numeric)` used to multiply by 1e6 itself. That
    // moved into codegen, so this checks the forward and reverse TIME paths
    // did not fall through the gap in between.
    const out = run(
      `    t : TIME := T#1500ms;
    ms : DINT;
    backT : TIME;
    okBack : BOOL;`,
      `  ms     := TIME_TO_DINT(t);
  backT  := DINT_TO_TIME(ms);
  okBack := backT = t;`,
      `    std::cout << (long long)p.MS.get() << " "
              << (p.OKBACK.get() ? "1" : "0") << std::endl;`,
      "time_round_trip",
    );
    expect(out).toBe("1500 1");
  });
});
