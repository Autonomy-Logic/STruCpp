// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * Code Actions Provider (Phase 5.1)
 *
 * Maps common compiler errors/warnings to quick-fix code actions.
 * Each matcher inspects the diagnostic message and produces a WorkspaceEdit.
 */

import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  TextEdit,
  Range,
  Position,
} from "vscode-languageserver/node.js";
import type { AnalysisResult } from "strucpp";
import { stripCommentsAndStrings } from "./lsp-utils.js";

// ---------------------------------------------------------------------------
// Matcher framework
// ---------------------------------------------------------------------------

interface ActionMatcher {
  pattern: RegExp;
  produce: (
    match: RegExpMatchArray,
    diag: Diagnostic,
    source: string,
    uri: string,
    analysis?: AnalysisResult,
  ) => CodeAction | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Produce code actions (quick fixes) for the given diagnostics.
 */
export function getCodeActions(
  diagnostics: Diagnostic[],
  source: string,
  uri: string,
  analysis?: AnalysisResult,
): CodeAction[] {
  const actions: CodeAction[] = [];
  for (const diag of diagnostics) {
    for (const matcher of MATCHERS) {
      const match = diag.message.match(matcher.pattern);
      if (match) {
        const action = matcher.produce(match, diag, source, uri, analysis);
        if (action) actions.push(action);
      }
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Matchers
// ---------------------------------------------------------------------------

const MATCHERS: ActionMatcher[] = [
  // 1. Undeclared variable → declare it
  {
    pattern: /Undeclared variable '([^']+)'/,
    produce: (match, diag, source, uri) => {
      const lines = source.split("\n");
      const diagLine = diag.range.start.line;
      // Extract original-case name from source (compiler uppercases it in the error message)
      const name = extractOriginalName(lines[diagLine], diag.range.start.character, match[1]);

      // Infer type from assignment context on the diagnostic line
      const type = inferTypeFromLine(lines[diagLine] ?? "");

      // Find the nearest VAR block above the diagnostic line
      const stripped = stripCommentsAndStrings(source);
      const strippedLines = stripped.split("\n");
      const insertInfo = findVarBlockInsertion(strippedLines, diagLine);

      if (insertInfo) {
        // Insert declaration before END_VAR
        const indent = getLineIndent(lines[insertInfo.endVarLine] ?? "") + "  ";
        const newText = `${indent}${name} : ${type};\n`;
        return makeAction(
          `Declare variable '${name}'`,
          uri,
          TextEdit.insert(Position.create(insertInfo.endVarLine, 0), newText),
          diag,
        );
      }

      // No VAR block found — insert a new one before the diagnostic line
      const baseIndent = getLineIndent(lines[diagLine] ?? "");
      const newText = `${baseIndent}VAR\n${baseIndent}  ${name} : ${type};\n${baseIndent}END_VAR\n`;
      return makeAction(
        `Declare variable '${name}'`,
        uri,
        TextEdit.insert(Position.create(diagLine, 0), newText),
        diag,
      );
    },
  },

  // 2. Missing semicolon
  {
    pattern: /Expecting token of type --> Semicolon <--|Expecting.*Semicolon.*but found/,
    produce: (_match, diag, source, uri) => {
      // The error points at the unexpected token; the semicolon belongs
      // at the end of the preceding non-blank, non-comment code line
      const lines = source.split("\n");
      const stripped = stripCommentsAndStrings(source);
      const strippedLines = stripped.split("\n");

      let insertLine = diag.range.start.line - 1;
      while (insertLine >= 0) {
        const trimmed = lines[insertLine].trim();
        const strippedTrimmed = strippedLines[insertLine].trim();
        // Skip blank lines and lines that are entirely comments/strings
        if (trimmed === "" || strippedTrimmed === "") {
          insertLine--;
          continue;
        }
        break;
      }
      if (insertLine < 0) return null;

      const lineText = lines[insertLine];
      const trimmedEnd = lineText.trimEnd();
      // Don't add if already ends with semicolon
      if (trimmedEnd.endsWith(";")) return null;

      return makeAction(
        "Add missing semicolon",
        uri,
        TextEdit.insert(Position.create(insertLine, trimmedEnd.length), ";"),
        diag,
      );
    },
  },

  // 3. Narrowing conversion → wrap with explicit conversion
  {
    pattern: /Implicit narrowing conversion from (\S+) to (\S+)/,
    produce: (match, diag, source, uri) => {
      const sourceType = match[1];
      const targetType = match[2];
      const conversionName = `${sourceType}_TO_${targetType}`;

      const lines = source.split("\n");
      const lineText = lines[diag.range.start.line] ?? "";

      // Find the `:=` on the line and wrap the RHS
      const assignIdx = lineText.indexOf(":=");
      if (assignIdx < 0) return null;

      const rhsStart = assignIdx + 2;
      let rhs = lineText.slice(rhsStart);
      // Strip trailing semicolon and whitespace for wrapping
      const semiIdx = rhs.lastIndexOf(";");
      const rhsEnd = semiIdx >= 0 ? rhsStart + semiIdx : lineText.length;
      rhs = lineText.slice(rhsStart, rhsEnd).trim();

      if (!rhs) return null;

      const newRhs = ` ${conversionName}(${rhs})`;
      const trailingSemi = semiIdx >= 0 ? ";" : "";

      return makeAction(
        `Add explicit ${conversionName} conversion`,
        uri,
        TextEdit.replace(
          Range.create(
            Position.create(diag.range.start.line, rhsStart),
            Position.create(diag.range.start.line, rhsEnd + (semiIdx >= 0 ? 1 : 0)),
          ),
          newRhs + trailingSemi,
        ),
        diag,
      );
    },
  },

  // 4. Undefined type → create type template
  {
    pattern: /Undefined type '([^']+)'(?! in (EXTENDS|IMPLEMENTS))/,
    produce: (match, _diag, source, uri) => {
      // Extract original-case name from source (compiler uppercases it in the error message)
      const typeName = extractOriginalName(
        source.split("\n")[_diag.range.start.line] ?? "",
        _diag.range.start.character,
        match[1],
      );
      const template =
        `TYPE ${typeName} :\n` +
        `  STRUCT\n` +
        `    (* TODO: add fields *)\n` +
        `  END_STRUCT;\n` +
        `END_TYPE\n\n`;

      return makeAction(
        `Create type '${typeName}'`,
        uri,
        TextEdit.insert(Position.create(0, 0), template),
        _diag,
      );
    },
  },

