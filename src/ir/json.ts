// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Serialization
 *
 * The wire format between STruC++ and an out-of-tree backend. JSON, because the
 * volume is small, it diffs cleanly in review, and a fixture can be hand-written
 * when the producer does not exist yet.
 *
 * The IR data model is already plain data — no classes, no cycles — so
 * serializing is a stringify. Reading back is where the work is: a document from
 * a different STruC++ release must be rejected on sight rather than
 * misinterpreted, because a silent schema drift between two independently
 * versioned repositories is the one failure this boundary introduces.
 */

import { IR_VERSION, type IrModule } from "./ir.js";

export class IrDecodeError extends Error {}

export function toJson(m: IrModule, opts: { pretty?: boolean } = {}): string {
  return JSON.stringify(m, undefined, opts.pretty === false ? undefined : 2);
}

export function fromJson(text: string): IrModule {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new IrDecodeError(`not valid JSON: ${(e as Error).message}`);
  }
  return fromObject(raw);
}

export function fromObject(raw: unknown): IrModule {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new IrDecodeError("IR must be a JSON object");
  }
  const doc = raw as Partial<IrModule>;

  if (typeof doc.irVersion !== "number") {
    throw new IrDecodeError("missing irVersion");
  }
  if (doc.irVersion !== IR_VERSION) {
    throw new IrDecodeError(
      `IR version ${doc.irVersion} cannot be read by this build, which speaks version ${IR_VERSION}`,
    );
  }
  if (typeof doc.name !== "string")
    throw new IrDecodeError("missing module name");
  if (
    typeof doc.producer !== "object" ||
    doc.producer === null ||
    typeof doc.producer.name !== "string" ||
    typeof doc.producer.version !== "string"
  ) {
    throw new IrDecodeError("missing or malformed producer");
  }
  for (const field of ["types", "globals", "functions"] as const) {
    if (!Array.isArray(doc[field])) throw new IrDecodeError(`missing ${field}`);
  }

  // Structural checks stop here on purpose. Semantic well-formedness is the
  // verifier's job, and a consumer should run it rather than trusting the
  // producer — see verify.ts.
  return doc as IrModule;
}
