/**
 * Custom chevrotain {@link IParserErrorMessageProvider} for the
 * Structured Text grammar.
 *
 * The default provider on chevrotain's `NoViableAltException` enumerates
 * every valid token path through every alternative of the failed `OR()`.
 * For statement-level alternations in this grammar that's ~1,400 paths;
 * the message that lands in front of the user is unreadable.
 *
 * This module replaces those messages with concise, rule-aware
 * sentences that name the actual unexpected token and describe what
 * rule was being parsed.  The full path enumeration is preserved only
 * for grammar-debugging purposes — set `STRUCPP_VERBOSE_PARSER_ERRORS=1`
 * to bypass this provider and fall back to chevrotain's default.
 *
 * The {@link RULE_DESCRIPTIONS} table grows organically.  When a user
 * reports a confusing message, add a friendly description for the rule
 * name that surfaced.  Anything unmapped falls back to
 * `parsing rule \`<ruleName>\`` — degraded but never broken.
 */

import type {
  IParserErrorMessageProvider,
  IToken,
  TokenType,
} from "chevrotain";

/**
 * Friendly descriptions for the rules that fail in front of users
 * most often.  Phrased to slot into "Unexpected <token> while
 * `<description>`." — keep the wording consistent so the rendered
 * sentence reads naturally.
 */
const RULE_DESCRIPTIONS: Record<string, string> = {
  // Top-level
  compilationUnit: "parsing the program",
  programDeclaration: "parsing a PROGRAM declaration",
  functionDeclaration: "parsing a FUNCTION declaration",
  functionBlockDeclaration: "parsing a FUNCTION_BLOCK declaration",
  interfaceDeclaration: "parsing an INTERFACE declaration",
  methodDeclaration: "parsing a METHOD declaration",
  propertyDeclaration: "parsing a PROPERTY declaration",
  configurationDeclaration: "parsing a CONFIGURATION block",
  resourceDeclaration: "parsing a RESOURCE block",
  taskDeclaration: "parsing a TASK declaration",
  programInstance: "parsing a program instance",

  // Statements
  statementList: "parsing a statement block",
  statement: "parsing a statement",
  assignmentStatement: "parsing an assignment",
  refAssignStatement: "parsing a reference assignment",
  functionCallStatement: "parsing a function call",
  methodCallStatement: "parsing a method call",
  ifStatement: "parsing an IF statement",
  caseStatement: "parsing a CASE statement",
  caseStatementList: "parsing a CASE statement",
  caseElement: "parsing a CASE branch",
  caseLabel: "parsing a CASE label",
  forStatement: "parsing a FOR loop",
  whileStatement: "parsing a WHILE loop",
  repeatStatement: "parsing a REPEAT loop",
  exitStatement: "parsing an EXIT statement",
  returnStatement: "parsing a RETURN statement",
  deleteStatement: "parsing a __DELETE statement",
  advanceTimeStatement: "parsing an __advance_time call",
  mockStatement: "parsing a mock declaration",
  mockVerifyStatement: "parsing a mock verification",

  // Expressions
  expression: "parsing an expression",
  orExpression: "parsing an expression",
  andExpression: "parsing an expression",
  comparisonExpression: "parsing a comparison",
  addExpression: "parsing an arithmetic expression",
  mulExpression: "parsing an arithmetic expression",
  powerExpression: "parsing an arithmetic expression",
  primaryExpression: "parsing an expression",
  literal: "parsing a literal value",
  functionCall: "parsing a function call",
  methodCall: "parsing a method call",
  chainedMethodCall: "parsing a method call",
  argumentList: "parsing a function-call argument list",
  argument: "parsing a function-call argument",
  qualifiedIdentifier: "parsing an identifier",
  refExpression: "parsing a REF() expression",
  drefExpression: "parsing a DREF^ expression",
  newExpression: "parsing a __NEW expression",

  // Declarations
  varBlock: "parsing a VAR block",
  methodVarBlock: "parsing a method VAR block",
  varDeclaration: "parsing a variable declaration",
  initializerExpression: "parsing a variable initializer",
  arrayLiteral: "parsing an array literal",
  dataType: "parsing a data type",
  singleTypeDeclaration: "parsing a type declaration",
  structType: "parsing a STRUCT type",
  simpleEnumType: "parsing an enum type",
  enumMember: "parsing an enum member",
  arrayType: "parsing an ARRAY type",
  arrayDimension: "parsing an ARRAY dimension",
  subrangeBounds: "parsing a subrange",
  typedEnumOrSubrangeOrAlias: "parsing a type declaration",

  // Misc
  assertCall: "parsing an ASSERT_* call",
  externalCodePragma: "parsing an external-code pragma",
  setupBlock: "parsing a __setup block",
  identifierOrKeyword: "parsing an identifier",
  interfaceMethodDeclaration: "parsing an interface method signature",
  propertyGetter: "parsing a property GET accessor",
  propertySetter: "parsing a property SET accessor",
};

