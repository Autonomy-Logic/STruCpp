// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Builder
 *
 * The only sanctioned way to construct IR. Modelled on LLVM's IRBuilder: it owns
 * an insertion point, hands out SSA ids, and refuses to append after a
 * terminator so a malformed block cannot be built by accident.
 */

import {
  IR_VERSION,
  isTerminator,
  type IrAllocaInstr,
  type IrBlock,
  type IrCastKind,
  type IrCmpPred,
  type IrFunction,
  type IrFunctionKind,
  type IrGlobal,
  type IrInstr,
  type IrModule,
  type IrParam,
  type IrSourceRef,
  type IrValue,
} from "./ir.js";
import { VOID, pointerTo, type IrType } from "./types.js";

export class IrBuilder {
  private readonly module: IrModule;
  private fn: IrFunction | undefined;
  private block: IrBlock | undefined;
  private nextId = 0;
  private readonly labelCounts = new Map<string, number>();

  constructor(moduleName: string, producerVersion: string) {
    this.module = {
      irVersion: IR_VERSION,
      producer: { name: "strucpp", version: producerVersion },
      name: moduleName,
      types: [],
      globals: [],
      functions: [],
    };
  }

  finish(): IrModule {
    return this.module;
  }

  // -- module level ---------------------------------------------------------

  /** Record the IEC TASK cyclic interval (nanoseconds), if the unit configures one. */
  setTaskIntervalNs(ns: number): void {
    this.module.taskIntervalNs = ns;
  }

  declareNamedType(name: string, type: IrType): void {
    if (!this.module.types.some((t) => t.name === name)) {
      this.module.types.push({ name, type });
    }
  }

  addGlobal(g: IrGlobal): void {
    this.module.globals.push(g);
  }

  /**
   * Start a function and make its entry block current. SSA ids restart per
   * function, as they do in LLVM.
   */
  beginFunction(
    name: string,
    kind: IrFunctionKind,
    params: IrParam[],
    returnType: IrType,
    origin?: IrSourceRef | undefined,
    parent?: string | undefined,
  ): IrFunction {
    const fn: IrFunction = {
      name,
      kind,
      params,
      returnType,
      blocks: [],
      ...(origin !== undefined ? { origin } : {}),
      ...(parent !== undefined ? { parent } : {}),
    };
    this.module.functions.push(fn);
    this.fn = fn;
    this.nextId = 0;
    this.labelCounts.clear();
    this.block = this.createBlock("entry");
    return fn;
  }

  endFunction(): void {
    this.fn = undefined;
    this.block = undefined;
  }

  // -- blocks --------------------------------------------------------------

  /** Append a fresh block. Labels are uniquified, so callers can reuse names. */
  createBlock(hint: string): IrBlock {
    const fn = this.requireFunction();
    const n = this.labelCounts.get(hint) ?? 0;
    this.labelCounts.set(hint, n + 1);
    const label = n === 0 ? hint : `${hint}.${n}`;
    const block: IrBlock = { label, instrs: [] };
    fn.blocks.push(block);
    return block;
  }

  setInsertPoint(block: IrBlock): void {
    this.block = block;
  }

  currentBlock(): IrBlock {
    return this.requireBlock();
  }

  /** True when the current block already ends in a terminator. */
  isBlockClosed(): boolean {
    const b = this.block;
    if (b === undefined) return true;
    const last = b.instrs[b.instrs.length - 1];
    return last !== undefined && isTerminator(last);
  }

  // -- instructions --------------------------------------------------------

  private emit(instr: IrInstr): IrInstr {
    const block = this.requireBlock();
    if (this.isBlockClosed()) {
      throw new Error(
        `IrBuilder: cannot append ${instr.op} after the terminator of block '${block.label}'`,
      );
    }
    block.instrs.push(instr);
    return instr;
  }

  /** SSA reference to a value-producing instruction. */
  private ref(instr: IrInstr): IrValue {
    return { kind: "temp", id: instr.id, type: instr.type };
  }

  private id(): number {
    return this.nextId++;
  }

  private meta(
    origin?: IrSourceRef | undefined,
    comment?: string | undefined,
  ): { origin?: IrSourceRef; comment?: string } {
    return {
      ...(origin !== undefined ? { origin } : {}),
      ...(comment !== undefined ? { comment } : {}),
    };
  }

