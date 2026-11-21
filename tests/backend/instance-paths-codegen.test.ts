// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Code generated for instance paths and for the globals of `instance_paths` POUs, in the default mode and with
 * `externalInstancePaths`.
 */
import { describe, it, expect } from "vitest";
import { analyze, compile, walkAST } from "../../src/index.js";
import type {
  ASTNode,
  CompileOptions,
  CompileResult,
  VariableExpression,
} from "../../src/index.js";
import { CodeGenerator } from "../../src/backend/codegen.js";

const SOURCE = `
TYPE GVL_T : STRUCT Output1 : INT; END_STRUCT; END_TYPE
VAR_GLOBAL GVL : GVL_T; END_VAR
VAR_GLOBAL CONSTANT MAXN : INT := 4; END_VAR
TYPE Point : STRUCT y : DINT; END_STRUCT; END_TYPE
PROGRAM Main
VAR
  Run : BOOL;
  Speed : INT;
  Name : STRING[20];
  Levels : ARRAY[0..3] OF REAL;
  Pos : Point;
  Flags : WORD;
END_VAR
Speed := Speed + 1;
END_PROGRAM
{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR x : INT; s : STRING[20]; b : BOOL; END_VAR
x := instance0.Main.Speed + MAXN;
Config0.Res0.instance0.Main.Speed := x;
s := instance0.Main.Name;
instance0.Main.Name := 'hi';
instance0.Main.Levels[1] := 2.5;
instance0.Main.Pos.y := 3;
b := instance0.Main.Flags.2;
instance0.Main.Flags.3 := b;
gCount := gCount + 1;
GVL.Output1 := x;
END_FUNCTION_BLOCK
CONFIGURATION Config0
VAR_GLOBAL gCount : INT; END_VAR
RESOURCE Res0 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH t : Main;
END_RESOURCE
END_CONFIGURATION
`;

function build(options: Partial<CompileOptions> = {}): CompileResult {
  const result = compile(SOURCE, options);
  expect(result.errors).toEqual([]);
  return result;
}

function screenBody(result: CompileResult): string {
  const file = result.cppFiles.find((f) => f.name === "pou_SCREEN.cpp");
  return file?.content ?? "";
}

describe("instance paths: default mode", () => {
  const result = build();
  const body = screenBody(result);

  it("reaches the instance through the configuration object", () => {
    expect(body).toContain("X = ::g_config.INSTANCE0.SPEED + MAXN;");
    expect(body).toContain("::g_config.INSTANCE0.SPEED = X;");
    expect(body).toContain('::g_config.INSTANCE0.NAME = "hi";');
    expect(body).toContain("::g_config.INSTANCE0.LEVELS.at(1) = 2.5f;");
    expect(body).toContain("::g_config.INSTANCE0.POS.Y = 3;");
    expect(body).toContain(
      "B = ((static_cast<uint64_t>(::g_config.INSTANCE0.FLAGS) >> 2) & 1);",
    );
  });

  it("declares the configuration object after the unit's namespace", () => {
    const header = result.headerCode;
    expect(header).toContain(
      "}  // namespace strucpp\n\nextern ::strucpp::Configuration_CONFIG0 g_config;",
    );
    expect(header).not.toContain("iec_external.hpp");
  });

  it("reaches a configuration global under its lock and a top-level global directly", () => {
    expect(body).toContain("GCOUNT.write(GCOUNT.read() + 1);");
    expect(body).not.toContain("GCOUNT.value");
    expect(body).toContain("GVL.OUTPUT1 = X;");
  });

  it("still emits the programs, the configuration and the debug table", () => {
    expect(result.headerCode).toContain("class Program_MAIN");
    expect(result.headerCode).toContain("class Configuration_CONFIG0");
    expect(result.debugTableCpp).toBeDefined();
  });

  it("declares no configuration object when no instance path is used", () => {
    const plain = compile(
      SOURCE.replace(
        /\{attribute 'instance_paths'\}[\s\S]*END_FUNCTION_BLOCK/,
        "",
      ),
    );
    expect(plain.errors).toEqual([]);
    expect(plain.headerCode).not.toContain(
      "extern ::strucpp::Configuration_CONFIG0 g_config;",
    );
  });
});

