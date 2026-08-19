// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Pass infrastructure
 *
 * A module-to-module transform and a runner to sequence them, in the spirit of
 * LLVM's legacy PassManager. Deliberately minimal: no analysis caching, no
 * dependency resolution, no pass registry. Those earn their place once there are
 * enough passes to need them; today the value is a uniform shape and a runner
 * that verifies between steps so a broken pass is caught at its own boundary
 * rather than three passes later.
 *
 * A pass takes a module and returns a module. It may mutate in place and return
 * the same reference, or build a new one — the runner does not care. What it must
 * not do is leave the module unverifiable: the runner checks after every pass
 * when asked, which is the whole point of running them through here rather than
 * calling them by hand.
 */

import type { IrModule } from "../ir.js";
import { formatIssues, verifyModule, type IrVerifyLevel } from "../verify.js";

export interface PassContext {
  /** Emitted by a pass to report what it did. Surfaced by the runner in verbose mode. */
  note(message: string): void;
}

export interface IrPass {
  readonly name: string;
  run(module: IrModule, ctx: PassContext): IrModule;
}

export interface PassRunOptions {
  /** Verify the module after each pass. Default true — the reason to use the runner. */
  verifyAfterEach?: boolean;
  /** Level for the between-pass checks. "ssa" until the flattening passes land. */
  verifyLevel?: IrVerifyLevel;
  /** Collect per-pass notes. */
  verbose?: boolean;
}

export interface PassRunResult {
  module: IrModule;
  notes: Array<{ pass: string; message: string }>;
}

export class PassVerificationError extends Error {
  constructor(
    readonly pass: string,
    readonly issues: string,
  ) {
    super(`pass '${pass}' produced an invalid module:\n${issues}`);
    this.name = "PassVerificationError";
  }
}

/**
 * Run a pipeline. Verifies after each pass by default; a pass that breaks the IR
 * is reported against its own name, not blamed on a later one.
 */
export function runPasses(
  module: IrModule,
  passes: readonly IrPass[],
  options: PassRunOptions = {},
): PassRunResult {
  const verifyAfterEach = options.verifyAfterEach ?? true;
  const level: IrVerifyLevel = options.verifyLevel ?? "ssa";
  const notes: Array<{ pass: string; message: string }> = [];

  let current = module;
  for (const pass of passes) {
    const ctx: PassContext = {
      note: (message) => {
        if (options.verbose === true) notes.push({ pass: pass.name, message });
      },
    };
    current = pass.run(current, ctx);

    if (verifyAfterEach) {
      const verdict = verifyModule(current, level);
      if (!verdict.ok) {
        throw new PassVerificationError(pass.name, formatIssues(verdict));
      }
    }
  }

  return { module: current, notes };
}
