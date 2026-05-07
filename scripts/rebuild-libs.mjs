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
  const codesys = await import(
    resolve(projectRoot, "dist/library/codesys-import/index.js")
  );
  compileStlib = compiler.compileStlib;
  loadStlibFromFile = loader.loadStlibFromFile;
  loadLibraryConfig = config.loadLibraryConfig;
  applyLibraryConfigDocumentation = config.applyLibraryConfigDocumentation;
  importCodesysLibrary = codesys.importCodesysLibrary;
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
 * Rebuild a CODESYS-imported library: reads library.json from
 * `libs/sources/<libDirName>/`, runs the codesys-importer over the
 * `.library` file colocated in the same directory, and feeds the
 * extracted ST sources into compileStlib.
 *
 * Used by OSCAT today. The .library file is the canonical source of
 * truth on disk; library.json supplies the metadata (name, namespace,
 * version, globalConstants).
 */
function rebuildLibraryFromCodesys({ libDirName, stlibPath, codesysLibraryFile, dependencies }) {
  const sourcesDir = resolve(sourcesRoot, libDirName);
  if (!existsSync(sourcesDir)) {
    throw new Error(`Source directory not found: ${sourcesDir}`);
  }
  const config = loadLibraryConfig(sourcesDir);
  if (!config) {
    throw new Error(`${sourcesDir}/library.json not found`);
  }
  const codesysLibraryPath = resolve(sourcesDir, codesysLibraryFile);
  if (!existsSync(codesysLibraryPath)) {
    throw new Error(`CODESYS library file not found: ${codesysLibraryPath}`);
  }

  const importResult = importCodesysLibrary(codesysLibraryPath);
  if (!importResult.success) {
    throw new Error(
      `CODESYS import failed for ${codesysLibraryPath}:\n  ${importResult.errors.join("\n  ")}`,
    );
  }

  // Post-process step 1: drop POUs whose imported source has unbalanced
  // block comments. The codesys-importer's V3 parser handles ~99.6% of
  // the OSCAT corpus correctly with the stride-10 boundary-record fix,
  // but a small number of POUs (DCF77, UTC_TO_LTIME at 335/0/1.10) end
  // up truncated mid-revision-history. The trailing `*)` is missing AND
  // unrelated junk strings get appended in its place, so neither
  // appending `*)` nor truncating-and-closing produces a recompilable
  // POU. Skip them with a warning so the rest of OSCAT still builds —
  // the editor and runtime degrade to "FB not in library" for those
  // names, which is preferable to failing the whole library build.
  const droppedNames = new Set();
  const survivors = [];
  for (const s of importResult.sources) {
    let depth = 0;
    for (let i = 0; i < s.source.length - 1; i++) {
      if (s.source[i] === "(" && s.source[i + 1] === "*") { depth++; i++; }
      else if (s.source[i] === "*" && s.source[i + 1] === ")") {
        depth = Math.max(0, depth - 1); i++;
      }
    }
    if (depth > 0) {
      droppedNames.add(s.fileName.replace(/\.gvl\.st$/, "").replace(/\.st$/, ""));
    } else {
      survivors.push(s);
    }
  }
  const directDrops = [...droppedNames];

  // Post-process step 2: also drop transitive callers. If a POU body
  // calls a dropped FB or function by name, the C++ codegen would emit
  // an unresolved symbol reference. Iteratively widen the drop set
  // until it stabilises — typically just one extra hop (e.g.
  // CALENDAR_CALC depends on UTC_TO_LTIME).
  let widened = true;
  while (widened) {
    widened = false;
    for (let idx = survivors.length - 1; idx >= 0; idx--) {
      const s = survivors[idx];
      let calls = false;
      for (const name of droppedNames) {
        if (new RegExp(`\\b${name}\\s*\\(`).test(s.source)) { calls = true; break; }
      }
      if (calls) {
        droppedNames.add(s.fileName.replace(/\.gvl\.st$/, "").replace(/\.st$/, ""));
        survivors.splice(idx, 1);
        widened = true;
      }
    }
  }
  const transitiveDrops = [...droppedNames].filter((n) => !directDrops.includes(n));

  if (directDrops.length > 0) {
    console.warn(
      `[rebuild-libs] WARNING: ${directDrops.length} POU(s) skipped — ` +
        `unclosed block comments after CODESYS V3 import (the v3-parser ` +
        `truncates these mid-revision-history): ${directDrops.join(", ")}`,
    );
  }
  if (transitiveDrops.length > 0) {
    console.warn(
      `[rebuild-libs] WARNING: ${transitiveDrops.length} POU(s) skipped — ` +
        `transitively depend on the dropped POUs above: ${transitiveDrops.join(", ")}`,
    );
  }
  const cleanSources = survivors;

  // Append any hand-authored .st sources sitting next to library.json.
  // These supplement the .library import and are used today only for
  // the OSCAT GVL block (globals.st instantiates the CONSTANTS_*
  // structs as VAR_GLOBAL — the V3 GVL extractor still misses that
  // block). They're appended AFTER the imported sources so they can
  // reference imported TYPEs.
  const supplemental = readdirSync(sourcesDir)
    .filter((f) => f.endsWith(".st"))
    .sort();
  if (supplemental.length > 0) {
    console.log(
      `[rebuild-libs]   + ${supplemental.length} hand-authored supplement(s): ${supplemental.join(", ")}`,
    );
    for (const fileName of supplemental) {
      cleanSources.push({
        fileName,
        source: readFileSync(resolve(sourcesDir, fileName), "utf-8"),
      });
    }
  }

  return compileAndWrite({
    sources: cleanSources,
    config,
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

  // 3. OSCAT — codesys-imported. Sources extracted from the binary
  //    .library file at libs/sources/oscat-basic/ on every build;
  //    metadata + globalConstants come from library.json next to it.
  //    Depends on iec-standard-fb at compile time.
  if (existsSync(resolve(sourcesRoot, "oscat-basic"))) {
    console.log("[rebuild-libs] Rebuilding oscat-basic.stlib (CODESYS import)...");
    const iecArchive = loadStlibFromFile(iecPath);
    rebuildLibraryFromCodesys({
      libDirName: "oscat-basic",
      stlibPath: oscatPath,
      codesysLibraryFile: "oscat_basic_335.library",
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
