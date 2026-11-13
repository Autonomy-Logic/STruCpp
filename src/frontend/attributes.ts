// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2025 Autonomy®
/**
 * CODESYS attribute pragmas on declarations.
 *
 * The lexer keeps `{attribute 'name' [:= 'value']}` out of the parser's token stream. After the AST is built, each
 * pragma is attached to the declaration that follows it, as CODESYS applies it: a POU, method, property, interface,
 * type, variable block, variable, structure field or enumeration value. Only whitespace, comments and other pragmas
 * may separate the two (and the `TYPE` keyword before a type, whose span starts at its name); a pragma followed by
 * anything else is left unattached.
 */

import type { IToken } from "chevrotain";
import type {
  ASTNode,
  Attribute,
  CompilationUnit,
  TypeDeclaration,
  VarBlock,
} from "./ast.js";

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

function addBlocks(blocks: VarBlock[], into: Attributable[]): void {
  for (const block of blocks) into.push(block, ...block.declarations);
}

function addType(type: TypeDeclaration, into: Attributable[]): void {
  into.push(type);
  const def = type.definition;
  if (def.kind === "StructDefinition") into.push(...def.fields);
  else if (def.kind === "EnumDefinition") into.push(...def.members);
}

/** Every declaration in the unit that a pragma may precede, outer ones first. */
function attributables(ast: CompilationUnit): Attributable[] {
  const out: Attributable[] = [];
  for (const type of ast.types) addType(type, out);
  addBlocks(ast.globalVarBlocks, out);
  for (const config of ast.configurations) addBlocks(config.varBlocks, out);
  for (const pou of [...ast.programs, ...ast.functions]) {
    out.push(pou);
    addBlocks(pou.varBlocks, out);
  }
  for (const fb of ast.functionBlocks) {
    out.push(fb);
    addBlocks(fb.varBlocks, out);
    for (const method of fb.methods) {
      out.push(method);
      addBlocks(method.varBlocks, out);
    }
    out.push(...fb.properties);
  }
  for (const iface of ast.interfaces) {
    out.push(iface, ...iface.methods, ...iface.properties);
    for (const method of iface.methods) addBlocks(method.varBlocks, out);
  }
  return out;
}

/** Index of the first token starting after `offset`, by binary search over tokens sorted by offset. */
function firstTokenAfter(tokens: readonly IToken[], offset: number): number {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((tokens[mid]?.startOffset ?? 0) > offset) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Attaches the pragma tokens (the lexer's `pragmas` group) to the declarations of `ast`, built from the parser
 * tokens `tokens` of the same source. A declaration is matched by its first token, so the cost is linear. Returns
 * the pragmas that are not `{attribute 'name' [:= 'value']}`, which attach to nothing.
 */
export function attachAttributes(
  ast: CompilationUnit,
  pragmas: readonly IToken[],
  tokens: readonly IToken[],
): IToken[] {
  const unreadable = pragmas.filter(
    (p) => parseAttributePragma(p.image) === undefined,
  );
  if (pragmas.length === 0 || tokens.length === 0) return unreadable;
  const tokenAt = new Map<string, number>();
  tokens.forEach((t, i) => {
    const key = `${t.startLine ?? 0}:${t.startColumn ?? 0}`;
    if (!tokenAt.has(key)) tokenAt.set(key, i);
  });
  const byToken = new Map<number, Attributable>();
  for (const node of attributables(ast)) {
    const { startLine, startCol } = node.sourceSpan;
    if (startLine <= 0) continue;
    const index = tokenAt.get(`${startLine}:${startCol}`);
    if (index !== undefined && !byToken.has(index)) byToken.set(index, node);
  }
  for (const pragma of pragmas) {
    const attribute = parseAttributePragma(pragma.image);
    if (attribute === undefined) continue;
    const next = firstTokenAfter(
      tokens,
      pragma.endOffset ?? pragma.startOffset,
    );
    let target = byToken.get(next);
    if (
      target === undefined &&
      tokens[next]?.image.toUpperCase() === "TYPE" &&
      byToken.get(next + 1)?.kind === "TypeDeclaration"
    ) {
      target = byToken.get(next + 1);
    }
    if (target !== undefined) (target.attributes ??= []).push(attribute);
  }
  return unreadable;
}
