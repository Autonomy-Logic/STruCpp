// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Breakpoint validation for Structured Text source-level debugging.
 *
 * Uses the lineMap from the last debug build to determine which ST lines
 * are executable (mapped to C++ code) and which are not (comments,
 * VAR declarations, blank lines).
 */

import * as vscode from "vscode";
import { getLastDebugBuild } from "./commands.js";

/**
 * Validates breakpoints in .st files by checking against the line map.
 * Lines not in the lineMap are non-executable (comments, declarations, blanks).
 */
export class StrucppBreakpointProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("strucpp-breakpoints");

    // Validate breakpoints when they change
    this.disposables.push(
      vscode.debug.onDidChangeBreakpoints((e) => {
        this.validateBreakpoints(e);
      }),
    );

    // Also re-validate when opening the debug panel
    this.disposables.push(this.diagnosticCollection);
  }

  private validateBreakpoints(e: vscode.BreakpointsChangeEvent): void {
    const debugState = getLastDebugBuild();
    if (!debugState || debugState.lineMap.length === 0) {
      return; // No line map available yet — skip validation
    }

    // Build a set of valid (executable) ST lines
    const validLines = new Set<number>();
    for (const entry of debugState.lineMap) {
      validLines.add(entry.stLine);
    }

    // Check added breakpoints
    for (const bp of e.added) {
      if (bp instanceof vscode.SourceBreakpoint) {
        const doc = bp.location.uri;
        if (!doc.fsPath.match(/\.(st|iecst)$/i)) continue;

        const line = bp.location.range.start.line + 1; // VSCode is 0-indexed, ST is 1-indexed
        if (!validLines.has(line)) {
          // Show a warning that this line is not executable
          const diagnostics = this.diagnosticCollection.get(doc) ?? [];
          const range = new vscode.Range(
            bp.location.range.start.line, 0,
            bp.location.range.start.line, 1000,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Breakpoint on line ${line} may not be hit — this line has no executable code (comment, declaration, or blank line).`,
            vscode.DiagnosticSeverity.Warning,
          );
          diag.source = "STruC++ Debug";
          this.diagnosticCollection.set(doc, [...diagnostics, diag]);
        }
      }
    }

    // Clear diagnostics for removed breakpoints
    for (const bp of e.removed) {
      if (bp instanceof vscode.SourceBreakpoint) {
        const doc = bp.location.uri;
        const existing = this.diagnosticCollection.get(doc);
        if (existing) {
          const line = bp.location.range.start.line;
          const filtered = existing.filter(
            (d) => d.range.start.line !== line,
          );
          if (filtered.length > 0) {
            this.diagnosticCollection.set(doc, filtered);
          } else {
            this.diagnosticCollection.delete(doc);
          }
        }
      }
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
