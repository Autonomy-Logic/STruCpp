#!/usr/bin/env node
// merge-vendored.mjs — add the hand-maintained vendored components to a CycloneDX BOM.
//   node scripts/merge-vendored.mjs <cdx.json> [components.json] [repoRoot]
// Rewrites <cdx.json> in place. Fails if an entry is malformed or a listed path is missing.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { refOf } from './lib/cdx.mjs';

const [src, listArg = 'security/components.json', rootArg = '.'] = process.argv.slice(2);
if (!src) { console.error('usage: merge-vendored.mjs <cdx.json> [components.json] [repoRoot]'); process.exit(1); }

const fail = (msg) => { console.error(`::error::merge-vendored: ${msg}`); process.exit(1); };
const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { return fail(`cannot read/parse "${p}" (${e.code || e.message})`); }
};

const bom = readJson(src);
const list = readJson(listArg);
if (!Array.isArray(list.components)) fail(`"${listArg}" has no "components" array`);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
const added = [];
for (const [i, v] of list.components.entries()) {
  const where = `${listArg} components[${i}]`;
  if (typeof v.name !== 'string' || !v.name.trim()) fail(`${where}: missing name`);
  if (typeof v.license !== 'string' || !v.license.trim()) fail(`${where} (${v.name}): missing license (use NOASSERTION if unknown)`);
  if (!Array.isArray(v.paths) || v.paths.length === 0) fail(`${where} (${v.name}): missing paths`);
  for (const p of v.paths) {
    if (!existsSync(resolve(rootArg, p))) fail(`${where} (${v.name}): path not found: ${p}`);
  }
  const version = typeof v.version === 'string' ? v.version.trim() : '';
  const c = {
    'bom-ref': `vendored:${slug(v.name)}${version ? `@${version}` : ''}`,
    type: v.type || 'library',
    name: v.name,
    ...(version ? { version } : {}),
    ...(v.supplier ? { publisher: v.supplier, supplier: { name: v.supplier } } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.license === 'NOASSERTION' ? {} : { licenses: [{ license: { id: v.license } }] }),
    ...(v.url ? { externalReferences: [{ type: 'vcs', url: v.url }] } : {}),
    properties: [
      { name: 'strucpp:source', value: 'vendored' },
      ...v.paths.map((p) => ({ name: 'strucpp:path', value: p })),
    ],
  };
  added.push(c);
}

const existing = new Set((bom.components || []).map(refOf));
bom.components = bom.components || [];
let n = 0;
for (const c of added) {
  if (existing.has(refOf(c))) continue;
  bom.components.push(c);
  existing.add(refOf(c));
  n++;
}

// Attach the vendored components to the root in the dependency graph.
const rootRef = bom.metadata?.component?.['bom-ref'];
if (rootRef && Array.isArray(bom.dependencies)) {
  let root = bom.dependencies.find((d) => d.ref === rootRef);
  if (!root) { root = { ref: rootRef, dependsOn: [] }; bom.dependencies.push(root); }
  root.dependsOn = [...new Set([...(root.dependsOn || []), ...added.map((c) => c['bom-ref'])])];
  for (const c of added) {
    if (!bom.dependencies.some((d) => d.ref === c['bom-ref'])) bom.dependencies.push({ ref: c['bom-ref'], dependsOn: [] });
  }
}

writeFileSync(src, JSON.stringify(bom, null, 2) + '\n');
console.log(`Merged ${n} vendored component(s) from ${listArg} into ${src}.`);
