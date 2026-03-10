// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Completion Provider
 *
 * Returns context-appropriate completion items based on cursor position.
 * Dispatches to different strategies based on CursorContext.
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
} from "vscode-languageserver/node.js";
import type {
  AnalysisResult,
  EnclosingScope,
  VariableSymbol,
  FunctionSymbol,
  FunctionBlockSymbol,
  FunctionBlockType,
  SymbolTables,
  Scope,
} from "strucpp";
import { ELEMENTARY_TYPES, typeName } from "strucpp";
import { getCursorContext } from "./cursor-context.js";
import { getScopeForContext } from "./resolve-symbol.js";
import { isTestFile, extractTestVarDeclarations } from "../../shared/test-utils.js";
import { stripCommentsAndStrings } from "./lsp-utils.js";

/**
 * Get completion items for the given position.
 */
export function getCompletions(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  source: string,
  caseMap?: ReadonlyMap<string, string>,
): CompletionItem[] {
  const ctx = getCursorContext(analysis, fileName, line, column, source);

  const isTest = isTestFile(source);

  let items: CompletionItem[];
  switch (ctx.kind) {
    case "top-level":
      items = isTest ? getTestTopLevelCompletions() : getTopLevelCompletions();
      break;
    case "var-block":
      items = getVarBlockCompletions();
      break;
    case "type-annotation":
      items = getTypeAnnotationCompletions(analysis);
      break;
    case "dot-access":
      items = getDotAccessCompletions(analysis, ctx.prefixExpr, ctx.pouScope, isTest ? source : undefined);
      break;
    case "body":
      items = getBodyCompletions(analysis, ctx.pouScope, isTest ? source : undefined);
      if (isTest) items.push(...getTestBodyCompletions());
      break;
  }

  // Restore original casing. The compiler uppercases all identifiers,
  // but users expect completions to match their coding style.
  return restoreOriginalCasing(items, source, caseMap);
}

// ---------------------------------------------------------------------------
// Top-level completions
// ---------------------------------------------------------------------------

function getTopLevelCompletions(): CompletionItem[] {
  return [
    {
      label: "PROGRAM",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "PROGRAM ${1:Name}\n  VAR\n    $0\n  END_VAR\nEND_PROGRAM",
      sortText: "0",
    },
    {
      label: "FUNCTION_BLOCK",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText:
        "FUNCTION_BLOCK ${1:Name}\n  VAR_INPUT\n    $0\n  END_VAR\nEND_FUNCTION_BLOCK",
      sortText: "0",
    },
    {
      label: "FUNCTION",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText:
        "FUNCTION ${1:Name} : ${2:INT}\n  VAR_INPUT\n    $0\n  END_VAR\nEND_FUNCTION",
      sortText: "0",
    },
    {
      label: "TYPE",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "TYPE ${1:Name} :\n  STRUCT\n    $0\n  END_STRUCT;\nEND_TYPE",
      sortText: "0",
    },
    {
      label: "INTERFACE",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "INTERFACE ${1:IName}\n  METHOD ${2:MethodName}\n    $0\n  END_METHOD\nEND_INTERFACE",
      sortText: "0",
    },
    {
      label: "VAR_GLOBAL",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "VAR_GLOBAL\n  $0\nEND_VAR",
      sortText: "0",
    },
  ];
}

// ---------------------------------------------------------------------------
// VAR block completions
// ---------------------------------------------------------------------------

function getVarBlockCompletions(): CompletionItem[] {
  return [
    {
      label: "END_VAR",
      kind: CompletionItemKind.Keyword,
      sortText: "0",
    },
  ];
}

// ---------------------------------------------------------------------------
// Type annotation completions (after `:`)
// ---------------------------------------------------------------------------

