# STruC++ Architecture

STruC++ is an IEC 61131-3 Structured Text to C++17 compiler written in TypeScript. It produces readable, debuggable C++ output with line mapping back to the original ST source.

## Compilation Pipeline

```
ST Source
  |
  v
Lexer (Chevrotain)          src/frontend/lexer.ts
  | tokens
  v
Parser (Chevrotain LL(3))   src/frontend/parser.ts
  | CST
  v
AST Builder                  src/frontend/ast-builder.ts
  | CompilationUnit
  v
Project Model Builder        src/project-model.ts
  | CONFIGURATION/RESOURCE/TASK validation
  v
Library Loader               src/library/library-loader.ts
  | Symbol registration from .stlib archives
  v
Semantic Analyzer            src/semantic/analyzer.ts
  | Symbol tables, type resolution, validation
  v
Code Generator               src/backend/codegen.ts
  | C++ (.cpp + .hpp) with line maps
  v
Output
```

Each stage produces a well-defined intermediate result. Errors at any stage abort the pipeline and return diagnostics with file/line/column context.

## Module Map

```
src/
  index.ts                   Public API: compile(), parse(), getVersion()
  cli.ts                     CLI with 5 modes (compile, library, test, decompile, import)
  types.ts                   CompileOptions, CompileResult, CompileError, SourceSpan
  merge.ts                   Multi-file compilation (mergeCompilationUnits)
  project-model.ts           CONFIGURATION/RESOURCE/TASK parsing and validation

  frontend/
    lexer.ts                 Chevrotain tokenizer (~50 keywords, literals, operators)
    parser.ts                LL(3) grammar with error recovery
    ast.ts                   AST node interfaces (CompilationUnit, POU types, expressions)
    ast-builder.ts           CST-to-AST visitor

  semantic/
    analyzer.ts              Orchestrates symbol table building + type checking
    symbol-table.ts          Scoped symbol tables (global -> POU -> local)
    type-registry.ts         User-defined type registration and validation
    type-checker.ts          Type inference (resolvedType on expressions) + validation
    type-utils.ts            IEC type definitions, compatibility rules, category matching
    std-function-registry.ts Standard function signatures (ABS, SQRT, *_TO_*, etc.)

  backend/
    codegen.ts               Main C++ code generator (expressions, statements, POUs)
    type-codegen.ts          Struct/enum/array type definitions
    codegen-utils.ts         Type mapping helpers (IEC -> C++ types)
    test-main-gen.ts         Test runner main() generation
    test-codegen.ts          Test assertion code generation
    repl-main-gen.ts         Interactive REPL main() generation

  library/
    library-manifest.ts      StlibArchive and LibraryManifest interfaces
    library-compiler.ts      Compile ST sources into .stlib archives
    library-loader.ts        Load, discover, and register library symbols
    library-utils.ts         File discovery, namespace extraction
    builtin-stdlib.ts        C++ runtime standard function manifest
    codesys-import/          CODESYS V2.3 (.lib) and V3 (.library) import

  testing/
    test-model.ts            Test file data model (TestCase, assertions, mocks)
    test-parser.ts           TEST/SETUP/TEARDOWN block parser

  ir/
    ir.ts                    IR node definitions (reserved for future optimization passes)

  runtime/
    include/                 Header-only C++ runtime (IECVar, types, std functions)
    repl/                    REPL line editor (isocline, third-party MIT)
    test/                    C++ test utilities
    tests/                   C++ unit tests for the runtime
```

## Frontend

### Lexer

Chevrotain tokenizer with case-insensitive keywords. All keywords use `LONGER_ALT = Identifier` to prevent keyword/identifier conflicts. Custom pattern matchers handle time literals (`T#1h2m3s`), typed literals (`DINT#42`), nested comment blocks (`(* ... (* ... *) ... *)`), and pragma blocks (`{external ...}`).

### Parser

LL(3) Chevrotain parser with error recovery. Grammar covers the full IEC 61131-3 ST syntax plus CODESYS extensions:

