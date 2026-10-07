// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Lower anonymous types written inside declarations to TYPE declarations.
 *
 *   state : (Idle, Running) := Idle;    →  TYPE __INLINE_ENUM_MAIN_STATE : (Idle, Running); END_TYPE
 *   level : INT(0..100) := 50;          →  TYPE __INLINE_SUBRANGE_MAIN_LEVEL : INT(0..100); END_TYPE
 *
 * The parser keeps such a type where it was written (`TypeReference.
 * inlineDefinition`), so `parse()` returns the source as the user wrote it:
 * its `types` holds only declared types. Compilation calls this once on the
 * merged unit, before semantic analysis, and from then on the declaration is
 * an ordinary use of a declared type.
 *
 * Names are derived from the owning POU (or type) and the first declared
 * variable, so C++ code can name them. Two declarations that derive the same
 * name, or one that matches a declared TYPE, are reported as errors.
 *
 * An inline enumeration declared in a POU is not global: its bare members are
 * rewritten to the qualified form (`Running` becomes
 * `__INLINE_ENUM_FB1_ST.Running`) where the target is declared with it (an
 * assignment, a comparison, a call input, a CASE selector) and anywhere in its
 * own POU. The type carries `inline.owner` so the global enum member tables
 * leave it out.
 */

import type {
  CompilationUnit,
  Expression,
  FunctionCallExpression,
  TestFile,
  TypeDeclaration,
  TypeReference,
  VarBlock,
  VarDeclaration,
  VariableExpression,
} from "./ast.js";
import type { CompileError } from "../types.js";
import { resolveFieldDeclaration } from "../semantic/type-utils.js";

/** Inline enumerations visible in one body, by uppercase member name. */
type LocalEnumMembers = Map<string, TypeDeclaration[]>;

interface QualifyContext {
  local: LocalEnumMembers;
  /** Uppercase names of the variables visible in the body. */
  variables: Set<string>;
  /** Uppercase member name to the global enumerations that declare it. */
  globalMembers: Map<string, string[]>;
  errors: CompileError[];
}

function lowerDeclaration(
  decl: VarDeclaration,
  container: string,
  owner: string | undefined,
  hoisted: TypeDeclaration[],
): void {
  const definition = decl.type.inlineDefinition;
  if (!definition) return;
  const kind =
    definition.kind === "EnumDefinition" ? "INLINE_ENUM" : "INLINE_SUBRANGE";
  const variable = decl.names[0] ?? `L${decl.sourceSpan.startLine}`;
  const name = `__${kind}_${container}_${variable}`.toUpperCase();
  hoisted.push({
    kind: "TypeDeclaration",
    sourceSpan: definition.sourceSpan,
    name,
    definition,
    inline:
      owner === undefined
        ? { variable, container }
        : { variable, container, owner },
  });
  decl.type.name = name;
  delete decl.type.inlineDefinition;
}

function lowerBlocks(
  blocks: readonly VarBlock[],
  container: string,
  owner: string | undefined,
  hoisted: TypeDeclaration[],
): void {
  for (const block of blocks) {
    for (const decl of block.declarations) {
      lowerDeclaration(decl, container, owner, hoisted);
    }
  }
}

/** `inline enumeration of 'MAIN.state'`, as a diagnostic names a hoisted type. */
export function describeInlineType(type: TypeDeclaration): string {
  const what =
    type.definition.kind === "EnumDefinition" ? "enumeration" : "subrange";
  const where = type.inline
    ? `${type.inline.container}.${type.inline.variable}`
    : type.name;
  return `inline ${what} of '${where}'`;
}

function error(
  message: string,
  span: { startLine: number; startCol: number; file?: string },
): CompileError {
  return {
    message,
    line: span.startLine,
    column: span.startCol,
    severity: "error",
    ...(span.file !== undefined ? { file: span.file } : {}),
  };
}

