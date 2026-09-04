/**
 * DOPE-614 — forcing a STRING was refused on every target.
 *
 * A string is length-prefixed on the wire: `bytes[0]` carries the character
 * (STRING) or code-unit (WSTRING) count, and `force_string` / `force_wstring`
 * read exactly that many bytes. But `handle_set` gated on
 * `len < type_ops[tag].size`, and for the string tags that `size` is the
 * PADDED field width the read path emits — `DEBUG_STRING_WIDTH` (127) and
 * `DEBUG_WSTRING_WIDTH` (253).
 *
 * Every caller sends a compact payload: the editor's encoder emits
 * `1 + text.length`, so forcing "FF" sends 3 bytes. 3 < 127, refused. The
 * failure surfaced as `ERROR_OUT_OF_MEMORY` because the device's
 * `STATUS_DATA_TOO_LARGE` and the client's `ERROR_OUT_OF_MEMORY` are both
 * 0x82 — that mislabel is tracked separately and is not fixed here.
 *
 * These tests drive `handle_set` directly rather than going through a
 * transport, because the gate is the whole defect: the payload the client
 * already sends was correct, and both baremetal Modbus and the Runtime v4 host
 * hand those same bytes to this one function.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { hasGpp, RUNTIME_INCLUDE_PATH, cxxEnv } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const CFG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

describeIfGpp("DOPE-614 — a compact string payload is accepted", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dope614-"));
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Compile a program plus a C++ driver that calls the dispatch entry points,
   * run it, and return stdout. The driver reports "ALL_OK" or the failures, so
   * a diff shows which assertion broke rather than just a non-zero exit.
   */
  function runDriver(source: string, driverBody: string, name: string): string {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);

    const dir = path.join(tempDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "generated_debug.cpp"),
      result.debugTableCpp!,
    );
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp::debug;
static int fails = 0;
static void expect_eq(const char* what, int got, int want) {
  if (got != want) { printf("FAIL %s: got 0x%02X want 0x%02X\\n", what, got, want); ++fails; }
}
static void expect_str(const char* what, const char* got, const char* want) {
  if (std::strcmp(got, want) != 0) { printf("FAIL %s: got \\"%s\\" want \\"%s\\"\\n", what, got, want); ++fails; }
}
int main() {
${driverBody}
  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`,
    );

    const bin = path.join(dir, name);
    execSync(
      `g++ -std=c++17 -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" ` +
        `-o "${bin}" "${path.join(dir, "main.cpp")}" ` +
        `"${path.join(dir, "generated.cpp")}" "${path.join(dir, "generated_debug.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    return execSync(`"${bin}"`, { encoding: "utf-8" }).trim();
  }

  /** `arrayIdx, elemIdx` for a leaf, looked up by path rather than by order. */
  function leafIndex(
    result: ReturnType<typeof compile>,
    leafPath: string,
  ): string {
    const leaf = result.debugMap!.leaves.find((l) => l.path === leafPath);
    expect(leaf, `no leaf for ${leafPath}`).toBeTruthy();
    return `${leaf!.arrayIdx}, ${leaf!.elemIdx}`;
  }

  const STRING_PROGRAM = `PROGRAM Main
VAR s : STRING := 'initial'; n : DINT := 0; END_VAR
  n := n + 1;
END_PROGRAM${CFG}`;

  const WSTRING_PROGRAM = `PROGRAM Main
VAR w : WSTRING := "initial"; n : DINT := 0; END_VAR
  n := n + 1;
END_PROGRAM${CFG}`;

  it("accepts a 2-character STRING force sent as 3 bytes", () => {
    const result = compile(STRING_PROGRAM, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const s = leafIndex(result, "INSTANCE0.S");

    const out = runDriver(
      STRING_PROGRAM,
      `
  // Exactly what the editor's encoder emits for "FF": one length byte then
  // the characters. 3 bytes against a 127-byte padded field width.
  unsigned char compact[3] = { 2, 'F', 'F' };
  expect_eq("force compact", handle_set(${s}, true, compact, 3), STATUS_OK);
  expect_str("value", g_config.INSTANCE0.S.get().c_str(), "FF");

  unsigned char buf[256] = {0};
  unsigned short n = handle_read(${s}, buf);
  // The READ side stays padded -- this change is set-path only, so a client
  // walking fixed strides is unaffected.
  expect_eq("read width", (int)n, (int)DEBUG_STRING_WIDTH);
  expect_eq("read prefix", (int)buf[0], 2);
`,
      "string_compact",
    );
    expect(out).toBe("ALL_OK");
  });

  it("leaves no stale characters when a short force follows a long one", () => {
    // The worry a compact payload naturally raises: IEC strings are not
    // NUL-terminated on the wire, so does forcing 2 characters over 11 leave
    // the tail behind? It does not -- IECString(ptr, len) sets length_ from the
    // count and terminates at data_[length_], so the prefix is authoritative.
    const result = compile(STRING_PROGRAM, { headerFileName: "generated.hpp" });
    const s = leafIndex(result, "INSTANCE0.S");

    const out = runDriver(
      STRING_PROGRAM,
      `
  unsigned char long_v[12]  = { 11, 'H','E','L','L','O','W','O','R','L','D','1' };
  unsigned char short_v[3]  = { 2, 'A', 'B' };

  expect_eq("force long",  handle_set(${s}, true, long_v, 12), STATUS_OK);
  expect_str("long value", g_config.INSTANCE0.S.get().c_str(), "HELLOWORLD1");

  expect_eq("force short", handle_set(${s}, true, short_v, 3), STATUS_OK);
  expect_str("short value", g_config.INSTANCE0.S.get().c_str(), "AB");
  expect_eq("length", (int)g_config.INSTANCE0.S.get().length(), 2);

  // And what the read path serialises is the short value, not a mixture.
  unsigned char buf[256] = {0};
  handle_read(${s}, buf);
  expect_eq("read prefix", (int)buf[0], 2);
  expect_eq("read c0", (int)buf[1], (int)'A');
  expect_eq("read c1", (int)buf[2], (int)'B');
  expect_eq("read tail zeroed", (int)buf[3], 0);
`,
      "string_no_stale",
    );
    expect(out).toBe("ALL_OK");
  });

  it("accepts a compact WSTRING force, counting code units not bytes", () => {
    // WSTRING's prefix is a code-unit count and each unit is 2 little-endian
    // bytes, so the required length is 1 + 2n, not 1 + n. Getting that wrong
    // would accept a truncated payload and read past it.
    const result = compile(WSTRING_PROGRAM, {
      headerFileName: "generated.hpp",
    });
    const w = leafIndex(result, "INSTANCE0.W");

    const out = runDriver(
      WSTRING_PROGRAM,
      `
  unsigned char compact[5] = { 2, 'F', 0, 'F', 0 };
  expect_eq("force wcompact", handle_set(${w}, true, compact, 5), STATUS_OK);
  expect_eq("wlength", (int)g_config.INSTANCE0.W.get().length(), 2);

  // One byte short of 1 + 2*2 must be refused, not read past.
  unsigned char truncated[4] = { 2, 'Z', 0, 'Z' };
  expect_eq("wtruncated", handle_set(${w}, true, truncated, 4), STATUS_DATA_TOO_LARGE);
`,
      "wstring_compact",
    );
    expect(out).toBe("ALL_OK");
  });

  it("still refuses a payload shorter than its own prefix claims", () => {
    // The gate has to keep doing its job -- the fix narrows what counts as
    // "long enough", it does not remove the check. A prefix that overruns the
    // payload would make force_string read uninitialised memory.
    const result = compile(STRING_PROGRAM, { headerFileName: "generated.hpp" });
    const s = leafIndex(result, "INSTANCE0.S");

    const out = runDriver(
      STRING_PROGRAM,
      `
  // Claims 9 characters, carries 2.
  unsigned char lying[3] = { 9, 'A', 'B' };
  expect_eq("prefix overruns", handle_set(${s}, true, lying, 3), STATUS_DATA_TOO_LARGE);

  // A count past the wire cap is refused before it can truncate silently.
  unsigned char too_long[200] = { 200 };
  expect_eq("over cap", handle_set(${s}, true, too_long, 200), STATUS_DATA_TOO_LARGE);

  // A null payload with force set is refused rather than dereferenced.
  expect_eq("null payload", handle_set(${s}, true, nullptr, 0), STATUS_DATA_TOO_LARGE);

  // The refused attempts left the value alone.
  expect_str("untouched", g_config.INSTANCE0.S.get().c_str(), "initial");
`,
      "string_refusals",
    );
    expect(out).toBe("ALL_OK");
  });

  it("still accepts a fully padded payload, so existing callers keep working", () => {
    // `len` is only ever a lower bound. A caller that pads to the full field
    // width -- which is what a fix on the client side would have done -- must
    // continue to work against this device.
    const result = compile(STRING_PROGRAM, { headerFileName: "generated.hpp" });
    const s = leafIndex(result, "INSTANCE0.S");

    const out = runDriver(
      STRING_PROGRAM,
      `
  unsigned char padded[DEBUG_STRING_WIDTH] = {0};
  padded[0] = 2; padded[1] = 'O'; padded[2] = 'K';
  expect_eq("force padded", handle_set(${s}, true, padded, DEBUG_STRING_WIDTH), STATUS_OK);
  expect_str("padded value", g_config.INSTANCE0.S.get().c_str(), "OK");
`,
      "string_padded",
    );
    expect(out).toBe("ALL_OK");
  });

  it("does not loosen the length check for scalars", () => {
    // The prefix rule applies only to the two string tags. A short scalar
    // payload must still be refused: there is no length byte to validate, so
    // accepting it would memcpy past the end of the caller's buffer.
    const source = `PROGRAM Main
VAR d : DINT := 7; s : STRING := 'x'; END_VAR
  d := d + 1;
END_PROGRAM${CFG}`;
    const result = compile(source, { headerFileName: "generated.hpp" });
    const d = leafIndex(result, "INSTANCE0.D");

    const out = runDriver(
      source,
      `
  unsigned char two[2] = { 1, 2 };
  expect_eq("short scalar", handle_set(${d}, true, two, 2), STATUS_DATA_TOO_LARGE);

  unsigned char four[4] = { 42, 0, 0, 0 };
  expect_eq("exact scalar", handle_set(${d}, true, four, 4), STATUS_OK);
  expect_eq("scalar value", (int)(long long)g_config.INSTANCE0.D, 42);
`,
      "scalar_unchanged",
    );
    expect(out).toBe("ALL_OK");
  });

  it("unforce needs no payload and hands the value back to the program", () => {
    const result = compile(STRING_PROGRAM, { headerFileName: "generated.hpp" });
    const s = leafIndex(result, "INSTANCE0.S");

    const out = runDriver(
      STRING_PROGRAM,
      `
  unsigned char compact[3] = { 2, 'F', 'F' };
  expect_eq("force",   handle_set(${s}, true, compact, 3), STATUS_OK);
  expect_eq("forced?",  g_config.INSTANCE0.S.is_forced() ? 1 : 0, 1);

  // A write while forced is ACCEPTED by the gate and then dropped by
  // IECVar::set(), as for any other type. Asserting the status matters:
  // handle_write had the same length bug, so this assertion passed for the
  // wrong reason until it was fixed -- the write was being refused outright,
  // not ignored because of the force.
  unsigned char other[3] = { 2, 'Q', 'Q' };
  expect_eq("write accepted", handle_write(${s}, other, 3), STATUS_OK);
  expect_str("write ignored", g_config.INSTANCE0.S.get().c_str(), "FF");

  expect_eq("unforce",  handle_set(${s}, false, nullptr, 0), STATUS_OK);
  expect_eq("unforced?", g_config.INSTANCE0.S.is_forced() ? 1 : 0, 0);

  // And writes land again once released.
  handle_write(${s}, other, 3);
  expect_str("write lands", g_config.INSTANCE0.S.get().c_str(), "QQ");
`,
      "string_unforce",
    );
    expect(out).toBe("ALL_OK");
  });
});
