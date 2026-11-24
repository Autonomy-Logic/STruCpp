// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
import { describe, it, expect } from "vitest";
import { analyze } from "strucpp";
import { getCompletions } from "../../server/src/completion.js";
import { getHover } from "../../server/src/hover.js";
import { toLspDiagnostics } from "../../server/src/diagnostics.js";
import type { AnalysisResult } from "strucpp";

function getDiagnostics(
  analysis: AnalysisResult,
  file: string,
): ReturnType<typeof toLspDiagnostics> {
  return toLspDiagnostics(analysis.errors, analysis.warnings, file);
}

const SOURCE = `TYPE Point : STRUCT x : INT; y : INT; END_STRUCT; END_TYPE
PROGRAM Main
VAR
  Run : BOOL;
  Speed : INT;
  Pos : Point;
END_VAR
VAR_TEMP scratch : INT; END_VAR
END_PROGRAM
{attribute 'instance_paths'}
FUNCTION_BLOCK Screen
VAR v : INT; END_VAR
METHOD Step
  v := instance0.Main.Speed;
END_METHOD
v := instance0.Main.Speed;
v := Config0.Res0.instance0.Main.Pos.y;
v := Config0.gCount;
v := gCount;
END_FUNCTION_BLOCK
FUNCTION_BLOCK Plain
VAR v : INT; END_VAR
v := 1;
END_FUNCTION_BLOCK
CONFIGURATION Config0
VAR_GLOBAL gCount : INT; END_VAR
RESOURCE Res0 ON PLC
  TASK t(INTERVAL := T#20ms, PRIORITY := 1);
  PROGRAM instance0 WITH t : Main;
END_RESOURCE
END_CONFIGURATION
`;

const FILE = "screen.st";
const LINES = SOURCE.split("\n");

/** 1-indexed position just after the `nth` occurrence of `text` on its line. */
function after(text: string, nth = 1): { line: number; col: number } {
  let seen = 0;
  for (let i = 0; i < LINES.length; i++) {
    const idx = LINES[i].indexOf(text);
    if (idx >= 0 && ++seen === nth)
      return { line: i + 1, col: idx + text.length + 1 };
  }
  throw new Error(`"${text}" not found`);
}

/** 1-indexed position of the start of `text`. */
function at(text: string): { line: number; col: number } {
  const pos = after(text);
  return { line: pos.line, col: pos.col - text.length };
}

function labelsAfter(text: string, nth = 1): string[] {
  const analysis = analyze(SOURCE, { fileName: FILE });
  const pos = after(text, nth);
  return getCompletions(analysis, FILE, pos.line, pos.col, SOURCE).map((i) =>
    i.label.toUpperCase(),
  );
}

describe("instance paths in the language server", () => {
  it("analyzes the marked block without diagnostics", () => {
    const analysis = analyze(SOURCE, { fileName: FILE });
    expect(getDiagnostics(analysis, FILE)).toEqual([]);
  });

  it("completes the program type after an instance", () => {
    expect(labelsAfter("v := instance0.", 2)).toEqual(["MAIN"]);
  });

  it("completes the program's reachable variables after instance.Program", () => {
    expect(labelsAfter("v := instance0.Main.", 2).sort()).toEqual([
      "POS",
      "RUN",
      "SPEED",
    ]);
  });

  it("completes resources and globals after a configuration, then instances", () => {
    expect(labelsAfter("v := Config0.").sort()).toEqual(["GCOUNT", "RES0"]);
    expect(labelsAfter("v := Config0.Res0.")).toEqual(["INSTANCE0"]);
    expect(labelsAfter("v := Config0.Res0.instance0.")).toEqual(["MAIN"]);
  });

  it("completes the members of what the path reaches", () => {
    expect(labelsAfter("v := Config0.Res0.instance0.Main.Pos.").sort()).toEqual(
      ["X", "Y"],
    );
  });

  it("completes inside a method of the marked block", () => {
    expect(labelsAfter("v := instance0.Main.", 1).sort()).toEqual([
      "POS",
      "RUN",
      "SPEED",
    ]);
  });

  it("offers nothing for a path in a POU without the attribute", () => {
    const source = SOURCE.replace("v := 1;", "v := instance0.");
    const analysis = analyze(SOURCE, { fileName: FILE });
    const line =
      source.split("\n").findIndex((l) => l === "v := instance0.") + 1;
    const items = getCompletions(
      analysis,
      FILE,
      line,
      "v := instance0.".length + 1,
      source,
    );
    expect(items.map((i) => i.label.toUpperCase())).not.toContain("MAIN");
  });

  it("shows the canonical path and type on hover", () => {
    const analysis = analyze(SOURCE, { fileName: FILE });
    const pos = at("Config0.Res0.instance0.Main.Pos.y");
    const hover = getHover(
      analysis,
      FILE,
      pos.line,
      pos.col,
      undefined,
      SOURCE,
    );
    const value =
      (hover?.contents as { value: string } | undefined)?.value ?? "";
    expect(value).toContain("CONFIG0.RES0.INSTANCE0.MAIN.POS.Y");
    expect(value).toContain(": INT");
  });

  it("reports path errors as diagnostics", () => {
    const source = SOURCE.replace(
      "v := Config0.gCount;",
      "v := instance0.Mixer.Run;",
    );
    const analysis = analyze(source, { fileName: FILE });
    const messages = getDiagnostics(analysis, FILE).map((d) => d.message);
    expect(messages).toEqual([
      "INSTANCE0 is an instance of 'MAIN', not 'MIXER'.",
    ]);
  });
});
