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
import { extractNamespaceBody } from "./library-utils.js";

/**
 * Compile ST source files into a library.
 *
 * @param sources - Array of ST source files
 * @param options - Library metadata
 * @returns The compiled library with manifest and C++ code
 */
export function compileLibrary(
  sources: Array<{ source: string; fileName: string }>,
  options: {
    name: string;
    version: string;
    namespace: string;
    /** Library archives this library depends on */
    dependencies?: StlibArchive[];
  },
): LibraryCompileResult {
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
      functions: ast.functions.map((fn) => ({
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
      })),
      functionBlocks: ast.functionBlocks.map((fb) => ({
        name: fb.name,
        inputs: fb.varBlocks
          .filter((b) => b.blockType === "VAR_INPUT")
          .flatMap((b) =>
            b.declarations.flatMap((d) =>
              d.names.map((n) => ({ name: n, type: d.type.name })),
            ),
          ),
        outputs: fb.varBlocks
          .filter((b) => b.blockType === "VAR_OUTPUT")
          .flatMap((b) =>
            b.declarations.flatMap((d) =>
              d.names.map((n) => ({ name: n, type: d.type.name })),
            ),
          ),
        inouts: fb.varBlocks
          .filter((b) => b.blockType === "VAR_IN_OUT")
          .flatMap((b) =>
            b.declarations.flatMap((d) =>
              d.names.map((n) => ({ name: n, type: d.type.name })),
            ),
          ),
      })),
      types: ast.types.map((t) => ({
        name: t.name,
        kind:
          t.definition.kind === "StructDefinition"
            ? "struct"
            : t.definition.kind === "EnumDefinition"
              ? "enum"
              : "alias",
      })),
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
  sources: Array<{ source: string; fileName: string }>,
  options: {
    name: string;
    version: string;
    namespace: string;
    noSource?: boolean;
    /** Library archives this library depends on */
    dependencies?: StlibArchive[];
  },
): StlibCompileResult {
  const libResult = compileLibrary(sources, options);

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

  const headerBody = extractNamespaceBody(libResult.headerCode);
  const cppBody = extractNamespaceBody(libResult.cppCode);

  // Clear manifest.headers — the .stlib archive inlines its C++ code
  // directly into the consumer's output via addLibraryPreamble(), so
  // there are no external .hpp files to #include.
  const manifest = { ...libResult.manifest, headers: [] as string[] };

  const archive: StlibCompileResult["archive"] = {
    formatVersion: 1,
    manifest,
    headerCode: headerBody,
    cppCode: cppBody,
    dependencies: [],
  };
  if (!options.noSource) {
    archive.sources = sources.map((s) => ({
      fileName: s.fileName,
      source: s.source,
    }));
  }

  return {
    success: true,
    archive,
    errors: [],
  };
}
