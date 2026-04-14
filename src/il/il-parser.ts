// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ IL Parser
 *
 * Parses IL body text into a sequence of ILInstruction objects.
 * IL is line-oriented: each line contains at most one instruction,
 * optionally preceded by a label.
 */

import type {
  ILInstruction,
  ILElement,
  ILCloseParen,
  ILOperator,
} from "./il-types.js";
import { IL_OPERATORS } from "./il-types.js";

/** Parse error from IL parsing. */
export interface ILParseError {
  message: string;
  line: number;
  column: number;
}

/** Result of parsing an IL body. */
export interface ILParseResult {
  instructions: ILElement[];
  errors: ILParseError[];
  /** Whether any labels or jump instructions were found */
  hasControlFlow: boolean;
}

/**
 * Parse IL body text into a sequence of instructions.
 *
 * @param bodyText - The raw IL body (between END_VAR and END_*)
 * @param startLine - The 1-based line number where the body starts in the original source
 */
export function parseILBody(
  bodyText: string,
  startLine: number = 1,
): ILParseResult {
  const instructions: ILElement[] = [];
  const errors: ILParseError[] = [];
  const lines = bodyText.split("\n");
  let hasControlFlow = false;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const sourceLine = startLine + i;
    let line = lines[i]!;

    // Handle multi-line comments
    if (inComment) {
      const endIdx = line.indexOf("*)");
      if (endIdx >= 0) {
        line = line.substring(endIdx + 2);
        inComment = false;
      } else {
        continue;
      }
    }

    // Strip single-line comments
    line = line.replace(/\(\*.*?\*\)/g, "");

    // Check for opening multi-line comment
    const openIdx = line.indexOf("(*");
    if (openIdx >= 0) {
      line = line.substring(0, openIdx);
      inComment = true;
    }

    line = line.trim();
    if (line.length === 0) continue;

    // Check for closing paren line: ")"
    if (/^\)\s*$/.test(line)) {
      const cp: ILCloseParen = { kind: "closeParen", sourceLine };
      instructions.push(cp);
      continue;
    }

    // Check for label: "name:" at start of line
    let label: string | undefined;
    const labelMatch = line.match(/^(\w+)\s*:\s*/);
    if (labelMatch) {
      label = labelMatch[1]!;
      line = line.substring(labelMatch[0].length).trim();

      if (label) hasControlFlow = true;

      // Label-only line (no instruction after the label)
      if (line.length === 0) {
        // Emit a placeholder — the label is attached to the next instruction
        // For now, store as an LD with no operand that gets skipped in codegen
        // Actually, we'll handle label-only lines by attaching the label
        // to the next parsed instruction. Store it for now.
        instructions.push({
          label,
          operator: "LD" as ILOperator, // placeholder — will be replaced
          operand: undefined,
          sourceLine,
          _labelOnly: true,
        } as ILInstruction & { _labelOnly?: boolean });
        continue;
      }
    }

    // Parse operator: first token
    const tokenMatch = line.match(/^(\w+)(\()?/);
    if (!tokenMatch) {
      errors.push({
        message: `Unexpected IL syntax: ${line}`,
        line: sourceLine,
        column: 1,
      });
      continue;
    }

    const operatorStr = tokenMatch[1]!.toUpperCase();
    const openParen = tokenMatch[2] === "(";

    let operator: ILOperator;
    let funcCallName: string | undefined;

    if (IL_OPERATORS.has(operatorStr)) {
      operator = operatorStr as ILOperator;
    } else {
      // Treat unrecognized identifiers as inline function calls.
      // In IL, a function name in operator position applies the function
      // to the accumulator: e.g., BCD_TO_INT → acc = BCD_TO_INT(acc)
      operator = "FUNC_CALL";
      funcCallName = tokenMatch[1]!; // preserve original case
    }

    // Track control flow operators
    if (
      operator === "JMP" ||
      operator === "JMPC" ||
      operator === "JMPCN" ||
      operator === "RET" ||
      operator === "RETC" ||
      operator === "RETCN"
    ) {
      hasControlFlow = true;
    }

    // Parse operand: everything after the operator
    const rest = line.substring(tokenMatch[0].length).trim();

    // For CAL/CALC/CALCN, parse function block call with parameters
    if (operator === "CAL" || operator === "CALC" || operator === "CALCN") {
      const instr = parseCALInstruction(operator, rest, label, sourceLine);
      if (instr) {
        instructions.push(instr);
      } else {
        errors.push({
          message: `Invalid CAL syntax: ${line}`,
          line: sourceLine,
          column: 1,
        });
      }
      continue;
    }

    // For operators that don't take operands
    if (
      operator === "NOT" ||
      operator === "RET" ||
      operator === "RETC" ||
      operator === "RETCN"
    ) {
      instructions.push({
        label,
        operator,
        operand: rest.length > 0 ? rest : undefined,
        sourceLine,
      });
      continue;
    }

    // Standard operator with operand
    const operand = rest.length > 0 ? rest : undefined;

    const instr: ILInstruction = {
      operator,
      operand,
      sourceLine,
    };
    if (label) instr.label = label;
    if (openParen) instr.openParen = true;
    if (funcCallName) instr.functionName = funcCallName;
    instructions.push(instr);
  }

  // Post-process: attach labels from label-only lines to the next instruction
  for (let i = 0; i < instructions.length - 1; i++) {
    const elem = instructions[i]!;
    if (
      "_labelOnly" in elem &&
      (elem as ILInstruction & { _labelOnly?: boolean })._labelOnly
    ) {
      const next = instructions[i + 1];
      if (next && !("kind" in next)) {
        next.label = (elem as ILInstruction).label;
      }
      instructions.splice(i, 1);
      i--; // re-examine this index
    }
  }
  // Remove any remaining label-only placeholders at the end
  while (
    instructions.length > 0 &&
    "_labelOnly" in instructions[instructions.length - 1]!
  ) {
    instructions.pop();
  }

  return { instructions, errors, hasControlFlow };
}

/**
 * Parse a CAL instruction with optional formal parameters.
 * Formats:
 *   CAL fb_name
 *   CAL fb_name(IN:=value, OUT=>var)
 */
function parseCALInstruction(
  operator: ILOperator,
  rest: string,
  label: string | undefined,
  sourceLine: number,
): ILInstruction | null {
  // Match: fb_name or fb_name(params)
  const match = rest.match(/^(\w[\w.]*)(?:\s*\((.*)\))?\s*$/);
  if (!match) return null;

  const fbName = match[1]!;
  const paramsStr = match[2];

  const callParams: ILInstruction["callParams"] = [];
  if (paramsStr) {
    // Parse comma-separated param assignments: name := value or name => var
    const params = paramsStr.split(",");
    for (const p of params) {
      const trimmed = p.trim();
      if (trimmed.length === 0) continue;

      const assignMatch = trimmed.match(/^(\w+)\s*(:=|=>)\s*(.+)$/);
      if (assignMatch) {
        callParams.push({
          name: assignMatch[1]!,
          value: assignMatch[3]!.trim(),
          isOutput: assignMatch[2] === "=>",
        });
      }
    }
  }

  const result: ILInstruction = {
    operator,
    operand: fbName,
    sourceLine,
  };
  if (label) result.label = label;
  if (callParams.length > 0) result.callParams = callParams;
  return result;
}
