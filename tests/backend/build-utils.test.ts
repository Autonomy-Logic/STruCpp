// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { splitCxxFlags } from "../../dist/cxx-flags.js";
import {
  findRuntimeIncludeDir,
  isCompilerAvailable,
} from "../../dist/node/build-utils.js";

describe("splitCxxFlags", () => {
  it("splits simple flags", () => {
    expect(splitCxxFlags("-O2 -Wall -Werror")).toEqual([
      "-O2",
      "-Wall",
      "-Werror",
    ]);
  });

  it("handles quoted paths", () => {
    // Fully-quoted tokens get quotes stripped
    expect(splitCxxFlags('"-I/path with spaces" -O2')).toEqual([
      "-I/path with spaces",
      "-O2",
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(splitCxxFlags("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(splitCxxFlags("   ")).toEqual([]);
  });
});

describe("isCompilerAvailable", () => {
  it("detects an available compiler", () => {
    // node is always available in the test environment
    expect(isCompilerAvailable("node")).toBe(true);
  });

  it("returns false for nonexistent compiler", () => {
    expect(isCompilerAvailable("nonexistent-compiler-xyz-12345")).toBe(false);
  });
});

describe("findRuntimeIncludeDir", () => {
  it("finds the runtime include directory from project root", () => {
    // When running from the project root, auto-discovery should find it
    const dir = findRuntimeIncludeDir("");
    expect(dir).not.toBeNull();
    expect(dir).toContain("runtime");
    expect(dir).toContain("include");
  });

  it("locates the runtime via the package layout when cwd is elsewhere (#134)", () => {
    // Regression for #134: on a global/npm install the cwd is the user's
    // project, not the package, so the cwd-relative candidate can't help.
    // The package-relative candidates (import.meta / __dirname) must still
    // resolve the shipped src/runtime/include — the bundle runs from
    // dist/node, so it has to climb two levels (../../src/runtime/include),
    // not one.
    const origCwd = process.cwd;
    process.cwd = () => "/tmp";
    try {
      const dir = findRuntimeIncludeDir("");
      expect(dir).not.toBeNull();
      expect(dir).toContain("runtime");
      expect(dir).toContain("include");
      // And it must actually contain the canonical runtime header.
      expect(existsSync(resolve(dir!, "iec_types.hpp"))).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });

  it("falls back to a -I path from cxx-flags when auto-discovery misses", () => {
    const origCwd = process.cwd;
    process.cwd = () => "/tmp";
    try {
      const real = findRuntimeIncludeDir("");
      expect(real).not.toBeNull();
      // Point auto-discovery at nothing useful, but supply the real dir
      // via -I; the flag fallback should recover it.
      const viaFlag = findRuntimeIncludeDir(`-I${real}`);
      expect(viaFlag).not.toBeNull();
      expect(existsSync(resolve(viaFlag!, "iec_types.hpp"))).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });
});
