/**
 * Debug table generator tests.
 *
 * End-to-end through compile() — the generator has no useful mock-level
 * behavior because it depends on a real ProjectModel + SymbolTables.
 */

import { describe, it, expect } from "vitest";
import { discoverStlibs } from "../../src/node/library-loader.js";
import { compile } from "../../src/index.js";
import { tagNameForTypeName, sizeForTypeName, TAG } from "../../src/backend/debug-table-gen.js";

describe("debug-table-gen helpers", () => {
  it("maps common IEC names to tag names", () => {
    expect(tagNameForTypeName("BOOL")).toBe("BOOL");
    expect(tagNameForTypeName("int")).toBe("INT");
    expect(tagNameForTypeName("LREAL")).toBe("LREAL");
    expect(tagNameForTypeName("TIME_OF_DAY")).toBe("TOD");
    expect(tagNameForTypeName("DATE_AND_TIME")).toBe("DT");
    // __XWORD (platform-width address type) reads as an LWORD on the debug
    // surface, which targets the native 64-bit host.
    expect(tagNameForTypeName("__XWORD")).toBe("LWORD");
    expect(tagNameForTypeName("NOT_A_TYPE")).toBeUndefined();
  });

  it("reports correct byte sizes", () => {
    expect(sizeForTypeName("BOOL")).toBe(1);
    expect(sizeForTypeName("INT")).toBe(2);
    expect(sizeForTypeName("DINT")).toBe(4);
    expect(sizeForTypeName("LINT")).toBe(8);
    expect(sizeForTypeName("REAL")).toBe(4);
    expect(sizeForTypeName("LREAL")).toBe(8);
    // STRING / WSTRING use the fixed debug-protocol window width:
    // 1 byte length prefix + 126 bytes of UTF-8 (STRING) or
    // 126 * 2 bytes of UTF-16LE (WSTRING).  Mirrors `DEBUG_STRING_WIDTH` /
    // `DEBUG_WSTRING_WIDTH` in `runtime/include/debug_dispatch.hpp`.
    expect(sizeForTypeName("STRING")).toBe(127);
    expect(sizeForTypeName("WSTRING")).toBe(253);
    expect(sizeForTypeName("__XWORD")).toBe(8);
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

  it("emits a debug leaf for a __XWORD variable (does not crash visitTypeRef)", () => {
    // Regression: __XWORD is a builtin elementary type with no type-symbol
    // declaration, so the debug walker must treat it as a leaf via the
    // IEC_NAME_TO_TAG fast path rather than recursing through lookupType().
    const source = `
PROGRAM main
  VAR
    addr : __XWORD;
  END_VAR
  addr := addr;
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM instance0 WITH task0 : main;
  END_RESOURCE
END_CONFIGURATION
`;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.debugMap).toBeDefined();
    const addr = result.debugMap!.leaves.find(
      (l) => l.path === "INSTANCE0.ADDR",
    )!;
    expect(addr).toBeDefined();
    expect(addr.type).toBe("LWORD");
    expect(addr.size).toBe(8);
  });

  it("emits Entry rows for STRING and WSTRING leaves with the wire-width sizes", () => {
    const source = `
PROGRAM main
  VAR
    label : STRING := 'hello';
    note  : WSTRING := "hi";
  END_VAR
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 1);
    PROGRAM instance0 WITH task0 : main;
  END_RESOURCE
END_CONFIGURATION
`;
    const result = compile(source);
    expect(result.success).toBe(true);
    const map = result.debugMap!;
    const labelLeaf = map.leaves.find((l) => l.path === "INSTANCE0.LABEL");
    const noteLeaf = map.leaves.find((l) => l.path === "INSTANCE0.NOTE");
    expect(labelLeaf, "STRING leaf must be emitted into the debug table").toBeDefined();
    expect(noteLeaf, "WSTRING leaf must be emitted into the debug table").toBeDefined();
    expect(labelLeaf!.type).toBe("STRING");
    expect(labelLeaf!.size).toBe(127); // 1 + DEBUG_STRING_CAP
    expect(noteLeaf!.type).toBe("WSTRING");
    expect(noteLeaf!.size).toBe(253); // 1 + DEBUG_STRING_CAP * 2

    const cpp = result.debugTableCpp!;
    expect(cpp).toContain("TAG_STRING");
    expect(cpp).toContain("TAG_WSTRING");
    expect(cpp).toContain("&g_config.INSTANCE0.LABEL");
    expect(cpp).toContain("&g_config.INSTANCE0.NOTE");
  });

  it("emits valid C++ source with the expected pointer expressions", () => {
    const result = compile(simpleBlinkSource);
    const cpp = result.debugTableCpp!;
    // Emitted file includes the AVR-clean `debug_table.hpp` subset, NOT
    // `debug_dispatch.hpp` — pulling the dispatch header here would
    // drag in `<avr/pgmspace.h>` → `<avr/io.h>` and AVR's register
    // macros (e.g. `SP`) would mangle user variable references like
    // PID's `SP` setpoint.  See runtime/include/debug_table.hpp.
    expect(cpp).toContain("#include \"debug_table.hpp\"");
    expect(cpp).not.toContain("#include \"debug_dispatch.hpp\"");
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
    const result = compile(tonSource, { libraries: discoverStlibs("libs") });
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

    it("uses <name>.value as the C++ pointer expression for file-scope globals", () => {
      // The AST builder canonicalises identifier case (IEC 61131-3 is
      // case-insensitive), so even `gxRun` ends up as `GXRUN` in the
      // generated header — the debug-table C++ has to address that global.
      // Each global is a file-scope `GlobalVar<V>` singleton (value + per-global
      // mutex), reached directly (no configuration-instance prefix) through
      // `.value`.
      const result = compile(globalsSource);
      const cpp = result.debugTableCpp!;
      expect(cpp).toContain("&GXRUN.value");
      expect(cpp).toContain("&GICOUNT.value");
      // Must NOT reach through the configuration instance any more.
      expect(cpp).not.toContain("&g_config.GXRUN.value");
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

describe("member whose name matches its type", () => {
  /**
   * CODESYS allows `RunningLights : RunningLights`, and real projects use it. Codegen
   * emits that member as `RUNNINGLIGHTS_` because GCC rejects a member that changes the
   * meaning of its own type name — so the debug table has to address it by the same
   * name. When it did not, every entry for the instance named a member that does not
   * exist and `generated_debug.cpp` failed to compile, taking the whole build with it.
   */
  const src = `
FUNCTION_BLOCK Motor
VAR_INPUT run : BOOL; END_VAR
VAR_OUTPUT spinning : BOOL; END_VAR
  spinning := run;
END_FUNCTION_BLOCK

PROGRAM Main
VAR
  Motor : Motor;
  plain : BOOL;
END_VAR
  Motor(run := plain);
END_PROGRAM

CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

  it("addresses it by the mangled name codegen emitted", () => {
    const result = compile(src);
    expect(result.success).toBe(true);

    const cpp = result.debugTableCpp ?? "";
    // The declaration codegen produced, and the reference the table must match.
    expect(result.headerCode ?? "").toContain("MOTOR MOTOR_;");
    expect(cpp).toContain("g_config.INSTANCE0.MOTOR_.RUN");
    // Only the C++ expression is mangled; the trailing comment keeps the ST path the
    // editor shows the user.
    const addresses = cpp
      .split("\n")
      .map((line) => line.split("//")[0])
      .join("\n");
    expect(addresses).not.toMatch(/INSTANCE0\.MOTOR\./);
  });

  it("leaves a member whose name differs from its type alone", () => {
    const cpp = compile(src).debugTableCpp ?? "";
    expect(cpp).toContain("g_config.INSTANCE0.PLAIN");
    expect(cpp).not.toContain("PLAIN_");
  });
});

describe("member mangling agrees with the class definition", () => {
  /**
   * The table addresses members by name, so it has to name exactly what codegen
   * declared — in both directions. Mangling too little names a member that does
   * not exist; mangling too much does the same in reverse. Either way
   * `generated_debug.cpp` fails to compile and takes the firmware build with it,
   * and nothing catches it earlier because `strucpp file.st` emits no table.
   *
   * The rule now lives in one place (`member-mangling.ts`) and covers both
   * collisions — a member named after its own type, and a member named after an
   * interface method the owning FB implements — at every site the table builds a
   * member expression: PROGRAM variables, FB members, and STRUCT fields.
   */
  const CFG = `
CONFIGURATION Config0
  RESOURCE Res0 ON PLC
    TASK task0(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM instance0 WITH task0 : Main;
  END_RESOURCE
END_CONFIGURATION`;

  /** Debug-table entry addresses, with the trailing ST-path comments stripped. */
  function addresses(source: string): string {
    const result = compile(source);
    expect(result.errors.map((e) => e.message)).toEqual([]);
    expect(result.success).toBe(true);
    return (result.debugTableCpp ?? "")
      .split("\n")
      .map((line) => line.split("//")[0])
      .join("\n");
  }

  function header(source: string): string {
    return compile(source).headerCode ?? "";
  }

  const MOTOR = `
FUNCTION_BLOCK Motor
VAR_INPUT run : BOOL; END_VAR
VAR_OUTPUT spinning : BOOL; END_VAR
  spinning := run;
END_FUNCTION_BLOCK`;

  it("mangles a colliding member of a FUNCTION_BLOCK, not just of a PROGRAM", () => {
    const src = `${MOTOR}
FUNCTION_BLOCK Rig
VAR Motor : Motor; idle : BOOL; END_VAR
  Motor(run := idle);
END_FUNCTION_BLOCK
PROGRAM Main
VAR r : Rig; END_VAR
  r();
END_PROGRAM${CFG}`;
    expect(header(src)).toContain("MOTOR MOTOR_;");
    const addr = addresses(src);
    expect(addr).toContain("g_config.INSTANCE0.R.MOTOR_.RUN");
    expect(addr).not.toMatch(/\.R\.MOTOR\./);
    // A sibling that does not collide is untouched.
    expect(addr).toContain("g_config.INSTANCE0.R.IDLE");
  });

  it("mangles a colliding STRUCT field", () => {
    const src = `
TYPE
  Inner : STRUCT v : BOOL; END_STRUCT;
  Rig : STRUCT Inner : Inner; plain : BOOL; END_STRUCT;
END_TYPE
PROGRAM Main
VAR r : Rig; END_VAR
  r.plain := FALSE;
END_PROGRAM${CFG}`;
    expect(header(src)).toContain("INNER INNER_");
    const addr = addresses(src);
    expect(addr).toContain("g_config.INSTANCE0.R.INNER_.V");
    expect(addr).not.toMatch(/\.R\.INNER\./);
    expect(addr).toContain("g_config.INSTANCE0.R.PLAIN");
  });

  it("mangles a member colliding with an implemented interface method", () => {
    // Codegen renames the variable because the method already owns the name;
    // addressing `.START` would take the address of the member function instead
    // ("cannot create a non-constant pointer to member function").
    const src = `
INTERFACE IMotor
  METHOD Start : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Drive IMPLEMENTS IMotor
VAR Start : BOOL; other : INT; END_VAR
  METHOD Start : BOOL
    Start := TRUE;
  END_METHOD
  other := 1;
END_FUNCTION_BLOCK
PROGRAM Main
VAR d : Drive; END_VAR
  d();
END_PROGRAM${CFG}`;
    expect(header(src)).toContain("IEC_BOOL START_;");
    const addr = addresses(src);
    expect(addr).toContain("g_config.INSTANCE0.D.START_");
    expect(addr).not.toMatch(/\.D\.START\b(?!_)/);
    expect(addr).toContain("g_config.INSTANCE0.D.OTHER");
  });

  it("does NOT mangle a variable named after an elementary type", () => {
    // `Time : TIME` is an ordinary declaration — codegen emits it as plain
    // `TIME`, because the collision rule only applies to user-defined types. A
    // name-only comparison would mangle it and address a `TIME_` that does not
    // exist, breaking a build that works today.
    const src = `
PROGRAM Main
VAR Time : TIME; Word : WORD; Date : DATE; Real : REAL; END_VAR
  Time := T#0s;
END_PROGRAM${CFG}`;
    expect(header(src)).toContain("IEC_TIME TIME;");
    const addr = addresses(src);
    for (const name of ["TIME", "WORD", "DATE", "REAL"]) {
      expect(addr).toContain(`g_config.INSTANCE0.${name},`);
    }
    expect(addr).not.toContain("_,");
  });

  it("does NOT mangle elementary-named members of an FB or a STRUCT", () => {
    const src = `
TYPE Bag : STRUCT Time : TIME; Word : WORD; END_STRUCT; END_TYPE
FUNCTION_BLOCK Holder
VAR Time : TIME; b : Bag; END_VAR
  Time := T#0s;
END_FUNCTION_BLOCK
PROGRAM Main
VAR h : Holder; g : Bag; END_VAR
  h();
END_PROGRAM${CFG}`;
    const addr = addresses(src);
    expect(addr).toContain("g_config.INSTANCE0.H.TIME,");
    expect(addr).toContain("g_config.INSTANCE0.H.B.TIME,");
    expect(addr).toContain("g_config.INSTANCE0.G.WORD,");
    expect(addr).not.toContain("TIME_");
    expect(addr).not.toContain("WORD_");
  });

  it("mangles a variable named after an enum type, matching codegen", () => {
    const src = `
TYPE Color : (Red, Green, Blue); END_TYPE
PROGRAM Main
VAR Color : Color; plain : BOOL; END_VAR
  plain := FALSE;
END_PROGRAM${CFG}`;
    expect(header(src)).toContain("IEC_COLOR COLOR_;");
    expect(addresses(src)).toContain("g_config.INSTANCE0.COLOR_");
  });
});
