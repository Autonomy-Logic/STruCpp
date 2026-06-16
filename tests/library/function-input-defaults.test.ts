// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Tests for capturing VAR_INPUT initial values into the library manifest.
 *
 * Manifest parameter shape carries an optional `initialValue` (ST expression
 * string). Present ⇒ the input is optional (compiler supplies the default when
 * omitted); absent ⇒ the input is mandatory. This must be populated from the
 * source ST for both user-authored library projects and CODESYS-imported
 * libraries — the latter flow through the same compileStlib path, since the
 * importer emits ST source verbatim (declarations, including `:=` defaults).
 */

import { describe, it, expect } from "vitest";
import { compileStlib } from "../../src/library/library-compiler.js";

function fnParams(source: string, fnName: string) {
  const result = compileStlib([{ source, fileName: "lib.st" }], {
    name: "test-lib",
    version: "1.0.0",
    namespace: "test",
  });
  expect(result.success).toBe(true);
  const fn = result.archive!.manifest.functions.find((f) => f.name === fnName);
  expect(fn).toBeDefined();
  return fn!.parameters;
}

describe("library manifest: VAR_INPUT initial values", () => {
  it("captures initialValue for defaulted inputs and omits it for mandatory ones", () => {
    const params = fnParams(
      `
      FUNCTION SCALE_DEMO : REAL
        VAR_INPUT
          IN : REAL;
          MAXV : REAL := 1000.0;
          SIGN : BYTE := 255;
        END_VAR
        SCALE_DEMO := IN;
      END_FUNCTION
    `,
      "SCALE_DEMO",
    );

    const byName = Object.fromEntries(params.map((p) => [p.name, p]));
    // mandatory input — no default
    expect(byName.IN).toMatchObject({ name: "IN", direction: "input" });
    expect("initialValue" in byName.IN!).toBe(false);
    // optional inputs — defaults preserved as ST strings
    expect(byName.MAXV!.initialValue).toBe("1000.0");
    expect(byName.SIGN!.initialValue).toBe("255");
  });

  it("serializes common default-expression forms", () => {
    const params = fnParams(
      `
      FUNCTION DEFAULTS : INT
        VAR_INPUT
          a : INT := -1;
          b : BOOL := TRUE;
          c : TIME := T#100ms;
          d : REAL := 3.14;
        END_VAR
        DEFAULTS := a;
      END_FUNCTION
    `,
      "DEFAULTS",
    );
    const byName = Object.fromEntries(params.map((p) => [p.name, p]));
    // Manifest normalizes parameter names to upper case.
    expect(byName.A!.initialValue).toBe("-1");
    expect(byName.B!.initialValue).toBe("TRUE");
    expect(byName.C!.initialValue).toBe("T#100MS"); // time literals normalize upper-case
    expect(byName.D!.initialValue).toBe("3.14");
  });

  it("preserves initialValue when reloaded from a serialized .stlib (round-trip)", () => {
    const result = compileStlib(
      [
        {
          source: `
          FUNCTION F : INT
            VAR_INPUT x : INT; y : INT := 7; END_VAR
            F := x + y;
          END_FUNCTION
        `,
          fileName: "lib.st",
        },
      ],
      { name: "rt-lib", version: "1.0.0", namespace: "rt" },
    );
    expect(result.success).toBe(true);

    // Round-trip through JSON, as the .stlib is persisted/loaded.
    const json = JSON.parse(JSON.stringify(result.archive));
    const fn = json.manifest.functions.find(
      (f: { name: string }) => f.name === "F",
    );
    const byName = Object.fromEntries(
      fn.parameters.map((p: { name: string }) => [p.name, p]),
    );
    expect("initialValue" in byName.X).toBe(false);
    expect(byName.Y.initialValue).toBe("7");
  });

  it("captures defaults from CODESYS-importer-style ST (same compileStlib path)", () => {
    // The CODESYS v2/v3 importers emit ST source verbatim; an imported OSCAT
    // function like AIN carries VAR_INPUT defaults that must reach the manifest.
    const params = fnParams(
      `
      FUNCTION AIN : REAL
        VAR_INPUT
          IN : DWORD;
          sign : BYTE := 255;
          high : REAL := 10.0;
        END_VAR
        AIN := high;
      END_FUNCTION
    `,
      "AIN",
    );
    const byName = Object.fromEntries(params.map((p) => [p.name, p]));
    expect("initialValue" in byName.IN!).toBe(false);
    expect(byName.SIGN!.initialValue).toBe("255");
    expect(byName.HIGH!.initialValue).toBe("10.0");
  });
});
