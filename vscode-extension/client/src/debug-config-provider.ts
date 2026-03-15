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
import { debugBuildCommand, getLastDebugBuild } from "./commands.js";

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
    const miMode = isMac ? "lldb" : "gdb";

    // Build pretty-printer setup commands
    const setupCommands: Array<{ description: string; text: string; ignoreFailures: boolean }> = [];

    if (debugType === "cppdbg") {
      // GDB/LLDB setup via cppdbg adapter
      setupCommands.push(
        {
          description: "Enable pretty-printing",
          text: "-enable-pretty-printing",
          ignoreFailures: true,
        },
      );

      // Try to load STruC++ pretty-printers if available
      const prettyPrinterPath = this.findPrettyPrinters();
      if (prettyPrinterPath) {
        setupCommands.push({
          description: "Load STruC++ pretty-printers",
          text: `-interpreter-exec console "source ${prettyPrinterPath}"`,
          ignoreFailures: true,
        });
      }
    }

    // Construct the actual debug config for cppdbg or CodeLLDB
    if (debugType === "lldb") {
      return {
        type: "lldb",
        request: "launch",
        name: config.name || "Debug ST Program",
        program: debugState.binaryPath,
        args: ["--cyclic"],
        cwd: debugState.outputDir,
        __strucpp: true,
        initCommands: [
          "script def __iec(v,d): c=v.GetChildMemberWithName('value_'); return c.GetValue() if c.IsValid() else None",
          'type summary add -x "^(strucpp::)?IECVar<" -F __iec',
          'type summary add -x "^(strucpp::)?IECStringVar<" -F __iec',
          'type summary add -x "^(strucpp::)?IECWStringVar<" -F __iec',
          'type summary add -x "^(strucpp::)?IEC_[A-Z][A-Z]" -F __iec',
        ],
        ...(config.env ? { env: config.env } : {}),
        ...(config.stopOnEntry ? { stopOnEntry: true } : {}),
      };
    }

    // Add debugger-specific IECVar formatters
    if (isMac) {
      // LLDB type summaries via MI interpreter
      setupCommands.push(
        {
          description: "IECVar type summary",
          text: '-interpreter-exec console "type summary add -x \\"^(strucpp::)?IECVar<\\" --summary-string \\"${var.value_}\\""',
          ignoreFailures: true,
        },
        {
          description: "IEC_ typedef type summary",
          text: '-interpreter-exec console "type summary add -x \\"^(strucpp::)?IEC_[A-Z][A-Z]\\" --summary-string \\"${var.value_}\\""',
          ignoreFailures: true,
        },
      );
    } else {
      // GDB pretty-printer for IECVar types (Linux/Windows)
      setupCommands.push({
        description: "IECVar GDB pretty-printer",
        text: '-interpreter-exec console "python\\n'
          + "import gdb\\n"
          + "import re\\n"
          + "class IECVarPrinter:\\n"
          + "  def __init__(s,v): s.v=v\\n"
          + "  def to_string(s): return str(s.v['value_'])\\n"
          + "iec_re=re.compile(r'^(strucpp::)?(IECVar<|IECStringVar<|IECWStringVar<|IEC_[A-Z][A-Z])')\\n"
          + "def iec_lookup(v):\\n"
          + "  if iec_re.match(str(v.type.strip_typedefs())): return IECVarPrinter(v)\\n"
          + "  if iec_re.match(str(v.type)): return IECVarPrinter(v)\\n"
          + "  return None\\n"
          + 'gdb.pretty_printers.append(iec_lookup)\\nend"',
        ignoreFailures: true,
      });
    }

    // Default: cppdbg (works with Microsoft C/C++ extension)
    return {
      type: "cppdbg",
      request: "launch",
      name: config.name || "Debug ST Program",
      program: debugState.binaryPath,
      args: ["--cyclic"],
      cwd: debugState.outputDir,
      __strucpp: true,
      MIMode: miMode,
      setupCommands,
      ...(config.env ? { environment: Object.entries(config.env).map(([n, v]) => ({ name: n, value: v })) } : {}),
      ...(config.stopOnEntry ? { stopAtEntry: true } : {}),
    };
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
        // Will be available after Phase 8.4
        return printerPath;
      }
    } catch {
      // Extension not found, skip
    }
    return undefined;
  }
}
