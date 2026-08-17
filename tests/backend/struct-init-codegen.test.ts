/**
 * Unit tests for the shared structure-initializer lowering.
 *
 * `codegen.ts` and `type-codegen.ts` both drive this module through the
 * {@link StructInitEmitter} hooks, and they supply different amounts of type
 * information — codegen resolves element types and the member-name collision
 * mangle from the AST, the type generator resolves neither. These tests pin the
 * contract at both ends, including what happens when the target's C++ type is
 * unknown (value-initialise rather than emit code that would not compile).
 */

import { describe, it, expect } from "vitest";
import {
  generateInitializerValue,
  isStructInitializerValue,
  type StructInitEmitter,
} from "../../src/backend/struct-init-codegen.js";
import type {
  Expression,
  StructInitializerExpression,
} from "../../src/frontend/ast.js";

const SPAN = {
  file: "t.st",
  startLine: 1,
  startCol: 1,
  endLine: 1,
  endCol: 1,
};

function literal(raw: string): Expression {
  return {
    kind: "LiteralExpression",
    sourceSpan: SPAN,
    literalType: "INT",
    value: Number(raw),
    rawValue: raw,
  };
}

function structInit(
  elements: Array<[string, Expression]>,
): StructInitializerExpression {
  return {
    kind: "StructInitializerExpression",
    sourceSpan: SPAN,
    elements: elements.map(([name, value]) => ({
      kind: "StructElementInitializer",
      sourceSpan: SPAN,
      name,
      value,
    })),
  };
}

function arrayLiteral(elements: Expression[]): Expression {
  return { kind: "ArrayLiteralExpression", sourceSpan: SPAN, elements };
}

/** The minimal emitter — what `type-codegen.ts` supplies. */
const bareEmitter: StructInitEmitter = {
  emitValue: (value) =>
    value.kind === "LiteralExpression" ? value.rawValue : "?",
  memberName: (fieldName) => fieldName,
  fieldTypeName: () => undefined,
  arrayElementTypeName: () => undefined,
};

describe("isStructInitializerValue", () => {
  it("is true for a structure initializer", () => {
    expect(isStructInitializerValue(structInit([["A", literal("1")]]))).toBe(
      true,
    );
  });

  it("is true for an array literal containing one", () => {
    expect(
      isStructInitializerValue(
        arrayLiteral([structInit([["A", literal("1")]])]),
      ),
    ).toBe(true);
  });

  it("is false for a plain array literal", () => {
    expect(isStructInitializerValue(arrayLiteral([literal("1")]))).toBe(false);
  });

  it("is false for a scalar expression", () => {
    expect(isStructInitializerValue(literal("1"))).toBe(false);
  });
});

describe("generateInitializerValue", () => {
  it("emits the runtime helper for a structure initializer", () => {
    expect(
      generateInitializerValue(
        structInit([
          ["A", literal("1")],
          ["B", literal("2")],
        ]),
        "POINT",
        "Point",
        bareEmitter,
      ),
    ).toBe(
      "strucpp::iec_struct_init<POINT>([](auto& v0) { v0.A = 1; v0.B = 2; })",
    );
  });

  it("takes a nested level's type from decltype of the member", () => {
    expect(
      generateInitializerValue(
        structInit([["I", structInit([["A", literal("5")]])]]),
        "OUTER",
        "Outer",
        bareEmitter,
      ),
    ).toBe(
      "strucpp::iec_struct_init<OUTER>([](auto& v0) { " +
        "v0.I = strucpp::iec_struct_init<decltype(v0.I)>([](auto& v1) { v1.A = 5; }); })",
    );
  });

  it("names array elements through the array type's element_type", () => {
    expect(
      generateInitializerValue(
        arrayLiteral([
          structInit([["X", literal("1")]]),
          structInit([["X", literal("2")]]),
        ]),
        "Array1D<POINT, 0, 1>",
        "__INLINE_ARRAY_POINT",
        bareEmitter,
      ),
    ).toBe(
      "{strucpp::iec_struct_init<typename Array1D<POINT, 0, 1>::element_type>([](auto& v0) { v0.X = 1; }), " +
        "strucpp::iec_struct_init<typename Array1D<POINT, 0, 1>::element_type>([](auto& v0) { v0.X = 2; })}",
    );
  });

  it("delegates a scalar value to the host emitter", () => {
    expect(
      generateInitializerValue(literal("7"), "IEC_INT", "INT", bareEmitter),
    ).toBe("7");
  });

  it("emits a plain braced list for an array literal of scalars", () => {
    expect(
      generateInitializerValue(
        arrayLiteral([literal("1"), literal("2")]),
        "Array1D<IEC_INT, 0, 1>",
        undefined,
        bareEmitter,
      ),
    ).toBe("{1, 2}");
  });

  it("value-initialises when the target's C++ type is unknown", () => {
    // No type to instantiate the helper with, so emit `{}` rather than code that
    // would not compile.
    expect(
      generateInitializerValue(
        structInit([["A", literal("1")]]),
        undefined,
        "Point",
        bareEmitter,
      ),
    ).toBe("{}");
  });

  it("value-initialises an empty structure initializer", () => {
    expect(
      generateInitializerValue(structInit([]), "POINT", "Point", bareEmitter),
    ).toBe("{}");
  });

  it("value-initialises array elements when the array type is unknown", () => {
    expect(
      generateInitializerValue(
        arrayLiteral([structInit([["X", literal("1")]])]),
        undefined,
        undefined,
        bareEmitter,
      ),
    ).toBe("{{}}");
  });

  it("uses the host's member name and element-type resolution", () => {
    // What `codegen.ts` supplies: a mangled member name and a resolved element
    // type for the nested level.
    const resolvingEmitter: StructInitEmitter = {
      ...bareEmitter,
      memberName: (fieldName, ownerTypeName) =>
        ownerTypeName === "Outer" && fieldName === "INNER"
          ? "INNER_"
          : fieldName,
      fieldTypeName: (fieldName) =>
        fieldName === "INNER" ? "Inner" : undefined,
    };
    expect(
      generateInitializerValue(
        structInit([["INNER", structInit([["A", literal("5")]])]]),
        "OUTER",
        "Outer",
        resolvingEmitter,
      ),
    ).toContain("v0.INNER_ = strucpp::iec_struct_init<decltype(v0.INNER_)>");
  });
});
