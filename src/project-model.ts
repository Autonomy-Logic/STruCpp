/**
 * STruC++ Project Model
 *
 * This module defines the project model interfaces and provides a builder
 * that constructs the project model from the AST. It also performs validation
 * of the project structure, including VAR_GLOBAL and VAR_EXTERNAL resolution.
 */

import type {
  CompilationUnit,
  ConfigurationDeclaration,
  ResourceDeclaration,
  TaskDeclaration,
  ProgramInstance,
  ProgramDeclaration,
  FunctionDeclaration,
  FunctionBlockDeclaration,
  VarBlock,
  VarDeclaration,
  Expression,
} from "./frontend/ast.js";
import type { CompileError } from "./types.js";

// =============================================================================
// Project Model Interfaces
// =============================================================================

/**
 * Library reference with namespace information.
 */
export interface LibraryReference {
  /** Library name */
  name: string;
  /** Namespace identifier for the library */
  namespace: string;
  /** Optional path to library files */
  path?: string;
}

/**
 * Project configuration for namespace and library management.
 */
export interface ProjectConfig {
  /** Project name */
  name: string;
  /** Namespace identifier (defaults to project name if not specified) */
  namespace?: string;
  /** Referenced libraries */
  libraries: LibraryReference[];
}

/**
 * Time value representation for task intervals.
 */
export interface TimeValue {
  /** Time in nanoseconds */
  nanoseconds: number;
  /** Original string representation */
  rawValue: string;
}

/**
 * Variable declaration in the project model.
 */
export interface ProjectVarDeclaration {
  name: string;
  typeName: string;
  maxLength?: number | string; // For STRING(n) / WSTRING(n) parameterized length; string for constant names
  initialValue?: string;
  isConstant: boolean;
  isRetain: boolean;
  address?: string;
}

/**
 * External variable declaration (reference to global).
 */
export interface VarExternalDeclaration {
  name: string;
  typeName: string;
}

/**
 * Program declaration in the project model.
 */
export interface ProgramDecl {
  name: string;
  varDeclarations: ProjectVarDeclaration[];
  varExternal: VarExternalDeclaration[];
  hasBody: boolean;
}

/**
 * Program instance declaration.
 */
export interface ProgramInstanceDecl {
  instanceName: string;
  programType: string;
  taskName?: string;
}

/**
 * Task declaration in the project model.
 */
export interface TaskDecl {
  name: string;
  interval?: TimeValue;
  priority?: number;
  programInstances: ProgramInstanceDecl[];
}

/**
 * Resource declaration in the project model.
 */
export interface ResourceDecl {
  name: string;
  processor: string;
  tasks: TaskDecl[];
}

/**
 * Configuration declaration in the project model.
 */
export interface ConfigurationDecl {
  name: string;
  globalVars: ProjectVarDeclaration[];
  resources: ResourceDecl[];
}

/**
 * Function declaration in the project model.
 */
export interface FunctionDecl {
  name: string;
  returnType: string;
  parameters: ProjectVarDeclaration[];
}

/**
 * Function block declaration in the project model.
 */
export interface FunctionBlockDecl {
  name: string;
  inputs: ProjectVarDeclaration[];
  outputs: ProjectVarDeclaration[];
  inouts: ProjectVarDeclaration[];
  locals: ProjectVarDeclaration[];
}

/**
 * The complete project model.
 */
export interface ProjectModel {
  configurations: ConfigurationDecl[];
  programs: Map<string, ProgramDecl>;
  functions: Map<string, FunctionDecl>;
  functionBlocks: Map<string, FunctionBlockDecl>;

  /** Project configuration (optional, for namespace support) */
  config?: ProjectConfig;
}

/**
 * Get the effective namespace for a project model.
 * Returns the configured namespace, or the project name, or "strucpp" as fallback.
 */
export function getProjectNamespace(model: ProjectModel): string {
  if (model.config?.namespace) {
    return model.config.namespace;
  }
  if (model.config?.name) {
    return model.config.name;
  }
  return "strucpp";
}

