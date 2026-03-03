# STruC++ Implementation Gaps

Gaps discovered during real-world usage (smart-traffic-light demo project).

## Gap 1: Enum member access via CODESYS dot notation

**Status**: Fixed

**Description**: Enum member values need to be accessed using CODESYS-style dot notation (`TypeName.Member`). The parser already handles this as a `VariableExpression` with field access, but the semantic analyzer and codegen needed updates.

**CODESYS syntax** (now supported):
```st
TYPE
  TrafficState : (RED, YELLOW, GREEN);
END_TYPE

PROGRAM Main
  VAR state : TrafficState; END_VAR
  state := TrafficState.RED;
  IF state = TrafficState.GREEN THEN
    (* ... *)
  END_IF;
END_PROGRAM
```

**Reference**: [CODESYS enum documentation](https://content.helpme-codesys.com/en/CODESYS%20Development%20System/_cds_datatype_enum.html)

**Fixes applied**:
- `src/semantic/analyzer.ts` — Register enum types with `typeKind: "enum"` (was `"elementary"`); resolve variable types through registered type symbols to preserve enum typeKind
- `src/backend/codegen.ts` — Track enum type members; emit `TypeName::Member` (C++ scoped enum) instead of `TypeName.Member` for enum qualified access

---

## Gap 2: CASE statement with identifier/dot-notation labels

**Status**: Fixed

**Description**: CASE statement labels only accepted integer literals. Identifier and dot-notation labels (e.g., `TrafficState.RED:`) caused parse errors because the `statementList` MANY loop inside `caseElement` consumed the next case label's Identifier as a statement start.

**Example** (now works):
```st
CASE currentState OF
  TrafficState.RED:    currentDuration := timing.redDuration;
  TrafficState.GREEN:  currentDuration := timing.greenDuration;
  TrafficState.YELLOW: currentDuration := timing.yellowDuration;
END_CASE;
```

**Root cause**: The parser's `statementList` MANY loop inside `caseElement` consumed the next case label's `Identifier` token as the start of a new statement, then failed when it found `:` instead of `:=`.

**Fixes applied**:
- `src/frontend/parser.ts` — Added `isCaseLabelStart()` lookahead helper and `caseStatementList` rule with GATE predicate that stops statement consumption when a case-label-like pattern is detected ahead
- `src/frontend/ast-builder.ts` — Updated `buildCaseElement` to look for `caseStatementList` CST key
- `src/semantic/type-checker.ts` — CASE selector validation now accepts `typeKind: "enum"` (already had the check, just needed enums properly registered)

---

## Gap 3: Bare enum member names (unqualified access)

**Status**: Open (low priority)

**Description**: IEC 61131-3 allows bare enum member names when unambiguous. CODESYS supports both qualified (`TrafficState.RED`) and unqualified (`RED`) access. Currently only qualified access works.

**Workaround**: Always use qualified dot notation (`TrafficState.RED`), which is the recommended CODESYS practice.

**Fix approach**: Register enum member names as `EnumValueSymbol` in the global scope during type declaration processing. Handle disambiguation when the same member name exists in multiple enums.
