# STruC++ VSCode Extension — Implementation Plan

## Overview

This document describes the implementation plan for turning STruC++ into a full-featured Structured Text IDE inside VSCode. The extension lives in `vscode-extension/` as a subdirectory of the main STruC++ repo, importing the compiler directly from `../../dist/index.js`. The compiler codebase remains untouched except for targeted API surface expansions needed by the language server.

The plan is organized into 9 phases, each self-contained and shippable. Dependencies between phases are noted explicitly.

---

## Architecture

```
strucpp/
├── src/                          # Compiler (unchanged)
├── dist/                         # Compiled compiler output
├── libs/                         # Bundled .stlib archives
├── vscode-extension/
│   ├── package.json              # Extension manifest + dependencies
│   ├── tsconfig.json             # Extends root config
│   ├── esbuild.mjs              # Bundler config (client + server)
│   ├── language-configuration.json
│   ├── syntaxes/
│   │   └── st.tmLanguage.json    # TextMate grammar for basic highlighting
│   ├── client/
│   │   └── src/
│   │       └── extension.ts      # LanguageClient setup (IPC transport)
│   └── server/
│       └── src/
│           ├── server.ts         # LSP connection + capability registration
│           ├── document-manager.ts  # Per-file analysis cache
│           ├── position-utils.ts    # Cursor → AST node resolution
│           ├── diagnostics.ts       # CompileError → LSP Diagnostic mapping
│           ├── symbols.ts           # Document/workspace symbol providers
│           ├── hover.ts             # Type info + documentation on hover
│           ├── definition.ts        # Go-to-definition + type definition
│           ├── references.ts        # Find all references + rename
│           ├── completion.ts        # Context-aware autocomplete
│           ├── signature-help.ts    # Function/FB call parameter hints
│           ├── semantic-tokens.ts   # Accurate syntax highlighting
│           ├── code-actions.ts      # Quick fixes for common errors
│           ├── formatting.ts        # Document formatting
│           └── commands.ts          # Custom commands (compile, build, etc.)
```

### Design Principles

1. **No code duplication** — The server imports STruC++ compiler modules directly. All type resolution, symbol lookup, and error checking reuse the compiler's existing pipeline. No reimplementation of parsing, type checking, or symbol resolution.

2. **Compiler stays clean** — The compiler (`src/`) has no awareness of LSP, VSCode, or editor concepts. Any LSP-specific logic lives in `vscode-extension/server/`. The compiler only gains new exports where its existing internals need to be publicly accessible.

3. **Thin adapter layer** — Each LSP feature handler is a thin adapter: receive LSP request → query compiler data structures → format LSP response. The "intelligence" lives in the compiler.

4. **Incremental by caching, not by parsing** — Chevrotain doesn't support incremental parsing, and ST files are small. We re-parse the full file on every edit (debounced) but cache results per-URI. Only changed files are re-analyzed.

5. **First-class test file support** — STruC++ has its own test framework (`TEST`/`ASSERT_*`/`MOCK_*`/`ADVANCE_TIME`). The extension treats test `.st` files as full citizens with syntax highlighting, completion, diagnostics, and test runner integration.

---

## Testing Strategy

The extension is tested at three levels — no level requires the others, and all run in CI.

### Level 1: Unit Tests (Vitest — no VSCode required)

**Where:** `vscode-extension/tests/unit/`
**Framework:** Vitest (same as the compiler)
**Runs:** `cd vscode-extension && npx vitest run`

The LSP server logic is structured so that all "intelligence" lives in pure functions that take compiler data structures and return LSP-typed results. These functions have zero dependency on the `vscode` module or the LSP `connection` — they only import from:
- `vscode-languageserver-types` (pure type definitions: `Position`, `Range`, `Diagnostic`, etc.)
- `vscode-languageserver-textdocument` (the `TextDocument` class — works in plain Node.js)
- `strucpp` (the compiler — works in plain Node.js)

This means every feature handler can be tested by creating a `TextDocument`, running it through the handler, and asserting on the result:

```typescript
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver-types";
import { computeDiagnostics } from "../src/diagnostics";

test("reports undeclared variable", () => {
  const doc = TextDocument.create("file:///test.st", "structured-text", 1,
    "PROGRAM Main\nVAR END_VAR\nx := 42;\nEND_PROGRAM"
  );
  const diags = computeDiagnostics(doc);
  expect(diags).toContainEqual(
    expect.objectContaining({
      severity: DiagnosticSeverity.Error,
      message: expect.stringContaining("x"),
    })
  );
});
```

**What to test at this level (aim for >90% of all extension tests):**

| Module | Test Focus |
|---|---|
| `diagnostics.ts` | `CompileError[]` → `Diagnostic[]` mapping, severity mapping, range calculation |
| `document-manager.ts` | Cache invalidation, multi-file discovery, analysis triggering |
| `symbols.ts` | AST → `DocumentSymbol[]` hierarchy, symbol kinds, ranges |
| `hover.ts` | Node-at-position → hover content for variables, functions, FBs, types, std functions |
| `definition.ts` | Node-at-position → definition `Location` for all symbol types |
| `references.ts` | Symbol → all reference `Location[]`, scope-aware disambiguation |
| `completion.ts` | Context detection (keyword/symbol/member/type), completion items, sort order |
| `signature-help.ts` | Function/FB call → parameter signatures, active parameter tracking |
| `semantic-tokens.ts` | AST → token array, correct types and modifiers |
| `code-actions.ts` | Diagnostic → quick fix `WorkspaceEdit`, correct insertions |
| `position-utils.ts` | Cursor → AST node resolution, edge cases (between tokens, at boundaries) |

**Test file fixtures:** Create `vscode-extension/tests/fixtures/` with `.st` files covering common patterns:
```
tests/fixtures/
├── simple-program.st        # Basic PROGRAM with variables
├── function-block.st        # FB with inputs/outputs/methods
├── multi-type.st            # Structs, enums, arrays, aliases
├── errors.st                # Files with deliberate errors
├── multi-file/              # Multi-file project scenario
│   ├── main.st
│   └── types.st
├── test-file.st             # TEST/ASSERT_*/MOCK_* constructs
└── large-program.st         # Performance edge case
```

### Level 2: TextMate Grammar Tests (vscode-tmgrammar-test — no VSCode required)

**Where:** `vscode-extension/tests/grammar/`
**Framework:** `vscode-tmgrammar-test`
**Runs:** `npx vscode-tmgrammar-test tests/grammar/**/*.test.st`

Grammar tests are `.st` files with inline scope assertions in comments:

```structured-text
// SYNTAX TEST "source.iec61131-st" "keyword highlighting"

PROGRAM Main
// <--- keyword.control.st
    VAR
//  ^^^ keyword.other.var.st
        counter : INT := 0;
//                ^^^ storage.type.st
//                       ^ constant.numeric.st
    END_VAR
END_PROGRAM
// <-------- keyword.control.st
```

**Test files cover:**
- All keyword categories (control flow, VAR blocks, POU declarations, OOP)
- All literal types (integer bases, reals, time, date, string, boolean)
- Comments (line `//`, block `(* *)`, nested)
- Operators and punctuation
- Address literals (`%IX0.0`, `%QW1`)
- Test-specific keywords (`TEST`, `ASSERT_EQ`, `MOCK`, `ADVANCE_TIME`)
- Edge cases (keywords as substrings of identifiers, case insensitivity)

**Snapshot tests** for regression detection:
```bash
npx vscode-tmgrammar-snap tests/grammar/snapshots/*.st
```

### Level 3: Integration Tests (@vscode/test-cli — launches real VSCode)

**Where:** `vscode-extension/tests/integration/`
**Framework:** `@vscode/test-cli` + `@vscode/test-electron` + Mocha
**Runs:** `cd vscode-extension && npx vscode-test`

These tests launch a real VSCode Extension Development Host to verify the end-to-end wire-up:

```typescript
import * as vscode from "vscode";
import * as assert from "assert";

suite("Extension Integration", () => {
  const fixtureUri = vscode.Uri.file("/path/to/fixtures/simple-program.st");

  test("extension activates on .st file", async () => {
    const doc = await vscode.workspace.openTextDocument(fixtureUri);
    await vscode.window.showTextDocument(doc);
    const ext = vscode.extensions.getExtension("autonomy-logic.strucpp-vscode");
    assert.ok(ext?.isActive);
  });

  test("diagnostics appear for errors", async () => {
    const doc = await vscode.workspace.openTextDocument(errorFixtureUri);
    await vscode.window.showTextDocument(doc);
    await sleep(2000); // wait for server analysis
    const diags = vscode.languages.getDiagnostics(errorFixtureUri);
    assert.ok(diags.length > 0);
  });

  test("completion provides keywords", async () => {
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider", fixtureUri, new vscode.Position(2, 0)
    );
    const labels = completions.items.map(i => i.label);
    assert.ok(labels.includes("IF"));
  });

  test("go-to-definition works", async () => {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeDefinitionProvider", fixtureUri, new vscode.Position(5, 4)
    );
    assert.ok(locations.length > 0);
  });
});
```

**Keep integration tests small** — they verify the wiring, not the logic:
- Extension activates on `.st` file open
- Language server starts and connects
- Diagnostics flow from server to Problems panel
- Completion, hover, definition commands respond
- Extension settings are read and applied
- Commands appear in Command Palette

