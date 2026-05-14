/**
 * STruC++ Library Chunks Tests
 *
 * Tests for per-symbol chunk extraction (Phase 2 of function-level
 * tree-shaking). Verifies that compileLibrary / compileStlib produce
 * `chunks` arrays with correct kinds, names, deps, and that the
 * `headerCode` / `cppCode` blobs have all chunk markers stripped.
 */

import { describe, it, expect } from "vitest";
import { compileLibrary, compileStlib } from "../../src/library/library-compiler.js";

describe("Library chunks", () => {
  describe("compileLibrary chunk extraction", () => {
    it("emits one chunk per top-level declaration", () => {
      const result = compileLibrary(
        [
          {
            source: `
              TYPE
                Color : (RED, GREEN, BLUE);
                Counter : STRUCT
                  v : INT;
                END_STRUCT;
              END_TYPE
              FUNCTION_BLOCK Incrementer
                VAR_INPUT step : INT; END_VAR
                VAR_OUTPUT total : INT; END_VAR
                VAR state : Counter; END_VAR
                state.v := state.v + step;
                total := state.v;
              END_FUNCTION_BLOCK
              FUNCTION DoubleIt : INT
                VAR_INPUT x : INT; END_VAR
                DoubleIt := x * 2;
              END_FUNCTION
            `,
            fileName: "test.st",
          },
        ],
        { name: "test-lib", version: "1.0.0", namespace: "test_lib" },
      );

      expect(result.success).toBe(true);
      expect(result.chunks).toBeDefined();

      const byKind: Record<string, string[]> = {};
      for (const chunk of result.chunks!) {
        (byKind[chunk.kind] ??= []).push(chunk.name);
      }
      // Names are uppercased (matches codegen normalisation).
      expect(byKind.type?.sort()).toEqual(["COLOR", "COUNTER"]);
      expect(byKind.functionBlock).toEqual(["INCREMENTER"]);
      expect(byKind.function).toEqual(["DOUBLEIT"]);
    });

    it("populates header for every chunk and cpp for FBs/functions only", () => {
      const result = compileLibrary(
        [
          {
            source: `
              TYPE
                T : STRUCT v : INT; END_STRUCT;
              END_TYPE
              FUNCTION_BLOCK FB
                VAR_INPUT a : INT; END_VAR
                VAR_OUTPUT r : INT; END_VAR
                r := a;
              END_FUNCTION_BLOCK
              FUNCTION FN : INT
                VAR_INPUT a : INT; END_VAR
                FN := a;
              END_FUNCTION
            `,
            fileName: "test.st",
          },
        ],
        { name: "test-lib", version: "1.0.0", namespace: "test_lib" },
      );

      expect(result.success).toBe(true);
      const chunks = result.chunks!;
      const typeChunk = chunks.find((c) => c.kind === "type")!;
      const fbChunk = chunks.find((c) => c.kind === "functionBlock")!;
      const fnChunk = chunks.find((c) => c.kind === "function")!;

      expect(typeChunk.header.length).toBeGreaterThan(0);
      expect(typeChunk.cpp).toBe(""); // types are header-only

      expect(fbChunk.header.length).toBeGreaterThan(0);
      expect(fbChunk.cpp.length).toBeGreaterThan(0); // FBs have both

      expect(fnChunk.header.length).toBeGreaterThan(0);
      expect(fnChunk.cpp.length).toBeGreaterThan(0); // functions have both
    });

    it("extracts inline-global chunks from GVL blocks", () => {
      const result = compileLibrary(
        [
          {
            source: `
              VAR_GLOBAL
                GLOBAL_COUNT : INT := 42;
              END_VAR
              FUNCTION USES_IT : INT
                USES_IT := GLOBAL_COUNT;
              END_FUNCTION
            `,
            fileName: "test.st",
          },
        ],
        { name: "test-lib", version: "1.0.0", namespace: "test_lib" },
      );

      expect(result.success).toBe(true);
      const chunks = result.chunks!;
      const globalChunk = chunks.find((c) => c.kind === "inlineGlobal");
      expect(globalChunk?.name).toBe("GLOBAL_COUNT");
      expect(globalChunk?.header).toContain("inline");
    });
  });

  describe("dep graph extraction", () => {
    it("records same-library type deps as FB-to-type edges", () => {
      const result = compileLibrary(
        [
          {
            source: `
              TYPE
                Counter : STRUCT v : INT; END_STRUCT;
              END_TYPE
              FUNCTION_BLOCK Incrementer
                VAR_INPUT step : INT; END_VAR
                VAR state : Counter; END_VAR
                state.v := state.v + step;
              END_FUNCTION_BLOCK
            `,
            fileName: "test.st",
          },
        ],
        { name: "my-lib", version: "1.0.0", namespace: "my_lib" },
      );

      const fb = result.chunks!.find((c) => c.name === "INCREMENTER")!;
      expect(fb.deps).toContainEqual({ library: "my-lib", name: "COUNTER" });
    });

    it("records same-library function-call deps as edges", () => {
      const result = compileLibrary(
        [
          {
            source: `
              FUNCTION Helper : INT
                VAR_INPUT x : INT; END_VAR
                Helper := x * 2;
              END_FUNCTION
              FUNCTION Caller : INT
                VAR_INPUT x : INT; END_VAR
                Caller := Helper(x) + 1;
              END_FUNCTION
            `,
            fileName: "test.st",
          },
        ],
        { name: "my-lib", version: "1.0.0", namespace: "my_lib" },
      );

      const caller = result.chunks!.find((c) => c.name === "CALLER")!;
      expect(caller.deps).toContainEqual({ library: "my-lib", name: "HELPER" });
    });

    it("records same-library inline-global reads as edges", () => {
      const result = compileLibrary(
        [
          {
            source: `
              VAR_GLOBAL
                CFG : INT := 10;
              END_VAR
              FUNCTION Reader : INT
                Reader := CFG;
              END_FUNCTION
            `,
            fileName: "test.st",
          },
        ],
        { name: "my-lib", version: "1.0.0", namespace: "my_lib" },
      );

      const reader = result.chunks!.find((c) => c.name === "READER")!;
      expect(reader.deps).toContainEqual({ library: "my-lib", name: "CFG" });
    });

    it("never records a chunk as a self-dep", () => {
      const result = compileLibrary(
        [
          {
            source: `
              FUNCTION_BLOCK FB
                VAR_INPUT a : INT; END_VAR
                VAR_OUTPUT r : INT; END_VAR
                r := a;
              END_FUNCTION_BLOCK
            `,
            fileName: "test.st",
          },
        ],
        { name: "my-lib", version: "1.0.0", namespace: "my_lib" },
      );

      const fb = result.chunks!.find((c) => c.name === "FB")!;
      expect(fb.deps.some((d) => d.name === "FB")).toBe(false);
    });

    it("records cross-library deps using the dep archive's name", () => {
      const baseLib = compileStlib(
        [
          {
            source: `
              FUNCTION BaseFn : INT
                VAR_INPUT x : INT; END_VAR
                BaseFn := x;
              END_FUNCTION
            `,
            fileName: "base.st",
          },
        ],
        { name: "base-lib", version: "1.0.0", namespace: "base_lib" },
      );
      expect(baseLib.success).toBe(true);

      const consumer = compileLibrary(
        [
          {
            source: `
              FUNCTION CallsBase : INT
                VAR_INPUT y : INT; END_VAR
                CallsBase := BaseFn(y);
              END_FUNCTION
            `,
            fileName: "consumer.st",
          },
        ],
        {
          name: "consumer-lib",
          version: "1.0.0",
          namespace: "consumer_lib",
          dependencies: [baseLib.archive],
        },
      );
      expect(consumer.success).toBe(true);

      const fn = consumer.chunks!.find((c) => c.name === "CALLSBASE")!;
      expect(fn.deps).toContainEqual({ library: "base-lib", name: "BASEFN" });
    });

    it("emits deterministic dep ordering across builds", () => {
      const source = `
        FUNCTION ZZZ : INT VAR_INPUT x : INT; END_VAR ZZZ := x; END_FUNCTION
        FUNCTION AAA : INT VAR_INPUT x : INT; END_VAR AAA := x; END_FUNCTION
        FUNCTION Caller : INT
          VAR_INPUT x : INT; END_VAR
          Caller := ZZZ(x) + AAA(x);
        END_FUNCTION
      `;
      const first = compileLibrary(
        [{ source, fileName: "t.st" }],
        { name: "my-lib", version: "1.0.0", namespace: "my_lib" },
      );
      const second = compileLibrary(
        [{ source, fileName: "t.st" }],
        { name: "my-lib", version: "1.0.0", namespace: "my_lib" },
      );
      const callerA = first.chunks!.find((c) => c.name === "CALLER")!;
      const callerB = second.chunks!.find((c) => c.name === "CALLER")!;
      expect(callerA.deps).toEqual(callerB.deps);
      // Sorted alphabetically by name within same library
      const names = callerA.deps.map((d) => d.name);
      expect(names).toEqual([...names].sort());
    });
  });

  describe("archive chunk hygiene", () => {
    it("never leaks chunk markers into emitted chunk text", () => {
      const result = compileStlib(
        [
          {
            source: `
              TYPE Counter : STRUCT v : INT; END_STRUCT; END_TYPE
              FUNCTION_BLOCK FB
                VAR_INPUT a : INT; END_VAR
                VAR_OUTPUT r : INT; END_VAR
                r := a;
              END_FUNCTION_BLOCK
              FUNCTION FN : INT VAR_INPUT x : INT; END_VAR FN := x; END_FUNCTION
            `,
            fileName: "t.st",
          },
        ],
        { name: "test-lib", version: "1.0.0", namespace: "test_lib" },
      );

      expect(result.success).toBe(true);
      // The markers are slicing fenceposts only — every chunk's
      // header/cpp must be marker-free or downstream emit would
      // surface "//@chunk:..." comments in the user's generated.hpp.
      for (const chunk of result.archive.chunks) {
        expect(chunk.header).not.toContain("@chunk");
        expect(chunk.cpp).not.toContain("@chunk");
      }
    });

    it("populates the archive's chunks field", () => {
      const result = compileStlib(
        [
          {
            source: `
              FUNCTION FN : INT VAR_INPUT x : INT; END_VAR FN := x; END_FUNCTION
            `,
            fileName: "t.st",
          },
        ],
        { name: "test-lib", version: "1.0.0", namespace: "test_lib" },
      );

      expect(result.success).toBe(true);
      expect(result.archive.chunks).toBeDefined();
      expect(result.archive.chunks!.length).toBeGreaterThan(0);
      expect(result.archive.chunks!.find((c) => c.name === "FN")).toBeDefined();
    });
  });
});