/**
 * Render a token in a way that's useful to a human reader.  Keywords
 * and punctuation are reported by their token type name (e.g.
 * `END_FUNCTION_BLOCK`, `Semicolon`); identifiers and literals
 * surface their actual image (`sdfasdfa`, `42`).  Falls back to the
 * token type name when the image is missing.
 */
function formatToken(token: IToken | undefined): string {
  if (!token) return "end of input";
  const typeName = token.tokenType?.name ?? "<unknown>";
  const image = token.image;
  // Keyword tokens have image === typeName-ish — favor the image when
  // it differs (covers user-typed identifiers and literals) and the
  // type name when they coincide (covers keywords like `END_VAR`).
  if (typeName === "Identifier" && image) return `identifier \`${image}\``;
  if (typeName === "IntegerLiteral" && image)
    return `integer literal \`${image}\``;
  if (typeName === "RealLiteral" && image) return `real literal \`${image}\``;
  if (typeName === "StringLiteral" && image)
    return `string literal \`${image}\``;
  if (typeName === "WideStringLiteral" && image)
    return `string literal \`${image}\``;
  if (typeName === "TimeLiteral" && image) return `time literal \`${image}\``;
  if (typeName === "DateLiteral" && image) return `date literal \`${image}\``;
  if (typeName === "TimeOfDayLiteral" && image)
    return `time-of-day literal \`${image}\``;
  if (typeName === "DateTimeLiteral" && image)
    return `date-time literal \`${image}\``;
  if (typeName === "TypedLiteral" && image) return `typed literal \`${image}\``;
  return `\`${image || typeName}\``;
}

function describeRule(ruleName: string): string {
  return RULE_DESCRIPTIONS[ruleName] ?? `parsing rule \`${ruleName}\``;
}

/**
 * The provider chevrotain consults whenever it has to format a parse
 * error.  Each method below mirrors the corresponding method on
 * {@link IParserErrorMessageProvider}; signatures must match the
 * chevrotain contract exactly.
 */
export const stParserErrorMessageProvider: IParserErrorMessageProvider = {
  /**
   * A {@link BaseParser.CONSUME} call failed: the parser expected
   * exactly one specific token type at this position and got
   * something else.  The default chevrotain message
   * (`Expecting token of type --> X <-- but found --> 'Y' <--`)
   * is already concise — just rewrap it to match the house style.
   */
  buildMismatchTokenMessage({ expected, actual }) {
    return `Expected \`${expected.name}\`, found ${formatToken(actual)}.`;
  },

  /**
   * Parsing finished successfully but there were tokens left over.
   * Usually means an unbalanced END_* keyword or an extra semicolon
   * after the last block.
   */
  buildNotAllInputParsedMessage({ firstRedundant, ruleName }) {
    return (
      `Unexpected extra input after ${describeRule(ruleName)}: ` +
      `${formatToken(firstRedundant)}.`
    );
  },

  /**
   * The headline case.  A {@link BaseParser.OR} alternation failed
   * because none of its branches matched the upcoming token stream.
   * Chevrotain's default lists every expected token path; that's the
   * 1,400-line dump the user complained about.  We DROP
   * `expectedPathsPerAlt` and produce a sentence built from `ruleName`
   * + the unexpected token.
   *
   * The unused params are kept on the signature so the contract
   * stays satisfied; eslint/prettier won't complain about underscore
   * names.
   */
  buildNoViableAltMessage({ actual, previous, ruleName }) {
    const after =
      previous && previous !== actual[0]
        ? ` after ${formatToken(previous)}`
        : "";
    return `Unexpected ${formatToken(actual[0])}${after} while ${describeRule(ruleName)}.`;
  },

  /**
   * A {@link BaseParser.AT_LEAST_ONE} / `AT_LEAST_ONE_SEP` saw zero
   * iterations.  Same shape as `NoViableAlt` but the rule is one of
   * the few that demands a non-empty body (statement list inside a
   * non-empty IF / FOR body, etc.).
   */
  buildEarlyExitMessage({ actual, ruleName }) {
    return (
      `Expected at least one entry while ${describeRule(ruleName)}; ` +
      `found ${formatToken(actual[0])}.`
    );
  },
};

