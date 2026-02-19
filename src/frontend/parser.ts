/**
 * STruC++ Parser
 *
 * Parses IEC 61131-3 Structured Text tokens into an Abstract Syntax Tree.
 * Uses Chevrotain's embedded DSL for grammar definition.
 */

import { CstParser, CstNode, type TokenType } from "chevrotain";
import * as tokens from "./lexer.js";

/**
 * STruC++ Parser for IEC 61131-3 Structured Text.
 *
 * This parser produces a Concrete Syntax Tree (CST) which is then
 * transformed into an Abstract Syntax Tree (AST) by the visitor.
 */
export class STParser extends CstParser {
  constructor(tokenVocabulary?: import("chevrotain").TokenType[]) {
    super(tokenVocabulary ?? tokens.allTokens, {
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
      this.OR({
        DEF: [
          {
            ALT: () => this.SUBRULE(this.programDeclaration),
            GATE: () => this.LA(1).tokenType === tokens.PROGRAM,
          },
          {
            ALT: () => this.SUBRULE(this.functionDeclaration),
            GATE: () => this.LA(1).tokenType === tokens.FUNCTION,
          },
          {
            ALT: () => this.SUBRULE(this.functionBlockDeclaration),
            GATE: () => this.LA(1).tokenType === tokens.FUNCTION_BLOCK,
          },
          {
            ALT: () => this.SUBRULE(this.interfaceDeclaration),
            GATE: () => this.LA(1).tokenType === tokens.INTERFACE,
          },
          {
            ALT: () => this.SUBRULE(this.typeDeclaration),
            GATE: () => this.LA(1).tokenType === tokens.TYPE,
          },
          {
            ALT: () => this.SUBRULE(this.configurationDeclaration),
            GATE: () => this.LA(1).tokenType === tokens.CONFIGURATION,
          },
          {
            // Top-level VAR_GLOBAL ... END_VAR (GVL files)
            ALT: () => this.SUBRULE(this.varBlock),
            GATE: () => this.LA(1).tokenType === tokens.VAR_GLOBAL,
          },
        ],
        IGNORE_AMBIGUITIES: true,
      });
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
    this.SUBRULE(this.identifierOrKeyword);
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
   * FUNCTION_BLOCK declaration with OOP extensions
   * Supports: ABSTRACT, FINAL, EXTENDS, IMPLEMENTS, methods, properties
   */
  public functionBlockDeclaration = this.RULE(
    "functionBlockDeclaration",
    () => {
      this.CONSUME(tokens.FUNCTION_BLOCK);
      // Optional ABSTRACT and/or FINAL modifier (semantic analysis catches contradictions)
      this.OPTION(() => {
        this.CONSUME(tokens.ABSTRACT);
      });
      this.OPTION6(() => {
        this.CONSUME(tokens.FINAL);
      });
      this.SUBRULE(this.identifierOrKeyword);
      // Optional EXTENDS clause
      this.OPTION2(() => {
        this.CONSUME(tokens.EXTENDS);
        this.CONSUME2(tokens.Identifier);
      });
      // Optional IMPLEMENTS clause
      this.OPTION3(() => {
        this.CONSUME(tokens.IMPLEMENTS);
        this.AT_LEAST_ONE_SEP({
          SEP: tokens.Comma,
          DEF: () => this.CONSUME3(tokens.Identifier),
        });
      });
      // VAR blocks, methods, properties interleaved (before body)
      this.MANY(() => {
        this.OR2({
          DEF: [
            {
              ALT: () => this.SUBRULE(this.varBlock),
              GATE: () => this.isVarBlockAhead(),
            },
            {
              ALT: () => this.SUBRULE(this.methodDeclaration),
              GATE: () => this.LA(1).tokenType === tokens.METHOD,
            },
            {
              ALT: () => this.SUBRULE(this.propertyDeclaration),
              GATE: () => this.LA(1).tokenType === tokens.PROPERTY,
            },
          ],
          IGNORE_AMBIGUITIES: true,
        });
      });
      // Optional body statements (the FB's operator() body)
      this.OPTION4(() => {
        this.SUBRULE(this.statementList);
      });
      this.CONSUME(tokens.END_FUNCTION_BLOCK);
    },
  );

  // ==========================================================================
  // OOP Extensions (IEC 61131-3 Edition 3)
  // ==========================================================================

  /**
   * INTERFACE declaration
   */
  public interfaceDeclaration = this.RULE("interfaceDeclaration", () => {
    this.CONSUME(tokens.INTERFACE);
    this.CONSUME(tokens.Identifier);
    // Optional EXTENDS clause (interface inheritance)
    this.OPTION(() => {
      this.CONSUME(tokens.EXTENDS);
      this.AT_LEAST_ONE_SEP({
        SEP: tokens.Comma,
        DEF: () => this.CONSUME2(tokens.Identifier),
      });
    });
    // Interface methods (abstract, no body)
    this.MANY(() => {
      this.SUBRULE(this.interfaceMethodDeclaration);
    });
    this.CONSUME(tokens.END_INTERFACE);
  });

  /**
   * Interface method declaration (no body, implicitly abstract)
   */
  public interfaceMethodDeclaration = this.RULE(
    "interfaceMethodDeclaration",
    () => {
      this.CONSUME(tokens.METHOD);
      this.CONSUME(tokens.Identifier);
      // Optional return type
      this.OPTION(() => {
        this.CONSUME(tokens.Colon);
        this.SUBRULE(this.dataType);
      });
      // Optional VAR_INPUT blocks
      this.MANY(() => {
        this.SUBRULE(this.varBlock);
      });
      this.CONSUME(tokens.END_METHOD);
    },
  );

  /**
   * METHOD declaration within a Function Block
   */
  public methodDeclaration = this.RULE("methodDeclaration", () => {
    this.CONSUME(tokens.METHOD);
    // Optional visibility modifier
    this.OPTION(() => {
      this.OR({
        DEF: [
          { ALT: () => this.CONSUME(tokens.PUBLIC) },
          { ALT: () => this.CONSUME(tokens.PRIVATE) },
          { ALT: () => this.CONSUME(tokens.PROTECTED) },
        ],
        IGNORE_AMBIGUITIES: true,
      });
    });
    // Optional ABSTRACT/FINAL/OVERRIDE (can appear in any combination and order)
    this.MANY2(() => {
      this.OR2({
        DEF: [
          {
            ALT: () => this.CONSUME(tokens.ABSTRACT),
            GATE: () => this.LA(1).tokenType === tokens.ABSTRACT,
          },
          {
            ALT: () => this.CONSUME(tokens.FINAL),
            GATE: () => this.LA(1).tokenType === tokens.FINAL,
          },
          {
            ALT: () => this.CONSUME(tokens.OVERRIDE),
            GATE: () => this.LA(1).tokenType === tokens.OVERRIDE,
          },
        ],
        IGNORE_AMBIGUITIES: true,
      });
    });
    this.CONSUME(tokens.Identifier);
    // Optional return type
    this.OPTION3(() => {
      this.CONSUME(tokens.Colon);
      this.SUBRULE(this.dataType);
    });
    // VAR blocks inside method
    this.MANY(() => {
      this.SUBRULE(this.methodVarBlock);
    });
    // Method body (unless abstract)
    this.OPTION4(() => {
      this.SUBRULE(this.statementList);
    });
    this.CONSUME(tokens.END_METHOD);
  });

  /**
   * Variable block inside a method (supports VAR_INST in addition to standard blocks)
   */
  public methodVarBlock = this.RULE("methodVarBlock", () => {
    this.OR({
      DEF: [
        { ALT: () => this.CONSUME(tokens.VAR) },
        { ALT: () => this.CONSUME(tokens.VAR_INPUT) },
        { ALT: () => this.CONSUME(tokens.VAR_OUTPUT) },
        { ALT: () => this.CONSUME(tokens.VAR_IN_OUT) },
        { ALT: () => this.CONSUME(tokens.VAR_TEMP) },
        { ALT: () => this.CONSUME(tokens.VAR_INST) },
      ],
      IGNORE_AMBIGUITIES: true,
    });
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
   * PROPERTY declaration within a Function Block
   */
  public propertyDeclaration = this.RULE("propertyDeclaration", () => {
    this.CONSUME(tokens.PROPERTY);
    // Optional visibility modifier
    this.OPTION(() => {
      this.OR({
        DEF: [
          { ALT: () => this.CONSUME(tokens.PUBLIC) },
          { ALT: () => this.CONSUME(tokens.PRIVATE) },
          { ALT: () => this.CONSUME(tokens.PROTECTED) },
        ],
        IGNORE_AMBIGUITIES: true,
      });
    });
    this.CONSUME(tokens.Identifier);
    this.CONSUME(tokens.Colon);
    this.SUBRULE(this.dataType);
    // GET and/or SET blocks
    this.MANY(() => {
      this.OR2({
        DEF: [
          { ALT: () => this.SUBRULE(this.propertyGetter) },
          { ALT: () => this.SUBRULE(this.propertySetter) },
        ],
        IGNORE_AMBIGUITIES: true,
      });
    });
    this.CONSUME(tokens.END_PROPERTY);
  });

  /**
   * Property GET accessor
   */
  public propertyGetter = this.RULE("propertyGetter", () => {
    this.CONSUME(tokens.GET);
    this.OPTION(() => {
      this.SUBRULE(this.statementList);
    });
    this.CONSUME(tokens.END_GET);
  });

  /**
   * Property SET accessor
   */
  public propertySetter = this.RULE("propertySetter", () => {
    this.CONSUME(tokens.SET);
    this.OPTION(() => {
      this.SUBRULE(this.statementList);
    });
    this.CONSUME(tokens.END_SET);
  });

  // ==========================================================================
  // Contextual keyword-as-identifier support (CODESYS compatibility)
  // ==========================================================================

  /**
   * Identifier or contextual keyword.
   * Allows SET, GET, ON, OVERRIDE, ABSTRACT, FINAL to be used as
   * variable/parameter/function names in contexts where they are unambiguous.
   */
  public identifierOrKeyword = this.RULE("identifierOrKeyword", () => {
    this.OR({
      DEF: [
        { ALT: () => this.CONSUME(tokens.Identifier) },
        { ALT: () => this.CONSUME(tokens.SET) },
        { ALT: () => this.CONSUME(tokens.GET) },
        { ALT: () => this.CONSUME(tokens.ON) },
        { ALT: () => this.CONSUME(tokens.OVERRIDE) },
        { ALT: () => this.CONSUME(tokens.ABSTRACT) },
        { ALT: () => this.CONSUME(tokens.FINAL) },
      ],
      IGNORE_AMBIGUITIES: true,
    });
  });

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
      DEF: () => this.SUBRULE(this.identifierOrKeyword),
    });
    this.OPTION(() => {
      this.CONSUME(tokens.AT);
      this.CONSUME(tokens.DirectAddress);
    });
    this.CONSUME(tokens.Colon);
    // Optional POINTER TO prefix (for POINTER TO ARRAY[...] OF REAL etc.)
    this.OPTION5(() => {
      this.CONSUME(tokens.POINTER);
      this.CONSUME2(tokens.TO);
    });
    this.OR([
      {
        ALT: () => this.SUBRULE(this.arrayType),
        GATE: () => this.LA(1).tokenType === tokens.ARRAY,
      },
      { ALT: () => this.SUBRULE(this.dataType) },
    ]);
    this.OPTION2(() => {
      this.CONSUME(tokens.Assign);
      this.SUBRULE(this.initializerExpression);
    });
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Initializer expression: single expression or comma-separated list for array init.
   * Handles: x := 5; and arr := 0, 31, 59, 90, ...;
   */
  public initializerExpression = this.RULE("initializerExpression", () => {
    this.SUBRULE(this.expression);
    this.MANY(() => {
      this.CONSUME(tokens.Comma);
      this.SUBRULE2(this.expression);
    });
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
    // IGNORE_AMBIGUITIES: ARRAY keyword has LONGER_ALT=Identifier which causes
    // Chevrotain to see ambiguity between arrayType (starts with ARRAY token) and
    // typedEnumOrSubrangeOrAlias (starts with Identifier). The GATE on arrayType
    // ensures correct runtime disambiguation.
    this.OR({
      DEF: [
        { ALT: () => this.SUBRULE(this.structType) },
        { ALT: () => this.SUBRULE(this.simpleEnumType) },
        {
          // POINTER TO ARRAY[...] OF T (must come before bare arrayType)
          ALT: () => {
            this.CONSUME(tokens.POINTER);
            this.CONSUME(tokens.TO);
            this.SUBRULE2(this.arrayType);
          },
          GATE: () =>
            this.LA(1).tokenType === tokens.POINTER &&
            this.LA(2).tokenType === tokens.TO &&
            this.LA(3).tokenType === tokens.ARRAY,
        },
        {
          ALT: () => this.SUBRULE(this.arrayType),
          GATE: () => this.LA(1).tokenType === tokens.ARRAY,
        },
        { ALT: () => this.SUBRULE(this.typedEnumOrSubrangeOrAlias) },
      ],
      IGNORE_AMBIGUITIES: true,
    });
    // Semicolon is optional after END_STRUCT END_TYPE (CODESYS tolerance)
    this.OPTION3(() => {
      this.CONSUME(tokens.Semicolon);
    });
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
   * Array dimension: either fixed bounds (start..end) or variable-length (*)
   */
  public arrayDimension = this.RULE("arrayDimension", () => {
    this.OR([
      {
        ALT: () => {
          // Variable-length: ARRAY[*]
          this.CONSUME(tokens.Star);
        },
      },
      {
        ALT: () => {
          // Fixed bounds: ARRAY[1..10]
          this.SUBRULE(this.expression);
          this.CONSUME(tokens.DoubleDot);
          this.SUBRULE2(this.expression);
        },
      },
    ]);
  });

  /**
   * Data type reference (simple type, REF_TO type, or REFERENCE_TO type)
   */
  public dataType = this.RULE("dataType", () => {
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(tokens.REF_TO) },
        { ALT: () => this.CONSUME(tokens.REFERENCE_TO) },
        {
          ALT: () => {
            this.CONSUME(tokens.POINTER);
            this.CONSUME(tokens.TO);
          },
        },
      ]);
    });
    const typeNameTok = this.CONSUME(tokens.Identifier);
    // Optional parameterized length for STRING(n) / WSTRING(n) / STRING(CONSTANT_NAME)
    // GATE: only when the type name is STRING or WSTRING, consume ( IntegerLiteral ) or ( Identifier )
    // Avoid ( Identifier ) for typed enums and ( IntegerLiteral .. ) for subrange types
    this.OPTION2({
      GATE: () => {
        const name = typeNameTok.image.toUpperCase();
        return (
          (name === "STRING" || name === "WSTRING") &&
          this.LA(1).tokenType === tokens.LParen &&
          ((this.LA(2).tokenType === tokens.IntegerLiteral &&
            this.LA(3).tokenType === tokens.RParen) ||
            (this.LA(2).tokenType === tokens.Identifier &&
              this.LA(3).tokenType === tokens.RParen))
        );
      },
      DEF: () => {
        this.CONSUME(tokens.LParen);
        this.OR4({
          DEF: [
            { ALT: () => this.CONSUME(tokens.IntegerLiteral) },
            { ALT: () => this.CONSUME4(tokens.Identifier) },
          ],
          IGNORE_AMBIGUITIES: true,
        });
        this.CONSUME(tokens.RParen);
      },
    });
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
    this.OR({
      DEF: [
        {
          ALT: () => this.SUBRULE(this.refAssignStatement),
          GATE: () => this.isRefAssignAhead(),
        },
        {
          ALT: () => this.SUBRULE(this.thisStatement),
          GATE: () => this.LA(1).tokenType === tokens.THIS,
        },
        {
          ALT: () => this.SUBRULE(this.superCallStatement),
          GATE: () => this.LA(1).tokenType === tokens.SUPER,
        },
        // methodCallStatement must come before assignmentStatement/functionCallStatement
        // since all start with Identifier but methodCall needs Ident.Ident( lookahead
        {
          ALT: () => this.SUBRULE(this.methodCallStatement),
          GATE: () => this.isMethodCallAhead(),
        },
        // assignmentStatement and functionCallStatement both start with Identifier;
        // Chevrotain resolves by trying assignmentStatement first (it has := after the LHS)
        { ALT: () => this.SUBRULE(this.assignmentStatement) },
        {
          ALT: () => this.SUBRULE(this.ifStatement),
          GATE: () => this.LA(1).tokenType === tokens.IF,
        },
        {
          ALT: () => this.SUBRULE(this.caseStatement),
          GATE: () => this.LA(1).tokenType === tokens.CASE,
        },
        {
          ALT: () => this.SUBRULE(this.forStatement),
          GATE: () => this.LA(1).tokenType === tokens.FOR,
        },
        {
          ALT: () => this.SUBRULE(this.whileStatement),
          GATE: () => this.LA(1).tokenType === tokens.WHILE,
        },
        {
          ALT: () => this.SUBRULE(this.repeatStatement),
          GATE: () => this.LA(1).tokenType === tokens.REPEAT,
        },
        {
          ALT: () => this.SUBRULE(this.exitStatement),
          GATE: () => this.LA(1).tokenType === tokens.EXIT,
        },
        {
          ALT: () => this.SUBRULE(this.returnStatement),
          GATE: () => this.LA(1).tokenType === tokens.RETURN,
        },
        {
          ALT: () => this.SUBRULE(this.deleteStatement),
          GATE: () => this.LA(1).tokenType === tokens.__DELETE,
        },
        { ALT: () => this.SUBRULE(this.functionCallStatement) },
        {
          ALT: () => this.SUBRULE(this.externalCodePragma),
          GATE: () => this.LA(1).tokenType === tokens.ExternalPragma,
        },
        {
          ALT: () => this.SUBRULE(this.assertCall),
          GATE: () => this.isAssertAhead(),
        },
        {
          // Empty statement (bare semicolon) — tolerates ELSE; and similar CODESYS patterns
          ALT: () => this.CONSUME2(tokens.Semicolon),
          GATE: () => this.LA(1).tokenType === tokens.Semicolon,
        },
      ],
      IGNORE_AMBIGUITIES: true,
    });
  });