describe("instance paths: external mode", () => {
  const result = build({ externalInstancePaths: true, namespace: "hmi" });
  const body = screenBody(result);

  it("reads through external_read and writes through external_write", () => {
    expect(body).toContain("X = strucpp::external_read<IEC_INT>(0) + MAXN;");
    expect(body).toContain("strucpp::external_write<IEC_INT>(0, X);");
    expect(body).toContain("S = strucpp::external_read<IECStringVar<20>>(1);");
    expect(body).toContain(
      'strucpp::external_write<IECStringVar<20>>(1, "hi");',
    );
    expect(body).toContain("strucpp::external_write<IEC_REAL>(2, 2.5f);");
    expect(body).toContain("strucpp::external_write<IEC_DINT>(3, 3);");
  });

  it("reads a bit from the whole value and writes it back merged", () => {
    expect(body).toContain(
      "B = ((static_cast<uint64_t>(strucpp::external_read<IEC_WORD>(4)) >> 2) & 1);",
    );
    expect(body).toContain(
      "strucpp::external_write<IEC_WORD>(4, static_cast<WORD_t>((static_cast<uint64_t>(strucpp::external_read<IEC_WORD>(4)) & ~(1ULL << 3)) | ((B ? 1ULL : 0ULL) << 3)));",
    );
  });

  it("reads then writes a global incremented in place", () => {
    expect(body).toContain(
      "strucpp::external_write<IEC_INT>(5, strucpp::external_read<IEC_INT>(5) + 1);",
    );
    expect(body).toContain("strucpp::external_write<IEC_INT>(6, X);");
  });

  it("includes the header and emits neither programs, configuration nor globals", () => {
    const header = result.headerCode;
    expect(header).toContain('#include "iec_external.hpp"');
    expect(header).not.toContain("class Program_MAIN :");
    expect(header).not.toContain("class Configuration_CONFIG0 :");
    expect(header).not.toContain("GlobalVar<IEC_INT> GCOUNT");
    expect(header).not.toContain("inline GVL_T GVL");
    expect(header).toContain(
      "inline IEC_INT MAXN = 4;".replace("inline", "const inline"),
    );
    expect(header).not.toContain("g_config");
    expect(result.cppFiles.map((f) => f.name)).not.toContain("pou_MAIN.cpp");
    expect(result.debugTableCpp).toBeUndefined();
    expect(result.debugMap).toBeUndefined();
  });

  it("maps every id to its path", () => {
    expect(result.instancePaths?.map((e) => [e.id, e.path])).toEqual([
      [0, "CONFIG0.RES0.INSTANCE0.MAIN.SPEED"],
      [1, "CONFIG0.RES0.INSTANCE0.MAIN.NAME"],
      [2, "CONFIG0.RES0.INSTANCE0.MAIN.LEVELS[1]"],
      [3, "CONFIG0.RES0.INSTANCE0.MAIN.POS.Y"],
      [4, "CONFIG0.RES0.INSTANCE0.MAIN.FLAGS"],
      [5, "CONFIG0.GCOUNT"],
      [6, "GVL.OUTPUT1"],
    ]);
  });
});

describe("external mode without any path", () => {
  it("includes the header all the same, so the unit's headers do not depend on its code", () => {
    const result = compile(
      "FUNCTION_BLOCK Plain VAR x : INT; END_VAR x := x + 1; END_FUNCTION_BLOCK",
      { externalInstancePaths: true },
    );
    expect(result.errors).toEqual([]);
    expect(result.headerCode).toContain('#include "iec_external.hpp"');
    expect(result.instancePaths).toEqual([]);
  });
});

