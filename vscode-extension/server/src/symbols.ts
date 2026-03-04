// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Document Symbols Provider
 *
 * Maps compiler AST to LSP DocumentSymbol[] for the outline panel,
 * and SymbolInformation[] for workspace symbol search.
 */

import {
  DocumentSymbol,
  SymbolKind,
  SymbolInformation,
} from "vscode-languageserver/node.js";
import type {
  AnalysisResult,
  CompilationUnit,
  ProgramDeclaration,
  FunctionDeclaration,
  FunctionBlockDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  TypeDeclaration,
  VarBlock,
  VarDeclaration,
  StructDefinition,
  EnumDefinition,
  EnumMember,
} from "strucpp";
import { sourceSpanToRange } from "./lsp-utils.js";

/**
 * Get document symbols for a single file's analysis result.
 * When fileName is provided, only returns symbols defined in that file.
 */
export function getDocumentSymbols(
  analysis: AnalysisResult,
  fileName?: string,
): DocumentSymbol[] {
  const { ast } = analysis;
  if (!ast) return [];

  const symbols: DocumentSymbol[] = [];

  const inFile = (span?: { file?: string }) =>
    !fileName || !span?.file || span.file === fileName;

  for (const prog of ast.programs) {
    if (inFile(prog.sourceSpan)) symbols.push(buildProgramSymbol(prog));
  }
  for (const func of ast.functions) {
    if (inFile(func.sourceSpan)) symbols.push(buildFunctionSymbol(func));
  }
  for (const fb of ast.functionBlocks) {
    if (inFile(fb.sourceSpan)) symbols.push(buildFBSymbol(fb));
  }
  for (const iface of ast.interfaces) {
    if (inFile(iface.sourceSpan)) symbols.push(buildInterfaceSymbol(iface));
  }
  for (const type of ast.types) {
    if (inFile(type.sourceSpan)) symbols.push(buildTypeSymbol(type));
  }
  for (const varBlock of ast.globalVarBlocks) {
    if (inFile(varBlock.sourceSpan)) symbols.push(...buildVarBlockSymbols(varBlock));
  }

  return symbols;
}

/**
 * Get workspace symbols matching a query across all analyses.
 */
export function getWorkspaceSymbols(
  allAnalyses: Map<string, AnalysisResult>,
  query: string,
): SymbolInformation[] {
  const results: SymbolInformation[] = [];
  const upperQuery = query.toUpperCase();

  for (const [uri, analysis] of allAnalyses) {
    const symbols = getDocumentSymbols(analysis);
    collectFlatSymbols(symbols, uri, upperQuery, results);
  }

  return results;
}

// ---------------------------------------------------------------------------
// POU builders
// ---------------------------------------------------------------------------

function buildProgramSymbol(prog: ProgramDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(prog.sourceSpan);
  const children: DocumentSymbol[] = [];

  for (const vb of prog.varBlocks) {
    children.push(...buildVarBlockSymbols(vb));
  }

  return DocumentSymbol.create(
    prog.name,
    "PROGRAM",
    SymbolKind.Module,
    range,
    range,
    children,
  );
}

function buildFunctionSymbol(func: FunctionDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(func.sourceSpan);
  const children: DocumentSymbol[] = [];

  for (const vb of func.varBlocks) {
    children.push(...buildVarBlockSymbols(vb));
  }

  return DocumentSymbol.create(
    func.name,
    `: ${func.returnType.name}`,
    SymbolKind.Function,
    range,
    range,
    children,
  );
}

function buildFBSymbol(fb: FunctionBlockDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(fb.sourceSpan);
  const children: DocumentSymbol[] = [];

  for (const vb of fb.varBlocks) {
    children.push(...buildVarBlockSymbols(vb));
  }
  for (const method of fb.methods) {
    children.push(buildMethodSymbol(method));
  }
  for (const prop of fb.properties) {
    children.push(buildPropertySymbol(prop));
  }

  let detail = "FUNCTION_BLOCK";
  if (fb.extends) detail += ` EXTENDS ${fb.extends}`;
  if (fb.implements?.length) detail += ` IMPLEMENTS ${fb.implements.join(", ")}`;

  return DocumentSymbol.create(
    fb.name,
    detail,
    SymbolKind.Class,
    range,
    range,
    children,
  );
}

