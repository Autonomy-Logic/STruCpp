// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
//
// Sub-process runner for the browser-purity smoke test.
//
// Strips `globalThis.Buffer` and `globalThis.process` (the two
// Node globals a Web Worker / browser lack), then imports the
// `strucpp` pure entry point and exercises the public surface
// the LSP worker depends on.  Prints "OK" on success.
//
// Run by `tests/browser-smoke.test.ts` via `spawnSync`.  Kept as
// a `.mjs` script so vitest doesn't try to transform it and so
// the sub-process inherits a clean Node environment.

const distUrl = new URL("../dist/index.js", import.meta.url).href

// Strip the Node `Buffer` global — the only one that's
// conventionally available at module load and that an
// unsuspecting parser might reach for without typeof-guarding.
// `process` stays intact because the `check:purity` script
// catches any new `process.X` access at lint time, and Node
// itself needs `process.exit` to communicate the test result
// back to the parent harness.
delete globalThis.Buffer

const strucpp = await import(distUrl)

// 1. Compile a trivial ST program — exercises parser + analyzer +
//    codegen.  This is the largest pure code path the LSP worker
//    ever runs.
const compileResult = strucpp.compile(
  "PROGRAM Main\n" +
    "  VAR x : INT := 0; END_VAR\n" +
    "  x := x + 1;\n" +
    "END_PROGRAM\n",
  { fileName: "main.st" },
)
if (!compileResult.success) {
  console.error("compile failed:", JSON.stringify(compileResult.errors))
  process.exit(1)
}
if (compileResult.cppCode.length === 0) {
  console.error("compile produced empty cppCode")
  process.exit(1)
}

// 2. Parse an stlib archive from string — exercises
//    loadStlibFromString (used by the LSP worker for every
//    archive pushed via the loadStlibBuffer RPC).
const archive = strucpp.loadStlibFromString(
  JSON.stringify({
    formatVersion: 1,
    manifest: {
      name: "smoke",
      version: "0.0.1",
      namespace: "smoke",
      functions: [],
      functionBlocks: [],
      types: [],
      headers: [],
      isBuiltin: false,
    },
    chunks: [],
    dependencies: [],
  }),
)
if (archive.manifest.name !== "smoke") {
  console.error("loadStlibFromString returned wrong archive")
  process.exit(1)
}

// 3. Run the CODESYS V3 inflate path — exercises
//    `DecompressionStream("deflate-raw")`.  We don't need a real
//    library archive; a minimal ZIP local-file-header magic is
//    enough to reach the bytes-first code path and confirm it
//    doesn't crash without `zlib`.
const fakeZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
if (strucpp.detectFormat(fakeZip) !== "v3") {
  console.error("detectFormat broke for ZIP magic")
  process.exit(1)
}
await strucpp.importCodesysLibraryFromBytes(fakeZip)

console.log("OK")