describe("external mode without an id", () => {
  it("refuses to generate an instance path or a configuration global that has none", () => {
    for (const target of ["instance", "global"] as const) {
      const analyzed = analyze(SOURCE, { externalInstancePaths: true });
      expect(analyzed.errors).toEqual([]);
      const ast = analyzed.ast;
      if (ast === undefined) throw new Error("no AST");
      walkAST(ast as ASTNode, (node) => {
        const ref = (node as VariableExpression).instancePath;
        if (node.kind === "VariableExpression" && ref?.kind === target)
          ref.id = -1;
      });
      const codegen = new CodeGenerator(analyzed.symbolTables, {
        externalInstancePaths: true,
      });
      expect(() => codegen.generate(ast)).toThrow(
        target === "instance"
          ? "Internal error: 'CONFIG0.RES0.INSTANCE0.MAIN.SPEED' has no external id with externalInstancePaths."
          : "Internal error: 'CONFIG0.GCOUNT' has no external id with externalInstancePaths.",
      );
    }
  });
});

describe("configuration globals in the default mode", () => {
  const LOCKED = `
TYPE Pt : STRUCT x : INT; y : INT; END_STRUCT; END_TYPE
FUNCTION Twice : INT VAR_IN_OUT v : INT; END_VAR v := v * 2; Twice := v; END_FUNCTION
FUNCTION_BLOCK Fb VAR_INPUT i : BOOL; END_VAR VAR_OUTPUT q : BOOL; END_VAR VAR_IN_OUT io : INT; END_VAR q := i; io := io + 1; END_FUNCTION_BLOCK
PROGRAM Main VAR x : INT; END_VAR x := x + 1; END_PROGRAM
{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR n : INT; f : Fb; pt : Pt; b : BOOL; END_VAR
n := gCount; gCount := n + 1; Config0.gCount := 3;
b := gW.3; gW.4 := TRUE;
pt := gP; gP := pt; gP.x := 5; n := gP.y;
f(i := gB, q => gB, io := gCount);
n := Twice(gCount);
END_FUNCTION_BLOCK
CONFIGURATION Config0
VAR_GLOBAL gCount : INT; gB : BOOL; gP : Pt; gW : WORD; END_VAR
RESOURCE Res0 ON PLC TASK t(INTERVAL := T#20ms, PRIORITY := 1); PROGRAM instance0 WITH t : Main; END_RESOURCE
END_CONFIGURATION
`;

  it("reads and writes them as VAR_EXTERNAL does: read/write for scalars, with_lock for bits and composites", () => {
    const result = compile(LOCKED);
    expect(result.errors).toEqual([]);
    const lines = screenBody(result)
      .split("\n")
      .map((l) => l.trim());
    const start = lines.indexOf("N = GCOUNT.read();");
    expect(lines.slice(start, start + 19)).toEqual([
      "N = GCOUNT.read();",
      "GCOUNT.write(N + 1);",
      "GCOUNT.write(3);",
      "B = GW.with_lock([&](auto* __glk){ return ((static_cast<uint64_t>((*__glk)) >> 3) & 1); });",
      "auto __gwv_0 = true;",
      "GW.with_lock([&](auto* __glk){ (*__glk) = ((*__glk) & ~(1ULL << 4)) | ((__gwv_0 ? 1ULL : 0ULL) << 4); });",
      "PT_ = GP.with_lock([&](auto* __glk){ return (*__glk); });",
      "auto __gwv_1 = PT_;",
      "GP.with_lock([&](auto* __glk){ (*__glk) = __gwv_1; });",
      "auto __gwv_2 = 5;",
      "GP.with_lock([&](auto* __glk){ (*__glk).X = __gwv_2; });",
      "N = GP.with_lock([&](auto* __glk){ return (*__glk).Y; });",
      "F.I = GB.read();",
      "F.IO = GCOUNT.read();",
      "F();",
      "F.ENO = true;",
      "GCOUNT.write(F.IO);",
      "GB.write(F.Q);",
      "N = TWICE(GCOUNT.value);",
    ]);
  });
});
