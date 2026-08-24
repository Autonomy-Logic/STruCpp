/**
 * The generated debug table has to compile.
 *
 * `debugTableCpp` addresses every leaf variable by name through
 * `&g_config.INSTANCE.MEMBER...`, so it only builds if every one of those names
 * matches what codegen actually declared. Nothing else in the pipeline checks
 * that: `strucpp file.st` emits no debug table, and `--build` (the REPL binary)
 * does not include one either. The ST compiles, the program's C++ compiles, and
 * the failure appears only in a full firmware build, in a file the user never
 * wrote.
 *
 * That gap let the member-mangling rule drift between the class definition and
 * the table, in both directions — mangling too little named a member that does
 * not exist (`RunningLights : RunningLights` is declared `RUNNINGLIGHTS_`),
 * mangling too much did the same in reverse (`Time : TIME` is declared plain
 * `TIME`). Each case below fails to compile if the two disagree.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { hasGpp } from "./test-helpers.js";

const RUNTIME_INCLUDE = path.resolve(__dirname, "../../src/runtime/include");

const describeIfGpp = hasGpp ? describe : describe.skip;

const CFG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

const MOTOR = `
FUNCTION_BLOCK Motor
VAR_INPUT run : BOOL; END_VAR
VAR_OUTPUT spinning : BOOL; END_VAR
  spinning := run;
END_FUNCTION_BLOCK`;

describeIfGpp("generated debug table compiles", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dbgtable-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Compile ST, then syntax-check the generated debug table against the
   * generated header. Returns g++'s output, empty when it compiled.
   */
  function buildDebugTable(source: string, testName: string): string {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.debugTableCpp, "no debug table was generated").toBeTruthy();

    const dir = path.join(tempDir, testName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    const tablePath = path.join(dir, "generated_debug.cpp");
    fs.writeFileSync(tablePath, result.debugTableCpp!);
    // The program's own C++ goes through the same member names, so check it in
    // the same pass — the invocation paths appear only there.
    const programPath = path.join(dir, "generated.cpp");
    fs.writeFileSync(programPath, result.cppCode);

    for (const target of [programPath, tablePath]) {
      try {
        execSync(
          `g++ -std=c++17 -fsyntax-only -I"${RUNTIME_INCLUDE}" -I"${dir}" "${target}" 2>&1`,
          { encoding: "utf-8" },
        );
      } catch (e) {
        return (e as { stdout?: string }).stdout ?? String(e);
      }
    }
    return "";
  }

  it("compiles for a member whose name matches its type, in a PROGRAM", () => {
    expect(
      buildDebugTable(
        `${MOTOR}
PROGRAM Main
VAR Motor : Motor; plain : BOOL; END_VAR
  Motor(run := plain);
END_PROGRAM${CFG}`,
        "program_var",
      ),
    ).toBe("");
  });

  it("compiles for the same member one scope in, inside a FUNCTION_BLOCK", () => {
    // Used to fail: "no member named 'MOTOR' in 'strucpp::RIG'".
    expect(
      buildDebugTable(
        `${MOTOR}
FUNCTION_BLOCK Rig
VAR Motor : Motor; idle : BOOL; END_VAR
  Motor(run := idle);
END_FUNCTION_BLOCK
PROGRAM Main
VAR r : Rig; END_VAR
  r();
END_PROGRAM${CFG}`,
        "fb_member",
      ),
    ).toBe("");
  });

  it("compiles for a STRUCT field whose name matches its type", () => {
    // Used to fail: "no member named 'INNER' in 'strucpp::RIG'".
    expect(
      buildDebugTable(
        `
TYPE
  Inner : STRUCT v : BOOL; w : INT; END_STRUCT;
  Rig : STRUCT Inner : Inner; plain : BOOL; END_STRUCT;
END_TYPE
PROGRAM Main
VAR r : Rig; END_VAR
  r.plain := FALSE;
END_PROGRAM${CFG}`,
        "struct_field",
      ),
    ).toBe("");
  });

  it("compiles for a member colliding with an implemented interface method", () => {
    // Used to fail: "cannot create a non-constant pointer to member function"
    // — the table took the address of the method rather than the variable.
    expect(
      buildDebugTable(
        `
INTERFACE IMotor
  METHOD Start : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Drive IMPLEMENTS IMotor
VAR Start : BOOL; other : INT; END_VAR
  METHOD Start : BOOL
    Start := TRUE;
  END_METHOD
  other := 1;
END_FUNCTION_BLOCK
PROGRAM Main
VAR d : Drive; END_VAR
  d();
END_PROGRAM${CFG}`,
        "iface_method",
      ),
    ).toBe("");
  });

  it("compiles for variables named after elementary types", () => {
    // The inverse failure: mangling these would address a `TIME_` that codegen
    // never declared.
    expect(
      buildDebugTable(
        `
PROGRAM Main
VAR Time : TIME; Word : WORD; Date : DATE; Real : REAL; END_VAR
  Time := T#0s;
END_PROGRAM${CFG}`,
        "elementary_names",
      ),
    ).toBe("");
  });

  it("compiles for elementary-named members of an FB and a STRUCT", () => {
    expect(
      buildDebugTable(
        `
TYPE Bag : STRUCT Time : TIME; Word : WORD; END_STRUCT; END_TYPE
FUNCTION_BLOCK Holder
VAR Time : TIME; b : Bag; END_VAR
  Time := T#0s;
END_FUNCTION_BLOCK
PROGRAM Main
VAR h : Holder; g : Bag; END_VAR
  h();
END_PROGRAM${CFG}`,
        "elementary_nested",
      ),
    ).toBe("");
  });

  it("compiles for a variable named after an enum type", () => {
    expect(
      buildDebugTable(
        `
TYPE Color : (Red, Green, Blue); END_TYPE
PROGRAM Main
VAR Color : Color; plain : BOOL; END_VAR
  plain := FALSE;
END_PROGRAM${CFG}`,
        "enum_name",
      ),
    ).toBe("");
  });

  it("compiles for an ordinary project with arrays and nested structs", () => {
    // A broad shape check, so this file also guards the table's other address
    // forms against the next change to the walker.
    expect(
      buildDebugTable(
        `
TYPE
  Point : STRUCT x : REAL; y : REAL; END_STRUCT;
  Frame : STRUCT origin : Point; label : BOOL; END_STRUCT;
END_TYPE
PROGRAM Main
VAR
  grid : ARRAY[0..2] OF Point;
  frame : Frame;
  counts : ARRAY[1..4] OF INT;
  flag : BOOL;
END_VAR
  flag := FALSE;
END_PROGRAM${CFG}`,
        "ordinary",
      ),
    ).toBe("");
  });

  it("compiles for an FB whose parameters collide, invoked with all forms", () => {
    // The invocation assigns inputs, copies VAR_IN_OUT back and captures `=>`
    // through `instance.MEMBER`; a colliding parameter used to reach nothing
    // ("no member named 'READING' in 'strucpp::SENSOR'"). Compiling the program
    // is the assertion here — the table only exercises the declarations.
    expect(
      buildDebugTable(
        `
TYPE Reading : STRUCT v : REAL; END_STRUCT; END_TYPE
INTERFACE IProbe
  METHOD Arm : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Sensor IMPLEMENTS IProbe
VAR_INPUT Reading : Reading; Arm : BOOL; gain : REAL; END_VAR
VAR_OUTPUT out1 : REAL; END_VAR
VAR_IN_OUT acc : Reading; END_VAR
  METHOD Arm : BOOL
    Arm := TRUE;
  END_METHOD
  out1 := Reading.v * gain;
  acc.v := out1;
END_FUNCTION_BLOCK
PROGRAM Main
VAR s : Sensor; inp : Reading; tally : Reading; got : REAL; END_VAR
  s(Reading := inp, Arm := TRUE, gain := 2.0, acc := tally, out1 => got);
END_PROGRAM${CFG}`,
        "fb_invocation",
      ),
    ).toBe("");
  });

  it("compiles for multi-dimensional arrays", () => {
    // `Array2D`/`Array3D` have no chained `[i][j]` operator, so the table has to
    // address an element as `(i, j)` — `formatArrayElementAccess` owns that rank
    // rule. Until it did, any project with a 2D array and debug enabled failed
    // to build; this keeps the table and the runtime containers in step.
    expect(
      buildDebugTable(
        `
TYPE Point : STRUCT x : REAL; y : REAL; END_STRUCT; END_TYPE
PROGRAM Main
VAR
  counts : ARRAY[0..1, 0..1] OF INT;
  cube : ARRAY[0..1, 0..1, 0..1] OF BOOL;
  places : ARRAY[0..1, 0..1] OF Point;
  flag : BOOL;
END_VAR
  flag := FALSE;
END_PROGRAM${CFG}`,
        "multi_dim",
      ),
    ).toBe("");
  });

  it("compiles for a multi-dimensional array of a type whose name matches its member", () => {
    // Both rules on the same expression: the rank-aware subscript from
    // `formatArrayElementAccess` and the member mangling underneath it.
    expect(
      buildDebugTable(
        `${MOTOR}
FUNCTION_BLOCK Rig
VAR Motor : Motor; idle : BOOL; END_VAR
  Motor(run := idle);
END_FUNCTION_BLOCK
PROGRAM Main
VAR bank : ARRAY[0..1, 0..1] OF Rig; END_VAR
  bank[0, 0]();
END_PROGRAM${CFG}`,
        "multi_dim_mangled",
      ),
    ).toBe("");
  });
});

