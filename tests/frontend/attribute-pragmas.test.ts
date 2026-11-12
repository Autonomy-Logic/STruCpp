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

  it("attaches to variable blocks, structure fields, enumeration values and configuration globals", () => {
    const src = `TYPE S : STRUCT {attribute 'f'} a : INT; b : INT; END_STRUCT; END_TYPE
TYPE M : ({attribute 'e'} Off, On); END_TYPE
{attribute 'qualified_only'}
VAR_GLOBAL G : INT; END_VAR
PROGRAM P VAR x : INT; END_VAR END_PROGRAM
CONFIGURATION C
  {attribute 'cg'}
  VAR_GLOBAL {attribute 'cv'} K : INT; END_VAR
  RESOURCE R ON PLC TASK T(INTERVAL := T#10ms, PRIORITY := 1); PROGRAM I WITH T : P; END_RESOURCE
END_CONFIGURATION`;
    for (const eol of ["\n", "\r\n", "\r"]) {
      const { ast, errors } = parse(src.replace(/\n/g, eol));
      expect(errors).toEqual([]);
      if (!ast) throw new Error("no AST");
      const struct = ast.types[0]?.definition;
      const enumeration = ast.types[1]?.definition;
      if (struct?.kind !== "StructDefinition") throw new Error("not a struct");
      if (enumeration?.kind !== "EnumDefinition")
        throw new Error("not an enum");
      expect(struct.fields.map((f) => f.attributes)).toEqual([
        [{ name: "f" }],
        undefined,
      ]);
      expect(enumeration.members.map((m) => m.attributes)).toEqual([
        [{ name: "e" }],
        undefined,
      ]);
      expect(ast.globalVarBlocks[0]?.attributes).toEqual([
        { name: "qualified_only" },
      ]);
      const config = ast.configurations[0]?.varBlocks[0];
      expect(config?.attributes).toEqual([{ name: "cg" }]);
      expect(config?.declarations[0]?.attributes).toEqual([{ name: "cv" }]);
    }
  });

  it("stays linear in the number of pragmas that attach to nothing", () => {
    const body = Array.from(
      { length: 4000 },
      (_, n) => `{attribute 's${n}'} x := x + ${n};`,
    ).join("\n");
    const source = `PROGRAM A VAR x : DINT; END_VAR\n${body}\nEND_PROGRAM\nPROGRAM B END_PROGRAM`;
    const start = performance.now();
    const { ast, errors } = parse(source);
    const elapsed = performance.now() - start;
    expect(errors).toEqual([]);
    expect(JSON.stringify(ast)).not.toContain('"s1"');
    expect(elapsed).toBeLessThan(5000);
  });

  it("exports attributes on every declaration kind of a library", () => {
    const lib = compileStlib(
      [
        {
          fileName: "all.st",
          source: `{attribute 'on_type'}
TYPE Pt : STRUCT {attribute 'on_field'} x : DINT; END_STRUCT; END_TYPE
VAR_GLOBAL {attribute 'on_global'} Gain : DINT; END_VAR
{attribute 'on_interface'}
INTERFACE IRun {attribute 'on_imethod'} METHOD Run : BOOL END_METHOD END_INTERFACE
{attribute 'on_function'}
FUNCTION Twice : DINT VAR_INPUT {attribute 'on_fparam'} V : DINT; END_VAR Twice := V * 2; END_FUNCTION
FUNCTION_BLOCK B IMPLEMENTS IRun
  {attribute 'on_method'}
  METHOD Run : BOOL VAR_INPUT {attribute 'on_mparam'} Fast : BOOL; END_VAR Run := Fast; END_METHOD
  {attribute 'on_property'}
  PROPERTY Size : DINT GET Size := 1; END_GET END_PROPERTY
END_FUNCTION_BLOCK`,
        },
      ],
      { name: "all", version: "1.0.0", namespace: "all" },
    );
    expect(lib.errors).toEqual([]);
    const m = loadStlibFromString(JSON.stringify(lib.archive), "all").manifest;
    const type = m.types.find((t) => t.name === "PT");
    expect(type?.attributes).toEqual([{ name: "on_type" }]);
    expect(type?.fields?.[0]?.attributes).toEqual([{ name: "on_field" }]);
    expect(m.globals?.[0]?.attributes).toEqual([{ name: "on_global" }]);
    const iface = m.interfaces?.[0];
    expect(iface?.attributes).toEqual([{ name: "on_interface" }]);
    expect(iface?.methods[0]?.attributes).toEqual([{ name: "on_imethod" }]);
    const fn = m.functions.find((f) => f.name === "TWICE");
    expect(fn?.attributes).toEqual([{ name: "on_function" }]);
    expect(fn?.parameters[0]?.attributes).toEqual([{ name: "on_fparam" }]);
    const fb = m.functionBlocks.find((f) => f.name === "B");
    expect(fb?.methods?.[0]?.attributes).toEqual([{ name: "on_method" }]);
    expect(fb?.methods?.[0]?.inputs[0]?.attributes).toEqual([
      { name: "on_mparam" },
    ]);
    expect(fb?.properties?.[0]?.attributes).toEqual([{ name: "on_property" }]);

    const bad = (patch: (a: StlibArchive) => void): (() => void) => {
      const copy = JSON.parse(JSON.stringify(lib.archive)) as StlibArchive;
      patch(copy);
      return () => loadStlibFromString(JSON.stringify(copy), "all");
    };
    const block = (a: StlibArchive) =>
      a.manifest.functionBlocks.find((f) => f.name === "B");
    expect(
      bad((a) => {
        const param = block(a)?.methods?.[0]?.inputs[0];
        if (param) Object.assign(param, { attributes: "garbage" });
      }),
    ).toThrow(/methods\[0\]\.inputs\[0\]\.attributes/);
    expect(
      bad((a) => {
        const param = a.manifest.functions.find((f) => f.name === "TWICE")
          ?.parameters[0];
        if (param) Object.assign(param, { attributes: [{ name: 3 }] });
      }),
    ).toThrow(/functions\[\d+\]\.parameters\[0\]\.attributes\[0\]/);
    expect(
      bad((a) => {
        const field = a.manifest.types.find((t) => t.name === "PT")
          ?.fields?.[0];
        if (field) Object.assign(field, { attributes: {} });
      }),
    ).toThrow(/types\[\d+\]\.fields\[0\]\.attributes/);
  });

  it("keeps the attributes of a native block's header", () => {
    const lib = compileStlib(
      [
        {
          fileName: "N.cpp",
          source: `{attribute 'hmi_widget'}
(* native widget *)
FUNCTION_BLOCK N
VAR_INPUT
  {attribute 'hmi_main'}
  RAW : INT;
END_VAR
void setup() {}
void loop() {}
END_FUNCTION_BLOCK`,
        },
      ],
      { name: "n", version: "1.0.0", namespace: "n" },
    );
    expect(lib.errors).toEqual([]);
    const fb = lib.archive.manifest.functionBlocks[0];
    expect(fb?.attributes).toEqual([{ name: "hmi_widget" }]);
    expect(fb?.inputs[0]?.attributes).toEqual([{ name: "hmi_main" }]);
  });
});
