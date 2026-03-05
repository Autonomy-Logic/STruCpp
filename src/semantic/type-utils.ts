// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Shared Type Utilities
 *
 * Single source of truth for IEC 61131-3 type data, compatibility logic,
 * and member resolution. Pure functions and constant data — no classes, no state.
 *
 * Consolidates type information previously duplicated across:
 * - type-checker.ts (ELEMENTARY_TYPES, TYPE_CATEGORIES, areTypesCompatible)
 * - analyzer.ts (IEC_TYPE_BITS, resolveStructFieldType, resolveArrayElementType)
 * - codegen.ts (IEC_TYPE_BITS, IEC_TYPE_CAT, canImplicitWiden, resolveMemberType)
 */

import type {
  IECType,
  ElementaryType,
  CompilationUnit,
  ReferenceType,
  StructType,
  EnumType,
  FunctionBlockType,
} from "../frontend/ast.js";
import type { TypeConstraint } from "./std-function-registry.js";

// =============================================================================
// Elementary Type Data
// =============================================================================

/**
 * Built-in elementary types with their properties.
 */
export const ELEMENTARY_TYPES: Record<string, ElementaryType> = {
  BOOL: { typeKind: "elementary", name: "BOOL", sizeBits: 1 },
  BYTE: { typeKind: "elementary", name: "BYTE", sizeBits: 8 },
  WORD: { typeKind: "elementary", name: "WORD", sizeBits: 16 },
  DWORD: { typeKind: "elementary", name: "DWORD", sizeBits: 32 },
  LWORD: { typeKind: "elementary", name: "LWORD", sizeBits: 64 },
  SINT: { typeKind: "elementary", name: "SINT", sizeBits: 8 },
  INT: { typeKind: "elementary", name: "INT", sizeBits: 16 },
  DINT: { typeKind: "elementary", name: "DINT", sizeBits: 32 },
  LINT: { typeKind: "elementary", name: "LINT", sizeBits: 64 },
  USINT: { typeKind: "elementary", name: "USINT", sizeBits: 8 },
  UINT: { typeKind: "elementary", name: "UINT", sizeBits: 16 },
  UDINT: { typeKind: "elementary", name: "UDINT", sizeBits: 32 },
  ULINT: { typeKind: "elementary", name: "ULINT", sizeBits: 64 },
  REAL: { typeKind: "elementary", name: "REAL", sizeBits: 32 },
  LREAL: { typeKind: "elementary", name: "LREAL", sizeBits: 64 },
  TIME: { typeKind: "elementary", name: "TIME", sizeBits: 64 },
  DATE: { typeKind: "elementary", name: "DATE", sizeBits: 64 },
  TIME_OF_DAY: { typeKind: "elementary", name: "TIME_OF_DAY", sizeBits: 64 },
  DATE_AND_TIME: {
    typeKind: "elementary",
    name: "DATE_AND_TIME",
    sizeBits: 64,
  },
  // Aliases
  TOD: { typeKind: "elementary", name: "TOD", sizeBits: 64 },
  DT: { typeKind: "elementary", name: "DT", sizeBits: 64 },
  // Variable-width string types — 0 is correct (no fixed bit width)
  STRING: { typeKind: "elementary", name: "STRING", sizeBits: 0 },
  WSTRING: { typeKind: "elementary", name: "WSTRING", sizeBits: 0 },
};

// =============================================================================
// Type Categories
// =============================================================================

/**
 * Type category for IEC 61131-3 generic types.
 */
export type TypeCategory =
  | "ANY"
  | "ANY_DERIVED"
  | "ANY_ELEMENTARY"
  | "ANY_MAGNITUDE"
  | "ANY_NUM"
  | "ANY_REAL"
  | "ANY_INT"
  | "ANY_BIT"
  | "ANY_STRING"
  | "ANY_DATE";

/**
 * Map of type names to their categories.
 */
export const TYPE_CATEGORIES: Record<string, TypeCategory[]> = {
  BOOL: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  BYTE: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  WORD: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  DWORD: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  LWORD: ["ANY", "ANY_ELEMENTARY", "ANY_BIT"],
  SINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  INT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  DINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  LINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  USINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  UINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  UDINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  ULINT: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_INT"],
  REAL: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_REAL"],
  LREAL: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_NUM", "ANY_REAL"],
  TIME: ["ANY", "ANY_ELEMENTARY", "ANY_MAGNITUDE", "ANY_DATE"],
  DATE: ["ANY", "ANY_ELEMENTARY", "ANY_DATE"],
  TIME_OF_DAY: ["ANY", "ANY_ELEMENTARY", "ANY_DATE"],
  DATE_AND_TIME: ["ANY", "ANY_ELEMENTARY", "ANY_DATE"],
  STRING: ["ANY", "ANY_ELEMENTARY", "ANY_STRING"],
  WSTRING: ["ANY", "ANY_ELEMENTARY", "ANY_STRING"],
};

