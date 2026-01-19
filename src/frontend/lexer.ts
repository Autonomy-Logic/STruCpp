/**
 * STruC++ Lexer
 *
 * Tokenizes IEC 61131-3 Structured Text source code using Chevrotain.
 * This module defines all tokens used by the ST grammar.
 */

import { createToken, Lexer } from "chevrotain";

// =============================================================================
// Token Categories
// =============================================================================

/**
 * Whitespace tokens (skipped during parsing)
 */
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

/**
 * Single-line comment: // ... or (* ... *)
 */
export const Comment = createToken({
  name: "Comment",
  pattern: /\/\/[^\n\r]*|(?:\(\*[\s\S]*?\*\))/,
  group: Lexer.SKIPPED,
});

// =============================================================================
// Keywords
// =============================================================================

// Program Organization Units
export const PROGRAM = createToken({ name: "PROGRAM", pattern: /PROGRAM/i });
export const END_PROGRAM = createToken({
  name: "END_PROGRAM",
  pattern: /END_PROGRAM/i,
});
export const FUNCTION = createToken({ name: "FUNCTION", pattern: /FUNCTION/i });
export const END_FUNCTION = createToken({
  name: "END_FUNCTION",
  pattern: /END_FUNCTION/i,
});
export const FUNCTION_BLOCK = createToken({
  name: "FUNCTION_BLOCK",
  pattern: /FUNCTION_BLOCK/i,
});
export const END_FUNCTION_BLOCK = createToken({
  name: "END_FUNCTION_BLOCK",
  pattern: /END_FUNCTION_BLOCK/i,
});

// Variable declarations
export const VAR = createToken({ name: "VAR", pattern: /VAR/i });
export const END_VAR = createToken({ name: "END_VAR", pattern: /END_VAR/i });
export const VAR_INPUT = createToken({
  name: "VAR_INPUT",
  pattern: /VAR_INPUT/i,
});
export const VAR_OUTPUT = createToken({
  name: "VAR_OUTPUT",
  pattern: /VAR_OUTPUT/i,
});
export const VAR_IN_OUT = createToken({
  name: "VAR_IN_OUT",
  pattern: /VAR_IN_OUT/i,
});
export const VAR_EXTERNAL = createToken({
  name: "VAR_EXTERNAL",
  pattern: /VAR_EXTERNAL/i,
});
export const VAR_GLOBAL = createToken({
  name: "VAR_GLOBAL",
  pattern: /VAR_GLOBAL/i,
});
export const VAR_TEMP = createToken({ name: "VAR_TEMP", pattern: /VAR_TEMP/i });
export const CONSTANT = createToken({ name: "CONSTANT", pattern: /CONSTANT/i });
export const RETAIN = createToken({ name: "RETAIN", pattern: /RETAIN/i });
export const AT = createToken({ name: "AT", pattern: /AT/i });

// Type declarations
export const TYPE = createToken({ name: "TYPE", pattern: /TYPE/i });
export const END_TYPE = createToken({ name: "END_TYPE", pattern: /END_TYPE/i });
export const STRUCT = createToken({ name: "STRUCT", pattern: /STRUCT/i });
export const END_STRUCT = createToken({
  name: "END_STRUCT",
  pattern: /END_STRUCT/i,
});
export const ARRAY = createToken({ name: "ARRAY", pattern: /ARRAY/i });
export const OF = createToken({ name: "OF", pattern: /OF/i });

// Configuration
export const CONFIGURATION = createToken({
  name: "CONFIGURATION",
  pattern: /CONFIGURATION/i,
});
export const END_CONFIGURATION = createToken({
  name: "END_CONFIGURATION",
  pattern: /END_CONFIGURATION/i,
});
export const RESOURCE = createToken({ name: "RESOURCE", pattern: /RESOURCE/i });
export const END_RESOURCE = createToken({
  name: "END_RESOURCE",
  pattern: /END_RESOURCE/i,
});
export const TASK = createToken({ name: "TASK", pattern: /TASK/i });
export const WITH = createToken({ name: "WITH", pattern: /WITH/i });
export const ON = createToken({ name: "ON", pattern: /ON/i });

// Control flow
export const IF = createToken({ name: "IF", pattern: /IF/i });
export const THEN = createToken({ name: "THEN", pattern: /THEN/i });
export const ELSIF = createToken({ name: "ELSIF", pattern: /ELSIF/i });
export const ELSE = createToken({ name: "ELSE", pattern: /ELSE/i });
export const END_IF = createToken({ name: "END_IF", pattern: /END_IF/i });
export const CASE = createToken({ name: "CASE", pattern: /CASE/i });
export const END_CASE = createToken({ name: "END_CASE", pattern: /END_CASE/i });
export const FOR = createToken({ name: "FOR", pattern: /FOR/i });
export const TO = createToken({ name: "TO", pattern: /TO/i });
export const BY = createToken({ name: "BY", pattern: /BY/i });
export const DO = createToken({ name: "DO", pattern: /DO/i });
export const END_FOR = createToken({ name: "END_FOR", pattern: /END_FOR/i });
export const WHILE = createToken({ name: "WHILE", pattern: /WHILE/i });
export const END_WHILE = createToken({
  name: "END_WHILE",
  pattern: /END_WHILE/i,
});
export const REPEAT = createToken({ name: "REPEAT", pattern: /REPEAT/i });
export const UNTIL = createToken({ name: "UNTIL", pattern: /UNTIL/i });
export const END_REPEAT = createToken({
  name: "END_REPEAT",
  pattern: /END_REPEAT/i,
});
export const EXIT = createToken({ name: "EXIT", pattern: /EXIT/i });
export const RETURN = createToken({ name: "RETURN", pattern: /RETURN/i });