**Configuration** (`.vscode-test.mjs`):
```javascript
import { defineConfig } from "@vscode/test-cli";
export default defineConfig({
  files: "out/tests/integration/**/*.test.js",
  version: "stable",
  workspaceFolder: "./tests/fixtures",
  mocha: { timeout: 30000 },
});
```

### CI Configuration

```yaml
# In .github/workflows/ci.yml
jobs:
  extension-tests:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci && npm run build          # Build compiler first
      - run: cd vscode-extension && npm ci
      # Unit tests (all platforms, fast)
      - run: cd vscode-extension && npx vitest run
      # Grammar tests (all platforms, fast)
      - run: cd vscode-extension && npx vscode-tmgrammar-test "tests/grammar/**/*.test.st"
      # Integration tests (need display server on Linux)
      - run: cd vscode-extension && npx vscode-test
        if: runner.os != 'Linux'
      - run: xvfb-run -a npx vscode-test
        if: runner.os == 'Linux'
        working-directory: vscode-extension
```

### Test Pyramid Summary

| Level | Framework | Speed | Count | Requires VSCode? |
|---|---|---|---|---|
| Unit tests | Vitest | ~2s total | ~150-200 tests | No |
| Grammar tests | vscode-tmgrammar-test | ~1s total | ~30-50 assertions | No |
| Integration tests | @vscode/test-cli + Mocha | ~30-60s total | ~15-20 tests | Yes |

---

## Test File Support (`.st` files with TEST/ASSERT/MOCK)

STruC++ has its own test framework with a dedicated lexer (`TestLexer`) and parser entry point (`testFile`). The extension must support these test files as first-class citizens.

### Test Language Constructs

**Block keywords:** `TEST 'name'`/`END_TEST`, `SETUP`/`END_SETUP`, `TEARDOWN`/`END_TEARDOWN`

**Assert functions (9 variants):**
| Function | Args | Purpose |
|---|---|---|
| `ASSERT_TRUE(expr)` | 1 | Boolean true check |
| `ASSERT_FALSE(expr)` | 1 | Boolean false check |
| `ASSERT_EQ(actual, expected)` | 2 | Equality |
| `ASSERT_NEQ(actual, expected)` | 2 | Inequality |
| `ASSERT_GT(actual, threshold)` | 2 | Greater than |
| `ASSERT_LT(actual, threshold)` | 2 | Less than |
| `ASSERT_GE(actual, threshold)` | 2 | Greater or equal |
| `ASSERT_LE(actual, threshold)` | 2 | Less or equal |
| `ASSERT_NEAR(actual, expected, tolerance)` | 3 | Approximate equality |

All assert functions accept an optional trailing string message argument.

**Mock statements:**
- `MOCK instance.path;` — mock an FB instance
- `MOCK_FUNCTION FuncName RETURNS expr;` — mock a function with a return value
- `MOCK_VERIFY_CALLED(instance.path);` — verify mock was called
- `MOCK_VERIFY_CALL_COUNT(instance.path, count);` — verify call count

**Time simulation:**
- `ADVANCE_TIME(T#duration);` — advance simulated PLC time

### How Test Support Is Woven Into Each Phase

Test file support is **not** a separate phase — it's integrated into each existing phase:

- **Phase 1 (Grammar):** TextMate grammar includes `TEST`/`END_TEST`, `SETUP`/`END_SETUP`, `TEARDOWN`/`END_TEARDOWN` as control keywords, all `ASSERT_*` as built-in functions, `MOCK`/`MOCK_FUNCTION`/`MOCK_VERIFY_*` as built-in statements, `ADVANCE_TIME` as built-in, and `RETURNS` as contextual keyword. The grammar tests include test-specific `.test.st` fixtures.
- **Phase 1 (Document Manager):** Detects test files (by content: presence of `TEST`/`END_TEST` at top level) and uses the compiler's test parser path.
- **Phase 2 (Symbols):** `TEST 'name'` blocks appear as `SymbolKind.Method` in the outline, `SETUP`/`TEARDOWN` as `SymbolKind.Constructor`/`SymbolKind.Event`.
- **Phase 3 (Completion):** Inside test files: complete `ASSERT_*` variants with correct arity snippets, `MOCK`/`MOCK_FUNCTION`/`MOCK_VERIFY_*` templates, `ADVANCE_TIME(T#${1:duration})`, and `TEST '${1:name}'\n...\nEND_TEST` snippets.
- **Phase 3 (Signature Help):** `ASSERT_EQ(` triggers signature help showing `(actual: ANY, expected: ANY [, message: STRING])`.
- **Phase 4 (Semantic Tokens):** `TEST`/`SETUP`/`TEARDOWN` as `keyword`, `ASSERT_*` as `function` with `defaultLibrary` modifier, `MOCK*` as `keyword`.
- **Phase 6 (Commands):** Add `strucpp.runTests` command that compiles and runs test files using the existing `--test` pipeline.

---

## Pre-requisite: Compiler API Expansion (Phase 0)

Before building the extension, the compiler needs targeted changes to expose internals the LSP requires. These are non-breaking additions — no existing behavior changes.

### Phase 0.1 — Export Missing Types from `src/index.ts`

Currently `src/index.ts` only re-exports `CompileOptions`, `CompileResult`, `CompileError`. The LSP needs direct access to types that are currently internal.

**Changes to `src/index.ts`:**

```typescript
// Add to existing re-exports:
export type { SourceSpan, LineMapEntry, Severity } from "./types.js";

// AST types needed by the LSP
export type {
  ASTNode, TypedNode, CompilationUnit,
  ProgramDeclaration, FunctionDeclaration, FunctionBlockDeclaration,
  InterfaceDeclaration, MethodDeclaration, PropertyDeclaration,
  TypeDeclaration, VarDeclaration, VarBlock,
  Statement, Expression,
  VariableExpression, FunctionCallExpression, MethodCallExpression,
  MemberAccessExpression, LiteralExpression,
  TypeReference, IECType, ElementaryType, ArrayType, StructType,
  EnumType, ReferenceType, FunctionBlockType,
  VarBlockType,
} from "./frontend/ast.js";

// Symbol table types
export type {
  SymbolTables, Scope, AnySymbol,
  VariableSymbol, ConstantSymbol, FunctionSymbol,
  FunctionBlockSymbol, ProgramSymbol, TypeSymbol, EnumValueSymbol,
} from "./semantic/symbol-table.js";

// Standard function registry
export { StdFunctionRegistry } from "./semantic/std-function-registry.js";
export type {
  StdFunctionDescriptor, StdFunctionParam, TypeConstraint,
} from "./semantic/std-function-registry.js";

// Type utilities needed for hover/completion
export {
  typeName, isElementaryType, resolveFieldType,
  resolveArrayElementType, ELEMENTARY_TYPES, TYPE_CATEGORIES,
} from "./semantic/type-utils.js";

// Project model
export type { ProjectModel } from "./project-model.js";

// Library sub-types
export type {
  LibraryFunctionEntry, LibraryFBEntry, LibraryTypeEntry,
} from "./library/library-manifest.js";
```

**Rationale:** The LSP server needs to inspect AST nodes, walk symbol tables, and display type information. These types already exist — we just need to make them importable from the package root instead of reaching into `dist/` subpaths.

### Phase 0.2 — Add `analyzeOnly()` Function

Currently `compile()` aborts entirely if there are semantic errors, returning no AST or symbol tables. The LSP needs partial results even when the code has errors.

**Add to `src/index.ts`:**

```typescript
export interface AnalysisResult {
  ast?: CompilationUnit;
  symbolTables?: SymbolTables;
  projectModel?: ProjectModel;
  errors: CompileError[];
  warnings: CompileError[];
  stdFunctionRegistry?: StdFunctionRegistry;
}

export function analyze(
  source: string,
  options?: Partial<CompileOptions>,
): AnalysisResult
```

**Implementation:** Same as `compile()` but:
- Stops after semantic analysis (no codegen)
- **Does not abort on errors** — always returns whatever AST, symbol tables, and project model were built, even if there are errors
- Returns the `StdFunctionRegistry` instance for autocomplete

This is the primary entry point the LSP server will use for on-edit analysis.

### Phase 0.3 — Enhance `CompileError` with Source Range

Currently `CompileError` has only `line` and `column` (point location). The LSP needs ranges to highlight entire expressions/tokens.

**Modify `src/types.ts`:**

```typescript
export interface CompileError {
  message: string;
  line: number;
  column: number;
  endLine?: number;    // NEW — optional, falls back to line
  endColumn?: number;  // NEW — optional, falls back to column + 1
  severity: Severity;
  file?: string;
  code?: string;
  suggestion?: string;
}
```

**Changes to error emission sites:**
- In `type-checker.ts`: when reporting errors, include the expression's `sourceSpan.endLine`/`sourceSpan.endCol`
- In `analyzer.ts`: propagate `sourceSpan` range information into `CompileError`
- In `parser.ts`: Chevrotain parse errors already have token start/end — propagate both

This is backwards-compatible (new fields are optional).

### Phase 0.4 — AST Position Utilities

Add a utility module to the compiler that the LSP will use for cursor-to-node resolution.

**New file `src/ast-utils.ts`:**

```typescript
export function findNodeAtPosition(
  ast: CompilationUnit,
  file: string,
  line: number,
  column: number,
): ASTNode | undefined;

export function findInnermostExpression(
  ast: CompilationUnit,
  file: string,
  line: number,
  column: number,
): Expression | undefined;

export function walkAST(
  node: ASTNode,
  visitor: (node: ASTNode) => boolean | void,
): void;

export function collectReferences(
  ast: CompilationUnit,
  symbolName: string,
  scope?: string,
): ASTNode[];
```

