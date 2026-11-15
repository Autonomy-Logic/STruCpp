// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Instance paths and globals in POUs marked `{attribute 'instance_paths'}`: resolution, types and every error.
 */
import { describe, it, expect } from "vitest";
import { analyze, compile, walkAST } from "../../src/index.js";
import type {
  CompileOptions,
  VariableExpression,
  ASTNode,
} from "../../src/index.js";

const DECLS = `
TYPE Point : STRUCT x : DINT; y : DINT; END_STRUCT; END_TYPE
FUNCTION_BLOCK MyTimer VAR_INPUT IN : BOOL; END_VAR VAR_OUTPUT Q : BOOL; END_VAR Q := IN; END_FUNCTION_BLOCK
TYPE GVL_T : STRUCT Output1 : INT; Flag : BOOL; END_STRUCT; END_TYPE
VAR_GLOBAL GVL : GVL_T; END_VAR
VAR_GLOBAL CONSTANT MAXN : INT := 4; END_VAR
PROGRAM Main
VAR
  Run : BOOL;
  Speed : INT;
  Name : STRING[20];
  Levels : ARRAY[0..3] OF REAL;
  Pos : Point;
  Flags : WORD;
  t : MyTimer;
END_VAR
VAR CONSTANT Limit : INT := 9; END_VAR
VAR_TEMP scratch : INT; END_VAR
VAR_EXTERNAL gCount : INT; END_VAR
END_PROGRAM
PROGRAM Mixer
VAR Run : BOOL; END_VAR
END_PROGRAM
`;

const CONFIG = `
CONFIGURATION Config0
VAR_GLOBAL gCount : INT; Setpoint : REAL; END_VAR
VAR_GLOBAL CONSTANT gLimit : INT := 3; END_VAR
RESOURCE Res0 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH t : Main;
  PROGRAM mix0 WITH t : Mixer;
END_RESOURCE
END_CONFIGURATION
`;

/** A marked function block with `body` as its body and `vars` as its local declarations. */
function screen(body: string, vars = "x : INT; b : BOOL; r : REAL;"): string {
  return `{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR ${vars} END_VAR
${body}
END_FUNCTION_BLOCK
`;
}

function messages(
  source: string,
  options: Partial<CompileOptions> = {},
): string[] {
  return analyze(source, options).errors.map((e) => e.message);
}

function pathsIn(source: string): VariableExpression[] {
  const result = analyze(source);
  expect(result.errors).toEqual([]);
  const out: VariableExpression[] = [];
  walkAST(result.ast as ASTNode, (node) => {
    if (node.kind === "VariableExpression") {
      const expr = node as VariableExpression;
      if (expr.instancePath !== undefined) out.push(expr);
    }
  });
  return out;
}

describe("instance paths: resolution", () => {
  it("resolves the short and the long form to the program variable's type", () => {
    const paths = pathsIn(
      DECLS +
        screen(
          "x := instance0.Main.Speed; Config0.Res0.instance0.Main.Run := TRUE;",
        ) +
        CONFIG,
    );
    expect(paths.map((p) => p.instancePath?.path)).toEqual([
      "CONFIG0.RES0.INSTANCE0.MAIN.SPEED",
      "CONFIG0.RES0.INSTANCE0.MAIN.RUN",
    ]);
    expect(paths.map((p) => p.resolvedType?.typeKind)).toEqual([
      "elementary",
      "elementary",
    ]);
    expect(paths[0]?.instancePath?.consumed).toBe(2);
    expect(paths[1]?.instancePath?.consumed).toBe(4);
  });

  it("is case-insensitive", () => {
    const paths = pathsIn(
      DECLS +
        screen(
          "x := INSTANCE0.main.speed; b := config0.RES0.Instance0.MAIN.run;",
        ) +
        CONFIG,
    );
    expect(paths.map((p) => p.instancePath?.path)).toEqual([
      "CONFIG0.RES0.INSTANCE0.MAIN.SPEED",
      "CONFIG0.RES0.INSTANCE0.MAIN.RUN",
    ]);
  });

  it("types fields, constant indices and bits along the path", () => {
    const result = analyze(
      DECLS +
        screen(
          "r := instance0.Main.Levels[2]; x := instance0.Main.Pos.y; b := instance0.Main.Flags.3; b := instance0.Main.t.Q;",
        ) +
        CONFIG,
    );
    expect(result.errors).toEqual([]);
  });

  it("works in IF conditions, in methods and as assignment targets", () => {
    const source =
      DECLS +
      `{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR x : INT; END_VAR
METHOD Step : INT
  IF instance0.Main.Run THEN
    instance0.Main.Speed := instance0.Main.Speed + 1;
  END_IF;
  Step := instance0.Main.Speed;
END_METHOD
x := Step();
END_FUNCTION_BLOCK
` +
      CONFIG;
    expect(messages(source)).toEqual([]);
  });

  it("lets a local of the same name shadow an instance", () => {
    const source =
      DECLS +
      screen("x := instance0.Speed;", "x : INT; instance0 : Main;") +
      CONFIG;
    expect(messages(source)).toEqual([]);
    expect(pathsIn(source)).toEqual([]);
  });

  it("reaches configuration globals by bare name and by the long form, and top-level globals", () => {
    const paths = pathsIn(
      DECLS +
        screen(
          "gCount := gCount + 1; Config0.Setpoint := 1.5; GVL.Output1 := x;",
        ) +
        CONFIG,
    );
    expect(
      paths.map((p) => [p.instancePath?.kind, p.instancePath?.path]),
    ).toEqual([
      ["global", "CONFIG0.GCOUNT"],
      ["global", "CONFIG0.GCOUNT"],
      ["global", "CONFIG0.SETPOINT"],
      ["global", "GVL.OUTPUT1"],
    ]);
  });
});

