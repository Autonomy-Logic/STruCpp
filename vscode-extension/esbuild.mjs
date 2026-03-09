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

// Copy runtime files and bundled libraries for .vsix packaging
const copies = [
  { src: path.resolve(__dirname, "..", "src", "runtime", "include"), dest: path.resolve(__dirname, "runtime", "include") },
  { src: path.resolve(__dirname, "..", "src", "runtime", "repl"), dest: path.resolve(__dirname, "runtime", "repl") },
  { src: path.resolve(__dirname, "..", "libs"), dest: path.resolve(__dirname, "bundled-libs") },
];

for (const { src, dest } of copies) {
  try {
    fs.cpSync(src, dest, { recursive: true });
    console.log(`Copied ${path.relative(__dirname, src)} → ${path.relative(__dirname, dest)}`);
  } catch {
    console.warn(`Skipped copying ${path.relative(__dirname, src)} (not found)`);
  }
}

console.log("Bundled client and server.");
