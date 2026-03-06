// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Build Utilities
 *
 * Functions extracted from cli.ts for reuse by the VSCode extension and other consumers.
 * Handles compiler detection, runtime include discovery, and C++ flag parsing.
 */

import { existsSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { platform } from "os";
import { execFileSync } from "child_process";

/**
 * On macOS, newer Xcode CLT versions move libc++ headers to the SDK.
 * Returns an env object with CPLUS_INCLUDE_PATH set so g++ can find them.
 */
export function getCxxEnv(): NodeJS.ProcessEnv | undefined {
  if (platform() !== "darwin") return undefined;
  try {
    const sdkPath = execFileSync("xcrun", ["--show-sdk-path"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const cxxInclude = join(sdkPath, "usr", "include", "c++", "v1");
    if (existsSync(cxxInclude)) {
      return { ...process.env, CPLUS_INCLUDE_PATH: cxxInclude };
    }
  } catch {
    /* xcrun not available */
  }
  return undefined;
}

/**
 * Split a --cxx-flags string into individual arguments,
 * respecting double-quoted segments (e.g. '-I"/path with spaces"').
 */
export function splitCxxFlags(flags: string): string[] {
  if (!flags || !flags.trim()) return [];
  const parts = flags.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return parts.map((p) => p.replace(/^"|"$/g, ""));
}

/**
 * Extract -I include paths from a compiler flags string.
 * Handles: -I/path, -I /path, -I"/path with spaces"
 */
export function extractIncludePaths(flags: string): string[] {
  const paths: string[] = [];
  const parts = flags.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i] ?? "";
    const part = raw.replace(/^"|"$/g, "");
    if (part === "-I" && i + 1 < parts.length) {
      i++;
      paths.push((parts[i] ?? "").replace(/^"|"$/g, ""));
    } else if (part.startsWith("-I")) {
      paths.push(part.slice(2));
    }
  }
  return paths;
}

/**
 * Check whether a compiler is available by probing with --version.
 * Returns true if the command executes successfully, false otherwise.
 */
export function isCompilerAvailable(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate the runtime include directory by auto-discovery or from --cxx-flags.
 * Returns the resolved path or null if not found.
 */
export function findRuntimeIncludeDir(cxxFlags: string): string | null {
  const candidates: string[] = [];

  // From import.meta.url (ESM dev mode)
  try {
    if (typeof import.meta?.url === "string") {
      const scriptDir = dirname(new URL(import.meta.url).pathname);
      candidates.push(resolve(scriptDir, "runtime", "include"));
      candidates.push(resolve(scriptDir, "..", "src", "runtime", "include"));
    }
  } catch {
    // unavailable in CJS bundle / pkg binary
  }

  // From __dirname (CJS bundle via esbuild)
  if (typeof __dirname === "string") {
    candidates.push(resolve(__dirname, "runtime", "include"));
    candidates.push(resolve(__dirname, "..", "src", "runtime", "include"));
  }

  // Relative to binary (pkg binary may be in dist/bin/, dist/, or project root)
  const execDir = dirname(process.execPath);
  for (const base of [
    execDir,
    resolve(execDir, ".."),
    resolve(execDir, "..", ".."),
  ]) {
    candidates.push(resolve(base, "runtime", "include"));
    candidates.push(resolve(base, "src", "runtime", "include"));
  }

  // CWD
  candidates.push(resolve(process.cwd(), "src", "runtime", "include"));

  // Check auto-discovery candidates
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "iec_types.hpp"))) {
      return candidate;
    }
  }

  // Fallback: check user-provided -I paths from --cxx-flags
  for (const ipath of extractIncludePaths(cxxFlags)) {
    const resolved = resolve(ipath);
    if (existsSync(resolve(resolved, "iec_types.hpp"))) {
      return resolved;
    }
  }

  return null;
}

/**
 * Locate the bundled libs directory containing .stlib files.
 * Similar to how gcc auto-discovers system libraries from known paths.
 * Returns the resolved path or null if not found.
 */
export function findBundledLibsDir(): string | null {
  const candidates: string[] = [];

  // From import.meta.url (ESM dev mode)
  try {
    if (typeof import.meta?.url === "string") {
      const scriptDir = dirname(new URL(import.meta.url).pathname);
      // src/build-utils.ts → ../libs/  or  dist/build-utils.js → ../libs/
      candidates.push(resolve(scriptDir, "..", "libs"));
      // dist/build-utils.js → ../../libs/
      candidates.push(resolve(scriptDir, "..", "..", "libs"));
    }
  } catch {
    // unavailable in CJS bundle / pkg binary
  }

  // From __dirname (CJS bundle via esbuild)
  if (typeof __dirname === "string") {
    candidates.push(resolve(__dirname, "..", "libs"));
    candidates.push(resolve(__dirname, "..", "..", "libs"));
    candidates.push(resolve(__dirname, "libs"));
  }

  // Relative to binary (pkg binary may be in dist/bin/, dist/, or project root)
  const execDir = dirname(process.execPath);
  for (const base of [
    execDir,
    resolve(execDir, ".."),
    resolve(execDir, "..", ".."),
  ]) {
    candidates.push(resolve(base, "libs"));
  }

  // CWD fallback
  candidates.push(resolve(process.cwd(), "libs"));

  // Deduplicate and return first existing directory
  const seen = new Set<string>();
  for (const dir of candidates) {
    const resolved = resolve(dir);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    try {
      if (existsSync(resolved) && statSync(resolved).isDirectory()) {
        return resolved;
      }
    } catch {
      // skip unreadable paths
    }
  }

  return null;
}
