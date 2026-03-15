// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Debug Adapter Tracker for STruC++ debugging.
 *
 * Intercepts DAP messages to:
 * 1. Transform watch/REPL expressions from ST to C++ (onWillReceiveMessage)
 * 2. Collapse IECVar<T> variables to show just the inner value (onDidSendMessage)
 * 3. Filter forced_/forced_value_ internals from expanded IECVar children
 */

import * as vscode from "vscode";
import {
  type DAPVariable,
  isIECVarType,
  extractSimpleValue,
  looksLikeIECVarChildren,
  transformStExpression,
} from "./debug-utils.js";

const log = vscode.window.createOutputChannel("STruC++ Debug Tracker");

/**
 * Factory that creates trackers only for STruC++ debug sessions.
 * Sessions are identified by the __strucpp flag in the launch config.
 */
export class StrucppDebugTrackerFactory
  implements vscode.DebugAdapterTrackerFactory
{
  createDebugAdapterTracker(
    session: vscode.DebugSession,
  ): vscode.DebugAdapterTracker | undefined {
    // Only intercept sessions launched by STruC++
    if (!(session.configuration as Record<string, unknown>).__strucpp) {
      return undefined;
    }
    return new StrucppDebugTracker();
  }
}

class StrucppDebugTracker implements vscode.DebugAdapterTracker {
  /**
   * Intercept requests FROM VSCode TO the debug adapter.
   * Transform watch/REPL expressions from ST naming to C++ naming.
   */
  onWillReceiveMessage(message: Record<string, unknown>): void {
    const msg = message as {
      type?: string;
      command?: string;
      arguments?: {
        expression?: string;
        context?: string;
      };
    };

    if (
      msg.type === "request" &&
      msg.command === "evaluate" &&
      msg.arguments?.expression
    ) {
      const ctx = msg.arguments.context;
      // Transform watch and REPL expressions.
      // Skip "hover" — handled by EvaluatableExpressionProvider which
      // also consults the language server for type-aware .value_ appending.
      if (ctx === "watch" || ctx === "repl") {
        const original = msg.arguments.expression;
        const transformed = transformStExpression(original);
        if (transformed !== original) {
          log.appendLine(`[tracker] ${ctx}: "${original}" → "${transformed}"`);
          msg.arguments.expression = transformed;
        }
      }
    }
  }

  /**
   * Intercept responses FROM the debug adapter TO VSCode.
   * Collapse IECVar variables and filter internals.
   */
  onDidSendMessage(message: Record<string, unknown>): void {
    const msg = message as {
      type?: string;
      command?: string;
      body?: {
        variables?: DAPVariable[];
        // evaluate response fields
        result?: string;
        type?: string;
        variablesReference?: number;
        namedVariables?: number;
        indexedVariables?: number;
      };
    };

    if (msg.type !== "response" || !msg.body) return;

    // Handle variables responses (Variables pane)
    if (msg.command === "variables" && msg.body.variables) {
      this.transformVariables(msg.body.variables);
    }

    // Handle evaluate responses (Watch pane, REPL, hover)
    if (msg.command === "evaluate" && msg.body.type) {
      this.transformEvaluateResult(msg.body as EvaluateBody);
    }
  }

  private transformVariables(variables: DAPVariable[]): void {
    // Strategy 1: Collapse IECVar variables to non-expandable leaves.
    // Handles two cases:
    // a) LLDB summary already set the value (e.g. "true") — just collapse
    // b) Full struct representation (e.g. "{value_ = 42, ...}") — extract and collapse
    for (const v of variables) {
      if (isIECVarType(v.type) && v.variablesReference > 0) {
        // Try to extract from full struct display (cppdbg case)
        const rawValue = extractSimpleValue(v.value);
        if (rawValue !== undefined) {
          v.value = rawValue;
        }
        // If value is already clean (LLDB summary) or was just extracted,
        // collapse to non-expandable — hide forced_/forced_value_ internals.
        // Only skip if value is still "{...}" (summary didn't work).
        if (!v.value.startsWith("{")) {
          v.variablesReference = 0;
          if (v.namedVariables !== undefined) v.namedVariables = 0;
          if (v.indexedVariables !== undefined) v.indexedVariables = 0;
        }
      }
    }

    // Strategy 2: Filter expanded IECVar children.
    // When the debug adapter returns "{...}" for an IECVar (Strategy 1 can't extract),
    // the user expands it and sees value_, forced_, forced_value_ as children.
    // Strip forced_/forced_value_ to show only the actual value.
    if (looksLikeIECVarChildren(variables)) {
      for (let i = variables.length - 1; i >= 0; i--) {
        if (variables[i].name === "forced_" || variables[i].name === "forced_value_") {
          variables.splice(i, 1);
        }
      }
    }
  }

  /**
   * Collapse IECVar evaluate results (watch/REPL).
   * Same logic as Strategy 1 for variables, applied to evaluate responses.
   */
  private transformEvaluateResult(body: EvaluateBody): void {
    if (!isIECVarType(body.type)) return;

    // Extract value from struct display if needed
    const rawValue = extractSimpleValue(body.result);
    if (rawValue !== undefined) {
      body.result = rawValue;
    }

    // Collapse to non-expandable if value is clean
    if (body.result && !body.result.startsWith("{")) {
      if (body.variablesReference !== undefined) body.variablesReference = 0;
      if (body.namedVariables !== undefined) body.namedVariables = 0;
      if (body.indexedVariables !== undefined) body.indexedVariables = 0;
    }
  }
}

interface EvaluateBody {
  result?: string;
  type?: string;
  variablesReference?: number;
  namedVariables?: number;
  indexedVariables?: number;
}
