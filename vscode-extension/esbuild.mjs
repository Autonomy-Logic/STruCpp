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

// Server bundle
await esbuild.build({
  ...sharedOptions,
  entryPoints: ["./out/server/src/server.js"],
  outfile: "./out/server.js",
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
