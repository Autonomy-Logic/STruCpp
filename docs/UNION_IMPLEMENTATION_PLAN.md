# UNION Implementation Plan

Status: **Proposed** — Phase 6 (CODESYS compatibility)
Owner: TBD
Last updated: 2026-04-30

## 1. Goal & Non-Goals

### Goal

Add CODESYS V3-compatible `UNION` support to STruC++ so existing CODESYS code such as

```iec
TYPE WordReal :
    UNION
        rValue  : REAL;
        awWords : ARRAY[0..1] OF WORD;
    END_UNION
END_TYPE
```

compiles and behaves identically (overlay storage, type-punning between members,
size = max member size, default zero-initialization).

### Non-goals (deferred)

- `{attribute 'pack_mode'}` pragma for byte-packed unions — tracked separately.
- Anonymous (un-named) inline `UNION` fields — defer until named-form is solid.
- `REFERENCE TO` and `FB` instances as union members — reject with a diagnostic
  for now (CODESYS allows the latter syntactically but it is a documented
  footgun; we surface a clearer error than CODESYS does).
- Per-member initializers (`a : INT := 5;` inside a UNION) — reject with a
  diagnostic, matching CODESYS.

## 2. CODESYS Reference Behavior

What we must replicate, condensed from the research notes:

| Aspect | Required behavior |
| --- | --- |
| Syntax | `TYPE name : UNION <fields> END_UNION END_TYPE`, fields same form as STRUCT |
| Storage | All members share the same starting address. Total size = largest member, with natural alignment. |
| Default init | Zero-fill of the entire storage region. |
| Member access | `u.member` — identical to STRUCT. |
| Type punning | Write member A, read member B is **defined and idiomatic** (the whole point). |
| Allowed members | Elementary types, arrays, named STRUCT, named UNION, `POINTER TO`. |
| Rejected members | `REFERENCE TO`, FB instances, per-member initializers. |
| Endianness | Inherited from target — not abstracted. Document this. |
| Nesting | UNION inside STRUCT, STRUCT inside UNION, UNION inside UNION — all allowed via named types. |

Open verifications before implementation (from research notes):

1. Per-instance `:= (memberA := …)` initializer — does CODESYS accept it? Default plan: **reject**, document as a diff.
2. Inline anonymous UNION fields inside a STRUCT — defer; require a named TYPE.
3. Single-member UNION — accept silently (degenerates to a STRUCT).

A 5-line CODESYS IDE smoke test will resolve all three before code lands.

## 3. Architectural Strategy

`UNION` is, structurally, a `STRUCT` with three differences:

1. The C++ keyword emitted is `union` rather than `struct`.
2. No per-field default-initializers may be emitted (C++ allows only one).
3. A handful of member-type restrictions apply.

Everything else — parsing the field list, building the AST node, registering in
the type registry, dependency resolution, member-access type-checking, field
mangling, codegen of `u.field`, IECVar wrapping at the call site — is
**identical**. The plan is therefore organized around a single rule:

> **Share the field-list path; branch only at codegen and at validation.**

Concretely:

- A new `UnionDefinition` AST node mirrors `StructDefinition` exactly (same
  `fields: VarDeclaration[]` shape) so all reusable code can treat them
  interchangeably via a shared discriminator helper.
- Introduce one tiny utility, `isCompositeFieldType(def)` (or extend an
  existing predicate), so the type-checker, dependency resolver, and analyzer
  treat `StructDefinition | UnionDefinition` as one case, not two.
- The codegen field-emission inner loop is extracted into a private
  `emitCompositeFields(fields, omitInitializers)` helper used by both
  `generateStructType` and a new `generateUnionType`.
- The runtime gets a thin `IEC_UNION_Base` marker class only if forcing or
  introspection of unions is needed (not in v1).

Result: roughly **one new ~25-line codegen method**, **one new AST node**,
**one new parser rule**, **one new builder method**, and **one-line `case`
additions** in the four semantic-phase switches. No copy-pasted field-handling
logic.

## 4. Implementation Phases

### 4.1 Lexer — `src/frontend/lexer.ts`

- Add `UNION` token next to the existing `STRUCT` token (line ~274). Pattern:
  `/UNION/i`.
- Add `END_UNION` token next to `END_STRUCT` (line ~276). Pattern:
  `/END_UNION/i`.
- Register both in the `allTokens` array (line ~793) and the `keywordTokens`
  list (line ~657). Use `LONGER_ALT: Identifier` to keep identifier matching
  intact.
- No changes to `uppercaseSource` (line 988) — keyword case-folding already
  handles all keywords uniformly.

**Test**: extend `tests/frontend/lexer.test.ts` with one case asserting
`UNION` and `END_UNION` are tokenized as keywords.

### 4.2 Parser — `src/frontend/parser.ts`

- Add a `unionType` rule next to `structType` (line ~525). It is a literal
  copy of `structType` with `STRUCT`/`END_STRUCT` swapped for
  `UNION`/`END_UNION` and the same `MANY(varDeclaration)` body. Field-list
  reuse comes for free because `varDeclaration` is already shared between
  STRUCT and `VAR` blocks.
