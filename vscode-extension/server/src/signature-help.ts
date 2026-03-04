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

  // Scan backwards tracking paren depth
  let depth = 0;
  let commas = 0;

  for (let i = flat.length - 1; i >= 0; i--) {
    const ch = flat[i];
    if (ch === ")") {
      depth++;
    } else if (ch === "(") {
      if (depth === 0) {
        // Found the matching open paren — extract function name before it
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

  const params = inputParams.map((p) => {
    const typeStr =
      p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown");
    return ParameterInformation.create(`${p.name} : ${typeStr}`);
  });

  const paramLabels = inputParams.map((p) => {
    const typeStr =
      p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown");
    return `${p.name} : ${typeStr}`;
  });
  const retType =
    sym.declaration?.returnType?.name ?? typeName(sym.returnType);
  const sigLabel = `${sym.name}(${paramLabels.join(", ")}) : ${retType}`;

  return {
    signatures: [
      SignatureInformation.create(sigLabel, undefined, ...params),
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, params.length - 1),
  };
}

function buildFBSignature(
  fbSym: FunctionBlockSymbol,
  symbolTables: import("strucpp").SymbolTables,
  activeParameter: number,
): SignatureHelp {
  // Collect inputs for the signature
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

  const params = inputs.map((v) => {
    const typeStr =
      v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown");
    return ParameterInformation.create(`${v.name} : ${typeStr}`);
  });

  const paramLabels = inputs.map((v) => {
    const typeStr =
      v.declaration?.type?.name ?? (v.type ? typeName(v.type) : "unknown");
    return `${v.name} : ${typeStr}`;
  });
  const sigLabel = `${fbSym.name}(${paramLabels.join(", ")})`;

  return {
    signatures: [
      SignatureInformation.create(sigLabel, undefined, ...params),
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, params.length - 1),
  };
}

function buildStdFunctionSignature(
  fn: StdFunctionDescriptor,
  activeParameter: number,
): SignatureHelp {
  const params = fn.params.map((p) => {
    const typeStr = p.specificType ?? p.constraint;
    return ParameterInformation.create(`${p.name} : ${typeStr}`);
  });

  const paramLabels = fn.params.map((p) => {
    const typeStr = p.specificType ?? p.constraint;
    return `${p.name} : ${typeStr}`;
  });
  const retType = fn.specificReturnType ?? fn.returnConstraint;
  const sigLabel = `${fn.name}(${paramLabels.join(", ")}) : ${retType}`;

  return {
    signatures: [
      SignatureInformation.create(sigLabel, undefined, ...params),
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, params.length - 1),
  };
}

function buildMethodSignature(
  methodName: string,
  params: VariableSymbol[],
  activeParameter: number,
): SignatureHelp {
  const paramInfos = params.map((p) => {
    const typeStr =
      p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown");
    return ParameterInformation.create(`${p.name} : ${typeStr}`);
  });
  const paramLabels = params.map((p) => {
    const typeStr =
      p.declaration?.type?.name ?? (p.type ? typeName(p.type) : "unknown");
    return `${p.name} : ${typeStr}`;
  });
  const sigLabel = `${methodName}(${paramLabels.join(", ")})`;

  return {
    signatures: [
      SignatureInformation.create(sigLabel, undefined, ...paramInfos),
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, paramInfos.length - 1),
  };
}

function buildMethodDeclSignature(
  method: MethodDeclaration,
  activeParameter: number,
): SignatureHelp {
  // Extract input params from var blocks
  const inputs: Array<{ name: string; typeName: string }> = [];
  for (const vb of method.varBlocks) {
    if (vb.blockType === "VAR_INPUT") {
      for (const decl of vb.declarations) {
        const typeStr = decl.type?.name ?? "unknown";
        for (const name of decl.names) {
          inputs.push({ name, typeName: typeStr });
        }
      }
    }
  }

  const paramInfos = inputs.map((p) =>
    ParameterInformation.create(`${p.name} : ${p.typeName}`),
  );
  const paramLabels = inputs.map((p) => `${p.name} : ${p.typeName}`);
  const retType = method.returnType?.name;
  const sigLabel = retType
    ? `${method.name}(${paramLabels.join(", ")}) : ${retType}`
    : `${method.name}(${paramLabels.join(", ")})`;

  return {
    signatures: [
      SignatureInformation.create(sigLabel, undefined, ...paramInfos),
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, paramInfos.length - 1),
  };
}

function buildConversionSignature(
  name: string,
  convInfo: { fromType: string; toType: string },
  activeParameter: number,
): SignatureHelp {
  const param = ParameterInformation.create(`IN : ${convInfo.fromType}`);
  const sigLabel = `${name}(IN : ${convInfo.fromType}) : ${convInfo.toType}`;

  return {
    signatures: [SignatureInformation.create(sigLabel, undefined, param)],
    activeSignature: 0,
    activeParameter: Math.min(activeParameter, 0),
  };
}
