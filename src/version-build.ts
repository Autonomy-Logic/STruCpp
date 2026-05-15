// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Build-time version constant.
 *
 * Overwritten by `scripts/rebuild-libs.mjs` from `package.json` before
 * tsc runs, so the version is baked into the tsc output (`dist/`) and
 * therefore into the npm tarball. The committed value here is the
 * dev placeholder; the release workflow first runs
 * `npm version "$VERSION"` and the rebuild script picks that up.
 *
 * Why this file exists separate from `package.json`:
 *   `getVersion()` in `src/index.ts` historically fell back to
 *   `readFileSync(path.join(dir, "../package.json"))` when
 *   `STRUCPP_VERSION` (the esbuild-injected constant used by the
 *   standalone binary) wasn't defined. That fallback works in
 *   development against an unpacked node_modules layout, but breaks
 *   the moment a downstream consumer (e.g. the OpenPLC editor's
 *   webpack + asar pipeline) re-bundles strucpp: `import.meta.url`
 *   no longer points to the strucpp module directory, the relative
 *   path doesn't resolve, and the function falls through to "0.0.0".
 *
 *   Pre-tsc generation of this module makes the version a regular
 *   compiled symbol — no runtime filesystem access, no path
 *   resolution, survives any bundler downstream.
 */
export const STRUCPP_VERSION_BUILD = "0.1.0-dev";