**Rationale:** These are general-purpose AST traversal utilities. They belong in the compiler (not the extension) because they operate on compiler data structures and could be useful for other consumers (e.g., linters, formatters). The LSP uses them for hover, go-to-definition, find-references, and rename.

**Export from `src/index.ts`:**
```typescript
export { findNodeAtPosition, findInnermostExpression, walkAST, collectReferences } from "./ast-utils.js";
```

---

## Phase 1 — Extension Scaffold + TextMate Grammar + Diagnostics

**Goal:** A working VSCode extension that provides syntax highlighting and error/warning squiggles.

### Phase 1.1 — Project Scaffold

Create the `vscode-extension/` directory structure:

**`vscode-extension/package.json`:**
```json
{
  "name": "strucpp-vscode",
  "displayName": "STruC++ — Structured Text IDE",
  "description": "IEC 61131-3 Structured Text language support powered by the STruC++ compiler",
  "version": "0.1.0",
  "publisher": "autonomy-logic",
  "license": "LGPL-3.0",
  "engines": { "vscode": "^1.82.0" },
  "categories": ["Programming Languages"],
  "activationEvents": [],
  "main": "./out/client/src/extension.js",
  "contributes": {
    "languages": [{
      "id": "structured-text",
      "aliases": ["Structured Text", "IEC 61131-3 ST", "ST"],
      "extensions": [".st", ".iecst", ".ST"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "structured-text",
      "scopeName": "source.iec61131-st",
      "path": "./syntaxes/st.tmLanguage.json"
    }]
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.1",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  },
  "devDependencies": {
    "@types/vscode": "^1.82.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.7.0"
  },
  "scripts": {
    "build": "tsc -b",
    "watch": "tsc -b --watch",
    "bundle": "node esbuild.mjs",
    "package": "vsce package",
    "lint": "eslint client/src server/src"
  }
}
```

**`vscode-extension/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./out",
    "rootDir": ".",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "paths": {
      "strucpp": ["../dist/index.js"],
      "strucpp/*": ["../dist/*"]
    }
  },
  "include": ["client/src/**/*", "server/src/**/*"],
  "exclude": ["node_modules", "out"]
}
```

**`vscode-extension/language-configuration.json`:**
```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["(*", "*)"]
  },
  "brackets": [["(", ")"], ["[", "]"]],
  "autoClosingPairs": [
    { "open": "(", "close": ")" },
    { "open": "[", "close": "]" },
    { "open": "(*", "close": "*)" },
    { "open": "'", "close": "'" }
  ],
  "surroundingPairs": [
    ["(", ")"],
    ["[", "]"],
    ["'", "'"]
  ],
  "folding": {
    "markers": {
      "start": "^\\s*(PROGRAM|FUNCTION_BLOCK|FUNCTION|IF|FOR|WHILE|REPEAT|CASE|VAR|STRUCT|TYPE|CONFIGURATION|RESOURCE|METHOD|PROPERTY|INTERFACE)\\b",
      "end": "^\\s*(END_PROGRAM|END_FUNCTION_BLOCK|END_FUNCTION|END_IF|END_FOR|END_WHILE|END_REPEAT|END_CASE|END_VAR|END_STRUCT|END_TYPE|END_CONFIGURATION|END_RESOURCE|END_METHOD|END_PROPERTY|END_INTERFACE)\\b"
    }
  },
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)",
  "indentationRules": {
    "increaseIndentPattern": "^\\s*(PROGRAM|FUNCTION_BLOCK|FUNCTION|IF|ELSIF|ELSE|FOR|WHILE|REPEAT|CASE|VAR|VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_GLOBAL|VAR_EXTERNAL|STRUCT|TYPE|CONFIGURATION|RESOURCE|TASK|METHOD|PROPERTY|INTERFACE|THEN|DO|OF)\\b",
    "decreaseIndentPattern": "^\\s*(END_PROGRAM|END_FUNCTION_BLOCK|END_FUNCTION|END_IF|ELSIF|ELSE|END_FOR|END_WHILE|END_REPEAT|UNTIL|END_CASE|END_VAR|END_STRUCT|END_TYPE|END_CONFIGURATION|END_RESOURCE|END_METHOD|END_PROPERTY|END_INTERFACE)\\b"
  }
}
```

### Phase 1.2 — TextMate Grammar

**`vscode-extension/syntaxes/st.tmLanguage.json`:**

A TextMate grammar that provides basic syntax coloring before the semantic token provider kicks in. Covers:

- **Keywords**: `PROGRAM`, `END_PROGRAM`, `FUNCTION_BLOCK`, `END_FUNCTION_BLOCK`, `FUNCTION`, `END_FUNCTION`, `IF`, `THEN`, `ELSIF`, `ELSE`, `END_IF`, `FOR`, `TO`, `BY`, `DO`, `END_FOR`, `WHILE`, `END_WHILE`, `REPEAT`, `UNTIL`, `END_REPEAT`, `CASE`, `OF`, `END_CASE`, `RETURN`, `EXIT`, `CONTINUE`, `VAR`, `VAR_INPUT`, `VAR_OUTPUT`, `VAR_IN_OUT`, `VAR_GLOBAL`, `VAR_EXTERNAL`, `VAR_TEMP`, `END_VAR`, `CONSTANT`, `RETAIN`, `PERSISTENT`, `AT`, `TYPE`, `END_TYPE`, `STRUCT`, `END_STRUCT`, `ARRAY`, `OF`, `STRING`, `WSTRING`, `METHOD`, `END_METHOD`, `PROPERTY`, `END_PROPERTY`, `INTERFACE`, `END_INTERFACE`, `IMPLEMENTS`, `EXTENDS`, `ABSTRACT`, `FINAL`, `OVERRIDE`, `PUBLIC`, `PRIVATE`, `PROTECTED`, `INTERNAL`, `CONFIGURATION`, `END_CONFIGURATION`, `RESOURCE`, `END_RESOURCE`, `TASK`, `ON`, `WITH`, `REF_TO`, `REFERENCE_TO`, `POINTER_TO`, `NEW`, `DELETE`, `THIS`, `SUPER`
- **Operators**: `:=`, `=>`, `+`, `-`, `*`, `/`, `MOD`, `**`, `=`, `<>`, `<`, `>`, `<=`, `>=`, `AND`, `OR`, `XOR`, `NOT`
- **Types**: `BOOL`, `BYTE`, `WORD`, `DWORD`, `LWORD`, `SINT`, `INT`, `DINT`, `LINT`, `USINT`, `UINT`, `UDINT`, `ULINT`, `REAL`, `LREAL`, `TIME`, `DATE`, `TIME_OF_DAY`, `TOD`, `DATE_AND_TIME`, `DT`, `STRING`, `WSTRING`
- **Literals**: Integer (`123`, `16#FF`, `8#77`, `2#1010`), real (`1.5`, `1.0E+3`), time (`T#1s`, `TIME#500ms`), date, string (`'text'`), boolean (`TRUE`, `FALSE`)
- **Comments**: `(* block *)`, `// line`, nested block comments
- **Addresses**: `%IX0.0`, `%QW1`, `%MD10`, etc.
- **Test keywords**: `TEST`, `END_TEST`, `SETUP`, `END_SETUP`, `TEARDOWN`, `END_TEARDOWN`
- **Test built-in functions**: `ASSERT_EQ`, `ASSERT_NEQ`, `ASSERT_TRUE`, `ASSERT_FALSE`, `ASSERT_GT`, `ASSERT_LT`, `ASSERT_GE`, `ASSERT_LE`, `ASSERT_NEAR`
- **Test statements**: `MOCK`, `MOCK_FUNCTION`, `MOCK_VERIFY_CALLED`, `MOCK_VERIFY_CALL_COUNT`, `RETURNS`, `ADVANCE_TIME`

### Phase 1.3 — Language Client

**`vscode-extension/client/src/extension.ts`:**

Minimal client that:
1. Resolves the server module path (`../server/src/server.js`)
2. Creates a `LanguageClient` with `TransportKind.ipc`
3. Registers for `structured-text` language ID
4. Sets `TextDocumentSyncKind.Full` (we always send the full document)
5. Starts the client on activation, stops on deactivation

```typescript
import { ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath("out/server/src/server.js");
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "structured-text" }],
  };
  client = new LanguageClient("strucpp", "STruC++", serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
```

### Phase 1.4 — Language Server Core + Diagnostics

**`vscode-extension/server/src/server.ts`:**

The server skeleton:
1. Creates LSP `connection` and `TextDocuments` manager
2. On `initialize`: returns `ServerCapabilities` (starting with just `textDocumentSync: Full`)
3. On document change (debounced 400ms): calls the document manager to re-analyze
4. Pushes diagnostics after analysis

**`vscode-extension/server/src/document-manager.ts`:**

The central cache that manages per-file analysis state.

```typescript
interface DocumentState {
  uri: string;
  version: number;
  source: string;
  analysisResult?: AnalysisResult; // from compiler's analyze()
}
```

Core responsibilities:
- Maintains `Map<uri, DocumentState>`
- On file change: calls `analyze(source, options)` from the compiler
- For multi-file projects: discovers all `.st` files in the workspace, passes them via `additionalSources`
- Exposes `getState(uri)` for other handlers to query AST / symbol tables / errors
- Handles workspace folder changes (re-discover files)

