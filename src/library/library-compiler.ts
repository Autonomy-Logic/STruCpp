// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * STruC++ Library Compiler
 *
 * Compiles ST source files into a library: manifest + C++ output.
 * Libraries expose their functions, FBs, and types for use by other compilations.
 */

import type {
  LibraryCompileResult,
  StlibCompileResult,
  StlibArchive,
} from "./library-manifest.js";
import { compile } from "../index.js";
import { buildChunks } from "./library-chunks.js";
import { functionBlockLookup } from "../semantic/fb-lineage.js";
import type { MemberManglingContext } from "../backend/member-mangling.js";
import {
  mangledMemberName,
  methodNamesByBlock,
  userDefinedTypeNames,
} from "../backend/member-mangling.js";
import {
  nativeLanguageFor,
  type NativeSource,
  partitionLibrarySources,
  projectNativeHeaderToSt,
} from "./native-sources.js";
import type {
  LibraryAttribute,
  LibraryFBEntry,
  LibraryTypeEntry,
  LibraryInterfaceEntry,
  LibraryManifest,
  LibraryMethodEntry,
  LibraryPropertyEntry,
  LibraryTypeRef,
  LibraryVarType,
} from "./library-manifest.js";
import type { SourceSpan } from "../types.js";
import type {
  Attribute,
  Expression,
  FunctionBlockDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  TypeReference,
  VarBlock,
  VarDeclaration,
} from "../frontend/ast.js";

/**
 * Serialize a VAR_INPUT initial-value expression back into an ST string for the
 * manifest (e.g. `255`, `-1`, `10.0`, `T#100ms`, `TRUE`, `MY_CONST`). Parameter
 * defaults are almost always literals or simple expressions; the cases below
 * cover them. Returns undefined for anything it can't faithfully render, so the
 * caller omits the field rather than emit a wrong default.
 */
function serializeInitialValue(expr: Expression): string | undefined {
  switch (expr.kind) {
    case "LiteralExpression":
      return expr.rawValue;
    case "VariableExpression":
      // A bare named constant/enum used as a default (no subscripts/fields).
      return expr.subscripts.length === 0 &&
        expr.fieldAccess.length === 0 &&
        !expr.isDereference
        ? expr.name
        : undefined;
    case "UnaryExpression": {
      const operand = serializeInitialValue(expr.operand);
      if (operand === undefined) return undefined;
      return expr.operator === "NOT"
        ? `NOT ${operand}`
        : `${expr.operator}${operand}`;
    }
    case "ParenthesizedExpression": {
      const inner = serializeInitialValue(expr.expression);
      return inner === undefined ? undefined : `(${inner})`;
    }
    case "BinaryExpression": {
      const left = serializeInitialValue(expr.left);
      const right = serializeInitialValue(expr.right);
      return left === undefined || right === undefined
        ? undefined
        : `${left} ${expr.operator} ${right}`;
    }
    default:
      return undefined;
  }
}

/**
 * Serialize a type reference into the manifest format, preserving array dimensions, string lengths and reference
 * qualifiers.
 */
function serializeTypeRef(typeRef: TypeReference): LibraryTypeRef {
  const entry: LibraryTypeRef = { type: typeRef.name };
  if (typeRef.arrayDimensions && typeRef.arrayDimensions.length > 0) {
    entry.arrayDimensions = typeRef.arrayDimensions;
  }
  if (typeRef.elementTypeName) {
    entry.elementTypeName = typeRef.elementTypeName;
  }
  if (typeRef.elementMaxLength !== undefined) {
    entry.elementMaxLength = typeRef.elementMaxLength;
  }
  if (typeRef.maxLength !== undefined) {
    entry.maxLength = typeRef.maxLength;
  }
  if (typeRef.elementReferenceChain) {
    entry.elementReferenceChain = typeRef.elementReferenceChain;
  }
  if (typeRef.referenceKind && typeRef.referenceKind !== "none") {
    entry.referenceKind = typeRef.referenceKind;
  }
  if (typeRef.referenceChain) {
    entry.referenceChain = typeRef.referenceChain;
  }
  return entry;
}

/** Serialize a variable's type reference into the manifest format. */
function serializeVarType(
  name: string,
  typeRef: TypeReference,
): LibraryVarType {
  return { name, ...serializeTypeRef(typeRef) };
}

