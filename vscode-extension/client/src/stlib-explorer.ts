// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Library Explorer — TreeDataProvider + TextDocumentContentProvider
 *
 * Displays loaded .stlib library archives in the Explorer sidebar.
 * Embedded source files and generated C++ can be opened as read-only tabs.
 */

import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";
import {
  GetLibrariesRequest,
  type LibraryArchiveInfo,
} from "../../shared/protocol.js";

// ---------------------------------------------------------------------------
// URI scheme for virtual library documents
// ---------------------------------------------------------------------------

/** URI scheme used by the content provider: strucpp-lib:/{libName}/sources/{file} */
export const STLIB_URI_SCHEME = "strucpp-lib";

function makeUri(libName: string, category: string, fileName: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: STLIB_URI_SCHEME,
    path: `/${libName}/${category}/${fileName}`,
  });
}

function parseUri(uri: vscode.Uri): { libName: string; category: string; fileName: string } | null {
  const parts = uri.path.split("/").filter(Boolean);
  if (parts.length !== 3) return null;
  return { libName: parts[0], category: parts[1], fileName: parts[2] };
}

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

type TreeItemKind = "library" | "folder" | "file";

interface StlibTreeItem {
  kind: TreeItemKind;
  label: string;
  libName: string;
  /** For folder nodes: "sources" | "cpp" */
  category?: string;
  /** For file nodes: the virtual document URI */
  uri?: vscode.Uri;
}

// ---------------------------------------------------------------------------
// StlibExplorer
// ---------------------------------------------------------------------------

export class StlibExplorer
  implements vscode.TreeDataProvider<StlibTreeItem>, vscode.TextDocumentContentProvider
{
  private archives: LibraryArchiveInfo[] = [];
  private archivesByName = new Map<string, LibraryArchiveInfo>();

  private _onDidChangeTreeData = new vscode.EventEmitter<StlibTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  /** Number of loaded library archives. */
  get libraryCount(): number {
    return this.archives.length;
  }

  constructor(private client: LanguageClient) {}

  async refresh(): Promise<void> {
    try {
      this.archives = await this.client.sendRequest(GetLibrariesRequest);
    } catch {
      this.archives = [];
    }

    this.archivesByName.clear();
    for (const info of this.archives) {
      this.archivesByName.set(info.archive.manifest.name, info);
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  // -------------------------------------------------------------------------
  // TreeDataProvider
  // -------------------------------------------------------------------------

  getTreeItem(element: StlibTreeItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label);

    switch (element.kind) {
      case "library":
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon("package");
        item.contextValue = "stlibLibrary";
        break;

      case "folder":
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.iconPath = new vscode.ThemeIcon(
          element.category === "sources" ? "folder" : "file-code",
        );
        item.contextValue = "stlibFolder";
        break;

      case "file":
        item.collapsibleState = vscode.TreeItemCollapsibleState.None;
        item.iconPath = new vscode.ThemeIcon(
          element.label.endsWith(".st") ? "file" : "file-code",
        );
        item.contextValue = "stlibFile";
        if (element.uri) {
          item.command = {
            command: "vscode.open",
            title: "Open",
            arguments: [element.uri],
          };
        }
        break;
    }

    return item;
  }

  getChildren(element?: StlibTreeItem): StlibTreeItem[] {
    if (!element) {
      // Root level: list all libraries
      return this.archives.map((info) => ({
        kind: "library" as const,
        label: `${info.archive.manifest.name} (${info.archive.manifest.version})`,
        libName: info.archive.manifest.name,
      }));
    }

    const info = this.archivesByName.get(element.libName);
    if (!info) return [];

    if (element.kind === "library") {
      // Library children: Sources folder (if available) + Generated C++ folder
      const children: StlibTreeItem[] = [];

      if (info.archive.sources && info.archive.sources.length > 0) {
        children.push({
          kind: "folder",
          label: "Sources",
          libName: element.libName,
          category: "sources",
        });
      }

      children.push({
        kind: "folder",
        label: "Generated C++",
        libName: element.libName,
        category: "cpp",
      });

      return children;
    }

    if (element.kind === "folder" && element.category === "sources") {
      return (info.archive.sources ?? []).map((src) => ({
        kind: "file" as const,
        label: src.fileName,
        libName: element.libName,
        category: "sources",
        uri: makeUri(element.libName, "sources", src.fileName),
      }));
    }

    if (element.kind === "folder" && element.category === "cpp") {
      const name = info.archive.manifest.name;
      return [
        {
          kind: "file" as const,
          label: `${name}.hpp`,
          libName: element.libName,
          category: "cpp",
          uri: makeUri(element.libName, "cpp", `${name}.hpp`),
        },
        {
          kind: "file" as const,
          label: `${name}.cpp`,
          libName: element.libName,
          category: "cpp",
          uri: makeUri(element.libName, "cpp", `${name}.cpp`),
        },
      ];
    }

    return [];
  }

  // -------------------------------------------------------------------------
  // TextDocumentContentProvider
  // -------------------------------------------------------------------------

  provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    const parsed = parseUri(uri);
    if (!parsed) return undefined;

    const info = this.archivesByName.get(parsed.libName);
    if (!info) return undefined;

    if (parsed.category === "sources") {
      const src = info.archive.sources?.find((s) => s.fileName === parsed.fileName);
      return src?.source;
    }

    if (parsed.category === "cpp") {
      if (parsed.fileName.endsWith(".hpp")) return info.archive.headerCode;
      if (parsed.fileName.endsWith(".cpp")) return info.archive.cppCode;
    }

    return undefined;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._onDidChange.dispose();
  }
}
