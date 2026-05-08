/**
 * STruC++ IEC Standard Functions Library Tests
 *
 * Validates the synthesized `iec-std-functions.stlib` archive — pure-
 * metadata library carrying every entry of the StdFunctionRegistry
 * (ADD/SUB/MUL/MUX/SHL/CONCAT/...) so editor tooling can list, group,
 * and type-check std functions through the same path it uses for
 * compiled .stlib libraries. Pinned here so a registry change that
 * forgets to flow through the synthesis script (or a synthesis script
 * regression) surfaces as a test failure.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { loadStlibFromFile } from "../../src/library/library-loader.js";
import { StdFunctionRegistry } from "../../src/semantic/std-function-registry.js";

const LIBS_DIR = resolve(__dirname, "../../libs");
const STLIB_PATH = resolve(LIBS_DIR, "iec-std-functions.stlib");

const archive = loadStlibFromFile(STLIB_PATH);
const fns = archive.manifest.functions;
const fnByName = new Map(fns.map((f) => [f.name, f]));

describe("iec-std-functions.stlib synthesis", () => {
  it("ships as a builtin metadata-only archive", () => {
    expect(archive.manifest.name).toBe("iec-std-functions");
    expect(archive.manifest.namespace).toBe("strucpp");
    expect(archive.manifest.isBuiltin).toBe(true);
    // No FBs / TYPEs — std functions are functions only.
    expect(archive.manifest.functionBlocks).toHaveLength(0);
    expect(archive.manifest.types).toHaveLength(0);
    // No ST sources (intrinsics) and no codegen output (runtime
    // implements them — the .stlib is pure metadata).
    expect(archive.sources).toBeUndefined();
    expect(archive.headerCode).toBe("");
    expect(archive.cppCode).toBe("");
  });

  it("carries every function the StdFunctionRegistry registers", () => {
    // The synthesis is just a 1:1 walk over registry.getAll() — if
    // someone adds a function to the registry but forgets to rebuild
    // the .stlib, this catches it.
    const registry = new StdFunctionRegistry();
    const registryNames = new Set(registry.getAll().map((d) => d.name));
    const archiveNames = new Set(fns.map((f) => f.name));
    expect(archiveNames.size).toBe(registryNames.size);
    for (const name of registryNames) {
      expect(archiveNames.has(name), `archive missing ${name}`).toBe(true);
    }
  });

  it("groups functions into the editor-facing IEC categories", () => {
    // Spot-check: every function carries a category, and every
    // expected display-name bucket has at least one entry. We don't
    // pin exact counts here so a registry add doesn't ripple into
    // brittle test maintenance.
    for (const f of fns) {
      expect(
        f.category,
        `${f.name} is missing a category`,
      ).toBeTypeOf("string");
    }
    const buckets = new Set(fns.map((f) => f.category!));
    expect(buckets).toContain("Numerical");
    expect(buckets).toContain("Arithmetic");
    expect(buckets).toContain("Selection");
    expect(buckets).toContain("Comparison");
    expect(buckets).toContain("Bitwise");
    expect(buckets).toContain("BitShift");
    expect(buckets).toContain("TypeConversion");
    expect(buckets).toContain("CharacterString");
    expect(buckets).toContain("Time");
    expect(buckets).toContain("System");
  });

  it("ABS preserves its ANY_NUM generic on both ends", () => {
    // ABS(IN: ANY_NUM) -> ANY_NUM. Tooling unifies identical generic
    // names at instantiation, so both must surface verbatim.
    const abs = fnByName.get("ABS")!;
    expect(abs.returnType).toBe("ANY_NUM");
    expect(abs.parameters).toEqual([
      { name: "IN", type: "ANY_NUM", direction: "input" },
    ]);
    expect(abs.variadic).toBeUndefined();
  });

  it("ADD is variadic with minArgs=2", () => {
    // Extensible IEC functions like ADD/MUL accept ≥ 2 operands; the
    // .stlib `variadic.minArgs` carries that contract through to the
    // editor (which renders a "+" pin to grow inputs past the
    // declared parameter list).
    const add = fnByName.get("ADD")!;
    expect(add.returnType).toBe("ANY_NUM");
    expect(add.variadic).toEqual({ minArgs: 2 });
    expect(add.parameters.map((p) => p.name)).toEqual(["IN1", "IN2"]);
  });

  it("MUX has a fixed-type selector + ANY-typed inputs", () => {
    // MUX(K: INT, IN0: ANY, IN1: ANY, …) — the selector is a concrete
    // INT while the ANY pins unify across themselves and with the
    // return type. variadic.minArgs counts the selector + IN0 + IN1
    // baseline.
    const mux = fnByName.get("MUX")!;
    expect(mux.returnType).toBe("ANY");
    expect(mux.variadic).toEqual({ minArgs: 3 });
    expect(mux.parameters[0]).toEqual({
      name: "K",
      type: "INT",
      direction: "input",
    });
    expect(mux.parameters[1]).toEqual({
      name: "IN0",
      type: "ANY",
      direction: "input",
    });
    expect(mux.parameters[2]).toEqual({
      name: "IN1",
      type: "ANY",
      direction: "input",
    });
  });

  it("SHL mixes a generic ANY_BIT input with a concrete INT shift count", () => {
    // The shift count is always INT regardless of the operand width;
    // pin it so a registry change that drops the specific-type
    // constraint doesn't silently turn N into ANY_INT.
    const shl = fnByName.get("SHL")!;
    expect(shl.returnType).toBe("ANY_BIT");
    expect(shl.parameters).toEqual([
      { name: "IN", type: "ANY_BIT", direction: "input" },
      { name: "N", type: "INT", direction: "input" },
    ]);
    expect(shl.variadic).toBeUndefined();
  });

  it("functions are sorted alphabetically for diff stability", () => {
    // The synthesis sorts the manifest array so `git diff` on
    // libs/iec-std-functions.stlib stays small when the registry
    // changes — an unsorted append elsewhere in the array would
    // produce noisy reorder churn.
    const names = fns.map((f) => f.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
