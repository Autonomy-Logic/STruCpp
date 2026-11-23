// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * The call argument binder: positional, named and variadic arguments land in their parameter slots, and every
 * malformed call comes back as a diagnostic with the span of the argument at fault or of the call, never a throw.
 */
import { describe, it, expect } from "vitest";
import {
  bindCallArguments,
  type CallParam,
  type CallBindingDiagnostic,
} from "../../src/semantic/call-binding.js";
import type { Argument } from "../../src/frontend/ast.js";
import type { SourceSpan } from "../../src/types.js";

const span = (col: number): SourceSpan => ({
  file: "t.st",
  startLine: 3,
  endLine: 3,
  startCol: col,
  endCol: col + 1,
});

const CALL = span(1);

let nextCol = 10;

/** An argument with its own span; `name` set makes it named, `output` makes it `=>`. */
function arg(value: number, name?: string, output = false): Argument {
  const at = span(nextCol++);
  return {
    kind: "Argument",
    sourceSpan: at,
    ...(name !== undefined ? { name } : {}),
    isOutput: output,
    value: {
      kind: "LiteralExpression",
      sourceSpan: at,
      literalType: "INT",
      value,
      rawValue: String(value),
    },
  };
}

const input = (name: string, required = true): CallParam => ({
  name,
  direction: "input",
  required,
});

const LIMIT: CallParam[] = [input("MN"), input("IN"), input("MX")];
const LIMIT_OPTS = { calleeLabel: "function 'LIMIT'" };

const at = (d: readonly CallBindingDiagnostic[], s: SourceSpan): CallBindingDiagnostic[] =>
  d.filter((x) => x.span.startLine === s.startLine && x.span.startCol === s.startCol);

describe("bindCallArguments", () => {
  it("binds positional, named, case-insensitive, output and variadic arguments to their slots", () => {
    const [mx, inp, mn] = [arg(10, "MX"), arg(5, "IN"), arg(0, "MN")];
    const named = bindCallArguments(LIMIT, [mx, inp, mn], CALL, LIMIT_OPTS);
    expect(named.diagnostics).toEqual([]);
    expect(named.slots).toEqual([mn, inp, mx]);
    expect(named.params.map((p) => p.name)).toEqual(["MN", "IN", "MX"]);

    const pos = [arg(0), arg(5), arg(10)];
    const positional = bindCallArguments(LIMIT, pos, CALL, LIMIT_OPTS);
    expect(positional.diagnostics).toEqual([]);
    expect(positional.slots).toEqual(pos);

    const fn: CallParam[] = [
      input("A"),
      input("B", false),
      input("C"),
      { name: "IO", direction: "inout", required: true },
      { name: "Q", direction: "output", required: false },
    ];
    const [a, c, io, q] = [arg(1), arg(3, "c"), arg(4, "Io"), arg(9, "Q", true)];
    const mixed = bindCallArguments(fn, [a, c, io, q], CALL, { calleeLabel: "function 'F'" });
    expect(mixed.diagnostics).toEqual([]);
    expect(mixed.slots).toEqual([a, undefined, c, io, q]);

    const mux: CallParam[] = [input("K"), input("IN0"), input("IN1")];
    const muxArgs = [arg(1), arg(10), arg(20), arg(30), arg(40)];
    const variadic = bindCallArguments(mux, muxArgs, CALL, {
      calleeLabel: "function 'MUX'",
      variadic: { prefix: "IN", firstIndex: 2 },
    });
    expect(variadic.diagnostics).toEqual([]);
    expect(variadic.slots).toEqual(muxArgs);
    expect(variadic.params.map((p) => p.name)).toEqual(["K", "IN0", "IN1", "IN2", "IN3"]);

    const max: CallParam[] = [input("IN1"), input("IN2")];
    const [m1, m2, m3] = [arg(1, "IN1"), arg(2, "IN2"), arg(3, "in3")];
    const variadicNamed = bindCallArguments(max, [m3, m1, m2], CALL, {
      calleeLabel: "function 'MAX'",
      variadic: { prefix: "IN", firstIndex: 3 },
    });
    expect(variadicNamed.diagnostics).toEqual([]);
    expect(variadicNamed.slots).toEqual([m1, m2, m3]);
    expect(variadicNamed.params.map((p) => p.name)).toEqual(["IN1", "IN2", "IN3"]);
  });

  it("reports each malformed call as a diagnostic at the faulty argument or the call, without throwing", () => {
    const mxx = arg(10, "MXX");
    const unknown = bindCallArguments(LIMIT, [arg(0, "MN"), arg(5, "IN"), mxx], CALL, LIMIT_OPTS);
    expect(at(unknown.diagnostics, mxx.sourceSpan)).toHaveLength(1);
    expect(at(unknown.diagnostics, mxx.sourceSpan)[0]!.message).toContain("MXX");

    const dup = arg(1, "MN");
    const duplicate = bindCallArguments(
      LIMIT,
      [arg(0, "MN"), dup, arg(5, "IN"), arg(10, "MX")],
      CALL,
      LIMIT_OPTS,
    );
    expect(at(duplicate.diagnostics, dup.sourceSpan)).toHaveLength(1);
    expect(at(duplicate.diagnostics, dup.sourceSpan)[0]!.message).toContain("MN");

    const late = arg(5);
    const afterNamed = bindCallArguments(LIMIT, [arg(0, "MN"), late, arg(10)], CALL, LIMIT_OPTS);
    expect(at(afterNamed.diagnostics, late.sourceSpan)).toHaveLength(1);

    const missing = bindCallArguments(LIMIT, [arg(5, "IN"), arg(10, "MX")], CALL, LIMIT_OPTS);
    expect(missing.diagnostics).toHaveLength(1);
    expect(missing.diagnostics[0]!.span).toEqual(CALL);
    expect(missing.diagnostics[0]!.message).toMatch(/\bMN\b/);

    const outOnInput = arg(5, "IN", true);
    const arrow = bindCallArguments(LIMIT, [arg(0, "MN"), outOnInput, arg(10, "MX")], CALL, LIMIT_OPTS);
    expect(at(arrow.diagnostics, outOnInput.sourceSpan)).toHaveLength(1);

    const tooMany = bindCallArguments(LIMIT, [arg(0), arg(5), arg(10), arg(15)], CALL, LIMIT_OPTS);
    expect(tooMany.diagnostics).toHaveLength(1);

    const concat = [input("IN1"), input("IN2")];
    const third = arg(3);
    const overMax = bindCallArguments(concat, [arg(1), arg(2), third], CALL, {
      calleeLabel: "function 'CONCAT'",
      maxArgs: 2,
    });
    expect(overMax.diagnostics).toHaveLength(1);
    expect([CALL.startCol, third.sourceSpan.startCol]).toContain(overMax.diagnostics[0]!.span.startCol);

    const empty = bindCallArguments(LIMIT, [], CALL, LIMIT_OPTS);
    expect(empty.slots).toEqual([undefined, undefined, undefined]);
    expect(empty.diagnostics.map((d) => d.span)).toEqual([CALL, CALL, CALL]);

    expect(bindCallArguments([], [], CALL, { calleeLabel: "function 'NOPE'" }).diagnostics).toEqual([]);
    const unknownCallee = bindCallArguments([], [arg(1), arg(2, "X"), arg(3, "", true)], CALL, {
      calleeLabel: "function 'NOPE'",
    });
    expect(unknownCallee.diagnostics.length).toBeGreaterThan(0);
  });
});
