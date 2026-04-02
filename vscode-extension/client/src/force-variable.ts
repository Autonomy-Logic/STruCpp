// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Force/Unforce variable commands and Forced Variables panel.
 *
 * Routes all force/unforce operations through the ReplClient IPC pipe,
 * which calls the same process_command() used by the interactive REPL.
 */

import * as vscode from "vscode";
import { ReplClient } from "./repl-client.js";

/** A variable that has been forced to a specific value. */
export interface ForcedVariableEntry {
  /** REPL path (e.g. "instance0.STATE") */
  replPath: string;
  /** Display name shown in the panel */
  displayName: string;
  /** The value the variable is forced to */
  forcedValue: string;
}

/**
 * Convert a C++ evaluateName from the debugger to a REPL variable path.
 *
 * Patterns:
 *   "config_Config0.instance0.STATE" → "instance0.STATE"
 *   "prog_Main.COUNTER"             → "Main.COUNTER"
 */
function evaluateNameToReplPath(evaluateName: string): string {
  const parts = evaluateName.split(".");

  if (parts.length >= 3 && parts[0]!.startsWith("config_")) {
    // Configuration mode: config_X.instanceName.VAR → instanceName.VAR
    return parts.slice(1).join(".");
  }

  if (parts.length >= 2 && parts[0]!.startsWith("prog_")) {
    // Standalone mode: prog_Name.VAR → Name.VAR
    return parts[0]!.substring(5) + "." + parts.slice(1).join(".");
  }

  // Fallback: use as-is
  return evaluateName;
}

/**
 * Command handler for "STruC++: Force Variable".
 * Called from Variables pane context menu.
 */
export async function forceVariableCommand(
  args: { variable?: { evaluateName?: string; name?: string; value?: string } },
  provider: ForcedVariablesProvider,
  replClient?: ReplClient,
): Promise<void> {
  console.log("[strucpp:force] forceVariableCommand called. replClient exists:", !!replClient, "connected:", replClient?.isConnected(), "args:", JSON.stringify(args?.variable));
  if (!replClient?.isConnected()) {
    vscode.window.showWarningMessage(
      "Not connected to the running program. Start a debug session first.",
    );
    return;
  }

  const evaluateName = args?.variable?.evaluateName;
  if (!evaluateName) {
    vscode.window.showWarningMessage("Cannot force this variable — no evaluate path available.");
    return;
  }

  const currentValue = args.variable?.value ?? "";
  const value = await vscode.window.showInputBox({
    prompt: `Force ${args.variable?.name ?? evaluateName} to value:`,
    value: currentValue,
    placeHolder: "Enter the value to force",
  });

  if (value === undefined) return; // cancelled

  const replPath = evaluateNameToReplPath(evaluateName);

  try {
    const response = await replClient.sendCommand(`force ${replPath} ${value}`);
    const result = ReplClient.parseResponse(response);
    if (!result.ok) {
      vscode.window.showErrorMessage(`Failed to force variable: ${result.message}`);
      return;
    }

    provider.addForced({
      replPath,
      displayName: args.variable?.name ?? evaluateName,
      forcedValue: value,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to force variable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Command handler for "STruC++: Unforce Variable".
 * Called from Variables pane context menu or Forced Variables panel.
 */
export async function unforceVariableCommand(
  args: { variable?: { evaluateName?: string }; entry?: ForcedVariableEntry },
  provider: ForcedVariablesProvider,
  replClient?: ReplClient,
): Promise<void> {
  if (!replClient?.isConnected()) {
    vscode.window.showWarningMessage("Not connected to the running program.");
    return;
  }

  const replPath = args?.entry?.replPath
    ?? (args?.variable?.evaluateName ? evaluateNameToReplPath(args.variable.evaluateName) : undefined);
  if (!replPath) {
    vscode.window.showWarningMessage("Cannot unforce this variable — no path available.");
    return;
  }

  try {
    const response = await replClient.sendCommand(`unforce ${replPath}`);
    const result = ReplClient.parseResponse(response);
    if (!result.ok) {
      vscode.window.showErrorMessage(`Failed to unforce variable: ${result.message}`);
      return;
    }

    provider.removeForced(replPath);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Failed to unforce variable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Command handler for "STruC++: Unforce All Variables".
 */
export async function unforceAllCommand(
  provider: ForcedVariablesProvider,
  replClient?: ReplClient,
): Promise<void> {
  if (!replClient?.isConnected()) {
    vscode.window.showWarningMessage("Not connected to the running program.");
    return;
  }

  try {
    const response = await replClient.sendCommand("unforce_all");
    const result = ReplClient.parseResponse(response);
    if (!result.ok) {
      vscode.window.showWarningMessage(`Failed to unforce all: ${result.message}`);
    }
  } catch (err) {
    vscode.window.showWarningMessage(
      `Some variables could not be unforced: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  provider.clearAll();
}

/**
 * TreeDataProvider for the "Forced Variables" debug panel.
 * Shows all currently forced variables with their forced values.
 */
export class ForcedVariablesProvider
  implements vscode.TreeDataProvider<ForcedVariableEntry>, vscode.Disposable
{
  private entries: ForcedVariableEntry[] = [];
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    // Clear all forced entries when debug session ends
    this.disposables.push(
      vscode.debug.onDidTerminateDebugSession(() => {
        if (this.entries.length > 0) {
          this.entries = [];
          this._onDidChangeTreeData.fire();
        }
      }),
    );
  }

  getTreeItem(element: ForcedVariableEntry): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${element.displayName} = ${element.forcedValue}`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.iconPath = new vscode.ThemeIcon("lock");
    item.tooltip = `${element.replPath} forced to ${element.forcedValue}`;
    item.contextValue = "forcedVariable";
    return item;
  }

  getChildren(element?: ForcedVariableEntry): ForcedVariableEntry[] {
    if (element) return []; // flat list
    return this.entries;
  }

  addForced(entry: ForcedVariableEntry): void {
    // Update existing or add new
    const idx = this.entries.findIndex((e) => e.replPath === entry.replPath);
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
    this._onDidChangeTreeData.fire();
  }

  removeForced(replPath: string): void {
    const idx = this.entries.findIndex((e) => e.replPath === replPath);
    if (idx >= 0) {
      this.entries.splice(idx, 1);
      this._onDidChangeTreeData.fire();
    }
  }

  clearAll(): void {
    if (this.entries.length > 0) {
      this.entries = [];
      this._onDidChangeTreeData.fire();
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
