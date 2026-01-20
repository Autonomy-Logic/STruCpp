# Phase 2.5: Nested Comments

**Status**: COMPLETED

**Duration**: 1 week

**Goal**: Implement support for nested comments in IEC 61131-3 Structured Text

## Overview

IEC 61131-3 Edition 3 introduced support for nested comments, allowing comment blocks to contain other comment blocks. This is useful for commenting out code that already contains comments.

## Design Decisions

### Key Architectural Choices

1. **Lexer-only change** - Nested comments are handled entirely in the lexer. No parser, AST, or code generator changes required.

2. **Comments are stripped** - Comments do not appear in generated C++ output. Source mapping provides the connection back to ST source for debugging.

3. **Custom pattern function** - Replace the current regex-based comment token with a custom Chevrotain pattern function that tracks nesting depth.

4. **Single-line comments unchanged** - The `//` comment syntax doesn't support nesting (it's inherently single-line) and remains regex-based.

### Why Not Emit C++ Comments?

C++ does **not** support nested comments:
```cpp
/* outer /* inner */ outer */  // Syntax error!
```

Converting nested ST comments to C++ would require:
- Flattening (loses structure)
- Using `#if 0` preprocessor blocks (awkward)
- Converting to multiple `//` lines (verbose)

Since generated C++ is an intermediate artifact (not meant for human editing), stripping comments is the simplest and cleanest approach.

## Scope

### Comment Syntax

**Single-line comments (unchanged):**
```st
// This is a single-line comment
```

**Block comments with nesting (new):**
```st
(* This is a block comment *)

(* Outer comment
   (* Inner comment *)
   Still in outer comment
*)

(* You can nest (* multiple (* levels *) deep *) *)
```

### Current Limitation

The current lexer (line 26-30 of `src/frontend/lexer.ts`) uses a non-greedy regex:

```typescript
export const Comment = createToken({
  name: "Comment",
  pattern: /\/\/[^\n\r]*|(?:\(\*[\s\S]*?\*\))/,
  group: Lexer.SKIPPED,
});
```

The `*?` non-greedy quantifier stops at the **first** `*)`, breaking nested comments:

```st
(* outer (* inner *) outer *)
         ^^^^^^^^^^^
         Matches here, leaving " outer *)" as an error
```

## Implementation

### Custom Pattern Function

Replace the regex with a custom Chevrotain pattern function:

```typescript
/**
 * Custom pattern for comments with nested block comment support.
 * Handles both // single-line and (* *) block comments.
 * Block comments can be nested to arbitrary depth.
 */
function matchComment(
  text: string,
  startOffset: number
): RegExpExecArray | null {
  // Try single-line comment first: // ...
  if (
    text.charAt(startOffset) === "/" &&
    text.charAt(startOffset + 1) === "/"
  ) {
    let end = startOffset + 2;
    while (end < text.length && text.charAt(end) !== "\n" && text.charAt(end) !== "\r") {
      end++;
    }
    return createMatchResult(text.substring(startOffset, end), startOffset);
  }

  // Try block comment: (* ... *)
  if (
    text.charAt(startOffset) === "(" &&
    text.charAt(startOffset + 1) === "*"
  ) {
    let depth = 1;
    let i = startOffset + 2;

    while (i < text.length && depth > 0) {
      if (text.charAt(i) === "(" && text.charAt(i + 1) === "*") {
        depth++;
        i += 2;
      } else if (text.charAt(i) === "*" && text.charAt(i + 1) === ")") {
        depth--;
        i += 2;
      } else {
        i++;
      }
    }

    if (depth === 0) {
      return createMatchResult(text.substring(startOffset, i), startOffset);
    }

    // Unclosed comment - return null, lexer will report error
    return null;
  }

  return null;
}

/**
 * Helper to create a RegExpExecArray-compatible result.
 */
function createMatchResult(
  match: string,
  offset: number
): RegExpExecArray | null {
  if (match.length === 0) return null;
  const result = [match] as unknown as RegExpExecArray;
  result.index = offset;
  result.input = "";
  return result;
}
```

### Updated Token Definition

```typescript
export const Comment = createToken({
  name: "Comment",
  pattern: matchComment,
  line_breaks: true,  // Essential for multi-line block comments
  group: Lexer.SKIPPED,
});
```

The `line_breaks: true` option is critical - it tells Chevrotain that this token can span multiple lines, ensuring line number tracking remains accurate.

### Algorithm Complexity

- **Time**: O(n) where n is the comment length - single pass through characters
- **Space**: O(1) - only tracking depth counter and position

No recursion or stack needed since we only need to count depth, not remember the nesting structure.

