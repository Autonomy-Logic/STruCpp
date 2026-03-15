// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * VSCode commands for STruC++ compile and build operations.
 */

import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { execFile } from "node:child_process";
import type { LanguageClient } from "vscode-languageclient/node.js";
import {
  CompileRequest,
  BuildRequest,
  DebugBuildRequest,
  CompileLibRequest,
  type CompileResponse,
  type BuildResponse,
  type DebugBuildResponse,
  type CompileLibResponse,
} from "../../shared/protocol.js";
import {
  getCxxEnv,
  splitCxxFlags,
} from "strucpp";

const outputChannel = vscode.window.createOutputChannel("STruC++");

/** Last debug build output — used by the debug configuration provider */
export interface DebugBuildState {
  binaryPath: string;
  outputDir: string;
  lineMap: Array<{ stLine: number; cppStart: number; cppEnd: number }>;
  sourceUri: string;
}

let _lastDebugBuild: DebugBuildState | undefined;

export function getLastDebugBuild(): DebugBuildState | undefined {
  return _lastDebugBuild;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  client: LanguageClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("strucpp.compile", () =>
      compileCommand(client, false),
    ),
    vscode.commands.registerCommand("strucpp.compileWorkspace", () =>
      compileCommand(client, true),
    ),
    vscode.commands.registerCommand("strucpp.build", () =>
      buildCommand(client, false),
    ),
    vscode.commands.registerCommand("strucpp.buildAndRun", () =>
      buildCommand(client, true),
    ),
    vscode.commands.registerCommand("strucpp.buildAndRunCyclic", () =>
      buildCommand(client, true, true),
    ),
    vscode.commands.registerCommand("strucpp.compileLib", () =>
      compileLibCommand(client),
    ),
    vscode.commands.registerCommand("strucpp.debugBuild", async () => {
      const state = await debugBuildCommand(client);
      if (!state) return;
      await launchDebugSession(state);
    }),
  );
}

/**
 * Resolve the output directory from config value, relative to workspace folder.
 */
function resolveOutputDirectory(
  configValue: string,
  sourceUri: vscode.Uri,
): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
  const base = workspaceFolder?.uri.fsPath ?? path.dirname(sourceUri.fsPath);

  if (path.isAbsolute(configValue)) {
    return configValue;
  }
  return path.resolve(base, configValue);
}

/**
 * Execute a process and pipe output to the output channel.
 * Returns a promise that resolves with the exit code.
 */
function execProcess(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = execFile(command, args, { cwd, env }, (_error, stdout, stderr) => {
      resolve({
        exitCode: proc.exitCode ?? 1,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
      });
    });
    proc.stdout?.on("data", (data: Buffer | string) => {
      outputChannel.append(data.toString());
    });
    proc.stderr?.on("data", (data: Buffer | string) => {
      outputChannel.append(data.toString());
    });
  });
}

async function compileCommand(
  client: LanguageClient,
  workspace: boolean,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "structured-text") {
    vscode.window.showWarningMessage("Open a Structured Text (.st) file first.");
    return;
  }

  // Save dirty document before compiling
  if (editor.document.isDirty) {
    await editor.document.save();
  }

  const uri = editor.document.uri.toString();
  const config = vscode.workspace.getConfiguration("strucpp");
  const outputDir = resolveOutputDirectory(
    config.get<string>("outputDirectory", "./generated"),
    editor.document.uri,
  );

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "STruC++: Compiling...",
      cancellable: false,
    },
    async () => {
      const response = await client.sendRequest(CompileRequest, {
        uri,
        workspace,
      });

      if (!response.success) {
        showCompileErrors(response);
        return;
      }

      // Write output files
      fs.mkdirSync(outputDir, { recursive: true });
      const baseName = response.primaryFileName.replace(/\.(st|iecst)$/i, "");
      const cppPath = path.join(outputDir, `${baseName}.cpp`);
      const hppPath = path.join(outputDir, `${baseName}.hpp`);

      fs.writeFileSync(cppPath, response.cppCode, "utf-8");
      fs.writeFileSync(hppPath, response.headerCode, "utf-8");

      showWarnings(response);
      vscode.window.showInformationMessage(
        `Compiled to ${path.relative(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
          outputDir,
        )}/`,
      );
    },
  );
}

