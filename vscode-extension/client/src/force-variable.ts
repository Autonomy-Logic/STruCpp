// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Force/Unforce variable commands and Forced Variables panel.
 *
 * Uses IECVar<T>::force(value) and IECVar<T>::unforce() C++ methods
 * via the debug adapter's evaluate request.
 */

import * as vscode from "vscode";

/** A variable that has been forced to a specific value. */
export interface ForcedVariableEntry {
  /** C++ evaluate path (e.g. "TICK_TIMER.IN") */
  evaluateName: string;
  /** Display name shown in the panel */
  displayName: string;
  /** The value the variable is forced to */
  forcedValue: string;
  /** C++ type (for display) */
  type?: string;
}

/**
 * Command handler for "STruC++: Force Variable".
 * Called from Variables pane context menu.
 */
export async function forceVariableCommand(
  args: { variable?: { evaluateName?: string; name?: string; value?: string } },
  provider: ForcedVariablesProvider,
): Promise<void> {
  const session = vscode.debug.activeDebugSession;
  if (!session) {
    vscode.window.showWarningMessage("No active debug session.");
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

  try {
    await session.customRequest("evaluate", {
      expression: `${evaluateName}.force(${value})`,
      context: "repl",
    });

    provider.addForced({
      evaluateName,
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
): Promise<void> {
  const session = vscode.debug.activeDebugSession;
  if (!session) {
    vscode.window.showWarningMessage("No active debug session.");
    return;
  }

  // From Forced Variables panel (TreeItem) or Variables pane context menu
  const evaluateName = args?.entry?.evaluateName ?? args?.variable?.evaluateName;
  if (!evaluateName) {
    vscode.window.showWarningMessage("Cannot unforce this variable — no evaluate path available.");
    return;
  }

  try {
    await session.customRequest("evaluate", {
      expression: `${evaluateName}.unforce()`,
      context: "repl",
    });

    provider.removeForced(evaluateName);
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
): Promise<void> {
  const session = vscode.debug.activeDebugSession;
  if (!session) {
    vscode.window.showWarningMessage("No active debug session.");
    return;
  }

  const entries = provider.getEntries();
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      await session.customRequest("evaluate", {
        expression: `${entry.evaluateName}.unforce()`,
        context: "repl",
      });
    } catch (err) {
      errors.push(`${entry.displayName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  provider.clearAll();

  if (errors.length > 0) {
    vscode.window.showWarningMessage(
      `Some variables could not be unforced:\n${errors.join("\n")}`,
    );
  }
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
    item.tooltip = `${element.evaluateName} forced to ${element.forcedValue}`;
    item.contextValue = "forcedVariable";
    // Pass the entry as command argument for inline unforce button
    item.command = undefined;
    return item;
  }

  getChildren(element?: ForcedVariableEntry): ForcedVariableEntry[] {
    if (element) return []; // flat list
    return this.entries;
  }

  /** Get the entry for a tree item (used by unforce command). */
  getEntryByEvaluateName(evaluateName: string): ForcedVariableEntry | undefined {
    return this.entries.find((e) => e.evaluateName === evaluateName);
  }

  /** Get all entries (used by unforce all). */
  getEntries(): readonly ForcedVariableEntry[] {
    return this.entries;
  }

  addForced(entry: ForcedVariableEntry): void {
    // Update existing or add new
    const idx = this.entries.findIndex((e) => e.evaluateName === entry.evaluateName);
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
    this._onDidChangeTreeData.fire();
  }

  removeForced(evaluateName: string): void {
    const idx = this.entries.findIndex((e) => e.evaluateName === evaluateName);
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
