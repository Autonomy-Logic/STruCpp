# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

STruC++ is an IEC 61131-3 Structured Text to C++17 compiler written in TypeScript. It targets replacing MatIEC in the OpenPLC toolchain with a cleaner, maintainable architecture.

## Build & Development Commands

```bash
npm ci                    # Install dependencies
npm run build             # TypeScript compilation to dist/
npm run dev               # Watch mode for development
npm test                  # Run all tests with Vitest
npm run test:coverage     # Coverage report (75% threshold)
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix lint issues
npm run format            # Format with Prettier
npm run typecheck         # Type-check without emit
```

### Running Specific Tests

```bash
npx vitest run tests/frontend/lexer.test.ts    # Single test file
npx vitest run -t "should parse"               # Tests matching pattern
npm run test:watch                              # Watch mode
```

### C++ Compilation Tests

Tests in `tests/integration/cpp-compile.test.ts` require `g++` with C++17 support. They are auto-skipped if g++ is unavailable.

## Architecture

Multi-pass compilation pipeline:

```
ST Source → Lexer → Parser (CST) → AST Builder → Project Model → Symbol Tables → Type Checker → Code Generator → C++ Output
```

### Key Directories

- `src/frontend/` - Lexer (`lexer.ts`), Parser (`parser.ts`), AST definitions (`ast.ts`, `ast-builder.ts`)
- `src/semantic/` - Symbol table (`symbol-table.ts`), type registry, type checker
- `src/backend/` - C++ code generation (`codegen.ts`, `type-codegen.ts`)
- `src/project-model.ts` - CONFIGURATION/RESOURCE/TASK parsing
- `src/runtime/include/` - Header-only C++ runtime library (IEC type wrappers)
- `tests/` - Test suite organized by compiler phase
- `docs/implementation-phases/` - Detailed implementation plans

### Parser Framework

Uses Chevrotain for lexing and parsing. Parser configuration: `maxLookahead: 3`, recovery mode enabled.

### Code Generation Output

Generates two files: `.cpp` (implementation) and `.hpp` (header). All generated code uses `strucpp` namespace. Variables use `IECVar<T>` wrapper for forcing support.

## Implementation Status

- **Completed**: Phases 0-3.6 (C++ runtime, lexer, parser, AST, symbol tables, project structure, user-defined types, located variables, references, nested comments, variable modifiers, namespaces, pragmas, ST translation with all expressions/control flow/composite types/VLAs/dynamic memory, REPL binary generator)
- **Completed**: Phase 4 (Functions) - full function call pipeline (AST builder, codegen), standard function registry with all IEC std functions, *_TO_* conversion mapping, multi-file compilation, library system with manifest/compiler/loader
- **Completed**: Phase 5.1 (Function Block Instances and Invocations) - FB instantiation, invocation, member access, class skeleton codegen
- **Completed**: Phase 5.2 (OOP extensions - methods, interfaces, inheritance, properties, semantic validations)
- **Completed**: Phase 5.3 (IEC 61131-3 Standard FB Library - TON/TOF/TP/CTU/CTD/R_TRIG/F_TRIG/SR/RS as compiled ST library)
- **Completed**: Phase 5.4 (Testing strategy for FB/OOP)
- **Pending**: Phase 6 (CODESYS compatibility - POINTER TO, UNION, FB_Init/FB_Exit, __QUERYINTERFACE, bit access, typed literals, 64-bit time types, ACTION, exceptions, generics, conditional compilation)
- **Pending**: Phase 7 (OpenPLC runtime integration - located variable infrastructure already complete)
- **Pending**: Phase 8 (optimizations and advanced debug support)
- **Pending**: Phase 9 (IEC 61131-3 testing framework)

## TypeScript Conventions

- Strict mode enabled with all strict flags
- ES modules (NodeNext)
- Target: ES2022
- AST nodes have `kind` discriminator and `sourceSpan` for location info
- Error handling uses `CompileError` objects with line/column info

## Testing Patterns

- Unit tests: `tests/{frontend,semantic,backend}/`
- Integration tests: `tests/integration/`
- C++ validation: `tests/integration/cpp-compile.test.ts`
- Test file naming: `*.test.ts`
- Minimum 75% branch coverage required