  // 5. Missing END_* keyword
  {
    pattern: /Expecting.*\b(END_IF|END_FOR|END_WHILE|END_REPEAT|END_CASE|END_FUNCTION|END_FUNCTION_BLOCK|END_PROGRAM|END_METHOD|END_VAR)\b/,
    produce: (match, diag, source, uri) => {
      const keyword = match[1];
      const lines = source.split("\n");

      // Insert at the diagnostic line with appropriate indentation
      const diagLine = diag.range.start.line;
      const indent = diagLine > 0 ? getLineIndent(lines[diagLine - 1] ?? "") : "";

      // Only control-flow terminators get trailing semicolons;
      // POU/VAR closers (END_PROGRAM, END_FUNCTION, etc.) do not.
      const needsSemi = /^END_(IF|FOR|WHILE|REPEAT|CASE)$/.test(keyword);
      const suffix = needsSemi ? ";" : "";

      return makeAction(
        `Add missing '${keyword}'`,
        uri,
        TextEdit.insert(Position.create(diagLine, 0), `${indent}${keyword}${suffix}\n`),
        diag,
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAction(
  title: string,
  uri: string,
  edit: TextEdit,
  diag: Diagnostic,
): CodeAction {
  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit: { changes: { [uri]: [edit] } },
  };
}

/** Extract leading whitespace from a line. */
function getLineIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}

/**
 * Find a plain `VAR` block above `targetLine` for inserting a local variable.
 * Only matches `VAR` (not `VAR_INPUT`, `VAR_OUTPUT`, etc.) to avoid
 * accidentally adding a local variable to an input/output declaration block.
 * Returns the line number of the END_VAR where we should insert before,
 * or null if no plain VAR block exists (caller should create one).
 */
function findVarBlockInsertion(
  strippedLines: string[],
  targetLine: number,
): { endVarLine: number } | null {
  // Scan backward from the diagnostic line for a plain VAR block
  for (let i = targetLine - 1; i >= 0; i--) {
    const upper = strippedLines[i].trim().toUpperCase();
    // If we hit a POU boundary, stop searching
    if (
      /^(END_PROGRAM|END_FUNCTION|END_FUNCTION_BLOCK|END_METHOD|PROGRAM|FUNCTION\b|FUNCTION_BLOCK)\b/.test(upper)
    ) {
      break;
    }
    // Only match plain VAR (word boundary after VAR ensures VAR_INPUT etc. don't match)
    if (/^VAR\b/i.test(upper) && !/^VAR_/i.test(upper)) {
      // Find the matching END_VAR
      for (let j = i + 1; j < strippedLines.length; j++) {
        if (/\bEND_VAR\b/i.test(strippedLines[j])) {
          return { endVarLine: j };
        }
      }
    }
  }
  return null;
}

/**
 * Extract the original-case identifier from the source line.
 * The compiler uppercases all identifiers in error messages, so we
 * find the identifier at or near `col` on `line` that matches `upperName`
 * case-insensitively and return it with its original casing.
 */
function extractOriginalName(line: string, col: number, upperName: string): string {
  // Try to extract the identifier starting at the diagnostic column
  const identAtCol = line.slice(col).match(/^[A-Za-z_]\w*/);
  if (identAtCol && identAtCol[0].toUpperCase() === upperName.toUpperCase()) {
    return identAtCol[0];
  }

  // Fallback: scan the line for any identifier matching the uppercase name
  const re = /[A-Za-z_]\w*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[0].toUpperCase() === upperName.toUpperCase()) {
      return m[0];
    }
  }

  // Last resort: return as-is from the error message
  return upperName;
}

/**
 * Infer a variable type from the assignment context on a source line.
 * Looks for `:= <literal>` patterns.
 */
function inferTypeFromLine(line: string): string {
  const assignMatch = line.match(/:=\s*(.+?)\s*;?\s*$/);
  if (!assignMatch) return "INT";

  const rhs = assignMatch[1].trim();

  if (/^(TRUE|FALSE)$/i.test(rhs)) return "BOOL";
  if (/^'[^']*'$/.test(rhs)) return "STRING";
  if (/^"[^"]*"$/.test(rhs)) return "WSTRING";
  if (/^\d+\.\d+$/.test(rhs)) return "REAL";
  if (/^\d+$/.test(rhs)) return "INT";

  // Typed literals: DINT#100, REAL#3.14, BYTE#16#FF, etc.
  const typedLiteral = rhs.match(/^([A-Z_]\w*)#/i);
  if (typedLiteral) return typedLiteral[1].toUpperCase();

  return "INT";
}
