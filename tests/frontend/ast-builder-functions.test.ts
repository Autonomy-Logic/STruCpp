/**
 * STruC++ AST Builder Function Tests
 *
 * Tests that function calls are correctly built from CST to AST.
 * Covers Phase 4.1: Fix Core Function Call Pipeline.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import type {
  FunctionCallExpression,
  FunctionCallStatement,
  AssignmentStatement,
} from "../../src/frontend/ast.js";

function parseAndBuild(source: string) {
  const result = parse(source);
  expect(result.errors).toHaveLength(0);
  expect(result.cst).toBeDefined();
  return buildAST(result.cst!);
}

describe("AST Builder - Function Calls", () => {
  describe("function call as expression", () => {
    it("should build a simple function call in assignment", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; END_VAR
          result := MyFunc(5);
        END_PROGRAM
      `);

      expect(ast.programs).toHaveLength(1);
      const body = ast.programs[0]!.body;
      expect(body).toHaveLength(1);

      const stmt = body[0] as AssignmentStatement;
      expect(stmt.kind).toBe("AssignmentStatement");
      expect(stmt.value.kind).toBe("FunctionCallExpression");

      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("MYFUNC");
      expect(call.arguments).toHaveLength(1);
      expect(call.arguments[0]!.value.kind).toBe("LiteralExpression");
    });

    it("should build function call with multiple arguments", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; END_VAR
          result := Add3(1, 2, 3);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("ADD3");
      expect(call.arguments).toHaveLength(3);
    });

    it("should build function call with no arguments", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; END_VAR
          result := GetValue();
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("GETVALUE");
      expect(call.arguments).toHaveLength(0);
    });

    it("should build nested function calls", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; END_VAR
          result := Outer(Inner(5));
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("OUTER");
      expect(call.arguments).toHaveLength(1);

      const innerCall = call.arguments[0]!.value as FunctionCallExpression;
      expect(innerCall.kind).toBe("FunctionCallExpression");
      expect(innerCall.functionName).toBe("INNER");
    });
  });

  describe("function call as statement", () => {
    it("should build a function call statement", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          DoSomething(42);
        END_PROGRAM
      `);

      const body = ast.programs[0]!.body;
      expect(body).toHaveLength(1);

      const stmt = body[0] as FunctionCallStatement;
      expect(stmt.kind).toBe("FunctionCallStatement");
      expect(stmt.call.functionName).toBe("DOSOMETHING");
      expect(stmt.call.arguments).toHaveLength(1);
    });
  });

  describe("named arguments", () => {
    it("should build named input argument with :=", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; END_VAR
          result := MyFunc(x := 10);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.arguments).toHaveLength(1);

      const arg = call.arguments[0]!;
      expect(arg.name).toBe("X");
      expect(arg.isOutput).toBe(false);
    });

    it("should build named output argument with =>", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; out1 : INT; END_VAR
          result := MyFunc(y => out1);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      const arg = call.arguments[0]!;
      expect(arg.name).toBe("Y");
      expect(arg.isOutput).toBe(true);
    });

    it("should build mix of positional and named arguments", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR result : INT; END_VAR
          result := Calc(5, mode := 1);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.arguments).toHaveLength(2);
      expect(call.arguments[0]!.name).toBeUndefined();
      expect(call.arguments[1]!.name).toBe("MODE");
    });
  });

  describe("function declaration with call", () => {
    it("should build function declarations and calls in same unit", () => {
      const ast = parseAndBuild(`
        FUNCTION Square : INT
          VAR_INPUT x : INT; END_VAR
          Square := x * x;
        END_FUNCTION

        PROGRAM Main
          VAR r : INT; END_VAR
          r := Square(5);
        END_PROGRAM
      `);

      expect(ast.functions).toHaveLength(1);
      expect(ast.functions[0]!.name).toBe("SQUARE");
      expect(ast.functions[0]!.returnType.name).toBe("INT");

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = stmt.value as FunctionCallExpression;
      expect(call.functionName).toBe("SQUARE");
    });
  });

  describe("fileName propagation", () => {
    it("should set file on sourceSpan when fileName is provided", () => {
      const result = parse("PROGRAM Main END_PROGRAM");
      const ast = buildAST(result.cst!, "test.st");
      expect(ast.sourceSpan.file).toBe("test.st");
      expect(ast.programs[0]!.sourceSpan.file).toBe("test.st");
    });
  });
});
