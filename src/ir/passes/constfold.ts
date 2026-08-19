// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — constant folding and propagation
 *
 * Evaluates instructions whose operands are all constant, and propagates the
 * result forward so downstream instructions fold in turn. Runs to a fixpoint
 * within each function.
 *
 * Two reasons this matters more here than on a general CPU target. Budget
 * accounting has to reflect what the device will actually execute, and a program
 * full of un-folded `x + 0` would over-count blocks. And instruction selection
 * for a four-operand ANALOG_MATH wants literals already collapsed so a whole
 * subexpression can be recognised.
 *
 * Only integer, boolean and comparison operations are folded. Float folding is
 * deliberately omitted: the device has no float unit, so a folded REAL constant
 * would still be unrepresentable, and folding it here would only hide the
 * diagnostic the backend should raise. TIME values are integers and fold fine.
 *
 * Scope is intraprocedural and value-based: a `temp` defined by a foldable
 * instruction is replaced everywhere by its constant. Dead instructions are left
 * for a later DCE pass rather than removed here, to keep this pass single-purpose.
 */

import type {
  IrArithInstr,
  IrBitInstr,
  IrCastInstr,
  IrCmpInstr,
  IrConstValue,
  IrFunction,
  IrInstr,
  IrModule,
  IrValue,
} from "../ir.js";
import { bitWidth, type IrType } from "../types.js";
import type { IrPass, PassContext } from "./pass.js";

export const constFold: IrPass = {
  name: "constfold",
  run(module: IrModule, ctx: PassContext): IrModule {
    let folded = 0;
    for (const fn of module.functions) folded += foldFunction(fn);
    if (folded > 0) ctx.note(`folded ${folded} instruction(s)`);
    return module;
  },
};

function foldFunction(fn: IrFunction): number {
  const known = new Map<number, IrConstValue>();
  let changed = true;
  let count = 0;

  const asConst = (v: IrValue): IrConstValue | undefined => {
    if (v.kind === "const") return v;
    if (v.kind === "temp") return known.get(v.id);
    return undefined;
  };

  while (changed) {
    changed = false;
    for (const block of fn.blocks) {
      for (const instr of block.instrs) {
        if (instr.type.kind === "void" || known.has(instr.id)) continue;
        const c = evalInstr(instr, asConst);
        if (c !== undefined) {
          known.set(instr.id, c);
          changed = true;
          count++;
        }
      }
    }
  }
  if (count === 0) return 0;

  // Replace every use of a now-known temp with its constant.
  const sub = (v: IrValue): IrValue =>
    v.kind === "temp" && known.has(v.id) ? known.get(v.id)! : v;
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      instr.operands = instr.operands.map(sub);
      if (instr.op === "phi") {
        instr.incoming = instr.incoming.map((i) => ({
          block: i.block,
          value: sub(i.value),
        }));
      }
    }
  }
  return count;
}

function evalInstr(
  instr: IrInstr,
  asConst: (v: IrValue) => IrConstValue | undefined,
): IrConstValue | undefined {
  switch (instr.op) {
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "mod":
      return foldArith(instr, asConst);
    case "neg": {
      const a = asConst(instr.operands[0]!);
      if (a === undefined || typeof a.value !== "number") return undefined;
      return mkInt(-a.value, instr.type);
    }
    case "and":
    case "or":
    case "xor":
    case "not":
    case "shl":
    case "shr":
      return foldBit(instr, asConst);
    case "cmp":
      return foldCmp(instr, asConst);
    case "cast":
      return foldCast(instr, asConst);
    default:
      return undefined;
  }
}

function foldArith(
  instr: IrArithInstr,
  asConst: (v: IrValue) => IrConstValue | undefined,
): IrConstValue | undefined {
  if (instr.type.kind === "float") return undefined; // never fold float
  const a = asConst(instr.operands[0]!);
  const b = asConst(instr.operands[1]!);
  if (a === undefined || b === undefined) return undefined;
  if (typeof a.value !== "number" || typeof b.value !== "number")
    return undefined;
  const x = a.value;
  const y = b.value;
  let r: number;
  switch (instr.op) {
    case "add":
      r = x + y;
      break;
    case "sub":
      r = x - y;
      break;
    case "mul":
      r = x * y;
      break;
    case "div":
      if (y === 0) return undefined; // leave for the backend's divide-by-zero semantics
      r = Math.trunc(x / y);
      break;
    case "mod":
      if (y === 0) return undefined;
      r = x % y;
      break;
    default:
      return undefined;
  }
  return mkInt(wrap(r, instr.type), instr.type);
}