/**
 * The read-only gate has to hold at RUNTIME, not just compile.
 *
 * A CONSTANT member is declared `const`, but the debug table reaches it
 * through a C-style `(void*)` cast that silently strips the qualifier — so
 * nothing in the type system stops `handle_write` from writing straight into
 * a const object. The only thing that does is the LEAF_FLAG_READONLY bit and
 * the two checks that read it, and a syntax-only check cannot tell whether
 * those actually fire. This builds a real binary and asks it.
 */
describeIfGpp("CONSTANT leaves refuse writes at runtime", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-ro-gate-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("refuses write, force and unforce while still allowing reads", () => {
    const result = compile(
      `PROGRAM Main
VAR CONSTANT LIMIT : DINT := 10; END_VAR
VAR live : DINT := 0; END_VAR
  live := live + 1;
END_PROGRAM${CFG}`,
      { headerFileName: "generated.hpp" },
    );
    expect(result.errors.map((e) => e.message)).toEqual([]);

    const dir = path.join(tempDir, "gate");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "generated_debug.cpp"),
      result.debugTableCpp!,
    );

    // LIMIT and LIVE are the only two leaves; look them up by path rather
    // than assuming an order.
    const idx = (p: string) => {
      const leaf = result.debugMap!.leaves.find((l) => l.path === p);
      expect(leaf, `no leaf for ${p}`).toBeTruthy();
      return `${leaf!.arrayIdx}, ${leaf!.elemIdx}`;
    };

    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp::debug;
int fails = 0;
static void expect_eq(const char* what, int got, int want) {
  if (got != want) { printf("FAIL %s: got 0x%02X want 0x%02X\\n", what, got, want); ++fails; }
}
int main() {
  unsigned char v[8] = {99, 0, 0, 0, 0, 0, 0, 0};
  unsigned char buf[8] = {0};

  // The writable leaf proves the gate is selective, not blanket.
  expect_eq("write live",     handle_write(${idx("INSTANCE0.LIVE")}, v, 4), STATUS_OK);
  expect_eq("force live",     handle_set(${idx("INSTANCE0.LIVE")}, true, v, 4), STATUS_OK);

  // The constant refuses all three mutating operations. Unforce is refused
  // too: it could never have been forced, so reporting OK would claim a
  // force had been cleared that never existed.
  expect_eq("write const",    handle_write(${idx("INSTANCE0.LIMIT")}, v, 4), STATUS_READ_ONLY);
  expect_eq("force const",    handle_set(${idx("INSTANCE0.LIMIT")}, true, v, 4), STATUS_READ_ONLY);
  expect_eq("unforce const",  handle_set(${idx("INSTANCE0.LIMIT")}, false, v, 4), STATUS_READ_ONLY);

  // Reading a constant stays useful — watching one is the whole point.
  unsigned short n = handle_read(${idx("INSTANCE0.LIMIT")}, buf);
  expect_eq("read len", (int)n, 4);
  int got = 0; memcpy(&got, buf, 4);
  expect_eq("read value", got, 10);

  // And the storage itself is untouched by the refused attempts.
  expect_eq("storage intact", (int)(long long)g_config.INSTANCE0.LIMIT, 10);

  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );

    const bin = path.join(dir, "gate");
    execSync(
      `g++ -std=c++17 -I"${RUNTIME_INCLUDE}" -I"${dir}" ` +
        `-o "${bin}" "${path.join(dir, "main.cpp")}" ` +
        `"${path.join(dir, "generated.cpp")}" "${path.join(dir, "generated_debug.cpp")}"`,
      { encoding: "utf-8" },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});

