// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Language Server — browser entry.
 *
 * Counterpart to `server.ts`.  Runs inside a Web Worker so that
 * Monaco-based editors (openplc-editor's renderer, openplc-web)
 * can host the same LSP without an out-of-process Node server.
 *
 * Reuses the same `DocumentManager` and the same shared
 * `registerAnalysisHandlers` module as the Node server, so feature
 * parity is enforced by sharing the code rather than copying it.
 *
 * What's *missing* compared to the Node server, by design:
 *
 *   - Workspace .st discovery from disk.  Sources arrive through
 *     LSP `didOpen` notifications only; the document manager is
 *     wired up with `NullWorkspaceFs`.
 *
 *   - .stlib loading from disk.  Library archives come in through
 *     the custom `strucpp/loadStlibBuffer` request — the client
 *     hands the worker the raw bytes (UTF-8 JSON), the worker
 *     parses with `loadStlibFromBuffer` and seeds the document
 *     manager's archive cache.
 *
 *   - All build / debug / REPL commands: compile, build, debug-
 *     build, library-compile, test runner.  Those use g++ or the
 *     filesystem and have no place in the editor's autocomplete
 *     pipeline.  They stay in `server.ts`.
 */

import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
  TextDocuments,
  type InitializeParams,
  type InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/browser.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  analyze,
  loadStlibFromBuffer,
  loadStlibFromString,
  type StlibArchive,
} from "strucpp";
import {
  GetLibrariesRequest,
  LibrariesChangedNotification,
  type LibraryArchiveInfo,
} from "../../shared/protocol.js";
import { DocumentManager } from "./document-manager.js";
import { NullWorkspaceFs } from "./workspace-fs.js";
import { registerAnalysisHandlers } from "./register-analysis-handlers.js";
import { TOKEN_TYPES, TOKEN_MODIFIERS } from "./semantic-tokens.js";

/**
 * Notification: client → server, push a library archive payload.
 *
 * `payload` may be either a UTF-8 JSON string (HTTP fetch path) or
 * a `Uint8Array` (Electron IPC binary path).  The server parses with
 * the appropriate loader and seeds the archive cache.  `libraryName`
 * lets the client identify the archive even when its manifest can't
 * be inspected client-side; it must match `archive.manifest.name`
 * after parse.
 */
const LoadStlibBufferRequestType =
  "strucpp/loadStlibBuffer" as const;

interface LoadStlibBufferParams {
  /** Stable label used for diagnostics (`origin.stlib`, URL, etc.). */
  sourceLabel: string;
  /** Library payload — either JSON text or raw UTF-8 bytes. */
  payload: string | { type: "buffer"; bytes: number[] };
}

interface LoadStlibBufferResult {
  /** Library name as reported by the parsed manifest. */
  name: string;
  /** Library version. */
  version: string;
}

const ClearStlibCacheRequestType = "strucpp/clearStlibCache" as const;

// ---------------------------------------------------------------------------
// Connection setup
// ---------------------------------------------------------------------------

// `self` is the worker global; vscode-languageserver/browser
// handles the rest.  We deliberately don't add the "webworker" lib
// to the project's tsconfig — that would leak browser DOM types
// into the Node sources sharing this compile — so we cast through
// `unknown` here.  The actual runtime check is delegated to the
// upstream package, which accepts any object with the expected
// onmessage/postMessage shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerGlobal = self as any;
const messageReader = new BrowserMessageReader(workerGlobal);
const messageWriter = new BrowserMessageWriter(workerGlobal);
const connection = createConnection(messageReader, messageWriter);

const textDocuments = new TextDocuments(TextDocument);
const docManager = new DocumentManager(analyze, NullWorkspaceFs);

// Debounce is fixed in the browser server — there's no settings
// channel populated from a VS Code workspace.  Editor integrations
// that want a different value can send a custom RPC later.
const ANALYSIS_DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Browser doesn't see disk-mounted workspace folders, but the LSP
  // protocol still passes some URI-shaped values (e.g. an editor-
  // synthetic project root).  Stash them so DocumentManager has the
  // same shape it would in Node — discoverWorkspaceLibraries will
  // simply return [] because NullWorkspaceFs short-circuits.
  const folders: string[] = [];
  if (params.workspaceFolders) {
    for (const folder of params.workspaceFolders) {
      folders.push(folder.uri);
    }
  } else if (params.rootUri) {
    folders.push(params.rootUri);
  }
  docManager.setWorkspaceFolders(folders);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      hoverProvider: true,
      definitionProvider: true,
      typeDefinitionProvider: true,
      completionProvider: {
        triggerCharacters: [".", ":"],
        resolveProvider: false,
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      codeActionProvider: {
        codeActionKinds: ["quickfix"],
      },
      documentFormattingProvider: true,
      semanticTokensProvider: {
        legend: { tokenTypes: TOKEN_TYPES, tokenModifiers: TOKEN_MODIFIERS },
        full: true,
      },
      // Workspace folder change tracking is meaningless without a
      // real filesystem; we omit it to keep the surface honest.
    },
  };
});

connection.onInitialized(() => {
  // Tell the client the (currently empty) library list is ready so
  // any UI gated on `LibrariesChangedNotification` can proceed.
  // The client follows up with strucpp/loadStlibBuffer per archive.
  void connection.sendNotification(LibrariesChangedNotification);
});

// ---------------------------------------------------------------------------
// Pure analysis providers (shared with the Node server)
// ---------------------------------------------------------------------------

registerAnalysisHandlers({
  connection,
  textDocuments,
  docManager,
  getAnalysisDebounceMs: () => ANALYSIS_DEBOUNCE_MS,
});

// ---------------------------------------------------------------------------
// Browser-specific custom RPCs: archive ingestion
// ---------------------------------------------------------------------------

connection.onRequest(
  LoadStlibBufferRequestType,
  (params: LoadStlibBufferParams): LoadStlibBufferResult => {
    const { sourceLabel, payload } = params;
    let archive: StlibArchive;
    if (typeof payload === "string") {
      archive = loadStlibFromString(payload, sourceLabel);
    } else {
      archive = loadStlibFromBuffer(new Uint8Array(payload.bytes), sourceLabel);
    }
    docManager.setLibraryArchiveCache(
      archive.manifest.name,
      archive,
      sourceLabel,
    );
    void connection.sendNotification(LibrariesChangedNotification);
    return {
      name: archive.manifest.name,
      version: archive.manifest.version,
    };
  },
);

connection.onRequest(ClearStlibCacheRequestType, () => {
  docManager.clearLibraryArchiveCache();
  void connection.sendNotification(LibrariesChangedNotification);
});

// Mirror the Node server's GetLibrariesRequest so editor UIs that
// fetch the current library list see the same shape on both sides.
connection.onRequest(GetLibrariesRequest, (): LibraryArchiveInfo[] => {
  return docManager.getCachedLibraries() as LibraryArchiveInfo[];
});

// ---------------------------------------------------------------------------
// Wire up document syncing and start listening
// ---------------------------------------------------------------------------

textDocuments.listen(connection);
connection.listen();