/** A declaration's attribute pragmas as a manifest field to spread into its entry; empty when it has none. */
function attributesOf(node: { attributes?: Attribute[] }): {
  attributes?: LibraryAttribute[];
} {
  return node.attributes !== undefined && node.attributes.length > 0
    ? { attributes: node.attributes.map((a) => ({ ...a })) }
    : {};
}

/**
 * The library's source files, to read back what the AST normalises away: the spelling of names (the lexer
 * upper-cases identifiers) and the text of default values.
 */
export class SourceText {
  private readonly lines = new Map<string, string[]>();

  constructor(
    files: ReadonlyArray<{ fileName: string; source: string }>,
    private readonly fallback: string,
  ) {
    for (const f of files)
      this.lines.set(f.fileName, f.source.split(/\r\n|\r|\n/));
  }

  /** Text a span covers, end column included; undefined when the span has no position. */
  slice(span: SourceSpan): string | undefined {
    if (span.startLine <= 0 || span.endLine < span.startLine) return undefined;
    const lines =
      this.lines.get(span.file) ?? this.fallback.split(/\r\n|\r|\n/);
    const parts: string[] = [];
    for (let l = span.startLine; l <= span.endLine; l++) {
      const line = lines[l - 1];
      if (line === undefined) return undefined;
      const from = l === span.startLine ? span.startCol - 1 : 0;
      const to = l === span.endLine ? span.endCol : line.length;
      parts.push(line.slice(from, to));
    }
    return parts.join("\n");
  }

  /** `{ displayName }` when the name is written in another case within the span, else nothing. */
  spelling(span: SourceSpan, name: string): { displayName?: string } {
    const text = this.slice(span);
    if (text === undefined) return {};
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(
      `(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`,
      "i",
    ).exec(text)?.[0];
    return found !== undefined && found !== name ? { displayName: found } : {};
  }
}

/** Adds a variable's attribute pragmas, written spelling and default value text to its manifest entry. */
function describeVar(
  entry: LibraryVarType,
  decl: VarDeclaration,
  index: number,
  text: SourceText | undefined,
): LibraryVarType {
  Object.assign(entry, attributesOf(decl));
  const nameSpan = decl.nameSpans?.[index];
  if (text !== undefined && nameSpan !== undefined) {
    Object.assign(entry, text.spelling(nameSpan, entry.name));
  }
  const initial =
    decl.initialValue !== undefined
      ? text?.slice(decl.initialValue.sourceSpan)
      : undefined;
  if (initial !== undefined) entry.initialValue = initial.trim();
  return entry;
}

/** Variables of the given block kind, in declaration order. */
function blockVars(
  varBlocks: readonly VarBlock[],
  blockType: string,
  text: SourceText | undefined,
): LibraryVarType[] {
  return varBlocks
    .filter((b) => b.blockType === blockType)
    .flatMap((b) =>
      b.declarations.flatMap((d) =>
        d.names.map((n, i) =>
          describeVar(serializeVarType(n, d.type), d, i, text),
        ),
      ),
    );
}

function serializeMethod(
  m: MethodDeclaration,
  text: SourceText | undefined,
): LibraryMethodEntry {
  return {
    name: m.name,
    ...(text !== undefined ? text.spelling(m.sourceSpan, m.name) : {}),
    ...attributesOf(m),
    visibility: m.visibility,
    ...(m.returnType ? { returnType: serializeTypeRef(m.returnType) } : {}),
    ...(m.isAbstract ? { isAbstract: true as const } : {}),
    ...(m.isFinal ? { isFinal: true as const } : {}),
    ...(m.isOverride ? { isOverride: true as const } : {}),
    inputs: blockVars(m.varBlocks, "VAR_INPUT", text),
    outputs: blockVars(m.varBlocks, "VAR_OUTPUT", text),
    inouts: blockVars(m.varBlocks, "VAR_IN_OUT", text),
  };
}

function serializeProperty(
  p: PropertyDeclaration,
  text: SourceText | undefined,
): LibraryPropertyEntry {
  return {
    name: p.name,
    ...(text !== undefined ? text.spelling(p.sourceSpan, p.name) : {}),
    ...attributesOf(p),
    type: serializeTypeRef(p.type),
    visibility: p.visibility,
    ...(p.getter ? { getter: true as const } : {}),
    ...(p.setter ? { setter: true as const } : {}),
  };
}

