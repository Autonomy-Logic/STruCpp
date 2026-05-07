// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
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
import type { LibraryVarType } from "./library-manifest.js";
import {
  extractNamespaceBody,
  stripDependencyPreambles,
} from "./library-utils.js";
import type { TypeReference } from "../frontend/ast.js";

/**
 * Serialize a variable's type reference into the manifest format,
 * preserving array dimensions and reference qualifiers.
 */
function serializeVarType(
  name: string,
  typeRef: TypeReference,
): LibraryVarType {
  const entry: LibraryVarType = { name, type: typeRef.name };
  if (typeRef.arrayDimensions && typeRef.arrayDimensions.length > 0) {
    entry.arrayDimensions = typeRef.arrayDimensions;
  }
  if (typeRef.elementTypeName) {
    entry.elementTypeName = typeRef.elementTypeName;
  }
  if (typeRef.referenceKind && typeRef.referenceKind !== "none") {
    entry.referenceKind = typeRef.referenceKind;
  }
  return entry;
}

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
  const map = new Map<string, string>();
  const declRe = /^[ \t]*(FUNCTION_BLOCK|FUNCTION|PROGRAM|TYPE)[ \t]+(\w+)/gm;
  for (const src of sources) {
    if (!src.category) continue;
    let m: RegExpExecArray | null;
    declRe.lastIndex = 0;
    while ((m = declRe.exec(src.source)) !== null) {
      const name = m[2]!;
      if (!map.has(name)) map.set(name, src.category);
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
 * Compile ST source files into a library.
 *
 * @param sources - Array of ST source files
 * @param options - Library metadata
 * @returns The compiled library with manifest and C++ code
 */
export function compileLibrary(
  sources: Array<{ source: string; fileName: string; category?: string }>,
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
  if (sources.length === 0) {
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
      },
      headerCode: "",
      cppCode: "",
      errors: [{ message: "No source files provided" }],
    };
  }

  // Compile all sources together
  const primarySource = sources[0]!;
  const additionalSources = sources.slice(1);

  const compileOpts: Partial<import("../types.js").CompileOptions> = {
    additionalSources,
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
  const headerFileName = `${options.name}.hpp`;

  return {
    success: true,
    manifest: {
      name: options.name,
      version: options.version,
      namespace: options.namespace,
      functions: ast.functions.map((fn) =>
        tagCategory(
          {
            name: fn.name,
            returnType: fn.returnType.name,
            parameters: fn.varBlocks.flatMap((block) =>
              block.declarations.flatMap((decl) =>
                decl.names.map((name) => ({
                  name,
                  type: decl.type.name,
                  direction:
                    block.blockType === "VAR_OUTPUT"
                      ? "output"
                      : block.blockType === "VAR_IN_OUT"
                        ? "inout"
                        : "input",
                })),
              ),
            ),
          },
          catByName,
        ),
      ),
      functionBlocks: ast.functionBlocks.map((fb) =>
        tagCategory(
          {
            name: fb.name,
            inputs: fb.varBlocks
              .filter((b) => b.blockType === "VAR_INPUT")
              .flatMap((b) =>
                b.declarations.flatMap((d) =>
                  d.names.map((n) => serializeVarType(n, d.type)),
                ),
              ),
            outputs: fb.varBlocks
              .filter((b) => b.blockType === "VAR_OUTPUT")
              .flatMap((b) =>
                b.declarations.flatMap((d) =>
                  d.names.map((n) => serializeVarType(n, d.type)),
                ),
              ),
            inouts: fb.varBlocks
              .filter((b) => b.blockType === "VAR_IN_OUT")
              .flatMap((b) =>
                b.declarations.flatMap((d) =>
                  d.names.map((n) => serializeVarType(n, d.type)),
                ),
              ),
          },
          catByName,
        ),
      ),
      types: ast.types.map((t) => {
        const kind: "struct" | "enum" | "alias" =
          t.definition.kind === "StructDefinition"
            ? "struct"
            : t.definition.kind === "EnumDefinition"
              ? "enum"
              : "alias";
        return tagCategory({ name: t.name, kind }, catByName);
      }),
      headers: [headerFileName],
      isBuiltin: false,
      sourceFiles: sources.map((s) => s.fileName),
    },
    headerCode: result.headerCode,
    cppCode: result.cppCode,
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
  sources: Array<{ source: string; fileName: string; category?: string }>,
  options: {
    name: string;
    version: string;
    namespace: string;
    noSource?: boolean;
    /** Mark this library as a built-in runtime library */
    builtin?: boolean;
    /** Library archives this library depends on */
    dependencies?: StlibArchive[];
    /** Global constants available during compilation (e.g., STRING_LENGTH) */
    globalConstants?: Record<string, number>;
  },
): StlibCompileResult {
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
        headerCode: "",
        cppCode: "",
        dependencies: [],
      },
      errors: libResult.errors,
    };
  }

  let headerBody = extractNamespaceBody(libResult.headerCode);
  let cppBody = extractNamespaceBody(libResult.cppCode);

  // Strip dependency preamble code from the archive — consumers load
  // dependencies separately, so baking them in would cause redefinitions.
  if (options.dependencies && options.dependencies.length > 0) {
    const depNames = new Set(options.dependencies.map((d) => d.manifest.name));
    const headerPreambles = new Map<string, Set<string>>();
    const cppPreambles = new Map<string, Set<string>>();
    for (const dep of options.dependencies) {
      headerPreambles.set(
        dep.manifest.name,
        new Set(dep.headerCode.split("\n")),
      );
      cppPreambles.set(dep.manifest.name, new Set(dep.cppCode.split("\n")));
    }
    headerBody = stripDependencyPreambles(
      headerBody,
      depNames,
      headerPreambles,
    );
    cppBody = stripDependencyPreambles(cppBody, depNames, cppPreambles);
  }

  // Clear manifest.headers — the .stlib archive inlines its C++ code
  // directly into the consumer's output via addLibraryPreamble(), so
  // there are no external .hpp files to #include.
  const manifest = { ...libResult.manifest, headers: [] as string[] };

  const archive: StlibCompileResult["archive"] = {
    formatVersion: 1,
    manifest,
    headerCode: headerBody,
    cppCode: cppBody,
    dependencies: (options.dependencies ?? []).map((d) => ({
      name: d.manifest.name,
      version: d.manifest.version,
    })),
  };
  if (!options.noSource) {
    archive.sources = sources.map((s) => {
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