function getTypeAnnotationCompletions(analysis: AnalysisResult): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Elementary types
  for (const name of Object.keys(ELEMENTARY_TYPES)) {
    items.push({
      label: name,
      kind: CompletionItemKind.TypeParameter,
      sortText: "0",
    });
  }

  // TOD and DT aliases
  items.push(
    { label: "TOD", kind: CompletionItemKind.TypeParameter, sortText: "0" },
    { label: "DT", kind: CompletionItemKind.TypeParameter, sortText: "0" },
  );

  // User-defined types from AST
  if (analysis.ast) {
    for (const td of analysis.ast.types) {
      items.push({
        label: td.name,
        kind: CompletionItemKind.Struct,
        sortText: "1",
      });
    }
    for (const fb of analysis.ast.functionBlocks) {
      items.push({
        label: fb.name,
        kind: CompletionItemKind.Class,
        sortText: "1",
      });
    }
  }

  // ARRAY snippet
  items.push({
    label: "ARRAY",
    kind: CompletionItemKind.Keyword,
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: "ARRAY[${1:0}..${2:9}] OF ${3:INT}",
    sortText: "2",
  });

  // REF_TO snippet
  items.push({
    label: "REF_TO",
    kind: CompletionItemKind.Keyword,
    insertTextFormat: InsertTextFormat.Snippet,
    insertText: "REF_TO ${1:INT}",
    sortText: "2",
  });

  return items;
}

// ---------------------------------------------------------------------------
// Dot-access completions
// ---------------------------------------------------------------------------

function getDotAccessCompletions(
  analysis: AnalysisResult,
  prefixExpr: string,
  pouScope: EnclosingScope,
  testSource?: string,
): CompletionItem[] {
  const { symbolTables } = analysis;
  if (!symbolTables) return [];

  const scope = getScopeForContext(symbolTables, pouScope);
  if (!scope) return [];

  // Parse the chain: "a.b.c" → resolve segment by segment
  const segments = prefixExpr.split(".");
  const resolvedType = resolveChainType(segments, scope, symbolTables);
  if (resolvedType) return getMembersForType(resolvedType, symbolTables);

  // For test files, try resolving via locally declared variable types
  if (testSource) {
    const testVars = extractTestVarDeclarations(stripCommentsAndStrings(testSource));
    const varType = testVars.get(segments[0].toUpperCase());
    if (varType) {
      // Walk remaining segments through type chain
      let currentTypeName = varType;
      for (let i = 1; i < segments.length; i++) {
        const nextType = resolveMemberType(currentTypeName, segments[i], symbolTables);
        if (!nextType) return [];
        currentTypeName = nextType;
      }
      const typeInfo = resolveTypeName(currentTypeName, symbolTables);
      if (typeInfo) return getMembersForType(typeInfo, symbolTables);
    }
  }

  // Fallback: first segment may be a type name (e.g., EnumType.MEMBER)
  const typeInfo = resolveTypeName(segments[0], symbolTables);
  if (typeInfo) return getMembersForType(typeInfo, symbolTables);

  return [];
}

interface ResolvedTypeInfo {
  kind: "functionBlock" | "struct" | "enum";
  name: string;
}

/**
 * Resolve a dotted identifier chain to its final type.
 * e.g., "player.position" → resolves player (Sprite FB) → position (Point struct)
 */
function resolveChainType(
  segments: string[],
  scope: Scope,
  symbolTables: SymbolTables,
): ResolvedTypeInfo | undefined {
  if (segments.length === 0) return undefined;

  // Resolve first segment via scope lookup
  const firstSym = scope.lookup(segments[0]);
  if (!firstSym || firstSym.kind !== "variable") return undefined;

  let currentTypeName = getVariableTypeName(firstSym as VariableSymbol);
  if (!currentTypeName) return undefined;

  // Walk remaining segments
  for (let i = 1; i < segments.length; i++) {
    const memberName = segments[i];
    const nextType = resolveMemberType(currentTypeName, memberName, symbolTables);
    if (!nextType) return undefined;
    currentTypeName = nextType;
  }

  // Determine what kind of type this is
  if (symbolTables.lookupFunctionBlock(currentTypeName)) {
    return { kind: "functionBlock", name: currentTypeName };
  }
  const typeSym = symbolTables.lookupType(currentTypeName);
  if (typeSym?.declaration?.definition?.kind === "StructDefinition") {
    return { kind: "struct", name: currentTypeName };
  }
  if (typeSym?.declaration?.definition?.kind === "EnumDefinition") {
    return { kind: "enum", name: currentTypeName };
  }

  return undefined;
}

