// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Autonomy / OpenPLC Project
/**
 * STruC++ Lowered IR — Type System
 *
 * LLVM-inspired: a small, closed set of machine-oriented types that any backend
 * can reason about without knowing IEC 61131-3. Sizes are explicit, so a target
 * never has to guess how wide an INT is.
 *
 * One deliberate divergence from LLVM: integer types carry signedness. LLVM
 * keeps integers signless and puts the distinction on the operations, which is
 * cleaner for a machine compiler but loses information a PLC backend needs —
 * rendering an address, or reporting that a value will not fit a device's word,
 * both want to know whether the source said INT or UINT. Operations that depend
 * on signedness (comparison, division, shifts) still carry it themselves, so a
 * pass never has to consult the type to stay correct.
 *
 * Every type may also carry the IEC type name it came from. That is metadata:
 * backends are free to ignore it, but it is what lets a target notice that a
 * value is a TIME rather than just an i64.
 */

/** Integer widths the IR admits. */
export type IrIntBits = 8 | 16 | 32 | 64;

/** Floating-point widths the IR admits. */
export type IrFloatBits = 32 | 64;

export interface IrVoidType {
  kind: "void";
}

/** BOOL. Kept distinct from i8 so backends do not have to infer it. */
export interface IrBoolType {
  kind: "bool";
  /** IEC type this came from, when known (BOOL). */
  iec?: string;
}

export interface IrIntType {
  kind: "int";
  bits: IrIntBits;
  signed: boolean;
  /** IEC type this came from, when known (INT, UDINT, BYTE, ...). */
  iec?: string;
}

export interface IrFloatType {
  kind: "float";
  bits: IrFloatBits;
  /** IEC type this came from, when known (REAL, LREAL). */
  iec?: string;
}

/**
 * Duration and calendar types. Represented as a 64-bit integer count of
 * nanoseconds (matching the C++ runtime), but kept as a distinct kind so a
 * backend can map them onto a device's own time base instead of doing 64-bit
 * arithmetic it cannot afford.
 */
export interface IrTimeType {
  kind: "time";
  /** TIME, LTIME, DATE, TOD, DT, ... */
  iec: string;
}

/** A string of bytes or wide characters, with its declared capacity. */
export interface IrStringType {
  kind: "string";
  wide: boolean;
  capacity: number;
  iec?: string;
}

export interface IrPointerType {
  kind: "pointer";
  to: IrType;
}

export interface IrArrayType {
  kind: "array";
  element: IrType;
  count: number;
  /** Declared lower bound, so `arr[5]` can be resolved without the source. */
  lowerBound: number;
}

export interface IrStructType {
  kind: "struct";
  name: string;
  fields: readonly IrStructField[];
}

export interface IrStructField {
  name: string;
  type: IrType;
}

/**
 * A type the IR does not model structurally — most importantly a FUNCTION_BLOCK
 * instance. Backends that recognise the name (a TON, a PID) can act on it;
 * others treat it as an opaque blob of state.
 */
export interface IrOpaqueType {
  kind: "opaque";
  name: string;
}

export type IrType =
  | IrVoidType
  | IrBoolType
  | IrIntType
  | IrFloatType
  | IrTimeType
  | IrStringType
  | IrPointerType
  | IrArrayType
  | IrStructType
  | IrOpaqueType;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export const VOID: IrVoidType = { kind: "void" };

export function boolType(iec?: string): IrBoolType {
  return iec === undefined ? { kind: "bool" } : { kind: "bool", iec };
}

export function intType(
  bits: IrIntBits,
  signed: boolean,
  iec?: string,
): IrIntType {
  return iec === undefined
    ? { kind: "int", bits, signed }
    : { kind: "int", bits, signed, iec };
}

export function floatType(bits: IrFloatBits, iec?: string): IrFloatType {
  return iec === undefined
    ? { kind: "float", bits }
    : { kind: "float", bits, iec };
}

export function timeType(iec: string): IrTimeType {
  return { kind: "time", iec };
}

export function stringType(
  wide: boolean,
  capacity: number,
  iec?: string,
): IrStringType {
  return iec === undefined
    ? { kind: "string", wide, capacity }
    : { kind: "string", wide, capacity, iec };
}

