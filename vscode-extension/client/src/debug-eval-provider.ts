// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * EvaluatableExpressionProvider for Structured Text debugging.
 *
 * STruC++ uppercases all identifiers in generated C++, so when the user
 * hovers over `my_var` during a debug session, the debugger needs to
 * evaluate `MY_VAR` instead. This provider maps ST expressions to their
 * C++ equivalents.
 *
 * Primitive types (INT, BOOL, REAL, etc.), enums, and subranges are wrapped
 * in IECVar<T>/IEC_ENUM<E> in the generated C++ and need `.value_` appended
 * to show the raw value.
 *
 * User-defined container types (FBs, structs, arrays) are NOT wrapped and
 * should be evaluated directly to show their members.
 */

import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/node.js";
import {
  IsWrappedTypeRequest,
} from "../../shared/protocol.js";
import { transformStExpression } from "./debug-utils.js";

export class StrucppEvalProvider implements vscode.EvaluatableExpressionProvider {
  constructor(private client: LanguageClient) {}

  async provideEvaluatableExpression(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.EvaluatableExpression | undefined> {
    // Only active during debug sessions
    if (!vscode.debug.activeDebugSession) {
      return undefined;
    }

    const wordRange = document.getWordRangeAtPosition(
      position,
      /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/,
    );
    if (!wordRange) {
      return undefined;
    }

    const word = document.getText(wordRange);
    const cppExpr = transformStExpression(word);

    // For dotted expressions (fb.member), check the last component's type
    // by hovering at the position of the last identifier
    const checkPosition = this.getLastComponentPosition(wordRange, word, document);

    const isWrapped = await this.checkIsWrapped(document, checkPosition);

    if (isWrapped) {
      return new vscode.EvaluatableExpression(wordRange, `${cppExpr}.value_`);
    }

    return new vscode.EvaluatableExpression(wordRange, cppExpr);
  }

  /**
   * For dotted expressions like `fb.member`, return the position of the last
   * component (the one that determines the C++ type). For simple identifiers,
   * return the original position.
   */
  private getLastComponentPosition(
    wordRange: vscode.Range,
    word: string,
    document: vscode.TextDocument,
  ): vscode.Position {
    const lastDot = word.lastIndexOf(".");
    if (lastDot < 0) {
      // Simple identifier — use original position
      return wordRange.start;
    }

    // Position within the last component (after the last dot)
    const offset = document.offsetAt(wordRange.start) + lastDot + 1;
    return document.positionAt(offset);
  }

  /**
   * Ask the language server whether the symbol at the given position
   * is an IECVar-wrapped type (has .value_).
   */
  private async checkIsWrapped(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<boolean> {
    try {
      const response = await this.client.sendRequest(IsWrappedTypeRequest, {
        uri: document.uri.toString(),
        line: position.line,
        character: position.character,
      });
      return response.isWrapped;
    } catch {
      // If the request fails, default to wrapped (most common case)
      return true;
    }
  }
}