**`vscode-extension/server/src/diagnostics.ts`:**

Maps `CompileError[]` → LSP `Diagnostic[]`:

```typescript
function toLspDiagnostic(error: CompileError): Diagnostic {
  return {
    range: {
      start: { line: error.line - 1, character: error.column - 1 },
      end: {
        line: (error.endLine ?? error.line) - 1,
        character: (error.endColumn ?? error.column) - 1,
      },
    },
    severity: mapSeverity(error.severity),
    source: "strucpp",
    message: error.message,
    code: error.code,
  };
}
```

### Phase 1.5 — Testing Infrastructure

Set up all three test levels from the start so every subsequent phase adds tests alongside features.

**Unit test setup (`vscode-extension/tests/unit/`):**
- Configure Vitest with `vscode-extension/vitest.config.ts`
- Add `vscode-languageserver-textdocument` and `vscode-languageserver-types` as dev deps
- Write initial tests:
  - `diagnostics.test.ts` — CompileError → Diagnostic mapping, severity, range calculation, 1-indexed → 0-indexed conversion
  - `document-manager.test.ts` — cache hit/miss, re-analysis on version change

**Grammar test setup (`vscode-extension/tests/grammar/`):**
- Add `vscode-tmgrammar-test` as dev dep
- Write grammar assertion files:
  - `keywords.test.st` — all keyword categories (control flow, VAR blocks, POU declarations, OOP, test)
  - `literals.test.st` — integer bases, reals, time, date, string, boolean
  - `comments.test.st` — line, block, nested
  - `test-syntax.test.st` — TEST/END_TEST, ASSERT_*, MOCK_*, ADVANCE_TIME, SETUP/TEARDOWN
- Generate initial snapshots for regression detection

**Integration test setup (`vscode-extension/tests/integration/`):**
- Add `@vscode/test-cli` and `@vscode/test-electron` as dev deps
- Configure `.vscode-test.mjs`
- Write smoke tests:
  - `activation.test.ts` — extension activates on `.st` file
  - `diagnostics.test.ts` — errors appear in Problems panel

**Scripts added to `vscode-extension/package.json`:**
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:grammar": "vscode-tmgrammar-test \"tests/grammar/**/*.test.st\"",
  "test:grammar:snap": "vscode-tmgrammar-snap \"tests/grammar/snapshots/*.st\"",
  "test:integration": "vscode-test",
  "test:all": "npm run test && npm run test:grammar && npm run test:integration"
}
```

### Phase 1 Deliverables

- `.st` files open with syntax coloring
- Parse and semantic errors appear as red squiggles
- Warnings appear as yellow squiggles
- Bracket matching, auto-closing pairs, code folding work
- Error messages in the Problems panel with file/line/column

---

## Phase 2 — Document Symbols + Hover + Go to Definition

**Goal:** Navigation and information features. Requires Phase 0 (AST utilities, type exports) and Phase 1 (server infrastructure).

### Phase 2.1 — Document Symbols (Outline Panel)

**`vscode-extension/server/src/symbols.ts`:**

Walk the `CompilationUnit` and produce a hierarchical `DocumentSymbol[]`:

```
PROGRAM Main                    → SymbolKind.Module
  ├── VAR counter : INT         → SymbolKind.Variable
  ├── VAR timer1 : TON          → SymbolKind.Variable
FUNCTION_BLOCK MotorController  → SymbolKind.Class
  ├── VAR_INPUT enable : BOOL   → SymbolKind.Property
  ├── VAR_OUTPUT running : BOOL → SymbolKind.Property
  ├── METHOD Start              → SymbolKind.Method
  ├── PROPERTY Speed : INT      → SymbolKind.Property
FUNCTION CalculateCRC           → SymbolKind.Function
  ├── VAR_INPUT data : ARRAY    → SymbolKind.Variable
TYPE MotorState : (STOPPED...)  → SymbolKind.Enum
  ├── STOPPED                   → SymbolKind.EnumMember
  ├── RUNNING                   → SymbolKind.EnumMember
TYPE Point : STRUCT             → SymbolKind.Struct
  ├── x : REAL                  → SymbolKind.Field
  ├── y : REAL                  → SymbolKind.Field
INTERFACE IRunnable             → SymbolKind.Interface
  ├── METHOD Run                → SymbolKind.Method
```

Each symbol's `range` comes from the declaration's `sourceSpan`, and `selectionRange` is the name token's span.

Also implement `workspace/symbol` for cross-file search (Ctrl+T).

### Phase 2.2 — Hover Provider

**`vscode-extension/server/src/hover.ts`:**

On hover request:
1. Use `findNodeAtPosition()` to find the AST node under the cursor
2. Based on node kind, produce hover content:

| Node Kind | Hover Content |
|---|---|
| `VariableExpression` | `VAR name : TYPE` + scope info (local/input/output/global) + initial value if constant |
| `FunctionCallExpression` | Function signature: `FUNCTION name(params) : RETURN_TYPE` |
| `MethodCallExpression` | Method signature with visibility and FB context |
| `MemberAccessExpression` | Field type from struct/FB resolution via `resolveFieldType()` |
| `LiteralExpression` | Literal value + resolved type |
| `TypeReference` (in declarations) | Type details: struct fields, enum values, array dimensions |
| Standard function call | Full signature from `StdFunctionRegistry` with parameter constraints |
| FB instance variable | FB type info: list of inputs/outputs from `FunctionBlockSymbol` |

Format as markdown code blocks with ST syntax:
```markdown
```structured-text
VAR_INPUT enable : BOOL; (* Motor enable signal *)
```
Declared in: FUNCTION_BLOCK MotorController
```

### Phase 2.3 — Go to Definition

**`vscode-extension/server/src/definition.ts`:**

On definition request:
1. Find the AST node at cursor position
2. Resolve what it refers to:

| Cursor On | Jump Target |
|---|---|
| Variable name in expression | `VarDeclaration.sourceSpan` in the declaring `VAR` block |
| Function call name | `FunctionDeclaration.sourceSpan` (name token) |
| FB instance type name | `FunctionBlockDeclaration.sourceSpan` |
| Method call name | `MethodDeclaration.sourceSpan` in the FB |
| Type name in declaration | `TypeDeclaration.sourceSpan` |
| Enum value (e.g., `State.RUNNING`) | The enum type declaration |
| Interface name in `IMPLEMENTS` | `InterfaceDeclaration.sourceSpan` |
| `EXTENDS` base FB | `FunctionBlockDeclaration.sourceSpan` of the parent |
| Member access (`fb.input`) | The `VarDeclaration` of that member in the FB |

For library symbols (no source): show the library manifest information in a hover peek instead of navigating.

Also implement `textDocument/typeDefinition`: when on a variable, jump to its type declaration (not its variable declaration).

### Phase 2.4 — Breadcrumbs + Scope Context

Breadcrumbs work automatically once document symbols are implemented. The scope chain displayed will be:

```
Main.st > FUNCTION_BLOCK MotorController > METHOD Start > VAR localVar
```

### Phase 2.5 — Tests

**Unit tests:**
- `symbols.test.ts` — PROGRAM/FB/FUNCTION/TYPE/INTERFACE → correct `DocumentSymbol` hierarchy and kinds; test files produce TEST/SETUP/TEARDOWN symbols
- `hover.test.ts` — hover on variable → type info; hover on function call → signature; hover on FB member → member type; hover on ASSERT_EQ → assert signature
- `definition.test.ts` — variable → declaration; function call → function def; type name → type def; cross-file navigation via `sourceSpan.file`

**Integration tests:**
- `navigation.test.ts` — `vscode.executeDefinitionProvider` returns correct location; `vscode.executeHoverProvider` returns non-empty content

### Phase 2 Deliverables

- Outline panel shows all POUs, variables, methods, types (including TEST blocks in test files)
- Ctrl+T searches symbols across all open files
- Hover shows type information, function signatures, FB member lists
- F12 (Go to Definition) navigates to declarations
- Breadcrumbs show current scope context

---

## Phase 3 — Autocomplete + Signature Help

**Goal:** Intelligent code completion and parameter hints. Requires Phase 2 (symbol resolution, position utilities).

### Phase 3.1 — Keyword Completion

Trigger: typing at statement/declaration position.

Provide context-aware keywords:
- **Top level**: `PROGRAM`, `FUNCTION_BLOCK`, `FUNCTION`, `TYPE`, `INTERFACE`, `CONFIGURATION`, `VAR_GLOBAL`
- **Inside POU, before body**: `VAR`, `VAR_INPUT`, `VAR_OUTPUT`, `VAR_IN_OUT`, `VAR_TEMP`, `VAR_EXTERNAL`
- **Inside VAR block**: type names (elementary + user-defined)
- **Inside body (statement position)**: `IF`, `FOR`, `WHILE`, `REPEAT`, `CASE`, `RETURN`, `EXIT`, variable names
- **After IF/WHILE**: expression-valid tokens

Include snippet completions for common patterns:
```
IF ${1:condition} THEN
    ${2}
END_IF;
```

```
FOR ${1:i} := ${2:0} TO ${3:10} DO
    ${4}
END_FOR;
```

```
FUNCTION_BLOCK ${1:Name}
VAR_INPUT
    ${2}
END_VAR
VAR_OUTPUT
    ${3}
END_VAR
VAR
    ${4}
