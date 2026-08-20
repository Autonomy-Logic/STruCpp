// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — flatten (if-conversion)
 *
 * Collapses an acyclic control-flow graph into a single basic block, so a target
 * with no program counter can consume it. This is the keystone of the flat
 * profile the netlist backends require.
 *
 * Method, for a reducible acyclic CFG:
 *
 *   - Each block gets a **predicate**: the boolean under which control reaches it.
 *     entry is true; an edge out of a `condbr` carries the condition (or its
 *     negation); a block's predicate is the OR of its incoming edge predicates.
 *   - **phi becomes select.** A phi picks its value by which edge was taken, so a
 *     chain of selects keyed on the edge predicates reproduces it.
 *   - **Conditional side effects are enable-gated** — the subtlest correctness
 *     point in the compiler. A store to a located output in a predicated block
 *     becomes `store(select(pred, newValue, currentValue), addr)`, so the output
 *     keeps its prior value on the untaken path instead of being forced. (A
 *     stateful block's enable gating is applied later, by the backend, using the
 *     same predicate; flatten records it on the instruction.)
 *   - Blocks are emitted in reverse postorder into one block; branches vanish.
 *
 * A **back edge is rejected**: a cycle means a loop survived unrolling, and the
 * flat target cannot run it. The diagnostic points at the loop's source position.
 *
 * After this pass the function is a single block and must pass
 * verifyModule(m, "flat").
 */

import {
  isTerminator,
  successors,
  type IrBlock,
  type IrFunction,
  type IrInstr,
  type IrModule,
  type IrPhiInstr,
  type IrValue,
} from "../ir.js";
import { boolType, type IrType } from "../types.js";
import type { IrPass, PassContext } from "./pass.js";

export class FlattenError extends Error {
  constructor(
    readonly fn: string,
    message: string,
  ) {
    super(message);
    this.name = "FlattenError";
  }
}

export const flatten: IrPass = {
  name: "flatten",
  run(module: IrModule, ctx: PassContext): IrModule {
    for (const fn of module.functions) flattenFunction(fn, ctx);
    return module;
  },
};

function flattenFunction(fn: IrFunction, ctx: PassContext): void {
  if (fn.blocks.length <= 1) return;

  const rpo = reversePostorder(fn);
  detectBackEdges(fn, rpo); // throws FlattenError on a loop

  const preds = predecessors(fn);
  let idSeq = maxInstrId(fn) + 1;
  const flat: IrInstr[] = [];
  const emit = <T extends IrInstr>(instr: T): T => {
    flat.push(instr);
    return instr;
  };
  const nextId = (): number => idSeq++;

  const blockPred = new Map<string, IrValue>();
  const trueVal: IrValue = { kind: "const", type: boolType(), value: true };

  // The located allocas must survive: they carry the I/O binding. Hoist every
  // alloca to the top of the flat block, in entry order, before anything else.
  for (const block of fn.blocks) {
    for (const instr of block.instrs)
      if (instr.op === "alloca") flat.push(instr);
  }

  // A block's terminator condition, indexed for edge-predicate construction.
  const termOf = new Map<string, IrInstr | undefined>();
  for (const b of fn.blocks) termOf.set(b.label, b.instrs.at(-1));

  // AND / OR / NOT builders that fold constant-true away, keeping predicates tidy.
  const mkAnd = (a: IrValue, b: IrValue): IrValue => {
    if (isTrue(a)) return b;
    if (isTrue(b)) return a;
    return refOf(
      emit({ id: nextId(), op: "and", type: boolType(), operands: [a, b] }),
    );
  };
  const mkNot = (a: IrValue): IrValue =>
    refOf(emit({ id: nextId(), op: "not", type: boolType(), operands: [a] }));
  const mkOr = (a: IrValue, b: IrValue): IrValue => {
    if (isTrue(a) || isTrue(b)) return trueVal;
    return refOf(
      emit({ id: nextId(), op: "or", type: boolType(), operands: [a, b] }),
    );
  };

  const edgePred = (from: string, to: string): IrValue => {
    const p = blockPred.get(from) ?? trueVal;
    const term = termOf.get(from);
    if (term === undefined || term.op !== "condbr") return p;
    const cb = term;
    const cond = cb.operands[0]!;
    if (cb.ifTrue === to && cb.ifFalse === to) return p; // both edges: unconditional
    if (cb.ifTrue === to) return mkAnd(p, cond);
    return mkAnd(p, mkNot(cond));
  };

  // Process blocks in RPO. A block's predecessors precede it (no back edges), so
  // their predicates and edge conditions are already emitted.
  for (const label of rpo) {
    const block = findBlock(fn, label)!;

    // Predicate for this block: OR of incoming edge predicates (entry = true).
    const ps = preds.get(label) ?? [];
    let pred: IrValue;
    if (ps.length === 0) {
      pred = trueVal;
    } else {
      pred = edgePred(ps[0]!, label);
      for (let i = 1; i < ps.length; i++)
        pred = mkOr(pred, edgePred(ps[i]!, label));
    }
    blockPred.set(label, pred);

    for (const instr of block.instrs) {
      if (instr.op === "alloca") continue; // already hoisted
      if (isTerminator(instr)) continue; // branches vanish; ret handled below
      if (instr.op === "phi") {
        emitPhiAsSelect(instr, label, ps, edgePred, nextId, emit);
        continue;
      }
      if (instr.op === "store" && !isTrue(pred)) {
        gateStore(instr, pred, nextId, emit);
        emit(instr);
        continue;
      }
      // A stateful op keeps its predicate for the backend to enable-gate.
      if (instr.op === "fbcall" && !isTrue(pred))
        instr.comment = `enable=${valueName(pred)}`;
      emit(instr);
    }
  }

  // The single return: reuse the original ret so its value survives.
  const ret = findReturn(fn);
  if (ret !== undefined) emit(ret);
  else emit({ id: nextId(), op: "ret", type: { kind: "void" }, operands: [] });

  fn.blocks = [{ label: "flat", instrs: flat }];
  ctx.note(`${fn.name}: flattened to one block`);
}

