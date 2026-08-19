// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Core data model
 *
 * An LLVM-shaped SSA IR sitting between the ST front end and any backend that
 * is not the C++ generator. The C++ path does not use this and is unaffected.
 *
 * Shape, in LLVM's terms: a module holds globals and functions, a function holds
 * basic blocks, a block holds instructions and ends in a terminator, and every
 * value-producing instruction defines exactly one SSA name. Memory is explicit —
 * locals begin life as `alloca` plus `load`/`store`, and a later mem2reg pass
 * promotes them to registers with `phi` nodes.
 *
 * Two things here are not LLVM, and both exist to serve targets that are not
 * CPUs:
 *
 *   - `fbcall` keeps the FUNCTION_BLOCK type name and instance identity instead
 *     of inlining the body away. A device that has a hardware timer can then
 *     substitute it for a TON; a device that does not can inline it later. Throw
 *     the name away early and that choice is gone forever.
 *
 *   - `alloca` carries the source variable's name, its RETAIN flag and its IEC
 *     direct address. A PLC backend has to bind %IX0.0 to a physical terminal,
 *     and that mapping cannot be recovered from an anonymous stack slot.
 *
 * Backends that need a form with no control flow (netlist and FBD targets) get
 * there by running the flattening pipeline and then asserting the flat profile
 * — see verify.ts. It is the same IR either way, restricted rather than replaced.
 */

import type { IrType } from "./types.js";

/** Bumped on any breaking change to the serialized form. */
export const IR_VERSION = 1;