function serializeInterface(
  i: InterfaceDeclaration,
  text: SourceText | undefined,
): LibraryInterfaceEntry {
  return {
    name: i.name,
    ...(text !== undefined ? text.spelling(i.sourceSpan, i.name) : {}),
    ...attributesOf(i),
    ...(i.extends && i.extends.length > 0 ? { extends: i.extends } : {}),
    methods: i.methods.map((m) => serializeMethod(m, text)),
    properties: i.properties.map((p) => serializeProperty(p, text)),
  };
}

/** Records `cppName` when the member-mangling rule renames the member in C++. */
function withCppName(
  entry: LibraryVarType,
  ctx: MemberManglingContext | undefined,
): LibraryVarType {
  if (ctx === undefined) return entry;
  const cppName = mangledMemberName(entry.name, entry.type, ctx);
  if (cppName !== entry.name) entry.cppName = cppName;
  return entry;
}

/**
 * Serialize one `VAR` member of a function block for the manifest.
 *
 * Same shape as the interface entries, plus what only the declaring
 * library can answer:
 *
 *   • `cppName` when codegen mangled the member (see {@link withCppName}).
 *     Both mangling rules are decided against this compilation unit — whether
 *     the member's type is user-defined HERE, and which method names the
 *     block's class hierarchy reserves — so a consumer cannot always
 *     re-derive them. Emitted only when it differs.
 *
 *   • `readOnly` / `retain` from the declaring block's qualifiers. A
 *     `VAR RETAIN` inside a function block is retained in every instance of
 *     it, however the instance itself was declared.
 */
function serializeLocal(
  name: string,
  index: number,
  decl: VarDeclaration,
  block: VarBlock,
  ctx: MemberManglingContext | undefined,
  text: SourceText | undefined,
): LibraryVarType {
  const entry = describeVar(
    withCppName(serializeVarType(name, decl.type), ctx),
    decl,
    index,
    text,
  );
  if (block.isConstant) entry.readOnly = true;
  if (block.isRetain) entry.retain = true;
  return entry;
}

/** Match a top-of-line POU header. */
const POU_HEADER_RE =
  /^[ \t]*(FUNCTION_BLOCK|FUNCTION|PROGRAM|TYPE)[ \t]+(\w+)/gm;

/**
 * Build a "POU name → category" map from categorized source inputs.
 *
 * Each .st file may declare multiple POUs (counter.st in iec-standard-fb
 * holds 15 counter variants in one file). All POUs declared in the same
 * source file inherit that file's category — by construction each input
 * file lives in exactly one folder.
 *
 * Uses a regex over top-of-line POU declarations rather than running the
 * parser, which keeps the lookup cheap (~600 sources × cheap regex vs.
 * Chevrotain re-parse per source).
 */
function buildCategoryByPouName(
  sources: Array<{ source: string; fileName: string; category?: string }>,
): Map<string, string> {
  // Manifest entry names come from the parser, which uppercases POU
  // identifiers. Source-text names preserve original casing (CODESYS
  // happily exports "FT_Profile" as mixed case). Normalize both sides
  // by uppercasing the map keys, so we match regardless of the casing
  // used in the original source.
  const map = new Map<string, string>();
  for (const src of sources) {
    if (!src.category) continue;
    let m: RegExpExecArray | null;
    POU_HEADER_RE.lastIndex = 0;
    while ((m = POU_HEADER_RE.exec(src.source)) !== null) {
      const name = m[2]!.toUpperCase();
      if (!map.has(name)) map.set(name, src.category);
    }
  }
  return map;
}

/**
 * Build a "POU name → documentation" map from caller-supplied per-source
 * documentation strings.
 *
 * Documentation lives in the source entry rather than in the source text
 * — only the upstream importer (V3 codesys-importer in particular) knows
 * which `(* … *)` block in a source is structurally the POU doc and which
 * is an inline variable annotation. The compiler trusts what the importer
 * already determined; if `source.documentation` is set, it's the doc.
 *
 * For hand-authored .st files (e.g. when `--compile-lib` is pointed at a
 * directory of .st files without going through the codesys-importer),
 * `documentation` is unset and the map stays empty — those libraries get
 * their docs from the `library.json` `blocks` / `functions` maps via
 * `applyLibraryConfigDocumentation`, which still runs as a post-step.
 *
 * Each input source maps to all POU names it declares; the strucpp parser
 * uppercases identifiers, so we uppercase keys to bridge cases like
 * OSCAT's `FT_Profile` → manifest `FT_PROFILE`.
 */
