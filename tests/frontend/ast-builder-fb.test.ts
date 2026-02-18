/**
 * STruC++ AST Builder Function Block Tests
 *
 * Tests that FB declarations, instances, invocations, and member access
 * are correctly built from CST to AST.
 * Covers Phase 5.1: Function Block Instances and Invocations.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import type {
  FunctionCallExpression,
  FunctionCallStatement,
  AssignmentStatement,
  VariableExpression,
} from "../../src/frontend/ast.js";

function parseAndBuild(source: string) {
  const result = parse(source);
  expect(result.errors).toHaveLength(0);
  expect(result.cst).toBeDefined();
  return buildAST(result.cst!);
}

describe("AST Builder - Function Blocks", () => {
  describe("FB declaration", () => {
    it("should build FunctionBlockDeclaration with inputs/outputs/locals", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Adder
          VAR_INPUT a, b : INT; END_VAR
          VAR_OUTPUT result : INT; END_VAR
          result := a + b;
        END_FUNCTION_BLOCK
      `);

      expect(ast.functionBlocks).toHaveLength(1);
      const fb = ast.functionBlocks[0]!;
      expect(fb.kind).toBe("FunctionBlockDeclaration");
      expect(fb.name).toBe("ADDER");
      expect(fb.varBlocks).toHaveLength(2);
      expect(fb.varBlocks[0]!.blockType).toBe("VAR_INPUT");
      expect(fb.varBlocks[1]!.blockType).toBe("VAR_OUTPUT");
      expect(fb.body).toHaveLength(1);
    });

    it("should build FB with local variables", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Counter
          VAR_INPUT inc : BOOL; END_VAR
          VAR_OUTPUT count : INT; END_VAR
          VAR prev : BOOL; END_VAR
          IF inc THEN count := count + 1; END_IF;
        END_FUNCTION_BLOCK
      `);

      expect(ast.functionBlocks).toHaveLength(1);
      const fb = ast.functionBlocks[0]!;
      expect(fb.varBlocks).toHaveLength(3);
      expect(fb.varBlocks[2]!.blockType).toBe("VAR");
    });
  });

  describe("FB instance declarations", () => {
    it("should build FB instance variable declarations", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK MyFB
          VAR_INPUT x : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR fb1 : MyFB; END_VAR
        END_PROGRAM
      `);

      expect(ast.functionBlocks).toHaveLength(1);
      expect(ast.programs).toHaveLength(1);
      const prog = ast.programs[0]!;
      expect(prog.varBlocks).toHaveLength(1);
      expect(prog.varBlocks[0]!.declarations[0]!.names).toEqual(["FB1"]);
      // The type name is the FB name - resolved as a regular type reference
      expect(prog.varBlocks[0]!.declarations[0]!.type.name).toBe("MYFB");
    });

    it("should build multiple FB instances of same type", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Timer
          VAR_INPUT pt : INT; END_VAR
        END_FUNCTION_BLOCK

        PROGRAM Main
          VAR
            t1 : Timer;
            t2 : Timer;
          END_VAR
        END_PROGRAM
      `);

      const prog = ast.programs[0]!;
      const decls = prog.varBlocks[0]!.declarations;
      expect(decls).toHaveLength(2);
      expect(decls[0]!.type.name).toBe("TIMER");
      expect(decls[1]!.type.name).toBe("TIMER");
    });
  });

  describe("FB invocation parsing", () => {
    it("should build FB invocation with named parameters as FunctionCallStatement", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR fb : INT; END_VAR
          fb(a := 5, b := 3);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as FunctionCallStatement;
      expect(stmt.kind).toBe("FunctionCallStatement");
      expect(stmt.call.functionName).toBe("FB");
      expect(stmt.call.arguments).toHaveLength(2);
      expect(stmt.call.arguments[0]!.name).toBe("A");
      expect(stmt.call.arguments[1]!.name).toBe("B");
    });

    it("should build FB invocation with output capture (=> syntax)", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR x : INT; END_VAR
          fb(a := 5, result => x);
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as FunctionCallStatement;
      expect(stmt.call.arguments).toHaveLength(2);
      expect(stmt.call.arguments[0]!.name).toBe("A");
      expect(stmt.call.arguments[0]!.isOutput).toBe(false);
      expect(stmt.call.arguments[1]!.name).toBe("RESULT");
      expect(stmt.call.arguments[1]!.isOutput).toBe(true);
    });
  });

  describe("FB member access", () => {
    it("should build member access expression for FB outputs", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR x : INT; END_VAR
          x := fb.result;
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      expect(stmt.value.kind).toBe("VariableExpression");
      const varExpr = stmt.value as VariableExpression;
      expect(varExpr.name).toBe("FB");
      expect(varExpr.fieldAccess).toEqual(["RESULT"]);
    });

    it("should build assignment to FB input members", () => {
      const ast = parseAndBuild(`
        PROGRAM Main
          VAR fb : INT; END_VAR
          fb.input := 42;
        END_PROGRAM
      `);

      const stmt = ast.programs[0]!.body[0] as AssignmentStatement;
      const target = stmt.target as VariableExpression;
      expect(target.name).toBe("FB");
      expect(target.fieldAccess).toEqual(["INPUT"]);
    });
  });

  describe("FB composition", () => {
    it("should build nested FB declarations", () => {
      const ast = parseAndBuild(`
        FUNCTION_BLOCK Inner
          VAR_INPUT CLK : BOOL; END_VAR
          VAR_OUTPUT Q : BOOL; END_VAR
        END_FUNCTION_BLOCK

        FUNCTION_BLOCK Outer
          VAR_INPUT signal : BOOL; END_VAR
          VAR edge : Inner; END_VAR
          edge(CLK := signal);
        END_FUNCTION_BLOCK
      `);

      expect(ast.functionBlocks).toHaveLength(2);
      const outer = ast.functionBlocks[1]!;
      expect(outer.name).toBe("OUTER");
      // Local var block should contain the 'edge' FB instance
      const localVarBlock = outer.varBlocks.find(
        (b) => b.blockType === "VAR",
      );
      expect(localVarBlock).toBeDefined();
      expect(localVarBlock!.declarations[0]!.type.name).toBe("INNER");

      // Body should contain the FB invocation
      expect(outer.body).toHaveLength(1);
      const stmt = outer.body[0] as FunctionCallStatement;
      expect(stmt.call.functionName).toBe("EDGE");
    });
  });
});
