// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * STruC++ Library Loader
 *
 * Loads library manifests and registers their symbols into the symbol tables
 * for cross-library function resolution.
 */

import type {
  LibraryInterfaceEntry,
  LibraryManifest,
  LibraryMethodEntry,
  LibraryPropertyEntry,
  LibraryTypeEntry,
  LibraryTypeRef,
  LibraryVarType,
  StlibArchive,
} from "./library-manifest.js";
import type { SymbolTables, VariableSymbol } from "../semantic/symbol-table.js";
import { DuplicateSymbolError } from "../semantic/symbol-table.js";
import type {
  ElementaryType,
  FunctionBlockDeclaration,
  IECType,
  InterfaceDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  ReferenceKind,
  StructDefinition,
  StructType,
  TypeReference,
  VarBlock,
  VarBlockType,
  VarDeclaration,
} from "../frontend/ast.js";
import { createDefaultSourceSpan } from "../frontend/ast.js";
import { ELEMENTARY_TYPES } from "../semantic/type-utils.js";

/**
 * Error thrown when a library manifest fails validation.
 */
export class LibraryManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryManifestError";
  }
}

/** Build a TypeReference AST node from a manifest variable entry. The
 *  reference preserves the metadata downstream consumers (codegen,
 *  debug-table-gen) need to recurse into nested types. */
function makeTypeRef(v: LibraryTypeRef): TypeReference {
  // Archive JSON is external input: keep only kinds the compiler writes.
  const referenceKind: ReferenceKind = isReferenceKind(v.referenceKind)
    ? v.referenceKind
    : "none";
  const ref: TypeReference = {
    kind: "TypeReference",
    sourceSpan: createDefaultSourceSpan(),
    name: v.type,
    isReference: referenceKind !== "none",
    referenceKind,
  };
  if (v.arrayDimensions) ref.arrayDimensions = v.arrayDimensions;
  if (v.elementTypeName) ref.elementTypeName = v.elementTypeName;
  if (v.elementMaxLength !== undefined)
    ref.elementMaxLength = v.elementMaxLength;
  if (v.maxLength !== undefined) ref.maxLength = v.maxLength;
  if (v.elementReferenceChain) {
    ref.elementReferenceChain = v.elementReferenceChain.filter(isReferenceKind);
  }
  if (v.referenceChain) {
    ref.referenceChain = v.referenceChain.filter(isReferenceKind);
  }
  return ref;
}

function isReferenceKind(
  kind: unknown,
): kind is "pointer_to" | "ref_to" | "reference_to" {
  return kind === "pointer_to" || kind === "ref_to" || kind === "reference_to";
}

/** Create a VariableSymbol from a library variable entry. The synthesized
 *  VarDeclaration carries the real TypeReference so AST-walking consumers
 *  (debug-table-gen) can recurse uniformly across user-defined and
 *  library-defined function blocks. */
/**
 * The AST definition a library type is registered under.
 *
 * A struct that exported its fields gets a real `StructDefinition`, so anything
 * walking the type — the debug table above all — can descend into its members.
 * Everything else keeps the historical self-referential `TypeReference`, which
 * the walk reads as "opaque library type": an alias points at its base, and a
 * struct without exported fields genuinely has nothing to descend into.
 */
function buildLibraryTypeDefinition(
  t: LibraryTypeEntry,
): StructDefinition | TypeReference {
  if (t.kind === "struct" && t.fields && t.fields.length > 0) {
    return {
      kind: "StructDefinition",
      sourceSpan: createDefaultSourceSpan(),
      fields: t.fields.map((f) => ({
        kind: "VarDeclaration" as const,
        sourceSpan: createDefaultSourceSpan(),
        names: [f.name],
        type: {
          kind: "TypeReference" as const,
          sourceSpan: createDefaultSourceSpan(),
          name: f.type,
          isReference: false,
          referenceKind: "none" as const,
        },
      })),
    };
  }
  return {
    kind: "TypeReference",
    sourceSpan: createDefaultSourceSpan(),
    name: t.baseType ?? t.name,
    isReference: false,
    referenceKind: "none",
  };
}

