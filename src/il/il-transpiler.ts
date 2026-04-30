// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ IL Transpiler — Public API
 *
 * Detects IL bodies in a source file, parses them, converts to ST,
 * and reassembles the source with IL bodies replaced by ST equivalents.
 */

import type { ILTranspileResult } from "./il-types.js";
import { extractPOURegions } from "./il-detector.js";
import { parseILBody } from "./il-parser.js";
import { convertILToST } from "./il-to-st.js";

/**
 * Transpile any IL bodies in the source to ST.
 *
 * Scans the source for POU regions, detects which have IL bodies,
 * and replaces those bodies with equivalent ST code. Non-IL POUs
 * and text outside POUs are left untouched.
 *
 * @param source - The full source text (may contain mixed IL and ST POUs)
 * @param fileName - Optional file name for error reporting
 * @returns Transpilation result with the ST source and any errors
 */
export function transpileILSource(
  source: string,
  fileName?: string,
): ILTranspileResult {
  const { regions, errors: detectionErrors } = extractPOURegions(source);

  // Detection errors (e.g. malformed POUs without VAR blocks) are reported
  // even if no IL bodies are present, so structural problems surface in
  // straight-ST programs too.
  const errors: ILTranspileResult["errors"] = detectionErrors.map((e) => {
    const entry: ILTranspileResult["errors"][number] = {
      message: e.message,
      line: e.line,
      column: e.column,
      severity: "error",
    };
    if (fileName) entry.file = fileName;
    return entry;
  });

  const ilRegions = regions.filter((r) => r.isIL);

  if (ilRegions.length === 0) {
    // Even when there's no IL, propagate any detection errors so callers
    // see them. hasIL stays false because no rewrite happened.
    return { hasIL: false, stSource: source, errors };
  }

  // Rebuild the source, replacing IL bodies with ST equivalents.
  // Process regions in reverse order so offsets remain valid.
  let result = source;

  for (let i = ilRegions.length - 1; i >= 0; i--) {
    const region = ilRegions[i]!;

    // Parse IL body
    const parseResult = parseILBody(region.bodyText, region.bodyStartLine);
    for (const err of parseResult.errors) {
      const entry: ILTranspileResult["errors"][number] = {
        message: err.message,
        line: err.line,
        column: err.column,
        severity: "error",
      };
      if (fileName) entry.file = fileName;
      errors.push(entry);
    }

    if (parseResult.instructions.length === 0) continue;

    // Convert to ST
    const convertResult = convertILToST(
      parseResult.instructions,
      parseResult.hasControlFlow,
    );
    for (const err of convertResult.errors) {
      const entry: ILTranspileResult["errors"][number] = {
        message: err.message,
        line: err.line,
        column: err.column,
        severity: "error",
      };
      if (fileName) entry.file = fileName;
      errors.push(entry);
    }

    // Reconstruct the POU: header + extra vars (if needed) + ST body + closing
    let newPOU = region.headerText;

    // If the state machine needs extra variables, inject a VAR block
    if (convertResult.extraVars) {
      // Insert VAR block with the state machine variables
      newPOU += "\n  VAR\n" + convertResult.extraVars + "\n  END_VAR\n";
    }

    newPOU += "\n" + convertResult.stBody + "\n";
    newPOU += region.closingText;

    // Replace the original POU text in the source
    result =
      result.substring(0, region.startOffset) +
      newPOU +
      result.substring(region.endOffset);
  }

  return {
    hasIL: true,
    stSource: result,
    errors,
  };
}
