// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
//
// Buffer shim prepended to the browser-server bundle.
//
// strucpp's codesys-import path uses `Buffer.from(...)` at module
// load time to seed magic-byte patterns.  Node provides `Buffer` as
// a global; browsers and Web Workers don't.  Without this shim, the
// worker crashes with `ReferenceError: Buffer is not defined` the
// instant the bundle's outermost IIFE runs — even though the LSP
// server never actually CALLS any codesys-import function.
//
// The shim is intentionally minimal: just enough to let
// `Buffer.from(string, "ascii")` and `Buffer.from(arrayLike)`
// return *something* (a Uint8Array) so module-level constants
// initialise.  If any code path actually invokes a codesys parser
// in the browser server (it shouldn't — server-browser.ts only
// imports analyze + loadStlib{FromString,FromBuffer}), the
// resulting "buffer" lacks Buffer's full API and will fail loudly
// at the actual use site, which is the right failure mode.
if (typeof globalThis.Buffer === "undefined") {
  class BufferShim extends Uint8Array {
    static from(input, encoding) {
      if (typeof input === "string") {
        return new TextEncoder().encode(input);
      }
      if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
      }
      if (ArrayBuffer.isView(input)) {
        return new Uint8Array(
          input.buffer,
          input.byteOffset,
          input.byteLength,
        );
      }
      return Uint8Array.from(input);
    }
    static isBuffer() {
      return false;
    }
    static alloc(size) {
      return new Uint8Array(size);
    }
    static concat(list) {
      let total = 0;
      for (const part of list) total += part.length;
      const out = new Uint8Array(total);
      let offset = 0;
      for (const part of list) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    }
  }
  globalThis.Buffer = BufferShim;
}