/**
 * Widening category groups for implicit conversion checks.
 * Types in the same group can be widened to a wider type in the same group.
 */
const WIDENING_CATEGORY: Record<string, string> = {
  BOOL: "BIT",
  BYTE: "BIT",
  WORD: "BIT",
  DWORD: "BIT",
  LWORD: "BIT",
  SINT: "SINT",
  INT: "SINT",
  DINT: "SINT",
  LINT: "SINT",
  USINT: "UINT",
  UINT: "UINT",
  UDINT: "UINT",
  ULINT: "UINT",
  REAL: "REAL",
  LREAL: "REAL",
};

// =============================================================================
// Type Data Accessors
// =============================================================================

/**
 * Get the bit width of an IEC elementary type by name.
 * Returns undefined for non-elementary or unknown types.
 */
export function getTypeBits(name: string): number | undefined {
  return ELEMENTARY_TYPES[name.toUpperCase()]?.sizeBits;
}

/** Types that support bit access (integer and bit types only — not REAL/LREAL). */
const BIT_ACCESSIBLE_TYPES: Record<string, number> = {
  BOOL: 1,
  BYTE: 8,
  WORD: 16,
  DWORD: 32,
  LWORD: 64,
  SINT: 8,
  INT: 16,
  DINT: 32,
  LINT: 64,
  USINT: 8,
  UINT: 16,
  UDINT: 32,
  ULINT: 64,
};

/**
 * Get the bit width for bit access validation.
 * Returns undefined for types that don't support bit access (REAL, STRING, etc.).
 */
export function getBitAccessWidth(name: string): number | undefined {
  return BIT_ACCESSIBLE_TYPES[name.toUpperCase()];
}

/**
 * Get the primary widening category for an IEC type.
 * Returns "BIT", "SINT", "UINT", or "REAL" — or undefined for non-elementary types.
 */
export function getTypeCategory(name: string): string | undefined {
  return WIDENING_CATEGORY[name.toUpperCase()];
}

// =============================================================================
// Category Matching
// =============================================================================

/**
 * Check if a type belongs to a given IEC type category.
 */
export function isTypeInCategory(
  type: IECType,
  category: TypeCategory,
): boolean {
  if (type.typeKind !== "elementary") {
    return category === "ANY" || category === "ANY_DERIVED";
  }

  const elemType = type as ElementaryType;
  const categories = TYPE_CATEGORIES[elemType.name];
  return categories?.includes(category) ?? false;
}

/**
 * Check if a type name matches a StdFunctionRegistry TypeConstraint.
 */
export function matchesConstraint(
  typeName: string,
  constraint: TypeConstraint,
): boolean {
  const upper = typeName.toUpperCase();

  // "specific" constraints are checked by the caller against specificType
  if (constraint === "specific") return true;

  // "BOOL" is a special single-type constraint
  if (constraint === "BOOL") return upper === "BOOL";

  // Map constraint to TypeCategory and check membership
  const elem = ELEMENTARY_TYPES[upper];
  if (!elem) {
    // Non-elementary types match ANY and ANY_DERIVED
    return constraint === "ANY" || (constraint as string) === "ANY_DERIVED";
  }

  const categories = TYPE_CATEGORIES[upper];
  if (!categories) return constraint === "ANY";

  // TypeConstraint values map directly to TypeCategory values
  return categories.includes(constraint as TypeCategory);
}

// =============================================================================
// Type Compatibility
// =============================================================================

/**
 * Check if a source type can be assigned to a target type.
 * Allows same type, widening conversions within numeric types,
 * and cross-category promotions (BIT→INT, INT→REAL).
 */
