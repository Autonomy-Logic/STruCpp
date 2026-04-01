# Library Global Constants — Design Document

## Status: Workaround in Place, Proper Fix Needed

Global constants in imported CODESYS libraries (e.g., `STRING_LENGTH`, `LIST_LENGTH`
in OSCAT) are not properly preserved as ST source code during import. A workaround
stores their values in a separate `globalConstants` JSON field on the `.stlib`
archive. This document describes the problem, the current workaround, and the
correct architecture.

## The Problem

OSCAT Basic defines two project-level constants used throughout its 553 source
files:

```
VAR_GLOBAL CONSTANT
    STRING_LENGTH : INT := 250;
    LIST_LENGTH : INT := 250;
END_VAR
```

These constants appear in function signatures (`STRING(STRING_LENGTH)`), array
bounds (`ARRAY[1..LIST_LENGTH]`), loop limits (`FOR i := 1 TO LIST_LENGTH DO`),
and expressions (`LIMIT(0, L, STRING_LENGTH)`).

When the CODESYS `.lib` binary is imported via `--import-lib`, the V2.3 parser
extracts GVL blocks from the binary data. However, the `VAR_GLOBAL CONSTANT`
block containing `STRING_LENGTH` and `LIST_LENGTH` was not cleanly extracted
into a proper `.gvl.st` source file. The extraction mixed binary garbage with
the constant declarations, and the constants ended up lost from the source files.

The decompiled OSCAT sources in the current `.stlib` archive contain two GVL
files, neither of which defines `STRING_LENGTH` or `LIST_LENGTH`:

```
(* GVL_1.gvl.st — only struct instances, no constants *)
VAR_GLOBAL
    MATH : CONSTANTS_MATH;
    PHYS : CONSTANTS_PHYS;
    LANGUAGE : CONSTANTS_LANGUAGE;
    SETUP : CONSTANTS_SETUP;
    LOCATION : CONSTANTS_LOCATION;
END_VAR

(* GVL_2.gvl.st — empty *)
VAR_GLOBAL RETAIN
END_VAR
```

## Current Workaround

The `.stlib` archive format has a `globalConstants` field:

```json
{
  "formatVersion": 1,
  "manifest": { ... },
  "headerCode": "...",
  "cppCode": "...",
  "sources": [ ... ],
  "globalConstants": {
    "STRING_LENGTH": 254,
    "LIST_LENGTH": 254
  }
}
```

During compilation, these values are registered as constant symbols in the global
scope via the `-D` / `--define` CLI mechanism (`src/index.ts`, lines 338-359).
The AST builder's `extractIntegerFromExpression()` resolves them when evaluating
array bounds and constant expressions.

When rebuilding the library from embedded sources (`scripts/rebuild-libs.mjs`),
the script reads `globalConstants` from the existing archive and passes them
back to `compileStlib()`:

```javascript
const result = compileStlib(archive.sources, {
  globalConstants: archive.globalConstants,  // { STRING_LENGTH: 254, LIST_LENGTH: 254 }
});
```

### Problems with this workaround

1. **Constants are not in the source code.** The embedded ST sources reference
   `STRING_LENGTH` but never define it. The sources are incomplete — they cannot
   compile without the external `globalConstants` injection.

2. **Type information is lost.** The `globalConstants` field stores `number`
   values only. The original declaration `STRING_LENGTH : INT := 250` carries
   a type (`INT`), but the workaround treats all constants as untyped integers
   (registered as `ULINT` in the symbol table).

3. **Values diverged from the original.** The CODESYS `.lib` file defines
   `STRING_LENGTH := 250`, but the archive stores `254`. This happened because
   the values were manually specified during the initial import via `-D` flags
   rather than being extracted from the source.

4. **Cannot be overridden per-project.** In CODESYS, users can override library
   constants in their project settings. The current architecture provides no
   mechanism for this — constants are baked into the archive.

## Correct Architecture

### Goal

Global constants should be **declared in the ST source code** as proper
`VAR_GLOBAL CONSTANT` blocks, compiled like any other code, and resolved
through normal symbol table lookup. No separate `globalConstants` field
should be needed on the archive.

### Step 1: Fix the CODESYS Import Parser

The V2.3 parser (`src/library/codesys-import/v23-parser.ts`) extracts GVL
blocks from the binary using regex patterns. The extraction must:

- Cleanly separate `VAR_GLOBAL CONSTANT` blocks from other GVL blocks.
- Strip binary artifacts (null bytes, control characters) from the extracted
  text.
- Emit a dedicated `.gvl.st` file containing the constant declarations.

Expected output for OSCAT:

```
(* GVL_Constants.gvl.st *)
VAR_GLOBAL CONSTANT
    STRING_LENGTH : INT := 250;
    LIST_LENGTH : INT := 250;
END_VAR
```

The V3 parser (`v3-parser.ts`) should be checked for the same issue.

### Step 2: Compiler Support for VAR_GLOBAL CONSTANT in Libraries

The main compiler already handles `VAR_GLOBAL CONSTANT` blocks during
single-file compilation (the AST builder scans them and populates
`globalConstantMap`). For library compilation, this must work across
multi-file compilation units:

- When compiling a library from multiple `.st` files, constants defined in
  `.gvl.st` files must be visible to all other source files.
- The constant values must be available during AST construction (for array
  bound resolution) and semantic analysis (for type checking).
- The compiled library's manifest should declare the constants so consumers
  can reference them (e.g., `STRING(STRING_LENGTH)` in user code).

### Step 3: Remove the globalConstants Workaround

Once constants are properly embedded in the source:

1. The `globalConstants` field on `StlibArchive` becomes unnecessary for
   newly compiled libraries.
2. The `-D` flag remains useful for user overrides but is no longer required
   for basic library compilation.
3. The `rebuild-libs.mjs` script no longer needs to read and pass through
   `globalConstants`.
4. Backward compatibility: the loader should still accept `globalConstants`
   from old archives during a transition period.

### Step 4: Re-import OSCAT with Fixed Parser

Re-run the CODESYS import with the fixed parser to produce a clean `.stlib`
archive where `STRING_LENGTH` and `LIST_LENGTH` are defined in the ST sources:

```bash
strucpp --import-lib oscat_basic_335.lib -o libs/ --lib-name oscat-basic -L libs/
```

The resulting archive should have no `globalConstants` field — all constants
come from the embedded sources.

## Affected Files

| File | Current Role | Change Needed |
|------|-------------|---------------|
| `src/library/codesys-import/v23-parser.ts` | Extracts GVLs from .lib binary | Fix constant block extraction |
| `src/library/codesys-import/v3-parser.ts` | Extracts GVLs from .library ZIP | Verify constant block extraction |
| `src/library/codesys-import/pou-formatter.ts` | Formats extracted POUs as .st | Ensure GVL constants are emitted |
| `src/library/library-manifest.ts` | Defines `StlibArchive.globalConstants` | Deprecate field |
| `src/library/library-compiler.ts` | Passes globalConstants to compiler | Remove dependency on external constants |
| `src/index.ts` | Registers globalConstants in symbol table | Keep for user `-D` overrides only |
| `scripts/rebuild-libs.mjs` | Passes globalConstants for OSCAT rebuild | Remove once sources include constants |

## Priority

Medium. The workaround functions correctly for OSCAT. Becomes important when:

- Re-importing OSCAT or other CODESYS libraries from original `.lib` files.
- Users need to override library constants per-project.
- Library source completeness matters (e.g., for auditing or contributing
  fixes to library code).
