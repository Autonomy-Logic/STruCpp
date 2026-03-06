/**
 * STruC++ Shared Type Utilities Tests
 *
 * Tests for the shared type data and pure functions in type-utils.ts.
 */

import { describe, it, expect } from "vitest";
import {
  ELEMENTARY_TYPES,
  TYPE_CATEGORIES,
  getTypeBits,
  getTypeCategory,
  getBitAccessWidth,
  isTypeInCategory,
  matchesConstraint,
  isAssignable,
  isImplicitlyConvertible,
  isNarrowingConversion,
  getCommonType,
  resolveFieldType,
  resolveArrayElementType,
  typeName,
} from "../../src/semantic/type-utils.js";
import type { ElementaryType, IECType } from "../../src/frontend/ast.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { parse } from "../../src/frontend/parser.js";

// Helper to create an elementary type
function elem(name: string): ElementaryType {
  return ELEMENTARY_TYPES[name]!;
}

// Helper to parse ST source and get AST
function parseAST(source: string) {
  const result = parse(source);
  return buildAST(result.cst!, "test.st");
}

describe("type-utils", () => {
  describe("ELEMENTARY_TYPES", () => {
    it("should define all 23 types (21 canonical + TOD + DT aliases)", () => {
      expect(Object.keys(ELEMENTARY_TYPES)).toHaveLength(23);
    });

    it("should have correct sizes for integer types", () => {
      expect(ELEMENTARY_TYPES["SINT"]!.sizeBits).toBe(8);
      expect(ELEMENTARY_TYPES["INT"]!.sizeBits).toBe(16);
      expect(ELEMENTARY_TYPES["DINT"]!.sizeBits).toBe(32);
      expect(ELEMENTARY_TYPES["LINT"]!.sizeBits).toBe(64);
    });

    it("should have correct sizes for real types", () => {
      expect(ELEMENTARY_TYPES["REAL"]!.sizeBits).toBe(32);
      expect(ELEMENTARY_TYPES["LREAL"]!.sizeBits).toBe(64);
    });

    it("should have correct sizes for TOD and DT aliases", () => {
      expect(ELEMENTARY_TYPES["TOD"]!.sizeBits).toBe(64);
      expect(ELEMENTARY_TYPES["DT"]!.sizeBits).toBe(64);
    });
  });

  describe("getTypeBits", () => {
    it("should return bit widths for known types", () => {
      expect(getTypeBits("INT")).toBe(16);
      expect(getTypeBits("DINT")).toBe(32);
      expect(getTypeBits("REAL")).toBe(32);
      expect(getTypeBits("LREAL")).toBe(64);
    });

    it("should be case insensitive", () => {
      expect(getTypeBits("int")).toBe(16);
      expect(getTypeBits("Bool")).toBe(1);
    });

    it("should return undefined for unknown types", () => {
      expect(getTypeBits("MyStruct")).toBeUndefined();
    });
  });

  describe("getTypeCategory", () => {
    it("should return BIT for bit types", () => {
      expect(getTypeCategory("BOOL")).toBe("BIT");
      expect(getTypeCategory("BYTE")).toBe("BIT");
      expect(getTypeCategory("WORD")).toBe("BIT");
    });

    it("should return SINT for signed integers", () => {
      expect(getTypeCategory("INT")).toBe("SINT");
      expect(getTypeCategory("DINT")).toBe("SINT");
    });

    it("should return UINT for unsigned integers", () => {
      expect(getTypeCategory("UINT")).toBe("UINT");
      expect(getTypeCategory("UDINT")).toBe("UINT");
    });

    it("should return REAL for real types", () => {
      expect(getTypeCategory("REAL")).toBe("REAL");
      expect(getTypeCategory("LREAL")).toBe("REAL");
    });

    it("should return undefined for non-numeric types", () => {
      expect(getTypeCategory("STRING")).toBeUndefined();
      expect(getTypeCategory("TIME")).toBeUndefined();
    });
  });

  describe("getBitAccessWidth", () => {
    it("should return widths for bit-accessible types", () => {
      expect(getBitAccessWidth("INT")).toBe(16);
      expect(getBitAccessWidth("DWORD")).toBe(32);
      expect(getBitAccessWidth("BYTE")).toBe(8);
    });

    it("should return undefined for REAL types (not bit-accessible)", () => {
      expect(getBitAccessWidth("REAL")).toBeUndefined();
      expect(getBitAccessWidth("LREAL")).toBeUndefined();
    });

    it("should return undefined for STRING", () => {
      expect(getBitAccessWidth("STRING")).toBeUndefined();
    });
  });

  describe("isTypeInCategory", () => {
    it("should identify ANY_INT types", () => {
      expect(isTypeInCategory(elem("INT"), "ANY_INT")).toBe(true);
      expect(isTypeInCategory(elem("DINT"), "ANY_INT")).toBe(true);
      expect(isTypeInCategory(elem("REAL"), "ANY_INT")).toBe(false);
    });

    it("should identify ANY_REAL types", () => {
      expect(isTypeInCategory(elem("REAL"), "ANY_REAL")).toBe(true);
      expect(isTypeInCategory(elem("LREAL"), "ANY_REAL")).toBe(true);
      expect(isTypeInCategory(elem("INT"), "ANY_REAL")).toBe(false);
    });

    it("should identify ANY_NUM types", () => {
      expect(isTypeInCategory(elem("INT"), "ANY_NUM")).toBe(true);
      expect(isTypeInCategory(elem("REAL"), "ANY_NUM")).toBe(true);
      expect(isTypeInCategory(elem("BOOL"), "ANY_NUM")).toBe(false);
    });

    it("should identify ANY_BIT types", () => {
      expect(isTypeInCategory(elem("BOOL"), "ANY_BIT")).toBe(true);
      expect(isTypeInCategory(elem("BYTE"), "ANY_BIT")).toBe(true);
      expect(isTypeInCategory(elem("INT"), "ANY_BIT")).toBe(false);
    });

    it("should identify ANY_STRING types", () => {
      expect(isTypeInCategory(elem("STRING"), "ANY_STRING")).toBe(true);
      expect(isTypeInCategory(elem("WSTRING"), "ANY_STRING")).toBe(true);
      expect(isTypeInCategory(elem("INT"), "ANY_STRING")).toBe(false);
    });

    it("should return ANY_DERIVED for non-elementary types", () => {
      const structType: IECType = { typeKind: "struct" } as IECType;
      expect(isTypeInCategory(structType, "ANY")).toBe(true);
      expect(isTypeInCategory(structType, "ANY_DERIVED")).toBe(true);
      expect(isTypeInCategory(structType, "ANY_INT")).toBe(false);
    });
  });

  describe("matchesConstraint", () => {
    it("should match ANY_NUM for INT and REAL", () => {
      expect(matchesConstraint("INT", "ANY_NUM")).toBe(true);
      expect(matchesConstraint("REAL", "ANY_NUM")).toBe(true);
    });

    it("should not match ANY_NUM for BOOL or STRING", () => {
      expect(matchesConstraint("BOOL", "ANY_NUM")).toBe(false);
      expect(matchesConstraint("STRING", "ANY_NUM")).toBe(false);
    });

    it("should match ANY_BIT for BOOL, BYTE, WORD", () => {
      expect(matchesConstraint("BOOL", "ANY_BIT")).toBe(true);
      expect(matchesConstraint("BYTE", "ANY_BIT")).toBe(true);
      expect(matchesConstraint("WORD", "ANY_BIT")).toBe(true);
    });

    it("should match BOOL constraint only for BOOL", () => {
      expect(matchesConstraint("BOOL", "BOOL")).toBe(true);
      expect(matchesConstraint("INT", "BOOL")).toBe(false);
    });

    it("should always match specific constraint", () => {
      expect(matchesConstraint("INT", "specific")).toBe(true);
      expect(matchesConstraint("STRING", "specific")).toBe(true);
    });

    it("should match ANY for all types", () => {
      expect(matchesConstraint("INT", "ANY")).toBe(true);
      expect(matchesConstraint("BOOL", "ANY")).toBe(true);
      expect(matchesConstraint("STRING", "ANY")).toBe(true);
      expect(matchesConstraint("MyStruct", "ANY")).toBe(true);
    });

    it("should be case insensitive", () => {
      expect(matchesConstraint("int", "ANY_NUM")).toBe(true);
      expect(matchesConstraint("real", "ANY_REAL")).toBe(true);
    });
  });

  describe("isAssignable", () => {
    it("should allow same type", () => {
      expect(isAssignable(elem("INT"), elem("INT"))).toBe(true);
      expect(isAssignable(elem("REAL"), elem("REAL"))).toBe(true);
    });

    it("should allow widening INT→DINT", () => {
      expect(isAssignable(elem("DINT"), elem("INT"))).toBe(true);
    });

    it("should reject narrowing DINT→INT", () => {
      expect(isAssignable(elem("INT"), elem("DINT"))).toBe(false);
    });

    it("should allow BYTE→INT (BIT→integer cross-category)", () => {
      expect(isAssignable(elem("INT"), elem("BYTE"))).toBe(true);
    });

    it("should allow INT→REAL (integer→real promotion)", () => {
      expect(isAssignable(elem("REAL"), elem("INT"))).toBe(true);
    });

    it("should reject STRING→INT (incompatible types)", () => {
      expect(isAssignable(elem("INT"), elem("STRING"))).toBe(false);
    });

    it("should reject REAL→INT (real→integer narrowing)", () => {
      expect(isAssignable(elem("INT"), elem("REAL"))).toBe(false);
    });
  });

  describe("isImplicitlyConvertible", () => {
    it("should allow same type", () => {
      expect(isImplicitlyConvertible("INT", "INT")).toBe(true);
    });

    it("should allow same-category widening", () => {
      expect(isImplicitlyConvertible("INT", "DINT")).toBe(true);
      expect(isImplicitlyConvertible("REAL", "LREAL")).toBe(true);
      expect(isImplicitlyConvertible("BYTE", "DWORD")).toBe(true);
    });

    it("should allow BIT→INT crossover", () => {
      expect(isImplicitlyConvertible("BYTE", "INT")).toBe(true);
      expect(isImplicitlyConvertible("WORD", "DINT")).toBe(true);
    });

    it("should allow INT→REAL promotion", () => {
      expect(isImplicitlyConvertible("INT", "REAL")).toBe(true);
      expect(isImplicitlyConvertible("DINT", "LREAL")).toBe(true);
    });

    it("should reject narrowing", () => {
      expect(isImplicitlyConvertible("DINT", "INT")).toBe(false);
      expect(isImplicitlyConvertible("LREAL", "REAL")).toBe(false);
    });

    it("should be case insensitive", () => {
      expect(isImplicitlyConvertible("int", "dint")).toBe(true);
    });
  });

  describe("isNarrowingConversion", () => {
    it("should detect same-category narrowing", () => {
      expect(isNarrowingConversion("INT", "DINT")).toBe(true);
      expect(isNarrowingConversion("REAL", "LREAL")).toBe(true);
    });

    it("should detect REAL→INT narrowing", () => {
      expect(isNarrowingConversion("INT", "REAL")).toBe(true);
      expect(isNarrowingConversion("DINT", "LREAL")).toBe(true);
    });

    it("should not flag widening as narrowing", () => {
      expect(isNarrowingConversion("DINT", "INT")).toBe(false);
      expect(isNarrowingConversion("LREAL", "REAL")).toBe(false);
    });

    it("should detect signed↔unsigned narrowing", () => {
      expect(isNarrowingConversion("UINT", "INT")).toBe(true);
      expect(isNarrowingConversion("INT", "UINT")).toBe(true);
    });
  });

  describe("getCommonType", () => {
    it("should return same type for identical types", () => {
      expect(getCommonType(elem("INT"), elem("INT"))).toEqual(elem("INT"));
    });

    it("should return DINT for INT+DINT", () => {
      const result = getCommonType(elem("INT"), elem("DINT"));
      expect(result).toBeDefined();
      expect((result as ElementaryType).name).toBe("DINT");
    });

    it("should return REAL for INT+REAL", () => {
      const result = getCommonType(elem("INT"), elem("REAL"));
      expect(result).toBeDefined();
      expect((result as ElementaryType).name).toBe("REAL");
    });

    it("should return LREAL when one operand is LREAL", () => {
      const result = getCommonType(elem("INT"), elem("LREAL"));
      expect(result).toBeDefined();
      expect((result as ElementaryType).name).toBe("LREAL");
    });

    it("should return undefined for STRING+INT", () => {
      expect(getCommonType(elem("STRING"), elem("INT"))).toBeUndefined();
    });

    it("should handle BIT+NUM promotion", () => {
      const result = getCommonType(elem("BYTE"), elem("INT"));
      expect(result).toBeDefined();
      expect((result as ElementaryType).name).toBe("INT");
    });
  });

  describe("resolveFieldType", () => {
    it("should resolve struct field", () => {
      const ast = parseAST(`
        TYPE Point :
          STRUCT
            x : REAL;
            y : REAL;
          END_STRUCT
        END_TYPE
        PROGRAM Main
          VAR p : Point; END_VAR
          p.x := 1.0;
        END_PROGRAM
      `);
      expect(resolveFieldType("Point", "x", ast)).toBe("REAL");
      expect(resolveFieldType("Point", "y", ast)).toBe("REAL");
    });

    it("should resolve FB member", () => {
      const ast = parseAST(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT
            in1 : INT;
          END_VAR
          VAR
            counter : DINT;
          END_VAR
        END_FUNCTION_BLOCK
        PROGRAM Main
          VAR fb : MyFB; END_VAR
          fb(in1 := 42);
        END_PROGRAM
      `);
      expect(resolveFieldType("MyFB", "in1", ast)).toBe("INT");
      expect(resolveFieldType("MyFB", "counter", ast)).toBe("DINT");
    });

    it("should return undefined for nonexistent field", () => {
      const ast = parseAST(`
        TYPE Point :
          STRUCT
            x : REAL;
          END_STRUCT
        END_TYPE
        PROGRAM Main
          VAR p : Point; END_VAR
          p.x := 1.0;
        END_PROGRAM
      `);
      expect(resolveFieldType("Point", "z", ast)).toBeUndefined();
    });

    it("should return undefined for unknown type", () => {
      const ast = parseAST(`
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      expect(resolveFieldType("UnknownType", "field", ast)).toBeUndefined();
    });
  });

  describe("resolveArrayElementType", () => {
    it("should resolve __INLINE_ARRAY_* types", () => {
      const ast = parseAST(`
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 1;
        END_PROGRAM
      `);
      expect(resolveArrayElementType("__INLINE_ARRAY_INT", ast)).toBe("INT");
      expect(resolveArrayElementType("__INLINE_ARRAY_REAL", ast)).toBe("REAL");
    });

    it("should resolve user-defined array types", () => {
      const ast = parseAST(`
        TYPE MyArray : ARRAY[1..10] OF INT; END_TYPE
        PROGRAM Main
          VAR a : MyArray; END_VAR
          a[1] := 42;
        END_PROGRAM
      `);
      expect(resolveArrayElementType("MyArray", ast)).toBe("INT");
    });
  });

  describe("typeName", () => {
    it("should return name for elementary types", () => {
      expect(typeName(elem("INT"))).toBe("INT");
      expect(typeName(elem("REAL"))).toBe("REAL");
    });

    it("should return REF_TO for reference types", () => {
      const refType: IECType = {
        typeKind: "reference",
        referencedType: elem("INT"),
        isImplicitDeref: false,
      };
      expect(typeName(refType)).toBe("REF_TO INT");
    });
  });
});