// Boolean literals
export const TRUE = createToken({ name: "TRUE", pattern: /TRUE/i });
export const FALSE = createToken({ name: "FALSE", pattern: /FALSE/i });

// Logical operators
export const AND = createToken({ name: "AND", pattern: /AND/i });
export const OR = createToken({ name: "OR", pattern: /OR/i });
export const XOR = createToken({ name: "XOR", pattern: /XOR/i });
export const NOT = createToken({ name: "NOT", pattern: /NOT/i });
export const MOD = createToken({ name: "MOD", pattern: /MOD/i });

// Reference types (IEC v3 and CODESYS compatibility)
export const REFERENCE_TO = createToken({
  name: "REFERENCE_TO",
  pattern: /REFERENCE_TO/i,
});
export const REF_TO = createToken({ name: "REF_TO", pattern: /REF_TO/i });
export const DREF = createToken({ name: "DREF", pattern: /DREF/i });
export const REF = createToken({ name: "REF", pattern: /REF/i });
export const NULL = createToken({ name: "NULL", pattern: /NULL/i });

// =============================================================================
// Literals
// =============================================================================

// Time literal: T#1s, T#100ms, TIME#1h2m3s
// Note: Each numeric component must have a unit suffix (ms, us, ns, d, h, m, s)
// Longer suffixes (ms, us, ns) must come before shorter ones (m, s) in the alternation
export const TimeLiteral = createToken({
  name: "TimeLiteral",
  pattern: /(?:T|TIME)#(?:[0-9_]+(?:ms|us|ns|d|h|m|s))+/i,
});

// Date literal: D#2024-01-15
export const DateLiteral = createToken({
  name: "DateLiteral",
  pattern: /(?:D|DATE)#[0-9]{4}-[0-9]{2}-[0-9]{2}/i,
});

// Time of day literal: TOD#12:30:00
export const TimeOfDayLiteral = createToken({
  name: "TimeOfDayLiteral",
  pattern: /(?:TOD|TIME_OF_DAY)#[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?/i,
});

// Date and time literal: DT#2024-01-15-12:30:00
export const DateTimeLiteral = createToken({
  name: "DateTimeLiteral",
  pattern:
    /(?:DT|DATE_AND_TIME)#[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?/i,
});

// Real number literal: 3.14, 1.0e-10
export const RealLiteral = createToken({
  name: "RealLiteral",
  pattern: /[0-9]+\.[0-9]+(?:[eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+/,
});

// Integer literal: 123, 16#FF, 2#1010, 8#77
export const IntegerLiteral = createToken({
  name: "IntegerLiteral",
  pattern: /(?:16#[0-9A-Fa-f_]+|8#[0-7_]+|2#[01_]+|[0-9][0-9_]*)/,
});

// String literal: 'hello world'
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /'(?:[^'$]|\$\$|\$'|\$[LNPRTlnprt]|\$[0-9A-Fa-f]{2})*'/,
});

// Wide string literal: "hello world"
export const WideStringLiteral = createToken({
  name: "WideStringLiteral",
  pattern: /"(?:[^"$]|\$\$|\$"|\$[LNPRTlnprt]|\$[0-9A-Fa-f]{4})*"/,
});

// =============================================================================
// Operators and Punctuation
// =============================================================================

export const RefAssign = createToken({ name: "RefAssign", pattern: /REF=/i });
export const Assign = createToken({ name: "Assign", pattern: /:=/ });
export const OutputAssign = createToken({
  name: "OutputAssign",
  pattern: /=>/,
});
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
export const Dot = createToken({ name: "Dot", pattern: /\./ });
export const DoubleDot = createToken({ name: "DoubleDot", pattern: /\.\./ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ });

// Comparison operators
export const Equal = createToken({ name: "Equal", pattern: /=/ });
export const NotEqual = createToken({ name: "NotEqual", pattern: /<>/ });
export const LessEqual = createToken({ name: "LessEqual", pattern: /<=/ });
export const GreaterEqual = createToken({
  name: "GreaterEqual",
  pattern: />=/,
});
export const Less = createToken({ name: "Less", pattern: /</ });
export const Greater = createToken({ name: "Greater", pattern: />/ });

