/**
 * TestCodeGenerator — subclass of CodeGenerator for test main generation.
 *
 * Delegates all ST→C++ translation to the production codegen, adding only:
 * - "s." prefix for SETUP variables
 * - ".run()" invocation for program POUs
 * - POU type resolution from POUInfo metadata
 * - AST-aware type/signature generation via initFromAST()
 */

import type {
  Statement,
  Expression,
  FunctionCallExpression,
  CompilationUnit,
  FunctionDeclaration,
  TypeReference,
} from "../frontend/ast.js";
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

  /**
   * Populate known type sets from the AST.
   * Mirrors what CodeGenerator.generate() does at startup so that
   * isUserDefinedType(), mapVarTypeToCpp() etc. work correctly for
   * struct/interface/FB types.
   */
  initFromAST(ast: CompilationUnit): void {
    this.ast = ast;
    for (const fb of ast.functionBlocks) {
      this.knownFBTypes.add(fb.name.toUpperCase());
      for (const method of fb.methods) {
        this.methodNameMap.set(
          `${fb.name.toUpperCase()}.${method.name.toUpperCase()}`,
          method.name,
        );
      }
      for (const prop of fb.properties) {
        this.propertyNameMap.set(
          `${fb.name.toUpperCase()}.${prop.name.toUpperCase()}`,
          prop.name,
        );
      }
    }
    for (const iface of ast.interfaces) {
      this.knownInterfaceTypes.add(iface.name.toUpperCase());
      for (const method of iface.methods) {
        this.methodNameMap.set(
          `${iface.name.toUpperCase()}.${method.name.toUpperCase()}`,
          method.name,
        );
      }
    }
    for (const td of ast.types) {
      this.knownStructTypes.add(td.name.toUpperCase());
    }
    for (const prog of ast.programs) {
      this.knownProgramTypes.add(prog.name.toUpperCase());
    }
    for (const func of ast.functions) {
      this.userFunctionNames.add(func.name.toUpperCase());
    }
  }

  /**
   * Generate a function signature using production codegen methods.
   * Returns the C++ return type and parameter strings.
   */
  generateFunctionSignature(func: FunctionDeclaration): {
    returnType: string;
    params: string[];
  } {
    return {
      returnType: this.mapTypeRefToCpp(func.returnType),
      params: this.generateFunctionParams(func),
    };
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

  /**
   * Resolve a dot-separated member access path, applying name mangling
   * where a member name collides with its type name in a class context.
   * E.g., ["CTRL", "SENSOR"] → "CTRL.SENSOR_" when SENSOR is type Sensor in Controller.
   */
  resolveMemberPath(path: string[], prefix: string): string {
    if (path.length === 0) return prefix;
    const parts: string[] = [];
    // First element is the root variable
    const rootName = path[0]!;
    parts.push(prefix + rootName);
    let currentType = this.currentScopeVarTypes.get(rootName.toUpperCase());

    for (let i = 1; i < path.length; i++) {
      const field = path[i]!;
      if (currentType && this.ast) {
        const memberType = this.resolveMemberType(currentType, field);
        if (
          memberType &&
          this.isUserDefinedType(memberType) &&
          field.toUpperCase() === memberType.toUpperCase()
        ) {
          parts.push(`${field}_`);
        } else {
          parts.push(field);
        }
        currentType = memberType;
      } else {
        parts.push(field);
      }
    }
    return parts.join(".");
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
   * Resolve a type to its C++ equivalent.
   * Accepts either a string type name or a TypeReference (preserving maxLength).
   * For POUs, maps to the C++ class name. For elementary types, delegates to base.
   */
  resolveType(typeOrName: TypeReference | string): string {
    const name = typeof typeOrName === "string" ? typeOrName : typeOrName.name;
    const maxLength =
      typeof typeOrName === "string" ? undefined : typeOrName.maxLength;
    const pou = this.pouMap.get(name.toUpperCase());
    if (pou) {
      return pou.cppClassName;
    }
    return this.mapVarTypeToCpp(
      name,
      typeof maxLength === "number" ? maxLength : undefined,
    );
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
  protected override generateFunctionCallExpression(
    expr: FunctionCallExpression,
  ): string {
    if (this.userFunctionNames.has(expr.functionName.toUpperCase())) {
      const args = expr.arguments
        .map((arg) => this.generateExpression(arg.value))
        .join(", ");
      return `${expr.functionName}(${args})`;
    }
    return super.generateFunctionCallExpression(expr);
  }

  protected override emitPOUCallLine(
    instanceName: string,
    rawName: string,
    indent: string,
  ): void {
    const varType = this.currentScopeVarTypes.get(rawName.toUpperCase());
    if (varType && this.knownProgramTypes.has(varType.toUpperCase())) {
      this.emit(`${indent}${instanceName}.run();`);
    } else {
      this.emit(`${indent}${instanceName}();`);
    }
  }
}
