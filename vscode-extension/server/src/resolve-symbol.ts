// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Shared Symbol Resolution
 *
 * Given an analysis result and a cursor position, resolves the symbol
 * under the cursor. Used by both hover and go-to-definition to avoid
 * code duplication.
 */

import type {
  ASTNode,
  AnalysisResult,
  AnySymbol,
  EnclosingScope,
  VariableExpression,
  FunctionCallExpression,
  MethodCallExpression,
  VarDeclaration,
  TypeDeclaration,
  TypeReference,
  FunctionBlockType,
  LiteralExpression,
  StdFunctionDescriptor,
  Scope,
  SourceSpan,
  CompilationUnit,
} from "strucpp";
import { walkAST, findEnclosingPOU } from "strucpp";

export interface ResolvedSymbol {
  node: ASTNode;
  symbol?: AnySymbol;
  scope: EnclosingScope;
  stdFunction?: StdFunctionDescriptor;
}

/** Node kinds we want to resolve symbols for, ordered by specificity. */
const SYMBOL_NODE_KINDS = new Set([
  "VariableExpression",
  "FunctionCallExpression",
  "MethodCallExpression",
  "TypeReference",
  "TypeDeclaration",
  "LiteralExpression",
  "VarDeclaration",
]);

/**
 * Find the best symbol-bearing AST node at the given position.
 *
 * Unlike findNodeAtPosition (which prunes based on parent spans), this does
 * a full walk because some parent nodes (e.g., AssignmentStatement) have
 * truncated sourceSpans that don't cover their children.
 */
function findSymbolNodeAtPosition(
  ast: CompilationUnit,
  file: string,
  line: number,
  column: number,
): ASTNode | undefined {
  let best: ASTNode | undefined;
  let bestSize = Infinity;

  walkAST(ast, (node) => {
    if (!containsPosition(node.sourceSpan, file, line, column)) return;

    const size = spanSize(node.sourceSpan);
    // Prefer symbol-bearing nodes; among same-kind, prefer smallest span
    if (SYMBOL_NODE_KINDS.has(node.kind)) {
      if (
        !best ||
        !SYMBOL_NODE_KINDS.has(best.kind) ||
        size < bestSize
      ) {
        best = node;
        bestSize = size;
      }
    } else if (!best || (!SYMBOL_NODE_KINDS.has(best.kind) && size < bestSize)) {
      best = node;
      bestSize = size;
    }
  });

  return best;
}

function containsPosition(
  span: SourceSpan | undefined,
  file: string,
  line: number,
  column: number,
): boolean {
  if (!span || span.file !== file) return false;
  if (line < span.startLine || line > span.endLine) return false;
  if (line === span.startLine && column < span.startCol) return false;
  if (line === span.endLine && column > span.endCol) return false;
  return true;
}

/** Approximate span area for smallest-span-wins comparison.
 *  Multiplier assumes columns stay under 10000 (safe for ST files). */
function spanSize(span: SourceSpan | undefined): number {
  if (!span) return Infinity;
  return (span.endLine - span.startLine) * 10000 + (span.endCol - span.startCol);
}

/**
 * Resolve the symbol at a given source position.
 *
 * 1. Find the AST node at position (full walk, no pruning)
 * 2. Find the enclosing POU for scope context
 * 3. Look up the symbol in the appropriate scope
 */