// Arithmetic operators
export const Plus = createToken({ name: "Plus", pattern: /\+/ });
export const Minus = createToken({ name: "Minus", pattern: /-/ });
export const Star = createToken({ name: "Star", pattern: /\*/ });
export const Slash = createToken({ name: "Slash", pattern: /\// });
export const Power = createToken({ name: "Power", pattern: /\*\*/ });

// Reference operators (IEC v3)
export const Caret = createToken({ name: "Caret", pattern: /\^/ });
export const Ampersand = createToken({ name: "Ampersand", pattern: /&/ });

// Located variable prefix
export const DirectAddress = createToken({
  name: "DirectAddress",
  pattern: /%[IQM][XBWDL]?[0-9]+(?:\.[0-9]+)*/i,
});

// =============================================================================
// Identifier (must be last to avoid matching keywords)
// =============================================================================

export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

// =============================================================================
// Keyword Configuration
// =============================================================================

// Configure all keywords to use Identifier as longer_alt
// This ensures that 'var123' is tokenized as Identifier, not VAR + 123
const keywordTokens = [
  PROGRAM,
  END_PROGRAM,
  FUNCTION,
  END_FUNCTION,
  FUNCTION_BLOCK,
  END_FUNCTION_BLOCK,
  VAR,
  END_VAR,
  VAR_INPUT,
  VAR_OUTPUT,
  VAR_IN_OUT,
  VAR_EXTERNAL,
  VAR_GLOBAL,
  VAR_TEMP,
  CONSTANT,
  RETAIN,
  AT,
  TYPE,
  END_TYPE,
  STRUCT,
  END_STRUCT,
  ARRAY,
  OF,
  CONFIGURATION,
  END_CONFIGURATION,
  RESOURCE,
  END_RESOURCE,
  TASK,
  WITH,
  ON,
  IF,
  THEN,
  ELSIF,
  ELSE,
  END_IF,
  CASE,
  END_CASE,
  FOR,
  TO,
  BY,
  DO,
  END_FOR,
  WHILE,
  END_WHILE,
  REPEAT,
  UNTIL,
  END_REPEAT,
  EXIT,
  RETURN,
  TRUE,
  FALSE,
  AND,
  OR,
  XOR,
  NOT,
  MOD,
  REFERENCE_TO,
  REF_TO,
  DREF,
  REF,
  NULL,
];

// Set longer_alt for all keywords
keywordTokens.forEach((token) => {
  token.LONGER_ALT = Identifier;
});

// =============================================================================
// Token List (order matters for matching priority)
// =============================================================================

/**
 * All tokens in order of matching priority.
 * Keywords must come before Identifier to be matched correctly.
 */
export const allTokens = [
  // Whitespace and comments (skipped)
  WhiteSpace,
  Comment,

  // Multi-character operators (before single-character)
  DoubleDot,
  Power,
  RefAssign,
  Assign,
  OutputAssign,
  NotEqual,
  LessEqual,
  GreaterEqual,

  // Keywords (before Identifier)
  END_PROGRAM,
  END_FUNCTION_BLOCK,
  END_FUNCTION,
  END_CONFIGURATION,
  END_RESOURCE,
  END_STRUCT,
  END_TYPE,
  END_VAR,
  END_IF,
  END_CASE,
  END_FOR,
  END_WHILE,
  END_REPEAT,
  FUNCTION_BLOCK,
  FUNCTION,
  PROGRAM,
  CONFIGURATION,
  RESOURCE,
  VAR_INPUT,
  VAR_OUTPUT,
  VAR_IN_OUT,
  VAR_EXTERNAL,
  VAR_GLOBAL,
  VAR_TEMP,
  VAR,
  CONSTANT,
  RETAIN,
  TYPE,
  STRUCT,
  ARRAY,
  OF,
  AT,
  TASK,
  WITH,
  ON,
  IF,
  THEN,
  ELSIF,
  ELSE,
  CASE,
  FOR,
  TO,
  BY,
  DO,
  WHILE,
  REPEAT,
  UNTIL,
  EXIT,
  RETURN,
  TRUE,
  FALSE,
  AND,
  OR,
  XOR,
  NOT,
  MOD,
  REFERENCE_TO,
  REF_TO,
  DREF,
  REF,
  NULL,

  // Literals
  TimeLiteral,
  DateTimeLiteral,
  DateLiteral,
  TimeOfDayLiteral,
  RealLiteral,
  IntegerLiteral,
  StringLiteral,
  WideStringLiteral,
  DirectAddress,

  // Single-character operators and punctuation
  Colon,
  Semicolon,
  Comma,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Equal,
  Less,
  Greater,
  Plus,
  Minus,
  Star,
  Slash,
  Caret,
  Ampersand,

  // Identifier (last)
  Identifier,
];

/**
 * The STruC++ lexer instance.
 */
export const STLexer = new Lexer(allTokens);

/**
 * Tokenize ST source code.
 *
 * @param source - The ST source code to tokenize
 * @returns Lexer result with tokens and any lexing errors
 */
export function tokenize(source: string): ReturnType<typeof STLexer.tokenize> {
  return STLexer.tokenize(source);
}
