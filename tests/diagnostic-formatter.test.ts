// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatDiagnostic,
  formatDiagnostics,
  buildSourceMap,
} from "../src/diagnostic-formatter.js";
import type { CompileError } from "../src/types.js";

// Disable colors so assertions can match exact substrings — the formatter
// reads NO_COLOR per call.
beforeEach(() => {
  process.env.NO_COLOR = "1";
});
afterEach(() => {
  delete process.env.NO_COLOR;
});

const program = `PROGRAM Main
VAR
  count : INT;
END_VAR

count := undefined_var + 1;
END_PROGRAM
`;

describe("diagnostic-formatter", () => {
  it("renders header, source line, and caret in gcc style", () => {
    const map = buildSourceMap([{ fileName: "main.st", source: program }]);
    const out = formatDiagnostic(
      {
        message: "Undeclared variable 'undefined_var'",
        file: "main.st",
        line: 6,
        column: 10,
        severity: "error",
      },
      map,
    );
    expect(out).toContain("main.st:6:10: error: Undeclared variable");
    expect(out).toContain("count := undefined_var + 1;");
    // Gutter is "<padded> | " (4-space pad + " | " = 7 chars), then 9 chars
    // of padding for column 10, then caret.
    expect(out).toMatch(/\n {5}\| {10}\^/);
  });

  it("widens caret to underline when endColumn is on the same line", () => {
    const map = buildSourceMap([{ fileName: "main.st", source: program }]);
    const out = formatDiagnostic(
      {
        message: "Undeclared variable",
        file: "main.st",
        line: 6,
        column: 10,
        endColumn: 23,
        severity: "error",
      },
      map,
    );
    // 13-char span -> ^ + 12 tildes
    expect(out).toContain("^~~~~~~~~~~~");
  });

  it("clamps the underline at the end of the source line", () => {
    const map = buildSourceMap([{ fileName: "main.st", source: program }]);
    const out = formatDiagnostic(
      {
        message: "Span runs past EOL",
        file: "main.st",
        line: 6,
        column: 10,
        endColumn: 9999,
        severity: "error",
      },
      map,
    );
    // Line is 27 chars + newline. Caret + tildes shouldn't extend past col 28.
    const caretLine = out.split("\n")[2]!;
    const caretCharsAfterGutter = caretLine.indexOf("^") + caretLine.split("^")[1]!.length;
    expect(caretCharsAfterGutter).toBeLessThanOrEqual("       | ".length + 27);
  });

  it("preserves tabs in the padding so the caret aligns under tabs", () => {
    const tabbed = "PROGRAM Tabs\n\tx := 1;\nEND_PROGRAM\n";
    const map = buildSourceMap([{ fileName: "tabs.st", source: tabbed }]);
    const out = formatDiagnostic(
      {
        message: "msg",
        file: "tabs.st",
        line: 2,
        column: 2, // points at 'x' which sits after a tab
        severity: "error",
      },
      map,
    );
    // The padding line under the source line should start with a tab so it
    // aligns regardless of the terminal tab width.
    const lines = out.split("\n");
    const caretLine = lines[2]!;
    expect(caretLine.includes("\t")).toBe(true);
  });

  it("falls back to header-only when source is unavailable", () => {
    const out = formatDiagnostic(
      {
        message: "Library missing",
        line: 0,
        column: 0,
        severity: "error",
      },
      buildSourceMap([]),
    );
    expect(out).toBe("<input>:0:0: error: Library missing");
  });

  it("falls back to header-only when line is past end of file", () => {
    const map = buildSourceMap([{ fileName: "main.st", source: program }]);
    const out = formatDiagnostic(
      {
        message: "stale line",
        file: "main.st",
        line: 99,
        column: 1,
        severity: "error",
      },
      map,
    );
    expect(out).not.toContain("\n");
    expect(out).toContain("main.st:99:1: error: stale line");
  });

  it("renders a warning header", () => {
    const out = formatDiagnostic(
      {
        message: "Unused variable",
        file: "x.st",
        line: 3,
        column: 5,
        severity: "warning",
      },
      new Map(),
    );
    expect(out).toContain("x.st:3:5: warning: Unused variable");
  });

  it("appends suggestion as a note line under the caret", () => {
    const map = buildSourceMap([{ fileName: "main.st", source: program }]);
    const out = formatDiagnostic(
      {
        message: "Undeclared variable",
        file: "main.st",
        line: 6,
        column: 10,
        severity: "error",
        suggestion: "Did you mean 'count'?",
      },
      map,
    );
    expect(out).toContain("note: Did you mean 'count'?");
    // Note appears AFTER the caret line.
    expect(out.indexOf("note:")).toBeGreaterThan(out.indexOf("^"));
  });

  it("appends an error code in brackets when present", () => {
    const out = formatDiagnostic(
      {
        message: "msg",
        file: "x.st",
        line: 1,
        column: 1,
        severity: "error",
        code: "E0042",
      },
      new Map(),
    );
    expect(out).toContain("error: msg [E0042]");
  });

  it("formatDiagnostics joins multiple entries with blank lines", () => {
    const out = formatDiagnostics(
      [
        {
          message: "first",
          file: "a.st",
          line: 1,
          column: 1,
          severity: "error",
        },
        {
          message: "second",
          file: "a.st",
          line: 2,
          column: 1,
          severity: "error",
        },
      ],
      [{ fileName: "a.st", source: "line one\nline two\n" }],
    );
    expect(out.split("\n").filter((l) => l.includes("error:"))).toHaveLength(2);
    expect(out).toContain("line one");
    expect(out).toContain("line two");
  });

  it("formatDiagnostics returns an empty string for no entries", () => {
    expect(formatDiagnostics([], [])).toBe("");
  });

  it("info severity renders without throwing", () => {
    const out = formatDiagnostic(
      {
        message: "info note",
        line: 1,
        column: 1,
        severity: "info",
      } as CompileError,
      new Map(),
    );
    expect(out).toContain("info: info note");
  });
});
