// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Instruction List (IL) — Type Definitions
 *
 * Defines the intermediate representation for IL instructions used by
 * the IL→ST transpiler pipeline.
 */

/** IL operator keywords (case-insensitive in source, stored uppercase). */
export type ILOperator =
  // Load / Store
  | "LD"
  | "LDN"
  | "ST"
  | "STN"
  // Boolean
  | "AND"
  | "ANDN"
  | "OR"
  | "ORN"
  | "XOR"
  | "XORN"
  | "NOT"
  // Arithmetic
  | "ADD"
  | "SUB"
  | "MUL"
  | "DIV"
  | "MOD"
  // Comparison
  | "EQ"
  | "NE"
  | "GT"
  | "GE"
  | "LT"
  | "LE"
  // Control flow
  | "JMP"
  | "JMPC"
  | "JMPCN"
  | "RET"
  | "RETC"
  | "RETCN"
  // Function block calls
  | "CAL"
  | "CALC"
  | "CALCN"
  // Set / Reset
  | "S"
  | "R";

/** Set of all valid IL operator strings for quick lookup. */
export const IL_OPERATORS = new Set<string>([
  "LD",
  "LDN",
  "ST",
  "STN",
  "AND",
  "ANDN",
  "OR",
  "ORN",
  "XOR",
  "XORN",
  "NOT",
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "MOD",
  "EQ",
  "NE",
  "GT",
  "GE",
  "LT",
  "LE",
  "JMP",
  "JMPC",
  "JMPCN",
  "RET",
  "RETC",
  "RETCN",
  "CAL",
  "CALC",
  "CALCN",
  "S",
  "R",
]);

/** A single parsed IL instruction. */
export interface ILInstruction {
  /** Optional label preceding this instruction (e.g., "loop_start") */
  label?: string | undefined;
  /** The IL operator */
  operator: ILOperator;
  /** Optional operand (variable name, literal, label name for jumps) */
  operand?: string | undefined;
  /** For CAL: formal parameter assignments */
  callParams?: Array<{ name: string; value: string; isOutput: boolean }>;
  /** Opening parenthesis after operator: e.g., AND( */
  openParen?: boolean | undefined;
  /** Line number in the original IL source */
  sourceLine: number;
}

/** Closing parenthesis pseudo-instruction. */
export interface ILCloseParen {
  kind: "closeParen";
  sourceLine: number;
}

/** A parsed element is either an instruction or a closing paren. */
export type ILElement = (ILInstruction & { kind?: undefined }) | ILCloseParen;

/** A POU region identified in the source text. */
export interface POURegion {
  /** Start offset in the original source (byte index of POU keyword) */
  startOffset: number;
  /** End offset (byte index after END_*) */
  endOffset: number;
  /** The POU header text (from POU keyword through the last END_VAR) */
  headerText: string;
  /** The body text (between last END_VAR and closing keyword) */
  bodyText: string;
  /** The closing keyword text (END_FUNCTION_BLOCK, END_PROGRAM, etc.) */
  closingText: string;
  /** Start line of the body in the original source (1-based) */
  bodyStartLine: number;
  /** Whether this body was detected as IL */
  isIL: boolean;
}

/** Result of the IL transpilation process. */
export interface ILTranspileResult {
  /** Whether any IL was detected and transpiled */
  hasIL: boolean;
  /** The output source (ST, with IL bodies replaced) */
  stSource: string;
  /** Transpilation errors */
  errors: Array<{
    message: string;
    line: number;
    column: number;
    severity: "error" | "warning";
    file?: string | undefined;
  }>;
  /** Source map: original IL line → generated ST line */
  sourceMap?: Map<number, number>;
}