/**
 * The retain marshaller has to WORK, not just compile.
 *
 * `iec_retain.hpp` is shared source: the Arduino firmware and the OpenPLC v4
 * daemon both vendor it, so a bug here is a bug on every target at once, and a
 * blob written by one has to be readable by the other. That makes a real
 * pack → wipe → unpack round-trip the only test worth having — and it is also
 * the only way to check the properties that matter most and are invisible to a
 * compile: that a non-retained variable is left alone, that restore does not
 * FORCE anything, and that a corrupt or stale blob is refused rather than
 * unpacked into the wrong variables.
 */
describeIfGpp("retain blob round-trips through the real runtime", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-retain-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("saves, wipes and restores every retained leaf and nothing more", () => {
    const result = compile(
      `FUNCTION_BLOCK Inner
VAR_INPUT en : BOOL; END_VAR
VAR RETAIN ticks : DINT; END_VAR
VAR NON_RETAIN scratch : DINT; END_VAR
  IF en THEN ticks := ticks + 1; END_IF;
  scratch := 1;
END_FUNCTION_BLOCK
PROGRAM Main
VAR RETAIN held : Inner; END_VAR
VAR loose : Inner; END_VAR
VAR RETAIN boots : DINT; END_VAR
  held(); loose();
END_PROGRAM
CONFIGURATION Config0
  VAR_GLOBAL RETAIN g_hours : DINT; END_VAR
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`,
      { headerFileName: "generated.hpp" },
    );
    expect(result.errors.map((e) => e.message)).toEqual([]);

    const dir = path.join(tempDir, "roundtrip");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(path.join(dir, "generated_debug.cpp"), result.debugTableCpp!);

    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include "iec_retain.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp;
static int fails = 0;
static void chk(const char* what, bool ok) { if (!ok) { printf("FAIL %s\\n", what); ++fails; } }
static uint16_t rd(uint8_t a, uint16_t e, uint8_t* d) { return debug::handle_read(a, e, d); }
static uint8_t  wr(uint8_t a, uint16_t e, const uint8_t* b, uint16_t n) { return debug::handle_write(a, e, b, n); }
static uint16_t sz(uint8_t a, uint16_t e) { return debug::handle_size(a, e); }

int main() {
  chk("something is retained", debug::retain_var_count > 0);
  chk("blob is header + payload", retain::blob_size(sz) == retain::HEADER_SIZE + retain::payload_size(sz));

  g_config.INSTANCE0.BOOTS = 4242;
  g_config.INSTANCE0.HELD.TICKS = 777;
  g_config.INSTANCE0.LOOSE.TICKS = 555;   // FB-local RETAIN in a NON-retained instance
  G_HOURS.value = 99;

  unsigned char blob[512] = {0};
  size_t n = retain::pack(blob, sizeof(blob), rd, sz);
  chk("packed", n == retain::blob_size(sz));

  // A power cycle: every value back to zero.
  g_config.INSTANCE0.BOOTS = 0;
  g_config.INSTANCE0.HELD.TICKS = 0;
  g_config.INSTANCE0.LOOSE.TICKS = 0;
  G_HOURS.value = 0;
  // Not retained — must NOT be resurrected.
  g_config.INSTANCE0.HELD.SCRATCH = 31337;

  chk("unpack ok", retain::unpack(blob, n, wr, sz) == retain::LoadResult::Ok);
  chk("program local", (int)g_config.INSTANCE0.BOOTS == 4242);
  chk("inherited fb member", (int)g_config.INSTANCE0.HELD.TICKS == 777);
  chk("fb-local retain in non-retained instance", (int)g_config.INSTANCE0.LOOSE.TICKS == 555);
  chk("configuration global", (int)G_HOURS.value == 99);
  chk("NON_RETAIN left alone", (int)g_config.INSTANCE0.HELD.SCRATCH == 31337);
  // Restore is a plain write: forcing would pin the value and stop the program
  // moving it on the next scan.
  chk("restore did not force", !g_config.INSTANCE0.BOOTS.is_forced());

  unsigned char bad[512];
  memcpy(bad, blob, n); bad[retain::HEADER_SIZE] ^= 0xFF;
  chk("corrupt payload refused", retain::unpack(bad, n, wr, sz) == retain::LoadResult::BadCrc);

  // Flip the layout hash and re-crc, so ONLY the layout differs.
  memcpy(bad, blob, n); bad[4] ^= 0x01;
  { uint32_t c = retain::crc32(bad, 10);
    c = retain::crc32(bad + retain::HEADER_SIZE, retain::get_u16(bad + 8), c);
    retain::put_u32(bad + 10, c ^ 0xFFFFFFFFu); }
  chk("stale layout refused", retain::unpack(bad, n, wr, sz) == retain::LoadResult::StaleLayout);

  memcpy(bad, blob, n); bad[0] ^= 0xFF;
  chk("bad magic refused", retain::unpack(bad, n, wr, sz) == retain::LoadResult::BadMagic);
  chk("empty store is Empty", retain::unpack(blob, 0, wr, sz) == retain::LoadResult::Empty);
  chk("short blob is Truncated", retain::unpack(blob, retain::HEADER_SIZE - 1, wr, sz) == retain::LoadResult::Truncated);

  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );

    const bin = path.join(dir, "retain");
    execSync(
      `g++ -std=c++17 -I"${RUNTIME_INCLUDE}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}" ` +
        `"${path.join(dir, "generated_debug.cpp")}"`,
      { encoding: "utf-8" },
    );
    expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
  });
});