describe("instance paths: errors", () => {
  it("reports an instance the resource does not declare (long form)", () => {
    expect(
      messages(DECLS + screen("x := Config0.Res0.nope.Main.Speed;") + CONFIG),
    ).toEqual([
      "Resource 'CONFIG0.RES0' has no program instance named 'NOPE'.",
    ]);
  });

  it("reports an unknown instance in the short form", () => {
    expect(messages(DECLS + screen("x := nope.Main.Speed;") + CONFIG)).toEqual([
      "No program instance named 'NOPE' is declared in a configuration.",
    ]);
  });

  it("reports an unknown resource or global of a configuration", () => {
    expect(
      messages(
        DECLS + screen("x := Config0.Res9.instance0.Main.Speed;") + CONFIG,
      ),
    ).toEqual([
      "Configuration 'CONFIG0' has no resource or global named 'RES9'.",
    ]);
  });

  it("reports a program type that is not the instance's", () => {
    expect(messages(DECLS + screen("b := mix0.Main.Run;") + CONFIG)).toEqual([
      "MIX0 is an instance of 'MIXER', not 'MAIN'.",
    ]);
  });

  it("reports an unknown variable of the program", () => {
    expect(
      messages(DECLS + screen("x := instance0.Main.Nope;") + CONFIG),
    ).toEqual(["Program 'MAIN' has no variable 'NOPE'."]);
  });

  it("reports the error over the whole path, its end one past the last character", () => {
    const source = DECLS + screen("x := instance0.Main.Nope;") + CONFIG;
    const lines = source.split("\n");
    const line = lines.findIndex((l) => l.includes("instance0.Main.Nope")) + 1;
    const column = lines[line - 1].indexOf("instance0") + 1;
    for (const result of [analyze(source), compile(source)]) {
      expect(result.errors).toMatchObject([
        {
          line,
          column,
          endLine: line,
          endColumn: column + "instance0.Main.Nope".length,
        },
      ]);
    }
  });

  it("reports an unknown field along the path", () => {
    expect(
      messages(DECLS + screen("x := instance0.Main.Pos.z;") + CONFIG),
    ).toEqual(["'POINT' has no member 'Z'"]);
  });

  it("refuses variables that are not a program's persistent state", () => {
    expect(
      messages(DECLS + screen("x := instance0.Main.scratch;") + CONFIG),
    ).toEqual([
      "'SCRATCH' of program 'MAIN' is declared in VAR_TEMP; an instance path reaches only VAR, VAR_INPUT and VAR_OUTPUT variables.",
    ]);
  });

  it("reports an incomplete path", () => {
    expect(messages(DECLS + screen("x := instance0.Main;") + CONFIG)).toEqual([
      "Incomplete instance path 'INSTANCE0.MAIN': expected 'INSTANCE0.<program type>.<variable>'.",
    ]);
  });

  it("reports a short form that is ambiguous across resources", () => {
    const twoResources = `
CONFIGURATION Config0
RESOURCE Res0 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH t : Main;
END_RESOURCE
RESOURCE Res1 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH t : Main;
END_RESOURCE
END_CONFIGURATION
`;
    const source = DECLS.replace("VAR_EXTERNAL gCount : INT; END_VAR", "");
    expect(
      messages(source + screen("x := instance0.Main.Speed;") + twoResources),
    ).toEqual([
      "Program instance 'INSTANCE0' is declared in more than one resource ('CONFIG0.RES0', 'CONFIG0.RES1'); use the long form '<configuration>.<resource>.INSTANCE0.MAIN.SPEED'.",
    ]);
    expect(
      messages(
        source +
          screen("x := Config0.Res1.instance0.Main.Speed;") +
          twoResources,
      ),
    ).toEqual([]);
  });

  it("refuses a write to a CONSTANT", () => {
    expect(
      messages(DECLS + screen("instance0.Main.Limit := 1;") + CONFIG),
    ).toEqual(["Cannot assign to 'INSTANCE0.MAIN.LIMIT': it is a CONSTANT."]);
    expect(messages(DECLS + screen("gLimit := 1;") + CONFIG)).toEqual([
      "Cannot assign to 'GLIMIT': it is a CONSTANT.",
    ]);
  });

  it("keeps the existing errors in a POU without the attribute", () => {
    const unmarked = (body: string): string =>
      `FUNCTION_BLOCK Plain VAR x : INT; END_VAR ${body} END_FUNCTION_BLOCK`;
    expect(
      messages(DECLS + unmarked("x := instance0.Main.Speed;") + CONFIG),
    ).toEqual(["Undeclared variable 'INSTANCE0'"]);
    expect(messages(DECLS + unmarked("x := Main.Speed;") + CONFIG)).toEqual([
      "Cannot access members of program 'MAIN' directly — declare a variable of type 'MAIN' first.",
    ]);
    expect(messages(DECLS + unmarked("x := gCount;") + CONFIG)).toEqual([
      "Undeclared variable 'GCOUNT'",
    ]);
  });

  it("keeps the program-type error in a marked POU", () => {
    expect(messages(DECLS + screen("x := Main.Speed;") + CONFIG)).toEqual([
      "Cannot access members of program 'MAIN' directly — declare a variable of type 'MAIN' first.",
    ]);
  });

  it("refuses a configuration other than the first in the default mode", () => {
    const second = `
CONFIGURATION Config1
RESOURCE Res0 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM other WITH t : Mixer;
END_RESOURCE
END_CONFIGURATION
`;
    expect(
      messages(DECLS + screen("b := other.Mixer.Run;") + CONFIG + second),
    ).toEqual([
      "Instance path 'OTHER.MIXER.RUN' names configuration 'CONFIG1'; without externalInstancePaths only the first configuration ('CONFIG0') is reachable.",
    ]);
    expect(
      messages(DECLS + screen("b := other.Mixer.Run;") + CONFIG + second, {
        externalInstancePaths: true,
      }),
    ).toEqual([]);
  });
});

