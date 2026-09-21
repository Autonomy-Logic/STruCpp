/**
 * `AT <identifier>` — the OpenPLC Editor alias form.
 *
 * IEC only allows a `%` location after `AT`. The OpenPLC Editor also lets a
 * user bind a variable to an I/O *alias*: a symbolic name for a channel, which
 * the editor resolves to a real address before it asks for a compile.
 *
 * The parser accepts the alias form so the editor can read its own declarations
 * with this parser instead of maintaining a second one. It had been doing
 * exactly that, and the two parsers drifted — the editor's accepted
 * declarations the compiler rejected, and vice versa.
 *
 * Accepting it in the grammar is deliberately not the same as accepting it in a
 * compile: `analyze` still refuses an address that is not a well-formed `%`
 * location, and says specifically that an alias was left unresolved rather than
 * blaming the spelling.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../src/frontend/parser.js';
import { buildAST } from '../../src/frontend/ast-builder.js';
import { analyze } from '../../src/semantic/analyzer.js';

/** AST for a source string, asserting it parsed cleanly first. */
function astOf(source: string) {
  const parsed = parse(source);
  expect(parsed.errors).toHaveLength(0);
  return buildAST(parsed.cst!);
}

/** First declaration of the first VAR block of the first program. */
function firstDeclaration(source: string) {
  return astOf(source).programs[0]!.varBlocks[0]!.declarations[0]!;
}

const wrap = (declaration: string) =>
  `PROGRAM P\n  VAR\n    ${declaration}\n  END_VAR\n  ;\nEND_PROGRAM\n`;

