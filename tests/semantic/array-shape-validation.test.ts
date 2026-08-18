/**
 * Semantic validation of array declarations and accesses against the declared
 * shape:
 *
 *   - an initializer's nesting must match the array's rank
 *   - an initializer must not supply more values than the array (or a row) holds
 *   - a subscript must supply one index per dimension
 *
 * All three used to escape the compiler: a nesting or rank mistake surfaced as a
 * C++ error against generated code (`no matching constructor`, `no matching
 * member function for call to 'at'`), and an over-long initializer was silently
 * truncated by the runtime container's constructor — the array simply came out
 * with values missing and no diagnostic anywhere.
 *
 * The accepted cases matter as much as the rejected ones: every check is skipped
 * rather than guessed at when the shape isn't statically known, so this can only
 * add diagnostics for definite mistakes.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

function errorsFor(source: string): string[] {
  return compile(source).errors.map((e) => e.message);
}

function expectClean(source: string): void {
  expect(errorsFor(source)).toEqual([]);
}

/** Wrap declarations + body in a PROGRAM. */
function prog(vars: string, body = "  dummy := 0;"): string {
  return `
PROGRAM Main
  VAR
${vars}
    dummy : INT;
  END_VAR
${body}
END_PROGRAM
`;
}

describe("array initializer: over-long", () => {
  it("rejects more values than a 1D array holds", () => {
    const errors = errorsFor(
      prog("    a : ARRAY[0..2] OF INT := [1,2,3,4,5,6];"),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("has 6 values but the array holds 3");
  });

  it("rejects a repetition group that expands past the array", () => {
    const errors = errorsFor(prog("    a : ARRAY[0..2] OF INT := [10(7)];"));
    expect(errors[0]).toContain("has 10 values but the array holds 3");
  });

  it("rejects a flat list longer than a multi-dimensional array", () => {
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT := [1,2,3,4,5];"),
    );
    expect(errors[0]).toContain("has 5 values but the array holds 4");
  });

  it("rejects a row longer than its dimension", () => {
    // Silently truncated before: `3` and `6` were dropped.
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT := [[1,2,3],[4,5,6]];"),
    );
    expect(errors[0]).toContain("has 3 values but the array holds 2");
  });

  it("rejects more rows than the first dimension holds", () => {
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT := [[1,2],[3,4],[5,6]];"),
    );
    expect(errors[0]).toContain("has 3 entries");
    expect(errors[0]).toContain("that dimension holds 2");
  });

  it("reports one diagnostic per declaration, not one per row", () => {
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT := [[1,2,3],[4,5,6]];"),
    );
    expect(errors).toHaveLength(1);
  });

  it("accepts fewer values than the array holds", () => {
    // A partial initializer is legal — the remainder keeps its default.
    expectClean(prog("    a : ARRAY[0..9] OF INT := [1,2,3];"));
  });

  it("accepts exactly as many values as the array holds", () => {
    expectClean(prog("    a : ARRAY[0..3] OF INT := [1,2,3,4];"));
  });
});

