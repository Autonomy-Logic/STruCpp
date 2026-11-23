// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Library method parameters in the manifest: a compiled method records them in declaration order, a manifest with
 * only the grouped inputs/outputs/inouts still loads and binds, and a malformed list is rejected on load.
 */
import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString, LibraryManifestError } from "../../src/library/library-loader.js";

const LIB = `FUNCTION_BLOCK Tool
  METHOD Swap : INT
    VAR_IN_OUT Acc : INT; END_VAR
    VAR_INPUT Step : INT; END_VAR
    Acc := Acc * 10 + Step;
    Swap := Acc;
  END_METHOD
  METHOD Take : INT
    VAR_INPUT x : INT; y : INT := 2; END_VAR
    VAR_OUTPUT w : INT; END_VAR
    VAR_IN_OUT z : INT; END_VAR
    z := z + x + y; w := z; Take := z;
  END_METHOD
END_FUNCTION_BLOCK`;

/** The archive JSON with every method entry of every function block passed through `edit`. */
function editMethods(archiveJson: string, edit: (method: Record<string, unknown>) => void): string {
  const archive = JSON.parse(archiveJson) as {
    manifest: { functionBlocks: Array<{ methods?: Array<Record<string, unknown>> }> };
  };
  for (const fb of archive.manifest.functionBlocks) for (const m of fb.methods ?? []) edit(m);
  return JSON.stringify(archive);
}

describe("library method parameters", () => {
  it("records declaration order, loads grouped-only manifests and rejects a malformed parameter list", () => {
    const lib = compileStlib([{ fileName: "a.st", source: LIB }], {
      name: "liba",
      version: "1.0.0",
      namespace: "liba",
    });
    expect(lib.errors).toEqual([]);
    const json = JSON.stringify(lib.archive);
    const methods = loadStlibFromString(json, "liba").manifest.functionBlocks[0]?.methods ?? [];
    expect(methods.find((m) => m.name === "SWAP")?.parameters).toMatchObject([
      { name: "ACC", type: "INT", direction: "inout" },
      { name: "STEP", type: "INT", direction: "input" },
    ]);
    expect(methods.find((m) => m.name === "TAKE")?.parameters).toMatchObject([
      { name: "X", direction: "input" },
      { name: "Y", direction: "input", initialValue: "2" },
      { name: "W", direction: "output" },
      { name: "Z", direction: "inout" },
    ]);

    const grouped = loadStlibFromString(
      editMethods(json, (m) => {
        delete m.parameters;
      }),
      "liba-grouped",
    );
    expect(grouped.manifest.functionBlocks[0]?.methods?.every((m) => m.parameters === undefined)).toBe(true);
    const consumer = compile(
      `PROGRAM P
  VAR t : Tool; i, j, k, r : INT; END_VAR
  r := t.Take(x := i, w => k, z := j);
END_PROGRAM`,
      { libraries: [grouped] },
    );
    expect(consumer.errors).toEqual([]);
    expect(consumer.cppCode).toContain("T.TAKE(I, 2, K, J)");

    const malformed = editMethods(json, (m) => {
      m.parameters = "ACC";
    });
    expect(() => loadStlibFromString(malformed, "liba-bad")).toThrow(LibraryManifestError);
  });
});
