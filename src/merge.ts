/**
 * STruC++ AST Merge Utility
 *
 * Merges multiple CompilationUnits (from separate ST source files)
 * into a single CompilationUnit for unified semantic analysis and codegen.
 */

import type { CompilationUnit } from "./frontend/ast.js";
import { createCompilationUnit } from "./frontend/ast.js";

/**
 * Merge multiple CompilationUnits into a single unit.
 * Concatenates all programs, functions, function blocks, types, and configurations.
 * Duplicate detection is deferred to semantic analysis.
 */
export function mergeCompilationUnits(
  units: CompilationUnit[],
): CompilationUnit {
  if (units.length === 0) {
    return createCompilationUnit();
  }

  if (units.length === 1) {
    return units[0]!;
  }

  const merged = createCompilationUnit();

  for (const unit of units) {
    merged.programs.push(...unit.programs);
    merged.functions.push(...unit.functions);
    merged.functionBlocks.push(...unit.functionBlocks);
    merged.interfaces.push(...unit.interfaces);
    merged.types.push(...unit.types);
    merged.configurations.push(...unit.configurations);
  }

  // Use the source span from the first unit
  merged.sourceSpan = units[0]!.sourceSpan;

  return merged;
}