async function buildCommand(
  client: LanguageClient,
  andRun: boolean,
  cyclic: boolean = false,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "structured-text") {
    vscode.window.showWarningMessage("Open a Structured Text (.st) file first.");
    return;
  }

  if (editor.document.isDirty) {
    await editor.document.save();
  }

  const uri = editor.document.uri.toString();
  const config = vscode.workspace.getConfiguration("strucpp");
  const outputDir = resolveOutputDirectory(
    config.get<string>("outputDirectory", "./generated"),
    editor.document.uri,
  );
  const gppPath = config.get<string>("gppPath", "g++");
  const ccDefault = process.platform === "win32" ? "gcc" : "cc";
  const ccPath = config.get<string>("ccPath", "") || ccDefault;
  const cxxFlags = config.get<string>("cxxFlags", "");

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "STruC++: Building...",
      cancellable: false,
    },
    async (progress) => {
      // 1. Compile via server
      progress.report({ message: "Compiling ST to C++..." });
      const response: BuildResponse = await client.sendRequest(BuildRequest, {
        uri,
      });

      if (!response.success) {
        showCompileErrors(response);
        return;
      }

      // 2. Write generated files
      fs.mkdirSync(outputDir, { recursive: true });
      const baseName = response.primaryFileName.replace(/\.(st|iecst)$/i, "");
      const cppPath = path.join(outputDir, `${baseName}.cpp`);
      const hppPath = path.join(outputDir, `${baseName}.hpp`);
      const mainCppPath = path.join(outputDir, "main.cpp");

      fs.writeFileSync(cppPath, response.cppCode, "utf-8");
      fs.writeFileSync(hppPath, response.headerCode, "utf-8");
      fs.writeFileSync(mainCppPath, response.mainCppCode, "utf-8");

      // 3. Use server-resolved runtime paths
      const runtimeIncludeDir = response.runtimeIncludeDir;
      const replDir = response.replDir;

      // 4. Compile isocline.c
      progress.report({ message: "Compiling isocline..." });
      outputChannel.clear();
      outputChannel.show(true);

      const isoclineObjPath = path.join(outputDir, "isocline.o");
      const ccResult = await execProcess(
        ccPath,
        [
          "-c",
          "-std=c11",
          `-I${replDir}`,
          path.join(replDir, "isocline.c"),
          "-o",
          isoclineObjPath,
        ],
        outputDir,
      );

      if (ccResult.exitCode !== 0) {
        outputChannel.appendLine(`C compilation failed (exit code ${ccResult.exitCode})`);
        vscode.window.showErrorMessage("C compilation of isocline failed. See Output panel.");
        return;
      }

      // 5. Compile + link C++
      progress.report({ message: "Compiling C++..." });
      const binaryName = process.platform === "win32" ? `${baseName}.exe` : baseName;
      const binaryPath = path.join(outputDir, binaryName);

      const gppArgs = [
        "-std=c++17",
        `-I${runtimeIncludeDir}`,
        `-I${replDir}`,
        `-I${outputDir}`,
        ...splitCxxFlags(cxxFlags),
        mainCppPath,
        cppPath,
        isoclineObjPath,
        "-o",
        binaryPath,
      ];

      const gppResult = await execProcess(
        gppPath,
        gppArgs,
        outputDir,
        getCxxEnv(),
      );

      if (gppResult.exitCode !== 0) {
        outputChannel.appendLine(`g++ compilation failed (exit code ${gppResult.exitCode})`);
        vscode.window.showErrorMessage("C++ compilation failed. See Output panel.");
        return;
      }

      showWarnings(response);
      outputChannel.appendLine(`Binary built: ${binaryPath}`);

      if (andRun) {
        // 6. Launch in terminal
        const terminalName = cyclic
          ? `STruC++ Cyclic: ${baseName}`
          : `STruC++ REPL: ${baseName}`;
        const quoted = binaryPath.includes(" ") ? `"${binaryPath}"` : binaryPath;
        const terminalCmd = cyclic
          ? `${quoted} --cyclic`
          : quoted;
        const terminal = vscode.window.createTerminal({
          name: terminalName,
          cwd: outputDir,
        });
        terminal.show();
        terminal.sendText(terminalCmd);
      } else {
        vscode.window.showInformationMessage(`Built: ${binaryName}`);
      }
    },
  );
}

/**
 * Debug build: compile with #line directives and -g -O0 for source-level debugging.
 * Builds the binary but does NOT run it — the debug configuration provider launches it.
 */
