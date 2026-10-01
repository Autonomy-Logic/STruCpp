// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * Lower anonymous types written inside declarations to TYPE declarations.
 *
 *   state : (Idle, Running) := Idle;    →  TYPE __INLINE_ENUM_MAIN_STATE : (Idle, Running); END_TYPE
 *   level : INT(0..100) := 50;          →  TYPE __INLINE_SUBRANGE_MAIN_LEVEL : INT(0..100); END_TYPE
 *
 * The parser keeps such a type where it was written (`TypeReference.
 * inlineDefinition`), so `parse()` returns the source as the user wrote it:
 * its `types` holds only declared types. Compilation calls this once on the
 * merged unit, before semantic analysis, and from then on the declaration is
 * an ordinary use of a declared type — semantics, codegen, the debug table and
 * the project model need nothing of their own.
 *
 * Names are derived from the owning POU (or type) and the first declared
 * variable, so they are unique across a project and stable between builds.
 * IEC identifiers cannot contain `__`, so they cannot collide with user names.
 */

import type {
  CompilationUnit,
  TypeDeclaration,
  VarBlock,
  VarDeclaration,
} from "./ast.js";

function lowerDeclaration(
  decl: VarDeclaration,
  container: string,
  hoisted: TypeDeclaration[],
): void {
  const definition = decl.type.inlineDefinition;
  if (!definition) return;
  const kind =
    definition.kind === "EnumDefinition" ? "INLINE_ENUM" : "INLINE_SUBRANGE";
  const variable = decl.names[0] ?? `L${decl.sourceSpan.startLine}`;
  const name = `__${kind}_${container}_${variable}`.toUpperCase();
  hoisted.push({
    kind: "TypeDeclaration",
    sourceSpan: definition.sourceSpan,
    name,
    definition,
  });
  decl.type.name = name;
  delete decl.type.inlineDefinition;
}

function lowerBlocks(
  blocks: readonly VarBlock[],
  container: string,
  hoisted: TypeDeclaration[],
): void {
  for (const block of blocks) {
    for (const decl of block.declarations) {
      lowerDeclaration(decl, container, hoisted);
    }
  }
}

/**
 * Declare every anonymous enumeration and subrange in `unit` as a TYPE and
 * point its declaration at it. Mutates `unit`; a unit with none is untouched.
 */
export function lowerInlineTypes(unit: CompilationUnit): void {
  const hoisted: TypeDeclaration[] = [];

  for (const program of unit.programs) {
    lowerBlocks(program.varBlocks, program.name, hoisted);
  }
  for (const fn of unit.functions) {
    lowerBlocks(fn.varBlocks, fn.name, hoisted);
  }
  for (const fb of unit.functionBlocks) {
    lowerBlocks(fb.varBlocks, fb.name, hoisted);
    for (const method of fb.methods) {
      lowerBlocks(method.varBlocks, `${fb.name}_${method.name}`, hoisted);
    }
  }
  for (const iface of unit.interfaces) {
    for (const method of iface.methods) {
      lowerBlocks(method.varBlocks, `${iface.name}_${method.name}`, hoisted);
    }
  }
  for (const config of unit.configurations) {
    lowerBlocks(config.varBlocks, config.name, hoisted);
  }
  lowerBlocks(unit.globalVarBlocks, "GLOBAL", hoisted);
  for (const type of unit.types) {
    if (type.definition.kind === "StructDefinition") {
      for (const field of type.definition.fields) {
        lowerDeclaration(field, type.name, hoisted);
      }
    }
  }

  unit.types.push(...hoisted);
}
