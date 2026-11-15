// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Instance paths: access to program instance variables and to globals from a POU marked
 * `{attribute 'instance_paths'}` (a vendor extension, not IEC 61131-3).
 *
 * In a marked POU, `inst.Prog.Var` (short form) and `Config.Res.inst.Prog.Var` (long form) name a variable of a
 * program instance declared in a CONFIGURATION, and a CONFIGURATION's VAR_GLOBAL is reachable by its bare name or as
 * `Config.Name`, without a VAR_EXTERNAL. Resolution annotates each such `VariableExpression` with an
 * {@link InstancePathRef}, which the type checker and the code generator read.
 *
 * With `external` set (the `externalInstancePaths` compile option), every access to a path or to a global from a
 * marked POU becomes a call into host-provided functions, keyed by a dense id per distinct path, so the leaf must be
 * an elementary or string value reached with constant indices and never by address.
 */

import type {
  Argument,
  ASTNode,
  Attribute,
  CompilationUnit,
  ConfigurationDeclaration,
  Expression,
  FunctionBlockDeclaration,
  InstancePathRef,
  ProgramDeclaration,
  ProgramInstance,
  ResourceDeclaration,
  Statement,
  TypeDeclaration,
  TypeReference,
  VarBlock,
  VarBlockType,
  VarDeclaration,
  VariableExpression,
} from "../frontend/ast.js";
import type { CompileError } from "../types.js";
import { walkAST } from "../ast-utils.js";
import type { Scope, SymbolTables } from "./symbol-table.js";
import { ELEMENTARY_TYPES, evalIntConst } from "./type-utils.js";

/** Name of the attribute pragma that enables instance paths in a POU. */
export const INSTANCE_PATHS_ATTRIBUTE = "instance_paths";

/** One distinct path used by the compilation, as reported in the compile result. */
export interface InstancePathEntry {
  /** Dense id passed to `strucpp::external_read` / `strucpp::external_write`. */
  id: number;
  /** A program instance's variable or a global. */
  kind: "instance" | "global";
  /** Canonical upper-case path: `CONFIG.RES.INST.PROG.VAR...`, `CONFIG.GLOBAL...` or `GLOBAL...`. */
  path: string;
  /** Elementary type name, `STRING` or `WSTRING`. */
  type: string;
  /** Declared length of a `STRING` / `WSTRING` leaf. */
  maxLength?: number;
  read: boolean;
  written: boolean;
}

/**
 * True when a PROGRAM, CONFIGURATION or top-level VAR_GLOBAL block belongs to the host under external instance
 * paths, and is therefore not emitted: in external mode, one declared in `externalSources`, or any without it.
 */
export function isHostOwned(
  node: ASTNode,
  options: InstancePathOptions,
): boolean {
  if (options.external !== true) return false;
  return (
    options.externalSources === undefined ||
    options.externalSources.includes(node.sourceSpan.file)
  );
}

/** Options of {@link resolveInstancePaths}. */
export interface InstancePathOptions {
  /** Compile accesses as calls into host functions (`externalInstancePaths`). */
  external?: boolean;
  /**
   * With `external`: the source files whose PROGRAMs, CONFIGURATIONs and top-level VAR_GLOBAL blocks the host owns.
   * Undefined means every one of them is host-owned.
   */
  externalSources?: readonly string[];
}

/** Result of {@link resolveInstancePaths}. */
export interface InstancePathResolution {
  errors: CompileError[];
  /** Distinct paths in id order; filled in external mode only. */
  entries: InstancePathEntry[];
}

/** True when a POU, method or property carries `{attribute 'instance_paths'}`. */
export function hasInstancePathsAttribute(node: {
  attributes?: Attribute[];
}): boolean {
  return (
    node.attributes?.some(
      (a) => a.name.toLowerCase() === INSTANCE_PATHS_ATTRIBUTE,
    ) ?? false
  );
}

/** A program instance with the configuration and resource that declare it. */
export interface InstanceLocation {
  configuration: ConfigurationDeclaration;
  resource: ResourceDeclaration;
  instance: ProgramInstance;
}

/** A variable declaration with the block that holds it. */
export interface DeclaredVariable {
  name: string;
  declaration: VarDeclaration;
  block: VarBlock;
}

/** Block types whose variables an instance path may reach: a program's persistent state. */
const REACHABLE_BLOCKS: ReadonlySet<VarBlockType> = new Set([
  "VAR",
  "VAR_INPUT",
  "VAR_OUTPUT",
]);

function variablesOf(blocks: readonly VarBlock[]): DeclaredVariable[] {
  const out: DeclaredVariable[] = [];
  for (const block of blocks)
    for (const declaration of block.declarations)
      for (const name of declaration.names)
        out.push({ name: name.toUpperCase(), declaration, block });
  return out;
}

/**
 * Lookup over the CONFIGURATIONs, program declarations and globals of a compilation unit, shared by the analyzer
 * and the language server. All keys are upper case.
 */
