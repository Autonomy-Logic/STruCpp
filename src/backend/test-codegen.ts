/**
 * TestCodeGenerator — subclass of CodeGenerator for test main generation.
 *
 * Delegates all ST→C++ translation to the production codegen, adding only:
 * - "s." prefix for SETUP variables
 * - ".run()" invocation for program POUs
 * - POU type resolution from POUInfo metadata
 */

import type { Statement, Expression, FunctionCallExpression } from "../frontend/ast.js";
import type { POUInfo } from "./test-main-gen.js";
import { CodeGenerator } from "./codegen.js";
import type { CodeGenOptions } from "./codegen.js";

export class TestCodeGenerator extends CodeGenerator {
  private pouMap: Map<string, POUInfo>;
  private setupVarNames = new Set<string>();
  /** User-defined function names (upper case) — skip std registry for these */
  private userFunctionNames = new Set<string>();

  constructor(pous: POUInfo[], options: Partial<CodeGenOptions> = {}) {
    super(undefined, options);

    this.pouMap = new Map<string, POUInfo>();
    for (const pou of pous) {
      this.pouMap.set(pou.name.toUpperCase(), pou);
      if (pou.kind === "functionBlock") {
        this.knownFBTypes.add(pou.name.toUpperCase());
      }
      if (pou.kind === "program") {
        this.knownProgramTypes.add(pou.name.toUpperCase());
      }
      if (pou.kind === "function") {
        this.userFunctionNames.add(pou.name.toUpperCase());
      }
    }
  }

  /** Set names of SETUP variables that need "s." prefix. */
  setSetupVars(names: Iterable<string>): void {
    this.setupVarNames = new Set(names);
  }

  /** Clear SETUP variable tracking. */
  clearSetupVars(): void {
    this.setupVarNames.clear();
  }

  /** Populate the scope's variable→type map for POU invocation detection. */
  setScopeFromVarTypes(varTypes: Map<string, string>): void {
    this.currentScopeVarTypes.clear();
    for (const [name, typeName] of varTypes) {
      this.currentScopeVarTypes.set(name.toUpperCase(), typeName);
    }
  }

  /** Generate a C++ expression string from an AST Expression. */
  emitExpression(expr: Expression): string {
    return this.generateExpression(expr);
  }

  /** Generate C++ statement(s) and append to output buffer. */
  emitStatement(stmt: Statement, indent: string): void {
    this.generateStatement(stmt, indent);
  }

  /** Get the accumulated output lines. */
  getOutput(): string[] {
    return this.output;
  }

  /** Clear the accumulated output buffer. */
  clearOutput(): void {
    this.output.length = 0;
  }

  /**
   * Resolve a type name to its C++ equivalent.
   * For POUs, maps to the C++ class name. For elementary types, delegates to base.
   */
  resolveType(typeName: string): string {
    const pou = this.pouMap.get(typeName.toUpperCase());
    if (pou) {
      return pou.cppClassName;
    }
    return this.mapVarTypeToCpp(typeName);
  }

  // --- Hook overrides ---

  protected override resolveVariableBaseName(name: string): string {
    if (this.setupVarNames.has(name)) {
      return `s.${name}`;
    }
    return name;
  }

  /**
   * Override function call generation to skip std registry for user-defined functions.
   * In test context, user-defined functions like Add() should not be mapped to standard
   * library ADD() because the std library templates expect IECVar-wrapped arguments.
   */
  protected override generateFunctionCallExpression(expr: FunctionCallExpression): string {
    if (this.userFunctionNames.has(expr.functionName.toUpperCase())) {
      const args = expr.arguments
        .map((arg) => this.generateExpression(arg.value))
        .join(", ");
      return `${expr.functionName}(${args})`;
    }
    return super.generateFunctionCallExpression(expr);
  }

  protected override emitPOUCallLine(instanceName: string, rawName: string, indent: string): void {
    const varType = this.currentScopeVarTypes.get(rawName.toUpperCase());
    if (varType && this.knownProgramTypes.has(varType.toUpperCase())) {
      this.emit(`${indent}${instanceName}.run();`);
    } else {
      this.emit(`${indent}${instanceName}();`);
    }
  }
}
