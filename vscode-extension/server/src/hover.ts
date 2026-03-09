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
import { resolveSymbolAtPosition, lookupSymbolByName } from "./resolve-symbol.js";
import { sourceSpanToRange, restoreCase } from "./lsp-utils.js";
import { isTestFile, getWordAt } from "../../shared/test-utils.js";

/** Shorthand: restore casing via the case map. */
type CaseMap = ReadonlyMap<string, string>;

/**
 * Get hover information for the given position.
 */
export function getHover(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  caseMap?: CaseMap,
  source?: string,
): Hover | null {
  // Check for test framework keyword hover first
  if (source && isTestFile(source)) {
    const testHover = getTestKeywordHover(source, line, column);
    if (testHover) return testHover;
  }

  const resolved = resolveSymbolAtPosition(analysis, fileName, line, column);
  if (!resolved) {
    // For test files the AST is empty (no standard-parser nodes), so fall back
    // to text-based word extraction and direct symbol table lookup.
    if (source && isTestFile(source) && analysis.symbolTables) {
      return getTestSymbolHover(source, line, column, analysis.symbolTables, caseMap);
    }
    return null;
  }

  const { node, symbol, stdFunction } = resolved;
  const rc = (name: string) => restoreCase(name, caseMap);

  // Standard function
  if (stdFunction) {
    return makeHover(formatStdFunction(stdFunction));
  }

  // Symbol-based hover
  if (symbol) {
    const md = formatSymbol(symbol, analysis.symbolTables, rc);
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

type RestoreFn = (name: string) => string;

function makeHover(markdown: string): Hover {
  return { contents: { kind: MarkupKind.Markdown, value: markdown } };
}

function formatSymbol(
  symbol: NonNullable<ReturnType<typeof resolveSymbolAtPosition>>["symbol"],
  symbolTables: SymbolTables | undefined,
  rc: RestoreFn,
): string | null {
  if (!symbol) return null;

  switch (symbol.kind) {
    case "variable":
      return formatVariable(symbol as VariableSymbol, symbolTables, rc);
    case "constant":
      return formatConstant(symbol as ConstantSymbol, rc);
    case "function":
      return formatFunction(symbol as FunctionSymbol, rc);
    case "functionBlock":
      return formatFunctionBlock(symbol as FunctionBlockSymbol, symbolTables, rc);
    case "program":
      return formatProgram(symbol as ProgramSymbol, rc);
    case "type":
      return formatType(symbol as TypeSymbol, rc);
    case "enumValue":
      return formatEnumValue(symbol as EnumValueSymbol, rc);
    default:
      return null;
  }
}

function formatVariable(sym: VariableSymbol, symbolTables: SymbolTables | undefined, rc: RestoreFn): string {
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
  const typStr = rc(sym.declaration?.type?.name ?? (sym.type ? typeName(sym.type) : "unknown"));
  let result = `\`\`\`\n${qualifier} ${rc(sym.name)} : ${typStr}\n\`\`\``;
  if (sym.address) {
    result += `\n\nAddress: \`${sym.address}\``;
  }

  // Expand FB type details
  if (symbolTables) {
    const fbSym = symbolTables.lookupFunctionBlock(typStr);
    if (fbSym) {
      result += expandFBDetails(fbSym, symbolTables, rc);
    } else {
      // Expand struct type details
      const typeSym = symbolTables.lookupType(typStr);
      if (typeSym?.declaration?.definition?.kind === "StructDefinition") {
        const fields = typeSym.declaration.definition.fields ?? [];
        const fieldLines = fields
          .map((f: { names: string[]; type: { name: string } }) =>
            `  ${f.names.map(rc).join(", ")} : ${rc(f.type.name)}`,
          )
          .join("\n");
        result += `\n\n**${rc(typStr)}**\n\`\`\`\nSTRUCT\n${fieldLines}\nEND_STRUCT\n\`\`\``;
      }
    }
  }

  return result;
}

function expandFBDetails(fbSym: FunctionBlockSymbol, symbolTables: SymbolTables | undefined, rc: RestoreFn): string {
  const parts: string[] = [];

  // Try inputs/outputs from the symbol first
  if (fbSym.inputs.length > 0 || fbSym.outputs.length > 0) {
    for (const v of fbSym.inputs) {
      parts.push(`  VAR_INPUT ${rc(v.name)} : ${rc(v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown"))}`);
    }
    for (const v of fbSym.outputs) {
      parts.push(`  VAR_OUTPUT ${rc(v.name)} : ${rc(v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown"))}`);
    }
  } else if (symbolTables) {
    // Fall back to the FB scope (semantic analyzer may store vars only there)
    const fbScope = symbolTables.getFBScope(fbSym.name);
    if (fbScope) {
      for (const s of fbScope.getAllSymbols()) {
        if (s.kind !== "variable") continue;
        const varSym = s as VariableSymbol;
        const typeStr = rc(varSym.declaration?.type?.name ?? (varSym.type ? typeName(varSym.type) : "unknown"));
        if (varSym.isInput) {
          parts.push(`  VAR_INPUT ${rc(varSym.name)} : ${typeStr}`);
        } else if (varSym.isOutput) {
          parts.push(`  VAR_OUTPUT ${rc(varSym.name)} : ${typeStr}`);
        } else if (varSym.isInOut) {
          parts.push(`  VAR_IN_OUT ${rc(varSym.name)} : ${typeStr}`);
        }
      }
    }
  }

  if (parts.length === 0) return "";
  return `\n\n**${rc(fbSym.name)}**\n\`\`\`\n${parts.join("\n")}\n\`\`\``;
}

function formatConstant(sym: ConstantSymbol, rc: RestoreFn): string {
  const typeStr = rc(sym.declaration?.type?.name ?? (sym.type ? typeName(sym.type) : "unknown"));
  let result = `\`\`\`\nVAR CONSTANT ${rc(sym.name)} : ${typeStr}\n\`\`\``;
  if (sym.value !== undefined) {
    result += `\n\nValue: \`${String(sym.value)}\``;
  }
  return result;
}

function formatFunction(sym: FunctionSymbol, rc: RestoreFn): string {
  const params = (sym.parameters ?? [])
    .map((p) => {
      const qualifier = p.isInput ? "" : p.isOutput ? "VAR_OUTPUT " : p.isInOut ? "VAR_IN_OUT " : "";
      const typeStr = rc(p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown"));
      return `${qualifier}${rc(p.name)} : ${typeStr}`;
    })
    .join("; ");
  const retType = rc(sym.declaration?.returnType?.name ?? typeName(sym.returnType));
  return `\`\`\`\nFUNCTION ${rc(sym.name)}(${params}) : ${retType}\n\`\`\``;
}

function formatFunctionBlock(sym: FunctionBlockSymbol, symbolTables: SymbolTables | undefined, rc: RestoreFn): string {
  const lines: string[] = [`FUNCTION_BLOCK ${rc(sym.name)}`];
  if (sym.inputs.length > 0 || sym.outputs.length > 0) {
    for (const v of sym.inputs) {
      lines.push(`  VAR_INPUT ${rc(v.name)} : ${rc(v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown"))}`);
    }
    for (const v of sym.outputs) {
      lines.push(`  VAR_OUTPUT ${rc(v.name)} : ${rc(v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown"))}`);
    }
  } else if (symbolTables) {
    const fbScope = symbolTables.getFBScope(sym.name);
    if (fbScope) {
      for (const s of fbScope.getAllSymbols()) {
        if (s.kind !== "variable") continue;
        const varSym = s as VariableSymbol;
        const typeStr = rc(varSym.declaration?.type?.name ?? (varSym.type ? typeName(varSym.type) : "unknown"));
        if (varSym.isInput) {
          lines.push(`  VAR_INPUT ${rc(varSym.name)} : ${typeStr}`);
        } else if (varSym.isOutput) {
          lines.push(`  VAR_OUTPUT ${rc(varSym.name)} : ${typeStr}`);
        } else if (varSym.isInOut) {
          lines.push(`  VAR_IN_OUT ${rc(varSym.name)} : ${typeStr}`);
        }
      }
    }
  }
  return `\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

function formatProgram(sym: ProgramSymbol, rc: RestoreFn): string {
  return `\`\`\`\nPROGRAM ${rc(sym.name)}\n\`\`\``;
}

function formatType(sym: TypeSymbol, rc: RestoreFn): string {
  const defKind = sym.declaration?.definition?.kind;

  if (defKind === "StructDefinition") {
    const fields = sym.declaration.definition.fields ?? [];
    const fieldLines = fields
      .map((f: { names: string[]; type: { name: string } }) =>
        `  ${f.names.map(rc).join(", ")} : ${rc(f.type.name)}`,
      )
      .join("\n");
    return `\`\`\`\nTYPE ${rc(sym.name)} : STRUCT\n${fieldLines}\nEND_STRUCT\n\`\`\``;
  }

  if (defKind === "EnumDefinition") {
    const members = (sym.declaration.definition.members ?? [])
      .map((m: { name: string }) => rc(m.name))
      .join(", ");
    return `\`\`\`\nTYPE ${rc(sym.name)} : (${members})\n\`\`\``;
  }

  if (defKind === "ArrayDefinition") {
    const elemType = rc(sym.declaration.definition.elementType?.name ?? "unknown");
    return `\`\`\`\nTYPE ${rc(sym.name)} : ARRAY OF ${elemType}\n\`\`\``;
  }

  if (defKind === "SubrangeDefinition") {
    const baseType = rc(sym.declaration.definition.baseType?.name ?? "unknown");
    return `\`\`\`\nTYPE ${rc(sym.name)} : ${baseType}(..)\n\`\`\``;
  }

  if (defKind === "TypeReference") {
    return `\`\`\`\nTYPE ${rc(sym.name)} : ${rc(sym.declaration.definition.name)}\n\`\`\``;
  }

  const resolved = sym.resolvedType;
  if (resolved) {
    return `\`\`\`\nTYPE ${rc(sym.name)} : ${typeName(resolved)}\n\`\`\``;
  }
  return `\`\`\`\nTYPE ${rc(sym.name)}\n\`\`\``;
}

function formatEnumValue(sym: EnumValueSymbol, rc: RestoreFn): string {
  return `\`\`\`\n${rc(sym.enumType)}#${rc(sym.name)} (= ${sym.value})\n\`\`\``;
}

function formatStdFunction(fn: StdFunctionDescriptor): string {
  const params = (fn.params ?? [])
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

// ---------------------------------------------------------------------------
// Test framework keyword hover
// ---------------------------------------------------------------------------

/** Map of test framework keywords → hover documentation. */
const TEST_KEYWORD_HOVER: Record<string, string> = {
  ASSERT_EQ:
    "```\nASSERT_EQ(actual: ANY, expected: ANY [, message: STRING])\n```\n\nAssert that `actual` equals `expected`. Shows diff view on failure.",
  ASSERT_NEQ:
    "```\nASSERT_NEQ(actual: ANY, expected: ANY [, message: STRING])\n```\n\nAssert that `actual` does not equal `expected`.",
  ASSERT_TRUE:
    "```\nASSERT_TRUE(condition: BOOL [, message: STRING])\n```\n\nAssert that `condition` is TRUE.",
  ASSERT_FALSE:
    "```\nASSERT_FALSE(condition: BOOL [, message: STRING])\n```\n\nAssert that `condition` is FALSE.",
  ASSERT_GT:
    "```\nASSERT_GT(actual: ANY_NUM, threshold: ANY_NUM [, message: STRING])\n```\n\nAssert that `actual` is greater than `threshold`.",
  ASSERT_LT:
    "```\nASSERT_LT(actual: ANY_NUM, threshold: ANY_NUM [, message: STRING])\n```\n\nAssert that `actual` is less than `threshold`.",
  ASSERT_GE:
    "```\nASSERT_GE(actual: ANY_NUM, threshold: ANY_NUM [, message: STRING])\n```\n\nAssert that `actual` is greater than or equal to `threshold`.",
  ASSERT_LE:
    "```\nASSERT_LE(actual: ANY_NUM, threshold: ANY_NUM [, message: STRING])\n```\n\nAssert that `actual` is less than or equal to `threshold`.",
  ASSERT_NEAR:
    "```\nASSERT_NEAR(actual: ANY_REAL, expected: ANY_REAL, tolerance: ANY_REAL [, message: STRING])\n```\n\nAssert that `actual` is within `tolerance` of `expected`.",
  MOCK:
    "```\nMOCK instance\n```\n\nEnable mock mode for a function block instance. Calls are recorded but the FB body is not executed.",
  MOCK_FUNCTION:
    "```\nMOCK_FUNCTION FuncName RETURNS value\n```\n\nMock a function to return a fixed value instead of executing.",
  MOCK_VERIFY_CALLED:
    "```\nMOCK_VERIFY_CALLED(instance)\n```\n\nAssert that the mocked function block instance was called at least once.",
  MOCK_VERIFY_CALL_COUNT:
    "```\nMOCK_VERIFY_CALL_COUNT(instance, count: INT)\n```\n\nAssert that the mocked function block instance was called exactly `count` times.",
  ADVANCE_TIME:
    "```\nADVANCE_TIME(duration: TIME)\n```\n\nAdvance the scan-cycle time by `duration`. Affects TON/TOF/TP timers.",
  TEST:
    "```\nTEST 'name'\n  (* test body *)\nEND_TEST\n```\n\nDefine a test case. Each TEST block runs independently with its own SETUP/TEARDOWN cycle.",
  END_TEST:
    "```\nEND_TEST\n```\n\nEnd of a TEST block.",
  SETUP:
    "```\nSETUP\n  VAR ... END_VAR\nEND_SETUP\n```\n\nSetup block executed before each TEST. Declare shared test variables here.",
  TEARDOWN:
    "```\nTEARDOWN\n  (* cleanup *)\nEND_TEARDOWN\n```\n\nTeardown block executed after each TEST. Clean up resources here.",
  END_SETUP: "```\nEND_SETUP\n```\n\nEnd of a SETUP block.",
  END_TEARDOWN: "```\nEND_TEARDOWN\n```\n\nEnd of a TEARDOWN block.",
};

/**
 * Check if the cursor is on a test framework keyword and return hover info.
 */
function getTestKeywordHover(
  source: string,
  line: number,
  column: number,
): Hover | null {
  const hit = getWordAt(source, line, column);
  if (!hit) return null;
  const doc = TEST_KEYWORD_HOVER[hit.word.toUpperCase()];
  return doc ? makeHover(doc) : null;
}

/**
 * Text-based symbol hover for test files. Since the standard parser doesn't
 * produce AST nodes for test source, we extract the word under the cursor
 * and look it up directly in the symbol tables (types, FBs, functions, etc.).
 */
function getTestSymbolHover(
  source: string,
  line: number,
  column: number,
  symbolTables: NonNullable<AnalysisResult["symbolTables"]>,
  caseMap?: CaseMap,
): Hover | null {
  const hit = getWordAt(source, line, column);
  if (!hit) return null;

  const name = hit.word.toUpperCase();
  const symbol = lookupSymbolByName(name, symbolTables);
  if (!symbol) return null;

  const rc = (n: string) => restoreCase(n, caseMap);
  const md = formatSymbol(symbol, symbolTables, rc);
  return md ? makeHover(md) : null;
}
