// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Native (C/C++, Python) library blocks.
 *
 * The contract under test: STruC++ recovers the interface from the file's ST
 * header, emits NO chunk for it, and carries the authored file verbatim in
 * `sources` — including under `--no-source`, because a native block has no
 * compiled chunk and so its source is the whole deliverable.
 */

import { describe, expect, it } from "vitest";

import {
  compileLibrary,
  compileStlib,
} from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import {
  LIBRARY_SOURCE_EXTENSIONS,
  nativeLanguageFor,
  partitionLibrarySources,
  projectNativeHeaderToSt,
} from "../../src/library/native-sources.js";

const CPP_BLOCK = `(* Scales an INT by a gain *)
FUNCTION_BLOCK CPP_SCALE
VAR_INPUT
  RAW : INT;
  GAIN : INT;
END_VAR
VAR_OUTPUT
  SCALED : INT;
END_VAR
void setup()
{
}

void loop()
{
    SCALED = RAW * GAIN;
}
END_FUNCTION_BLOCK
`;

const PY_BLOCK = `FUNCTION_BLOCK PY_OFFSET
VAR_INPUT
  IN_VAL : INT;
  OFFSET : INT;
END_VAR
VAR_OUTPUT
  OUT_VAL : INT;
END_VAR
def block_loop():
    global OUT_VAL
    OUT_VAL = IN_VAL + OFFSET
END_FUNCTION_BLOCK
`;

const ST_BLOCK = `FUNCTION_BLOCK ST_ADD
VAR_INPUT
  A : INT;
  B : INT;
END_VAR
VAR_OUTPUT
  C : INT;
END_VAR
C := A + B;
END_FUNCTION_BLOCK
`;

const OPTS = { name: "nativelib", version: "1.0.0", namespace: "nativelib" };

describe("nativeLanguageFor", () => {
  it.each([
    ["Block.cpp", "cpp"],
    ["Block.c", "cpp"],
    ["Block.cc", "cpp"],
    ["Block.cxx", "cpp"],
    ["Block.CPP", "cpp"],
    ["Block.py", "python"],
    ["Block.PY", "python"],
  ])("maps %s to %s", (fileName, expected) => {
    expect(nativeLanguageFor(fileName)).toBe(expected);
  });

  it.each(["Block.st", "Block.il", "Block.txt", "Block"])(
    "returns null for %s",
    (fileName) => {
      expect(nativeLanguageFor(fileName)).toBeNull();
    },
  );

  it("lists ST and native extensions for CLI discovery", () => {
    expect(LIBRARY_SOURCE_EXTENSIONS).toEqual(
      expect.arrayContaining([".st", ".il", ".cpp", ".py"]),
    );
  });
});

describe("partitionLibrarySources", () => {
  it("splits native from ST and preserves order within each group", () => {
    const { st, native } = partitionLibrarySources([
      { fileName: "a.st", source: "" },
      { fileName: "b.cpp", source: "" },
      { fileName: "c.il", source: "" },
      { fileName: "d.py", source: "" },
    ]);
    expect(st.map((s) => s.fileName)).toEqual(["a.st", "c.il"]);
    expect(native.map((s) => `${s.fileName}:${s.language}`)).toEqual([
      "b.cpp:cpp",
      "d.py:python",
    ]);
  });
});