function buildDocByPouName(
  sources: Array<{
    source: string;
    fileName: string;
    documentation?: string;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const src of sources) {
    if (!src.documentation) continue;
    let m: RegExpExecArray | null;
    POU_HEADER_RE.lastIndex = 0;
    while ((m = POU_HEADER_RE.exec(src.source)) !== null) {
      const name = m[2]!.toUpperCase();
      if (!map.has(name)) map.set(name, src.documentation);
    }
  }
  return map;
}

/**
 * Optionally tag a manifest entry with its category. The field is omitted
 * entirely when no category was assigned, so an .stlib built from a flat
 * source layout serializes byte-identical to the pre-hierarchy format.
 */
function tagCategory<T extends { name: string; category?: string }>(
  entry: T,
  catByName: Map<string, string>,
): T {
  const cat = catByName.get(entry.name);
  if (cat) entry.category = cat;
  return entry;
}

/**
 * Optionally tag a manifest entry with documentation extracted from its
 * inline source doc-block. Same omit-when-empty contract as `tagCategory`
 * — entries without a doc block in their source serialize identically to
 * the pre-extraction shape, so library.json's
 * `applyLibraryConfigDocumentation` post-processor still works as the
 * authoritative override mechanism for hand-curated docs.
 */
function tagDocumentation<T extends { name: string; documentation?: string }>(
  entry: T,
  docByName: Map<string, string>,
): T {
  const doc = docByName.get(entry.name);
  if (doc) entry.documentation = doc;
  return entry;
}

/**
 * Compile ST source files into a library.
 *
 * @param sources - Array of ST source files
 * @param options - Library metadata
 * @returns The compiled library with manifest and C++ code
 */
/** Manifest for a library that produced no symbols — used on the error paths. */
function emptyManifest(options: {
  name: string;
  version: string;
  namespace: string;
}): LibraryManifest {
  return {
    name: options.name,
    version: options.version,
    namespace: options.namespace,
    functions: [],
    functionBlocks: [],
    types: [],
    headers: [],
    isBuiltin: false,
  };
}

/**
 * Build a manifest entry for one function block from its AST node.
 *
 * Shared by the ST pass and the native-header pass so both describe a
 * block's members identically — the native path differs only in what it adds
 * afterwards (`implementation`, `sourceFile`). `locals` holds the block's own
 * `VAR` members: RETAIN covers them, and the type checker treats an entry
 * with `methods` as listing every member.
 */
function buildFBEntry(
  fb: FunctionBlockDeclaration,
  text: SourceText,
  ctx?: MemberManglingContext,
): LibraryFBEntry {
  const varsOfBlock = (blockType: string): LibraryVarType[] =>
    fb.varBlocks
      .filter((b) => b.blockType === blockType)
      .flatMap((b) =>
        b.declarations.flatMap((d) =>
          d.names.map((n, i) =>
            describeVar(
              withCppName(serializeVarType(n, d.type), ctx),
              d,
              i,
              text,
            ),
          ),
        ),
      );

  return {
    name: fb.name,
    ...text.spelling(fb.sourceSpan, fb.name),
    inputs: varsOfBlock("VAR_INPUT"),
    outputs: varsOfBlock("VAR_OUTPUT"),
    inouts: varsOfBlock("VAR_IN_OUT"),
    ...(fb.extends !== undefined ? { extends: fb.extends } : {}),
    ...(fb.implements && fb.implements.length > 0
      ? { implements: fb.implements }
      : {}),
    ...(fb.isAbstract ? { isAbstract: true as const } : {}),
    ...(fb.isFinal ? { isFinal: true as const } : {}),
    ...attributesOf(fb),
    locals: fb.varBlocks
      .filter((b) => b.blockType === "VAR")
      .flatMap((b) =>
        b.declarations.flatMap((d) =>
          d.names.map((n, i) => serializeLocal(n, i, d, b, ctx, text)),
        ),
      ),
    methods: fb.methods.map((m) => serializeMethod(m, text)),
    properties: fb.properties.map((p) => serializeProperty(p, text)),
  };
}

/**
 * Recover manifest entries for native (C/C++, Python) library sources.
 *
 * Each file is projected down to its ST header and run through the ordinary
 * front end, so the interface is parsed and type-checked by exactly the code
 * that handles an ST block — there is no second declaration parser to drift.
 * The native body never reaches the parser, and no chunk is produced: the body
 * is transported in `sources` and lowered by the consumer. See
 * `native-sources.ts`.
 *
 * All headers are projected into ONE synthetic translation unit so a native
 * block may reference a type another native block declares, matching how ST
 * sources in the same library already see each other.
 */