/** A var block of library variables, as a declaration holds them. */
function makeVarBlock(
  blockType: VarBlockType,
  vars: LibraryVarType[],
): VarBlock {
  return {
    kind: "VarBlock",
    sourceSpan: createDefaultSourceSpan(),
    blockType,
    isConstant: false,
    isRetain: false,
    isNonRetain: false,
    declarations: vars.map((v) => ({
      kind: "VarDeclaration" as const,
      sourceSpan: createDefaultSourceSpan(),
      names: [v.name],
      type: makeTypeRef(v),
      ...(v.attributes !== undefined ? { attributes: v.attributes } : {}),
    })),
  };
}

/** A library method as a declaration without a body: enough to call, override and check access. */
function makeMethod(m: LibraryMethodEntry): MethodDeclaration {
  return {
    kind: "MethodDeclaration",
    sourceSpan: createDefaultSourceSpan(),
    name: m.name,
    visibility: m.visibility,
    isAbstract: m.isAbstract === true,
    isFinal: m.isFinal === true,
    isOverride: m.isOverride === true,
    ...(m.returnType ? { returnType: makeTypeRef(m.returnType) } : {}),
    varBlocks: [
      makeVarBlock("VAR_INPUT", m.inputs),
      makeVarBlock("VAR_OUTPUT", m.outputs),
      makeVarBlock("VAR_IN_OUT", m.inouts),
    ].filter((b) => b.declarations.length > 0),
    body: [],
  };
}

/** A library property with empty accessors for the ones it has. */
function makeProperty(p: LibraryPropertyEntry): PropertyDeclaration {
  return {
    kind: "PropertyDeclaration",
    sourceSpan: createDefaultSourceSpan(),
    name: p.name,
    type: makeTypeRef(p.type),
    visibility: p.visibility,
    ...(p.getter ? { getter: [] } : {}),
    ...(p.setter ? { setter: [] } : {}),
  };
}

/**
 * The declaration a library function block is registered under: its variables, so a derived block can use what it
 * inherits, and its methods and properties when the archive exports them.
 */
function makeFunctionBlockDeclaration(
  fb: LibraryManifest["functionBlocks"][0],
): FunctionBlockDeclaration {
  return {
    kind: "FunctionBlockDeclaration",
    sourceSpan: createDefaultSourceSpan(),
    name: fb.name,
    isAbstract: fb.isAbstract === true,
    isFinal: fb.isFinal === true,
    ...(fb.attributes !== undefined ? { attributes: fb.attributes } : {}),
    ...(fb.extends !== undefined ? { extends: fb.extends } : {}),
    ...(fb.implements !== undefined ? { implements: fb.implements } : {}),
    varBlocks: [
      makeVarBlock("VAR_INPUT", fb.inputs),
      makeVarBlock("VAR_OUTPUT", fb.outputs),
      makeVarBlock("VAR_IN_OUT", fb.inouts),
      makeVarBlock("VAR", fb.locals ?? []),
    ].filter((b) => b.declarations.length > 0),
    methods: (fb.methods ?? []).map(makeMethod),
    properties: (fb.properties ?? []).map(makeProperty),
    body: [],
  };
}

/**
 * A library's interfaces as declarations, marked with the library's name, which is also the file their diagnostics
 * report. The compiler adds them to the consuming unit so every interface check sees them; their C++ comes from the
 * library's chunks, not the consumer's code.
 */
export function libraryInterfaceDeclarations(
  manifest: LibraryManifest,
): InterfaceDeclaration[] {
  const sourceSpan = { ...createDefaultSourceSpan(), file: manifest.name };
  return (manifest.interfaces ?? []).map((i: LibraryInterfaceEntry) => ({
    kind: "InterfaceDeclaration",
    sourceSpan,
    name: i.name,
    ...(i.extends !== undefined ? { extends: i.extends } : {}),
    methods: i.methods.map((m) => ({ ...makeMethod(m), sourceSpan })),
    properties: i.properties.map((p) => ({ ...makeProperty(p), sourceSpan })),
    library: manifest.name,
  }));
}

