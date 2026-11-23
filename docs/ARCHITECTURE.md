# STruC++ Architecture

STruC++ is an IEC 61131-3 Structured Text to C++14 compiler written in TypeScript. It produces readable, debuggable C++ output with line mapping back to the original ST source.

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
    instance-paths.ts        Instance paths and globals in `instance_paths` POUs
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

Between A and B, `resolveInstancePaths` annotates the instance paths and globals of POUs marked `{attribute 'instance_paths'}` (`VariableExpression.instancePath`), which the type checker and the code generator read.

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
  "manifest": { "name": "...", "version": "1.0.0", "functions": [...], "functionBlocks": [...], "types": [...],
                "headers": ["hmi_core.h"], "headerVersions": { "hmi_core.h": "1" } },
  "chunks": [{ "name": "PUMP_PANEL", "kind": "functionBlock", "header": "...", "cpp": "...",
               "deps": [{ "library": "my-lib", "name": "HMI_FILL" }],
               "headers": [{ "name": "hmi_core.h", "version": "1" }] }],
  "sources": [{ "fileName": "...", "source": "..." }],
  "dependencies": [{ "name": "iec-standard-fb", "version": "1.0.0" }],
  "globalConstants": {}
}
```

One chunk per top-level declaration; a consumer emits only the chunks its code reaches through `deps`.

### Dependencies and what a build provides

Every `.stlib` is treated the same way; a library needs two kinds of things from a build:

- **Other libraries.** `dependencies` lists each library whose symbols the library's chunks reference, at the version it was compiled against (direct dependencies only; a consumer follows the chunks' `deps` for the rest). A library passed to `compileStlib()` but not used is not listed.
- **Headers the build environment provides.** The runtime is one: `TIME()`, used by `TON`, is a standard function implemented in the runtime header `iec_std_lib.hpp` over a clock the host sets, and every build includes the runtime headers, so nothing records it. A library whose `{external}` code calls an API only some builds have lists its header in `headers` (`compileStlib({ headers: [{ name: "hmi_core.h", version: "1" }] })`, or a bare name when the API has no version). Each chunk records in `headers` the headers it needs, transitively: a POU whose own code holds `{external}` code needs every library header unless it names its own with `{attribute 'headers' := 'a.h, b.h'}` (`''` for none); a block's attribute covers its methods and properties; a chunk also needs whatever the chunks it reaches need, in this library and in the libraries it was compiled against, so a caller or a derived block carries its callee's or base's header. A chunk needing two versions of one header is a compile error.

A consumer includes only the headers of the chunks it uses. With `providedHeaders` (compile option) it states which headers its environment has, with their versions (`[]` for a PLC build with the runtime only, `[{ name: "hmi_core.h", version: "1" }]` for an HMI build). Before code generation, every library POU the unit uses is checked against them and against `libraries`, transitively, and the compile fails naming the POU:

- `PUMP_PANEL (library my-lib) needs hmi_core.h version 1 through HMI_FILL (library my-lib), which this build does not provide`
- `HMI_FILL (library my-lib) needs hmi_core.h version 1, but this build provides hmi_core.h version 2` (or `... without a version`)
- `SCREEN_COUNT (library screens) needs library hmi-widgets 1.2.0 (>=1.2.0 <2.0.0), which this build does not provide` (or `..., but this build provides hmi-widgets 2.0.0`)

POUs the unit does not use are never checked, so a PLC build can use the plain POUs of a library that also has HMI POUs; a name that only matches another kind of symbol (a variable named like a library block) does not count as a use. Test builds and `wholeLibraries` leave out the chunks a build cannot satisfy instead of failing. Without `providedHeaders` the environment is not stated and headers are not checked (the behaviour before this option existed); a library's own compile does not check them, its chunks carry them on.

Versions: a library satisfies a recorded version when it is semver compatible with it (same major, same minor while the major is 0, not older; other version strings match exactly). A header version names an API revision and matches exactly; a header required without a version is satisfied at any version.

Backward compatibility: an archive with `dependencies: []` and no chunk `headers` (every archive built before these fields) loads and compiles as before. Its edges into other libraries are followed but not required, and each of its chunks needs all of its manifest's `headers`, which the consumer includes whenever it uses one of them.

`library-requirements.ts` reads all of this without compiling: `getLibraryDependencies(archive)`, `resolvePouRequirements(archive, otherArchives)` (each chunk's transitive requirements, with the chunk each comes from), `findUnmetRequirements(requirements, { libraries, providedHeaders })`, `formatUnmetRequirement`, and `functionBlockLineage(archives, library, block)` for a block's `EXTENDS` chain across libraries (the manifest's `extends` names the direct base).

`compile()` is a pure function -- no auto-discovery or implicit library loading. All libraries must be explicitly provided via `libraryPaths` or `libraries` options. The CLI auto-adds a bundled `libs/` directory (like gcc system lib paths), which can be disabled with `--no-default-libs`.

### Bundled Libraries

- **iec-standard-fb.stlib**: IEC 61131-3 standard function blocks (TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS) compiled from ST source
- **oscat-basic.stlib**: OSCAT Basic library (373 functions, 164 FBs)

### Library Compilation

`compileStlib()` compiles ST sources into a `.stlib` archive: parse -> codegen -> extract manifest from AST -> slice the C++ output into chunks, with their `deps` and `headers` -> record the libraries used in `dependencies` -> bundle optional sources. A dependency's code is never copied into the archive; consumers supply the dependency's own archive.

The manifest describes every exported declaration for tools such as a widget catalogue: names as written (`displayName` when the spelling differs from the upper-cased `name`), default values as ST text (`initialValue`, function parameters included), enumeration members and base type, structure fields and alias targets with their string lengths and array bounds (`aliasOf`), function parameters (only VAR_INPUT, VAR_OUTPUT and VAR_IN_OUT), attribute pragmas, and FB methods, properties and interfaces. A method entry lists its parameters both grouped (`inputs`, `outputs`, `inouts`) and in declaration order with their direction (`parameters`), so a consumer binds and passes them in the order of the method's C++ signature; an archive built before `parameters` existed still loads, its method parameters taken as inputs, outputs and in-outs in that order. A library whose `{external}` code calls a C API passes `headers` to `compileStlib()`; they are recorded in the manifest, and a consumer's generated header includes those its used chunks need (see above). A header name is a relative path without `.` or `..` segments; `compileStlib()` and the loader refuse any other.

### Embedding several units

- `namespace` (compile option) puts everything a unit declares in its own C++ namespace, so two units, such as a PLC program and an HMI unit, link into one binary. Only one unit of a binary links its debug table, whose arrays live in `strucpp::debug`.
- `separateLibraryFiles` (compile option) emits linked libraries apart from the unit's own code: `<header>_libraries.hpp` for their declarations and `lib_<library>.cpp` per library, which includes only that header. File names are unique per library (`lib_<library>_2.cpp` on a collision). A build can keep a library's object while the unit's code changes; the library files change when the unit starts or stops using a library symbol, or when the namespace, the global constants or the header name change. With this option the global constants are declared only in the libraries header, guarded so that two unit headers can be included in one translation unit.
- `externalInstancePaths` (compile option) compiles the instance paths and globals of POUs marked `{attribute 'instance_paths'}` as calls to host functions declared in `iec_external.hpp`, for a unit (an HMI, say) that runs in the PLC's process but is compiled apart from it. The programs, the configuration and the non-CONSTANT globals then only supply types and are not emitted, nor is library code only they reach; `instancePaths` in the result maps each id to its canonical path. See `docs/IEC_COMPLIANCE.md` (Instance paths) and `src/semantic/instance-paths.ts`.
- `parse(source, { recover: true })` returns the AST the parser recovered alongside syntax errors, for editors working on code mid-edit.

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