- Add a new `ALT` in `singleTypeDeclaration`'s `OR` (line ~485) gated by
  `LA(1) === UNION`.

**Test**: extend `tests/frontend/parser.test.ts` to parse a basic UNION,
nested-in-struct UNION, and a malformed `END_STRUCT`-on-UNION case
(expect a parse error).

### 4.3 AST — `src/frontend/ast.ts` + `src/frontend/ast-builder.ts`

- Add `UnionDefinition` interface (after `StructDefinition`, line ~274):

  ```ts
  export interface UnionDefinition extends ASTNode {
    kind: "UnionDefinition";
    fields: VarDeclaration[];
  }
  ```

- Add to `TypeDefinition` union (line 261):

  ```ts
  export type TypeDefinition =
    | StructDefinition
    | UnionDefinition
    | EnumDefinition
    | ArrayDefinition
    | SubrangeDefinition
    | TypeReference;
  ```

- In `ast-builder.ts`, add a `buildUnionDefinition(node)` method (line ~899)
  that delegates to the existing struct-field extraction logic. Refactor
  `buildStructDefinition` to call a private `buildFieldList(node)` helper so
  both definitions share the implementation. **No copy-paste.**

**Test**: extend `tests/frontend/ast.test.ts` to assert the AST shape of
`TYPE U : UNION ... END_UNION END_TYPE`.

### 4.4 Semantic Layer — type registry, resolver, type-checker, analyzer

The principle is "one new `case` per switch, plus a shared predicate." All
field-shaped composite logic stays in one place.

- `src/semantic/type-utils.ts`:
  - Add a small predicate `isCompositeDefinition(def)` returning true for
    `StructDefinition | UnionDefinition`.
  - Update `resolveFieldType(typeName, fieldName, ast)` (line ~428) to use
    that predicate. The body that walks `def.fields` is unchanged — it works
    for both kinds.
- `src/semantic/type-registry.ts`:
  - Update `collectStructDependencies` (line ~212) to use
    `isCompositeDefinition` and rename it to `collectCompositeDependencies`.
    The body is unchanged.
- `src/semantic/type-checker.ts`:
  - Update the field-access step (line ~285) to recognize both definition
    kinds via the predicate. Same code path — only the predicate widens.
- `src/semantic/analyzer.ts`:
  - Add a `case "UnionDefinition":` next to `case "StructDefinition":`
    (line ~2262). This is where the **UNION-specific validations** live,
    which is the one place we want a separate code path:
    - Reject `REFERENCE TO` member.
    - Reject FB instance member (look up name in FB registry).
    - Reject any field with a non-undefined `initialValue` (per-member
      initializer).
    - Reject empty field list.
    - Recursive-self check (a UNION cannot directly contain itself; via
      `POINTER TO` is fine — the existing recursion guard for STRUCT covers
      this).
  - Each rejection emits a `CompileError` with a clear message and the
    field's `sourceSpan`.

**Test**: `tests/semantic/union-validation.test.ts` covering each rejection
case, plus positive cases for nested STRUCT-in-UNION and UNION-in-STRUCT.

### 4.5 Codegen — `src/backend/type-codegen.ts`

This is the only phase with meaningful new logic.

- Refactor `generateStructType` (line ~262) by extracting its inner field
  loop into:

  ```ts
  private emitCompositeFields(
    fields: VarDeclaration[],
    options: { omitDefaultInitializers: boolean }
  ): void
  ```

  When `omitDefaultInitializers` is true, the helper still emits
  `cppType name;` per field but **drops** the `= …` / `{}` / `= nullptr`
  suffixes. This mirrors C++17 union rules (only one default member
  initializer allowed) and matches CODESYS, which zero-fills the whole
  storage at instance declaration time.