/** Drop hoisted types whose name is taken, with an error for each. */
function rejectNameCollisions(
  hoisted: readonly TypeDeclaration[],
  declared: readonly TypeDeclaration[],
  errors: CompileError[],
): TypeDeclaration[] {
  const taken = new Map<string, TypeDeclaration>();
  for (const type of declared) taken.set(type.name.toUpperCase(), type);
  const kept: TypeDeclaration[] = [];
  for (const type of hoisted) {
    const other = taken.get(type.name);
    if (other === undefined) {
      taken.set(type.name, type);
      kept.push(type);
      continue;
    }
    const otherText = other.inline
      ? `the ${describeInlineType(other)}`
      : `the declared TYPE '${other.name}'`;
    errors.push(
      error(
        `The ${describeInlineType(type)} and ${otherText} both use the type ` +
          `name '${type.name}'; rename one of them.`,
        type.sourceSpan,
      ),
    );
  }
  return kept;
}

function enumMembers(type: TypeDeclaration): string[] {
  return type.definition.kind === "EnumDefinition"
    ? type.definition.members.map((m) => m.name)
    : [];
}

function localEnumMembers(types: readonly TypeDeclaration[]): LocalEnumMembers {
  const map: LocalEnumMembers = new Map();
  for (const type of types) {
    for (const member of enumMembers(type)) {
      const key = member.toUpperCase();
      map.set(key, [...(map.get(key) ?? []), type]);
    }
  }
  return map;
}

function mergeLocal(
  a: LocalEnumMembers,
  b: LocalEnumMembers,
): LocalEnumMembers {
  const map: LocalEnumMembers = new Map(a);
  for (const [key, types] of b) {
    map.set(key, [...(map.get(key) ?? []), ...types]);
  }
  return map;
}

function variableNames(
  blocks: readonly VarBlock[],
  into: Set<string>,
): Set<string> {
  for (const block of blocks) {
    for (const decl of block.declarations) {
      for (const name of decl.names) into.add(name.toUpperCase());
    }
  }
  return into;
}

function isBare(expr: VariableExpression): boolean {
  return (
    expr.subscripts.length === 0 &&
    expr.fieldAccess.length === 0 &&
    (expr.accessChain === undefined || expr.accessChain.length === 0) &&
    !expr.isDereference
  );
}

function qualifyExpression(
  expr: VariableExpression,
  ctx: QualifyContext,
): void {
  if (!isBare(expr)) return;
  const upper = expr.name.toUpperCase();
  const owners = ctx.local.get(upper);
  if (owners === undefined || ctx.variables.has(upper)) return;
  const globals = ctx.globalMembers.get(upper) ?? [];
  if (owners.length > 1 || globals.length > 0) {
    const names = [
      ...globals.map((g) => `'${g}'`),
      ...owners.map((o) => `the ${describeInlineType(o)}`),
    ];
    const qualified =
      globals.length > 0 ? `, or write ${globals[0]}#${expr.name}` : "";
    ctx.errors.push(
      error(
        `Ambiguous enum member '${expr.name}': it is a value of ` +
          `${names.join(" and of ")}; rename one of the values${qualified}.`,
        expr.sourceSpan,
      ),
    );
    return;
  }
  qualify(expr, owners[0]!);
}

/** Rewrite a bare member to `Type.Member`. */
function qualify(expr: VariableExpression, type: TypeDeclaration): void {
  const member = expr.name;
  expr.name = type.name;
  expr.fieldAccess = [member];
  expr.accessChain = [{ kind: "field", name: member }];
}

interface TargetContext {
  unit: CompilationUnit;
  /** Uppercase variable name to its declared type, for one body. */
  varTypes: Map<string, TypeReference>;
  /** The FB whose inherited members a bare name can reach. */
  fbName?: string;
  /** Inline enumerations by uppercase type name. */
  inlineEnums: Map<string, TypeDeclaration>;
}

