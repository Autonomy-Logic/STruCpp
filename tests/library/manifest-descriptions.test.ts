// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * What a library manifest records for tools that describe its blocks: names as written, default values as ST text
 * and enumeration members.
 */
import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import {
  LibraryManifestError,
  loadStlibFromString,
} from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";

const SOURCE = `TYPE Hmi_Align : (Left := 0, Center := 1, Right); END_TYPE
TYPE Point : STRUCT PosX : DINT; END_STRUCT; END_TYPE
VAR_GLOBAL CONSTANT Max_Size : DINT := 64; END_VAR
FUNCTION Clamp_It : DINT VAR_INPUT Value : DINT; END_VAR Clamp_It := Value; END_FUNCTION
INTERFACE IGauge METHOD Show : BOOL END_METHOD END_INTERFACE
FUNCTION_BLOCK HmiGauge IMPLEMENTS IGauge
  VAR_INPUT
    MaxValue : REAL := 1.5;
    Align : Hmi_Align := Hmi_Align#Center;
    Caption : STRING := 'Tank';
    Plain : DINT;
  END_VAR
  METHOD Show : BOOL Show := TRUE; END_METHOD
  METHOD Bump : DINT VAR_INPUT Step : DINT := Max_Size / 2; END_VAR Bump := Step; END_METHOD
  PROPERTY Level : REAL GET Level := 1.0; END_GET END_PROPERTY
END_FUNCTION_BLOCK`;

function build(): StlibArchive {
  const lib = compileStlib([{ fileName: "w.st", source: SOURCE }], {
    name: "w",
    version: "1.0.0",
    namespace: "w",
  });
  expect(lib.errors).toEqual([]);
  return lib.archive;
}

describe("library manifest descriptions", () => {
  it("records names as written, default values as ST text and enumeration members", () => {
    const m = loadStlibFromString(JSON.stringify(build()), "w").manifest;
    const gauge = m.functionBlocks.find((f) => f.name === "HMIGAUGE");
    expect(gauge?.displayName).toBe("HmiGauge");
    expect(
      gauge?.inputs.map((v) => [v.name, v.displayName, v.initialValue]),
    ).toEqual([
      ["MAXVALUE", "MaxValue", "1.5"],
      ["ALIGN", "Align", "Hmi_Align#Center"],
      ["CAPTION", "Caption", "'Tank'"],
      ["PLAIN", "Plain", undefined],
    ]);
    const bump = gauge?.methods?.find((x) => x.name === "BUMP");
    expect(bump?.displayName).toBe("Bump");
    expect(bump?.inputs[0]?.initialValue).toBe("Max_Size / 2");
    expect(gauge?.properties?.[0]?.displayName).toBe("Level");
    expect(m.interfaces?.[0]?.displayName).toBe("IGauge");
    expect(m.functions.find((f) => f.name === "CLAMP_IT")?.displayName).toBe(
      "Clamp_It",
    );
    const align = m.types.find((t) => t.name === "HMI_ALIGN");
    expect(align?.displayName).toBe("Hmi_Align");
    expect(align?.members).toEqual([
      { name: "LEFT", displayName: "Left", value: "0" },
      { name: "CENTER", displayName: "Center", value: "1" },
      { name: "RIGHT", displayName: "Right" },
    ]);
    expect(
      m.types.find((t) => t.name === "POINT")?.fields?.[0]?.displayName,
    ).toBe("PosX");
    expect(m.globals?.[0]).toMatchObject({
      name: "MAX_SIZE",
      displayName: "Max_Size",
      initialValue: "64",
      constant: true,
    });
  });

  it("refuses a method default that is not an ST expression", () => {
    const copy = JSON.parse(JSON.stringify(build())) as StlibArchive;
    const bump = copy.manifest.functionBlocks
      .find((f) => f.name === "HMIGAUGE")
      ?.methods?.find((m) => m.name === "BUMP");
    const step = bump?.inputs[0];
    if (step) step.initialValue = "7 +";
    expect(() => loadStlibFromString(JSON.stringify(copy), "w")).toThrow(
      /default value '7 \+' of parameter 'STEP' is not an ST expression/,
    );
  });

  it("refuses malformed descriptions in an archive", () => {
    const archive = build();
    const load = (patch: (a: StlibArchive) => void): (() => void) => {
      const copy = JSON.parse(JSON.stringify(archive)) as StlibArchive;
      patch(copy);
      return () => loadStlibFromString(JSON.stringify(copy), "w");
    };
    expect(
      load((a) => {
        const input = a.manifest.functionBlocks[0]?.inputs[0];
        if (input) Object.assign(input, { initialValue: 1.5 });
      }),
    ).toThrow(/inputs\[0\]\.initialValue must be a string/);
    expect(
      load((a) => {
        const align = a.manifest.types.find((t) => t.name === "HMI_ALIGN");
        if (align) Object.assign(align, { members: [{ value: "0" }] });
      }),
    ).toThrow(LibraryManifestError);
  });
});

