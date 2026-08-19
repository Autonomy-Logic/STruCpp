// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — mem2reg
 *
 * Promotes memory to SSA registers: allocas whose only uses are loads and stores
 * become phi-connected values, and the alloca / load / store instructions
 * disappear. Lowering emits everything through memory to stay obviously correct;
 * this turns that into real SSA, and the flat profile the netlist backends need
 * cannot be reached without it.
 *
 * Construction follows Braun et al., "Simple and Efficient Construction of Static
 * Single Assignment Form" (CC 2013), including its **sealing** discipline. A
 * block is sealed only once all its predecessors have been filled; a loop header,
 * whose back-edge predecessor is filled after the header itself, is therefore
 * visited while still unsealed. Reads in an unsealed block create *incomplete*
 * phis whose operands are filled when the block is finally sealed — which is what
 * lets a loop-carried value flow back through the latch instead of collapsing to
 * undef. (An earlier version sealed everything up front and lost exactly that
 * back edge.)
 *
 * An alloca is promotable only when its address never escapes: its SSA result is
 * used solely as the pointer operand of loads and stores. An address that reaches
 * a gep, a call, or any value position stays in memory untouched — correct if
 * larger, and the array and struct cases legitimately land there today.
 */

import {
  findBlock,
  successors,
  type IrFunction,
  type IrInstr,
  type IrModule,
  type IrPhiInstr,
  type IrValue,
} from "../ir.js";
import { typesEqual, type IrType } from "../types.js";
import type { IrPass, PassContext } from "./pass.js";

export const mem2reg: IrPass = {
  name: "mem2reg",
  run(module: IrModule, ctx: PassContext): IrModule {
    for (const fn of module.functions) new Mem2Reg(fn).run(ctx);
    return module;
  },
};

class Mem2Reg {
  private readonly promotable: Map<number, IrType>;
  private readonly preds: Map<string, string[]>;
  private readonly currentDef = new Map<number, Map<string, IrValue>>();
  private readonly sealed = new Set<string>();
  private readonly filled = new Set<string>();
  private readonly incomplete = new Map<string, Map<number, IrPhiInstr>>();
  private readonly newPhis = new Map<string, IrPhiInstr[]>();
  private readonly subst = new Map<number, IrValue>();
  private phiId: number;

  constructor(private readonly fn: IrFunction) {
    this.promotable = findPromotableAllocas(fn);
    this.preds = predecessors(fn);
    this.phiId = maxInstrId(fn) + 1;
    for (const id of this.promotable.keys()) this.currentDef.set(id, new Map());
  }

  run(ctx: PassContext): void {
    if (this.promotable.size === 0) return;

    // Fill blocks in reverse postorder, so a block's forward predecessors are
    // filled before it. Seal as soon as all predecessors are filled.
    for (const label of reversePostorder(this.fn)) {
      this.trySeal(label);
      this.fillBlock(label);
      // A just-filled block may complete a successor's predecessor set.
      for (const s of new Set(successors0(this.fn, label))) this.trySeal(s);
    }
    // Loop headers whose latch has now filled.
    for (const b of this.fn.blocks) this.trySeal(b.label);

    this.commit();
    ctx.note(`${this.fn.name}: promoted ${this.promotable.size} alloca(s)`);
  }

  private fillBlock(label: string): void {
    const block = findBlock(this.fn, label)!;
    const kept: IrInstr[] = [];
    for (const instr of block.instrs) {
      if (instr.op === "store") {
        const a = this.allocaOf(instr.operands[1]!);
        if (a !== undefined) {
          this.writeVariable(a, label, instr.operands[0]!);
          continue;
        }
      } else if (instr.op === "load") {
        const a = this.allocaOf(instr.operands[0]!);
        if (a !== undefined) {
          this.subst.set(instr.id, this.readVariable(a, label, instr.type));
          continue;
        }
      } else if (instr.op === "alloca" && this.promotable.has(instr.id)) {
        continue;
      }
      kept.push(instr);
    }
    block.instrs = kept;
    this.filled.add(label);
  }

  private trySeal(label: string): void {
    if (this.sealed.has(label)) return;
    const ps = this.preds.get(label) ?? [];
    if (!ps.every((p) => this.filled.has(p))) return;
    // All predecessors filled: fill any incomplete phis, then seal.
    const inc = this.incomplete.get(label);
    if (inc !== undefined) {
      for (const [alloca, phi] of inc) this.addPhiOperands(alloca, phi, ps);
    }
    this.sealed.add(label);
  }

  private writeVariable(alloca: number, block: string, value: IrValue): void {
    this.currentDef.get(alloca)!.set(block, value);
  }

  private readVariable(alloca: number, block: string, type: IrType): IrValue {
    const local = this.currentDef.get(alloca)!.get(block);
    if (local !== undefined) return local;
    return this.readRecursive(alloca, block, type);
  }

  private readRecursive(alloca: number, block: string, type: IrType): IrValue {
    let value: IrValue;
    if (!this.sealed.has(block)) {
      // Predecessors not all known yet: incomplete phi, filled at seal time.
      const phi = this.makePhi(type, block);
      this.incompleteFor(block).set(alloca, phi);
      value = phiRef(phi);
    } else {
      const ps = this.preds.get(block) ?? [];
      if (ps.length === 1) {
        value = this.readVariable(alloca, ps[0]!, type);
      } else if (ps.length === 0) {
        value = { kind: "undef", type };
      } else {
        const phi = this.makePhi(type, block);
        this.writeVariable(alloca, block, phiRef(phi)); // break cycles first
        this.addPhiOperands(alloca, phi, ps);
        value = this.tryRemoveTrivialPhi(phi);
      }
    }
    this.writeVariable(alloca, block, value);
    return value;
  }

