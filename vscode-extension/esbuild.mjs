// @ts-check
import * as esbuild from "esbuild";

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

console.log("Bundled client and server.");
