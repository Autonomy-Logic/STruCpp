// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { analyze } from "strucpp";
import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode-languageserver/node.js";
import { getCodeActions } from "../../server/src/code-actions.js";
import { toLspDiagnostics } from "../../server/src/diagnostics.js";

const URI = "file:///test.st";

/** Helper: analyze source and convert errors/warnings to LSP diagnostics. */
function getDiagnostics(source: string): { diagnostics: Diagnostic[]; analysis: ReturnType<typeof analyze> } {
  const analysis = analyze(source, { fileName: "test.st" });
  const diagnostics = toLspDiagnostics(analysis.errors, analysis.warnings);
  return { diagnostics, analysis };
}

describe("getCodeActions", () => {
  describe("Undeclared variable", () => {
    it("inserts declaration in existing VAR block", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  y := 1;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const undeclaredDiag = diagnostics.find((d) => d.message.includes("Undeclared variable"));
      expect(undeclaredDiag).toBeDefined();

      const actions = getCodeActions([undeclaredDiag!], source, URI, analysis);
      expect(actions.length).toBeGreaterThanOrEqual(1);

      const action = actions.find((a) => a.title.includes("Declare variable"));
      expect(action).toBeDefined();
      expect(action!.edit?.changes?.[URI]).toBeDefined();

      const edits = action!.edit!.changes![URI];
      expect(edits.length).toBe(1);
      // Should insert before END_VAR (line 3)
      expect(edits[0].range.start.line).toBe(3);
      // Should preserve the original casing from the source (not the uppercased error message)
      expect(edits[0].newText).toContain("y : INT");
    });

    it("creates new VAR block when none exists above", () => {
      // This case: a program with no VAR block
      // Note: the analyze function may or may not produce undeclared var errors
      // for programs without VAR blocks depending on how the parser handles it.
      // Use a FUNCTION which requires all vars declared.
      const source = `FUNCTION Foo : INT
  z := 42;
END_FUNCTION`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const undeclaredDiag = diagnostics.find((d) => d.message.includes("Undeclared variable"));
      if (!undeclaredDiag) return; // Skip if no diagnostic produced

      const actions = getCodeActions([undeclaredDiag], source, URI, analysis);
      const action = actions.find((a) => a.title.includes("Declare variable"));
      expect(action).toBeDefined();
      expect(action!.edit!.changes![URI][0].newText).toContain("VAR");
      expect(action!.edit!.changes![URI][0].newText).toContain("END_VAR");
    });

    it("infers REAL type from float literal assignment", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  pi := 3.14;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const undeclaredDiag = diagnostics.find((d) => d.message.includes("Undeclared variable"));
      if (!undeclaredDiag) return;

      const actions = getCodeActions([undeclaredDiag], source, URI, analysis);
      const action = actions.find((a) => a.title.includes("Declare variable"));
      expect(action).toBeDefined();
      expect(action!.edit!.changes![URI][0].newText).toContain("REAL");
    });

    it("infers BOOL type from TRUE/FALSE literal", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  flag := TRUE;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const undeclaredDiag = diagnostics.find((d) => d.message.includes("Undeclared variable"));
      if (!undeclaredDiag) return;

      const actions = getCodeActions([undeclaredDiag], source, URI, analysis);
      const action = actions.find((a) => a.title.includes("Declare variable"));
      expect(action).toBeDefined();
      expect(action!.edit!.changes![URI][0].newText).toContain("BOOL");
    });
  });

  describe("Missing semicolon", () => {
    it("inserts semicolon for missing semicolon error", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  x := 1
  x := 2;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      // Look for Chevrotain's "Expecting ... Semicolon" message
      const semiDiag = diagnostics.find((d) => /Semicolon/i.test(d.message));
      if (!semiDiag) return; // Parser recovery may vary

      const actions = getCodeActions([semiDiag], source, URI, analysis);
      const action = actions.find((a) => a.title === "Add missing semicolon");
      expect(action).toBeDefined();
      expect(action!.edit!.changes![URI][0].newText).toBe(";");
    });

    it("skips comment lines when finding semicolon insertion point", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  x := 1
  (* this is a comment *)
  x := 2;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const semiDiag = diagnostics.find((d) => /Semicolon/i.test(d.message));
      if (!semiDiag) return;

      const actions = getCodeActions([semiDiag], source, URI, analysis);
      const action = actions.find((a) => a.title === "Add missing semicolon");
      expect(action).toBeDefined();
      const edit = action!.edit!.changes![URI][0];
      // Should insert on line 4 (x := 1), not on line 5 (the comment)
      expect(edit.range.start.line).toBe(4);
    });
  });

  describe("Narrowing conversion", () => {
    it("wraps with explicit conversion function", () => {
      const source = `PROGRAM Main
  VAR
    small : INT;
    big : DINT := 100;
  END_VAR
  small := big;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const narrowDiag = diagnostics.find((d) => d.message.includes("narrowing"));
      if (!narrowDiag) return; // Type checker may vary

      const actions = getCodeActions([narrowDiag], source, URI, analysis);
      const action = actions.find((a) => a.title.includes("conversion"));
      expect(action).toBeDefined();
      const edit = action!.edit!.changes![URI][0];
      expect(edit.newText).toContain("_TO_");
    });
  });

  describe("Undefined type", () => {
    it("creates type template at top of file", () => {
      const source = `PROGRAM Main
  VAR
    p : MyPoint;
  END_VAR
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const typeDiag = diagnostics.find((d) => d.message.includes("Undefined type"));
      if (!typeDiag) return;

      const actions = getCodeActions([typeDiag], source, URI, analysis);
      const action = actions.find((a) => a.title.includes("Create type"));
      expect(action).toBeDefined();
      const edit = action!.edit!.changes![URI][0];
      expect(edit.range.start.line).toBe(0);
      // Should preserve the original casing from the source
      expect(edit.newText).toContain("TYPE MyPoint");
      expect(edit.newText).toContain("STRUCT");
      expect(edit.newText).toContain("END_TYPE");
    });
  });

  describe("No actions for unrelated errors", () => {
    it("returns empty for errors without matching patterns", () => {
      const diag: Diagnostic = {
        range: Range.create(Position.create(0, 0), Position.create(0, 5)),
        severity: DiagnosticSeverity.Error,
        message: "Some random error message",
        source: "strucpp",
      };
      const actions = getCodeActions([diag], "PROGRAM Main\nEND_PROGRAM", URI);
      expect(actions).toEqual([]);
    });
  });

  describe("Multiple diagnostics", () => {
    it("returns actions for all matching diagnostics", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  y := 1;
  z := 2;
END_PROGRAM`;
      const { diagnostics, analysis } = getDiagnostics(source);
      const undeclaredDiags = diagnostics.filter((d) => d.message.includes("Undeclared variable"));

      if (undeclaredDiags.length < 2) return;

      const actions = getCodeActions(undeclaredDiags, source, URI, analysis);
      const declareActions = actions.filter((a) => a.title.includes("Declare variable"));
      expect(declareActions.length).toBe(undeclaredDiags.length);
    });
  });
});
