// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Package smoke test — exercises the COMPILED artifact in `dist/`.
 *
 * Every other test imports `../../src/...` so it runs the TypeScript source
 * (transpiled on the fly by Vite) and counts toward `src/**` coverage. This
 * file is the one deliberate exception: it imports the built `dist/index.js`
 * — the exact entry point the npm package ships (`package.json` "main" /
 * "exports") and that consumers like the OpenPLC Editor import.
 *
 * It guards what `src/` tests cannot: that `tsc` actually emits a working
 * public API (correct export surface, ESM resolution, no type-only import
 * that vanishes at runtime). The `no-dist-imports` guard test explicitly
 * allows this file.
 */

import { describe, it, expect } from "vitest";
import * as pkg from "../../dist/index.js";

const EXPECTED_EXPORTS = [
  "compile",
  "parse",
  "analyze",
  "getVersion",
  "compileStlib",
] as const;

describe("package smoke (compiled dist/ artifact)", () => {
  it("exposes the documented public API as functions", () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (pkg as Record<string, unknown>)[name], name).toBe(
        "function",
      );
    }
    // defaultOptions is a value export, not a function
    expect(pkg.defaultOptions).toBeDefined();
  });

  it("compiles a trivial program end-to-end through the built output", () => {
    const result = pkg.compile(
      "PROGRAM P\nVAR n : INT; END_VAR\nn := n + 1;\nEND_PROGRAM\n",
    );
    expect(result.success).toBe(true);
    expect(result.cppCode).toContain("Program_P");
    expect(result.headerCode.length).toBeGreaterThan(0);
  });

  it("reports a semver version string", () => {
    expect(pkg.getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
