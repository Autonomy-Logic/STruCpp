// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Guard: test files must import the TypeScript source (`../../src/…`), not
 * the compiled `dist/…` output.
 *
 * Why a test and not an ESLint rule: `npm run lint` only lints `src/`, and
 * test files are excluded from `tsconfig.json`, so the type-aware ESLint
 * config can't lint them without a separate project. This test enforces the
 * rule reliably in CI instead.
 *
 * Why it matters: coverage is collected on `src/**` (`vitest.config.ts`),
 * with `dist/` excluded and not remapped. A test that imports `dist/` runs
 * the compiled output and contributes *nothing* to `src/` coverage — so the
 * code it exercises looks untested. Import `src/` for behavior tests; the
 * one deliberate exception (validating the shipped artifact) is the package
 * smoke test, allow-listed below.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Test files permitted to import the compiled `dist/` artifact on purpose. */
const ALLOWLIST = new Set<string>([
  "integration/package-smoke.test.ts",
  "no-dist-imports.test.ts",
]);

/** A `from "<…>/dist/…"` import/export specifier. */
const DIST_IMPORT = /\bfrom\s+["'][^"']*\/dist\//;

function allTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allTestFiles(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("test suite hygiene", () => {
  it("no test imports the compiled dist/ output (behavior tests must use src/)", () => {
    const offenders: string[] = [];
    for (const file of allTestFiles(TESTS_DIR)) {
      const rel = relative(TESTS_DIR, file).split("\\").join("/");
      if (ALLOWLIST.has(rel)) continue;
      if (DIST_IMPORT.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
    expect(
      offenders,
      "These tests import dist/ instead of src/ — they run the compiled " +
        "output and are lost to src/ coverage. Switch to ../../src/…, or " +
        "add to the allowlist if intentionally testing the shipped artifact:\n  " +
        offenders.join("\n  "),
    ).toEqual([]);
  });
});
