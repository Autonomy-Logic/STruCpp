/**
 * DOPE-613 — a block whose inputs mix a global and a local.
 *
 * `GlobalVar::read()` used to return the *underlying* scalar (`value.get()`)
 * rather than the IEC value type `V`. Locals, literals and composite-global
 * fields all present as `IECVar<T>`, so a scalar global was the one operand kind
 * that differed, and the constrained std-lib templates — which take a single
 * shared parameter for both operands, `template<typename T> T ADD(T, T)` —
 * failed to deduce:
 *
 *     error: no matching function for call to 'ADD(int, strucpp::IEC_INT&)'
 *     note: deduced conflicting types for parameter 'T'
 *           ('int' and 'strucpp::IECVar<int>')
 *
 * `operator T()` cannot rescue this: implicit conversions are not considered
 * during template argument deduction.
 *
 * These tests are end-to-end through g++ on purpose. The defect lived entirely
 * in C++ overload resolution — ST → C++ translation succeeded the whole time —
 * so a codegen-string assertion would have stayed green throughout.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { compile } from "../../src/index.js";
import {
  hasGpp,
  createPCH,
  compileWithGpp,
  compileAndRunStandalone,
  RUNTIME_INCLUDE_PATH,
  cxxEnv,
} from "./test-helpers.js";

const describeIfGpp = hasGpp ? describe : describe.skip;

/** The two operands a block can be given, and how the defect was triggered. */
type Operands = "global+local" | "global+global" | "local+local";

const OPERANDS: Record<Operands, [string, string]> = {
  "global+local": ["g", "l"],
  "global+global": ["g", "g"],
  "local+local": ["l", "l"],
};

/**
 * A one-rung program: `o := FN(a, b)` where each operand is the global or the
 * local. This is the shape LD and FBD always emit — the graphical languages
 * write the call form, which is why they took the full weight of this bug while
 * hand-written ST using infix `a + b` escaped it.
 */
function program(
  fn: string,
  type: string,
  operands: Operands,
  resultType = type,
): string {
  const [a, b] = OPERANDS[operands];
  return `
CONFIGURATION C
  VAR_GLOBAL g : ${type} := ${type === "REAL" ? "7.0" : "7"}; END_VAR
  RESOURCE R ON PLC
    TASK T(INTERVAL := T#100ms, PRIORITY := 1);
    PROGRAM Inst WITH T : MAIN;
  END_RESOURCE
END_CONFIGURATION

PROGRAM MAIN
  VAR_EXTERNAL g : ${type}; END_VAR
  VAR
    l : ${type} := ${type === "REAL" ? "3.0" : "3"};
    o : ${resultType};
  END_VAR
  o := ${fn}(${a}, ${b});
END_PROGRAM
`;
}

/** Every function whose signature shares one template parameter across operands. */
const AFFECTED: ReadonlyArray<{
  fn: string;
  type: string;
  resultType?: string;
}> = [
  // ANY_NUM arithmetic
  { fn: "ADD", type: "INT" },
  { fn: "SUB", type: "INT" },
  { fn: "MUL", type: "INT" },
  { fn: "DIV", type: "INT" },
  { fn: "MOD", type: "INT" },
  // ANY_BIT logic
  { fn: "AND", type: "WORD" },
  { fn: "OR", type: "WORD" },
  { fn: "XOR", type: "WORD" },
  // ANY_REAL, two operands
  { fn: "ATAN2", type: "REAL" },
];

