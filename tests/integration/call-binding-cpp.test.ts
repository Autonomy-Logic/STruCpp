// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Call argument binding as seen from the compiler: calls written in declaration order keep their C++ byte for byte,
 * and malformed calls are STruC++ compile errors at the faulty argument or the call.
 */
import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";
import { compileStlib } from "../../src/library/library-compiler.js";
import { loadStlibFromString } from "../../src/library/library-loader.js";
import type { CompileError } from "../../src/types.js";

const TOOL_LIB = `FUNCTION_BLOCK Tool
  METHOD Take : INT
    VAR_INPUT x : INT; y : INT := 2; END_VAR
    VAR_OUTPUT w : INT; END_VAR
    VAR_IN_OUT z : INT; END_VAR
    z := z + x + y; w := z; Take := z;
  END_METHOD
END_FUNCTION_BLOCK`;

const DECLARATION_ORDER = `FUNCTION Mix : INT
  VAR_INPUT a : INT; b : INT := 7; END_VAR
  VAR_IN_OUT io : INT; END_VAR
  VAR_OUTPUT o : INT; END_VAR
  io := io + a; o := b; Mix := a + b;
END_FUNCTION
FUNCTION_BLOCK Acc
  VAR_INPUT step : INT; END_VAR
  VAR_OUTPUT total : INT; END_VAR
  VAR_IN_OUT buf : INT; END_VAR
  METHOD Put : INT
    VAR_INPUT x : INT; y : INT := 2; END_VAR
    VAR_IN_OUT z : INT; END_VAR
    VAR_OUTPUT w : INT; END_VAR
    z := z + x + y; w := z; Put := z;
  END_METHOD
  total := total + step; buf := total;
END_FUNCTION_BLOCK
PROGRAM P
  VAR a1 : Acc; t : Tool; i, j, k, r : INT; END_VAR
  r := Mix(i, 3, j, k);
  r := Mix(a := i, b := 3, io := j, o => k);
  r := Mix(a := i, io := j);
  a1(step := i, buf := j, total => k);
  a1(i, buf := j);
  r := a1.Put(i, 3, j, k);
  r := a1.Put(x := i, y := 3, z := j, w => k);
  r := a1.Put(x := i, z := j);
  r := t.Take(i, 3, k, j);
  r := t.Take(x := i, y := 3, w => k, z := j);
  r := t.Take(x := i, z := j);
  r := LIMIT(0, i, 10);
  r := LIMIT(MN := 0, IN := i, MX := 10);
END_PROGRAM`;

/** C++ of `Program_P::run()` for DECLARATION_ORDER, recorded from the compiler before the binder existed. */
const RECORDED_RUN = `void Program_P::run() {
    R = MIX(I, 3, J, K);
    R = MIX(I, 3, J, K);
    IEC_INT __output_tmp_0;
    R = MIX(I, 7, J, __output_tmp_0);
    A1.STEP = I;
    A1.BUF = J;
    A1();
    A1.ENO = true;
    J = A1.BUF;
    K = A1.TOTAL;
    A1.STEP = I;
    A1.BUF = J;
    A1();
    A1.ENO = true;
    J = A1.BUF;
    R = A1.PUT(I, 3, J, K);
    R = A1.PUT(I, 3, J, K);
    IEC_INT __output_tmp_1;
    R = A1.PUT(I, 2, J, __output_tmp_1);
    R = T.TAKE(I, 3, K, J);
    R = T.TAKE(I, 3, K, J);
    IEC_INT __output_tmp_2;
    R = T.TAKE(I, 2, __output_tmp_2, J);
    R = LIMIT(static_cast<IEC_INT>(0), I, static_cast<IEC_INT>(10));
    R = LIMIT(static_cast<IEC_INT>(0), I, static_cast<IEC_INT>(10));
}
`;

/** Errors of `source` reported at `line`:`column`. */
function errorsAt(source: string, line: number, column: number): CompileError[] {
  const result = compile(source);
  expect(result.success).toBe(false);
  return result.errors.filter((e) => e.line === line && e.column === column);
}

describe("call argument binding in the compiler", () => {
  it("keeps the C++ of user function, method, FB, library method and standard calls in declaration order", () => {
    const lib = compileStlib([{ fileName: "tool.st", source: TOOL_LIB }], {
      name: "tools",
      version: "1.0.0",
      namespace: "tools",
    });
    expect(lib.errors).toEqual([]);
    const archive = loadStlibFromString(JSON.stringify(lib.archive), "tools");
    const result = compile(DECLARATION_ORDER, { libraries: [archive] });
    expect(result.errors).toEqual([]);
    expect(result.cppCode.match(/void Program_P::run\(\) \{[\s\S]*?\n\}\n/)?.[0]).toBe(RECORDED_RUN);
  });

  it("reports binder errors and a three-input CONCAT as compile errors with line and column", () => {
    const concat = compile(`PROGRAM P
  VAR a, b, c, s : STRING; END_VAR
  s := CONCAT(a, b, c);
END_PROGRAM`);
    expect(concat.success).toBe(false);
    const concatErrors = concat.errors.filter((e) => e.line === 3 && (e.column === 8 || e.column === 21));
    expect(concatErrors).toHaveLength(1);
    expect(concatErrors[0]!.message).toContain("CONCAT");

    const unknown = errorsAt(
      `PROGRAM P
  VAR r : INT; END_VAR
  r := LIMIT(MN := 0, IN := 5, MXX := 10);
END_PROGRAM`,
      3,
      32,
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.message).toContain("MXX");

    const positionalAfterNamed = errorsAt(
      `PROGRAM P
  VAR r : INT; END_VAR
  r := LIMIT(MN := 0, 5, 10);
END_PROGRAM`,
      3,
      23,
    );
    expect(positionalAfterNamed).toHaveLength(1);

    const missing = errorsAt(
      `PROGRAM P
  VAR r : INT; END_VAR
  r := LIMIT(IN := 5, MX := 10);
END_PROGRAM`,
      3,
      8,
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]!.message).toMatch(/\bMN\b/);

    const duplicateFunctionArg = errorsAt(
      `FUNCTION F : INT VAR_INPUT a : INT; b : INT; END_VAR F := a + b; END_FUNCTION
PROGRAM P
  VAR r : INT; END_VAR
  r := F(a := 1, a := 2, b := 3);
END_PROGRAM`,
      4,
      18,
    );
    expect(duplicateFunctionArg).toHaveLength(1);
    expect(duplicateFunctionArg[0]!.message).toMatch(/\bA\b/);

    const duplicateBlockArg = errorsAt(
      `FUNCTION_BLOCK FB VAR_INPUT a : INT; END_VAR END_FUNCTION_BLOCK
PROGRAM P
  VAR f : FB; END_VAR
  f(a := 1, a := 2);
END_PROGRAM`,
      4,
      13,
    );
    expect(duplicateBlockArg).toHaveLength(1);
    expect(duplicateBlockArg[0]!.message).toMatch(/\bA\b/);
  });
});
