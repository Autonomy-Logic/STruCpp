// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * AST Traversal Utilities
 *
 * General-purpose utilities for walking and querying the AST.
 * Used by the LSP server for hover, go-to-definition, find references, etc.
 */

import type {
  ASTNode,
  CompilationUnit,
  Expression,
  VarBlock,
  VarDeclaration,
  ProgramDeclaration,
  FunctionDeclaration,
  FunctionBlockDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  PropertyDeclaration,
  ConfigurationDeclaration,
  ResourceDeclaration,
  TaskDeclaration,
  TypeDeclaration,
  StructDefinition,
  EnumDefinition,
  EnumMember,
  SubrangeDefinition,
  ArrayDefinition,
  ArrayDimension,
  AssignmentStatement,
  RefAssignStatement,
  IfStatement,
  ElsifClause,
  CaseStatement,
  CaseElement,
  CaseLabel,
  ForStatement,
  WhileStatement,
  RepeatStatement,
  FunctionCallStatement,
  DeleteStatement,
  BinaryExpression,
  UnaryExpression,
  FunctionCallExpression,
  MethodCallExpression,
  Argument,
  VariableExpression,
  ParenthesizedExpression,
  RefExpression,
  DrefExpression,
  NewExpression,
  ArrayLiteralExpression,
  AssertCall,
  MockFunctionStatement,
  MockVerifyCallCountStatement,
  AdvanceTimeStatement,
  TypeReference,
} from "./frontend/ast.js";

/**
 * Recursively walk an AST subtree, calling visitor for each node.
 * If visitor returns false, children of that node are skipped.
 */
export function walkAST(
  node: ASTNode,
  visitor: (node: ASTNode) => boolean | void,
): void {
  const result = visitor(node);
  if (result === false) return;

  for (const child of getChildren(node)) {
    walkAST(child, visitor);
  }
}

/**
 * Find the deepest AST node whose sourceSpan contains the given position.
 */
export function findNodeAtPosition(
  ast: CompilationUnit,
  file: string,
  line: number,
  column: number,
): ASTNode | undefined {
  let best: ASTNode | undefined;

  walkAST(ast, (node): boolean | void => {
    if (!containsPosition(node, file, line, column)) {
      return false; // prune subtrees that can't contain the position
    }
    best = node;
  });

  return best;
}

/**
 * Find the innermost Expression node at the given position.
 */
export function findInnermostExpression(
  ast: CompilationUnit,
  file: string,
  line: number,
  column: number,
): Expression | undefined {
  let best: Expression | undefined;

  walkAST(ast, (node): boolean | void => {
    if (!containsPosition(node, file, line, column)) {
      return false; // prune subtrees that can't contain the position
    }
    if (isExpression(node)) {
      best = node as Expression;
    }
  });

  return best;
}

/**
 * Collect all AST nodes that reference a given symbol name.
 * Optionally filter by scope (e.g., "MyProgram" or "MyFB").
 *
 * Uses a scope stack to correctly handle nested scopes (methods inside FBs).
 * When code appears in a FB body after method declarations, the scope is the
 * FB — not the last-visited method.
 */
