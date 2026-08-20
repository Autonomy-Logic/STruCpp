// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — standard pipelines
 *
 * Named sequences of passes. Two today:
 *
 *   - `ssaPipeline`: lower to memory then promote to SSA. Leaves control flow
 *     intact. This is what `--emit-ir` emits: a faithful SSA view of the program.
 *   - `flatPipeline`: everything needed to reach the flat profile a netlist or
 *     FBD backend consumes. This is what `--emit-ir --flat` emits.
 *
 * The flat pipeline runs constant folding and DCE more than once, because inlining
 * and flattening each expose fresh constants and dead values. That repetition is
 * cheap and keeps the emitted IR — and the block-budget estimate taken from it —
 * honest.
 *
 * Inlining, devirtualisation, unrolling and scalarisation are listed here in
 * their intended slots; the ones not yet implemented are omitted from the array
 * rather than stubbed, so the pipeline always reflects what actually runs.
 */

import type { IrPass } from "./pass.js";
import { mem2reg } from "./mem2reg.js";
import { constFold } from "./constfold.js";
import { dce } from "./dce.js";
import { flatten } from "./flatten.js";
import { schedule } from "./schedule.js";

/** SSA view: memory promoted, control flow intact. */
export const ssaPipeline: readonly IrPass[] = [mem2reg, constFold, dce];

/**
 * Flat view: the whole reduction to a single block per function.
 *
 * Intended full order, with unimplemented passes marked. As inline (2.3),
 * devirtualise (2.4), unroll (2.6) and scalarise (2.7) land, they slot in ahead
 * of flatten:
 *
 *   mem2reg -> [inline -> devirtualise ->] constfold -> [unroll -> scalarise ->]
 *              dce -> flatten -> schedule -> dce
 */
export const flatPipeline: readonly IrPass[] = [
  mem2reg,
  constFold,
  dce,
  flatten,
  schedule,
  dce,
];

/** Verification level a pipeline's output should satisfy. */
export function pipelineLevel(name: "ssa" | "flat"): "ssa" | "flat" {
  return name;
}
