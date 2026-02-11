/**
 * STruC++ Library Loader
 *
 * Loads library manifests and registers their symbols into the symbol tables
 * for cross-library function resolution.
 */

import type { LibraryManifest } from "./library-manifest.js";
import type { SymbolTables, VariableSymbol } from "../semantic/symbol-table.js";
import type { ElementaryType, VarDeclaration } from "../frontend/ast.js";
import { createDefaultSourceSpan } from "../frontend/ast.js";

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
 * (In production, this would read from a .stlib.json file on disk.)
 */
export function loadLibraryManifest(json: unknown): LibraryManifest {
  const obj = json as Record<string, unknown>;

  const result: LibraryManifest = {
    name: String(obj.name ?? ""),
    version: String(obj.version ?? ""),
    namespace: String(obj.namespace ?? ""),
    functions: Array.isArray(obj.functions)
      ? (obj.functions as LibraryManifest["functions"])
      : [],
    functionBlocks: Array.isArray(obj.functionBlocks)
      ? (obj.functionBlocks as LibraryManifest["functionBlocks"])
      : [],
    types: Array.isArray(obj.types)
      ? (obj.types as LibraryManifest["types"])
      : [],
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
    } catch {
      // Symbol already exists - skip (first definition wins)
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
    } catch {
      // Symbol already exists - skip
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
          varBlocks: [],
          body: [],
        },
        inputs: fb.inputs.map((i) => makeVarSymbol(i.name, i.type, "input")),
        outputs: fb.outputs.map((o) => makeVarSymbol(o.name, o.type, "output")),
        inouts: fb.inouts.map((io) => makeVarSymbol(io.name, io.type, "inout")),
        locals: [],
      });
    } catch {
      // Symbol already exists - skip
    }
  }
}