export function pointerTo(to: IrType): IrPointerType {
  return { kind: "pointer", to };
}

export function arrayOf(
  element: IrType,
  count: number,
  lowerBound = 0,
): IrArrayType {
  return { kind: "array", element, count, lowerBound };
}

export function structType(
  name: string,
  fields: readonly IrStructField[],
): IrStructType {
  return { kind: "struct", name, fields };
}

export function opaqueType(name: string): IrOpaqueType {
  return { kind: "opaque", name };
}

// ---------------------------------------------------------------------------
// Predicates and queries
// ---------------------------------------------------------------------------

export function isNumeric(t: IrType): boolean {
  return t.kind === "int" || t.kind === "float" || t.kind === "time";
}

export function isInteger(t: IrType): boolean {
  return t.kind === "int" || t.kind === "time";
}

/** Bit width of a scalar type, or undefined when it has no single width. */
export function bitWidth(t: IrType): number | undefined {
  switch (t.kind) {
    case "bool":
      return 1;
    case "int":
      return t.bits;
    case "float":
      return t.bits;
    case "time":
      return 64;
    default:
      return undefined;
  }
}

export function typesEqual(a: IrType, b: IrType): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "void":
      return true;
    case "bool":
      return true;
    case "int":
      return (
        a.bits === (b as IrIntType).bits && a.signed === (b as IrIntType).signed
      );
    case "float":
      return a.bits === (b as IrFloatType).bits;
    case "time":
      return a.iec === (b as IrTimeType).iec;
    case "string": {
      const o = b as IrStringType;
      return a.wide === o.wide && a.capacity === o.capacity;
    }
    case "pointer":
      return typesEqual(a.to, (b as IrPointerType).to);
    case "array": {
      const o = b as IrArrayType;
      return (
        a.count === o.count &&
        a.lowerBound === o.lowerBound &&
        typesEqual(a.element, o.element)
      );
    }
    case "struct":
      return a.name === (b as IrStructType).name;
    case "opaque":
      return a.name === (b as IrOpaqueType).name;
  }
}

/**
 * Result type of an arithmetic operation on two numeric types, using the usual
 * widen-to-the-larger rule: float beats integer, wider beats narrower, and a
 * mixed-signedness pair of equal width becomes signed so the range is not lost
 * silently.
 */
export function promote(a: IrType, b: IrType): IrType | undefined {
  if (!isNumeric(a) || !isNumeric(b)) return undefined;
  if (a.kind === "time") return a;
  if (b.kind === "time") return b;
  if (a.kind === "float" || b.kind === "float") {
    const bits = Math.max(
      a.kind === "float" ? a.bits : 32,
      b.kind === "float" ? b.bits : 32,
    ) as IrFloatBits;
    return floatType(bits);
  }
  const ai = a as IrIntType;
  const bi = b as IrIntType;
  const bits = Math.max(ai.bits, bi.bits) as IrIntBits;
  return intType(bits, ai.signed || bi.signed);
}

// ---------------------------------------------------------------------------
// Textual form
// ---------------------------------------------------------------------------

/**
 * Rendering for a named type's *definition*, which has to show the body rather
 * than the reference. `formatType` on a struct deliberately yields `%Name`, so a
 * declaration printed with it would read `%P = type %P`.
 */
export function formatTypeBody(t: IrType): string {
  if (t.kind === "struct") {
    return `{ ${t.fields.map((f) => `${f.name}: ${formatType(f.type)}`).join(", ")} }`;
  }
  return formatType(t);
}

/** LLVM-ish rendering, used by the printer and by diagnostics. */
export function formatType(t: IrType): string {
  switch (t.kind) {
    case "void":
      return "void";
    case "bool":
      return "i1";
    case "int":
      return `${t.signed ? "i" : "u"}${t.bits}`;
    case "float":
      return `f${t.bits}`;
    case "time":
      return `time<${t.iec}>`;
    case "string":
      return `${t.wide ? "wstr" : "str"}[${t.capacity}]`;
    case "pointer":
      return `${formatType(t.to)}*`;
    case "array":
      return `[${t.count} x ${formatType(t.element)}]`;
    case "struct":
      return `%${t.name}`;
    case "opaque":
      return `opaque<${t.name}>`;
  }
}