describe("instance paths: external mode rules", () => {
  const external = (body: string, vars?: string): string[] =>
    messages(DECLS + screen(body, vars) + CONFIG, {
      externalInstancePaths: true,
    });

  it("accepts elementary and string leaves, constant indices and bits", () => {
    expect(
      external(
        "r := instance0.Main.Levels[MAXN - 1 - 1]; instance0.Main.Name := 'a'; b := instance0.Main.Flags.3; b := instance0.Main.t.Q;",
      ),
    ).toEqual([
      "'INSTANCE0.MAIN.LEVELS[...]' cannot be accessed with externalInstancePaths: it uses a non-constant array index.",
    ]);
    expect(
      external(
        "r := instance0.Main.Levels[2]; instance0.Main.Name := 'a'; b := instance0.Main.Flags.3; b := instance0.Main.t.Q;",
      ),
    ).toEqual([]);
  });

  it("refuses a path that ends at a structure, an array or a function block", () => {
    const ends = (p: string, what: string): string =>
      `'${p}' ends at ${what}; with externalInstancePaths a path must end at an elementary or STRING value.`;
    expect(
      external(
        "instance0.Main.Pos.x := instance0.Main.Pos.y; p := instance0.Main.Pos;",
        "p : Point;",
      ),
    ).toEqual([ends("INSTANCE0.MAIN.POS", "a structure")]);
    expect(
      external("a := instance0.Main.Levels;", "a : ARRAY[0..3] OF REAL;"),
    ).toEqual([ends("INSTANCE0.MAIN.LEVELS", "an array")]);
    expect(external("tt := instance0.Main.t;", "tt : MyTimer;")).toEqual([
      ends("INSTANCE0.MAIN.T", "a function block instance"),
    ]);
  });

  it("refuses a dynamic index", () => {
    expect(external("r := instance0.Main.Levels[x];")).toEqual([
      "'INSTANCE0.MAIN.LEVELS[...]' cannot be accessed with externalInstancePaths: it uses a non-constant array index.",
    ]);
  });

  it("refuses address and reference uses", () => {
    const msg = (p: string): string =>
      `'${p}' cannot be used by address or reference (ADR, REF, REF=, VAR_IN_OUT, REFERENCE TO) with externalInstancePaths.`;
    expect(
      external("p := ADR(instance0.Main.Speed);", "p : POINTER TO INT;"),
    ).toEqual([msg("INSTANCE0.MAIN.SPEED")]);
    expect(external("p REF= gCount;", "p : REFERENCE TO INT;")).toEqual([
      msg("GCOUNT"),
    ]);
  });

  it("refuses a VAR_IN_OUT argument", () => {
    const source =
      DECLS +
      `FUNCTION Twice : INT VAR_IN_OUT v : INT; END_VAR v := v * 2; Twice := v; END_FUNCTION
` +
      screen("x := Twice(v := instance0.Main.Speed);") +
      CONFIG;
    expect(messages(source, { externalInstancePaths: true })).toEqual([
      "'INSTANCE0.MAIN.SPEED' cannot be used by address or reference (ADR, REF, REF=, VAR_IN_OUT, REFERENCE TO) with externalInstancePaths.",
    ]);
    expect(messages(source)).toEqual([]);
  });

  it("refuses binding an output to a path", () => {
    expect(
      external(
        "timer(IN := TRUE, Q => instance0.Main.Run);",
        "timer : MyTimer;",
      ),
    ).toEqual([
      "'INSTANCE0.MAIN.RUN' cannot be bound to an output ('=>') with externalInstancePaths; assign it in a separate statement.",
    ]);
  });

  it("refuses a bit of a value that has no bits", () => {
    const source =
      DECLS.replace("Flags : WORD;", "Flags : WORD; Ratio : REAL;") +
      screen("b := instance0.Main.Ratio.1;") +
      CONFIG;
    expect(
      messages(source, { externalInstancePaths: true }).some((m) =>
        m.includes("INSTANCE0.MAIN.RATIO.1"),
      ),
    ).toBe(true);
  });

  it("refuses globals in unmarked POUs and VAR_EXTERNAL outside programs", () => {
    const source =
      DECLS +
      `FUNCTION_BLOCK Plain
VAR_EXTERNAL gCount : INT; END_VAR
VAR x : INT; END_VAR
x := GVL.Output1 + MAXN;
END_FUNCTION_BLOCK
` +
      CONFIG;
    expect(messages(source, { externalInstancePaths: true })).toEqual([
      "Global 'GVL' is not emitted with externalInstancePaths; use it from a POU marked {attribute 'instance_paths'}.",
      "VAR_EXTERNAL in 'PLAIN' is not supported with externalInstancePaths, which does not emit globals; in a POU marked {attribute 'instance_paths'} use the global by name.",
    ]);
    expect(messages(source)).toEqual([]);
  });
});