function makeVarSymbol(
  v: LibraryVarType,
  direction: "input" | "output" | "inout" | "local",
): VariableSymbol {
  const varType: ElementaryType = ELEMENTARY_TYPES[v.type.toUpperCase()] ?? {
    typeKind: "elementary",
    name: v.type,
    sizeBits: 0,
  };
  const declaration: VarDeclaration = {
    kind: "VarDeclaration",
    sourceSpan: createDefaultSourceSpan(),
    names: [v.name],
    type: makeTypeRef(v),
    ...(v.attributes !== undefined ? { attributes: v.attributes } : {}),
  };
  return {
    name: v.name,
    kind: "variable",
    type: varType,
    declaration,
    isInput: direction === "input",
    isOutput: direction === "output",
    isInOut: direction === "inout",
    isExternal: false,
    isGlobal: false,
    // A `VAR RETAIN` inside the library is retained in every instance of the
    // block, whatever the instance's own qualifier — so the manifest's flag
    // travels onto the symbol rather than being re-derived at the use site.
    isRetain: v.retain === true,
    // Only present when the library's codegen mangled the member; the walk
    // prefers it over re-deriving the rule against the wrong unit.
    ...(v.cppName !== undefined ? { cppName: v.cppName } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const VISIBILITIES: readonly string[] = [
  "PUBLIC",
  "PRIVATE",
  "PROTECTED",
  "INTERNAL",
];

/**
 * Checks the `methods` and `properties` of an exported block or interface (required for an interface, optional for
 * a block): arrays of named entries with a known visibility, methods with their three parameter lists.
 */
/** Refuses an `attributes` field that is not a list of named attribute pragmas. */
function validateAttributes(owner: unknown, where: string): void {
  if (!isRecord(owner) || owner.attributes === undefined) return;
  if (!Array.isArray(owner.attributes)) {
    throw new LibraryManifestError(
      `Invalid library manifest: ${where}.attributes must be an array`,
    );
  }
  owner.attributes.forEach((a: unknown, k) => {
    if (
      !isRecord(a) ||
      typeof a.name !== "string" ||
      a.name === "" ||
      (a.value !== undefined && typeof a.value !== "string")
    ) {
      throw new LibraryManifestError(
        `Invalid library manifest: ${where}.attributes[${k}] must have a non-empty string name and an optional string value`,
      );
    }
  });
}

function validateMembers(
  owner: Record<string, unknown>,
  where: string,
  required: boolean,
): void {
  for (const key of ["methods", "properties"] as const) {
    const list = owner[key];
    if (list === undefined && !required) continue;
    if (!Array.isArray(list)) {
      throw new LibraryManifestError(
        `Invalid library manifest: ${where}.${key} must be an array`,
      );
    }
    list.forEach((m: unknown, j) => {
      const at = `${where}.${key}[${j}]`;
      if (!isRecord(m) || typeof m.name !== "string" || m.name === "") {
        throw new LibraryManifestError(
          `Invalid library manifest: ${at}.name must be a non-empty string`,
        );
      }
      if (
        typeof m.visibility !== "string" ||
        !VISIBILITIES.includes(m.visibility)
      ) {
        throw new LibraryManifestError(
          `Invalid library manifest: ${at}.visibility must be PUBLIC, PRIVATE, PROTECTED or INTERNAL`,
        );
      }
      if (key === "methods") {
        for (const params of ["inputs", "outputs", "inouts"] as const) {
          const vars = m[params];
          if (!Array.isArray(vars)) {
            throw new LibraryManifestError(
              `Invalid library manifest: ${at}.${params} must be an array`,
            );
          }
          vars.forEach((v: unknown, k) => {
            if (!isRecord(v) || typeof v.name !== "string" || v.name === "") {
              throw new LibraryManifestError(
                `Invalid library manifest: ${at}.${params}[${k}].name must be a non-empty string`,
              );
            }
          });
        }
      } else if (typeof m.type !== "object" || m.type === null) {
        throw new LibraryManifestError(
          `Invalid library manifest: ${at}.type must be an object`,
        );
      }
    });
  }
}

/**
 * Load a library manifest from a JSON object.
 * Validates required fields and structure.
 * (In production, this would read from a .stlib.json file on disk.)
 *
 * @throws {LibraryManifestError} if required fields are missing or invalid
 */
export function loadLibraryManifest(json: unknown): LibraryManifest {
  if (json === null || json === undefined || typeof json !== "object") {
    throw new LibraryManifestError(
      "Invalid library manifest: expected a JSON object",
    );
  }

  const obj = json as Record<string, unknown>;

  // Validate required top-level fields
  const name = obj.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new LibraryManifestError(
      "Invalid library manifest: 'name' must be a non-empty string",
    );
  }
  const version = obj.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new LibraryManifestError(
      "Invalid library manifest: 'version' must be a non-empty string",
    );
  }
  const namespace = obj.namespace;
  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new LibraryManifestError(
      "Invalid library manifest: 'namespace' must be a non-empty string",
    );
  }

  // Validate functions array
  const functions: LibraryManifest["functions"] = [];
  if (Array.isArray(obj.functions)) {
    for (let i = 0; i < obj.functions.length; i++) {
      const fn = obj.functions[i] as Record<string, unknown>;
      if (typeof fn.name !== "string" || fn.name.length === 0) {
        throw new LibraryManifestError(
          `Invalid library manifest: functions[${i}].name must be a non-empty string`,
        );
      }
      if (typeof fn.returnType !== "string" || fn.returnType.length === 0) {
        throw new LibraryManifestError(
          `Invalid library manifest: functions[${i}].returnType must be a non-empty string`,
        );
      }
      if (!Array.isArray(fn.parameters)) {
        throw new LibraryManifestError(
          `Invalid library manifest: functions[${i}].parameters must be an array`,
        );
      }
      functions.push(fn as unknown as LibraryManifest["functions"][0]);
    }
  }

  // Validate function blocks array
  const functionBlocks: LibraryManifest["functionBlocks"] = [];
  if (Array.isArray(obj.functionBlocks)) {
    for (let i = 0; i < obj.functionBlocks.length; i++) {
      const fb = obj.functionBlocks[i] as Record<string, unknown>;
      if (typeof fb.name !== "string" || fb.name.length === 0) {
        throw new LibraryManifestError(
          `Invalid library manifest: functionBlocks[${i}].name must be a non-empty string`,
        );
      }
      if (!Array.isArray(fb.inputs)) {
        throw new LibraryManifestError(
          `Invalid library manifest: functionBlocks[${i}].inputs must be an array`,
        );
      }
      if (!Array.isArray(fb.outputs)) {
        throw new LibraryManifestError(
          `Invalid library manifest: functionBlocks[${i}].outputs must be an array`,
        );
      }
      if (!Array.isArray(fb.inouts)) {
        throw new LibraryManifestError(
          `Invalid library manifest: functionBlocks[${i}].inouts must be an array`,
        );
      }
      validateMembers(fb, `functionBlocks[${i}]`, false);
      validateAttributes(fb, `functionBlocks[${i}]`);
      for (const list of ["inputs", "outputs", "inouts", "locals"] as const) {
        const vars = fb[list];
        if (!Array.isArray(vars)) continue;
        vars.forEach((v: unknown, k) =>
          validateAttributes(v, `functionBlocks[${i}].${list}[${k}]`),
        );
      }
      functionBlocks.push(
        fb as unknown as LibraryManifest["functionBlocks"][0],
      );
    }
  }

  // Validate types array
  const types: LibraryManifest["types"] = [];
  if (Array.isArray(obj.types)) {
    for (let i = 0; i < obj.types.length; i++) {
      const t = obj.types[i] as Record<string, unknown>;
      if (typeof t.name !== "string" || t.name.length === 0) {
        throw new LibraryManifestError(
          `Invalid library manifest: types[${i}].name must be a non-empty string`,
        );
      }
      if (
        typeof t.kind !== "string" ||
        !["struct", "enum", "alias"].includes(t.kind)
      ) {
        throw new LibraryManifestError(
          `Invalid library manifest: types[${i}].kind must be "struct", "enum", or "alias"`,
        );
      }
      if (t.fields !== undefined && !Array.isArray(t.fields)) {
        throw new LibraryManifestError(
          `Invalid library manifest: types[${i}].fields must be an array`,
        );
      }
      types.push(t as unknown as LibraryManifest["types"][0]);
    }
  }

  // Exported global variables (optional — archives compiled before globals
  // were exported simply omit the field).
  const globals: NonNullable<LibraryManifest["globals"]> = [];
  if (Array.isArray(obj.globals)) {
    for (let i = 0; i < obj.globals.length; i++) {
      const g = obj.globals[i] as Record<string, unknown>;
      if (typeof g.name !== "string" || g.name.length === 0) {
        throw new LibraryManifestError(
          `Invalid library manifest: globals[${i}].name must be a non-empty string`,
        );
      }
      if (typeof g.type !== "string" || g.type.length === 0) {
        throw new LibraryManifestError(
          `Invalid library manifest: globals[${i}].type must be a non-empty string`,
        );
      }
      globals.push(g as unknown as NonNullable<LibraryManifest["globals"]>[0]);
    }
  }

  const interfaces: LibraryInterfaceEntry[] = [];
  if (Array.isArray(obj.interfaces)) {
    obj.interfaces.forEach((itf: unknown, i) => {
      if (!isRecord(itf) || typeof itf.name !== "string" || itf.name === "") {
        throw new LibraryManifestError(
          `Invalid library manifest: interfaces[${i}].name must be a non-empty string`,
        );
      }
      validateMembers(itf, `interfaces[${i}]`, true);
      interfaces.push(itf as unknown as LibraryInterfaceEntry);
    });
  }

  const result: LibraryManifest = {
    name,
    version,
    namespace,
    functions,
    functionBlocks,
    types,
    headers: Array.isArray(obj.headers) ? (obj.headers as string[]) : [],
    isBuiltin: Boolean(obj.isBuiltin),
  };

  if (Array.isArray(obj.globals)) {
    result.globals = globals;
  }
  if (Array.isArray(obj.interfaces)) {
    result.interfaces = interfaces;
  }
  if (obj.description !== undefined) {
    result.description = String(obj.description);
  }
  if (Array.isArray(obj.sourceFiles)) {
    result.sourceFiles = obj.sourceFiles as string[];
  }

  return result;
}

