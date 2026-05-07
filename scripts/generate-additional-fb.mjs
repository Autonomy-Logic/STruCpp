#!/usr/bin/env node
/**
 * Generate the Additional Function Blocks library `.stlib` archive.
 *
 * Sources cover the IEC 61131-3 Annex E "Additional Function Blocks" set
 * the OpenPLC editor exposes alongside the standard FB library: RTC,
 * INTEGRAL, DERIVATIVE, PID, RAMP, HYSTERESIS. The ST text is carried
 * over from MatIEC's lib/*.txt with minimal adaptation (RTC's MatIEC-
 * specific `{__SET_VAR(__CURRENT_TIME)}` pragma is replaced with a call
 * to the runtime's CURRENT_DT() function).
 *
 * Sources are loaded from libs/sources/additional-function-blocks/*.st
 * — the canonical, version-controlled location. After the first build
 * the .stlib archive embeds its own copy (sources[]) so rebuild-libs.mjs
 * can round-trip the archive without re-reading the .st files.
 *
 * Usage:
 *   npm run build:additional-fb
 *
 * The order PID/INTEGRAL/DERIVATIVE matters: PID instantiates the other
 * two, so they must be visible when PID is type-checked. The script
 * passes them in dependency order explicitly rather than relying on
 * filesystem traversal order.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const { compileStlib } = await import(
  resolve(projectRoot, "dist/library/library-compiler.js")
);

const libsDir   = resolve(projectRoot, "libs");
const sourcesDir = resolve(libsDir, "sources", "additional-function-blocks");
const outPath   = resolve(libsDir, "additional-function-blocks.stlib");

// Dependency-ordered source list. INTEGRAL and DERIVATIVE must precede
// PID so its var declarations of those types resolve. Anything not in
// this allowlist is dropped — keeps stray editor backups out of the
// archive even if they land in the sources dir.
const ORDERED = [
  "integral.st",
  "derivative.st",
  "rtc.st",
  "pid.st",
  "ramp.st",
  "hysteresis.st",
];

if (!existsSync(sourcesDir)) {
  console.error(`Error: source directory not found: ${sourcesDir}`);
  process.exit(1);
}

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
  name: "additional-function-blocks",
  version: "1.0.0",
  namespace: "strucpp",
  noSource: false,
});

if (!result.success) {
  console.error(
    "Failed to compile Additional Function Blocks library:",
    result.errors.map((e) => `\n  - ${e.message}`).join(""),
  );
  process.exit(1);
}

// Mark as built-in so the editor / runtime treat it on par with the
// standard FB library; user-installed third-party libraries leave this
// false.
result.archive.manifest.isBuiltin = true;
result.archive.manifest.description =
  "IEC 61131-3 Annex E Additional Function Blocks (RTC, INTEGRAL, DERIVATIVE, PID, RAMP, HYSTERESIS) — auto-generated from ST sources";

mkdirSync(libsDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(result.archive, null, 2) + "\n", "utf-8");

console.log(
  `Generated ${outPath} (${result.archive.manifest.functionBlocks.length} function blocks, ` +
    `${Math.round(Buffer.byteLength(JSON.stringify(result.archive)) / 1024)}KB)`,
);
