// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Node-only entry point — re-exports the entire browser-safe
 * `strucpp` surface plus the filesystem and process-spawning
 * helpers that only make sense on Node.
 *
 * Consumed by:
 *   - The `strucpp` CLI (`bin/strucpp` → `dist/node/cli.js`).
 *   - openplc-editor's compile pipeline, which spawns g++ and
 *     reads `.stlib` archives off disk.
 *   - Test runners and build orchestration scripts.
 *
 * Browser consumers (the strucpp Web Worker, openplc-web) import
 * from `strucpp` — they never see the file/process helpers below
 * and the bundle stays Node-API-free.
 */

// Browser-safe surface
export * from "../index.js";

// Filesystem-backed library loaders
export {
  discoverLibraries,
  discoverStlibs,
  loadLibraryFromFile,
  loadStlibFromFile,
} from "./library-loader.js";

// Filesystem-backed library config
export { loadLibraryConfig } from "./library-config.js";

// Filesystem-backed source discovery
export { discoverSTFiles } from "./library-utils.js";

// File-shaped CODESYS import wrapper
export { importCodesysLibraryFromFile } from "./codesys-import.js";

// Node-only build helpers (g++ probing, runtime / libs discovery,
// xcrun on macOS).  Pure C++ flag string parsers are re-exported
// from `strucpp` itself.
export {
  findBundledLibsDir,
  findRuntimeIncludeDir,
  getCxxEnv,
  isCompilerAvailable,
} from "./build-utils.js";