function buildInterfaceSymbol(iface: InterfaceDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(iface.sourceSpan);
  const children: DocumentSymbol[] = [];

  for (const method of iface.methods) {
    children.push(buildMethodSymbol(method));
  }

  return DocumentSymbol.create(
    iface.name,
    "INTERFACE",
    SymbolKind.Interface,
    range,
    range,
    children,
  );
}

function buildMethodSymbol(method: MethodDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(method.sourceSpan);
  const children: DocumentSymbol[] = [];

  for (const vb of method.varBlocks) {
    children.push(...buildVarBlockSymbols(vb));
  }

  const detail = method.returnType ? `: ${method.returnType.name}` : "";

  return DocumentSymbol.create(
    method.name,
    detail,
    SymbolKind.Method,
    range,
    range,
    children,
  );
}

function buildPropertySymbol(prop: PropertyDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(prop.sourceSpan);
  return DocumentSymbol.create(
    prop.name,
    `: ${prop.type.name}`,
    SymbolKind.Property,
    range,
    range,
  );
}

// ---------------------------------------------------------------------------
// Type builders
// ---------------------------------------------------------------------------

function buildTypeSymbol(type: TypeDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(type.sourceSpan);
  const def = type.definition;

  switch (def.kind) {
    case "StructDefinition": {
      const sd = def as StructDefinition;
      const children = sd.fields.map((f) => buildFieldSymbol(f));
      return DocumentSymbol.create(
        type.name,
        "STRUCT",
        SymbolKind.Struct,
        range,
        range,
        children,
      );
    }
    case "EnumDefinition": {
      const ed = def as EnumDefinition;
      const children = ed.members.map((m) => buildEnumMemberSymbol(m));
      return DocumentSymbol.create(
        type.name,
        "ENUM",
        SymbolKind.Enum,
        range,
        range,
        children,
      );
    }
    default:
      return DocumentSymbol.create(
        type.name,
        "TYPE",
        SymbolKind.TypeParameter,
        range,
        range,
      );
  }
}

function buildFieldSymbol(field: VarDeclaration): DocumentSymbol {
  const range = sourceSpanToRange(field.sourceSpan);
  const name = field.names.join(", ");
  return DocumentSymbol.create(
    name,
    `: ${field.type.name}`,
    SymbolKind.Field,
    range,
    range,
  );
}

function buildEnumMemberSymbol(member: EnumMember): DocumentSymbol {
  const range = sourceSpanToRange(member.sourceSpan);
  return DocumentSymbol.create(
    member.name,
    "",
    SymbolKind.EnumMember,
    range,
    range,
  );
}

// ---------------------------------------------------------------------------
// Variable block helpers
// ---------------------------------------------------------------------------

function buildVarBlockSymbols(vb: VarBlock): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const symbolKind = varBlockToSymbolKind(vb.blockType);

  for (const decl of vb.declarations) {
    const range = sourceSpanToRange(decl.sourceSpan);
    for (const name of decl.names) {
      symbols.push(
        DocumentSymbol.create(
          name,
          `: ${formatTypeName(decl)}`,
          symbolKind,
          range,
          range,
        ),
      );
    }
  }

  return symbols;
}

function varBlockToSymbolKind(
  blockType: string,
): SymbolKind {
  switch (blockType) {
    case "VAR_INPUT":
    case "VAR_OUTPUT":
    case "VAR_IN_OUT":
      return SymbolKind.Property;
    case "VAR_GLOBAL":
    case "VAR_EXTERNAL":
      return SymbolKind.Variable;
    default:
      return SymbolKind.Variable;
  }
}

function formatTypeName(decl: VarDeclaration): string {
  let name = decl.type.name;
  if (decl.type.isReference) {
    const prefix =
      decl.type.referenceKind === "pointer_to"
        ? "POINTER TO "
        : "REF_TO ";
    name = prefix + name;
  }
  if (decl.type.maxLength != null) {
    name += `(${decl.type.maxLength})`;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Workspace symbol flattening
// ---------------------------------------------------------------------------

function collectFlatSymbols(
  symbols: DocumentSymbol[],
  uri: string,
  upperQuery: string,
  results: SymbolInformation[],
  containerName?: string,
): void {
  for (const sym of symbols) {
    if (upperQuery === "" || sym.name.toUpperCase().includes(upperQuery)) {
      const info: SymbolInformation = {
        name: sym.name,
        kind: sym.kind,
        location: { uri, range: sym.range },
        ...(containerName ? { containerName } : {}),
      };
      results.push(info);
    }
    if (sym.children) {
      collectFlatSymbols(sym.children, uri, upperQuery, results, sym.name);
    }
  }
}
