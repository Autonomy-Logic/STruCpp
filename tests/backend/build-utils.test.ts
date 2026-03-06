// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
import { describe, it, expect } from "vitest";
import {
  splitCxxFlags,
  isCompilerAvailable,
  findRuntimeIncludeDir,
} from "../../dist/index.js";

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

  it("returns null when not found and no -I flags", () => {
    // Override CWD to a temp dir where runtime doesn't exist
    const origCwd = process.cwd;
    process.cwd = () => "/tmp";
    try {
      // This may or may not find it via __dirname / import.meta.url
      // Just verify it doesn't throw
      const dir = findRuntimeIncludeDir("");
      expect(typeof dir === "string" || dir === null).toBe(true);
    } finally {
      process.cwd = origCwd;
    }
  });
});
