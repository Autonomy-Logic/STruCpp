/**
 * Code-generation tests for IEC 61131-3 `structure_initialization`
 * (Annex B.1.4.3) and for composite initialisers on PROGRAM variables.
 *
 * A structure initializer lowers to `strucpp::iec_struct_init<T>([](auto& v0){…})`
 * rather than a braced aggregate initializer: elements may be written in any
 * order and may be omitted (an omitted element keeps the default from its own
 * declaration), and C++17 has no designated initializers to express that. The
 * runtime helper default-constructs the value — which applies every element's own
 * default — and the lambda overwrites only the elements that are named.
 *
 * Nested levels take their type from `decltype(v0.MEMBER)`, so no metadata
 * lookup is needed for library types or inline array members.
 */

import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.js";

function compileST(source: string): {
  cppCode: string;
  headerCode: string;
  success: boolean;
  errors: { message: string }[];
} {
  const result = compile(source);
  return {
    cppCode: result.cppCode,
    headerCode: result.headerCode,
    success: result.success,
    errors: result.errors as { message: string }[],
  };
}

function expectOk(result: { success: boolean; errors: { message: string }[] }) {
  expect(result.errors.map((e) => e.message)).toEqual([]);
  expect(result.success).toBe(true);
}

/** The constructor initializer-list line of a generated class. */
function initList(cpp: string): string {
  return cpp.split("\n").find((l) => l.trimStart().startsWith(": ")) ?? "";
}

const POINT_TYPE = `
  TYPE
    Point : STRUCT
      x : REAL;
      y : REAL;
    END_STRUCT;
  END_TYPE
`;