END_VAR
    ${5}
END_FUNCTION_BLOCK
```

### Phase 3.2 — Symbol Completion

Trigger: typing an identifier in expression or statement context.

Provide completions from the current scope chain:
1. Local variables (current function/FB/program)
2. Input/output/in-out variables
3. Global variables
4. Functions (user-defined + standard library from `StdFunctionRegistry.getAll()`)
5. Function block types (for instantiation)
6. User-defined types (for type annotations)
7. Enum values
8. Constants

Each completion item includes:
- `label`: symbol name
- `kind`: mapped from symbol kind (Variable, Function, Class, Interface, Enum, etc.)
- `detail`: type signature (e.g., `INT`, `FUNCTION(x: INT) : REAL`)
- `documentation`: additional info (scope, declaration location, description)
- `sortText`: prioritize local > input/output > global > library

### Phase 3.3 — Member Completion (Dot-Triggered)

Trigger character: `.`

When the user types `myFB.`:
1. Find the expression before the dot
2. Resolve its type
3. If it's a `FunctionBlockType`: list inputs, outputs, in-outs, methods, properties
4. If it's a `StructType`: list fields
5. If it's an enum type name (e.g., `MotorState.`): list enum values

Each member includes its type in `detail` and its direction (INPUT/OUTPUT) in `documentation`.

### Phase 3.4 — Type Completion (Colon-Triggered)

Trigger character: `:`

After `: ` in a variable declaration, complete with:
1. Elementary types (`BOOL`, `INT`, `REAL`, `TIME`, `STRING`, etc.)
2. User-defined types (structs, enums, aliases)
3. Function block types
4. `ARRAY[..] OF` snippet
5. `REF_TO` / `POINTER_TO` prefix

### Phase 3.5 — Signature Help

**`vscode-extension/server/src/signature-help.ts`:**

Trigger characters: `(`, `,`

On `(` after a function name or FB invocation:
1. Resolve the function/FB being called
2. Build `SignatureInformation` from parameters:

For standard functions (from `StdFunctionRegistry`):
```
ABS(IN: ANY_NUM) : ANY_NUM
```

For user functions (from `FunctionSymbol`):
```
CalculateCRC(data: ARRAY[0..255] OF BYTE, length: INT) : DWORD
```

For FB invocations (named parameters):
```
TON(IN := BOOL, PT := TIME)
  → Q : BOOL, ET : TIME
```

Track `activeParameter` by counting commas before the cursor position.

### Phase 3.6 — Tests

**Unit tests:**
- `completion.test.ts` — keyword completion at statement position; symbol completion in expression context; dot-triggered member completion for FB and struct; colon-triggered type completion; test-file-specific: ASSERT_*/MOCK_*/ADVANCE_TIME completion inside TEST blocks; snippet expansion verification
- `signature-help.test.ts` — function call → parameter signatures; FB invocation → named parameters; standard function → constraint display; ASSERT_EQ/ASSERT_NEAR → correct arity and parameter names; active parameter tracking with comma counting

**Integration tests:**
- `completion.test.ts` — `vscode.executeCompletionItemProvider` returns items at various positions

### Phase 3 Deliverables

- Context-aware keyword and snippet completion
- Variable/function/type completion from scope chain
- Dot-triggered member completion for FBs and structs
- Colon-triggered type completion in declarations
- Parameter hints when typing function/FB calls
- Standard library functions with full signature info
- Test file completion: ASSERT_*, MOCK_*, ADVANCE_TIME, TEST/SETUP/TEARDOWN snippets

---

## Phase 4 — Find References + Rename + Semantic Tokens

**Goal:** Refactoring support and accurate highlighting. Requires Phase 2 (definition resolution).

### Phase 4.1 — Find All References

**`vscode-extension/server/src/references.ts`:**

Uses `collectReferences()` from the compiler's `ast-utils.ts`:

1. Identify the symbol at cursor (same as go-to-definition)
2. Walk all ASTs in the workspace
3. Collect every node that refers to the same symbol:
   - `VariableExpression` nodes matching the variable name in the same scope
   - `FunctionCallExpression` nodes matching a function name
   - Type references matching a type name
   - Method calls matching a method name on the same FB type
4. Return `Location[]` for all matches

Handle scope awareness: a local variable `x` in `PROGRAM A` is different from `x` in `PROGRAM B`. Use the symbol table's scope hierarchy to disambiguate.

### Phase 4.2 — Rename Symbol

Build on find-all-references:
1. Validate the rename is legal (not a keyword, not a standard function)
2. Find all references (including the declaration)
3. Return `WorkspaceEdit` replacing all occurrences
4. Support `prepareRename` to show the editable range

Cross-file rename: since all files are merged into one `CompilationUnit` with `sourceSpan.file` preserved, references across files are automatically found.

### Phase 4.3 — Semantic Tokens

**`vscode-extension/server/src/semantic-tokens.ts`:**

Walk the AST and emit semantic tokens that override TextMate grammar coloring for more accuracy:

| AST Context | Token Type | Token Modifier |
|---|---|---|
| `ProgramDeclaration.name` | `class` | `declaration` |
| `FunctionDeclaration.name` | `function` | `declaration` |
| `FunctionBlockDeclaration.name` | `class` | `declaration` |
| `MethodDeclaration.name` | `method` | `declaration` |
| `PropertyDeclaration.name` | `property` | `declaration` |
| `InterfaceDeclaration.name` | `interface` | `declaration` |
| `VarDeclaration.name` (CONSTANT) | `variable` | `readonly, declaration` |
| `VarDeclaration.name` (VAR) | `variable` | `declaration` |
| `VarDeclaration.name` (VAR_INPUT) | `parameter` | `declaration` |
| `VariableExpression` → resolves to constant | `variable` | `readonly` |
| `VariableExpression` → resolves to parameter | `parameter` | — |
| `VariableExpression` → resolves to local/global | `variable` | — |
| `FunctionCallExpression.name` | `function` | — |
| `MethodCallExpression.methodName` | `method` | — |
| `MemberAccessExpression.memberName` | `property` | — |
| `TypeReference.name` (elementary) | `type` | `defaultLibrary` |
| `TypeReference.name` (user-defined) | `type` | — |
| `TypeReference.name` (FB) | `class` | — |
| `LiteralExpression` (numeric) | `number` | — |
| `LiteralExpression` (string) | `string` | — |
| Enum value in expression | `enumMember` | — |

**Important**: The lexer's `uppercaseSource()` does not affect token positions (uppercasing preserves string length). However, the original source text is what's displayed in the editor — semantic tokens use character offsets which match.

### Phase 4.4 — Tests

**Unit tests:**
- `references.test.ts` — find all references to a variable (same scope); cross-scope: local `x` in PROGRAM A vs `x` in PROGRAM B are distinct; function references across files; FB type references
- `references.test.ts` (rename) — rename produces correct `WorkspaceEdit` across multiple files; rejects renaming keywords and standard functions
- `semantic-tokens.test.ts` — AST → token array: verify correct token types for declarations vs usages; verify modifiers (readonly for constants, declaration for definitions); verify test keywords get correct types (ASSERT_* as function+defaultLibrary)

### Phase 4 Deliverables

- Shift+F12 shows all references to a symbol
- F2 renames a symbol across all files
- Semantic token highlighting distinguishes variables, parameters, constants, types, functions, methods

---

## Phase 5 — Code Actions + Formatting

**Goal:** Quick fixes and consistent formatting.

### Phase 5.1 — Code Actions (Quick Fixes)

**`vscode-extension/server/src/code-actions.ts`:**

Map common errors to automated fixes:

| Error Pattern | Quick Fix |
|---|---|
| `Undeclared variable 'X'` | "Declare variable X" — insert `X : <inferred_type>;` in nearest VAR block |
| Missing `;` (parse error) | "Add missing semicolon" — insert `;` at error location |
| Type mismatch warning (narrowing) | "Add explicit conversion" — wrap with `TYPE_TO_TYPE(expr)` |
| Unknown type `X` | "Create type X" — insert `TYPE X : STRUCT ... END_STRUCT; END_TYPE` template |
| Unused variable warning | "Remove unused variable" — delete the declaration line |
| Missing `END_IF` / `END_FOR` / etc. | "Add closing keyword" — insert the matching END_ keyword |

Each code action is a `WorkspaceEdit` with targeted text insertions/replacements.

### Phase 5.2 — Document Formatting

**`vscode-extension/server/src/formatting.ts`:**

A simple AST-based formatter:
- Consistent indentation (configurable: tabs vs spaces, indent size)
- Uppercase keywords (`if` → `IF`, `end_if` → `END_IF`)
- Consistent spacing around `:=`, operators, after `,`
- Blank line between POU declarations
- Align `VAR` block declarations (optional)

Implementation approach: walk the AST, emit formatted source text using the original token values (preserving comments via token stream). This is a fairly involved feature — consider implementing a minimal version first (indentation + keyword case) and expanding later.

### Phase 5.3 — Tests

**Unit tests:**
- `code-actions.test.ts` — undeclared variable → "Declare variable" action with correct VAR block insertion; type mismatch → "Add conversion" action wrapping expression; missing semicolon → "Add semicolon" action; each action produces valid `WorkspaceEdit`
- `formatting.test.ts` — indentation normalization; keyword case normalization; spacing around operators; preservation of comments

### Phase 5 Deliverables

- Lightbulb quick fixes for common errors
- Shift+Alt+F formats the document with consistent style

---

## Phase 6 — Compilation Commands + Build Integration

**Goal:** Compile and build ST projects directly from VSCode. This phase wires the existing STruC++ CLI capabilities into VSCode commands.

### Phase 6.1 — Compile Command

Register VSCode commands accessible from the Command Palette and keybindings:

**`strucpp.compile`** — Compile current file to C++
- Calls `compile()` with the current file's source
- Outputs `.cpp` and `.hpp` to a configurable output directory
- Shows success/failure notification
- On error: focuses the Problems panel

**`strucpp.compileWorkspace`** — Compile all `.st` files as a project
- Discovers all `.st` files in the workspace
- Uses `additionalSources` for multi-file compilation
- Outputs generated C++ files

### Phase 6.2 — Build Command (REPL Binary)

**`strucpp.build`** — Build executable binary
- Calls the equivalent of `strucpp --build` programmatically
- Uses the existing `generateReplMain()` + g++ compilation pipeline
- Shows build progress in a VSCode terminal or output channel
- Reports compilation errors from g++ in the output channel

**`strucpp.buildAndRun`** — Build and launch REPL
- Build the binary, then launch it in an integrated terminal
- The REPL runs interactively in the terminal

### Phase 6.3 — Task Provider

Implement a VSCode `TaskProvider` for STruC++:

```json
{
  "type": "strucpp",
  "command": "compile",
  "file": "${file}",
  "output": "${workspaceFolder}/generated"
}
```

This enables:
- Tasks in `tasks.json`
- Problem matchers that parse g++ error output
- Build-on-save workflows
- Integration with VSCode's build system (Ctrl+Shift+B)

### Phase 6.4 — Extension Settings

Add configuration via `contributes.configuration`:

```json
{
  "strucpp.libraryPaths": { "type": "array", "default": [], "description": "Additional .stlib library search paths (absolute or workspace-relative)" },
  "strucpp.autoDiscoverLibraries": { "type": "boolean", "default": true, "description": "Automatically discover .stlib files in workspace libs/ directories" },
  "strucpp.outputDirectory": { "type": "string", "default": "./generated", "description": "C++ output directory" },
  "strucpp.gppPath": { "type": "string", "default": "g++", "description": "Path to g++ compiler" },
  "strucpp.ccPath": { "type": "string", "default": "cc", "description": "Path to C compiler" },
  "strucpp.cxxFlags": { "type": "string", "default": "", "description": "Extra C++ compiler flags" },
  "strucpp.globalConstants": { "type": "object", "default": {}, "description": "Global constants (-D NAME=VALUE)" },
  "strucpp.autoAnalyze": { "type": "boolean", "default": true, "description": "Analyze on file change" },
  "strucpp.analyzeDelay": { "type": "number", "default": 400, "description": "Debounce delay in ms" },
  "strucpp.formatOnSave": { "type": "boolean", "default": false, "description": "Format ST files on save" }
}
```

The server reads these settings via `workspace/configuration` requests and passes them to the `DocumentManager`. Settings changes trigger re-analysis of all open documents.

### Phase 6.5 — Workspace Library Discovery

Automatic discovery of `.stlib` library files in the user's workspace, so that user-defined or third-party libraries are picked up without manual configuration.

**Library resolution order (all paths are merged and deduplicated):**

1. **Bundled libraries** — The `libs/` directory shipped with the strucpp package (provides `iec-standard-fb.stlib`, `oscat-basic.stlib`, etc.). Always loaded. Resolved via `findLibraryPaths()` at server startup.
2. **Workspace auto-discovery** — When `strucpp.autoDiscoverLibraries` is `true` (default), scan each workspace folder for `.stlib` files in conventional locations:
   - `{workspaceFolder}/libs/`
   - `{workspaceFolder}/libraries/`
   - `{workspaceFolder}/.stlibs/`
   - Configurable depth: scan up to 2 levels deep within these directories
   - Skip hidden directories (`.git`, `.vscode`, `node_modules`, etc.)
3. **User-configured paths** — Directories listed in `strucpp.libraryPaths`. Each entry can be:
   - An absolute path (`/home/user/my-libs/`)
   - A workspace-relative path (`./vendor/libs/`) — resolved against each workspace folder

**Implementation in `document-manager.ts`:**

```typescript
/** Discover .stlib files in conventional workspace library directories. */
discoverWorkspaceLibraries(): string[] {
  const libDirs: string[] = [];
  const conventionalNames = ["libs", "libraries", ".stlibs"];
  for (const folder of this.workspaceFolders) {
    for (const name of conventionalNames) {
      const candidate = path.join(folder, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        libDirs.push(candidate);
      }
    }
  }
  return libDirs;
}
```

**Refresh triggers — library paths are recomputed and documents re-analyzed when:**
- Workspace folders are added/removed (`workspace/didChangeWorkspaceFolders`)
- A `.stlib` file is created, changed, or deleted in the workspace (register a `FileSystemWatcher` for `**/*.stlib`)
- The user changes `strucpp.libraryPaths` or `strucpp.autoDiscoverLibraries` in settings (`workspace/didChangeConfiguration`)
- The server initializes (`onInitialize`)

**Deduplication:** All library path sources are merged into a `Set<string>` (by resolved absolute path) before passing to `analyze()`. If the same `.stlib` appears in both bundled and workspace directories, it is loaded only once.

**Status bar indicator (optional):** Show the number of loaded libraries in the status bar (e.g., "STruC++ | 4 libs") to give users visibility into what libraries are active.

### Phase 6.6 — Tests

**Unit tests:**
- `commands.test.ts` — compile command produces `.cpp`/`.hpp` output; build command invokes g++ with correct flags
- `library-discovery.test.ts` — workspace library discovery finds `.stlib` files in `libs/`, `libraries/`, `.stlibs/` directories; respects `autoDiscoverLibraries` setting; merges and deduplicates bundled + workspace + user-configured paths; re-discovers on workspace folder changes; ignores hidden directories

**Integration tests:**
- `commands.test.ts` — commands appear in Command Palette; compile command writes output files; settings are read from workspace configuration
- `library-discovery.test.ts` — adding a `.stlib` to workspace `libs/` triggers re-analysis; symbols from workspace libraries appear in completion/hover; removing a `.stlib` clears its symbols from analysis

### Phase 6 Deliverables

- Ctrl+Shift+B compiles ST to C++
- Command palette: Compile, Build, Build and Run
- Configurable library paths, output directory, compiler flags
- Automatic discovery of `.stlib` libraries in workspace `libs/` directories
- User-configured additional library paths via `strucpp.libraryPaths` setting
- Re-analysis on library file changes (add/remove/modify `.stlib`)
- g++ errors appear in the output channel
- Task provider for `tasks.json` integration

---

## Phase 7 — ST Unit Testing (Test Explorer Integration)

**Goal:** Full VSCode Test Explorer integration for STruC++'s test framework. Developers write `TEST`/`ASSERT_*`/`MOCK_*` in `.st` files and run them from the IDE with inline pass/fail results, gutter icons, and "Run Test" CodeLens buttons. Requires Phase 6 (build infrastructure) and Phase 1 (grammar for test keywords).

### Background: STruC++ Test Framework

STruC++ has a built-in test framework with its own lexer (`TestLexer`), parser (`testFile` rule), and code generator. Test files contain:

```structured-text
SETUP
  VAR uut : MotorController; END_VAR
  uut.speed := 0;
END_SETUP

TEST 'Motor starts on enable'
  uut.enable := TRUE;
  uut();
  ASSERT_TRUE(uut.running);
  ASSERT_GT(uut.speed, 0);
END_TEST

TEST 'Motor stops on disable'
  uut.enable := FALSE;
  uut();
  ASSERT_FALSE(uut.running);
  ASSERT_EQ(uut.speed, 0);
END_TEST

TEARDOWN
  uut.enable := FALSE;
END_TEARDOWN
```

The existing `--test` CLI pipeline: parse test files → generate `test_main.cpp` → compile with g++ → execute binary → stdout reports `[PASS]`/`[FAIL]` per test with assertion details and source locations.

**Test runner stdout format:**
```
STruC++ Test Runner v1.0

<test_motor.st>
  [PASS] Motor starts on enable
  [FAIL] Motor stops on disable
         ASSERT_EQ failed: uut.speed expected 0, got 150
         at test_motor.st:15
         Message: Speed should be zero after disable

-----------------------------------------
2 tests, 1 passed, 1 failed
```

### Phase 7.1 — TestController Setup

**`vscode-extension/client/src/test-controller.ts`:**

Register the TestController in the client extension (not the server — the Test API is a VSCode client-side API):

```typescript
const ctrl = vscode.tests.createTestController("strucpp-tests", "STruC++ Tests");

// Run profile — executes tests
ctrl.createRunProfile("Run", vscode.TestRunProfileKind.Run, runHandler, true, undefined, true);

// Debug profile — compiles with -g and launches under debugger
ctrl.createRunProfile("Debug", vscode.TestRunProfileKind.Debug, debugHandler, true);
```

The `supportsContinuousRun: true` flag enables the watch toggle in Test Explorer.

### Phase 7.2 — Test Discovery

Discover tests by parsing `.st` files for `TEST 'name'` blocks. Two discovery modes:

**Active discovery (on file open/change):**
- Listen to `workspace.onDidOpenTextDocument` and `workspace.onDidChangeTextDocument`
- When a `.st` file is opened/changed, parse it for `TEST`/`END_TEST` blocks
- Use the compiler's `parseTestFile()` to get the `TestFile` AST with exact `sourceSpan` for each test case
- If the file has no `TEST` blocks, it's not a test file — skip it

**Lazy workspace discovery (on Test Explorer expand):**
- `ctrl.resolveHandler` scans workspace for `**/*.st` files
- `FileSystemWatcher` monitors for new/changed/deleted `.st` files
- Each test file becomes a `TestItem` with `canResolveChildren: true`
- On expand: parse the file and add child `TestItem` for each `TEST` block

**Test tree structure:**
```
Test Explorer
├── test_motor.st                        ← TestItem(uri, canResolveChildren)
│   ├── Motor starts on enable           ← TestItem(range=line 7)
│   └── Motor stops on disable           ← TestItem(range=line 13)
├── test_counter.st
│   ├── Counter increments on rising edge
│   └── Counter resets to zero
└── test_timer.st
    └── TON activates after preset time
```

Each leaf `TestItem` has:
- `uri`: the test `.st` file
- `range`: the `sourceSpan` of the `TEST` block (line of `TEST 'name'`)
- This automatically gives us **gutter icons** (green/red circles) and **"Run Test | Debug Test" CodeLens** above each test — VSCode generates these from `TestItem.range` with no extra code needed

**Associated metadata** (via `WeakMap<TestItem, TestItemData>`):
```typescript
interface TestItemData {
  kind: "file" | "test";
  filePath: string;
  testName?: string;      // the string literal from TEST 'name'
  sourceFiles?: string[]; // production .st files this test file depends on
}
```

### Phase 7.3 — Test Execution

**`runHandler(request, token)`:**

1. **Collect tests to run** — from `request.include` (specific tests) or all tests (run all)
2. **Group by file** — tests from the same file share a compilation unit
3. **For each file group:**
   a. Discover associated source `.st` files (convention: `test_foo.st` tests `foo.st`, or use workspace heuristic — all non-test `.st` files)
   b. Compile sources with `compile(source, { isTestBuild: true })`
   c. If compile fails: `run.errored(item, compileErrorMessage)` for all tests in the file
   d. Parse test files with `parseTestFile()`
   e. Generate `test_main.cpp` with `generateTestMain()`
   f. Write files to temp directory
   g. Invoke `g++` to build the test binary
   h. If g++ fails: `run.errored(item, gppErrorMessage)` for all tests
   i. Execute the test binary, capture stdout
   j. Parse stdout line-by-line using regex patterns (see below)
   k. Report results per test: `run.passed(item, duration)` or `run.failed(item, message)`

**stdout parsing** (regex patterns matching the test runner format):

```typescript
const PASS_RE  = /^  \[PASS\] (.+)$/;
const FAIL_RE  = /^  \[FAIL\] (.+?)(?:\s*\(exception: (.+)\)|\s*\(unknown exception\))?$/;
const ASSERT_RE = /^         (ASSERT_\w+ failed: .+)$/;
const LOC_RE   = /^         at (.+):(\d+)$/;
const MSG_RE   = /^         Message: (.+)$/;
const SUMMARY_RE = /^(\d+) tests?, (\d+) passed, (\d+) failed$/;
```

**Failure reporting with inline annotations:**

```typescript
const message = new vscode.TestMessage(assertionDetail);
message.location = new vscode.Location(
  vscode.Uri.file(failureFile),
  new vscode.Position(failureLine - 1, 0)  // 0-indexed
);
// For ASSERT_EQ: show diff view
if (assertType === "ASSERT_EQ" || assertType === "ASSERT_NEQ") {
  message.expectedOutput = expectedValue;
  message.actualOutput = actualValue;
}
run.failed(testItem, message);
```

This gives:
- Red gutter icon on the `TEST` line
- Inline red squiggle annotation at the failing `ASSERT_*` line with the failure message
- Diff view for equality assertions (expected vs actual side-by-side)
- Failure details in the Test Results panel

### Phase 7.4 — Continuous Run (Watch Mode)

When the user enables the watch toggle in Test Explorer:
1. `request.continuous === true` in the run handler
2. Set up a `FileSystemWatcher` on `**/*.st`
3. On any `.st` file change: re-run affected tests
4. On cancellation token: dispose the watcher

```typescript
if (request.continuous) {
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.st");
  watcher.onDidChange(uri => {
    // Find tests that depend on the changed file and re-run them
    const affected = findAffectedTests(uri);
    if (affected.length > 0) {
      const rerunRequest = new vscode.TestRunRequest(affected, undefined, request.profile, true);
      runHandler(rerunRequest, token);
    }
  });
  token.onCancellationRequested(() => watcher.dispose());
}
```

### Phase 7.5 — Test Output Panel

Use `run.appendOutput()` to stream the full test runner output to VSCode's Test Output panel with ANSI colors:

```typescript
run.appendOutput(`\x1b[32m[PASS]\x1b[0m ${testName}\r\n`);
run.appendOutput(`\x1b[31m[FAIL]\x1b[0m ${testName}\r\n`);
run.appendOutput(`       ${assertionDetail}\r\n`, failureLocation, testItem);
```

The third argument (`testItem`) associates the output with a specific test in the Results panel, so clicking the test shows its output.

### Phase 7.6 — Test File Syntax Support (LSP Integration)

Wire the existing LSP features to support test-specific constructs:

**Completion (extends Phase 3):**
- Inside `TEST` blocks: complete `ASSERT_*` with correct arity snippets:
  ```
  ASSERT_EQ(${1:actual}, ${2:expected});
  ASSERT_NEAR(${1:actual}, ${2:expected}, ${3:tolerance});
  ASSERT_TRUE(${1:condition});
  ```
- Complete `MOCK`, `MOCK_FUNCTION ... RETURNS`, `MOCK_VERIFY_CALLED()`, `MOCK_VERIFY_CALL_COUNT()`
- Complete `ADVANCE_TIME(T#${1:duration})`
- Top-level in test file: `TEST '${1:name}'\n  ${2}\nEND_TEST` snippet
- Top-level: `SETUP\n  VAR ${1} END_VAR\n  ${2}\nEND_SETUP` snippet

**Signature help (extends Phase 3):**
- `ASSERT_EQ(` → `(actual: ANY, expected: ANY [, message: STRING])`
- `ASSERT_NEAR(` → `(actual: ANY_REAL, expected: ANY_REAL, tolerance: ANY_REAL [, message: STRING])`
- `ASSERT_TRUE(` → `(condition: BOOL [, message: STRING])`
- `MOCK_VERIFY_CALL_COUNT(` → `(instance: FB, expectedCount: INT)`

**Diagnostics (extends Phase 1):**
- Wrong argument count for `ASSERT_*` calls
- `MOCK` on a non-FB instance
- `MOCK_FUNCTION` on a non-existent function
- `ADVANCE_TIME` with non-TIME expression
- Multiple `SETUP` or `TEARDOWN` blocks (only one of each allowed)

**Document symbols (extends Phase 2):**
- `TEST 'name'` → `SymbolKind.Method` (appears in outline with the test name)
- `SETUP` → `SymbolKind.Constructor`
- `TEARDOWN` → `SymbolKind.Event`

**Semantic tokens (extends Phase 4):**
- `TEST`/`END_TEST`/`SETUP`/`END_SETUP`/`TEARDOWN`/`END_TEARDOWN` → `keyword`
- `ASSERT_*` → `function` + `defaultLibrary` modifier
- `MOCK`/`MOCK_FUNCTION`/`MOCK_VERIFY_*` → `keyword`
- `ADVANCE_TIME` → `function` + `defaultLibrary` modifier
- `RETURNS` → `keyword` (only in `MOCK_FUNCTION` context)

### Phase 7.7 — Tests

**Unit tests:**
- `test-discovery.test.ts` — parse test `.st` fixtures → correct TestItem hierarchy; file with no TEST blocks → no items; file with SETUP/TEARDOWN → tests still discovered
- `test-result-parser.test.ts` — parse test runner stdout → correct pass/fail/error results; parse assertion details, file:line locations; handle exception cases; parse multi-file output
- `test-execution.test.ts` — mock the compile/g++/execute pipeline; verify TestRun state transitions (enqueued → started → passed/failed); verify failure messages include location

**Integration tests:**
- `test-explorer.test.ts` — Test Explorer tree populates with test items from fixture files; gutter icons appear; run a test → result shows in Test Results panel

### Phase 7 Deliverables

- Test Explorer sidebar shows all `TEST` blocks from `.st` files
- Gutter icons (green/red circles) on every `TEST` line
- "Run Test | Debug Test" CodeLens above each `TEST` block (automatic from TestItem.range)
- Click to run individual tests, files, or all tests
- Inline failure annotations at the `ASSERT_*` line that failed
- Diff view for `ASSERT_EQ` failures (expected vs actual)
- Failure details with ST file:line in Test Results panel
- Watch mode: auto-rerun affected tests on `.st` file save
- Full test output with ANSI colors in Test Output panel
- Autocomplete and signature help for ASSERT_*/MOCK_*/ADVANCE_TIME
- Diagnostics for test-specific errors (wrong arity, invalid mock targets)

---

## Phase 8 — Source-Level Debugging

**Goal:** Step-through debugging of Structured Text programs. This is the most complex phase and has two viable approaches.

### Approach Analysis

**Option A: GDB/LLDB on generated C++ with `#line` directives**
- Emit `#line N "file.st"` directives in generated C++
- Compile with `-g` flag
- GDB/LLDB shows ST source lines instead of C++ lines
- Breakpoints set on ST lines map to C++ lines via `#line`
- VSCode's built-in C++ debug adapter (cppdbg / CodeLLDB) handles the UI
- **Pros**: Leverages mature debugger infrastructure; variable inspection "just works" for scalar types; no custom debug adapter needed
- **Cons**: Variable names are C++ names (mangled for IECVar); struct inspection shows C++ layout, not ST layout; requires `#line` directive implementation in codegen

**Option B: Custom Debug Adapter using REPL infrastructure**
- Build on the existing REPL's `VarDescriptor` / `ProgramDescriptor` infrastructure
- Implement a DAP (Debug Adapter Protocol) server that controls program execution
- Breakpoints → REPL `step`/`run` commands
- Variable inspection → REPL `get`/`vars` commands
- **Pros**: Shows ST-native variable names and types; scan-cycle-aware stepping
- **Cons**: Significant custom DAP implementation; no C++ source-level debugging; limited to variables the REPL exposes (scalars only currently)

**Recommendation**: **Option A (GDB/LLDB with `#line`)** for the initial implementation. It provides the most capable debugging with the least custom code. The existing `lineMap` infrastructure proves the compiler already tracks ST→C++ line mappings — `#line` directives are the standard way to expose this to debuggers.

### Phase 8.1 — Implement `#line` Directive Emission

**Changes to `src/backend/codegen.ts`:**

The `lineDirectives` option already exists but is unimplemented. Implement it:

```cpp
// Generated C++ with #line directives:
#line 15 "motor_control.st"
    Motor_Enable = Start_Button.IsPressed() && !Emergency_Stop;
#line 16 "motor_control.st"
    IF Motor_Enable THEN
#line 17 "motor_control.st"
        Speed_Setpoint = Calculate_Speed(Demand_Percent);
```

Use `recordLineMapping()` calls that already exist — wherever a line mapping is recorded, also emit a `#line` directive if the option is enabled.

### Phase 8.2 — Debug Build Command

**`strucpp.debugBuild`** — Compile with debug symbols:
- Sets `lineDirectives: true` in compile options
- Passes `-g -O0` to g++ (debug symbols, no optimization)
- Outputs the binary to a known location

### Phase 8.3 — Launch Configuration

Provide a `DebugConfigurationProvider` that generates `launch.json` entries:

```json
{
  "name": "Debug ST Program",
  "type": "cppdbg",
  "request": "launch",
  "program": "${workspaceFolder}/generated/program",
  "args": [],
  "cwd": "${workspaceFolder}",
  "MIMode": "lldb",
  "sourceFileMap": {
    ".": "${workspaceFolder}"
  }
}
```

The `#line` directives make GDB/LLDB understand that breakpoints on `.st` files correspond to lines in the compiled binary. The user sets breakpoints in their `.st` files and the debugger stops at those lines.

### Phase 8.4 — Variable Display Enhancement (Optional)

For better variable inspection during debugging, add a GDB/LLDB pretty-printer script (Python) that:
- Displays `IECVar<T>` as just its value (hides the wrapper)
- Displays `IEC_STRING<N>` as a string
- Displays `Array1D<T, L, U>` with ST-style indices

This is a `.gdbinit` / `.lldbinit` script that the extension can auto-generate.

### Phase 8.5 — Breakpoint Validation

Implement `BreakpointLocationsProvider`:
- Not all ST lines map to executable C++ lines
- Use the `lineMap` to identify which ST lines have corresponding C++ code
- Gray out / move breakpoints to valid lines

### Phase 8 Deliverables

- F5 builds with debug symbols and launches the debugger
- Breakpoints in `.st` files work
- Step over/into/out steps through ST source lines
- Variable inspection shows program state
- Watch expressions work for ST variables
- GDB/LLDB pretty-printers for IECVar types (optional enhancement)

---

## Implementation Priority and Dependencies

```
Phase 0 (Compiler API)
    │
    ├── Phase 1 (Scaffold + Grammar + Diagnostics)
    │       │
    │       ├── Phase 2 (Symbols + Hover + Go-to-Def)
    │       │       │
    │       │       ├── Phase 3 (Autocomplete + Signature Help)
    │       │       │
    │       │       ├── Phase 4 (References + Rename + Semantic Tokens)
    │       │       │
    │       │       └── Phase 5 (Code Actions + Formatting)
    │       │
    │       └── Phase 6 (Compile/Build Commands)
    │               │
    │               ├── Phase 7 (ST Unit Testing — Test Explorer)
    │               │
    │               └── Phase 8 (Source-Level Debugging)
```

Phases 3, 4, and 5 can be developed in parallel after Phase 2.
Phase 6 can be developed in parallel after Phase 1.
Phase 7 (testing) and Phase 8 (debugging) both depend on Phase 6 (build infrastructure) and can be developed in parallel with each other.
Phase 7 also benefits from Phase 3 (completion/signature help for ASSERT_*/MOCK_*) but can ship without it.

---

## Estimated Total Effort

Estimates include writing tests for each phase (unit + grammar + integration as applicable).

| Phase | Description | Feature | Tests | Total |
|---|---|---|---|---|
| Phase 0 | Compiler API expansion | 2-3 days | 1 day | 3-4 days |
| Phase 1 | Scaffold + grammar + diagnostics + test infra | 4-5 days | 2 days | 6-7 days |
| Phase 2 | Symbols + hover + go-to-definition | 3-4 days | 1.5 days | 4.5-5.5 days |
| Phase 3 | Autocomplete + signature help | 4-5 days | 2 days | 6-7 days |
| Phase 4 | References + rename + semantic tokens | 4-5 days | 2 days | 6-7 days |
| Phase 5 | Code actions + formatting | 3-4 days | 1.5 days | 4.5-5.5 days |
| Phase 6 | Compile/build commands + settings | 3-4 days | 1 day | 4-5 days |
| Phase 7 | ST unit testing (Test Explorer) | 5-6 days | 2 days | 7-8 days |
| Phase 8 | Source-level debugging (GDB/LLDB + `#line`) | 5-7 days | 1 day | 6-8 days |
| **Total** | | | | **~47-57 days** |

MVP (Phases 0-2) delivers a usable IDE in ~13-16 days.
Full extension (Phases 0-6) with core editing features in ~33-41 days.
With ST testing in ~40-49 days.
Complete with debugging in ~47-57 days.

### Test Coverage Targets

| Test Level | Target |
|---|---|
| Unit tests (Vitest) | 85%+ line coverage on server modules |
| Grammar tests | All keyword categories, literal types, comments, test syntax |
| Integration tests | Smoke coverage of every LSP capability registered |

---

## File Inventory

### New files to create

```
vscode-extension/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .vscode-test.mjs
├── esbuild.mjs
├── language-configuration.json
├── .vscodeignore
├── syntaxes/
│   └── st.tmLanguage.json
├── client/
│   └── src/
│       ├── extension.ts
│       ├── test-controller.ts       # TestController + discovery + execution
│       └── test-result-parser.ts    # Parse test runner stdout → results
├── server/
│   └── src/
│       ├── server.ts
│       ├── document-manager.ts
│       ├── diagnostics.ts
│       ├── position-utils.ts
│       ├── symbols.ts
│       ├── hover.ts
│       ├── definition.ts
│       ├── references.ts
│       ├── completion.ts
│       ├── signature-help.ts
│       ├── semantic-tokens.ts
│       ├── code-actions.ts
│       ├── formatting.ts
│       └── commands.ts
└── tests/
    ├── fixtures/
    │   ├── simple-program.st
    │   ├── function-block.st
    │   ├── multi-type.st
    │   ├── errors.st
    │   ├── test-file.st
    │   └── multi-file/
    │       ├── main.st
    │       └── types.st
    ├── unit/
    │   ├── diagnostics.test.ts
    │   ├── document-manager.test.ts
    │   ├── symbols.test.ts
    │   ├── hover.test.ts
    │   ├── definition.test.ts
    │   ├── references.test.ts
    │   ├── completion.test.ts
    │   ├── signature-help.test.ts
    │   ├── semantic-tokens.test.ts
    │   ├── code-actions.test.ts
    │   ├── formatting.test.ts
    │   ├── commands.test.ts
    │   ├── test-discovery.test.ts
    │   ├── test-result-parser.test.ts
    │   └── test-execution.test.ts
    ├── grammar/
    │   ├── keywords.test.st
    │   ├── literals.test.st
    │   ├── comments.test.st
    │   ├── test-syntax.test.st
    │   └── snapshots/
    │       └── full-coverage.st
    └── integration/
        ├── activation.test.ts
        ├── diagnostics.test.ts
        ├── navigation.test.ts
        ├── completion.test.ts
        ├── commands.test.ts
        └── test-explorer.test.ts
```

### Compiler files to modify (Phase 0 only)

```
src/index.ts              — Add type re-exports + analyze() function
src/types.ts              — Add endLine/endColumn to CompileError
src/ast-utils.ts          — NEW: Position utilities (findNodeAtPosition, walkAST, etc.)
src/semantic/type-checker.ts  — Thread sourceSpan into CompileError
src/semantic/analyzer.ts      — Thread sourceSpan into CompileError
src/backend/codegen.ts        — Implement #line directive emission (Phase 8)
```

No existing compiler behavior is changed. All modifications are additive.