/**
 * Try to resolve a name as a type (enum, struct, FB) for dot-access.
 * This handles the common pattern `EnumType.MEMBER` where the first
 * segment is a type name, not a variable.
 */
function resolveTypeName(
  name: string,
  symbolTables: SymbolTables,
): ResolvedTypeInfo | undefined {
  const upper = name.toUpperCase();

  // Check FB
  if (symbolTables.lookupFunctionBlock(upper)) {
    return { kind: "functionBlock", name: upper };
  }

  // Check type (enum, struct)
  const typeSym = symbolTables.lookupType(upper);
  if (typeSym?.declaration?.definition?.kind === "EnumDefinition") {
    return { kind: "enum", name: upper };
  }
  if (typeSym?.declaration?.definition?.kind === "StructDefinition") {
    return { kind: "struct", name: upper };
  }

  return undefined;
}

/** Get the type name string from a variable symbol. */
function getVariableTypeName(sym: VariableSymbol): string | undefined {
  // Prefer declaration type name (more reliable)
  if (sym.declaration?.type?.name) return sym.declaration.type.name;
  if (sym.type) {
    if (sym.type.typeKind === "functionBlock") {
      return (sym.type as FunctionBlockType).name;
    }
    return typeName(sym.type);
  }
  return undefined;
}

/** Resolve a member access to get the type name of the member. */
function resolveMemberType(
  parentTypeName: string,
  memberName: string,
  symbolTables: SymbolTables,
): string | undefined {
  // Try FB
  const fbSym = symbolTables.lookupFunctionBlock(parentTypeName);
  if (fbSym) {
    const member = findFBMember(fbSym, memberName, symbolTables);
    if (member) return getVariableTypeName(member);
    return undefined;
  }

  // Try struct
  const typeSym = symbolTables.lookupType(parentTypeName);
  if (typeSym?.declaration?.definition?.kind === "StructDefinition") {
    const fields = typeSym.declaration.definition.fields as Array<{
      names: string[];
      type: { name: string };
    }>;
    for (const field of fields) {
      if (field.names.some((n: string) => n.toUpperCase() === memberName.toUpperCase())) {
        return field.type.name;
      }
    }
  }

  return undefined;
}

/** Find a member (input/output/inout) of a function block by name. */
function findFBMember(
  fbSym: FunctionBlockSymbol,
  name: string,
  symbolTables: SymbolTables,
): VariableSymbol | undefined {
  const upper = name.toUpperCase();

  // Try inputs/outputs/inouts arrays first
  for (const arr of [fbSym.inputs, fbSym.outputs, fbSym.inouts]) {
    const found = arr.find((v) => v.name.toUpperCase() === upper);
    if (found) return found;
  }

  // Fall back to FB scope
  const fbScope = symbolTables.getFBScope(fbSym.name);
  if (fbScope) {
    const sym = fbScope.lookupLocal(name);
    if (sym?.kind === "variable") return sym as VariableSymbol;
  }

  return undefined;
}

