// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { analyze } from "strucpp";
import { getSemanticTokens, TOKEN_TYPES } from "../../server/src/semantic-tokens.js";

interface Tok {
  line: number;
  col: number;
  len: number;
  type: number;
}

function decode(data: number[]): Tok[] {
  const out: Tok[] = [];
  let line = 0;
  let col = 0;
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    line += deltaLine;
    col = deltaLine === 0 ? col + data[i + 1] : data[i + 1];
    out.push({ line, col, len: data[i + 2], type: data[i + 3] });
  }
  return out;
}

/** The client's rule: within a line no token may start before the previous one ends. */
function findOverlaps(source: string, fileName: string): string[] {
  const data = getSemanticTokens(analyze(source, { fileName }), fileName, source);
  const lines = source.split("\n");
  const byLine = new Map<number, Tok[]>();
  for (const t of decode(data)) {
    const list = byLine.get(t.line);
    if (list) list.push(t);
    else byLine.set(t.line, [t]);
  }

  const bad: string[] = [];
  for (const [line, list] of byLine) {
    list.sort((a, b) => a.col - b.col);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (cur.col < prev.col + prev.len) {
        const text = lines[line] ?? "";
        bad.push(
          `line ${line + 1} col ${cur.col + 1}: ` +
            `"${text.slice(prev.col, prev.col + prev.len)}"(${TOKEN_TYPES[prev.type]}) ` +
            `vs "${text.slice(cur.col, cur.col + cur.len)}"(${TOKEN_TYPES[cur.type]})`,
        );
      }
    }
  }
  return bad;
}

function tokensOn(source: string, line: number): Array<{ text: string; type: string }> {
  const data = getSemanticTokens(analyze(source, { fileName: "t.st" }), "t.st", source);
  const text = source.split("\n")[line - 1] ?? "";
  return decode(data)
    .filter((t) => t.line === line - 1)
    .sort((a, b) => a.col - b.col)
    .map((t) => ({ text: text.slice(t.col, t.col + t.len), type: TOKEN_TYPES[t.type] }));
}

const CASES: Record<string, string> = {
  "array declaration": `PROGRAM Main\nVAR\n  Arr : ARRAY [1..10] OF INT;\nEND_VAR\n  ;\nEND_PROGRAM\n`,
  "array subscript": `PROGRAM Main\nVAR\n  Arr : ARRAY [1..10] OF INT;\n  I : INT;\nEND_VAR\n  Arr[I] := 0;\nEND_PROGRAM\n`,
  "two-dimensional array": `PROGRAM Main\nVAR\n  Grid : ARRAY [1..4, 1..4] OF INT;\n  I : INT;\nEND_VAR\n  Grid[I, I] := 0;\nEND_PROGRAM\n`,
  "array of user-defined type": `TYPE\n  Motor : STRUCT\n    Speed : INT;\n  END_STRUCT;\nEND_TYPE\n\nPROGRAM Main\nVAR\n  Bank : ARRAY [1..3] OF Motor;\nEND_VAR\n  ;\nEND_PROGRAM\n`,
  "literal subscript": `PROGRAM Main\nVAR\n  Arr : ARRAY [1..10] OF INT;\nEND_VAR\n  Arr[1] := 0;\nEND_PROGRAM\n`,
  "subscript on the right-hand side": `PROGRAM Main\nVAR\n  Arr : ARRAY [1..10] OF INT;\n  I : INT;\n  X : INT;\nEND_VAR\n  X := Arr[I];\nEND_PROGRAM\n`,
  "field then subscript": `TYPE\n  S : STRUCT\n    A : ARRAY [1..3] OF INT;\n  END_STRUCT;\nEND_TYPE\n\nPROGRAM Main\nVAR\n  X : S;\n  I : INT;\nEND_VAR\n  X.A[I] := 0;\nEND_PROGRAM\n`,
  "no array": `PROGRAM Main\nVAR\n  I : INT;\n  X : INT;\nEND_VAR\n  X := I;\nEND_PROGRAM\n`,
};

describe("semantic tokens never overlap", () => {
  for (const [name, source] of Object.entries(CASES)) {
    it(name, () => {
      expect(findOverlaps(source, `${name}.st`)).toEqual([]);
    });
  }

  for (const fixture of ["complex-project.st", "simple-program.st"]) {
    it(`fixture ${fixture}`, () => {
      const file = path.resolve(__dirname, "../fixtures", fixture);
      expect(findOverlaps(fs.readFileSync(file, "utf-8"), fixture)).toEqual([]);
    });
  }

  it("keeps the variable name a variable on an array declaration", () => {
    // The synthesised array type has no source text, so the name is the line's only token.
    expect(tokensOn(CASES["array declaration"], 3)).toEqual([{ text: "Arr", type: "variable" }]);
  });

  it("keeps the token on __XWORD, which is a real elementary type", () => {
    const source = `PROGRAM Main\nVAR\n  addr : __XWORD;\nEND_VAR\n  ;\nEND_PROGRAM\n`;
    expect(tokensOn(source, 3)).toEqual([
      { text: "addr", type: "variable" },
      { text: "__XWORD", type: "type" },
    ]);
  });

  it("keeps the token on a user type whose name starts with underscores", () => {
    const source =
      `TYPE\n  __Count : STRUCT\n    A : INT;\n  END_STRUCT;\nEND_TYPE\n\n` +
      `PROGRAM Main\nVAR\n  c : __Count;\nEND_VAR\n  ;\nEND_PROGRAM\n`;
    expect(tokensOn(source, 9)).toEqual([
      { text: "c", type: "variable" },
      { text: "__Count", type: "type" },
    ]);
  });

  it("emits a subscript index once", () => {
    const onBody = tokensOn(CASES["array subscript"], 6);
    expect(onBody.filter((t) => t.text === "I")).toHaveLength(1);
  });
});
