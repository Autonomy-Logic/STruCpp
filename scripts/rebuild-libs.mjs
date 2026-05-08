#!/usr/bin/env node
/**
 * Rebuild all bundled .stlib library archives.
 *
 * Every bundled library is rebuilt FROM DISK — `libs/sources/<lib-name>/`
 * holds the canonical source of truth and the matching .stlib in `libs/`
 * is a pure build artefact produced here (and gitignored).
 *
 * Two shapes of disk-backed source are supported:
 *
 *   - Hand-authored libs (iec-standard-fb, additional-function-blocks):
 *     library.json + a deterministic list of .st files. The .st files
 *     are concatenated in `orderedSources` order and fed to the strucpp
 *     compiler so cross-file type references (e.g. PID instantiating
 *     INTEGRAL/DERIVATIVE) resolve consistently regardless of filesystem
 *     traversal order.
 *
 *   - CODESYS-imported libs (oscat-basic): library.json names a
 *     `codesysSource` (.library file). We run the codesys-importer
 *     against that file to extract POUs/TYPEs/GVLs into in-memory ST
 *     sources, then feed those into the same compile step. The .library
 *     file is the canonical source of truth — never the .stlib.
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
import { readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync, statSync } from "fs";
import { resolve, dirname, relative, sep, posix } from "path";
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
let importCodesysLibrary;

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
  const codesysImport = await import(
    resolve(projectRoot, "dist/library/codesys-import/index.js")
  );
  compileStlib = compiler.compileStlib;
  loadStlibFromFile = loader.loadStlibFromFile;
  loadLibraryConfig = config.loadLibraryConfig;
  applyLibraryConfigDocumentation = config.applyLibraryConfigDocumentation;
  importCodesysLibrary = codesysImport.importCodesysLibrary;
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
 * Recursively collect all `.st` files under `dir`, returning their paths
 * relative to `dir` using POSIX separators (so the values are usable as
 * both file lookups and category strings on every platform). Sorted to
 * keep filesystem-traversal order deterministic when no explicit
 * `orderedSources` list is provided.
 */
function collectStFilesRecursive(dir) {
  const out = [];
  function walk(current) {
    for (const entry of readdirSync(current).sort()) {
      const full = resolve(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".st")) {
        out.push(relative(dir, full).split(sep).join(posix.sep));
      }
    }
  }
  walk(dir);
  return out;
}

/**
 * Rebuild a hand-authored library from disk: reads library.json plus
 * every .st file under libs/sources/<libDirName>/ (recursing into
 * subdirectories), recompiles, applies block docs, writes the .stlib
 * archive.
 *
 * Folder layout drives manifest hierarchy: a file at
 * `libs/sources/my_lib/some_category/foo.st` produces manifest entries
 * tagged with `category: "some_category"`. Files at the lib root carry
 * no category. Hierarchy is purely metadata — every source is still
 * stored flat-by-filename inside the .stlib archive (just with the
 * `category` field set on the source entry, mirroring the manifest).
 *
 * `orderedSources` is optional. When provided it enforces a
 * deterministic compile order (so cross-file type resolution doesn't
 * depend on filesystem traversal — see PID needing INTEGRAL/DERIVATIVE
 * first). Each entry is a path relative to the lib's source directory
 * and may include subfolders (e.g. `["motion/ramp.st", "motion/pid.st"]`).
 * When omitted, every .st under the lib directory is picked up in
 * sorted order.
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

  const allRelative = collectStFilesRecursive(sourcesDir);
  let pickedRelative;
  if (orderedSources && orderedSources.length > 0) {
    const onDisk = new Set(allRelative);
    const missing = orderedSources.filter((f) => !onDisk.has(f));
    if (missing.length > 0) {
      throw new Error(
        `Missing source files in ${sourcesDir}:\n  ${missing.join("\n  ")}`,
      );
    }
    pickedRelative = orderedSources;
  } else {
    pickedRelative = allRelative;
  }

  const sources = pickedRelative.map((relPath) => {
    const slashIdx = relPath.lastIndexOf("/");
    const fileName = slashIdx === -1 ? relPath : relPath.slice(slashIdx + 1);
    const category = slashIdx === -1 ? undefined : relPath.slice(0, slashIdx);
    const entry = {
      fileName,
      source: readFileSync(resolve(sourcesDir, relPath), "utf-8"),
    };
    if (category) entry.category = category;
    return entry;
  });

  return compileAndWrite({ sources, config, stlibPath, dependencies, sourcesDir });
}

/**
 * Rebuild a CODESYS-imported library from disk: reads library.json plus
 * the bundled .library file from libs/sources/<libDirName>/, runs the
 * codesys-importer to extract ST sources, then compiles them through
 * the same path as hand-authored libs.
 *
 * `library.json.codesysSource` names the .library file relative to the
 * lib's source directory. We resolve it, hand it off to importCodesysLibrary
 * (which auto-detects V2.3 vs V3), and feed the resulting in-memory ST
 * sources into compileAndWrite. The .library file is the canonical source
 * of truth — never the .stlib output.
 */
function rebuildLibraryFromCodesys({ libDirName, stlibPath, dependencies }) {
  const sourcesDir = resolve(sourcesRoot, libDirName);
  if (!existsSync(sourcesDir)) {
    throw new Error(`Source directory not found: ${sourcesDir}`);
  }

  const config = loadLibraryConfig(sourcesDir);
  if (!config) {
    throw new Error(`${sourcesDir}/library.json not found`);
  }
  if (!config.codesysSource) {
    throw new Error(
      `${sourcesDir}/library.json missing 'codesysSource' field — required for codesys-imported libs`,
    );
  }

  const codesysPath = resolve(sourcesDir, config.codesysSource);
  if (!existsSync(codesysPath)) {
    throw new Error(`CODESYS source file not found: ${codesysPath}`);
  }

  const importResult = importCodesysLibrary(codesysPath);
  if (!importResult.success) {
    throw new Error(
      `Failed to import ${codesysPath}:\n  ${importResult.errors.join("\n  ")}`,
    );
  }

  // Merge constants discovered by the importer (VAR_GLOBAL CONSTANT
  // integer blocks promoted to compile-time values) over any explicit
  // overrides in library.json — explicit wins, since users sometimes
  // override OSCAT defaults like STRING_LENGTH for memory-constrained
  // targets.
  const mergedConfig = {
    ...config,
    globalConstants: {
      ...importResult.globalConstants,
      ...(config.globalConstants ?? {}),
    },
  };

  return compileAndWrite({
    sources: importResult.sources,
    config: mergedConfig,
    stlibPath,
    dependencies,
    sourcesDir,
  });
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
    orderedSources: [
      "edge_detection.st",
      "bistable.st",
      "sema.st",
      "counter.st",
      "timer.st",
    ],
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

  // 3. OSCAT — codesys-imported from libs/sources/oscat-basic/. The
  //    canonical source is the bundled .library file (V3 binary);
  //    rebuild-libs runs the codesys-importer at build time to extract
  //    ST sources, then compiles them. Depends on iec-standard-fb.
  if (existsSync(resolve(sourcesRoot, "oscat-basic"))) {
    console.log("[rebuild-libs] Rebuilding oscat-basic.stlib (from codesys)...");
    const iecArchive = loadStlibFromFile(iecPath);
    rebuildLibraryFromCodesys({
      libDirName: "oscat-basic",
      stlibPath: oscatPath,
      dependencies: [iecArchive],
    });
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
