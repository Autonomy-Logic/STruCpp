#!/usr/bin/env node
/**
 * Rebuild all bundled .stlib library archives from their embedded sources.
 *
 * This script decompiles the existing archives, recompiles them with the
 * current compiler, and writes back the updated archives. It ensures the
 * bundled libraries always match the current codegen output.
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
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const libsDir = resolve(projectRoot, "libs");
const vscodeLibsDir = resolve(projectRoot, "vscode-extension", "bundled-libs");

let compileStlib;
let loadStlibFromFile;

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
  compileStlib = compiler.compileStlib;
  loadStlibFromFile = loader.loadStlibFromFile;
}

/**
 * Rebuild a single .stlib archive from its embedded sources.
 */
function rebuildLibrary(stlibPath, options) {
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
    dependencies: options.dependencies,
    globalConstants: archive.globalConstants,
  });

  if (!result.success) {
    const errs = result.errors.map((e) => `  ${e.file ?? ""}:${e.line ?? 0}: ${e.message}`);
    throw new Error(
      `Failed to rebuild ${archive.manifest.name}:\n${errs.join("\n")}`,
    );
  }

  // Preserve description from original manifest
  if (archive.manifest.description) {
    result.archive.manifest.description = archive.manifest.description;
  }

  writeFileSync(stlibPath, JSON.stringify(result.archive, null, 2) + "\n", "utf-8");
  return result.archive;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function setup() {
  const iecPath = resolve(libsDir, "iec-standard-fb.stlib");
  const oscatPath = resolve(libsDir, "oscat-basic.stlib");

  if (!existsSync(iecPath)) {
    console.warn("[rebuild-libs] iec-standard-fb.stlib not found — skipping");
    return;
  }

  // 0. Refresh dist/ before pulling the compiler from it. Without this
  //    a src/ edit without a manual `npm run build` would regenerate
  //    the libs against stale codegen.
  await refreshAndLoadCompiler();

  // 1. Rebuild IEC standard FB library (no dependencies)
  console.log("[rebuild-libs] Rebuilding iec-standard-fb.stlib...");
  rebuildLibrary(iecPath, {});

  // 2. Rebuild OSCAT (depends on IEC standard FB library)
  if (existsSync(oscatPath)) {
    console.log("[rebuild-libs] Rebuilding oscat-basic.stlib...");
    const iecArchive = loadStlibFromFile(iecPath);
    rebuildLibrary(oscatPath, { dependencies: [iecArchive] });
  }

  // 3. Copy to VSCode extension bundled-libs if directory exists
  if (existsSync(vscodeLibsDir)) {
    copyFileSync(iecPath, resolve(vscodeLibsDir, "iec-standard-fb.stlib"));
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