export class InstancePathIndex {
  readonly configurations = new Map<string, ConfigurationDeclaration>();
  readonly programs = new Map<string, ProgramDeclaration>();
  /** Every program instance by instance name, in declaration order. */
  readonly instances = new Map<string, InstanceLocation[]>();
  /** Top-level VAR_GLOBAL variables. */
  readonly unitGlobals = new Map<string, DeclaredVariable>();
  /** CONFIGURATION VAR_GLOBAL variables by name, with the configurations that declare them. */
  readonly configurationGlobals = new Map<
    string,
    Array<DeclaredVariable & { configuration: ConfigurationDeclaration }>
  >();

  /**
   * @param include Which CONFIGURATIONs and top-level VAR_GLOBAL blocks to index (all by default); programs are
   *   always indexed, since they only supply types.
   */
  constructor(
    readonly ast: CompilationUnit,
    include: (node: ConfigurationDeclaration | VarBlock) => boolean = () =>
      true,
  ) {
    for (const prog of ast.programs)
      this.programs.set(prog.name.toUpperCase(), prog);
    for (const v of variablesOf(
      ast.globalVarBlocks.filter(
        (b) => b.blockType === "VAR_GLOBAL" && include(b),
      ),
    ))
      if (!this.unitGlobals.has(v.name)) this.unitGlobals.set(v.name, v);
    for (const configuration of ast.configurations) {
      if (!include(configuration)) continue;
      const key = configuration.name.toUpperCase();
      if (!this.configurations.has(key))
        this.configurations.set(key, configuration);
      for (const v of variablesOf(
        configuration.varBlocks.filter((b) => b.blockType === "VAR_GLOBAL"),
      )) {
        const list = this.configurationGlobals.get(v.name) ?? [];
        list.push({ ...v, configuration });
        this.configurationGlobals.set(v.name, list);
      }
      for (const resource of configuration.resources)
        for (const instance of resource.programInstances) {
          const name = instance.instanceName.toUpperCase();
          const list = this.instances.get(name) ?? [];
          list.push({ configuration, resource, instance });
          this.instances.set(name, list);
        }
    }
  }

  /** A resource of a configuration, by name. */
  resource(
    configuration: ConfigurationDeclaration,
    name: string,
  ): ResourceDeclaration | undefined {
    const upper = name.toUpperCase();
    return configuration.resources.find((r) => r.name.toUpperCase() === upper);
  }

  /** A configuration's own VAR_GLOBAL, by name. */
  configurationGlobal(
    configuration: ConfigurationDeclaration,
    name: string,
  ): DeclaredVariable | undefined {
    return this.configurationGlobals
      .get(name.toUpperCase())
      ?.find((g) => g.configuration === configuration);
  }

  /** Every variable a program declares, in declaration order. */
  programVariables(programType: string): DeclaredVariable[] {
    const prog = this.programs.get(programType.toUpperCase());
    return prog === undefined ? [] : variablesOf(prog.varBlocks);
  }

  /** The variables of a program that an instance path may reach. */
  reachableVariables(programType: string): DeclaredVariable[] {
    return this.programVariables(programType).filter((v) =>
      REACHABLE_BLOCKS.has(v.block.blockType),
    );
  }
}

/** Where an access sits, which decides what it compiles to. */
type AccessContext = "read" | "write" | "address" | "output";

/** Code inside one POU, method or property, with the scope it resolves names in. */
interface CodeUnit {
  statements: Statement[];
  scope: Scope;
  marked: boolean;
  /** A host-owned program body, which is not emitted. */
  hostProgram: boolean;
  /** The function block whose members (own and inherited) are in scope, if any. */
  fb?: FunctionBlockDeclaration;
  /** Names that are not variables of the scope but still resolve locally (result variables, THIS, SUPER). */
  ownNames: ReadonlySet<string>;
}

const BIT_STEP = /^\d+$/;

