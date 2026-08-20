// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — dead-code elimination
 *
 * Removes value-producing instructions whose result is never used and which have
 * no side effect. A support pass: inline, unroll, scalarise and flatten each leave
 * dead values behind, and un-pruned dead code both inflates budget accounting and
 * clutters the printed IR.
 *
 * Side-effecting instructions are never dead: stores (hardware I/O), calls and
 * fbcalls (may act on state or the outside world), and all terminators. Loads are
 * kept too — a load of a located input is an observable I/O read whose absence
 * could change timing, and a load of ordinary memory is only present when mem2reg
 * declined to promote it, which means the address escaped and the load may alias.
 *
 * Mark-and-sweep to a fixpoint: start from the side-effecting and terminator
 * instructions, mark everything their operands transitively reach, sweep the rest.
 */

import {
  isTerminator,
  type IrFunction,
  type IrInstr,
  type IrModule,
  type IrValue,
} from "../ir.js";
import type { IrPass, PassContext } from "./pass.js";

const SIDE_EFFECTING = new Set(["store", "call", "fbcall", "load"]);

export const dce: IrPass = {
  name: "dce",
  run(module: IrModule, ctx: PassContext): IrModule {
    let removed = 0;
    for (const fn of module.functions) removed += sweepFunction(fn);
    if (removed > 0) ctx.note(`removed ${removed} dead instruction(s)`);
    return module;
  },
};

function sweepFunction(fn: IrFunction): number {
  // Map every SSA id to its defining instruction, and index the roots.
  const defs = new Map<number, IrInstr>();
  for (const block of fn.blocks) {
    for (const instr of block.instrs)
      if (instr.type.kind !== "void") defs.set(instr.id, instr);
  }

  const live = new Set<number>();
  const worklist: IrInstr[] = [];

  const useValue = (v: IrValue): void => {
    if (v.kind !== "temp" || live.has(v.id)) return;
    const def = defs.get(v.id);
    if (def === undefined) return;
    live.add(v.id);
    worklist.push(def);
  };

  // Roots: anything with a side effect or that steers control flow.
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (isTerminator(instr) || SIDE_EFFECTING.has(instr.op)) {
        if (instr.type.kind !== "void") live.add(instr.id);
        worklist.push(instr);
      }
    }
  }

  while (worklist.length > 0) {
    const instr = worklist.pop()!;
    for (const op of instr.operands) useValue(op);
    if (instr.op === "phi")
      for (const inc of instr.incoming) useValue(inc.value);
  }

  let removed = 0;
  for (const block of fn.blocks) {
    const kept = block.instrs.filter((instr) => {
      if (isTerminator(instr) || SIDE_EFFECTING.has(instr.op)) return true;
      if (instr.type.kind === "void") return true; // no result to be dead
      if (live.has(instr.id)) return true;
      removed++;
      return false;
    });
    block.instrs = kept;
  }
  return removed;
}