/** phi → chain of selects keyed on the incoming edge predicates. */
function emitPhiAsSelect(
  phi: IrPhiInstr,
  block: string,
  ps: readonly string[],
  edgePred: (from: string, to: string) => IrValue,
  nextId: () => number,
  emit: <T extends IrInstr>(i: T) => T,
): void {
  const byBlock = new Map(phi.incoming.map((inc) => [inc.block, inc.value]));
  // Fold from the last predecessor backward; its value is the final else. The
  // outermost select (for the first predecessor) takes the phi's own id, so every
  // existing use of the phi resolves to it with no extra copy.
  let acc: IrValue = byBlock.get(ps[ps.length - 1]!) ?? {
    kind: "undef",
    type: phi.type,
  };
  for (let i = ps.length - 2; i >= 0; i--) {
    const from = ps[i]!;
    const value =
      byBlock.get(from) ?? ({ kind: "undef", type: phi.type } as IrValue);
    const cond = edgePred(from, block);
    const id = i === 0 ? phi.id : nextId();
    emit({
      id,
      op: "select" as const,
      type: phi.type,
      operands: [cond, value, acc],
    });
    acc = { kind: "temp", id, type: phi.type };
  }
}

/** store(v, addr) in a predicated block → store(select(pred, v, load addr), addr). */
function gateStore(
  store: IrInstr,
  pred: IrValue,
  nextId: () => number,
  emit: <T extends IrInstr>(i: T) => T,
): void {
  const value = store.operands[0]!;
  const addr = store.operands[1]!;
  const elemType: IrType = value.type;
  const current = emit({
    id: nextId(),
    op: "load" as const,
    type: elemType,
    operands: [addr],
  });
  const currentRef: IrValue = { kind: "temp", id: current.id, type: elemType };
  const sel = emit({
    id: nextId(),
    op: "select" as const,
    type: elemType,
    operands: [pred, value, currentRef],
  });
  store.operands = [{ kind: "temp", id: sel.id, type: elemType }, addr];
}

// ---------------------------------------------------------------------------

function findBlock(fn: IrFunction, label: string): IrBlock | undefined {
  return fn.blocks.find((b) => b.label === label);
}

function findReturn(fn: IrFunction): IrInstr | undefined {
  for (const b of fn.blocks) {
    const last = b.instrs.at(-1);
    if (last?.op === "ret") return last;
  }
  return undefined;
}

function predecessors(fn: IrFunction): Map<string, string[]> {
  const preds = new Map<string, string[]>();
  for (const b of fn.blocks) preds.set(b.label, []);
  for (const b of fn.blocks) {
    for (const s of new Set(b.instrs.flatMap(successors)))
      preds.get(s)?.push(b.label);
  }
  return preds;
}

function reversePostorder(fn: IrFunction): string[] {
  const entry = fn.blocks[0];
  if (entry === undefined) return [];
  const seen = new Set<string>();
  const post: string[] = [];
  const stack: Array<{ label: string; next: number }> = [
    { label: entry.label, next: 0 },
  ];
  seen.add(entry.label);
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const succ = findBlock(fn, top.label)?.instrs.flatMap(successors) ?? [];
    if (top.next < succ.length) {
      const s = succ[top.next++]!;
      if (!seen.has(s)) {
        seen.add(s);
        stack.push({ label: s, next: 0 });
      }
    } else {
      post.push(top.label);
      stack.pop();
    }
  }
  return post.reverse();
}

function detectBackEdges(fn: IrFunction, rpo: string[]): void {
  const order = new Map(rpo.map((l, i) => [l, i]));
  for (const b of fn.blocks) {
    const from = order.get(b.label);
    if (from === undefined) continue;
    for (const s of b.instrs.flatMap(successors)) {
      const to = order.get(s);
      if (to !== undefined && to <= from) {
        throw new FlattenError(
          fn.name,
          `control-flow cycle at block '${b.label}' -> '${s}': a loop survived ` +
            `unrolling and cannot run on a target with no program counter`,
        );
      }
    }
  }
}

function maxInstrId(fn: IrFunction): number {
  let max = 0;
  for (const b of fn.blocks)
    for (const i of b.instrs) if (i.id > max) max = i.id;
  return max;
}

function refOf(instr: IrInstr): IrValue {
  return { kind: "temp", id: instr.id, type: instr.type };
}

function isTrue(v: IrValue): boolean {
  return v.kind === "const" && v.value === true;
}

function valueName(v: IrValue): string {
  return v.kind === "temp" ? `%${v.id}` : "?";
}
