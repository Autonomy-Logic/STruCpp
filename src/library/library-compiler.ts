/**
 * STruC++ Library Compiler
 *
 * Compiles ST source files into a library: manifest + C++ output.
 * Libraries expose their functions, FBs, and types for use by other compilations.
 */

import type { LibraryCompileResult } from "./library-manifest.js";
import { compile } from "../index.js";

/**
 * Compile ST source files into a library.
 *
 * @param sources - Array of ST source files
 * @param options - Library metadata
 * @returns The compiled library with manifest and C++ code
 */
export function compileLibrary(
  sources: Array<{ source: string; fileName: string }>,
  options: { name: string; version: string; namespace: string },
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

  const result = compile(primarySource.source, {
    additionalSources,
    // Disable auto-loading of standard FB library when compiling a library,
    // since the library itself may be defining those same FBs.
    noStdFBLibrary: true,
  });

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