export function resolveSymbolAtPosition(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
): ResolvedSymbol | undefined {
  const { ast, symbolTables, stdFunctionRegistry } = analysis;
  if (!ast || !symbolTables) return undefined;

  const node = findSymbolNodeAtPosition(ast, fileName, line, column);
  if (!node) return undefined;

  // Don't return results for top-level container nodes
  if (
    node.kind === "CompilationUnit" ||
    node.kind === "ProgramDeclaration" ||
    node.kind === "FunctionDeclaration" ||
    node.kind === "FunctionBlockDeclaration"
  ) {
    return undefined;
  }

  const scope = findEnclosingPOU(ast, fileName, line, column);

  // Get the appropriate Scope object for symbol lookup
  const lookupScope = getScopeForContext(symbolTables, scope);
  if (!lookupScope) return undefined;

  switch (node.kind) {
    case "VariableExpression": {
      const ve = node as VariableExpression;
      const symbol = lookupScope.lookup(ve.name);
      return { node, symbol, scope };
    }

    case "FunctionCallExpression": {
      const fce = node as FunctionCallExpression;
      // Try user-defined function first
      const symbol = symbolTables.globalScope.lookup(fce.functionName);
      if (symbol) {
        return { node, symbol, scope };
      }
      // Try as FB invocation — functionName could be a local FB variable
      const localVar = lookupScope.lookup(fce.functionName);
      if (localVar) {
        return { node, symbol: localVar, scope };
      }
      // Try standard function registry
      const stdFn = stdFunctionRegistry?.lookup(fce.functionName);
      if (stdFn) {
        return { node, scope, stdFunction: stdFn };
      }
      // Try conversion function
      const convInfo = stdFunctionRegistry?.resolveConversion(
        fce.functionName,
      );
      if (convInfo) {
        return { node, scope, stdFunction: convInfo as unknown as StdFunctionDescriptor };
      }
      return { node, scope };
    }

    case "MethodCallExpression": {
      const mce = node as MethodCallExpression;
      // Look up the object variable to find its FB type, then find the method
      if (mce.object.kind === "VariableExpression") {
        const objVar = lookupScope.lookup(
          (mce.object as VariableExpression).name,
        );
        if (objVar?.kind === "variable" && objVar.type) {
          const fbName =
            objVar.type.typeKind === "functionBlock"
              ? (objVar.type as FunctionBlockType).name
              : undefined;
          if (fbName) {
            const fbScope = symbolTables.getFBScope(fbName);
            const methodSymbol = fbScope?.lookupLocal(mce.methodName);
            if (methodSymbol) {
              return { node, symbol: methodSymbol, scope };
            }
          }
        }
      }
      return { node, scope };
    }

    case "TypeReference": {
      const tr = node as TypeReference;
      const symbol = symbolTables.lookupType(tr.name);
      if (symbol) {
        return { node, symbol, scope };
      }
      // Could be a FB type
      const fbSymbol = symbolTables.lookupFunctionBlock(tr.name);
      if (fbSymbol) {
        return { node, symbol: fbSymbol, scope };
      }
      return { node, scope };
    }

    case "VarDeclaration": {
      const vd = node as VarDeclaration;
      // VarDeclaration can declare multiple names; resolve the first one
      // (exact name matching would need column-level checking in the names list)
      if (vd.names.length > 0) {
        const symbol = lookupScope.lookup(vd.names[0]);
        if (symbol) return { node, symbol, scope };
      }
      return { node, scope };
    }

    case "TypeDeclaration": {
      const td = node as TypeDeclaration;
      const symbol = symbolTables.lookupType(td.name);
      if (symbol) return { node, symbol, scope };
      // Could be a FB type declaration
      const fbSymbol = symbolTables.lookupFunctionBlock(td.name);
      if (fbSymbol) return { node, symbol: fbSymbol, scope };
      return { node, scope };
    }

    case "LiteralExpression": {
      return { node, scope };
    }

    default:
      return { node, scope };
  }
}

function getScopeForContext(
  symbolTables: NonNullable<AnalysisResult["symbolTables"]>,
  scope: EnclosingScope,
): Scope | undefined {
  switch (scope.kind) {
    case "method":
      return (
        symbolTables.getMethodScope(scope.parentName!, scope.name) ??
        symbolTables.getFBScope(scope.parentName!) ??
        symbolTables.globalScope
      );
    case "functionBlock":
      return symbolTables.getFBScope(scope.name) ?? symbolTables.globalScope;
    case "function":
      return (
        symbolTables.getFunctionScope(scope.name) ?? symbolTables.globalScope
      );
    case "program":
      return (
        symbolTables.getProgramScope(scope.name) ?? symbolTables.globalScope
      );
    case "global":
      return symbolTables.globalScope;
  }
}
