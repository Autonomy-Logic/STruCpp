// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared debug utilities for STruC++ debugging.
 *
 * Zero vscode dependency — fully unit-testable with vitest.
 * Used by debug-adapter-tracker.ts, debug-eval-provider.ts, and force-variable.ts.
 */

/** DAP Variable shape (subset of DebugProtocol.Variable) */
export interface DAPVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  evaluateName?: string;
}

/**
 * C++ keywords and literals that must NOT be uppercased when
 * transforming ST expressions to C++ expressions.
 */
const CPP_PRESERVED = new Set([
  // Boolean / null
  "true", "false", "nullptr",
  // Operators / type queries
  "sizeof", "alignof", "decltype", "typeid",
  // Cast keywords
  "static_cast", "dynamic_cast", "const_cast", "reinterpret_cast",
  // IECVar member access
  "value_", "forced_", "forced_value_",
  // IECVar methods (used in force/unforce expressions)
  "force", "unforce", "is_forced", "get", "set",
]);

/**
 * Transform a Structured Text expression into its C++ equivalent.
 *
 * - Uppercases identifier tokens (ST is case-insensitive, C++ identifiers are uppercase)
 * - Preserves C++ keywords, boolean literals, and IECVar method names
 * - Preserves numeric literals, operators, and punctuation
 *
 * Examples:
 *   "tick_timer.in"           → "TICK_TIMER.IN"
 *   "my_var.force(42)"        → "MY_VAR.force(42)"
 *   "x > 10 AND y"            → "X > 10 AND Y"
 *   "true"                    → "true"
 */
export function transformStExpression(expr: string): string {
  if (!expr) return expr;
  return expr.replace(/\b([A-Za-z_]\w*)\b/g, (match) => {
    if (CPP_PRESERVED.has(match)) return match;
    return match.toUpperCase();
  });
}

/**
 * Check if a type name is an IECVar-wrapped type.
 *
 * Matches:
 * - IEC_INT, IEC_BOOL, IEC_REAL, IEC_TIME, ... (elementary type aliases)
 * - IECVar<short>, IECVar<int>, ... (template instantiations)
 * - IECStringVar<254>, IECWStringVar<100> (string wrappers)
 * - IEC_ENUM_Var<TrafficLight> (enum wrappers)
 * - IEC_MyEnum (user enum aliases that resolve to IEC_ENUM_Var)
 */
export function isIECVarType(type: string | undefined): boolean {
  if (!type) return false;
  // Strip namespace prefix (e.g., "strucpp::IEC_BOOL" → "IEC_BOOL")
  const bare = type.replace(/^\w+::/, "");
  // IECVar<T> / IECStringVar<N> / IECWStringVar<N> / IEC_ENUM_Var<E>
  if (/^IECVar<|^IECStringVar<|^IECWStringVar<|^IEC_ENUM/.test(bare)) {
    return true;
  }
  // IEC_ elementary aliases: IEC_INT, IEC_BOOL, IEC_REAL, IEC_TIME, etc.
  if (/^IEC_[A-Z][A-Z]/.test(bare)) return true;
  return false;
}

/**
 * Extract the simple value from an IECVar struct display string.
 *
 * Input:  "{value_ = 42, forced_ = false, forced_value_ = 0}"
 * Output: "42"
 *
 * Returns undefined for complex nested values (starts with '{')
 * so they are left as-is.
 */
export function extractSimpleValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Match value_ = <simple_value> (not a nested struct starting with '{')
  const match = value.match(/\bvalue_\s*=\s*([^{,}]+)/);
  if (!match) return undefined;
  const trimmed = match[1].trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Check if a set of variables looks like the children of an expanded IECVar.
 * IECVar<T> has exactly: value_, forced_, forced_value_.
 */
export function looksLikeIECVarChildren(variables: DAPVariable[]): boolean {
  if (variables.length < 2 || variables.length > 4) return false;
  const names = new Set(variables.map((v) => v.name));
  return names.has("value_") && names.has("forced_") && names.has("forced_value_");
}
