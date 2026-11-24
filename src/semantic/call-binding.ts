// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Call argument binding: maps the arguments of a call (positional, named, `=>`) onto the callee's parameter slots.
 * One binder serves user functions, methods, library methods, standard functions and function block calls, for both
 * the type checker (which reports the diagnostics) and the code generator (which emits the slots in order).
 */

import type { Argument, VarBlock, VarDeclaration } from "../frontend/ast.js";
import type { SourceSpan } from "../types.js";
import type { StdFunctionDescriptor } from "./std-function-registry.js";

/** Direction of a call parameter. */
export type CallParamDirection = "input" | "output" | "inout";

/** One parameter of a callee as the binder sees it. */
export interface CallParam {
  /** Upper-cased parameter name. */
  name: string;
  direction: CallParamDirection;
  /** True when no default may fill the parameter, so the call must supply it. */
  required: boolean;
}

/** Callee-specific binding rules. */
export interface CallBindingOptions {
  /** Callee as named in messages, e.g. `function 'LIMIT'`. */
  calleeLabel: string;
  /** Extra inputs named `<prefix><n>` from `firstIndex` on (up to `max`), appended after the declared parameters. */
  variadic?: { prefix: string; firstIndex: number; max?: number };
  /** Most arguments the call may have. */
  maxArgs?: number;
  /** Number of leading parameters positional arguments may fill; the rest are named only. Defaults to all. */
  positionalParams?: number;
}

/** What a binding diagnostic is about. */
export type CallBindingDiagnosticKind =
  | "unknown"
  | "duplicate"
  | "positionalAfterNamed"
  | "tooMany"
  | "outputOnInput"
  | "missing";

/** A malformed call, at the argument at fault or, for a missing parameter, at the call. */
export interface CallBindingDiagnostic {
  kind: CallBindingDiagnosticKind;
  message: string;
  span: SourceSpan;
  /** Upper-cased parameter or argument name the diagnostic is about, when there is one. */
  name?: string;
}

/** The arguments of a call in parameter order. */
export interface BindResult {
  /** One per parameter, plus variadic extensions in order; undefined where the call supplies nothing. */
  slots: Array<Argument | undefined>;
  /** The parameter list, including the variadic extensions the call used. */
  params: CallParam[];
  diagnostics: CallBindingDiagnostic[];
}

/** A parameter of a POU or method declaration, with the declaration that introduces it. */
export interface DeclaredCallParam extends CallParam {
  declaration: VarDeclaration;
}

const BLOCK_DIRECTIONS: Readonly<Record<string, CallParamDirection>> = {
  VAR_INPUT: "input",
  VAR_IN_OUT: "inout",
  VAR_OUTPUT: "output",
};

