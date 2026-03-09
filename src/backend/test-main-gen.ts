// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Test Main Generator
 *
 * Generates test_main.cpp from parsed test files and compiled source.
 * Each TEST block becomes a bool test_N(TestContext&) function.
 * The generated main() registers all tests and calls runner.run().
 *
 * All ST→C++ translation is delegated to TestCodeGenerator (which extends
 * the production CodeGenerator) to avoid divergence. Only test-specific
 * logic (asserts, mocks, setup/teardown, runner registration) lives here.
 */

import type {
  TestFile,
  TestCase,
  TestStatement,
  AssertCall,
  AdvanceTimeStatement,
  SetupBlock,
  TeardownBlock,
  MockFBStatement,
  MockFunctionStatement,
  MockVerifyCalledStatement,
  MockVerifyCallCountStatement,
} from "../testing/test-model.js";
import type {
  CompilationUnit,
  FunctionDeclaration,
  VarBlock,
  VarDeclaration,
  Statement,
  Expression,
} from "../frontend/ast.js";
import { TestCodeGenerator } from "./test-codegen.js";
import type { StlibArchive } from "../library/library-manifest.js";

/**
 * Information about a POU (Program Organization Unit) from compilation.
 */
export interface POUInfo {
  name: string;
  kind: "program" | "functionBlock" | "function";
  /** C++ class name (e.g., "Program_Counter" for programs, "Debounce" for FBs) */
  cppClassName: string;
  /** Variable declarations with types */
  variables: Map<string, string>; // name → IEC type name
}

/**
 * Information about a function for mock dispatch generation.
 * @deprecated Use `ast` option instead — FunctionInfo loses maxLength, blockType, and VAR_OUTPUT info.
 */
export interface FunctionInfo {
  name: string;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
}

/**
 * Options for test main generation.
 */
export interface TestMainGenOptions {
  /** Header filename to include */
  headerFileName: string;
  /** Known POUs from the source compilation */
  pous: POUInfo[];
  /** Whether this is a test build (enables mock infrastructure) */
  isTestBuild?: boolean;
  /** Source AST — primary way to pass type and function info (preferred over `functions`) */
  ast?: CompilationUnit;
  /** Resolved library archives (stdlib + user) — used to register FB types */
  libraryArchives?: StlibArchive[];
  /**
   * Known functions for mock dispatch generation.
   * @deprecated Use `ast` instead for correct type resolution.
   */
  functions?: FunctionInfo[];
}

/**
 * Build POUInfo from a CompilationUnit AST.
 * Shared helper used by CLI, integration tests, and validation suite.
 */
export function buildPOUInfoFromAST(ast: CompilationUnit): {
  pous: POUInfo[];
} {
  const pous: POUInfo[] = [];

  for (const prog of ast.programs) {
    const vars = new Map<string, string>();
    for (const block of prog.varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          vars.set(name, decl.type.name);
        }
      }
    }
    pous.push({
      name: prog.name,
      kind: "program",
      cppClassName: `Program_${prog.name}`,
      variables: vars,
    });
  }

  for (const fb of ast.functionBlocks) {
    const vars = new Map<string, string>();
    for (const block of fb.varBlocks) {
      for (const decl of block.declarations) {
        for (const name of decl.names) {
          vars.set(name, decl.type.name);
        }
      }
    }
    pous.push({
      name: fb.name,
      kind: "functionBlock",
      cppClassName: fb.name,
      variables: vars,
    });
  }

  for (const func of ast.functions) {
    pous.push({
      name: func.name,
      kind: "function",
      cppClassName: func.name,
      variables: new Map(),
    });
  }

  return { pous };
}

/**
 * Generate the test_main.cpp source code.
 *
 * @param testFiles - Parsed test files
 * @param options - Generation options
 * @returns The generated C++ source code
 */