describe("headers a library's external code needs", () => {
  const EXTERNAL = `FUNCTION HMI_Clear : BOOL
  VAR_INPUT Color : UDINT; END_VAR
  {external hmi_clear((uint32_t)COLOR.get()); }
  HMI_Clear := TRUE;
END_FUNCTION`;

  it("records them and makes every consumer include them", () => {
    const lib = compileStlib([{ fileName: "p.st", source: EXTERNAL }], {
      name: "prims",
      version: "1.0.0",
      namespace: "prims",
      headers: ["hmi_core.h"],
    });
    expect(lib.errors).toEqual([]);
    const archive = loadStlibFromString(JSON.stringify(lib.archive), "prims");
    expect(archive.manifest.headers).toEqual(["hmi_core.h"]);
    const result = compile(
      "PROGRAM P VAR ok : BOOL; END_VAR ok := HMI_Clear(0); END_PROGRAM",
      {
        libraries: [archive],
      },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain('#include "hmi_core.h"');
  });

  it("refuses a header name that could break out of the include line", () => {
    expect(() =>
      compileStlib([{ fileName: "p.st", source: EXTERNAL }], {
        name: "prims",
        version: "1.0.0",
        namespace: "prims",
        headers: ['x.h"\n#define bad 1'],
      }),
    ).toThrow(TypeError);
    const lib = compileStlib([{ fileName: "p.st", source: EXTERNAL }], {
      name: "prims",
      version: "1.0.0",
      namespace: "prims",
    });
    const tampered = JSON.parse(JSON.stringify(lib.archive)) as StlibArchive;
    tampered.manifest.headers = ['x.h"\n#define bad 1'];
    expect(() =>
      loadStlibFromString(JSON.stringify(tampered), "prims"),
    ).toThrow(/headers\[0\]/);
  });
});

describe("library sources", () => {
  it("reads each declaration's text from its own file, even beside a file named main.st", () => {
    const lib = compileStlib(
      [
        {
          fileName: "a.st",
          source:
            "FUNCTION_BLOCK Alpha VAR_INPUT Speed : DINT := 12; END_VAR END_FUNCTION_BLOCK",
        },
        {
          fileName: "main.st",
          source:
            "(* other *)\nFUNCTION_BLOCK Beta VAR_INPUT Gain : REAL := 2.5; END_VAR END_FUNCTION_BLOCK",
        },
      ],
      { name: "two", version: "1.0.0", namespace: "two" },
    );
    expect(lib.errors).toEqual([]);
    const fbs = lib.archive.manifest.functionBlocks;
    expect(fbs.find((f) => f.name === "ALPHA")?.inputs[0]).toMatchObject({
      displayName: "Speed",
      initialValue: "12",
    });
    expect(fbs.find((f) => f.name === "BETA")?.inputs[0]).toMatchObject({
      displayName: "Gain",
      initialValue: "2.5",
    });
  });
});
