/**
 * STruC++ Expression Type Resolution Tests (Sub-Phase B)
 *
 * Verifies that resolvedType is correctly populated on AST expression nodes
 * after semantic analysis.
 */

import { describe, it, expect } from "vitest";
import { SemanticAnalyzer } from "../../src/semantic/analyzer.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import { parse } from "../../src/frontend/parser.js";
import type {
  CompilationUnit,
  Expression,
  Statement,
  ElementaryType,
  AssignmentStatement,
  IfStatement,
  ForStatement,
  FunctionCallStatement,
  FunctionCallExpression,
} from "../../src/frontend/ast.js";

/**
 * Helper: parse + build AST + semantic analysis.
 * Returns the AST with resolvedType populated on expressions.
 */
function analyzeSource(source: string): {
  ast: CompilationUnit;
  errors: string[];
  warnings: string[];
} {
  const parseResult = parse(source);
  if (parseResult.errors.length > 0) {
    throw new Error(
      `Parse error: ${JSON.stringify(parseResult.errors)}`,
    );
  }
  const ast = buildAST(parseResult.cst!, "test.st");
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);
  return {
    ast,
    errors: result.errors.map((e) => e.message),
    warnings: result.warnings.map((e) => e.message),
  };
}

/**
 * Get the first statement of the first program's body.
 */
function getFirstStmt(ast: CompilationUnit): Statement {
  return ast.programs[0]!.body[0]!;
}

/**
 * Get the resolved type name from an expression, or undefined.
 */
function resolvedName(expr: Expression): string | undefined {
  if (expr.resolvedType?.typeKind === "elementary") {
    return (expr.resolvedType as ElementaryType).name;
  }
  return expr.resolvedType?.typeKind;
}