  /**
   * THIS.member := expr; or THIS.method(args); statement
   */
  public thisStatement = this.RULE("thisStatement", () => {
    this.CONSUME(tokens.THIS);
    this.CONSUME(tokens.Dot);
    this.SUBRULE(this.identifierOrKeyword);
    // Determine if this is an assignment or method call
    this.OR([
      {
        // Assignment: THIS.member := expression;
        ALT: () => {
          this.CONSUME(tokens.Assign);
          this.SUBRULE(this.expression);
          this.CONSUME(tokens.Semicolon);
        },
      },
      {
        // Method call: THIS.method(args);
        ALT: () => {
          this.CONSUME(tokens.LParen);
          this.OPTION(() => {
            this.SUBRULE(this.argumentList);
          });
          this.CONSUME(tokens.RParen);
          this.CONSUME2(tokens.Semicolon);
        },
      },
      {
        // Simple semicolon: THIS.method; (no-arg call)
        ALT: () => {
          this.CONSUME3(tokens.Semicolon);
        },
      },
    ]);
  });

  /**
   * Lookahead helper to detect if next token starts a VAR block.
   */
  private isVarBlockAhead(): boolean {
    const t = this.LA(1).tokenType;
    return (
      t === tokens.VAR ||
      t === tokens.VAR_INPUT ||
      t === tokens.VAR_OUTPUT ||
      t === tokens.VAR_IN_OUT ||
      t === tokens.VAR_EXTERNAL ||
      t === tokens.VAR_GLOBAL ||
      t === tokens.VAR_TEMP
    );
  }