describe('AT with an identifier operand (OpenPLC alias)', () => {
  describe('both declaration orderings', () => {
    it('accepts the alias before the colon', () => {
      const declaration = firstDeclaration(wrap('m AT Motor_Start : BOOL;'));
      expect(declaration.address).toBe('MOTOR_START');
      expect(declaration.addressKind).toBe('alias');
    });

    it('accepts the alias after the type', () => {
      const declaration = firstDeclaration(wrap('m : BOOL AT Motor_Start;'));
      expect(declaration.address).toBe('MOTOR_START');
      expect(declaration.addressKind).toBe('alias');
    });
  });

  describe('the direct form is untouched', () => {
    it('still reads a % location before the colon', () => {
      const declaration = firstDeclaration(wrap('m AT %QX0.0 : BOOL;'));
      expect(declaration.address).toBe('%QX0.0');
      expect(declaration.addressKind).toBe('direct');
    });

    it('still reads a % location after the type', () => {
      const declaration = firstDeclaration(wrap('m : BOOL AT %QX0.0;'));
      expect(declaration.address).toBe('%QX0.0');
      expect(declaration.addressKind).toBe('direct');
    });

    it('leaves an unlocated declaration with no address at all', () => {
      const declaration = firstDeclaration(wrap('m : BOOL;'));
      expect(declaration.address).toBeUndefined();
      expect(declaration.addressKind).toBeUndefined();
    });
  });

  describe('the alias combines with the rest of the declaration', () => {
    it('accepts an initial value after an alias', () => {
      const declaration = firstDeclaration(wrap('m : BOOL AT Motor_Start := TRUE;'));
      expect(declaration.addressKind).toBe('alias');
      expect(declaration.initialValue).toBeDefined();
    });

    it('accepts an alias on an array', () => {
      const declaration = firstDeclaration(wrap('a AT Bank_1 : ARRAY [0..3] OF INT;'));
      expect(declaration.address).toBe('BANK_1');
      expect(declaration.addressKind).toBe('alias');
    });
  });

  describe('spans carry the spelling the AST folds away', () => {
    // The lexer upper-cases identifiers, so `address` and `names` are not what
    // the user typed. An editor that writes the declaration back to disk has to
    // reproduce the original, or `Motor_Start` silently becomes `MOTOR_START`
    // on the next save.
    const source = wrap('MyCamelVar AT Motor_Start : BOOL;');
    const lines = source.split('\n');
    const slice = (span: { startLine: number; startCol: number; endCol: number }) =>
      lines[span.startLine - 1]!.slice(span.startCol - 1, span.endCol);

    it('recovers the alias spelling', () => {
      const declaration = firstDeclaration(source);
      expect(declaration.address).toBe('MOTOR_START');
      expect(slice(declaration.addressSpan!)).toBe('Motor_Start');
    });

    it('recovers the variable name spelling', () => {
      const declaration = firstDeclaration(source);
      expect(declaration.names).toEqual(['MYCAMELVAR']);
      expect(declaration.nameSpans).toHaveLength(1);
      expect(slice(declaration.nameSpans![0]!)).toBe('MyCamelVar');
    });

    it('gives one span per name in a multi-name declaration', () => {
      const multi = wrap('alpha, beta : DINT;');
      const multiLines = multi.split('\n');
      const declaration = firstDeclaration(multi);
      const spelled = declaration.nameSpans!.map((span) =>
        multiLines[span.startLine - 1]!.slice(span.startCol - 1, span.endCol),
      );
      expect(declaration.names).toEqual(['ALPHA', 'BETA']);
      expect(spelled).toEqual(['alpha', 'beta']);
    });

    it('carries a span for the direct form too', () => {
      const declaration = firstDeclaration(wrap('m : BOOL AT %QX0.0;'));
      expect(declaration.addressSpan).toBeDefined();
    });
  });


  describe('an inline ARRAY type spans the type, not the declaration', () => {
    // It used to take the parent node's span, so slicing the source by the
    // type's span returned the whole line. Every other TypeReference spans just
    // the type, so this was inconsistent with itself as well as wrong — and an
    // editor reading the type back out got `a : ARRAY [0..3] OF INT;` where it
    // asked for `ARRAY [0..3] OF INT`.
    const source = wrap('a : ARRAY [0..3] OF INT;');
    const lines = source.split('\n');

    it('slices to the type alone', () => {
      const declaration = firstDeclaration(source);
      const span = declaration.type.sourceSpan;
      const sliced = lines[span.startLine - 1]!.slice(span.startCol - 1, span.endCol);
      expect(sliced).toBe('ARRAY [0..3] OF INT');
    });

    it('still carries the dimensions and element type', () => {
      const declaration = firstDeclaration(wrap('a : ARRAY [0..3, 0..2] OF REAL;'));
      expect(declaration.type.elementTypeName).toBe('REAL');
      expect(declaration.type.arrayDimensions).toHaveLength(2);
    });
  });

  describe('a compile still refuses an unresolved alias', () => {
    it('names it as an alias rather than blaming the address format', () => {
      const result = analyze(astOf(wrap('m : BOOL AT Motor_Start;')));
      const messages = result.errors.map((error) => error.message);
      expect(messages.some((m) => m.includes('is an I/O alias, not an address'))).toBe(true);
      // The old message pointed at the spelling, which is not the problem.
      expect(messages.some((m) => m.startsWith('Invalid address format'))).toBe(false);
    });

    it('still compiles a direct address', () => {
      const result = analyze(astOf(wrap('m : BOOL AT %QX0.0;')));
      expect(result.errors.map((error) => error.message)).toEqual([]);
    });
  });
});

describe('a string literal is not code', () => {
  // `findUnclosedBlockComment` walked raw characters and skipped `//` comments
  // but not string literals, so `s : STRING := '(*';` — a valid IEC
  // declaration — was rejected with "Unclosed block comment" pointing at a line
  // that has no comment on it. The whole compilation unit went with it.
  it.each([
    ['a comment opener', "'(*'"],
    ['a comment closer', "'*)'"],
    ['a URL, whose // is not a comment', "'http://example.com'"],
    ['a semicolon', "'a;b'"],
    ['an escaped quote', "'it''s'"],
  ])('accepts a STRING holding %s', (_label, literal) => {
    const parsed = parse(wrap(`s : STRING := ${literal};`));
    expect(parsed.errors).toHaveLength(0);
  });

  it('still reports a genuinely unclosed comment', () => {
    const parsed = parse('PROGRAM P\n  VAR\n    (* never closed\n    a : INT;\n  END_VAR\nEND_PROGRAM\n');
    expect(parsed.errors.map((error) => error.message)).toContain('Unclosed block comment');
  });
});
