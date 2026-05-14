// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Per-symbol chunk extraction from codegen output.
 *
 * The codegen emits chunk-boundary markers (`//@chunk:begin/end:<kind>:<NAME>`)
 * around each top-level declaration when `emitChunkMarkers` is enabled. This
 * module slices the emitted header / cpp text into per-symbol chunks and
 * extracts the cross-symbol dep graph from the AST, producing the
 * `LibraryChunk[]` array stored in a `.stlib` archive.
 *
 * The chunked representation is what enables function-level tree-shaking
 * in the consumer codegen: only chunks reachable from the user's AST get
 * emitted into the final `generated.hpp` / `generated.cpp`.
 */

import { walkAST } from "../ast-utils.js";
import type { ASTNode, CompilationUnit } from "../frontend/ast.js";
import type {
  LibraryChunk,
  LibraryChunkDep,
  LibraryManifest,
  StlibArchive,
} from "./library-manifest.js";

type ChunkKind = LibraryChunk["kind"];

interface ChunkSlice {
  kind: ChunkKind;
  name: string;
  text: string;
  /** Position in the input stream — used for stable ordering when
   *  merging header and cpp slices that may not appear in the same
   *  sequence. */
  order: number;
}

const CHUNK_BEGIN_RX = /^\s*\/\/@chunk:begin:([a-zA-Z]+):(.+?)\s*$/;
const CHUNK_END_RX = /^\s*\/\/@chunk:end:([a-zA-Z]+):(.+?)\s*$/;

const KNOWN_KINDS: ReadonlySet<string> = new Set([
  "function",
  "functionBlock",
  "type",
  "inlineGlobal",
]);

function isChunkKind(s: string): s is ChunkKind {
  return KNOWN_KINDS.has(s);
}

/**
 * Slice codegen output into per-symbol chunks.
 *
 * Returns the parsed slices keyed by `<kind>:<NAME>` plus the
 * marker-stripped text. The stripped text equals the input verbatim
 * minus the marker lines, suitable for use as the legacy library-wide
 * `headerCode` / `cppCode` blob (kept on `StlibArchive` through the
 * migration; retired in Phase 4 when chunks become authoritative).
 */