  binary(
    op: "add" | "sub" | "mul" | "div" | "mod" | "pow",
    type: IrType,
    lhs: IrValue,
    rhs: IrValue,
    opts: {
      signed?: boolean | undefined;
      origin?: IrSourceRef | undefined;
      comment?: string | undefined;
    } = {},
  ): IrValue {
    const instr = this.emit({
      id: this.id(),
      op,
      type,
      operands: [lhs, rhs],
      ...(opts.signed !== undefined ? { signed: opts.signed } : {}),
      ...this.meta(opts.origin, opts.comment),
    });
    return this.ref(instr);
  }

  negate(
    type: IrType,
    operand: IrValue,
    origin?: IrSourceRef | undefined,
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "neg",
        type,
        operands: [operand],
        ...this.meta(origin),
      }),
    );
  }

  bitwise(
    op: "and" | "or" | "xor" | "shl" | "shr" | "rol" | "ror",
    type: IrType,
    lhs: IrValue,
    rhs: IrValue,
    origin?: IrSourceRef | undefined,
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op,
        type,
        operands: [lhs, rhs],
        ...this.meta(origin),
      }),
    );
  }

  not(
    type: IrType,
    operand: IrValue,
    origin?: IrSourceRef | undefined,
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "not",
        type,
        operands: [operand],
        ...this.meta(origin),
      }),
    );
  }

  cmp(
    pred: IrCmpPred,
    resultType: IrType,
    lhs: IrValue,
    rhs: IrValue,
    origin?: IrSourceRef | undefined,
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "cmp",
        pred,
        type: resultType,
        operands: [lhs, rhs],
        ...this.meta(origin),
      }),
    );
  }

  cast(
    castKind: IrCastKind,
    type: IrType,
    operand: IrValue,
    opts: {
      targetIec?: string | undefined;
      origin?: IrSourceRef | undefined;
    } = {},
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "cast",
        castKind,
        type,
        operands: [operand],
        ...(opts.targetIec !== undefined ? { targetIec: opts.targetIec } : {}),
        ...this.meta(opts.origin),
      }),
    );
  }

  select(
    type: IrType,
    cond: IrValue,
    ifTrue: IrValue,
    ifFalse: IrValue,
    origin?: IrSourceRef | undefined,
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "select",
        type,
        operands: [cond, ifTrue, ifFalse],
        ...this.meta(origin),
      }),
    );
  }

  /** Reserve storage for a source variable. Always emitted into the entry block. */
  alloca(
    allocatedType: IrType,
    name: string,
    opts: {
      retain?: boolean | undefined;
      located?: string | undefined;
      varClass?: string | undefined;
      init?: IrValue | undefined;
      origin?: IrSourceRef | undefined;
    } = {},
  ): IrValue {
    const fn = this.requireFunction();
    const entry = fn.blocks[0];
    if (entry === undefined)
      throw new Error("IrBuilder: function has no entry block");
    const instr: IrAllocaInstr = {
      id: this.id(),
      op: "alloca",
      allocatedType,
      name,
      retain: opts.retain ?? false,
      type: pointerTo(allocatedType),
      operands: [],
      ...(opts.located !== undefined ? { located: opts.located } : {}),
      ...(opts.varClass !== undefined ? { varClass: opts.varClass } : {}),
      ...(opts.init !== undefined ? { init: opts.init } : {}),
      ...this.meta(opts.origin, name),
    };
    // Allocas go at the top of entry, ahead of any code, and never after its
    // terminator — which is why this bypasses emit().
    const insertAt = entry.instrs.findIndex((i) => i.op !== "alloca");
    if (insertAt < 0) entry.instrs.push(instr);
    else entry.instrs.splice(insertAt, 0, instr);
    return this.ref(instr);
  }

  load(
    type: IrType,
    address: IrValue,
    opts: {
      origin?: IrSourceRef | undefined;
      comment?: string | undefined;
    } = {},
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "load",
        type,
        operands: [address],
        ...this.meta(opts.origin, opts.comment),
      }),
    );
  }

  store(
    value: IrValue,
    address: IrValue,
    opts: {
      origin?: IrSourceRef | undefined;
      comment?: string | undefined;
    } = {},
  ): void {
    this.emit({
      id: this.id(),
      op: "store",
      type: VOID,
      operands: [value, address],
      ...this.meta(opts.origin, opts.comment),
    });
  }

  gep(
    resultType: IrType,
    base: IrValue,
    indices: IrValue[],
    opts: {
      path?: string[] | undefined;
      origin?: IrSourceRef | undefined;
    } = {},
  ): IrValue {
    return this.ref(
      this.emit({
        id: this.id(),
        op: "gep",
        type: resultType,
        operands: [base, ...indices],
        ...(opts.path !== undefined ? { path: opts.path } : {}),
        ...this.meta(opts.origin),
      }),
    );
  }

  call(
    callee: string,
    returnType: IrType,
    args: IrValue[],
    opts: {
      standard?: boolean | undefined;
      origin?: IrSourceRef | undefined;
    } = {},
  ): IrValue {
    const instr = this.emit({
      id: this.id(),
      op: "call",
      callee,
      type: returnType,
      operands: args,
      ...(opts.standard !== undefined ? { standard: opts.standard } : {}),
      ...this.meta(opts.origin),
    });
    return this.ref(instr);
  }

  fbcall(
    fbType: string,
    instance: string,
    returnType: IrType,
    args: IrValue[],
    opts: {
      method?: string | undefined;
      argNames?: string[] | undefined;
      origin?: IrSourceRef | undefined;
    } = {},
  ): IrValue {
    const instr = this.emit({
      id: this.id(),
      op: "fbcall",
      fbType,
      instance,
      type: returnType,
      operands: args,
      ...(opts.method !== undefined ? { method: opts.method } : {}),
      ...(opts.argNames !== undefined ? { argNames: opts.argNames } : {}),
      ...this.meta(opts.origin),
    });
    return this.ref(instr);
  }

  phi(
    type: IrType,
    incoming: Array<{ block: string; value: IrValue }>,
  ): IrValue {
    const block = this.requireBlock();
    const instr: IrInstr = {
      id: this.id(),
      op: "phi",
      type,
      operands: [],
      incoming,
    };
    // Phis must lead the block, before any ordinary instruction.
    const insertAt = block.instrs.findIndex((i) => i.op !== "phi");
    if (insertAt < 0) block.instrs.push(instr);
    else block.instrs.splice(insertAt, 0, instr);
    return this.ref(instr);
  }

  // -- terminators ---------------------------------------------------------

  br(target: IrBlock, origin?: IrSourceRef | undefined): void {
    this.emit({
      id: this.id(),
      op: "br",
      target: target.label,
      type: VOID,
      operands: [],
      ...this.meta(origin),
    });
  }

  condBr(
    cond: IrValue,
    ifTrue: IrBlock,
    ifFalse: IrBlock,
    origin?: IrSourceRef | undefined,
  ): void {
    this.emit({
      id: this.id(),
      op: "condbr",
      ifTrue: ifTrue.label,
      ifFalse: ifFalse.label,
      type: VOID,
      operands: [cond],
      ...this.meta(origin),
    });
  }

  ret(value?: IrValue | undefined, origin?: IrSourceRef | undefined): void {
    this.emit({
      id: this.id(),
      op: "ret",
      type: VOID,
      operands: value === undefined ? [] : [value],
      ...this.meta(origin),
    });
  }

  unreachable(reason: string, origin?: IrSourceRef | undefined): void {
    this.emit({
      id: this.id(),
      op: "unreachable",
      reason,
      type: VOID,
      operands: [],
      ...this.meta(origin),
    });
  }

  /** Close the current block with `br` if it is still open. */
  brIfOpen(target: IrBlock, origin?: IrSourceRef | undefined): void {
    if (!this.isBlockClosed()) this.br(target, origin);
  }

  // -- internals -----------------------------------------------------------

  private requireFunction(): IrFunction {
    if (this.fn === undefined)
      throw new Error("IrBuilder: no function is being built");
    return this.fn;
  }

  private requireBlock(): IrBlock {
    if (this.block === undefined)
      throw new Error("IrBuilder: no insertion point");
    return this.block;
  }
}

/** Convenience constructors for constant operands. */
export const constant = {
  bool(value: boolean, type: IrType): IrValue {
    return { kind: "const", type, value };
  },
  int(value: number | string, type: IrType): IrValue {
    return { kind: "const", type, value };
  },
  float(value: number, type: IrType): IrValue {
    return { kind: "const", type, value };
  },
  str(value: string, type: IrType): IrValue {
    return { kind: "const", type, value };
  },
  undef(type: IrType): IrValue {
    return { kind: "undef", type };
  },
};