describe("projectNativeHeaderToSt", () => {
  it("keeps the header, drops the body, and closes the block", () => {
    const out = projectNativeHeaderToSt({
      fileName: "CPP_SCALE.cpp",
      source: CPP_BLOCK,
      language: "cpp",
    });
    if ("message" in out) throw new Error(out.message);

    expect(out.name).toBe("CPP_SCALE");
    expect(out.documentation).toBe("Scales an INT by a gain");
    expect(out.st).toContain("VAR_INPUT");
    expect(out.st).toContain("SCALED : INT;");
    expect(out.st.trimEnd().endsWith("END_FUNCTION_BLOCK")).toBe(true);
    // The body must never reach the parser — that is what lets a Python body
    // live in a library at all.
    expect(out.st).not.toContain("void loop");
  });

  it("rejects a file with no ST header, naming it", () => {
    const out = projectNativeHeaderToSt({
      fileName: "Bare.py",
      source: "def block_loop():\n    pass\n",
      language: "python",
    });
    expect("message" in out && out.message).toContain("Bare.py");
    expect("message" in out && out.message).toContain("missing the ST header");
  });

  it("rejects a header that declares no variables", () => {
    const out = projectNativeHeaderToSt({
      fileName: "NoVars.cpp",
      source: "FUNCTION_BLOCK NoVars\nvoid loop() {}\nEND_FUNCTION_BLOCK\n",
      language: "cpp",
    });
    expect("message" in out && out.message).toContain("declares no variables");
  });

  // A native FUNCTION used to be accepted, projected, and then silently
  // dropped: the interface landed in the AST's function list, which
  // `compileNativeEntries` does not read, so the library built successfully
  // with the block missing from the manifest entirely.
  it("rejects a FUNCTION — a native block has no instance state", () => {
    const out = projectNativeHeaderToSt({
      fileName: "CPP_ADD.cpp",
      source: "FUNCTION CPP_ADD : INT\nVAR_INPUT A : INT; END_VAR\nint add(){}\nEND_FUNCTION\n",
      language: "cpp",
    });
    expect("message" in out && out.message).toContain("must be a FUNCTION_BLOCK, not a FUNCTION");
    expect("message" in out && out.message).toContain("CPP_ADD.cpp");
  });

  it("names Python in the rejection when the file is a .py", () => {
    const out = projectNativeHeaderToSt({
      fileName: "PY_ADD.py",
      source: "FUNCTION PY_ADD : INT\nVAR_INPUT A : INT; END_VAR\ndef f(): pass\nEND_FUNCTION\n",
      language: "python",
    });
    expect("message" in out && out.message).toContain("Python library block");
  });

  it("closes the projected block as a FUNCTION_BLOCK", () => {
    const out = projectNativeHeaderToSt({ fileName: "X.cpp", source: CPP_BLOCK, language: "cpp" });
    if ("message" in out) throw new Error(out.message);
    expect(out.st).toContain("END_FUNCTION_BLOCK");
  });

  it("rejects a PROGRAM, which a library cannot export", () => {
    const out = projectNativeHeaderToSt({
      fileName: "Prog.cpp",
      source:
        "PROGRAM Prog\nVAR x : INT; END_VAR\nvoid loop() {}\nEND_PROGRAM\n",
      language: "cpp",
    });
    expect("message" in out && out.message).toContain(
      "cannot export a PROGRAM",
    );
  });
});

