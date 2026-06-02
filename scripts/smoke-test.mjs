#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Smoke-test a *produced* strucpp binary.
 *
 * This is the safety net for issue #132: the released binary crashed at
 * module load (`TextDecoder("latin1")`) because it shipped a node18
 * small-ICU base while the code targets node22 full-ICU.  Nothing in the
 * pipeline ever ran the binary — the only check was `strucpp --help || true`,
 * whose `|| true` swallowed the crash.
 *
 * This script actually executes the binary and FAILS (non-zero exit) if it
 * can't run:
 *   1. `--version` exits 0 and prints the expected version
 *      (proves the module-load path — the thing that crashes today — works).
 *   2. `--help` exits 0.
 *   3. A tiny ST program compiles to a non-empty .cpp.
 *
 * Expected-version resolution (highest precedence first):
 *
 *   1. `STRUCPP_EXPECTED_VERSION` env var.  This is the source of truth
 *      used by `release.yml` — every smoke step exports
 *      `${{ needs.prepare.outputs.version }}`, the same value all build
 *      jobs feed into `npm version` when bumping `package.json` for the
 *      bundle/pkg pipeline.  Critically, this also lets the cross-runner
 *      `smoke-windows` job assert correctly: it checks out fresh source
 *      at the tag commit, where `package.json` may not have been bumped
 *      by a `chore(release): vX.Y.Z` commit yet, so the version-from-disk
 *      fallback would mismatch the binary built upstream with an
 *      injected version.
 *
 *   2. `package.json` on disk.  Fallback for local invocations.
 *
 * Usage:  node scripts/smoke-test.mjs <path-to-binary> [runner-prefix...]
 *   e.g.  node scripts/smoke-test.mjs dist/bin/strucpp
 *         node scripts/smoke-test.mjs dist/bin/strucpp arch -x86_64
 *         STRUCPP_EXPECTED_VERSION=0.5.2 node scripts/smoke-test.mjs dist/bin/strucpp
 *
 * Any extra args after the binary path are a command prefix used to launch
 * it (for running a cross-arch binary under an emulator, e.g. `arch -x86_64`
 * for the Intel macOS build on an Apple-Silicon runner).
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , binArg, ...runnerPrefix] = process.argv;

if (!binArg) {
  console.error("usage: node scripts/smoke-test.mjs <path-to-binary> [runner-prefix...]");
  process.exit(2);
}

const expectedVersion =
  process.env.STRUCPP_EXPECTED_VERSION ??
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
console.log(`  Expected version: ${expectedVersion}` +
  (process.env.STRUCPP_EXPECTED_VERSION ? " (from STRUCPP_EXPECTED_VERSION)" : " (from package.json)"));

/** Run the binary (optionally under a runner prefix) and return the result. */
function run(args) {
  const [cmd, ...prefixArgs] = runnerPrefix.length ? runnerPrefix : [binArg];
  const finalArgs = runnerPrefix.length ? [...prefixArgs, binArg, ...args] : args;
  return spawnSync(cmd, finalArgs, { encoding: "utf-8" });
}

const failures = [];
function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
    failures.push(name);
  }
}

console.log(`Smoke-testing binary: ${binArg}`);
if (runnerPrefix.length) console.log(`  (via runner: ${runnerPrefix.join(" ")})`);

// 1. --version: exit 0 and prints the expected version.
{
  const r = run(["--version"]);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  check(
    `--version exits 0 (status=${r.status})`,
    r.status === 0,
    r.error ? String(r.error) : out.trim(),
  );
  check(
    `--version reports ${expectedVersion}`,
    out.includes(expectedVersion),
    `output: ${out.trim()}`,
  );
}

// 2. --help: exit 0.
{
  const r = run(["--help"]);
  check(
    `--help exits 0 (status=${r.status})`,
    r.status === 0,
    r.error ? String(r.error) : (r.stderr ?? "").trim(),
  );
}

// 3. Compile a trivial ST program to a non-empty .cpp.
{
  const dir = mkdtempSync(join(tmpdir(), "strucpp-smoke-"));
  const stPath = join(dir, "main.st");
  const cppPath = join(dir, "main.cpp");
  writeFileSync(
    stPath,
    [
      "PROGRAM main",
      "VAR",
      "  x : INT;",
      "END_VAR",
      "  x := x + 1;",
      "END_PROGRAM",
      "",
    ].join("\n"),
  );

  // --no-default-libs keeps the compile hermetic: a trivial program needs no
  // stdlib, so it must not depend on libs/*.stlib sitting next to the binary.
  const r = run([stPath, "-o", cppPath, "--no-default-libs"]);
  check(
    `compile trivial ST exits 0 (status=${r.status})`,
    r.status === 0,
    r.error ? String(r.error) : `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(),
  );
  const produced = existsSync(cppPath) && statSync(cppPath).size > 0;
  check("compile produced a non-empty .cpp", produced, `expected: ${cppPath}`);
}

if (failures.length) {
  console.error(`\nSmoke test FAILED (${failures.length} check(s)): ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nSmoke test PASSED");
