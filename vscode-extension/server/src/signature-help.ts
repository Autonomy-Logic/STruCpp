// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Signature Help Provider
 *
 * Returns parameter hints when the cursor is inside a function call.
 * Scans raw text backwards to find the enclosing call and active parameter.
 */

import {
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
} from "vscode-languageserver/node.js";
import type {
  AnalysisResult,
  FunctionSymbol,
  FunctionBlockSymbol,
  FunctionBlockType,
  VariableSymbol,
  StdFunctionDescriptor,
  MethodDeclaration,
} from "strucpp";
import { findEnclosingPOU, typeName } from "strucpp";
import { getScopeForContext } from "./resolve-symbol.js";
import { stripCommentsAndStrings } from "./lsp-utils.js";

/**
 * Get signature help for the given position.
 */
export function getSignatureHelp(
  analysis: AnalysisResult,
  fileName: string,
  line: number,
  column: number,
  source: string,
): SignatureHelp | null {
  const { symbolTables, stdFunctionRegistry } = analysis;
  if (!symbolTables) return null;

  const callInfo = findEnclosingCall(source, line, column);
  if (!callInfo) return null;

  const { functionName, objectName, activeParameter } = callInfo;

  const pouScope = analysis.ast
    ? findEnclosingPOU(analysis.ast, fileName, line, column)
    : { kind: "global" as const, name: "<global>" };

  const scope = getScopeForContext(symbolTables, pouScope);
  if (!scope) return null;

  // 1. Try method call: objectName.functionName(
  if (objectName) {
    const objVar = scope.lookup(objectName);
    if (objVar?.kind === "variable") {
      const varSym = objVar as VariableSymbol;
      const fbName =
        varSym.declaration?.type?.name ??
        (varSym.type?.typeKind === "functionBlock"
          ? (varSym.type as FunctionBlockType).name
          : undefined);
      if (fbName) {
        // Try method scope — methods have their own scope with parameters
        const methodScope = symbolTables.getMethodScope(fbName, functionName);
        if (methodScope) {
          const params = methodScope
            .getAllSymbols()
            .filter(
              (s): s is VariableSymbol =>
                s.kind === "variable" && (s as VariableSymbol).isInput,
            );
          return buildMethodSignature(functionName, params, activeParameter);
        }
        // Fall back to FB declaration methods
        const fbSym = symbolTables.lookupFunctionBlock(fbName);
        if (fbSym?.declaration?.methods) {
          const method = fbSym.declaration.methods.find(
            (m) => m.name.toUpperCase() === functionName.toUpperCase(),
          );
          if (method) {
            return buildMethodDeclSignature(method, activeParameter);
          }
        }
      }
    }
  }

  // 2. Try user function in global scope
  const globalSym = symbolTables.globalScope.lookup(functionName);
  if (globalSym?.kind === "function") {
    return buildFunctionSignature(
      globalSym as FunctionSymbol,
      symbolTables,
      activeParameter,
    );
  }

  // 3. Try FB invocation (local variable of FB type)
  const localSym = scope.lookup(functionName);
  if (localSym?.kind === "variable") {
    const varSym = localSym as VariableSymbol;
    const fbName =
      varSym.declaration?.type?.name ??
      (varSym.type?.typeKind === "functionBlock"
        ? (varSym.type as FunctionBlockType).name
        : undefined);
    if (fbName) {
      const fbSym = symbolTables.lookupFunctionBlock(fbName);
      if (fbSym) {
        return buildFBSignature(fbSym, symbolTables, activeParameter);
      }
    }
  }

  // 4. Try standard function registry
  if (stdFunctionRegistry) {
    const stdFn = stdFunctionRegistry.lookup(functionName);
    if (stdFn) {
      return buildStdFunctionSignature(stdFn, activeParameter);
    }
    // 5. Try conversion function
    const convInfo = stdFunctionRegistry.resolveConversion(functionName);
    if (convInfo) {
      return buildConversionSignature(functionName, convInfo, activeParameter);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Text scanning for enclosing call
// ---------------------------------------------------------------------------

interface CallInfo {
  functionName: string;
  objectName?: string;
  activeParameter: number;
}

/**
 * Scan backwards from cursor to find the enclosing function call.
 * Tracks paren depth and counts commas at depth 1 for activeParameter.
 * Pre-strips comments and strings so that parens/commas inside them
 * don't confuse the scan.
 */
function findEnclosingCall(
  source: string,
  line: number,
  column: number,
): CallInfo | null {
  const lines = source.split("\n");
  // Flatten source up to cursor position into a single string
  let flat = "";
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    flat += lines[i] + "\n";
  }
  if (line - 1 < lines.length) {
    flat += lines[line - 1].substring(0, column - 1);
  }

  // Strip comments and strings so enclosed parens/commas are ignored
  const cleaned = stripCommentsAndStrings(flat);

  // Scan backwards tracking paren depth
  let depth = 0;
  let commas = 0;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    const ch = cleaned[i];
    if (ch === ")") {
      depth++;
    } else if (ch === "(") {
      if (depth === 0) {
        // Found the matching open paren — extract function name before it
        // Use the original (unstripped) text for name extraction so identifiers
        // that happen to adjoin a stripped region are still found correctly.
        const before = flat.substring(0, i).trimEnd();
        const match = before.match(/([\w]+(?:\.[\w]+)?)\s*$/);
        if (!match) return null;

        const fullName = match[1];
        const dotIdx = fullName.lastIndexOf(".");
        if (dotIdx >= 0) {
          return {
            objectName: fullName.substring(0, dotIdx),
            functionName: fullName.substring(dotIdx + 1),
            activeParameter: commas,
          };
        }
        return { functionName: fullName, activeParameter: commas };
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      commas++;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared signature builder
// ---------------------------------------------------------------------------

/**
 * Build a SignatureHelp from a function name, parameter labels, optional
 * return type, and the active parameter index.
 */
function makeSignatureHelp(
  name: string,
  paramLabels: string[],
  returnType: string | undefined,
  activeParameter: number,
): SignatureHelp {
  const params = paramLabels.map((label) => ParameterInformation.create(label));
  const sigLabel = returnType
    ? `${name}(${paramLabels.join(", ")}) : ${returnType}`
    : `${name}(${paramLabels.join(", ")})`;
  return {
    signatures: [SignatureInformation.create(sigLabel, undefined, ...params)],
    activeSignature: 0,
    activeParameter: params.length > 0
      ? Math.min(activeParameter, params.length - 1)
      : 0,
  };
}

/** Format a VariableSymbol as a parameter label: `name : Type`. */
function formatParamLabel(v: VariableSymbol): string {
  const typeStr =
    v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown");
  return `${v.name} : ${typeStr}`;
}

// ---------------------------------------------------------------------------
// Signature builders
// ---------------------------------------------------------------------------

function buildFunctionSignature(
  sym: FunctionSymbol,
  symbolTables: NonNullable<AnalysisResult["symbolTables"]>,
  activeParameter: number,
): SignatureHelp {
  // Use sym.parameters if populated, otherwise fall back to function scope inputs
  let inputParams: VariableSymbol[] = sym.parameters;
  if (inputParams.length === 0) {
    const fnScope = symbolTables.getFunctionScope(sym.name);
    if (fnScope) {
      inputParams = fnScope
        .getAllSymbols()
        .filter(
          (s): s is VariableSymbol =>
            s.kind === "variable" && (s as VariableSymbol).isInput,
        );
    }
  }

  const paramLabels = inputParams.map(formatParamLabel);
  const retType =
    sym.declaration?.returnType?.name ?? typeName(sym.returnType);
  return makeSignatureHelp(sym.name, paramLabels, retType, activeParameter);
}

function buildFBSignature(
  fbSym: FunctionBlockSymbol,
  symbolTables: import("strucpp").SymbolTables,
  activeParameter: number,
): SignatureHelp {
  let inputs: VariableSymbol[] = fbSym.inputs;

  // Fall back to FB scope if inputs array is empty
  if (inputs.length === 0) {
    const fbScope = symbolTables.getFBScope(fbSym.name);
    if (fbScope) {
      inputs = fbScope
        .getAllSymbols()
        .filter(
          (s): s is VariableSymbol => s.kind === "variable" && (s as VariableSymbol).isInput,
        );
    }
  }

  const paramLabels = inputs.map(formatParamLabel);
  return makeSignatureHelp(fbSym.name, paramLabels, undefined, activeParameter);
}

function buildStdFunctionSignature(
  fn: StdFunctionDescriptor,
  activeParameter: number,
): SignatureHelp {
  const paramLabels = fn.params.map(
    (p) => `${p.name} : ${p.specificType ?? p.constraint}`,
  );
  const retType = fn.specificReturnType ?? fn.returnConstraint;
  return makeSignatureHelp(fn.name, paramLabels, retType, activeParameter);
}

function buildMethodSignature(
  methodName: string,
  params: VariableSymbol[],
  activeParameter: number,
): SignatureHelp {
  const paramLabels = params.map(formatParamLabel);
  return makeSignatureHelp(methodName, paramLabels, undefined, activeParameter);
}

function buildMethodDeclSignature(
  method: MethodDeclaration,
  activeParameter: number,
): SignatureHelp {
  // Extract input params from var blocks
  const inputs: string[] = [];
  for (const vb of method.varBlocks) {
    if (vb.blockType === "VAR_INPUT") {
      for (const decl of vb.declarations) {
        const typeStr = decl.type?.name ?? "unknown";
        for (const name of decl.names) {
          inputs.push(`${name} : ${typeStr}`);
        }
      }
    }
  }

  const retType = method.returnType?.name;
  return makeSignatureHelp(method.name, inputs, retType ?? undefined, activeParameter);
}

function buildConversionSignature(
  name: string,
  convInfo: { fromType: string; toType: string },
  activeParameter: number,
): SignatureHelp {
  return makeSignatureHelp(
    name,
    [`IN : ${convInfo.fromType}`],
    convInfo.toType,
    activeParameter,
  );
}
