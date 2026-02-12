/**
 * STruC++ Library Loader
 *
 * Loads library manifests and registers their symbols into the symbol tables
 * for cross-library function resolution.
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import type { LibraryManifest } from "./library-manifest.js";
import type { SymbolTables, VariableSymbol } from "../semantic/symbol-table.js";
import { DuplicateSymbolError } from "../semantic/symbol-table.js";
import type { ElementaryType, VarDeclaration } from "../frontend/ast.js";
import { createDefaultSourceSpan } from "../frontend/ast.js";

/**
 * Error thrown when a library manifest fails validation.
 */
export class LibraryManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryManifestError";
  }
}

/** Dummy VarDeclaration for library-registered symbols. */
function dummyDecl(): VarDeclaration {
  return {
    kind: "VarDeclaration",
    sourceSpan: createDefaultSourceSpan(),
    names: [],
    type: {
      kind: "TypeReference",
      sourceSpan: createDefaultSourceSpan(),
      name: "INT",
      isReference: false,
      referenceKind: "none",
    },
  };
}

/** Create a VariableSymbol from a library parameter entry. */
function makeVarSymbol(
  name: string,
  typeName: string,
  direction: "input" | "output" | "inout",
): VariableSymbol {
  const varType: ElementaryType = {
    typeKind: "elementary",
    name: typeName,
    sizeBits: 0,
  };
  return {
    name,
    kind: "variable",
    type: varType,
    declaration: dummyDecl(),
    isInput: direction === "input",
    isOutput: direction === "output",
    isInOut: direction === "inout",
    isExternal: false,
    isGlobal: false,
    isRetain: false,
  };
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
      types.push(t as unknown as LibraryManifest["types"][0]);
    }
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

  if (obj.description !== undefined) {
    result.description = String(obj.description);
  }
  if (Array.isArray(obj.sourceFiles)) {
    result.sourceFiles = obj.sourceFiles as string[];
  }

  return result;
}

/**
 * Load a library manifest from a `.stlib.json` file on disk.
 *
 * @param manifestPath - Path to the `.stlib.json` file
 * @returns The validated library manifest
 * @throws {LibraryManifestError} if the file cannot be read or is invalid
 */
export function loadLibraryFromFile(manifestPath: string): LibraryManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch (e) {
    throw new LibraryManifestError(
      `Cannot read library manifest: ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new LibraryManifestError(
      `Invalid JSON in library manifest: ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return loadLibraryManifest(json);
}

/**
 * Discover and load all library manifests (`*.stlib.json`) in a directory.
 *
 * @param dirPath - Directory to scan for `.stlib.json` files
 * @returns Array of loaded library manifests
 * @throws {LibraryManifestError} if any manifest fails validation
 */
export function discoverLibraries(dirPath: string): LibraryManifest[] {
  const resolvedDir = resolve(dirPath);
  let entries: string[];
  try {
    entries = readdirSync(resolvedDir);
  } catch (e) {
    throw new LibraryManifestError(
      `Cannot read library directory: ${resolvedDir}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const manifests: LibraryManifest[] = [];
  for (const entry of entries) {
    if (entry.endsWith(".stlib.json")) {
      manifests.push(loadLibraryFromFile(join(resolvedDir, entry)));
    }
  }
  return manifests;
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
    const returnType: ElementaryType = {
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
        parameters: fn.parameters.map((p) =>
          makeVarSymbol(p.name, p.type, p.direction),
        ),
      });
    } catch (e) {
      // Skip duplicate symbol errors (first definition wins), re-throw others
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }

  // Register types
  for (const t of manifest.types) {
    const resolvedType: ElementaryType = {
      typeKind: "elementary",
      name: t.name,
      sizeBits: 0,
    };

    try {
      symbolTables.globalScope.define({
        name: t.name,
        kind: "type",
        declaration: {
          kind: "TypeDeclaration",
          sourceSpan: createDefaultSourceSpan(),
          name: t.name,
          definition: {
            kind: "TypeReference",
            sourceSpan: createDefaultSourceSpan(),
            name: t.baseType ?? t.name,
            isReference: false,
            referenceKind: "none",
          },
        },
        resolvedType,
      });
    } catch (e) {
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }

  // Register function blocks
  for (const fb of manifest.functionBlocks) {
    try {
      symbolTables.globalScope.define({
        name: fb.name,
        kind: "functionBlock",
        declaration: {
          kind: "FunctionBlockDeclaration",
          sourceSpan: createDefaultSourceSpan(),
          name: fb.name,
          isAbstract: false,
          isFinal: false,
          varBlocks: [],
          methods: [],
          properties: [],
          body: [],
        },
        inputs: fb.inputs.map((i) => makeVarSymbol(i.name, i.type, "input")),
        outputs: fb.outputs.map((o) => makeVarSymbol(o.name, o.type, "output")),
        inouts: fb.inouts.map((io) => makeVarSymbol(io.name, io.type, "inout")),
        locals: [],
      });
    } catch (e) {
      if (!(e instanceof DuplicateSymbolError)) throw e;
    }
  }
}
