// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR
 *
 * A target-independent SSA intermediate representation, sitting beside the C++
 * generator rather than in front of it. The C++ path does not import anything
 * from here and its behaviour is unchanged.
 *
 * The point of it is that a backend no longer has to understand ST. Everything
 * language-specific — name resolution, type promotion, IEC conversion rules, the
 * shape of a FOR loop — is resolved during lowering, and what comes out is a
 * typed SSA graph that a code generator, a netlist mapper or an interpreter can
 * each consume on their own terms. Adding a target means writing a consumer of
 * this IR, not a second front end.
 *
 * Typical use:
 *
 *   const { ast } = analyze(source);
 *   const { module, diagnostics } = lowerToIr(ast, { moduleName: "plant" });
 *   const problems = verifyModule(module);
 *   writeFileSync("plant.ir.json", toJson(module));
 *   console.log(printModule(module));
 */

export { IR_VERSION } from "./ir.js";
export type {
  IrArithInstr,
  IrArithOp,
  IrBitInstr,
  IrBitOp,
  IrBlock,
  IrBrInstr,
  IrCallInstr,
  IrCastInstr,
  IrCastKind,
  IrCmpInstr,
  IrCmpPred,
  IrCondBrInstr,
  IrConstValue,
  IrFbCallInstr,
  IrFunction,
  IrFunctionKind,
  IrGepInstr,
  IrGlobal,
  IrGlobalValue,
  IrInstr,
  IrLoadInstr,
  IrModule,
  IrOpcode,
  IrParam,
  IrParamValue,
  IrPhiInstr,
  IrRetInstr,
  IrSelectInstr,
  IrSourceRef,
  IrStoreInstr,
  IrTempValue,
  IrTerminator,
  IrUndefValue,
  IrUnreachableInstr,
  IrValue,
} from "./ir.js";
export {
  entryBlock,
  findBlock,
  isTerminator,
  producesValue,
  successors,
  terminatorOf,
} from "./ir.js";

export type {
  IrArrayType,
  IrBoolType,
  IrFloatBits,
  IrFloatType,
  IrIntBits,
  IrIntType,
  IrOpaqueType,
  IrPointerType,
  IrStringType,
  IrStructField,
  IrStructType,
  IrTimeType,
  IrType,
  IrVoidType,
} from "./types.js";
export {
  VOID,
  arrayOf,
  bitWidth,
  boolType,
  floatType,
  formatType,
  formatTypeBody,
  intType,
  isInteger,
  isNumeric,
  opaqueType,
  pointerTo,
  promote,
  stringType,
  structType,
  timeType,
  typesEqual,
} from "./types.js";

export { IrBuilder, constant } from "./builder.js";
export { printModule, formatInstr, formatValue } from "./printer.js";
export { IrDecodeError, fromJson, fromObject, toJson } from "./json.js";
export { formatIssues, verifyModule } from "./verify.js";
export type {
  IrIssueLocation,
  IrVerifyIssue,
  IrVerifyLevel,
  IrVerifyResult,
} from "./verify.js";
export { lowerToIr } from "./from-ast.js";
export type { LoweringDiagnostic, LoweringResult } from "./from-ast.js";

export { runPasses, PassVerificationError } from "./passes/pass.js";
export type {
  IrPass,
  PassContext,
  PassRunOptions,
  PassRunResult,
} from "./passes/pass.js";
