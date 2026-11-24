// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Autonomy®
/**
 * Library-to-library dependencies and per-chunk headers: what a library records when it is compiled, the per-POU
 * requirement check a consumer's compile runs before code generation, and the API that reads requirements without
 * compiling.
 */
import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import {
  LibraryManifestError,
  loadStlibFromString,
} from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import {
  describeLibraryVersionRange,
  findUnmetRequirements,
  functionBlockLineage,
  getLibraryDependencies,
  headerVersionSatisfies,
  libraryVersionSatisfies,
  resolvePouRequirements,
} from "../../src/library/library-requirements.js";

const HMI_CORE = { name: "hmi_core.h", version: "1" };
const CORE = [HMI_CORE];

/** A library mixing POUs that call the HMI core with POUs that do not. */
const MIXED_SOURCE = `
FUNCTION HMI_Clear : BOOL
  VAR_INPUT Color : UDINT; END_VAR
  {external hmi_clear((uint32_t)COLOR.get()); }
  HMI_Clear := TRUE;
END_FUNCTION

FUNCTION_BLOCK Pump_Panel
  VAR_INPUT Color : UDINT; END_VAR
  VAR_OUTPUT Done : BOOL; END_VAR
  Done := HMI_Clear(Color);
END_FUNCTION_BLOCK

FUNCTION_BLOCK Widget_Base
  VAR_OUTPUT Drawn : BOOL; END_VAR
  METHOD Draw : BOOL
    {external hmi_clear(0u); }
    Draw := TRUE;
  END_METHOD
END_FUNCTION_BLOCK

{attribute 'hmi_palette' := 'Controls'}
FUNCTION_BLOCK Hmi_Button EXTENDS Widget_Base
  VAR_INPUT Pressed : BOOL; END_VAR
END_FUNCTION_BLOCK

{attribute 'headers' := ''}
FUNCTION Plain_Add : INT
  VAR_INPUT A : INT; B : INT; END_VAR
  {external /* plain C++, no host API */ }
  Plain_Add := A + B;
END_FUNCTION

FUNCTION_BLOCK Plain_Counter
  VAR_INPUT Up : BOOL; END_VAR
  VAR_OUTPUT Count : INT; END_VAR
  IF Up THEN Count := Plain_Add(Count, 1); END_IF;
END_FUNCTION_BLOCK
`;

function roundTrip(archive: StlibArchive): StlibArchive {
  return loadStlibFromString(JSON.stringify(archive), archive.manifest.name);
}

function buildMixed(version = "1.0.0", core = HMI_CORE): StlibArchive {
  const lib = compileStlib([{ fileName: "mixed.st", source: MIXED_SOURCE }], {
    name: "hmi-widgets",
    version,
    namespace: "hmi_widgets",
    headers: [core],
  });
  expect(lib.errors).toEqual([]);
  return roundTrip(lib.archive);
}

function buildLib(
  name: string,
  version: string,
  source: string,
  dependencies: StlibArchive[] = [],
): StlibArchive {
  const lib = compileStlib([{ fileName: `${name}.st`, source }], {
    name,
    version,
    namespace: name.replace(/-/g, "_"),
    dependencies,
  });
  expect(lib.errors).toEqual([]);
  return roundTrip(lib.archive);
}

const headersOf = (archive: StlibArchive, chunk: string): unknown =>
  archive.chunks.find((c) => c.name === chunk)?.headers;

