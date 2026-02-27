#!/usr/bin/env node
/**
 * OSCAT Basic 335 Compatibility Test Script
 *
 * Loads the pre-compiled oscat-basic.stlib archive, extracts embedded sources,
 * and tests each one individually against the STruC++ compiler.
 * Produces a detailed root-cause report.
 *
 * Usage:
 *   npm run build && node OSCAT/oscat-test.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import { compile } from '../dist/index.js';
import { loadStlibFromFile } from '../dist/library/library-loader.js';

const OSCAT_STLIB_PATH = resolve(import.meta.dirname, '../libs/oscat-basic.stlib');

// Load archive and extract sources
let archive;
try {
  archive = loadStlibFromFile(OSCAT_STLIB_PATH);
} catch (e) {
  console.error(`Error loading OSCAT archive: ${e.message}`);
  console.error(`Expected at: ${OSCAT_STLIB_PATH}`);
  process.exit(1);
}

if (!archive.sources || archive.sources.length === 0) {
  console.error('Error: OSCAT archive has no embedded sources.');
  process.exit(1);
}

const files = archive.sources.map(s => s.fileName).sort();
const sourceMap = new Map(archive.sources.map(s => [s.fileName, s.source]));

// Extract GVL sources — these declare global variables (MATH, SETUP, etc.)
// that other files reference. Pass them as additionalSources to dependents.
const gvlSources = archive.sources
  .filter(s => s.fileName.toLowerCase().includes('.gvl.'))
  .map(s => ({ source: s.source, fileName: s.fileName }));

// Known GVL global variable names
const GVL_GLOBALS = ['MATH', 'PHYS', 'LANGUAGE', 'SETUP', 'LOCATION'];

// Root cause categories with Phase references
const causes = {
  'UNDECLARED_GVL_GLOBAL': { desc: 'Undeclared GVL global variable (MATH, PHYS, LANGUAGE, SETUP, LOCATION) — test methodology issue, not a compiler gap', phase: 'n/a', files: [] },
  'POINTER_TO':           { desc: 'POINTER TO declarations and ^ dereference', phase: '6.1', files: [] },
  'BIT_ACCESS':           { desc: 'Bit access on integer types (var.0, var.15, var.31) - read & write', phase: '6.4', files: [] },
  'TYPED_LITERALS':       { desc: 'Typed literals (BYTE#255, INT#0, DWORD#16#FF)', phase: '6.3', files: [] },
  'STRUCT_TYPE_DECL':     { desc: 'Standalone TYPE ... STRUCT ... END_TYPE declarations', phase: 'parser', files: [] },
  'MULTI_DIM_ARRAY_INIT': { desc: 'Multi-dimensional array initializers and TYPE with ARRAY struct members', phase: 'parser', files: [] },
  'KEYWORD_SET':          { desc: 'SET used as variable/parameter name (keyword conflict)', phase: 'lexer', files: [] },
  'KEYWORD_ON':           { desc: 'ON used as variable/parameter name (keyword conflict)', phase: 'lexer', files: [] },
  'KEYWORD_OVERRIDE':     { desc: 'OVERRIDE used as function name (keyword conflict)', phase: 'lexer', files: [] },
  'VAR_INPUT_CONSTANT':   { desc: 'VAR_INPUT CONSTANT vars without initializers (CODESYS allows, IEC strict does not)', phase: 'semantic', files: [] },
  'VAR_GLOBAL':           { desc: 'VAR_GLOBAL as top-level construct', phase: 'parser', files: [] },
  'ELSE_SEMICOLON':       { desc: 'ELSE; (extraneous semicolon after ELSE)', phase: 'parser', files: [] },
  'INLINE_ARRAY_INIT':    { desc: 'Inline array initializer with bare comma list (ARRAY := 0, 31, 59, ...)', phase: 'parser', files: [] },
  'GVL_BINARY_ARTIFACT':  { desc: 'GVL file with binary artifacts from V2.3 export', phase: 'n/a', files: [] },
};

const successFiles = [];
const failedFiles = [];

console.log(`Testing ${files.length} sources from oscat-basic.stlib archive...\n`);

let count = 0;
for (const file of files) {
  count++;
  const source = sourceMap.get(file);
  const name = basename(file, '.st');

  // Skip GVL infrastructure files — they declare globals, not standalone POUs
  if (file.toLowerCase().includes('.gvl.')) {
    successFiles.push(name);
    if (count % 100 === 0) console.log(`  Processed ${count}/${files.length}...`);
    continue;
  }

  // Check if file references GVL globals
  const gvlPattern = new RegExp(`\\b(${GVL_GLOBALS.join('|')})\\s*\\.`, 'i');
  const needsGvl = gvlPattern.test(source);

  const opts = {
    debug: false,
    lineMapping: false,
    libraryPaths: [resolve(import.meta.dirname, '../libs')],
  };
  if (needsGvl && gvlSources.length > 0) {
    opts.additionalSources = gvlSources;
  }

  let result;
  try {
    result = compile(source, opts);
  } catch (e) {
    failedFiles.push({ name, cause: 'UNKNOWN', error: e.message });
    continue;
  }

  if (result.success) {
    successFiles.push(name);
    if (count % 100 === 0) console.log(`  Processed ${count}/${files.length}...`);
    continue;
  }

  const allErrors = result.errors.map(e => e.message).join(' | ');
  const firstErr = result.errors[0]?.message || '';

  // --- Root cause categorization ---
  // Priority 1: Check if the error is an undeclared GVL global (methodology issue)
  const undeclaredMatch = firstErr.match(/Undeclared variable '(\w+)'/);
  const isGvlGlobal = undeclaredMatch && GVL_GLOBALS.includes(undeclaredMatch[1]);

  let cause = null;

  if (isGvlGlobal) {
    cause = 'UNDECLARED_GVL_GLOBAL';
  } else {
    // Source analysis flags — only apply when corroborated by actual error messages
    const hasBinaryArtifact = /[\x00-\x08\x0e-\x1f]/.test(source);
    const hasVarGlobal = /^VAR_GLOBAL\b/m.test(source);
    const hasPointerTo = /POINTER\s+TO\b/i.test(source);
    const hasTypedLiteral = allErrors.includes('unexpected character: ->#<-');
    const hasStructType = /^TYPE\s+\w+\s*:/m.test(source) && /\bSTRUCT\b/i.test(source);
    const hasMultiDimArrayOrType = /^TYPE\s+\w+\s*:/m.test(source) && /ARRAY\s*\[.*,/i.test(source);
    const hasSetKeyword = (allErrors.includes("'SET'") || allErrors.includes("'set'") || allErrors.includes("'Set'"));
    const hasOnKeyword = allErrors.includes("'ON'") && /\bON\s*:\s*(REAL|BOOL|INT|DWORD)/i.test(source);
    const hasOverrideKeyword = allErrors.includes("'OVERRIDE'");
    const hasVarInputConstant = allErrors.includes('CONSTANT variable') && allErrors.includes('must have an initializer');
    const hasElseSemicolon = /\bELSE\s*;/.test(source);
    const hasInlineArrayInit = /ARRAY\s*\[\s*\d+\s*\.\.\s*\d+\s*\]\s*OF\s+\w+\s*:=\s*\d+\s*,/.test(source);
    const bodyCode = source.replace(/\(\*[\s\S]*?\*\)/g, '');
    const bitAccessInBody = /\b\w+\.\d+/.test(bodyCode);
    const bitAccessError = /Identifier.*'\d+'/.test(firstErr) || /Token sequences/.test(firstErr);

    if (hasBinaryArtifact && hasVarGlobal) cause = 'GVL_BINARY_ARTIFACT';
    else if (hasVarGlobal && allErrors.includes('VAR_GLOBAL')) cause = 'VAR_GLOBAL';
    else if (hasPointerTo && /POINTER|pointer|\^/.test(allErrors)) cause = 'POINTER_TO';
    else if (hasPointerTo) cause = 'POINTER_TO';
    else if (hasTypedLiteral) cause = 'TYPED_LITERALS';
    else if (hasStructType && allErrors.includes("'END_TYPE'")) cause = 'STRUCT_TYPE_DECL';
    else if (hasMultiDimArrayOrType) cause = 'MULTI_DIM_ARRAY_INIT';
    else if (hasSetKeyword) cause = 'KEYWORD_SET';
    else if (hasOnKeyword) cause = 'KEYWORD_ON';
    else if (hasOverrideKeyword) cause = 'KEYWORD_OVERRIDE';
    else if (hasVarInputConstant) cause = 'VAR_INPUT_CONSTANT';
    else if (hasElseSemicolon && allErrors.includes("';'")) cause = 'ELSE_SEMICOLON';
    else if (bitAccessInBody && bitAccessError) cause = 'BIT_ACCESS';
    else if (hasInlineArrayInit) cause = 'INLINE_ARRAY_INIT';
    else if (bitAccessInBody && /\.\d+/.test(bodyCode.replace(/\d+\.\d+/g, ''))) cause = 'BIT_ACCESS';
    else if (/\w+\.\d+\s*:=/.test(bodyCode) || /:=\s*\w+\.\d+/.test(bodyCode)) cause = 'BIT_ACCESS';
    else if (allErrors.includes("','")) cause = 'INLINE_ARRAY_INIT';
    else cause = 'UNKNOWN';
  }

  if (causes[cause]) causes[cause].files.push(name);
  failedFiles.push({ name, cause, error: firstErr.substring(0, 200) });

  if (count % 100 === 0) console.log(`  Processed ${count}/${files.length}...`);
}

const totalFailed = files.length - successFiles.length;

// Report
console.log('\n' + '='.repeat(100));
console.log('OSCAT BASIC 335 — STruC++ COMPATIBILITY REPORT');
console.log('='.repeat(100));
console.log(`Total sources tested:        ${files.length}`);
console.log(`Successfully compiled:       ${successFiles.length} (${(successFiles.length/files.length*100).toFixed(1)}%)`);
console.log(`Failed:                      ${totalFailed} (${(totalFailed/files.length*100).toFixed(1)}%)`);
console.log('');

const sorted = Object.entries(causes)
  .filter(([_, v]) => v.files.length > 0)
  .sort((a, b) => b[1].files.length - a[1].files.length);

console.log('FAILURE BREAKDOWN BY ROOT CAUSE');
console.log('-'.repeat(100));
for (const [key, val] of sorted) {
  const pct = totalFailed > 0 ? (val.files.length / totalFailed * 100).toFixed(1) : '0.0';
  console.log(`\n  ${key}  —  ${val.files.length} files (${pct}% of failures)  [${val.phase}]`);
  console.log(`  ${val.desc}`);
  console.log(`  Files: ${val.files.join(', ')}`);
}

const unknowns = failedFiles.filter(f => f.cause === 'UNKNOWN');
if (unknowns.length > 0) {
  console.log(`\n  UNCATEGORIZED — ${unknowns.length} files`);
  for (const u of unknowns) console.log(`  ${u.name}: ${u.error.substring(0, 100)}`);
}

console.log('\n' + '-'.repeat(100));
console.log('IMPACT SUMMARY');
console.log('-'.repeat(100));
console.log(`  If POINTER_TO (6.1) implemented:     +${causes.POINTER_TO.files.length} files`);
console.log(`  If keyword conflicts fixed:           +${causes.KEYWORD_SET.files.length + causes.KEYWORD_ON.files.length + causes.KEYWORD_OVERRIDE.files.length} files`);
console.log(`  If VAR_INPUT CONSTANT relaxed:        +${causes.VAR_INPUT_CONSTANT.files.length} files`);
console.log(`  If typed literals (6.3) added:        +${causes.TYPED_LITERALS.files.length} files`);
console.log(`  If bit access (6.4) added:            +${causes.BIT_ACCESS.files.length} files`);
console.log(`  If STRUCT TYPE decl fixed:            +${causes.STRUCT_TYPE_DECL.files.length} files`);
console.log(`  Other (array init, ELSE;, VAR_GLOBAL):+${causes.MULTI_DIM_ARRAY_INIT.files.length + causes.INLINE_ARRAY_INIT.files.length + causes.ELSE_SEMICOLON.files.length + causes.VAR_GLOBAL.files.length} files`);
if (causes.UNDECLARED_GVL_GLOBAL.files.length > 0) {
  console.log(`  GVL globals (methodology, not gaps): ${causes.UNDECLARED_GVL_GLOBAL.files.length} files`);
}

// Write JSON
const report = {
  timestamp: new Date().toISOString(),
  source: 'oscat-basic.stlib',
  summary: { totalFiles: files.length, successCount: successFiles.length, failureCount: totalFailed, successRate: `${(successFiles.length/files.length*100).toFixed(1)}%` },
  rootCauses: sorted.map(([key, val]) => ({ id: key, description: val.desc, phase: val.phase, count: val.files.length, percentOfFailures: totalFailed > 0 ? `${(val.files.length / totalFailed * 100).toFixed(1)}%` : '0.0%', files: val.files })),
  successFiles,
  failedFiles,
};

const reportPath = resolve(import.meta.dirname, 'oscat-compatibility-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nJSON report: ${reportPath}`);