/** Where an instruction came from. Diagnostics only; never load-bearing. */
export interface IrSourceRef {
  file?: string;
  line: number;
  column: number;
  /** POU the code came from, which survives inlining. */
  pou?: string;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** An SSA name defined by an instruction in the same function. */
export interface IrTempValue {
  kind: "temp";
  id: number;
  type: IrType;
}

export interface IrConstValue {
  kind: "const";
  type: IrType;
  /** Numbers for scalars, booleans for BOOL, strings for text and for
   *  integers too wide to survive a double. */
  value: number | boolean | string;
}

export interface IrParamValue {
  kind: "param";
  index: number;
  name: string;
  type: IrType;
}

/** The address of a module-level global. */
export interface IrGlobalValue {
  kind: "global";
  name: string;
  type: IrType;
}

/** A value the front end could not produce. Keeps lowering going after an error. */
export interface IrUndefValue {
  kind: "undef";
  type: IrType;
}

export type IrValue =
  | IrTempValue
  | IrConstValue
  | IrParamValue
  | IrGlobalValue
  | IrUndefValue;

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export type IrArithOp = "add" | "sub" | "mul" | "div" | "mod" | "neg" | "pow";
export type IrBitOp =
  | "and"
  | "or"
  | "xor"
  | "not"
  | "shl"
  | "shr"
  | "rol"
  | "ror";

export type IrOpcode =
  | IrArithOp
  | IrBitOp
  | "cmp"
  | "cast"
  | "select"
  | "alloca"
  | "load"
  | "store"
  | "gep"
  | "call"
  | "fbcall"
  | "phi"
  | "br"
  | "condbr"
  | "ret"
  | "unreachable";

/** Comparison predicates. Signedness is explicit so passes need not consult types. */
export type IrCmpPred =
  | "eq"
  | "ne"
  | "slt"
  | "sle"
  | "sgt"
  | "sge"
  | "ult"
  | "ule"
  | "ugt"
  | "uge"
  | "flt"
  | "fle"
  | "fgt"
  | "fge";

/**
 * Conversions, split by intent rather than left implicit. `convert` is the IEC
 * `*_TO_*` family, which has its own rounding and saturation rules and must not
 * be confused with a machine-level truncation.
 */
export type IrCastKind =
  | "trunc"
  | "zext"
  | "sext"
  | "fptrunc"
  | "fpext"
  | "fptosi"
  | "fptoui"
  | "sitofp"
  | "uitofp"
  | "bitcast"
  | "convert";

interface IrInstrCommon {
  /** Unique within the function. Doubles as the SSA name when a value is produced. */
  id: number;
  /** Result type. `void` when the instruction produces no value. */
  type: IrType;
  operands: IrValue[];
  origin?: IrSourceRef;
  /** Free-text note carried into the textual dump. Never semantic. */
  comment?: string;
}

export interface IrArithInstr extends IrInstrCommon {
  op: IrArithOp;
  /** Meaningful for div and mod; ignored otherwise. */
  signed?: boolean;
}

export interface IrBitInstr extends IrInstrCommon {
  op: IrBitOp;
}

export interface IrCmpInstr extends IrInstrCommon {
  op: "cmp";
  pred: IrCmpPred;
}

export interface IrCastInstr extends IrInstrCommon {
  op: "cast";
  castKind: IrCastKind;
  /** IEC type name for `convert`, so a backend can apply the right rule. */
  targetIec?: string;
}

/** select(cond, ifTrue, ifFalse) — the branch-free conditional. */
export interface IrSelectInstr extends IrInstrCommon {
  op: "select";
}

/**
 * Reserves storage for a source variable. Result type is a pointer to
 * `allocatedType`.
 */
export interface IrAllocaInstr extends IrInstrCommon {
  op: "alloca";
  allocatedType: IrType;
  /** Source variable name. Survives into the dump and into backend diagnostics. */
  name: string;
  retain: boolean;
  /** IEC direct address, when the variable was located: "%IX0.0", "%QW2". */
  located?: string;
  /** VAR_INPUT / VAR_OUTPUT / VAR / VAR_TEMP / ... */
  varClass?: string;
}

export interface IrLoadInstr extends IrInstrCommon {
  op: "load";
}

/** store(value, address). Produces no value. */
export interface IrStoreInstr extends IrInstrCommon {
  op: "store";
}

/**
 * Address computation into an aggregate: gep(base, index...). Indices are
 * already normalised against the array's declared lower bound, so a backend
 * never has to know that the source wrote ARRAY[1..10].
 */
export interface IrGepInstr extends IrInstrCommon {
  op: "gep";
  /** Field names for struct steps, aligned with the index operands. */
  path?: string[];
}

export interface IrCallInstr extends IrInstrCommon {
  op: "call";
  callee: string;
  /** True for an IEC standard function, which a backend may implement natively. */
  standard?: boolean;
}

/**
 * Invoking a FUNCTION_BLOCK instance. Deliberately not inlined: the type name is
 * the hook that lets a backend map TON onto a hardware timer instead of
 * synthesising one.
 */
export interface IrFbCallInstr extends IrInstrCommon {
  op: "fbcall";
  fbType: string;
  instance: string;
  /** Set when calling a method rather than the FB body. */
  method?: string;
  /** Argument names, positionally aligned with `operands`. */
  argNames?: string[];
}

export interface IrPhiInstr extends IrInstrCommon {
  op: "phi";
  incoming: Array<{ block: string; value: IrValue }>;
}

export interface IrBrInstr extends IrInstrCommon {
  op: "br";
  target: string;
}

export interface IrCondBrInstr extends IrInstrCommon {
  op: "condbr";
  ifTrue: string;
  ifFalse: string;
}

/** ret with zero or one operand. */
export interface IrRetInstr extends IrInstrCommon {
  op: "ret";
}

export interface IrUnreachableInstr extends IrInstrCommon {
  op: "unreachable";
  /** Why lowering gave up here. Surfaced by the verifier and the printer. */
  reason?: string;
}

export type IrInstr =
  | IrArithInstr
  | IrBitInstr
  | IrCmpInstr
  | IrCastInstr
  | IrSelectInstr
  | IrAllocaInstr
  | IrLoadInstr
  | IrStoreInstr
  | IrGepInstr
  | IrCallInstr
  | IrFbCallInstr
  | IrPhiInstr
  | IrBrInstr
  | IrCondBrInstr
  | IrRetInstr
  | IrUnreachableInstr;

export type IrTerminator =
  | IrBrInstr
  | IrCondBrInstr
  | IrRetInstr
  | IrUnreachableInstr;

const TERMINATORS: ReadonlySet<string> = new Set([
  "br",
  "condbr",
  "ret",
  "unreachable",
]);

export function isTerminator(i: IrInstr): i is IrTerminator {
  return TERMINATORS.has(i.op);
}

/** Instructions that define an SSA name. */
export function producesValue(i: IrInstr): boolean {
  return i.type.kind !== "void";
}

/** Labels an instruction can transfer control to. */
export function successors(i: IrInstr): string[] {
  if (i.op === "br") return [i.target];
  if (i.op === "condbr") return [i.ifTrue, i.ifFalse];
  return [];
}

// ---------------------------------------------------------------------------
// Blocks, functions, modules
// ---------------------------------------------------------------------------

export interface IrBlock {
  label: string;
  instrs: IrInstr[];
}

export interface IrParam {
  index: number;
  name: string;
  type: IrType;
  /** VAR_INPUT / VAR_OUTPUT / VAR_IN_OUT. Output and in-out params are pointers. */
  mode: "input" | "output" | "inout";
}

export type IrFunctionKind =
  | "program"
  | "function"
  | "functionBlock"
  | "method";

export interface IrFunction {
  name: string;
  kind: IrFunctionKind;
  params: IrParam[];
  returnType: IrType;
  blocks: IrBlock[];
  origin?: IrSourceRef;
  /** Owning FB, for methods. */
  parent?: string;
}

export interface IrGlobal {
  name: string;
  type: IrType;
  constant: boolean;
  retain: boolean;
  initializer?: IrValue;
  located?: string;
}

export interface IrModule {
  irVersion: number;
  producer: { name: string; version: string };
  name: string;
  /** Named struct types referenced by the functions. */
  types: Array<{ name: string; type: IrType }>;
  globals: IrGlobal[];
  functions: IrFunction[];
}

export function entryBlock(fn: IrFunction): IrBlock | undefined {
  return fn.blocks[0];
}

export function findBlock(fn: IrFunction, label: string): IrBlock | undefined {
  return fn.blocks.find((b) => b.label === label);
}

export function terminatorOf(block: IrBlock): IrTerminator | undefined {
  const last = block.instrs[block.instrs.length - 1];
  return last !== undefined && isTerminator(last) ? last : undefined;
}
