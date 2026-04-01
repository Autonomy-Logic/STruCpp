# Library Namespace Support — Design Document

## Status: Not Implemented

Library namespaces are declared in manifests (`LibraryManifest.namespace`) but not
functionally used. This document describes the current gaps, the target CODESYS
behavior, and the architectural changes required.

## Current Behavior

- Library C++ code is stripped of its namespace wrapper (`extractNamespaceBody()`)
  and injected directly into the consumer's `strucpp` namespace.
- All library symbols are registered into a flat global scope with no namespace
  tracking. The `manifest.namespace` field is never read during symbol
  registration or code generation.
- When two libraries export the same symbol name (e.g., both define a FB called
  `INIT`), the second registration is **silently dropped** — first-loaded wins,
  no warning, no error.
- User code cannot write `LibName.TypeName` to disambiguate library types.

## CODESYS Target Behavior

In CODESYS, every library has a namespace (e.g., `OSCAT_BASIC`, `Standard`):

1. **Unqualified access** works when the name is unambiguous across all loaded
   libraries. `VAR t : TON; END_VAR` resolves if only one library defines `TON`.

2. **Qualified access** always works using dot notation:
   `VAR t : Standard.TON; END_VAR`.

3. **Collision** — If two libraries export the same name, bare usage is an error.
   The compiler requires qualification: `LibA.INIT` or `LibB.INIT`.

This mirrors the bare-enum resolution pattern already implemented in
`buildEnumMemberMap()` (see `src/semantic/type-utils.ts`).

## Affected Subsystems

### 1. Symbol Table (`src/semantic/symbol-table.ts`)

Symbols need a `sourceNamespace?: string` field so the system knows which library
a function/FB/type came from. Lookup methods must support namespace-qualified
queries (e.g., `lookupFunction("Standard.TON")`).

### 2. Library Loader (`src/library/library-loader.ts`)

`registerLibrarySymbols()` currently catches `DuplicateSymbolError` and silently
skips. It must instead:

- Store the namespace on each registered symbol.
- Detect cross-library collisions and mark them as ambiguous.
- Emit a warning listing the conflicting libraries.

A reverse map (symbol name -> library namespace) similar to `buildEnumMemberMap`
would enable ambiguity detection and qualified resolution.

### 3. Parser (`src/frontend/parser.ts`)

Type references must support `Namespace.TypeName` syntax. The parser already
handles `EnumType.Member` dot notation in variables/expressions. Type references
in `VAR` declarations would need the same treatment — the `dataType` rule must
accept `Identifier.Identifier` as a qualified type name.

### 4. Semantic Analyzer (`src/semantic/analyzer.ts`)

- Resolve qualified type names by splitting on `.` and looking up the namespace.
- For unqualified names that are ambiguous, emit:
  `"Ambiguous type 'INIT' — qualify as 'LibA.INIT' or 'LibB.INIT'"`.
- Undeclared-variable checks must also recognize qualified library references.

### 5. Code Generator (`src/backend/codegen.ts`)

**Option A — Namespace wrapping (recommended):**

Wrap each library's preamble code in its own C++ namespace:

```cpp
namespace strucpp {

namespace iec_standard_fb {
  // IEC standard FB library code
  class TON { ... };
}
using namespace iec_standard_fb;  // make available unqualified

namespace oscat_basic {
  // OSCAT library code
  class AIN1 { ... };
}
using namespace oscat_basic;

// User program code
class MAIN { ... };

}  // namespace strucpp
```

This preserves unqualified access (via `using namespace`) while enabling
qualified access (`iec_standard_fb::TON`) when disambiguation is needed.

For collisions, the `using namespace` declarations would be omitted for
the conflicting names, forcing qualified access in the generated C++.

**Option B — Flat namespace with qualified codegen:**

Keep injecting into `strucpp` but mangle names: `iec_standard_fb__TON`.
Less clean but avoids nested namespaces.

### 6. Library Utilities (`src/library/library-utils.ts`)

`extractNamespaceBody()` currently discards the namespace name. It should either:

- Preserve the namespace name as a return value alongside the body.
- Or stop stripping the namespace entirely, letting the injection point
  handle wrapping.

### 7. Library Compiler (`src/library/library-compiler.ts`)

The `.stlib` archive already stores `manifest.namespace`. No format changes
needed. The compiler just needs to ensure the namespace is consistently set
and used.

## Implementation Strategy

The enum qualification system (`buildEnumMemberMap` + ambiguity detection +
codegen qualification) provides a proven pattern. The library namespace system
should follow the same architecture:

1. **Build a reverse map** at library load time: `symbolName -> { namespace, isAmbiguous }`.
2. **Ambiguity detection** in the semantic analyzer using the reverse map.
3. **Qualified codegen** emitting `namespace::Name` for library symbols.
4. **Parser support** for `Namespace.TypeName` in type references.

## Related Files

| File | Role |
|------|------|
| `src/library/library-manifest.ts` | `LibraryManifest.namespace` field (exists, unused) |
| `src/library/library-loader.ts` | `registerLibrarySymbols()` — silent duplicate drop |
| `src/library/library-utils.ts` | `extractNamespaceBody()` — strips namespace |
| `src/library/library-compiler.ts` | `compileStlib()` — sets namespace in manifest |
| `src/semantic/symbol-table.ts` | Symbol definitions — no namespace field |
| `src/semantic/analyzer.ts` | Undeclared-variable checks — no namespace awareness |
| `src/backend/codegen.ts` | `addLibraryPreamble()` — no namespace wrapping |
| `src/semantic/type-utils.ts` | `buildEnumMemberMap()` — pattern to reuse |

## Priority

Medium-high. Currently not blocking because:

- The IEC standard FB library uses namespace `strucpp` (same as consumer).
- OSCAT is the only third-party library and has no symbol collisions with the
  standard library.

Becomes critical when:

- Users start creating custom libraries with overlapping names.
- Multiple third-party libraries are loaded simultaneously.
- CODESYS compatibility requires qualified type references.
