// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Generic types (CODESYS `ANY`, `ANY_<type>`).
 *
 * Generics in user-declared POUs are outside IEC 61131-3, so these follow
 * CODESYS, as STruC++ already does for `__XWORD`, `ADR`, `SIZEOF` and
 * `MEMCPY`. The contract under test:
 *
 *   - seven declarable names, on a VAR_INPUT of a FUNCTION, FUNCTION_BLOCK or
 *     METHOD and nowhere else;
 *   - the argument is passed by reference, so only a variable may be supplied;
 *   - its type must be one the declared generic accepts;
 *   - the parameter becomes a `{ typeclass, pvalue, diSize }` descriptor.
 */

import { describe, expect, it } from "vitest";

import { compile } from "../../src/index.js";

const PROG = "PROGRAM main VAR i : INT; END_VAR i := 1; END_PROGRAM";

const compileSource = (source: string) => compile(source, {});
const errorText = (source: string) =>
  compileSource(source)
    .errors.map((e) => e.message)
    .join("\n");

describe("declaring a generic type", () => {
  it.each(["ANY", "ANY_BIT", "ANY_DATE", "ANY_NUM", "ANY_REAL", "ANY_INT", "ANY_STRING"])(
    "accepts %s on a function block VAR_INPUT",
    (generic) => {
      const result = compileSource(
        `FUNCTION_BLOCK F VAR_INPUT P : ${generic}; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`,
      );
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    },
  );

  it("accepts one on a FUNCTION and on a METHOD, the other two scopes CODESYS lists", () => {
    expect(
      compileSource(
        `FUNCTION F : BOOL VAR_INPUT P : ANY_INT; END_VAR F := TRUE; END_FUNCTION\n${PROG}`,
      ).success,
    ).toBe(true);
    expect(
      compileSource(
        "FUNCTION_BLOCK F METHOD M : BOOL VAR_INPUT P : ANY_REAL; END_VAR M := TRUE; END_METHOD ; END_FUNCTION_BLOCK\n" +
          PROG,
      ).success,
    ).toBe(true);
  });

  it("accepts one on an INTERFACE method, which is also a METHOD", () => {
    // Refusing it here would make the pair unwritable: the interface could not
    // declare a generic method that the implementing function block declares
    // happily.
    const iface =
      "INTERFACE ICalc METHOD Compute : BOOL VAR_INPUT P : ANY; END_VAR END_METHOD END_INTERFACE";
    expect(compileSource(`${iface}\n${PROG}`).success).toBe(true);

    const pair = `${iface}
FUNCTION_BLOCK F IMPLEMENTS ICalc
METHOD Compute : BOOL VAR_INPUT P : ANY; END_VAR Compute := TRUE; END_METHOD
;
END_FUNCTION_BLOCK
${PROG}`;
    expect(compileSource(pair).success).toBe(true);
  });

  it("refuses one as a structure field", () => {
    expect(errorText(`TYPE S : STRUCT F : ANY; END_STRUCT END_TYPE\n${PROG}`)).toContain(
      "may only be declared on a VAR_INPUT",
    );
  });

  it.each([
    ["VAR_OUTPUT", "FUNCTION_BLOCK F VAR_OUTPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK"],
    ["VAR_IN_OUT", "FUNCTION_BLOCK F VAR_IN_OUT P : ANY; END_VAR ; END_FUNCTION_BLOCK"],
    ["a local", "FUNCTION_BLOCK F VAR P : ANY; END_VAR ; END_FUNCTION_BLOCK"],
  ])("refuses one on %s", (_label, fb) => {
    expect(errorText(`${fb}\n${PROG}`)).toContain("may only be declared on a VAR_INPUT");
  });

  it("refuses one on a PROGRAM, which CODESYS does not list as a scope", () => {
    expect(errorText("PROGRAM main VAR_INPUT P : ANY; END_VAR ; END_PROGRAM")).toContain(
      "may only be declared on a VAR_INPUT",
    );
  });

  it("refuses one as a return type", () => {
    expect(
      errorText(`FUNCTION F : ANY VAR_INPUT a : INT; END_VAR ; END_FUNCTION\n${PROG}`),
    ).toContain("may only be declared on a VAR_INPUT");
  });

  it("refuses an array of one — a generic accepts elementary types only", () => {
    expect(
      errorText(
        `FUNCTION_BLOCK F VAR_INPUT P : ARRAY[0..3] OF ANY; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`,
      ),
    ).toContain("not as an array element");
  });

  it("does not make the classification-only categories declarable", () => {
    // ANY_ELEMENTARY, ANY_MAGNITUDE and ANY_DERIVED classify types internally,
    // but CODESYS does not let you write them, so neither do we.
    for (const name of ["ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_DERIVED"]) {
      expect(
        errorText(
          `FUNCTION_BLOCK F VAR_INPUT P : ${name}; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`,
        ),
      ).toContain(`Undefined type '${name}'`);
    }
  });
});

