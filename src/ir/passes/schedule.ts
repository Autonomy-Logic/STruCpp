// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — schedule and combinational-cycle check
 *
 * Orders the instructions of a flattened (single-block) function so every value
 * is defined before it is used, and rejects a dataflow cycle that does not pass
 * through a register. On the LOGO! target the block number *is* the evaluation
 * order, so this ordering is what the backend turns directly into block numbers;
 * a combinational cycle has no valid ordering and the machine cannot run it.
 *
 * Runs only on the flat profile — it expects one block and no control flow. After
 * flatten the instructions are already close to ordered, but predication and
 * phi-to-select rewriting can leave an operand defined slightly later than its
 * use, so a proper topological sort is the honest way to finish.
 *
 * A stable topological sort preserves the existing order among instructions with
 * no dependency between them, which keeps the output diff-friendly and keeps
 * side-effecting instructions (stores to the same output) in their original
 * relative order — that order is semantically load-bearing after flatten's
 * ordered predicated stores.
 */

import {
  isTerminator,
  type IrFunction,
  type IrInstr,
  type IrModule,
  type IrValue,
} from "../ir.js";
import type { IrPass, PassContext } from "./pass.js";

export class ScheduleError extends Error {
  constructor(
    readonly fn: string,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export const schedule: IrPass = {
  name: "schedule",
  run(module: IrModule, ctx: PassContext): IrModule {
    for (const fn of module.functions) scheduleFunction(fn, ctx);
    return module;
  },
};

function scheduleFunction(fn: IrFunction, ctx: PassContext): void {
  if (fn.blocks.length !== 1) {
    throw new ScheduleError(
      fn.name,
      "schedule expects a flattened, single-block function",
    );
  }
  const block = fn.blocks[0]!;
  const instrs = block.instrs;

  const defBy = new Map<number, IrInstr>();
  for (const i of instrs) if (i.type.kind !== "void") defBy.set(i.id, i);

  // Kahn's algorithm over the def/use graph, but with a twist that keeps side
  // effects honest: an instruction also depends on the previous side-effecting
  // instruction, so stores and I/O never reorder relative to each other.
  const deps = new Map<IrInstr, Set<IrInstr>>();
  for (const i of instrs) deps.set(i, new Set());

  let lastEffect: IrInstr | undefined;
  const SIDE = new Set(["store", "call", "fbcall", "load"]);
  for (const instr of instrs) {
    for (const op of instr.operands) addValueDep(instr, op, defBy, deps);
    if (instr.op === "phi")
      for (const inc of instr.incoming)
        addValueDep(instr, inc.value, defBy, deps);
    if (SIDE.has(instr.op)) {
      if (lastEffect !== undefined) deps.get(instr)!.add(lastEffect);
      lastEffect = instr;
    }
    // The terminator depends on every side effect so it lands last.
    if (isTerminator(instr) && lastEffect !== undefined)
      deps.get(instr)!.add(lastEffect);
  }

  // Allocas anchor the top regardless — they are declarations, not computation.
  const allocas = instrs.filter((i) => i.op === "alloca");
  const rest = instrs.filter((i) => i.op !== "alloca");

  const ordered: IrInstr[] = [...allocas];
  const placed = new Set<IrInstr>(allocas);
  const remaining = new Set(rest);

  // Stable Kahn: repeatedly emit the earliest-originally instruction whose deps
  // are all placed.
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const instr of rest) {
      if (!remaining.has(instr)) continue;
      const ready = [...deps.get(instr)!].every((d) => placed.has(d));
      if (!ready) continue;
      ordered.push(instr);
      placed.add(instr);
      remaining.delete(instr);
      progress = true;
    }
  }

  if (remaining.size > 0) {
    const stuck = [...remaining][0]!;
    throw new ScheduleError(
      fn.name,
      `combinational cycle: %${stuck.id} (${stuck.op}) depends on itself within a scan, ` +
        "with no register to break it",
    );
  }

  block.instrs = ordered;
  ctx.note(`${fn.name}: scheduled ${ordered.length} instruction(s)`);
}

function addValueDep(
  user: IrInstr,
  op: IrValue,
  defBy: ReadonlyMap<number, IrInstr>,
  deps: Map<IrInstr, Set<IrInstr>>,
): void {
  if (op.kind !== "temp") return;
  const def = defBy.get(op.id);
  if (def !== undefined && def !== user) deps.get(user)!.add(def);
}
