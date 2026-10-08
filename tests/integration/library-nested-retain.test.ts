/**
 * RETAIN state nested inside a library function block.
 *
 * A library block that holds another block (or an array of them) keeps the
 * inner block's `VAR RETAIN` members only if the debug table walks into it,
 * and keeps a retained STRING only if its declared length survives the
 * archive. Both are proved against a real library archive and the real
 * retain marshaller.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { discoverStlibs } from "../../src/node/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";
import { hasGpp, CXX_STD } from "./test-helpers.js";

const RUNTIME_INCLUDE = path.resolve(__dirname, "../../src/runtime/include");

const LIBRARY_SOURCE = `
TYPE LibRec : STRUCT
  code : INT;
  label : STRING(24);
  points : ARRAY[1..3] OF INT;
END_STRUCT; END_TYPE

FUNCTION_BLOCK LibInner
VAR_INPUT req : INT; END_VAR
VAR_OUTPUT mode : INT; END_VAR
VAR RETAIN
  kept : INT;
  note : STRING(40);
END_VAR
VAR scratch : INT; END_VAR
  IF req <> 0 THEN kept := req; note := 'set'; END_IF;
  mode := kept;
  scratch := scratch + 1;
END_FUNCTION_BLOCK

FUNCTION_BLOCK LibOuter
VAR_INPUT req : INT; END_VAR
VAR_OUTPUT mode : INT; END_VAR
VAR RETAIN own : INT; END_VAR
VAR
  pick : LibInner;
  units : ARRAY[1..2] OF LibInner;
  plain : INT;
END_VAR
  pick(req := req);
  units[1](req := req);
  units[2](req := req);
  mode := pick.mode;
  plain := mode;
END_FUNCTION_BLOCK

FUNCTION_BLOCK LibTop
VAR_OUTPUT mode : INT; END_VAR
VAR core : LibOuter; END_VAR
  core();
  mode := core.mode;
END_FUNCTION_BLOCK
`;

const PROGRAM_SOURCE = `
TYPE Spot : STRUCT
  x : INT;
END_STRUCT; END_TYPE

TYPE Plant : STRUCT
  id : INT;
  rec : LibRec;
  recs : ARRAY[1..2] OF LibRec;
  spot : Spot;
END_STRUCT; END_TYPE

PROGRAM Main
VAR
  outer : LibOuter;
  top : LibTop;
  plant : Plant;
END_VAR
  outer(req := 0);
  top();
  plant.id := outer.mode;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

function buildLibrary(): StlibArchive {
  const lib = compileStlib(
    [{ source: LIBRARY_SOURCE, fileName: "nested.st" }],
    { name: "nested-lib", version: "1.0.0", namespace: "nested" },
  );
  expect(lib.errors).toEqual([]);
  expect(lib.success).toBe(true);
  // Round-trip through JSON, as an archive on disk would.
  return JSON.parse(JSON.stringify(lib.archive)) as StlibArchive;
}

/**
 * The archive as a compiler from before the layout tables moved out of the
 * header would have written it: each STRUCT's table DEFINED in its type
 * chunk's header (internal linkage, a copy per TU), nothing in the chunk's cpp.
 */
function asPreMoveArchive(archive: StlibArchive): StlibArchive {
  for (const chunk of archive.chunks) {
    const decl = `extern const strucpp::TypeDesc ${chunk.name}__TYPEDESC;`;
    if (chunk.kind !== "type" || !chunk.header.includes(decl)) continue;
    // The old tables named members with string literals, no name pool.
    const pool = chunk.cpp.match(
      new RegExp(
        `static const char ${chunk.name}__STRINGS\\[\\] =([\\s\\S]*?);\\n`,
      ),
    )!;
    const texts = [...pool[1]!.matchAll(/"((?:[^"\\]|\\.)*)\\0"/g)].map(
      (m) => m[1]!,
    );
    const at = new Map<number, string>();
    let off = 0;
    for (const t of texts) {
      at.set(off, t);
      off += t.replace(/\\(.)/g, "$1").length + 1;
    }
    const table = chunk.cpp
      .replace(pool[0], "")
      .replace(
        new RegExp(`${chunk.name}__STRINGS \\+ (\\d+)`, "g"),
        (_m, n: string) => `"${at.get(Number(n))}"`,
      );
    chunk.header = chunk.header.replace(decl, table.trim());
    chunk.cpp = "";
  }
  return archive;
}

/** PLANT's table as defined in configuration.cpp: its name pool and rows. */
function plantTable(cpp: string): string {
  const start = cpp.indexOf("static const char PLANT__STRINGS[] =");
  return cpp.slice(
    start,
    cpp.indexOf("const strucpp::TypeDesc PLANT__TYPEDESC", start),
  );
}

