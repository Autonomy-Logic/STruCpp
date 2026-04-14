// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Debug Configuration Provider for STruC++ source-level debugging.
 *
 * Delegates to cppdbg (GDB/LLDB) with #line directives mapping
 * C++ back to the original .st source files.
 */

import * as vscode from "vscode";
import * as path from "node:path";
import type { LanguageClient } from "vscode-languageclient/node.js";
import { debugBuildCommand } from "./commands.js";
import { buildSetupCommands, buildDebugConfig } from "./debug-config-builder.js";

/**
 * Provides debug configurations for Structured Text programs.
 * When the user presses F5 on a .st file, this provider:
 * 1. Triggers a debug build (with #line directives)
 * 2. Returns a cppdbg launch config pointing to the debug binary
 */
export class StrucppDebugConfigProvider
  implements vscode.DebugConfigurationProvider
{
  constructor(private client: LanguageClient) {}

  provideDebugConfigurations(): vscode.ProviderResult<vscode.DebugConfiguration[]> {
    return [
      {
        type: "strucpp",
        request: "launch",
        name: "Debug ST Program",
        program: "${command:strucpp.debugBuild}",
        args: ["--cyclic"],
        cwd: "${workspaceFolder}",
      },
    ];
  }

  async resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration | undefined | null> {
    // If no config at all (empty launch.json or F5 with no config),
    // provide a default one
    if (!config.type && !config.request && !config.name) {
      config.type = "strucpp";
      config.request = "launch";
      config.name = "Debug ST Program";
    }

    // Only handle our type
    if (config.type !== "strucpp") {
      return config;
    }

    // Trigger debug build
    const debugState = await debugBuildCommand(this.client);
    if (!debugState) {
      // Build failed or was cancelled
      return undefined;
    }

    const isMac = process.platform === "darwin";
    const hasCodeLLDB = vscode.extensions.getExtension("vadimcn.vscode-lldb") != null;
    const debugType = isMac && hasCodeLLDB ? "lldb" : "cppdbg";
    const miMode: "lldb" | "gdb" = isMac ? "lldb" : "gdb";
    const prettyPrinterPath = this.findPrettyPrinters();
    const setupCommands = buildSetupCommands(miMode, prettyPrinterPath);

    return buildDebugConfig(
      { binaryPath: debugState.binaryPath, outputDir: debugState.outputDir },
      debugType,
      miMode,
      setupCommands,
      { name: config.name, env: config.env, stopOnEntry: config.stopOnEntry },
    );
  }

  /**
   * Look for the STruC++ GDB pretty-printer script in the extension directory.
   */
  private findPrettyPrinters(): string | undefined {
    try {
      const ext = vscode.extensions.getExtension("autonomy.strucpp-vscode");
      if (ext) {
        const printerPath = path.join(
          ext.extensionPath,
          "runtime",
          "strucpp-pretty-printers.py",
        );
        return printerPath;
      }
    } catch {
      // Extension not found, skip
    }
    return undefined;
  }
}
