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
