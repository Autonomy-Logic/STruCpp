// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * The class hierarchy of a function block: the block and its EXTENDS chain,
 * resolved through the compilation unit first and then the libraries.
 *
 * Every pass that reasons about inherited members or methods walks the chain
 * through these helpers, so they agree on lookup order and on how an unknown
 * base or an EXTENDS cycle ends the walk.
 */

import type {
  CompilationUnit,
  FunctionBlockDeclaration,
} from "../frontend/ast.js";
import type { SymbolTables } from "./symbol-table.js";

/** Resolves a function block by name, in any case. */
export type FunctionBlockLookup = (
  name: string,
) => FunctionBlockDeclaration | undefined;

/** Blocks of `ast` first, then blocks the symbol tables know (libraries). */
export function functionBlockLookup(
  ast: CompilationUnit | undefined,
  symbolTables: SymbolTables | undefined,
): FunctionBlockLookup {
  const local = new Map(
    (ast?.functionBlocks ?? []).map((fb) => [fb.name.toUpperCase(), fb]),
  );
  return (name) => {
    const upper = name.toUpperCase();
    return (
      local.get(upper) ?? symbolTables?.lookupFunctionBlock(upper)?.declaration
    );
  };
}

/**
 * The block named `name` followed by its bases, nearest first. Ends at a base
 * the lookup cannot resolve or at the first repeated block of a cycle.
 */
export function fbLineage(
  name: string,
  lookup: FunctionBlockLookup,
): FunctionBlockDeclaration[] {
  const chain: FunctionBlockDeclaration[] = [];
  const seen = new Set<string>();
  let current: string | undefined = name;
  while (current !== undefined && !seen.has(current.toUpperCase())) {
    seen.add(current.toUpperCase());
    const decl = lookup(current);
    if (decl === undefined) break;
    chain.push(decl);
    current = decl.extends;
  }
  return chain;
}

/** Upper-cased names of {@link fbLineage}. */
export function fbLineageNames(
  name: string,
  lookup: FunctionBlockLookup,
): string[] {
  return fbLineage(name, lookup).map((fb) => fb.name.toUpperCase());
}
