// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Find All References Provider (Phase 4.1)
 *
 * Collects all reference locations for the symbol under the cursor,
 * across all open/workspace documents.
 */

import { Location } from "vscode-languageserver/node.js";
import type { AnalysisResult, SourceSpan } from "strucpp";
import { collectReferences } from "strucpp";
import { resolveSymbolAtPosition } from "./resolve-symbol.js";
import {
  sourceSpanToRange,
  resolveUri,
  type FileNameResolver,
} from "./lsp-utils.js";

export interface DocumentInfo {
  uri: string;
  analysisResult?: AnalysisResult;
}

/**
 * Find all references to the symbol at the given cursor position.
 */
export function getReferences(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  uri: string,
  allDocuments: ReadonlyMap<string, DocumentInfo>,
  resolveFileName?: FileNameResolver,
  includeDeclaration?: boolean,
): Location[] {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved) return [];

  const { symbol, stdFunction, scope } = resolved;

  // Standard functions have no source — no references to return
  if (stdFunction && !symbol) return [];
  if (!symbol) return [];

  const symbolName = symbol.name;

  // Determine scope filter: local variables/constants stay within their POU
  const scopeFilter = getScopeFilter(symbol, scope);

  // Collect the declaration span so we can optionally exclude it
  const declSpan = "declaration" in symbol
    ? (symbol.declaration as { sourceSpan?: SourceSpan } | undefined)?.sourceSpan
    : undefined;

  const locations: Location[] = [];

  // Search across all documents
  for (const [, doc] of allDocuments) {
    const docAnalysis = doc.analysisResult;
    if (!docAnalysis?.ast) continue;

    const refs = collectReferences(docAnalysis.ast, symbolName, scopeFilter);
    for (const refNode of refs) {
      const span = refNode.sourceSpan;
      if (!span) continue;

      // Optionally exclude the declaration
      if (
        !includeDeclaration &&
        declSpan &&
        span.startLine === declSpan.startLine &&
        span.startCol === declSpan.startCol &&
        span.file === declSpan.file
      ) {
        continue;
      }

      const targetUri = resolveUri(span, doc.uri, resolveFileName);
      locations.push(Location.create(targetUri, sourceSpanToRange(span)));
    }
  }

  return locations;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ResolvedInfo = NonNullable<ReturnType<typeof resolveSymbolAtPosition>>;

/**
 * Determine whether this symbol should be scoped to a specific POU.
 * Local variables/constants are scoped; global symbols (functions, FBs, types, etc.) are not.
 */
function getScopeFilter(
  symbol: ResolvedInfo["symbol"],
  scope: ResolvedInfo["scope"],
): string | undefined {
  if (!symbol) return undefined;

  switch (symbol.kind) {
    case "variable":
    case "constant":
      // Global-scope variables don't need filtering
      if (scope.kind === "global") return undefined;
      // Local variables: filter by enclosing POU name
      return scope.name;
    default:
      // Functions, FBs, programs, types, enum values are global
      return undefined;
  }
}
