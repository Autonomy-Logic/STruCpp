/**
 * STruC++ Lexer Tests
 *
 * Tests for the Chevrotain-based lexer that tokenizes IEC 61131-3 ST source code.
 */

import { describe, it, expect } from 'vitest';
import { tokenize, STLexer } from '../../src/frontend/lexer.js';

describe('STLexer', () => {
  describe('initialization', () => {
    it('should create a valid lexer', () => {
      expect(STLexer).toBeDefined();
    });
  });

  describe('tokenize', () => {
    it('should tokenize an empty string', () => {
      const result = tokenize('');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip whitespace', () => {
      const result = tokenize('   \n\t  ');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip single-line comments', () => {
      const result = tokenize('// this is a comment\n');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip multi-line comments', () => {
      const result = tokenize('(* this is a\nmulti-line comment *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip nested block comments (depth 2)', () => {
      const result = tokenize('(* outer (* inner *) outer *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip deeply nested block comments (depth 3)', () => {
      const result = tokenize('(* level1 (* level2 (* level3 *) level2 *) level1 *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should skip nested comments with multiple inner comments', () => {
      const result = tokenize('(* outer (* inner1 *) middle (* inner2 *) outer *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should handle nested comments spanning multiple lines', () => {
      const result = tokenize(`(* outer
        (* inner
           comment *)
        still outer
      *)`);
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should report error for unclosed block comment', () => {
      const result = tokenize('(* unclosed comment');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report error for unclosed nested comment', () => {
      const result = tokenize('(* outer (* inner *) missing close');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report correct line and column for unclosed comment', () => {
      const source = `VAR x : INT;
(* unclosed comment`;
      const result = tokenize(source);
      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors.find(e => e.message?.includes('Unclosed'));
      expect(error).toBeDefined();
      expect(error?.line).toBe(2);
      expect(error?.column).toBe(1);
    });

    it('should report correct column for unclosed comment after code', () => {
      const result = tokenize('VAR x (* unclosed');
      expect(result.errors.length).toBeGreaterThan(0);
      const error = result.errors.find(e => e.message?.includes('Unclosed'));
      expect(error).toBeDefined();
      expect(error?.line).toBe(1);
      expect(error?.column).toBe(7);
    });

    it('should handle comments with stars and parens inside', () => {
      const result = tokenize('(* contains ) and ( and * chars *)');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('should handle code with nested comments', () => {
      const result = tokenize(`
        PROGRAM Main
          (* This is a comment
             (* with a nested comment *)
             and more text
          *)
          VAR x : INT; END_VAR
        END_PROGRAM
      `);
      expect(result.errors).toHaveLength(0);
      // Should have tokens for PROGRAM, Main, VAR, x, :, INT, ;, END_VAR, END_PROGRAM
      expect(result.tokens.length).toBeGreaterThan(0);
      expect(result.tokens[0]?.tokenType.name).toBe('PROGRAM');
    });

    it('should not confuse single-line comment with nested block comment', () => {
      const result = tokenize('// This (* is not *) nested');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0); // Entire line is single-line comment
    });

    it('should handle comment followed by code', () => {
      const result = tokenize('(* comment *) VAR');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('VAR');
    });

    it('should handle nested comment followed by code', () => {
      const result = tokenize('(* outer (* inner *) *) PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('PROGRAM');
    });
  });

  describe('keywords', () => {
    it('should tokenize PROGRAM keyword', () => {
      const result = tokenize('PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('PROGRAM');
    });

    it('should tokenize END_PROGRAM keyword', () => {
      const result = tokenize('END_PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('END_PROGRAM');
    });

    it('should tokenize VAR keyword', () => {
      const result = tokenize('VAR');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('VAR');
    });

    it('should be case-insensitive for keywords', () => {
      const result = tokenize('program Program PROGRAM');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens.every((t) => t.tokenType.name === 'PROGRAM')).toBe(true);
    });
  });

  describe('identifiers', () => {
    it('should tokenize simple identifiers', () => {
      const result = tokenize('myVar');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Identifier');
      expect(result.tokens[0]?.image).toBe('myVar');
    });

    it('should tokenize identifiers with underscores', () => {
      const result = tokenize('my_variable_name');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Identifier');
    });

    it('should tokenize identifiers with numbers', () => {
      const result = tokenize('var123');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Identifier');
    });
  });

  describe('literals', () => {
    it('should tokenize integer literals', () => {
      const result = tokenize('123');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('IntegerLiteral');
      expect(result.tokens[0]?.image).toBe('123');
    });

    it('should tokenize real literals', () => {
      const result = tokenize('3.14');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('RealLiteral');
    });

    it('should tokenize string literals', () => {
      const result = tokenize("'hello world'");
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('StringLiteral');
    });

    it('should tokenize boolean literals', () => {
      const result = tokenize('TRUE FALSE');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]?.tokenType.name).toBe('TRUE');
      expect(result.tokens[1]?.tokenType.name).toBe('FALSE');
    });

    it('should tokenize time literals', () => {
      const result = tokenize('T#1s');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
    });

    it('should tokenize time literals with various units', () => {
      const validLiterals = ['T#10ms', 'T#100us', 'T#1000ns', 'T#1d', 'T#2h', 'T#30m', 'T#45s'];
      for (const literal of validLiterals) {
        const result = tokenize(literal);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
        expect(result.tokens[0]?.image).toBe(literal);
      }
    });

    it('should tokenize compound time literals', () => {
      const result = tokenize('T#1h2m3s');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
      expect(result.tokens[0]?.image).toBe('T#1h2m3s');
    });

    it('should tokenize TIME# prefix', () => {
      const result = tokenize('TIME#500ms');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('TimeLiteral');
    });

    it('should not match time literals without unit suffix', () => {
      // T#10.5 without a unit should NOT be a valid time literal
      // It should tokenize as separate tokens or produce an error
      const result = tokenize('T#10.5');
      // The regex should not match T#10.5 as a TimeLiteral
      // It will either not match at all or match only T#10 if there was a unit
      const timeLiteralTokens = result.tokens.filter(t => t.tokenType.name === 'TimeLiteral');
      expect(timeLiteralTokens).toHaveLength(0);
    });

    it('should not match bare T# without number and unit', () => {
      const result = tokenize('T#');
      const timeLiteralTokens = result.tokens.filter(t => t.tokenType.name === 'TimeLiteral');
      expect(timeLiteralTokens).toHaveLength(0);
    });
  });

  describe('operators', () => {
    it('should tokenize assignment operator', () => {
      const result = tokenize(':=');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]?.tokenType.name).toBe('Assign');
    });

    it('should tokenize comparison operators', () => {
      const result = tokenize('= <> < > <= >=');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(6);
    });

    it('should tokenize arithmetic operators', () => {
      const result = tokenize('+ - * / **');
      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(5);
    });
  });

  describe('complex input', () => {
    it('should tokenize a simple program', () => {
      const source = `
        PROGRAM Main
          VAR counter : INT; END_VAR
          counter := counter + 1;
        END_PROGRAM
      `;
      const result = tokenize(source);
      expect(result.errors).toHaveLength(0);
      expect(result.tokens.length).toBeGreaterThan(0);
    });
  });

  describe('pragmas', () => {
    describe('external code pragma', () => {
      it('should tokenize simple external pragma', () => {
        const result = tokenize('{external printf("hello"); }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
        expect(result.tokens[0]?.image).toBe('{external printf("hello"); }');
      });

      it('should tokenize external pragma with nested braces', () => {
        const result = tokenize('{external if (x > 0) { y = x; } }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
        expect(result.tokens[0]?.image).toBe('{external if (x > 0) { y = x; } }');
      });

      it('should tokenize external pragma with deeply nested braces', () => {
        const result = tokenize('{external if (a) { if (b) { if (c) { x = 1; } } } }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should tokenize multiline external pragma', () => {
        const source = `{external
          int x = 0;
          x = x + 1;
          printf("%d", x);
        }`;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle string literals inside external pragma', () => {
        const result = tokenize('{external printf("contains } brace"); }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle single quotes inside external pragma', () => {
        const result = tokenize("{external char c = '}'; }");
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle C++ single-line comments inside external pragma', () => {
        const source = `{external
          // This is a comment with { braces }
          int x = 0;
        }`;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle C++ multi-line comments inside external pragma', () => {
        const result = tokenize('{external /* comment { with } braces */ int x; }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should be case insensitive for external keyword', () => {
        const result = tokenize('{EXTERNAL int x = 0; }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should not match non-external pragma', () => {
        const result = tokenize('{notexternal code }');
        expect(result.tokens.filter(t => t.tokenType.name === 'ExternalPragma')).toHaveLength(0);
      });

      it('should tokenize external pragma followed by code', () => {
        const source = '{external printf("test"); } VAR';
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(2);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
        expect(result.tokens[1]?.tokenType.name).toBe('VAR');
      });

      it('should handle empty external pragma', () => {
        const result = tokenize('{external }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle external pragma with only whitespace', () => {
        const result = tokenize('{external   \n  \t  }');
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle very deeply nested braces (4+ levels)', () => {
        const source = `{external
          void foo() {
            if (a) {
              while (b) {
                for (int i = 0; i < 10; i++) {
                  if (c) {
                    x++;
                  }
                }
              }
            }
          }
        }`;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle C++ class/struct definitions', () => {
        const source = `{external
          struct Point {
            int x;
            int y;
            Point(int a, int b) : x(a), y(b) {}
          };
        }`;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle C++ lambda expressions', () => {
        const source = '{external auto fn = [](int x) { return x * 2; }; }';
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle C++ template syntax', () => {
        const source = '{external std::vector<std::map<int, std::string>> data; }';
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle main function definition', () => {
        const source = `{external
          int main() {
            printf("Hello, World!\\n");
            return 0;
          }
        }`;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle mixed braces and brackets', () => {
        const source = '{external int arr[10] = {1, 2, 3}; std::map<int, int> m = {{1, 2}}; }';
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle escaped quotes in strings', () => {
        const source = '{external printf("quote: \\" and brace: }"); }';
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });

      it('should handle preprocessor directives', () => {
        const source = `{external
          #ifdef DEBUG
          printf("debug mode");
          #endif
        }`;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        expect(result.tokens).toHaveLength(1);
        expect(result.tokens[0]?.tokenType.name).toBe('ExternalPragma');
      });
    });

    describe('malformed external pragmas', () => {
      it('should produce error for unclosed external pragma', () => {
        const source = `
          PROGRAM Main
            {external printf("test");
          END_PROGRAM
        `;
        const result = tokenize(source);
        // The unclosed pragma should cause a lexer error (unrecognized '{')
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should produce error for unclosed nested braces in external pragma', () => {
        const source = '{external if (x) { y = 1; }';
        // Missing the final closing brace for the pragma itself
        const result = tokenize(source);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should not match pragma with no closing brace at all', () => {
        const result = tokenize('{external int x = 0;');
        const externalTokens = result.tokens.filter(t => t.tokenType.name === 'ExternalPragma');
        expect(externalTokens).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should not match pragma where keyword is not immediately after brace', () => {
        // {something external} should NOT be matched
        const result = tokenize('{something external code }');
        const externalTokens = result.tokens.filter(t => t.tokenType.name === 'ExternalPragma');
        expect(externalTokens).toHaveLength(0);
      });
    });

    describe('pragma in program context', () => {
      it('should tokenize program with external pragma', () => {
        const source = `
          PROGRAM Main
            VAR x : INT; END_VAR
            {external printf("x = %d", x); }
            x := x + 1;
          END_PROGRAM
        `;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        const externalTokens = result.tokens.filter(t => t.tokenType.name === 'ExternalPragma');
        expect(externalTokens).toHaveLength(1);
      });

      it('should tokenize mixed ST code and external pragmas', () => {
        const source = `
          PROGRAM Test
            VAR counter : INT; END_VAR
            counter := 0;
            {external // Start C++ code
              for (int i = 0; i < 10; i++) {
                counter++;
              }
            }
            counter := counter * 2;
          END_PROGRAM
        `;
        const result = tokenize(source);
        expect(result.errors).toHaveLength(0);
        // Should have PROGRAM, Test, VAR, counter, :, INT, ;, END_VAR,
        // counter, :=, 0, ;, ExternalPragma, counter, :=, counter, *, 2, ;, END_PROGRAM
        const externalTokens = result.tokens.filter(t => t.tokenType.name === 'ExternalPragma');
        expect(externalTokens).toHaveLength(1);
        // Verify keywords are still recognized
        expect(result.tokens.filter(t => t.tokenType.name === 'PROGRAM')).toHaveLength(1);
        expect(result.tokens.filter(t => t.tokenType.name === 'END_PROGRAM')).toHaveLength(1);
      });
    });
  });
});
