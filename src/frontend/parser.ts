/**
 * STruC++ Parser
 *
 * Parses IEC 61131-3 Structured Text tokens into an Abstract Syntax Tree.
 * Uses Chevrotain's embedded DSL for grammar definition.
 */

import { CstParser, CstNode } from "chevrotain";
import * as tokens from "./lexer.js";

/**
 * STruC++ Parser for IEC 61131-3 Structured Text.
 *
 * This parser produces a Concrete Syntax Tree (CST) which is then
 * transformed into an Abstract Syntax Tree (AST) by the visitor.
 */
export class STParser extends CstParser {
  constructor() {
    super(tokens.allTokens, {
      recoveryEnabled: true,
      maxLookahead: 3,
    });

    this.performSelfAnalysis();
  }

  // ==========================================================================
  // Top-level rules
  // ==========================================================================

  /**
   * Entry point: A compilation unit contains one or more POUs or type definitions.
   */
  public compilationUnit = this.RULE("compilationUnit", () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.programDeclaration) },
        { ALT: () => this.SUBRULE(this.functionDeclaration) },
        { ALT: () => this.SUBRULE(this.functionBlockDeclaration) },
        { ALT: () => this.SUBRULE(this.typeDeclaration) },
        { ALT: () => this.SUBRULE(this.configurationDeclaration) },
      ]);
    });
  });

  // ==========================================================================
  // Program Organization Units
  // ==========================================================================

  /**
   * PROGRAM declaration
   */
  public programDeclaration = this.RULE("programDeclaration", () => {
    this.CONSUME(tokens.PROGRAM);
    this.CONSUME(tokens.Identifier);
    this.MANY(() => {
      this.SUBRULE(this.varBlock);
    });
    this.OPTION(() => {
      this.SUBRULE(this.statementList);
    });
    this.CONSUME(tokens.END_PROGRAM);
  });

  /**
   * FUNCTION declaration
   */
  public functionDeclaration = this.RULE("functionDeclaration", () => {
    this.CONSUME(tokens.FUNCTION);
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.Colon);
    this.SUBRULE(this.dataType);
    this.MANY(() => {
      this.SUBRULE(this.varBlock);
    });
    this.OPTION(() => {
      this.SUBRULE(this.statementList);
    });
    this.CONSUME(tokens.END_FUNCTION);
  });

  /**
   * FUNCTION_BLOCK declaration
   */
  public functionBlockDeclaration = this.RULE(
    "functionBlockDeclaration",
    () => {
      this.CONSUME(tokens.FUNCTION_BLOCK);
      this.CONSUME(tokens.Identifier);
      this.MANY(() => {
        this.SUBRULE(this.varBlock);
      });
      this.OPTION(() => {
        this.SUBRULE(this.statementList);
      });
      this.CONSUME(tokens.END_FUNCTION_BLOCK);
    },
  );

  // ==========================================================================
  // Variable declarations
  // ==========================================================================

  /**
   * Variable block (VAR, VAR_INPUT, VAR_OUTPUT, etc.)
   */
  public varBlock = this.RULE("varBlock", () => {
    this.OR([
      { ALT: () => this.CONSUME(tokens.VAR) },
      { ALT: () => this.CONSUME(tokens.VAR_INPUT) },
      { ALT: () => this.CONSUME(tokens.VAR_OUTPUT) },
      { ALT: () => this.CONSUME(tokens.VAR_IN_OUT) },
      { ALT: () => this.CONSUME(tokens.VAR_EXTERNAL) },
      { ALT: () => this.CONSUME(tokens.VAR_GLOBAL) },
      { ALT: () => this.CONSUME(tokens.VAR_TEMP) },
    ]);
    this.OPTION(() => {
      this.OR2([
        { ALT: () => this.CONSUME(tokens.CONSTANT) },
        { ALT: () => this.CONSUME(tokens.RETAIN) },
      ]);
    });
    this.MANY(() => {
      this.SUBRULE(this.varDeclaration);
    });
    this.CONSUME(tokens.END_VAR);
  });

  /**
   * Single variable declaration
   */
  public varDeclaration = this.RULE("varDeclaration", () => {
    this.AT_LEAST_ONE_SEP({
      SEP: tokens.Comma,
      DEF: () => this.CONSUME(tokens.Identifier),
    });
    this.OPTION(() => {
      this.CONSUME(tokens.AT);
      this.CONSUME(tokens.DirectAddress);
    });
    this.CONSUME(tokens.Colon);
    this.SUBRULE(this.dataType);
    this.OPTION2(() => {
      this.CONSUME(tokens.Assign);
      this.SUBRULE(this.expression);
    });
    this.CONSUME(tokens.Semicolon);
  });

  // ==========================================================================
  // Type declarations
  // ==========================================================================

  /**
   * TYPE declaration block
   */
  public typeDeclaration = this.RULE("typeDeclaration", () => {
    this.CONSUME(tokens.TYPE);
    this.MANY(() => {
      this.SUBRULE(this.singleTypeDeclaration);
    });
    this.CONSUME(tokens.END_TYPE);
  });

  /**
   * Single type definition
   * Supports: struct, enum (simple or typed), array, subrange, or alias
   */
  public singleTypeDeclaration = this.RULE("singleTypeDeclaration", () => {
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.Colon);
    this.OR([
      { ALT: () => this.SUBRULE(this.structType) },
      { ALT: () => this.SUBRULE(this.simpleEnumType) },
      { ALT: () => this.SUBRULE(this.arrayType) },
      { ALT: () => this.SUBRULE(this.typedEnumOrSubrangeOrAlias) },
    ]);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Structure type definition
   */
  public structType = this.RULE("structType", () => {
    this.CONSUME(tokens.STRUCT);
    this.MANY(() => {
      this.SUBRULE(this.varDeclaration);
    });
    this.CONSUME(tokens.END_STRUCT);
  });

  /**
   * Simple enumeration type definition: (RED, YELLOW, GREEN)
   * Optionally with default value: (RED, YELLOW, GREEN) := RED
   */
  public simpleEnumType = this.RULE("simpleEnumType", () => {
    this.CONSUME(tokens.LParen);
    this.AT_LEAST_ONE_SEP({
      SEP: tokens.Comma,
      DEF: () => this.SUBRULE(this.enumMember),
    });
    this.CONSUME(tokens.RParen);
    this.OPTION(() => {
      this.CONSUME(tokens.Assign);
      this.CONSUME(tokens.Identifier);
    });
  });

  /**
   * Enumeration member: NAME or NAME := value
   */
  public enumMember = this.RULE("enumMember", () => {
    this.CONSUME(tokens.Identifier);
    this.OPTION(() => {
      this.CONSUME(tokens.Assign);
      this.SUBRULE(this.expression);
    });
  });

  /**
   * Typed enumeration, subrange, or simple alias
   * - Typed enum: INT (IDLE := 0, RUNNING := 1)
   * - Subrange: INT(0..100)
   * - Alias: INT
   */
  public typedEnumOrSubrangeOrAlias = this.RULE(
    "typedEnumOrSubrangeOrAlias",
    () => {
      this.SUBRULE(this.dataType);
      this.OPTION(() => {
        this.CONSUME(tokens.LParen);
        this.OR([
          {
            ALT: () => {
              // Subrange: expression..expression
              this.SUBRULE(this.subrangeBounds);
            },
            GATE: () => this.isSubrangeAhead(),
          },
          {
            ALT: () => {
              // Typed enum: member, member, ...
              this.AT_LEAST_ONE_SEP({
                SEP: tokens.Comma,
                DEF: () => this.SUBRULE(this.enumMember),
              });
            },
          },
        ]);
        this.CONSUME(tokens.RParen);
      });
    },
  );

  /**
   * Subrange bounds: expression..expression
   */
  public subrangeBounds = this.RULE("subrangeBounds", () => {
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.DoubleDot);
    this.SUBRULE2(this.expression);
  });

  /**
   * Lookahead helper to detect if we're parsing a subrange (has ..)
   */
  private isSubrangeAhead(): boolean {
    // Look ahead to see if there's a DoubleDot token before RParen or Comma
    const MAX_LOOKAHEAD = 100;
    for (let i = 1; i <= MAX_LOOKAHEAD; i++) {
      const token = this.LA(i);
      if (token === undefined || token.tokenType === tokens.RParen) {
        return false;
      }
      if (token.tokenType === tokens.DoubleDot) {
        return true;
      }
      if (token.tokenType === tokens.Comma) {
        return false;
      }
    }
    return false;
  }

  /**
   * Array type definition
   */
  public arrayType = this.RULE("arrayType", () => {
    this.CONSUME(tokens.ARRAY);
    this.CONSUME(tokens.LBracket);
    this.SUBRULE(this.arrayDimension);
    this.MANY(() => {
      this.CONSUME(tokens.Comma);
      this.SUBRULE2(this.arrayDimension);
    });
    this.CONSUME(tokens.RBracket);
    this.CONSUME(tokens.OF);
    this.SUBRULE(this.dataType);
  });

  /**
   * Array dimension (start..end)
   */
  public arrayDimension = this.RULE("arrayDimension", () => {
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.DoubleDot);
    this.SUBRULE2(this.expression);
  });

  /**
   * Data type reference (simple type, REF_TO type, or REFERENCE_TO type)
   * Note: arrayType is handled separately in singleTypeDeclaration to avoid ambiguity
   */
  public dataType = this.RULE("dataType", () => {
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.REF_TO) },
        { ALT: () => this.CONSUME(tokens.REFERENCE_TO) },
      ]);
    });
    this.CONSUME(tokens.Identifier);
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * CONFIGURATION declaration
   */
  public configurationDeclaration = this.RULE(
    "configurationDeclaration",
    () => {
      this.CONSUME(tokens.CONFIGURATION);
      this.CONSUME(tokens.Identifier);
      this.MANY(() => {
        this.OR([
          { ALT: () => this.SUBRULE(this.varBlock) },
          { ALT: () => this.SUBRULE(this.resourceDeclaration) },
        ]);
      });
      this.CONSUME(tokens.END_CONFIGURATION);
    },
  );

  /**
   * RESOURCE declaration
   */
  public resourceDeclaration = this.RULE("resourceDeclaration", () => {
    this.CONSUME(tokens.RESOURCE);
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.ON);
    this.CONSUME2(tokens.Identifier);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.taskDeclaration) },
        { ALT: () => this.SUBRULE(this.programInstance) },
      ]);
    });
    this.CONSUME(tokens.END_RESOURCE);
  });

  /**
   * TASK declaration
   */
  public taskDeclaration = this.RULE("taskDeclaration", () => {
    this.CONSUME(tokens.TASK);
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.LParen);
    this.MANY_SEP({
      SEP: tokens.Comma,
      DEF: () => {
        this.CONSUME2(tokens.Identifier);
        this.CONSUME(tokens.Assign);
        this.SUBRULE(this.expression);
      },
    });
    this.CONSUME(tokens.RParen);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Program instance declaration
   */
  public programInstance = this.RULE("programInstance", () => {
    this.CONSUME(tokens.PROGRAM);
    this.CONSUME(tokens.Identifier);
    this.OPTION(() => {
      this.CONSUME(tokens.WITH);
      this.CONSUME2(tokens.Identifier);
    });
    this.CONSUME(tokens.Colon);
    this.CONSUME3(tokens.Identifier);
    this.CONSUME(tokens.Semicolon);
  });

  // ==========================================================================
  // Statements
  // ==========================================================================

  /**
   * List of statements
   */
  public statementList = this.RULE("statementList", () => {
    this.MANY(() => {
      this.SUBRULE(this.statement);
    });
  });

  /**
   * Single statement
   */
  public statement = this.RULE("statement", () => {
    this.OR([
      {
        ALT: () => this.SUBRULE(this.refAssignStatement),
        GATE: () => this.isRefAssignAhead(),
      },
      { ALT: () => this.SUBRULE(this.assignmentStatement) },
      { ALT: () => this.SUBRULE(this.ifStatement) },
      { ALT: () => this.SUBRULE(this.caseStatement) },
      { ALT: () => this.SUBRULE(this.forStatement) },
      { ALT: () => this.SUBRULE(this.whileStatement) },
      { ALT: () => this.SUBRULE(this.repeatStatement) },
      { ALT: () => this.SUBRULE(this.exitStatement) },
      { ALT: () => this.SUBRULE(this.returnStatement) },
      { ALT: () => this.SUBRULE(this.functionCallStatement) },
      { ALT: () => this.SUBRULE(this.externalCodePragma) },
    ]);
  });

  /**
   * External code pragma: {external ... }
   * Content is passed through AS-IS to generated C++ code.
   */
  public externalCodePragma = this.RULE("externalCodePragma", () => {
    this.CONSUME(tokens.ExternalPragma);
  });

  /**
   * Lookahead helper to detect if we're parsing a refAssign statement (has REF=)
   */
  private isRefAssignAhead(): boolean {
    // Look ahead to see if there's a RefAssign token before Semicolon or Assign
    const MAX_LOOKAHEAD = 50;
    for (let i = 1; i <= MAX_LOOKAHEAD; i++) {
      const token = this.LA(i);
      if (token === undefined || token.tokenType === tokens.Semicolon) {
        return false;
      }
      if (token.tokenType === tokens.RefAssign) {
        return true;
      }
      if (token.tokenType === tokens.Assign) {
        return false;
      }
    }
    return false;
  }

  /**
   * REF= assignment statement (bind REFERENCE_TO to a variable)
   */
  public refAssignStatement = this.RULE("refAssignStatement", () => {
    this.SUBRULE(this.variable);
    this.CONSUME(tokens.RefAssign);
    this.SUBRULE2(this.variable);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Assignment statement
   */
  public assignmentStatement = this.RULE("assignmentStatement", () => {
    this.SUBRULE(this.variable);
    this.CONSUME(tokens.Assign);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * IF statement
   */
  public ifStatement = this.RULE("ifStatement", () => {
    this.CONSUME(tokens.IF);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.THEN);
    this.SUBRULE(this.statementList);
    this.MANY(() => {
      this.CONSUME(tokens.ELSIF);
      this.SUBRULE2(this.expression);
      this.CONSUME2(tokens.THEN);
      this.SUBRULE2(this.statementList);
    });
    this.OPTION(() => {
      this.CONSUME(tokens.ELSE);
      this.SUBRULE3(this.statementList);
    });
    this.CONSUME(tokens.END_IF);
    this.OPTION2(() => {
      this.CONSUME(tokens.Semicolon);
    });
  });

  /**
   * CASE statement
   */
  public caseStatement = this.RULE("caseStatement", () => {
    this.CONSUME(tokens.CASE);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.OF);
    this.MANY(() => {
      this.SUBRULE(this.caseElement);
    });
    this.OPTION(() => {
      this.CONSUME(tokens.ELSE);
      this.SUBRULE(this.statementList);
    });
    this.CONSUME(tokens.END_CASE);
    this.OPTION2(() => {
      this.CONSUME(tokens.Semicolon);
    });
  });

  /**
   * CASE element (one or more case labels with statements)
   */
  public caseElement = this.RULE("caseElement", () => {
    this.AT_LEAST_ONE_SEP({
      SEP: tokens.Comma,
      DEF: () => this.SUBRULE(this.caseLabel),
    });
    this.CONSUME(tokens.Colon);
    this.SUBRULE(this.statementList);
  });

  /**
   * Case label (single value or range)
   */
  public caseLabel = this.RULE("caseLabel", () => {
    this.SUBRULE(this.expression);
    this.OPTION(() => {
      this.CONSUME(tokens.DoubleDot);
      this.SUBRULE2(this.expression);
    });
  });

  /**
   * FOR statement
   */
  public forStatement = this.RULE("forStatement", () => {
    this.CONSUME(tokens.FOR);
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.Assign);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.TO);
    this.SUBRULE2(this.expression);
    this.OPTION(() => {
      this.CONSUME(tokens.BY);
      this.SUBRULE3(this.expression);
    });
    this.CONSUME(tokens.DO);
    this.SUBRULE(this.statementList);
    this.CONSUME(tokens.END_FOR);
    this.OPTION2(() => {
      this.CONSUME(tokens.Semicolon);
    });
  });

  /**
   * WHILE statement
   */
  public whileStatement = this.RULE("whileStatement", () => {
    this.CONSUME(tokens.WHILE);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.DO);
    this.SUBRULE(this.statementList);
    this.CONSUME(tokens.END_WHILE);
    this.OPTION(() => {
      this.CONSUME(tokens.Semicolon);
    });
  });

  /**
   * REPEAT statement
   */
  public repeatStatement = this.RULE("repeatStatement", () => {
    this.CONSUME(tokens.REPEAT);
    this.SUBRULE(this.statementList);
    this.CONSUME(tokens.UNTIL);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.END_REPEAT);
    this.OPTION(() => {
      this.CONSUME(tokens.Semicolon);
    });
  });

  /**
   * EXIT statement
   */
  public exitStatement = this.RULE("exitStatement", () => {
    this.CONSUME(tokens.EXIT);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * RETURN statement
   */
  public returnStatement = this.RULE("returnStatement", () => {
    this.CONSUME(tokens.RETURN);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Function/FB call as statement
   */
  public functionCallStatement = this.RULE("functionCallStatement", () => {
    this.SUBRULE(this.functionCall);
    this.CONSUME(tokens.Semicolon);
  });

  // ==========================================================================
  // Expressions
  // ==========================================================================

  /**
   * Expression (entry point for expression parsing)
   */
  public expression = this.RULE("expression", () => {
    this.SUBRULE(this.orExpression);
  });

  /**
   * OR expression
   */
  public orExpression = this.RULE("orExpression", () => {
    this.SUBRULE(this.xorExpression);
    this.MANY(() => {
      this.CONSUME(tokens.OR);
      this.SUBRULE2(this.xorExpression);
    });
  });

  /**
   * XOR expression
   */
  public xorExpression = this.RULE("xorExpression", () => {
    this.SUBRULE(this.andExpression);
    this.MANY(() => {
      this.CONSUME(tokens.XOR);
      this.SUBRULE2(this.andExpression);
    });
  });

  /**
   * AND expression
   */
  public andExpression = this.RULE("andExpression", () => {
    this.SUBRULE(this.comparisonExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.AND) },
        { ALT: () => this.CONSUME(tokens.Ampersand) },
      ]);
      this.SUBRULE2(this.comparisonExpression);
    });
  });

  /**
   * Comparison expression
   */
  public comparisonExpression = this.RULE("comparisonExpression", () => {
    this.SUBRULE(this.addExpression);
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.Equal) },
        { ALT: () => this.CONSUME(tokens.NotEqual) },
        { ALT: () => this.CONSUME(tokens.Less) },
        { ALT: () => this.CONSUME(tokens.Greater) },
        { ALT: () => this.CONSUME(tokens.LessEqual) },
        { ALT: () => this.CONSUME(tokens.GreaterEqual) },
      ]);
      this.SUBRULE2(this.addExpression);
    });
  });

  /**
   * Addition/subtraction expression
   */
  public addExpression = this.RULE("addExpression", () => {
    this.SUBRULE(this.mulExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.Plus) },
        { ALT: () => this.CONSUME(tokens.Minus) },
      ]);
      this.SUBRULE2(this.mulExpression);
    });
  });

  /**
   * Multiplication/division expression
   */
  public mulExpression = this.RULE("mulExpression", () => {
    this.SUBRULE(this.powerExpression);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.Star) },
        { ALT: () => this.CONSUME(tokens.Slash) },
        { ALT: () => this.CONSUME(tokens.MOD) },
      ]);
      this.SUBRULE2(this.powerExpression);
    });
  });

  /**
   * Power expression
   */
  public powerExpression = this.RULE("powerExpression", () => {
    this.SUBRULE(this.unaryExpression);
    this.OPTION(() => {
      this.CONSUME(tokens.Power);
      this.SUBRULE2(this.unaryExpression);
    });
  });

  /**
   * Unary expression
   */
  public unaryExpression = this.RULE("unaryExpression", () => {
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.NOT) },
        { ALT: () => this.CONSUME(tokens.Minus) },
        { ALT: () => this.CONSUME(tokens.Plus) },
      ]);
    });
    this.SUBRULE(this.primaryExpression);
  });

  /**
   * Primary expression
   */
  public primaryExpression = this.RULE("primaryExpression", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.literal) },
      { ALT: () => this.SUBRULE(this.refExpression) },
      { ALT: () => this.SUBRULE(this.drefExpression) },
      { ALT: () => this.SUBRULE(this.functionCall) },
      { ALT: () => this.SUBRULE(this.variable) },
      {
        ALT: () => {
          this.CONSUME(tokens.LParen);
          this.SUBRULE(this.expression);
          this.CONSUME(tokens.RParen);
        },
      },
    ]);
  });

  /**
   * REF(variable) expression - get reference to a variable
   */
  public refExpression = this.RULE("refExpression", () => {
    this.CONSUME(tokens.REF);
    this.CONSUME(tokens.LParen);
    this.SUBRULE(this.variable);
    this.CONSUME(tokens.RParen);
  });

  /**
   * DREF(expression) expression - dereference a reference
   */
  public drefExpression = this.RULE("drefExpression", () => {
    this.CONSUME(tokens.DREF);
    this.CONSUME(tokens.LParen);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.RParen);
  });

  /**
   * Variable reference (with optional array subscripts and field access)
   */
  public variable = this.RULE("variable", () => {
    this.CONSUME(tokens.Identifier);
    this.MANY(() => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(tokens.LBracket);
            this.AT_LEAST_ONE_SEP({
              SEP: tokens.Comma,
              DEF: () => this.SUBRULE(this.expression),
            });
            this.CONSUME(tokens.RBracket);
          },
        },
        {
          ALT: () => {
            this.CONSUME(tokens.Dot);
            this.CONSUME2(tokens.Identifier);
          },
        },
        {
          ALT: () => {
            this.CONSUME(tokens.Caret);
          },
        },
      ]);
    });
  });

  /**
   * Function or FB call
   */
  public functionCall = this.RULE("functionCall", () => {
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.LParen);
    this.OPTION(() => {
      this.SUBRULE(this.argumentList);
    });
    this.CONSUME(tokens.RParen);
  });

  /**
   * Argument list for function calls
   */
  public argumentList = this.RULE("argumentList", () => {
    this.AT_LEAST_ONE_SEP({
      SEP: tokens.Comma,
      DEF: () => this.SUBRULE(this.argument),
    });
  });

  /**
   * Single argument (positional or named)
   */
  public argument = this.RULE("argument", () => {
    this.OPTION(() => {
      this.CONSUME(tokens.Identifier);
      this.OR([
        { ALT: () => this.CONSUME(tokens.Assign) },
        { ALT: () => this.CONSUME(tokens.OutputAssign) },
      ]);
    });
    this.SUBRULE(this.expression);
  });

  /**
   * Literal value
   */
  public literal = this.RULE("literal", () => {
    this.OR([
      { ALT: () => this.CONSUME(tokens.TRUE) },
      { ALT: () => this.CONSUME(tokens.FALSE) },
      { ALT: () => this.CONSUME(tokens.IntegerLiteral) },
      { ALT: () => this.CONSUME(tokens.RealLiteral) },
      { ALT: () => this.CONSUME(tokens.StringLiteral) },
      { ALT: () => this.CONSUME(tokens.WideStringLiteral) },
      { ALT: () => this.CONSUME(tokens.TimeLiteral) },
      { ALT: () => this.CONSUME(tokens.DateLiteral) },
      { ALT: () => this.CONSUME(tokens.TimeOfDayLiteral) },
      { ALT: () => this.CONSUME(tokens.DateTimeLiteral) },
      { ALT: () => this.CONSUME(tokens.NULL) },
    ]);
  });
}

/**
 * Singleton parser instance.
 */
export const parser = new STParser();

/**
 * Parse ST source code into a CST.
 *
 * @param source - The ST source code to parse
 * @returns Parse result with CST and any errors
 */
export function parse(source: string): {
  cst: CstNode | null;
  errors: unknown[];
} {
  const lexResult = tokens.tokenize(source);

  if (lexResult.errors.length > 0) {
    return {
      cst: null,
      errors: lexResult.errors,
    };
  }

  parser.input = lexResult.tokens;
  const cst = parser.compilationUnit();

  return {
    cst,
    errors: parser.errors,
  };
}