export function isAssignable(target: IECType, source: IECType): boolean {
  // Same typeKind check
  if (target.typeKind !== source.typeKind) {
    // Allow elementary-to-elementary only
    if (target.typeKind !== "elementary" || source.typeKind !== "elementary") {
      return false;
    }
  }

  if (target.typeKind === "elementary" && source.typeKind === "elementary") {
    const t = target as ElementaryType;
    const s = source as ElementaryType;

    // Same type is always assignable
    if (t.name === s.name) return true;

    // Use implicit conversion check (includes widening + cross-category)
    return isImplicitlyConvertible(s.name, t.name);
  }

  // For reference types, check referenced type compatibility
  if (target.typeKind === "reference" && source.typeKind === "reference") {
    const tRef = target as ReferenceType;
    const sRef = source as ReferenceType;
    return isAssignable(tRef.referencedType, sRef.referencedType);
  }

  // For other types (struct, array, FB), require exact match
  return JSON.stringify(target) === JSON.stringify(source);
}

/**
 * Check if a source type name can be implicitly converted to a target type name.
 * Covers CODESYS rules:
 * - Same-category widening (BYTE→DWORD, INT→DINT, REAL→LREAL)
 * - BIT→INT crossover (BYTE→INT, WORD→DINT)
 * - Integer/BIT→REAL promotion (INT→REAL, BYTE→REAL)
 */
export function isImplicitlyConvertible(
  source: string,
  target: string,
): boolean {
  const s = source.toUpperCase();
  const t = target.toUpperCase();
  if (s === t) return true;

  const sBits = ELEMENTARY_TYPES[s]?.sizeBits;
  const tBits = ELEMENTARY_TYPES[t]?.sizeBits;
  const sCat = WIDENING_CATEGORY[s];
  const tCat = WIDENING_CATEGORY[t];

  if (sBits === undefined || tBits === undefined || !sCat || !tCat)
    return false;

  // Same category, wider target
  if (sCat === tCat && tBits >= sBits) return true;

  // BIT → signed/unsigned integer (CODESYS: BYTE→INT)
  if (sCat === "BIT" && (tCat === "SINT" || tCat === "UINT") && tBits >= sBits)
    return true;

  // Integer/unsigned → BIT (CODESYS: INT→DWORD when target is wide enough)
  if ((sCat === "SINT" || sCat === "UINT") && tCat === "BIT" && tBits >= sBits)
    return true;

  // Integer/unsigned/BIT → REAL promotion
  if (
    (sCat === "SINT" || sCat === "UINT" || sCat === "BIT") &&
    tCat === "REAL" &&
    tBits >= sBits
  )
    return true;

  return false;
}

/**
 * Check if converting from source to target is a narrowing conversion.
 * A narrowing conversion loses precision or changes the value range.
 */
export function isNarrowingConversion(target: string, source: string): boolean {
  const s = source.toUpperCase();
  const t = target.toUpperCase();
  if (s === t) return false;

  const sBits = ELEMENTARY_TYPES[s]?.sizeBits;
  const tBits = ELEMENTARY_TYPES[t]?.sizeBits;
  const sCat = WIDENING_CATEGORY[s];
  const tCat = WIDENING_CATEGORY[t];

  if (sBits === undefined || tBits === undefined || !sCat || !tCat)
    return false;

  // Same category, narrower target
  if (sCat === tCat && tBits < sBits) return true;

  // REAL → INT is always narrowing
  if (sCat === "REAL" && (tCat === "SINT" || tCat === "UINT" || tCat === "BIT"))
    return true;

  // Signed ↔ Unsigned of same width is narrowing (different value range)
  if (
    ((sCat === "SINT" && tCat === "UINT") ||
      (sCat === "UINT" && tCat === "SINT")) &&
    tBits <= sBits
  )
    return true;

  // INT → BIT is narrowing when target is smaller
  if ((sCat === "SINT" || sCat === "UINT") && tCat === "BIT" && tBits <= sBits)
    return true;

  // BIT → INT narrowing when target is smaller
  if (sCat === "BIT" && (tCat === "SINT" || tCat === "UINT") && tBits < sBits)
    return true;

  // INT/UINT → REAL is narrowing when target bits < source bits (e.g., ULINT→REAL)
  if (
    (sCat === "SINT" || sCat === "UINT" || sCat === "BIT") &&
    tCat === "REAL" &&
    tBits < sBits
  )
    return true;

  return false;
}

/**
 * Get the common (wider) type for binary expressions.
 * Returns undefined if the types are incompatible for arithmetic.
 */
