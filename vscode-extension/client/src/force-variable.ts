// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Force/Unforce variable commands and Forced Variables panel.
 *
 * Forces variables by writing directly to IECVar internal fields via
 * the debug adapter's evaluate request. GDB/LLDB can set struct fields
 * without needing to call template methods:
 *
 *   evaluateName.forced_ = true
 *   evaluateName.forced_value_ = <value>
 *   evaluateName.value_ = <value>
 *
 * This works when stopped at a breakpoint (the primary use case) because
 * GDB has full access to process memory and ignores C++ access specifiers.
 */

import * as vscode from "vscode";

/** A variable that has been forced to a specific value. */
export interface ForcedVariableEntry {
  /** GDB evaluateName for the variable */
  evaluateName: string;
  /** Display name shown in the panel */
  displayName: string;
  /** The value the variable is forced to */
  forcedValue: string;
}

/**
 * Execute a GDB/LLDB expression via the debug adapter.
 * Uses the topmost stack frame of the active thread for context.
 * Returns the result string, or throws on failure.
 */
async function debugEvaluate(
  session: vscode.DebugSession,
  expression: string,
): Promise<string> {
  // Get the active thread's topmost stack frame for evaluation context
  let frameId: number | undefined;
  try {
    const threads = await session.customRequest("threads");
    if (threads?.threads?.length > 0) {
      const threadId = threads.threads[0].id;
      const stack = await session.customRequest("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 1,
      });
      if (stack?.stackFrames?.length > 0) {
        frameId = stack.stackFrames[0].id;
      }
    }
  } catch {
    // If we can't get a frame, try without one
  }

  // Use context "variables" to bypass the debug adapter tracker's
  // ST-to-C++ expression transformation (which uppercases identifiers
  // and would break C++ namespace resolution like strucpp::).
  const result = await session.customRequest("evaluate", {
    expression,
    context: "variables",
    ...(frameId !== undefined ? { frameId } : {}),
  });
  return result?.result ?? "";
}

/**
 * Force a variable by writing to its IECVar internal fields via GDB.
 * Sets forced_ = true, forced_value_ = value, value_ = value.
 */
async function forceViaDebugger(
  session: vscode.DebugSession,
  evaluateName: string,
  value: string,
): Promise<void> {
  // Write all three fields — GDB ignores C++ access specifiers
  await debugEvaluate(session, `${evaluateName}.forced_ = true`);
  await debugEvaluate(session, `${evaluateName}.forced_value_ = ${value}`);
  await debugEvaluate(session, `${evaluateName}.value_ = ${value}`);

  // Trigger a Variables pane refresh by re-reading the value we just set.
  // This causes cppdbg to invalidate its cached variable display.
  try {
    await debugEvaluate(session, `${evaluateName}.value_`);
  } catch {
    // Best-effort — the force already succeeded
  }
}

/**
 * Unforce a variable by clearing its IECVar forced_ flag via GDB.
 */
async function unforceViaDebugger(
  session: vscode.DebugSession,
  evaluateName: string,
): Promise<void> {
  await debugEvaluate(session, `${evaluateName}.forced_ = false`);
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
    await forceViaDebugger(session, evaluateName, value);

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

  const evaluateName = args?.entry?.evaluateName ?? args?.variable?.evaluateName;
  if (!evaluateName) {
    vscode.window.showWarningMessage("Cannot unforce this variable — no evaluate path available.");
    return;
  }

  try {
    await unforceViaDebugger(session, evaluateName);
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
      await unforceViaDebugger(session, entry.evaluateName);
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
    item.tooltip = `Forced to ${element.forcedValue}`;
    item.contextValue = "forcedVariable";
    return item;
  }

  getChildren(element?: ForcedVariableEntry): ForcedVariableEntry[] {
    if (element) return []; // flat list
    return this.entries;
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
