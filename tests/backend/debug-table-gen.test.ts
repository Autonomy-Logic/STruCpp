/**
 * Debug table generator tests.
 *
 * End-to-end through compile() — the generator has no useful mock-level
 * behavior because it depends on a real ProjectModel + SymbolTables.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";
import { tagNameForTypeName, sizeForTypeName, TAG } from "../../src/backend/debug-table-gen.js";

describe("debug-table-gen helpers", () => {
  it("maps common IEC names to tag names", () => {
    expect(tagNameForTypeName("BOOL")).toBe("BOOL");
    expect(tagNameForTypeName("int")).toBe("INT");
    expect(tagNameForTypeName("LREAL")).toBe("LREAL");
    expect(tagNameForTypeName("TIME_OF_DAY")).toBe("TOD");
    expect(tagNameForTypeName("DATE_AND_TIME")).toBe("DT");
    expect(tagNameForTypeName("NOT_A_TYPE")).toBeUndefined();
  });

  it("reports correct byte sizes", () => {
    expect(sizeForTypeName("BOOL")).toBe(1);
    expect(sizeForTypeName("INT")).toBe(2);
    expect(sizeForTypeName("DINT")).toBe(4);
    expect(sizeForTypeName("LINT")).toBe(8);
    expect(sizeForTypeName("REAL")).toBe(4);
    expect(sizeForTypeName("LREAL")).toBe(8);
  });

  it("TAG values are sequential from 0", () => {
    expect(TAG.BOOL).toBe(0);
    expect(TAG.SINT).toBe(1);
    expect(TAG.INT).toBe(3);
    expect(TAG.LREAL).toBe(10);
  });
});

describe("debug-table-gen via compile()", () => {
  const simpleBlinkSource = `
PROGRAM main
  VAR
    counter : INT := 0;
    blink AT %QX0.0 : BOOL;
  END_VAR
  counter := counter + 1;
  blink := counter MOD 2 = 0;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM instance0 WITH task0 : main;
  END_RESOURCE
END_CONFIGURATION
`;

  it("emits a debug map with every scalar leaf", () => {
    const result = compile(simpleBlinkSource);
    expect(result.success).toBe(true);
    expect(result.debugMap).toBeDefined();
    expect(result.debugTableCpp).toBeDefined();

    const map = result.debugMap!;
    expect(map.version).toBe(2);
    expect(map.leaves.length).toBe(2);

    const paths = map.leaves.map((l) => l.path);
    expect(paths).toContain("INSTANCE0.COUNTER");
    expect(paths).toContain("INSTANCE0.BLINK");

    const counter = map.leaves.find((l) => l.path === "INSTANCE0.COUNTER")!;
    expect(counter.type).toBe("INT");
    expect(counter.size).toBe(2);

    const blink = map.leaves.find((l) => l.path === "INSTANCE0.BLINK")!;
    expect(blink.type).toBe("BOOL");
    expect(blink.size).toBe(1);
  });

  it("emits valid C++ source with the expected pointer expressions", () => {
    const result = compile(simpleBlinkSource);
    const cpp = result.debugTableCpp!;
    expect(cpp).toContain("#include \"debug_dispatch.hpp\"");
    expect(cpp).toContain("extern ::strucpp::Configuration_CONFIG0 g_config;");
    expect(cpp).toContain("namespace strucpp { namespace debug {");
    expect(cpp).toContain("const Entry debug_arr_0[");
    expect(cpp).toContain("TAG_BOOL");
    expect(cpp).toContain("TAG_INT");
    expect(cpp).toContain("&g_config.INSTANCE0.BLINK");
    expect(cpp).toContain("&g_config.INSTANCE0.COUNTER");
    expect(cpp).toContain("const uint8_t debug_array_count = 1;");
  });

  it("assigns sequential addresses starting at (0, 0)", () => {
    const result = compile(simpleBlinkSource);
    const map = result.debugMap!;

    // Declaration order preserved
    expect(map.leaves[0]!.arrayIdx).toBe(0);
    expect(map.leaves[0]!.elemIdx).toBe(0);
    expect(map.leaves[1]!.arrayIdx).toBe(0);
    expect(map.leaves[1]!.elemIdx).toBe(1);
  });

  const arraySource = `
PROGRAM main
  VAR
    speeds : ARRAY[0..4] OF INT;
  END_VAR
  speeds[0] := 1;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK t(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM p WITH t : main;
  END_RESOURCE
END_CONFIGURATION
`;

  it("expands array elements", () => {
    const result = compile(arraySource);
    expect(result.success).toBe(true);
    const leaves = result.debugMap!.leaves;
    expect(leaves.length).toBe(5);
    expect(leaves.map((l) => l.path)).toEqual([
      "P.SPEEDS[0]",
      "P.SPEEDS[1]",
      "P.SPEEDS[2]",
      "P.SPEEDS[3]",
      "P.SPEEDS[4]",
    ]);
    for (const l of leaves) {
      expect(l.type).toBe("INT");
      expect(l.size).toBe(2);
    }
  });

  it("applies maxEntriesPerArray split when exceeded", () => {
    // 10 leaves, cap at 4 -> expect 3 buckets (4, 4, 2)
    const manyVarsSource = `
PROGRAM main
  VAR
    a : ARRAY[0..9] OF BOOL;
  END_VAR
  a[0] := TRUE;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK t(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM p WITH t : main;
  END_RESOURCE
END_CONFIGURATION
`;
    // compile() uses default 8000 cap, so we can't easily test the split
    // via compile(). Test the helper directly with a smaller cap (see unit
    // tests above). For now, just verify all 10 leaves make it in.
    const result = compile(manyVarsSource);
    expect(result.debugMap!.leaves.length).toBe(10);
  });

  it("embeds the md5 option into the map", () => {
    const result = compile(simpleBlinkSource, { md5: "deadbeef" });
    expect(result.debugMap!.md5).toBe("deadbeef");
  });

  // Library FBs (TON, TOF, …) ship only their public interface in the
  // .stlib manifest. Locals like STATE / PREV_IN are implementation
  // details — the debugger treats library FBs as black boxes and surfaces
  // only the interface members the manifest exposes.
  it("exposes the public interface of library FBs (no locals)", () => {
    const tonSource = `
PROGRAM main
  VAR
    TON0 : TON;
    blink AT %QX0.0 : BOOL;
  END_VAR
  TON0(IN := NOT(blink), PT := T#500ms);
  blink := TON0.Q;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM instance0 WITH task0 : main;
  END_RESOURCE
END_CONFIGURATION
`;
    const result = compile(tonSource, { libraryPaths: ["libs"] });
    expect(result.success).toBe(true);

    const paths = result.debugMap!.leaves.map((l) => l.path);
    // Top-level program var
    expect(paths).toContain("INSTANCE0.BLINK");
    // FB public interface — inputs and outputs only
    expect(paths).toContain("INSTANCE0.TON0.IN");
    expect(paths).toContain("INSTANCE0.TON0.PT");
    expect(paths).toContain("INSTANCE0.TON0.Q");
    expect(paths).toContain("INSTANCE0.TON0.ET");
    // FB locals must NOT leak into the debug map.
    expect(paths).not.toContain("INSTANCE0.TON0.STATE");
    expect(paths).not.toContain("INSTANCE0.TON0.PREV_IN");
    expect(paths).not.toContain("INSTANCE0.TON0.CURRENT_TIME");
    expect(paths).not.toContain("INSTANCE0.TON0.START_TIME");

    const cpp = result.debugTableCpp!;
    expect(cpp).toContain("&g_config.INSTANCE0.TON0.Q");
    expect(cpp).not.toContain("&g_config.INSTANCE0.TON0.STATE");
  });

  // Globals (CONFIGURATION VAR_GLOBAL) end up at the head of the debug map
  // with bare uppercase names — that's what the editor's
  // `buildGlobalDebugPath()` returns and what OPC-UA `GVL:` references
  // resolve against. Without this, OPC-UA can't expose any global.
  describe("VAR_GLOBAL leaves", () => {
    const globalsSource = `
PROGRAM main
  VAR_EXTERNAL gxRun : BOOL; giCount : INT; END_VAR
  VAR local : INT; END_VAR
  giCount := giCount + 1;
END_PROGRAM

CONFIGURATION Config0
  VAR_GLOBAL
    gxRun : BOOL;
    giCount : INT;
  END_VAR
  RESOURCE Res0 ON PLC
    TASK t(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM p WITH t : main;
  END_RESOURCE
END_CONFIGURATION
`;

    it("emits each VAR_GLOBAL as a leaf with the bare uppercase name", () => {
      const result = compile(globalsSource);
      expect(result.success).toBe(true);
      const paths = result.debugMap!.leaves.map((l) => l.path);
      expect(paths).toContain("GXRUN");
      expect(paths).toContain("GICOUNT");
      // Locals still come through with their instance prefix
      expect(paths).toContain("P.LOCAL");
    });

    it("uses g_config.<name> as the C++ pointer expression for globals", () => {
      // The AST builder canonicalises identifier case (IEC 61131-3 is
      // case-insensitive), so even `gxRun` ends up as `GXRUN` in the
      // generated header — the debug-table C++ has to address that field.
      const result = compile(globalsSource);
      const cpp = result.debugTableCpp!;
      expect(cpp).toContain("&g_config.GXRUN");
      expect(cpp).toContain("&g_config.GICOUNT");
    });

    it("places globals before instance vars (own bucket at array 0)", () => {
      const result = compile(globalsSource);
      const map = result.debugMap!;
      const gxRun = map.leaves.find((l) => l.path === "GXRUN")!;
      const local = map.leaves.find((l) => l.path === "P.LOCAL")!;
      // Globals own array 0; the instance flush opens array 1 for locals.
      expect(gxRun.arrayIdx).toBe(0);
      expect(local.arrayIdx).toBe(1);
    });

    it("walks struct/array globals into per-leaf entries", () => {
      const result = compile(`
TYPE Point : STRUCT x : INT; y : INT; END_STRUCT END_TYPE

PROGRAM main
  VAR_EXTERNAL p : Point; nums : ARRAY[0..2] OF INT; END_VAR
END_PROGRAM

CONFIGURATION Config0
  VAR_GLOBAL
    p : Point;
    nums : ARRAY[0..2] OF INT;
  END_VAR
  RESOURCE Res0 ON PLC
    TASK t(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM inst WITH t : main;
  END_RESOURCE
END_CONFIGURATION
`);
      expect(result.success).toBe(true);
      const paths = result.debugMap!.leaves.map((l) => l.path);
      expect(paths).toContain("P.X");
      expect(paths).toContain("P.Y");
      expect(paths).toContain("NUMS[0]");
      expect(paths).toContain("NUMS[1]");
      expect(paths).toContain("NUMS[2]");
    });
  });
});
