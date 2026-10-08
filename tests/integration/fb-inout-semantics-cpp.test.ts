/**
 * VAR_IN_OUT of a function block: the caller's variable, bound by reference.
 *
 * IEC 61131-3 §3.48: an in-out variable "is used to supply a value to a
 * program organization unit and which is additionally used to return a value
 * from the program organization unit"; §6.6.2.2 rule 6 / Figure 13 NOTE 3: the
 * block modifies the variable passed; §6.6.3.4.1: the binding is "stored" in
 * the instance between calls. A value in-out is a `strucpp::InOut<V>` member
 * the call binds to the caller's variable (iec_var.hpp). It used to be a copy,
 * copied in before the call and back after it, which lost a write when one
 * variable was passed to two in-outs and wrote `arr[i]` back to whichever
 * element `i` named after the call — both pinned below, now passing.
 *
 * Where a reference cannot be made the call still copies in and back: a bit of
 * a word (`w.3`), an actual of another declared length, and a shared global
 * (VAR_EXTERNAL), which the thread-safe globals copy in and back under its
 * lock. The debugger shows each in-out as a live, read-only view of the bound
 * variable (LEAF_FLAG_INDIRECT): forcing is done at the variable's own name.
 *
 * `strucpp --test` also emits in-outs now: its code generator used to skip the
 * FB parameter maps, so a TEST block saw none of a block's in-out writes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import {
  hasGpp,
  runE2ETestPipeline,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
  CXX_STD,
} from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("strucpp --test runs a block's in-outs", () => {
  it("returns the block's writes to the caller's variables", () => {
    const source = `
FUNCTION_BLOCK Bump
  VAR_IN_OUT io : INT; text : STRING; END_VAR
  VAR_INPUT step : INT; END_VAR
  io := io + step;
  text := CONCAT(text, '!');
END_FUNCTION_BLOCK
`;
    const test = `
TEST 'in-outs come back to the caller'
  VAR b : Bump; v : INT; s : STRING; END_VAR
  v := 5; s := 'hi';
  b(io := v, text := s, step := 2);
  ASSERT_EQ(v, 7);
  ASSERT_EQ(s, 'hi!');
  b(v, s, 3);
  ASSERT_EQ(v, 10);
  ASSERT_EQ(s, 'hi!!');
END_TEST
`;
    const { stdout, exitCode } = runE2ETestPipeline({
      sourceST: source,
      testST: test,
      testFileName: "test_inout.st",
      tempDirPrefix: "strucpp-test-inout-",
    });
    expect(stdout).toContain("[PASS] in-outs come back to the caller");
    expect(exitCode).toBe(0);
  });
});

const SOURCE = `
TYPE Rec : STRUCT n : INT; txt : STRING(20); END_STRUCT; END_TYPE

FUNCTION_BLOCK TwoIo
  VAR_IN_OUT io : INT; io2 : INT; END_VAR
  VAR_OUTPUT seen : INT; END_VAR
  io := io + 1;      (* a write through the first in-out *)
  seen := io2;       (* read through the second: the same variable *)
END_FUNCTION_BLOCK

FUNCTION_BLOCK MoveIndex
  VAR_IN_OUT i : INT; el : INT; END_VAR
  el := 99;          (* the element the caller passed *)
  i := 2;            (* and the index it passed it by *)
END_FUNCTION_BLOCK

FUNCTION_BLOCK Inner
  VAR_IN_OUT r : Rec; END_VAR
  r.n := r.n + 10;
  r.txt := CONCAT(r.txt, '+');
END_FUNCTION_BLOCK

FUNCTION_BLOCK Outer
  VAR_IN_OUT r : Rec; END_VAR
  VAR inner : Inner; seenN : INT; END_VAR
  inner(r := r);     (* an in-out passed on to an in-out *)
  seenN := r.n;
END_FUNCTION_BLOCK

FUNCTION_BLOCK SetBit
  VAR_IN_OUT b : BOOL; END_VAR
  b := TRUE;
END_FUNCTION_BLOCK

FUNCTION_BLOCK Grow
  VAR_IN_OUT s : STRING(20); END_VAR
  s := CONCAT(s, 'xyz');
END_FUNCTION_BLOCK

FUNCTION_BLOCK Add1
  VAR_IN_OUT x : INT; END_VAR
  VAR_OUTPUT seen : INT; END_VAR
  seen := x;
  x := x + 1;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  two : TwoIo; v : INT;
  mover : MoveIndex; k : INT; arr : ARRAY[1..3] OF INT;
  outerFb : Outer; recv : Rec;
  setb : SetBit; w : WORD;
  grow : Grow; s5 : STRING(5);
  adder : Add1; f : INT;
END_VAR
  v := 5;
  two(io := v, io2 := v);
  k := 1;
  mover(i := k, el := arr[k]);
  recv.n := 1; recv.txt := 'a';
  outerFb(r := recv);
  setb(b := w.3);          (* a bit: copied in and back *)
  s5 := 'ab';
  grow(s := s5);           (* another length: copied in and back *)
  adder(x := f);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

const MAIN = `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp;
int main(int argc, char** argv) {
  auto& p = g_config.INSTANCE0;
  if (argc > 1) p.F.force(40);      // a forced actual
  p.run();
  std::printf("v=%d seen=%d k=%d arr=%d,%d,%d rec=%d,%s outerSeen=%d w=%u s5=%s fseen=%d f=%d\\n",
              (int)p.V, (int)p.TWO.SEEN, (int)p.K, (int)p.ARR[1], (int)p.ARR[2], (int)p.ARR[3],
              (int)p.RECV.N, p.RECV.TXT.get().c_str(), (int)p.OUTERFB.SEENN, (unsigned)p.W,
              p.S5.get().c_str(), (int)p.ADDER.SEEN, (int)p.F);
  return 0;
}
`;

describeIfGpp(
  "FB in-outs are the caller's variable (IEC 61131-3 §3.48)",
  () => {
    let tempDir: string;
    let bin = "";
    let debugMap: { leaves: Array<Record<string, unknown>> } = { leaves: [] };

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-inout-"));
      const result = compile(SOURCE, { headerFileName: "generated.hpp" });
      expect(result.errors.map((e) => e.message)).toEqual([]);
      debugMap = result.debugMap as unknown as typeof debugMap;
      fs.writeFileSync(path.join(tempDir, "generated.hpp"), result.headerCode);
      fs.writeFileSync(path.join(tempDir, "generated.cpp"), result.cppCode);
      fs.writeFileSync(
        path.join(tempDir, "generated_debug.cpp"),
        result.debugTableCpp!,
      );
      fs.writeFileSync(path.join(tempDir, "main.cpp"), MAIN);
      bin = path.join(tempDir, "inout");
      execSync(
        `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${tempDir}" -o "${bin}" ` +
          `"${path.join(tempDir, "main.cpp")}" "${path.join(tempDir, "generated.cpp")}" ` +
          `"${path.join(tempDir, "generated_debug.cpp")}"`,
        { encoding: "utf-8", env: cxxEnv },
      );
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    const run = (...args: string[]): Record<string, string> =>
      Object.fromEntries(
        execSync(`"${bin}" ${args.join(" ")}`, { encoding: "utf-8" })
          .trim()
          .split(" ")
          .map((kv) => kv.split("=") as [string, string]),
      );

    it("the same variable on two in-outs keeps the callee's write (was a known failure)", () => {
      const r = run();
      expect(r.v).toBe("6");
      expect(r.seen).toBe("6");
    });

    it("an in-out element is written back to the element passed (was a known failure)", () => {
      const r = run();
      expect(r.k).toBe("2");
      expect(r.arr).toBe("99,0,0");
    });

    it("an in-out passed on to another block's in-out reaches the same variable", () => {
      const r = run();
      expect(r.rec).toBe("11,a+");
      expect(r.outerSeen).toBe("11");
    });

    it("copies a bit and a string of another length in and back", () => {
      const r = run();
      expect(r.w).toBe("8");
      // STRING(5) through a STRING(20) in-out: 'abxyz' fits the actual.
      expect(r.s5).toBe("abxyz");
    });

    it("a forced actual is read as forced and keeps its forced value", () => {
      const r = run("force");
      expect(r.fseen).toBe("40");
      expect(r.f).toBe("40");
    });

    it("shows each in-out as a live, read-only view of the caller's variable", () => {
      const byPath = new Map(debugMap.leaves.map((l) => [l.path as string, l]));
      expect(byPath.get("INSTANCE0.TWO.IO")).toMatchObject({
        indirect: true,
        readOnly: true,
        target: "INSTANCE0.V",
      });
      expect(byPath.get("INSTANCE0.OUTERFB.R.N")).toMatchObject({
        indirect: true,
        target: "INSTANCE0.RECV.N",
      });
      // Through Outer's own in-out: the same variable two levels down.
      expect(byPath.get("INSTANCE0.OUTERFB.INNER.R.TXT")).toMatchObject({
        indirect: true,
        target: "INSTANCE0.RECV.TXT",
      });
      // A computed index: no static target.
      const el = byPath.get("INSTANCE0.MOVER.EL")!;
      expect(el).toMatchObject({ indirect: true, readOnly: true });
      expect(el.target).toBeUndefined();
      expect(byPath.get("INSTANCE0.V")!.indirect).toBeUndefined();
    });

    it("the runtime reads an in-out leaf through its binding and refuses to write it", () => {
      const leaf = (p: string) =>
        debugMap.leaves.find((l) => l.path === p) as {
          arrayIdx: number;
          elemIdx: number;
        };
      const io = leaf("INSTANCE0.TWO.IO");
      const v = leaf("INSTANCE0.V");
      const probe = `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp::debug;
int main() {
  auto& p = g_config.INSTANCE0;
  p.run();
  p.V = 123;                       // the caller changes its variable after the call
  uint8_t buf[8] = {0};
  int16_t got = 0;
  handle_read(${io.arrayIdx}, ${io.elemIdx}, buf);
  std::memcpy(&got, buf, 2);
  const int16_t val = 7;
  uint8_t st = handle_write(${io.arrayIdx}, ${io.elemIdx}, reinterpret_cast<const uint8_t*>(&val), 2);
  uint8_t fs = handle_set(${io.arrayIdx}, ${io.elemIdx}, true, reinterpret_cast<const uint8_t*>(&val), 2);
  uint8_t vw = handle_write(${v.arrayIdx}, ${v.elemIdx}, reinterpret_cast<const uint8_t*>(&val), 2);
  std::printf("%d %d %d %d %d\\n", (int)got, st == STATUS_READ_ONLY, fs == STATUS_READ_ONLY,
              vw == STATUS_OK, (int)p.V);
  return 0;
}
`;
      fs.writeFileSync(path.join(tempDir, "probe.cpp"), probe);
      const probeBin = path.join(tempDir, "probe");
      execSync(
        `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${tempDir}" -o "${probeBin}" ` +
          `"${path.join(tempDir, "probe.cpp")}" "${path.join(tempDir, "generated.cpp")}" ` +
          `"${path.join(tempDir, "generated_debug.cpp")}"`,
        { encoding: "utf-8", env: cxxEnv },
      );
      // Live (123, not the 6 the call left), read-only both ways, and the
      // variable itself still writable at its own name.
      expect(execSync(`"${probeBin}"`, { encoding: "utf-8" }).trim()).toBe(
        "123 1 1 1 7",
      );
    });
  },
);

describe("RETAIN and VAR_IN_OUT", () => {
  it("leaves a RETAIN instance's in-outs out of the retain list, with a warning (IEC 61131-3 §6.5.6)", () => {
    const result = compile(
      `FUNCTION_BLOCK Keep
  VAR_IN_OUT io : INT; END_VAR
  VAR kept : INT; END_VAR
  kept := io;
END_FUNCTION_BLOCK
PROGRAM Main
  VAR RETAIN k : Keep; END_VAR
  VAR v : INT; END_VAR
  k(io := v);
END_PROGRAM
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`,
      { headerFileName: "generated.hpp" },
    );
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const retained = (result.debugMap!.retainVars ?? []).map((v) => v.path);
    expect(retained).toEqual(["INSTANCE0.K.KEPT"]);
    expect(result.warnings.map((w) => w.message).join("\n")).toContain(
      "VAR_IN_OUT 'INSTANCE0.K.IO' is not retained",
    );
  });
});

describeIfGpp("library blocks with in-outs", () => {
  const LIB = `
FUNCTION_BLOCK LibBump
  VAR_IN_OUT io : INT; END_VAR
  io := io + 1;
END_FUNCTION_BLOCK`;
  const PROG = `
PROGRAM Main
  VAR b : LibBump; v : INT; END_VAR
  v := 5;
  b(io := v);
END_PROGRAM
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

  const buildLib = (): StlibArchive => {
    const lib = compileStlib([{ source: LIB, fileName: "bump.st" }], {
      name: "bump-lib",
      version: "1.0.0",
      namespace: "bump",
    });
    expect(lib.errors).toEqual([]);
    return JSON.parse(JSON.stringify(lib.archive)) as StlibArchive;
  };

  /** The archive as a STruC++ from before in-outs were bound would have written it. */
  const asCopyArchive = (archive: StlibArchive): StlibArchive => {
    for (const fb of archive.manifest.functionBlocks)
      delete fb.inoutsByReference;
    for (const chunk of archive.chunks) {
      chunk.header = chunk.header.replace(
        "strucpp::InOut<IEC_INT> IO;",
        "IEC_INT IO;",
      );
      chunk.cpp = chunk.cpp.split("IO.var()").join("IO");
    }
    return archive;
  };

  const runWith = (archive: StlibArchive) => {
    const result = compile(PROG, {
      headerFileName: "generated.hpp",
      libraries: [archive],
    });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-inout-lib-"));
    fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
    fs.writeFileSync(path.join(dir, "generated.cpp"), result.cppCode);
    fs.writeFileSync(
      path.join(dir, "main.cpp"),
      `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
int main() { g_config.INSTANCE0.run(); std::printf("%d\\n", (int)g_config.INSTANCE0.V); return 0; }
`,
    );
    const bin = path.join(dir, "lib");
    execSync(
      `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE_PATH}" -I"${dir}" -o "${bin}" ` +
        `"${path.join(dir, "main.cpp")}" "${path.join(dir, "generated.cpp")}"`,
      { encoding: "utf-8", env: cxxEnv },
    );
    const out = execSync(`"${bin}"`, { encoding: "utf-8" }).trim();
    fs.rmSync(dir, { recursive: true, force: true });
    return { result, out };
  };

  it("binds a current archive's in-outs by reference and debugs them as the caller's variable", () => {
    const archive = buildLib();
    expect(archive.manifest.functionBlocks[0]!.inoutsByReference).toBe(true);
    const { result, out } = runWith(archive);
    expect(out).toBe("6");
    expect(result.cppCode).toMatch(
      /strucpp::iec_inout_bind\(B\.IO, \*__io\d+\);/,
    );
    const leaf = result.debugMap!.leaves.find(
      (l) => l.path === "INSTANCE0.B.IO",
    );
    expect(leaf).toMatchObject({
      indirect: true,
      readOnly: true,
      target: "INSTANCE0.V",
    });
  });

  it("copies an older archive's in-outs in and back, and says so", () => {
    const { result, out } = runWith(asCopyArchive(buildLib()));
    expect(out).toBe("6");
    expect(result.cppCode).toContain("B.IO = V;");
    expect(result.cppCode).toContain("V = B.IO;");
    expect(result.warnings.map((w) => w.message).join("\n")).toContain(
      "Library 'bump-lib' was built before VAR_IN_OUT was bound by reference",
    );
    const leaf = result.debugMap!.leaves.find(
      (l) => l.path === "INSTANCE0.B.IO",
    );
    expect(leaf?.indirect).toBeUndefined();
  });
});