describe("dependencies recorded when a library is compiled", () => {
  it("lists only the libraries its code uses, at the version it was compiled against", () => {
    const base = buildLib(
      "base-lib",
      "1.2.0",
      "FUNCTION Base_Twice : INT VAR_INPUT X : INT; END_VAR Base_Twice := X * 2; END_FUNCTION",
    );
    const unused = buildLib(
      "unused-lib",
      "3.0.0",
      "FUNCTION Never_Called : INT Never_Called := 1; END_FUNCTION",
    );
    const app = buildLib(
      "app-lib",
      "0.1.0",
      "FUNCTION Quad : INT VAR_INPUT X : INT; END_VAR Quad := Base_Twice(Base_Twice(X)); END_FUNCTION",
      [base, unused],
    );
    expect(app.dependencies).toEqual([{ name: "base-lib", version: "1.2.0" }]);
    expect(app.chunks.find((c) => c.name === "QUAD")?.deps).toContainEqual({
      library: "base-lib",
      name: "BASE_TWICE",
    });
  });

  it("records an empty list for a library that needs nothing", () => {
    const lib = buildLib(
      "alone",
      "1.0.0",
      "FUNCTION One : INT One := 1; END_FUNCTION",
    );
    expect(lib.dependencies).toEqual([]);
    expect(lib.chunks.every((c) => c.headers === undefined)).toBe(true);
  });
});

describe("headers each chunk needs", () => {
  it("are recorded with their version, and only on the chunks whose code or reach needs them", () => {
    const mixed = buildMixed();
    expect(mixed.dependencies).toEqual([]);
    expect(mixed.manifest.headers).toEqual(["hmi_core.h"]);
    expect(mixed.manifest.headerVersions).toEqual({ "hmi_core.h": "1" });
    // Its own external code, a caller, a block whose method has it, and a block whose base does.
    expect(headersOf(mixed, "HMI_CLEAR")).toEqual(CORE);
    expect(headersOf(mixed, "PUMP_PANEL")).toEqual(CORE);
    expect(headersOf(mixed, "WIDGET_BASE")).toEqual(CORE);
    expect(headersOf(mixed, "HMI_BUTTON")).toEqual(CORE);
    // External code that names no header, and code with none.
    expect(headersOf(mixed, "PLAIN_ADD")).toEqual([]);
    expect(headersOf(mixed, "PLAIN_COUNTER")).toEqual([]);
  });

  it("follow a POU's headers attribute", () => {
    const lib = compileStlib(
      [
        {
          fileName: "p.st",
          source: `{attribute 'headers' := 'can.h'}
FUNCTION Send : BOOL {external can_send(); } Send := TRUE; END_FUNCTION
FUNCTION Both : BOOL {external hmi_clear(0u); can_send(); } Both := TRUE; END_FUNCTION`,
        },
      ],
      {
        name: "p",
        version: "1.0.0",
        namespace: "p",
        headers: ["can.h", HMI_CORE],
      },
    );
    expect(lib.errors).toEqual([]);
    expect(headersOf(lib.archive, "SEND")).toEqual([{ name: "can.h" }]);
    expect(headersOf(lib.archive, "BOTH")).toEqual([
      { name: "can.h" },
      HMI_CORE,
    ]);
  });

  it("refuses an attribute naming a header the library does not list", () => {
    const result = compileStlib(
      [
        {
          fileName: "p.st",
          source:
            "{attribute 'headers' := 'can.h'}\nFUNCTION Send : BOOL Send := TRUE; END_FUNCTION",
        },
      ],
      { name: "p", version: "1.0.0", namespace: "p", headers: [HMI_CORE] },
    );
    expect(result.success).toBe(false);
    expect(result.errors.map((e) => e.message)).toEqual([
      "SEND names header 'can.h', which is not one of this library's headers (hmi_core.h).",
    ]);
    expect(result.errors[0]?.line).toBe(2);
  });

  it("refuses an empty header version", () => {
    expect(() =>
      compileStlib([{ fileName: "p.st", source: MIXED_SOURCE }], {
        name: "p",
        version: "1.0.0",
        namespace: "p",
        headers: [{ name: "hmi_core.h", version: " " }],
      }),
    ).toThrow(/empty version/);
  });

  it("refuses a chunk that would need two versions of one header", () => {
    const v1 = buildMixed("1.0.0");
    const lib = compileStlib(
      [
        {
          fileName: "screen.st",
          source: `FUNCTION_BLOCK Screen VAR p : Pump_Panel; END_VAR {external hmi_clear(1u); } p(Color := 1); END_FUNCTION_BLOCK`,
        },
      ],
      {
        name: "screens",
        version: "1.0.0",
        namespace: "screens",
        dependencies: [v1],
        headers: [{ name: "hmi_core.h", version: "2" }],
      },
    );
    expect(lib.success).toBe(false);
    expect(lib.errors.map((e) => e.message)).toEqual([
      "SCREEN needs hmi_core.h version 1 and hmi_core.h version 2; one build cannot provide both.",
    ]);
  });
});

