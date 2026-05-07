#!/usr/bin/env node
/**
 * Generate the IEC 61131-3 Standard FB library `.stlib` archive.
 *
 * Sources of truth (all on disk):
 *   - libs/sources/iec-standard-fb/*.st        — the ST source files
 *   - libs/sources/iec-standard-fb/library.json — manifest metadata + per-block docs
 *
 * Produces:
 *   - libs/iec-standard-fb.stlib
 *
 * library.json carries everything that isn't derivable from ST: name,
 * version, namespace, description, isBuiltin, and the per-FB
 * documentation prose surfaced in editor hover dialogs. Block names
 * referenced in library.json must match the FBs the compiler emits —
 * the apply step reports any mismatch and fails the build.
 *
 * Run: npm run build:stdlib
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const { compileStlib } = await import(
  resolve(projectRoot, "dist/library/library-compiler.js")
);
const { loadLibraryConfig, applyLibraryConfigDocumentation } = await import(
  resolve(projectRoot, "dist/library/library-config.js")
);

const sourcesDir = resolve(projectRoot, "libs", "sources", "iec-standard-fb");
const libsDir    = resolve(projectRoot, "libs");
const outPath    = resolve(libsDir, "iec-standard-fb.stlib");

if (!existsSync(sourcesDir)) {
  console.error(`Error: sources directory not found: ${sourcesDir}`);
  process.exit(1);
}

const config = loadLibraryConfig(sourcesDir);
if (!config) {
  console.error(`Error: ${sourcesDir}/library.json not found`);
  process.exit(1);
}

// Order the .st files explicitly so dependencies resolve. The IEC
// standard FBs split across four files; counter.st instantiates
// R_TRIG/F_TRIG from edge_detection.st, so edge_detection must be
// compiled first. Bistable and timer have no inter-file deps.
const ORDERED = ["edge_detection.st", "bistable.st", "counter.st", "timer.st"];
const onDisk = new Set(readdirSync(sourcesDir).filter((f) => f.endsWith(".st")));
const missing = ORDERED.filter((f) => !onDisk.has(f));
if (missing.length > 0) {
  console.error(
    `Error: missing source files in ${sourcesDir}:\n  ${missing.join("\n  ")}`,
  );
  process.exit(1);
}
const sources = ORDERED.map((fileName) => ({
  fileName,
  source: readFileSync(resolve(sourcesDir, fileName), "utf-8"),
}));

const result = compileStlib(sources, {
  name: config.name,
  version: config.version,
  namespace: config.namespace,
  noSource: false,
  builtin: config.isBuiltin === true,
});

if (!result.success) {
  console.error(
    "Failed to compile standard FB library:",
    result.errors.map((e) => `\n  - ${e.message}`).join(""),
  );
  process.exit(1);
}

if (config.description) {
  result.archive.manifest.description = config.description;
}

const docReport = applyLibraryConfigDocumentation(result.archive, config);
if (
  docReport.unknownBlockDocs.length > 0 ||
  docReport.unknownFunctionDocs.length > 0
) {
  // Stale doc entries are a build error: usually means an FB was
  // renamed/removed in ST without updating library.json, or a typo in
  // the JSON. Fail loudly so the mismatch can't sneak into a release.
  console.error("Error: library.json references unknown symbols:");
  for (const name of docReport.unknownBlockDocs) {
    console.error(`  - blocks["${name}"] — no FB by that name in the compiled manifest`);
  }
  for (const name of docReport.unknownFunctionDocs) {
    console.error(`  - functions["${name}"] — no function by that name in the compiled manifest`);
  }
  process.exit(1);
}

mkdirSync(libsDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(result.archive, null, 2) + "\n", "utf-8");

const fbCount    = result.archive.manifest.functionBlocks.length;
const docCount   = docReport.blocksDocumented;
const undoc      = fbCount - docCount;
const sizeKB     = Math.round(Buffer.byteLength(JSON.stringify(result.archive)) / 1024);
const undocSuffix = undoc > 0 ? `, ${undoc} undocumented` : "";
console.log(
  `Generated ${outPath} (${fbCount} function blocks, ` +
    `${docCount} documented${undocSuffix}, ${sizeKB}KB)`,
);
