#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * Bundle the STruC++ CLI into a single CJS file using esbuild.
 * Injects the version from package.json as a compile-time constant.
 */

import { readFileSync } from "fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

await build({
  entryPoints: ["dist/node/cli.js"],
  bundle: true,
  platform: "node",
  target: "node22",
  outfile: "dist/strucpp-bundle.cjs",
  format: "cjs",
  define: {
    STRUCPP_VERSION: JSON.stringify(pkg.version),
  },
});
