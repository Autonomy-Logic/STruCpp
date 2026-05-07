#!/usr/bin/env node
/**
 * Rebuild all bundled .stlib library archives.
 *
 * The hand-authored libs (iec-standard-fb, additional-function-blocks)
 * are rebuilt FROM DISK — `libs/sources/<lib-name>/` holds the
 * canonical source of truth (.st files + library.json with metadata,
 * description, global constants, and per-block documentation). The
 * matching .stlib in `libs/` is a pure build artefact produced here
 * and gitignored.
 *
 * OSCAT keeps the legacy round-trip path: it reads its embedded
 * sources from the existing libs/oscat-basic.stlib and recompiles.
 * The .stlib stays tracked because the codesys-importer can't yet
 * reproduce the archive cleanly (a regression drops the closing `*)`
 * of trailing block comments on a majority of POUs). Once that's
 * fixed, OSCAT can move under libs/sources/oscat-basic/ next to a
 * library.json and this round-trip path goes away.
 *
 * Used as:
 *   - the canonical "build strucpp" entry point (`npm run build`)
 *   - vitest's globalSetup, so tests always see freshly-built archives
 *
 * Refreshes `dist/` via tsc before importing from it: a `src/` change
 * without a manual `npm run build:tsc-only` would otherwise regenerate
 * libs against stale codegen. tsc on this codebase runs in ~1s so the
 * cost is negligible.
 */