/**
 * Register a library's symbols into the compiler's symbol tables.
 * This makes library functions, FBs, and types available for semantic analysis.
 */
export function registerLibrarySymbols(
  manifest: LibraryManifest,
  symbolTables: SymbolTables,
): void {
  // Register functions
  for (const fn of manifest.functions) {
    const returnType: ElementaryType = ELEMENTARY_TYPES[
      fn.returnType.toUpperCase()
    ] ?? {
      typeKind: "elementary",
      name: fn.returnType,
      sizeBits: 0,
    };

    try {
      symbolTables.globalScope.define({
        name: fn.name,
        kind: "function",
        declaration: {
          kind: "FunctionDeclaration",
          sourceSpan: createDefaultSourceSpan(),
          name: fn.name,
          returnType: {
            kind: "TypeReference",
            sourceSpan: createDefaultSourceSpan(),
            name: fn.returnType,
            isReference: false,
            referenceKind: "none",
          },
          varBlocks: [],
          body: [],
        },
        returnType,
        parameters: fn.parameters.map((p) => {
          const sym = makeVarSymbol(
            { name: p.name, type: p.type },
            p.direction,
          );
          // Carry the optional-input marker: a parameter with an initial value
          // is optional at the call site (see Option A in the analyzer).
          if (p.initialValue !== undefined) sym.initialValue = p.initialValue;
          return sym;
        }),
      });
    } catch (e) {
      // Skip duplicate symbol errors (first definition wins), re-throw others
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }

  // Register types
  for (const t of manifest.types) {
    // For a struct with exported fields, register a real StructType carrying its
    // member types, so member access on a dependency struct (e.g. `MATH.PI`)
    // resolves to the field's type rather than staying untyped.
    const resolvedType: IECType =
      t.kind === "struct" && t.fields
        ? ({
            typeKind: "struct",
            name: t.name,
            fields: new Map<string, IECType>(
              t.fields.map((f) => [
                f.name,
                ELEMENTARY_TYPES[f.type.toUpperCase()] ??
                  ({
                    typeKind: "elementary",
                    name: f.type,
                    sizeBits: 0,
                  } as ElementaryType),
              ]),
            ),
          } as StructType)
        : (ELEMENTARY_TYPES[t.name.toUpperCase()] ??
          ({
            typeKind: "elementary",
            name: t.name,
            sizeBits: 0,
          } as ElementaryType));

    try {
      symbolTables.globalScope.define({
        name: t.name,
        kind: "type",
        declaration: {
          kind: "TypeDeclaration",
          sourceSpan: createDefaultSourceSpan(),
          name: t.name,
          // A struct with exported fields gets a REAL StructDefinition, not the
          // self-referential alias the other kinds fall back to.
          //
          // Everything that walks a type reads `declaration.definition`: the
          // debug table recurses into a struct's fields through it, and an
          // alias that points at itself is what it treats as "opaque library
          // type, do not descend". That was fine while library structs were
          // only ever type-checked, and wrong the moment a RETAINed library
          // block held one — the struct's fields simply never reached the
          // retain blob, so the instance restored around a hole.
          definition: buildLibraryTypeDefinition(t),
        },
        resolvedType,
      });
    } catch (e) {
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }

  // Register function blocks. Instances expose the interface (inputs/outputs/inouts), which is also what the
  // debugger shows. `locals` serve RETAIN and blocks that EXTEND the library block.
  for (const fb of manifest.functionBlocks) {
    try {
      symbolTables.globalScope.define({
        name: fb.name,
        kind: "functionBlock",
        declaration: makeFunctionBlockDeclaration(fb),
        inputs: fb.inputs.map((i) => makeVarSymbol(i, "input")),
        outputs: fb.outputs.map((o) => makeVarSymbol(o, "output")),
        inouts: fb.inouts.map((io) => makeVarSymbol(io, "inout")),
        // Present from archives that export them; an older archive leaves
        // this empty and a RETAINed instance of its blocks covers the visible
        // surface only, with a warning naming the block.
        locals: (fb.locals ?? []).map((l) => makeVarSymbol(l, "local")),
        libraryName: manifest.name,
        ...(fb.methods !== undefined ? { membersExported: true as const } : {}),
      });
    } catch (e) {
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }

  // Register exported global variables into the shared global scope. Because
  // every imported library registers into the SAME globalScope (and duplicates
  // are skipped, first-wins), a program importing several libraries can see all
  // of their globals together at the same place — globals are additive.
  for (const g of manifest.globals ?? []) {
    const varType: ElementaryType = ELEMENTARY_TYPES[g.type.toUpperCase()] ?? {
      typeKind: "elementary",
      name: g.type,
      sizeBits: 0,
    };
    try {
      symbolTables.globalScope.define({
        name: g.name,
        kind: "variable",
        type: varType,
        declaration: {
          kind: "VarDeclaration",
          sourceSpan: createDefaultSourceSpan(),
          names: [g.name],
          type: {
            kind: "TypeReference",
            sourceSpan: createDefaultSourceSpan(),
            name: g.type,
            isReference: false,
            referenceKind: "none",
          },
        },
        isInput: false,
        isOutput: false,
        isInOut: false,
        isExternal: false,
        isGlobal: true,
        isRetain: false,
      });
    } catch (e) {
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }
}

/**
 * Load a `.stlib` archive from a parsed JSON object.
 * Validates the archive structure including formatVersion, manifest, headerCode,
 * cppCode, and dependencies.
 *
 * @throws {LibraryManifestError} if required fields are missing or invalid
 */
export function loadStlibArchive(json: unknown): StlibArchive {
  if (json === null || json === undefined || typeof json !== "object") {
    throw new LibraryManifestError(
      "Invalid stlib archive: expected a JSON object",
    );
  }

  const obj = json as Record<string, unknown>;

  // Validate formatVersion
  if (obj.formatVersion !== 1) {
    throw new LibraryManifestError(
      "Invalid stlib archive: 'formatVersion' must be 1",
    );
  }

  // Validate manifest
  if (
    obj.manifest === null ||
    obj.manifest === undefined ||
    typeof obj.manifest !== "object"
  ) {
    throw new LibraryManifestError(
      "Invalid stlib archive: 'manifest' must be an object",
    );
  }
  const manifest = loadLibraryManifest(obj.manifest);

  // Validate chunks — every per-symbol slice of the library's emitted
  // C++ output, plus its dep edges. Empty array is valid (synthetic
  // libraries like iec-std-functions ship only symbol-table entries).
  if (!Array.isArray(obj.chunks)) {
    throw new LibraryManifestError(
      "Invalid stlib archive: 'chunks' must be an array",
    );
  }

  // Validate dependencies
  if (!Array.isArray(obj.dependencies)) {
    throw new LibraryManifestError(
      "Invalid stlib archive: 'dependencies' must be an array",
    );
  }

  const archive: StlibArchive = {
    formatVersion: 1,
    manifest,
    chunks: obj.chunks as StlibArchive["chunks"],
    dependencies: obj.dependencies as Array<{ name: string; version: string }>,
  };

  // Optional sources
  if (Array.isArray(obj.sources)) {
    archive.sources = obj.sources as Array<{
      fileName: string;
      source: string;
    }>;
  }

  // Optional globalConstants
  if (
    obj.globalConstants !== null &&
    obj.globalConstants !== undefined &&
    typeof obj.globalConstants === "object" &&
    !Array.isArray(obj.globalConstants)
  ) {
    const gc: Record<string, number> = {};
    for (const [key, val] of Object.entries(
      obj.globalConstants as Record<string, unknown>,
    )) {
      if (typeof val !== "number") {
        throw new LibraryManifestError(
          `Invalid stlib archive: globalConstants["${key}"] must be a number, got ${typeof val}`,
        );
      }
      gc[key] = val;
    }
    archive.globalConstants = gc;
  }

  return archive;
}

/**
 * Parse and validate an stlib archive from its raw JSON text.
 *
 * Browser-safe sibling of `loadStlibFromFile` — takes a string the
 * caller already obtained (HTTP fetch, IPC, FileReader, etc.) instead
 * of touching the filesystem.  Use this in environments without `fs`.
 *
 * @param raw - JSON text of the `.stlib` archive
 * @param sourceLabel - Optional label used in error messages
 * @returns The validated archive
 * @throws {LibraryManifestError} if the JSON is malformed or invalid
 */
export function loadStlibFromString(
  raw: string,
  sourceLabel: string = "<string>",
): StlibArchive {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new LibraryManifestError(
      `Invalid JSON in stlib archive: ${sourceLabel}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return loadStlibArchive(json);
}

/**
 * Parse and validate an stlib archive from raw bytes.
 *
 * Browser-safe sibling of `loadStlibFromFile` — accepts the byte
 * payload of an `.stlib` (UTF-8 encoded JSON).  Suitable for
 * `fetch(...).then(r => r.arrayBuffer())` flows and for Electron
 * preload paths that hand the renderer a `Uint8Array` over IPC.
 *
 * @param bytes - Raw UTF-8 bytes of the `.stlib` archive
 * @param sourceLabel - Optional label used in error messages
 * @returns The validated archive
 * @throws {LibraryManifestError} if the JSON is malformed or invalid
 */
export function loadStlibFromBuffer(
  bytes: Uint8Array,
  sourceLabel: string = "<buffer>",
): StlibArchive {
  // TextDecoder is available in modern Node (≥11) and every browser /
  // worker context we care about.  Avoids pulling in `Buffer` so the
  // browser bundler doesn't have to polyfill it.
  const raw = new TextDecoder("utf-8").decode(bytes);
  return loadStlibFromString(raw, sourceLabel);
}

// File-shaped wrappers (`loadStlibFromFile`, `discoverStlibs`,
// `loadLibraryFromFile`, `discoverLibraries`) live in
// `src/node/library-loader.ts`.  Browser / worker consumers fetch
// bytes themselves and call the pure `loadStlibFromString` /
// `loadStlibFromBuffer` / `loadStlibArchive` / `loadLibraryManifest`
// helpers above.