export function getCommonType(a: IECType, b: IECType): IECType | undefined {
  if (a.typeKind !== "elementary" || b.typeKind !== "elementary") {
    return undefined;
  }

  const aElem = a as ElementaryType;
  const bElem = b as ElementaryType;

  // Same type
  if (aElem.name === bElem.name) return a;

  const aCat = WIDENING_CATEGORY[aElem.name];
  const bCat = WIDENING_CATEGORY[bElem.name];
  if (!aCat || !bCat) return undefined;

  // REAL types are wider than INT types
  if (aElem.name === "LREAL" || bElem.name === "LREAL") {
    return ELEMENTARY_TYPES["LREAL"];
  }
  if (aElem.name === "REAL" || bElem.name === "REAL") {
    return ELEMENTARY_TYPES["REAL"];
  }

  // Use canonical bit widths from ELEMENTARY_TYPES
  const aBits = ELEMENTARY_TYPES[aElem.name]?.sizeBits ?? aElem.sizeBits;
  const bBits = ELEMENTARY_TYPES[bElem.name]?.sizeBits ?? bElem.sizeBits;

  // Both must be in compatible numeric categories
  const aCategories = TYPE_CATEGORIES[aElem.name];
  const bCategories = TYPE_CATEGORIES[bElem.name];
  if (!aCategories || !bCategories) return undefined;

  const aIsNum = aCategories.includes("ANY_NUM");
  const bIsNum = bCategories.includes("ANY_NUM");
  const aIsBit = aCategories.includes("ANY_BIT");
  const bIsBit = bCategories.includes("ANY_BIT");

  // Both numeric → return the wider one
  if (aIsNum && bIsNum) {
    return aBits >= bBits ? a : b;
  }

  // BIT + NUM → promote BIT to the numeric type (or wider)
  if (aIsBit && bIsNum) return b;
  if (bIsBit && aIsNum) return a;

  // Both BIT → return wider
  if (aIsBit && bIsBit) {
    return aBits >= bBits ? a : b;
  }

  return undefined;
}

// =============================================================================
// Member Resolution
// =============================================================================

/**
 * Resolve the type of a struct or FB field by looking up the type definition in the AST.
 */
export function resolveFieldType(
  typeName: string,
  fieldName: string,
  ast: CompilationUnit,
): string | undefined {
  const typeUpper = typeName.toUpperCase();
  const fieldUpper = fieldName.toUpperCase();

  // Check struct type definitions
  for (const td of ast.types) {
    if (
      td.name.toUpperCase() === typeUpper &&
      td.definition.kind === "StructDefinition"
    ) {
      for (const field of td.definition.fields) {
        for (const name of field.names) {
          if (name.toUpperCase() === fieldUpper) return field.type.name;
        }
      }
    }
  }

  // Check FB var blocks (FB instance member access)
  for (const fb of ast.functionBlocks) {
    if (fb.name.toUpperCase() === typeUpper) {
      for (const block of fb.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            if (name.toUpperCase() === fieldUpper) return decl.type.name;
          }
        }
      }
      return undefined;
    }
  }

  // Check programs (program instance member access)
  for (const prog of ast.programs) {
    if (prog.name.toUpperCase() === typeUpper) {
      for (const block of prog.varBlocks) {
        for (const decl of block.declarations) {
          for (const name of decl.names) {
            if (name.toUpperCase() === fieldUpper) return decl.type.name;
          }
        }
      }
      return undefined;
    }
  }

  return undefined;
}

/**
 * Resolve the element type of an array type.
 * Handles __INLINE_ARRAY_* internal types and user-defined array TYPE definitions.
 */
export function resolveArrayElementType(
  typeName: string,
  ast: CompilationUnit,
): string | undefined {
  const typeUpper = typeName.toUpperCase();

  // Handle __INLINE_ARRAY_<ElementType> internal types
  if (typeUpper.startsWith("__INLINE_ARRAY_")) {
    return typeUpper.substring("__INLINE_ARRAY_".length);
  }

  // Check user-defined array type definitions
  for (const td of ast.types) {
    if (
      td.name.toUpperCase() === typeUpper &&
      td.definition.kind === "ArrayDefinition"
    ) {
      return td.definition.elementType.name.toUpperCase();
    }
  }

  return undefined;
}

// =============================================================================
// Display Helper
// =============================================================================

/**
 * Get a display name for an IECType.
 */
export function typeName(type: IECType): string {
  switch (type.typeKind) {
    case "elementary":
      return (type as ElementaryType).name;
    case "array":
      return "ARRAY";
    case "struct":
      return (type as StructType).name;
    case "enum":
      return (type as EnumType).name;
    case "reference":
      return `REF_TO ${typeName((type as ReferenceType).referencedType)}`;
    case "functionBlock":
      return (type as FunctionBlockType).name;
    default:
      return type.typeKind;
  }
}
