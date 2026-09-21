// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * A native C++ block walking a STRUCT handed to it on an `ANY` pin.
 *
 * `tests/backend/type-descriptor.test.ts` checks the SHAPE of the emitted
 * tables. It cannot check the arithmetic: every offset is a C++ constant
 * expression, because only the target compiler knows its own padding and
 * because a struct member is a WRAPPER whose payload the descriptor has to
 * address. So this compiles the generated code and runs it.
 *
 * The three things that would silently ship wrong data if they broke:
 *
 *   1. An offset addressing the WRAPPER rather than the payload. `IECVar` puts
 *      the forcing flag straight after the value, so a block reading a forced
 *      member would get a bool back as its data with nothing able to tell.
 *   2. A STRING member's payload being anything but the characters. PLCnext
 *      ships a documented foot-gun here — raw STRING payloads with header
 *      bytes in front — and this asserts STruC++ does not.
 *   3. A STRING member written through the descriptor leaving the cached
 *      length stale, so the ST side keeps reading the old one.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

const SOURCE = `
TYPE COLOUR : (RED, GREEN, BLUE); END_TYPE

TYPE INNER : STRUCT
  TAGNAME : STRING(8);
  N : INT;
END_STRUCT END_TYPE

TYPE STATION : STRUCT
  NAME : STRING(20);
  SPEEDRPM : REAL;
  SUB : INNER;
  HUE : COLOUR;
  READINGS : ARRAY[1..4] OF DINT;
  POINTS : ARRAY[0..2] OF INNER;
END_STRUCT END_TYPE

FUNCTION_BLOCK PUBLISHER
VAR_INPUT PAYLOAD : ANY; END_VAR
END_FUNCTION_BLOCK

PROGRAM MAIN
VAR
  ST : STATION;
  P : PUBLISHER;
END_VAR
  P(PAYLOAD := ST);
END_PROGRAM
`;

