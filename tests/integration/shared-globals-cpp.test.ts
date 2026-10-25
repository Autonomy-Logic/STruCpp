/**
 * Shared globals under concurrent tasks: every access to a global is locked,
 * no global lock is taken while another is held (except a global FB
 * instance's lock around its own call), and the result is the same C++ in a
 * single-thread build.
 *
 * Each case compiles the generated code three ways — STRUCPP_THREADED (std
 * locks), STRUCPP_THREADED + STRUCPP_PLATFORM_THREADS (stub platform locks
 * that also record how many global locks a thread holds at once) and
 * unthreaded — and runs a host program that checks the values.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { discoverStlibs } from "../../src/node/library-loader.js";
import { hasGpp, RUNTIME_INCLUDE_PATH, CXX_STD, cxxEnv } from "./test-helpers.js";

const LIBRARIES = discoverStlibs(path.resolve(__dirname, "../../libs"));

const describeIfGpp = hasGpp ? describe : describe.skip;

type Mode = "threaded" | "platform" | "unthreaded";
const MODES: Mode[] = ["threaded", "platform", "unthreaded"];
const FLAGS: Record<Mode, string> = {
  threaded: "-DSTRUCPP_THREADED",
  platform: "-DSTRUCPP_THREADED -DSTRUCPP_PLATFORM_THREADS",
  unthreaded: "",
};

// Platform locks for the host: a recursive mutex per global. MAX_HELD() is the
// most global locks one thread has held at once; LOCKS() counts acquisitions.
const PLATFORM_STUBS = `
#include <mutex>
#include <atomic>
static thread_local int t_held = 0;
static std::atomic<int> g_max_held{0};
static std::atomic<int> g_locks{0};
static void note_held() {
  ++g_locks;
  int h = ++t_held;
  int prev = g_max_held.load();
  while (h > prev && !g_max_held.compare_exchange_weak(prev, h)) {}
}
extern "C" void *strucpp_platform_mutex_create(void) { return new std::recursive_mutex(); }
extern "C" void strucpp_platform_mutex_lock(void *m) { static_cast<std::recursive_mutex *>(m)->lock(); note_held(); }
extern "C" void strucpp_platform_mutex_unlock(void *m) { --t_held; static_cast<std::recursive_mutex *>(m)->unlock(); }
extern "C" bool strucpp_platform_mutex_try_lock(void *m) {
  if (!static_cast<std::recursive_mutex *>(m)->try_lock()) return false;
  note_held();
  return true;
}
extern "C" int64_t *strucpp_platform_current_time_slot(void) { static int64_t slot = 0; return &slot; }
#define MAX_HELD() (g_max_held.load())
#define LOCKS() (g_locks.load())
`;

const NO_STUBS = `
#define MAX_HELD() (1)
`;

// Checks for the host programs.
const CHECK = `
#include <cstdio>
#include <thread>
static int fails = 0;
#define CHECK(c) do { if (!(c)) { std::printf("FAIL line %d: %s\\n", __LINE__, #c); ++fails; } } while (0)
`;

/** No with_lock() lambda of the generated code takes another lock. */
function expectNoNestedLocks(cppCode: string): void {
  const open = "with_lock([&](auto* __glk){";
  for (
    let at = cppCode.indexOf(open);
    at >= 0;
    at = cppCode.indexOf(open, at + 1)
  ) {
    let depth = 1;
    let end = at + open.length;
    while (depth > 0 && end < cppCode.length) {
      if (cppCode[end] === "{") depth++;
      else if (cppCode[end] === "}") depth--;
      end++;
    }
    const body = cppCode.slice(at + open.length, end - 1);
    expect(body, cppCode.slice(at, end)).not.toMatch(
      /with_lock\(|->read\(\)|\.read\(\)/,
    );
  }
}

describeIfGpp("shared globals: locked access, all build modes", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-shared-globals-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Compile `source`, then build and run `main` against the generated code in
   * every mode. `main` sees the CHECK macro and must `return fails ? 1 : 0;`.
   */
  function buildAndRun(
    name: string,
    source: string,
    main: string,
    options: {
      /** Link generated_debug.cpp into the program (`main` defines g_config). */
      linkDebugTable?: boolean;
    } = {},
  ): ReturnType<typeof compile> {
    const result = compile(source, { libraries: LIBRARIES });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    const dir = path.join(tempDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    for (const mode of MODES) {
      const cpp = path.join(dir, `${mode}.cpp`);
      fs.writeFileSync(
        cpp,
        `${result.cppCode}\n${mode === "platform" ? PLATFORM_STUBS : NO_STUBS}\n${CHECK}\n${main}\n`,
      );
      const out = path.join(dir, `${mode}.out`);
      const dbg = path.join(dir, "generated_debug.cpp");
      if (result.debugTableCpp !== undefined) {
        fs.writeFileSync(dbg, result.debugTableCpp);
      }
      const linked = options.linkDebugTable ? `"${dbg}"` : "";
      let diag = "";
      try {
        execSync(
          `g++ -std=${CXX_STD} -pthread ${FLAGS[mode]} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" "${cpp}" ${linked} -o "${out}"`,
          { stdio: "pipe", env: cxxEnv },
        );
        execSync(`"${out}"`, { stdio: "pipe", timeout: 20000 });
      } catch (e) {
        const err = e as { stderr?: Buffer; stdout?: Buffer; signal?: string };
        diag =
          (err.stderr?.toString() ?? "") +
            (err.stdout?.toString() ?? "") +
            (err.signal ? `signal ${err.signal}` : "") || String(e);
      }
      expect(diag, `${name} (${mode})`).toBe("");
    }
    return result;
  }

  it("the global lock is recursive and has try_lock", () => {
    const dir = path.join(tempDir, "runtime-lock");
    fs.mkdirSync(dir, { recursive: true });
    for (const mode of MODES) {
      const cpp = path.join(dir, `${mode}.cpp`);
      fs.writeFileSync(
        cpp,
        `#include "iec_global.hpp"
${mode === "platform" ? PLATFORM_STUBS : NO_STUBS}
${CHECK}
using namespace strucpp;
int main() {
  GlobalVar<IEC_INT> g{0};
  // The holding thread may take the lock again.
  g.with_lock([&](IEC_INT*) { g.with_lock([&](IEC_INT* w) { *w = 5; return 0; }); return 0; });
  CHECK(g.read() == 5);
#ifdef STRUCPP_THREADED
  detail::GlobalMutex m;
  CHECK(m.try_lock());
  bool other = true;
  std::thread t([&] { other = m.try_lock(); if (other) m.unlock(); });
  t.join();
  CHECK(!other);
  m.unlock();
  CHECK(m.try_lock());
  m.unlock();
#endif
  return fails ? 1 : 0;
}
`,
      );
      const out = path.join(dir, `${mode}.out`);
      let diag = "";
      try {
        execSync(
          `g++ -std=${CXX_STD} -pthread ${FLAGS[mode]} -I"${RUNTIME_INCLUDE_PATH}" "${cpp}" -o "${out}"`,
          { stdio: "pipe", env: cxxEnv },
        );
        execSync(`"${out}"`, { stdio: "pipe", timeout: 10000 });
      } catch (e) {
        const err = e as { stderr?: Buffer; stdout?: Buffer; signal?: string };
        diag =
          (err.stderr?.toString() ?? "") +
            (err.stdout?.toString() ?? "") +
            (err.signal ? `signal ${err.signal}` : "") || String(e);
      }
      expect(diag, mode).toBe("");
    }
  }, 60000);

  it("calls a global FB instance under its lock, in place, element included", () => {
    const source = `
      FUNCTION_BLOCK IncFB
        VAR_IN_OUT v : DINT; END_VAR
        v := v + 1;
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR_EXTERNAL
          gTmr : TON; gTmrArr : ARRAY[0..2] OF TON; gIn : BOOL;
          gQ : BOOL; gEno : BOOL; gDint : DINT; gIdx : INT;
        END_VAR
        VAR vQ : BOOL; i : INT := 2; bumper : IncFB; END_VAR
        gTmr(IN := gIn, PT := T#0s, Q => vQ, ENO => gEno);
        gTmrArr[1](IN := TRUE, PT := T#1h, Q => gQ);
        gTmrArr[i](IN := TRUE, PT := T#1h);
        gTmrArr[gIdx](IN := TRUE, PT := T#1h);
        bumper(v := gDint);
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL
          gTmr : TON; gTmrArr : ARRAY[0..2] OF TON; gIn : BOOL := TRUE;
          gQ : BOOL := TRUE; gEno : BOOL; gDint : DINT := 4; gIdx : INT;
        END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = buildAndRun(
      "fb-calls",
      source,
      `int main() {
  strucpp::Configuration_CFG cfg;
  cfg.INST.run();
  CHECK(strucpp::GTMR.value.IN == true);
  CHECK(strucpp::GENO.read() == true);
  CHECK(strucpp::GTMRARR.value[0].IN == true);
  CHECK(strucpp::GTMRARR.value[1].IN == true);
  CHECK(strucpp::GTMRARR.value[2].IN == true);
  CHECK(strucpp::GQ.read() == false);
  CHECK(strucpp::GDINT.read() == 5);
  CHECK(MAX_HELD() == 1);
  return fails ? 1 : 0;
}`,
    );
    // An element is called in place, never on a copy.
    expect(result.cppCode).toContain("auto& __fbi = (*__glk).at(1);");
    // Outputs leave the lock through a temporary.
    expect(result.cppCode).toMatch(/VQ = __gfo\d+;/);
    expect(result.cppCode).toMatch(/GENO->write\(__gfo\d+\);/);
    // An index that reads another global is read before the lock.
    expect(result.cppCode).toMatch(
      /auto (__gwv_\d+) = GIDX->read\(\);\s*GTMRARR->with_lock\(\[&\]\(auto\* __glk\)\{\s*auto& __fbi = \(\*__glk\)\.at\(\1\);/,
    );
    expectNoNestedLocks(result.cppCode);
  }, 120000);

  it("calls a method of a global FB instance under its lock", () => {
    const result = compile(
      `
      FUNCTION_BLOCK Counter
        VAR n : DINT; END_VAR
        METHOD PUBLIC Add : DINT
          VAR_INPUT d : DINT; END_VAR
          n := n + d;
          Add := n;
        END_METHOD
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR_EXTERNAL gC : Counter; gD : DINT; END_VAR
        VAR r : DINT; END_VAR
        r := gC.Add(gD);
        gC.Add(1);
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL gC : Counter; gD : DINT; END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
        END_RESOURCE
      END_CONFIGURATION
    `,
      { libraries: LIBRARIES },
    );
    expect(result.errors.map((e) => e.message)).toEqual([]);
    // The argument is read first; the call runs under the instance's lock.
    expect(result.cppCode).toMatch(
      /\[&\]\{ auto (__gma\d+) = GD->read\(\); return GC->with_lock\(\[&\]\(auto\* __glk\)\{ return \(\*__glk\)\.ADD\(\1\); \}\); \}\(\)/,
    );
    expect(result.cppCode).toContain(
      "GC->with_lock([&](auto* __glk){ return (*__glk).ADD(1); })",
    );
  });

  it("reads and writes bits of globals as one locked access", () => {
    const source = `
      TYPE S : STRUCT w : WORD; END_STRUCT; END_TYPE
      PROGRAM Main
        VAR_EXTERNAL
          gWord : WORD; gDint : DINT; gArr : ARRAY[0..2] OF WORD; gS : S;
        END_VAR
        VAR b1 : BOOL; b2 : BOOL; END_VAR
        gWord.3 := TRUE;
        b1 := gWord.3;
        gDint.7 := TRUE;
        gArr[1].2 := TRUE;
        b2 := gArr[1].2;
        gS.w.0 := TRUE;
        gWord.4 := NOT gWord.4;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL
          gWord : WORD; gDint : DINT; gArr : ARRAY[0..2] OF WORD; gS : S;
        END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = buildAndRun(
      "bits",
      source,
      `int main() {
  strucpp::Configuration_CFG cfg;
  cfg.INST.run();
  CHECK(strucpp::GWORD.read() == 0x18);
  CHECK(cfg.INST.B1 == true);
  CHECK(strucpp::GDINT.read() == 0x80);
  CHECK(strucpp::GARR.value[1] == 4);
  CHECK(cfg.INST.B2 == true);
  CHECK(strucpp::GS.value.W == 1);
  return fails ? 1 : 0;
}`,
    );
    expect(result.cppCode).toContain(
      "GWORD->with_lock([&](auto* __glk){ (*__glk) = ((*__glk) & ~(1ULL << 4)) | ((!((static_cast<uint64_t>((*__glk)) >> 4) & 1) ? 1ULL : 0ULL) << 4); });",
    );
    expectNoNestedLocks(result.cppCode);
  }, 120000);

  it("never nests global locks in an index, even a[a[1]]", () => {
    const source = `
      PROGRAM Main
        VAR_EXTERNAL gArr : ARRAY[0..3] OF INT; gIdx : ARRAY[0..1] OF INT; END_VAR
        VAR v : INT; v2 : INT; v3 : INT; END_VAR
        gArr[gArr[1]] := 5;
        v := gArr[gArr[1]];
        gArr[gIdx[0]] := 7;
        v2 := gIdx[gArr[0]];
        IF gArr[gArr[1]] = 5 THEN v3 := 1; END_IF;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL gArr : ARRAY[0..3] OF INT := [0, 2, 0, 0]; gIdx : ARRAY[0..1] OF INT := [3, 9]; END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = buildAndRun(
      "nested-index",
      source,
      `int main() {
  strucpp::Configuration_CFG cfg;
  cfg.INST.run();
  CHECK(strucpp::GARR.value[2] == 5);
  CHECK(cfg.INST.V == 5);
  CHECK(strucpp::GARR.value[3] == 7);
  CHECK(cfg.INST.V2 == 3);
  CHECK(cfg.INST.V3 == 1);
  CHECK(MAX_HELD() == 1);
  return fails ? 1 : 0;
}`,
    );
    expectNoNestedLocks(result.cppCode);
  }, 120000);

  it("makes an assignment that reads its own target one locked step", () => {
    const source = `
      TYPE P : STRUCT x : DINT; END_STRUCT; END_TYPE
      PROGRAM Bump
        VAR_EXTERNAL g : DINT; s : P; a : ARRAY[0..2] OF DINT; other : DINT; END_VAR
        g := g + 1;
        s.x := s.x + 1;
        a[1] := a[1] + other;
      END_PROGRAM
      PROGRAM Grow
        VAR_EXTERNAL str : STRING; END_VAR
        VAR n : INT; END_VAR
        str := CONCAT(str, 'x');
        n := LEN(str);
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL g : DINT; s : P; a : ARRAY[0..2] OF DINT; other : DINT := 1; str : STRING; END_VAR
        RESOURCE Res ON PLC
          TASK t1(INTERVAL := T#10ms, PRIORITY := 0);
          TASK t2(INTERVAL := T#10ms, PRIORITY := 1);
          PROGRAM instA WITH t1 : Bump;
          PROGRAM instB WITH t2 : Bump;
          PROGRAM instC WITH t2 : Grow;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = buildAndRun(
      "rmw",
      source,
      `int main() {
  strucpp::Configuration_CFG cfg;
  const int N = 20000;
#ifdef STRUCPP_THREADED
  std::thread ta([&] { for (int i = 0; i < N; ++i) cfg.INSTA.run(); });
  std::thread tb([&] { for (int i = 0; i < N; ++i) cfg.INSTB.run(); });
  ta.join();
  tb.join();
#else
  for (int i = 0; i < N; ++i) { cfg.INSTA.run(); cfg.INSTB.run(); }
#endif
  CHECK(strucpp::G.read() == 2 * N);
  CHECK(strucpp::S.value.X == 2 * N);
  CHECK(strucpp::A.value[1] == 2 * N);
  for (int i = 0; i < 3; ++i) cfg.INSTC.run();
  CHECK(cfg.INSTC.N == 3);
  CHECK(MAX_HELD() == 1);
  return fails ? 1 : 0;
}`,
    );
    expect(result.cppCode).toContain(
      "G->with_lock([&](auto* __glk){ (*__glk) = (*__glk) + 1; });",
    );
    expect(result.cppCode).toContain(
      "S->with_lock([&](auto* __glk){ (*__glk).X = (*__glk).X + 1; });",
    );
    // The other global is read first, outside the target's lock.
    expect(result.cppCode).toMatch(
      /auto (__gwv_\d+) = OTHER->read\(\);\s*A->with_lock\(\[&\]\(auto\* __glk\)\{ \(\*__glk\)\.at\(1\) = \(\*__glk\)\.at\(1\) \+ \1; \}\);/,
    );
    expect(result.cppCode).toContain(
      'STR->with_lock([&](auto* __glk){ (*__glk) = CONCAT((*__glk), static_cast<IEC_STRING>("x")); });',
    );
    expectNoNestedLocks(result.cppCode);
  }, 120000);

  it("binds in-outs to a global's own storage, under its lock, from two tasks", () => {
    const source = `
      TYPE Station : STRUCT count : DINT; hits : DINT; END_STRUCT; END_TYPE
      TYPE Plant : STRUCT
        pumps : ARRAY[1..3] OF DINT; stn : Station; last : INT; spare : ARRAY[0..1] OF DINT;
      END_STRUCT; END_TYPE
      FUNCTION_BLOCK BumpAll
        VAR_IN_OUT arr : ARRAY[*] OF DINT; END_VAR
        VAR i : DINT; END_VAR
        FOR i := LOWER_BOUND(arr, 1) TO UPPER_BOUND(arr, 1) DO
          arr[i] := arr[i] + 1;
        END_FOR;
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK BumpStation
        VAR_IN_OUT data : Station; END_VAR
        VAR_INPUT seen : INT; END_VAR
        data.count := data.count + 1;
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK AddOther
        VAR_EXTERNAL gOther : DINT; END_VAR
        VAR_IN_OUT arr : ARRAY[*] OF DINT; END_VAR
        arr[LOWER_BOUND(arr, 1)] := arr[LOWER_BOUND(arr, 1)] + gOther;
      END_FUNCTION_BLOCK
      FUNCTION BumpF : BOOL
        VAR_IN_OUT s : Station; END_VAR
        s.hits := s.hits + 1;
        BumpF := TRUE;
      END_FUNCTION
      FUNCTION BumpV : BOOL
        VAR_IN_OUT v : DINT; END_VAR
        VAR_INPUT inc : DINT; END_VAR
        v := v + inc;
        BumpV := TRUE;
      END_FUNCTION
      PROGRAM Worker
        VAR_EXTERNAL dev : Plant; gCount : DINT; gStep : DINT; END_VAR
        VAR all : BumpAll; st : BumpStation; ok : BOOL; k : INT := 1; END_VAR
        all(arr := dev.pumps);
        st(data := dev.stn, seen := dev.last);
        ok := BumpF(dev.stn);
        BumpF(s := dev.stn);
        ok := BumpV(gCount, gStep);
        CASE k OF
          1: dev.last := k;
          2: dev.last := 0;
        END_CASE;
      END_PROGRAM
      PROGRAM Single
        VAR_EXTERNAL dev : Plant; END_VAR
        VAR adder : AddOther; END_VAR
        adder(arr := dev.spare);
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL dev : Plant; gCount : DINT; gStep : DINT := 1; gOther : DINT := 5; END_VAR
        RESOURCE Res ON PLC
          TASK t1(INTERVAL := T#10ms, PRIORITY := 0);
          TASK t2(INTERVAL := T#10ms, PRIORITY := 1);
          PROGRAM instA WITH t1 : Worker;
          PROGRAM instB WITH t2 : Worker;
          PROGRAM instC WITH t2 : Single;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = buildAndRun(
      "inout-binding",
      source,
      `int main() {
  strucpp::Configuration_CFG cfg;
  const int N = 20000;
#ifdef STRUCPP_THREADED
  std::thread ta([&] { for (int i = 0; i < N; ++i) cfg.INSTA.run(); });
  std::thread tb([&] { for (int i = 0; i < N; ++i) cfg.INSTB.run(); });
  ta.join();
  tb.join();
#else
  for (int i = 0; i < N; ++i) { cfg.INSTA.run(); cfg.INSTB.run(); }
#endif
  for (int i = 1; i <= 3; ++i) CHECK(strucpp::DEV.value.PUMPS[i] == 2 * N);
  CHECK(strucpp::DEV.value.STN.COUNT == 2 * N);
  CHECK(strucpp::DEV.value.STN.HITS == 4 * N);
  CHECK(strucpp::DEV.value.LAST == 1);
  CHECK(strucpp::GCOUNT.read() == 2 * N);
  cfg.INSTC.run();
  cfg.INSTC.run();
  CHECK(strucpp::DEV.value.SPARE[0] == 10);
  CHECK(MAX_HELD() == 1);
  return fails ? 1 : 0;
}`,
    );
    // An ARRAY[*] in-out views the global's own array inside its lock.
    expect(result.cppCode).toMatch(
      /DEV->with_lock\(\[&\]\(auto\* __glk\)\{\s*auto& __fbi = ALL;\s*__fbi\.ARR = \(\*__glk\)\.PUMPS;\s*__fbi\(\);/,
    );
    // A value in-out is copied in and back inside the one lock, and an input
    // read from the same global is read inside it too.
    expect(result.cppCode).toMatch(
      /__fbi\.DATA = \(\*__glk\)\.STN;\s*__fbi\.SEEN = \(\*__glk\)\.LAST;\s*__fbi\(\);\s*__fbi\.ENO = true;\s*\(\*__glk\)\.STN = __fbi\.DATA;/,
    );
    // A function binds its in-out to the global under the global's lock; an
    // input reading another global is read before it.
    expect(result.cppCode).toContain(
      "DEV->with_lock([&](auto* __glk){ return BUMPF((*__glk).STN); })",
    );
    expect(result.cppCode).toMatch(
      /\[&\]\{ auto (__gca\d+) = GSTEP->read\(\); return GCOUNT->with_lock\(\[&\]\(auto\* __glk\)\{ return BUMPV\(\(\*__glk\), \1\); \}\); \}\(\)/,
    );
    // A block that takes another global's lock gets a copy, stored back after.
    expect(result.cppCode).toMatch(
      /auto (__gva\d+) = DEV->with_lock\(\[&\]\(auto\* __glk\)\{ return \(\*__glk\)\.SPARE; \}\);\s*ADDER\.ARR = \1;\s*ADDER\(\);/,
    );
    expectNoNestedLocks(result.cppCode);
  }, 120000);

  it("binds outputs, bits, FB instances and indexed elements of globals by reference", () => {
    const source = `
      FUNCTION_BLOCK Counter
        VAR_OUTPUT n : DINT; END_VAR
        n := n + 1;
      END_FUNCTION_BLOCK
      TYPE Plant : STRUCT last : INT; flags : WORD; c : Counter; END_STRUCT; END_TYPE
      FUNCTION_BLOCK UseCounter
        VAR_IN_OUT c : Counter; END_VAR
        VAR_INPUT go : BOOL; END_VAR
        VAR_OUTPUT q : BOOL; END_VAR
        IF go THEN c(); END_IF;
        q := c.n > 0;
      END_FUNCTION_BLOCK
      FUNCTION_BLOCK Flip
        VAR_IN_OUT b : BOOL; END_VAR
        b := NOT b;
      END_FUNCTION_BLOCK
      FUNCTION SetOut : BOOL
        VAR_OUTPUT o : INT; END_VAR
        o := 42;
        SetOut := TRUE;
      END_FUNCTION
      FUNCTION SetBit : BOOL
        VAR_IN_OUT b : BOOL; END_VAR
        b := TRUE;
        SetBit := TRUE;
      END_FUNCTION
      FUNCTION BumpV : BOOL
        VAR_IN_OUT v : DINT; END_VAR
        v := v + 1;
        BumpV := TRUE;
      END_FUNCTION
      PROGRAM Main
        VAR_EXTERNAL dev : Plant; gCnt : Counter; gArr : ARRAY[0..3] OF DINT; gIdx : INT; gQ : BOOL; END_VAR
        VAR ut : UseCounter; fl : Flip; ok : BOOL; x : INT; END_VAR
        ut(c := gCnt, go := TRUE, q => gQ);
        ut(c := dev.c, go := gQ, q => ok);
        ok := SetOut(o => dev.last);
        ok := SetBit(dev.flags.3);
        fl(b := dev.flags.2);
        ok := BumpV(gArr[gIdx]);
        IF x <> 0 THEN
          x := 1;
        ELSIF BumpV(gArr[0]) THEN
          x := 2;
        END_IF;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL dev : Plant; gCnt : Counter; gArr : ARRAY[0..3] OF DINT; gIdx : INT := 2; gQ : BOOL; END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    const result = buildAndRun(
      "byref-shapes",
      source,
      `int main() {
  strucpp::Configuration_CFG cfg;
  cfg.INST.run();
  CHECK(strucpp::GCNT.value.N == 1);
  CHECK(strucpp::GQ.read() == true);
  CHECK(strucpp::DEV.value.C.N == 1);
  CHECK(strucpp::DEV.value.LAST == 42);
  CHECK(strucpp::DEV.value.FLAGS == 12);
  CHECK(strucpp::GARR.value[2] == 1);
  CHECK(strucpp::GARR.value[0] == 1);
  CHECK(cfg.INST.X == 2);
  CHECK(MAX_HELD() == 1);
  return fails ? 1 : 0;
}`,
    );
    // A block in-out points at the global's own instance, under its lock.
    expect(result.cppCode).toMatch(/__fbi\.C = &\(\*__glk\)\.C;/);
    // An index that reads another global is read before the lock.
    expect(result.cppCode).toMatch(
      /auto (__gi\d+) = GIDX->read\(\); return GARR->with_lock\(\[&\]\(auto\* __glk\)\{ return BUMPV\(\(\*__glk\)\.at\(\1\)\); \}\);/,
    );
    expectNoNestedLocks(result.cppCode);
  }, 120000);

  it("generates the hooks a runtime takes a global's lock by index with", () => {
    const source = `
      TYPE P3 : STRUCT x : DINT; y : INT; END_STRUCT; END_TYPE
      PROGRAM Main
        VAR_EXTERNAL gA : DINT; gIn : BOOL; gOut : ARRAY[0..2] OF INT; gS : P3; gTmr : TON; END_VAR
        VAR x : INT; END_VAR
        gA := gA + 2;
        gTmr(IN := gIn, PT := T#1s);
        x := gS.y;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL
          gA : DINT;
          gIn AT %IX0.0 : BOOL;
          gOut AT %QW0 : ARRAY[0..2] OF INT;
          gS : P3;
          gTmr : TON;
          gStr : STRING;
          gOut2 AT %QX1.0 : BOOL;
        END_VAR
        VAR_GLOBAL CONSTANT gK : INT := 2; END_VAR
        RESOURCE Res ON PLC
          TASK t(INTERVAL := T#10ms, PRIORITY := 0);
          PROGRAM inst WITH t : Main;
        END_RESOURCE
      END_CONFIGURATION
    `;
    // g: gA 0, gIn 1, gOut 2, gS 3, gTmr 4, gStr 5, gOut2 6, gK 7.
    const order = ["GA", "GIN", "GOUT", "GS", "GTMR", "GSTR", "GOUT2", "GK"];
    const probe = compile(source, { libraries: LIBRARIES });
    expect(probe.success).toBe(true);
    const leaves = probe.debugMap?.leaves ?? [];
    const expected = leaves.map((l) => {
      const root = l.path.split(/[.[]/)[0]!;
      return `{${l.arrayIdx}, ${l.elemIdx}, ${order.indexOf(root)}}`;
    });
    // Every kind of leaf is in the table: scalar, element, member, FB member.
    const paths = leaves.map((l) => l.path);
    for (const p of [
      "GA",
      "GOUT[1]",
      "GS.Y",
      "GTMR.Q",
      "GSTR",
      "GK",
      "INST.X",
    ]) {
      expect(paths).toContain(p);
    }
    buildAndRun(
      "hooks",
      source,
      `#include <cstdint>
extern "C" uint32_t strucpp_global_count(void);
extern "C" bool strucpp_global_try_lock(uint32_t g);
extern "C" void strucpp_global_lock(uint32_t g);
extern "C" void strucpp_global_unlock(uint32_t g);
extern "C" int32_t strucpp_located_global_index(uint32_t k);
extern "C" int32_t strucpp_debug_global_index(uint8_t arr, uint16_t elem);
strucpp::Configuration_CFG g_config;
struct Leaf { int arr; int elem; int g; };
static const Leaf leaves[] = { ${expected.join(", ")} };
#ifdef STRUCPP_THREADED
static bool try_lock_elsewhere(uint32_t g) {
  bool took = false;
  std::thread t([&] { took = strucpp_global_try_lock(g); if (took) strucpp_global_unlock(g); });
  t.join();
  return took;
}
#endif
int main() {
  g_config.INST.run();
#ifdef STRUCPP_THREADED
  CHECK(strucpp_global_count() == 8);
  // locatedGlobals: gIn, gOut[0..2], gOut2.
  const int32_t located[] = {1, 2, 2, 2, 6};
  for (uint32_t k = 0; k < 5; ++k) CHECK(strucpp_located_global_index(k) == located[k]);
  CHECK(strucpp_located_global_index(5) == -1);
  for (const Leaf& l : leaves) {
    if (strucpp_debug_global_index((uint8_t)l.arr, (uint16_t)l.elem) != l.g) {
      std::printf("leaf %d/%d: want %d\\n", l.arr, l.elem, l.g);
      ++fails;
    }
  }
  // The hook's lock is the one the program takes.
  strucpp::GS.with_lock([&](strucpp::P3*) { CHECK(!try_lock_elsewhere(3)); return 0; });
  CHECK(try_lock_elsewhere(3));
  strucpp_global_lock(0);
  CHECK(!try_lock_elsewhere(0));
  strucpp_global_unlock(0);
  CHECK(try_lock_elsewhere(0));
  CHECK(!strucpp_global_try_lock(8));
#else
  (void)leaves;
#endif
  CHECK(strucpp::GA.read() == 2);
  return fails ? 1 : 0;
}`,
      { linkDebugTable: true },
    );
  }, 120000);
});
