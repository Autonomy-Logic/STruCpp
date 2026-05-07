#!/usr/bin/env node
/**
 * Rebuild all bundled .stlib library archives.
 *
 * The hand-authored libs (iec-standard-fb, additional-function-blocks)
 * are rebuilt FROM DISK — `libs/sources/<lib-name>/` is the canonical
 * source of truth, and `libs/<lib-name>.stlib` is a pure build artifact.
 * library.json next to the .st files carries metadata + per-block docs.
 *
 * OSCAT is still rebuilt by round-tripping its embedded sources through
 * `compileStlib` because its true upstream is the CODESYS .library file
 * at tests/fixtures/codesys/oscat_basic_335_codesys3.library, and the
 * codesys-importer doesn't yet write disk sources during build. Bringing
 * OSCAT onto the same `libs/sources/` model is a follow-up task.
 *
 * Used as:
 *   - vitest globalSetup (runs before all tests)
 *   - npm run build:libs (manual invocation)
 *
 * Refreshes `dist/` via tsc before importing from it. Otherwise a `src/`
 * change without a manual `npm run build` would silently regenerate the
 * .stlib archives against stale codegen — the on-disk libs would no
 * longer match `src/`. tsc on this codebase runs in ~1s so the cost is
 * negligible compared to the test suite that follows.
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

  const result = compileStlib(sources, {
    name: config.name,
    version: config.version,
    namespace: config.namespace,
    noSource: false,
    builtin: config.isBuiltin === true,
    dependencies,
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
 * Rebuild OSCAT from its embedded sources (legacy round-trip path).
 * Kept until the codesys-importer is taught to write disk sources at
 * `libs/sources/oscat-basic/` during a re-import.
 */
function rebuildOscatFromArchive(stlibPath, dependencies) {
  const archive = loadStlibFromFile(stlibPath);
  if (!archive.sources || archive.sources.length === 0) {
    throw new Error(`${stlibPath}: no embedded sources — cannot rebuild`);
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

  // 3. OSCAT — legacy archive-round-trip path; depends on iec-standard-fb.
  //    TODO(libs): migrate OSCAT onto the libs/sources/ pattern by having
  //    the codesys-importer extract the .library file at
  //    tests/fixtures/codesys/oscat_basic_335_codesys3.library into
  //    libs/sources/oscat-basic/*.st + library.json.
  if (existsSync(oscatPath)) {
    console.log("[rebuild-libs] Rebuilding oscat-basic.stlib (legacy round-trip)...");
    const iecArchive = loadStlibFromFile(iecPath);
    rebuildOscatFromArchive(oscatPath, [iecArchive]);
  }

  // 4. Copy to VSCode extension bundled-libs if directory exists
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