/** `label` with its first letter upper-cased, to start a message. */
function capitalized(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Bind the arguments of a call to the callee's parameters. Positional arguments fill parameters in declaration order,
 * named arguments their own slot (case-insensitive), and variadic names extend the list. A malformed call yields
 * diagnostics, never an exception.
 *
 * @param params - The callee's parameters in declaration order.
 * @param args - The call's arguments, EN/ENO already stripped.
 * @param callSpan - Span of the call, for diagnostics with no argument at fault.
 * @param options - Callee label and the variadic, arity and positional rules.
 * @returns The slots, the parameter list used and the diagnostics.
 */
export function bindCallArguments(
  params: readonly CallParam[],
  args: readonly Argument[],
  callSpan: SourceSpan,
  options: CallBindingOptions,
): BindResult {
  const list: CallParam[] = [...params];
  const slots: Array<Argument | undefined> = list.map(() => undefined);
  const diagnostics: CallBindingDiagnostic[] = [];
  const label = options.calleeLabel;
  const positionalLimit = options.positionalParams ?? Number.POSITIVE_INFINITY;
  const variadic = options.variadic;
  let extensions = 0;
  let bound = 0;
  let seenNamed = false;

  const extendTo = (index: number): number => {
    if (variadic === undefined) return -1;
    while (variadic.firstIndex + extensions <= index) {
      list.push({
        name: `${variadic.prefix}${variadic.firstIndex + extensions}`,
        direction: "input",
        required: true,
      });
      slots.push(undefined);
      extensions++;
    }
    return list.findIndex(
      (p) => p.name.toUpperCase() === `${variadic.prefix}${index}`,
    );
  };

  const variadicIndex = (upper: string): number | undefined => {
    if (variadic === undefined || !upper.startsWith(variadic.prefix)) {
      return undefined;
    }
    const digits = upper.slice(variadic.prefix.length);
    if (!/^\d+$/.test(digits)) return undefined;
    const n = Number(digits);
    if (n < variadic.firstIndex) return undefined;
    if (variadic.max !== undefined && n > variadic.max) return undefined;
    return n;
  };

  const excess = (arg: Argument): void => {
    const takes =
      options.maxArgs !== undefined
        ? `${options.maxArgs}`
        : options.positionalParams !== undefined
          ? `${options.positionalParams} positional`
          : variadic === undefined
            ? `${list.length}`
            : undefined;
    diagnostics.push({
      kind: "tooMany",
      message:
        takes === undefined
          ? `Too many arguments for ${label}`
          : `Too many arguments for ${label}: it takes ${takes}`,
      span: arg.sourceSpan,
    });
  };

  const nextPositionalSlot = (): number => {
    for (let i = 0; i < list.length && i < positionalLimit; i++) {
      if (slots[i] === undefined) return i;
    }
    if (variadic === undefined || list.length >= positionalLimit) return -1;
    return extendTo(variadic.firstIndex + extensions);
  };

  for (const arg of args) {
    if (options.maxArgs !== undefined && bound >= options.maxArgs) {
      excess(arg);
      continue;
    }
    if (arg.name === undefined) {
      if (seenNamed) {
        diagnostics.push({
          kind: "positionalAfterNamed",
          message: `Positional argument after a named argument in the call to ${label}`,
          span: arg.sourceSpan,
        });
      }
      const index = nextPositionalSlot();
      if (index < 0) {
        excess(arg);
        continue;
      }
      slots[index] = arg;
      bound++;
      continue;
    }
    seenNamed = true;
    const upper = arg.name.toUpperCase();
    let index = list.findIndex((p) => p.name.toUpperCase() === upper);
    if (index < 0) {
      const n = variadicIndex(upper);
      if (n !== undefined) index = extendTo(n);
    }
    const param = index < 0 ? undefined : list[index];
    if (param === undefined) {
      diagnostics.push({
        kind: "unknown",
        message: `Named argument '${upper}' does not match any parameter of ${label}`,
        span: arg.sourceSpan,
        name: upper,
      });
      continue;
    }
    if (slots[index] !== undefined) {
      diagnostics.push({
        kind: "duplicate",
        message: `Parameter '${param.name}' of ${label} is given more than once`,
        span: arg.sourceSpan,
        name: param.name,
      });
      continue;
    }
    if (arg.isOutput && param.direction === "input") {
      diagnostics.push({
        kind: "outputOnInput",
        message: `Output argument '=>' used for input parameter '${param.name}' of ${label}; use ':='`,
        span: arg.sourceSpan,
        name: param.name,
      });
    }
    slots[index] = arg;
    bound++;
  }

  list.forEach((param, i) => {
    if (!param.required || slots[i] !== undefined) return;
    diagnostics.push({
      kind: "missing",
      message:
        param.direction === "inout"
          ? `${capitalized(label)} is missing its in-out argument '${param.name}'`
          : `${capitalized(label)} is missing the argument for required input '${param.name}'`,
      span: callSpan,
      name: param.name,
    });
  });

  return { slots, params: list, diagnostics };
}

/**
 * The VAR_INPUT, VAR_IN_OUT and VAR_OUTPUT parameters of a declaration, in declaration order.
 *
 * @param varBlocks - The declaration's variable blocks.
 * @param isRequired - Whether the call must supply a parameter; none is required when omitted.
 */
export function declaredCallParams(
  varBlocks: readonly VarBlock[],
  isRequired: (
    declaration: VarDeclaration,
    direction: CallParamDirection,
  ) => boolean = () => false,
): DeclaredCallParam[] {
  const params: DeclaredCallParam[] = [];
  for (const block of varBlocks) {
    const direction = BLOCK_DIRECTIONS[block.blockType];
    if (direction === undefined) continue;
    for (const declaration of block.declarations) {
      const required = isRequired(declaration, direction);
      for (const name of declaration.names) {
        params.push({
          name: name.toUpperCase(),
          direction,
          required,
          declaration,
        });
      }
    }
  }
  return params;
}

/**
 * Whether a function parameter must be supplied: every VAR_IN_OUT, and every VAR_INPUT without a default.
 *
 * @param hasDefault - The parameter declares an initial value.
 */
export function functionParamRequired(
  direction: CallParamDirection,
  hasDefault: boolean,
): boolean {
  return direction === "inout" || (direction === "input" && !hasDefault);
}

/**
 * Parameters of a function block or program instance call. The block's own VAR_INPUTs come first and are the only
 * ones positional arguments fill; its other parameters and those it inherits are named only. None is required.
 *
 * @param lineage - The parameters of the block, then of each base, nearest first.
 * @returns The parameter list and how many leading parameters take positional arguments.
 */
export function instanceCallParams<P extends CallParam>(
  lineage: ReadonlyArray<readonly P[]>,
): { params: P[]; positionalParams: number } {
  const inputs = (lineage[0] ?? []).filter((p) => p.direction === "input");
  const params: P[] = inputs.map((p) => ({ ...p, required: false }));
  const seen = new Set(inputs.map((p) => p.name.toUpperCase()));
  for (const block of lineage) {
    for (const p of block) {
      const upper = p.name.toUpperCase();
      if (seen.has(upper)) continue;
      seen.add(upper);
      params.push({ ...p, required: false });
    }
  }
  return { params, positionalParams: inputs.length };
}

/** A function block's own call parameters and the base it extends, as {@link instanceSignature} reads them. */
export interface InstanceBlock<P extends CallParam> {
  params: readonly P[];
  extends?: string | undefined;
}

/**
 * Call parameters of a function block or program instance of type `typeName`: the block, then each base along its
 * EXTENDS chain, or the program of that name when no block has it. The one builder codegen and the type checker share.
 *
 * @param blockOf - A block's parameters and base by upper-cased name, undefined when no block has that name.
 * @param programOf - A program's parameters by upper-cased name, undefined when no program has that name.
 * @returns The parameters and positional count, or undefined when neither a block nor a program is known.
 */
export function instanceSignature<P extends CallParam>(
  typeName: string,
  blockOf: (upperName: string) => InstanceBlock<P> | undefined,
  programOf: (upperName: string) => readonly P[] | undefined,
): { params: P[]; positionalParams: number } | undefined {
  const lineage: Array<readonly P[]> = [];
  const seen = new Set<string>();
  let current: string | undefined = typeName;
  while (current !== undefined && !seen.has(current.toUpperCase())) {
    const upper = current.toUpperCase();
    seen.add(upper);
    const block = blockOf(upper);
    if (block === undefined) break;
    lineage.push(block.params);
    current = block.extends;
  }
  if (lineage.length === 0) {
    const program = programOf(typeName.toUpperCase());
    if (program === undefined) return undefined;
    lineage.push(program);
  }
  return instanceCallParams(lineage);
}

/**
 * The extra inputs a variadic callee takes, named after its last parameter: `IN3`... after `IN2`, `IN2`... after
 * `IN1`. Undefined when the last parameter's name does not end in a number.
 */
export function variadicAfterLastParam(
  params: readonly CallParam[],
): CallBindingOptions["variadic"] {
  const last = /^(.*?)(\d+)$/.exec(params[params.length - 1]?.name ?? "");
  if (last === null) return undefined;
  return { prefix: last[1] ?? "", firstIndex: Number(last[2]) + 1 };
}

/** The parameters and binding rules of a standard function: every declared parameter is a required input. */
export function stdFunctionBinding(desc: StdFunctionDescriptor): {
  params: CallParam[];
  options: CallBindingOptions;
} {
  const params: CallParam[] = desc.params.map((p) => ({
    name: p.name.toUpperCase(),
    direction: "input",
    required: true,
  }));
  const options: CallBindingOptions = {
    calleeLabel: `function '${desc.name.toUpperCase()}'`,
  };
  const variadic = desc.isVariadic ? variadicAfterLastParam(params) : undefined;
  if (variadic !== undefined) options.variadic = variadic;
  return { params, options };
}

/** The parameter each bound argument fills. */
export function boundParameters(result: BindResult): Map<Argument, CallParam> {
  const out = new Map<Argument, CallParam>();
  result.slots.forEach((arg, i) => {
    const param = result.params[i];
    if (arg !== undefined && param !== undefined) out.set(arg, param);
  });
  return out;
}
