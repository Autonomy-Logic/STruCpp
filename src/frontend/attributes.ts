// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * CODESYS attribute pragmas on declarations.
 *
 * The lexer keeps `{attribute 'name' [:= 'value']}` out of the parser's token stream. After the AST is built, each
 * pragma is attached to the declaration that follows it (a POU, method, property, interface, type or variable), as
 * CODESYS applies it. Only whitespace, comments and other pragmas may separate the two; a pragma followed by anything
 * else is left unattached.
 */

import type { IToken } from "chevrotain";
import type { ASTNode, Attribute, CompilationUnit, VarBlock } from "./ast.js";
import { tokenize } from "./lexer.js";

/** A declaration that can carry attributes. */
type Attributable = ASTNode & { attributes?: Attribute[] };

/** Reads the name and value of one pragma token, or undefined when it has no quoted name. */
export function parseAttributePragma(image: string): Attribute | undefined {
  const match =
    /^\{\s*attribute\s*(['"])(.*?)\1\s*(?::=\s*(['"])(.*?)\3\s*)?\}$/is.exec(
      image,
    );
  if (match === null) return undefined;
  const name = match[2] ?? "";
  if (name.length === 0) return undefined;
  return match[4] !== undefined ? { name, value: match[4] } : { name };
}

function declarationsOf(blocks: VarBlock[], into: Attributable[]): void {
  for (const block of blocks) into.push(...block.declarations);
}

/** Every declaration in the unit that a pragma may precede. */
function attributables(ast: CompilationUnit): Attributable[] {
  const out: Attributable[] = [...ast.types];
  declarationsOf(ast.globalVarBlocks, out);
  for (const pou of [...ast.programs, ...ast.functions]) {
    out.push(pou);
    declarationsOf(pou.varBlocks, out);
  }
  for (const fb of ast.functionBlocks) {
    out.push(fb);
    declarationsOf(fb.varBlocks, out);
    for (const method of fb.methods) {
      out.push(method);
      declarationsOf(method.varBlocks, out);
    }
    out.push(...fb.properties);
  }
  for (const iface of ast.interfaces) {
    out.push(iface, ...iface.methods, ...iface.properties);
    for (const method of iface.methods) declarationsOf(method.varBlocks, out);
  }
  return out;
}

/** Offset of the first character of each line. */
function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * True when `text` holds only whitespace, comments and pragmas. A type's span starts at its name, so before a type
 * the `TYPE` keyword may sit in between too.
 */
function isTrivia(text: string, beforeType: boolean): boolean {
  const lexed = tokenize(text);
  if (lexed.errors.length > 0) return false;
  if (lexed.tokens.length === 0) return true;
  return (
    beforeType &&
    lexed.tokens.length === 1 &&
    lexed.tokens[0]?.image.toUpperCase() === "TYPE"
  );
}

/**
 * Attaches the pragma tokens of `source` (the lexer's `pragmas` group) to the declarations of `ast` built from it.
 */
export function attachAttributes(
  ast: CompilationUnit,
  source: string,
  pragmas: readonly IToken[],
): void {
  if (pragmas.length === 0) return;
  const starts = lineStarts(source);
  const targets = attributables(ast)
    .map((node) => ({
      node,
      offset:
        (starts[node.sourceSpan.startLine - 1] ?? source.length) +
        node.sourceSpan.startCol -
        1,
    }))
    .sort((a, b) => a.offset - b.offset);
  for (const pragma of pragmas) {
    const attribute = parseAttributePragma(pragma.image);
    if (attribute === undefined) continue;
    const after = (pragma.endOffset ?? pragma.startOffset) + 1;
    const target = targets.find((t) => t.offset >= after);
    if (target === undefined) continue;
    const gap = source.slice(after, target.offset);
    if (!isTrivia(gap, target.node.kind === "TypeDeclaration")) continue;
    (target.node.attributes ??= []).push(attribute);
  }
}
