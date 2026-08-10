// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Structure Initializer Code Generation
 *
 * Lowers IEC 61131-3 `structure_initialization` (Annex B.1.4.3) to C++17.
 *
 *   p : Point := (y := 2.0, x := 1.0);
 *
 *   strucpp::iec_struct_init<POINT>([](auto& v0) { v0.Y = 2.0; v0.X = 1.0; })
 *
 * Elements may be written in any order and may be omitted (an omitted element
 * keeps the default from its own declaration), which rules out a plain braced
 * aggregate initializer — C++17 has no designated initializers. The runtime
 * helper default-constructs the value and the lambda overwrites exactly the
 * elements the initializer names.
 *
 * Nested levels take their type from the member being assigned
 * (`decltype(v0.INNER)`) rather than from resolved metadata, so this works
 * unchanged for library types and inline array members.
 *
 * Shared by `codegen.ts` (variable declarations) and `type-codegen.ts` (STRUCT
 * element defaults) through the {@link StructInitEmitter} hooks, so there is one
 * lowering for structure initializers regardless of where they appear.
 */

import type {
  Expression,
  StructInitializerExpression,
} from "../frontend/ast.js";

/**
 * Host-supplied hooks. `codegen.ts` wires these to its full type resolution;
 * `type-codegen.ts`, which has no AST, supplies only what it knows.
 */
export interface StructInitEmitter {
  /** Emit C++ for a value that is neither a structure initializer nor an array literal. */
  emitValue(value: Expression): string;
  /**
   * C++ member name for `fieldName` on structure/FB type `ownerTypeName`,
   * including the `_` collision mangle generated members may carry.
   */
  memberName(fieldName: string, ownerTypeName: string | undefined): string;
  /** ST type name of `fieldName` on `ownerTypeName`, when resolvable. */
  fieldTypeName(
    fieldName: string,
    ownerTypeName: string | undefined,
  ): string | undefined;
  /** ST element type of the array type `typeName`, when resolvable. */
  arrayElementTypeName(typeName: string | undefined): string | undefined;
}

/**
 * Emit C++ for a declaration initialiser.
 *
 * `cppTypeExpr` is a C++ type expression for the value being initialised — a
 * type name at the top level, a `decltype(...)` further down. It is only needed
 * for structure initializers; scalar and array-of-scalar initialisers ignore it.
 * `stTypeName` is the corresponding ST type name, used to resolve element names
 * and nested element types.
 */
export function generateInitializerValue(
  value: Expression,
  cppTypeExpr: string | undefined,
  stTypeName: string | undefined,
  emitter: StructInitEmitter,
  depth = 0,
): string {
  if (value.kind === "StructInitializerExpression") {
    return generateStructInitializer(
      value,
      cppTypeExpr,
      stTypeName,
      emitter,
      depth,
    );
  }

  if (value.kind === "ArrayLiteralExpression") {
    // `typename <array type>::element_type` names the element type of every
    // Array1D/2D/3D, so an array of STRUCTs needs no metadata lookup.
    const elementCppType =
      cppTypeExpr !== undefined && cppTypeExpr !== ""
        ? `typename ${cppTypeExpr}::element_type`
        : undefined;
    const elementStType = emitter.arrayElementTypeName(stTypeName);
    const elements = value.elements.map((element) =>
      generateInitializerValue(
        element,
        elementCppType,
        elementStType,
        emitter,
        depth,
      ),
    );
    return `{${elements.join(", ")}}`;
  }

  return emitter.emitValue(value);
}

/**
 * Emit `strucpp::iec_struct_init<T>([](auto& vN) { … })` for one structure
 * initializer level.
 *
 * Without a usable `cppTypeExpr` there is no type to construct, so the
 * initializer degrades to value-initialisation rather than emitting code that
 * would not compile.
 */
function generateStructInitializer(
  expr: StructInitializerExpression,
  cppTypeExpr: string | undefined,
  stTypeName: string | undefined,
  emitter: StructInitEmitter,
  depth: number,
): string {
  if (
    cppTypeExpr === undefined ||
    cppTypeExpr === "" ||
    expr.elements.length === 0
  ) {
    return "{}";
  }

  const target = `v${depth}`;
  const assignments = expr.elements.map((element) => {
    const member = `${target}.${emitter.memberName(element.name, stTypeName)}`;
    const memberStType = emitter.fieldTypeName(element.name, stTypeName);
    const rhs = generateInitializerValue(
      element.value,
      `decltype(${member})`,
      memberStType,
      emitter,
      depth + 1,
    );
    return `${member} = ${rhs};`;
  });

  return `strucpp::iec_struct_init<${cppTypeExpr}>([](auto& ${target}) { ${assignments.join(" ")} })`;
}

/**
 * True when `value` needs {@link generateInitializerValue} rather than the plain
 * expression path — i.e. it is (or contains) a structure initializer, whose
 * lowering needs the target's C++ type.
 */
export function isStructInitializerValue(value: Expression): boolean {
  if (value.kind === "StructInitializerExpression") return true;
  if (value.kind === "ArrayLiteralExpression") {
    return value.elements.some(isStructInitializerValue);
  }
  return false;
}
