// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Diagnostics — Maps CompileError[] to LSP Diagnostic[]
 */

import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Position,
} from "vscode-languageserver/node.js";
import type { CompileError } from "strucpp";

/**
 * Convert a CompileError to an LSP Diagnostic.
 * STruC++ uses 1-indexed line/column; LSP uses 0-indexed.
 */
export function toLspDiagnostic(error: CompileError): Diagnostic {
  const startLine = Math.max(0, (error.line ?? 1) - 1);
  const startCol = Math.max(0, (error.column ?? 1) - 1);
  const endLine = error.endLine != null ? error.endLine - 1 : startLine;
  const endCol = error.endColumn != null ? error.endColumn - 1 : startCol;

  return {
    range: Range.create(
      Position.create(startLine, startCol),
      Position.create(endLine, endCol),
    ),
    severity: mapSeverity(error.severity),
    message: error.message,
    source: "strucpp",
    ...(error.code != null ? { code: error.code } : {}),
  };
}

/**
 * Convert an array of CompileErrors to LSP Diagnostics.
 */
export function toLspDiagnostics(
  errors: CompileError[],
  warnings: CompileError[],
): Diagnostic[] {
  return [...errors, ...warnings].map(toLspDiagnostic);
}

function mapSeverity(severity: string): DiagnosticSeverity {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "info":
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Error;
  }
}
