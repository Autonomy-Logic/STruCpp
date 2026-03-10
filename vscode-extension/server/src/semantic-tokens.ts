// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Semantic Tokens Provider (Phase 4.3)
 *
 * Walks the AST and emits delta-encoded semantic tokens for accurate
 * syntax highlighting that goes beyond TextMate grammar rules.
 */

import type {
  AnalysisResult,
  ProgramDeclaration,
  FunctionDeclaration,
  FunctionBlockDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  VarBlock,
  VarDeclaration,
  VariableExpression,
  FunctionCallExpression,
  MethodCallExpression,
  TypeReference,
  LiteralExpression,
  EnumMember,
  SourceSpan,
} from "strucpp";
import { walkAST, findEnclosingPOU, ELEMENTARY_TYPES } from "strucpp";
import { getScopeForContext } from "./resolve-symbol.js";
import { stripCommentsAndStrings } from "./lsp-utils.js";
import { extractTestVarDeclarations } from "../../shared/test-utils.js";

// ---------------------------------------------------------------------------
// Token type & modifier legends (order must match server capabilities)
// ---------------------------------------------------------------------------

export const TOKEN_TYPES: string[] = [
  "namespace",   // 0
  "class",       // 1
  "interface",   // 2
  "type",        // 3
  "enum",        // 4
  "enumMember",  // 5
  "function",    // 6
  "method",      // 7
  "property",    // 8
  "variable",    // 9
  "parameter",   // 10
  "number",      // 11
  "string",      // 12
];

export const TOKEN_MODIFIERS: string[] = [
  "declaration",     // bit 0
  "readonly",        // bit 1
  "defaultLibrary",  // bit 2
];

const TYPE_IDX = Object.fromEntries(TOKEN_TYPES.map((t, i) => [t, i]));
const MOD_BIT = Object.fromEntries(TOKEN_MODIFIERS.map((m, i) => [m, 1 << i]));

// ---------------------------------------------------------------------------
// Raw token collection
// ---------------------------------------------------------------------------

interface RawToken {
  line: number;   // 0-indexed (LSP coords)
  col: number;    // 0-indexed
  length: number;
  typeIdx: number;
  modBits: number;
}

/**
 * Compute semantic tokens for a single file.
 * Returns the delta-encoded `data` array per the LSP SemanticTokens spec.
 */
