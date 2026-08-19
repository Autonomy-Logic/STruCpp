// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Textual form
 *
 * A human-readable dump in the spirit of LLVM's .ll. This is not a serialization
 * format — json.ts owns that — it exists so that a person can read what the
 * lowering produced, and so tests can assert on something legible instead of on
 * a JSON tree.
 */

import {
  isTerminator,
  successors,
  type IrBlock,
  type IrFunction,
  type IrInstr,
  type IrModule,
  type IrValue,
} from "./ir.js";
import { formatType, formatTypeBody } from "./types.js";

function formatValue(v: IrValue): string {
  switch (v.kind) {
    case "temp":
      return `%${v.id}`;
    case "const": {
      if (typeof v.value === "boolean") return v.value ? "true" : "false";
      if (typeof v.value === "string" && v.type.kind === "string") {
        return JSON.stringify(v.value);
      }
      return String(v.value);
    }
    case "param":
      return `%${v.name}`;
    case "global":
      return `@${v.name}`;
    case "undef":
      return "undef";
  }
}

/** Operand rendered with its type, LLVM style: `i16 %3`. */
function typedValue(v: IrValue): string {
  return `${formatType(v.type)} ${formatValue(v)}`;
}

function formatInstr(instr: IrInstr): string {
  const parts: string[] = [];
  const assign = instr.type.kind === "void" ? "" : `%${instr.id} = `;

  switch (instr.op) {
    case "alloca": {
      const flags: string[] = [];
      if (instr.retain) flags.push("retain");
      if (instr.located !== undefined) flags.push(`at ${instr.located}`);
      if (instr.varClass !== undefined) flags.push(instr.varClass);
      parts.push(
        `${assign}alloca ${formatType(instr.allocatedType)}, !name "${instr.name}"` +
          (flags.length > 0 ? ` ${flags.map((f) => `!${f}`).join(" ")}` : ""),
      );
      break;
    }
    case "load":
      parts.push(
        `${assign}load ${formatType(instr.type)}, ${typedValue(instr.operands[0]!)}`,
      );
      break;
    case "store":
      parts.push(
        `store ${typedValue(instr.operands[0]!)}, ${typedValue(instr.operands[1]!)}`,
      );
      break;
    case "gep": {
      const [base, ...idx] = instr.operands;
      const path =
        instr.path !== undefined ? ` !path "${instr.path.join(".")}"` : "";
      parts.push(
        `${assign}gep ${formatType(instr.type)}, ${typedValue(base!)}` +
          idx.map((i) => `, ${typedValue(i)}`).join("") +
          path,
      );
      break;
    }
    case "cmp":
      parts.push(
        `${assign}cmp ${instr.pred} ${instr.operands.map(typedValue).join(", ")}`,
      );
      break;
    case "cast": {
      const iec =
        instr.targetIec !== undefined ? ` to !iec "${instr.targetIec}"` : "";
      parts.push(
        `${assign}${instr.castKind} ${typedValue(instr.operands[0]!)} to ${formatType(instr.type)}${iec}`,
      );
      break;
    }
    case "call":
      parts.push(
        `${assign}call ${formatType(instr.type)} @${instr.callee}(${instr.operands.map(typedValue).join(", ")})` +
          (instr.standard === true ? " !std" : ""),
      );
      break;
    case "fbcall": {
      const target =
        instr.method !== undefined
          ? `${instr.instance}.${instr.method}`
          : instr.instance;
      const args = instr.operands.map((o, i) => {
        const n = instr.argNames?.[i];
        return n !== undefined ? `${n} := ${typedValue(o)}` : typedValue(o);
      });
      parts.push(
        `${assign}fbcall ${formatType(instr.type)} !type "${instr.fbType}" %${target}(${args.join(", ")})`,
      );
      break;
    }
    case "phi":
      parts.push(
        `${assign}phi ${formatType(instr.type)} ` +
          instr.incoming
            .map((i) => `[ ${formatValue(i.value)}, %${i.block} ]`)
            .join(", "),
      );
      break;
    case "br":
      parts.push(`br label %${instr.target}`);
      break;
    case "condbr":
      parts.push(
        `condbr ${typedValue(instr.operands[0]!)}, label %${instr.ifTrue}, label %${instr.ifFalse}`,
      );
      break;
    case "ret":
      parts.push(
        instr.operands.length === 0
          ? "ret void"
          : `ret ${typedValue(instr.operands[0]!)}`,
      );
      break;
    case "unreachable":
      parts.push(
        `unreachable` +
          (instr.reason !== undefined ? ` ; ${instr.reason}` : ""),
      );
      break;
    case "select":
      parts.push(
        `${assign}select ${instr.operands.map(typedValue).join(", ")}`,
      );
      break;
    default: {
      const signed =
        "signed" in instr && instr.signed !== undefined
          ? instr.signed
            ? " signed"
            : " unsigned"
          : "";
      parts.push(
        `${assign}${instr.op}${signed} ${formatType(instr.type)} ${instr.operands.map(formatValue).join(", ")}`,
      );
      break;
    }
  }

  let line = parts.join("");
  if (instr.comment !== undefined && instr.op !== "alloca")
    line += `  ; ${instr.comment}`;
  return line;
}

