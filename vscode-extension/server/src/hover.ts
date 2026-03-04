// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Hover Provider
 *
 * Returns markdown hover information for the symbol at cursor position.
 */

import { Hover, MarkupKind } from "vscode-languageserver/node.js";
import type {
  AnalysisResult,
  VariableSymbol,
  ConstantSymbol,
  FunctionSymbol,
  FunctionBlockSymbol,
  ProgramSymbol,
  TypeSymbol,
  EnumValueSymbol,
  LiteralExpression,
  TypedNode,
  StdFunctionDescriptor,
  SymbolTables,
} from "strucpp";
import { typeName } from "strucpp";
import { resolveSymbolAtPosition } from "./resolve-symbol.js";
import { sourceSpanToRange } from "./lsp-utils.js";

/**
 * Get hover information for the given position.
 */
export function getHover(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
): Hover | null {
  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved) return null;

  const { node, symbol, stdFunction } = resolved;

  // Standard function
  if (stdFunction) {
    return makeHover(formatStdFunction(stdFunction));
  }

  // Symbol-based hover
  if (symbol) {
    const md = formatSymbol(symbol, analysis.symbolTables);
    if (md) {
      return {
        contents: { kind: MarkupKind.Markdown, value: md },
        range: node.sourceSpan ? sourceSpanToRange(node.sourceSpan) : undefined,
      };
    }
  }

  // Literal expression
  if (node.kind === "LiteralExpression") {
    const lit = node as LiteralExpression;
    const typeInfo = lit.resolvedType ? typeName(lit.resolvedType) : lit.literalType;
    return makeHover(`\`\`\`\n${typeInfo}: ${lit.rawValue}\n\`\`\``);
  }

  // Any typed expression with resolvedType
  const typed = node as TypedNode;
  if (typed.resolvedType) {
    return makeHover(`\`\`\`\n${typeName(typed.resolvedType)}\n\`\`\``);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function makeHover(markdown: string): Hover {
  return { contents: { kind: MarkupKind.Markdown, value: markdown } };
}

function formatSymbol(
  symbol: NonNullable<ReturnType<typeof resolveSymbolAtPosition>>["symbol"],
  symbolTables?: SymbolTables,
): string | null {
  if (!symbol) return null;

  switch (symbol.kind) {
    case "variable":
      return formatVariable(symbol as VariableSymbol, symbolTables);
    case "constant":
      return formatConstant(symbol as ConstantSymbol);
    case "function":
      return formatFunction(symbol as FunctionSymbol);
    case "functionBlock":
      return formatFunctionBlock(symbol as FunctionBlockSymbol);
    case "program":
      return formatProgram(symbol as ProgramSymbol);
    case "type":
      return formatType(symbol as TypeSymbol);
    case "enumValue":
      return formatEnumValue(symbol as EnumValueSymbol);
    default:
      return null;
  }
}

function formatVariable(sym: VariableSymbol, symbolTables?: SymbolTables): string {
  const qualifier = sym.isInput
    ? "VAR_INPUT"
    : sym.isOutput
      ? "VAR_OUTPUT"
      : sym.isInOut
        ? "VAR_IN_OUT"
        : sym.isGlobal
          ? "VAR_GLOBAL"
          : sym.isExternal
            ? "VAR_EXTERNAL"
            : "VAR";
  const typStr = sym.declaration?.type?.name ?? (sym.type ? typeName(sym.type) : "unknown");
  let result = `\`\`\`\n${qualifier} ${sym.name} : ${typStr}\n\`\`\``;
  if (sym.address) {
    result += `\n\nAddress: \`${sym.address}\``;
  }

  // Expand FB type details
  if (symbolTables) {
    const fbSym = symbolTables.lookupFunctionBlock(typStr);
    if (fbSym) {
      result += expandFBDetails(fbSym, symbolTables);
    } else {
      // Expand struct type details
      const typeSym = symbolTables.lookupType(typStr);
      if (typeSym?.declaration?.definition?.kind === "StructDefinition") {
        const fields = typeSym.declaration.definition.fields;
        const fieldLines = fields
          .map((f: { names: string[]; type: { name: string } }) =>
            `  ${f.names.join(", ")} : ${f.type.name}`,
          )
          .join("\n");
        result += `\n\n**${typStr}**\n\`\`\`\nSTRUCT\n${fieldLines}\nEND_STRUCT\n\`\`\``;
      }
    }
  }

  return result;
}

function expandFBDetails(fbSym: FunctionBlockSymbol, symbolTables?: SymbolTables): string {
  const parts: string[] = [];

  // Try inputs/outputs from the symbol first
  if (fbSym.inputs.length > 0 || fbSym.outputs.length > 0) {
    for (const v of fbSym.inputs) {
      parts.push(`  VAR_INPUT ${v.name} : ${v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown")}`);
    }
    for (const v of fbSym.outputs) {
      parts.push(`  VAR_OUTPUT ${v.name} : ${v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown")}`);
    }
  } else if (symbolTables) {
    // Fall back to the FB scope (semantic analyzer may store vars only there)
    const fbScope = symbolTables.getFBScope(fbSym.name);
    if (fbScope) {
      for (const sym of fbScope.getAllSymbols()) {
        if (sym.kind !== "variable") continue;
        const varSym = sym as VariableSymbol;
        const typeStr = varSym.declaration?.type?.name ?? (varSym.type ? typeName(varSym.type) : "unknown");
        if (varSym.isInput) {
          parts.push(`  VAR_INPUT ${varSym.name} : ${typeStr}`);
        } else if (varSym.isOutput) {
          parts.push(`  VAR_OUTPUT ${varSym.name} : ${typeStr}`);
        } else if (varSym.isInOut) {
          parts.push(`  VAR_IN_OUT ${varSym.name} : ${typeStr}`);
        }
      }
    }
  }

  if (parts.length === 0) return "";
  return `\n\n**${fbSym.name}**\n\`\`\`\n${parts.join("\n")}\n\`\`\``;
}

function formatConstant(sym: ConstantSymbol): string {
  const typeStr = sym.declaration?.type?.name ?? (sym.type ? typeName(sym.type) : "unknown");
  let result = `\`\`\`\nVAR CONSTANT ${sym.name} : ${typeStr}\n\`\`\``;
  if (sym.value !== undefined) {
    result += `\n\nValue: \`${String(sym.value)}\``;
  }
  return result;
}

function formatFunction(sym: FunctionSymbol): string {
  const params = sym.parameters
    .map((p) => {
      const qualifier = p.isInput ? "" : p.isOutput ? "VAR_OUTPUT " : p.isInOut ? "VAR_IN_OUT " : "";
      const typeStr = p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown");
      return `${qualifier}${p.name} : ${typeStr}`;
    })
    .join("; ");
  const retType = sym.declaration?.returnType?.name ?? typeName(sym.returnType);
  return `\`\`\`\nFUNCTION ${sym.name}(${params}) : ${retType}\n\`\`\``;
}

function formatFunctionBlock(sym: FunctionBlockSymbol): string {
  const lines: string[] = [`FUNCTION_BLOCK ${sym.name}`];
  if (sym.inputs.length > 0) {
    lines.push(
      ...sym.inputs.map(
        (v) => `  VAR_INPUT ${v.name} : ${v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown")}`,
      ),
    );
  }
  if (sym.outputs.length > 0) {
    lines.push(
      ...sym.outputs.map(
        (v) => `  VAR_OUTPUT ${v.name} : ${v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown")}`,
      ),
    );
  }
  return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

function formatProgram(sym: ProgramSymbol): string {
  return `\`\`\`\nPROGRAM ${sym.name}\n\`\`\``;
}

function formatType(sym: TypeSymbol): string {
  // Use the declaration's definition kind rather than resolvedType.typeKind,
  // because the compiler stores user-defined types as {typeKind: "elementary"}
  const defKind = sym.declaration?.definition?.kind;

  if (defKind === "StructDefinition") {
    const fields = sym.declaration.definition.fields;
    const fieldLines = fields
      .map((f: { names: string[]; type: { name: string } }) =>
        `  ${f.names.join(", ")} : ${f.type.name}`,
      )
      .join("\n");
    return `\`\`\`\nTYPE ${sym.name} : STRUCT\n${fieldLines}\nEND_STRUCT\n\`\`\``;
  }

  if (defKind === "EnumDefinition") {
    const members = sym.declaration.definition.members
      .map((m: { name: string }) => m.name)
      .join(", ");
    return `\`\`\`\nTYPE ${sym.name} : (${members})\n\`\`\``;
  }

  if (defKind === "ArrayDefinition") {
    const elemType = sym.declaration.definition.elementType?.name ?? "unknown";
    return `\`\`\`\nTYPE ${sym.name} : ARRAY OF ${elemType}\n\`\`\``;
  }

  if (defKind === "SubrangeDefinition") {
    const baseType = sym.declaration.definition.baseType?.name ?? "unknown";
    return `\`\`\`\nTYPE ${sym.name} : ${baseType}(..)\n\`\`\``;
  }

  // Type alias
  if (defKind === "TypeReference") {
    return `\`\`\`\nTYPE ${sym.name} : ${sym.declaration.definition.name}\n\`\`\``;
  }

  // Fallback
  const resolved = sym.resolvedType;
  if (resolved) {
    return `\`\`\`\nTYPE ${sym.name} : ${typeName(resolved)}\n\`\`\``;
  }
  return `\`\`\`\nTYPE ${sym.name}\n\`\`\``;
}

function formatEnumValue(sym: EnumValueSymbol): string {
  return `\`\`\`\n${sym.enumType}#${sym.name} (= ${sym.value})\n\`\`\``;
}

function formatStdFunction(fn: StdFunctionDescriptor): string {
  const params = fn.params
    .map((p) => {
      const typeStr = p.specificType ?? p.constraint;
      return `${p.name} : ${typeStr}`;
    })
    .join("; ");
  const retType = fn.specificReturnType ?? fn.returnConstraint;
  let result = `\`\`\`\nFUNCTION ${fn.name}(${params}) : ${retType}\n\`\`\``;
  result += `\n\nCategory: ${fn.category}`;
  if (fn.isVariadic) result += " (variadic)";
  return result;
}
