#!/usr/bin/env node
/**
 * Generate the standard FB library `.stlib` archive from ST source files.
 *
 * Uses the STruC++ `compileStlib()` API to produce the archive. Sources are
 * read from the existing `.stlib` archive (its embedded `sources` field), so
 * this script works even after the standalone `.st` files have been removed.
 *
 * If the archive does not yet exist (bootstrap), pass .st file paths as args:
 *   node scripts/generate-stdlib.mjs edge_detection.st bistable.st counter.st timer.st
 *
 * Run: node scripts/generate-stdlib.mjs
 * Called by: npm run build:stdlib
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

// Import the compiled library compiler from dist/
const { compileStlib } = await import(
  resolve(projectRoot, "dist/library/library-compiler.js")
);

const libsDir = resolve(projectRoot, "libs");
const outPath = resolve(libsDir, "iec-standard-fb.stlib");

// Determine sources: from existing archive, or from CLI args / default files
let sources;
const cliFiles = process.argv.slice(2);

if (cliFiles.length > 0) {
  // Bootstrap mode: read .st files from provided paths
  sources = cliFiles.map((file) => {
    const filePath = resolve(file);
    return {
      source: readFileSync(filePath, "utf-8"),
      fileName: basename(filePath),
    };
  });
} else if (existsSync(outPath)) {
  // Normal mode: read sources from the existing archive
  const existingArchive = JSON.parse(readFileSync(outPath, "utf-8"));
  if (!existingArchive.sources || existingArchive.sources.length === 0) {
    console.error(
      "Error: Existing .stlib archive has no embedded sources. " +
      "Provide .st files as arguments to bootstrap."
    );
    process.exit(1);
  }
  sources = existingArchive.sources;
} else {
  console.error(
    "Error: No existing .stlib archive found and no .st files provided.\n" +
    "Usage: node scripts/generate-stdlib.mjs [edge_detection.st bistable.st counter.st timer.st]"
  );
  process.exit(1);
}

const result = compileStlib(sources, {
  name: "iec-standard-fb",
  version: "1.0.0",
  namespace: "strucpp",
  noSource: false,
});

if (!result.success) {
  console.error(
    "Failed to compile standard FB library:",
    result.errors.map((e) => e.message).join(", "),
  );
  process.exit(1);
}

// Override manifest flags for the stdlib
result.archive.manifest.isBuiltin = true;
result.archive.manifest.description =
  "IEC 61131-3 Standard Function Blocks (auto-generated from ST sources)";

mkdirSync(libsDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(result.archive, null, 2) + "\n", "utf-8");

console.log(
  `Generated ${outPath} (${result.archive.manifest.functionBlocks.length} function blocks, ` +
  `${Math.round(Buffer.byteLength(JSON.stringify(result.archive)) / 1024)}KB)`,
);
