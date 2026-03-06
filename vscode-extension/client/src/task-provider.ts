// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * VSCode Task Provider for STruC++ compile and build tasks.
 */

import * as vscode from "vscode";

interface StrucppTaskDefinition extends vscode.TaskDefinition {
  command: "compile" | "build" | "buildAndRun";
  file?: string;
  output?: string;
}

export class StrucppTaskProvider implements vscode.TaskProvider {
  static readonly type = "strucpp";

  provideTasks(): vscode.Task[] {
    return [
      this.createTask({ type: StrucppTaskProvider.type, command: "compile" }, "Compile Current File"),
      this.createTask({ type: StrucppTaskProvider.type, command: "build" }, "Build Executable"),
    ];
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const def = task.definition as StrucppTaskDefinition;
    if (def.command) {
      return this.createTask(def, task.name);
    }
    return undefined;
  }

  private createTask(definition: StrucppTaskDefinition, name: string): vscode.Task {
    const commandMap: Record<string, string> = {
      compile: "strucpp.compile",
      build: "strucpp.build",
      buildAndRun: "strucpp.buildAndRun",
    };
    const vscodeCommand = commandMap[definition.command] ?? "strucpp.compile";

    const task = new vscode.Task(
      definition,
      vscode.TaskScope.Workspace,
      name,
      "strucpp",
      new vscode.CustomExecution(async () => {
        return new StrucppTaskTerminal(vscodeCommand);
      }),
      "$strucpp-gpp",
    );

    if (definition.command === "build" || definition.command === "buildAndRun") {
      task.group = vscode.TaskGroup.Build;
    }

    return task;
  }
}

/**
 * Pseudoterminal that delegates to a VSCode command.
 */
class StrucppTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  constructor(private command: string) {}

  open(): void {
    this.writeEmitter.fire(`Running ${this.command}...\r\n`);
    vscode.commands.executeCommand(this.command).then(
      () => {
        this.writeEmitter.fire("Done.\r\n");
        this.closeEmitter.fire(0);
      },
      (err: Error) => {
        this.writeEmitter.fire(`Error: ${err.message}\r\n`);
        this.closeEmitter.fire(1);
      },
    );
  }

  close(): void {
    // nothing to clean up
  }
}