/** The declared type of a variable or member access (`x`, `m.cmd`). */
function typeOfAccess(
  expr: Expression | undefined,
  ctx: TargetContext,
): TypeReference | undefined {
  if (expr?.kind !== "VariableExpression") return undefined;
  if (expr.subscripts.length > 0 || expr.isDereference) return undefined;
  const steps = expr.accessChain ?? [];
  if (steps.some((step) => step.kind !== "field")) return undefined;
  const fields =
    expr.accessChain !== undefined
      ? steps.map((step) => (step.kind === "field" ? step.name : ""))
      : expr.fieldAccess;
  let type =
    ctx.varTypes.get(expr.name.toUpperCase()) ??
    (ctx.fbName !== undefined
      ? resolveFieldDeclaration(ctx.fbName, expr.name, ctx.unit)?.type
      : undefined);
  for (const field of fields) {
    if (type === undefined) return undefined;
    type = resolveFieldDeclaration(type.name, field, ctx.unit)?.type;
  }
  return type;
}

/** Qualify `value` when it is a bare member of the inline enumeration `type`. */
function qualifyAs(
  value: Expression | undefined,
  type: TypeReference | undefined,
  ctx: TargetContext,
): void {
  if (value?.kind !== "VariableExpression" || type === undefined) return;
  if (!isBare(value)) return;
  const enumType = ctx.inlineEnums.get(type.name.toUpperCase());
  if (enumType === undefined) return;
  const upper = value.name.toUpperCase();
  if (ctx.varTypes.has(upper)) return;
  if (!enumMembers(enumType).some((m) => m.toUpperCase() === upper)) return;
  qualify(value, enumType);
}

/** The declared type of the input an argument is passed to. */
function callInputType(
  call: FunctionCallExpression,
  argName: string | undefined,
  position: number,
  ctx: TargetContext,
): TypeReference | undefined {
  const upper = call.functionName.toUpperCase();
  const fn = ctx.unit.functions.find((f) => f.name.toUpperCase() === upper);
  if (fn) {
    const inputs = fn.varBlocks
      .filter(
        (b) => b.blockType === "VAR_INPUT" || b.blockType === "VAR_IN_OUT",
      )
      .flatMap((b) => b.declarations)
      .flatMap((d) => d.names.map((name) => ({ name, type: d.type })));
    const input =
      argName === undefined
        ? inputs[position]
        : inputs.find((i) => i.name.toUpperCase() === argName.toUpperCase());
    return input?.type;
  }
  const instanceType = typeOfAccess(
    {
      kind: "VariableExpression",
      sourceSpan: call.sourceSpan,
      name: call.functionName,
      subscripts: [],
      fieldAccess: [],
      isDereference: false,
    },
    ctx,
  );
  if (instanceType === undefined || argName === undefined) return undefined;
  return resolveFieldDeclaration(instanceType.name, argName, ctx.unit)?.type;
}

/**
 * Qualify bare members by the inline enumeration their target is declared
 * with: an assignment target, the other side of a comparison, a call input,
 * or a CASE selector. This is how a caller names another POU's values.
 */
function qualifyByTarget(node: unknown, ctx: TargetContext): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) qualifyByTarget(item, ctx);
    return;
  }
  const record = node as Record<string, unknown> & { kind?: string };
  switch (record.kind) {
    case "AssignmentStatement": {
      const stmt = record as unknown as {
        target: Expression;
        value: Expression;
      };
      qualifyAs(stmt.value, typeOfAccess(stmt.target, ctx), ctx);
      break;
    }
    case "BinaryExpression": {
      const expr = record as unknown as { left: Expression; right: Expression };
      qualifyAs(expr.right, typeOfAccess(expr.left, ctx), ctx);
      qualifyAs(expr.left, typeOfAccess(expr.right, ctx), ctx);
      break;
    }
    case "FunctionCallExpression": {
      const call = record as unknown as FunctionCallExpression;
      call.arguments.forEach((arg, i) => {
        if (arg.isOutput) return;
        qualifyAs(arg.value, callInputType(call, arg.name, i, ctx), ctx);
      });
      break;
    }
    case "CaseStatement": {
      const stmt = record as unknown as {
        selector: Expression;
        cases: Array<{
          labels: Array<{ start: Expression; end?: Expression }>;
        }>;
      };
      const type = typeOfAccess(stmt.selector, ctx);
      for (const element of stmt.cases) {
        for (const label of element.labels) {
          qualifyAs(label.start, type, ctx);
          qualifyAs(label.end, type, ctx);
        }
      }
      break;
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "sourceSpan") qualifyByTarget(value, ctx);
  }
}