export async function debugBuildCommand(
  client: LanguageClient,
): Promise<DebugBuildState | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "structured-text") {
    vscode.window.showWarningMessage("Open a Structured Text (.st) file first.");
    return undefined;
  }

  if (editor.document.isDirty) {
    await editor.document.save();
  }

  const uri = editor.document.uri.toString();
  const config = vscode.workspace.getConfiguration("strucpp");
  const outputDir = resolveOutputDirectory(
    config.get<string>("outputDirectory", "./generated"),
    editor.document.uri,
  );
  const gppPath = config.get<string>("gppPath", "g++");
  const cxxFlags = config.get<string>("cxxFlags", "");

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "STruC++: Debug Build...",
      cancellable: false,
    },
    async (progress) => {
      // 1. Compile via server with lineDirectives: true
      progress.report({ message: "Compiling ST to C++ (debug)..." });
      const response: DebugBuildResponse = await client.sendRequest(
        DebugBuildRequest,
        { uri },
      );

      if (!response.success) {
        showCompileErrors(response);
        return undefined;
      }

      // 2. Write generated files
      fs.mkdirSync(outputDir, { recursive: true });
      const baseName = response.primaryFileName.replace(/\.(st|iecst)$/i, "");
      const cppPath = path.join(outputDir, `${baseName}.cpp`);
      const hppPath = path.join(outputDir, `${baseName}.hpp`);
      const mainCppPath = path.join(outputDir, "main.cpp");

      fs.writeFileSync(cppPath, response.cppCode, "utf-8");
      fs.writeFileSync(hppPath, response.headerCode, "utf-8");
      fs.writeFileSync(mainCppPath, response.mainCppCode, "utf-8");

      // 3. Compile isocline.c (needed for the main binary)
      progress.report({ message: "Compiling isocline..." });
      outputChannel.clear();
      outputChannel.show(true);

      const runtimeIncludeDir = response.runtimeIncludeDir;
      const replDir = response.replDir;
      const ccDefault = process.platform === "win32" ? "gcc" : "cc";
      const ccPath = config.get<string>("ccPath", "") || ccDefault;
      const isoclineObjPath = path.join(outputDir, "isocline.o");

      const ccResult = await execProcess(
        ccPath,
        ["-c", "-std=c11", `-I${replDir}`, path.join(replDir, "isocline.c"), "-o", isoclineObjPath],
        outputDir,
      );

      if (ccResult.exitCode !== 0) {
        outputChannel.appendLine(`C compilation failed (exit code ${ccResult.exitCode})`);
        vscode.window.showErrorMessage("C compilation of isocline failed. See Output panel.");
        return undefined;
      }

      // 4. Compile + link C++ with debug flags (-g -O0)
      progress.report({ message: "Compiling C++ (debug)..." });
      const binaryName = process.platform === "win32" ? `${baseName}_debug.exe` : `${baseName}_debug`;
      const binaryPath = path.join(outputDir, binaryName);

      // Filter out any -O flags from user cxxFlags, we force -O0 for debug
      const userFlags = splitCxxFlags(cxxFlags).filter(f => !f.startsWith("-O"));

      const gppArgs = [
        "-std=c++17",
        "-g",
        "-O0",
        `-I${runtimeIncludeDir}`,
        `-I${replDir}`,
        `-I${outputDir}`,
        ...userFlags,
        mainCppPath,
        cppPath,
        isoclineObjPath,
        "-o",
        binaryPath,
      ];

      const gppResult = await execProcess(
        gppPath,
        gppArgs,
        outputDir,
        getCxxEnv(),
      );

      if (gppResult.exitCode !== 0) {
        outputChannel.appendLine(`g++ debug compilation failed (exit code ${gppResult.exitCode})`);
        vscode.window.showErrorMessage("C++ debug compilation failed. See Output panel.");
        return undefined;
      }

      showWarnings(response);
      outputChannel.appendLine(`Debug binary built: ${binaryPath}`);

      _lastDebugBuild = {
        binaryPath,
        outputDir,
        lineMap: response.lineMap,
        sourceUri: uri,
      };

      return _lastDebugBuild;
    },
  );
}

/**
 * Launch a debug session using the output of a debug build.
 * Detects installed C/C++ debug extensions and constructs the appropriate config.
 */
