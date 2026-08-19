import { describe, expect, it } from "vitest";
import { analyze, compile } from "../../src/index.js";
import { lowerToIr } from "../../src/ir/from-ast.js";

// The IR sits beside the C++ generator, not in front of it. These tests exist to
// keep that true: if a future change makes lowering mutate the AST or otherwise
// perturb shared state, the C++ output would start depending on whether the IR
// was requested, and that is exactly the regression nobody would notice by hand.

const SOURCE = `
  TYPE Limits : STRUCT
    lo : INT;
    hi : INT;
  END_STRUCT END_TYPE

  FUNCTION Clamp : INT
  VAR_INPUT v : INT; lim : Limits; END_VAR
    IF v < lim.lo THEN
      Clamp := lim.lo;
    ELSIF v > lim.hi THEN
      Clamp := lim.hi;
    ELSE
      Clamp := v;
    END_IF;
  END_FUNCTION

  PROGRAM Main
  VAR
    raw AT %IW0 : INT;
    out AT %QW0 : INT;
    bounds : Limits;
    i : INT;
  END_VAR
    FOR i := 1 TO 3 DO
      out := Clamp(raw, bounds);
    END_FOR;
  END_PROGRAM
`;

describe("IR isolation from the C++ backend", () => {
  it("produces identical C++ whether or not the IR was lowered", () => {
    const before = compile(SOURCE, { fileName: "iso.st" });
    expect(before.success).toBe(true);

    const { ast } = analyze(SOURCE, { fileName: "iso.st" });
    expect(ast).toBeDefined();
    lowerToIr(ast!, { moduleName: "iso", producerVersion: "test" });

    const after = compile(SOURCE, { fileName: "iso.st" });
    expect(after.success).toBe(true);
    expect(after.cppCode).toBe(before.cppCode);
    expect(after.headerCode).toBe(before.headerCode);
  });

  it("treats the AST as read-only", () => {
    const { ast } = analyze(SOURCE, { fileName: "iso.st" });
    expect(ast).toBeDefined();
    const snapshot = JSON.stringify(ast, (_k, v) =>
      typeof v === "bigint" ? String(v) : v,
    );

    lowerToIr(ast!, { moduleName: "iso", producerVersion: "test" });

    const afterwards = JSON.stringify(ast, (_k, v) =>
      typeof v === "bigint" ? String(v) : v,
    );
    expect(afterwards).toBe(snapshot);
  });

  it("lowering the same AST twice is deterministic", () => {
    const { ast } = analyze(SOURCE, { fileName: "iso.st" });
    const a = lowerToIr(ast!, { moduleName: "iso", producerVersion: "test" });
    const b = lowerToIr(ast!, { moduleName: "iso", producerVersion: "test" });
    expect(b.module).toEqual(a.module);
    expect(b.diagnostics).toEqual(a.diagnostics);
  });

  it("never throws, whatever the front end hands it", () => {
    // Constructs the lowering does not cover yet must degrade to diagnostics.
    const odd = `
      PROGRAM Odd
      VAR
        p : POINTER TO INT;
        s : STRING := 'hello';
        v : INT;
      END_VAR
        v := p^;
        s := CONCAT(s, 'world');
      END_PROGRAM
    `;
    const { ast } = analyze(odd, { fileName: "odd.st" });
    expect(ast).toBeDefined();
    expect(() =>
      lowerToIr(ast!, { moduleName: "odd", producerVersion: "test" }),
    ).not.toThrow();
  });
});
