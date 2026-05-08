/**
 * Tests for CODESYS library import functionality.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { resolve } from "path";
import {
  importCodesysLibrary,
  detectFormat,
  parseV23Library,
  isV23Library,
  parseV3Library,
  parseStringTable,
  readLEB128,
  formatPOU,
  pouToSources,
} from "../../dist/library/codesys-import/index.js";
import type { ExtractedPOU } from "../../dist/library/codesys-import/index.js";

// Path to CODESYS library fixtures checked into the repository.
// The V3 .library file is the canonical source for the bundled OSCAT
// stlib too (see libs/sources/oscat-basic/), so we point at that copy
// to avoid duplicating a 1.2 MB binary blob between fixtures/ and libs/.
const FIXTURES_DIR = resolve(__dirname, "../fixtures/codesys");
const OSCAT_V23_PATH = resolve(FIXTURES_DIR, "oscat_basic_335.lib");
const OSCAT_V3_PATH = resolve(
  __dirname,
  "../../libs/sources/oscat-basic/oscat_basic_335.library",
);
const V23_REFERENCE_DIR = resolve(FIXTURES_DIR, "v23-reference");

describe("detectFormat", () => {
  it("detects V2.3 format from CoDeSys+ magic", () => {
    const data = Buffer.from("CoDeSys+" + "\x00".repeat(100), "ascii");
    expect(detectFormat(data)).toBe("v23");
  });

  it("detects V3 format from ZIP magic (PK header)", () => {
    const data = Buffer.alloc(100);
    data[0] = 0x50; // P
    data[1] = 0x4b; // K
    data[2] = 0x03;
    data[3] = 0x04;
    expect(detectFormat(data)).toBe("v3");
  });

  it("returns null for unknown format", () => {
    const data = Buffer.from("UNKNOWN_FORMAT", "ascii");
    expect(detectFormat(data)).toBeNull();
  });
});

describe("isV23Library", () => {
  it("returns true for valid V2.3 header", () => {
    const data = Buffer.from("CoDeSys+" + "\x00".repeat(10), "ascii");
    expect(isV23Library(data)).toBe(true);
  });

  it("returns false for short buffer", () => {
    const data = Buffer.from("CoDe");
    expect(isV23Library(data)).toBe(false);
  });

  it("returns false for wrong magic", () => {
    const data = Buffer.from("NotCoDeSys", "ascii");
    expect(isV23Library(data)).toBe(false);
  });
});

describe("readLEB128", () => {
  it("decodes single-byte values (< 128)", () => {
    const buf = Buffer.from([42]);
    const [value, offset] = readLEB128(buf, 0);
    expect(value).toBe(42);
    expect(offset).toBe(1);
  });

  it("decodes multi-byte values (>= 128)", () => {
    // 300 = 0b100101100 → LEB128: 0xAC 0x02
    const buf = Buffer.from([0xac, 0x02]);
    const [value, offset] = readLEB128(buf, 0);
    expect(value).toBe(300);
    expect(offset).toBe(2);
  });

  it("decodes zero", () => {
    const buf = Buffer.from([0]);
    const [value, offset] = readLEB128(buf, 0);
    expect(value).toBe(0);
    expect(offset).toBe(1);
  });

  it("decodes from non-zero offset", () => {
    const buf = Buffer.from([0xff, 42, 0xff]);
    const [value, offset] = readLEB128(buf, 1);
    expect(value).toBe(42);
    expect(offset).toBe(2);
  });
});

describe("parseStringTable", () => {
  it("parses a minimal valid string table", () => {
    // Build: magic(2) + flag(1) + guidLen(1) + guid(4) + entry(idx=1, len=5, "hello")
    const magic = Buffer.from([0xfa, 0x53]);
    const flag = Buffer.from([0x00]);
    const guidLen = Buffer.from([0x04]);
    const guid = Buffer.from("TEST", "ascii");
    // Entry: idx=1 (1 byte), length=5 (1 byte), "hello" (5 bytes)
    const entry = Buffer.from([0x01, 0x05, ...Buffer.from("hello", "utf-8")]);
    const data = Buffer.concat([magic, flag, guidLen, guid, entry]);

    const result = parseStringTable(data);
    expect(result.guid).toBe("TEST");
    expect(result.strings.size).toBe(1);
    expect(result.strings.get(1)).toBe("hello");
  });

  it("throws on invalid magic", () => {
    const data = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(() => parseStringTable(data)).toThrow("Invalid string table magic");
  });
});

describe("formatPOU", () => {
  it("formats a FUNCTION with declaration and implementation", () => {
    const pou: ExtractedPOU = {
      type: "FUNCTION",
      name: "ADD_TWO",
      declaration:
        "FUNCTION ADD_TWO : INT\r\nVAR_INPUT\r\n\tA : INT;\r\n\tB : INT;\r\nEND_VAR",
      implementation: "ADD_TWO := A + B;",
      offset: 0,
    };
    const result = formatPOU(pou);
    expect(result).toContain("FUNCTION ADD_TWO : INT");
    expect(result).toContain("ADD_TWO := A + B;");
    expect(result).toContain("END_FUNCTION");
    // Line endings normalized
    expect(result).not.toContain("\r\n");
  });

  it("formats a FUNCTION_BLOCK with END_FUNCTION_BLOCK", () => {
    const pou: ExtractedPOU = {
      type: "FUNCTION_BLOCK",
      name: "MY_FB",
      declaration: "FUNCTION_BLOCK MY_FB\nVAR_INPUT\n\tX : BOOL;\nEND_VAR",
      implementation: "Q := X;",
      offset: 0,
    };
    const result = formatPOU(pou);
    expect(result).toContain("END_FUNCTION_BLOCK");
  });

  it("formats TYPE declarations without adding END marker", () => {
    const pou: ExtractedPOU = {
      type: "TYPE",
      name: "MY_STRUCT",
      declaration:
        "TYPE MY_STRUCT :\nSTRUCT\n\tX : INT;\n\tY : INT;\nEND_STRUCT\nEND_TYPE",
      implementation: "",
      offset: 0,
    };
    const result = formatPOU(pou);
    expect(result).toContain("END_TYPE");
    // Should NOT add another END_TYPE
    expect(result.match(/END_TYPE/g)?.length).toBe(1);
  });

  it("formats GVL declarations without adding END marker", () => {
    const pou: ExtractedPOU = {
      type: "GVL",
      name: "GVL_0",
      declaration: "VAR_GLOBAL CONSTANT\n\tX : INT := 42;\nEND_VAR",
      implementation: "",
      offset: 0,
    };
    const result = formatPOU(pou);
    expect(result).toContain("END_VAR");
    expect(result).not.toContain("END_GVL");
  });
});

describe("pouToSources", () => {
  it("generates correct filenames for different POU types", () => {
    const pous: ExtractedPOU[] = [
      {
        type: "FUNCTION",
        name: "MyFunc",
        declaration: "FUNCTION MyFunc : INT",
        implementation: "",
        offset: 0,
      },
      {
        type: "GVL",
        name: "GVL_0",
        declaration: "VAR_GLOBAL\nEND_VAR",
        implementation: "",
        offset: 100,
      },
    ];
    const sources = pouToSources(pous);
    expect(sources).toHaveLength(2);
    expect(sources[0]!.fileName).toBe("MyFunc.st");
    expect(sources[1]!.fileName).toBe("GVL_0.gvl.st");
  });
});

describe("parseV23Library", () => {
  it("returns warning for non-V2.3 data", () => {
    const data = Buffer.from("NOT_CODESYS_FORMAT", "ascii");
    const result = parseV23Library(data);
    expect(result.pous).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Not a CODESYS V2.3 library");
  });
});

describe("importCodesysLibrary", () => {
  it("returns error for non-existent file", () => {
    const result = importCodesysLibrary("/tmp/nonexistent.lib");
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Cannot read file");
  });

  it("returns error for unrecognized format", () => {
    const tmpPath = "/tmp/test_garbage.lib";
    writeFileSync(tmpPath, "GARBAGE_DATA_NOT_CODESYS");
    try {
      const result = importCodesysLibrary(tmpPath);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("Unrecognized file format");
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

// ============================================================
// V2.3 Integration Tests (OSCAT binary fixtures in repo)
// ============================================================
describe("V2.3 integration: OSCAT Basic 335", () => {
  it("extracts POUs from real .lib file", () => {
    const data = readFileSync(OSCAT_V23_PATH);
    const { pous, warnings } = parseV23Library(data);

    // OSCAT Basic 335 should have ~555 items
    expect(pous.length).toBeGreaterThan(500);
    expect(pous.length).toBeLessThan(700);

    // Count by type
    const counts: Record<string, number> = {};
    for (const p of pous) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }

    // Should have functions, FBs, types, and GVLs
    expect(counts["FUNCTION"]).toBeGreaterThan(300);
    expect(counts["FUNCTION_BLOCK"]).toBeGreaterThan(100);
    expect(counts["TYPE"]).toBeGreaterThan(10);
    expect(counts["GVL"]).toBeGreaterThan(0);

    // Verify a known function
    const acosh = pous.find((p) => p.name === "ACOSH");
    expect(acosh).toBeDefined();
    expect(acosh!.type).toBe("FUNCTION");
    expect(acosh!.declaration).toContain("FUNCTION ACOSH");
    expect(acosh!.declaration).toContain("REAL");
    expect(acosh!.implementation).toContain("LN");
  });

  it("importCodesysLibrary produces valid sources", () => {
    const result = importCodesysLibrary(OSCAT_V23_PATH);
    expect(result.success).toBe(true);
    expect(result.metadata.format).toBe("v23");
    expect(result.metadata.pouCount).toBeGreaterThan(500);
    expect(result.sources.length).toBeGreaterThan(500);

    // Every source should have a fileName and non-empty source
    for (const src of result.sources) {
      expect(src.fileName).toBeTruthy();
      expect(src.source.length).toBeGreaterThan(0);
    }

    // Check a specific known function
    const acoshSrc = result.sources.find((s) => s.fileName === "ACOSH.st");
    expect(acoshSrc).toBeDefined();
    expect(acoshSrc!.source).toContain("FUNCTION ACOSH");
    expect(acoshSrc!.source).toContain("END_FUNCTION");
  });

  it("extracted source matches reference files", () => {
    const result = importCodesysLibrary(OSCAT_V23_PATH);
    expect(result.success).toBe(true);

    const testNames = ["ACOSH", "ALARM_2", "DAY_OF_YEAR", "FT_AVG"];
    for (const name of testNames) {
      const refPath = resolve(V23_REFERENCE_DIR, `${name}.st`);
      const expected = readFileSync(refPath, "utf-8");
      const actual = result.sources.find((s) => s.fileName === `${name}.st`);
      expect(actual, `Missing ${name}.st`).toBeDefined();
      // Normalize for comparison
      const normExpected = expected.replace(/\r\n/g, "\n").trim();
      const normActual = actual!.source.trim();
      expect(normActual).toBe(normExpected);
    }
  });
});

// ============================================================
// V3 Integration Tests (OSCAT binary fixtures in repo)
// ============================================================
describe("V3 integration: OSCAT Basic 335", () => {
  it("detects V3 format from real .library file", () => {
    const data = readFileSync(OSCAT_V3_PATH);
    expect(detectFormat(data)).toBe("v3");
  });

  it("extracts POUs from real .library file", () => {
    const data = readFileSync(OSCAT_V3_PATH);
    const { pous, guid, warnings } = parseV3Library(data);

    // Should extract a library GUID
    expect(guid).toBeTruthy();
    expect(guid).toContain("-"); // UUID format

    // OSCAT Basic 335 should have ~560 items
    expect(pous.length).toBeGreaterThan(500);
    expect(pous.length).toBeLessThan(700);

    // Count by type
    const counts: Record<string, number> = {};
    for (const p of pous) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }

    // Should have functions, FBs, and types
    expect(counts["FUNCTION"]).toBeGreaterThan(300);
    expect(counts["FUNCTION_BLOCK"]).toBeGreaterThan(100);
    expect(counts["TYPE"]).toBeGreaterThan(10);

    // Verify VAR_INPUT/VAR_OUTPUT are properly preserved (not plain VAR)
    const alarm2 = pous.find((p) => p.name === "ALARM_2");
    expect(alarm2).toBeDefined();
    expect(alarm2!.declaration).toContain("VAR_INPUT");
    expect(alarm2!.declaration).toContain("VAR_OUTPUT");
    expect(alarm2!.declaration).toContain("VAR\n");

    // Verify TYPE declarations have proper headers
    const calendar = pous.find((p) => p.name === "CALENDAR");
    expect(calendar).toBeDefined();
    expect(calendar!.declaration).toMatch(/^TYPE CALENDAR/);
    expect(calendar!.declaration).toContain("STRUCT");
  });

  it("importCodesysLibrary produces valid V3 result", () => {
    const result = importCodesysLibrary(OSCAT_V3_PATH);
    expect(result.success).toBe(true);
    expect(result.metadata.format).toBe("v3");
    expect(result.metadata.guid).toBeTruthy();
    expect(result.metadata.pouCount).toBeGreaterThan(500);
    expect(result.sources.length).toBeGreaterThan(500);

    // Every source should have a fileName and non-empty source
    for (const src of result.sources) {
      expect(src.fileName).toBeTruthy();
      expect(src.source.length).toBeGreaterThan(0);
    }

    // Check that known FBs are present with correct type
    const alarm2 = result.sources.find((s) => s.fileName === "ALARM_2.st");
    expect(alarm2).toBeDefined();
    expect(alarm2!.source).toContain("FUNCTION_BLOCK ALARM_2");
    expect(alarm2!.source).toContain("END_FUNCTION_BLOCK");

    // Check that known functions are present
    const acosh = result.sources.find((s) => s.fileName === "ACOSH.st");
    expect(acosh).toBeDefined();
    expect(acosh!.source).toContain("FUNCTION ACOSH : REAL");
    expect(acosh!.source).toContain("END_FUNCTION");

    // Check that types are present
    const constLang = result.sources.find(
      (s) => s.fileName === "CONSTANTS_LANGUAGE.st",
    );
    expect(constLang).toBeDefined();
    expect(constLang!.source).toContain("TYPE CONSTANTS_LANGUAGE");
  });

  it("extracts the OSCAT VAR_GLOBAL block instantiating CONSTANTS_*", () => {
    // The V3 .library encodes a GVL the same way as a POU at the
    // structural level — header in column B of a 4-varint record,
    // body lines in column A of subsequent records — but with the
    // keyword `VAR_GLOBAL` (optionally CONSTANT/RETAIN/PERSISTENT)
    // instead of `FUNCTION_BLOCK`/`FUNCTION`/`PROGRAM`/`TYPE`.
    // Earlier the header-detection regex only matched the latter four
    // and dropped GVLs silently, leaving POUs that reference
    // `LANGUAGE.WEEKDAYS[…]` (HOLIDAY / SUN_POS / the date helpers)
    // with undeclared globals downstream. This test pins the GVL
    // extraction so a regex regression surfaces here.
    const result = importCodesysLibrary(OSCAT_V3_PATH);
    const gvls = result.sources.filter((s) => /\bVAR_GLOBAL\b/.test(s.source));
    expect(gvls.length).toBeGreaterThanOrEqual(1);

    // OSCAT-specific: at least one GVL must declare the five CONSTANTS_*
    // instances. Without these, HOLIDAY/SUN_POS et al. would compile-fail.
    const constantsGvl = gvls.find((s) =>
      /MATH\s*:\s*CONSTANTS_MATH/.test(s.source) &&
      /LANGUAGE\s*:\s*CONSTANTS_LANGUAGE/.test(s.source) &&
      /LOCATION\s*:\s*CONSTANTS_LOCATION/.test(s.source),
    );
    expect(constantsGvl, "Expected a GVL declaring MATH/LANGUAGE/LOCATION instances").toBeDefined();
    expect(constantsGvl!.source).toMatch(/PHYS\s*:\s*CONSTANTS_PHYS/);
    expect(constantsGvl!.source).toMatch(/SETUP\s*:\s*CONSTANTS_SETUP/);
    expect(constantsGvl!.source).toMatch(/END_VAR/);
  });

  it("promotes the OSCAT VAR_GLOBAL CONSTANT integers to globalConstants", () => {
    // OSCAT's compile-time integer constants live in a `VAR_GLOBAL
    // CONSTANT` block in the V3 source. They must be surfaced on the
    // import result's `globalConstants` map (not as a runtime GVL),
    // because downstream the strucpp codegen uses values like
    // STRING_LENGTH as C++ template parameters (`IECStringVar<STRING_LENGTH>`),
    // which require a constexpr — a runtime GVL can't satisfy that.
    // The originating GVL is dropped from the source list to avoid a
    // duplicate definition when compileStlib also sees globalConstants.
    const result = importCodesysLibrary(OSCAT_V3_PATH);
    expect(result.globalConstants.STRING_LENGTH).toBeTypeOf("number");
    expect(result.globalConstants.LIST_LENGTH).toBeTypeOf("number");
    const constGvl = result.sources.find((s) =>
      /\bVAR_GLOBAL\s+CONSTANT\b/.test(s.source) &&
      /\bSTRING_LENGTH\b/.test(s.source),
    );
    expect(
      constGvl,
      "VAR_GLOBAL CONSTANT block should not appear as a source — it should have been promoted to globalConstants",
    ).toBeUndefined();
  });

  it("extracts the OSCAT folder hierarchy from .meta files", () => {
    // OSCAT's V3 .library encodes its project-explorer tree
    // (POUs/Time&Date, POUs/Buffer Management, Data types, …) as
    // .meta+.object pairs whose .meta carries a parent-folder GUID.
    // The importer walks that chain and surfaces a slash-separated
    // `category` on each ExtractedPOU; the well-known POUs below pin
    // the resolved paths against CODESYS's own UI placement.
    const result = importCodesysLibrary(OSCAT_V3_PATH);
    const expected: Record<string, string> = {
      "DCF77.st": "POUs/Time&Date",
      "HOLIDAY.st": "POUs/Time&Date",
      "UTC_TO_LTIME.st": "POUs/Time&Date",
      "BUFFER_COMP.st": "POUs/Buffer Management",
      "ACOSH.st": "POUs/Mathematical",
      "COMPLEX.st": "Data types",
      "CRC_GEN.st": "POUs/Logic/Others",
    };
    for (const [fileName, category] of Object.entries(expected)) {
      const src = result.sources.find((s) => s.fileName === fileName);
      expect(src, `${fileName} extracted`).toBeDefined();
      expect(src!.category).toBe(category);
    }
    // Spot-check distribution: the largest folders should hold dozens
    // of POUs, well above the noise floor of "everything at root".
    const counts = new Map<string, number>();
    for (const s of result.sources) {
      const c = s.category ?? "<root>";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(counts.get("POUs/String") ?? 0).toBeGreaterThanOrEqual(50);
    expect(counts.get("POUs/Mathematical") ?? 0).toBeGreaterThanOrEqual(50);
    expect(counts.get("POUs/Time&Date") ?? 0).toBeGreaterThanOrEqual(40);
  });

  it("structurally extracts documentation from the V3 decl-section slot", () => {
    // CODESYS reserves a specific slot for each POU's documentation: the
    // records of the decl sub-object that come AFTER the last END_VAR (or
    // END_TYPE) of the variables-pane. Body comments live in the impl
    // sub-object so they can never bleed into this slot, and inline
    // variable annotations like `(* Laufvariable Stack *)` sit BEFORE
    // the last END_VAR so they can never shadow the doc either.
    //
    // We assert here that the V3 importer attaches the right
    // `documentation` to each ExtractedPOU directly — without going
    // through any text-level regex or trigger-word heuristic.
    const result = importCodesysLibrary(OSCAT_V3_PATH);
    const pous = result.sources;
    expect(pous.length).toBeGreaterThan(550);

    // Coverage: every POU whose V3 source has a comment in the doc slot
    // gets that comment as `documentation`. OSCAT's only no-doc POUs are
    // GVL_0 (the constants-only block dropped by the parser) and a
    // handful of trivial TYPEs (FRACTION etc.) with no trailing comment.
    const docCount = pous.filter((p) => p.documentation).length;
    expect(docCount).toBeGreaterThan(550);

    // Pin the structure of a known FB doc: the slot has version,
    // programmer, tested by, then a description. The opening `(*` and
    // closing `*)` are stripped — only the inner text comes through.
    const dcf = pous.find((p) => p.fileName === "DCF77.st");
    expect(dcf?.documentation).toBeTypeOf("string");
    expect(dcf?.documentation).not.toMatch(/\(\*/); // wrapper stripped
    expect(dcf?.documentation).not.toMatch(/\*\)\s*$/); // wrapper stripped
    expect(dcf?.documentation).toMatch(/version\s+1\.10/);
    expect(dcf?.documentation).toMatch(/decoder for a DCF77 signal/);

    // FT_Profile (mixed-case source name → uppercase manifest name).
    // Pinning this catches a lookup regression where the doc map used
    // raw source-text casing instead of normalizing to upper-case.
    const ft = pous.find((p) => p.fileName === "FT_Profile.st");
    expect(ft?.documentation).toMatch(/FT_Profile generates an output/);

    // Body comments are NOT documentation — even when they happen to
    // contain trigger-shaped words, the V3 record split keeps body
    // comments out of the decl-section slot. We verify by picking a
    // POU whose body has a `(* … *)` block (BUFFER_COMP starts with
    // `(* search for first character match *)` immediately in its
    // implementation) and asserting that comment doesn't appear in
    // the documentation field.
    const buf = pous.find((p) => p.fileName === "BUFFER_COMP.st");
    expect(buf?.source).toMatch(/\(\* search for first character match \*\)/);
    expect(buf?.documentation).toBeTypeOf("string");
    expect(buf?.documentation).not.toMatch(/search for first character match/);
  });

  it("compiled OSCAT manifest carries V3-extracted documentation", () => {
    // End-to-end: structural extraction at the importer surfaces all
    // the way through the compileStlib pipeline onto manifest entries
    // (functions / functionBlocks / types).
    const archive = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../libs/oscat-basic.stlib"),
        "utf-8",
      ),
    );
    const fns: Array<{ documentation?: string }> = archive.manifest.functions;
    const fbs: Array<{ documentation?: string }> =
      archive.manifest.functionBlocks;
    const types: Array<{ documentation?: string }> = archive.manifest.types;

    // FBs and FUNCTIONs all have docs (their slot is always populated).
    expect(fbs.filter((f) => f.documentation).length).toBe(fbs.length);
    expect(fns.filter((f) => f.documentation).length).toBe(fns.length);
    // TYPEs: most have a revision-history comment in the slot; only a
    // small handful (e.g. FRACTION) ship without any trailing comment.
    // Just assert "at least most have it" — we don't pin the exact
    // count to avoid coupling to OSCAT's specific TYPE inventory.
    expect(types.filter((t) => t.documentation).length).toBeGreaterThanOrEqual(
      types.length - 2,
    );
  });

  it("V2.3 import leaves category undefined (no folders in V2.3 format)", () => {
    // V2.3 .lib predates the folder feature — the format has no place
    // to record one. Asserting "no categories" pins this so a future
    // V2.3 parser change can't silently start emitting them.
    const result = importCodesysLibrary(OSCAT_V23_PATH);
    const categorized = result.sources.filter((s) => s.category);
    expect(categorized.length).toBe(0);
  });

  it("V3 POU counts are comparable to V2.3 extraction", () => {
    const v23Result = importCodesysLibrary(OSCAT_V23_PATH);
    const v3Result = importCodesysLibrary(OSCAT_V3_PATH);

    // Both should succeed
    expect(v23Result.success).toBe(true);
    expect(v3Result.success).toBe(true);

    // V3 typically extracts slightly more POUs (some extras like TOF_1, TP_1, etc.)
    // but the core counts should be similar
    const v23fn = v23Result.metadata.counts["FUNCTION"] ?? 0;
    const v3fn = v3Result.metadata.counts["FUNCTION"] ?? 0;
    expect(v3fn).toBe(v23fn); // Functions should match exactly

    const v23fb = v23Result.metadata.counts["FUNCTION_BLOCK"] ?? 0;
    const v3fb = v3Result.metadata.counts["FUNCTION_BLOCK"] ?? 0;
    // V3 has a few more FBs (TOF_1, TP_1, etc.)
    expect(v3fb).toBeGreaterThanOrEqual(v23fb);
    expect(v3fb).toBeLessThan(v23fb + 20);

    const v23types = v23Result.metadata.counts["TYPE"] ?? 0;
    const v3types = v3Result.metadata.counts["TYPE"] ?? 0;
    expect(v3types).toBe(v23types); // Types should match exactly
  });

  it("V3 import preserves variable direction", () => {
    const data = readFileSync(OSCAT_V3_PATH);
    const { pous } = parseV3Library(data);

    // FT_Profile has VAR_INPUT, VAR_INPUT CONSTANT, VAR_OUTPUT, and VAR
    const ftProfile = pous.find((p) => p.name === "FT_Profile");
    expect(ftProfile).toBeDefined();
    expect(ftProfile!.declaration).toContain("VAR_INPUT\n");
    expect(ftProfile!.declaration).toContain("VAR_INPUT CONSTANT");
    expect(ftProfile!.declaration).toContain("VAR_OUTPUT");
    expect(ftProfile!.declaration).toContain("VAR\n");

    // ACOSH is a FUNCTION with VAR_INPUT and VAR
    const acosh = pous.find((p) => p.name === "ACOSH");
    expect(acosh).toBeDefined();
    expect(acosh!.declaration).toContain("FUNCTION ACOSH : REAL");
  });
});

// ============================================================
// CLI Integration Test (end-to-end --import-lib)
// ============================================================
describe("CLI --import-lib", () => {
  it("shows extraction summary for V2.3 file", () => {
    try {
      const output = execFileSync(
        "node",
        [
          "dist/cli.js",
          "--import-lib",
          OSCAT_V23_PATH,
          "-o",
          "/tmp/stlib_cli_test/",
          "--lib-name",
          "oscat-cli-test",
          "-L",
          "libs/",
          "-D",
          "STRING_LENGTH=256",
          "-D",
          "LIST_LENGTH=100",
        ],
        { encoding: "utf-8", timeout: 120000 },
      );
      // Should show extraction summary even if compilation fails
      // (OSCAT uses POINTER TO which STruC++ doesn't support yet)
      expect(output).toContain("Format: CODESYS V2.3");
      expect(output).toContain("Extracted 555 items");
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string };
      const combined = (execErr.stdout ?? "") + (execErr.stderr ?? "");
      // Compilation may fail for OSCAT, but extraction should still work
      expect(combined).toContain("Format: CODESYS V2.3");
      expect(combined).toContain("Extracted 555 items");
    }
  });
});