/** Get completions for members of a resolved type. */
function getMembersForType(
  typeInfo: ResolvedTypeInfo,
  symbolTables: SymbolTables,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  if (typeInfo.kind === "functionBlock") {
    const fbSym = symbolTables.lookupFunctionBlock(typeInfo.name);
    if (!fbSym) return [];

    // Collect from inputs/outputs arrays
    const added = new Set<string>();
    for (const v of fbSym.inputs) {
      items.push(makeVariableCompletion(v, "2"));
      added.add(v.name.toUpperCase());
    }
    for (const v of fbSym.outputs) {
      items.push(makeVariableCompletion(v, "2"));
      added.add(v.name.toUpperCase());
    }
    for (const v of fbSym.inouts) {
      items.push(makeVariableCompletion(v, "2"));
      added.add(v.name.toUpperCase());
    }

    // Fall back to FB scope for anything missed
    const fbScope = symbolTables.getFBScope(typeInfo.name);
    if (fbScope) {
      for (const sym of fbScope.getAllSymbols()) {
        if (sym.kind === "variable" && !added.has(sym.name.toUpperCase())) {
          const varSym = sym as VariableSymbol;
          if (varSym.isInput || varSym.isOutput || varSym.isInOut) {
            items.push(makeVariableCompletion(varSym, "2"));
            added.add(sym.name.toUpperCase());
          }
        }
        // Methods
        if (sym.kind === "function") {
          items.push({
            label: sym.name,
            kind: CompletionItemKind.Method,
            detail: formatFunctionSignature(sym as FunctionSymbol),
            sortText: "3",
          });
        }
      }
    }

    // Methods from the declaration
    if (fbSym.declaration?.methods) {
      for (const m of fbSym.declaration.methods) {
        if (!items.some((it) => it.label.toUpperCase() === m.name.toUpperCase())) {
          items.push({
            label: m.name,
            kind: CompletionItemKind.Method,
            detail: `METHOD ${m.name}`,
            sortText: "3",
          });
        }
      }
    }
  } else if (typeInfo.kind === "struct") {
    const typeSym = symbolTables.lookupType(typeInfo.name);
    if (typeSym?.declaration?.definition?.kind === "StructDefinition") {
      const fields = typeSym.declaration.definition.fields as Array<{
        names: string[];
        type: { name: string };
      }>;
      for (const field of fields) {
        for (const name of field.names) {
          items.push({
            label: name,
            kind: CompletionItemKind.Field,
            detail: field.type.name,
            sortText: "1",
          });
        }
      }
    }
  } else if (typeInfo.kind === "enum") {
    const typeSym = symbolTables.lookupType(typeInfo.name);
    if (typeSym?.declaration?.definition?.kind === "EnumDefinition") {
      const members = typeSym.declaration.definition.members as Array<{
        name: string;
      }>;
      for (const m of members) {
        items.push({
          label: m.name,
          kind: CompletionItemKind.EnumMember,
          sortText: "1",
        });
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Body completions (inside POU code)
// ---------------------------------------------------------------------------

function getBodyCompletions(
  analysis: AnalysisResult,
  pouScope: EnclosingScope,
  testSource?: string,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Statement keywords + snippets
  items.push(
    ...getStatementKeywordCompletions(),
  );

  const { symbolTables, stdFunctionRegistry } = analysis;
  if (!symbolTables) return items;

  const scope = getScopeForContext(symbolTables, pouScope);
  if (!scope) return items;

  // Scope chain symbols: walk from local scope up to global
  const seen = new Set<string>();
  let currentScope: Scope | undefined = scope;
  let sortPriority = "1"; // local

  while (currentScope) {
    for (const sym of currentScope.getAllSymbols()) {
      const upper = sym.name.toUpperCase();
      if (seen.has(upper)) continue;
      seen.add(upper);

      if (sym.kind === "variable") {
        const varSym = sym as VariableSymbol;
        items.push(makeVariableCompletion(varSym, sortPriority));
      } else if (sym.kind === "constant") {
        items.push({
          label: sym.name,
          kind: CompletionItemKind.Constant,
          sortText: sortPriority,
        });
      } else if (sym.kind === "function") {
        items.push({
          label: sym.name,
          kind: CompletionItemKind.Function,
          detail: formatFunctionSignature(sym as FunctionSymbol),
          sortText: "4",
        });
      } else if (sym.kind === "functionBlock") {
        items.push({
          label: sym.name,
          kind: CompletionItemKind.Class,
          sortText: "4",
        });
      } else if (sym.kind === "program") {
        items.push({
          label: sym.name,
          kind: CompletionItemKind.Module,
          sortText: "4",
        });
      } else if (sym.kind === "enumValue") {
        items.push({
          label: sym.name,
          kind: CompletionItemKind.EnumMember,
          sortText: sortPriority,
        });
      } else if (sym.kind === "type") {
        items.push({
          label: sym.name,
          kind: CompletionItemKind.Struct,
          sortText: "4",
        });
      }
    }
    currentScope = currentScope.parent;
    sortPriority = currentScope?.parent ? "2" : "3"; // intermediate vs global scope
  }

  // For test files, add locally declared variables from VAR blocks
  if (testSource) {
    const testVars = extractTestVarDeclarations(stripCommentsAndStrings(testSource));
    for (const [name, varType] of testVars) {
      if (seen.has(name)) continue;
      seen.add(name);
      items.push({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: varType,
        sortText: "1",
      });
    }
  }

  // Standard library functions
  if (stdFunctionRegistry) {
    for (const fn of stdFunctionRegistry.getAll()) {
      if (seen.has(fn.name.toUpperCase())) continue;
      seen.add(fn.name.toUpperCase());
      items.push({
        label: fn.name,
        kind: CompletionItemKind.Function,
        detail: formatStdFunctionSignature(fn),
        sortText: "5",
      });
    }
  }

  return items;
}

function getStatementKeywordCompletions(): CompletionItem[] {
  return [
    {
      label: "IF",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "IF ${1:condition} THEN\n  $0\nEND_IF;",
      sortText: "0",
    },
    {
      label: "FOR",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "FOR ${1:i} := ${2:0} TO ${3:10} DO\n  $0\nEND_FOR;",
      sortText: "0",
    },
    {
      label: "WHILE",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "WHILE ${1:condition} DO\n  $0\nEND_WHILE;",
      sortText: "0",
    },
    {
      label: "REPEAT",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "REPEAT\n  $0\nUNTIL ${1:condition}\nEND_REPEAT;",
      sortText: "0",
    },
    {
      label: "CASE",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "CASE ${1:expr} OF\n  ${2:0}:\n    $0\nEND_CASE;",
      sortText: "0",
    },
    {
      label: "RETURN",
      kind: CompletionItemKind.Keyword,
      sortText: "0",
    },
    {
      label: "EXIT",
      kind: CompletionItemKind.Keyword,
      sortText: "0",
    },
  ];
}

// ---------------------------------------------------------------------------
// Test framework completions
// ---------------------------------------------------------------------------

/** Top-level completions for test files (TEST, SETUP, TEARDOWN blocks). */
function getTestTopLevelCompletions(): CompletionItem[] {
  return [
    {
      label: "TEST",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "TEST '${1:test name}'\n  $0\nEND_TEST",
      sortText: "0",
    },
    {
      label: "SETUP",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "SETUP\n  VAR\n    $0\n  END_VAR\nEND_SETUP",
      sortText: "0",
    },
    {
      label: "TEARDOWN",
      kind: CompletionItemKind.Keyword,
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "TEARDOWN\n  $0\nEND_TEARDOWN",
      sortText: "0",
    },
  ];
}

/** Body completions for inside TEST blocks (ASSERT_*, MOCK_*, ADVANCE_TIME). */
function getTestBodyCompletions(): CompletionItem[] {
  return [
    // ASSERT snippets
    {
      label: "ASSERT_EQ",
      kind: CompletionItemKind.Function,
      detail: "(actual, expected [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_EQ(${1:actual}, ${2:expected});",
      sortText: "0",
    },
    {
      label: "ASSERT_NEQ",
      kind: CompletionItemKind.Function,
      detail: "(actual, expected [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_NEQ(${1:actual}, ${2:expected});",
      sortText: "0",
    },
    {
      label: "ASSERT_TRUE",
      kind: CompletionItemKind.Function,
      detail: "(condition [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_TRUE(${1:condition});",
      sortText: "0",
    },
    {
      label: "ASSERT_FALSE",
      kind: CompletionItemKind.Function,
      detail: "(condition [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_FALSE(${1:condition});",
      sortText: "0",
    },
    {
      label: "ASSERT_GT",
      kind: CompletionItemKind.Function,
      detail: "(actual, threshold [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_GT(${1:actual}, ${2:threshold});",
      sortText: "0",
    },
    {
      label: "ASSERT_LT",
      kind: CompletionItemKind.Function,
      detail: "(actual, threshold [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_LT(${1:actual}, ${2:threshold});",
      sortText: "0",
    },
    {
      label: "ASSERT_GE",
      kind: CompletionItemKind.Function,
      detail: "(actual, threshold [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_GE(${1:actual}, ${2:threshold});",
      sortText: "0",
    },
    {
      label: "ASSERT_LE",
      kind: CompletionItemKind.Function,
      detail: "(actual, threshold [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_LE(${1:actual}, ${2:threshold});",
      sortText: "0",
    },
    {
      label: "ASSERT_NEAR",
      kind: CompletionItemKind.Function,
      detail: "(actual, expected, tolerance [, message])",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ASSERT_NEAR(${1:actual}, ${2:expected}, ${3:tolerance});",
      sortText: "0",
    },
    // MOCK snippets
    {
      label: "MOCK",
      kind: CompletionItemKind.Keyword,
      detail: "Enable mock mode for a FB instance",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "MOCK ${1:instance};",
      sortText: "0",
    },
    {
      label: "MOCK_FUNCTION",
      kind: CompletionItemKind.Keyword,
      detail: "Mock a function's return value",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "MOCK_FUNCTION ${1:FuncName} RETURNS ${2:value};",
      sortText: "0",
    },
    {
      label: "MOCK_VERIFY_CALLED",
      kind: CompletionItemKind.Function,
      detail: "(instance) — Assert FB was called",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "MOCK_VERIFY_CALLED(${1:instance});",
      sortText: "0",
    },
    {
      label: "MOCK_VERIFY_CALL_COUNT",
      kind: CompletionItemKind.Function,
      detail: "(instance, count) — Assert call count",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "MOCK_VERIFY_CALL_COUNT(${1:instance}, ${2:count});",
      sortText: "0",
    },
    // Time
    {
      label: "ADVANCE_TIME",
      kind: CompletionItemKind.Function,
      detail: "(duration) — Advance scan-cycle time",
      insertTextFormat: InsertTextFormat.Snippet,
      insertText: "ADVANCE_TIME(T#${1:100ms});",
      sortText: "0",
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVariableCompletion(
  sym: VariableSymbol,
  sortText: string,
): CompletionItem {
  const typeStr = sym.declaration?.type?.name ?? (sym.type ? typeName(sym.type) : undefined);
  return {
    label: sym.name,
    kind: CompletionItemKind.Variable,
    detail: typeStr,
    sortText,
  };
}

function formatFunctionSignature(sym: FunctionSymbol): string {
  const params = sym.parameters
    .map((p) => {
      const typeStr = p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown");
      return `${p.name}: ${typeStr}`;
    })
    .join(", ");
  const ret = sym.declaration?.returnType?.name ?? typeName(sym.returnType);
  return `(${params}) : ${ret}`;
}

function formatStdFunctionSignature(
  fn: import("strucpp").StdFunctionDescriptor,
): string {
  const params = fn.params
    .map((p) => `${p.name}: ${p.specificType ?? p.constraint}`)
    .join(", ");
  const ret = fn.specificReturnType ?? fn.returnConstraint;
  return `(${params}) : ${ret}`;
}


// ---------------------------------------------------------------------------
// Original-case restoration
// ---------------------------------------------------------------------------

/**
 * Build a case map from a single source string (used as fallback when
 * no pre-built workspace-wide case map is available, e.g., in tests).
 */
function buildCaseMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /\b([a-zA-Z_]\w*)\b/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const original = match[1];
    const upper = original.toUpperCase();
    if (!map.has(upper)) {
      map.set(upper, original);
    }
  }
  return map;
}

/**
 * Apply original casing to completion items. Restores labels and detail
 * strings from their compiler-uppercased form to match the user's source.
 * Keyword/snippet items are left unchanged (IEC keywords are conventionally
 * uppercase and their insertText wouldn't match if we changed the label).
 *
 * Uses the workspace-wide case map (built from ALL project sources during
 * analysis) when available, falling back to single-file scanning.
 */
function restoreOriginalCasing(
  items: CompletionItem[],
  source: string,
  prebuiltCaseMap?: ReadonlyMap<string, string>,
): CompletionItem[] {
  const caseMap = prebuiltCaseMap ?? buildCaseMap(source);

  for (const item of items) {
    // Skip keyword snippets — their labels must match insertText conventions
    if (item.kind === CompletionItemKind.Keyword) continue;

    const restored = caseMap.get(item.label.toUpperCase());
    if (restored) {
      item.label = restored;
    }

    // Also restore type names in detail strings (e.g., "REAL" → "Real")
    if (item.detail) {
      item.detail = item.detail.replace(
        /\b[A-Za-z_]\w*\b/g,
        (word) => caseMap.get(word.toUpperCase()) ?? word,
      );
    }
  }

  return items;
}