function compileNativeEntries(
  native: readonly NativeSource[],
  options: {
    dependencies?: StlibArchive[];
    globalConstants?: Record<string, number>;
  },
): {
  functionBlocks: LibraryFBEntry[];
  errors: Array<{ message: string; file?: string; line?: number }>;
} {
  // Native blocks are always FUNCTION_BLOCKs — `projectNativeHeaderToSt`
  // rejects FUNCTION and PROGRAM — so there is no function list to return.
  const empty = { functionBlocks: [], errors: [] };
  if (native.length === 0) return empty;

  const projected: string[] = [];
  const languageByName = new Map<string, NativeSource>();
  const docByFile = new Map<string, string>();
  const errors: Array<{ message: string; file?: string; line?: number }> = [];

  for (const source of native) {
    const outcome = projectNativeHeaderToSt(source);
    if ("message" in outcome) {
      errors.push({ message: outcome.message, file: outcome.fileName });
      continue;
    }
    projected.push(outcome.st);
    // Upper-cased: the front end normalises identifiers, so that is the key
    // the AST will come back with.
    languageByName.set(outcome.name.toUpperCase(), source);
    if (outcome.documentation !== undefined) {
      docByFile.set(source.fileName, outcome.documentation);
    }
  }

  if (errors.length > 0) return { ...empty, errors };
  if (projected.length === 0) return empty;

  const compileOpts: Partial<import("../types.js").CompileOptions> = {};
  if (options.dependencies) compileOpts.libraries = options.dependencies;
  if (options.globalConstants)
    compileOpts.globalConstants = options.globalConstants;

  // Codegen output is discarded — this pass exists only for the AST. Running
  // the full `compile` (rather than parsing alone) means a native block with a
  // bad declaration fails here, with the same diagnostics an ST block gets.
  const result = compile(projected.join("\n"), compileOpts);
  if (!result.success || !result.ast) {
    return {
      ...empty,
      errors: result.errors.map((e) => {
        const entry: { message: string; file?: string; line?: number } = {
          message: `native block header: ${e.message}`,
          line: e.line,
        };
        return entry;
      }),
    };
  }

  const tagNative = <T extends { name: string }>(entry: T): T => {
    const source = languageByName.get(entry.name.toUpperCase());
    if (!source) return entry;
    const documentation = docByFile.get(source.fileName);
    return {
      ...entry,
      implementation: source.language,
      sourceFile: source.fileName,
      ...(source.category !== undefined ? { category: source.category } : {}),
      ...(documentation !== undefined && documentation.length > 0
        ? { documentation }
        : {}),
    };
  };

  return {
    functionBlocks: result.ast.functionBlocks.map((fb) =>
      tagNative(buildFBEntry(fb, new SourceText([], projected.join("\n")))),
    ),
    errors: [],
  };
}

/**
 * Every exported name in a manifest that is claimed by more than one symbol.
 *
 * A library exports one thing per name. STruC++'s own duplicate detection only
 * fires within a single kind and a single translation unit — two
 * `FUNCTION_BLOCK Foo` in one compile is caught, but `FUNCTION Foo` beside
 * `FUNCTION_BLOCK Foo` is not, and native headers compile in a separate unit
 * so nothing there is compared against the ST at all.
 *
 * The result is a manifest with two entries under one name, no error, and a
 * consumer picking whichever it happens to read last. Nothing downstream
 * currently validates against these entries, so today it goes unnoticed — but
 * a published `.stlib` is immutable, and the next reader that does validate
 * inherits the ambiguity. Cheaper to refuse to emit it.
 */
function findDuplicateExports(manifest: LibraryManifest): string[] {
  const kindsByName = new Map<string, string[]>();
  const claim = (name: string, kind: string): void => {
    const key = name.toUpperCase();
    const kinds = kindsByName.get(key);
    if (kinds) kinds.push(kind);
    else kindsByName.set(key, [kind]);
  };

  for (const fn of manifest.functions) claim(fn.name, "function");
  for (const fb of manifest.functionBlocks) {
    claim(
      fb.name,
      fb.implementation
        ? `${fb.implementation} function block`
        : "function block",
    );
  }
  for (const type of manifest.types) claim(type.name, "type");
  for (const global of manifest.globals ?? [])
    claim(global.name, "global variable");

  const messages: string[] = [];
  for (const [name, kinds] of kindsByName) {
    if (kinds.length < 2) continue;
    messages.push(
      `"${name}" is exported ${kinds.length} times by this library (as ${kinds.join(", ")}). ` +
        "A library exports one symbol per name — rename or remove one of them.",
    );
  }
  return messages;
}

