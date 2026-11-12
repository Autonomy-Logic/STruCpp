import { describe, it, expect } from "vitest";
import { parse } from "../../src/frontend/parser.js";
import { buildAST } from "../../src/frontend/ast-builder.js";
import {
  fbLineage,
  fbLineageNames,
  functionBlockLookup,
} from "../../src/semantic/fb-lineage.js";
import { SymbolTables } from "../../src/semantic/symbol-table.js";
import type { CompilationUnit } from "../../src/frontend/ast.js";

function unit(source: string): CompilationUnit {
  const parsed = parse(source);
  expect(parsed.errors).toEqual([]);
  return buildAST(parsed.cst!);
}

describe("fbLineage", () => {
  it("walks a local chain nearest first, in any case", () => {
    const ast = unit(`
FUNCTION_BLOCK A END_FUNCTION_BLOCK
FUNCTION_BLOCK B EXTENDS A END_FUNCTION_BLOCK
FUNCTION_BLOCK C EXTENDS b END_FUNCTION_BLOCK`);
    const lookup = functionBlockLookup(ast, undefined);
    expect(fbLineageNames("c", lookup)).toEqual(["C", "B", "A"]);
  });

  it("is empty for a name that is not a function block", () => {
    const ast = unit("FUNCTION_BLOCK A END_FUNCTION_BLOCK");
    expect(fbLineage("NOPE", functionBlockLookup(ast, undefined))).toEqual([]);
  });

  it("stops at an unresolved base", () => {
    const ast = unit("FUNCTION_BLOCK B EXTENDS Missing END_FUNCTION_BLOCK");
    expect(fbLineageNames("B", functionBlockLookup(ast, undefined))).toEqual([
      "B",
    ]);
  });

  it("stops at the first repeated block of a cycle", () => {
    const ast = unit(`
FUNCTION_BLOCK A EXTENDS B END_FUNCTION_BLOCK
FUNCTION_BLOCK B EXTENDS A END_FUNCTION_BLOCK`);
    expect(fbLineageNames("A", functionBlockLookup(ast, undefined))).toEqual([
      "A",
      "B",
    ]);
  });

  it("prefers a local block and falls back to the symbol tables", () => {
    const ast = unit("FUNCTION_BLOCK D EXTENDS LibBase END_FUNCTION_BLOCK");
    const tables = new SymbolTables();
    tables.globalScope.define({
      name: "LIBBASE",
      kind: "functionBlock",
      declaration: {
        kind: "FunctionBlockDeclaration",
        sourceSpan: ast.functionBlocks[0]!.sourceSpan,
        name: "LibBase",
        isAbstract: false,
        isFinal: false,
        varBlocks: [],
        methods: [],
        properties: [],
        body: [],
      },
      inputs: [],
      outputs: [],
      inouts: [],
      locals: [],
    });
    const lookup = functionBlockLookup(ast, tables);
    const chain = fbLineage("d", lookup);
    expect(chain.map((fb) => fb.name)).toEqual(["D", "LibBase"]);
    expect(chain[0]).toBe(ast.functionBlocks[0]);
  });
});