- **POUs**: PROGRAM, FUNCTION, FUNCTION_BLOCK, INTERFACE
- **Variables**: VAR, VAR_INPUT, VAR_OUTPUT, VAR_IN_OUT, VAR_EXTERNAL, VAR_GLOBAL (with CONSTANT, RETAIN, AT modifiers)
- **Types**: STRUCT, ENUM, ARRAY (1D/2D/3D), SUBRANGE, TYPE aliases, REF_TO, REFERENCE_TO, POINTER TO
- **Statements**: assignment, IF/ELSIF/ELSE, FOR/WHILE/REPEAT, CASE, EXIT, RETURN, function/method calls, __NEW, __DELETE
- **Expressions**: full operator precedence (arithmetic, comparison, logical, bitwise, shift, power, unary), function calls, method calls, array/field access, REF/DREF, typed literals
- **OOP**: methods, properties (GET/SET), inheritance (EXTENDS), interfaces (IMPLEMENTS), visibility (PUBLIC/PRIVATE/PROTECTED), ABSTRACT/FINAL/OVERRIDE

Ambiguities are resolved with GATE predicates and `IGNORE_AMBIGUITIES: true` on OR alternatives.

### AST

Typed AST with discriminated unions (`kind` field on every node). All expression nodes carry an optional `resolvedType` field populated by the type checker. Every node has a `sourceSpan` for error reporting and line mapping.

The top-level `CompilationUnit` contains arrays of programs, functions, function blocks, interfaces, type declarations, configurations, and global variable blocks.

## Semantic Analysis

Three-pass analysis orchestrated by `SemanticAnalyzer`:

**Pass A: Symbol Table Building** -- Walks all POUs, registers variables/functions/FBs/types into scoped symbol tables. Case-insensitive lookup (IEC convention). Detects duplicate declarations.

**Pass B: Type Resolution** -- Walks all expressions and sets `resolvedType` on each AST node. Infers types from literals (including typed literals like `DINT#42`), variable declarations, operator rules, function return types, and struct/array access chains.

**Pass C: Validation** -- Checks assignment compatibility, condition types (must be BOOL), FOR loop bound types, CASE selector types (ANY_INT, ANY_BIT, or enum), function argument constraints, located variable address formats, and VAR_EXTERNAL references.

### Type System

21 elementary types organized into categories (ANY_NUM, ANY_INT, ANY_REAL, ANY_BIT, ANY_STRING, ANY_DATE) used for generic function dispatch. Key compatibility rules:

- Implicit widening: SINT -> INT -> DINT -> LINT
- Narrowing conversions produce warnings, not errors (CODESYS compatibility)
- Untyped numeric literals are polymorphic (assignable to any numeric type)
- Typed literals (`INT#5`, `DINT#42`) resolve to their declared type
- Integer-to-bit implicit conversion when target bits >= source bits
- Reference/pointer assignments skip compatibility checks

Errors abort code generation. Warnings do not.

## Code Generation

Generates two files per compilation: `.hpp` (declarations) and `.cpp` (implementation), both inside a `namespace strucpp { }` block.

### Type Mapping

| IEC Type            | C++ Type                  | Wrapped                |
| ------------------- | ------------------------- | ---------------------- |
| BOOL                | `bool`                    | `IECVar<bool>`         |
| INT                 | `int16_t`                 | `IECVar<int16_t>`      |
| DINT                | `int32_t`                 | `IECVar<int32_t>`      |
| REAL                | `float`                   | `IECVar<float>`        |
| STRING              | `IECString<N>`            | `IECVar<IECString<N>>` |
| ARRAY[1..10] OF INT | `Array1D<int16_t, 1, 10>` | -                      |
| POINTER TO INT      | `IEC_Ptr<int16_t>`        | -                      |
| REF_TO INT          | `IEC_REF_TO<int16_t>`     | -                      |
| User struct         | `struct Name { ... }`     | `IECVar<Name>`         |