function compileProgram(archive: StlibArchive) {
  return compile(PROGRAM_SOURCE, {
    headerFileName: "generated.hpp",
    libraries: [...discoverStlibs("libs"), archive],
  });
}

const RETAINED_PER_INNER = ["KEPT", "NOTE"];

/** Every retained leaf one LibOuter instance at `p` must contribute. */
function outerRetained(p: string): string[] {
  return [
    `${p}.OWN`,
    ...RETAINED_PER_INNER.map((m) => `${p}.PICK.${m}`),
    ...RETAINED_PER_INNER.map((m) => `${p}.UNITS[1].${m}`),
    ...RETAINED_PER_INNER.map((m) => `${p}.UNITS[2].${m}`),
  ];
}

describe("RETAIN inside a block nested in a library block", () => {
  it("exports string lengths and full struct field types in the manifest", () => {
    const archive = buildLibrary();
    const inner = archive.manifest.functionBlocks.find(
      (f) => f.name === "LIBINNER",
    )!;
    expect(inner.locals?.find((l) => l.name === "NOTE")).toMatchObject({
      type: "STRING",
      maxLength: 40,
      retain: true,
    });
    const rec = archive.manifest.types.find((t) => t.name === "LIBREC")!;
    expect(rec.fields?.find((f) => f.name === "LABEL")).toMatchObject({
      type: "STRING",
      maxLength: 24,
    });
    expect(rec.fields?.find((f) => f.name === "POINTS")).toMatchObject({
      arrayDimensions: [{ start: 1, end: 3 }],
      elementTypeName: "INT",
    });
  });

  it("lists every retained leaf, at any depth, and nothing else", () => {
    const result = compileProgram(buildLibrary());
    expect(result.errors.map((e) => e.message)).toEqual([]);

    const retained = (result.debugMap!.retainVars ?? []).map((v) => v.path);
    expect([...retained].sort()).toEqual(
      [
        ...outerRetained("INSTANCE0.OUTER"),
        ...outerRetained("INSTANCE0.TOP.CORE"),
      ].sort(),
    );

    // A library block stays a black box apart from its retained state.
    const leaves = result.debugMap!.leaves.map((l) => l.path);
    expect(leaves).toContain("INSTANCE0.OUTER.PICK.KEPT");
    expect(leaves).not.toContain("INSTANCE0.OUTER.PICK.SCRATCH");
    expect(leaves).not.toContain("INSTANCE0.OUTER.PICK.MODE");
    expect(leaves).not.toContain("INSTANCE0.OUTER.PLAIN");
    expect(leaves).not.toContain("INSTANCE0.TOP.CORE.MODE");

    // Strings keep their declared length: in a library block, and in a
    // library STRUCT held by a project STRUCT.
    const cpp = result.debugTableCpp!;
    expect(cpp).toMatch(
      /TAG_STRING, LEAF_FLAG_RETAIN, 40 \},\s+\/\/ INSTANCE0\.OUTER\.UNITS\[2\]\.NOTE/,
    );
    expect(cpp).toMatch(
      /TAG_STRING, 0, 24 \},\s+\/\/ INSTANCE0\.PLANT\.REC\.LABEL/,
    );
    expect(leaves).toContain("INSTANCE0.PLANT.RECS[2].POINTS[3]");
  });

  it("takes a string's length from its C++ type when the archive has none", () => {
    const archive = buildLibrary();
    // An archive built before lengths were exported.
    for (const fb of archive.manifest.functionBlocks) {
      for (const l of fb.locals ?? []) delete l.maxLength;
    }
    const result = compileProgram(archive);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.debugTableCpp!).toContain(
      "TAG_STRING, LEAF_FLAG_RETAIN, string_cap<decltype(g_config.INSTANCE0.OUTER.PICK.NOTE)>::value },",
    );
  });

  // Plant is emitted after the library, in a later batch than Spot.
  it("describes a project STRUCT that holds a library STRUCT", () => {
    const result = compileProgram(buildLibrary());
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const warnings = result.warnings.map((w) => w.message).join("\n");
    expect(warnings).not.toContain("has no member layout");
    expect(result.headerCode).toContain(
      "extern const strucpp::TypeDesc PLANT__TYPEDESC;",
    );
    const plant = plantTable(result.cppCode);
    expect(plant).toMatch(/"rec\\0"\s+"LIBREC\\0"/i);
    expect(plant).toMatch(/"spot\\0"\s+"Spot\\0"/);
    expect(plant).toContain("&LIBREC__TYPEDESC");
    expect(plant).toContain("&SPOT__TYPEDESC");
  });

  it("defines a library STRUCT's table once, from its chunk, in configuration.cpp", () => {
    const archive = buildLibrary();
    const librec = archive.chunks.find((c) => c.name === "LIBREC")!;
    expect(librec.header).toContain(
      "extern const strucpp::TypeDesc LIBREC__TYPEDESC;",
    );
    expect(librec.cpp).toContain(
      "const strucpp::TypeDesc LIBREC__TYPEDESC = {",
    );
    const result = compileProgram(archive);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const defining = result.cppFiles
      .filter((f) =>
        f.content.includes("const strucpp::TypeDesc LIBREC__TYPEDESC = {"),
      )
      .map((f) => f.name);
    expect(defining).toEqual(["configuration.cpp"]);
  });

  it("still describes a library STRUCT from an archive built before the tables moved", () => {
    const result = compileProgram(asPreMoveArchive(buildLibrary()));
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const warnings = result.warnings.map((w) => w.message).join("\n");
    expect(warnings).not.toContain("has no member layout");
    expect(result.headerCode).toContain(
      "const strucpp::TypeDesc LIBREC__TYPEDESC = {",
    );
    expect(plantTable(result.cppCode)).toContain("&LIBREC__TYPEDESC");
  });

  it("still refuses a library STRUCT whose archive carries no layout table", () => {
    const archive = buildLibrary();
    for (const chunk of archive.chunks) {
      if (chunk.name === "LIBREC") {
        chunk.header = chunk.header.replace(
          "extern const strucpp::TypeDesc LIBREC__TYPEDESC;",
          "",
        );
        chunk.cpp = chunk.cpp.replace(
          /\/\/ Member layout of LIBREC[\s\S]*?const strucpp::TypeDesc LIBREC__TYPEDESC = \{[\s\S]*?\n\};/,
          "",
        );
        expect(chunk.header).not.toContain("LIBREC__TYPEDESC");
        expect(chunk.cpp).not.toContain("LIBREC__TYPEDESC");
      }
    }
    const result = compileProgram(archive);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    const warnings = result.warnings.map((w) => w.message).join("\n");
    expect(warnings).toContain("STRUCT 'PLANT' has no member layout");
    expect(result.headerCode).not.toContain("LIBREC__TYPEDESC");
    expect(result.cppCode).not.toContain("LIBREC__TYPEDESC");
  });
});

