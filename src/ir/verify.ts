// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Verifier
 *
 * The equivalent of LLVM's verifyModule, and the reason a backend can trust what
 * it receives. Two levels:
 *
 *   "ssa"  — general well-formedness. Every block ends in exactly one
 *            terminator, branches name real blocks, SSA names are unique and
 *            defined before use, phi operands line up with predecessors.
 *
 *   "flat" — everything in "ssa", plus the restricted profile that targets with
 *            no program counter require: one block, no branches, no phis, no
 *            memory. This is not a different IR. It is the same IR after the
 *            flattening pipeline, and this check is how a netlist backend states
 *            its precondition instead of hoping.
 */

import {
  isTerminator,
  producesValue,
  successors,
  type IrFunction,
  type IrInstr,
  type IrModule,
  type IrValue,
} from "./ir.js";
import { formatType, typesEqual } from "./types.js";

export type IrVerifyLevel = "ssa" | "flat";

export interface IrVerifyIssue {
  function?: string;
  block?: string;
  instr?: number;
  message: string;
}

/** Where an issue was found, without the message. */
export type IrIssueLocation = Omit<IrVerifyIssue, "message">;

export interface IrVerifyResult {
  ok: boolean;
  issues: IrVerifyIssue[];
}

export function verifyModule(
  m: IrModule,
  level: IrVerifyLevel = "ssa",
): IrVerifyResult {
  const issues: IrVerifyIssue[] = [];

  const names = new Set<string>();
  for (const fn of m.functions) {
    if (names.has(fn.name)) {
      issues.push({ function: fn.name, message: "duplicate function name" });
    }
    names.add(fn.name);
    verifyFunction(fn, level, issues);
  }

  return { ok: issues.length === 0, issues };
}

function verifyFunction(
  fn: IrFunction,
  level: IrVerifyLevel,
  issues: IrVerifyIssue[],
): void {
  const at = (block?: string, instr?: number): IrIssueLocation => ({
    function: fn.name,
    ...(block !== undefined ? { block } : {}),
    ...(instr !== undefined ? { instr } : {}),
  });

  if (fn.blocks.length === 0) {
    issues.push({ ...at(), message: "function has no blocks" });
    return;
  }

  const labels = new Set<string>();
  for (const b of fn.blocks) {
    if (labels.has(b.label)) {
      issues.push({ ...at(b.label), message: "duplicate block label" });
    }
    labels.add(b.label);
  }

  // Predecessors, for checking phi operands.
  const preds = new Map<string, string[]>();
  for (const b of fn.blocks) {
    for (const s of b.instrs.flatMap(successors)) {
      if (!labels.has(s)) {
        issues.push({
          ...at(b.label),
          message: `branch to unknown block '${s}'`,
        });
        continue;
      }
      const list = preds.get(s);
      if (list === undefined) preds.set(s, [b.label]);
      else list.push(b.label);
    }
  }

  // SSA names must be unique across the function, and defined before use.
  const defined = new Set<number>();
  const seenIds = new Set<number>();

  for (const b of fn.blocks) {
    const last = b.instrs[b.instrs.length - 1];
    if (last === undefined) {
      issues.push({ ...at(b.label), message: "empty block" });
    } else if (!isTerminator(last)) {
      issues.push({
        ...at(b.label),
        message: "block does not end in a terminator",
      });
    }
    for (let i = 0; i < b.instrs.length - 1; i++) {
      const instr = b.instrs[i]!;
      if (isTerminator(instr)) {
        issues.push({
          ...at(b.label, instr.id),
          message: `terminator '${instr.op}' is not the last instruction`,
        });
      }
    }

    let sawNonPhi = false;
    for (const instr of b.instrs) {
      if (seenIds.has(instr.id)) {
        issues.push({ ...at(b.label, instr.id), message: "duplicate SSA id" });
      }
      seenIds.add(instr.id);

      if (instr.op === "phi") {
        if (sawNonPhi) {
          issues.push({
            ...at(b.label, instr.id),
            message: "phi must precede ordinary instructions",
          });
        }
        const expected = (preds.get(b.label) ?? []).slice().sort();
        const got = instr.incoming
          .map((i) => i.block)
          .slice()
          .sort();
        if (
          expected.length !== got.length ||
          expected.some((e, i) => e !== got[i])
        ) {
          issues.push({
            ...at(b.label, instr.id),
            message: `phi operands [${got.join(", ")}] do not match predecessors [${expected.join(", ")}]`,
          });
        }
        for (const inc of instr.incoming) {
          if (!typesEqual(inc.value.type, instr.type)) {
            issues.push({
              ...at(b.label, instr.id),
              message:
                `phi incoming from '${inc.block}' has type ${formatType(inc.value.type)}, ` +
                `expected ${formatType(instr.type)}`,
            });
          }
        }
      } else {
        sawNonPhi = true;
      }

      verifyOperandShape(instr, at(b.label, instr.id), issues);

      // Dominance is not fully checked; within a block, ordering is. A use of a
      // name defined in a block that does not dominate this one is caught only
      // when the name has not been seen at all.
      for (const o of instr.operands) {
        checkOperandDefined(o, defined, at(b.label, instr.id), issues);
      }
      if (instr.op === "phi") {
        // Phi operands are live on the incoming edge, so they are exempt.
        defined.add(instr.id);
        continue;
      }
      if (producesValue(instr)) defined.add(instr.id);
    }
  }

  if (level === "flat") verifyFlatProfile(fn, issues);
}