  private addPhiOperands(
    alloca: number,
    phi: IrPhiInstr,
    ps: readonly string[],
  ): void {
    for (const p of ps) {
      phi.incoming.push({
        block: p,
        value: this.readVariable(alloca, p, phi.type),
      });
    }
    this.tryRemoveTrivialPhi(phi);
  }

  private tryRemoveTrivialPhi(phi: IrPhiInstr): IrValue {
    let same: IrValue | undefined;
    for (const inc of phi.incoming) {
      if (isPhiSelf(inc.value, phi.id)) continue;
      if (same !== undefined && sameValue(inc.value, same)) continue;
      if (same !== undefined) return phiRef(phi); // two distinct operands: keep
      same = inc.value;
    }
    const replacement = same ?? ({ kind: "undef", type: phi.type } as IrValue);
    this.subst.set(phi.id, replacement);
    this.dropPhi(phi);
    // A trivial phi may make a user phi trivial; the final substitution sweep
    // resolves the chain, so no further recursion is needed here.
    return replacement;
  }

  private makePhi(type: IrType, block: string): IrPhiInstr {
    const phi: IrPhiInstr = {
      id: this.phiId++,
      op: "phi",
      type,
      operands: [],
      incoming: [],
    };
    const list = this.newPhis.get(block);
    if (list === undefined) this.newPhis.set(block, [phi]);
    else list.push(phi);
    return phi;
  }

  private dropPhi(phi: IrPhiInstr): void {
    for (const [, list] of this.newPhis) {
      const i = list.indexOf(phi);
      if (i >= 0) {
        list.splice(i, 1);
        return;
      }
    }
  }

  private incompleteFor(block: string): Map<number, IrPhiInstr> {
    let m = this.incomplete.get(block);
    if (m === undefined) {
      m = new Map();
      this.incomplete.set(block, m);
    }
    return m;
  }

  private allocaOf(addr: IrValue): number | undefined {
    return addr.kind === "temp" && this.promotable.has(addr.id)
      ? addr.id
      : undefined;
  }

  private commit(): void {
    for (const [label, phis] of this.newPhis) {
      if (phis.length === 0) continue;
      findBlock(this.fn, label)!.instrs.unshift(...phis);
    }
    const resolve = (v: IrValue): IrValue => {
      let cur = v;
      const seen = new Set<number>();
      while (
        cur.kind === "temp" &&
        this.subst.has(cur.id) &&
        !seen.has(cur.id)
      ) {
        seen.add(cur.id);
        cur = this.subst.get(cur.id)!;
      }
      return cur;
    };
    for (const block of this.fn.blocks) {
      for (const instr of block.instrs) {
        instr.operands = instr.operands.map(resolve);
        if (instr.op === "phi") {
          instr.incoming = instr.incoming.map((inc) => ({
            block: inc.block,
            value: resolve(inc.value),
          }));
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------

function findPromotableAllocas(fn: IrFunction): Map<number, IrType> {
  const allocas = new Map<number, IrType>();
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      // A located variable aliases a hardware terminal, so its loads and stores
      // are real I/O and its address must survive to the backend, which binds it
      // to %IX0.0 and the like. Treat it as volatile: never promoted. The same
      // goes for a RETAIN variable, whose store is observable across a power
      // cycle, not just across a scan.
      if (
        instr.op === "alloca" &&
        instr.located === undefined &&
        !instr.retain
      ) {
        allocas.set(instr.id, instr.allocatedType);
      }
    }
  }
  if (allocas.size === 0) return allocas;
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      instr.operands.forEach((op, index) => {
        if (op.kind !== "temp" || !allocas.has(op.id)) return;
        const ok =
          (instr.op === "load" && index === 0) ||
          (instr.op === "store" && index === 1);
        if (!ok) allocas.delete(op.id);
      });
      if (instr.op === "phi") {
        for (const inc of instr.incoming) {
          if (inc.value.kind === "temp") allocas.delete(inc.value.id);
        }
      }
    }
  }
  return allocas;
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

function successors0(fn: IrFunction, label: string): string[] {
  const b = findBlock(fn, label);
  return b === undefined ? [] : b.instrs.flatMap(successors);
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
    const succ = successors0(fn, top.label);
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
  // Unreachable blocks still need filling so their instructions are not lost.
  for (const b of fn.blocks) if (!seen.has(b.label)) post.push(b.label);
  return post.reverse();
}

function maxInstrId(fn: IrFunction): number {
  let max = 0;
  for (const b of fn.blocks)
    for (const i of b.instrs) if (i.id > max) max = i.id;
  return max;
}

function phiRef(phi: IrPhiInstr): IrValue {
  return { kind: "temp", id: phi.id, type: phi.type };
}

function isPhiSelf(v: IrValue, phiId: number): boolean {
  return v.kind === "temp" && v.id === phiId;
}

function sameValue(a: IrValue, b: IrValue): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "temp" && b.kind === "temp") return a.id === b.id;
  if (a.kind === "const" && b.kind === "const")
    return a.value === b.value && typesEqual(a.type, b.type);
  if (a.kind === "param" && b.kind === "param") return a.index === b.index;
  if (a.kind === "global" && b.kind === "global") return a.name === b.name;
  return false;
}
