// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared utility functions for C++ code generation.
 */

/**
 * Convert an IEC 61131-3 based numeric string to a C++ literal string.
 * Handles 16#FF → 0xFF, 8#77 → 077, 2#1010 → 0b1010, and plain decimals.
 * Strips IEC underscore separators.
 */
export function iecBaseToCppLiteral(raw: string): string {
  const upper = raw.toUpperCase().replace(/_/g, "");
  if (upper.startsWith("16#")) return "0x" + upper.slice(3);
  if (upper.startsWith("8#")) return "0" + upper.slice(2);
  if (upper.startsWith("2#")) return "0b" + upper.slice(2);
  return raw.replace(/_/g, "");
}

/**
 * Format an array type string from element type and dimension bounds.
 *
 * - 1D → `Array1D<E, start, end>`
 * - 2D → `Array2D<E, s1, e1, s2, e2>`
 * - 3D → `Array3D<E, s1, e1, s2, e2, s3, e3>`
 * - 4+ → nested `Array1D<Array1D<..., s, e>, s, e>`
 */
export function formatArrayType(
  elemCpp: string,
  dimensions: Array<{ start: number; end: number }>,
): string {
  if (dimensions.length === 1) {
    const dim = dimensions[0]!;
    return `Array1D<${elemCpp}, ${dim.start}, ${dim.end}>`;
  }
  if (dimensions.length === 2) {
    const d1 = dimensions[0]!;
    const d2 = dimensions[1]!;
    return `Array2D<${elemCpp}, ${d1.start}, ${d1.end}, ${d2.start}, ${d2.end}>`;
  }
  if (dimensions.length === 3) {
    const d1 = dimensions[0]!;
    const d2 = dimensions[1]!;
    const d3 = dimensions[2]!;
    return `Array3D<${elemCpp}, ${d1.start}, ${d1.end}, ${d2.start}, ${d2.end}, ${d3.start}, ${d3.end}>`;
  }
  // 4+ dimensions: nested Array1D (outermost first)
  let result = elemCpp;
  for (let i = dimensions.length - 1; i >= 0; i--) {
    const dim = dimensions[i]!;
    result = `Array1D<${result}, ${dim.start}, ${dim.end}>`;
  }
  return result;
}

/**
 * Append an unchecked element access for one full set of array indices,
 * matching the container {@link formatArrayType} picked for that rank.
 *
 * `Array1D` subscripts with `operator[]`; `Array2D` / `Array3D` take all indices
 * at once through `operator()`; 4+ dimensions are nested `Array1D`, so they
 * subscript once per dimension. Getting this wrong doesn't just read the wrong
 * element — `arr[i][j]` on an `Array2D` has no matching operator and fails to
 * compile.
 *
 * Unchecked (rather than `.at()`) because these accessors are `constexpr`, which
 * is what lets `&arr[i]` be a constant expression — required for the debug
 * pointer table's PROGMEM placement on AVR.
 */
export function formatArrayElementAccess(
  base: string,
  indices: number[],
): string {
  if (indices.length === 2 || indices.length === 3) {
    return `${base}(${indices.join(", ")})`;
  }
  return base + indices.map((i) => `[${i}]`).join("");
}

/**
 * Translate IEC 61131-3 `$`-escape sequences in a string literal's body to C++
 * escape sequences, and escape what C++ needs escaped.
 *
 * Handles `$N`/`$n` (newline), `$L`/`$l` (line feed), `$R`/`$r` (CR), `$T`/`$t`
 * (tab), `$P`/`$p` (form feed), `$$` (literal `$`), `$'` (single quote), `$XX`
 * (hex byte) and `''` (doubled single quote), then escapes backslash and
 * double-quote so the result is safe inside a C++ `"…"` literal.
 *
 * Shared by the expression emitter and the type generator: a STRING literal has
 * to lower identically whether it appears in a statement, a variable
 * initialiser, or a STRUCT element default.
 */
export function translateIECString(inner: string): string {
  let result = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "$" && i + 1 < inner.length) {
      const next = inner[i + 1]!;
      switch (next.toUpperCase()) {
        case "N":
        case "L":
          result += "\\n";
          i++;
          break;
        case "R":
          result += "\\r";
          i++;
          break;
        case "T":
          result += "\\t";
          i++;
          break;
        case "P":
          result += "\\f";
          i++;
          break;
        case "$":
          result += "$";
          i++;
          break;
        case "'":
          result += "'";
          i++;
          break;
        default:
          // $XX hex escape: two hex digits
          if (
            i + 2 < inner.length &&
            /^[0-9A-Fa-f]{2}$/.test(inner.substring(i + 1, i + 3))
          ) {
            result += "\\x" + inner.substring(i + 1, i + 3);
            i += 2;
          } else {
            // Unknown $-escape, pass through
            result += "\\\\$";
          }
          break;
      }
    } else if (ch === "'" && i + 1 < inner.length && inner[i + 1] === "'") {
      // ST doubled-quote → single quote
      result += "'";
      i++;
    } else if (ch === "\\") {
      result += "\\\\";
    } else if (ch === '"') {
      result += '\\"';
    } else {
      result += ch;
    }
  }
  return result;
}