describe("per-POU requirement check in a consumer's compile", () => {
  const mixed = buildMixed();

  it("fails early when a used POU needs a header the build does not provide", () => {
    const result = compile(
      `PROGRAM Main
  VAR panel : Pump_Panel; END_VAR
  panel(Color := 1);
END_PROGRAM`,
      { libraries: [mixed], providedHeaders: [] },
    );
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toBe(
      "PUMP_PANEL (library hmi-widgets) needs hmi_core.h version 1 through HMI_CLEAR (library hmi-widgets), which this build does not provide",
    );
    expect(result.errors[0]?.line).toBe(2);
    expect(result.cppCode).toBe("");
  });

  it("names the POU itself when it carries the requirement", () => {
    const result = compile(
      "PROGRAM Main VAR ok : BOOL; END_VAR ok := HMI_Clear(0); END_PROGRAM",
      {
        libraries: [mixed],
        providedHeaders: [{ name: "hmi_core.h", version: "2" }],
      },
    );
    expect(result.errors.map((e) => e.message)).toEqual([
      "HMI_CLEAR (library hmi-widgets) needs hmi_core.h version 1, but this build provides hmi_core.h version 2",
    ]);
    const unversioned = compile(
      "PROGRAM Main VAR ok : BOOL; END_VAR ok := HMI_Clear(0); END_PROGRAM",
      { libraries: [mixed], providedHeaders: [{ name: "hmi_core.h" }] },
    );
    expect(unversioned.errors.map((e) => e.message)).toEqual([
      "HMI_CLEAR (library hmi-widgets) needs hmi_core.h version 1, but this build provides hmi_core.h without a version",
    ]);
  });

  it("builds a used POU when the build provides the header, and includes its headers", () => {
    const result = compile(
      `PROGRAM Main
  VAR b : Hmi_Button; END_VAR
  b(Pressed := TRUE);
END_PROGRAM`,
      { libraries: [mixed], providedHeaders: CORE },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain('#include "hmi_core.h"');
    expect(result.headerCode).toContain("class HMI_BUTTON");
    expect(result.headerCode).toContain("class WIDGET_BASE");
  });

  it("lets a plain program use the plain POUs of a mixed library", () => {
    const result = compile(
      `PROGRAM Main
  VAR c : Plain_Counter; Pump_Panel : BOOL; n : INT; END_VAR
  c(Up := Pump_Panel);
  n := Plain_Add(c.Count, 2);
END_PROGRAM`,
      { libraries: [mixed], providedHeaders: [] },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain("class PLAIN_COUNTER");
    expect(result.headerCode).not.toContain("hmi_core.h");
    expect(result.headerCode).not.toContain("class PUMP_PANEL");
    expect(result.cppCode).not.toContain("hmi_clear");
  });

  it("does not check headers when the build does not state what it provides", () => {
    const used = compile(
      "PROGRAM Main VAR p : Pump_Panel; END_VAR p(Color := 1); END_PROGRAM",
      { libraries: [mixed] },
    );
    expect(used.errors).toEqual([]);
    expect(used.headerCode).toContain('#include "hmi_core.h"');
    const plain = compile(
      "PROGRAM Main VAR c : Plain_Counter; END_VAR c(Up := TRUE); END_PROGRAM",
      { libraries: [mixed] },
    );
    expect(plain.errors).toEqual([]);
    expect(plain.headerCode).not.toContain("hmi_core.h");
  });

  it("leaves out what a test build cannot satisfy instead of failing", () => {
    const result = compile(
      "PROGRAM Main VAR c : Plain_Counter; END_VAR c(Up := TRUE); END_PROGRAM",
      { libraries: [mixed], isTestBuild: true, providedHeaders: [] },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain("class PLAIN_COUNTER");
    expect(result.headerCode).not.toContain("class PUMP_PANEL");
    expect(result.headerCode).not.toContain("hmi_core.h");
  });

  it("leaves out what a whole library cannot satisfy", () => {
    const result = compile(
      "PROGRAM Main VAR n : INT; END_VAR n := 1; END_PROGRAM",
      {
        libraries: [mixed],
        wholeLibraries: ["hmi-widgets"],
        providedHeaders: [],
      },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain("PLAIN_ADD");
    expect(result.headerCode).not.toContain("class PUMP_PANEL");
  });
});

describe("transitive resolution across archives", () => {
  const widgets = buildMixed("1.2.0");
  const screens = buildLib(
    "screens",
    "2.0.0",
    `FUNCTION_BLOCK Tank_Screen
  VAR panel : Pump_Panel; END_VAR
  panel(Color := 16#FF);
END_FUNCTION_BLOCK
FUNCTION Screen_Count : INT Screen_Count := Plain_Add(1, 1); END_FUNCTION`,
    [widgets],
  );

  it("records the library dependency and carries the header onto the chunk that reaches it", () => {
    expect(screens.dependencies).toEqual([
      { name: "hmi-widgets", version: "1.2.0" },
    ]);
    expect(screens.manifest.headers).toEqual([]);
    expect(headersOf(screens, "TANK_SCREEN")).toEqual(CORE);
    expect(headersOf(screens, "SCREEN_COUNT")).toBeUndefined();
  });

  it("reports the header of a POU two archives away", () => {
    const result = compile(
      "PROGRAM Main VAR s : Tank_Screen; END_VAR s(); END_PROGRAM",
      { libraries: [screens, widgets], providedHeaders: [] },
    );
    expect(result.errors.map((e) => e.message)).toEqual([
      "TANK_SCREEN (library screens) needs hmi_core.h version 1 through HMI_CLEAR (library hmi-widgets), which this build does not provide",
    ]);
    const ok = compile(
      "PROGRAM Main VAR s : Tank_Screen; END_VAR s(); END_PROGRAM",
      { libraries: [screens, widgets], providedHeaders: CORE },
    );
    expect(ok.errors).toEqual([]);
    expect(ok.headerCode).toContain('#include "hmi_core.h"');
  });

  it("reports a missing library dependency", () => {
    const result = compile(
      "PROGRAM Main VAR n : INT; END_VAR n := Screen_Count(); END_PROGRAM",
      { libraries: [screens] },
    );
    expect(result.errors.map((e) => e.message)).toEqual([
      "SCREEN_COUNT (library screens) needs library hmi-widgets 1.2.0 (>=1.2.0 <2.0.0), which this build does not provide",
    ]);
  });

  it("reports a library supplied at an incompatible version, and accepts a compatible one", () => {
    const older = buildMixed("1.1.0");
    const newer = buildMixed("1.4.2");
    const major = buildMixed("2.0.0");
    const program =
      "PROGRAM Main VAR n : INT; END_VAR n := Screen_Count(); END_PROGRAM";
    expect(
      compile(program, { libraries: [screens, older] }).errors.map(
        (e) => e.message,
      ),
    ).toEqual([
      "SCREEN_COUNT (library screens) needs library hmi-widgets 1.2.0 (>=1.2.0 <2.0.0), but this build provides hmi-widgets 1.1.0",
    ]);
    expect(
      compile(program, { libraries: [screens, major] }).errors.map(
        (e) => e.message,
      ),
    ).toEqual([
      "SCREEN_COUNT (library screens) needs library hmi-widgets 1.2.0 (>=1.2.0 <2.0.0), but this build provides hmi-widgets 2.0.0",
    ]);
    expect(compile(program, { libraries: [screens, newer] }).errors).toEqual(
      [],
    );
  });

  it("checks library requirements when another library is compiled against these", () => {
    const lib = compileStlib(
      [
        {
          fileName: "top.st",
          source:
            "FUNCTION Top : INT Top := Screen_Count(); END_FUNCTION\nFUNCTION_BLOCK Top_Screen VAR s : Tank_Screen; END_VAR s(); END_FUNCTION_BLOCK",
        },
      ],
      {
        name: "top",
        version: "1.0.0",
        namespace: "top",
        dependencies: [screens],
      },
    );
    expect(lib.success).toBe(false);
    expect(lib.errors.map((e) => e.message)).toContain(
      "SCREEN_COUNT (library screens) needs library hmi-widgets 1.2.0 (>=1.2.0 <2.0.0), which this build does not provide",
    );
    // With every archive supplied it builds, and the header passes on to its chunk.
    const ok = compileStlib(
      [
        {
          fileName: "top.st",
          source:
            "FUNCTION_BLOCK Top_Screen VAR s : Tank_Screen; END_VAR s(); END_FUNCTION_BLOCK",
        },
      ],
      {
        name: "top",
        version: "1.0.0",
        namespace: "top",
        dependencies: [screens, widgets],
      },
    );
    expect(ok.errors).toEqual([]);
    expect(ok.archive.dependencies).toEqual([
      { name: "screens", version: "2.0.0" },
    ]);
    expect(ok.archive.chunks[0]?.headers).toEqual(CORE);
  });
});

describe("archives built before dependencies were recorded", () => {
  it("compile exactly as before", () => {
    const base = buildLib(
      "base-lib",
      "1.0.0",
      "FUNCTION Base_Twice : INT VAR_INPUT X : INT; END_VAR Base_Twice := X * 2; END_FUNCTION",
    );
    const app = buildLib(
      "app-lib",
      "1.0.0",
      "FUNCTION Quad : INT VAR_INPUT X : INT; END_VAR Quad := Base_Twice(Base_Twice(X)); END_FUNCTION",
      [base],
    );
    const legacy: StlibArchive = roundTrip({ ...app, dependencies: [] });
    const program =
      "PROGRAM Main VAR n : INT; END_VAR n := Quad(3); END_PROGRAM";
    const current = compile(program, { libraries: [app, base] });
    const old = compile(program, { libraries: [legacy, base] });
    expect(old.errors).toEqual([]);
    expect(old.headerCode).toBe(current.headerCode);
    expect(old.cppCode).toBe(current.cppCode);
    // An undeclared library is followed but never required.
    expect(compile(program, { libraries: [legacy] }).errors).toEqual([]);
  });

  it("include their headers whenever one of their chunks is used, as before", () => {
    const mixed = buildMixed();
    const legacy = roundTrip({
      ...mixed,
      manifest: { ...mixed.manifest, headerVersions: undefined },
      chunks: mixed.chunks.map(({ headers: _h, ...chunk }) => chunk),
    });
    const program =
      "PROGRAM Main VAR n : INT; END_VAR n := Plain_Add(1, 2); END_PROGRAM";
    const result = compile(program, { libraries: [legacy] });
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain('#include "hmi_core.h"');
    expect(
      compile(program, { libraries: [legacy], providedHeaders: [] }).errors.map(
        (e) => e.message,
      ),
    ).toEqual([
      "PLAIN_ADD (library hmi-widgets) needs hmi_core.h, which this build does not provide",
    ]);
  });
});

describe("reading requirements without compiling", () => {
  const widgets = buildMixed("1.2.0");
  const screens = buildLib(
    "screens",
    "2.0.0",
    `FUNCTION_BLOCK Tank_Screen EXTENDS Hmi_Button
  VAR panel : Pump_Panel; END_VAR
END_FUNCTION_BLOCK
FUNCTION Screen_Count : INT Screen_Count := Plain_Add(1, 1); END_FUNCTION`,
    [widgets],
  );

  it("lists an archive's dependencies", () => {
    expect(getLibraryDependencies(widgets)).toEqual({
      libraries: [],
      headers: CORE,
    });
    expect(getLibraryDependencies(screens)).toEqual({
      libraries: [{ name: "hmi-widgets", version: "1.2.0" }],
      headers: [],
    });
  });

  it("gives each POU its transitive requirements, and what a build lacks", () => {
    const pous = resolvePouRequirements(screens, [widgets]);
    const tank = pous.find((p) => p.name === "TANK_SCREEN");
    expect(tank).toMatchObject({
      kind: "functionBlock",
      library: "screens",
      displayName: "Tank_Screen",
      unresolvedLibraries: [],
    });
    expect(tank?.requirements.map((r) => [r.kind, r.name, r.version])).toEqual([
      ["header", "hmi_core.h", "1"],
      ["library", "hmi-widgets", "1.2.0"],
    ]);
    const count = pous.find((p) => p.name === "SCREEN_COUNT");
    expect(count?.requirements.map((r) => r.name)).toEqual(["hmi-widgets"]);

    const plc = { libraries: [screens, widgets], providedHeaders: [] };
    const hmi = { ...plc, providedHeaders: CORE };
    expect(findUnmetRequirements(count?.requirements ?? [], plc)).toEqual([]);
    expect(
      findUnmetRequirements(tank?.requirements ?? [], plc).map(
        (u) => u.requirement.name,
      ),
    ).toEqual(["hmi_core.h"]);
    expect(findUnmetRequirements(tank?.requirements ?? [], hmi)).toEqual([]);
  });

  it("still reports recorded headers when the dependency archives are not supplied", () => {
    const tank = resolvePouRequirements(screens).find(
      (p) => p.name === "TANK_SCREEN",
    );
    expect(tank?.unresolvedLibraries).toEqual(["hmi-widgets"]);
    expect(tank?.requirements.map((r) => r.name)).toEqual([
      "hmi_core.h",
      "hmi-widgets",
    ]);
  });

  it("keeps attributes and exposes each block's EXTENDS chain", () => {
    const button = widgets.manifest.functionBlocks.find(
      (f) => f.name === "HMI_BUTTON",
    );
    expect(button?.attributes).toEqual([
      { name: "hmi_palette", value: "Controls" },
    ]);
    expect(button?.extends?.toUpperCase()).toBe("WIDGET_BASE");
    expect(
      functionBlockLineage([screens, widgets], "screens", "TANK_SCREEN"),
    ).toEqual([
      { library: "hmi-widgets", name: "HMI_BUTTON" },
      { library: "hmi-widgets", name: "WIDGET_BASE" },
    ]);
    expect(functionBlockLineage([screens], "screens", "TANK_SCREEN")).toEqual([
      { library: undefined, name: "HMI_BUTTON" },
    ]);
  });
});

describe("version semantics", () => {
  it("matches libraries by semver compatibility", () => {
    expect(libraryVersionSatisfies("1.2.0", "1.2.0")).toBe(true);
    expect(libraryVersionSatisfies("1.2.0", "1.9.3")).toBe(true);
    expect(libraryVersionSatisfies("1.2.0", "1.1.9")).toBe(false);
    expect(libraryVersionSatisfies("1.2.0", "2.0.0")).toBe(false);
    expect(libraryVersionSatisfies("0.3.1", "0.3.4")).toBe(true);
    expect(libraryVersionSatisfies("0.3.1", "0.4.0")).toBe(false);
    expect(libraryVersionSatisfies("1.0.0", "1.0.0-rc.1")).toBe(false);
    expect(libraryVersionSatisfies("1.0.0-rc.1", "1.0.0")).toBe(true);
    expect(libraryVersionSatisfies("1.0.0-rc.2", "1.0.0-rc.10")).toBe(true);
    expect(libraryVersionSatisfies("1", "1.4.0")).toBe(true);
    expect(libraryVersionSatisfies("2024a", "2024a")).toBe(true);
    expect(libraryVersionSatisfies("2024a", "2024b")).toBe(false);
    expect(describeLibraryVersionRange("1.2.0")).toBe(">=1.2.0 <2.0.0");
    expect(describeLibraryVersionRange("0.3.1")).toBe(">=0.3.1 <0.4.0");
  });

  it("matches header versions exactly, and any version when none is required", () => {
    expect(headerVersionSatisfies("1", "1")).toBe(true);
    expect(headerVersionSatisfies("1", "1.0")).toBe(false);
    expect(headerVersionSatisfies("1", "2")).toBe(false);
    expect(headerVersionSatisfies("1", undefined)).toBe(false);
    expect(headerVersionSatisfies(undefined, "3")).toBe(true);
    expect(headerVersionSatisfies(undefined, undefined)).toBe(true);
  });
});

describe("archive validation", () => {
  it("keeps header versions and chunk headers through a load", () => {
    const mixed = buildMixed();
    expect(mixed.manifest.headerVersions).toEqual({ "hmi_core.h": "1" });
    expect(headersOf(mixed, "HMI_CLEAR")).toEqual(CORE);
  });

  it("refuses malformed dependencies, header versions and chunk headers", () => {
    const mixed = buildMixed();
    const load = (patch: (a: Record<string, unknown>) => void) => (): void => {
      const copy = JSON.parse(JSON.stringify(mixed)) as Record<string, unknown>;
      patch(copy);
      loadStlibFromString(JSON.stringify(copy), "w");
    };
    expect(
      load((a) => {
        a.dependencies = [{ name: "x" }];
      }),
    ).toThrow(/dependencies\[0\]\.version/);
    expect(
      load((a) => {
        (a.manifest as Record<string, unknown>).headerVersions = {
          "other.h": "1",
        };
      }),
    ).toThrow(LibraryManifestError);
    expect(
      load((a) => {
        (a.chunks as Array<Record<string, unknown>>)[0]!.headers = [
          { name: 'a.h"' },
        ];
      }),
    ).toThrow(/chunks\[0\]\.headers\[0\]\.name/);
    expect(
      load((a) => {
        (a.chunks as Array<Record<string, unknown>>)[0]!.headers = [
          { name: "a.h", version: 1 },
        ];
      }),
    ).toThrow(/version must be a string/);
  });
});

describe("native blocks", () => {
  it("record the libraries whose types their interface uses", () => {
    const types = buildLib(
      "shared-types",
      "1.0.0",
      "TYPE Reading : STRUCT Value : INT; END_STRUCT; END_TYPE\nFUNCTION Unused : INT Unused := 1; END_FUNCTION",
    );
    const lib = compileStlib(
      [
        {
          fileName: "probe.cpp",
          source: `FUNCTION_BLOCK PROBE
VAR_INPUT
  IN_VAL : Reading;
END_VAR
VAR_OUTPUT
  OK : BOOL;
END_VAR
void setup() {}
void loop() {}
END_FUNCTION_BLOCK
`,
        },
      ],
      {
        name: "native-lib",
        version: "1.0.0",
        namespace: "native_lib",
        dependencies: [types],
      },
    );
    expect(lib.errors).toEqual([]);
    expect(lib.archive.dependencies).toEqual([
      { name: "shared-types", version: "1.0.0" },
    ]);
  });
});