describe("instance paths: compile result", () => {
  it("lists each distinct path once with its type, length and access", () => {
    const result = compile(
      DECLS +
        screen(
          "x := instance0.Main.Speed; instance0.Main.Speed := x; instance0.Main.Name := 'a'; b := instance0.Main.Flags.3; Config0.gCount := 1; x := GVL.Output1;",
        ) +
        CONFIG,
      { externalInstancePaths: true },
    );
    expect(result.errors).toEqual([]);
    expect(result.instancePaths).toEqual([
      {
        id: 0,
        kind: "instance",
        path: "CONFIG0.RES0.INSTANCE0.MAIN.SPEED",
        type: "INT",
        read: true,
        written: true,
      },
      {
        id: 1,
        kind: "instance",
        path: "CONFIG0.RES0.INSTANCE0.MAIN.NAME",
        type: "STRING",
        maxLength: 20,
        read: false,
        written: true,
      },
      {
        id: 2,
        kind: "instance",
        path: "CONFIG0.RES0.INSTANCE0.MAIN.FLAGS",
        type: "WORD",
        read: true,
        written: false,
      },
      {
        id: 3,
        kind: "global",
        path: "CONFIG0.GCOUNT",
        type: "INT",
        read: false,
        written: true,
      },
      {
        id: 4,
        kind: "global",
        path: "GVL.OUTPUT1",
        type: "INT",
        read: true,
        written: false,
      },
    ]);
  });

  it("is absent without externalInstancePaths", () => {
    const result = compile(
      DECLS + screen("x := instance0.Main.Speed;") + CONFIG,
    );
    expect(result.errors).toEqual([]);
    expect(result.instancePaths).toBeUndefined();
  });
});