All program/function variables are wrapped in `IECVar<T>` which provides transparent variable forcing support. Struct fields use IECVar-wrapped elementary types for per-field forcing.

### POU Generation

- **Functions**: C++ free functions with INPUT params by value, OUTPUT/IN_OUT by reference
- **Function Blocks**: C++ classes with member variables, `operator()()` method for the FB body, and generated methods/properties. Supports ABSTRACT (pure virtual), FINAL, EXTENDS (inheritance), and IMPLEMENTS (interfaces).
- **Programs**: C++ classes with global instances, connected to CONFIGURATION/RESOURCE/TASK structure

### Line Mapping

The code generator tracks ST source line -> C++ output line correspondence, stored in `lineMap`. This enables debugger integration and meaningful error reporting against the original ST source. Optional `#line` directives and source comments can be emitted for direct C++ debugging.

## Library System

Libraries use a single-file `.stlib` archive format (JSON):

```json
{
  "formatVersion": 1,
  "manifest": { "name": "...", "functions": [...], "functionBlocks": [...], "types": [...] },
  "headerCode": "// pre-compiled C++ header",
  "cppCode": "// pre-compiled C++ implementation",
  "sources": [{ "fileName": "...", "source": "..." }],
  "dependencies": [],
  "globalConstants": {}
}
```

`compile()` is a pure function -- no auto-discovery or implicit library loading. All libraries must be explicitly provided via `libraryPaths` or `libraries` options. The CLI auto-adds a bundled `libs/` directory (like gcc system lib paths), which can be disabled with `--no-default-libs`.

### Bundled Libraries

- **iec-standard-fb.stlib**: IEC 61131-3 standard function blocks (TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS) compiled from ST source
- **oscat-basic.stlib**: OSCAT Basic library (373 functions, 164 FBs)

### Library Compilation

`compileStlib()` compiles ST sources into a `.stlib` archive: parse -> codegen -> extract manifest from AST -> bundle C++ output + optional sources. Dependencies are flattened (transitive closure) and their C++ preambles are stripped to avoid duplication when consumers load them separately.

### CODESYS Import

`importCodesysLibrary()` converts CODESYS V2.3 (.lib, binary) and V3 (.library, ZIP) files into `.stlib` archives. Format detection is automatic. The V2.3 parser extracts POU declarations from the binary format; the V3 parser reads object-file records from the ZIP structure.

## CLI

Five mutually exclusive modes:

```
strucpp input.st -o output.cpp          # Compile ST to C++
strucpp input.st --build                # Compile + build interactive REPL binary
strucpp --compile-lib *.st -o dir       # Compile ST library to .stlib
strucpp --test test.st source.st        # Run ST test suite against source
strucpp --decompile-lib lib.stlib -o dir  # Extract ST sources from .stlib
strucpp --import-lib codesys.lib -o dir   # Convert CODESYS library to .stlib
```

Key flags: `-L <dir>` (library search path), `-D NAME=VALUE` (global constants), `--no-default-libs`, `--cxx-flags`, `--no-source`.

## Testing

The test framework uses a custom syntax parsed by `test-parser.ts`:

```
SETUP
  myTimer : TON;
END_SETUP

TEST "timer reaches preset"
  myTimer(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME T#100ms;
  myTimer(IN := TRUE, PT := T#100ms);
  ASSERT_TRUE(myTimer.Q);
END_TEST
```

The CLI `--test` mode compiles source + test files, generates a C++ test runner, compiles with g++, and executes. Assertions include ASSERT_EQ, ASSERT_NE, ASSERT_TRUE, ASSERT_FALSE, ASSERT_GT, ASSERT_LT. Mock support allows stubbing functions and FB instances per test.

## Error Handling

All errors are `CompileError` objects with `message`, `line`, `column`, `severity` ("error" | "warning" | "info"), and optional `file` context. Parse errors fail fast. Semantic errors abort code generation. Warnings (narrowing conversions, type mismatches in FOR bounds) are collected but allow codegen to proceed.