export function compileLibrary(
  sources: Array<{
    source: string;
    fileName: string;
    category?: string;
    documentation?: string;
  }>,
  options: {
    name: string;
    version: string;
    namespace: string;
    /** Library archives this library depends on */
    dependencies?: StlibArchive[];
    /** Global constants available during compilation (e.g., STRING_LENGTH) */
    globalConstants?: Record<string, number>;
  },
): LibraryCompileResult {
  const catByName = buildCategoryByPouName(sources);
  const docByName = buildDocByPouName(sources);

  // Native (C/C++, Python) sources are transported, not compiled: their ST
  // header yields a manifest entry and their body rides in `sources`. Only
  // the ST/IL inputs go to the compiler below, so a library may legitimately
  // consist entirely of native blocks and hand the compiler nothing.
  const { st: stSources, native: nativeSources } =
    partitionLibrarySources(sources);
  const nativeEntries = compileNativeEntries(nativeSources, options);
  if (nativeEntries.errors.length > 0) {
    return {
      success: false,
      manifest: emptyManifest(options),
      headerCode: "",
      cppCode: "",
      errors: nativeEntries.errors,
    };
  }

  if (sources.length === 0) {
    return {
      success: false,
      manifest: emptyManifest(options),
      headerCode: "",
      cppCode: "",
      errors: [{ message: "No source files provided" }],
    };
  }

  // Every input was a native block. There is nothing for the compiler to do,
  // so it is not called: the manifest is the native entries, and the bodies
  // ride in `sources`. Asking the compiler to compile an empty translation
  // unit would fail, which is what used to make an all-native library
  // unbuildable.
  if (stSources.length === 0) {
    const nativeOnlyManifest: LibraryManifest = {
      ...emptyManifest(options),
      functionBlocks: nativeEntries.functionBlocks,
      headers: [`${options.name}.hpp`],
      sourceFiles: sources.map((s) => s.fileName),
    };
    const duplicates = findDuplicateExports(nativeOnlyManifest);
    if (duplicates.length > 0) {
      return {
        success: false,
        manifest: emptyManifest(options),
        headerCode: "",
        cppCode: "",
        errors: duplicates.map((message) => ({ message })),
      };
    }
    return {
      success: true,
      manifest: nativeOnlyManifest,
      headerCode: "",
      cppCode: "",
      chunks: [],
      errors: [],
    };
  }

  // Compile the ST sources together
  const primarySource = stSources[0]!;
  const additionalSources = stSources.slice(1);

  const compileOpts: Partial<import("../types.js").CompileOptions> = {
    additionalSources,
    // Always emit chunk markers when compiling a library — the
    // archive's `chunks[]` is derived from them. The markers are
    // stripped from the final `headerCode` / `cppCode` blobs before
    // they're persisted, so downstream consumers (legacy and
    // chunk-aware alike) see clean output.
    emitChunkMarkers: true,
  };
  if (options.dependencies) {
    compileOpts.libraries = options.dependencies;
  }
  if (options.globalConstants) {
    compileOpts.globalConstants = options.globalConstants;
  }
  const result = compile(primarySource.source, compileOpts);

  if (!result.success) {
    return {
      success: false,
      manifest: {
        name: options.name,
        version: options.version,
        namespace: options.namespace,
        functions: [],
        functionBlocks: [],
        types: [],
        headers: [],
        isBuiltin: false,
        sourceFiles: sources.map((s) => s.fileName),
      },
      headerCode: "",
      cppCode: "",
      errors: result.errors.map((e) => {
        const entry: { message: string; file?: string; line?: number } = {
          message: e.message,
          line: e.line,
        };
        if (e.file !== undefined) {
          entry.file = e.file;
        }
        return entry;
      }),
    };
  }

  // Extract manifest entries from the AST
  const ast = result.ast!;
  const text = new SourceText(stSources, primarySource.source);

  const headerFileName = `${options.name}.hpp`;

  const userTypes = userDefinedTypeNames(ast);
  const blockMethodNames = methodNamesByBlock(
    ast,
    functionBlockLookup(ast, result.symbolTables),
  );

  const manglingCtx = (
    fb: FunctionBlockDeclaration,
  ): MemberManglingContext => ({
    isUserDefinedType: (n) => userTypes.has(n.toUpperCase()),
    methodNames: blockMethodNames.get(fb.name.toUpperCase()),
  });

  // Slice emitted code into per-symbol chunks via the boundary
  // markers; the cleaned (marker-stripped) text replaces the original
  // `headerCode`/`cppCode` so downstream consumers see no markers.
  const { chunks, cleanHeader, cleanCpp } = buildChunks(
    result.headerCode,
    result.cppCode,
    "\n",
    ast,
    options.name,
    options.dependencies ?? [],
  );

  const builtManifest: LibraryManifest = {
    name: options.name,
    version: options.version,
    namespace: options.namespace,
    functions: ast.functions.map((fn) =>
      tagDocumentation(
        tagCategory(
          {
            name: fn.name,
            ...text.spelling(fn.sourceSpan, fn.name),
            ...attributesOf(fn),
            returnType: fn.returnType.name,
            parameters: fn.varBlocks.flatMap((block) =>
              block.declarations.flatMap((decl) => {
                const initialValue =
                  decl.initialValue !== undefined
                    ? serializeInitialValue(decl.initialValue)
                    : undefined;
                return decl.names.map((name, i) => ({
                  name,
                  ...(decl.nameSpans?.[i] !== undefined
                    ? text.spelling(decl.nameSpans[i], name)
                    : {}),
                  type: decl.type.name,
                  direction:
                    block.blockType === "VAR_OUTPUT"
                      ? "output"
                      : block.blockType === "VAR_IN_OUT"
                        ? "inout"
                        : "input",
                  // Present ⇒ optional input (default supplied); absent ⇒
                  // mandatory. Preserved from user ST and CODESYS-imported ST.
                  ...(initialValue !== undefined ? { initialValue } : {}),
                  ...attributesOf(decl),
                }));
              }),
            ),
          },
          catByName,
        ),
        docByName,
      ),
    ),
    functionBlocks: [
      ...ast.functionBlocks.map((fb) =>
        tagDocumentation(
          tagCategory(buildFBEntry(fb, text, manglingCtx(fb)), catByName),
          docByName,
        ),
      ),
      ...nativeEntries.functionBlocks,
    ],
    interfaces: ast.interfaces
      .filter((i) => i.library === undefined)
      .map((i) => tagCategory(serializeInterface(i, text), catByName)),
    types: ast.types.map((t) => {
      const kind: "struct" | "enum" | "alias" =
        t.definition.kind === "StructDefinition"
          ? "struct"
          : t.definition.kind === "EnumDefinition"
            ? "enum"
            : "alias";
      const entry: LibraryTypeEntry = {
        name: t.name,
        ...text.spelling(t.sourceSpan, t.name),
        kind,
        ...attributesOf(t),
      };
      // Export struct member fields so consumers can type `x.field` access
      // on a dependency struct.
      if (t.definition.kind === "StructDefinition") {
        entry.fields = t.definition.fields.flatMap((decl) =>
          decl.names.map((name, i) => ({
            name,
            ...(decl.nameSpans?.[i] !== undefined
              ? text.spelling(decl.nameSpans[i], name)
              : {}),
            type: decl.type.name,
            ...attributesOf(decl),
          })),
        );
      }
      if (t.definition.kind === "EnumDefinition") {
        entry.members = t.definition.members.map((m) => {
          const value =
            m.value !== undefined ? text.slice(m.value.sourceSpan) : undefined;
          return {
            name: m.name,
            ...text.spelling(m.sourceSpan, m.name),
            ...(value !== undefined ? { value: value.trim() } : {}),
            ...attributesOf(m),
          };
        });
      }
      return tagDocumentation(tagCategory(entry, catByName), docByName);
    }),
    // Exported VAR_GLOBAL variables — their storage is emitted as inlineGlobal
    // chunks; this list lets consumers' analyzers resolve the symbols. Every
    // importing program merges all libraries' globals into one global scope.
    globals: ast.globalVarBlocks.flatMap((block) =>
      block.declarations.flatMap((decl) =>
        decl.names.map((name, i) => {
          const initialValue =
            decl.initialValue !== undefined
              ? text.slice(decl.initialValue.sourceSpan)
              : undefined;
          return tagCategory(
            {
              name,
              ...(decl.nameSpans?.[i] !== undefined
                ? text.spelling(decl.nameSpans[i], name)
                : {}),
              type: decl.type.name,
              ...(block.isConstant ? { constant: true } : {}),
              ...(initialValue !== undefined
                ? { initialValue: initialValue.trim() }
                : {}),
              ...attributesOf(decl),
            },
            catByName,
          );
        }),
      ),
    ),
    headers: [headerFileName],
    isBuiltin: false,
    sourceFiles: sources.map((s) => s.fileName),
  };

  // Guard AFTER both lists are assembled: the ST symbols and the native ones
  // come from separate compiles, so this is the first point where a collision
  // between them is visible.
  const duplicates = findDuplicateExports(builtManifest);
  if (duplicates.length > 0) {
    return {
      success: false,
      manifest: emptyManifest(options),
      headerCode: "",
      cppCode: "",
      errors: duplicates.map((message) => ({ message })),
    };
  }

  return {
    success: true,
    manifest: builtManifest,
    headerCode: cleanHeader,
    cppCode: cleanCpp,
    chunks,
    errors: [],
  };
}

