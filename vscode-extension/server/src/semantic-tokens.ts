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
): number[] {
  const { ast, symbolTables } = analysis;
  if (!ast || !symbolTables) return [];

  const tokens: RawToken[] = [];

  walkAST(ast, (node) => {
    // Filter to only nodes in the requested file
    if (!node.sourceSpan || node.sourceSpan.file !== fileName) return;

    switch (node.kind) {
      case "ProgramDeclaration":
        emitName(tokens, node as ProgramDeclaration, TYPE_IDX.namespace, MOD_BIT.declaration);
        break;

      case "FunctionDeclaration":
        emitName(tokens, node as FunctionDeclaration, TYPE_IDX.function, MOD_BIT.declaration);
        break;

      case "FunctionBlockDeclaration":
        emitName(tokens, node as FunctionBlockDeclaration, TYPE_IDX.class, MOD_BIT.declaration);
        break;

      case "InterfaceDeclaration":
        emitName(tokens, node as InterfaceDeclaration, TYPE_IDX.interface, MOD_BIT.declaration);
        break;

      case "MethodDeclaration":
        emitName(tokens, node as MethodDeclaration, TYPE_IDX.method, MOD_BIT.declaration);
        break;

      case "PropertyDeclaration":
        emitName(tokens, node as PropertyDeclaration, TYPE_IDX.property, MOD_BIT.declaration);
        break;

      case "EnumMember":
        emitName(tokens, node as EnumMember, TYPE_IDX.enumMember, MOD_BIT.declaration);
        break;

      case "VarDeclaration":
        emitVarDeclaration(tokens, node as VarDeclaration, ast);
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
  ast: NonNullable<AnalysisResult["ast"]>,
): void {
  if (!vd.sourceSpan) return;

  // Find parent VarBlock to determine block type
  const parentBlock = findParentVarBlock(ast, vd);
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
  const length = lit.sourceSpan.endCol - lit.sourceSpan.startCol;
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
 * Find the VarBlock that contains a given VarDeclaration.
 */
function findParentVarBlock(
  ast: NonNullable<AnalysisResult["ast"]>,
  vd: VarDeclaration,
): VarBlock | undefined {
  const allBlocks: VarBlock[] = [];

  // Collect from programs
  for (const prog of ast.programs) {
    allBlocks.push(...prog.varBlocks);
  }
  // Functions
  for (const func of ast.functions) {
    allBlocks.push(...func.varBlocks);
  }
  // Function blocks + methods
  for (const fb of ast.functionBlocks) {
    allBlocks.push(...fb.varBlocks);
    for (const method of fb.methods) {
      allBlocks.push(...method.varBlocks);
    }
  }
  // Interfaces (methods)
  for (const iface of ast.interfaces ?? []) {
    for (const method of iface.methods) {
      allBlocks.push(...method.varBlocks);
    }
  }
  // Global var blocks
  if (ast.globalVarBlocks) {
    allBlocks.push(...ast.globalVarBlocks);
  }

  for (const block of allBlocks) {
    if (block.declarations.includes(vd)) {
      return block;
    }
  }
  return undefined;
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