describe("passing an argument to a generic parameter", () => {
  const FBS = `
FUNCTION_BLOCK FB_ANY  VAR_INPUT P : ANY;        END_VAR ; END_FUNCTION_BLOCK
FUNCTION_BLOCK FB_INT  VAR_INPUT P : ANY_INT;    END_VAR ; END_FUNCTION_BLOCK
FUNCTION_BLOCK FB_REAL VAR_INPUT P : ANY_REAL;   END_VAR ; END_FUNCTION_BLOCK
FUNCTION_BLOCK FB_BIT  VAR_INPUT P : ANY_BIT;    END_VAR ; END_FUNCTION_BLOCK
FUNCTION_BLOCK FB_STR  VAR_INPUT P : ANY_STRING; END_VAR ; END_FUNCTION_BLOCK
TYPE MOTOR : STRUCT RPM : INT; END_STRUCT END_TYPE
`;
  const withBody = (body: string) => `${FBS}
PROGRAM main
VAR
  a : FB_ANY; ii : FB_INT; rr : FB_REAL; bb : FB_BIT; ss : FB_STR;
  iValue : INT; rValue : REAL; xFlag : BOOL; bByte : BYTE; sText : STRING; m : MOTOR;
END_VAR
${body}
END_PROGRAM`;

  it.each([
    ["ANY_INT from an INT", "ii(P := iValue);"],
    ["ANY_REAL from a REAL", "rr(P := rValue);"],
    ["ANY_BIT from a BOOL", "bb(P := xFlag);"],
    ["ANY_BIT from a BYTE", "bb(P := bByte);"],
    ["ANY_STRING from a STRING", "ss(P := sText);"],
    ["ANY from a STRING", "a(P := sText);"],
  ])("accepts %s", (_label, body) => {
    const result = compileSource(withBody(body));
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it.each([
    ["a REAL to ANY_INT", "ii(P := rValue);"],
    ["an INT to ANY_REAL", "rr(P := iValue);"],
    ["a REAL to ANY_BIT", "bb(P := rValue);"],
  ])("refuses %s", (_label, body) => {
    expect(errorText(withBody(body))).toContain("cannot be passed as argument");
  });

  it("refuses a structure — a generic accepts elementary types only", () => {
    expect(errorText(withBody("a(P := m);"))).toContain("elementary types only");
  });

  it.each([
    ["a literal", "a(P := 42);"],
    ["an expression", "a(P := iValue + 1);"],
  ])("refuses %s, which has no address to pass", (_label, body) => {
    expect(errorText(withBody(body))).toContain("Only a variable may be passed");
  });
});

describe("__SYSTEM.AnyType — storing what a generic handed over", () => {
  // `ANY` itself cannot be a variable: the descriptor is filled by the caller,
  // and a local has no caller. CODESYS's answer is to expose the structure, so
  // a block can keep a copy of what it was passed.
  const KEEPER = `
FUNCTION_BLOCK FB_KEEP
VAR_INPUT
  P : ANY;
END_VAR
VAR_OUTPUT
  CLS : DWORD;
  SZ : DINT;
END_VAR
VAR
  saved : __SYSTEM.AnyType;
END_VAR
  saved := P;
  CLS := saved.typeclass;
  SZ := saved.diSize;
END_FUNCTION_BLOCK

PROGRAM main
VAR
  fb : FB_KEEP;
  v : INT;
END_VAR
  fb(P := v);
END_PROGRAM`;

  it("declares, assigns and reads back", () => {
    const result = compileSource(KEEPER);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("is the same runtime type the parameter carries", () => {
    const cpp = compileSource(KEEPER).headerCode;
    expect(cpp).toContain("IEC_ANY P;");
    expect(cpp).toContain("IEC_ANY SAVED;");
  });

  it("reads its members in the case generated code uses", () => {
    const cpp = compileSource(KEEPER).cppCode;
    expect(cpp).toContain("SAVED = P;");
    expect(cpp).toContain("SAVED.TYPECLASS");
    expect(cpp).toContain("SAVED.DISIZE");
  });

  it("is concrete, so it may be declared where a generic may not", () => {
    // The restriction is on generics, and this is not one.
    for (const decl of [
      "FUNCTION_BLOCK F VAR d : __SYSTEM.AnyType; END_VAR ; END_FUNCTION_BLOCK",
      "FUNCTION_BLOCK F VAR_OUTPUT d : __SYSTEM.AnyType; END_VAR ; END_FUNCTION_BLOCK",
      "PROGRAM main VAR d : __SYSTEM.AnyType; END_VAR ; END_PROGRAM",
    ]) {
      const source = decl.startsWith("PROGRAM") ? decl : `${decl}\n${PROG}`;
      expect(compileSource(source).errors).toEqual([]);
    }
  });

  it("still rejects an unknown member of the __SYSTEM namespace", () => {
    expect(
      errorText(`FUNCTION_BLOCK F VAR d : __SYSTEM.NoSuchType; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`),
    ).toContain("Undefined type");
  });

  it("does not open dotted type names generally", () => {
    // The qualifier is gated on __SYSTEM, so a stray dot is still the error it
    // always was rather than being parsed as a namespace.
    expect(
      errorText(`FUNCTION_BLOCK F VAR d : Foo.Bar; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`),
    ).not.toBe("");
  });
});

describe("the emitted descriptor", () => {
  const emit = (decl: string, call: string) =>
    compileSource(`
FUNCTION_BLOCK FB_ANY VAR_INPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main
VAR
  fb : FB_ANY;
  ${decl}
END_VAR
  ${call}
END_PROGRAM`);

  it("stamps the argument's own type class, telling BYTE from USINT", () => {
    // The two share a C++ payload (`uint8_t`), so only the declaration
    // separates them — which is why the class comes from the IEC type name
    // rather than from a trait on the payload.
    const byte = emit("v : BYTE;", "fb(P := v);");
    const usint = emit("v : USINT;", "fb(P := v);");

    expect(byte.cppCode).toContain("strucpp::TYPE_CLASS::TYPE_BYTE");
    expect(usint.cppCode).toContain("strucpp::TYPE_CLASS::TYPE_USINT");
  });

  it("addresses the payload through raw_ptr, not the forcing wrapper", () => {
    expect(emit("v : INT;", "fb(P := v);").cppCode).toContain(
      "reinterpret_cast<uint8_t*>(V.raw_ptr())",
    );
  });

  it("sizes it with IEC_SIZEOF, the logical IEC width", () => {
    expect(emit("v : DINT;", "fb(P := v);").cppCode).toContain(
      "static_cast<int32_t>(strucpp::IEC_SIZEOF(V))",
    );
  });

  it.each(["ANY", "ANY_BIT", "ANY_DATE", "ANY_NUM", "ANY_REAL", "ANY_INT", "ANY_STRING"])(
    "declares a %s parameter as the one runtime descriptor type",
    (generic) => {
      // Every family is an IEC_ANY at the ABI. Left to the generic
      // `IEC_<NAME>` spelling this is right for ANY by luck and wrong for the
      // rest — `ANY_INT` would emit `IEC_ANY_INT`, which does not exist, and
      // only a project that used one would find out.
      const result = compileSource(
        `FUNCTION_BLOCK F VAR_INPUT P : ${generic}; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`,
      );
      expect(result.headerCode).toContain("IEC_ANY P;");
      // For `ANY` the naive spelling happens to be right, which is exactly why
      // it hid the bug; the other six are where it mattered.
      if (generic !== "ANY") {
        expect(result.headerCode).not.toContain(`IEC_${generic} P;`);
      }
    },
  );

  it("declares __SYSTEM.AnyType as that same type", () => {
    const result = compileSource(
      `FUNCTION_BLOCK F VAR d : __SYSTEM.AnyType; END_VAR ; END_FUNCTION_BLOCK\n${PROG}`,
    );
    expect(result.headerCode).toContain("IEC_ANY D;");
  });

  it("assigns a descriptor rather than the value", () => {
    const cpp = emit("v : REAL;", "fb(P := v);").cppCode;
    expect(cpp).toContain("FB.P = strucpp::IEC_ANY{");
    expect(cpp).not.toContain("FB.P = V;");
  });

  it("leaves a concrete parameter assigned exactly as before", () => {
    const result = compileSource(`
FUNCTION_BLOCK FB_INT VAR_INPUT P : INT; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main
VAR
  fb : FB_INT;
  v : INT;
END_VAR
  fb(P := v);
END_PROGRAM`);
    expect(result.cppCode).toContain("FB.P = V;");
    expect(result.cppCode).not.toContain("IEC_ANY{");
  });
});

describe("variable-length arrays as a function block's in-out", () => {
  // The parameter is an ArrayView carrying the runtime bounds, which is what
  // lets one block read arrays of different length and lower bound.
  const SRC = `
FUNCTION_BLOCK ARRAY_STATS
VAR_IN_OUT
  VALUES : ARRAY [*] OF INT;
END_VAR
VAR_OUTPUT
  TOTAL : DINT;
END_VAR
  TOTAL := 0;
END_FUNCTION_BLOCK

PROGRAM main
VAR
  stats : ARRAY_STATS;
  readings : ARRAY[0..3] OF INT;
END_VAR
  stats(VALUES := readings);
END_PROGRAM`;

  it("compiles", () => {
    const result = compileSource(SRC);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("binds the caller's array into the view", () => {
    expect(compileSource(SRC).cppCode).toContain("STATS.VALUES = READINGS;");
  });

  it("does not copy the view back afterwards", () => {
    // Every other in-out is copied back after the call. A view already
    // addresses the caller's array, so the writes have landed; copying back
    // would mean assigning an ArrayView to the concrete array it points at,
    // which is not a conversion that exists.
    expect(compileSource(SRC).cppCode).not.toContain("READINGS = STATS.VALUES;");
  });

  it("still copies a concrete in-out back", () => {
    const concrete = `
FUNCTION_BLOCK BUMP
VAR_IN_OUT
  N : INT;
END_VAR
  N := N + 1;
END_FUNCTION_BLOCK

PROGRAM main
VAR
  b : BUMP;
  count : INT;
END_VAR
  b(N := count);
END_PROGRAM`;
    const cpp = compileSource(concrete).cppCode;
    expect(cpp).toContain("B.N = COUNT;");
    expect(cpp).toContain("COUNT = B.N;");
  });
});

describe("a generic parameter on a METHOD", () => {
  // METHOD is one of the three scopes CODESYS declares generics in, so a
  // method call has to build the same descriptor a function block call does.
  //
  // It reaches codegen in two shapes: a MethodCallExpression, and — for
  // `x := inst.Method(y)`, which is how it is normally written — a
  // FunctionCallExpression whose name carries the dot. Handling only the first
  // changed nothing, and the second is the one that matters.
  const SRC = (call: string) => `
FUNCTION_BLOCK SENSOR
VAR_OUTPUT
  CLS : DWORD;
END_VAR
  METHOD PUBLIC Describe : INT
    VAR_INPUT
      SAMPLE : ANY_NUM;
    END_VAR
    CLS := SAMPLE.typeclass;
    Describe := 1;
  END_METHOD
  CLS := CLS;
END_FUNCTION_BLOCK

PROGRAM main
VAR
  s : SENSOR;
  r : REAL := 1.5;
  n : INT;
END_VAR
  ${call}
END_PROGRAM`;

  it("builds the descriptor for a named argument", () => {
    const result = compileSource(SRC("n := s.Describe(SAMPLE := r);"));
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain(
      "S.DESCRIBE(strucpp::IEC_ANY{ strucpp::TYPE_CLASS::TYPE_REAL",
    );
  });

  it("builds the descriptor for a positional argument", () => {
    const result = compileSource(SRC("n := s.Describe(r);"));
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain(
      "S.DESCRIBE(strucpp::IEC_ANY{ strucpp::TYPE_CLASS::TYPE_REAL",
    );
  });

  it("declares the parameter as the descriptor type", () => {
    expect(compileSource(SRC("n := s.Describe(r);")).headerCode).toContain(
      "DESCRIBE(IEC_ANY SAMPLE)",
    );
  });

  it("leaves a concrete method parameter alone", () => {
    const concrete = `
FUNCTION_BLOCK SENSOR
VAR_OUTPUT
  CLS : DWORD;
END_VAR
  METHOD PUBLIC Scale : REAL
    VAR_INPUT
      IN : REAL;
    END_VAR
    Scale := IN * 2.0;
  END_METHOD
  CLS := CLS;
END_FUNCTION_BLOCK

PROGRAM main
VAR
  s : SENSOR;
  r : REAL := 1.5;
  out : REAL;
END_VAR
  out := s.Scale(r);
END_PROGRAM`;
    const cpp = compileSource(concrete).cppCode;
    expect(cpp).toContain("S.SCALE(R)");
    expect(cpp).not.toContain("IEC_ANY{");
  });
});

describe("a generic parameter on a FUNCTION", () => {
  // FUNCTION is the third scope, and the one that had no descriptor at all:
  // the parameter was declared `IEC_ANY` in the header while the call site
  // passed the variable itself, which does not convert and does not compile.
  const SRC = (decl: string, call: string) => `
FUNCTION F_CLASS_OF : DWORD
  VAR_INPUT
    V : ANY;
  END_VAR
  F_CLASS_OF := V.typeclass;
END_FUNCTION

PROGRAM main
VAR
  ${decl}
  cls : DWORD;
END_VAR
  ${call}
END_PROGRAM`;

  it("builds the descriptor for a positional argument", () => {
    const result = compileSource(SRC("v : REAL;", "cls := F_CLASS_OF(v);"));
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain(
      "F_CLASS_OF(strucpp::IEC_ANY{ strucpp::TYPE_CLASS::TYPE_REAL",
    );
  });

  it("builds the descriptor for a named argument", () => {
    const result = compileSource(SRC("v : DINT;", "cls := F_CLASS_OF(V := v);"));
    expect(result.errors).toEqual([]);
    expect(result.cppCode).toContain(
      "F_CLASS_OF(strucpp::IEC_ANY{ strucpp::TYPE_CLASS::TYPE_DINT",
    );
  });

  it("never passes the variable itself, which would not convert", () => {
    const cpp = compileSource(SRC("v : INT;", "cls := F_CLASS_OF(v);")).cppCode;
    expect(cpp).not.toContain("F_CLASS_OF(V)");
  });

  it("leaves a concrete function parameter alone", () => {
    const concrete = `
FUNCTION F_DOUBLE : REAL
  VAR_INPUT
    IN : REAL;
  END_VAR
  F_DOUBLE := IN * 2.0;
END_FUNCTION

PROGRAM main
VAR
  r : REAL := 1.5;
  out : REAL;
END_VAR
  out := F_DOUBLE(r);
END_PROGRAM`;
    const cpp = compileSource(concrete).cppCode;
    expect(cpp).toContain("F_DOUBLE(R)");
    expect(cpp).not.toContain("IEC_ANY{");
  });

  it("does not widen a generic parameter to its own name", () => {
    // `coerceUserFuncArgs` casts an argument to the parameter's type when it
    // widens. `ANY` is not a type to cast to, and `static_cast<IEC_ANY>` would
    // not compile.
    const cpp = compileSource(SRC("v : SINT;", "cls := F_CLASS_OF(v);")).cppCode;
    expect(cpp).not.toContain("static_cast<IEC_ANY>");
  });
});

describe("a STRING handed to a generic parameter", () => {
  // A STRING is a plain NUL-terminated array in CODESYS, so a callee writing
  // through `pvalue` has written the whole variable. Here the length is cached
  // beside the characters (`IECString::length_`), so a write through
  // `raw_ptr()` leaves `LEN()` stale. `sync_length()` is the runtime's repair
  // and codegen has to call it — nothing else can.
  const SRC = (decl: string, call: string) => `
FUNCTION_BLOCK FB_ANY VAR_INPUT P : ANY; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main
VAR
  fb : FB_ANY;
  ${decl}
END_VAR
  ${call}
END_PROGRAM`;

  it("syncs the length after the call", () => {
    const cpp = compileSource(SRC("s : STRING;", "fb(P := s);")).cppCode;
    expect(cpp).toContain("S.sync_length();");
  });

  it("syncs after the call, never before it", () => {
    const cpp = compileSource(SRC("s : STRING;", "fb(P := s);")).cppCode;
    expect(cpp.indexOf("FB();")).toBeLessThan(cpp.indexOf("S.sync_length();"));
  });

  it("syncs a WSTRING too", () => {
    const cpp = compileSource(SRC("w : WSTRING;", "fb(P := w);")).cppCode;
    expect(cpp).toContain("W.sync_length();");
  });

  it("syncs after a function call as well as a block call", () => {
    const src = `
FUNCTION F_LEN_OF : DWORD
  VAR_INPUT
    V : ANY_STRING;
  END_VAR
  F_LEN_OF := V.typeclass;
END_FUNCTION

PROGRAM main
VAR
  s : STRING;
  cls : DWORD;
END_VAR
  cls := F_LEN_OF(s);
END_PROGRAM`;
    expect(compileSource(src).cppCode).toContain("S.sync_length();");
  });

  it("syncs once when the same variable fills two generic parameters", () => {
    const src = `
FUNCTION_BLOCK FB_TWO VAR_INPUT A : ANY; B : ANY; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main
VAR
  fb : FB_TWO;
  s : STRING;
END_VAR
  fb(A := s, B := s);
END_PROGRAM`;
    const cpp = compileSource(src).cppCode;
    expect(cpp.split("S.sync_length();").length - 1).toBe(1);
  });

  it("leaves a non-string generic argument alone", () => {
    const cpp = compileSource(SRC("v : INT;", "fb(P := v);")).cppCode;
    expect(cpp).not.toContain("sync_length");
  });

  it("leaves a string passed to a concrete parameter alone", () => {
    const src = `
FUNCTION_BLOCK FB_STR VAR_INPUT P : STRING; END_VAR ; END_FUNCTION_BLOCK
PROGRAM main
VAR
  fb : FB_STR;
  s : STRING;
END_VAR
  fb(P := s);
END_PROGRAM`;
    expect(compileSource(src).cppCode).not.toContain("sync_length");
  });
});

/**
 * An array element and a struct member on a generic parameter.
 *
 * CODESYS accepts any addressable operand on an `ANY`. Both of these parse as a
 * `VariableExpression` — the same node kind as a plain variable, carrying
 * `subscripts` / `fieldAccess` — so they passed the "only a variable may be
 * passed" guard and then failed the type check, which read the type from the
 * VARIABLE's name and so reported the array or the struct.
 */
describe("an array element or struct member on a generic parameter", () => {
  const SRC = (body: string) => `
FUNCTION_BLOCK FB_ANY  VAR_INPUT P : ANY;      END_VAR ; END_FUNCTION_BLOCK
FUNCTION_BLOCK FB_INT  VAR_INPUT P : ANY_INT;  END_VAR ; END_FUNCTION_BLOCK
FUNCTION_BLOCK FB_REAL VAR_INPUT P : ANY_REAL; END_VAR ; END_FUNCTION_BLOCK
TYPE MOTOR : STRUCT RPM : INT; TORQUE : REAL; END_STRUCT END_TYPE
PROGRAM main
VAR
  a : FB_ANY; ii : FB_INT; rr : FB_REAL;
  temps : ARRAY[0..3] OF REAL;
  counts : ARRAY[0..3] OF INT;
  m : MOTOR;
  idx : INT;
END_VAR
${body}
END_PROGRAM`;

  const compileBody = (body: string) => {
    const result = compile(SRC(body), { fileName: "elem.st" });
    return result;
  };

  it.each([
    ["an array element to ANY", "a(P := temps[0]);"],
    ["an array element to ANY_REAL", "rr(P := temps[2]);"],
    ["an array element to ANY_INT", "ii(P := counts[1]);"],
    ["a variable index", "rr(P := temps[idx]);"],
    ["a struct member to ANY", "a(P := m.RPM);"],
    ["a struct member to ANY_INT", "ii(P := m.RPM);"],
    ["a struct member to ANY_REAL", "rr(P := m.TORQUE);"],
  ])("accepts %s", (_label, body) => {
    const result = compileBody(body);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  // The element's own type is what must be checked — not the array's, and not
  // anything that would let a REAL through a slot declared ANY_INT.
  it.each([
    ["a REAL element to ANY_INT", "ii(P := temps[0]);"],
    ["a REAL member to ANY_INT", "ii(P := m.TORQUE);"],
    ["an INT element to ANY_REAL", "rr(P := counts[0]);"],
  ])("still refuses %s", (_label, body) => {
    const result = compileBody(body);
    expect(result.success).toBe(false);
  });

  it("still refuses a whole array, which has no elementary type", () => {
    const result = compileBody("a(P := temps);");
    expect(result.success).toBe(false);
  });

  it("still refuses a whole struct", () => {
    const result = compileBody("a(P := m);");
    expect(result.success).toBe(false);
  });

  it("builds the descriptor from the ELEMENT, not the array", () => {
    const result = compileBody("rr(P := temps[2]);");
    expect(result.success).toBe(true);
    // The element's address and the element's own width — an array-wide
    // descriptor would name the container and its total size.
    expect(result.cppCode).toContain("TYPE_CLASS::TYPE_REAL");
    expect(result.cppCode).toContain("TEMPS.at(2).raw_ptr()");
    expect(result.cppCode).toContain("IEC_SIZEOF(TEMPS.at(2))");
  });

  it("builds the descriptor from the MEMBER, not the struct", () => {
    const result = compileBody("ii(P := m.RPM);");
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("TYPE_CLASS::TYPE_INT");
    expect(result.cppCode).toContain("M.RPM.raw_ptr()");
  });
})
