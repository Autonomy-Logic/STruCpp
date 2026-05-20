// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Browser-purity smoke test for the `strucpp` entry point.
 *
 * Spawns a fresh Node sub-process with `globalThis.Buffer` and
 * `globalThis.process` deleted before any strucpp code loads.  If
 * a future change reintroduces a Buffer literal at module-load
 * time or an unguarded `process.X` access in `strucpp`'s exported
 * surface, this test fails immediately — long before the bug
 * reaches a real browser.
 *
 * The static `check:purity` script catches `from "fs"`-style
 * violations at lint time.  Together they pin the boundary on
 * both sides.
 *
 * Sub-process isolation is required because deleting Buffer in
 * the vitest worker also strips it from vitest's own machinery
 * (error formatting, snapshot capture, …) — we can't safely run
 * the check inline.
 */
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SCRIPT = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "browser-smoke-runner.mjs",
)

function runBrowserSmoke(): {
  stdout: string
  stderr: string
  status: number | null
} {
  const result = spawnSync("node", [SCRIPT], {
    encoding: "utf-8",
    cwd: resolve(fileURLToPath(import.meta.url), "..", ".."),
  })
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  }
}

describe("strucpp browser-runnable surface", () => {
  it("imports + compiles + decompresses with Buffer / process stripped", () => {
    const { stdout, stderr, status } = runBrowserSmoke()
    // The runner prints "OK" on success.  Any other output (or a
    // non-zero exit code) means a Node-only API leaked into the
    // pure surface.  Surface the sub-process's full output for
    // fast diagnostics — the failing line in the strucpp source
    // is usually on top.
    expect({
      status,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    }).toEqual({
      status: 0,
      stdout: "OK",
      stderr: "",
    })
  })
})
