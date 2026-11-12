/**
 * Function blocks and interfaces of a linked library used with their methods and properties: overriding across the
 * library boundary, library interface types, access specifiers on library members, and what the manifest records.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import {
  loadStlibArchive,
  LibraryManifestError,
} from "../../src/library/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { hasGpp, createPCH, compileAndRunStandalone } from "./test-helpers.js";

const LIBRARY = `
INTERFACE IElem
  METHOD Draw : DINT END_METHOD
  PROPERTY Size : DINT GET END_GET END_PROPERTY
END_INTERFACE
INTERFACE ILabelled EXTENDS IElem
  PROPERTY Caption : STRING[16] GET END_GET SET END_SET END_PROPERTY
END_INTERFACE
TYPE GeoPoint : STRUCT x : DINT; END_STRUCT; END_TYPE
INTERFACE IGeo
  METHOD Origin : GeoPoint END_METHOD
END_INTERFACE
FUNCTION_BLOCK ABSTRACT Shape
  METHOD ABSTRACT Area : DINT END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Elem IMPLEMENTS IElem
  VAR_INPUT Base : DINT := 1; Name : STRING[8]; END_VAR
  VAR Counter : DINT := 40; END_VAR
  METHOD Draw : DINT Draw := Base; END_METHOD
  METHOD PROTECTED Hovered : DINT Hovered := 7; END_METHOD
  METHOD PRIVATE Own : DINT Own := 1; END_METHOD
  METHOD INTERNAL Secret : BOOL Secret := TRUE; END_METHOD
  METHOD FINAL Fixed : DINT Fixed := 2; END_METHOD
  PROPERTY Size : DINT GET Size := 3; END_GET END_PROPERTY
END_FUNCTION_BLOCK
FUNCTION_BLOCK Geo IMPLEMENTS IGeo
  VAR_INPUT Base : DINT := 1; END_VAR
  METHOD Origin : GeoPoint Origin.x := Base; END_METHOD
END_FUNCTION_BLOCK
FUNCTION_BLOCK Panel EXTENDS Elem
  METHOD OVERRIDE Draw : DINT Draw := 5; END_METHOD
END_FUNCTION_BLOCK`;

function buildLibrary(): StlibArchive {
  const lib = compileStlib([{ fileName: "l.st", source: LIBRARY }], {
    name: "uilib",
    version: "1.0.0",
    namespace: "uilib",
  });
  expect(lib.errors).toEqual([]);
  return lib.archive;
}

const errorsWith = (source: string, archive: StlibArchive): string[] =>
  compile(source, { libraries: [archive] }).errors.map((e) => e.message);

describe("library manifests export methods, properties and interfaces", () => {
  it("records each block's lineage, members and the library's interfaces", () => {
    const { manifest } = buildLibrary();
    const elem = manifest.functionBlocks.find((f) => f.name === "ELEM");
    expect(elem?.implements).toEqual(["IELEM"]);
    expect(elem?.methods?.map((m) => `${m.visibility} ${m.name}`)).toEqual([
      "PUBLIC DRAW",
      "PROTECTED HOVERED",
      "PRIVATE OWN",
      "INTERNAL SECRET",
      "PUBLIC FIXED",
    ]);
    expect(elem?.methods?.find((m) => m.name === "FIXED")?.isFinal).toBe(true);
    expect(elem?.properties).toEqual([
      {
        name: "SIZE",
        type: { type: "DINT" },
        visibility: "PUBLIC",
        getter: true,
      },
    ]);
    expect(elem?.inputs.find((i) => i.name === "NAME")?.maxLength).toBe(8);
    const panel = manifest.functionBlocks.find((f) => f.name === "PANEL");
    expect(panel?.extends).toBe("ELEM");
    expect(panel?.methods?.[0]?.isOverride).toBe(true);
    expect(manifest.interfaces?.map((i) => i.name)).toEqual([
      "IELEM",
      "ILABELLED",
      "IGEO",
    ]);
    expect(manifest.interfaces?.[1]?.extends).toEqual(["IELEM"]);
    expect(manifest.interfaces?.[1]?.properties[0]).toMatchObject({
      name: "CAPTION",
      getter: true,
      setter: true,
    });
  });

  it("does not re-export the interfaces of a library it depends on", () => {
    const base = buildLibrary();
    const dependent = compileStlib(
      [
        {
          fileName: "d.st",
          source:
            "FUNCTION_BLOCK Tile IMPLEMENTS IElem METHOD Draw : DINT Draw := 1; END_METHOD PROPERTY Size : DINT GET Size := 1; END_GET END_PROPERTY END_FUNCTION_BLOCK",
        },
      ],
      {
        name: "tiles",
        version: "1.0.0",
        namespace: "tiles",
        dependencies: [base],
      },
    );
    expect(dependent.errors).toEqual([]);
    expect(dependent.archive.manifest.interfaces).toEqual([]);
    expect(dependent.archive.manifest.functionBlocks[0]?.implements).toEqual([
      "IELEM",
    ]);
  });

  it("refuses malformed member entries in an archive", () => {
    const archive = JSON.parse(JSON.stringify(buildLibrary())) as {
      manifest: {
        functionBlocks: Array<{ methods: Array<{ visibility: string }> }>;
      };
    };
    const elem = archive.manifest.functionBlocks.findIndex(
      (f) => f.methods.length > 0,
    );
    archive.manifest.functionBlocks[elem]!.methods[0]!.visibility = "OPEN";
    expect(() => loadStlibArchive(archive)).toThrow(LibraryManifestError);
    expect(() => loadStlibArchive(archive)).toThrow(
      `functionBlocks[${elem}].methods[0].visibility must be PUBLIC, PRIVATE, PROTECTED or INTERNAL`,
    );
  });

  it("refuses null and unnamed member entries in an archive", () => {
    const refuses = (
      edit: (manifest: Record<string, unknown[]>) => void,
      message: string,
    ): void => {
      const archive = JSON.parse(JSON.stringify(buildLibrary())) as {
        manifest: Record<string, unknown[]>;
      };
      edit(archive.manifest);
      expect(() => loadStlibArchive(archive)).toThrow(message);
    };
    refuses((m) => {
      m.interfaces![0] = null;
    }, "interfaces[0].name must be a non-empty string");
    refuses((m) => {
      (m.interfaces![0] as { methods: unknown[] }).methods[0] = null;
    }, "interfaces[0].methods[0].name must be a non-empty string");
    refuses((m) => {
      const geo = m.interfaces![2] as { methods: Array<{ inputs: unknown[] }> };
      geo.methods[0]!.inputs.push({ type: "DINT" });
    }, "interfaces[2].methods[0].inputs[0].name must be a non-empty string");
  });
});

describe("consumers check library members", () => {
  let archive: StlibArchive;
  beforeAll(() => {
    archive = buildLibrary();
  });

  it("enforces access specifiers on library methods", () => {
    expect(
      errorsWith(
        `FUNCTION_BLOCK W EXTENDS Elem
  METHOD Run : DINT
    Run := Hovered();
    Run := Own();
    IF Secret() THEN Run := 0; END_IF;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM P VAR e : Elem; x : DINT; END_VAR x := e.Hovered(); END_PROGRAM`,
        archive,
      ),
    ).toEqual([
      "Cannot call PROTECTED method 'HOVERED' of 'ELEM' from 'PROGRAM'.",
      "Cannot call PRIVATE method 'OWN' of 'ELEM' from outside 'ELEM'.",
      "Cannot call INTERNAL method 'SECRET' of 'ELEM' from outside its library.",
    ]);
  });

  it("checks OVERRIDE against library methods", () => {
    const errors = errorsWith(
      `FUNCTION_BLOCK W EXTENDS Elem
  METHOD OVERRIDE Draw : DINT Draw := 1; END_METHOD
  METHOD OVERRIDE Missing : DINT Missing := 1; END_METHOD
  METHOD OVERRIDE Fixed : DINT Fixed := 1; END_METHOD
END_FUNCTION_BLOCK`,
      archive,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("'MISSING'");
    expect(errors[1]).toContain("FIXED");
  });

  it("rejects overriding a PRIVATE or INTERNAL library method", () => {
    expect(
      errorsWith(
        `FUNCTION_BLOCK W EXTENDS Elem
  METHOD OVERRIDE Own : DINT Own := 9; END_METHOD
  METHOD Secret : BOOL Secret := FALSE; END_METHOD
END_FUNCTION_BLOCK`,
        archive,
      ),
    ).toEqual([
      "Method 'OWN' in 'W' cannot override PRIVATE method 'OWN' of 'ELEM'.",
      "Method 'SECRET' in 'W' cannot override INTERNAL method 'SECRET' of 'ELEM' from outside its library.",
    ]);
  });

  it("keeps a library method's access modifier on an override", () => {
    const override = (modifier: string): string[] =>
      errorsWith(
        `FUNCTION_BLOCK W EXTENDS Elem METHOD ${modifier} Hovered : DINT Hovered := 8; END_METHOD END_FUNCTION_BLOCK`,
        archive,
      );
    expect(override("PROTECTED")).toEqual([]);
    expect(override("PUBLIC")).toEqual([
      "Method 'HOVERED' in 'W' cannot change the access modifier PROTECTED of method 'HOVERED' of 'ELEM' it overrides.",
    ]);
  });

  it("rejects instances of an ABSTRACT library block, not pointers to it", () => {
    expect(
      errorsWith(
        "PROGRAM P VAR s : Shape; p : POINTER TO Shape; END_VAR END_PROGRAM",
        archive,
      ),
    ).toEqual(["Cannot instantiate ABSTRACT FUNCTION_BLOCK 'SHAPE'."]);
  });

  it("lets a block that extends a library block use the variables it inherits", () => {
    expect(
      errorsWith(
        `FUNCTION_BLOCK W EXTENDS Elem
  METHOD Run : DINT Counter := Counter + 1; Run := Base + Counter; END_METHOD
END_FUNCTION_BLOCK`,
        archive,
      ),
    ).toEqual([]);
  });

  it("types a library method's STRUCT result as the library's STRUCT", () => {
    const result = compile(
      "PROGRAM P VAR g : Geo; p : GeoPoint; END_VAR p := g.Origin(); END_PROGRAM",
      { libraries: [archive] },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode + result.cppCode).toContain("GEOPOINT");
  });

  it("reports an interface named like a library's", () => {
    const local = compile(
      "INTERFACE IElem METHOD Other : BOOL END_METHOD END_INTERFACE",
      { libraries: [archive] },
    );
    expect(local.errors.map((e) => e.message)).toEqual([
      "INTERFACE 'IELEM' of library 'uilib' clashes with INTERFACE 'IELEM' of this program; rename one of them.",
    ]);
    const second = compileStlib(
      [
        {
          fileName: "s.st",
          source:
            "INTERFACE IElem METHOD Other : BOOL END_METHOD END_INTERFACE",
        },
      ],
      { name: "second", version: "1.0.0", namespace: "second" },
    );
    const both = compile("PROGRAM P END_PROGRAM", {
      libraries: [archive, second.archive],
    });
    expect(
      both.errors.map((e) => ({ message: e.message, file: e.file })),
    ).toEqual([
      {
        message:
          "INTERFACE 'IELEM' of library 'second' clashes with INTERFACE 'IELEM' of library 'uilib'; rename one of them.",
        file: "uilib",
      },
    ]);
  });

  it("reports a TYPE or FUNCTION_BLOCK named like a library interface", () => {
    expect(
      errorsWith(
        "TYPE IElem : STRUCT a : DINT; END_STRUCT; END_TYPE PROGRAM P END_PROGRAM",
        archive,
      ),
    ).toEqual([
      "INTERFACE 'IELEM' of library 'uilib' clashes with TYPE 'IELEM' of this program; rename one of them.",
    ]);
    expect(
      errorsWith("FUNCTION_BLOCK IElem END_FUNCTION_BLOCK", archive),
    ).toEqual([
      "INTERFACE 'IELEM' of library 'uilib' clashes with FUNCTION_BLOCK 'IELEM' of this program; rename one of them.",
    ]);
  });

  it("emits no type that only a library interface's signature names", () => {
    const result = compile(
      "PROGRAM P VAR e : Elem; x : DINT; END_VAR x := e.Draw(); END_PROGRAM",
      { libraries: [archive] },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode + result.cppCode).not.toContain("GEOPOINT");
  });

  it("checks library interfaces like the unit's own", () => {
    expect(
      errorsWith(
        `FUNCTION_BLOCK Other END_FUNCTION_BLOCK
PROGRAM P
  VAR i : IElem; l : ILabelled; o : Other; x : DINT; END_VAR
  i := o;
  x := i.Missing();
  l.Caption := 'hello';
  i := l;
END_PROGRAM`,
        archive,
      ),
    ).toEqual([
      "Cannot assign OTHER to IELEM: OTHER does not implement IELEM",
      "'IELEM' has no method 'MISSING'",
    ]);
    expect(
      errorsWith(
        "FUNCTION_BLOCK NoProp IMPLEMENTS IElem METHOD Draw : DINT Draw := 1; END_METHOD END_FUNCTION_BLOCK",
        archive,
      ),
    ).toEqual([
      "FUNCTION_BLOCK 'NOPROP' implements 'IELEM' but does not provide PROPERTY 'SIZE'.",
    ]);
  });

  it("reports unknown methods on library blocks that export their members", () => {
    expect(
      errorsWith(
        "PROGRAM P VAR e : Elem; x : DINT; END_VAR x := e.Nope(); END_PROGRAM",
        archive,
      ),
    ).toEqual(["'ELEM' has no method 'NOPE'"]);
  });

  it("keeps an archive without exported members working as before", () => {
    const old = JSON.parse(JSON.stringify(archive)) as StlibArchive;
    for (const fb of old.manifest.functionBlocks) {
      delete fb.methods;
      delete fb.properties;
    }
    delete old.manifest.interfaces;
    expect(
      compile(
        "PROGRAM P VAR e : Elem; x : DINT; END_VAR x := e.Nope(); END_PROGRAM",
        {
          libraries: [old],
        },
      ).errors,
    ).toEqual([]);
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp("library OOP compiled and run with g++", () => {
  let tempDir: string;
  let pchPath: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-libopp-"));
    pchPath = createPCH(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("runs a block that uses the variables it inherits from a library block", () => {
    const result = compile(
      `FUNCTION_BLOCK W EXTENDS Elem
  METHOD Run : DINT Counter := Counter + 1; Run := Base * 100 + Counter; END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR w1 : W; RESULT : DINT; END_VAR
  w1(Base := 3);
  RESULT := w1.Run();
END_PROGRAM`,
      { libraries: [buildLibrary()] },
    );
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "library_inherited_vars",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld\\n", (long long)p.RESULT.get());
  return 0;
}`,
    });
    expect(out.trim()).toBe("341");
  });

  it("overrides a library method and calls through a library interface", () => {
    const result = compile(
      `FUNCTION_BLOCK W EXTENDS Elem
  METHOD OVERRIDE Draw : DINT Draw := Hovered() * 100 + THIS^.Size * 10 + SUPER^.Draw(); END_METHOD
END_FUNCTION_BLOCK
PROGRAM P
  VAR w1 : W; panel : Panel; i : IElem; RESULT : DINT; END_VAR
  i := w1;
  RESULT := i.Draw() * 10 + i.Size + w1.Size;
  i := panel;
  RESULT := RESULT * 10 + i.Draw();
END_PROGRAM`,
      { libraries: [buildLibrary()] },
    );
    expect(result.errors).toEqual([]);
    const out = compileAndRunStandalone({
      tempDir,
      pchPath,
      headerCode: result.headerCode,
      cppCode: result.cppCode,
      testName: "library_oop",
      mainCode: `#include <cstdio>
int main() {
  strucpp::Program_P p;
  p.run();
  std::printf("%lld\\n", (long long)p.RESULT.get());
  return 0;
}`,
    });
    expect(out.trim()).toBe("73165");
  });
});
