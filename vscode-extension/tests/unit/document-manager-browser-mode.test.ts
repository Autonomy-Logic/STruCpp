// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Parity tests for DocumentManager running in "browser mode" — i.e.
 * with NullWorkspaceFs in place of disk access.  Browser-side
 * consumers (the LSP web worker we ship for Monaco) get every
 * source through LSP didOpen notifications; nothing is read from
 * disk.  The same DocumentManager class powers both modes, so these
 * tests pin the contract that NullWorkspaceFs doesn't accidentally
 * disable any non-discovery capability.
 *
 * The fs-backed scenarios (workspace .stlib walking, cross-file
 * sources read from disk) are covered separately in
 * library-discovery.test.ts using NodeWorkspaceFs.
 */
import { describe, it, expect } from "vitest";
import { analyze } from "strucpp";
import { DocumentManager } from "../../server/src/document-manager.js";
import { NullWorkspaceFs } from "../../server/src/workspace-fs.js";

const FB_SOURCE = `FUNCTION_BLOCK Foo
  VAR_INPUT
    in1 : BOOL;
  END_VAR
  VAR_OUTPUT
    out1 : INT;
  END_VAR
  VAR
    counter : INT := 0;
  END_VAR
  counter := counter + 1;
  out1 := counter;
END_FUNCTION_BLOCK`;

const PROGRAM_SOURCE = `PROGRAM main
  VAR
    fb1 : Foo;
    result : INT;
  END_VAR
  fb1(in1 := TRUE);
  result := fb1.out1;
END_PROGRAM`;

describe("DocumentManager with NullWorkspaceFs (browser mode)", () => {
  it("uses NullWorkspaceFs by default", () => {
    // Constructor default — no second arg.
    const dm = new DocumentManager(analyze);
    // No workspace folders configured + browser fs → discovery
    // produces nothing, but the analysis path on the open doc still
    // works.
    const state = dm.onDocumentOpen("file:///foo.st", FB_SOURCE);
    expect(state.analysisResult).toBeDefined();
    expect(state.analysisResult?.errors ?? []).toEqual([]);
  });

  it("analyzes open documents without touching disk", () => {
    const dm = new DocumentManager(analyze, NullWorkspaceFs);
    dm.setWorkspaceFolders(["/nonexistent"]); // would crash if it tried fs
    const state = dm.onDocumentOpen("file:///program.st", PROGRAM_SOURCE);
    expect(state.analysisResult?.symbolTables).toBeDefined();
  });

  it("resolves cross-file symbols when both files come from didOpen", () => {
    const dm = new DocumentManager(analyze, NullWorkspaceFs);
    dm.setWorkspaceFolders(["/ignored"]);
    dm.onDocumentOpen("file:///fb.st", FB_SOURCE);
    dm.onDocumentOpen("file:///main.st", PROGRAM_SOURCE);

    const mainState = dm.getState("file:///main.st");
    expect(mainState).toBeDefined();
    // The program references `Foo` which is defined in the sibling
    // open doc.  buildWorkspaceSources should surface it without
    // any fs lookup.
    const sources = dm.buildWorkspaceSources("file:///main.st");
    const sourceFileNames = sources.map((s) => s.fileName).sort();
    expect(sourceFileNames).toContain("fb.st");
  });

  it("returns empty arrays from discoverWorkspaceLibraries (no disk walk)", () => {
    const dm = new DocumentManager(analyze, NullWorkspaceFs);
    dm.setWorkspaceFolders(["/somewhere"]);
    expect(dm.discoverWorkspaceLibraries()).toEqual([]);
  });

  it("re-analyzes all open docs without disk fallback", () => {
    const dm = new DocumentManager(analyze, NullWorkspaceFs);
    dm.onDocumentOpen("file:///a.st", FB_SOURCE);
    dm.onDocumentOpen("file:///b.st", PROGRAM_SOURCE);
    const results = dm.reanalyzeAll();
    expect(results.size).toBe(2);
    for (const [, result] of results) {
      expect(result).toBeDefined();
    }
  });
});
