/**
 * STruC++ Test Main Generator
 *
 * Generates test_main.cpp from parsed test files and compiled source.
 * Each TEST block becomes a bool test_N(TestContext&) function.
 * The generated main() registers all tests and calls runner.run().
 */

import type {
  TestFile,
  TestCase,
  TestStatement,
  AssertCall,
  SetupBlock,
  TeardownBlock,
} from "../testing/test-model.js";
import type {
  VarBlock,
  VarDeclaration,
  Statement,
  Expression,
  AssignmentStatement,
  FunctionCallStatement,
  FunctionCallExpression,
  MethodCallExpression,
  VariableExpression,
  LiteralExpression,
  BinaryExpression,
  UnaryExpression,
  IfStatement,
  ForStatement,
  WhileStatement,
  RepeatStatement,
  CaseStatement,
} from "../frontend/ast.js";

/**
 * Map of IEC type names to C++ type suffixes for the template specialization.
 */
const TYPE_MAP: Record<string, string> = {
  BOOL: "BOOL_t",
  SINT: "SINT_t",
  INT: "INT_t",
  DINT: "DINT_t",
  LINT: "LINT_t",
  USINT: "USINT_t",
  UINT: "UINT_t",
  UDINT: "UDINT_t",
  ULINT: "ULINT_t",
  REAL: "REAL_t",
  LREAL: "LREAL_t",
  BYTE: "BYTE_t",
  WORD: "WORD_t",
  DWORD: "DWORD_t",
  LWORD: "LWORD_t",
  STRING: "STRING_t",
  WSTRING: "WSTRING_t",
  TIME: "TIME_t",
};

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
 * Options for test main generation.
 */
export interface TestMainGenOptions {
  /** Header filename to include */
  headerFileName: string;
  /** Known POUs from the source compilation */
  pous: POUInfo[];
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
  const pouMap = new Map<string, POUInfo>();
  for (const pou of options.pous) {
    pouMap.set(pou.name.toUpperCase(), pou);
  }

  // Includes
  lines.push(`#include "${options.headerFileName}"`);
  lines.push('#include "iec_test.hpp"');
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

