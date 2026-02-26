#!/usr/bin/env node
/**
 * Generate the standard FB library `.stlib` archive from ST source files.
 *
 * This script compiles the IEC standard FB .st files using the STruC++
 * library compiler and writes the resulting `.stlib` archive (manifest +
 * compiled C++ code). This ensures the archive always matches the actual
 * ST source signatures and eliminates runtime recompilation.
 *
 * Run: node scripts/generate-stdlib.mjs
 * Called automatically by: npm run build
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// Import the compiled library compiler and utilities from dist/
const { compileLibrary } = await import(
  resolve(projectRoot, "dist/library/library-compiler.js")
);
const { extractNamespaceBody } = await import(
  resolve(projectRoot, "dist/library/library-utils.js")
);

const stDir = resolve(projectRoot, "src/stdlib/iec-standard-fb");

const sourceFiles = [
  "edge_detection.st",
  "bistable.st",
  "counter.st",
  "timer.st",
];

const sources = sourceFiles.map((file) => ({
  source: readFileSync(resolve(stDir, file), "utf-8"),
  fileName: file,
}));

const result = compileLibrary(sources, {
  name: "iec-standard-fb",
  version: "1.0.0",
  namespace: "strucpp",
});

if (!result.success) {
  console.error(
    "Failed to compile standard FB library:",
    result.errors.map((e) => e.message).join(", "),
  );
  process.exit(1);
}

// Build the StlibArchive JSON
const archive = {
  formatVersion: 1,
  manifest: {
    name: result.manifest.name,
    version: result.manifest.version,
    description: "IEC 61131-3 Standard Function Blocks (auto-generated from ST sources)",
    namespace: result.manifest.namespace,
    functions: result.manifest.functions,
    functionBlocks: result.manifest.functionBlocks,
    types: result.manifest.types,
    headers: [],
    isBuiltin: true,
  },
  headerCode: extractNamespaceBody(result.headerCode),
  cppCode: extractNamespaceBody(result.cppCode),
  sources: sources.map((s) => ({ fileName: s.fileName, source: s.source })),
  dependencies: [],
};

// Write to src/stdlib/ so it's accessible both from src/ imports (tests)
// and from dist/ after tsc copies it.
const outDir = resolve(projectRoot, "src/stdlib/iec-standard-fb");
mkdirSync(outDir, { recursive: true });

const outPath = resolve(outDir, "iec-standard-fb.stlib");
writeFileSync(outPath, JSON.stringify(archive, null, 2) + "\n", "utf-8");

console.log(
  `Generated ${outPath} (${archive.manifest.functionBlocks.length} function blocks, ` +
  `${Math.round(Buffer.byteLength(JSON.stringify(archive)) / 1024)}KB)`,
);