describe("compileLibrary with native sources", () => {
  it("builds a library made only of native blocks", () => {
    const result = compileLibrary(
      [
        { fileName: "CPP_SCALE.cpp", source: CPP_BLOCK },
        { fileName: "PY_OFFSET.py", source: PY_BLOCK },
      ],
      OPTS,
    );

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    // Nothing was compiled, so nothing was emitted.
    expect(result.chunks).toEqual([]);
    expect(result.cppCode).toBe("");

    const byName = new Map(
      result.manifest.functionBlocks.map((fb) => [fb.name, fb]),
    );
    expect([...byName.keys()].sort()).toEqual(["CPP_SCALE", "PY_OFFSET"]);

    const cpp = byName.get("CPP_SCALE")!;
    expect(cpp.implementation).toBe("cpp");
    expect(cpp.sourceFile).toBe("CPP_SCALE.cpp");
    expect(cpp.inputs.map((v) => v.name)).toEqual(["RAW", "GAIN"]);
    expect(cpp.outputs.map((v) => v.name)).toEqual(["SCALED"]);
    expect(cpp.documentation).toBe("Scales an INT by a gain");

    expect(byName.get("PY_OFFSET")!.implementation).toBe("python");
  });

  it("compiles ST alongside native blocks, chunking only the ST", () => {
    const result = compileLibrary(
      [
        { fileName: "ST_ADD.st", source: ST_BLOCK },
        { fileName: "CPP_SCALE.cpp", source: CPP_BLOCK },
      ],
      OPTS,
    );

    expect(result.success).toBe(true);
    expect(result.chunks?.map((c) => c.name)).toEqual(["ST_ADD"]);

    const byName = new Map(
      result.manifest.functionBlocks.map((fb) => [fb.name, fb]),
    );
    expect(byName.get("ST_ADD")!.implementation).toBeUndefined();
    expect(byName.get("CPP_SCALE")!.implementation).toBe("cpp");
  });

  it("still refuses a library with no sources at all", () => {
    const result = compileLibrary([], OPTS);
    expect(result.success).toBe(false);
    expect(result.errors[0]?.message).toBe("No source files provided");
  });

  it("fails with the offending file when a native header is unusable", () => {
    const result = compileLibrary(
      [{ fileName: "Bare.py", source: "def block_loop(): pass\n" }],
      OPTS,
    );
    expect(result.success).toBe(false);
    expect(result.errors[0]?.file).toBe("Bare.py");
  });
});

describe("compileStlib with native sources", () => {
  const build = (noSource: boolean) =>
    compileStlib(
      [
        { fileName: "ST_ADD.st", source: ST_BLOCK },
        { fileName: "CPP_SCALE.cpp", source: CPP_BLOCK },
        { fileName: "PY_OFFSET.py", source: PY_BLOCK },
      ],
      { ...OPTS, noSource },
    );

  it("carries every source verbatim by default", () => {
    const { success, archive } = build(false);
    expect(success).toBe(true);
    expect(archive.sources?.map((s) => s.fileName).sort()).toEqual([
      "CPP_SCALE.cpp",
      "PY_OFFSET.py",
      "ST_ADD.st",
    ]);
    const py = archive.sources?.find((s) => s.fileName === "PY_OFFSET.py");
    // Verbatim: the consumer re-derives the bridge from these exact bytes, so
    // a published library keeps working across bridge revisions.
    expect(py?.source).toBe(PY_BLOCK);
  });

  it("keeps native sources under --no-source and drops only the ST", () => {
    const { archive } = build(true);
    expect(archive.sources?.map((s) => s.fileName).sort()).toEqual([
      "CPP_SCALE.cpp",
      "PY_OFFSET.py",
    ]);
  });

  it("produces an archive its own loader accepts, native metadata intact", () => {
    const { archive } = build(false);
    const loaded = loadStlibFromString(JSON.stringify(archive), "nativelib");
    const native = loaded.manifest.functionBlocks.filter(
      (fb) => fb.implementation,
    );
    expect(
      native.map((fb) => `${fb.name}:${fb.implementation}`).sort(),
    ).toEqual(["CPP_SCALE:cpp", "PY_OFFSET:python"]);
    expect(loaded.sources?.length).toBe(3);
  });

  it("round-trips an all-native library through the loader", () => {
    const { success, archive } = compileStlib(
      [{ fileName: "PY_OFFSET.py", source: PY_BLOCK }],
      OPTS,
    );
    expect(success).toBe(true);
    const loaded = loadStlibFromString(JSON.stringify(archive), "nativelib");
    expect(loaded.chunks).toEqual([]);
    expect(loaded.manifest.functionBlocks[0]?.sourceFile).toBe("PY_OFFSET.py");
  });
});

