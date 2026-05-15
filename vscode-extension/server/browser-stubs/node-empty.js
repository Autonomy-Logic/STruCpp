// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
//
// Empty stub used to satisfy `import` statements for Node built-in
// modules (fs, path, os, child_process, url, util, zlib, …) when
// esbuild bundles the browser language server.
//
// The browser entry (`server-browser.ts`) only calls strucpp's
// *pure* exports (analyze, loadStlibFromBuffer, etc.).  Other
// strucpp modules that statically `import { readFileSync } from "fs"`
// still load — esbuild swaps the import target for this stub —
// but the fs/path/os/etc. symbols are never invoked at runtime, so
// the stub's emptiness is fine.  Any accidental invocation throws
// a clear error pinpointing the bad path.
//
// The named-export list below has to enumerate every symbol any
// transitively-bundled strucpp module imports from a Node built-in,
// because esbuild matches named imports against named exports at
// bundle time (not at runtime).  Keep this list narrow — only add
// a symbol if a real strucpp source file imports it.  Throwing a
// loud error from each exported function makes "this should be
// unreachable" failures very obvious.

function throwOnCall(symbolName) {
  return function nodeApiStub() {
    throw new Error(
      `[strucpp browser server] Attempted to call Node.js API "${symbolName}" ` +
        "in a browser context — this code path should be unreachable. " +
        "If you're seeing this, the LSP server tried to use a build / " +
        "test / REPL feature that is intentionally absent from the " +
        "browser build.",
    );
  };
}

// fs
export const readFileSync = throwOnCall("readFileSync");
export const readdirSync = throwOnCall("readdirSync");
export const existsSync = throwOnCall("existsSync");
export const statSync = throwOnCall("statSync");

// path
export const resolve = throwOnCall("resolve");
export const join = throwOnCall("join");
export const dirname = throwOnCall("dirname");

// os
export const platform = throwOnCall("platform");

// child_process
export const execFileSync = throwOnCall("execFileSync");

// zlib
export const inflateRawSync = throwOnCall("inflateRawSync");

// Catch-all default export for `import fs from "fs"` style usages.
const defaultExport = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "__esModule") return true;
      return throwOnCall(String(prop));
    },
  },
);
export default defaultExport;