describe("array initializer: nesting", () => {
  it("rejects nesting on a 1D array of scalars", () => {
    const errors = errorsFor(
      prog("    a : ARRAY[0..3] OF INT := [[1,2],[3,4]];"),
    );
    expect(errors[0]).toContain("nested 2 levels deep");
    expect(errors[0]).toContain("has 1 dimension");
  });

  it("rejects nesting that stops short of the rank", () => {
    // Two levels into a 3D array: no container constructor matches, and it used
    // to reach g++ as "no matching constructor".
    const errors = errorsFor(
      prog("    c : ARRAY[0..1, 0..1, 0..2] OF INT := [[1,2,3],[4,5,6]];"),
    );
    expect(errors[0]).toContain("stops nesting at level 2");
    expect(errors[0]).toContain("2 dimensions remain");
  });

  it("rejects nesting deeper than the rank", () => {
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT := [[[1],[2]],[[3],[4]]];"),
    );
    expect(errors[0]).toContain("nested 3 levels deep");
  });

  it("rejects mixing nested and flat values", () => {
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT := [1, [2,3]];"),
    );
    expect(errors[0]).toContain("mixes nested and flat values");
  });

  it("accepts a flat list for a multi-dimensional array (row-major)", () => {
    expectClean(prog("    m : ARRAY[0..1, 0..2] OF INT := [1,2,3,4,5,6];"));
    expectClean(
      prog("    c : ARRAY[0..1, 0..1, 0..1] OF INT := [1,2,3,4,5,6,7,8];"),
    );
  });

  it("accepts nesting that matches the rank", () => {
    expectClean(prog("    m : ARRAY[0..1, 0..2] OF INT := [[1,2,3],[4,5,6]];"));
    expectClean(
      prog(
        "    c : ARRAY[0..1, 0..1, 0..1] OF INT := [[[1,2],[3,4]],[[5,6],[7,8]]];",
      ),
    );
  });

  it("accepts short rows — each keeps its own defaults", () => {
    expectClean(prog("    m : ARRAY[0..1, 0..2] OF INT := [[1],[4]];"));
  });

  it("accepts nesting into an array whose element type is itself an array", () => {
    expectClean(`
TYPE Row : ARRAY[0..2] OF INT; END_TYPE
PROGRAM Main
  VAR
    a : ARRAY[0..1] OF Row := [[1,2,3],[4,5,6]];
    dummy : INT;
  END_VAR
  dummy := 0;
END_PROGRAM
`);
  });

  it("accepts structure initializers as the elements of a nested array", () => {
    expectClean(`
TYPE Point : STRUCT x : INT; y : INT; END_STRUCT; END_TYPE
PROGRAM Main
  VAR
    g : ARRAY[0..1, 0..1] OF Point := [[(x:=1),(x:=2)],[(x:=3),(x:=4)]];
    dummy : INT;
  END_VAR
  dummy := 0;
END_PROGRAM
`);
  });
});

describe("array subscripts: index count", () => {
  it("rejects too few indices", () => {
    const errors = errorsFor(
      prog("    m : ARRAY[0..1, 0..1] OF INT;", "  dummy := m[0];"),
    );
    expect(errors).toHaveLength(1);
    // strucpp uppercases identifiers, as its other diagnostics do.
    expect(errors[0]).toBe("'M' has 2 dimensions but is indexed with 1 index.");
  });

  it("rejects too many indices", () => {
    const errors = errorsFor(
      prog("    a : ARRAY[0..3] OF INT;", "  dummy := a[0,1];"),
    );
    expect(errors[0]).toBe(
      "'A' has 1 dimension but is indexed with 2 indices.",
    );
  });

  it("rejects a wrong index count on a 3D array reached through a field", () => {
    // The reported case: widening the rank while leaving the accesses at two.
    const errors = errorsFor(`
TYPE Point : STRUCT x : REAL; y : REAL; END_STRUCT; END_TYPE
PROGRAM Main
  VAR
    p : ARRAY[0..1, 0..1, 0..2] OF Point;
    r : REAL;
  END_VAR
  r := p[0,0].x;
END_PROGRAM
`);
    expect(errors[0]).toContain("has 3 dimensions but is indexed with 2");
  });

  it("accepts the right index count at every rank", () => {
    expectClean(prog("    a : ARRAY[0..3] OF INT;", "  dummy := a[1];"));
    expectClean(
      prog("    m : ARRAY[0..1, 0..1] OF INT;", "  dummy := m[0,1];"),
    );
    expectClean(
      prog("    c : ARRAY[0..1, 0..1, 0..1] OF INT;", "  dummy := c[0,1,0];"),
    );
  });

  it("does not confuse a[0][1] with a[0,1]", () => {
    // An array of an array type is indexed one step at a time; the flat
    // `subscripts` list can't tell the two apart, so the check walks the
    // ordered access chain instead.
    expectClean(`
TYPE Row : ARRAY[0..2] OF INT; END_TYPE
PROGRAM Main
  VAR
    a : ARRAY[0..1] OF Row;
    dummy : INT;
  END_VAR
  dummy := a[0][1];
END_PROGRAM
`);
  });

  it("accepts a subscript on an array field of a struct", () => {
    expectClean(`
TYPE Buf : STRUCT data : ARRAY[0..1, 0..1] OF INT; END_STRUCT; END_TYPE
PROGRAM Main
  VAR
    b : Buf;
    dummy : INT;
  END_VAR
  dummy := b.data[0,1];
END_PROGRAM
`);
  });

  it("skips a variable-length array parameter, whose extent is unknown", () => {
    expectClean(`
FUNCTION F : INT
  VAR_INPUT v : ARRAY[*] OF INT; END_VAR
  F := v[0];
END_FUNCTION
`);
  });

  it("checks a global reached from a POU body", () => {
    const errors = errorsFor(`
VAR_GLOBAL
  g : ARRAY[0..1, 0..1] OF INT;
END_VAR
PROGRAM Main
  VAR dummy : INT; END_VAR
  dummy := g[0];
END_PROGRAM
`);
    expect(errors[0]).toContain("has 2 dimensions but is indexed with 1");
  });

  it("checks a function block member and a method local", () => {
    const errors = errorsFor(`
FUNCTION_BLOCK FB
  VAR m : ARRAY[0..1, 0..1] OF INT; out : INT; END_VAR
  METHOD Mth : INT
    VAR n : ARRAY[0..2] OF INT; END_VAR
    Mth := n[0,1];
  END_METHOD
  out := m[0];
END_FUNCTION_BLOCK
`);
    expect(errors.some((e) => e.includes("'M' has 2 dimensions"))).toBe(true);
    expect(errors.some((e) => e.includes("'N' has 1 dimension"))).toBe(true);
  });
});

