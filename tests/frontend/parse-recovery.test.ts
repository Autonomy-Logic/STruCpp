// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
import { describe, expect, it } from "vitest";

import { parse } from "../../src/index.js";

const BROKEN = `FUNCTION_BLOCK Overview EXTENDS HmiScreen
  VAR
    {attribute 'hmi_main'}
    Title : HmiLabel := (Text := 'Plant', Size := 15);
    Pump1 : HmiPump := (X := 40, Y := 20);
  END_VAR
  Title.Text := ;
  IF Pump1.Clicked THEN
END_FUNCTION_BLOCK
PROGRAM Other VAR a : INT; END_VAR a := 1; END_PROGRAM`;

describe("parse with recovery", () => {
  it("returns no AST for source with syntax errors by default", () => {
    const result = parse(BROKEN);
    expect(result.ast).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns the recovered AST with the errors when asked", () => {
    const result = parse(BROKEN, { recover: true });
    expect(result.errors.map((e) => e.line)).toEqual([7, 9]);
    const fb = result.ast?.functionBlocks[0];
    expect(fb?.name).toBe("OVERVIEW");
    expect(fb?.extends).toBe("HMISCREEN");
    const decls = fb?.varBlocks[0]?.declarations ?? [];
    expect(decls.map((d) => [d.names[0], d.type.name])).toEqual([
      ["TITLE", "HMILABEL"],
      ["PUMP1", "HMIPUMP"],
    ]);
    expect(decls[0]?.attributes).toEqual([{ name: "hmi_main" }]);
    expect(decls[1]?.initialValue?.sourceSpan.startLine).toBe(5);
    expect(result.ast?.programs.map((p) => p.name)).toEqual(["OTHER"]);
  });

  it("returns the same AST as a plain parse for valid source", () => {
    const valid = "PROGRAM P VAR a : INT; END_VAR a := 1; END_PROGRAM";
    expect(parse(valid, { recover: true })).toEqual(parse(valid));
  });
});
