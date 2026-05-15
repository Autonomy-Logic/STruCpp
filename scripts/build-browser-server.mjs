#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Build the browser-target language server bundle and copy it into
 * `dist/browser-server.js` so it ships in the strucpp npm tarball.
 *
 * The bundle's source lives in `vscode-extension/server/src/server-browser.ts`
 * because that directory already houses the LSP machinery (document
 * manager, completion / hover / definition / etc.) reused by the
 * Node language server.  The actual esbuild config is in
 * `vscode-extension/esbuild.mjs` — this script just invokes it and
 * copies the output into `dist/`.
 *
 * Why ship the bundle from strucpp's tarball: downstream Monaco
 * editors (openplc-editor, openplc-web) consume strucpp as an npm
 * dependency and need the same versioned browser-server payload
 * that the strucpp core ships.  Co-versioning prevents drift —
 * `loadStlibFromBuffer` and the protocol shape stay in lock-step
 * across the compiler and the language server.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const EXTENSION_DIR = join(ROOT, "vscode-extension");
const DIST_DIR = join(ROOT, "dist");

function run(cmd, args, cwd) {
  const label = `${cmd} ${args.join(" ")}`;
  console.log(`[build-browser-server] $ ${label}   (cwd: ${cwd})`);
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`[build-browser-server] ${label} exited with ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

// 1. Make sure vscode-extension dependencies are installed.  Skip
//    if node_modules already exists — `npm ci` is idempotent but
//    slow, and local dev usually has the install cached.
const extensionNodeModules = join(EXTENSION_DIR, "node_modules");
if (!existsSync(extensionNodeModules)) {
  console.log(
    "[build-browser-server] vscode-extension/node_modules missing — running npm ci",
  );
  run("npm", ["ci"], EXTENSION_DIR);
}

// 2. Compile TypeScript so esbuild has source to bundle.
run("npx", ["tsc", "-b"], EXTENSION_DIR);

// 3. Bundle (esbuild produces server.js + server.browser.js).
run("node", ["esbuild.mjs"], EXTENSION_DIR);

// 4. Copy the browser bundle (and its sourcemap if present) into
//    strucpp's dist/ so `npm pack` includes them in the tarball.
mkdirSync(DIST_DIR, { recursive: true });
const sourcePath = join(EXTENSION_DIR, "out", "server.browser.js");
const destPath = join(DIST_DIR, "browser-server.js");
cpSync(sourcePath, destPath);
console.log(`[build-browser-server] Copied ${sourcePath} → ${destPath}`);

const sourceMap = join(EXTENSION_DIR, "out", "server.browser.js.map");
if (existsSync(sourceMap)) {
  const destMap = join(DIST_DIR, "browser-server.js.map");
  cpSync(sourceMap, destMap);
  console.log(`[build-browser-server] Copied ${sourceMap} → ${destMap}`);
}

console.log("[build-browser-server] Done.");
