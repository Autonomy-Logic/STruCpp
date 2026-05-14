/**
 * POU-context error annotation — pin tests.
 *
 * Standalone CLI behaviour is unchanged; these tests verify that
 * programmatic consumers (the OpenPLC Editor) receive the new
 * pouName / pouKind / section / bodyLine / variableName fields on
 * `CompileError` records when the underlying diagnostic sits inside
 * a POU strucpp parsed.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../dist/index.js";

describe("CompileError POU annotation", () => {
  describe("var-block errors", () => {
    it("annotates a WSTRING := 'foo' mismatch with section='var-block' and the variable name", () => {
      // Reproduces the user-reported scenario: a WSTRING declared with
      // a single-quoted (STRING) initial value.  The type-checker
      // catches it as a `Cannot assign STRING to WSTRING` error; the
      // editor needs the POU name + variable name to surface it in the
      // right tab.
      const result = compile(`
PROGRAM Manual_Override
  VAR
    foo : WSTRING := 'this is a string';
  END_VAR
END_PROGRAM
`);
      expect(result.success).toBe(false);
      const err = result.errors.find((e) => /STRING|WSTRING/.test(e.message));
      expect(err).toBeDefined();
      expect(err?.pouName).toBe("MANUAL_OVERRIDE");
      expect(err?.pouKind).toBe("PROGRAM");
      expect(err?.section).toBe("var-block");
      expect(err?.variableName).toBe("FOO");
      // var-block errors keep their file line (no bodyLine)
      expect(err?.bodyLine).toBeUndefined();
    });

    it("works inside a FUNCTION_BLOCK as well", () => {
      const result = compile(`
FUNCTION_BLOCK Tank_Controller
  VAR
    setpoint : WSTRING := 'oops';
  END_VAR
END_FUNCTION_BLOCK
`);
      expect(result.success).toBe(false);
      const err = result.errors.find((e) => /STRING|WSTRING/.test(e.message));
      expect(err?.pouName).toBe("TANK_CONTROLLER");
      expect(err?.pouKind).toBe("FUNCTION_BLOCK");
      expect(err?.section).toBe("var-block");
      expect(err?.variableName).toBe("SETPOINT");
    });
  });

  describe("body errors", () => {
    it("annotates a body assignment mismatch with section='body' and a body-relative line", () => {
      // Body is supposed to start at bodyLine 1 — the first line
      // after END_VAR (excluding leading blank lines).  Two statements
      // here; the error is on the second, so bodyLine should be 2.
      const result = compile(`
PROGRAM Main
  VAR
    flag : BOOL;
  END_VAR
  flag := TRUE;
  flag := "wstring lit";
END_PROGRAM
`);
      expect(result.success).toBe(false);
      const err = result.errors.find((e) => /BOOL|WSTRING/.test(e.message));
      expect(err?.pouName).toBe("MAIN");
      expect(err?.pouKind).toBe("PROGRAM");
      expect(err?.section).toBe("body");
      expect(err?.bodyLine).toBe(2);
      // file line is preserved alongside
      expect(err?.line).toBeGreaterThan(0);
    });

    it("first body statement maps to bodyLine 1", () => {
      const result = compile(`
PROGRAM Main
  VAR
    flag : BOOL;
  END_VAR
  flag := "wstring lit";
END_PROGRAM
`);
      expect(result.success).toBe(false);
      const err = result.errors.find((e) => /BOOL|WSTRING/.test(e.message));
      expect(err?.section).toBe("body");
      expect(err?.bodyLine).toBe(1);
    });
  });

  describe("multi-POU programs", () => {
    it("attributes each error to the right POU when many POUs share a file", () => {
      // The editor's monolithic program.st case: two POUs, two errors,
      // one in each.  Both must be annotated correctly without leaking
      // the wrong POU name onto the other.
      const result = compile(`
PROGRAM Alpha
  VAR
    a : WSTRING := 'oops_in_alpha';
  END_VAR
END_PROGRAM

PROGRAM Beta
  VAR flag : BOOL; END_VAR
  flag := "wstring_in_beta_body";
END_PROGRAM
`);
      expect(result.success).toBe(false);
      const alphaErr = result.errors.find(
        (e) => /STRING|WSTRING/.test(e.message) && e.pouName === "ALPHA",
      );
      const betaErr = result.errors.find(
        (e) => /BOOL|WSTRING/.test(e.message) && e.pouName === "BETA",
      );
      expect(alphaErr?.section).toBe("var-block");
      expect(alphaErr?.variableName).toBe("A");
      expect(betaErr?.section).toBe("body");
      expect(betaErr?.bodyLine).toBe(1);
    });
  });

  describe("non-annotated cases", () => {
    it("leaves errors with line=0 untouched", () => {
      // Synthetic errors (e.g. failed phase wrappers) come in with
      // line=0; the annotation pass must skip them.  Use a totally
      // bad input that fails before semantic analysis; resulting
      // errors should have at most the basic location info.
      const result = compile("THIS IS NOT VALID ST");
      expect(result.success).toBe(false);
      // Whether or not strucpp's recovery produces line>0 errors here,
      // the contract is: line=0 errors never carry pouName.
      for (const e of result.errors) {
        if (e.line === 0) {
          expect(e.pouName).toBeUndefined();
        }
      }
    });
  });
});
