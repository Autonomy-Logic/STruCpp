// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ VSCode Extension — Language Client
 *
 * Activates the language server and connects it to the editor.
 */

import * as path from "node:path";
import { ExtensionContext, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join("out", "server", "src", "server.js"),
  );

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
    },
  };

  client = new LanguageClient(
    "strucpp",
    "STruC++ Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
