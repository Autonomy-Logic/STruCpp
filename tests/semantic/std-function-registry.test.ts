/**
 * STruC++ Standard Function Registry Tests
 *
 * Tests for the IEC 61131-3 standard function registry.
 * Covers Phase 4.2: Standard Library Function Registry.
 */

import { describe, it, expect } from "vitest";
import { StdFunctionRegistry } from "../../src/semantic/std-function-registry.js";

describe("StdFunctionRegistry", () => {
  let registry: StdFunctionRegistry;

  beforeEach(() => {
    registry = new StdFunctionRegistry();
  });

  describe("lookup", () => {
    it("should find ABS function", () => {
      const desc = registry.lookup("ABS");
      expect(desc).toBeDefined();
      expect(desc!.name).toBe("ABS");
      expect(desc!.cppName).toBe("ABS");
      expect(desc!.category).toBe("numeric");
      expect(desc!.isVariadic).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(registry.lookup("abs")).toBeDefined();
      expect(registry.lookup("Abs")).toBeDefined();
      expect(registry.lookup("ABS")).toBeDefined();
    });

    it("should return undefined for unknown functions", () => {
      expect(registry.lookup("UNKNOWN_FUNC")).toBeUndefined();
    });
  });

  describe("isStandardFunction", () => {
    it("should recognize standard functions", () => {
      expect(registry.isStandardFunction("ABS")).toBe(true);
      expect(registry.isStandardFunction("SIN")).toBe(true);
      expect(registry.isStandardFunction("ADD")).toBe(true);
      expect(registry.isStandardFunction("LEN")).toBe(true);
    });

    it("should recognize conversion functions", () => {
      expect(registry.isStandardFunction("INT_TO_REAL")).toBe(true);
      expect(registry.isStandardFunction("BOOL_TO_INT")).toBe(true);
    });

    it("should reject non-standard functions", () => {
      expect(registry.isStandardFunction("MyCustomFunc")).toBe(false);
    });
  });

  describe("resolveConversion", () => {
    it("should resolve INT_TO_REAL", () => {
      const conv = registry.resolveConversion("INT_TO_REAL");
      expect(conv).toBeDefined();
      expect(conv!.fromType).toBe("INT");
      expect(conv!.toType).toBe("REAL");
      expect(conv!.cppName).toBe("TO_REAL");
    });

    it("should resolve BOOL_TO_INT", () => {
      const conv = registry.resolveConversion("BOOL_TO_INT");
      expect(conv).toBeDefined();
      expect(conv!.fromType).toBe("BOOL");
      expect(conv!.toType).toBe("INT");
      expect(conv!.cppName).toBe("TO_INT");
    });

    it("should resolve REAL_TO_DINT", () => {
      const conv = registry.resolveConversion("REAL_TO_DINT");
      expect(conv).toBeDefined();
      expect(conv!.cppName).toBe("TO_DINT");
    });

    it("should return undefined for invalid conversions", () => {
      expect(registry.resolveConversion("FOO_TO_BAR")).toBeUndefined();
      expect(registry.resolveConversion("ABS")).toBeUndefined();
      expect(registry.resolveConversion("NOT_A_CONVERSION")).toBeUndefined();
    });

    it("should be case-insensitive", () => {
      const conv = registry.resolveConversion("int_to_real");
      expect(conv).toBeDefined();
      expect(conv!.cppName).toBe("TO_REAL");
    });
  });

  describe("numeric functions", () => {
    it("should have all numeric functions", () => {
      for (const name of [
        "ABS",
        "NEG",
        "SQRT",
        "LN",
        "LOG",
        "EXP",
        "EXPT",
        "TRUNC",
        "ROUND",
      ]) {
        expect(registry.lookup(name)).toBeDefined();
      }
    });
  });

  describe("trigonometric functions", () => {
    it("should have all trig functions", () => {
      for (const name of [
        "SIN",
        "COS",
        "TAN",
        "ASIN",
        "ACOS",
        "ATAN",
        "ATAN2",
      ]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.category).toBe("trig");
      }
    });
  });

  describe("arithmetic functions", () => {
    it("should have variadic ADD and MUL", () => {
      const add = registry.lookup("ADD");
      expect(add).toBeDefined();
      expect(add!.isVariadic).toBe(true);
      expect(add!.minArgs).toBe(2);

      const mul = registry.lookup("MUL");
      expect(mul).toBeDefined();
      expect(mul!.isVariadic).toBe(true);
    });

    it("should have non-variadic SUB, DIV, MOD", () => {
      for (const name of ["SUB", "DIV", "MOD"]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.isVariadic).toBe(false);
      }
    });
  });

  describe("selection functions", () => {
    it("should have variadic MAX and MIN", () => {
      const max = registry.lookup("MAX");
      expect(max).toBeDefined();
      expect(max!.isVariadic).toBe(true);
      expect(max!.minArgs).toBe(2);
    });

    it("should have SEL, LIMIT, MUX, MOVE", () => {
      for (const name of ["SEL", "LIMIT", "MUX", "MOVE"]) {
        expect(registry.lookup(name)).toBeDefined();
      }
    });
  });

  describe("comparison functions", () => {
    it("should have all comparison functions as variadic", () => {
      for (const name of ["GT", "GE", "EQ", "LE", "LT", "NE"]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.isVariadic).toBe(true);
        expect(desc!.returnConstraint).toBe("BOOL");
      }
    });
  });

  describe("bitwise functions", () => {
    it("should have variadic AND, OR, XOR", () => {
      for (const name of ["AND", "OR", "XOR"]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.isVariadic).toBe(true);
      }
    });

    it("should have non-variadic NOT", () => {
      const desc = registry.lookup("NOT");
      expect(desc).toBeDefined();
      expect(desc!.isVariadic).toBe(false);
    });
  });

  describe("bit shift functions", () => {
    it("should have SHL, SHR, ROL, ROR", () => {
      for (const name of ["SHL", "SHR", "ROL", "ROR"]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.category).toBe("bitshift");
      }
    });
  });

  describe("conversion functions", () => {
    it("should have TO_* functions", () => {
      for (const target of [
        "BOOL",
        "SINT",
        "INT",
        "DINT",
        "LINT",
        "USINT",
        "UINT",
        "UDINT",
        "ULINT",
        "REAL",
        "LREAL",
      ]) {
        const desc = registry.lookup(`TO_${target}`);
        expect(desc).toBeDefined();
        expect(desc!.isConversion).toBe(true);
        expect(desc!.specificReturnType).toBe(target);
      }
    });
  });

  describe("string functions", () => {
    it("should have all string functions", () => {
      for (const name of [
        "LEN",
        "LEFT",
        "RIGHT",
        "MID",
        "CONCAT",
        "INSERT",
        "DELETE",
        "REPLACE",
        "FIND",
      ]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.category).toBe("string");
      }
    });

    it("should map DELETE to DELETE_STR in C++", () => {
      const desc = registry.lookup("DELETE");
      expect(desc).toBeDefined();
      expect(desc!.cppName).toBe("DELETE_STR");
    });

    it("should have variadic CONCAT", () => {
      const desc = registry.lookup("CONCAT");
      expect(desc).toBeDefined();
      expect(desc!.isVariadic).toBe(true);
      expect(desc!.minArgs).toBe(2);
    });
  });

  describe("time functions", () => {
    it("should have time utility functions", () => {
      for (const name of [
        "TIME_FROM_MS",
        "TIME_FROM_S",
        "TIME_TO_MS",
        "TIME_TO_S",
      ]) {
        const desc = registry.lookup(name);
        expect(desc).toBeDefined();
        expect(desc!.category).toBe("time");
      }
    });
  });

  describe("getAll", () => {
    it("should return all registered functions", () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThan(40);
    });
  });
});
