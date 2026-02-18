#!/usr/bin/env node
/**
 * OSCAT Basic 335 Compatibility Test Script
 *
 * Tests all OSCAT basic 335 .st files against the STruC++ compiler
 * and produces a detailed root-cause report.
 *
 * Usage:
 *   npm run build && node OSCAT/oscat-test.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, basename, resolve } from 'path';
import { compile } from '../dist/index.js';

const OSCAT_DIR = resolve(import.meta.dirname, '../tests/st-validation/oscat/lib');
const files = readdirSync(OSCAT_DIR).filter(f => f.endsWith('.st')).sort();

// Root cause categories with Phase references
const causes = {
  'POINTER_TO':           { desc: 'POINTER TO declarations and ^ dereference', phase: '6.1', files: [] },
  'BIT_ACCESS':           { desc: 'Bit access on integer types (var.0, var.15, var.31) - read & write', phase: '6.4', files: [] },
  'TYPED_LITERALS':       { desc: 'Typed literals (BYTE#255, INT#0, DWORD#16#FF)', phase: '6.3', files: [] },
  'STRING_CONST_SIZE':    { desc: 'STRING(constant_name) where size is a named constant not a literal', phase: 'parser', files: [] },
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

console.log(`Testing ${files.length} .st files from OSCAT basic 335 library...\n`);

let count = 0;
for (const file of files) {
  count++;
  const filePath = join(OSCAT_DIR, file);
  const source = readFileSync(filePath, 'utf-8');
  const name = basename(file, '.st');

  let result;
  try {
    result = compile(source, { debug: false, lineMapping: false, noStdFBLibrary: false });
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

  // Source analysis flags
  const hasPointerTo = /POINTER\s+TO\b/i.test(source);
  const hasTypedLiteral = allErrors.includes('unexpected character: ->#<-');
  const hasStringConstSize = /STRING\s*\(\s*[A-Z_][A-Z_0-9]*\s*\)/i.test(source) && !hasPointerTo;
  const hasStructType = /^TYPE\s+\w+\s*:/m.test(source) && /\bSTRUCT\b/i.test(source);
  const hasMultiDimArrayOrType = /^TYPE\s+\w+\s*:/m.test(source) && /ARRAY\s*\[.*,/i.test(source);
  const hasSetKeyword = (allErrors.includes("'SET'") || allErrors.includes("'set'") || allErrors.includes("'Set'"));
  const hasOnKeyword = allErrors.includes("'ON'") && /\bON\s*:\s*(REAL|BOOL|INT|DWORD)/i.test(source);
  const hasOverrideKeyword = allErrors.includes("'OVERRIDE'");
  const hasVarInputConstant = allErrors.includes('CONSTANT variable') && allErrors.includes('must have an initializer');
  const hasVarGlobal = /^VAR_GLOBAL\b/m.test(source);
  const hasElseSemicolon = /\bELSE\s*;/.test(source);
  const hasInlineArrayInit = /ARRAY\s*\[\s*\d+\s*\.\.\s*\d+\s*\]\s*OF\s+\w+\s*:=\s*\d+\s*,/.test(source);
  const hasBinaryArtifact = /[\x00-\x08\x0e-\x1f]/.test(source);
  const bodyCode = source.replace(/\(\*[\s\S]*?\*\)/g, '');
  const bitAccessInBody = /\b\w+\.\d+/.test(bodyCode);
  const bitAccessError = /Identifier.*'\d+'/.test(firstErr) || /Token sequences/.test(firstErr);

  let cause = null;

  if (hasBinaryArtifact && hasVarGlobal) cause = 'GVL_BINARY_ARTIFACT';
  else if (hasVarGlobal && allErrors.includes('VAR_GLOBAL')) cause = 'VAR_GLOBAL';
  else if (hasPointerTo) cause = 'POINTER_TO';
  else if (hasTypedLiteral) cause = 'TYPED_LITERALS';
  else if (hasStructType && allErrors.includes("'END_TYPE'")) cause = 'STRUCT_TYPE_DECL';
  else if (hasMultiDimArrayOrType) cause = 'MULTI_DIM_ARRAY_INIT';
  else if (hasSetKeyword) cause = 'KEYWORD_SET';
  else if (hasOnKeyword) cause = 'KEYWORD_ON';
  else if (hasOverrideKeyword) cause = 'KEYWORD_OVERRIDE';
  else if (hasVarInputConstant) cause = 'VAR_INPUT_CONSTANT';
  else if (hasElseSemicolon && allErrors.includes("';'")) cause = 'ELSE_SEMICOLON';
  else if (hasStringConstSize) cause = 'STRING_CONST_SIZE';
  else if (bitAccessInBody && bitAccessError) cause = 'BIT_ACCESS';
  else if (hasInlineArrayInit) cause = 'INLINE_ARRAY_INIT';
  else if (bitAccessInBody && /\.\d+/.test(bodyCode.replace(/\d+\.\d+/g, ''))) cause = 'BIT_ACCESS';
  else if (/STRING\s*\(\s*[A-Z_][A-Z_0-9]*\s*\)/i.test(source)) cause = 'STRING_CONST_SIZE';
  else if (/\w+\.\d+\s*:=/.test(bodyCode) || /:=\s*\w+\.\d+/.test(bodyCode)) cause = 'BIT_ACCESS';
  else if (/STRING\s*\(/i.test(source) && !/STRING\s*\(\s*\d+\s*\)/i.test(source) && allErrors.includes("'('")) cause = 'STRING_CONST_SIZE';
  else if (allErrors.includes("','")) cause = 'INLINE_ARRAY_INIT';
  else cause = 'UNKNOWN';

  if (causes[cause]) causes[cause].files.push(name);
  failedFiles.push({ name, cause, error: firstErr.substring(0, 200) });

  if (count % 100 === 0) console.log(`  Processed ${count}/${files.length}...`);
}

const totalFailed = files.length - successFiles.length;

// Report
console.log('\n' + '='.repeat(100));
console.log('OSCAT BASIC 335 — STruC++ COMPATIBILITY REPORT');
console.log('='.repeat(100));
console.log(`Total .st files tested:     ${files.length}`);
console.log(`Successfully compiled:       ${successFiles.length} (${(successFiles.length/files.length*100).toFixed(1)}%)`);
console.log(`Failed:                      ${totalFailed} (${(totalFailed/files.length*100).toFixed(1)}%)`);
console.log('');

const sorted = Object.entries(causes)
  .filter(([_, v]) => v.files.length > 0)
  .sort((a, b) => b[1].files.length - a[1].files.length);

console.log('FAILURE BREAKDOWN BY ROOT CAUSE');
console.log('-'.repeat(100));
for (const [key, val] of sorted) {
  const pct = (val.files.length / totalFailed * 100).toFixed(1);
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
console.log(`  If STRING(constant) supported:        +${causes.STRING_CONST_SIZE.files.length} files`);
console.log(`  If STRUCT TYPE decl fixed:            +${causes.STRUCT_TYPE_DECL.files.length} files`);
console.log(`  Other (array init, ELSE;, VAR_GLOBAL):+${causes.MULTI_DIM_ARRAY_INIT.files.length + causes.INLINE_ARRAY_INIT.files.length + causes.ELSE_SEMICOLON.files.length + causes.VAR_GLOBAL.files.length} files`);

// Write JSON
const report = {
  timestamp: new Date().toISOString(),
  summary: { totalFiles: files.length, successCount: successFiles.length, failureCount: totalFailed, successRate: `${(successFiles.length/files.length*100).toFixed(1)}%` },
  rootCauses: sorted.map(([key, val]) => ({ id: key, description: val.desc, phase: val.phase, count: val.files.length, percentOfFailures: `${(val.files.length / totalFailed * 100).toFixed(1)}%`, files: val.files })),
  successFiles,
  failedFiles,
};

const reportPath = join(import.meta.dirname, 'oscat-compatibility-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nJSON report: ${reportPath}`);
