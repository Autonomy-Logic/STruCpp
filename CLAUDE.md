# STruC++

STruC++ is an IEC 61131-3 Structured Text to C++14 compiler written in TypeScript.

## Autonomy development rules

These rules are identical in every Autonomy repository and are maintained in the MisterFlow plugin
(`Autonomy-Logic/skills`, `plugins/autonomy/harness/repository-rules.md`). Change them there, not here.

- Tracked work starts with `autonomy:misterflow`: load it yourself before changing product code, fixing a
  bug, implementing or preparing a PR, even when no Jira key was mentioned. Only answering questions and typo or wording fixes that
  change no behaviour are exempt. "There is no ticket" or "skip the process" does not make product
  work untracked: offer to create the task instead of changing code. This file describes only this
  repository's commands, architecture and code conventions; for process, MisterFlow and the Confluence
  process pages win over anything written here.
- Knowledge boundary: when data is missing or uncertain, say there is not enough information to answer
  reliably. Never fill a gap with a plausible assumption. Keep verified facts, inferences and missing
  data visibly separate, and say which is which.
- Language: answer in the developer's language. Jira, Confluence and GitHub text is always English.
- Branches: `feature/<KEY>-<slug>` for demands and `bugfix/<KEY>-<slug>` for bugs, created from the
  integration branch named below. A production hotfix is a `bugfix/<KEY>-<slug>` branch from `main` and
  a PR. Never commit or push directly to the integration branch or `main`. One Jira key per branch: work
  for another key starts on its own branch before any edit. The key goes in the branch name and the PR
  title, never in commit messages, code or comments.
- Commits: never commit on your own initiative. Propose the commit at a natural checkpoint, such as a
  finished and verified plan phase, and make it only after the developer confirms. Commit and push are
  separate commands, each confirmed on its own, never chained; opening a PR and merging each need their
  own confirmation too. When asked for a commit message or a commit, do not edit files you were not
  asked to change: report problems, such as a forbidden comment, and let the developer decide.
- Scope: a rewrite or refactor beyond the current task is a new demand, proposed as a separate task and
  never mixed into the current branch. Never stash, reset, `checkout -- .` or otherwise discard the
  developer's changes, and never install anything outside the repository, without asking.
- Tests: every demand ships with unit tests, an end-to-end test and a manual test by the developer, with
  evidence for each before any PR is opened, a draft PR included. Where this repository has no
  interface of its own, the end-to-end test runs through the interface or protocol that uses it. A
  repository with no code to unit test, such as documentation or local tooling scripts, uses its own
  validation checks in place of unit tests.
- Typing: `any` in TypeScript and `typing.Any` in Python are forbidden. Use concrete types, or `unknown`
  or `object` narrowed where the data enters.
- Comments: technical and minimal, at most 256 characters each; formal API documentation (JSDoc,
  docstrings, Doxygen) may be longer. Never write business rules, product strategy or rationale, Jira
  keys, names of people or customers, internal links or anything sensitive in a comment. Review the
  comments in the changed files before every commit.

Integration branch: `development`. Jira project: `RTOP`.

## Build & Development Commands

```bash
npm ci                    # Install dependencies
npm run build             # scripts/rebuild-libs.mjs: tsc to dist/, then rebuild bundled .stlib libraries
npm run build:tsc-only    # Plain tsc, no library rebuild
npm run build:bundle      # build, then bundle the CLI into dist/strucpp-bundle.cjs with esbuild
npm run dev               # Watch mode for development
npm test                  # Run all tests with Vitest
npm run test:coverage     # Coverage report (75% threshold)
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix lint issues
npm run format            # Format with Prettier
npm run format:check      # Prettier check (run in CI on main)
npm run typecheck         # Type-check without emit
npm run check:purity      # Fails if src/ outside src/node/ uses Node-only APIs
```

### Running Specific Tests

```bash
npx vitest run tests/frontend/lexer.test.ts    # Single test file
npx vitest run -t "should parse"               # Tests matching pattern
npm run test:watch                              # Watch mode
```

### C++ Compilation Tests

Tests that compile generated code (for example `tests/integration/cpp-compile.test.ts`) require `g++` (C++14). A skip is not a pass: run them with g++ installed before a PR.

## Architecture

Multi-pass compilation pipeline:

```
ST Source → Lexer → Parser (CST) → AST Builder → Project Model → Symbol Tables → Type Checker → Code Generator → C++ Output
```

### Key Directories

- `src/frontend/` - Lexer (`lexer.ts`), Parser (`parser.ts`), AST definitions (`ast.ts`, `ast-builder.ts`)
- `src/semantic/` - Symbol table (`symbol-table.ts`), type registry, type checker
- `src/backend/` - C++ code generation (`codegen.ts`, `type-codegen.ts`)
- `src/il/` - Instruction List detection, parsing and IL-to-ST transpilation
- `src/library/` - Library manifest, compiler, loader and CODESYS import
- `src/testing/` - Test model and parser for the ST testing framework
- `src/project-model.ts` - CONFIGURATION/RESOURCE/TASK parsing
- `src/runtime/include/` - Header-only C++ runtime library (IEC type wrappers)
- `tests/` - Test suite organized by compiler phase
- `docs/` - Architecture, CLI, compliance, testing, and runtime documentation
- `vscode-extension/` - VS Code extension (client, language server, own tests)

### Parser Framework

Uses Chevrotain for lexing and parsing. Parser configuration: `maxLookahead: 3`, recovery mode enabled.

### Code Generation Output

Generates two files: `.cpp` (implementation) and `.hpp` (header). All generated code uses `strucpp` namespace. Variables use `IECVar<T>` wrapper for forcing support.

## Implementation Status

Supported features and known gaps are tracked in `docs/IEC_COMPLIANCE.md`.

## TypeScript Conventions

- Strict mode enabled with all strict flags
- ES modules (NodeNext)
- Target: ES2022
- AST nodes have `kind` discriminator and `sourceSpan` for location info
- Error handling uses `CompileError` objects with line/column info
- ESLint (`.eslintrc.cjs`, run on `src/`) sets `@typescript-eslint/no-explicit-any` to `error`

## Testing Patterns

- Unit tests: `tests/{frontend,semantic,backend,il,library,cli}/`
- Integration tests: `tests/integration/`
- ST validation programs: `tests/st-validation/`
- C++ validation: `tests/integration/cpp-compile.test.ts`
- Test file naming: `*.test.ts`
- Coverage: `vitest.config.ts` sets a 75% threshold on lines, functions, branches and statements

## Testing

- Unit tests: `npm test` (single file: `npx vitest run <path>`).
- CI (`.github/workflows/ci.yml`) runs only on pushes and PRs to `main`: lint, `format:check`, typecheck, build, `test:coverage`, the `vscode-extension` tests and bundle, and a binary smoke test. A PR into `development` gets no CI, so run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` and `npm run test:coverage` locally before opening it.
- End-to-end: a compiled program run end to end. Existing suites compile ST to C++, build it with g++ and run the binary, for example `tests/integration/library-e2e.test.ts` and `tests/integration/xword-pointer-e2e.test.ts`. They require g++.
- The developer's manual test is required for every demand.
