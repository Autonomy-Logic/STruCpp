// @ts-check
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const production = process.argv.includes("--production");

/** @type {esbuild.BuildOptions} */
const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "ES2022",
  format: "cjs",
  sourcemap: !production,
  minify: production,
};

// Client bundle
await esbuild.build({
  ...sharedOptions,
  entryPoints: ["./out/client/src/extension.js"],
  outfile: "./out/client.js",
  external: ["vscode"],
});

// Server bundle (Node-hosted — used by the VS Code extension)
await esbuild.build({
  ...sharedOptions,
  entryPoints: ["./out/server/src/server.js"],
  outfile: "./out/server.js",
});

// Browser server bundle (Web Worker — used by Monaco-based editors
// like openplc-editor and openplc-web).  Build-style commands and
// fs-touching code paths are absent from server-browser.ts, but
// strucpp's library-loader and a few sibling modules still
// statically import Node built-ins.  Those modules ARE pulled into
// the bundle for transitive reasons (the type-check + tree-shaker
// can't always prove a re-export branch is unreachable); we alias
// the Node built-ins to an inert stub so the bundle compiles.
// Runtime calls into those APIs are impossible from the browser
// server's code path — the entry point only invokes strucpp's
// pure exports.  Any attempted invocation throws a clear error.
const browserNodeStub = path.resolve(
  __dirname,
  "server",
  "browser-stubs",
  "node-empty.js",
);
// `path` is special: DocumentManager actually invokes
// `path.basename` / `path.dirname` / `path.join` at runtime to
// derive friendly file names from in-memory LSP URIs.  Those are
// pure string operations, so we provide a real implementation
// instead of routing them through the throw-stub.
const browserPathShim = path.resolve(
  __dirname,
  "server",
  "browser-stubs",
  "path-shim.js",
);
// The codesys-import path (transitively pulled in via the strucpp
// top-level `index.js`) seeds magic-byte patterns with module-level
// `Buffer.from(...)` calls.  Browsers / Web Workers don't expose
// `Buffer` as a global — without this banner the worker crashes
// with `ReferenceError: Buffer is not defined` the moment the
// IIFE evaluates.  The shim provides just enough Buffer surface to
// let constants initialise; if anything actually invokes a codesys
// parser at runtime (it shouldn't — server-browser.ts only uses
// analyze + loadStlib{FromString,FromBuffer}), the call will fail
// loudly at the use site, which is the right failure mode.
const bufferBannerJs = fs.readFileSync(
  path.resolve(__dirname, "server", "browser-stubs", "buffer-banner.js"),
  "utf-8",
);
await esbuild.build({
  bundle: true,
  platform: "browser",
  target: "ES2022",
  format: "iife",
  sourcemap: !production,
  minify: production,
  entryPoints: ["./out/server/src/server-browser.js"],
  outfile: "./out/server.browser.js",
  banner: { js: bufferBannerJs },
  alias: {
    fs: browserNodeStub,
    "node:fs": browserNodeStub,
    path: browserPathShim,
    "node:path": browserPathShim,
    os: browserNodeStub,
    "node:os": browserNodeStub,
    child_process: browserNodeStub,
    "node:child_process": browserNodeStub,
    url: browserNodeStub,
    "node:url": browserNodeStub,
    util: browserNodeStub,
    "node:util": browserNodeStub,
    zlib: browserNodeStub,
    "node:zlib": browserNodeStub,
    stream: browserNodeStub,
    "node:stream": browserNodeStub,
    crypto: browserNodeStub,
    "node:crypto": browserNodeStub,
    buffer: browserNodeStub,
    "node:buffer": browserNodeStub,
  },
});

// Copy runtime files for .vsix packaging.
const copies = [
  { src: path.resolve(__dirname, "..", "src", "runtime", "include"), dest: path.resolve(__dirname, "runtime", "include") },
  { src: path.resolve(__dirname, "..", "src", "runtime", "repl"),    dest: path.resolve(__dirname, "runtime", "repl") },
  { src: path.resolve(__dirname, "..", "src", "runtime", "test"),    dest: path.resolve(__dirname, "runtime", "test") },
];

for (const { src, dest } of copies) {
  try {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`Copied ${path.relative(__dirname, src)} → ${path.relative(__dirname, dest)}`);
  } catch {
    console.warn(`Skipped copying ${path.relative(__dirname, src)} (not found)`);
  }
}

// Sync the compiled library archives into bundled-libs/. We copy ONLY
// the .stlib build artefacts — not the libs/ directory recursively — so
// libs/sources/ (the canonical .st + library.json source-of-truth on
// disk) doesn't end up bloating every .vsix. The .stlib archives must
// already exist; running `npm run build` from the repo root regenerates
// them via scripts/rebuild-libs.mjs.
const libsDir = path.resolve(__dirname, "..", "libs");
const bundledLibsDir = path.resolve(__dirname, "bundled-libs");
fs.mkdirSync(bundledLibsDir, { recursive: true });
let stlibCount = 0;
try {
  for (const entry of fs.readdirSync(libsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".stlib")) continue;
    fs.copyFileSync(
      path.join(libsDir, entry.name),
      path.join(bundledLibsDir, entry.name),
    );
    stlibCount++;
  }
} catch (err) {
  console.warn(`Skipped copying .stlib files: ${err instanceof Error ? err.message : String(err)}`);
}
if (stlibCount === 0) {
  console.warn(
    "No .stlib archives found in libs/ — run `npm run build` from the " +
      "repo root before bundling the extension. The .vsix will ship " +
      "without bundled libraries.",
  );
} else {
  console.log(`Copied ${stlibCount} .stlib archive(s) → bundled-libs/`);
}

console.log("Bundled client and server.");