  /**
   * Contextual keyword tokens that can also be used as identifiers.
   * Keep in sync with the identifierOrKeyword rule alternatives.
   */
  private static readonly CONTEXTUAL_KEYWORDS: TokenType[] = [
    tokens.SET,
    tokens.GET,
    tokens.ON,
    tokens.OVERRIDE,
    tokens.ABSTRACT,
    tokens.FINAL,
  ];

  /**
   * Lookahead helper to detect if a token type is an identifier or contextual keyword.
   * Used by isMethodCallAhead() for lookahead decisions.
   */
  private isIdentifierOrKeywordToken(tokenType: TokenType): boolean {
    return (
      tokenType === tokens.Identifier ||
      STParser.CONTEXTUAL_KEYWORDS.includes(tokenType)
    );
  }

  private isMethodCallAhead(): boolean {
    return (
      this.isIdentifierOrKeywordToken(this.LA(1).tokenType) &&
      this.LA(2).tokenType === tokens.Dot &&
      this.isIdentifierOrKeywordToken(this.LA(3).tokenType) &&
      this.LA(4)?.tokenType === tokens.LParen
    );
  }

  /**
   * instance.method(args); statement
   */
  public methodCallStatement = this.RULE("methodCallStatement", () => {
    this.SUBRULE(this.identifierOrKeyword); // instance name
    this.CONSUME(tokens.Dot);
    this.SUBRULE2(this.identifierOrKeyword); // method name
    this.CONSUME(tokens.LParen);
    this.OPTION(() => {
      this.SUBRULE(this.argumentList);
    });
    this.CONSUME(tokens.RParen);
    // Method chaining: .method2(args).method3(args)...
    this.MANY(() => {
      this.SUBRULE(this.chainedMethodCall);
    });
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * SUPER.method(args); statement
   */
  public superCallStatement = this.RULE("superCallStatement", () => {
    this.CONSUME(tokens.SUPER);
    this.CONSUME(tokens.Dot);
    this.SUBRULE(this.identifierOrKeyword);
    this.OPTION(() => {
      this.CONSUME(tokens.LParen);
      this.OPTION2(() => {
        this.SUBRULE(this.argumentList);
      });
      this.CONSUME(tokens.RParen);
    });
    this.CONSUME(tokens.Semicolon);
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

  /**
   * __DELETE(expression) statement - deallocate dynamic memory
   */
  public deleteStatement = this.RULE("deleteStatement", () => {
    this.CONSUME(tokens.__DELETE);
    this.CONSUME(tokens.LParen);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.RParen);
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
    this.OR({
      DEF: [
        { ALT: () => this.SUBRULE(this.literal) },
        {
          ALT: () => this.SUBRULE(this.refExpression),
          GATE: () => this.LA(1).tokenType === tokens.REF,
        },
        {
          ALT: () => this.SUBRULE(this.drefExpression),
          GATE: () => this.LA(1).tokenType === tokens.DREF,
        },
        {
          ALT: () => this.SUBRULE(this.newExpression),
          GATE: () => this.LA(1).tokenType === tokens.__NEW,
        },
        {
          ALT: () => this.SUBRULE(this.thisAccess),
          GATE: () => this.LA(1).tokenType === tokens.THIS,
        },
        {
          ALT: () => this.SUBRULE(this.superAccess),
          GATE: () => this.LA(1).tokenType === tokens.SUPER,
        },
        {
          ALT: () => this.SUBRULE(this.methodCall),
          GATE: () => this.isMethodCallAhead(),
        },
        // functionCall and variable both start with Identifier;
        // functionCall needs Ident( lookahead to disambiguate
        { ALT: () => this.SUBRULE(this.functionCall) },
        { ALT: () => this.SUBRULE(this.variable) },
        {
          ALT: () => {
            this.CONSUME(tokens.LParen);
            this.SUBRULE(this.expression);
            this.CONSUME(tokens.RParen);
          },
          GATE: () => this.LA(1).tokenType === tokens.LParen,
        },
      ],
      IGNORE_AMBIGUITIES: true,
    });
  });

  /**
   * instance.method(args) expression
   */
  public methodCall = this.RULE("methodCall", () => {
    this.SUBRULE(this.identifierOrKeyword); // instance name
    this.CONSUME(tokens.Dot);
    this.SUBRULE2(this.identifierOrKeyword); // method name
    this.CONSUME(tokens.LParen);
    this.OPTION(() => {
      this.SUBRULE(this.argumentList);
    });
    this.CONSUME(tokens.RParen);
    // Method chaining: .method2(args).method3(args)...
    this.MANY(() => {
      this.SUBRULE(this.chainedMethodCall);
    });
  });

  /**
   * Chained method call: .methodName(args)
   * Used inside methodCall/methodCallStatement for fluent interface patterns.
   */
  public chainedMethodCall = this.RULE("chainedMethodCall", () => {
    this.CONSUME(tokens.Dot);
    this.SUBRULE(this.identifierOrKeyword);
    this.CONSUME(tokens.LParen);
    this.OPTION(() => {
      this.SUBRULE(this.argumentList);
    });
    this.CONSUME(tokens.RParen);
  });

  /**
   * THIS.member or THIS.method(args) access
   */
  public thisAccess = this.RULE("thisAccess", () => {
    this.CONSUME(tokens.THIS);
    this.OR([
      {
        // THIS^ (dereference - return self)
        GATE: () => this.LA(1).tokenType === tokens.Caret,
        ALT: () => {
          this.CONSUME(tokens.Caret);
        },
      },
      {
        // THIS.member or THIS.method(args)
        ALT: () => {
          this.CONSUME(tokens.Dot);
          this.SUBRULE(this.identifierOrKeyword);
          // Optional function call: THIS.Method(args)
          this.OPTION(() => {
            this.CONSUME(tokens.LParen);
            this.OPTION2(() => {
              this.SUBRULE(this.argumentList);
            });
            this.CONSUME(tokens.RParen);
          });
        },
      },
    ]);
  });

  /**
   * SUPER.method(args) access
   */
  public superAccess = this.RULE("superAccess", () => {
    this.CONSUME(tokens.SUPER);
    this.CONSUME(tokens.Dot);
    this.SUBRULE(this.identifierOrKeyword);
    // Optional function call: SUPER.Method(args)
    this.OPTION(() => {
      this.CONSUME(tokens.LParen);
      this.OPTION2(() => {
        this.SUBRULE(this.argumentList);
      });
      this.CONSUME(tokens.RParen);
    });
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
   * __NEW(dataType) or __NEW(dataType, expression) - allocate dynamic memory
   */
  public newExpression = this.RULE("newExpression", () => {
    this.CONSUME(tokens.__NEW);
    this.CONSUME(tokens.LParen);
    this.SUBRULE(this.dataType);
    this.OPTION(() => {
      this.CONSUME(tokens.Comma);
      this.SUBRULE(this.expression);
    });
    this.CONSUME(tokens.RParen);
  });

  /**
   * Variable reference (with optional array subscripts and field access)
   */
  public variable = this.RULE("variable", () => {
    this.SUBRULE(this.identifierOrKeyword);
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
            this.OR3({
              DEF: [
                { ALT: () => this.SUBRULE2(this.identifierOrKeyword) },
                // Bit access: var.0, var.31
                { ALT: () => this.CONSUME(tokens.IntegerLiteral) },
              ],
              IGNORE_AMBIGUITIES: true,
            });
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
    this.SUBRULE(this.identifierOrKeyword);
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
      this.SUBRULE(this.identifierOrKeyword);
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
      { ALT: () => this.CONSUME(tokens.TypedLiteral) },
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

  // ==========================================================================
  // Test file rules (used only when parsing test files)
  // ==========================================================================

  /**
   * Top-level rule for test files: optional SETUP, optional TEARDOWN, then TEST blocks
   */
  public testFile = this.RULE("testFile", () => {
    this.OPTION(() => {
      this.SUBRULE(this.setupBlock);
    });
    this.OPTION2(() => {
      this.SUBRULE(this.teardownBlock);
    });
    this.MANY(() => {
      this.SUBRULE(this.testCase);
    });
  });

  /**
   * SETUP ... END_SETUP block with optional VAR declarations and statements
   */
  public setupBlock = this.RULE("setupBlock", () => {
    this.CONSUME(tokens.SETUP);
    this.MANY(() => {
      this.SUBRULE(this.varBlock);
    });
    this.SUBRULE(this.testStatementList);
    this.CONSUME(tokens.END_SETUP);
  });

  /**
   * TEARDOWN ... END_TEARDOWN block
   */
  public teardownBlock = this.RULE("teardownBlock", () => {
    this.CONSUME(tokens.TEARDOWN);
    this.SUBRULE(this.testStatementList);
    this.CONSUME(tokens.END_TEARDOWN);
  });

  /**
   * Individual TEST block
   */
  public testCase = this.RULE("testCase", () => {
    this.CONSUME(tokens.TEST);
    this.CONSUME(tokens.StringLiteral); // Test name
    this.MANY(() => {
      this.SUBRULE(this.varBlock);
    });
    this.SUBRULE(this.testStatementList);
    this.CONSUME(tokens.END_TEST);
  });

  /**
   * List of statements inside a test block (includes assert calls)
   */
  public testStatementList = this.RULE("testStatementList", () => {
    this.MANY(() => {
      this.SUBRULE(this.testStatement);
    });
  });

  /**
   * Single statement inside a test block: assert call, mock statement, or regular statement
   */
  public testStatement = this.RULE("testStatement", () => {
    this.OR({
      DEF: [
        {
          ALT: () => this.SUBRULE(this.assertCall),
          GATE: () => this.isAssertAhead(),
        },
        {
          ALT: () => this.SUBRULE(this.advanceTimeStatement),
          GATE: () => this.LA(1).tokenType === tokens.ADVANCE_TIME,
        },
        {
          ALT: () => this.SUBRULE(this.mockVerifyStatement),
          GATE: () => this.isMockVerifyAhead(),
        },
        {
          ALT: () => this.SUBRULE(this.mockStatement),
          GATE: () => this.isMockAhead(),
        },
        { ALT: () => this.SUBRULE(this.statement) },
      ],
      IGNORE_AMBIGUITIES: true,
    });
  });

  /**
   * ADVANCE_TIME(expression) ; - Advance scan-cycle time in tests
   */
  public advanceTimeStatement = this.RULE("advanceTimeStatement", () => {
    this.CONSUME(tokens.ADVANCE_TIME);
    this.CONSUME(tokens.LParen);
    this.SUBRULE(this.expression);
    this.CONSUME(tokens.RParen);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Assert function call (all assert types)
   */
  public assertCall = this.RULE("assertCall", () => {
    this.OR([
      { ALT: () => this.CONSUME(tokens.ASSERT_EQ) },
      { ALT: () => this.CONSUME(tokens.ASSERT_NEQ) },
      { ALT: () => this.CONSUME(tokens.ASSERT_TRUE) },
      { ALT: () => this.CONSUME(tokens.ASSERT_FALSE) },
      { ALT: () => this.CONSUME(tokens.ASSERT_GT) },
      { ALT: () => this.CONSUME(tokens.ASSERT_LT) },
      { ALT: () => this.CONSUME(tokens.ASSERT_GE) },
      { ALT: () => this.CONSUME(tokens.ASSERT_LE) },
      { ALT: () => this.CONSUME(tokens.ASSERT_NEAR) },
    ]);
    this.CONSUME(tokens.LParen);
    this.SUBRULE(this.expression);
    this.MANY(() => {
      this.CONSUME(tokens.Comma);
      this.SUBRULE2(this.expression);
    });
    this.CONSUME(tokens.RParen);
    this.CONSUME(tokens.Semicolon);
  });

  /**
   * Lookahead helper to detect if next token is an ASSERT_* keyword
   */
  private isAssertAhead(): boolean {
    const t = this.LA(1).tokenType;
    return (
      t === tokens.ASSERT_EQ ||
      t === tokens.ASSERT_NEQ ||
      t === tokens.ASSERT_TRUE ||
      t === tokens.ASSERT_FALSE ||
      t === tokens.ASSERT_GT ||
      t === tokens.ASSERT_LT ||
      t === tokens.ASSERT_GE ||
      t === tokens.ASSERT_LE ||
      t === tokens.ASSERT_NEAR
    );
  }

  // ==========================================================================
  // Mock framework rules (used only when parsing test files)
  // ==========================================================================

  /**
   * Mock statement: MOCK instance.path ; or MOCK_FUNCTION FuncName RETURNS expr ;
   */
  public mockStatement = this.RULE("mockStatement", () => {
    this.OR([
      {
        // MOCK_FUNCTION FuncName RETURNS expression ;
        ALT: () => {
          this.CONSUME(tokens.MOCK_FUNCTION);
          this.CONSUME(tokens.Identifier);
          this.CONSUME(tokens.RETURNS);
          this.SUBRULE(this.expression);
          this.CONSUME(tokens.Semicolon);
        },
        GATE: () => this.LA(1).tokenType === tokens.MOCK_FUNCTION,
      },
      {
        // MOCK instance.path ;
        ALT: () => {
          this.CONSUME2(tokens.MOCK);
          this.SUBRULE(this.qualifiedIdentifier);
          this.CONSUME2(tokens.Semicolon);
        },
      },
    ]);
  });

  /**
   * Mock verification statements
   */
  public mockVerifyStatement = this.RULE("mockVerifyStatement", () => {
    this.OR([
      {
        // MOCK_VERIFY_CALL_COUNT(instance.path, count);
        ALT: () => {
          this.CONSUME(tokens.MOCK_VERIFY_CALL_COUNT);
          this.CONSUME(tokens.LParen);
          this.SUBRULE(this.qualifiedIdentifier);
          this.CONSUME(tokens.Comma);
          this.SUBRULE(this.expression);
          this.CONSUME(tokens.RParen);
          this.CONSUME(tokens.Semicolon);
        },
        GATE: () => this.LA(1).tokenType === tokens.MOCK_VERIFY_CALL_COUNT,
      },
      {
        // MOCK_VERIFY_CALLED(instance.path);
        ALT: () => {
          this.CONSUME2(tokens.MOCK_VERIFY_CALLED);
          this.CONSUME2(tokens.LParen);
          this.SUBRULE2(this.qualifiedIdentifier);
          this.CONSUME2(tokens.RParen);
          this.CONSUME2(tokens.Semicolon);
        },
      },
    ]);
  });

  /**
   * Qualified identifier: Identifier (.Identifier)*
   * Used for mock instance paths like ctrl.sensor or ctrl.subsystem.valve
   */
  public qualifiedIdentifier = this.RULE("qualifiedIdentifier", () => {
    this.CONSUME(tokens.Identifier);
    this.MANY(() => {
      this.CONSUME(tokens.Dot);
      this.CONSUME2(tokens.Identifier);
    });
  });

  /**
   * Lookahead helper to detect MOCK or MOCK_FUNCTION
   */
  private isMockAhead(): boolean {
    const t = this.LA(1).tokenType;
    return t === tokens.MOCK || t === tokens.MOCK_FUNCTION;
  }

  /**
   * Lookahead helper to detect MOCK_VERIFY_CALLED or MOCK_VERIFY_CALL_COUNT
   */
  private isMockVerifyAhead(): boolean {
    const t = this.LA(1).tokenType;
    return (
      t === tokens.MOCK_VERIFY_CALLED || t === tokens.MOCK_VERIFY_CALL_COUNT
    );
  }
}

/**
 * Singleton parser instance for source files.
 */
export const parser = new STParser();

/**
 * Singleton parser instance for test files.
 * Uses the test token list which includes TEST/END_TEST/ASSERT_* tokens.
 */
export const testParser = new STParser(tokens.allTestTokens);

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

/**
 * Parse a test file into a CST using the test lexer/parser.
 *
 * @param source - The test file source code to parse
 * @returns Parse result with CST and any errors
 */
export function parseTestSource(source: string): {
  cst: CstNode | null;
  errors: unknown[];
} {
  const lexResult = tokens.tokenizeTest(source);

  if (lexResult.errors.length > 0) {
    return {
      cst: null,
      errors: lexResult.errors,
    };
  }

  testParser.input = lexResult.tokens;
  const cst = testParser.testFile();

  return {
    cst,
    errors: testParser.errors,
  };
}
