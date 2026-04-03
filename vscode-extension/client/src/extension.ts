// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ VSCode Extension — Language Client
 *
 * Activates the language server and connects it to the editor.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";
import { ExtensionContext, tasks, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";
import { registerCommands } from "./commands.js";
import { StrucppTaskProvider } from "./task-provider.js";
import { StlibExplorer, STLIB_URI_SCHEME } from "./stlib-explorer.js";
import { StrucppTestController } from "./test-controller.js";
import { StrucppDebugConfigProvider } from "./debug-config-provider.js";
import { StrucppBreakpointProvider } from "./breakpoint-provider.js";
import { StrucppEvalProvider } from "./debug-eval-provider.js";
import { StrucppDebugTrackerFactory } from "./debug-adapter-tracker.js";
import {
  ForcedVariablesProvider,
  forceVariableCommand,
  unforceVariableCommand,
  unforceAllCommand,
} from "./force-variable.js";
import { LibrariesChangedNotification } from "../../shared/protocol.js";

let client: LanguageClient | undefined;
let statusBarItem: vscode.StatusBarItem;

function updateStatusBar(item: vscode.StatusBarItem, explorer: StlibExplorer): void {
  const count = explorer.libraryCount;
  if (count > 0) {
    item.text = `$(package) STruC++ | ${count} lib${count !== 1 ? "s" : ""}`;
    item.show();
  } else {
    item.hide();
  }
}

export function activate(context: ExtensionContext): void {
  // Prefer bundled server (esbuild output), fall back to tsc output
  const bundledServer = context.asAbsolutePath(
    path.join("out", "server.js"),
  );
  const tscServer = context.asAbsolutePath(
    path.join("out", "server", "src", "server.js"),
  );
  const serverModule = fs.existsSync(bundledServer)
    ? bundledServer
    : tscServer;

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "structured-text" },
      { scheme: "strucpp-lib", language: "structured-text" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.{st,iecst,ST}"),
      configurationSection: "strucpp",
    },
  };

  // Status bar: library count indicator
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBarItem.tooltip = "STruC++ loaded libraries";
  statusBarItem.command = "strucpp.refreshLibraries";
  context.subscriptions.push(statusBarItem);

  client = new LanguageClient(
    "strucpp",
    "STruC++ Language Server",
    serverOptions,
    clientOptions,
  );

  client.start().then(() => {
    registerCommands(context, client!);

    // Library explorer: tree view + virtual document provider
    const explorer = new StlibExplorer(client!);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider("strucpp.libraryExplorer", explorer),
      vscode.workspace.registerTextDocumentContentProvider(STLIB_URI_SCHEME, explorer),
      vscode.commands.registerCommand("strucpp.refreshLibraries", async () => {
        await explorer.refresh();
        updateStatusBar(statusBarItem, explorer);
      }),
      explorer,
    );
    client!.onNotification(LibrariesChangedNotification, async () => {
      await explorer.refresh();
      updateStatusBar(statusBarItem, explorer);
    });
    explorer.refresh().then(() => updateStatusBar(statusBarItem, explorer));

    // Debug configuration provider
    const debugProvider = new StrucppDebugConfigProvider(client!);
    context.subscriptions.push(
      vscode.debug.registerDebugConfigurationProvider("strucpp", debugProvider),
    );

    // Breakpoint validation
    const breakpointProvider = new StrucppBreakpointProvider();
    context.subscriptions.push(breakpointProvider);

    // Debug hover: uppercase ST identifiers for C++ debugger evaluation
    const stSelector: vscode.DocumentSelector = { language: "structured-text" };
    context.subscriptions.push(
      vscode.languages.registerEvaluatableExpressionProvider(stSelector, new StrucppEvalProvider(client!)),
    );

    // Debug adapter tracker: intercept DAP responses to simplify IECVar display
    const trackerFactory = new StrucppDebugTrackerFactory();
    context.subscriptions.push(
      vscode.debug.registerDebugAdapterTrackerFactory("cppdbg", trackerFactory),
      vscode.debug.registerDebugAdapterTrackerFactory("lldb", trackerFactory),
    );

    // Forced variables panel and commands
    const forcedProvider = new ForcedVariablesProvider();
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider("strucpp.forcedVariables", forcedProvider),
      vscode.commands.registerCommand("strucpp.forceVariable", (args) =>
        forceVariableCommand(args, forcedProvider),
      ),
      vscode.commands.registerCommand("strucpp.unforceVariable", (args) =>
        unforceVariableCommand(args, forcedProvider),
      ),
      vscode.commands.registerCommand("strucpp.unforceAll", () =>
        unforceAllCommand(forcedProvider),
      ),
      forcedProvider,
    );

    // Test Explorer integration
    const testController = new StrucppTestController(context, client!);
    context.subscriptions.push(testController);

    // Format on save: trigger document formatting when strucpp.formatOnSave is enabled
    context.subscriptions.push(
      vscode.workspace.onWillSaveTextDocument((e) => {
        if (e.document.languageId !== "structured-text") return;
        if (e.document.uri.scheme !== "file") return;
        const config = vscode.workspace.getConfiguration("strucpp");
        if (!config.get<boolean>("formatOnSave", false)) return;
        e.waitUntil(
          vscode.commands.executeCommand<vscode.TextEdit[]>(
            "vscode.executeFormatDocumentProvider",
            e.document.uri,
            { tabSize: 2, insertSpaces: true } as vscode.FormattingOptions,
          ).then((edits) => edits ?? []),
        );
      }),
    );
  });

  // Register task provider
  context.subscriptions.push(
    tasks.registerTaskProvider(StrucppTaskProvider.type, new StrucppTaskProvider()),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
