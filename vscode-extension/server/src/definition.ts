// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Go to Definition / Type Definition Provider
 *
 * Returns the source location of the declaration for the symbol at cursor.
 */

import { Location, Range } from "vscode-languageserver/node.js";
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

/** Resolves a symbol name to a library source location (URI + 0-indexed line). */
export type LibrarySymbolResolver = (
  symbolName: string,
) => { uri: string; line: number } | undefined;

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
  resolveLibrarySymbol?: LibrarySymbolResolver,
): Location | null {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved) return null;

  const { symbol, stdFunction } = resolved;

  // Standard functions have no source location
  if (stdFunction && !symbol) return null;

  if (!symbol) return null;

  const span = getDeclarationSpan(symbol);
  if (!span) return null;

  // Library symbols have a default sourceSpan (all zeros, empty file).
  // Try to find the actual declaration in library source files.
  if (isDefaultSpan(span)) {
    return tryResolveLibraryLocation(symbol.name, resolveLibrarySymbol);
  }

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
  resolveLibrarySymbol?: LibrarySymbolResolver,
): Location | null {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved || !analysis.symbolTables) return null;

  const { symbol } = resolved;
  if (!symbol) return null;

  // For variables, look up the type declaration
  if (symbol.kind === "variable" || symbol.kind === "constant") {
    const varSym = symbol as VariableSymbol | ConstantSymbol;
    if (varSym.type) {
      const typeName = varSym.declaration?.type?.name ?? "";

      const typeSym = analysis.symbolTables.lookupType(typeName);
      if (typeSym?.declaration?.sourceSpan) {
        if (isDefaultSpan(typeSym.declaration.sourceSpan)) {
          return tryResolveLibraryLocation(typeName, resolveLibrarySymbol);
        }
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
      const fbSym = analysis.symbolTables.lookupFunctionBlock(typeName);
      if (fbSym?.declaration?.sourceSpan) {
        if (isDefaultSpan(fbSym.declaration.sourceSpan)) {
          return tryResolveLibraryLocation(typeName, resolveLibrarySymbol);
        }
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
  return getDefinition(analysis, fileName, line, column, uri, resolveFileName, resolveLibrarySymbol);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a sourceSpan is the default/empty span from library-loaded symbols. */
function isDefaultSpan(span: SourceSpan): boolean {
  return !span.file && span.startLine === 0 && span.endLine === 0;
}

/** Try to resolve a symbol name to a location in library source files. */
function tryResolveLibraryLocation(
  symbolName: string,
  resolveLibrarySymbol?: LibrarySymbolResolver,
): Location | null {
  if (!resolveLibrarySymbol) return null;
  const result = resolveLibrarySymbol(symbolName);
  if (!result) return null;
  return Location.create(
    result.uri,
    Range.create(result.line, 0, result.line, 0),
  );
}

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
