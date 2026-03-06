// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ VSCode Extension — Language Client
 *
 * Activates the language server and connects it to the editor.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { ExtensionContext, tasks, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";
import { registerCommands } from "./commands.js";
import { StrucppTaskProvider } from "./task-provider.js";

let client: LanguageClient | undefined;

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
    documentSelector: [{ scheme: "file", language: "structured-text" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.{st,iecst,ST}"),
      configurationSection: "strucpp",
    },
  };

  client = new LanguageClient(
    "strucpp",
    "STruC++ Language Server",
    serverOptions,
    clientOptions,
  );

  client.start().then(() => {
    registerCommands(context, client!);
  });

  // Register task provider
  context.subscriptions.push(
    tasks.registerTaskProvider(StrucppTaskProvider.type, new StrucppTaskProvider()),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
