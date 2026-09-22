// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Bundle the compiler front end into a single self-contained CommonJS file at
 * `dist/parser-bundle.cjs`, so it ships in the strucpp npm tarball.
 *
 * Why this exists. `dist/index.js` is ESM and reaches chevrotain, which reaches
 * `lodash-es` and `@chevrotain/utils` — both ESM, both behind `exports` maps. A
 * consumer running Jest with the default CommonJS resolver cannot load that
 * chain: widening `transformIgnorePatterns` gets as far as a resolution failure
 * inside chevrotain's own package exports, and no amount of Jest configuration
 * fixes it.
 *
 * That matters because the OpenPLC Editor is exactly such a consumer, and it
 * now parses its variable declarations with this compiler rather than with a
 * parser of its own (DOPE-650). Its unit suite has to be able to import the
 * real parser — a mocked one would defeat the entire point of the change, which
 * was to stop the editor from having a second opinion about what a declaration
 * is.
 *
 * esbuild inlines the whole dependency chain, so the result requires nothing at
 * run time. It is a build artifact for consumers whose loader cannot follow
 * ESM; everything that can should keep importing `strucpp` normally.
 */

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT_DIR, "dist", "parser-bundle.cjs");
const ENTRY = join(ROOT_DIR, "src", "index.ts");

// The vscode-extension subproject already depends on esbuild for the browser
// LSP server bundle; reuse it rather than adding a second copy to the root.
const ESBUILD = join(ROOT_DIR, "vscode-extension", "node_modules", ".bin", "esbuild");
const esbuildBin = existsSync(ESBUILD) ? ESBUILD : "npx";
const esbuildArgs = esbuildBin === "npx" ? ["esbuild"] : [];

const result = spawnSync(
  esbuildBin,
  [
    ...esbuildArgs,
    ENTRY,
    "--bundle",
    // `node` rather than `neutral`: the chain expects Node's module semantics,
    // and the consumers that need this file are test runners on Node.
    "--platform=node",
    "--format=cjs",
    `--outfile=${OUT_FILE}`,
    "--log-level=error",
  ],
  { cwd: ROOT_DIR, stdio: "inherit" },
);

if (result.status !== 0) {
  console.error("[build-parser-bundle] esbuild failed");
  process.exit(result.status ?? 1);
}

console.log(
  `[build-parser-bundle] Wrote ${OUT_FILE} (${(statSync(OUT_FILE).size / 1024).toFixed(0)} KB)`,
);
