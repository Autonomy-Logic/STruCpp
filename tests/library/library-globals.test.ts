/**
 * STruC++ library global-variable export tests.
 *
 * A library's `VAR_GLOBAL` variables are exported in the manifest (`globals`)
 * and their storage emitted as `inlineGlobal` chunks. A consuming compilation
 * registers every imported library's globals into one shared global scope, so
 * a program importing several libraries sees all of their globals together
 * (globals are *additive* across libraries). Regression coverage for OSCAT
 * building, which references oscat-basic's `MATH`/`PHYS` GVL instances.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { compileStlib } from "../../src/index.js";
import {
  loadStlibArchive,
  loadStlibFromString,
} from "../../src/library/library-loader.js";
import { loadStlibFromFile } from "../../src/node/library-loader.js";

const LIBS_DIR = resolve(__dirname, "../../libs");

const lib = (
  name: string,
  sources: Array<{ fileName: string; source: string }>,
  dependencies: ReturnType<typeof compileStlib>["archive"][] = [],
) => {
  const r = compileStlib(sources, {
    name,
    version: "1.0.0",
    namespace: name.replace(/-/g, "_"),
    dependencies,
  });
  expect(r.success, JSON.stringify(r.errors)).toBe(true);
  return r.archive;
};

describe("library global-variable export", () => {
  it("lists VAR_GLOBAL variables in the manifest", () => {
    const archive = lib("g", [
      {
        fileName: "vars.gvl.st",
        source:
          "VAR_GLOBAL\n\tCOUNTER : INT := 7;\n\tENABLED : BOOL;\nEND_VAR",
      },
    ]);
    expect(archive.manifest.globals).toEqual([
      { name: "COUNTER", type: "INT" },
      { name: "ENABLED", type: "BOOL" },
    ]);
    // Storage is emitted as inlineGlobal chunks.
    const ig = (archive.chunks ?? [])
      .filter((c) => c.kind === "inlineGlobal")
      .map((c) => c.name);
    expect(ig).toEqual(["COUNTER", "ENABLED"]);
  });

  it("preserves globals across a serialize/load round-trip", () => {
    const archive = lib("g", [
      { fileName: "v.gvl.st", source: "VAR_GLOBAL\n\tX : REAL;\nEND_VAR" },
    ]);
    // Mirrors how .stlib files are written/read (JSON).
    const reloaded = loadStlibArchive(JSON.parse(JSON.stringify(archive)));
    expect(reloaded.manifest.globals).toEqual([{ name: "X", type: "REAL" }]);
    const fromString = loadStlibFromString(JSON.stringify(archive));
    expect(fromString.manifest.globals).toEqual([{ name: "X", type: "REAL" }]);
  });

  it("treats a missing globals field as no globals (back-compat)", () => {
    const archive = lib("nofuncs", [
      { fileName: "f.st", source: "FUNCTION F : INT\nF := 1;\nEND_FUNCTION" },
    ]);
    const json = JSON.parse(JSON.stringify(archive));
    delete json.manifest.globals;
    const reloaded = loadStlibArchive(json);
    expect(reloaded.manifest.globals).toBeUndefined();
  });

  it("combines globals additively from multiple imported libraries", () => {
    const libA = lib("lib-a", [
      { fileName: "a.gvl.st", source: "VAR_GLOBAL\n\tAAA : INT := 1;\nEND_VAR" },
    ]);
    const libB = lib("lib-b", [
      { fileName: "b.gvl.st", source: "VAR_GLOBAL\n\tBBB : INT := 2;\nEND_VAR" },
    ]);
    // A program importing BOTH can reference each library's global in one place.
    const consumer = compileStlib(
      [
        {
          fileName: "u.st",
          source: "FUNCTION SUM : INT\nSUM := AAA + BBB;\nEND_FUNCTION",
        },
      ],
      {
        name: "consumer",
        version: "1.0.0",
        namespace: "consumer",
        dependencies: [libA, libB],
      },
    );
    expect(consumer.errors).toHaveLength(0);
    expect(consumer.success).toBe(true);
  });

  it("exports oscat-basic's MATH/PHYS GVL instances and resolves their use", () => {
    const oscat = loadStlibFromFile(resolve(LIBS_DIR, "oscat-basic.stlib"));
    const names = (oscat.manifest.globals ?? []).map((g) => g.name);
    expect(names).toContain("MATH");
    expect(names).toContain("PHYS");

    // A consumer can reference the dependency's global (its struct fields are
    // not exported, so member access stays untyped — but the symbol resolves,
    // which is what previously failed with "Undeclared variable 'MATH'").
    const r = compileStlib(
      [
        {
          fileName: "U.st",
          source: "FUNCTION_BLOCK U\nVAR x : REAL; END_VAR\nx := MATH.PI;\nEND_FUNCTION_BLOCK",
        },
      ],
      {
        name: "u",
        version: "1.0.0",
        namespace: "u",
        dependencies: [oscat],
      },
    );
    const undeclared = (r.errors ?? []).filter((e) =>
      /Undeclared variable 'MATH'/.test(e.message),
    );
    expect(undeclared).toHaveLength(0);
  });
});
