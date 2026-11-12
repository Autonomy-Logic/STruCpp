import { describe, it, expect } from "vitest";
import { tokenize } from "../../src/frontend/lexer.js";
import { parse, compile } from "../../src/index.js";
import type {
  FunctionCallStatement,
  MethodCallExpression,
  AssignmentStatement,
} from "../../src/frontend/ast.js";

describe("CODESYS attribute pragmas", () => {
  it("lexes {attribute ...} into the pragmas group, outside the parser stream", () => {
    const r = tokenize(`FUNCTION_BLOCK F
  VAR_INPUT
    {attribute 'hmi_main'}
    Value : REAL;
    { attribute 'unit' := 'mm {x}' }
    Len : REAL;
  END_VAR
END_FUNCTION_BLOCK`);
    expect(r.errors).toEqual([]);
    const pragmas = r.groups.pragmas ?? [];
    expect(pragmas.map((t) => t.image)).toEqual([
      "{ATTRIBUTE 'hmi_main'}",
      "{ attribute 'unit' := 'mm {x}' }".replace("attribute", "ATTRIBUTE"),
    ]);
    expect(
      r.tokens.some(
        (t) => t.image.includes("attribute") || t.image.includes("ATTRIBUTE"),
      ),
    ).toBe(false);
  });

  it("still treats {external ...} as inline C++", () => {
    const r = compile(`PROGRAM P {external int x = 1; (void)x; } END_PROGRAM`);
    expect(r.success).toBe(true);
  });
});

describe("method calls on variable paths", () => {
  const body = (src: string) => {
    const r = parse(`PROGRAM P VAR a : INT; END_VAR ${src} END_PROGRAM`);
    expect(r.errors).toEqual([]);
    return r.ast!.programs[0]!.body;
  };

  it("parses arr[i].M(); as a method call on the element", () => {
    const [stmt] = body("arr[i].Draw(1, 2);") as [FunctionCallStatement];
    expect(stmt.kind).toBe("FunctionCallStatement");
    const call = stmt.call as MethodCallExpression;
    expect(call.kind).toBe("MethodCallExpression");
    expect(call.methodName).toBe("DRAW");
    expect(call.arguments).toHaveLength(2);
    expect(call.object.kind).toBe("VariableExpression");
    if (call.object.kind === "VariableExpression") {
      expect(call.object.name).toBe("ARR");
      expect(call.object.accessChain?.map((s) => s.kind)).toEqual([
        "subscript",
      ]);
      expect(call.object.fieldAccess).toEqual([]);
    }
  });

  it("parses p^.M() and a.b.M() in expressions", () => {
    const [s1, s2] = body("x := p^.Draw(); y := a.b.Draw();") as [
      AssignmentStatement,
      AssignmentStatement,
    ];
    const c1 = s1.value as MethodCallExpression;
    expect(c1.kind).toBe("MethodCallExpression");
    if (c1.object.kind === "VariableExpression") {
      expect(c1.object.isDereference).toBe(true);
      expect(c1.object.accessChain?.map((s) => s.kind)).toEqual([
        "dereference",
      ]);
    }
    const c2 = s2.value as MethodCallExpression;
    expect(c2.kind).toBe("MethodCallExpression");
    if (c2.object.kind === "VariableExpression")
      expect(c2.object.fieldAccess).toEqual(["B"]);
  });

  it("leaves the existing forms alone: a.M(), units[0](), arr[i].x := 1", () => {
    const [s1, s2, s3] = body("a.Draw(); units[0](); arr[i].x := 1;") as [
      FunctionCallStatement,
      FunctionCallStatement,
      AssignmentStatement,
    ];
    expect(s1.call.kind).toBe("FunctionCallExpression");
    expect(s2.call.kind).toBe("FunctionCallExpression");
    expect(s3.kind).toBe("AssignmentStatement");
  });
});