const describeIfGpp = hasGpp ? describe : describe.skip;

const MAIN_CPP = `#include "generated.hpp"
#include "debug_dispatch.hpp"
#include "iec_retain.hpp"
#include <cstdio>
#include <cstring>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp;
static int fails = 0;
static void chk(const char* what, bool ok) { if (!ok) { printf("FAIL %s\\n", what); ++fails; } }
static uint16_t rd(uint8_t a, uint16_t e, uint8_t* d) { return debug::handle_read(a, e, d); }
static uint8_t  wr(uint8_t a, uint16_t e, const uint8_t* b, uint16_t n) { return debug::handle_write(a, e, b, n); }
static uint16_t sz(uint8_t a, uint16_t e) { return debug::handle_size(a, e); }

int main() {
  auto& o = g_config.INSTANCE0.OUTER;
  auto& t = g_config.INSTANCE0.TOP;
  o.OWN = 11;
  o.PICK.KEPT = 2;
  o.PICK.NOTE = "Auto";
  o.UNITS[1].KEPT = 3;
  o.UNITS[2].NOTE = "a note of exactly forty characters long!";
  o.PICK.SCRATCH = 77;
  t.CORE.PICK.KEPT = 4;
  t.CORE.UNITS[2].KEPT = 5;

  unsigned char blob[2048] = {0};
  size_t n = retain::pack(blob, sizeof(blob), rd, sz);
  chk("packed", n == retain::blob_size(sz));

  // Power cycle.
  o.OWN = 0; o.PICK.KEPT = 0; o.PICK.NOTE = ""; o.UNITS[1].KEPT = 0;
  o.UNITS[2].NOTE = ""; o.PICK.SCRATCH = 0;
  t.CORE.PICK.KEPT = 0; t.CORE.UNITS[2].KEPT = 0;

  chk("unpack ok", retain::unpack(blob, n, wr, sz) == retain::LoadResult::Ok);
  chk("library block's own", (int)o.OWN == 11);
  chk("nested block", (int)o.PICK.KEPT == 2);
  chk("nested string", std::strcmp(o.PICK.NOTE.get().c_str(), "Auto") == 0);
  chk("array of nested blocks", (int)o.UNITS[1].KEPT == 3);
  chk("full-length string", std::strcmp(o.UNITS[2].NOTE.get().c_str(),
      "a note of exactly forty characters long!") == 0);
  chk("three deep", (int)t.CORE.PICK.KEPT == 4);
  chk("three deep, in an array", (int)t.CORE.UNITS[2].KEPT == 5);
  chk("non-retained member untouched", (int)o.PICK.SCRATCH == 0);

  // The project STRUCT's layout table points at the library STRUCT's.
  const TypeDesc& plant = PLANT__TYPEDESC;
  chk("plant has four members", plant.MEMBERCOUNT == 4);
  chk("rec nests LibRec", plant.MEMBERS[1].NESTED == &LIBREC__TYPEDESC);
  chk("recs nests LibRec", plant.MEMBERS[2].NESTED == &LIBREC__TYPEDESC);
  chk("spot nests Spot", plant.MEMBERS[3].NESTED == &SPOT__TYPEDESC);

  printf(fails ? "FAILURES=%d\\n" : "ALL_OK\\n", fails);
  return fails ? 1 : 0;
}
`;

