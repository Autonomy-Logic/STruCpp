/**
 * Tests for the test main generator (Phase 9.1).
 *
 * Verifies that generateTestMain() produces correct C++ code from TestFile models.
 */

import { describe, it, expect } from "vitest";
import { generateTestMain } from "../../dist/backend/test-main-gen.js";
import type { POUInfo } from "../../dist/backend/test-main-gen.js";
import type { TestFile } from "../../dist/testing/test-model.js";

/** Helper to create a basic POUInfo for a program */
function programPOU(name: string, vars: Record<string, string> = {}): POUInfo {
  return {
    name,
    kind: "program",
    cppClassName: `Program_${name}`,
    variables: new Map(Object.entries(vars)),
  };
}

/** Helper to create a basic TestFile */
function makeTestFile(
  fileName: string,
  testCases: TestFile["testCases"],
): TestFile {
  return { fileName, testCases };
}

/** Default source span */
const span = { file: "test.st", startLine: 1, endLine: 1, startCol: 1, endCol: 1 };

describe("Test Main Generator", () => {
  describe("basic generation", () => {
    it("should generate includes and namespace", () => {
      const code = generateTestMain([], {
        headerFileName: "generated.hpp",
        pous: [],
      });
      expect(code).toContain('#include "generated.hpp"');
      expect(code).toContain('#include "iec_test.hpp"');
      expect(code).toContain("using namespace strucpp;");
    });

    it("should generate a test function for a single TEST block", () => {
      const testFile = makeTestFile("test_counter.st", [
        {
          name: "Counter increments",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["uut"],
                  type: {
                    kind: "TypeReference",
                    name: "Counter",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [
            {
              kind: "FunctionCallStatement",
              call: {
                kind: "FunctionCallExpression",
                functionName: "uut",
                arguments: [],
                sourceSpan: span,
              },
              sourceSpan: span,
            },
            {
              kind: "AssertCall",
              assertType: "ASSERT_EQ",
              args: [
                {
                  kind: "VariableExpression",
                  name: "uut",
                  subscripts: [],
                  fieldAccess: ["count"],
                  isDereference: false,
                  sourceSpan: { ...span, startLine: 5 },
                },
                {
                  kind: "LiteralExpression",
                  literalType: "INT",
                  value: 1,
                  rawValue: "1",
                  sourceSpan: { ...span, startLine: 5 },
                },
              ],
              sourceSpan: { ...span, startLine: 5 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [programPOU("Counter", { count: "INT" })],
      });

      // Should generate test function
      expect(code).toContain("bool test_1(strucpp::TestContext& ctx)");
      // Should use Program_Counter for the variable type
      expect(code).toContain("Program_Counter uut;");
      // Should generate runner with test name
      expect(code).toContain('"Counter increments"');
      // Should register the test
      expect(code).toContain("runner.add");
      // Should have main() with argc/argv for --json support
      expect(code).toContain("int main(int argc, char* argv[])");
      // Should call runner.run()
      expect(code).toContain("runner.run()");
    });

    it("should generate multiple test functions", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "Test A",
          varBlocks: [],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_TRUE",
              args: [
                {
                  kind: "LiteralExpression",
                  literalType: "BOOL",
                  value: true,
                  rawValue: "TRUE",
                  sourceSpan: { ...span, startLine: 2 },
                },
              ],
              sourceSpan: { ...span, startLine: 2 },
            },
          ],
          sourceSpan: span,
        },
        {
          name: "Test B",
          varBlocks: [],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_FALSE",
              args: [
                {
                  kind: "LiteralExpression",
                  literalType: "BOOL",
                  value: false,
                  rawValue: "FALSE",
                  sourceSpan: { ...span, startLine: 6 },
                },
              ],
              sourceSpan: { ...span, startLine: 6 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("bool test_1(");
      expect(code).toContain("bool test_2(");
      expect(code).toContain('"Test A"');
      expect(code).toContain('"Test B"');
    });
  });

  describe("assert generation", () => {
    it("should generate ASSERT_EQ with static_cast and decltype", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "eq test",
          varBlocks: [],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_EQ",
              args: [
                {
                  kind: "LiteralExpression",
                  literalType: "INT",
                  value: 1,
                  rawValue: "1",
                  sourceSpan: { ...span, startLine: 2 },
                },
                {
                  kind: "LiteralExpression",
                  literalType: "INT",
                  value: 2,
                  rawValue: "2",
                  sourceSpan: { ...span, startLine: 2 },
                },
              ],
              sourceSpan: { ...span, startLine: 2 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("ctx.assert_eq(");
      expect(code).not.toContain("static_cast<decltype(");
    });

    it("should generate ASSERT_TRUE with static_cast<bool>", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "true test",
          varBlocks: [],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_TRUE",
              args: [
                {
                  kind: "LiteralExpression",
                  literalType: "BOOL",
                  value: true,
                  rawValue: "TRUE",
                  sourceSpan: { ...span, startLine: 2 },
                },
              ],
              sourceSpan: { ...span, startLine: 2 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("ctx.assert_true(static_cast<bool>(true)");
    });

    it("should generate ASSERT_FALSE with static_cast<bool>", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "false test",
          varBlocks: [],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_FALSE",
              args: [
                {
                  kind: "LiteralExpression",
                  literalType: "BOOL",
                  value: false,
                  rawValue: "FALSE",
                  sourceSpan: { ...span, startLine: 2 },
                },
              ],
              sourceSpan: { ...span, startLine: 2 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("ctx.assert_false(static_cast<bool>(false)");
    });
  });

  describe("POU type resolution", () => {
    it("should map program types to Program_ prefixed class names", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "program test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["uut"],
                  type: {
                    kind: "TypeReference",
                    name: "MyProg",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [programPOU("MyProg")],
      });

      expect(code).toContain("Program_MyProg uut;");
    });

    it("should map FB types to bare class names", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "fb test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["timer"],
                  type: {
                    kind: "TypeReference",
                    name: "TON",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [
          {
            name: "TON",
            kind: "functionBlock",
            cppClassName: "TON",
            variables: new Map(),
          },
        ],
      });

      expect(code).toContain("TON timer;");
    });
  });

  describe("variable declarations", () => {
    it("should generate local variables with correct types", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "var test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["x"],
                  type: {
                    kind: "TypeReference",
                    name: "INT",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
                {
                  kind: "VarDeclaration",
                  names: ["flag"],
                  type: {
                    kind: "TypeReference",
                    name: "BOOL",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("IEC_INT x;");
      expect(code).toContain("IEC_BOOL flag;");
    });
  });

  describe("type resolution with AST", () => {
    it("should preserve STRING(n) maxLength via TypeReference", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "string length test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["msg"],
                  type: {
                    kind: "TypeReference",
                    name: "STRING",
                    isReference: false,
                    referenceKind: "none",
                    maxLength: 50,
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("IECStringVar<50> msg;");
    });

    it("should resolve struct types as bare names when AST is provided", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "struct test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["pt"],
                  type: {
                    kind: "TypeReference",
                    name: "MyStruct",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [],
          sourceSpan: span,
        },
      ]);

      // Provide AST with a struct type definition
      const ast = {
        kind: "CompilationUnit" as const,
        programs: [],
        functions: [],
        functionBlocks: [],
        interfaces: [],
        types: [
          {
            kind: "TypeDeclaration" as const,
            name: "MyStruct",
            baseType: {
              kind: "StructType" as const,
              fields: [],
              sourceSpan: span,
            },
            sourceSpan: span,
          },
        ],
        configurations: [],
        sourceSpan: span,
      };

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
        ast: ast as any,
      });

      // Should use bare MyStruct (not IEC_MyStruct)
      expect(code).toContain("MyStruct pt;");
      expect(code).not.toContain("IEC_MyStruct");
    });
  });

  describe("enum qualified access", () => {
    it("should emit :: for enum member access in assert expressions", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "enum test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["uut"],
                  type: {
                    kind: "TypeReference",
                    name: "LIGHT",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_EQ",
              args: [
                {
                  kind: "VariableExpression",
                  name: "uut",
                  subscripts: [],
                  fieldAccess: ["CURRENTSTATE"],
                  isDereference: false,
                  sourceSpan: { ...span, startLine: 3 },
                },
                {
                  kind: "VariableExpression",
                  name: "TRAFFICSTATE",
                  subscripts: [],
                  fieldAccess: ["RED"],
                  isDereference: false,
                  sourceSpan: { ...span, startLine: 3 },
                },
              ],
              sourceSpan: { ...span, startLine: 3 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const ast = {
        kind: "CompilationUnit" as const,
        programs: [],
        functions: [],
        functionBlocks: [
          {
            kind: "FunctionBlockDeclaration" as const,
            name: "LIGHT",
            varBlocks: [
              {
                kind: "VarBlock" as const,
                blockType: "VAR" as const,
                isConstant: false,
                isRetain: false,
                declarations: [
                  {
                    kind: "VarDeclaration" as const,
                    names: ["CURRENTSTATE"],
                    type: {
                      kind: "TypeReference" as const,
                      name: "TRAFFICSTATE",
                      isReference: false,
                      referenceKind: "none" as const,
                      sourceSpan: span,
                    },
                    sourceSpan: span,
                  },
                ],
                sourceSpan: span,
              },
            ],
            methods: [],
            properties: [],
            body: [],
            sourceSpan: span,
          },
        ],
        interfaces: [],
        types: [
          {
            kind: "TypeDeclaration" as const,
            name: "TRAFFICSTATE",
            definition: {
              kind: "EnumDefinition" as const,
              members: [
                { name: "RED", sourceSpan: span },
                { name: "YELLOW", sourceSpan: span },
                { name: "GREEN", sourceSpan: span },
              ],
              sourceSpan: span,
            },
            sourceSpan: span,
          },
        ],
        configurations: [],
        sourceSpan: span,
      };

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [
          {
            name: "LIGHT",
            kind: "functionBlock",
            cppClassName: "LIGHT",
            variables: new Map([["CURRENTSTATE", "TRAFFICSTATE"]]),
          },
        ],
        ast: ast as any,
      });

      // C++ expression must use :: for scoped enum access
      expect(code).toContain("TRAFFICSTATE::RED");
      // Verify the C++ expression uses :: (not dot) before the string literal params
      expect(code).toMatch(/TRAFFICSTATE::RED,\s*"uut\.CURRENTSTATE"/);
    });

    it("should emit :: for enum types from library archives (no AST types)", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "lib enum test",
          varBlocks: [
            {
              kind: "VarBlock",
              blockType: "VAR",
              isConstant: false,
              isRetain: false,
              declarations: [
                {
                  kind: "VarDeclaration",
                  names: ["ped"],
                  type: {
                    kind: "TypeReference",
                    name: "PEDESTRIANLIGHT",
                    isReference: false,
                    referenceKind: "none",
                    sourceSpan: span,
                  },
                  sourceSpan: span,
                },
              ],
              sourceSpan: span,
            },
          ],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_EQ",
              args: [
                {
                  kind: "VariableExpression",
                  name: "ped",
                  subscripts: [],
                  fieldAccess: ["pedestrianState"],
                  isDereference: false,
                  sourceSpan: { ...span, startLine: 3 },
                },
                {
                  kind: "VariableExpression",
                  name: "PedestrianState",
                  subscripts: [],
                  fieldAccess: ["DONT_WALK"],
                  isDereference: false,
                  sourceSpan: { ...span, startLine: 3 },
                },
              ],
              sourceSpan: { ...span, startLine: 3 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      // Empty AST (no types defined in source) — enums come from library
      const ast = {
        kind: "CompilationUnit" as const,
        programs: [],
        functions: [],
        functionBlocks: [],
        interfaces: [],
        types: [],
        configurations: [],
        sourceSpan: span,
      };

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [
          {
            name: "PEDESTRIANLIGHT",
            kind: "functionBlock",
            cppClassName: "PEDESTRIANLIGHT",
            variables: new Map([["PEDESTRIANSTATE", "PEDESTRIANSTATE"]]),
          },
        ],
        ast: ast as any,
        libraryArchives: [
          {
            formatVersion: 1,
            manifest: {
              name: "semaphoreLib",
              version: "1.0.0",
              namespace: "semaphoreLib",
              functions: [],
              functionBlocks: [
                { name: "PEDESTRIANLIGHT", inputs: [], outputs: [{ name: "PEDESTRIANSTATE", type: "PEDESTRIANSTATE" }], inouts: [] },
              ],
              types: [
                { name: "TRAFFICSTATE", kind: "enum" },
                { name: "PEDESTRIANSTATE", kind: "enum" },
                { name: "PHASETIMING", kind: "struct" },
              ],
              headers: [],
              isBuiltin: false,
            },
            headerCode: "",
            cppCode: "",
          } as any,
        ],
      });

      // Enum from library must use :: scoped access (preserves original case from expression)
      expect(code).toContain("PedestrianState::DONT_WALK");
      // The dot form should only appear in the string literal (error message), not as a C++ expression
      expect(code).toMatch(/PedestrianState::DONT_WALK,\s*"ped\.pedestrianState"/);
    });
  });

  describe("runner structure", () => {
    it("should generate TestRunner with file name", () => {
      const testFile = makeTestFile("test_counter.st", [
        {
          name: "basic",
          varBlocks: [],
          body: [],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain('TestRunner runner("test_counter.st")');
    });

    it("should return runner.run() for single file", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "single",
          varBlocks: [],
          body: [],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      expect(code).toContain("return runner.run();");
    });
  });

  describe("JSON output support", () => {
    it("should generate --json flag parsing in main()", () => {
      const testFile = makeTestFile("test.st", [
        {
          name: "json test",
          varBlocks: [],
          body: [
            {
              kind: "AssertCall",
              assertType: "ASSERT_TRUE",
              args: [
                {
                  kind: "LiteralExpression",
                  literalType: "BOOL",
                  value: true,
                  rawValue: "TRUE",
                  sourceSpan: { ...span, startLine: 2 },
                },
              ],
              sourceSpan: { ...span, startLine: 2 },
            },
          ],
          sourceSpan: span,
        },
      ]);

      const code = generateTestMain([testFile], {
        headerFileName: "generated.hpp",
        pous: [],
      });

      // main() should accept argc/argv for flag parsing
      expect(code).toContain("int main(int argc, char* argv[])");
      // Should check for --json flag
      expect(code).toContain("--json");
      // Should declare json_mode variable
      expect(code).toContain("json_mode");
      // Should call set_json_mode when flag is found
      expect(code).toContain("set_json_mode");
    });
  });
});