  for (const testFile of testFiles) {
    // Generate SETUP/TEARDOWN struct if present
    let setupStructName: string | undefined;
    if (testFile.setup) {
      setupIndex++;
      setupStructName = `TestSetup_${setupIndex}`;
      const gen = new TestFunctionGenerator(pouMap, testFile.fileName);
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
      const gen = new TestFunctionGenerator(pouMap, testFile.fileName);
      const code = gen.generateTestFunction(
        funcName,
        tc,
        testFile.setup,
        testFile.teardown,
        setupStructName,
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

  // Generate main()
  lines.push("int main() {");

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
    lines.push(
      `    strucpp::TestRunner runner("${escapeString(fileName)}");`,
    );
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
      for (const reg of regs) {
        lines.push(
          `        runner.add("${escapeString(reg.name)}", ${reg.funcName});`,
        );
      }
      lines.push(
        "        if (runner.run() != 0) exit_code = 1;",
      );
      lines.push("    }");
    }
    lines.push("    return exit_code;");
  }
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generates C++ code for a single test function.
 */
class TestFunctionGenerator {
  private pouMap: Map<string, POUInfo>;
  private fileName: string;
  private indent = "    ";
  /** Maps local variable names to their declared type names (for POU resolution) */
  private varTypeMap = new Map<string, string>();
  /** Names of variables from SETUP block (need s. prefix in test functions) */
  private setupVarNames: Set<string> | undefined;

  constructor(pouMap: Map<string, POUInfo>, fileName: string) {
    this.pouMap = pouMap;
    this.fileName = fileName;
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

    // Member variables from SETUP VAR blocks
    for (const varBlock of setup.varBlocks) {
      for (const decl of varBlock.declarations) {
        const typeName = decl.type.name;
        const cppType = this.resolveTypeName(typeName);
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
  ): string {
    const lines: string[] = [];
    lines.push(`// TEST '${escapeString(tc.name)}'`);
    lines.push(`bool ${funcName}(strucpp::TestContext& ctx) {`);

    // Build variable-to-type map for POU resolution
    this.varTypeMap.clear();

    // Include SETUP variables in the type map
    if (setup) {
      for (const varBlock of setup.varBlocks) {
        for (const decl of varBlock.declarations) {
          for (const name of decl.names) {
            this.varTypeMap.set(name, decl.type.name);
          }
        }
      }
    }

    for (const varBlock of tc.varBlocks) {
      for (const decl of varBlock.declarations) {
        for (const name of decl.names) {
          this.varTypeMap.set(name, decl.type.name);
        }
      }
    }

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
    } else {
      this.setupVarNames = undefined;
    }

    // Generate local variable declarations
    for (const varBlock of tc.varBlocks) {
      this.generateVarBlock(lines, varBlock);
    }

    // Generate test body statements
    for (const stmt of tc.body) {
      this.generateTestStatement(lines, stmt);
    }

    // Call teardown if present
    if (setupStructName) {
      lines.push(`${this.indent}s.teardown();`);
    }

    lines.push(`${this.indent}return true;`);
    lines.push("}");
    return lines.join("\n");
  }

  private generateVarBlock(lines: string[], varBlock: VarBlock): void {
    for (const decl of varBlock.declarations) {
      this.generateVarDeclaration(lines, decl);
    }
  }

  private generateVarDeclaration(
    lines: string[],
    decl: VarDeclaration,
  ): void {
    const typeName = decl.type.name;
    const cppType = this.resolveTypeName(typeName);

    for (const name of decl.names) {
      if (decl.initialValue) {
        lines.push(
          `${this.indent}${cppType} ${name} = ${this.generateExpression(decl.initialValue)};`,
        );
      } else {
        lines.push(`${this.indent}${cppType} ${name};`);
      }
    }
  }

  /**
   * Resolve a type name to its C++ equivalent.
   * For POUs (programs/FBs), maps to the C++ class name.
   * For elementary types, maps to the C++ type wrapper.
   */
  private resolveTypeName(typeName: string): string {
    // Check if it's a known POU
    const pou = this.pouMap.get(typeName.toUpperCase());
    if (pou) {
      return pou.cppClassName;
    }
    // Elementary type mapping
    return TYPE_MAP[typeName.toUpperCase()] ?? typeName;
  }

  private generateTestStatement(
    lines: string[],
    stmt: TestStatement,
  ): void {
    if (stmt.kind === "AssertCall") {
      this.generateAssertCall(lines, stmt as AssertCall);
    } else {
      this.generateStatement(lines, stmt as Statement);
    }
  }

  private generateAssertCall(
    lines: string[],
    assert: AssertCall,
  ): void {
    const line = assert.sourceSpan.startLine;
    const msgArg = assert.message
      ? `, "${escapeString(assert.message)}"`
      : "";

    switch (assert.assertType) {
      case "ASSERT_EQ":
      case "ASSERT_NEQ": {
        if (assert.args.length < 2) {
          throw new Error(
            `${assert.assertType} requires 2 arguments at ${this.fileName}:${line}`,
          );
        }
        const actualExpr = this.generateExpression(assert.args[0]!);
        const expectedExpr = this.generateExpression(assert.args[1]!);
        const actualStr = this.expressionToString(assert.args[0]!);
        const expectedStr = this.expressionToString(assert.args[1]!);
        const method =
          assert.assertType === "ASSERT_EQ" ? "assert_eq" : "assert_neq";
        lines.push(
          `${this.indent}if (!ctx.${method}(static_cast<decltype(${expectedExpr})>(${actualExpr}), ${expectedExpr}, "${escapeString(actualStr)}", "${escapeString(expectedStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
      case "ASSERT_TRUE": {
        if (assert.args.length < 1) {
          throw new Error(
            `ASSERT_TRUE requires 1 argument at ${this.fileName}:${line}`,
          );
        }
        const condExpr = this.generateExpression(assert.args[0]!);
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
        const condExpr = this.generateExpression(assert.args[0]!);
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
        const actualExpr = this.generateExpression(assert.args[0]!);
        const thresholdExpr = this.generateExpression(assert.args[1]!);
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
          `${this.indent}if (!ctx.${method}(static_cast<decltype(${thresholdExpr})>(${actualExpr}), ${thresholdExpr}, "${escapeString(actualStr)}", "${escapeString(thresholdStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
      case "ASSERT_NEAR": {
        if (assert.args.length < 3) {
          throw new Error(
            `ASSERT_NEAR requires 3 arguments at ${this.fileName}:${line}`,
          );
        }
        const actualExpr = this.generateExpression(assert.args[0]!);
        const expectedExpr = this.generateExpression(assert.args[1]!);
        const toleranceExpr = this.generateExpression(assert.args[2]!);
        const actualStr = this.expressionToString(assert.args[0]!);
        const expectedStr = this.expressionToString(assert.args[1]!);
        const toleranceStr = this.expressionToString(assert.args[2]!);
        lines.push(
          `${this.indent}if (!ctx.assert_near(static_cast<decltype(${expectedExpr})>(${actualExpr}), ${expectedExpr}, ${toleranceExpr}, "${escapeString(actualStr)}", "${escapeString(expectedStr)}", "${escapeString(toleranceStr)}", ${line}${msgArg})) return false;`,
        );
        break;
      }
    }
  }

  /**
   * Convert an AST expression to its ST source string representation.
   * Used for assertion failure messages.
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

  // ===========================================================================
  // Statement generation (simplified version for test context)
  // ===========================================================================

  private generateStatement(lines: string[], stmt: Statement): void {
    switch (stmt.kind) {
      case "AssignmentStatement":
        this.generateAssignment(lines, stmt);
        break;
      case "FunctionCallStatement":
        this.generateFunctionCallStatement(lines, stmt);
        break;
      case "IfStatement":
        this.generateIfStatement(lines, stmt);
        break;
      case "ForStatement":
        this.generateForStatement(lines, stmt);
        break;
      case "WhileStatement":
        this.generateWhileStatement(lines, stmt);
        break;
      case "RepeatStatement":
        this.generateRepeatStatement(lines, stmt);
        break;
      case "CaseStatement":
        this.generateCaseStatement(lines, stmt);
        break;
      case "ExitStatement":
        lines.push(`${this.indent}break;`);
        break;
      case "ReturnStatement":
        lines.push(`${this.indent}return true;`);
        break;
      case "ExternalCodePragma":
        // Extract code content from pragma
        lines.push(`${this.indent}${stmt.code}`);
        break;
      case "RefAssignStatement":
        lines.push(
          `${this.indent}${this.generateExpression(stmt.target)}.bind(${this.generateExpression(stmt.source)});`,
        );
        break;
      case "DeleteStatement":
        lines.push(
          `${this.indent}strucpp::iec_delete(${this.generateExpression(stmt.pointer)});`,
        );
        break;
      case "AssertCall":
        this.generateAssertCall(lines, stmt as AssertCall);
        break;
    }
  }

  private generateAssignment(
    lines: string[],
    stmt: AssignmentStatement,
  ): void {
    const target = this.generateExpression(stmt.target);
    const value = this.generateExpression(stmt.value);
    lines.push(`${this.indent}${target} = ${value};`);
  }

  private generateFunctionCallStatement(
    lines: string[],
    stmt: FunctionCallStatement,
  ): void {
    if (stmt.call.kind === "MethodCallExpression") {
      lines.push(
        `${this.indent}${this.generateMethodCallExpression(stmt.call)};`,
      );
      return;
    }

    const call = stmt.call as FunctionCallExpression;
    const funcName = call.functionName;

    // Resolve the variable's declared type to find the POU
    // e.g., `uut()` where uut is declared as `VAR uut : Counter; END_VAR`
    const varTypeName = this.varTypeMap.get(funcName);
    const pou = varTypeName
      ? this.pouMap.get(varTypeName.toUpperCase())
      : this.pouMap.get(funcName.toUpperCase());

    // Prefix SETUP variables with s.
    const prefix =
      this.setupVarNames && this.setupVarNames.has(funcName) ? "s." : "";

    if (pou) {
      if (pou.kind === "program") {
        lines.push(`${this.indent}${prefix}${funcName}.run();`);
      } else {
        lines.push(`${this.indent}${prefix}${funcName}();`);
      }
      return;
    }

    // Standard function call
    lines.push(
      `${this.indent}${this.generateFunctionCallExpression(call)};`,
    );
  }

  private generateIfStatement(
    lines: string[],
    stmt: IfStatement,
  ): void {
    lines.push(
      `${this.indent}if (${this.generateExpression(stmt.condition)}) {`,
    );
    const savedIndent = this.indent;
    this.indent += "    ";
    for (const s of stmt.thenStatements) {
      this.generateStatement(lines, s);
    }
    this.indent = savedIndent;
    for (const elsif of stmt.elsifClauses) {
      lines.push(
        `${this.indent}} else if (${this.generateExpression(elsif.condition)}) {`,
      );
      this.indent += "    ";
      for (const s of elsif.statements) {
        this.generateStatement(lines, s);
      }
      this.indent = savedIndent;
    }
    if (stmt.elseStatements.length > 0) {
      lines.push(`${this.indent}} else {`);
      this.indent += "    ";
      for (const s of stmt.elseStatements) {
        this.generateStatement(lines, s);
      }
      this.indent = savedIndent;
    }
    lines.push(`${this.indent}}`);
  }

  private generateForStatement(
    lines: string[],
    stmt: ForStatement,
  ): void {
    const varName = stmt.controlVariable;
    const start = this.generateExpression(stmt.start);
    const end = this.generateExpression(stmt.end);
    const step = stmt.step
      ? this.generateExpression(stmt.step)
      : "1";
    lines.push(
      `${this.indent}for (auto ${varName} = ${start}; ${varName} <= ${end}; ${varName} += ${step}) {`,
    );
    const savedIndent = this.indent;
    this.indent += "    ";
    for (const s of stmt.body) {
      this.generateStatement(lines, s);
    }
    this.indent = savedIndent;
    lines.push(`${this.indent}}`);
  }

  private generateWhileStatement(
    lines: string[],
    stmt: WhileStatement,
  ): void {
    lines.push(
      `${this.indent}while (${this.generateExpression(stmt.condition)}) {`,
    );
    const savedIndent = this.indent;
    this.indent += "    ";
    for (const s of stmt.body) {
      this.generateStatement(lines, s);
    }
    this.indent = savedIndent;
    lines.push(`${this.indent}}`);
  }

  private generateRepeatStatement(
    lines: string[],
    stmt: RepeatStatement,
  ): void {
    lines.push(`${this.indent}do {`);
    const savedIndent = this.indent;
    this.indent += "    ";
    for (const s of stmt.body) {
      this.generateStatement(lines, s);
    }
    this.indent = savedIndent;
    lines.push(
      `${this.indent}} while (!(${this.generateExpression(stmt.condition)}));`,
    );
  }

  private generateCaseStatement(
    lines: string[],
    stmt: CaseStatement,
  ): void {
    lines.push(
      `${this.indent}switch (static_cast<int>(${this.generateExpression(stmt.selector)})) {`,
    );
    const savedIndent = this.indent;
    for (const caseElem of stmt.cases) {
      for (const label of caseElem.labels) {
        lines.push(
          `${this.indent}    case ${this.generateExpression(label.start)}:`,
        );
      }
      this.indent = savedIndent + "        ";
      for (const s of caseElem.statements) {
        this.generateStatement(lines, s);
      }
      lines.push(`${this.indent}break;`);
      this.indent = savedIndent;
    }
    if (stmt.elseStatements.length > 0) {
      lines.push(`${this.indent}    default:`);
      this.indent = savedIndent + "        ";
      for (const s of stmt.elseStatements) {
        this.generateStatement(lines, s);
      }
      lines.push(`${this.indent}break;`);
      this.indent = savedIndent;
    }
    lines.push(`${this.indent}}`);
  }

  // ===========================================================================
  // Expression generation
  // ===========================================================================

  private generateExpression(expr: Expression): string {
    switch (expr.kind) {
      case "LiteralExpression":
        return this.generateLiteral(expr);
      case "VariableExpression":
        return this.generateVariable(expr);
      case "BinaryExpression":
        return this.generateBinary(expr);
      case "UnaryExpression":
        return this.generateUnary(expr);
      case "ParenthesizedExpression":
        return `(${this.generateExpression(expr.expression)})`;
      case "FunctionCallExpression":
        return this.generateFunctionCallExpression(expr);
      case "MethodCallExpression":
        return this.generateMethodCallExpression(expr);
      case "RefExpression":
        return `REF(${this.generateExpression(expr.operand)})`;
      case "DrefExpression":
        return `${this.generateExpression(expr.operand)}.deref()`;
      case "NewExpression": {
        const typeName = expr.allocationType.name;
        if (expr.arraySize) {
          return `strucpp::iec_new_array<${typeName}>(${this.generateExpression(expr.arraySize)})`;
        }
        return `strucpp::iec_new<${typeName}>()`;
      }
    }
  }

  private generateLiteral(expr: LiteralExpression): string {
    switch (expr.literalType) {
      case "BOOL":
        return expr.value === true ||
          expr.value === "TRUE" ||
          expr.rawValue?.toUpperCase() === "TRUE"
          ? "true"
          : "false";
      case "INT":
        return String(expr.value);
      case "REAL": {
        const str = String(expr.value);
        return str.includes(".") ? str : str + ".0";
      }
      case "STRING": {
        const inner = expr.rawValue.replace(/^'|'$/g, "");
        return `"${inner}"`;
      }
      case "WSTRING": {
        const wInner = expr.rawValue.replace(/^'|'$/g, "");
        return `L"${wInner}"`;
      }
      case "TIME": {
        // Time literals remain as raw values
        return String(expr.value);
      }
      case "NULL":
        return "IEC_NULL";
      default:
        return String(expr.value);
    }
  }

  private generateVariable(expr: VariableExpression): string {
    // Prefix SETUP variables with s. in test functions
    const prefix =
      this.setupVarNames && this.setupVarNames.has(expr.name) ? "s." : "";
    let result = prefix + expr.name;
    if (expr.isDereference) {
      result = `(*${result})`;
    }
    for (let i = 0; i < expr.subscripts.length; i++) {
      result += `[${this.generateExpression(expr.subscripts[i]!)}]`;
    }
    for (const field of expr.fieldAccess) {
      result += `.${field}`;
    }
    return result;
  }

  private generateBinary(expr: BinaryExpression): string {
    const left = this.generateExpression(expr.left);
    const right = this.generateExpression(expr.right);
    const op = this.mapBinaryOp(expr.operator);
    return `${left} ${op} ${right}`;
  }

  private mapBinaryOp(op: string): string {
    switch (op) {
      case "AND":
        return "&&";
      case "OR":
        return "||";
      case "XOR":
        return "^";
      case "MOD":
        return "%";
      case "=":
        return "==";
      case "<>":
        return "!=";
      case "**":
        return "**"; // Will need special handling for pow
      default:
        return op;
    }
  }

  private generateUnary(expr: UnaryExpression): string {
    const operand = this.generateExpression(expr.operand);
    switch (expr.operator) {
      case "NOT":
        return `!${operand}`;
      case "-":
        return `-${operand}`;
      case "+":
        return `+${operand}`;
      default:
        return operand;
    }
  }

  private generateFunctionCallExpression(
    expr: FunctionCallExpression,
  ): string {
    const args = expr.arguments
      .map((arg) => {
        if (arg.name) {
          return this.generateExpression(arg.value);
        }
        return this.generateExpression(arg.value);
      })
      .join(", ");
    return `${expr.functionName}(${args})`;
  }

  private generateMethodCallExpression(
    expr: MethodCallExpression,
  ): string {
    const obj = this.generateExpression(expr.object);
    const args = expr.arguments
      .map((arg) => this.generateExpression(arg.value))
      .join(", ");
    return `${obj}.${expr.methodName}(${args})`;
  }
}

/**
 * Escape a string for use in C++ string literals.
 */
function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}