describeIfGpp(
  "nested library RETAIN round-trips through the real runtime",
  () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "strucpp-nested-retain-"),
      );
    });

    afterAll(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    for (const variant of ["with lengths", "without lengths"] as const) {
      it(`saves, wipes and restores every nested retained leaf (${variant})`, () => {
        const archive = buildLibrary();
        if (variant === "without lengths") {
          for (const fb of archive.manifest.functionBlocks) {
            for (const l of fb.locals ?? []) delete l.maxLength;
          }
        }
        const result = compileProgram(archive);
        expect(result.errors.map((e) => e.message)).toEqual([]);

        const dir = path.join(tempDir, variant.replace(/ /g, "-"));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
        fs.writeFileSync(
          path.join(dir, "generated_debug.cpp"),
          result.debugTableCpp!,
        );
        fs.writeFileSync(path.join(dir, "main.cpp"), MAIN_CPP);
        const sources = (result.cppFiles ?? []).map((f) => {
          const fp = path.join(dir, f.name);
          fs.writeFileSync(fp, f.content);
          return `"${fp}"`;
        });

        const bin = path.join(dir, "nested-retain");
        execSync(
          `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE}" -I"${dir}" -o "${bin}" ` +
            `"${path.join(dir, "main.cpp")}" ` +
            `"${path.join(dir, "generated_debug.cpp")}" ${sources.join(" ")} 2>&1`,
          { encoding: "utf-8" },
        );
        expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe(
          "ALL_OK",
        );
      });
    }

    it("links against an archive built before the tables moved", () => {
      // Such an archive defines LIBREC's table in the header, so each TU has
      // its own copy: equal contents, not one address. The project's own
      // table (PLANT) is still defined once and nests a working copy.
      const result = compileProgram(asPreMoveArchive(buildLibrary()));
      expect(result.errors.map((e) => e.message)).toEqual([]);
      const dir = path.join(tempDir, "pre-move-archive");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "generated.hpp"), result.headerCode);
      fs.writeFileSync(
        path.join(dir, "generated_debug.cpp"),
        result.debugTableCpp!,
      );
      fs.writeFileSync(
        path.join(dir, "main.cpp"),
        `#include "generated.hpp"
#include <cstdio>
strucpp::Configuration_CONFIG0 g_config;
using namespace strucpp;
int main() {
  const TypeDesc& plant = PLANT__TYPEDESC;
  const TypeDesc* rec = plant.MEMBERS[1].NESTED;
  bool ok = plant.MEMBERCOUNT == 4 && rec != nullptr &&
            rec->MEMBERCOUNT == LIBREC__TYPEDESC.MEMBERCOUNT &&
            rec->SIZE == LIBREC__TYPEDESC.SIZE;
  std::printf(ok ? "ALL_OK\\n" : "FAIL\\n");
  return ok ? 0 : 1;
}
`,
      );
      const sources = (result.cppFiles ?? []).map((f) => {
        const fp = path.join(dir, f.name);
        fs.writeFileSync(fp, f.content);
        return `"${fp}"`;
      });
      const bin = path.join(dir, "pre-move");
      execSync(
        `g++ -std=${CXX_STD} -I"${RUNTIME_INCLUDE}" -I"${dir}" -o "${bin}" ` +
          `"${path.join(dir, "main.cpp")}" ` +
          `"${path.join(dir, "generated_debug.cpp")}" ${sources.join(" ")} 2>&1`,
        { encoding: "utf-8" },
      );
      expect(execSync(`"${bin}"`, { encoding: "utf-8" }).trim()).toBe("ALL_OK");
    });
  },
);
