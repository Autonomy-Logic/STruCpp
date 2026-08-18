// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Type Default Propagation
 *
 * IEC 61131-3 Annex B.1.3.3 lets a TYPE declaration carry its own default
 * value — `initialized_simple_type_declaration`, `initialized_structure` and
 * `initialized_array_type_declaration`:
 *
 *   TYPE
 *     Setpoint : REAL := 25.0;
 *     Origin   : Point := (x := 0.0, y := 0.0);
 *     Light    : (RED, GREEN) := GREEN;
 *   END_TYPE
 *
 * Every declaration of such a type that does not supply its own initialiser
 * starts from the type's default. Rather than teaching each of the many
 * declaration paths (globals, PROGRAM/FB/FUNCTION locals, struct fields …) about
 * type defaults, this single pass copies the default onto those declarations
 * right after the AST is built, so every downstream consumer — semantic
 * analysis, the project model, codegen — sees an ordinary initialiser.
 */

import type {
  CompilationUnit,
  Expression,
  VarBlock,
  VarDeclaration,
} from "./ast.js";
import { walkAST } from "../ast-utils.js";

/** Guard against a cyclic alias chain (`TYPE A : B; B : A; END_TYPE`). */
const MAX_ALIAS_DEPTH = 32;

/**
 * Copy TYPE-level default values onto every declaration of those types that
 * lacks its own initialiser. Mutates `unit` in place.
 *
 * Idempotent: a declaration that already has an initialiser is never touched,
 * so running the pass again (for instance on a merged multi-file unit) is safe.
 */
export function applyTypeDefaults(unit: CompilationUnit): void {
  const defaults = new Map<string, Expression>();
  /** Alias target of each type, for chains like `Celsius : Setpoint;`. */
  const aliasTargets = new Map<string, string>();

  for (const td of unit.types) {
    const key = td.name.toUpperCase();
    if (td.defaultValue) defaults.set(key, td.defaultValue);
    if (td.definition.kind === "TypeReference") {
      aliasTargets.set(key, td.definition.name.toUpperCase());
    }
  }
  if (defaults.size === 0) return;

  walkAST(unit, (node): boolean => {
    // VAR_EXTERNAL names a global declared elsewhere and VAR_IN_OUT is bound by
    // the caller; neither owns storage to initialise.
    if (node.kind === "VarBlock") {
      const block = node as VarBlock;
      return (
        block.blockType !== "VAR_EXTERNAL" && block.blockType !== "VAR_IN_OUT"
      );
    }
    if (node.kind !== "VarDeclaration") return true;

    const decl = node as VarDeclaration;
    // A reference binds to existing storage — it has no value of its own.
    if (
      decl.initialValue === undefined &&
      (!decl.type.referenceKind || decl.type.referenceKind === "none")
    ) {
      const defaultValue = resolveDefault(
        decl.type.name,
        defaults,
        aliasTargets,
      );
      if (defaultValue) decl.initialValue = defaultValue;
    }
    return true;
  });
}

/**
 * Find the default for `typeName`, following alias chains until one is found.
 */
function resolveDefault(
  typeName: string,
  defaults: Map<string, Expression>,
  aliasTargets: Map<string, string>,
): Expression | undefined {
  let current = typeName.toUpperCase();
  for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth++) {
    const own = defaults.get(current);
    if (own !== undefined) return own;
    const target = aliasTargets.get(current);
    if (target === undefined || target === current) return undefined;
    current = target;
  }
  return undefined;
}
