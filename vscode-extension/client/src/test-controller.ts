// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Test Controller — VSCode Test Explorer integration.
 *
 * Discovers TEST blocks in .st files and runs them via the LSP server.
 * The server compiles, generates test_main.cpp, invokes g++, and
 * executes the binary with --json for machine-readable results.
 */

import * as vscode from "vscode";
import * as fs from "node:fs";
import type { LanguageClient } from "vscode-languageclient/node.js";
import { parseTestFile } from "strucpp";
import { isTestFile } from "../../shared/test-utils.js";
import { RunTestsRequest, type RunTestsResponse } from "../../shared/protocol.js";
import type { TestRunOutput, TestResult } from "../../shared/test-result.js";

interface TestItemData {
  kind: "file" | "test";
  filePath: string;
  testName?: string;
}

export class StrucppTestController implements vscode.Disposable {
  private ctrl: vscode.TestController;
  private client: LanguageClient;
  private metadata = new WeakMap<vscode.TestItem, TestItemData>();
  private watcher: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext, client: LanguageClient) {
    this.client = client;

    this.ctrl = vscode.tests.createTestController("strucpp-tests", "STruC++ Tests");
    this.disposables.push(this.ctrl);

    // Run profile
    this.ctrl.createRunProfile(
      "Run",
      vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token),
      true,   // isDefault
      undefined,
      true,   // supportsContinuousRun
    );

    // Lazy discovery: resolve children when Test Explorer expands a file item
    this.ctrl.resolveHandler = async (item) => {
      if (!item) {
        // Root level: discover all test files in workspace
        await this.discoverWorkspaceTests();
      } else {
        // File level: parse and add test case children
        const data = this.metadata.get(item);
        if (data?.kind === "file") {
          this.parseAndUpdateFile(item, data.filePath);
        }
      }
    };

    // Watch for .st file changes
    this.watcher = vscode.workspace.createFileSystemWatcher("**/*.{st,iecst,ST}");
    this.watcher.onDidCreate((uri) => this.onFileChange(uri));
    this.watcher.onDidChange((uri) => this.onFileChange(uri));
    this.watcher.onDidDelete((uri) => this.onFileDelete(uri));
    this.disposables.push(this.watcher);

    // Also watch for document edits (more immediate than file watcher)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId !== "structured-text") return;
        if (e.document.uri.scheme !== "file") return;
        this.onDocumentChange(e.document);
      }),
    );

    // Register run tests command
    this.disposables.push(
      vscode.commands.registerCommand("strucpp.runTests", () => this.runAllTests()),
    );
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Discovery
  // ─────────────────────────────────────────────────────────────────────────

  private async discoverWorkspaceTests(): Promise<void> {
    const files = await vscode.workspace.findFiles("**/*.{st,iecst,ST}", "**/node_modules/**");
    for (const uri of files) {
      try {
        const content = await vscode.workspace.fs.readFile(uri);
        const source = Buffer.from(content).toString("utf-8");
        if (isTestFile(source)) {
          this.getOrCreateFileItem(uri);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  private getOrCreateFileItem(uri: vscode.Uri): vscode.TestItem {
    const key = uri.toString();
    let item = this.ctrl.items.get(key);
    if (!item) {
      const label = vscode.workspace.asRelativePath(uri);
      item = this.ctrl.createTestItem(key, label, uri);
      item.canResolveChildren = true;
      this.metadata.set(item, { kind: "file", filePath: uri.fsPath });
      this.ctrl.items.add(item);
    }
    return item;
  }

  private parseAndUpdateFile(fileItem: vscode.TestItem, filePath: string): void {
    let source: string;
    try {
      source = fs.readFileSync(filePath, "utf-8");
    } catch {
      return;
    }

    if (!isTestFile(source)) {
      // Not a test file (anymore) — remove it
      this.ctrl.items.delete(fileItem.id);
      return;
    }

    const result = parseTestFile(source, vscode.workspace.asRelativePath(filePath));
    if (!result.testFile) return;

    // Clear existing children and repopulate
    fileItem.children.replace([]);
    for (const tc of result.testFile.testCases) {
      const testId = `${fileItem.id}::${tc.name}`;
      const testItem = this.ctrl.createTestItem(testId, tc.name, fileItem.uri);
      // Set range for gutter icons and CodeLens
      if (tc.sourceSpan) {
        testItem.range = new vscode.Range(
          new vscode.Position(tc.sourceSpan.startLine - 1, tc.sourceSpan.startCol - 1),
          new vscode.Position(tc.sourceSpan.endLine - 1, tc.sourceSpan.endCol - 1),
        );
      }
      this.metadata.set(testItem, {
        kind: "test",
        filePath,
        testName: tc.name,
      });
      fileItem.children.add(testItem);
    }
  }

  private onFileChange(uri: vscode.Uri): void {
    try {
      const source = fs.readFileSync(uri.fsPath, "utf-8");
      if (isTestFile(source)) {
        const fileItem = this.getOrCreateFileItem(uri);
        this.parseAndUpdateFile(fileItem, uri.fsPath);
      } else {
        // Not a test file — remove if previously tracked
        this.ctrl.items.delete(uri.toString());
      }
    } catch {
      // Ignore unreadable
    }
  }

  private onFileDelete(uri: vscode.Uri): void {
    this.ctrl.items.delete(uri.toString());
  }

  private onDocumentChange(document: vscode.TextDocument): void {
    const source = document.getText();
    if (isTestFile(source)) {
      const fileItem = this.getOrCreateFileItem(document.uri);
      // Parse from document text (may be unsaved)
      const result = parseTestFile(source, vscode.workspace.asRelativePath(document.uri));
      if (!result.testFile) return;

      fileItem.children.replace([]);
      for (const tc of result.testFile.testCases) {
        const testId = `${fileItem.id}::${tc.name}`;
        const testItem = this.ctrl.createTestItem(testId, tc.name, fileItem.uri);
        if (tc.sourceSpan) {
          testItem.range = new vscode.Range(
            new vscode.Position(tc.sourceSpan.startLine - 1, tc.sourceSpan.startCol - 1),
            new vscode.Position(tc.sourceSpan.endLine - 1, tc.sourceSpan.endCol - 1),
          );
        }
        this.metadata.set(testItem, {
          kind: "test",
          filePath: document.uri.fsPath,
          testName: tc.name,
        });
        fileItem.children.add(testItem);
      }
    } else {
      this.ctrl.items.delete(document.uri.toString());
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Execution
  // ─────────────────────────────────────────────────────────────────────────

  private async runAllTests(): Promise<void> {
    const cts = new vscode.CancellationTokenSource();
    try {
      const request = new vscode.TestRunRequest();
      await this.runHandler(request, cts.token);
    } finally {
      cts.dispose();
    }
  }

  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const run = this.ctrl.createTestRun(request);

    // Collect tests to run
    const testsByFile = new Map<string, { fileItem: vscode.TestItem; tests: vscode.TestItem[] }>();

    if (request.include) {
      // Specific tests requested
      for (const item of request.include) {
        const data = this.metadata.get(item);
        if (!data) continue;

        if (data.kind === "file") {
          // Ensure children are resolved (resolveHandler is lazy)
          if (item.children.size === 0) {
            this.parseAndUpdateFile(item, data.filePath);
          }
          // Run all tests in file
          const tests: vscode.TestItem[] = [];
          item.children.forEach((child) => tests.push(child));
          testsByFile.set(data.filePath, { fileItem: item, tests });
        } else if (data.kind === "test") {
          // Run specific test
          const entry = testsByFile.get(data.filePath);
          if (entry) {
            entry.tests.push(item);
          } else {
            const fileItem = this.findFileItem(data.filePath);
            if (fileItem) {
              testsByFile.set(data.filePath, { fileItem, tests: [item] });
            }
          }
        }
      }
    } else {
      // Run all tests
      this.ctrl.items.forEach((fileItem) => {
        const data = this.metadata.get(fileItem);
        if (!data) return;
        // Ensure children are resolved (resolveHandler is lazy)
        if (fileItem.children.size === 0) {
          this.parseAndUpdateFile(fileItem, data.filePath);
        }
        const tests: vscode.TestItem[] = [];
        fileItem.children.forEach((child) => tests.push(child));
        testsByFile.set(data.filePath, { fileItem, tests });
      });
    }

    // Execute tests grouped by file
    for (const [filePath, { tests }] of testsByFile) {
      if (token.isCancellationRequested) break;

      // Mark all tests as started
      for (const test of tests) {
        run.started(test);
      }

      const testUri = vscode.Uri.file(filePath).toString();
      const testNames = tests
        .map((t) => this.metadata.get(t)?.testName)
        .filter((n): n is string => !!n);

      try {
        const response: RunTestsResponse = await this.client.sendRequest(
          RunTestsRequest,
          { testFileUri: testUri, testNames },
        );

        if (!response.success || !response.output) {
          // Compilation or execution error — mark all as errored
          const errorMsg = response.errors.map((e) => e.message).join("\n");
          for (const test of tests) {
            run.errored(test, new vscode.TestMessage(errorMsg));
          }
          run.appendOutput(`Error: ${errorMsg}\r\n`);
          continue;
        }

        this.reportResults(run, tests, response.output);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        for (const test of tests) {
          run.errored(test, new vscode.TestMessage(`Request failed: ${message}`));
        }
      }
    }

    // Handle watch mode — only set up watcher on the initial continuous run,
    // not on re-runs triggered by the watcher itself
    if (request.continuous) {
      const watcher = vscode.workspace.createFileSystemWatcher("**/*.{st,iecst,ST}");
      let rerunInProgress = false;
      const rerunDisposable = watcher.onDidChange(async () => {
        if (token.isCancellationRequested || rerunInProgress) return;
        rerunInProgress = true;
        try {
          // Re-run with continuous=false to avoid creating nested watchers
          const rerunRequest = new vscode.TestRunRequest(
            request.include,
            request.exclude,
            request.profile,
            false,
          );
          await this.runHandler(rerunRequest, token);
        } finally {
          rerunInProgress = false;
        }
      });
      token.onCancellationRequested(() => {
        watcher.dispose();
        rerunDisposable.dispose();
      });
    }

    run.end();
  }

  private reportResults(
    run: vscode.TestRun,
    tests: vscode.TestItem[],
    output: TestRunOutput,
  ): void {
    // Build a map from test name → TestItem
    const testMap = new Map<string, vscode.TestItem>();
    for (const test of tests) {
      const data = this.metadata.get(test);
      if (data?.testName) {
        testMap.set(data.testName, test);
      }
    }

    // Stream output to Test Results panel
    run.appendOutput(`${output.file}\r\n`);

    for (const result of output.results) {
      const testItem = testMap.get(result.name);

      if (result.passed) {
        run.appendOutput(`  \x1b[32m[PASS]\x1b[0m ${result.name}\r\n`);
        if (testItem) run.passed(testItem);
      } else {
        run.appendOutput(`  \x1b[31m[FAIL]\x1b[0m ${result.name}\r\n`);
        if (testItem) {
          this.reportFailure(run, testItem, result);
        }
      }
    }

    run.appendOutput(
      `\r\n${output.summary.total} tests, ${output.summary.passed} passed, ${output.summary.failed} failed\r\n`,
    );

    // Mark any tests not found in results as errored
    for (const test of tests) {
      const data = this.metadata.get(test);
      if (data?.testName && !output.results.some((r) => r.name === data.testName)) {
        run.errored(test, new vscode.TestMessage("Test not found in runner output"));
      }
    }
  }

  private reportFailure(
    run: vscode.TestRun,
    testItem: vscode.TestItem,
    result: TestResult,
  ): void {
    const failure = result.failure;
    if (!failure) {
      run.failed(testItem, new vscode.TestMessage("Test failed"));
      return;
    }

    const message = new vscode.TestMessage(
      `${failure.assertType}: ${failure.detail}${failure.message ? `\nMessage: ${failure.message}` : ""}`,
    );

    // Set failure location for inline annotation
    if (failure.file && failure.line && testItem.uri) {
      message.location = new vscode.Location(
        testItem.uri,
        new vscode.Position(failure.line - 1, 0),
      );
    }

    // Set expected/actual for diff view (ASSERT_EQ, ASSERT_NEQ)
    if (failure.expected !== undefined && failure.actual !== undefined) {
      message.expectedOutput = failure.expected;
      message.actualOutput = failure.actual;
    }

    run.failed(testItem, message);

    // Stream failure details
    run.appendOutput(`       ${failure.detail}\r\n`);
    if (failure.file && failure.line) {
      run.appendOutput(`       at ${failure.file}:${failure.line}\r\n`);
    }
    if (failure.message) {
      run.appendOutput(`       Message: ${failure.message}\r\n`);
    }
  }

  private findFileItem(filePath: string): vscode.TestItem | undefined {
    const uri = vscode.Uri.file(filePath).toString();
    return this.ctrl.items.get(uri);
  }
}