export function collectReferences(
  ast: CompilationUnit,
  symbolName: string,
  scope?: string,
): ASTNode[] {
  const refs: ASTNode[] = [];
  const upperName = symbolName.toUpperCase();
  const upperScope = scope?.toUpperCase();

  function visit(node: ASTNode, currentScope: string | undefined): void {
    // Determine the scope for this node and its children
    let nodeScope = currentScope;
    if (
      node.kind === "ProgramDeclaration" ||
      node.kind === "FunctionDeclaration" ||
      node.kind === "FunctionBlockDeclaration" ||
      node.kind === "MethodDeclaration"
    ) {
      nodeScope = (
        node as
          | ProgramDeclaration
          | FunctionDeclaration
          | FunctionBlockDeclaration
          | MethodDeclaration
      ).name;
    }

    // Check scope filter
    if (upperScope && nodeScope && nodeScope.toUpperCase() !== upperScope) {
      // Still recurse into children — a matching POU may be nested inside
      for (const child of getChildren(node)) {
        visit(child, nodeScope);
      }
      return;
    }

    // Check if this node is a reference to the symbol
    switch (node.kind) {
      case "VariableExpression": {
        if ((node as VariableExpression).name.toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "FunctionCallExpression": {
        if (
          (node as FunctionCallExpression).functionName.toUpperCase() ===
          upperName
        ) {
          refs.push(node);
        }
        break;
      }
      case "MethodCallExpression": {
        if (
          (node as MethodCallExpression).methodName.toUpperCase() === upperName
        ) {
          refs.push(node);
        }
        break;
      }
      case "TypeReference": {
        if ((node as TypeReference).name.toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "VarDeclaration": {
        const vd = node as VarDeclaration;
        if (vd.names.some((n) => n.toUpperCase() === upperName)) {
          refs.push(node);
        }
        break;
      }
      case "ProgramDeclaration":
      case "FunctionDeclaration":
      case "FunctionBlockDeclaration":
      case "MethodDeclaration": {
        if (
          (
            node as
              | ProgramDeclaration
              | FunctionDeclaration
              | FunctionBlockDeclaration
              | MethodDeclaration
          ).name.toUpperCase() === upperName
        ) {
          refs.push(node);
        }
        break;
      }
    }

    // Recurse into children with the correct scope
    for (const child of getChildren(node)) {
      visit(child, nodeScope);
    }
  }

  visit(ast, undefined);
  return refs;
}

// ---------------------------------------------------------------------------
// Enclosing scope resolution
// ---------------------------------------------------------------------------

export interface EnclosingScope {
  kind: "program" | "function" | "functionBlock" | "method" | "global";
  name: string;
  parentName?: string; // FB name when kind === 'method'
}

/**
 * Determine which POU contains a given source position.
 * Returns the most specific match (method > FB > function > program > global).
 */
export function findEnclosingPOU(
  ast: CompilationUnit,
  file: string,
  line: number,
  column: number,
): EnclosingScope {
  // Check programs
  for (const prog of ast.programs) {
    if (containsPosition(prog, file, line, column)) {
      return { kind: "program", name: prog.name };
    }
  }

  // Check functions
  for (const func of ast.functions) {
    if (containsPosition(func, file, line, column)) {
      return { kind: "function", name: func.name };
    }
  }

  // Check function blocks (and nested methods)
  for (const fb of ast.functionBlocks) {
    if (containsPosition(fb, file, line, column)) {
      // Check methods first (more specific)
      for (const method of fb.methods) {
        if (containsPosition(method, file, line, column)) {
          return { kind: "method", name: method.name, parentName: fb.name };
        }
      }
      return { kind: "functionBlock", name: fb.name };
    }
  }

  return { kind: "global", name: "global" };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function containsPosition(
  node: ASTNode,
  file: string,
  line: number,
  column: number,
): boolean {
  const span = node.sourceSpan;
  if (!span || span.file !== file) return false;
  if (line < span.startLine || line > span.endLine) return false;
  if (line === span.startLine && column < span.startCol) return false;
  if (line === span.endLine && column > span.endCol) return false;
  return true;
}

const EXPRESSION_KINDS = new Set([
  "BinaryExpression",
  "UnaryExpression",
  "FunctionCallExpression",
  "MethodCallExpression",
  "VariableExpression",
  "LiteralExpression",
  "ParenthesizedExpression",
  "RefExpression",
  "DrefExpression",
  "NewExpression",
  "ArrayLiteralExpression",
]);

function isExpression(node: ASTNode): boolean {
  return EXPRESSION_KINDS.has(node.kind);
}

/**
 * Returns the direct child ASTNodes of a given node.
 * This is the central dispatch for the recursive walker.
 */
function getChildren(node: ASTNode): ASTNode[] {
  const children: ASTNode[] = [];

  switch (node.kind) {
    // --- Top-level ---
    case "CompilationUnit": {
      const cu = node as CompilationUnit;
      children.push(
        ...cu.programs,
        ...cu.functions,
        ...cu.functionBlocks,
        ...cu.interfaces,
        ...cu.types,
        ...cu.configurations,
        ...cu.globalVarBlocks,
      );
      break;
    }

    case "ProgramDeclaration": {
      const pd = node as ProgramDeclaration;
      children.push(...pd.varBlocks, ...pd.body);
      break;
    }

    case "FunctionDeclaration": {
      const fd = node as FunctionDeclaration;
      children.push(fd.returnType, ...fd.varBlocks, ...fd.body);
      break;
    }

    case "FunctionBlockDeclaration": {
      const fbd = node as FunctionBlockDeclaration;
      children.push(
        ...fbd.varBlocks,
        ...fbd.methods,
        ...fbd.properties,
        ...fbd.body,
      );
      break;
    }

    case "InterfaceDeclaration": {
      const id = node as InterfaceDeclaration;
      children.push(...id.methods);
      break;
    }

    case "MethodDeclaration": {
      const md = node as MethodDeclaration;
      if (md.returnType) children.push(md.returnType);
      children.push(...md.varBlocks, ...md.body);
      break;
    }

    case "PropertyDeclaration": {
      const prop = node as PropertyDeclaration;
      children.push(prop.type);
      if (prop.getter) children.push(...prop.getter);
      if (prop.setter) children.push(...prop.setter);
      break;
    }

    // --- Configuration ---
    case "ConfigurationDeclaration": {
      const cd = node as ConfigurationDeclaration;
      children.push(...cd.varBlocks, ...cd.resources);
      break;
    }

    case "ResourceDeclaration": {
      const rd = node as ResourceDeclaration;
      children.push(...rd.tasks, ...rd.programInstances);
      break;
    }

    case "TaskDeclaration": {
      const td = node as TaskDeclaration;
      for (const expr of td.properties.values()) {
        children.push(expr);
      }
      break;
    }

    // --- Variables & Types ---
    case "VarBlock": {
      const vb = node as VarBlock;
      children.push(...vb.declarations);
      break;
    }

    case "VarDeclaration": {
      const vd = node as VarDeclaration;
      children.push(vd.type);
      if (vd.initialValue) children.push(vd.initialValue);
      break;
    }

    case "TypeDeclaration": {
      const td = node as TypeDeclaration;
      children.push(td.definition);
      break;
    }

    case "StructDefinition": {
      const sd = node as StructDefinition;
      children.push(...sd.fields);
      break;
    }

    case "EnumDefinition": {
      const ed = node as EnumDefinition;
      if (ed.baseType) children.push(ed.baseType);
      children.push(...ed.members);
      break;
    }

    case "EnumMember": {
      const em = node as EnumMember;
      if (em.value) children.push(em.value);
      break;
    }

    case "SubrangeDefinition": {
      const srd = node as SubrangeDefinition;
      children.push(srd.baseType, srd.lowerBound, srd.upperBound);
      break;
    }

    case "ArrayDefinition": {
      const ad = node as ArrayDefinition;
      children.push(...ad.dimensions, ad.elementType);
      break;
    }

    case "ArrayDimension": {
      const dim = node as ArrayDimension;
      if (dim.start) children.push(dim.start);
      if (dim.end) children.push(dim.end);
      break;
    }

    // --- Statements ---
    case "AssignmentStatement": {
      const as_ = node as AssignmentStatement;
      children.push(as_.target, as_.value);
      break;
    }

    case "RefAssignStatement": {
      const ras = node as RefAssignStatement;
      children.push(ras.target, ras.source);
      break;
    }

    case "IfStatement": {
      const ifs = node as IfStatement;
      children.push(
        ifs.condition,
        ...ifs.thenStatements,
        ...ifs.elsifClauses,
        ...ifs.elseStatements,
      );
      break;
    }

    case "ElsifClause": {
      const ec = node as ElsifClause;
      children.push(ec.condition, ...ec.statements);
      break;
    }

    case "CaseStatement": {
      const cs = node as CaseStatement;
      children.push(cs.selector, ...cs.cases, ...cs.elseStatements);
      break;
    }

    case "CaseElement": {
      const ce = node as CaseElement;
      children.push(...ce.labels, ...ce.statements);
      break;
    }

    case "CaseLabel": {
      const cl = node as CaseLabel;
      children.push(cl.start);
      if (cl.end) children.push(cl.end);
      break;
    }

    case "ForStatement": {
      const fs = node as ForStatement;
      children.push(fs.start, fs.end);
      if (fs.step) children.push(fs.step);
      children.push(...fs.body);
      break;
    }

    case "WhileStatement": {
      const ws = node as WhileStatement;
      children.push(ws.condition, ...ws.body);
      break;
    }

    case "RepeatStatement": {
      const rs = node as RepeatStatement;
      children.push(rs.condition, ...rs.body);
      break;
    }

    case "FunctionCallStatement": {
      const fcs = node as FunctionCallStatement;
      children.push(fcs.call);
      break;
    }

    case "DeleteStatement": {
      const ds = node as DeleteStatement;
      children.push(ds.pointer);
      break;
    }

    // --- Expressions ---
    case "BinaryExpression": {
      const be = node as BinaryExpression;
      children.push(be.left, be.right);
      break;
    }

    case "UnaryExpression": {
      const ue = node as UnaryExpression;
      children.push(ue.operand);
      break;
    }

    case "FunctionCallExpression": {
      const fce = node as FunctionCallExpression;
      children.push(...fce.arguments);
      break;
    }

    case "MethodCallExpression": {
      const mce = node as MethodCallExpression;
      children.push(mce.object, ...mce.arguments);
      break;
    }

    case "Argument": {
      const arg = node as Argument;
      children.push(arg.value);
      break;
    }

    case "VariableExpression": {
      const ve = node as VariableExpression;
      children.push(...ve.subscripts);
      if (ve.accessChain) {
        for (const step of ve.accessChain) {
          if (step.kind === "subscript") {
            children.push(...step.indices);
          }
        }
      }
      break;
    }

    case "ParenthesizedExpression": {
      const pe = node as ParenthesizedExpression;
      children.push(pe.expression);
      break;
    }

    case "RefExpression": {
      const re = node as RefExpression;
      children.push(re.operand);
      break;
    }

    case "DrefExpression": {
      const dre = node as DrefExpression;
      children.push(dre.operand);
      break;
    }

    case "NewExpression": {
      const ne = node as NewExpression;
      children.push(ne.allocationType);
      if (ne.arraySize) children.push(ne.arraySize);
      break;
    }

    case "ArrayLiteralExpression": {
      const ale = node as ArrayLiteralExpression;
      children.push(...ale.elements);
      break;
    }

    // --- Test framework ---
    case "AssertCall": {
      const ac = node as AssertCall;
      children.push(...ac.args);
      break;
    }

    case "MockFunctionStatement": {
      const mfs = node as MockFunctionStatement;
      children.push(mfs.returnValue);
      break;
    }

    case "MockVerifyCallCountStatement": {
      const mvcc = node as MockVerifyCallCountStatement;
      children.push(mvcc.expectedCount);
      break;
    }

    case "AdvanceTimeStatement": {
      const ats = node as AdvanceTimeStatement;
      children.push(ats.duration);
      break;
    }

    // Leaf nodes: ExitStatement, ReturnStatement, ProgramInstance,
    // TypeReference, LiteralExpression, ExternalCodePragma,
    // MockFBStatement, MockVerifyCalledStatement
  }

  return children;
}
