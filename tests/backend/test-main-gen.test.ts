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
      // Should have main()
      expect(code).toContain("int main()");
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

      expect(code).toContain("ctx.assert_eq");
      expect(code).toContain("static_cast<decltype(");
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

      expect(code).toContain("INT_t x;");
      expect(code).toContain("BOOL_t flag;");
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
});
