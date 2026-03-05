// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Go to Definition / Type Definition Provider
 *
 * Returns the source location of the declaration for the symbol at cursor.
 */

import { Location } from "vscode-languageserver/node.js";
import type {
  AnalysisResult,
  VariableSymbol,
  ConstantSymbol,
  FunctionSymbol,
  FunctionBlockSymbol,
  ProgramSymbol,
  TypeSymbol,
  SourceSpan,
} from "strucpp";
import { resolveSymbolAtPosition } from "./resolve-symbol.js";
import { sourceSpanToRange, resolveUri, type FileNameResolver } from "./lsp-utils.js";

/**
 * Get the definition location for the symbol at cursor.
 */
export function getDefinition(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  uri: string,
  resolveFileName?: FileNameResolver,
): Location | null {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved) return null;

  const { symbol, stdFunction } = resolved;

  // Standard functions have no source location
  if (stdFunction && !symbol) return null;

  if (!symbol) return null;

  const span = getDeclarationSpan(symbol);
  if (!span) return null;

  const targetUri = resolveUri(span, uri, resolveFileName);
  return Location.create(targetUri, sourceSpanToRange(span));
}

/**
 * Get the type definition location for the symbol at cursor.
 * For a variable, navigates to its type's declaration.
 */
export function getTypeDefinition(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  uri: string,
  resolveFileName?: FileNameResolver,
): Location | null {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved || !analysis.symbolTables) return null;

  const { symbol } = resolved;
  if (!symbol) return null;

  // For variables, look up the type declaration
  if (symbol.kind === "variable" || symbol.kind === "constant") {
    const varSym = symbol as VariableSymbol | ConstantSymbol;
    if (varSym.type) {
      const typeSym = analysis.symbolTables.lookupType(
        varSym.declaration?.type?.name ?? "",
      );
      if (typeSym?.declaration?.sourceSpan) {
        const targetUri = resolveUri(
          typeSym.declaration.sourceSpan,
          uri,
          resolveFileName,
        );
        return Location.create(
          targetUri,
          sourceSpanToRange(typeSym.declaration.sourceSpan),
        );
      }
      // Try FB type
      const fbSym = analysis.symbolTables.lookupFunctionBlock(
        varSym.declaration?.type?.name ?? "",
      );
      if (fbSym?.declaration?.sourceSpan) {
        const targetUri = resolveUri(
          fbSym.declaration.sourceSpan,
          uri,
          resolveFileName,
        );
        return Location.create(
          targetUri,
          sourceSpanToRange(fbSym.declaration.sourceSpan),
        );
      }
    }
    return null;
  }

  // For other symbols, definition and type definition are the same
  return getDefinition(analysis, fileName, line, column, uri, resolveFileName);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDeclarationSpan(
  symbol: NonNullable<
    ReturnType<typeof resolveSymbolAtPosition>
  >["symbol"],
): SourceSpan | undefined {
  if (!symbol) return undefined;

  switch (symbol.kind) {
    case "variable":
    case "constant":
      return (symbol as VariableSymbol | ConstantSymbol).declaration
        ?.sourceSpan;
    case "function":
      return (symbol as FunctionSymbol).declaration?.sourceSpan;
    case "functionBlock":
      return (symbol as FunctionBlockSymbol).declaration?.sourceSpan;
    case "program":
      return (symbol as ProgramSymbol).declaration?.sourceSpan;
    case "type":
      return (symbol as TypeSymbol).declaration?.sourceSpan;
    case "enumValue":
      // Enum values don't have their own declaration sourceSpan
      return undefined;
    default:
      return undefined;
  }
}

