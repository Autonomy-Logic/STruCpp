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
  Statement,
  VarBlock,
  VarDeclaration,
  AccessStep,
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

  walkAST(ast, (node) => {
    if (containsPosition(node, file, line, column)) {
      best = node;
    }
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

  walkAST(ast, (node) => {
    if (isExpression(node) && containsPosition(node, file, line, column)) {
      best = node as Expression;
    }
  });

  return best;
}

/**
 * Collect all AST nodes that reference a given symbol name.
 * Optionally filter by scope (e.g., "MyProgram").
 */
export function collectReferences(
  ast: CompilationUnit,
  symbolName: string,
  scope?: string,
): ASTNode[] {
  const refs: ASTNode[] = [];
  const upperName = symbolName.toUpperCase();
  let currentScope: string | undefined;

  walkAST(ast, (node) => {
    const rec = node as unknown as Record<string, unknown>;

    // Track scope
    if (
      node.kind === "ProgramDeclaration" ||
      node.kind === "FunctionDeclaration" ||
      node.kind === "FunctionBlockDeclaration" ||
      node.kind === "MethodDeclaration"
    ) {
      currentScope = rec.name as string;
    }

    // Skip if scope filter doesn't match
    if (
      scope &&
      currentScope &&
      currentScope.toUpperCase() !== scope.toUpperCase()
    ) {
      return;
    }

    switch (node.kind) {
      case "VariableExpression": {
        if ((rec.name as string).toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "FunctionCallExpression": {
        if ((rec.functionName as string).toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "MethodCallExpression": {
        if ((rec.methodName as string).toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "TypeReference": {
        if ((rec.typeName as string).toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "VarDeclaration": {
        if ((rec.name as string).toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
      case "ProgramDeclaration":
      case "FunctionDeclaration":
      case "FunctionBlockDeclaration":
      case "MethodDeclaration": {
        if ((rec.name as string).toUpperCase() === upperName) {
          refs.push(node);
        }
        break;
      }
    }
  });

  return refs;
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
      const pd = node as unknown as {
        varBlocks: VarBlock[];
        body: Statement[];
      };
      children.push(...pd.varBlocks, ...pd.body);
      break;
    }

    case "FunctionDeclaration": {
      const fd = node as unknown as {
        returnType: ASTNode;
        varBlocks: VarBlock[];
        body: Statement[];
      };
      children.push(fd.returnType, ...fd.varBlocks, ...fd.body);
      break;
    }

    case "FunctionBlockDeclaration": {
      const fbd = node as unknown as {
        varBlocks: VarBlock[];
        methods: ASTNode[];
        properties: ASTNode[];
        body: Statement[];
      };
      children.push(
        ...fbd.varBlocks,
        ...fbd.methods,
        ...fbd.properties,
        ...fbd.body,
      );
      break;
    }

    case "InterfaceDeclaration": {
      const id = node as unknown as { methods: ASTNode[] };
      children.push(...id.methods);
      break;
    }

    case "MethodDeclaration": {
      const md = node as unknown as {
        returnType?: ASTNode;
        varBlocks: VarBlock[];
        body: Statement[];
      };
      if (md.returnType) children.push(md.returnType);
      children.push(...md.varBlocks, ...md.body);
      break;
    }

    case "PropertyDeclaration": {
      const prop = node as unknown as {
        type: ASTNode;
        getter?: Statement[];
        setter?: Statement[];
      };
      children.push(prop.type);
      if (prop.getter) children.push(...prop.getter);
      if (prop.setter) children.push(...prop.setter);
      break;
    }

    // --- Configuration ---
    case "ConfigurationDeclaration": {
      const cd = node as unknown as {
        varBlocks: VarBlock[];
        resources: ASTNode[];
      };
      children.push(...cd.varBlocks, ...cd.resources);
      break;
    }

    case "ResourceDeclaration": {
      const rd = node as unknown as {
        tasks: ASTNode[];
        programInstances: ASTNode[];
      };
      children.push(...rd.tasks, ...rd.programInstances);
      break;
    }

    case "TaskDeclaration": {
      const td = node as unknown as { properties: Map<string, Expression> };
      for (const expr of td.properties.values()) {
        children.push(expr);
      }
      break;
    }

    // --- Variables & Types ---
    case "VarBlock": {
      const vb = node as unknown as { declarations: VarDeclaration[] };
      children.push(...vb.declarations);
      break;
    }

    case "VarDeclaration": {
      const vd = node as unknown as {
        type: ASTNode;
        initialValue?: Expression;
      };
      children.push(vd.type);
      if (vd.initialValue) children.push(vd.initialValue);
      break;
    }

    case "TypeDeclaration": {
      const td = node as unknown as { definition: ASTNode };
      children.push(td.definition);
      break;
    }

    case "StructDefinition": {
      const sd = node as unknown as { fields: VarDeclaration[] };
      children.push(...sd.fields);
      break;
    }

    case "EnumDefinition": {
      const ed = node as unknown as {
        baseType?: ASTNode;
        members: ASTNode[];
      };
      if (ed.baseType) children.push(ed.baseType);
      children.push(...ed.members);
      break;
    }

    case "EnumMember": {
      const em = node as unknown as { value?: Expression };
      if (em.value) children.push(em.value);
      break;
    }

    case "SubrangeDefinition": {
      const srd = node as unknown as {
        baseType: ASTNode;
        lowerBound: Expression;
        upperBound: Expression;
      };
      children.push(srd.baseType, srd.lowerBound, srd.upperBound);
      break;
    }

    case "ArrayDefinition": {
      const ad = node as unknown as {
        dimensions: ASTNode[];
        elementType: ASTNode;
      };
      children.push(...ad.dimensions, ad.elementType);
      break;
    }

    case "ArrayDimension": {
      const dim = node as unknown as {
        start?: Expression;
        end?: Expression;
      };
      if (dim.start) children.push(dim.start);
      if (dim.end) children.push(dim.end);
      break;
    }

    // --- Statements ---
    case "AssignmentStatement": {
      const as_ = node as unknown as {
        target: Expression;
        value: Expression;
      };
      children.push(as_.target, as_.value);
      break;
    }

    case "RefAssignStatement": {
      const ras = node as unknown as {
        target: Expression;
        source: Expression;
      };
      children.push(ras.target, ras.source);
      break;
    }

    case "IfStatement": {
      const ifs = node as unknown as {
        condition: Expression;
        thenStatements: Statement[];
        elsifClauses: ASTNode[];
        elseStatements: Statement[];
      };
      children.push(
        ifs.condition,
        ...ifs.thenStatements,
        ...ifs.elsifClauses,
        ...ifs.elseStatements,
      );
      break;
    }

    case "ElsifClause": {
      const ec = node as unknown as {
        condition: Expression;
        statements: Statement[];
      };
      children.push(ec.condition, ...ec.statements);
      break;
    }

    case "CaseStatement": {
      const cs = node as unknown as {
        selector: Expression;
        cases: ASTNode[];
        elseStatements: Statement[];
      };
      children.push(cs.selector, ...cs.cases, ...cs.elseStatements);
      break;
    }

    case "CaseElement": {
      const ce = node as unknown as {
        labels: ASTNode[];
        statements: Statement[];
      };
      children.push(...ce.labels, ...ce.statements);
      break;
    }

    case "CaseLabel": {
      const cl = node as unknown as {
        start: Expression;
        end?: Expression;
      };
      children.push(cl.start);
      if (cl.end) children.push(cl.end);
      break;
    }

    case "ForStatement": {
      const fs = node as unknown as {
        start: Expression;
        end: Expression;
        step?: Expression;
        body: Statement[];
      };
      children.push(fs.start, fs.end);
      if (fs.step) children.push(fs.step);
      children.push(...fs.body);
      break;
    }

    case "WhileStatement": {
      const ws = node as unknown as {
        condition: Expression;
        body: Statement[];
      };
      children.push(ws.condition, ...ws.body);
      break;
    }

    case "RepeatStatement": {
      const rs = node as unknown as {
        condition: Expression;
        body: Statement[];
      };
      children.push(rs.condition, ...rs.body);
      break;
    }

    case "FunctionCallStatement": {
      const fcs = node as unknown as {
        call: Expression;
      };
      children.push(fcs.call);
      break;
    }

    case "DeleteStatement": {
      const ds = node as unknown as { pointer: Expression };
      children.push(ds.pointer);
      break;
    }

    // --- Expressions ---
    case "BinaryExpression": {
      const be = node as unknown as {
        left: Expression;
        right: Expression;
      };
      children.push(be.left, be.right);
      break;
    }

    case "UnaryExpression": {
      const ue = node as unknown as { operand: Expression };
      children.push(ue.operand);
      break;
    }

    case "FunctionCallExpression": {
      const fce = node as unknown as { arguments: ASTNode[] };
      children.push(...fce.arguments);
      break;
    }

    case "MethodCallExpression": {
      const mce = node as unknown as {
        object: Expression;
        arguments: ASTNode[];
      };
      children.push(mce.object, ...mce.arguments);
      break;
    }

    case "Argument": {
      const arg = node as unknown as { value: Expression };
      children.push(arg.value);
      break;
    }

    case "VariableExpression": {
      const ve = node as unknown as {
        subscripts: Expression[];
        accessChain?: AccessStep[];
      };
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
      const pe = node as unknown as { expression: Expression };
      children.push(pe.expression);
      break;
    }

    case "RefExpression": {
      const re = node as unknown as { operand: Expression };
      children.push(re.operand);
      break;
    }

    case "DrefExpression": {
      const dre = node as unknown as { operand: Expression };
      children.push(dre.operand);
      break;
    }

    case "NewExpression": {
      const ne = node as unknown as {
        allocationType: ASTNode;
        arraySize?: Expression;
      };
      children.push(ne.allocationType);
      if (ne.arraySize) children.push(ne.arraySize);
      break;
    }

    case "ArrayLiteralExpression": {
      const ale = node as unknown as { elements: Expression[] };
      children.push(...ale.elements);
      break;
    }

    // --- Test framework ---
    case "AssertCall": {
      const ac = node as unknown as { args: Expression[] };
      children.push(...ac.args);
      break;
    }

    case "MockFunctionStatement": {
      const mfs = node as unknown as { returnValue: Expression };
      children.push(mfs.returnValue);
      break;
    }

    case "MockVerifyCallCountStatement": {
      const mvcc = node as unknown as { expectedCount: Expression };
      children.push(mvcc.expectedCount);
      break;
    }

    case "AdvanceTimeStatement": {
      const ats = node as unknown as { duration: Expression };
      children.push(ats.duration);
      break;
    }

    // Leaf nodes: ExitStatement, ReturnStatement, ProgramInstance,
    // TypeReference, LiteralExpression, ExternalCodePragma,
    // MockFBStatement, MockVerifyCalledStatement
  }

  return children;
}