describe("structure initializers — file-level VAR_GLOBAL", () => {
  it("initialises a struct global through the runtime helper", () => {
    const result = compileST(`
      ${POINT_TYPE}
      VAR_GLOBAL
        origin : Point := (x := 1.0, y := 2.0);
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain(
      "inline POINT ORIGIN = strucpp::iec_struct_init<POINT>([](auto& v0) { v0.X = 1.0; v0.Y = 2.0; });",
    );
  });

  it("emits elements in the order written, not in declaration order", () => {
    // The helper assigns, so source order is preserved and harmless — unlike a
    // positional aggregate initializer, which would silently swap the values.
    const result = compileST(`
      ${POINT_TYPE}
      VAR_GLOBAL
        p : Point := (y := 2.0, x := 1.0);
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain("v0.Y = 2.0; v0.X = 1.0;");
  });

  it("leaves an omitted element to its own declared default", () => {
    const result = compileST(`
      TYPE
        Scale : STRUCT
          lo : REAL := 4.0;
          hi : REAL := 20.0;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        s : Scale := (hi := 22.0);
      END_VAR
    `);
    expectOk(result);
    // The struct keeps its own member defaults …
    expect(result.headerCode).toContain("IEC_REAL LO = 4;");
    // … and only the named element is overwritten.
    expect(result.headerCode).toContain(
      "strucpp::iec_struct_init<SCALE>([](auto& v0) { v0.HI = 22.0; })",
    );
  });

  it("keeps a CONSTANT struct global const-qualified", () => {
    const result = compileST(`
      ${POINT_TYPE}
      VAR_GLOBAL CONSTANT
        origin : Point := (x := 0.0, y := 0.0);
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain("const inline POINT ORIGIN =");
  });
});

describe("structure initializers — CONFIGURATION VAR_GLOBAL", () => {
  it("initialises the GlobalVar wrapper's value", () => {
    const result = compileST(`
      ${POINT_TYPE}
      CONFIGURATION Cfg
        VAR_GLOBAL
          origin : Point := (x := 1.0, y := 2.0);
        END_VAR
      END_CONFIGURATION
    `);
    expectOk(result);
    expect(result.headerCode).toContain(
      "inline GlobalVar<POINT> ORIGIN{strucpp::iec_struct_init<POINT>([](auto& v0) { v0.X = 1.0; v0.Y = 2.0; })};",
    );
  });

  it("names the type for an array initialiser, which GlobalVar cannot deduce", () => {
    // GlobalVar's initialising ctor is `template<typename T> GlobalVar(T)`, so a
    // bare `{1, 2, 3}` has nothing to deduce from.
    const result = compileST(`
      CONFIGURATION Cfg
        VAR_GLOBAL
          arr : ARRAY[0..2] OF INT := [1, 2, 3];
        END_VAR
      END_CONFIGURATION
    `);
    expectOk(result);
    expect(result.headerCode).toContain(
      "inline GlobalVar<Array1D<IEC_INT, 0, 2>> ARR{Array1D<IEC_INT, 0, 2>{1, 2, 3}};",
    );
  });
});

describe("structure initializers — PROGRAM variables", () => {
  it("initialises a struct member in the constructor initialiser list", () => {
    const result = compileST(`
      ${POINT_TYPE}
      PROGRAM Main
        VAR p : Point := (x := 1.0, y := 2.0); END_VAR
        p.x := p.y;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain(
      "P(strucpp::iec_struct_init<POINT>([](auto& v0) { v0.X = 1.0; v0.Y = 2.0; }))",
    );
  });

  it("nests through decltype of the member being assigned", () => {
    const result = compileST(`
      TYPE
        Inner : STRUCT a : INT; END_STRUCT;
        Outer : STRUCT
          i : Inner;
          b : INT;
        END_STRUCT;
      END_TYPE
      PROGRAM Main
        VAR o : Outer := (i := (a := 5), b := 7); END_VAR
        o.b := o.i.a;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain(
      "O(strucpp::iec_struct_init<OUTER>([](auto& v0) { " +
        "v0.I = strucpp::iec_struct_init<decltype(v0.I)>([](auto& v1) { v1.A = 5; }); " +
        "v0.B = 7; }))",
    );
  });

  it("initialises an array of structs element by element", () => {
    const result = compileST(`
      ${POINT_TYPE}
      PROGRAM Main
        VAR
          pts : ARRAY[0..1] OF Point := [(x := 1.0, y := 2.0), (x := 3.0, y := 4.0)];
        END_VAR
        pts[0].x := pts[1].y;
      END_PROGRAM
    `);
    expectOk(result);
    const inits = initList(result.cppCode);
    // The element type comes from the array type, so no metadata lookup.
    expect(inits).toContain(
      "typename Array1D<POINT, 0, 1>::element_type>([](auto& v0) { v0.X = 1.0; v0.Y = 2.0; })",
    );
    expect(inits).toContain(
      "typename Array1D<POINT, 0, 1>::element_type>([](auto& v0) { v0.X = 3.0; v0.Y = 4.0; })",
    );
  });

  it("initialises a function block instance's inputs", () => {
    // IEC 61131-3 uses the same `structure_initialization` production for
    // `fb_name_decl`, so an FB instance sets its initial inputs this way.
    const result = compileST(`
      FUNCTION_BLOCK Ramp
        VAR_INPUT
          step : REAL := 1.0;
          period : TIME := T#100ms;
        END_VAR
        step := step;
      END_FUNCTION_BLOCK
      PROGRAM Main
        VAR r : Ramp := (period := T#1s, step := 2.5); END_VAR
        r();
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain(
      "R(strucpp::iec_struct_init<RAMP>([](auto& v0) { v0.PERIOD = 1000000000LL; v0.STEP = 2.5; }))",
    );
  });
});

describe("structure initializers — FUNCTION_BLOCK, FUNCTION and METHOD", () => {
  it("initialises a function block member", () => {
    const result = compileST(`
      ${POINT_TYPE}
      FUNCTION_BLOCK FB
        VAR p : Point := (x := 1.0, y := 2.0); END_VAR
        p.x := p.y;
      END_FUNCTION_BLOCK
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain(
      "P(strucpp::iec_struct_init<POINT>([](auto& v0) { v0.X = 1.0; v0.Y = 2.0; }))",
    );
  });

  it("initialises a function local", () => {
    const result = compileST(`
      ${POINT_TYPE}
      FUNCTION F : REAL
        VAR p : Point := (x := 1.5, y := 2.5); END_VAR
        F := p.x;
      END_FUNCTION
    `);
    expectOk(result);
    expect(result.cppCode).toContain(
      "POINT P = strucpp::iec_struct_init<POINT>([](auto& v0) { v0.X = 1.5; v0.Y = 2.5; });",
    );
  });

  it("initialises a method local", () => {
    const result = compileST(`
      ${POINT_TYPE}
      FUNCTION_BLOCK FB
        METHOD M : REAL
          VAR p : Point := (x := 1.5); END_VAR
          M := p.x;
        END_METHOD
      END_FUNCTION_BLOCK
    `);
    expectOk(result);
    expect(result.cppCode).toContain(
      "POINT P = strucpp::iec_struct_init<POINT>([](auto& v0) { v0.X = 1.5; });",
    );
  });
});

describe("structure initializers — STRUCT element defaults", () => {
  it("lowers a nested structure default on a STRUCT element", () => {
    const result = compileST(`
      TYPE
        Inner : STRUCT a : INT; END_STRUCT;
        Outer : STRUCT
          i : Inner := (a := 5);
          b : INT := 7;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        o : Outer;
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain(
      "INNER I = strucpp::iec_struct_init<INNER>([](auto& v0) { v0.A = 5; });",
    );
  });

  it("keeps the values of an array-literal default on a STRUCT element", () => {
    // These were dropped to `{}` with no diagnostic: the type generator's
    // expression emitter had no array-literal case, so the value fell through to
    // its `0` fallback and the array guard rewrote that as `{}`.
    const result = compileST(`
      TYPE
        Buf : STRUCT
          data : ARRAY[0..3] OF INT := [7, 8, 9, 10];
          n : INT := 4;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        b : Buf;
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain(
      "Array1D<IEC_INT, 0, 3> DATA = {7, 8, 9, 10};",
    );
  });

  it("expands a repetition group in a STRUCT element default", () => {
    const result = compileST(`
      TYPE
        Buf : STRUCT
          data : ARRAY[0..3] OF INT := [4(7)];
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        b : Buf;
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain(
      "Array1D<IEC_INT, 0, 3> DATA = {7, 7, 7, 7};",
    );
  });

  it("escapes a STRING element default the way the expression path does", () => {
    // The type generator used to emit the literal body verbatim, so an embedded
    // `"` closed the C++ string early. Latent until array-literal defaults
    // started emitting (OSCAT's HTML-entity tables are STRING arrays full of
    // quotes and backslashes).
    const result = compileST(`
      TYPE
        Msg : STRUCT
          quoted : STRING := 'say "hi"';
          tabbed : STRING := 'a$Tb';
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        m : Msg;
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain('QUOTED = "say \\"hi\\""');
    expect(result.headerCode).toContain('TABBED = "a\\tb"');
  });

  it("escapes STRING elements inside an array-literal default", () => {
    const result = compileST(`
      TYPE
        Table : STRUCT
          names : ARRAY[0..1] OF STRING := ['a"b', 'plain'];
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        t : Table;
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain('{"a\\"b", "plain"}');
  });

  it("still value-initialises an array element with no default", () => {
    const result = compileST(`
      TYPE
        Buf : STRUCT
          data : ARRAY[0..3] OF INT;
        END_STRUCT;
      END_TYPE
      VAR_GLOBAL
        b : Buf;
      END_VAR
    `);
    expectOk(result);
    expect(result.headerCode).toContain("Array1D<IEC_INT, 0, 3> DATA{};");
  });
});

describe("structure initializers — type-level defaults", () => {
  it("applies an initialised structure type's default to a declaration", () => {
    const result = compileST(`
      ${POINT_TYPE}
      TYPE
        Origin : Point := (x := 0.0, y := 0.0);
      END_TYPE
      PROGRAM Main
        VAR p : Origin; END_VAR
        p.x := p.y;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain(
      "P(strucpp::iec_struct_init<ORIGIN>([](auto& v0) { v0.X = 0.0; v0.Y = 0.0; }))",
    );
  });

  it("applies an initialised simple type's default to a declaration", () => {
    const result = compileST(`
      TYPE
        Setpoint : REAL := 25.0;
      END_TYPE
      PROGRAM Main
        VAR s : Setpoint; END_VAR
        s := s;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain("S(25.0)");
  });

  it("applies a type default across files (resolved on the merged unit)", () => {
    // The TYPE and the declaration that uses it can live in different files, so
    // the per-unit pass can't see across — the merge re-runs it.
    const result = compile(
      `
      PROGRAM Main
        VAR p : Origin; END_VAR
        p.x := p.y;
      END_PROGRAM
      `,
      {
        additionalSources: [
          {
            source: `
              ${POINT_TYPE}
              TYPE
                Origin : Point := (x := 1.5, y := 2.5);
              END_TYPE
            `,
            fileName: "types.st",
          },
        ],
      },
    );
    expect(
      result.errors.map((e) => (e as { message: string }).message),
    ).toEqual([]);
    expect(result.success).toBe(true);
    expect(initList(result.cppCode)).toContain(
      "P(strucpp::iec_struct_init<ORIGIN>([](auto& v0) { v0.X = 1.5; v0.Y = 2.5; }))",
    );
  });

  it("qualifies a simple enum's default value", () => {
    const result = compileST(`
      TYPE
        Light : (RED, GREEN) := GREEN;
      END_TYPE
      PROGRAM Main
        VAR l : Light; END_VAR
        l := l;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain("L(LIGHT::GREEN)");
  });
});

describe("composite initialisers on PROGRAM variables", () => {
  // These were silently dropped: PROGRAM variables reached codegen through a
  // stringified copy of the initializer that had no case for array literals, so
  // the constructor came out empty with no diagnostic.
  it("emits a bracketed array literal initialiser", () => {
    const result = compileST(`
      PROGRAM Main
        VAR arr : ARRAY[0..2] OF INT := [1, 2, 3]; END_VAR
        arr[0] := 0;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain("ARR({1, 2, 3})");
  });

  it("emits the legacy comma-separated array initialiser", () => {
    const result = compileST(`
      PROGRAM Main
        VAR arr : ARRAY[0..3] OF INT := 0, 31, 59, 90; END_VAR
        arr[0] := 0;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain("ARR({0, 31, 59, 90})");
  });

  it("emits a 2D array literal initialiser", () => {
    const result = compileST(`
      PROGRAM Main
        VAR m : ARRAY[0..1, 0..1] OF INT := [1, 2, 3, 4]; END_VAR
        m[0, 0] := 0;
      END_PROGRAM
    `);
    expectOk(result);
    expect(initList(result.cppCode)).toContain("M({1, 2, 3, 4})");
  });

  it("still skips composite types that have no initialiser", () => {
    const result = compileST(`
      ${POINT_TYPE}
      PROGRAM Main
        VAR p : Point; arr : ARRAY[0..2] OF INT; END_VAR
        p.x := 1.0;
      END_PROGRAM
    `);
    expectOk(result);
    // Nothing to initialise → default constructors, so no initialiser list.
    expect(initList(result.cppCode)).toBe("");
  });
});