export function getSemanticTokens(
  analysis: AnalysisResult,
  fileName: string,
  source?: string,
): number[] {
  const { ast, symbolTables } = analysis;
  if (!ast || !symbolTables) return [];

  const tokens: RawToken[] = [];
  const sourceLines = source?.split("\n") ?? [];
  const varBlockMap = buildVarBlockMap(ast);

  walkAST(ast, (node) => {
    // Filter to only nodes in the requested file
    if (!node.sourceSpan || node.sourceSpan.file !== fileName) return;

    switch (node.kind) {
      case "ProgramDeclaration":
        emitPOUName(tokens, node as ProgramDeclaration, "PROGRAM", TYPE_IDX.namespace, MOD_BIT.declaration, sourceLines);
        break;

      case "FunctionDeclaration":
        emitPOUName(tokens, node as FunctionDeclaration, "FUNCTION", TYPE_IDX.function, MOD_BIT.declaration, sourceLines);
        break;

      case "FunctionBlockDeclaration":
        emitPOUName(tokens, node as FunctionBlockDeclaration, "FUNCTION_BLOCK", TYPE_IDX.class, MOD_BIT.declaration, sourceLines);
        break;

      case "InterfaceDeclaration":
        emitPOUName(tokens, node as InterfaceDeclaration, "INTERFACE", TYPE_IDX.interface, MOD_BIT.declaration, sourceLines);
        break;

      case "MethodDeclaration":
        emitPOUName(tokens, node as MethodDeclaration, "METHOD", TYPE_IDX.method, MOD_BIT.declaration, sourceLines);
        break;

      case "PropertyDeclaration":
        emitPOUName(tokens, node as PropertyDeclaration, "PROPERTY", TYPE_IDX.property, MOD_BIT.declaration, sourceLines);
        break;

      case "EnumMember":
        emitName(tokens, node as EnumMember, TYPE_IDX.enumMember, MOD_BIT.declaration);
        break;

      case "VarDeclaration":
        emitVarDeclaration(tokens, node as VarDeclaration, varBlockMap);
        break;

      case "VariableExpression":
        emitVariableExpression(tokens, node as VariableExpression, ast, symbolTables, fileName);
        break;

      case "FunctionCallExpression":
        emitFunctionCall(tokens, node as FunctionCallExpression);
        break;

      case "MethodCallExpression":
        emitMethodCall(tokens, node as MethodCallExpression);
        break;

      case "TypeReference":
        emitTypeReference(tokens, node as TypeReference, symbolTables);
        break;

      case "LiteralExpression":
        emitLiteral(tokens, node as LiteralExpression);
        break;
    }
  });

  return deltaEncode(tokens);
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

/** Push a token, converting 1-indexed compiler coords to 0-indexed LSP coords. */
function pushToken(
  tokens: RawToken[],
  startLine: number,
  startCol: number,
  length: number,
  typeIdx: number,
  modBits: number,
): void {
  tokens.push({
    line: startLine - 1,
    col: startCol - 1,
    length,
    typeIdx,
    modBits,
  });
}

/**
 * Emit a token for a POU declaration name by finding the identifier
 * position in the source text (sourceSpan points at the keyword, not the name).
 */
function emitPOUName(
  tokens: RawToken[],
  node: { name: string; sourceSpan: SourceSpan },
  keyword: string,
  typeIdx: number,
  modBits: number,
  sourceLines: string[],
): void {
  if (!node.sourceSpan) return;
  const col = findNameCol(sourceLines, node.sourceSpan.startLine, node.name, keyword);
  if (col < 0) return;
  pushToken(tokens, node.sourceSpan.startLine, col, node.name.length, typeIdx, modBits);
}

/** Emit a token for nodes where sourceSpan already points at the name (e.g. EnumMember). */
function emitName(
  tokens: RawToken[],
  node: { name: string; sourceSpan: SourceSpan },
  typeIdx: number,
  modBits: number,
): void {
  if (!node.sourceSpan) return;
  pushToken(tokens, node.sourceSpan.startLine, node.sourceSpan.startCol, node.name.length, typeIdx, modBits);
}

/**
 * Emit tokens for variable declarations.
 * Determines parameter vs variable vs readonly from the parent VarBlock.
 */
function emitVarDeclaration(
  tokens: RawToken[],
  vd: VarDeclaration,
  varBlockMap: Map<VarDeclaration, VarBlock>,
): void {
  if (!vd.sourceSpan) return;

  // Find parent VarBlock to determine block type
  const parentBlock = varBlockMap.get(vd);
  const isInput = parentBlock?.blockType === "VAR_INPUT" || parentBlock?.blockType === "VAR_IN_OUT";
  const isConstant = parentBlock?.isConstant ?? false;

  const typeIdx = isInput ? TYPE_IDX.parameter : TYPE_IDX.variable;
  let modBits = MOD_BIT.declaration;
  if (isConstant) modBits |= MOD_BIT.readonly;

  // For single-name declarations, use the sourceSpan directly
  if (vd.names.length === 1) {
    pushToken(tokens, vd.sourceSpan.startLine, vd.sourceSpan.startCol, vd.names[0].length, typeIdx, modBits);
  } else {
    // Multi-name: emit only the first name reliably from sourceSpan.
    // Additional names in multi-declarations are tricky without source text.
    pushToken(tokens, vd.sourceSpan.startLine, vd.sourceSpan.startCol, vd.names[0].length, typeIdx, modBits);
  }
}

function emitVariableExpression(
  tokens: RawToken[],
  ve: VariableExpression,
  ast: NonNullable<AnalysisResult["ast"]>,
  symbolTables: NonNullable<AnalysisResult["symbolTables"]>,
  fileName: string,
): void {
  if (!ve.sourceSpan) return;

  const scope = findEnclosingPOU(ast, fileName, ve.sourceSpan.startLine, ve.sourceSpan.startCol);
  const lookupScope = getScopeForContext(symbolTables, scope);
  const symbol = lookupScope?.lookup(ve.name);

  let typeIdx = TYPE_IDX.variable;
  let modBits = 0;

  if (symbol) {
    if (symbol.kind === "variable" && (symbol.isInput || symbol.isInOut)) {
      typeIdx = TYPE_IDX.parameter;
    } else if (symbol.kind === "constant") {
      typeIdx = TYPE_IDX.variable;
      modBits = MOD_BIT.readonly;
    } else if (symbol.kind === "enumValue") {
      typeIdx = TYPE_IDX.enumMember;
    }
  }

  pushToken(tokens, ve.sourceSpan.startLine, ve.sourceSpan.startCol, ve.name.length, typeIdx, modBits);
}

function emitFunctionCall(
  tokens: RawToken[],
  fce: FunctionCallExpression,
): void {
  if (!fce.sourceSpan) return;
  pushToken(tokens, fce.sourceSpan.startLine, fce.sourceSpan.startCol, fce.functionName.length, TYPE_IDX.function, 0);
}

function emitMethodCall(
  tokens: RawToken[],
  mce: MethodCallExpression,
): void {
  // The method name position: we need to find it.
  // MethodCallExpression sourceSpan covers the whole "obj.method(args)".
  // The methodName starts after the dot. We approximate: use obj sourceSpan end + 2 (dot + 1)
  // But safer: the method name is at a known position relative to the expression.
  // Since we don't have a separate span for the method name, skip emitting
  // to avoid incorrect positions. The function call case works because
  // functionName starts at the sourceSpan start.
  // TODO: emit method call tokens when methodName sourceSpan is available
}

function emitTypeReference(
  tokens: RawToken[],
  tr: TypeReference,
  symbolTables: NonNullable<AnalysisResult["symbolTables"]>,
): void {
  if (!tr.sourceSpan) return;
  // Skip REF_TO/REFERENCE_TO keyword-prefixed references (the type name position is offset)
  if (tr.isReference) return;

  const upperName = tr.name.toUpperCase();

  // Elementary types
  if (upperName in ELEMENTARY_TYPES) {
    pushToken(tokens, tr.sourceSpan.startLine, tr.sourceSpan.startCol, tr.name.length, TYPE_IDX.type, MOD_BIT.defaultLibrary);
    return;
  }

  // FB type
  const fbSym = symbolTables.lookupFunctionBlock(tr.name);
  if (fbSym) {
    pushToken(tokens, tr.sourceSpan.startLine, tr.sourceSpan.startCol, tr.name.length, TYPE_IDX.class, 0);
    return;
  }

  // User-defined type (struct, enum, alias)
  pushToken(tokens, tr.sourceSpan.startLine, tr.sourceSpan.startCol, tr.name.length, TYPE_IDX.type, 0);
}

function emitLiteral(
  tokens: RawToken[],
  lit: LiteralExpression,
): void {
  if (!lit.sourceSpan) return;
  const length = lit.sourceSpan.endCol - lit.sourceSpan.startCol + 1;
  if (length <= 0) return;

  if (lit.literalType === "STRING") {
    pushToken(tokens, lit.sourceSpan.startLine, lit.sourceSpan.startCol, length, TYPE_IDX.string, 0);
  } else if (lit.literalType === "INT" || lit.literalType === "REAL") {
    pushToken(tokens, lit.sourceSpan.startLine, lit.sourceSpan.startCol, length, TYPE_IDX.number, 0);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a map from every VarDeclaration to its parent VarBlock (O(n) total).
 */
function buildVarBlockMap(
  ast: NonNullable<AnalysisResult["ast"]>,
): Map<VarDeclaration, VarBlock> {
  const map = new Map<VarDeclaration, VarBlock>();

  function indexBlocks(blocks: VarBlock[]) {
    for (const block of blocks) {
      for (const decl of block.declarations) {
        map.set(decl, block);
      }
    }
  }

  for (const prog of ast.programs) indexBlocks(prog.varBlocks);
  for (const func of ast.functions) indexBlocks(func.varBlocks);
  for (const fb of ast.functionBlocks) {
    indexBlocks(fb.varBlocks);
    for (const method of fb.methods) indexBlocks(method.varBlocks);
  }
  for (const iface of ast.interfaces ?? []) {
    for (const method of iface.methods) indexBlocks(method.varBlocks);
  }
  if (ast.globalVarBlocks) indexBlocks(ast.globalVarBlocks);

  return map;
}

/**
 * Find the 1-indexed column of `name` on a source line, searching after `keyword`.
 * Returns -1 if not found.
 */
function findNameCol(
  sourceLines: string[],
  lineNum: number,
  name: string,
  keyword: string,
): number {
  const lineText = (sourceLines[lineNum - 1] ?? "").toUpperCase();
  const kwIdx = lineText.indexOf(keyword.toUpperCase());
  if (kwIdx < 0) return -1;
  const nameIdx = lineText.indexOf(name.toUpperCase(), kwIdx + keyword.length);
  if (nameIdx < 0) return -1;
  return nameIdx + 1; // 1-indexed
}

/**
 * Delta-encode raw tokens into the LSP SemanticTokens data array.
 * Tokens are sorted by (line, col) then encoded as:
 *   [deltaLine, deltaCol, length, tokenType, tokenModifiers]
 */
function deltaEncode(tokens: RawToken[]): number[] {
  // Sort by line, then column
  tokens.sort((a, b) => a.line - b.line || a.col - b.col);

  const data: number[] = [];
  let prevLine = 0;
  let prevCol = 0;

  for (const t of tokens) {
    const deltaLine = t.line - prevLine;
    const deltaCol = deltaLine === 0 ? t.col - prevCol : t.col;
    data.push(deltaLine, deltaCol, t.length, t.typeIdx, t.modBits);
    prevLine = t.line;
    prevCol = t.col;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Text-based semantic tokens for test files
// ---------------------------------------------------------------------------

/**
 * Compute semantic tokens for test files using text-based scanning.
 * Since test files (TEST/END_TEST syntax) aren't parsed by the standard
 * parser, we scan identifiers in the source and classify them using the
 * symbol tables built from workspace sources.
 */
export function getTestFileSemanticTokens(
  analysis: AnalysisResult,
  source: string,
): number[] {
  const { symbolTables } = analysis;
  if (!symbolTables) return [];

  const tokens: RawToken[] = [];

  // Strip comments and strings to avoid false matches,
  // but preserve line/column positions (replaced with spaces).
  const stripped = stripCommentsAndStrings(source);
  const lines = stripped.split("\n");

  // Collect locally declared variables from VAR blocks
  const localVarMap = extractTestVarDeclarations(stripped);
  const localVars = new Set(localVarMap.keys());

  // Build set of enum member names from type definitions (enum values
  // may not be in the global scope when primary source is empty).
  const enumMembers = new Set<string>();
  if (analysis.ast) {
    for (const td of analysis.ast.types) {
      const def = td.definition;
      if (def?.kind === "EnumDefinition" && def.members) {
        for (const m of def.members as Array<{ name: string }>) {
          enumMembers.add(m.name.toUpperCase());
        }
      }
    }
  }

  const identRegex = /\b([a-zA-Z_]\w*)\b/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let match;
    identRegex.lastIndex = 0;

    while ((match = identRegex.exec(line)) !== null) {
      const name = match[1];
      const upper = name.toUpperCase();
      const col = match.index;

      // Check elementary types (INT, REAL, BOOL, etc.)
      if (upper in ELEMENTARY_TYPES) {
        tokens.push({
          line: lineIdx, col, length: name.length,
          typeIdx: TYPE_IDX.type, modBits: MOD_BIT.defaultLibrary,
        });
        continue;
      }

      // Check user-defined type names (enum, struct)
      const typeSym = symbolTables.lookupType(upper);
      if (typeSym) {
        const def = typeSym.declaration?.definition;
        const idx = def?.kind === "EnumDefinition" ? TYPE_IDX.enum : TYPE_IDX.type;
        tokens.push({ line: lineIdx, col, length: name.length, typeIdx: idx, modBits: 0 });
        continue;
      }

      // Check function block names
      if (symbolTables.lookupFunctionBlock(upper)) {
        tokens.push({
          line: lineIdx, col, length: name.length,
          typeIdx: TYPE_IDX.class, modBits: 0,
        });
        continue;
      }

      // Check global scope symbols (functions, enum values, programs)
      const globalSym = symbolTables.globalScope.lookup(upper);
      if (globalSym?.kind === "function") {
        tokens.push({
          line: lineIdx, col, length: name.length,
          typeIdx: TYPE_IDX.function, modBits: 0,
        });
        continue;
      }
      if (globalSym?.kind === "enumValue") {
        tokens.push({
          line: lineIdx, col, length: name.length,
          typeIdx: TYPE_IDX.enumMember, modBits: 0,
        });
        continue;
      }

      // Check enum members from type definitions (may not be in global scope)
      if (enumMembers.has(upper)) {
        tokens.push({
          line: lineIdx, col, length: name.length,
          typeIdx: TYPE_IDX.enumMember, modBits: 0,
        });
        continue;
      }

      // Check locally declared variables
      if (localVars.has(upper)) {
        tokens.push({
          line: lineIdx, col, length: name.length,
          typeIdx: TYPE_IDX.variable, modBits: 0,
        });
        continue;
      }
    }
  }

  return deltaEncode(tokens);
}


