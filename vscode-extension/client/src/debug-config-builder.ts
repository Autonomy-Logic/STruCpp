// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared debug configuration builder for STruC++.
 *
 * Provides pure functions that construct GDB/LLDB debug configurations
 * with IECVar pretty-printer setup. Used by both launchDebugSession()
 * (commands.ts) and resolveDebugConfiguration() (debug-config-provider.ts).
 */

import type * as vscode from "vscode";

/** Minimal build info needed to construct a debug config. */
export interface DebugBuildInfo {
  binaryPath: string;
  outputDir: string;
}

/** Optional user overrides from launch.json or debug config provider. */
export interface DebugConfigOverrides {
  name?: string;
  env?: Record<string, string>;
  stopOnEntry?: boolean;
}

/** GDB/LLDB setup command shape. */
export type SetupCommand = {
  description: string;
  text: string;
  ignoreFailures: boolean;
};

/**
 * LLDB initCommands for CodeLLDB: Python-based type summaries that
 * extract value_ from IECVar types for clean variable display.
 */
export function getLLDBInitCommands(): string[] {
  return [
    "script def __iec(v,d): c=v.GetChildMemberWithName('value_'); return c.GetValue() if c.IsValid() else None",
    'type summary add -x "^(strucpp::)?IECVar<" -F __iec',
    'type summary add -x "^(strucpp::)?IECStringVar<" -F __iec',
    'type summary add -x "^(strucpp::)?IECWStringVar<" -F __iec',
    'type summary add -x "^(strucpp::)?IEC_[A-Z][A-Z]" -F __iec',
  ];
}

/**
 * LLDB type summaries via MI interpreter for cppdbg adapter on Mac.
 */
export function getMITypeSummaryCommands(): SetupCommand[] {
  return [
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
  ];
}

/**
 * GDB pretty-printer: Python class that extracts value_ from IECVar types.
 * Used on Linux/Windows where GDB is the default debugger.
 */
export function getGDBPrettyPrinterCommand(): SetupCommand {
  return {
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
  };
}

/**
 * Build the full setupCommands array for cppdbg debug configurations.
 *
 * @param miMode - "lldb" (Mac) or "gdb" (Linux/Windows)
 * @param prettyPrinterPath - Optional path to external pretty-printer .py file
 */
export function buildSetupCommands(
  miMode: "lldb" | "gdb",
  prettyPrinterPath?: string,
): SetupCommand[] {
  const commands: SetupCommand[] = [
    {
      description: "Enable pretty-printing",
      text: "-enable-pretty-printing",
      ignoreFailures: true,
    },
  ];

  if (prettyPrinterPath) {
    commands.push({
      description: "Load STruC++ pretty-printers",
      text: `-interpreter-exec console "source \\"${prettyPrinterPath}\\""`,
      ignoreFailures: true,
    });
  }

  if (miMode === "lldb") {
    commands.push(...getMITypeSummaryCommands());
  } else {
    commands.push(getGDBPrettyPrinterCommand());
  }

  return commands;
}

/**
 * Build a complete debug configuration for either CodeLLDB or cppdbg.
 *
 * @param build - Binary path and output directory from the debug build
 * @param debugType - "lldb" (CodeLLDB) or "cppdbg" (Microsoft C/C++)
 * @param miMode - "lldb" (Mac) or "gdb" (Linux/Windows)
 * @param setupCommands - Pre-built setup commands (from buildSetupCommands)
 * @param overrides - Optional user config overrides (name, env, stopOnEntry)
 */
export function buildDebugConfig(
  build: DebugBuildInfo,
  debugType: "lldb" | "cppdbg",
  miMode: "lldb" | "gdb",
  setupCommands: SetupCommand[],
  overrides?: DebugConfigOverrides,
): vscode.DebugConfiguration {
  const name = overrides?.name || "Debug ST Program";

  if (debugType === "lldb") {
    return {
      type: "lldb",
      request: "launch",
      name,
      program: build.binaryPath,
      args: ["--cyclic"],
      cwd: build.outputDir,
      __strucpp: true,
      initCommands: getLLDBInitCommands(),
      ...(overrides?.env ? { env: overrides.env } : {}),
      ...(overrides?.stopOnEntry ? { stopOnEntry: true } : {}),
    };
  }

  return {
    type: "cppdbg",
    request: "launch",
    name,
    program: build.binaryPath,
    args: ["--cyclic"],
    cwd: build.outputDir,
    __strucpp: true,
    MIMode: miMode,
    setupCommands,
    ...(overrides?.env
      ? {
          environment: Object.entries(overrides.env).map(([n, v]) => ({
            name: n,
            value: v,
          })),
        }
      : {}),
    ...(overrides?.stopOnEntry ? { stopAtEntry: true } : {}),
  };
}