describeIfGpp("struct layout descriptors on an ANY pin", () => {
  let tempDir = "";
  let pchPath = "";
  let headerCode = "";
  let cppCode = "";

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-typedesc-"));
    pchPath = createPCH(tempDir);
    const result = compile(SOURCE, { programName: "MAIN" });
    expect(result.success, JSON.stringify(result.errors)).toBe(true);
    headerCode = result.headerCode ?? "";
    cppCode = result.cppCode ?? "";
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const run = (body: string, testName: string) =>
    compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode,
      cppCode,
      testName,
      mainCode: `
#include "generated.hpp"
#include <cstdio>
#include <cstring>
using namespace strucpp;
int main() {
${body}
  std::printf("DONE\\n");
  return 0;
}
`,
    });

  it("names every member, with its CODESYS class and capacity", () => {
    const out = run(
      `
  const TypeDesc* d = &STATION__TYPEDESC;
  std::printf("name=%s count=%u size=%u\\n",
              d->NAME, (unsigned)d->MEMBERCOUNT, (unsigned)d->SIZE);
  for (uint16_t i = 0; i < d->MEMBERCOUNT; ++i) {
    const MemberDesc& m = d->MEMBERS[i];
    std::printf("%s cls=%d base=%d n=%u cap=%u type=%s nested=%s\\n",
                m.NAME, (int)m.TYPECLASS, (int)m.BASETYPECLASS,
                (unsigned)m.NUMELEMENTS, (unsigned)m.CAP, m.TYPENAME,
                m.NESTED ? m.NESTED->NAME : "-");
  }
`,
      "typedesc_members",
    );

    // SIZE is sizeof the generated struct, which depends on the target's
    // padding — assert it is reported and non-zero, not what it equals.
    expect(out).toMatch(/name=STATION count=6 size=(\d+)/);
    expect(Number(/size=(\d+)/.exec(out)?.[1])).toBeGreaterThan(0);
    // The classes are CODESYS's TYPE_CLASS values — the same enumeration
    // IEC_ANY::TYPECLASS uses, not a second parallel one.
    expect(out).toContain(
      "NAME cls=16 base=16 n=1 cap=20 type=STRING nested=-",
    );
    expect(out).toContain(
      "SPEEDRPM cls=14 base=14 n=1 cap=0 type=REAL nested=-",
    );
    expect(out).toContain(
      "SUB cls=28 base=28 n=1 cap=0 type=INNER nested=INNER",
    );
    expect(out).toContain("HUE cls=25 base=25 n=1 cap=0 type=COLOUR nested=-");
    // An array reports TYPE_ARRAY and names its element in BASETYPECLASS,
    // exactly as IEC_ANY reports TYPECLASS/ELEMCLASS.
    expect(out).toContain(
      "READINGS cls=26 base=8 n=4 cap=0 type=ARRAY OF DINT nested=-",
    );
    expect(out).toContain(
      "POINTS cls=26 base=28 n=3 cap=0 type=ARRAY OF INNER nested=INNER",
    );
  });

  it("addresses every member payload, not the wrapper around it", () => {
    // `raw_ptr()` is the runtime's own answer for where a payload lives, so
    // comparing against it is comparing against the thing that must agree.
    const out = run(
      `
  STATION s;
  uint8_t* b = reinterpret_cast<uint8_t*>(&s);
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  const MemberDesc* im = INNER__TYPEDESC.MEMBERS;
  std::printf("NAME=%d\\n",     (void*)(b + m[0].BYTEOFFSET) == (void*)s.NAME.raw_ptr());
  std::printf("SPEEDRPM=%d\\n", (void*)(b + m[1].BYTEOFFSET) == (void*)s.SPEEDRPM.raw_ptr());
  std::printf("HUE=%d\\n",      (void*)(b + m[3].BYTEOFFSET) == (void*)s.HUE.raw_ptr());
  std::printf("READINGS=%d\\n", (void*)(b + m[4].BYTEOFFSET) == (void*)s.READINGS.elements()->raw_ptr());
  std::printf("SUBTAG=%d\\n",   (void*)(b + m[2].BYTEOFFSET + im[0].BYTEOFFSET) == (void*)s.SUB.TAGNAME.raw_ptr());
  std::printf("SUBN=%d\\n",     (void*)(b + m[2].BYTEOFFSET + im[1].BYTEOFFSET) == (void*)s.SUB.N.raw_ptr());
  std::printf("POINT1=%d\\n",   (void*)(b + m[5].BYTEOFFSET + m[5].STRIDE + im[1].BYTEOFFSET) == (void*)s.POINTS.at(1).N.raw_ptr());
`,
      "typedesc_offsets",
    );
    for (const key of [
      "NAME",
      "SPEEDRPM",
      "HUE",
      "READINGS",
      "SUBTAG",
      "SUBN",
      "POINT1",
    ]) {
      expect(out).toContain(`${key}=1`);
    }
  });

  it("reads a forced member as its value, not as the forcing flag", () => {
    // The failure this exists to catch: an offset pointing at the wrapper
    // rather than the payload reads `forced_` — a bool that happens to sit
    // right after the value — and every published reading becomes 1 or 0.
    const out = run(
      `
  STATION s;
  uint8_t* b = reinterpret_cast<uint8_t*>(&s);
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  s.SPEEDRPM = 1234.5f;
  std::printf("plain=%.1f\\n", *(float*)(b + m[1].BYTEOFFSET));
  s.SPEEDRPM.force(99.5f);
  std::printf("forced=%.1f\\n", *(float*)(b + m[1].BYTEOFFSET));
`,
      "typedesc_forced",
    );
    expect(out).toContain("plain=1234.5");
    expect(out).toContain("forced=99.5");
  });

  it("makes a STRING payload the characters, with no header in front", () => {
    const out = run(
      `
  STATION s;
  uint8_t* b = reinterpret_cast<uint8_t*>(&s);
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  s.NAME = IECString<20>("HELLO");
  std::printf("chars=[%s]\\n", (const char*)(b + m[0].BYTEOFFSET));
  std::printf("firstbyte=%d\\n", (int)*(b + m[0].BYTEOFFSET));
`,
      "typedesc_string_payload",
    );
    expect(out).toContain("chars=[HELLO]");
    // 'H', not a length byte.
    expect(out).toContain("firstbyte=72");
  });

  it("lands a write through a member offset in the caller’s variable", () => {
    const out = run(
      `
  STATION s;
  uint8_t* b = reinterpret_cast<uint8_t*>(&s);
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  const MemberDesc* im = INNER__TYPEDESC.MEMBERS;
  *(float*)(b + m[1].BYTEOFFSET) = 60.25f;
  *(int16_t*)(b + m[2].BYTEOFFSET + im[1].BYTEOFFSET) = 4242;
  *(int32_t*)(b + m[4].BYTEOFFSET + 2 * m[4].STRIDE) = 777;
  std::printf("speed=%.2f\\n", (double)s.SPEEDRPM.get());
  std::printf("subn=%d\\n", (int)s.SUB.N.get());
  std::printf("reading3=%d\\n", (int)s.READINGS.at(3).get());
`,
      "typedesc_writeback",
    );
    expect(out).toContain("speed=60.25");
    expect(out).toContain("subn=4242");
    expect(out).toContain("reading3=777");
  });

  it("re-caches a string length written through the descriptor", () => {
    // Without sync_strings the length stays as it was, so a four-character
    // name written over a nine-character one still reads as nine — five of
    // them whatever the member held before.
    const out = run(
      `
  STATION s;
  uint8_t* b = reinterpret_cast<uint8_t*>(&s);
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  const MemberDesc* im = INNER__TYPEDESC.MEMBERS;
  s.NAME = IECString<20>("LONGORIGINAL");
  s.SUB.TAGNAME = IECString<8>("ORIGINAL");

  std::strcpy((char*)(b + m[0].BYTEOFFSET), "SHORT");
  std::strcpy((char*)(b + m[2].BYTEOFFSET + im[0].BYTEOFFSET), "AB");
  std::printf("stale=%u,%u\\n",
              (unsigned)s.NAME.get().length(), (unsigned)s.SUB.TAGNAME.get().length());

  sync_strings(&s, &STATION__TYPEDESC);
  std::printf("synced=%u,%u\\n",
              (unsigned)s.NAME.get().length(), (unsigned)s.SUB.TAGNAME.get().length());
  std::printf("values=[%s][%s]\\n", s.NAME.get().c_str(), s.SUB.TAGNAME.get().c_str());
`,
      "typedesc_sync",
    );
    expect(out).toContain("stale=12,8");
    expect(out).toContain("synced=5,2");
    expect(out).toContain("values=[SHORT][AB]");
  });

  it("clamps an overlong write to the member, leaving its neighbour alone", () => {
    // CAP is what a block sizes its buffer from, so a struct whose members sit
    // adjacent must not let one member's resync walk into the next.
    const out = run(
      `
  STATION s;
  uint8_t* b = reinterpret_cast<uint8_t*>(&s);
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  const MemberDesc* im = INNER__TYPEDESC.MEMBERS;
  s.SUB.N = 4242;
  std::memset((char*)(b + m[2].BYTEOFFSET + im[0].BYTEOFFSET), 'Z', 8);
  sync_strings(&s, &STATION__TYPEDESC);
  std::printf("len=%u n=%d\\n",
              (unsigned)s.SUB.TAGNAME.get().length(), (int)s.SUB.N.get());
`,
      "typedesc_clamp",
    );
    expect(out).toContain("len=8 n=4242");
  });

  it("shadows a descriptor field exactly as IEC_ANY already does", () => {
    // The descriptor's fields are spelled as CODESYS spells VAR_INFO's, which
    // means a C++ POU must not name one of its own pins after one: the editor
    // binds a POU's Variables Table with `#define <NAME> (*(vars-><NAME>))`,
    // and codegen upper-cases every ST identifier.
    //
    // This is not a NEW hazard introduced by the descriptor — IEC_ANY's
    // TYPECLASS and PVALUE have always behaved this way. The test pins that
    // equivalence, so the rule stays one rule ("rename the pin") rather than
    // becoming a special case somebody has to learn separately.
    const probe = (field: string, expr: string) => {
      try {
        run(
          `
#define ${field} (*(shadow))
  int shadow_v = 0, *shadow = &shadow_v;
  ${expr}
`,
          `typedesc_shadow_${field}`,
        );
        return "compiled";
      } catch {
        return "shadowed";
      }
    };

    // A pre-existing IEC_ANY field and a new descriptor field behave alike.
    expect(
      probe("PVALUE", 'IEC_ANY a{}; std::printf("%p", (void*)a.PVALUE);'),
    ).toBe("shadowed");
    expect(
      probe(
        "TYPENAME",
        'std::printf("%s", STATION__TYPEDESC.MEMBERS[0].TYPENAME);',
      ),
    ).toBe("shadowed");

    // A pin whose name is not a descriptor field is unaffected.
    expect(
      probe(
        "SPEED_SP",
        'std::printf("%s", STATION__TYPEDESC.MEMBERS[0].TYPENAME);',
      ),
    ).toBe("compiled");
  });

  it("agrees with __VARINFO, which shares its vocabulary", () => {
    // The two halves must answer the same question the same way: a block that
    // already reads __VARINFO output should read a struct member the same way.
    // `member_info()` is the bridge, and this is what pins it.
    const out = run(
      `
  STATION s;
  const MemberDesc* m = STATION__TYPEDESC.MEMBERS;
  VAR_INFO fromMember = member_info(m[1], &s);   // SPEEDRPM : REAL
  std::printf("cls=%d type=%s bits=%d addr=%d off=%u area=%d\\n",
              (int)fromMember.TYPECLASS, fromMember.TYPENAME.c_str(),
              (int)fromMember.BITSIZE,
              fromMember.BYTEADDRESS == (uintptr_t)s.SPEEDRPM.raw_ptr(),
              (unsigned)fromMember.BYTEOFFSET, (int)fromMember.AREA);
  // CODESYS fills NumElements only for an array, so a scalar reports 0 even
  // though MemberDesc carries 1 to keep one walk loop.
  std::printf("scalarN=%u arrayN=%u\\n",
              (unsigned)fromMember.NUMELEMENTS,
              (unsigned)member_info(m[4], &s).NUMELEMENTS);
`,
      "typedesc_varinfo_bridge",
    );
    expect(out).toContain("cls=14 type=REAL");
    expect(out).toContain("addr=1");
    expect(out).toContain("area=-1");
    expect(out).toContain("scalarN=0 arrayN=4");
  });

  it("hands the descriptor to the callee at the call site", () => {
    expect(cppCode).toContain("&STATION__TYPEDESC");
    expect(cppCode).toContain(
      "strucpp::sync_strings(&ST, &STATION__TYPEDESC);",
    );
  });
});
