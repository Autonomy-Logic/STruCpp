// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * C++ spelling of reference levels (POINTER TO, REF_TO, REFERENCE TO), shared
 * by the variable and the user-type code generators.
 */

/**
 * Wrap a C++ element type in one reference level: `IEC_Ptr<T>` for POINTER TO
 * (cross-type assignment, pointer arithmetic), `IEC_REF_TO<T>` for REF_TO
 * (explicit `^`, nullable), `IEC_REFERENCE_TO<T>` for REFERENCE TO (implicit
 * dereference, rebound with `REF=`).
 */
export function wrapReferenceLevel(kind: string, elemType: string): string {
  switch (kind) {
    case "pointer_to":
      return `IEC_Ptr<${elemType}>`;
    case "ref_to":
      return `IEC_REF_TO<${elemType}>`;
    case "reference_to":
      return `IEC_REFERENCE_TO<${elemType}>`;
    default:
      return elemType;
  }
}

/**
 * Wrap `elemType` in the given levels, innermost first, as a variable of that
 * type is declared: `["pointer_to", "ref_to"]` over `INT_t` is
 * `IEC_Ptr<IEC_REF_TO<INT_t>>`.
 */
export function wrapReferenceChain(
  chain: readonly string[],
  elemType: string,
): string {
  let result = elemType;
  for (let i = chain.length - 1; i >= 0; i--) {
    result = wrapReferenceLevel(chain[i]!, result);
  }
  return result;
}