function sameName(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

/**
 * Resolves instance paths and the globals used by marked POUs, annotating each access with an
 * {@link InstancePathRef}. Runs after the symbol tables are built and before type checking.
 */
export function resolveInstancePaths(
  ast: CompilationUnit,
  symbolTables: SymbolTables,
  options: InstancePathOptions = {},
): InstancePathResolution {
  return new InstancePathResolver(ast, symbolTables, options).run();
}

class InstancePathResolver {
  private readonly index: InstancePathIndex;
  private readonly external: boolean;
  private readonly options: InstancePathOptions;
  private readonly errors: CompileError[] = [];
  private readonly entries = new Map<string, InstancePathEntry>();
  private readonly fbByName = new Map<string, FunctionBlockDeclaration>();
  private readonly scheduled = new Set<ProgramInstance>();

  constructor(
    private readonly ast: CompilationUnit,
    private readonly symbolTables: SymbolTables,
    options: InstancePathOptions,
  ) {
    this.options = options;
    this.external = options.external === true;
    // In external mode, paths and globals resolve only into what the host owns.
    this.index = new InstancePathIndex(
      ast,
      (node) => !this.external || isHostOwned(node, options),
    );
    for (const fb of ast.functionBlocks)
      this.fbByName.set(fb.name.toUpperCase(), fb);
    for (const configuration of ast.configurations)
      for (const resource of configuration.resources)
        for (const instance of resource.programInstances) {
          const task =
            instance.taskName === undefined
              ? resource.tasks[0]
              : resource.tasks.find((t) =>
                  sameName(t.name, instance.taskName ?? ""),
                );
          if (task !== undefined) this.scheduled.add(instance);
        }
  }

  run(): InstancePathResolution {
    for (const unit of this.codeUnits()) {
      if (unit.marked) this.resolveUnit(unit);
      else if (this.external) this.checkUnmarkedUnit(unit);
    }
    if (this.external) this.checkExternalDeclarations();
    return {
      errors: this.errors,
      entries: [...this.entries.values()].sort((a, b) => a.id - b.id),
    };
  }

  private codeUnits(): CodeUnit[] {
    const units: CodeUnit[] = [];
    const none: ReadonlySet<string> = new Set();
    for (const prog of this.ast.programs) {
      const scope = this.symbolTables.getProgramScope(prog.name);
      if (scope)
        units.push({
          statements: prog.body,
          scope,
          marked: hasInstancePathsAttribute(prog),
          hostProgram: isHostOwned(prog, this.options),
          ownNames: none,
        });
    }
    for (const func of this.ast.functions) {
      const scope = this.symbolTables.getFunctionScope(func.name);
      if (scope)
        units.push({
          statements: func.body,
          scope,
          marked: hasInstancePathsAttribute(func),
          hostProgram: false,
          ownNames: new Set([func.name.toUpperCase()]),
        });
    }
    for (const fb of this.ast.functionBlocks) {
      const scope = this.symbolTables.getFBScope(fb.name);
      if (!scope) continue;
      const marked = hasInstancePathsAttribute(fb);
      const fbNames = new Set(["THIS", "SUPER"]);
      units.push({
        statements: fb.body,
        scope,
        marked,
        hostProgram: false,
        fb,
        ownNames: fbNames,
      });
      for (const method of fb.methods) {
        units.push({
          statements: method.body,
          scope:
            this.symbolTables.getMethodScope(fb.name, method.name) ?? scope,
          marked: marked || hasInstancePathsAttribute(method),
          hostProgram: false,
          fb,
          ownNames: new Set([...fbNames, method.name.toUpperCase()]),
        });
      }
      for (const prop of fb.properties) {
        const propMarked = marked || hasInstancePathsAttribute(prop);
        const ownNames = new Set([...fbNames, prop.name.toUpperCase()]);
        for (const statements of [prop.getter, prop.setter])
          if (statements)
            units.push({
              statements,
              scope,
              marked: propMarked,
              hostProgram: false,
              fb,
              ownNames,
            });
      }
    }
    return units;
  }

  // -------------------------------------------------------------------------
  // Name scoping
  // -------------------------------------------------------------------------

  /** True when `name` resolves to something of the unit itself rather than to a global or a configuration name. */
  private isLocalName(name: string, unit: CodeUnit): boolean {
    const upper = name.toUpperCase();
    if (unit.ownNames.has(upper)) return true;
    const hit = unit.scope.lookup(upper);
    if (
      hit !== undefined &&
      hit.kind !== "enumValue" &&
      this.symbolTables.globalScope.lookupLocal(upper) !== hit
    )
      return true;
    return unit.fb !== undefined && this.isInheritedMember(unit.fb, upper);
  }

  private isInheritedMember(
    fb: FunctionBlockDeclaration,
    upper: string,
  ): boolean {
    const seen = new Set<string>();
    let parent = fb.extends;
    while (parent !== undefined && !seen.has(parent.toUpperCase())) {
      seen.add(parent.toUpperCase());
      const local = this.fbByName.get(parent.toUpperCase());
      if (local !== undefined) {
        if (variablesOf(local.varBlocks).some((v) => v.name === upper))
          return true;
        parent = local.extends;
        continue;
      }
      const lib = this.symbolTables.lookupFunctionBlock(parent);
      if (lib === undefined) return false;
      const members = [
        ...lib.inputs,
        ...lib.outputs,
        ...lib.inouts,
        ...lib.locals,
      ];
      if (members.some((m) => m.name.toUpperCase() === upper)) return true;
      parent = lib.declaration.extends;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Marked units
  // -------------------------------------------------------------------------

  private resolveUnit(unit: CodeUnit): void {
    const contexts = new Map<VariableExpression, AccessContext>();
    for (const stmt of unit.statements) {
      walkAST(stmt, (node: ASTNode) => {
        this.noteContexts(node, unit, contexts);
        if (node.kind !== "VariableExpression") return;
        const expr = node as VariableExpression;
        this.resolveExpression(expr, unit, contexts.get(expr) ?? "read");
      });
    }
  }

  /** Records the access context of the variable expressions directly under `node`. */
  private noteContexts(
    node: ASTNode,
    unit: CodeUnit,
    contexts: Map<VariableExpression, AccessContext>,
  ): void {
    const mark = (e: Expression | undefined, ctx: AccessContext): void => {
      let target = e;
      while (target?.kind === "ParenthesizedExpression")
        target = target.expression;
      if (target?.kind === "VariableExpression") contexts.set(target, ctx);
    };
    switch (node.kind) {
      case "AssignmentStatement": {
        const s = node as Extract<Statement, { kind: "AssignmentStatement" }>;
        mark(s.target, "write");
        return;
      }
      case "RefAssignStatement": {
        const s = node as Extract<Statement, { kind: "RefAssignStatement" }>;
        mark(s.target, "address");
        mark(s.source, "address");
        return;
      }
      case "RefExpression": {
        const e = node as Extract<Expression, { kind: "RefExpression" }>;
        mark(e.operand, "address");
        return;
      }
      case "FunctionCallExpression": {
        const call = node as Extract<
          Expression,
          { kind: "FunctionCallExpression" }
        >;
        const upper = call.functionName.toUpperCase();
        const byAddress = upper === "ADR" || upper === "ADRINST";
        const params = this.calleeParameters(call.functionName, unit);
        call.arguments.forEach((arg, i) => {
          if (byAddress) mark(arg.value, "address");
          else this.markArgument(arg, i, params, mark);
        });
        return;
      }
      case "MethodCallExpression": {
        const call = node as Extract<
          Expression,
          { kind: "MethodCallExpression" }
        >;
        const params = this.methodParameters(
          call.object,
          call.methodName,
          unit,
        );
        call.arguments.forEach((arg, i) =>
          this.markArgument(arg, i, params, mark),
        );
        return;
      }
      default:
        return;
    }
  }

  private markArgument(
    arg: Argument,
    position: number,
    params: ParameterShape[] | undefined,
    mark: (e: Expression, ctx: AccessContext) => void,
  ): void {
    if (arg.isOutput) {
      mark(arg.value, "output");
      return;
    }
    if (params === undefined) return;
    const param =
      arg.name !== undefined
        ? params.find((p) => sameName(p.name, arg.name ?? ""))
        : params.filter((p) => !p.output)[position];
    if (param?.byReference === true) mark(arg.value, "address");
  }

  /** Parameters of a function, or of the block an FB instance call invokes. */
  private calleeParameters(
    name: string,
    unit: CodeUnit,
  ): ParameterShape[] | undefined {
    const func = this.symbolTables.lookupFunction(name);
    if (func !== undefined && func.parameters.length === 0)
      return parametersOf(func.declaration?.varBlocks ?? []);
    if (func !== undefined)
      return func.parameters.map((p) => ({
        name: p.name,
        output: p.isOutput,
        byReference:
          p.isInOut || p.declaration?.type?.referenceKind === "reference_to",
      }));
    const head = name.split(".")[0] ?? name;
    const sym = unit.scope.lookup(head);
    if (sym?.kind !== "variable" || name.includes(".")) return undefined;
    const fb = this.symbolTables.lookupFunctionBlock(
      sym.declaration?.type?.name ?? "",
    );
    if (fb === undefined) return undefined;
    return [
      ...fb.inputs.map((p) => ({
        name: p.name,
        output: false,
        byReference: p.declaration?.type?.referenceKind === "reference_to",
      })),
      ...fb.inouts.map((p) => ({
        name: p.name,
        output: false,
        byReference: true,
      })),
      ...fb.outputs.map((p) => ({
        name: p.name,
        output: true,
        byReference: false,
      })),
    ];
  }

  /** Parameters of a method of this unit's own blocks, called on a local instance, THIS or SUPER. */
  private methodParameters(
    object: Expression,
    methodName: string,
    unit: CodeUnit,
  ): ParameterShape[] | undefined {
    if (object.kind !== "VariableExpression") return undefined;
    let typeName: string | undefined;
    const upper = object.name.toUpperCase();
    if (upper === "THIS") typeName = unit.fb?.name;
    else if (upper === "SUPER") typeName = unit.fb?.extends;
    else {
      const sym = unit.scope.lookup(object.name);
      if (sym?.kind === "variable") typeName = sym.declaration?.type?.name;
    }
    const seen = new Set<string>();
    while (typeName !== undefined && !seen.has(typeName.toUpperCase())) {
      seen.add(typeName.toUpperCase());
      const fb = this.fbByName.get(typeName.toUpperCase());
      if (fb === undefined) return undefined;
      const method = fb.methods.find((m) => sameName(m.name, methodName));
      if (method !== undefined) return parametersOf(method.varBlocks);
      typeName = fb.extends;
    }
    return undefined;
  }

  private resolveExpression(
    expr: VariableExpression,
    unit: CodeUnit,
    context: AccessContext,
  ): void {
    if (expr.typedLiteral === true || this.isLocalName(expr.name, unit)) return;
    const head = expr.name.toUpperCase();
    const unitGlobal = this.index.unitGlobals.get(head);
    if (unitGlobal?.block.isConstant === true) return;
    if (unitGlobal !== undefined) {
      if (this.symbolTables.globalScope.lookupLocal(head) === undefined) return;
      this.finish(
        expr,
        {
          kind: "global",
          globalScope: "unit",
          consumed: 0,
          variable: head,
          rootType: unitGlobal.declaration.type,
          prefix: head,
          block: unitGlobal.block,
        },
        context,
      );
      return;
    }

    const configuration = this.index.configurations.get(head);
    if (configuration !== undefined) {
      this.resolveLongForm(expr, configuration, context);
      return;
    }

    const instances = this.index.instances.get(head);
    if (instances !== undefined) {
      this.resolveShortForm(expr, instances, context);
      return;
    }

    const globals = this.index.configurationGlobals.get(head);
    const first = globals?.[0];
    if (first === undefined) {
      const progName = this.fieldSteps(expr, 2)?.[0];
      if (
        progName !== undefined &&
        this.index.programs.has(progName.toUpperCase())
      )
        this.error(
          `No program instance named '${expr.name}' is declared in a configuration.`,
          expr,
        );
      return;
    }
    this.finish(
      expr,
      {
        kind: "global",
        globalScope: "configuration",
        consumed: 0,
        variable: head,
        rootType: first.declaration.type,
        configuration: first.configuration,
        prefix: `${first.configuration.name.toUpperCase()}.${head}`,
        block: first.block,
      },
      context,
    );
  }

  /** The names of the first `count` steps, or undefined when one is not a field. */
  private fieldSteps(
    expr: VariableExpression,
    count: number,
  ): string[] | undefined {
    const chain = expr.accessChain ?? [];
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const step = chain[i];
      if (step === undefined) return names;
      if (step.kind !== "field") return undefined;
      names.push(step.name);
    }
    return names;
  }

  private resolveLongForm(
    expr: VariableExpression,
    configuration: ConfigurationDeclaration,
    context: AccessContext,
  ): void {
    const text = this.describe(expr);
    const steps = this.fieldSteps(expr, 4);
    if (steps === undefined) {
      this.error(`Invalid instance path '${text}'.`, expr);
      return;
    }
    const [first, instName, progName, varName] = steps;
    if (first === undefined) {
      this.error(
        `Incomplete instance path '${text}': name a resource or a global of configuration '${configuration.name}'.`,
        expr,
      );
      return;
    }
    const global = this.index.configurationGlobal(configuration, first);
    if (global !== undefined) {
      this.finish(
        expr,
        {
          kind: "global",
          globalScope: "configuration",
          consumed: 1,
          variable: first.toUpperCase(),
          rootType: global.declaration.type,
          configuration,
          prefix: `${configuration.name}.${first}`.toUpperCase(),
          block: global.block,
        },
        context,
      );
      return;
    }
    const resource = this.index.resource(configuration, first);
    if (resource === undefined) {
      this.error(
        `Configuration '${configuration.name}' has no resource or global named '${first}'.`,
        expr,
      );
      return;
    }
    if (
      instName === undefined ||
      progName === undefined ||
      varName === undefined
    ) {
      this.error(
        `Incomplete instance path '${text}': expected '${configuration.name}.${resource.name}.<instance>.<program type>.<variable>'.`,
        expr,
      );
      return;
    }
    const instance = resource.programInstances.find((p) =>
      sameName(p.instanceName, instName),
    );
    if (instance === undefined) {
      this.error(
        `Resource '${configuration.name}.${resource.name}' has no program instance named '${instName}'.`,
        expr,
      );
      return;
    }
    this.resolveProgramVariable(
      expr,
      { configuration, resource, instance },
      progName,
      varName,
      4,
      context,
    );
  }

  private resolveShortForm(
    expr: VariableExpression,
    instances: InstanceLocation[],
    context: AccessContext,
  ): void {
    const text = this.describe(expr);
    const steps = this.fieldSteps(expr, 2);
    if (steps === undefined) {
      this.error(`Invalid instance path '${text}'.`, expr);
      return;
    }
    const [progName, varName] = steps;
    if (progName === undefined || varName === undefined) {
      this.error(
        `Incomplete instance path '${text}': expected '${expr.name}.<program type>.<variable>'.`,
        expr,
      );
      return;
    }
    const first = instances[0];
    if (first === undefined) return;
    if (instances.length > 1) {
      const where = instances
        .map((l) => `${l.configuration.name}.${l.resource.name}`)
        .join("', '");
      this.error(
        `Program instance '${expr.name}' is declared in more than one resource ('${where}'); use the long form '<configuration>.<resource>.${expr.name}.${progName}.${varName}'.`,
        expr,
      );
      return;
    }
    this.resolveProgramVariable(expr, first, progName, varName, 2, context);
  }

  private resolveProgramVariable(
    expr: VariableExpression,
    location: InstanceLocation,
    progName: string,
    varName: string,
    consumed: number,
    context: AccessContext,
  ): void {
    const { configuration, resource, instance } = location;
    if (!sameName(instance.programType, progName)) {
      this.error(
        `${instance.instanceName} is an instance of '${instance.programType}', not '${progName}'.`,
        expr,
      );
      return;
    }
    const variable = this.index
      .programVariables(instance.programType)
      .find((v) => v.name === varName.toUpperCase());
    if (variable === undefined) {
      this.error(
        `Program '${instance.programType}' has no variable '${varName}'.`,
        expr,
      );
      return;
    }
    if (!REACHABLE_BLOCKS.has(variable.block.blockType)) {
      this.error(
        `'${varName}' of program '${instance.programType}' is declared in ${variable.block.blockType}; an instance path reaches only VAR, VAR_INPUT and VAR_OUTPUT variables.`,
        expr,
      );
      return;
    }
    if (!this.external) {
      if (configuration !== this.ast.configurations[0]) {
        this.error(
          `Instance path '${this.describe(expr)}' names configuration '${configuration.name}'; without externalInstancePaths only the first configuration ('${this.ast.configurations[0]?.name ?? ""}') is reachable.`,
          expr,
        );
        return;
      }
      if (!this.scheduled.has(instance)) {
        this.error(
          `Program instance '${instance.instanceName}' is not assigned to a task, so it is not instantiated.`,
          expr,
        );
        return;
      }
    }
    const prefix = [
      configuration.name,
      resource.name,
      instance.instanceName,
      instance.programType,
      varName,
    ]
      .join(".")
      .toUpperCase();
    this.finish(
      expr,
      {
        kind: "instance",
        consumed,
        variable: varName.toUpperCase(),
        rootType: variable.declaration.type,
        configuration,
        resource,
        instance,
        prefix,
        block: variable.block,
      },
      context,
    );
  }

  /** Walks the root variable's own access steps, checks the external-mode rules and annotates `expr`. */
  private finish(
    expr: VariableExpression,
    root: RootInfo,
    context: AccessContext,
  ): void {
    const steps = (expr.accessChain ?? []).slice(root.consumed);
    let current: TypeShape | undefined = root.rootType;
    let path = root.prefix;
    let bit: number | undefined;
    let problem: string | undefined;
    let unresolved = false;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step === undefined) break;
      if (step.kind === "dereference") {
        problem ??= "it dereferences a pointer";
        current = undefined;
        unresolved = true;
        continue;
      }
      if (step.kind === "subscript") {
        const indices = step.indices.map((e) => evalIntConst(e));
        if (indices.some((n) => n === undefined)) {
          problem ??= "it uses a non-constant array index";
          path += "[?]";
        } else path += `[${indices.join(",")}]`;
        current = current === undefined ? undefined : this.elementOf(current);
        if (current === undefined) unresolved = true;
        continue;
      }
      if (BIT_STEP.test(step.name)) {
        if (i !== steps.length - 1) {
          problem ??= "it continues after a bit access";
        }
        bit = Number(step.name);
        continue;
      }
      path += `.${step.name.toUpperCase()}`;
      current =
        current === undefined ? undefined : this.memberOf(current, step.name);
      if (current === undefined) unresolved = true;
    }

    const leaf = current === undefined ? undefined : this.leafOf(current);
    const ref: InstancePathRef = {
      kind: root.kind,
      path,
      consumed: root.consumed,
      rootType: root.rootType,
      variable: root.variable,
      id: -1,
    };
    if (root.globalScope !== undefined) ref.globalScope = root.globalScope;
    if (root.configuration !== undefined)
      ref.configuration = root.configuration.name.toUpperCase();
    if (root.resource !== undefined)
      ref.resource = root.resource.name.toUpperCase();
    if (root.instance !== undefined) {
      ref.instance = root.instance.instanceName.toUpperCase();
      ref.programType = root.instance.programType.toUpperCase();
    }
    if (leaf !== undefined && typeof leaf !== "string") ref.leaf = leaf;
    if (bit !== undefined) ref.bit = bit;
    expr.instancePath = ref;

    const written = context === "write" || context === "output";
    if (written && root.block.isConstant) {
      this.error(
        `Cannot assign to '${this.describe(expr)}': it is a CONSTANT.`,
        expr,
      );
      return;
    }
    if (!this.external) return;

    const text = this.describe(expr);
    if (context === "address") {
      this.error(
        `'${text}' cannot be used by address or reference (ADR, REF, REF=, VAR_IN_OUT, REFERENCE TO) with externalInstancePaths.`,
        expr,
      );
      return;
    }
    if (context === "output") {
      this.error(
        `'${text}' cannot be bound to an output ('=>') with externalInstancePaths; assign it in a separate statement.`,
        expr,
      );
      return;
    }
    if (problem !== undefined) {
      this.error(
        `'${text}' cannot be accessed with externalInstancePaths: ${problem}.`,
        expr,
      );
      return;
    }
    if (unresolved) return;
    if (leaf === undefined || typeof leaf === "string") {
      this.error(
        `'${text}' ends at ${typeof leaf === "string" ? leaf : "a value that is not elementary"}; with externalInstancePaths a path must end at an elementary or STRING value.`,
        expr,
      );
      return;
    }
    if (bit !== undefined && !isBitAddressable(leaf.type)) {
      this.error(
        `'${text}' takes a bit of a ${leaf.type} value; a bit access needs an integer or bit-string value.`,
        expr,
      );
      return;
    }
    let entry = this.entries.get(path);
    if (entry === undefined) {
      entry = {
        id: this.entries.size,
        kind: root.kind,
        path,
        type: leaf.type,
        ...(leaf.maxLength !== undefined ? { maxLength: leaf.maxLength } : {}),
        read: false,
        written: false,
      };
      this.entries.set(path, entry);
    }
    if (context === "read" || bit !== undefined) entry.read = true;
    if (written) entry.written = true;
    ref.id = entry.id;
  }

  // -------------------------------------------------------------------------
  // Types along a path
  // -------------------------------------------------------------------------

  private typeDeclaration(name: string): TypeDeclaration | undefined {
    const upper = name.toUpperCase();
    return this.ast.types.find((t) => t.name.toUpperCase() === upper);
  }

  /** Follows plain aliases (`TYPE A : B; END_TYPE`) to the type they name. */
  private unalias(type: TypeShape): TypeShape {
    let current = type;
    for (let depth = 0; depth < 16; depth++) {
      if (
        current.referenceKind !== undefined &&
        current.referenceKind !== "none"
      )
        return current;
      if (current.arrayDimensions !== undefined) return current;
      const decl = this.typeDeclaration(current.name);
      if (decl?.definition.kind !== "TypeReference") return current;
      current = decl.definition;
    }
    return current;
  }

  private memberOf(type: TypeShape, field: string): TypeShape | undefined {
    const t = this.unalias(type);
    if (t.referenceKind !== undefined && t.referenceKind !== "none")
      return undefined;
    const decl = this.typeDeclaration(t.name);
    if (decl?.definition.kind === "StructDefinition") {
      return decl.definition.fields.find((f) =>
        f.names.some((n) => sameName(n, field)),
      )?.type;
    }
    const seen = new Set<string>();
    let fbName: string | undefined = t.name;
    while (fbName !== undefined && !seen.has(fbName.toUpperCase())) {
      seen.add(fbName.toUpperCase());
      const fb = this.fbByName.get(fbName.toUpperCase());
      if (fb !== undefined) {
        const member = variablesOf(fb.varBlocks).find((v) =>
          sameName(v.name, field),
        );
        if (member !== undefined) return member.declaration.type;
        fbName = fb.extends;
        continue;
      }
      const lib = this.symbolTables.lookupFunctionBlock(fbName);
      if (lib === undefined) return undefined;
      const member = [
        ...lib.inputs,
        ...lib.outputs,
        ...lib.inouts,
        ...lib.locals,
      ].find((m) => sameName(m.name, field));
      if (member?.declaration?.type !== undefined)
        return member.declaration.type;
      fbName = lib.declaration.extends;
    }
    return undefined;
  }

  private elementOf(type: TypeShape): TypeShape | undefined {
    const t = this.unalias(type);
    if (t.arrayDimensions !== undefined && t.elementTypeName !== undefined) {
      const element: TypeShape = {
        name: t.elementTypeName,
        referenceKind: "none",
      };
      if (t.elementMaxLength !== undefined)
        element.maxLength = t.elementMaxLength;
      if (t.elementReferenceChain?.[0] !== undefined)
        element.referenceKind = t.elementReferenceChain[0];
      return element;
    }
    const decl = this.typeDeclaration(t.name);
    if (decl?.definition.kind === "ArrayDefinition")
      return decl.definition.elementType;
    return undefined;
  }

  /** The leaf as an elementary or string type, or a word describing why it is not one. */
  private leafOf(
    type: TypeShape,
  ): { type: string; maxLength?: number } | string {
    const t = this.unalias(type);
    if (t.referenceKind !== undefined && t.referenceKind !== "none")
      return "a reference or pointer";
    if (t.arrayDimensions !== undefined) return "an array";
    const upper = t.name.toUpperCase();
    if (upper === "STRING" || upper === "WSTRING") {
      const len = t.maxLength ?? 254;
      if (typeof len === "number") return { type: upper, maxLength: len };
      const constant = this.integerConstant(len);
      return constant === undefined
        ? "a string whose length is not a literal"
        : { type: upper, maxLength: constant };
    }
    if (ELEMENTARY_TYPES[upper] !== undefined) return { type: upper };
    const decl = this.typeDeclaration(upper);
    switch (decl?.definition.kind) {
      case "StructDefinition":
        return "a structure";
      case "EnumDefinition":
        return "an enumeration";
      case "ArrayDefinition":
        return "an array";
      case "SubrangeDefinition":
        return "a subrange type";
      default:
        break;
    }
    if (
      this.fbByName.has(upper) ||
      this.symbolTables.lookupFunctionBlock(upper)
    )
      return "a function block instance";
    return `type '${t.name}'`;
  }

  /** A global or library constant of integer value, by name. */
  private integerConstant(name: string): number | undefined {
    for (const block of [
      ...this.ast.globalVarBlocks,
      ...this.ast.configurations.flatMap((c) => c.varBlocks),
    ]) {
      if (!block.isConstant) continue;
      for (const decl of block.declarations)
        if (decl.names.some((n) => sameName(n, name)))
          return evalIntConst(decl.initialValue);
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // External mode: what cannot be compiled without the globals
  // -------------------------------------------------------------------------

  /** In external mode, an unmarked POU cannot use the globals, which the compilation does not emit. */
  private checkUnmarkedUnit(unit: CodeUnit): void {
    if (unit.hostProgram) return;
    for (const stmt of unit.statements) {
      walkAST(stmt, (node: ASTNode) => {
        if (node.kind !== "VariableExpression") return;
        const expr = node as VariableExpression;
        const head = expr.name.toUpperCase();
        if (
          expr.typedLiteral === true ||
          this.index.unitGlobals.get(head)?.block.isConstant !== false ||
          this.isLocalName(head, unit)
        )
          return;
        this.error(
          `Global '${expr.name}' is not emitted with externalInstancePaths; use it from a POU marked {attribute '${INSTANCE_PATHS_ATTRIBUTE}'}.`,
          expr,
        );
      });
    }
  }

  /** In external mode, a VAR_EXTERNAL in an emitted POU would bind a host-owned global, which is not emitted. */
  private checkExternalDeclarations(): void {
    const sources = this.options.externalSources;
    const pous: Array<{ name: string; varBlocks: VarBlock[] }> = [
      ...this.ast.functions,
      ...this.ast.functionBlocks,
      ...this.ast.functionBlocks.flatMap((fb) => fb.methods),
      ...(sources === undefined
        ? []
        : this.ast.programs.filter((p) => !isHostOwned(p, this.options))),
    ];
    const hostGlobal = (name: string): boolean =>
      this.index.unitGlobals.has(name.toUpperCase()) ||
      this.index.configurationGlobals.has(name.toUpperCase());
    for (const pou of pous)
      for (const block of pou.varBlocks)
        if (
          block.blockType === "VAR_EXTERNAL" &&
          (sources === undefined ||
            block.declarations.some((d) => d.names.some(hostGlobal)))
        )
          this.errors.push({
            message: `VAR_EXTERNAL in '${pou.name}' is not supported with externalInstancePaths, which does not emit globals; in a POU marked {attribute '${INSTANCE_PATHS_ATTRIBUTE}'} use the global by name.`,
            line: block.sourceSpan.startLine,
            column: block.sourceSpan.startCol,
            severity: "error",
            file: block.sourceSpan.file,
          });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Source-like text of an access, for messages. */
  private describe(expr: VariableExpression): string {
    let text = expr.name;
    for (const step of expr.accessChain ?? []) {
      if (step.kind === "field") text += `.${step.name}`;
      else if (step.kind === "dereference") text += "^";
      else {
        const parts = step.indices.map((e) => {
          const n = evalIntConst(e);
          return n === undefined ? "..." : String(n);
        });
        text += `[${parts.join(",")}]`;
      }
    }
    return text;
  }

  private error(message: string, at: ASTNode): void {
    this.errors.push({
      message,
      line: at.sourceSpan.startLine,
      column: at.sourceSpan.startCol,
      endLine: at.sourceSpan.endLine,
      endColumn: at.sourceSpan.endCol,
      severity: "error",
      file: at.sourceSpan.file,
    });
  }
}

/** The parameters a POU's or method's variable blocks declare, in order. */
function parametersOf(blocks: readonly VarBlock[]): ParameterShape[] {
  const out: ParameterShape[] = [];
  for (const block of blocks) {
    if (
      block.blockType !== "VAR_INPUT" &&
      block.blockType !== "VAR_IN_OUT" &&
      block.blockType !== "VAR_OUTPUT"
    )
      continue;
    for (const decl of block.declarations)
      for (const name of decl.names)
        out.push({
          name,
          output: block.blockType === "VAR_OUTPUT",
          byReference:
            block.blockType === "VAR_IN_OUT" ||
            decl.type.referenceKind === "reference_to",
        });
  }
  return out;
}

/** A callee parameter as far as the access context needs it. */
interface ParameterShape {
  name: string;
  output: boolean;
  byReference: boolean;
}

/** What a resolved path prefix leads to. */
interface RootInfo {
  kind: "instance" | "global";
  globalScope?: "configuration" | "unit";
  consumed: number;
  variable: string;
  rootType: TypeReference;
  configuration?: ConfigurationDeclaration;
  resource?: ResourceDeclaration;
  instance?: ProgramInstance;
  /** Canonical path up to and including the root variable. */
  prefix: string;
  block: VarBlock;
}

/** The parts of a type reference a path walk reads. */
type TypeShape = Pick<TypeReference, "name"> &
  Partial<
    Pick<
      TypeReference,
      | "referenceKind"
      | "maxLength"
      | "arrayDimensions"
      | "elementTypeName"
      | "elementMaxLength"
      | "elementReferenceChain"
    >
  >;

/** Types whose bits a `.N` access may address. */
function isBitAddressable(type: string): boolean {
  return [
    "BYTE",
    "WORD",
    "DWORD",
    "LWORD",
    "SINT",
    "INT",
    "DINT",
    "LINT",
    "USINT",
    "UINT",
    "UDINT",
    "ULINT",
  ].includes(type);
}