/**
 * Compile ST source files into a single `.stlib` archive.
 *
 * Wraps `compileLibrary()` and packages the result into a `StlibArchive`
 * with extracted namespace bodies for the C++ code.
 *
 * @param sources - Array of ST source files
 * @param options - Library metadata and compilation options
 * @returns The compiled `.stlib` archive result
 */
export function compileStlib(
  sources: Array<{
    source: string;
    fileName: string;
    category?: string;
    documentation?: string;
  }>,
  options: {
    name: string;
    version: string;
    namespace: string;
    noSource?: boolean;
    /** Mark this library as a built-in runtime library */
    builtin?: boolean;
    /**
     * Headers the library's `{external}` code needs, such as a C API it calls. They are recorded in the manifest, so
     * every program using the library includes them; the consumer supplies the files on its include path.
     */
    headers?: string[];
    /** Library archives this library depends on */
    dependencies?: StlibArchive[];
    /** Global constants available during compilation (e.g., STRING_LENGTH) */
    globalConstants?: Record<string, number>;
  },
): StlibCompileResult {
  for (const header of options.headers ?? []) {
    if (!/^[\w./+-]+$/.test(header)) {
      throw new TypeError(
        `headers entry ${JSON.stringify(header)} is not a valid include filename ` +
          `(allowed characters: alphanumerics, '.', '/', '-', '_', '+').`,
      );
    }
  }
  const libResult = compileLibrary(sources, options);
  if (options.builtin) {
    libResult.manifest.isBuiltin = true;
  }

  if (!libResult.success) {
    return {
      success: false,
      archive: {
        formatVersion: 1,
        manifest: libResult.manifest,
        chunks: [],
        dependencies: [],
      },
      errors: libResult.errors,
    };
  }

  // The library's own header is not listed: its C++ is inlined into the consumer's output through
  // addLibraryChunks(). Only the headers its {external} code needs are.
  const manifest = {
    ...libResult.manifest,
    headers: [...(options.headers ?? [])],
  };

  // Chunks own each declared symbol's emit slices, so the dep-preamble
  // strip that used to operate on the library-wide blob is no longer
  // needed: a chunk only emits its own declaration text, never a
  // dependency's, by construction.
  const archive: StlibCompileResult["archive"] = {
    formatVersion: 1,
    manifest,
    chunks: libResult.chunks ?? [],
    dependencies: (options.dependencies ?? []).map((d) => ({
      name: d.manifest.name,
      version: d.manifest.version,
    })),
  };
  // `noSource` is closed-source distribution: drop the ST, whose symbols are
  // already compiled into `chunks` and usable without it.
  //
  // Native (C/C++, Python) bodies are exempt, and must be. They have no chunk
  // — nothing compiled them — so the source IS the deliverable, and stripping
  // it would produce an archive no consumer can build against. A native block
  // simply cannot be shipped closed-source in this format.
  const persisted = options.noSource
    ? sources.filter((s) => nativeLanguageFor(s.fileName) !== null)
    : sources;
  if (persisted.length > 0) {
    archive.sources = persisted.map((s) => {
      const entry: { fileName: string; source: string; category?: string } = {
        fileName: s.fileName,
        source: s.source,
      };
      if (s.category) entry.category = s.category;
      return entry;
    });
  }
  if (
    options.globalConstants &&
    Object.keys(options.globalConstants).length > 0
  ) {
    archive.globalConstants = options.globalConstants;
  }

  return {
    success: true,
    archive,
    errors: [],
  };
}