function variableTypes(
  blocks: readonly VarBlock[],
  into: Map<string, TypeReference>,
): Map<string, TypeReference> {
  for (const block of blocks) {
    for (const decl of block.declarations) {
      for (const name of decl.names) into.set(name.toUpperCase(), decl.type);
    }
  }
  return into;
}

/** Visit every VariableExpression under `node`, whatever its kind. */
function qualifyTree(node: unknown, ctx: QualifyContext): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) qualifyTree(item, ctx);
    return;
  }
  const record = node as Record<string, unknown>;
  if (record.kind === "VariableExpression") {
    qualifyExpression(record as unknown as VariableExpression, ctx);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key !== "sourceSpan") qualifyTree(value, ctx);
  }
}

function globalEnumMembers(
  types: readonly TypeDeclaration[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const type of types) {
    if (type.inline?.owner !== undefined) continue;
    for (const member of enumMembers(type)) {
      const key = member.toUpperCase();
      map.set(key, [...(map.get(key) ?? []), type.name]);
    }
  }
  return map;
}

function qualifyBody(
  node: unknown,
  local: LocalEnumMembers,
  variables: Set<string>,
  globalMembers: Map<string, string[]>,
  errors: CompileError[],
): void {
  if (local.size === 0) return;
  qualifyTree(node, { local, variables, globalMembers, errors });
}

/**
 * Declare every anonymous enumeration and subrange in `unit` as a TYPE and
 * point its declaration at it. Mutates `unit`; a unit with none is untouched.
 * Returns the name collisions and ambiguous members it found.
 */
export function lowerInlineTypes(unit: CompilationUnit): CompileError[] {
  const hoisted: TypeDeclaration[] = [];

  for (const program of unit.programs) {
    lowerBlocks(program.varBlocks, program.name, program.name, hoisted);
  }
  for (const fn of unit.functions) {
    lowerBlocks(fn.varBlocks, fn.name, fn.name, hoisted);
  }
  for (const fb of unit.functionBlocks) {
    lowerBlocks(fb.varBlocks, fb.name, fb.name, hoisted);
    for (const method of fb.methods) {
      lowerBlocks(
        method.varBlocks,
        `${fb.name}_${method.name}`,
        fb.name,
        hoisted,
      );
    }
  }
  for (const iface of unit.interfaces) {
    for (const method of iface.methods) {
      lowerBlocks(
        method.varBlocks,
        `${iface.name}_${method.name}`,
        iface.name,
        hoisted,
      );
    }
  }
  for (const config of unit.configurations) {
    lowerBlocks(config.varBlocks, config.name, undefined, hoisted);
  }
  lowerBlocks(unit.globalVarBlocks, "GLOBAL", undefined, hoisted);
  for (const type of unit.types) {
    if (type.definition.kind === "StructDefinition") {
      for (const field of type.definition.fields) {
        lowerDeclaration(field, type.name, undefined, hoisted);
      }
    }
  }
  if (hoisted.length === 0) return [];

  const errors: CompileError[] = [];
  const kept = rejectNameCollisions(hoisted, unit.types, errors);
  unit.types.push(...kept);

  const owned = kept.filter(
    (t) =>
      t.inline?.owner !== undefined && t.definition.kind === "EnumDefinition",
  );
  if (owned.length === 0) return errors;

  const inlineEnums = new Map(owned.map((t) => [t.name, t]));
  const globalTypes = variableTypes(unit.globalVarBlocks, new Map());
  for (const config of unit.configurations) {
    variableTypes(config.varBlocks, globalTypes);
  }
  const byTarget = (
    node: unknown,
    blocks: readonly VarBlock[],
    fbName?: string,
  ): void =>
    qualifyByTarget(node, {
      unit,
      varTypes: variableTypes(blocks, new Map(globalTypes)),
      inlineEnums,
      ...(fbName !== undefined ? { fbName } : {}),
    });
  for (const program of unit.programs) {
    byTarget([program.varBlocks, program.body], program.varBlocks);
  }
  for (const fn of unit.functions) {
    byTarget([fn.varBlocks, fn.body], fn.varBlocks);
  }
  for (const fb of unit.functionBlocks) {
    byTarget([fb.varBlocks, fb.body, fb.properties], fb.varBlocks, fb.name);
    for (const method of fb.methods) {
      byTarget(
        [method.varBlocks, method.body],
        [...fb.varBlocks, ...method.varBlocks],
        fb.name,
      );
    }
  }

  const globalMembers = globalEnumMembers(unit.types);
  const globals = variableNames(unit.globalVarBlocks, new Set());
  for (const config of unit.configurations) {
    variableNames(config.varBlocks, globals);
  }
  const ownedBy = (container: string): LocalEnumMembers =>
    localEnumMembers(owned.filter((t) => t.inline!.container === container));
  const visible = (blocks: readonly VarBlock[]): Set<string> =>
    variableNames(blocks, new Set(globals));

  for (const program of unit.programs) {
    qualifyBody(
      [program.varBlocks, program.body],
      ownedBy(program.name),
      visible(program.varBlocks),
      globalMembers,
      errors,
    );
  }
  for (const fn of unit.functions) {
    qualifyBody(
      [fn.varBlocks, fn.body],
      ownedBy(fn.name),
      visible(fn.varBlocks),
      globalMembers,
      errors,
    );
  }
  for (const fb of unit.functionBlocks) {
    const fbLocal = ownedBy(fb.name);
    qualifyBody(
      [fb.varBlocks, fb.body, fb.properties],
      fbLocal,
      visible(fb.varBlocks),
      globalMembers,
      errors,
    );
    for (const method of fb.methods) {
      qualifyBody(
        [method.varBlocks, method.body],
        mergeLocal(fbLocal, ownedBy(`${fb.name}_${method.name}`)),
        visible([...fb.varBlocks, ...method.varBlocks]),
        globalMembers,
        errors,
      );
    }
  }
  return errors;
}