describe("array shape validation: declarations everywhere", () => {
  it("checks a file-level VAR_GLOBAL initializer", () => {
    const errors = errorsFor(`
VAR_GLOBAL
  g : ARRAY[0..1] OF INT := [1,2,3];
END_VAR
`);
    expect(errors[0]).toContain("has 3 values but the array holds 2");
  });

  it("checks a CONFIGURATION VAR_GLOBAL initializer", () => {
    const errors = errorsFor(`
PROGRAM Main
  VAR dummy : INT; END_VAR
  dummy := 0;
END_PROGRAM
CONFIGURATION Cfg
  VAR_GLOBAL
    g : ARRAY[0..1] OF INT := [1,2,3];
  END_VAR
  RESOURCE Res ON PLC
    TASK T(INTERVAL := T#20ms, PRIORITY := 0);
    PROGRAM P WITH T : Main;
  END_RESOURCE
END_CONFIGURATION
`);
    expect(errors[0]).toContain("has 3 values but the array holds 2");
  });

  it("checks a STRUCT element default", () => {
    const errors = errorsFor(`
TYPE
  Buf : STRUCT
    data : ARRAY[0..1] OF INT := [1,2,3];
  END_STRUCT;
END_TYPE
`);
    expect(errors[0]).toContain("has 3 values but the array holds 2");
  });

  it("checks a FUNCTION_BLOCK member and a FUNCTION local", () => {
    const errors = errorsFor(`
FUNCTION_BLOCK FB
  VAR a : ARRAY[0..1] OF INT := [1,2,3]; out : INT; END_VAR
  out := 0;
END_FUNCTION_BLOCK
FUNCTION F : INT
  VAR b : ARRAY[0..1] OF INT := [4,5,6]; END_VAR
  F := 0;
END_FUNCTION
`);
    expect(errors).toHaveLength(2);
  });

  it("leaves a scalar initializer on an array alone", () => {
    // Meaningful for a STRUCT element (value-initialises), so rejecting it here
    // would flag working code.
    expectClean(`
TYPE
  Buf : STRUCT
    data : ARRAY[0..3] OF INT := 0;
  END_STRUCT;
END_TYPE
`);
  });
});