- Add `generateUnionType(name, def)` (next to `generateStructType`, line
  ~316). It is roughly:

  ```ts
  this.emit(`union ${name} {`);
  this.emitCompositeFields(def.fields, { omitDefaultInitializers: true });
  this.emit("};");
  this.emit("");
  ```

- Add a `case "UnionDefinition":` to `generateTypeDeclaration` (line 181)
  that calls `generateUnionType` and emits the identity alias
  `using IEC_${name} = ${name};` — same alias rule as struct, so unions can
  be used with the existing IECVar field-wrapping convention.

- **Default-init at the variable site:** when codegen creates a variable of
  union type, emit `MyUnion u{};` (value-initialization → zero-fill of
  largest member). This already happens for structs because the existing
  variable codegen value-initializes user-defined types; verify with a
  golden-file test rather than adding a special case.

**Test**: `tests/backend/codegen-union.test.ts` modeled on the existing
`tests/backend/codegen-composite.test.ts` struct cases (lines 149–225):

- Basic two-WORD ↔ REAL overlap, golden-file `union WordReal { … };`.
- Union nested in struct, struct nested in union.
- `tests/integration/cpp-compile.test.ts` extension that actually compiles
  and runs the WORD↔REAL overlay end-to-end on hosts where g++ is
  available (auto-skips otherwise per existing pattern).

### 4.6 Runtime — `src/runtime/include/`

Optional, low-priority. Add an empty marker class `IEC_UNION_Base` only if
we later need runtime introspection of unions (e.g. for the REPL or
debug/forcing). Not required for v1 — C++ union layout is automatic and
needs no runtime helper.

If added, place in `iec_union.hpp` next to the existing
`iec_struct.hpp` rather than overloading the struct header.

### 4.7 Documentation

- Update `docs/IEC_COMPLIANCE.md`:
  - Move `UNION` from "Not Yet Implemented" (line 180) to the supported
    table at line ~43.
  - Add a short "Endianness note" pointing at this file.
- Update `CLAUDE.md` Phase 6 line: strike `UNION` from the pending list,
  leave the other Phase 6 items.
- Add a short "UNION" entry to `docs/ARCHITECTURE.md` if that doc lists
  composite types (verify on implementation).

## 5. C++17 Mapping Decision

We emit a **plain C++17 `union`** for the trivial-member case (which covers
~95% of real CODESYS UNION usage — numerics, byte arrays, pointers).

Justification:

- Direct, zero-overhead, and `&u.a == &u.b` is preserved.
- C++17 technically declares reading an inactive member as undefined
  behavior, but **GCC, Clang, and MSVC all document type-punning via union
  reads as a supported extension**. CODESYS users rely on exactly this
  behavior, so the de-facto guarantee is sufficient.
- The runtime build already targets these three compilers.

Mitigations against strict-aliasing surprises:

- The semantic analyzer rejects non-trivial union members
  (`REFERENCE TO`, FB instances, anything with a non-trivial constructor),
  so we never emit a union containing a type that needs explicit lifetime
  management.
- Document the de-facto type-punning behavior in `docs/IEC_COMPLIANCE.md`.
- Optional belt-and-suspenders: emit a comment on each generated
  `union` referencing the documented compiler extensions.

Future work: when we move to C++20 we can swap to `std::bit_cast` for the
strict-conformance case, but that is **out of scope** for v1.

## 6. Test Plan Summary

| Layer | File | Coverage |
| --- | --- | --- |
| Lexer | `tests/frontend/lexer.test.ts` | `UNION`, `END_UNION` tokens |
| Parser | `tests/frontend/parser.test.ts` | Basic, nested, malformed |
| AST | `tests/frontend/ast.test.ts` | `UnionDefinition` shape |
| Semantic — accept | `tests/semantic/union-validation.test.ts` | Nested STRUCT/UNION, POINTER member, ARRAY member |
| Semantic — reject | same | REFERENCE TO, FB instance, per-member init, empty body |
| Codegen — golden | `tests/backend/codegen-union.test.ts` | C++ `union` keyword, no default initializers, identity alias |
| Codegen — runtime | `tests/integration/cpp-compile.test.ts` | WORD↔REAL overlay round-trip |

Coverage target: hit existing 75% branch threshold; the new code paths are
small enough that this is mechanical.

## 7. Risks & Open Questions

1. **Union containing a non-trivial member sneaks through**. Mitigation: the
   analyzer's reject list must include any user-defined type whose
   transitive members contain a non-trivial type. The recursion guard for
   STRUCT covers cycle detection but not "is-trivial" — add a small
   `isTriviallyCopyable(typeName, registry)` check.
2. **Endianness assumptions in user code.** STruC++ targets are typically
   little-endian (x86, x86-64, ARM-LE), but OpenPLC has historically run on
   big-endian hardware too. Document the dependency; do not abstract it.
3. **`pack_mode` pragma compatibility.** We do not implement it in v1, but
   if user code carries the pragma we should at least *parse and ignore*
   with a warning, rather than fail. Confirm pragma handling in
   `src/frontend/parser.ts`.
4. **Default-member-initializer rules** in C++17 unions: only one member may
   carry a default initializer. Our chosen approach (drop all of them, rely
   on `MyUnion u{}` at the declaration site) sidesteps the rule entirely.
   Keep this invariant in `emitCompositeFields`.
5. **Initializer on a UNION variable instance** (`u : MyU := (a := 5)`):
   pending CODESYS verification. If accepted there, we follow; if not, we
   reject. Either path is one analyzer rule.

## 8. Rollout & Sequencing

The phases below correspond to PR-sized chunks. Each is independently
mergeable, behind no flag (the feature simply isn't reachable until the
parser opens it up in step 2).

1. **Tokens + parser stub** (lexer + parser, no AST yet — emits a parse
   error at the AST builder boundary). Tiny PR; locks in syntax.
2. **AST node + builder** with `buildFieldList` shared helper. Adds one
   smoke-test asserting AST shape; no codegen yet.
3. **Semantic layer** — predicate refactor, `case "UnionDefinition"` in
   each phase, all rejection rules, full positive/negative test suite.
4. **Codegen** — `emitCompositeFields` extraction, `generateUnionType`,
   golden-file tests, integration WORD↔REAL test.
5. **Docs sweep** — `IEC_COMPLIANCE.md`, `CLAUDE.md`, `ARCHITECTURE.md`.

Estimated total: ~5 small PRs, ~600 LOC including tests, no code duplication
introduced.