function foldBit(
  instr: IrBitInstr,
  asConst: (v: IrValue) => IrConstValue | undefined,
): IrConstValue | undefined {
  const a = asConst(instr.operands[0]!);
  const isBool = instr.type.kind === "bool";
  if (instr.op === "not") {
    if (a === undefined) return undefined;
    if (isBool && typeof a.value === "boolean")
      return mkBool(!a.value, instr.type);
    if (typeof a.value === "number")
      return mkInt(wrap(~a.value, instr.type), instr.type);
    return undefined;
  }
  const b = asConst(instr.operands[1]!);
  if (a === undefined || b === undefined) return undefined;
  if (isBool && typeof a.value === "boolean" && typeof b.value === "boolean") {
    switch (instr.op) {
      case "and":
        return mkBool(a.value && b.value, instr.type);
      case "or":
        return mkBool(a.value || b.value, instr.type);
      case "xor":
        return mkBool(a.value !== b.value, instr.type);
      default:
        return undefined;
    }
  }
  if (typeof a.value !== "number" || typeof b.value !== "number")
    return undefined;
  const x = a.value;
  const y = b.value;
  let r: number;
  switch (instr.op) {
    case "and":
      r = x & y;
      break;
    case "or":
      r = x | y;
      break;
    case "xor":
      r = x ^ y;
      break;
    case "shl":
      r = x << y;
      break;
    case "shr":
      r = x >> y;
      break;
    default:
      return undefined;
  }
  return mkInt(wrap(r, instr.type), instr.type);
}

function foldCmp(
  instr: IrCmpInstr,
  asConst: (v: IrValue) => IrConstValue | undefined,
): IrConstValue | undefined {
  const a = asConst(instr.operands[0]!);
  const b = asConst(instr.operands[1]!);
  if (a === undefined || b === undefined) return undefined;
  const x = a.value;
  const y = b.value;
  if (
    typeof x === "boolean" ||
    typeof y === "boolean" ||
    typeof x === "string" ||
    typeof y === "string"
  ) {
    if (instr.pred === "eq") return mkBool(x === y, instr.type);
    if (instr.pred === "ne") return mkBool(x !== y, instr.type);
    return undefined;
  }
  let r: boolean;
  switch (instr.pred) {
    case "eq":
      r = x === y;
      break;
    case "ne":
      r = x !== y;
      break;
    case "slt":
    case "ult":
    case "flt":
      r = x < y;
      break;
    case "sle":
    case "ule":
    case "fle":
      r = x <= y;
      break;
    case "sgt":
    case "ugt":
    case "fgt":
      r = x > y;
      break;
    case "sge":
    case "uge":
    case "fge":
      r = x >= y;
      break;
    default:
      return undefined;
  }
  return mkBool(r, instr.type);
}

/**
 * Fold integer-to-integer width casts of constants. The value-changing float
 * casts and the IEC `convert` family are left alone: their rounding and
 * saturation are the backend's to apply, and folding them here would bake in a
 * rule that belongs downstream.
 */
function foldCast(
  instr: IrCastInstr,
  asConst: (v: IrValue) => IrConstValue | undefined,
): IrConstValue | undefined {
  const a = asConst(instr.operands[0]!);
  if (a === undefined) return undefined;
  switch (instr.castKind) {
    case "trunc":
    case "sext":
    case "zext":
    case "bitcast":
      if (typeof a.value !== "number") return undefined;
      return mkInt(wrap(a.value, instr.type), instr.type);
    default:
      return undefined; // fptrunc/fpext/fptosi/sitofp/uitofp/convert: not here
  }
}

/** Wrap an integer result to its type width, matching two's-complement. */
function wrap(v: number, type: IrType): number {
  const bits = bitWidth(type) ?? 32;
  if (bits >= 32) return v | 0;
  const mask = (1 << bits) - 1;
  const signed = type.kind === "int" ? type.signed : true;
  const w = v & mask;
  if (signed && (w & (1 << (bits - 1))) !== 0) return w - (1 << bits);
  return w;
}

function mkInt(value: number, type: IrType): IrConstValue {
  return { kind: "const", type, value };
}

function mkBool(value: boolean, type: IrType): IrConstValue {
  return { kind: "const", type, value };
}