## Edge Cases

### Valid Cases

| Input | Behavior |
|-------|----------|
| `(* simple *)` | Matches entire comment |
| `(* (* nested *) *)` | Matches entire comment (depth 2) |
| `(* (* (* deep *) *) *)` | Matches entire comment (depth 3) |
| `(* no close` | Returns null - lexer error |
| `// single line` | Matches to end of line |
| `// line (* not nested *)` | Matches entire line as single-line comment |

### Stars and Parentheses Inside Comments

The pattern function doesn't try to interpret content - it just counts `(*` and `*)` pairs:

```st
(* This has (* in it without closing *)  // Valid - the (* starts nesting
(* This has random ) and ( chars *)      // Valid - individual chars ignored
(* Pointer: myRef^ := value; *)          // Valid - ^ is just content
```

### Comments vs Strings

Token matching in Chevrotain is position-based. At any position, only one token matches. A string starting with `'` won't conflict with a comment starting with `(*`:

```st
myString := '(* not a comment *)';  // String literal, not comment
(* This is 'really' a comment *)    // Comment containing quotes
```

## Error Handling

### Unclosed Comments

When a `(*` has no matching `*)`, the implementation uses a two-pronged approach:

1. **Pattern function returns `null`** - This allows Chevrotain to try other tokens (like `(` and `*` individually).

2. **Pre-scan validation** - The `tokenize()` wrapper function includes a `findUnclosedBlockComment()` helper that scans the entire source for unbalanced `(*` / `*)` pairs before lexing. If found, it adds a clear error to the result:

```typescript
function findUnclosedBlockComment(source: string): { line: number; column: number; offset: number } | null {
  // Tracks nesting depth while scanning
  // Returns position of unclosed (* if found
}

export function tokenize(source: string) {
  const unclosedComment = findUnclosedBlockComment(source);
  const result = STLexer.tokenize(source);

  if (unclosedComment) {
    result.errors.push({
      offset: unclosedComment.offset,
      line: unclosedComment.line,
      column: unclosedComment.column,
      length: 2,
      message: "Unclosed block comment",
    });
  }

  return result;
}
```

This provides clear error messages:
```
Error: Unclosed block comment at line 5, column 1
```

### Mismatched Closing

A `*)` without a preceding `(*` is not treated as a comment - it becomes two separate tokens (`Star` and `RParen`), which will likely cause a parser error in context. This is correct behavior.

## Deliverables

### Lexer Changes
- [x] Create `matchComment` custom pattern function
- [x] Create `createMatchResult` helper function
- [x] Update `Comment` token to use custom pattern
- [x] Add `line_breaks: true` option
- [x] Remove old regex pattern

### Testing
- [x] Unit test: simple block comment `(* ... *)`
- [x] Unit test: nested comment (depth 2)
- [x] Unit test: deeply nested comment (depth 3+)
- [x] Unit test: unclosed comment error
- [x] Unit test: single-line comment unchanged
- [x] Unit test: mixed single-line and block comments
- [x] Unit test: comments in various code contexts
- [x] Integration test: ST file with nested comments parses correctly
- [x] Integration test: error reporting for unclosed comments

### Documentation
- [x] Update lexer.ts file comments
- [x] Update any user-facing documentation about comment syntax

## Success Criteria

- Nested block comments parse correctly to arbitrary depth
- Single-line comments (`//`) continue to work unchanged
- Unclosed comments produce clear lexer errors
- Line number tracking remains accurate for multi-line comments
- No performance regression for typical code (comments are O(n) in comment length)
- All existing tests continue to pass
- New test coverage for nested comment cases

## Files to Modify

| File | Changes |
|------|---------|
| `src/frontend/lexer.ts` | Replace Comment regex with custom pattern function |

## Notes

### Why This is Simple

This phase is intentionally minimal:
- **No parser changes** - comments are already skipped tokens
- **No AST changes** - comments don't appear in AST
- **No code generator changes** - nothing to generate
- **No semantic analysis** - comments have no semantic meaning

The entire change is confined to ~40 lines in the lexer.

### Future Considerations

If comment preservation becomes needed (e.g., for documentation generation), we could:
1. Change `group` from `Lexer.SKIPPED` to a custom group
2. Store comments as metadata attached to subsequent AST nodes
3. Optionally emit as C++ `//` comments (flattened)

This would be a separate enhancement, not part of Phase 2.5.

### Relationship to Other Phases

- **Phase 1**: No relationship (runtime library)
- **Phase 2.x**: Independent of other Phase 2 features
- **Phase 3+**: Comments already stripped before these phases see the token stream
