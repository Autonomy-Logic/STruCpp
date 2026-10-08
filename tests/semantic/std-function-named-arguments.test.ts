/**
 * STruC++ Semantic Analyzer - Standard Function Named Arguments
 *
 * A standard function's named arguments bind to its IEC 61131-3 formal
 * parameters by name, in whatever order they are written. They used to be
 * passed in source order with the names ignored, so `LIMIT(IN := x, MN := 0,
 * MX := 10)` handed x to MN. The values themselves are checked on a running
 * program in tests/integration/std-function-named-args-cpp.test.ts.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const program = (body: string, vars = "") =>
  compile(`
PROGRAM main
  VAR i, a, b, c : INT; w : WORD; s : STRING; r : REAL; ok : BOOL; ${vars} END_VAR
  ${body}
END_PROGRAM
`);

const messages = (result: ReturnType<typeof compile>): string[] =>
  (result.errors ?? []).map((e) => e.message);

/** The C++ line a single ST assignment became. */
const lineOf = (result: ReturnType<typeof compile>, target: string): string =>
  (result.cppCode ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${target} = `)) ?? "";

describe("named arguments bind by name", () => {
  it.each([
    [
      "i := LIMIT(IN := a, MX := c, MN := b);",
      "I",
      "I = LIMIT(B, A, C);",
    ],
    [
      "i := SEL(IN1 := a, IN0 := b, G := ok);",
      "I",
      "I = SEL(OK, B, A);",
    ],
    [
      "i := MUX(IN1 := a, K := 1, IN0 := b);",
      "I",
      "I = MUX(1, B, A);",
    ],
    [
      "i := MAX(IN3 := c, IN1 := a, IN2 := b);",
      "I",
      "I = MAX(A, B, C);",
    ],
    ["i := SUB(IN2 := a, IN1 := b);", "I", "I = SUB(B, A);"],
    ["w := SHL(N := 2, IN := w);", "W", "W = SHL(W, 2);"],
    ["w := ROR(N := 1, IN := w);", "W", "W = ROR(W, 1);"],
    ["s := MID(P := 2, L := 3, IN := s);", "S", "S = MID(S, 3, 2);"],
    ["s := LEFT(L := 2, IN := s);", "S", "S = LEFT(S, 2);"],
    [
      "s := DELETE(P := 1, L := 2, IN := s);",
      "S",
      "S = DELETE_STR(S, 2, 1);",
    ],
    ["i := FIND(IN2 := s, IN1 := s);", "I", "I = FIND(S, S);"],
    [
      "r := ATAN2(X := r, Y := 1.0);",
      "R",
      "R = ATAN2(static_cast<IEC_REAL>(1.0), R);",
    ],
    ["r := INT_TO_REAL(IN := a);", "R", "R = TO_REAL(A);"],
  ])("%s", (body, target, cpp) => {
    const result = program(body);
    expect(messages(result)).toEqual([]);
    expect(lineOf(result, target)).toBe(cpp);
  });

  it("types the result from the bound input, not the first one written", () => {
    // MID returns its IN's type; read positionally, P (an INT) was IN.
    const result = program("s := MID(P := 2, L := 3, IN := s);");
    expect(messages(result)).toEqual([]);
  });

  it("keeps EN and ENO around a reordered call", () => {
    const result = program(
      "i := LIMIT(EN := ok, MX := c, IN := a, MN := b, ENO => ok);",
    );
    expect(messages(result)).toEqual([]);
    expect(result.cppCode ?? "").toContain("LIMIT(B, A, C)");
  });

  it("lets an extensible function skip a numbered input", () => {
    const result = program("i := ADD(IN3 := c, IN1 := a);");
    expect(messages(result)).toEqual([]);
    expect(lineOf(result, "I")).toBe("I = ADD(A, C);");
  });

  it("leaves a variable named like the function alone", () => {
    const result = program(
      "limit := LIMIT(IN := a, MX := c, MN := b);",
      "limit : INT;",
    );
    expect(messages(result)).toEqual([]);
    expect(lineOf(result, "LIMIT")).toBe("LIMIT = strucpp::LIMIT(B, A, C);");
  });
});

describe("positional and named together", () => {
  it("accepts positional arguments first, filling the first inputs", () => {
    const result = program("i := LIMIT(b, MX := c, IN := a);");
    expect(messages(result)).toEqual([]);
    expect(lineOf(result, "I")).toBe("I = LIMIT(B, A, C);");
  });

  it("rejects a positional argument after a named one", () => {
    expect(messages(program("i := LIMIT(MN := b, a, MX := c);"))).toEqual([
      "'LIMIT' has an argument without a name after a named one: name every argument, or give them all in order",
    ]);
  });

  it("rejects an input given both by position and by name", () => {
    expect(messages(program("i := LIMIT(a, MN := b, MX := c);"))).toEqual([
      "Function 'LIMIT' is given input 'MN' twice: by position and by name",
    ]);
  });
});

describe("wrong names", () => {
  it.each([
    [
      "i := LIMIT(MIN := b, IN := a, MX := c);",
      "Function 'LIMIT' has no input 'MIN' (its inputs are MN, IN, MX)",
    ],
    [
      "i := ADD(IN1 := a, X := b);",
      "Function 'ADD' has no input 'X' (its inputs are IN1, IN2, …)",
    ],
    [
      "i := MUX(K := 0, IN0 := a, IN01 := b);",
      "Function 'MUX' has no input 'IN01' (its inputs are K, IN0, IN1, …)",
    ],
    [
      "r := INT_TO_REAL(X := a);",
      "Function 'INT_TO_REAL' has no input 'X' (its inputs are IN)",
    ],
    [
      "i := LIMIT(MN := b, IN := a, MX => i);",
      "'MX' is an input of function 'LIMIT': assign it with ':=', not '=>'",
    ],
    [
      "i := LIMIT(MN := b, IN := a, MX := c, OUT => i);",
      "Function 'LIMIT' has no output 'OUT' (it has no outputs)",
    ],
    [
      "i := LIMIT(MN := b, IN := a, IN := c, MX := c);",
      "Function 'LIMIT' is given input 'IN' twice",
    ],
    [
      "i := LIMIT(MN := b, IN := a, MX := c, EN => ok);",
      "'EN' is the implicit input of function 'LIMIT': assign it with ':='",
    ],
    ["i := LIMIT(MN := b, IN := a);", "Function 'LIMIT' is missing input MX"],
    [
      "i := MUX(K := 1, IN0 := a, IN2 := b);",
      "Function 'MUX' is missing input IN1",
    ],
  ])("%s", (body, message) => {
    const result = program(body);
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual([message]);
  });

  it("points at the argument", () => {
    const result = program("i := LIMIT(MN := b, INN := a, MX := c);");
    expect(result.errors[0]!.line).toBe(4);
    expect(result.errors[0]!.column).toBe(23);
  });
});