describeIfGpp("DOPE-613 — mixing a global and a local on a block input", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dope613-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Translate ST, then hand the generated C++ to g++. */
  function buildsWithGpp(
    source: string,
    testName: string,
  ): { success: boolean; error?: string } {
    const result = compile(source, { headerFileName: "generated.hpp" });
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    return compileWithGpp({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName,
    });
  }

  describe("the regression: one global, one local", () => {
    it.each(AFFECTED)(
      "$fn($type) compiles with a global and a local",
      ({ fn, type, resultType }) => {
        const res = buildsWithGpp(
          program(fn, type, "global+local", resultType),
          `mixed_${fn}_${type}`,
        );
        expect(res.error ?? "").not.toContain("no matching function");
        expect(res.success).toBe(true);
      },
    );
  });

  describe("controls: the same call with matched operand kinds", () => {
    // These compiled before the fix too. They are here so a future regression
    // is attributed correctly — to the global path, not to the function itself.
    it.each(AFFECTED)(
      "$fn($type) compiles with two globals",
      ({ fn, type, resultType }) => {
        const res = buildsWithGpp(
          program(fn, type, "global+global", resultType),
          `allglobal_${fn}_${type}`,
        );
        expect(res.success).toBe(true);
      },
    );

    it.each(AFFECTED)(
      "$fn($type) compiles with two locals",
      ({ fn, type, resultType }) => {
        const res = buildsWithGpp(
          program(fn, type, "local+local", resultType),
          `alllocal_${fn}_${type}`,
        );
        expect(res.success).toBe(true);
      },
    );
  });

  describe("the value reaching the block, not merely that it builds", () => {
    /** Translate ST, build a binary that drives the program, return its stdout. */
    function run(source: string, mainBody: string, testName: string): string {
      const result = compile(source, { headerFileName: "generated.hpp" });
      expect(result.errors.map((e) => e.message)).toEqual([]);
      return compileAndRunStandalone({
        tempDir,
        pchPath,
        headerCode: result.headerCode,
        cppCode: result.cppCode,
        testName,
        mainCode: `#include <iostream>\n\nint main() {\n    using namespace strucpp;\n${mainBody}\n    return 0;\n}\n`,
      });
    }

    it("adds the global to the local rather than a default-constructed value", () => {
      const out = run(
        program("ADD", "INT", "global+local"),
        `    Program_MAIN p(&G);\n    p.run();\n    std::cout << p.O.get() << std::endl;`,
        "value_add_mixed",
      );
      expect(out).toBe("10"); // g := 7, l := 3
    });

    it("honours a force on the global through the block input", () => {
      // Forcing is the reason GlobalVar exists in this shape, and the fix
      // changes what read() hands back — so prove the forced value still wins,
      // and that unforcing hands control back to writes.
      //
      // Note the third step writes before reading. force() deliberately stores
      // through to the raw value as well, so that plugins reading raw_ptr() see
      // the forced value; unforce() only clears the flag. The canonical
      // therefore still holds the forced value until something sets it again,
      // and asserting a bare revert to 10 would be asserting the wrong contract.
      const out = run(
        program("ADD", "INT", "global+local"),
        [
          "    Program_MAIN p(&G);",
          "    p.run();  std::cout << p.O.get() << std::endl;",
          "    G.value.force(100);",
          "    p.run();  std::cout << p.O.get() << std::endl;",
          "    G.value.unforce();",
          "    G.write(7);",
          "    p.run();  std::cout << p.O.get() << std::endl;",
        ].join("\n"),
        "force_through_block_input",
      );
      expect(out.split("\n").map((s) => s.trim())).toEqual(["10", "103", "10"]);
    });

    it("ignores a write to a forced global, as the canonical does", () => {
      // set() is a no-op while forced. Reading through a block input must show
      // the same, or the scan could appear to overwrite an engineer's force.
      const out = run(
        program("ADD", "INT", "global+local"),
        [
          "    Program_MAIN p(&G);",
          "    G.value.force(100);",
          "    G.write(42);",
          "    p.run();  std::cout << p.O.get() << std::endl;",
        ].join("\n"),
        "write_to_forced_global",
      );
      expect(out).toBe("103");
    });

    it("does not let the returned snapshot write back to the global", () => {
      // read() now hands back an IECVar rather than a scalar. It must stay a
      // detached copy: mutating it must not reach the canonical, or a block
      // input would be able to clobber a global it only meant to read.
      const out = run(
        program("ADD", "INT", "global+local"),
        [
          "    auto snapshot = G.read();",
          "    snapshot.set(999);",
          "    std::cout << G.read().get() << std::endl;",
        ].join("\n"),
        "snapshot_is_detached",
      );
      expect(out).toBe("7");
    });
  });
});