describe("duplicate exports", () => {
  const FN = (n: string) => `FUNCTION ${n} : INT\nVAR_INPUT A : INT; END_VAR\n${n} := A;\nEND_FUNCTION\n`;
  const FB = (n: string) =>
    `FUNCTION_BLOCK ${n}\nVAR_INPUT A : INT; END_VAR\nVAR_OUTPUT Q : INT; END_VAR\nQ := A;\nEND_FUNCTION_BLOCK\n`;
  const TY = (n: string) => `TYPE\n  ${n} : STRUCT\n    f : INT;\n  END_STRUCT;\nEND_TYPE\n`;
  const GV = (n: string) => `VAR_GLOBAL\n  ${n} : INT := 1;\nEND_VAR\n`;
  const CFB = (n: string) =>
    `FUNCTION_BLOCK ${n}\nVAR_INPUT Z : BOOL; END_VAR\nVAR_OUTPUT Q : INT; END_VAR\nvoid loop() {}\nEND_FUNCTION_BLOCK\n`;

  const build = (files: Array<[string, string]>) =>
    compileLibrary(
      files.map(([fileName, source]) => ({ fileName, source })),
      OPTS,
    );

  // A library exports one thing per name. STruC++'s own duplicate detection
  // only fires within a single kind and a single translation unit, and native
  // headers compile in a separate unit — so these are the collisions nothing
  // used to catch. A published `.stlib` is immutable in the field, so emitting
  // an ambiguous manifest costs more than refusing to.
  it.each([
    ["an ST function and an ST function block", [["a.st", FN("FOO") + FB("FOO")]]],
    ["an ST type and an ST function block", [["a.st", TY("FOO") + FB("FOO")]]],
    ["a native block and an ST function", [["a.st", FN("FOO")], ["FOO.cpp", CFB("FOO")]]],
    ["a native block and an ST type", [["a.st", TY("FOO")], ["FOO.cpp", CFB("FOO")]]],
    ["a native block and an ST global", [["a.st", GV("FOO")], ["FOO.cpp", CFB("FOO")]]],
  ])("rejects a name claimed by %s", (_label, files) => {
    const res = build(files as Array<[string, string]>);
    expect(res.success).toBe(false);
    expect(res.errors[0]?.message).toContain('"FOO" is exported 2 times');
    expect(res.manifest.functionBlocks).toEqual([]);
  });

  it("rejects a duplicate in an all-native library too", () => {
    // Both headers share one synthetic translation unit, so the front end's own
    // duplicate detection fires first here — the message differs, the refusal
    // does not.
    const res = build([
      ["FOO.cpp", CFB("FOO")],
      ["FOO.py", `FUNCTION_BLOCK FOO\nVAR_INPUT P : INT; END_VAR\ndef block_loop():\n    pass\nEND_FUNCTION_BLOCK\n`],
    ]);
    expect(res.success).toBe(false);
    expect(res.errors[0]?.message).toMatch(/Duplicate function block declaration|exported 2 times/);
  });

  it("names both kinds so the author knows which two files to look at", () => {
    const res = build([
      ["a.st", FN("FOO")],
      ["FOO.cpp", CFB("FOO")],
    ]);
    expect(res.errors[0]?.message).toContain("as function, cpp function block");
  });

  it("leaves a library with distinct names alone", () => {
    const res = build([
      ["a.st", FN("ADD2") + FB("TANK") + TY("MODE")],
      ["SCALE.cpp", CFB("SCALE")],
    ]);
    expect(res.errors).toEqual([]);
    expect(res.success).toBe(true);
    expect(res.manifest.functions.map((f) => f.name)).toEqual(["ADD2"]);
    expect(res.manifest.functionBlocks.map((f) => f.name).sort()).toEqual(["SCALE", "TANK"]);
  });

  it("compares names case-insensitively, as the front end does", () => {
    const res = build([
      ["a.st", FB("Foo")],
      ["FOO.cpp", CFB("FOO")],
    ]);
    expect(res.success).toBe(false);
    expect(res.errors[0]?.message).toContain("exported 2 times");
  });
});