export function extractChunkSlices(
  code: string,
  lineEnding: string,
): { slices: Map<string, ChunkSlice>; stripped: string } {
  const lines = code.split(lineEnding);
  const slices = new Map<string, ChunkSlice>();
  const strippedLines: string[] = [];
  let current: {
    kind: ChunkKind;
    name: string;
    lines: string[];
    order: number;
  } | null = null;
  let orderCounter = 0;

  for (const line of lines) {
    const beginMatch = line.match(CHUNK_BEGIN_RX);
    if (beginMatch) {
      const [, kind, name] = beginMatch;
      if (kind && name && isChunkKind(kind)) {
        current = { kind, name, lines: [], order: orderCounter++ };
      }
      continue;
    }

    const endMatch = line.match(CHUNK_END_RX);
    if (endMatch) {
      if (current) {
        const [, endKind, endName] = endMatch;
        if (endKind === current.kind && endName === current.name) {
          slices.set(`${current.kind}:${current.name}`, {
            kind: current.kind,
            name: current.name,
            text: current.lines.join(lineEnding),
            order: current.order,
          });
        }
        current = null;
      }
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
    strippedLines.push(line);
  }

  return { slices, stripped: strippedLines.join(lineEnding) };
}

/**
 * Build a symbol-name → owning-library map from the archive's own AST
 * plus the manifest of each declared dependency. The map drives dep
 * edge construction: a reference resolves to either the same library
 * (`{library: "this", name}`), a declared dep, or nothing (unresolved
 * symbol — silently dropped from deps; it's either a built-in or a
 * compiler-injected helper neither of which needs tree-shaking).
 */
function buildSymbolOwnership(
  ast: CompilationUnit,
  ownLibraryName: string,
  dependencies: StlibArchive[],
): Map<string, string> {
  const ownership = new Map<string, string>();

  // Own AST: every top-level decl is owned by this library
  for (const t of ast.types)
    ownership.set(t.name.toUpperCase(), ownLibraryName);
  for (const i of ast.interfaces)
    ownership.set(i.name.toUpperCase(), ownLibraryName);
  for (const fb of ast.functionBlocks)
    ownership.set(fb.name.toUpperCase(), ownLibraryName);
  for (const fn of ast.functions)
    ownership.set(fn.name.toUpperCase(), ownLibraryName);
  for (const block of ast.globalVarBlocks) {
    for (const decl of block.declarations) {
      for (const name of decl.names) {
        ownership.set(name.toUpperCase(), ownLibraryName);
      }
    }
  }

  // Programs (rare in libraries but defensive — they're emitted as `Program_<NAME>`)
  for (const p of ast.programs) {
    ownership.set(`PROGRAM_${p.name.toUpperCase()}`, ownLibraryName);
  }

  // Dependencies: every exported symbol from each declared dep
  for (const dep of dependencies) {
    const depName = dep.manifest.name;
    populateManifestSymbols(dep.manifest, depName, ownership);
    // Inline globals declared by a dependency live in its chunks.
    // Phase 4+ will read these from `chunks`; for now we don't see
    // them in the manifest, so cross-library global references stay
    // unresolved (they show up as no dep edge — harmless: the
    // consumer's symbol→chunk index covers the gap from chunk names).
    if (dep.chunks) {
      for (const chunk of dep.chunks) {
        ownership.set(chunk.name.toUpperCase(), depName);
      }
    }
  }

  return ownership;
}

function populateManifestSymbols(
  manifest: LibraryManifest,
  libraryName: string,
  ownership: Map<string, string>,
): void {
  for (const fn of manifest.functions) {
    ownership.set(fn.name.toUpperCase(), libraryName);
  }
  for (const fb of manifest.functionBlocks) {
    ownership.set(fb.name.toUpperCase(), libraryName);
  }
  for (const t of manifest.types) {
    ownership.set(t.name.toUpperCase(), libraryName);
  }
}

/**
 * Walk an AST subtree, collecting every uppercase symbol name it
 * references. Recognises every kind of cross-symbol reference the
 * codegen relies on:
 *
 *   - `FunctionCallExpression.functionName` — call sites
 *   - `VariableExpression.name` — variable & inline-global reads
 *     (`MATH.PI2` shows up as a VariableExpression with name="MATH"
 *     and fieldAccess=["PI2"])
 *   - `TypeReference.name` / `elementTypeName` — type uses, array
 *     element types
 *   - `FunctionBlockDeclaration.extends` / `.implements` — FB
 *     inheritance and interface implementation
 *   - `InterfaceDeclaration.extends` — interface inheritance
 */
function collectReferencedNames(node: ASTNode, out: Set<string>): void {
  walkAST(node, (n) => {
    switch (n.kind) {
      case "FunctionCallExpression":
        out.add(
          (n as unknown as { functionName: string }).functionName.toUpperCase(),
        );
        break;
      case "MethodCallExpression": {
        // method call on an FB / interface: object resolution covers
        // the type via its own VariableExpression child; the method
        // name doesn't need its own dep (methods live with the FB).
        break;
      }
      case "VariableExpression":
        out.add((n as unknown as { name: string }).name.toUpperCase());
        break;
      case "TypeReference": {
        const tr = n as unknown as { name: string; elementTypeName?: string };
        out.add(tr.name.toUpperCase());
        if (tr.elementTypeName) {
          out.add(tr.elementTypeName.toUpperCase());
        }
        break;
      }
      case "FunctionBlockDeclaration": {
        const fbd = n as unknown as { extends?: string; implements?: string[] };
        if (fbd.extends) out.add(fbd.extends.toUpperCase());
        if (fbd.implements) {
          for (const iface of fbd.implements) {
            out.add(iface.toUpperCase());
          }
        }
        break;
      }
      case "InterfaceDeclaration": {
        const id = n as unknown as { extends?: string[] };
        if (id.extends) {
          for (const base of id.extends) {
            out.add(base.toUpperCase());
          }
        }
        break;
      }
    }
  });
}

/**
 * Compute the dep graph edges for a single chunk by walking the AST
 * node that produced it and resolving each referenced name through
 * the symbol-ownership map.
 */
function computeChunkDeps(
  kind: ChunkKind,
  name: string,
  ast: CompilationUnit,
  ownership: Map<string, string>,
): LibraryChunkDep[] {
  const referenced = new Set<string>();

  switch (kind) {
    case "function": {
      const fn = ast.functions.find((f) => f.name === name);
      if (fn) collectReferencedNames(fn as unknown as ASTNode, referenced);
      break;
    }
    case "functionBlock": {
      if (name.startsWith("Program_")) {
        const progName = name.slice("Program_".length);
        const prog = ast.programs.find((p) => p.name === progName);
        if (prog)
          collectReferencedNames(prog as unknown as ASTNode, referenced);
      } else {
        const fb = ast.functionBlocks.find((f) => f.name === name);
        if (fb) collectReferencedNames(fb as unknown as ASTNode, referenced);
      }
      break;
    }
    case "type": {
      const t = ast.types.find((td) => td.name === name);
      if (t) {
        collectReferencedNames(t as unknown as ASTNode, referenced);
      } else {
        const iface = ast.interfaces.find((i) => i.name === name);
        if (iface)
          collectReferencedNames(iface as unknown as ASTNode, referenced);
      }
      break;
    }
    case "inlineGlobal": {
      // Globals don't have a single wrapping AST node — walk the
      // matching declaration's type + initial-value expression.
      for (const block of ast.globalVarBlocks) {
        for (const decl of block.declarations) {
          if (decl.names.includes(name)) {
            collectReferencedNames(decl.type as unknown as ASTNode, referenced);
            if (decl.initialValue) {
              collectReferencedNames(
                decl.initialValue as unknown as ASTNode,
                referenced,
              );
            }
          }
        }
      }
      break;
    }
  }

  // A chunk never depends on itself
  referenced.delete(name.toUpperCase());

  // Map referenced names → (library, name) deps.  Names with no known
  // owner are intentionally dropped: they're either compiler built-ins,
  // helper functions the codegen injects (which always link), or
  // user-defined names that don't exist in any library (an error the
  // semantic phase already caught).
  const deps: LibraryChunkDep[] = [];
  for (const refName of referenced) {
    const owner = ownership.get(refName);
    if (!owner) continue;
    deps.push({ library: owner, name: refName });
  }
  // Stable ordering so two builds of the same library produce
  // byte-identical archives.
  deps.sort((a, b) => {
    if (a.library !== b.library) return a.library < b.library ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return deps;
}

/**
 * Build the full chunk list for a compiled library.
 *
 * Combines header-side and cpp-side chunk slices (an FB produces both;
 * a type produces only a header chunk; an inline global same) and
 * computes dep edges per chunk. The chunk ordering follows the
 * header-slice declaration order, with cpp-only chunks (none today,
 * defensive) tacked on after.
 */
export function buildChunks(
  headerCode: string,
  cppCode: string,
  lineEnding: string,
  ast: CompilationUnit,
  ownLibraryName: string,
  dependencies: StlibArchive[],
): { chunks: LibraryChunk[]; cleanHeader: string; cleanCpp: string } {
  const headerExtraction = extractChunkSlices(headerCode, lineEnding);
  const cppExtraction = extractChunkSlices(cppCode, lineEnding);

  const ownership = buildSymbolOwnership(ast, ownLibraryName, dependencies);

  // Canonical chunk order: header order first, then any cpp-only
  // chunks (the legacy emit has none, but the rule is defined).
  const seenKeys = new Set<string>();
  const orderedKeys: string[] = [];

  const headerByOrder = [...headerExtraction.slices.values()].sort(
    (a, b) => a.order - b.order,
  );
  for (const slice of headerByOrder) {
    const key = `${slice.kind}:${slice.name}`;
    orderedKeys.push(key);
    seenKeys.add(key);
  }

  const cppByOrder = [...cppExtraction.slices.values()].sort(
    (a, b) => a.order - b.order,
  );
  for (const slice of cppByOrder) {
    const key = `${slice.kind}:${slice.name}`;
    if (!seenKeys.has(key)) {
      orderedKeys.push(key);
      seenKeys.add(key);
    }
  }

  const chunks: LibraryChunk[] = [];
  for (const key of orderedKeys) {
    const headerSlice = headerExtraction.slices.get(key);
    const cppSlice = cppExtraction.slices.get(key);
    const slice = headerSlice ?? cppSlice!;
    chunks.push({
      name: slice.name,
      kind: slice.kind,
      header: headerSlice?.text ?? "",
      cpp: cppSlice?.text ?? "",
      deps: computeChunkDeps(slice.kind, slice.name, ast, ownership),
    });
  }

  return {
    chunks,
    cleanHeader: headerExtraction.stripped,
    cleanCpp: cppExtraction.stripped,
  };
}

// Re-export for type-only consumers that pull through this module.
export type { ChunkKind };
