#!/usr/bin/env node
/**
 * Emit `libs/iec-types.json` — the canonical IEC base-type registry
 * shipped to downstream consumers (OpenPLC Editor, future xml2st
 * replacement, third-party tooling).
 *
 * The data is hand-authored in `src/semantic/iec-types-data.ts`; this
 * script transcodes it to JSON and writes it next to the .stlib
 * archives. Both source and artifact are committed — strucpp's own
 * code reads the TS module directly (typed, fast) and external
 * consumers read the JSON via `node_modules/strucpp/libs/iec-types.json`.
 *
 * A `schemaVersion` field guards against silent shape drift: bump it
 * here whenever IECTypeMetadata gains/loses/renames a field, and any
 * out-of-date editor will fail loudly on first read instead of
 * silently mis-parsing.
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

/**
 * Bump on any breaking change to the per-type metadata shape (renamed
 * fields, dropped fields, changed field semantics). Additive
 * changes — new optional fields, new wireFormat values — do not need
 * a bump as long as old consumers still parse the JSON correctly.
 */
const SCHEMA_VERSION = 1;

export async function buildIecTypesJson() {
  // Load from the freshly-compiled dist/ — `rebuild-libs.mjs` does a
  // `tsc` pass before importing, so by the time this runs the dist
  // mirror of `iec-types-data.ts` is current.
  const data = await import(
    resolve(projectRoot, "dist/semantic/iec-types-data.js")
  );

  const out = {
    $schema:
      "https://github.com/Autonomy-Logic/strucpp/blob/main/docs/iec-types.schema.json",
    schemaVersion: SCHEMA_VERSION,
    description:
      "Canonical IEC 61131-3 elementary type registry emitted by " +
      "strucpp. Source of truth — downstream tools (OpenPLC Editor, " +
      "xml2st replacement, third-party generators) should read from " +
      "here rather than maintaining their own type tables.",
    elementaryTypes: data.IEC_BASE_TYPES,
  };

  const target = resolve(projectRoot, "libs/iec-types.json");
  writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(
    `[build-iec-types-json] Wrote ${out.elementaryTypes.length} elementary types to ${target}`,
  );
  return target;
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isDirectRun) {
  buildIecTypesJson().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
