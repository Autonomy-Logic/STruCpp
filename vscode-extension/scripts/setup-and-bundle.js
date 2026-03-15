#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Setup and bundle script for extension development.
 *
 * Ensures all dependencies are installed and the extension is bundled.
 * Called by the preLaunchTask so F5 works from a fresh clone.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const extDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(extDir, "..");

function run(cmd, cwd) {
  console.log(`\n> [${path.basename(cwd)}] ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// Windows: ensure npm global prefix directory exists
if (process.platform === "win32") {
  const npmDir = path.join(process.env.APPDATA || "", "npm");
  if (npmDir && !fs.existsSync(npmDir)) {
    console.log(`Creating ${npmDir}`);
    fs.mkdirSync(npmDir, { recursive: true });
  }
}

// 1. Install compiler dependencies if needed
if (!fs.existsSync(path.join(repoDir, "node_modules"))) {
  run("npm install", repoDir);
} else {
  console.log("\n> [strucpp] node_modules exists, skipping npm install");
}

// 2. Build compiler (tsc is incremental — fast when nothing changed)
run("npm run build", repoDir);

// 3. Install extension dependencies if needed
if (!fs.existsSync(path.join(extDir, "node_modules"))) {
  run("npm install", extDir);
} else {
  console.log("> [vscode-extension] node_modules exists, skipping npm install");
}

// 4. Always bundle (fast enough to run every time)
run("npm run bundle", extDir);