/**
 * Internal helper exported for the suggestion layer.  Given a parser
 * rule name and the actual unexpected token, return a short
 * remediation hint or `undefined` when the case isn't covered.
 *
 * Kept in this file (rather than in `index.ts`) so the rule-name
 * → suggestion mapping lives next to the rule-name → description
 * mapping it builds on.  Add an entry whenever a real-world error
 * makes the simple-format message insufficient.
 */
export function suggestionForParseError(
  ruleName: string,
  actual: IToken | undefined,
): string | undefined {
  if (!actual) return undefined;
  const tokenName = actual.tokenType?.name;
  if (ruleName === "statement" && tokenName === "Identifier") {
    return (
      "Statements start with an assignment (`:=`), a function call, " +
      "or a block keyword (IF / CASE / FOR / WHILE / REPEAT / " +
      "RETURN / EXIT).  Did you forget `:=` after the identifier?"
    );
  }
  if (ruleName === "varDeclaration" || ruleName === "varBlock") {
    return (
      "Variable declarations look like `name : TYPE := initialValue;` " +
      "inside a VAR / VAR_INPUT / VAR_OUTPUT block."
    );
  }
  if (ruleName === "dataType") {
    return (
      "Expected a type name (BOOL / INT / REAL / STRING / TIME / a " +
      "user-defined TYPE / an ARRAY[...] OF ...)."
    );
  }
  if (ruleName === "ifStatement") {
    return (
      "IF blocks need `IF <cond> THEN <stmt>; <stmt>; END_IF;`.  " +
      "ELSIF / ELSE branches are optional."
    );
  }
  if (ruleName === "argumentList" && tokenName === "Semicolon") {
    return "Function-call arguments are separated by `,` and end with `)`, not `;`.";
  }
  return undefined;
}

/**
 * Whether to use the custom provider (default) or fall back to
 * chevrotain's verbose path-listing provider.  Set
 * `STRUCPP_VERBOSE_PARSER_ERRORS=1` in the environment to see the
 * full alternation paths — useful when *debugging the grammar
 * itself*, never in front of end users.
 *
 * Resolved at parser-construction time, so flipping the env var
 * mid-process won't have any effect (which is the right behaviour —
 * chevrotain caches the provider into its initialised parser).
 */
export function shouldUseVerboseErrors(): boolean {
  // The browser bundle ships without a `process` global; fall back to
  // "no, use the friendly provider" in that case.
  if (typeof process === "undefined") return false;
  return process.env?.STRUCPP_VERBOSE_PARSER_ERRORS === "1";
}

/**
 * The provider to install on the parser.  Returns `undefined` (so
 * chevrotain uses its default) when the verbose escape hatch is on.
 */
export function resolveErrorMessageProvider():
  | IParserErrorMessageProvider
  | undefined {
  return shouldUseVerboseErrors() ? undefined : stParserErrorMessageProvider;
}

// Re-export the TokenType type from chevrotain so consumers that want
// to add custom RULE_DESCRIPTIONS at runtime don't have to import it
// separately.  Not used by this module directly but cheap to expose.
export type { TokenType };
