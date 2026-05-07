#!/usr/bin/env node
/**
 * Generate the Additional Function Blocks library `.stlib` archive.
 *
 * Sources of truth (all on disk):
 *   - libs/sources/additional-function-blocks/*.st        — ST sources
 *   - libs/sources/additional-function-blocks/library.json — manifest
 *                                                            metadata
 *                                                            + per-block
 *                                                            docs
 *
 * Produces:
 *   - libs/additional-function-blocks.stlib
 *
 * Block source order matters for type-resolution: PID's locals are typed
 * INTEGRAL/DERIVATIVE, so those FBs must be visible when PID is type-
 * checked. The script enforces a deterministic order rather than relying
 * on filesystem traversal.
 *
 * Run: npm run build:additional-fb
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

const sourcesDir = resolve(projectRoot, "libs", "sources", "additional-function-blocks");
const libsDir    = resolve(projectRoot, "libs");
const outPath    = resolve(libsDir, "additional-function-blocks.stlib");

if (!existsSync(sourcesDir)) {
  console.error(`Error: sources directory not found: ${sourcesDir}`);
  process.exit(1);
}

const config = loadLibraryConfig(sourcesDir);
if (!config) {
  console.error(`Error: ${sourcesDir}/library.json not found`);
  process.exit(1);
}

const ORDERED = [
  "integral.st",
  "derivative.st",
  "rtc.st",
  "pid.st",
  "ramp.st",
  "hysteresis.st",
];
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
    "Failed to compile Additional Function Blocks library:",
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

const fbCount  = result.archive.manifest.functionBlocks.length;
const docCount = docReport.blocksDocumented;
const undoc    = fbCount - docCount;
const sizeKB   = Math.round(Buffer.byteLength(JSON.stringify(result.archive)) / 1024);
const undocSuffix = undoc > 0 ? `, ${undoc} undocumented` : "";
console.log(
  `Generated ${outPath} (${fbCount} function blocks, ` +
    `${docCount} documented${undocSuffix}, ${sizeKB}KB)`,
);