function formatBlock(block: IrBlock): string {
  const lines = [`${block.label}:`];
  for (const instr of block.instrs) {
    lines.push(`  ${formatInstr(instr)}`);
  }
  if (
    block.instrs.length === 0 ||
    !isTerminator(block.instrs[block.instrs.length - 1]!)
  ) {
    lines.push("  ; <<< missing terminator");
  }
  return lines.join("\n");
}

/**
 * Reverse postorder from the entry block, so a reader follows control flow
 * instead of the order blocks happened to be created in. Unreachable blocks are
 * appended afterwards rather than dropped — a dump that hides them would hide
 * exactly the bugs it is there to expose.
 */
function layoutOrder(fn: IrFunction): IrBlock[] {
  const byLabel = new Map(fn.blocks.map((b) => [b.label, b]));
  const seen = new Set<string>();
  const post: IrBlock[] = [];

  const entry = fn.blocks[0];
  if (entry === undefined) return [];

  // Iterative DFS: an ST program can nest deeply enough to matter.
  const stack: Array<{ block: IrBlock; next: number }> = [
    { block: entry, next: 0 },
  ];
  seen.add(entry.label);
  while (stack.length > 0) {
    const top = stack[stack.length - 1]!;
    const succs = top.block.instrs.flatMap(successors);
    if (top.next < succs.length) {
      const label = succs[top.next++]!;
      const child = byLabel.get(label);
      if (child !== undefined && !seen.has(label)) {
        seen.add(label);
        stack.push({ block: child, next: 0 });
      }
    } else {
      post.push(top.block);
      stack.pop();
    }
  }

  const ordered = post.reverse();
  for (const b of fn.blocks) {
    if (!seen.has(b.label)) ordered.push(b);
  }
  return ordered;
}

function formatFunction(fn: IrFunction): string {
  const params = fn.params
    .map(
      (p) =>
        `${formatType(p.type)} %${p.name}${p.mode === "input" ? "" : ` !${p.mode}`}`,
    )
    .join(", ");
  const head = `define ${fn.kind} ${formatType(fn.returnType)} @${fn.name}(${params}) {`;
  return [head, ...layoutOrder(fn).map(formatBlock), "}"].join("\n");
}

export function printModule(m: IrModule): string {
  const out: string[] = [
    `; STruC++ lowered IR v${m.irVersion}`,
    `; producer: ${m.producer.name} ${m.producer.version}`,
    `module "${m.name}"`,
    "",
  ];

  for (const t of m.types) {
    out.push(`%${t.name} = type ${formatTypeBody(t.type)}`);
  }
  if (m.types.length > 0) out.push("");

  for (const g of m.globals) {
    const attrs = [
      g.constant ? "constant" : "global",
      ...(g.retain ? ["!retain"] : []),
      ...(g.located !== undefined ? [`!at ${g.located}`] : []),
    ];
    const init =
      g.initializer !== undefined ? ` = ${formatValue(g.initializer)}` : "";
    out.push(`@${g.name} = ${attrs.join(" ")} ${formatType(g.type)}${init}`);
  }
  if (m.globals.length > 0) out.push("");

  for (const fn of m.functions) {
    out.push(formatFunction(fn));
    out.push("");
  }

  return out.join("\n").replace(/\n+$/, "\n");
}

export { formatValue, formatInstr };
