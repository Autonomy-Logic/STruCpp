// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
import { describe, expect, it } from "vitest";

import { compile, parse } from "../../src/index.js";
import { parseAttributePragma } from "../../src/frontend/attributes.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import {
  LibraryManifestError,
  loadStlibFromString,
} from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";

const SOURCE = `{attribute 'hmi_theme' := 'Ocean'}
FUNCTION_BLOCK Gauge
  VAR_INPUT
    (* the value the widget shows *)
    {attribute 'hmi_main'}
    {attribute 'unit' := 'FT'}
    Value : REAL;
    Caption : STRING;
  END_VAR
  VAR
    {attribute 'hide'}
    count : DINT;
  END_VAR
  {attribute 'on_method'}
  METHOD Reset : BOOL
    VAR_INPUT {attribute 'arg'} Hard : BOOL; END_VAR
    Reset := TRUE;
  END_METHOD
  {attribute 'on_property'}
  PROPERTY Size : DINT GET Size := 1; END_GET END_PROPERTY
  {attribute 'stray'}
  count := count + 1;
END_FUNCTION_BLOCK
{attribute 'on_interface'}
INTERFACE IThing METHOD Run : BOOL END_METHOD END_INTERFACE
{attribute 'on_type'}
TYPE Mode : (Off, On); END_TYPE
VAR_GLOBAL {attribute 'on_global'} G : INT; END_VAR
{attribute 'on_function'}
FUNCTION F : INT F := 1; END_FUNCTION
{attribute 'on_program'}
PROGRAM P VAR {attribute 'on_local'} g : Gauge; END_VAR END_PROGRAM`;

describe("attribute pragmas", () => {
  it("reads the name and the optional value of a pragma", () => {
    expect(parseAttributePragma("{attribute 'hmi_main'}")).toEqual({
      name: "hmi_main",
    });
    expect(
      parseAttributePragma("{ attribute \"hmi_theme\"  :=  'Dark Blue' }"),
    ).toEqual({ name: "hmi_theme", value: "Dark Blue" });
    expect(parseAttributePragma("{attribute ''}")).toBeUndefined();
    expect(parseAttributePragma("{attribute}")).toBeUndefined();
  });

  it("attaches each pragma to the declaration that follows it", () => {
    const { ast, errors } = parse(SOURCE);
    expect(errors).toEqual([]);
    if (!ast) throw new Error("no AST");
    const fb = ast.functionBlocks[0];
    expect(fb?.attributes).toEqual([{ name: "hmi_theme", value: "Ocean" }]);
    const inputs = fb?.varBlocks[0]?.declarations ?? [];
    expect(inputs.map((d) => [d.names[0], d.attributes])).toEqual([
      ["VALUE", [{ name: "hmi_main" }, { name: "unit", value: "FT" }]],
      ["CAPTION", undefined],
    ]);
    expect(fb?.varBlocks[1]?.declarations[0]?.attributes).toEqual([
      { name: "hide" },
    ]);
    const method = fb?.methods[0];
    expect(method?.attributes).toEqual([{ name: "on_method" }]);
    expect(method?.varBlocks[0]?.declarations[0]?.attributes).toEqual([
      { name: "arg" },
    ]);
    expect(fb?.properties[0]?.attributes).toEqual([{ name: "on_property" }]);
    expect(ast.interfaces[0]?.attributes).toEqual([{ name: "on_interface" }]);
    expect(ast.types[0]?.attributes).toEqual([{ name: "on_type" }]);
    expect(ast.globalVarBlocks[0]?.declarations[0]?.attributes).toEqual([
      { name: "on_global" },
    ]);
    expect(ast.functions[0]?.attributes).toEqual([{ name: "on_function" }]);
    expect(ast.programs[0]?.attributes).toEqual([{ name: "on_program" }]);
    expect(ast.programs[0]?.varBlocks[0]?.declarations[0]?.attributes).toEqual([
      { name: "on_local" },
    ]);
  });

  it("leaves a pragma followed by a statement unattached", () => {
    const { ast } = parse(SOURCE);
    const all = JSON.stringify(ast);
    expect(all).not.toContain("stray");
  });

  it("keeps attributes in the compile pipeline, for additional sources too", () => {
    const result = compile("PROGRAM Main END_PROGRAM", {
      additionalSources: [{ fileName: "w.st", source: SOURCE }],
    });
    expect(result.errors).toEqual([]);
    const fb = result.ast?.functionBlocks.find((f) => f.name === "GAUGE");
    expect(fb?.attributes).toEqual([{ name: "hmi_theme", value: "Ocean" }]);
  });

  it("exports block and variable attributes in a library manifest", () => {
    const lib = compileStlib([{ fileName: "w.st", source: SOURCE }], {
      name: "w",
      version: "1.0.0",
      namespace: "w",
    });
    expect(lib.errors).toEqual([]);
    const loaded = loadStlibFromString(JSON.stringify(lib.archive), "w");
    const gauge = loaded.manifest.functionBlocks.find(
      (f) => f.name === "GAUGE",
    );
    expect(gauge?.attributes).toEqual([{ name: "hmi_theme", value: "Ocean" }]);
    expect(gauge?.inputs.map((v) => [v.name, v.attributes])).toEqual([
      ["VALUE", [{ name: "hmi_main" }, { name: "unit", value: "FT" }]],
      ["CAPTION", undefined],
    ]);
    expect(gauge?.locals?.[0]?.attributes).toEqual([{ name: "hide" }]);
  });

  it("refuses malformed attributes in an archive", () => {
    const lib = compileStlib([{ fileName: "w.st", source: SOURCE }], {
      name: "w",
      version: "1.0.0",
      namespace: "w",
    });
    const broken = (patch: (a: StlibArchive) => void): (() => void) => {
      const copy = JSON.parse(JSON.stringify(lib.archive)) as StlibArchive;
      patch(copy);
      return () => loadStlibFromString(JSON.stringify(copy), "w");
    };
    const gauge = (a: StlibArchive) =>
      a.manifest.functionBlocks.find((f) => f.name === "GAUGE");
    expect(
      broken((a) => {
        Object.assign(gauge(a) ?? {}, { attributes: "hmi_theme" });
      }),
    ).toThrow(LibraryManifestError);
    expect(
      broken((a) => {
        const input = gauge(a)?.inputs[0];
        if (input) Object.assign(input, { attributes: [{ value: "x" }] });
      }),
    ).toThrow(/inputs\[0\]\.attributes\[0\]/);
  });
});