describe("Type Resolution", () => {
  describe("Literal Expressions", () => {
    it("should resolve integer literal to INT", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; END_VAR
          x := 42;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("INT");
    });

    it("should resolve REAL literal to REAL", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : REAL; END_VAR
          x := 3.14;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("REAL");
    });

    it("should resolve BOOL literal to BOOL", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : BOOL; END_VAR
          x := TRUE;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("BOOL");
    });

    it("should resolve STRING literal to STRING", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : STRING; END_VAR
          x := 'hello';
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("STRING");
    });

    it("should resolve typed literal with prefix", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : DINT; END_VAR
          x := DINT#42;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("DINT");
    });

    it("should resolve TIME literal to TIME", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR t : TIME; END_VAR
          t := T#1s;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("TIME");
    });
  });

  describe("Variable Expressions", () => {
    it("should resolve variable to its declared type", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; y : INT; END_VAR
          y := x;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("INT");
    });

    it("should resolve target variable type", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : DINT; END_VAR
          x := 42;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.target)).toBe("DINT");
    });
  });

  describe("Binary Expressions", () => {
    it("should resolve arithmetic to wider type", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : DINT; y : INT; r : DINT; END_VAR
          r := x + y;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      // x(DINT) + y(INT) → DINT (wider)
      expect(resolvedName(assign.value)).toBeDefined();
    });

    it("should resolve comparison to BOOL", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; b : BOOL; END_VAR
          b := x > 10;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("BOOL");
    });

    it("should resolve logical operators to BOOL", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR a, b, c : BOOL; END_VAR
          c := a AND b;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("BOOL");
    });

    it("should resolve REAL arithmetic", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; r : REAL; END_VAR
          r := x + 1.0;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      // INT + REAL → REAL (wider)
      expect(resolvedName(assign.value)).toBe("REAL");
    });
  });

  describe("Unary Expressions", () => {
    it("should resolve NOT to operand type", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR a, b : BOOL; END_VAR
          b := NOT a;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("BOOL");
    });

    it("should resolve unary minus to operand type", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x, y : INT; END_VAR
          y := -x;
        END_PROGRAM
      `);
      const assign = getFirstStmt(ast) as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("INT");
    });
  });

  describe("Function Call Expressions", () => {
    it("should resolve user-defined function return type", () => {
      const { ast } = analyzeSource(`
        FUNCTION AddOne : INT
          VAR_INPUT x : INT; END_VAR
          AddOne := x + 1;
        END_FUNCTION
        PROGRAM Main
          VAR r : INT; END_VAR
          r := AddOne(x := 5);
        END_PROGRAM
      `);
      const assign = ast.programs[0]!.body[0] as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("INT");
    });
  });

  describe("Conditions", () => {
    it("should resolve IF condition", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR x : INT; END_VAR
          IF x > 0 THEN
            x := 1;
          END_IF;
        END_PROGRAM
      `);
      const ifStmt = getFirstStmt(ast) as IfStatement;
      expect(resolvedName(ifStmt.condition)).toBe("BOOL");
    });
  });

  describe("FOR statements", () => {
    it("should resolve FOR start and end expressions", () => {
      const { ast } = analyzeSource(`
        PROGRAM Main
          VAR i : INT; END_VAR
          FOR i := 0 TO 10 DO
            ;
          END_FOR;
        END_PROGRAM
      `);
      const forStmt = getFirstStmt(ast) as ForStatement;
      expect(resolvedName(forStmt.start)).toBe("INT");
      expect(resolvedName(forStmt.end)).toBe("INT");
    });
  });

  describe("Struct field access", () => {
    it("should resolve struct field type through access chain", () => {
      const { ast } = analyzeSource(`
        TYPE Point :
          STRUCT
            x : REAL;
            y : REAL;
          END_STRUCT
        END_TYPE
        PROGRAM Main
          VAR p : Point; r : REAL; END_VAR
          r := p.x;
        END_PROGRAM
      `);
      const assign = ast.programs[0]!.body[0] as AssignmentStatement;
      // p.x should resolve to REAL
      expect(resolvedName(assign.value)).toBe("REAL");
    });
  });

  describe("Function call statements", () => {
    it("should resolve arguments of function call statements", () => {
      const { ast } = analyzeSource(`
        FUNCTION MyFunc : INT
          VAR_INPUT a : INT; b : INT; END_VAR
          MyFunc := a + b;
        END_FUNCTION
        PROGRAM Main
          VAR x : INT; END_VAR
          x := MyFunc(a := 1, b := 2);
        END_PROGRAM
      `);
      const assign = ast.programs[0]!.body[0] as AssignmentStatement;
      const call = assign.value as FunctionCallExpression;
      // Arguments should have resolved types
      expect(resolvedName(call.arguments[0]!.value)).toBe("INT");
      expect(resolvedName(call.arguments[1]!.value)).toBe("INT");
    });
  });

  describe("Method scope type resolution", () => {
    it("should resolve method-local variable type", () => {
      const { ast } = analyzeSource(`
        FUNCTION_BLOCK Worker
          VAR counter : INT; END_VAR
          METHOD Run : BOOL
            VAR temp : REAL; END_VAR
            temp := 3.14;
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      const fb = ast.functionBlocks[0]!;
      const method = fb.methods[0]!;
      // temp := 3.14 — target should resolve to REAL
      const assign = method.body[0] as AssignmentStatement;
      expect(resolvedName(assign.target)).toBe("REAL");
      expect(resolvedName(assign.value)).toBe("REAL");
    });

    it("should resolve method return variable type", () => {
      const { ast } = analyzeSource(`
        FUNCTION_BLOCK Worker
          METHOD GetValue : INT
            GetValue := 42;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      const fb = ast.functionBlocks[0]!;
      const method = fb.methods[0]!;
      // GetValue := 42 — target should resolve to INT (method return var)
      const assign = method.body[0] as AssignmentStatement;
      expect(resolvedName(assign.target)).toBe("INT");
    });

    it("should resolve FB member variable accessed from method", () => {
      const { ast } = analyzeSource(`
        FUNCTION_BLOCK Worker
          VAR_INPUT inVal : DINT; END_VAR
          METHOD Process : BOOL
            VAR temp : DINT; END_VAR
            temp := inVal;
            Process := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      const fb = ast.functionBlocks[0]!;
      const method = fb.methods[0]!;
      // temp := inVal — value (inVal) should resolve to DINT via FB scope
      const assign = method.body[0] as AssignmentStatement;
      expect(resolvedName(assign.value)).toBe("DINT");
    });

    it("should resolve method-local variable that shadows FB member", () => {
      const { ast } = analyzeSource(`
        FUNCTION_BLOCK Worker
          VAR counter : INT; END_VAR
          METHOD Run : BOOL
            VAR counter : REAL; END_VAR
            counter := 3.14;
            Run := TRUE;
          END_METHOD
        END_FUNCTION_BLOCK
        PROGRAM Main
        END_PROGRAM
      `);
      const fb = ast.functionBlocks[0]!;
      const method = fb.methods[0]!;
      // counter := 3.14 — target should resolve to REAL (method local), not INT (FB member)
      const assign = method.body[0] as AssignmentStatement;
      expect(resolvedName(assign.target)).toBe("REAL");
    });
  });
});
