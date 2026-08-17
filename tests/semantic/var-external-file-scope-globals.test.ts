/**
 * VAR_EXTERNAL resolution against **file-level** VAR_GLOBAL blocks.
 *
 * STruC++ emits the two kinds of global differently:
 *
 *   - a CONFIGURATION VAR_GLOBAL becomes `inline GlobalVar<V>` (value + mutex),
 *     reached by each POU through a `GlobalVar<V>*` member;
 *   - a file-level VAR_GLOBAL (a GVL) becomes plain file-scope storage that every
 *     POU in the unit already reaches by name.
 *
 * VAR_EXTERNAL resolution used to consider only the first kind, so declaring a
 * file-level global via VAR_EXTERNAL — which IEC 61131-3 not only allows but
 * expects — failed with "no matching VAR_GLOBAL declaration". For the second kind
 * the declaration is documentation: it must validate, and it must NOT add a
 * pointer member, which would shadow the very global being referenced.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

function compileST(source: string) {
  return compile(source);
}

function errorMessages(result: { errors: { message: string }[] }): string[] {
  return result.errors.map((e) => e.message);
}

describe("VAR_EXTERNAL against a file-level VAR_GLOBAL", () => {
  it("resolves in a PROGRAM", () => {
    const result = compileST(`
      VAR_GLOBAL
        gx : REAL := 1.0;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL gx : REAL; END_VAR
        gx := gx * 2.0;
      END_PROGRAM
    `);
    expect(errorMessages(result)).toEqual([]);
    expect(result.success).toBe(true);
    // Plain file-scope storage, and the body writes it directly.
    expect(result.headerCode).toContain("inline IEC_REAL GX = 1.0;");
    expect(result.cppCode).toContain("GX = GX * 2.0;");
  });

  it("adds no pointer member or constructor parameter for it", () => {
    const result = compileST(`
      VAR_GLOBAL
        gx : REAL := 1.0;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL gx : REAL; END_VAR
        gx := 2.0;
      END_PROGRAM
    `);
    expect(result.success).toBe(true);
    // A GlobalVar<V>* member would shadow the file-scope global.
    expect(result.headerCode).not.toContain("GlobalVar<IEC_REAL>* GX");
    expect(result.headerCode).not.toContain("GX_ref");
    // No pointer to bind → the default constructor stays parameterless.
    expect(result.headerCode).toContain("Program_MAIN();");
  });

  it("resolves in a FUNCTION_BLOCK", () => {
    const result = compileST(`
      VAR_GLOBAL
        counter : INT := 0;
      END_VAR
      FUNCTION_BLOCK Ticker
        VAR_EXTERNAL counter : INT; END_VAR
        counter := counter + 1;
      END_FUNCTION_BLOCK
    `);
    expect(errorMessages(result)).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.headerCode).not.toContain("GlobalVar<IEC_INT>* COUNTER");
    expect(result.cppCode).toContain("COUNTER = COUNTER + 1;");
  });

  it("resolves a struct-typed global and reads its fields", () => {
    const result = compileST(`
      TYPE
        Scale : STRUCT
          lo : REAL;
          hi : REAL;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        s : Scale := (lo := 4.0, hi := 22.0);
        out : REAL;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL
          s : Scale;
          out : REAL;
        END_VAR
        out := s.hi - s.lo;
      END_PROGRAM
    `);
    expect(errorMessages(result)).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("OUT = S.HI - S.LO;");
  });

  it("reports a type mismatch against the file-level global", () => {
    const result = compileST(`
      VAR_GLOBAL
        gx : REAL := 1.0;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL gx : INT; END_VAR
        gx := 2;
      END_PROGRAM
    `);
    expect(result.success).toBe(false);
    expect(errorMessages(result)).toContain(
      "Type mismatch for VAR_EXTERNAL 'GX' in program 'MAIN': expected 'REAL' but found 'INT'",
    );
  });

  it("reports a type mismatch in a FUNCTION_BLOCK too", () => {
    const result = compileST(`
      VAR_GLOBAL
        gx : REAL := 1.0;
      END_VAR
      FUNCTION_BLOCK FB
        VAR_EXTERNAL gx : INT; END_VAR
        gx := 2;
      END_FUNCTION_BLOCK
    `);
    expect(result.success).toBe(false);
    expect(errorMessages(result)).toContain(
      "Type mismatch for VAR_EXTERNAL 'GX' in function block 'FB': expected 'REAL' but found 'INT'",
    );
  });

  it("still reports a VAR_EXTERNAL that matches no global at all", () => {
    const result = compileST(`
      VAR_GLOBAL
        gx : REAL := 1.0;
      END_VAR
      PROGRAM Main
        VAR_EXTERNAL missing : REAL; END_VAR
        missing := 2.0;
      END_PROGRAM
    `);
    expect(result.success).toBe(false);
    expect(errorMessages(result)).toContain(
      "VAR_EXTERNAL 'MISSING' in program 'MAIN' has no matching VAR_GLOBAL declaration",
    );
  });

  it("keeps the GlobalVar plumbing for CONFIGURATION globals", () => {
    // The configuration path is unchanged: a pointer member, a constructor
    // parameter, and locked access in the body.
    const result = compileST(`
      PROGRAM Main
        VAR_EXTERNAL gx : REAL; END_VAR
        gx := 2.0;
      END_PROGRAM
      CONFIGURATION Cfg
        VAR_GLOBAL
          gx : REAL := 1.0;
        END_VAR
        RESOURCE Res ON PLC
          TASK T(INTERVAL := T#20ms, PRIORITY := 0);
          PROGRAM P WITH T : Main;
        END_RESOURCE
      END_CONFIGURATION
    `);
    expect(errorMessages(result)).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.headerCode).toContain("inline GlobalVar<IEC_REAL> GX{1.0};");
    expect(result.headerCode).toContain("GlobalVar<IEC_REAL>* GX = nullptr;");
    expect(result.cppCode).toContain("GX->write(2.0);");
  });
});