import { execSync } from "child_process";
import { readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const libsDir = resolve(projectRoot, "libs");
const sourcesRoot = resolve(libsDir, "sources");
const vscodeLibsDir = resolve(projectRoot, "vscode-extension", "bundled-libs");

let compileStlib;
let loadStlibFromFile;
let loadLibraryConfig;
let applyLibraryConfigDocumentation;

/**
 * Refresh `dist/` from `src/` and import the freshly compiled modules.
 *
 * Plain `tsc` (no --incremental) on purpose: incremental's `.tsbuildinfo`
 * tracks what was emitted in the previous run, so if `dist/` has been
 * wiped or hand-edited but `.tsbuildinfo` survived, incremental would
 * skip emission and leave us with no `dist/` at all. Full builds are
 * ~1s here, well within the test-suite budget.
 */
async function refreshAndLoadCompiler() {
  console.log("[rebuild-libs] Refreshing dist/ via tsc...");
  try {
    execSync("npx tsc", {
      cwd: projectRoot,
      stdio: "inherit",
    });
  } catch {
    throw new Error(
      "[rebuild-libs] TypeScript compilation failed — see errors above. " +
        "Aborting library rebuild so the on-disk .stlib archives stay " +
        "consistent with the last good dist/.",
    );
  }

  const compiler = await import(
    resolve(projectRoot, "dist/library/library-compiler.js")
  );
  const loader = await import(
    resolve(projectRoot, "dist/library/library-loader.js")
  );
  const config = await import(
    resolve(projectRoot, "dist/library/library-config.js")
  );
  compileStlib = compiler.compileStlib;
  loadStlibFromFile = loader.loadStlibFromFile;
  loadLibraryConfig = config.loadLibraryConfig;
  applyLibraryConfigDocumentation = config.applyLibraryConfigDocumentation;
}

/**
 * Compile + archive a library from a list of in-memory ST sources.
 *
 * Shared core for both the disk-backed (.st files) and codesys-imported
 * (.library file) build paths — the only thing that differs upstream is
 * how the `sources` array gets produced.
 */
function compileAndWrite({ sources, config, stlibPath, dependencies, sourcesDir }) {
  const result = compileStlib(sources, {
    name: config.name,
    version: config.version,
    namespace: config.namespace,
    noSource: false,
    builtin: config.isBuiltin === true,
    dependencies,
    globalConstants: config.globalConstants,
  });

  if (!result.success) {
    const errs = result.errors.map((e) => `  ${e.file ?? ""}:${e.line ?? 0}: ${e.message}`);
    throw new Error(
      `Failed to rebuild ${config.name}:\n${errs.join("\n")}`,
    );
  }

  if (config.description) {
    result.archive.manifest.description = config.description;
  }

  const docReport = applyLibraryConfigDocumentation(result.archive, config);
  if (
    docReport.unknownBlockDocs.length > 0 ||
    docReport.unknownFunctionDocs.length > 0
  ) {
    const lines = [
      ...docReport.unknownBlockDocs.map((n) => `  blocks["${n}"] — not in compiled manifest`),
      ...docReport.unknownFunctionDocs.map((n) => `  functions["${n}"] — not in compiled manifest`),
    ];
    throw new Error(
      `${sourcesDir}/library.json references unknown symbols:\n${lines.join("\n")}`,
    );
  }

  writeFileSync(stlibPath, JSON.stringify(result.archive, null, 2) + "\n", "utf-8");
  return result.archive;
}

/**
 * Rebuild a hand-authored library from disk: reads library.json plus
 * the .st files from libs/sources/<libDirName>/, recompiles, applies
 * block docs, writes the .stlib archive.
 *
 * `orderedSources` enforces a deterministic file order so type-resolution
 * across files (e.g. PID needing INTEGRAL/DERIVATIVE first) doesn't
 * depend on filesystem traversal.
 */
function rebuildLibraryFromDisk({ libDirName, stlibPath, orderedSources, dependencies }) {
  const sourcesDir = resolve(sourcesRoot, libDirName);
  if (!existsSync(sourcesDir)) {
    throw new Error(`Source directory not found: ${sourcesDir}`);
  }

  const config = loadLibraryConfig(sourcesDir);
  if (!config) {
    throw new Error(`${sourcesDir}/library.json not found`);
  }

  const onDisk = new Set(readdirSync(sourcesDir).filter((f) => f.endsWith(".st")));
  const missing = orderedSources.filter((f) => !onDisk.has(f));
  if (missing.length > 0) {
    throw new Error(
      `Missing source files in ${sourcesDir}:\n  ${missing.join("\n  ")}`,
    );
  }
  const sources = orderedSources.map((fileName) => ({
    fileName,
    source: readFileSync(resolve(sourcesDir, fileName), "utf-8"),
  }));

  return compileAndWrite({ sources, config, stlibPath, dependencies, sourcesDir });
}

/**
 * Rebuild OSCAT from the embedded sources in its existing .stlib.
 *
 * Legacy round-trip path: read `archive.sources`, recompile, write
 * back. This is OSCAT-only — every other lib uses the disk-backed
 * `rebuildLibraryFromDisk` path. Kept until the codesys-importer can
 * cleanly re-extract OSCAT from its CODESYS .library fixture (today
 * the importer drops the closing `*)` of trailing block comments on
 * a majority of POUs, so a fresh import would produce an archive that
 * fails to recompile).
 *
 * The on-disk source-of-truth pattern still applies: when the importer
 * regression is fixed, OSCAT will move to libs/sources/oscat-basic/
 * with a library.json + .st files written by the importer, and this
 * round-trip helper goes away.
 */
function rebuildOscatFromArchive(stlibPath, dependencies) {
  const archive = loadStlibFromFile(stlibPath);
  if (!archive.sources || archive.sources.length === 0) {
    throw new Error(
      `${stlibPath}: no embedded sources — cannot rebuild OSCAT via the round-trip path`,
    );
  }

  const result = compileStlib(archive.sources, {
    name: archive.manifest.name,
    version: archive.manifest.version,
    namespace: archive.manifest.namespace,
    noSource: false,
    builtin: archive.manifest.isBuiltin,
    dependencies,
    globalConstants: archive.globalConstants,
  });

  if (!result.success) {
    const errs = result.errors.map((e) => `  ${e.file ?? ""}:${e.line ?? 0}: ${e.message}`);
    throw new Error(
      `Failed to rebuild ${archive.manifest.name}:\n${errs.join("\n")}`,
    );
  }

  if (archive.manifest.description) {
    result.archive.manifest.description = archive.manifest.description;
  }

  writeFileSync(stlibPath, JSON.stringify(result.archive, null, 2) + "\n", "utf-8");
  return result.archive;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function setup() {
  const iecPath = resolve(libsDir, "iec-standard-fb.stlib");
  const additionalFbPath = resolve(libsDir, "additional-function-blocks.stlib");
  const oscatPath = resolve(libsDir, "oscat-basic.stlib");

  await refreshAndLoadCompiler();

  // 1. IEC standard FB library — disk-backed, no inter-lib deps.
  console.log("[rebuild-libs] Rebuilding iec-standard-fb.stlib...");
  rebuildLibraryFromDisk({
    libDirName: "iec-standard-fb",
    stlibPath: iecPath,
    orderedSources: ["edge_detection.st", "bistable.st", "counter.st", "timer.st"],
  });

  // 2. Additional Function Blocks — disk-backed; PID instantiates
  //    INTEGRAL/DERIVATIVE intra-library so the file order matters.
  if (existsSync(resolve(sourcesRoot, "additional-function-blocks"))) {
    console.log("[rebuild-libs] Rebuilding additional-function-blocks.stlib...");
    rebuildLibraryFromDisk({
      libDirName: "additional-function-blocks",
      stlibPath: additionalFbPath,
      orderedSources: [
        "integral.st",
        "derivative.st",
        "rtc.st",
        "pid.st",
        "ramp.st",
        "hysteresis.st",
      ],
    });
  }

  // 3. OSCAT — round-trip-from-archive (legacy path). Tracked .stlib
  //    is the de-facto source of truth until the codesys-importer can
  //    cleanly re-extract OSCAT (it currently mangles trailing block
  //    comments). Depends on iec-standard-fb at compile time.
  if (existsSync(oscatPath)) {
    console.log("[rebuild-libs] Rebuilding oscat-basic.stlib (round-trip)...");
    const iecArchive = loadStlibFromFile(iecPath);
    rebuildOscatFromArchive(oscatPath, [iecArchive]);
  }

  // 4. Copy compiled archives into vscode-extension/bundled-libs/. The
  //    extension's esbuild bundler also does this at .vsix package time
  //    — this copy keeps the extension's local development workflow
  //    (`cd vscode-extension && npx vitest run`) working without an
  //    extra build step.
  if (existsSync(vscodeLibsDir)) {
    copyFileSync(iecPath, resolve(vscodeLibsDir, "iec-standard-fb.stlib"));
    if (existsSync(additionalFbPath)) {
      copyFileSync(
        additionalFbPath,
        resolve(vscodeLibsDir, "additional-function-blocks.stlib"),
      );
    }
    if (existsSync(oscatPath)) {
      copyFileSync(oscatPath, resolve(vscodeLibsDir, "oscat-basic.stlib"));
    }
  }

  console.log("[rebuild-libs] All libraries rebuilt successfully.");
}

// Allow running standalone: node scripts/rebuild-libs.mjs
const isDirectRun = process.argv[1] &&
  resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  setup().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
