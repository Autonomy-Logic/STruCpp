// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import { formatDocument } from "../../server/src/formatting.js";

const DEFAULT_OPTS = { tabSize: 2, insertSpaces: true };

/** Apply edits to source and return the formatted result. */
function applyFormat(source: string, opts = DEFAULT_OPTS): string {
  const edits = formatDocument(source, opts);
  const lines = source.split("\n");
  // Apply edits from bottom to top to preserve line numbers
  const sorted = [...edits].sort((a, b) => b.range.start.line - a.range.start.line);
  for (const edit of sorted) {
    lines[edit.range.start.line] = edit.newText;
  }
  return lines.join("\n");
}

describe("formatDocument", () => {
  describe("Keyword uppercasing", () => {
    it("uppercases lowercase keywords", () => {
      const source = `program Main
  var
    x : int;
  end_var
  if x > 0 then
    x := 0;
  end_if;
end_program`;
      const result = applyFormat(source);
      expect(result).toContain("PROGRAM");
      expect(result).toContain("VAR");
      expect(result).toContain("INT");
      expect(result).toContain("END_VAR");
      expect(result).toContain("IF");
      expect(result).toContain("THEN");
      expect(result).toContain("END_IF");
      expect(result).toContain("END_PROGRAM");
    });

    it("uppercases mixed-case keywords", () => {
      const source = `Program Main\nEnd_Program`;
      const result = applyFormat(source);
      expect(result).toContain("PROGRAM");
      expect(result).toContain("END_PROGRAM");
    });

    it("does not modify keywords inside strings", () => {
      const source = `PROGRAM Main
  VAR
    s : STRING := 'if then else';
  END_VAR
END_PROGRAM`;
      const result = applyFormat(source);
      expect(result).toContain("'if then else'");
    });

    it("does not modify keywords inside line comments", () => {
      const source = `PROGRAM Main // program end_if
END_PROGRAM`;
      const result = applyFormat(source);
      expect(result).toContain("// program end_if");
    });

    it("does not modify keywords inside block comments", () => {
      const source = `PROGRAM Main
  (* if then else *)
END_PROGRAM`;
      const result = applyFormat(source);
      expect(result).toContain("(* if then else *)");
    });
  });

  describe("Indentation", () => {
    it("indents PROGRAM body", () => {
      const source = `PROGRAM Main
x := 1;
END_PROGRAM`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      expect(lines[0]).toBe("PROGRAM Main");
      expect(lines[1]).toBe("  x := 1;");
      expect(lines[2]).toBe("END_PROGRAM");
    });

    it("indents VAR block declarations", () => {
      const source = `PROGRAM Main
VAR
x : INT;
END_VAR
END_PROGRAM`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      expect(lines[1]).toBe("  VAR");
      expect(lines[2]).toBe("    x : INT;");
      expect(lines[3]).toBe("  END_VAR");
    });

    it("indents nested IF", () => {
      const source = `PROGRAM Main
VAR
x : INT;
END_VAR
IF x > 0 THEN
x := 0;
END_IF;
END_PROGRAM`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      // IF body should be at depth 2 (program + if)
      expect(lines[4]).toMatch(/^\s{2}IF/);
      expect(lines[5]).toMatch(/^\s{4}x := 0;/);
      expect(lines[6]).toMatch(/^\s{2}END_IF/);
    });

    it("handles ELSE/ELSIF dedent-indent", () => {
      const source = `PROGRAM Main
VAR
x : INT;
END_VAR
IF x > 0 THEN
x := 1;
ELSE
x := 2;
END_IF;
END_PROGRAM`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      // ELSE should be at same level as IF
      const ifLine = lines.find((l) => l.trim().startsWith("IF"));
      const elseLine = lines.find((l) => l.trim() === "ELSE");
      expect(ifLine).toBeDefined();
      expect(elseLine).toBeDefined();
      const ifIndent = ifLine!.match(/^(\s*)/)?.[1].length ?? 0;
      const elseIndent = elseLine!.match(/^(\s*)/)?.[1].length ?? 0;
      expect(elseIndent).toBe(ifIndent);
    });

    it("indents CASE branches", () => {
      const source = `PROGRAM Main
VAR
x : INT;
END_VAR
CASE x OF
1:
x := 0;
END_CASE;
END_PROGRAM`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      const caseLine = lines.findIndex((l) => l.trim().startsWith("CASE"));
      const endCaseLine = lines.findIndex((l) => l.trim().startsWith("END_CASE"));
      expect(caseLine).toBeGreaterThan(-1);
      expect(endCaseLine).toBeGreaterThan(caseLine);
      // END_CASE at same indent as CASE
      const caseIndent = lines[caseLine].match(/^(\s*)/)?.[1].length ?? 0;
      const endCaseIndent = lines[endCaseLine].match(/^(\s*)/)?.[1].length ?? 0;
      expect(endCaseIndent).toBe(caseIndent);
    });

    it("indents FUNCTION_BLOCK with METHOD", () => {
      const source = `FUNCTION_BLOCK MyFB
VAR
x : INT;
END_VAR
METHOD PUBLIC DoWork
VAR_INPUT
val : INT;
END_VAR
x := val;
END_METHOD
END_FUNCTION_BLOCK`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      // METHOD should be indented inside FB
      const methodLine = lines.find((l) => l.trim().startsWith("METHOD"));
      expect(methodLine).toBeDefined();
      expect(methodLine!.match(/^(\s*)/)?.[1].length).toBeGreaterThan(0);
    });
  });

  describe("Operator spacing", () => {
    it("normalizes assignment operator spacing", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  x:=1;
END_PROGRAM`;
      const result = applyFormat(source);
      expect(result).toContain("x := 1;");
    });

    it("normalizes comma spacing", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  x := Foo(1 ,2,3);
END_PROGRAM`;
      const result = applyFormat(source);
      expect(result).toContain("Foo(1, 2, 3)");
    });

    it("removes space before semicolon", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  x := 1 ;
END_PROGRAM`;
      const result = applyFormat(source);
      expect(result).toContain("x := 1;");
    });
  });

  describe("Options", () => {
    it("uses tabs when insertSpaces is false", () => {
      const source = `PROGRAM Main
x := 1;
END_PROGRAM`;
      const result = applyFormat(source, { tabSize: 4, insertSpaces: false });
      const lines = result.split("\n");
      expect(lines[1]).toBe("\tx := 1;");
    });

    it("respects tabSize for spaces", () => {
      const source = `PROGRAM Main
x := 1;
END_PROGRAM`;
      const result = applyFormat(source, { tabSize: 4, insertSpaces: true });
      const lines = result.split("\n");
      expect(lines[1]).toBe("    x := 1;");
    });
  });

  describe("Edge cases", () => {
    it("preserves blank lines", () => {
      const source = `PROGRAM Main

  VAR
    x : INT;
  END_VAR

  x := 1;
END_PROGRAM`;
      const result = applyFormat(source);
      const lines = result.split("\n");
      // Blank lines should remain (as empty strings)
      const blankCount = lines.filter((l) => l === "").length;
      expect(blankCount).toBeGreaterThanOrEqual(2);
    });

    it("only emits edits for changed lines", () => {
      const source = `PROGRAM Main
  VAR
    x : INT;
  END_VAR
  x := 1;
END_PROGRAM`;
      const edits = formatDocument(source, DEFAULT_OPTS);
      // This is already well-formatted, so few or no edits expected
      // Each edit should represent an actual change
      for (const edit of edits) {
        const lines = source.split("\n");
        const originalLine = lines[edit.range.start.line];
        expect(edit.newText).not.toBe(originalLine);
      }
    });

    it("handles block comments spanning multiple lines", () => {
      const source = `PROGRAM Main
(*
  this is a comment
  with multiple lines
*)
END_PROGRAM`;
      const result = applyFormat(source);
      // Comment content should not be modified (no keyword uppercasing)
      expect(result).toContain("this is a comment");
      expect(result).toContain("with multiple lines");
    });

    it("handles empty source", () => {
      const edits = formatDocument("", DEFAULT_OPTS);
      expect(edits).toEqual([]);
    });
  });
});