/** `T_COUNTER` for `t_counter.st`: the file part of a TEST container name. */
function testFileTag(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
  return base.replace(/[^A-Za-z0-9]/g, "_").toUpperCase() || "TEST";
}

/**
 * Lower the inline enumerations and subranges of a test file's SETUP and
 * TEST blocks into `testFile.inlineTypes`, and qualify their bare members.
 */
export function lowerTestInlineTypes(testFile: TestFile): CompileError[] {
  const tag = testFileTag(testFile.fileName);
  const setupContainer = `${tag}_SETUP`;
  const testContainer = (i: number): string => `${tag}_T${i + 1}`;
  const setupBlocks = testFile.setup?.varBlocks ?? [];
  const hoisted: TypeDeclaration[] = [];
  lowerBlocks(setupBlocks, setupContainer, setupContainer, hoisted);
  testFile.testCases.forEach((tc, i) => {
    lowerBlocks(tc.varBlocks, testContainer(i), testContainer(i), hoisted);
  });
  if (hoisted.length === 0) return [];

  const errors: CompileError[] = [];
  const kept = rejectNameCollisions(hoisted, [], errors);
  testFile.inlineTypes = kept;

  const byContainer = (container: string): LocalEnumMembers =>
    localEnumMembers(
      kept.filter(
        (t) =>
          t.inline!.container === container &&
          t.definition.kind === "EnumDefinition",
      ),
    );
  const setupLocal = byContainer(setupContainer);
  const noGlobals = new Map<string, string[]>();
  const setupVars = variableNames(setupBlocks, new Set());
  if (testFile.setup) {
    qualifyBody(
      [setupBlocks, testFile.setup.body],
      setupLocal,
      setupVars,
      noGlobals,
      errors,
    );
  }
  if (testFile.teardown) {
    qualifyBody(
      testFile.teardown.body,
      setupLocal,
      setupVars,
      noGlobals,
      errors,
    );
  }
  testFile.testCases.forEach((tc, i) => {
    qualifyBody(
      [tc.varBlocks, tc.body],
      mergeLocal(setupLocal, byContainer(testContainer(i))),
      variableNames(tc.varBlocks, new Set(setupVars)),
      noGlobals,
      errors,
    );
  });
  return errors;
}