/**
 * Resolve a qualified name to its namespace and local name.
 * Returns undefined if the name is not qualified.
 */
export function resolveQualifiedName(
  name: string,
): { namespace: string; localName: string } | undefined {
  const dotIndex = name.indexOf(".");
  if (dotIndex === -1) {
    return undefined;
  }
  return {
    namespace: name.substring(0, dotIndex),
    localName: name.substring(dotIndex + 1),
  };
}

/**
 * Convert an IEC qualified name to C++ qualified name.
 * Replaces dots with double colons.
 */
export function toQualifiedCppName(name: string): string {
  return name.replace(/\./g, "::");
}

/**
 * Result of building the project model.
 */
export interface ProjectModelResult {
  success: boolean;
  model: ProjectModel;
  errors: CompileError[];
  warnings: CompileError[];
}

// =============================================================================
// Time Literal Parsing
// =============================================================================

/**
 * Parse a TIME literal string to nanoseconds.
 * Supports formats like T#20ms, T#1s, T#100us, TIME#1h2m3s, etc.
 */
export function parseTimeLiteral(literal: string): TimeValue {
  const rawValue = literal;
  let nanoseconds = 0;

  // Remove T# or TIME# prefix (case insensitive)
  let value = literal.replace(/^(T|TIME)#/i, "");

  // Parse components: d (days), h (hours), m (minutes), s (seconds), ms (milliseconds), us (microseconds), ns (nanoseconds)
  const patterns = [
    { regex: /(\d+(?:\.\d+)?)d/i, multiplier: 24 * 60 * 60 * 1_000_000_000 },
    { regex: /(\d+(?:\.\d+)?)h/i, multiplier: 60 * 60 * 1_000_000_000 },
    { regex: /(\d+(?:\.\d+)?)m(?!s)/i, multiplier: 60 * 1_000_000_000 },
    { regex: /(\d+(?:\.\d+)?)s(?!$)/i, multiplier: 1_000_000_000 },
    { regex: /(\d+(?:\.\d+)?)ms/i, multiplier: 1_000_000 },
    { regex: /(\d+(?:\.\d+)?)us/i, multiplier: 1_000 },
    { regex: /(\d+(?:\.\d+)?)ns/i, multiplier: 1 },
    // Handle bare seconds at the end (e.g., T#1s)
    { regex: /(\d+(?:\.\d+)?)s$/i, multiplier: 1_000_000_000 },
  ];

  for (const { regex, multiplier } of patterns) {
    const match = value.match(regex);
    if (match && match[1] !== undefined) {
      nanoseconds += parseFloat(match[1]) * multiplier;
      value = value.replace(regex, "");
    }
  }

  return { nanoseconds, rawValue };
}

// =============================================================================
// Project Model Builder
// =============================================================================

/**
 * Builds a ProjectModel from a CompilationUnit AST.
 */
export class ProjectModelBuilder {
  private errors: CompileError[] = [];
  private warnings: CompileError[] = [];
  private programs: Map<string, ProgramDecl> = new Map();
  private functions: Map<string, FunctionDecl> = new Map();
  private functionBlocks: Map<string, FunctionBlockDecl> = new Map();
  private configurations: ConfigurationDecl[] = [];

  /**
   * Build the project model from an AST.
   */
  build(ast: CompilationUnit): ProjectModelResult {
    this.errors = [];
    this.warnings = [];
    this.programs = new Map();
    this.functions = new Map();
    this.functionBlocks = new Map();
    this.configurations = [];

    // First pass: collect all program, function, and function block declarations
    for (const prog of ast.programs) {
      this.processProgram(prog);
    }

    for (const func of ast.functions) {
      this.processFunction(func);
    }

    for (const fb of ast.functionBlocks) {
      this.processFunctionBlock(fb);
    }

    // Second pass: process configurations and validate references
    for (const config of ast.configurations) {
      this.processConfiguration(config);
    }

    // Third pass: validate VAR_EXTERNAL references
    this.validateExternalReferences();

    return {
      success: this.errors.length === 0,
      model: {
        configurations: this.configurations,
        programs: this.programs,
        functions: this.functions,
        functionBlocks: this.functionBlocks,
      },
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  /**
   * Process a program declaration.
   */
  private processProgram(prog: ProgramDeclaration): void {
    const name = prog.name.toUpperCase();

    if (this.programs.has(name)) {
      this.addError(
        `Duplicate program declaration: ${prog.name}`,
        prog.sourceSpan.startLine,
        prog.sourceSpan.startCol,
      );
      return;
    }

    const varDeclarations: ProjectVarDeclaration[] = [];
    const varExternal: VarExternalDeclaration[] = [];

    for (const block of prog.varBlocks) {
      if (block.blockType === "VAR_EXTERNAL") {
        for (const decl of block.declarations) {
          for (const varName of decl.names) {
            varExternal.push({
              name: varName,
              typeName: decl.type.name,
            });
          }
        }
      } else {
        for (const decl of block.declarations) {
          for (const varName of decl.names) {
            varDeclarations.push(
              this.convertVarDeclaration(varName, decl, block),
            );
          }
        }
      }
    }

    this.programs.set(name, {
      name: prog.name,
      varDeclarations,
      varExternal,
      hasBody: prog.body.length > 0,
    });
  }

  /**
   * Process a function declaration.
   */
  private processFunction(func: FunctionDeclaration): void {
    const name = func.name.toUpperCase();

    if (this.functions.has(name)) {
      this.addError(
        `Duplicate function declaration: ${func.name}`,
        func.sourceSpan.startLine,
        func.sourceSpan.startCol,
      );
      return;
    }

    const parameters: ProjectVarDeclaration[] = [];

    for (const block of func.varBlocks) {
      if (block.blockType === "VAR_INPUT") {
        for (const decl of block.declarations) {
          for (const varName of decl.names) {
            parameters.push(this.convertVarDeclaration(varName, decl, block));
          }
        }
      }
    }

    this.functions.set(name, {
      name: func.name,
      returnType: func.returnType.name,
      parameters,
    });
  }

  /**
   * Process a function block declaration.
   */
  private processFunctionBlock(fb: FunctionBlockDeclaration): void {
    const name = fb.name.toUpperCase();

    if (this.functionBlocks.has(name)) {
      this.addError(
        `Duplicate function block declaration: ${fb.name}`,
        fb.sourceSpan.startLine,
        fb.sourceSpan.startCol,
      );
      return;
    }

    const inputs: ProjectVarDeclaration[] = [];
    const outputs: ProjectVarDeclaration[] = [];
    const inouts: ProjectVarDeclaration[] = [];
    const locals: ProjectVarDeclaration[] = [];

    for (const block of fb.varBlocks) {
      const target =
        block.blockType === "VAR_INPUT"
          ? inputs
          : block.blockType === "VAR_OUTPUT"
            ? outputs
            : block.blockType === "VAR_IN_OUT"
              ? inouts
              : locals;

      for (const decl of block.declarations) {
        for (const varName of decl.names) {
          target.push(this.convertVarDeclaration(varName, decl, block));
        }
      }
    }

    this.functionBlocks.set(name, {
      name: fb.name,
      inputs,
      outputs,
      inouts,
      locals,
    });
  }

  /**
   * Process a configuration declaration.
   */
  private processConfiguration(config: ConfigurationDeclaration): void {
    const globalVars: ProjectVarDeclaration[] = [];

    // Collect VAR_GLOBAL declarations
    for (const block of config.varBlocks) {
      if (block.blockType === "VAR_GLOBAL") {
        for (const decl of block.declarations) {
          for (const varName of decl.names) {
            globalVars.push(this.convertVarDeclaration(varName, decl, block));
          }
        }
      }
    }

    const resources: ResourceDecl[] = [];

    for (const resource of config.resources) {
      resources.push(this.processResource(resource, config.name));
    }

    this.configurations.push({
      name: config.name,
      globalVars,
      resources,
    });
  }

  /**
   * Process a resource declaration.
   */
  private processResource(
    resource: ResourceDeclaration,
    configName: string,
  ): ResourceDecl {
    const tasks: TaskDecl[] = [];

    // First, collect all tasks
    const taskMap = new Map<string, TaskDecl>();
    for (const task of resource.tasks) {
      const taskDecl = this.processTask(task);
      taskMap.set(task.name.toUpperCase(), taskDecl);
      tasks.push(taskDecl);
    }

    // Then, assign program instances to tasks
    for (const instance of resource.programInstances) {
      const instanceDecl = this.processProgramInstance(instance, configName);

      // Validate program type exists
      if (!this.programs.has(instance.programType.toUpperCase())) {
        this.addError(
          `Unknown program type '${instance.programType}' in program instance '${instance.instanceName}'`,
          instance.sourceSpan.startLine,
          instance.sourceSpan.startCol,
        );
      }

      // Add to appropriate task
      if (instance.taskName) {
        const task = taskMap.get(instance.taskName.toUpperCase());
        if (task) {
          task.programInstances.push(instanceDecl);
        } else {
          this.addError(
            `Unknown task '${instance.taskName}' in program instance '${instance.instanceName}'`,
            instance.sourceSpan.startLine,
            instance.sourceSpan.startCol,
          );
        }
      } else {
        // Program instance without task - add to first task or create warning
        const firstTask = tasks[0];
        if (firstTask !== undefined) {
          firstTask.programInstances.push(instanceDecl);
          this.addWarning(
            `Program instance '${instance.instanceName}' has no task assignment, assigned to '${firstTask.name}'`,
            instance.sourceSpan.startLine,
            instance.sourceSpan.startCol,
          );
        }
      }
    }

    return {
      name: resource.name,
      processor: resource.onType,
      tasks,
    };
  }

  /**
   * Process a task declaration.
   */
  private processTask(task: TaskDeclaration): TaskDecl {
    let interval: TimeValue | undefined;
    let priority: number | undefined;

    // Extract INTERVAL and PRIORITY from properties
    for (const [propName, expr] of task.properties) {
      const upperName = propName.toUpperCase();
      if (upperName === "INTERVAL") {
        interval = this.extractTimeValue(expr);
      } else if (upperName === "PRIORITY") {
        priority = this.extractIntValue(expr);
      }
    }

    // Use conditional spreading for optional properties to comply with exactOptionalPropertyTypes
    return {
      name: task.name,
      programInstances: [],
      ...(interval !== undefined ? { interval } : {}),
      ...(priority !== undefined ? { priority } : {}),
    };
  }

  /**
   * Process a program instance.
   */
  private processProgramInstance(
    instance: ProgramInstance,
    _configName: string,
  ): ProgramInstanceDecl {
    // Use conditional spreading for optional taskName to comply with exactOptionalPropertyTypes
    return {
      instanceName: instance.instanceName,
      programType: instance.programType,
      ...(instance.taskName !== undefined
        ? { taskName: instance.taskName }
        : {}),
    };
  }

  /**
   * Validate VAR_EXTERNAL references against VAR_GLOBAL declarations.
   */
  private validateExternalReferences(): void {
    // Build a map of all global variables across all configurations
    const globalVarMap = new Map<
      string,
      { typeName: string; configName: string }
    >();

    for (const config of this.configurations) {
      for (const globalVar of config.globalVars) {
        const key = globalVar.name.toUpperCase();
        if (globalVarMap.has(key)) {
          // Global variable defined in multiple configurations - this is allowed
          // but we should check type consistency
          const existing = globalVarMap.get(key)!;
          if (
            existing.typeName.toUpperCase() !== globalVar.typeName.toUpperCase()
          ) {
            this.addWarning(
              `Global variable '${globalVar.name}' has different types in configurations '${existing.configName}' (${existing.typeName}) and '${config.name}' (${globalVar.typeName})`,
              0,
              0,
            );
          }
        } else {
          globalVarMap.set(key, {
            typeName: globalVar.typeName,
            configName: config.name,
          });
        }
      }
    }

    // Check each program's VAR_EXTERNAL references
    for (const prog of this.programs.values()) {
      for (const ext of prog.varExternal) {
        const key = ext.name.toUpperCase();
        const globalVar = globalVarMap.get(key);

        if (!globalVar) {
          this.addError(
            `VAR_EXTERNAL '${ext.name}' in program '${prog.name}' has no matching VAR_GLOBAL declaration`,
            0,
            0,
          );
        } else if (
          globalVar.typeName.toUpperCase() !== ext.typeName.toUpperCase()
        ) {
          this.addError(
            `Type mismatch for VAR_EXTERNAL '${ext.name}' in program '${prog.name}': expected '${globalVar.typeName}' but found '${ext.typeName}'`,
            0,
            0,
          );
        }
      }
    }
  }

  /**
   * Convert an AST VarDeclaration to a ProjectVarDeclaration.
   */
  private convertVarDeclaration(
    name: string,
    decl: VarDeclaration,
    block: VarBlock,
  ): ProjectVarDeclaration {
    let initialValue: string | undefined;
    if (decl.initialValue) {
      initialValue = this.expressionToString(decl.initialValue);
    }

    // Use conditional spreading for optional properties to comply with exactOptionalPropertyTypes
    return {
      name,
      typeName: decl.type.name,
      isConstant: block.isConstant,
      isRetain: block.isRetain,
      ...(initialValue !== undefined ? { initialValue } : {}),
      ...(decl.address !== undefined ? { address: decl.address } : {}),
      ...(decl.type.maxLength !== undefined
        ? { maxLength: decl.type.maxLength }
        : {}),
    };
  }

  /**
   * Extract a TIME value from an expression.
   */
  private extractTimeValue(expr: Expression): TimeValue | undefined {
    if (expr.kind === "LiteralExpression") {
      const lit = expr;
      if (lit.literalType === "TIME" && typeof lit.value === "string") {
        return parseTimeLiteral(lit.value);
      }
      // Handle raw string that might be a time literal
      if (
        typeof lit.rawValue === "string" &&
        lit.rawValue.match(/^T#|^TIME#/i)
      ) {
        return parseTimeLiteral(lit.rawValue);
      }
    }
    return undefined;
  }

  /**
   * Extract an integer value from an expression.
   */
  private extractIntValue(expr: Expression): number | undefined {
    if (expr.kind === "LiteralExpression") {
      const lit = expr;
      if (typeof lit.value === "number") {
        return Math.floor(lit.value);
      }
    }
    return undefined;
  }

  /**
   * Convert an expression to a string representation.
   */
  private expressionToString(expr: Expression): string {
    if (expr.kind === "LiteralExpression") {
      const lit = expr;
      return lit.rawValue;
    }
    if (expr.kind === "VariableExpression") {
      return expr.name;
    }
    return "";
  }

  /**
   * Add an error message.
   */
  private addError(message: string, line: number, column: number): void {
    this.errors.push({
      message,
      line,
      column,
      severity: "error",
    });
  }

  /**
   * Add a warning message.
   */
  private addWarning(message: string, line: number, column: number): void {
    this.warnings.push({
      message,
      line,
      column,
      severity: "warning",
    });
  }
}

/**
 * Build a project model from an AST.
 * Convenience function that creates a builder and builds the model.
 */
export function buildProjectModel(ast: CompilationUnit): ProjectModelResult {
  const builder = new ProjectModelBuilder();
  return builder.build(ast);
}
