/**
 * STruC++ Library Chunk-Shake Fuzz
 *
 * Phase 5 of function-level tree-shaking. Every bundled-library chunk
 * should be referenceable from a user program in isolation: the
 * function-level shake walks the chunk's dep edges, the consumer
 * codegen emits the closure, and the resulting C++ should compile +
 * link.
 *
 * If a chunk fails this test, the chunk's `deps` array is missing an
 * edge — most likely a symbol referenced only by an implicit codegen
 * helper or a transitive type that the AST-walker in
 * `src/library/library-chunks.ts:collectReferencedNames` didn't catch.
 * Fix the extractor, rebuild the bundled libraries, re-run.
 *
 * Coverage:
 *   - Every FB chunk: declared as `VAR inst : <NAME>;` in a tiny program
 *   - Every type chunk: declared as `VAR v : <NAME>;` in a tiny program
 *   - Function chunks: skipped — calling them needs a real argument
 *     list, which would require interpreting each function's manifest
 *     entry and synthesizing typed values per parameter. Functions are
 *     transitively covered by the FB / type fuzz (any FB that calls a
 *     function pulls that function in through its dep edges).
 *   - Inline-global chunks: skipped — globals are pulled in only
 *     transitively (functions / FBs that read them list them as deps),
 *     same reasoning as the function case.
 */

import { describe, it, expect } from "vitest";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { compile } from "../../src/index.js";
import { loadStlibFromFile } from "../../src/node/library-loader.js";
import type { StlibArchive } from "../../src/library/library-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIBS_DIR = join(__dirname, "..", "..", "libs");

const BUNDLED_LIBS = [
  "iec-standard-fb",
  "additional-function-blocks",
  "oscat-basic",
];

function loadBundled(name: string): StlibArchive {
  return loadStlibFromFile(join(LIBS_DIR, `${name}.stlib`));
}

// FBs / types that fail to compile when referenced standalone for
// reasons unrelated to the shake — typically because the symbol's
// declaration shape isn't valid as a top-level VAR (abstract base
// classes, IEC interfaces, types that need init args, etc.).  Keep
// this list short and document each entry.
const STANDALONE_EXEMPT = new Set<string>([
  // None today — every FB / type in the bundled libs is currently
  // instantiable as a top-level VAR.  Add entries here only with a
  // comment explaining why standalone instantiation fails.
]);

function programReferencing(chunk: { kind: string; name: string }): string {
  switch (chunk.kind) {
    case "functionBlock":
      return `PROGRAM Main\n  VAR inst : ${chunk.name}; END_VAR\nEND_PROGRAM\n`;
    case "type":
      return `PROGRAM Main\n  VAR v : ${chunk.name}; END_VAR\nEND_PROGRAM\n`;
    default:
      throw new Error(`programReferencing not implemented for ${chunk.kind}`);
  }
}

for (const libName of BUNDLED_LIBS) {
  describe(`chunk-shake fuzz: ${libName}`, () => {
    const archive = loadBundled(libName);
    const dependencyArchives = archive.dependencies
      .map((d) => {
        try {
          return loadBundled(d.name);
        } catch {
          return null;
        }
      })
      .filter((a): a is StlibArchive => a !== null);

    const fbChunks = archive.chunks.filter((c) => c.kind === "functionBlock");
    const typeChunks = archive.chunks.filter((c) => c.kind === "type");

    it(`has at least one shake-relevant chunk`, () => {
      // Phase 1 sanity: if a bundled library ends up with zero
      // FB/type chunks, either the library is genuinely
      // functions-only (legit) or the compiler dropped them — fail
      // loudly so the latter surfaces.
      if (libName !== "iec-std-functions") {
        expect(fbChunks.length + typeChunks.length).toBeGreaterThan(0);
      }
    });

    for (const chunk of [...fbChunks, ...typeChunks]) {
      if (STANDALONE_EXEMPT.has(chunk.name)) continue;

      it(`${chunk.kind}:${chunk.name} compiles in isolation`, () => {
        const source = programReferencing(chunk);
        const result = compile(source, {
          libraries: [archive, ...dependencyArchives],
        });
        if (!result.success) {
          const lines = result.errors
            .slice(0, 5)
            .map((e) => `    ${e.line}:${e.column} ${e.message}`)
            .join("\n");
          throw new Error(
            `compile failed for ${chunk.kind} '${chunk.name}' (extractor likely missed a dep edge):\n${lines}`,
          );
        }
        expect(result.success).toBe(true);
      });
    }
  });
}