export function generateTestMain(
  testFiles: TestFile[],
  options: TestMainGenOptions,
): string {
  const lines: string[] = [];
  const testCodegen = new TestCodeGenerator(options.pous);

  // Initialize type sets from AST if provided
  if (options.ast) {
    testCodegen.initFromAST(options.ast);
  }

  // Register library FB types (TON, CTU, R_TRIG, etc.) so they
  // are recognized as user-defined types, not given the IEC_ prefix
  if (options.libraryArchives) {
    for (const archive of options.libraryArchives) {
      testCodegen.registerLibraryFBTypes(
        archive.manifest.functionBlocks.map((fb: { name: string }) => fb.name),
      );
    }
  }

  // Includes
  lines.push(`#include "${options.headerFileName}"`);
  lines.push('#include "iec_test.hpp"');
  lines.push("#include <cstring>");
  lines.push("");
  lines.push("using namespace strucpp;");
  lines.push("");

  // Generate setup structs and test functions for each file
  let testIndex = 0;
  let setupIndex = 0;
  const registrations: Array<{
    fileName: string;
    name: string;
    funcName: string;
  }> = [];

  // Build function declaration map from AST for mock dispatch
  const astFunctionMap = new Map<string, FunctionDeclaration>();
  if (options.ast) {
    for (const func of options.ast.functions) {
      astFunctionMap.set(func.name.toUpperCase(), func);
    }
  }

  // Legacy fallback: build FunctionInfo map if no AST provided
  const legacyFunctionMap = new Map<string, FunctionInfo>();
  if (!options.ast && options.functions) {
    for (const func of options.functions) {
      legacyFunctionMap.set(func.name.toUpperCase(), func);
    }
  }

  // Collect all mocked function names across all test files
  const mockedFunctionNames = new Set<string>();
  for (const testFile of testFiles) {
    for (const tc of testFile.testCases) {
      collectMockedFunctions(tc.body, mockedFunctionNames);
    }
  }

  // Generate function dispatch declarations for mocked functions
  // These must be inside namespace strucpp since the symbols are defined there
  if (mockedFunctionNames.size > 0) {
    lines.push("namespace strucpp {");
    for (const funcName of mockedFunctionNames) {
      const astFunc = astFunctionMap.get(funcName.toUpperCase());
      if (astFunc) {
        // Use production codegen for correct type resolution
        const sig = testCodegen.generateFunctionSignature(astFunc);
        lines.push(
          `extern ${sig.returnType} ${astFunc.name}_real(${sig.params.join(", ")});`,
        );
        lines.push(
          `extern ${sig.returnType} (*${astFunc.name}_dispatch)(${sig.params.join(", ")});`,
        );
      } else {
        // Legacy fallback
        const func = legacyFunctionMap.get(funcName.toUpperCase());
        if (func) {
          const retType = testCodegen.resolveType(func.returnType);
          const params = func.parameters
            .map((p) => `${testCodegen.resolveType(p.type)} ${p.name}`)
            .join(", ");
          lines.push(`extern ${retType} ${func.name}_real(${params});`);
          lines.push(`extern ${retType} (*${func.name}_dispatch)(${params});`);
        }
      }
    }
    lines.push("} // namespace strucpp");
    lines.push("");
  }

  for (const testFile of testFiles) {
    // Generate SETUP/TEARDOWN struct if present
    let setupStructName: string | undefined;
    if (testFile.setup) {
      setupIndex++;
      setupStructName = `TestSetup_${setupIndex}`;
      const gen = new TestFunctionGenerator(
        testCodegen,
        testFile.fileName,
        astFunctionMap,
      );
      const structCode = gen.generateSetupStruct(
        setupStructName,
        testFile.setup,
        testFile.teardown,
      );
      lines.push(structCode);
      lines.push("");
    }

    for (const tc of testFile.testCases) {
      testIndex++;
      const funcName = `test_${testIndex}`;
      const gen = new TestFunctionGenerator(
        testCodegen,
        testFile.fileName,
        astFunctionMap,
      );
      const code = gen.generateTestFunction(
        funcName,
        tc,
        testFile.setup,
        testFile.teardown,
        setupStructName,
        mockedFunctionNames,
      );
      lines.push(code);
      lines.push("");
      registrations.push({
        fileName: testFile.fileName,
        name: tc.name,
        funcName,
      });
    }
  }

  // Generate main() with --json flag support
  lines.push("int main(int argc, char* argv[]) {");
  lines.push("    bool json_mode = false;");
  lines.push("    for (int i = 1; i < argc; i++) {");
  lines.push(
    '        if (strcmp(argv[i], "--json") == 0) { json_mode = true; break; }',
  );
  lines.push("    }");
  lines.push("");

  // Group registrations by file
  const fileGroups = new Map<string, typeof registrations>();
  for (const reg of registrations) {
    if (!fileGroups.has(reg.fileName)) {
      fileGroups.set(reg.fileName, []);
    }
    fileGroups.get(reg.fileName)!.push(reg);
  }

  if (fileGroups.size === 1) {
    // Single file: simple runner
    const [fileName, regs] = [...fileGroups.entries()][0]!;
    lines.push(`    strucpp::TestRunner runner("${escapeString(fileName)}");`);
    lines.push("    runner.set_json_mode(json_mode);");
    for (const reg of regs) {
      lines.push(
        `    runner.add("${escapeString(reg.name)}", ${reg.funcName});`,
      );
    }
    lines.push("    return runner.run();");
  } else {
    // Multiple files: run multiple runners, accumulate exit code
    lines.push("    int exit_code = 0;");
    for (const [fileName, regs] of fileGroups) {
      lines.push("    {");
      lines.push(
        `        strucpp::TestRunner runner("${escapeString(fileName)}");`,
      );
      lines.push("        runner.set_json_mode(json_mode);");
      for (const reg of regs) {
        lines.push(
          `        runner.add("${escapeString(reg.name)}", ${reg.funcName});`,
        );
      }
      lines.push("        if (runner.run() != 0) exit_code = 1;");
      lines.push("    }");
    }
    lines.push("    return exit_code;");
  }
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

/**
 * Collect all MOCK_FUNCTION names from a test body.
 */
function collectMockedFunctions(
  body: TestStatement[],
  names: Set<string>,
): void {
  for (const stmt of body) {
    if (stmt.kind === "MockFunctionStatement") {
      names.add(stmt.functionName);
    }
  }
}

/**
 * Generates C++ code for a single test function.
 * Delegates all ST→C++ translation to TestCodeGenerator.
 */
class TestFunctionGenerator {
  private testCodegen: TestCodeGenerator;
  private astFunctionMap: Map<string, FunctionDeclaration>;
  private fileName: string;
  private indent = "    ";
  /** Names of variables from SETUP block (need s. prefix for mock paths) */
  private setupVarNames: Set<string> | undefined;

  constructor(
    testCodegen: TestCodeGenerator,
    fileName: string,
    astFunctionMap?: Map<string, FunctionDeclaration>,
  ) {
    this.testCodegen = testCodegen;
    this.fileName = fileName;
    this.astFunctionMap =
      astFunctionMap ?? new Map<string, FunctionDeclaration>();
  }

  /**
   * Generate a C++ struct for SETUP/TEARDOWN.
   */
  generateSetupStruct(
    structName: string,
    setup: SetupBlock,
    teardown?: TeardownBlock,
  ): string {
    const lines: string[] = [];
    lines.push(`struct ${structName} {`);

    // Configure codegen: no setup prefix in struct context
    this.testCodegen.clearSetupVars();
    // Build scope from setup vars so codegen can detect FB/program invocations
    const varTypes = new Map<string, string>();
    for (const varBlock of setup.varBlocks) {
      for (const decl of varBlock.declarations) {
        for (const name of decl.names) {
          varTypes.set(name, decl.type.name);
        }
      }
    }
    this.testCodegen.setScopeFromVarTypes(varTypes);

    // Member variables from SETUP VAR blocks
    for (const varBlock of setup.varBlocks) {
      for (const decl of varBlock.declarations) {
        const cppType = this.testCodegen.resolveType(decl.type);
        for (const name of decl.names) {
          lines.push(`    ${cppType} ${name};`);
        }
      }
    }
    lines.push("");

    // setup() method
    lines.push("    void setup() {");
    const savedIndent = this.indent;
    this.indent = "        ";
    for (const stmt of setup.body) {
      this.generateTestStatement(lines, stmt);
    }
    this.indent = savedIndent;
    lines.push("    }");
    lines.push("");

    // teardown() method
    lines.push("    void teardown() {");
    if (teardown) {
      this.indent = "        ";
      for (const stmt of teardown.body) {
        this.generateTestStatement(lines, stmt);
      }
      this.indent = savedIndent;
    }
    lines.push("    }");

    lines.push("};");
    return lines.join("\n");
  }

  generateTestFunction(
    funcName: string,
    tc: TestCase,
    setup?: SetupBlock,
    _teardown?: TeardownBlock,
    setupStructName?: string,
    mockedFunctionNames?: Set<string>,
  ): string {
    const lines: string[] = [];
    lines.push(`// TEST '${escapeString(tc.name)}'`);
    lines.push(`bool ${funcName}(strucpp::TestContext& ctx) {`);

    // Reset function dispatch pointers to real implementations
    if (mockedFunctionNames && mockedFunctionNames.size > 0) {
      for (const name of mockedFunctionNames) {
        lines.push(`${this.indent}${name}_dispatch = ${name}_real;`);
      }
    }

    // Build variable-to-type map for codegen scope (POU invocation detection)
    const varTypes = new Map<string, string>();

    // Include SETUP variables in the type map
    if (setup) {
      for (const varBlock of setup.varBlocks) {
        for (const decl of varBlock.declarations) {
          for (const name of decl.names) {
            varTypes.set(name, decl.type.name);
          }
        }
      }
    }

    for (const varBlock of tc.varBlocks) {
      for (const decl of varBlock.declarations) {
        for (const name of decl.names) {
          varTypes.set(name, decl.type.name);
        }
      }
    }

    this.testCodegen.setScopeFromVarTypes(varTypes);

    // If there's a SETUP, create the struct instance and call setup()
    if (setupStructName) {
      lines.push(`${this.indent}${setupStructName} s;`);
      lines.push(`${this.indent}s.setup();`);
      // Track setup var names so we prefix accesses with s.
      this.setupVarNames = new Set<string>();
      if (setup) {
        for (const varBlock of setup.varBlocks) {
          for (const decl of varBlock.declarations) {
            for (const name of decl.names) {
              this.setupVarNames.add(name);
            }
          }
        }
      }
      this.testCodegen.setSetupVars(this.setupVarNames);
    } else {
      this.setupVarNames = undefined;
      this.testCodegen.clearSetupVars();
    }

    // Generate local variable declarations
    for (const varBlock of tc.varBlocks) {
      this.generateVarBlock(lines, varBlock);
    }

    if (setupStructName) {
      // Wrap body in a lambda so assert failures (return false) don't skip teardown
      lines.push(`${this.indent}bool __passed = [&]() -> bool {`);
      const savedIndent = this.indent;
      this.indent += "    ";
      for (const stmt of tc.body) {
        this.generateTestStatement(lines, stmt);
      }
      lines.push(`${this.indent}return true;`);
      this.indent = savedIndent;
      lines.push(`${this.indent}}();`);
      lines.push(`${this.indent}s.teardown();`);
      lines.push(`${this.indent}return __passed;`);
    } else {
      // No teardown: generate body directly with early returns
      for (const stmt of tc.body) {
        this.generateTestStatement(lines, stmt);
      }
      lines.push(`${this.indent}return true;`);
    }

    lines.push("}");
    return lines.join("\n");
  }

  private generateVarBlock(lines: string[], varBlock: VarBlock): void {
    for (const decl of varBlock.declarations) {
      this.generateVarDeclaration(lines, decl);
    }
  }

  private generateVarDeclaration(lines: string[], decl: VarDeclaration): void {
    const cppType = this.testCodegen.resolveType(decl.type);

    for (const name of decl.names) {
      if (decl.initialValue) {
        lines.push(
          `${this.indent}${cppType} ${name} = ${this.testCodegen.emitExpression(decl.initialValue)};`,
        );
      } else {
        lines.push(`${this.indent}${cppType} ${name};`);
      }
    }
  }

  private generateTestStatement(lines: string[], stmt: TestStatement): void {
    switch (stmt.kind) {
      case "AssertCall":
        this.generateAssertCall(lines, stmt);
        break;
      case "AdvanceTimeStatement":
        this.generateAdvanceTime(lines, stmt);
        break;
      case "MockFBStatement":
        this.generateMockFB(lines, stmt);
        break;
      case "MockFunctionStatement":
        this.generateMockFunction(lines, stmt);
        break;
      case "MockVerifyCalledStatement":
        this.generateMockVerifyCalled(lines, stmt);
        break;
      case "MockVerifyCallCountStatement":
        this.generateMockVerifyCallCount(lines, stmt);
        break;
      case "ReturnStatement":
        lines.push(`${this.indent}return true;`);
        break;
      default:
        // Delegate all other statements to production codegen
        this.testCodegen.clearOutput();
        this.testCodegen.emitStatement(stmt as Statement, this.indent);
        lines.push(...this.testCodegen.getOutput());
        break;
    }
  }

  private generateAdvanceTime(
    lines: string[],
    stmt: AdvanceTimeStatement,
  ): void {
    const durationExpr = this.testCodegen.emitExpression(stmt.duration);
    lines.push(
      `${this.indent}strucpp::__CURRENT_TIME_NS += static_cast<int64_t>(${durationExpr});`,
    );
  }

  // ===========================================================================
  // Mock statement generation
  // ===========================================================================

  private generateMockFB(lines: string[], stmt: MockFBStatement): void {
    const prefix = this.resolveSetupPrefix(stmt.instancePath[0] ?? "");
    const path = this.testCodegen.resolveMemberPath(stmt.instancePath, prefix);
    lines.push(`${this.indent}${path}.__mocked_ = true;`);
  }

  private generateMockFunction(
    lines: string[],
    stmt: MockFunctionStatement,
  ): void {
    const name = stmt.functionName;
    const retVal = this.testCodegen.emitExpression(stmt.returnValue);
    const astFunc = this.astFunctionMap.get(name.toUpperCase());
    if (astFunc) {
      // Use production codegen for correct signature
      const sig = this.testCodegen.generateFunctionSignature(astFunc);
      const params = sig.params
        .map((p) => {
          // Extract param name from "Type name" and comment it out for lambda
          const parts = p.split(/\s+/);
          const paramName = parts[parts.length - 1]!;
          const paramType = parts.slice(0, -1).join(" ");
          return `${paramType} /*${paramName}*/`;
        })
        .join(", ");
      lines.push(
        `${this.indent}${name}_dispatch = [](${params}) -> ${sig.returnType} { return ${sig.returnType}(${retVal}); };`,
      );
    } else {
      // Fallback: generate without type info
      lines.push(
        `${this.indent}${name}_dispatch = [](...) { return ${retVal}; };`,
      );
    }
  }

  private generateMockVerifyCalled(
    lines: string[],
    stmt: MockVerifyCalledStatement,
  ): void {
    const line = stmt.sourceSpan.startLine;
    const prefix = this.resolveSetupPrefix(stmt.instancePath[0] ?? "");
    const path = this.testCodegen.resolveMemberPath(stmt.instancePath, prefix);
    lines.push(
      `${this.indent}if (!ctx.assert_true(${path}.__mock_state_.call_count > 0, "MOCK_VERIFY_CALLED(${escapeString(stmt.instancePath.join("."))})", ${line})) return false;`,
    );
  }

  private generateMockVerifyCallCount(
    lines: string[],
    stmt: MockVerifyCallCountStatement,
  ): void {
    const line = stmt.sourceSpan.startLine;
    const prefix = this.resolveSetupPrefix(stmt.instancePath[0] ?? "");
    const path = this.testCodegen.resolveMemberPath(stmt.instancePath, prefix);
    const expected = this.testCodegen.emitExpression(stmt.expectedCount);
    lines.push(
      `${this.indent}if (!ctx.assert_eq<int>(${path}.__mock_state_.call_count, ${expected}, "${escapeString(stmt.instancePath.join("."))} call count", "${escapeString(expected)}", ${line})) return false;`,
    );
  }

  /**
   * Resolve SETUP prefix for a variable name.
   */
  private resolveSetupPrefix(name: string): string {
    return this.setupVarNames && this.setupVarNames.has(name) ? "s." : "";
  }

  // ===========================================================================
  // Assert generation
  // ===========================================================================

  private generateAssertCall(lines: string[], assert: AssertCall): void {
    const line = assert.sourceSpan.startLine;
    const msgArg = assert.message ? `, "${escapeString(assert.message)}"` : "";

    switch (assert.assertType) {
      case "ASSERT_EQ":
      case "ASSERT_NEQ": {
        if (assert.args.length < 2) {
          throw new Error(
            `${assert.assertType} requires 2 arguments at ${this.fileName}:${line}`,
          );
        }
        const actualExpr = this.testCodegen.emitExpression(assert.args[0]!);
        const expectedExpr = this.testCodegen.emitExpression(assert.args[1]!);
        const actualStr = this.expressionToString(assert.args[0]!);
        const expectedStr = this.expressionToString(assert.args[1]!);
        const method =
          assert.assertType === "ASSERT_EQ" ? "assert_eq" : "assert_neq";
        lines.push(
          `${this.indent}if (!ctx.${method}(${actualExpr}, ${expectedExpr}, "${escapeString(actualStr)}", "${escapeString(expectedStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
      case "ASSERT_TRUE": {
        if (assert.args.length < 1) {
          throw new Error(
            `ASSERT_TRUE requires 1 argument at ${this.fileName}:${line}`,
          );
        }
        const condExpr = this.testCodegen.emitExpression(assert.args[0]!);
        const condStr = this.expressionToString(assert.args[0]!);
        lines.push(
          `${this.indent}if (!ctx.assert_true(static_cast<bool>(${condExpr}), "${escapeString(condStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
      case "ASSERT_FALSE": {
        if (assert.args.length < 1) {
          throw new Error(
            `ASSERT_FALSE requires 1 argument at ${this.fileName}:${line}`,
          );
        }
        const condExpr = this.testCodegen.emitExpression(assert.args[0]!);
        const condStr = this.expressionToString(assert.args[0]!);
        lines.push(
          `${this.indent}if (!ctx.assert_false(static_cast<bool>(${condExpr}), "${escapeString(condStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
      case "ASSERT_GT":
      case "ASSERT_LT":
      case "ASSERT_GE":
      case "ASSERT_LE": {
        if (assert.args.length < 2) {
          throw new Error(
            `${assert.assertType} requires 2 arguments at ${this.fileName}:${line}`,
          );
        }
        const actualExpr = this.testCodegen.emitExpression(assert.args[0]!);
        const thresholdExpr = this.testCodegen.emitExpression(assert.args[1]!);
        const actualStr = this.expressionToString(assert.args[0]!);
        const thresholdStr = this.expressionToString(assert.args[1]!);
        const methodMap: Record<string, string> = {
          ASSERT_GT: "assert_gt",
          ASSERT_LT: "assert_lt",
          ASSERT_GE: "assert_ge",
          ASSERT_LE: "assert_le",
        };
        const method = methodMap[assert.assertType]!;
        lines.push(
          `${this.indent}if (!ctx.${method}(${actualExpr}, ${thresholdExpr}, "${escapeString(actualStr)}", "${escapeString(thresholdStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
      case "ASSERT_NEAR": {
        if (assert.args.length < 3) {
          throw new Error(
            `ASSERT_NEAR requires 3 arguments at ${this.fileName}:${line}`,
          );
        }
        const actualExpr = this.testCodegen.emitExpression(assert.args[0]!);
        const expectedExpr = this.testCodegen.emitExpression(assert.args[1]!);
        const toleranceExpr = this.testCodegen.emitExpression(assert.args[2]!);
        const actualStr = this.expressionToString(assert.args[0]!);
        const expectedStr = this.expressionToString(assert.args[1]!);
        const toleranceStr = this.expressionToString(assert.args[2]!);
        lines.push(
          `${this.indent}if (!ctx.assert_near(${actualExpr}, ${expectedExpr}, ${toleranceExpr}, "${escapeString(actualStr)}", "${escapeString(expectedStr)}", "${escapeString(toleranceStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
    }
  }

  /**
   * Convert an AST expression to its ST source string representation.
   * Used for assertion failure messages (NOT for C++ generation).
   */
  private expressionToString(expr: Expression): string {
    switch (expr.kind) {
      case "VariableExpression": {
        let result = expr.name;
        for (const field of expr.fieldAccess) {
          result += `.${field}`;
        }
        return result;
      }
      case "LiteralExpression":
        return expr.rawValue;
      case "BinaryExpression":
        return `${this.expressionToString(expr.left)} ${expr.operator} ${this.expressionToString(expr.right)}`;
      case "UnaryExpression":
        return `${expr.operator}${this.expressionToString(expr.operand)}`;
      case "ParenthesizedExpression":
        return `(${this.expressionToString(expr.expression)})`;
      case "FunctionCallExpression":
        return `${expr.functionName}(...)`;
      case "MethodCallExpression":
        return `${this.expressionToString(expr.object)}.${expr.methodName}(...)`;
      default:
        return "?";
    }
  }
}

/**
 * Escape a string for use in C++ string literals.
 */
function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\0/g, "\\0");
}