/**
 * Threading. The generated scan path reads globals through `read()`, and under
 * STRUCPP_THREADED that read is the only thing standing between two tasks and a
 * torn value. The fix changes what `read()` returns, so re-establish that the
 * snapshot is still taken atomically under the global's own mutex.
 *
 * Built as a standalone TU rather than through the shared helper: the helper's
 * precompiled header is built without -DSTRUCPP_THREADED, and g++ rejects a PCH
 * whose macro state disagrees with the TU including it.
 */
describeIfGpp(
  "DOPE-613 — GlobalVar under contention (STRUCPP_THREADED)",
  () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-dope613-mt-"));
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    function compileAndRunThreaded(source: string, testName: string): string {
      const srcPath = path.join(tempDir, `${testName}.cpp`);
      const binPath = path.join(tempDir, testName);
      fs.writeFileSync(srcPath, source);
      execSync(
        `g++ -std=c++17 -O2 -DSTRUCPP_THREADED -pthread -I"${RUNTIME_INCLUDE_PATH}" "${srcPath}" -o "${binPath}" 2>&1`,
        { encoding: "utf-8", env: cxxEnv },
      );
      return execSync(`"${binPath}"`, {
        encoding: "utf-8",
        timeout: 30000,
      }).trim();
    }

    it("never returns a torn value while writers hammer the same global", () => {
      // A 64-bit LWORD is the widest scalar we carry and the one a non-atomic
      // read could plausibly tear on a 32-bit bus. Writers only ever store
      // all-zero-nibbles or all-F-nibbles, so any other bit pattern the reader
      // observes is a value assembled from two different writes.
      const source = `
#include "iec_global.hpp"
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>

using namespace strucpp;

static GlobalVar<IEC_LWORD> g{0};
static std::atomic<bool> stop{false};
static std::atomic<uint64_t> torn{0};
static std::atomic<uint64_t> reads{0};

int main() {
    const uint64_t kZero = 0x0000000000000000ULL;
    const uint64_t kOnes = 0xFFFFFFFFFFFFFFFFULL;

    std::vector<std::thread> writers;
    for (int i = 0; i < 4; ++i) {
        writers.emplace_back([&, i] {
            while (!stop.load(std::memory_order_relaxed)) {
                g.write(i % 2 == 0 ? kZero : kOnes);
            }
        });
    }

    // The reader uses exactly the expression generated code uses for a block
    // input: g.read(), then the value out of the returned snapshot.
    std::thread reader([&] {
        while (!stop.load(std::memory_order_relaxed)) {
            uint64_t seen = g.read().get();
            if (seen != kZero && seen != kOnes) torn.fetch_add(1, std::memory_order_relaxed);
            reads.fetch_add(1, std::memory_order_relaxed);
        }
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    stop.store(true, std::memory_order_relaxed);
    for (auto& w : writers) w.join();
    reader.join();

    // Report rather than assert in C++, so a failure shows the numbers.
    std::cout << "torn=" << torn.load() << std::endl;
    std::cout << "progressed=" << (reads.load() > 1000 ? 1 : 0) << std::endl;
    return 0;
}
`;
      const out = compileAndRunThreaded(source, "global_contention");
      const lines = Object.fromEntries(
        out.split("\n").map((l) => {
          const [k, v] = l.trim().split("=");
          return [k, Number(v)];
        }),
      );
      expect(lines.torn).toBe(0);
      // Guards against the test passing because the reader deadlocked or the
      // writers starved it — zero torn reads out of zero reads proves nothing.
      expect(lines.progressed).toBe(1);
    }, 60000);

    it("serialises a read against a concurrent write of a wide value", () => {
      // Complements the above: a single writer flipping between two patterns while
      // many readers observe, which is the actual multi-task shape in runtime v4.
      const source = `
#include "iec_global.hpp"
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>

using namespace strucpp;

static GlobalVar<IEC_LWORD> g{0};
static std::atomic<bool> stop{false};
static std::atomic<uint64_t> torn{0};
static std::atomic<uint64_t> reads{0};

int main() {
    const uint64_t kA = 0x0123456789ABCDEFULL;
    const uint64_t kB = 0xFEDCBA9876543210ULL;

    std::thread writer([&] {
        bool flip = false;
        while (!stop.load(std::memory_order_relaxed)) {
            g.write(flip ? kA : kB);
            flip = !flip;
        }
    });

    std::vector<std::thread> readers;
    for (int i = 0; i < 4; ++i) {
        readers.emplace_back([&] {
            while (!stop.load(std::memory_order_relaxed)) {
                uint64_t seen = g.read().get();
                if (seen != kA && seen != kB && seen != 0) torn.fetch_add(1, std::memory_order_relaxed);
                reads.fetch_add(1, std::memory_order_relaxed);
            }
        });
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    stop.store(true, std::memory_order_relaxed);
    writer.join();
    for (auto& r : readers) r.join();

    std::cout << "torn=" << torn.load() << std::endl;
    std::cout << "progressed=" << (reads.load() > 1000 ? 1 : 0) << std::endl;
    return 0;
}
`;
      const out = compileAndRunThreaded(source, "global_contention_wide");
      const lines = Object.fromEntries(
        out.split("\n").map((l) => {
          const [k, v] = l.trim().split("=");
          return [k, Number(v)];
        }),
      );
      expect(lines.torn).toBe(0);
      expect(lines.progressed).toBe(1);
    }, 60000);

    it("keeps a forced global forced when read concurrently", () => {
      // force()/unforce() run on the canonical while readers go through read().
      // Every observation must be one of the two legitimate values — never a
      // half-applied force.
      const source = `
#include "iec_global.hpp"
#include <atomic>
#include <cstdint>
#include <iostream>
#include <thread>
#include <vector>

using namespace strucpp;

static GlobalVar<IEC_LWORD> g{0};
static std::atomic<bool> stop{false};
static std::atomic<uint64_t> bad{0};
static std::atomic<uint64_t> reads{0};

int main() {
    const uint64_t kReal  = 0x1111111111111111ULL;
    const uint64_t kForce = 0x2222222222222222ULL;
    g.write(kReal);

    std::thread forcer([&] {
        while (!stop.load(std::memory_order_relaxed)) {
            g.with_lock([&](IEC_LWORD* v) { v->force(kForce); return 0; });
            g.with_lock([&](IEC_LWORD* v) { v->unforce(); return 0; });
        }
    });

    std::vector<std::thread> readers;
    for (int i = 0; i < 3; ++i) {
        readers.emplace_back([&] {
            while (!stop.load(std::memory_order_relaxed)) {
                uint64_t seen = g.read().get();
                if (seen != kReal && seen != kForce) bad.fetch_add(1, std::memory_order_relaxed);
                reads.fetch_add(1, std::memory_order_relaxed);
            }
        });
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(300));
    stop.store(true, std::memory_order_relaxed);
    forcer.join();
    for (auto& r : readers) r.join();

    std::cout << "bad=" << bad.load() << std::endl;
    std::cout << "progressed=" << (reads.load() > 1000 ? 1 : 0) << std::endl;
    return 0;
}
`;
      const out = compileAndRunThreaded(source, "global_force_contention");
      const lines = Object.fromEntries(
        out.split("\n").map((l) => {
          const [k, v] = l.trim().split("=");
          return [k, Number(v)];
        }),
      );
      expect(lines.bad).toBe(0);
      expect(lines.progressed).toBe(1);
    }, 60000);
  },
);