async function launchDebugSession(state: DebugBuildState): Promise<void> {
  const sourceUri = vscode.Uri.parse(state.sourceUri);
  const folder = vscode.workspace.getWorkspaceFolder(sourceUri);

  const isMac = process.platform === "darwin";
  const hasCodeLLDB = vscode.extensions.getExtension("vadimcn.vscode-lldb") != null;
  const hasCppTools = vscode.extensions.getExtension("ms-vscode.cpptools") != null;

  if (!hasCodeLLDB && !hasCppTools) {
    const choice = await vscode.window.showErrorMessage(
      "A C/C++ debug extension is required for source-level debugging.",
      "Install C/C++ (Microsoft)",
      "Install CodeLLDB",
    );
    if (choice === "Install C/C++ (Microsoft)") {
      await vscode.commands.executeCommand(
        "workbench.extensions.installExtension",
        "ms-vscode.cpptools",
      );
    } else if (choice === "Install CodeLLDB") {
      await vscode.commands.executeCommand(
        "workbench.extensions.installExtension",
        "vadimcn.vscode-lldb",
      );
    }
    return;
  }

  let debugConfig: vscode.DebugConfiguration;

  if (isMac && hasCodeLLDB) {
    debugConfig = {
      type: "lldb",
      request: "launch",
      name: "Debug ST Program",
      program: state.binaryPath,
      args: ["--cyclic"],
      cwd: state.outputDir,
      __strucpp: true,
      initCommands: [
        // Python-based type summary: extracts value_ member for IECVar display
        "script def __iec(v,d): c=v.GetChildMemberWithName('value_'); return c.GetValue() if c.IsValid() else None",
        'type summary add -x "^(strucpp::)?IECVar<" -F __iec',
        'type summary add -x "^(strucpp::)?IECStringVar<" -F __iec',
        'type summary add -x "^(strucpp::)?IECWStringVar<" -F __iec',
        'type summary add -x "^(strucpp::)?IEC_[A-Z][A-Z]" -F __iec',
      ],
    };
  } else {
    const setupCommands = [
      {
        description: "Enable pretty-printing",
        text: "-enable-pretty-printing",
        ignoreFailures: true,
      },
    ];

    if (isMac) {
      // LLDB type summaries via MI interpreter (cppdbg with MIMode: lldb)
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

    debugConfig = {
      type: "cppdbg",
      request: "launch",
      name: "Debug ST Program",
      program: state.binaryPath,
      args: ["--cyclic"],
      cwd: state.outputDir,
      __strucpp: true,
      MIMode: isMac ? "lldb" : "gdb",
      setupCommands,
    };
  }

  await vscode.debug.startDebugging(folder, debugConfig);
}

async function compileLibCommand(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "structured-text") {
    vscode.window.showWarningMessage("Open a Structured Text (.st) file first.");
    return;
  }

  const libName = await vscode.window.showInputBox({
    prompt: "Library name (e.g., my-utils)",
    placeHolder: "my-library",
    validateInput: (value) => {
      if (!value.trim()) return "Library name is required";
      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value.trim())) {
        return "Use letters, digits, hyphens, and underscores (start with letter or _)";
      }
      return undefined;
    },
  });

  if (!libName) return; // User cancelled

  const libVersion = await vscode.window.showInputBox({
    prompt: "Library version (semver)",
    value: "1.0.0",
    validateInput: (value) => {
      if (!value.trim()) return "Version is required";
      if (!/^\d+\.\d+\.\d+/.test(value.trim())) {
        return "Use semver format (e.g., 1.0.0)";
      }
      return undefined;
    },
  });

  if (!libVersion) return; // User cancelled

  const uri = editor.document.uri.toString();
  const config = vscode.workspace.getConfiguration("strucpp");
  const outputDir = resolveOutputDirectory(
    config.get<string>("outputDirectory", "./generated"),
    editor.document.uri,
  );

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "STruC++: Compiling library...",
      cancellable: false,
    },
    async () => {
      const response: CompileLibResponse = await client.sendRequest(
        CompileLibRequest,
        { uri, libName: libName.trim(), libVersion: libVersion.trim() },
      );

      if (!response.success) {
        outputChannel.clear();
        outputChannel.show(true);
        outputChannel.appendLine("Library compilation failed:");
        for (const err of response.errors) {
          const loc = err.file
            ? `${err.file}:${err.line}:${err.column}`
            : `${err.line}:${err.column}`;
          outputChannel.appendLine(`  ${loc}: ${err.severity}: ${err.message}`);
        }
        vscode.window.showErrorMessage(
          `Library compilation failed with ${response.errors.length} error(s). See Output panel.`,
        );
        return;
      }

      // Write .stlib file
      fs.mkdirSync(outputDir, { recursive: true });
      const stlibPath = path.join(outputDir, `${response.libName}.stlib`);
      fs.writeFileSync(stlibPath, response.archiveJson, "utf-8");

      const relPath = path.relative(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        stlibPath,
      );
      vscode.window.showInformationMessage(`Library compiled: ${relPath}`);
    },
  );
}

function showCompileErrors(response: CompileResponse): void {
  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine("Compilation failed:");
  for (const err of response.errors) {
    const loc = err.file
      ? `${err.file}:${err.line}:${err.column}`
      : `${err.line}:${err.column}`;
    outputChannel.appendLine(`  ${loc}: ${err.severity}: ${err.message}`);
  }
  vscode.window.showErrorMessage(
    `Compilation failed with ${response.errors.length} error(s). See Output panel.`,
  );
}

function showWarnings(response: CompileResponse): void {
  if (response.warnings.length > 0) {
    outputChannel.show(true);
    for (const w of response.warnings) {
      const loc = w.file
        ? `${w.file}:${w.line}:${w.column}`
        : `${w.line}:${w.column}`;
      outputChannel.appendLine(`  ${loc}: warning: ${w.message}`);
    }
  }
}
