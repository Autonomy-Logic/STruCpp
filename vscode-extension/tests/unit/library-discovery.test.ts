// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { analyze } from "strucpp";
import { DocumentManager } from "../../server/src/document-manager.js";

describe("discoverWorkspaceLibraries", () => {
  let tempDir: string;
  let docManager: DocumentManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-libtest-"));
    docManager = new DocumentManager(analyze);
    docManager.setWorkspaceFolders([tempDir]);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("finds .stlib files in libs/ at workspace root", () => {
    const libsDir = path.join(tempDir, "libs");
    fs.mkdirSync(libsDir);
    fs.writeFileSync(path.join(libsDir, "test.stlib"), "{}", "utf-8");

    const discovered = docManager.discoverWorkspaceLibraries();
    expect(discovered).toContain(libsDir);
  });

  it("finds .stlib files in nested subdirectories", () => {
    const nestedDir = path.join(tempDir, "src", "libs");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, "mylib.stlib"), "{}", "utf-8");

    const discovered = docManager.discoverWorkspaceLibraries();
    expect(discovered).toContain(nestedDir);
  });

  it("deduplicates directories with multiple .stlib files", () => {
    const libsDir = path.join(tempDir, "libs");
    fs.mkdirSync(libsDir);
    fs.writeFileSync(path.join(libsDir, "a.stlib"), "{}", "utf-8");
    fs.writeFileSync(path.join(libsDir, "b.stlib"), "{}", "utf-8");

    const discovered = docManager.discoverWorkspaceLibraries();
    expect(discovered).toEqual([libsDir]);
  });

  it("returns directories from multiple locations", () => {
    const dir1 = path.join(tempDir, "libs");
    const dir2 = path.join(tempDir, "vendor", "deps");
    fs.mkdirSync(dir1);
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(path.join(dir1, "a.stlib"), "{}", "utf-8");
    fs.writeFileSync(path.join(dir2, "b.stlib"), "{}", "utf-8");

    const discovered = docManager.discoverWorkspaceLibraries();
    expect(discovered).toContain(dir1);
    expect(discovered).toContain(dir2);
  });

  it("returns empty when no .stlib files exist", () => {
    const discovered = docManager.discoverWorkspaceLibraries();
    expect(discovered).toEqual([]);
  });

  it("skips hidden directories", () => {
    const hiddenDir = path.join(tempDir, ".hidden");
    fs.mkdirSync(hiddenDir);
    fs.writeFileSync(path.join(hiddenDir, "secret.stlib"), "{}", "utf-8");

    const discovered = docManager.discoverWorkspaceLibraries();
    expect(discovered).toEqual([]);
  });
});

describe("library path merging", () => {
  it("deduplicates paths", () => {
    const paths = ["/a", "/b", "/a", "/c", "/b"];
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const p of paths) {
      if (!seen.has(p)) {
        seen.add(p);
        merged.push(p);
      }
    }

    expect(merged).toEqual(["/a", "/b", "/c"]);
  });
});

describe("buildWorkspaceSources", () => {
  let tempDir: string;
  let docManager: DocumentManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strucpp-wstest-"));
    docManager = new DocumentManager(analyze);
    docManager.setWorkspaceFolders([tempDir]);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("includes workspace .st files excluding the primary", () => {
    // Create two .st files on disk
    fs.writeFileSync(
      path.join(tempDir, "main.st"),
      "PROGRAM Main VAR x : INT; END_VAR END_PROGRAM",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tempDir, "utils.st"),
      "FUNCTION_BLOCK Utils VAR y : BOOL; END_VAR END_FUNCTION_BLOCK",
      "utf-8",
    );

    // Open the primary file
    const primaryUri = `file://${path.join(tempDir, "main.st")}`;
    docManager.onDocumentOpen(
      primaryUri,
      "PROGRAM Main VAR x : INT; END_VAR END_PROGRAM",
    );

    const sources = docManager.buildWorkspaceSources(primaryUri);
    const fileNames = sources.map((s) => s.fileName);

    expect(fileNames).toContain("utils.st");
    expect(fileNames).not.toContain("main.st");
  });
});