function checkOperandDefined(
  o: IrValue,
  defined: ReadonlySet<number>,
  where: IrIssueLocation,
  issues: IrVerifyIssue[],
): void {
  if (o.kind === "temp" && !defined.has(o.id)) {
    issues.push({ ...where, message: `use of %${o.id} before its definition` });
  }
}

function verifyOperandShape(
  instr: IrInstr,
  where: IrIssueLocation,
  issues: IrVerifyIssue[],
): void {
  const n = instr.operands.length;
  const need = (count: number): void => {
    if (n !== count) {
      issues.push({
        ...where,
        message: `${instr.op} expects ${count} operand(s), found ${n}`,
      });
    }
  };
  switch (instr.op) {
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "mod":
    case "pow":
    case "and":
    case "or":
    case "xor":
    case "shl":
    case "shr":
    case "rol":
    case "ror":
    case "cmp":
      need(2);
      break;
    case "neg":
    case "not":
    case "cast":
    case "load":
      need(1);
      break;
    case "store":
      need(2);
      if (n === 2 && instr.operands[1]!.type.kind !== "pointer") {
        issues.push({
          ...where,
          message: "store address operand is not a pointer",
        });
      }
      break;
    case "select":
      need(3);
      break;
    case "condbr":
      need(1);
      break;
    case "alloca":
    case "phi":
    case "br":
    case "unreachable":
      need(0);
      break;
    case "ret":
      if (n > 1)
        issues.push({
          ...where,
          message: `ret expects 0 or 1 operands, found ${n}`,
        });
      break;
    case "gep":
      if (n < 2)
        issues.push({
          ...where,
          message: "gep expects a base and at least one index",
        });
      break;
    case "call":
    case "fbcall":
      break;
  }
}

/** The restricted profile a target with no program counter can consume. */
function verifyFlatProfile(fn: IrFunction, issues: IrVerifyIssue[]): void {
  const at = (block: string, instr?: number): IrIssueLocation => ({
    function: fn.name,
    block,
    ...(instr !== undefined ? { instr } : {}),
  });

  if (fn.blocks.length !== 1) {
    issues.push({
      function: fn.name,
      message:
        `flat profile requires exactly one block, found ${fn.blocks.length} — ` +
        "run the flattening pipeline first",
    });
  }

  for (const b of fn.blocks) {
    for (const instr of b.instrs) {
      switch (instr.op) {
        case "condbr":
        case "br":
          issues.push({
            ...at(b.label, instr.id),
            message: `flat profile admits no control flow; use select instead of ${instr.op}`,
          });
          break;
        case "phi":
          issues.push({
            ...at(b.label, instr.id),
            message: "flat profile admits no phi; run mem2reg then flattening",
          });
          break;
        case "alloca":
        case "load":
        case "store":
        case "gep":
          issues.push({
            ...at(b.label, instr.id),
            message: `flat profile admits no memory operations; '${instr.op}' must be promoted away`,
          });
          break;
        default:
          break;
      }
    }
  }
}

export function formatIssues(result: IrVerifyResult): string {
  return result.issues
    .map((i) => {
      const loc = [
        i.function,
        i.block,
        i.instr !== undefined ? `%${i.instr}` : undefined,
      ]
        .filter((p) => p !== undefined)
        .join(":");
      return loc.length > 0 ? `${loc}: ${i.message}` : i.message;
    })
    .join("\n");
}
