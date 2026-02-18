# OSCAT Basic 335 — STruC++ Compatibility Report

**Date:** 2026-02-17
**Library:** OSCAT Basic 335 (CODESYS V2.3 export)
**Compiler:** STruC++ 0.1.0-dev (main branch, commit 23e425b)

## Summary

| Metric | Value |
|--------|-------|
| Total .st files tested | 552 |
| Successfully compiled | 353 (63.9%) |
| Failed | 199 (36.1%) |

## Failure Breakdown by Root Cause

| # | Root Cause | Count | % of Failures | Phase | Description |
|---|-----------|-------|---------------|-------|-------------|
| 1 | POINTER_TO | 74 | 37.2% | 6.1 | `POINTER TO` declarations and `^` dereference |
| 2 | VAR_INPUT_CONSTANT | 24 | 12.1% | semantic | `VAR_INPUT CONSTANT` vars without initializers |
| 3 | KEYWORD_SET | 23 | 11.6% | lexer | `SET` used as identifier (keyword conflict) |
| 4 | TYPED_LITERALS | 19 | 9.5% | 6.3 | Typed literals (`BYTE#255`, `DWORD#16#FF`) |
| 5 | BIT_ACCESS | 17 | 8.5% | 6.4 | Bit access (`var.0`, `var.31`) read & write |
| 6 | STRING_CONST_SIZE | 17 | 8.5% | parser | `STRING(STRING_LENGTH)` with named constant |
| 7 | STRUCT_TYPE_DECL | 10 | 5.0% | parser | Standalone `TYPE...STRUCT...END_TYPE` |
| 8 | MULTI_DIM_ARRAY_INIT | 4 | 2.0% | parser | Multi-dimensional array initializers in TYPE |
| 9 | KEYWORD_ON | 3 | 1.5% | lexer | `ON` used as parameter name |
| 10 | VAR_GLOBAL | 2 | 1.0% | parser | `VAR_GLOBAL` as top-level construct |
| 11 | ELSE_SEMICOLON | 2 | 1.0% | parser | `ELSE;` extraneous semicolon |
| 12 | INLINE_ARRAY_INIT | 2 | 1.0% | parser | Bare comma list array init |
| 13 | KEYWORD_OVERRIDE | 1 | 0.5% | lexer | `OVERRIDE` used as function name |
| 14 | GVL_BINARY_ARTIFACT | 1 | 0.5% | n/a | Corrupt V2.3 export artifact |

## Cumulative Fix Impact

Implementing fixes in priority order:

| Fix | Additional Files | Cumulative Total | Success Rate |
|-----|-----------------|-----------------|--------------|
| Baseline | — | 353 | 63.9% |
| + POINTER TO (Phase 6.1) | +74 | 427 | 77.4% |
| + Keyword conflicts (SET/ON/OVERRIDE) | +27 | 454 | 82.2% |
| + VAR_INPUT CONSTANT relaxation | +24 | 478 | 86.6% |
| + Typed literals (Phase 6.3) | +19 | 497 | 90.0% |
| + Bit access (Phase 6.4) | +17 | 514 | 93.1% |
| + STRING(constant) support | +17 | 531 | 96.2% |
| + STRUCT TYPE declarations | +10 | 541 | 98.0% |
| + Multi-dim array init | +4 | 545 | 98.7% |
| + ELSE; tolerance | +2 | 547 | 99.1% |
| + Inline array init | +2 | 549 | 99.5% |
| + VAR_GLOBAL | +2 | 551 | 99.8% |
| (GVL binary artifact — unfixable) | — | 551 | 99.8% |

**Theoretical maximum: 551/552 (99.8%)** — one file (GVL_0.gvl) has corrupt binary data from the V2.3 export and is not valid ST source.

## Affected Files by Category

### POINTER_TO (74 files)
ARRAY_AVG, ARRAY_GAV, ARRAY_HAV, ARRAY_MAX, ARRAY_MIN, ARRAY_SDV, ARRAY_SPR, ARRAY_SUM, ARRAY_TREND, ARRAY_VAR, BIN_TO_BYTE, BIN_TO_DWORD, BUFFER_COMP, BUFFER_SEARCH, BUFFER_TO_STRING, BYTE_TO_STRB, BYTE_TO_STRH, CAPITALIZE, CHK_REAL, CHR_TO_STRING, CODE, COUNT_CHAR, CRC_GEN, DEC_TO_BYTE, DEC_TO_DWORD, DEC_TO_INT, DWORD_TO_STRB, DWORD_TO_STRH, DW_TO_REAL, ESR_MON_R4, FINDB_NONUM, FINDB_NUM, FIND_CHAR, FIND_CTRL, FIND_NONUM, FIND_NUM, FLOAT_TO_REAL, HEX_TO_BYTE, HEX_TO_DWORD, IS_ALNUM, IS_ALPHA, IS_CTRL, IS_HEX, IS_LOWER, IS_NUM, IS_SORTED, IS_UPPER, LIST_CLEAN, LIST_GET, LIST_INSERT, LIST_LEN, LIST_NEXT, LIST_RETRIEVE, LIST_RETRIEVE_LAST, LOWERCASE, MIRROR, OCT_TO_BYTE, OCT_TO_DWORD, REAL_TO_DW, REPLACE_UML, TEMP_PT, UPPERCASE, _ARRAY_ABS, _ARRAY_ADD, _ARRAY_INIT, _ARRAY_MEDIAN, _ARRAY_MUL, _ARRAY_SHUFFLE, _ARRAY_SORT, _BUFFER_CLEAR, _BUFFER_INIT, _BUFFER_INSERT, _BUFFER_UPPERCASE, _STRING_TO_BUFFER

### VAR_INPUT_CONSTANT (24 files)
AIN1, AOUT, AOUT1, BAR_GRAPH, CALIBRATE, ESR_MON_B8, ESR_MON_X8, FLOW_METER, FT_Profile, OFFSET, OFFSET2, PARSET2, PIN_CODE, RMP_SOFT, SCALE_B2, SCALE_B4, SCALE_B8, SCALE_X2, SCALE_X4, SCALE_X8, SCHEDULER, SCHEDULER_2, SEQUENCE_4, SEQUENCE_8

### KEYWORD_SET (23 files)
COUNT_BR, COUNT_DR, CTRL_PI, CTRL_PID, DCF77, DRIVER_1, DRIVER_4, FADE, FF_DRE, FF_JKE, MANUAL_1, PARSET, RMP_B, RMP_W, RTC_2, RTC_MS, SELECT_8, SHR_4E, SHR_4UDE, SHR_8UDE, STORE_8, TUNE, TUNE2

### TYPED_LITERALS (19 files)
BAND_B, BIT_LOAD_B2, BIT_LOAD_DW2, BIT_LOAD_W2, BIT_TOGGLE_B, BIT_TOGGLE_DW, BIT_TOGGLE_W, CALENDAR_CALC, DATE_ADD, DAY_OF_YEAR, DEG_TO_DIR, DT_TO_STRF, FRMP_B, FSTRING_TO_WEEK, GEN_RDT, INT_TO_BCDC, MATRIX, T_PLC_MS, T_PLC_US

### BIT_ACCESS (17 files)
AIN, BIT_COUNT, BYTE_TO_BITS, CHECK_PARITY, CLK_DIV, CLK_N, DEC_8, EVEN, EXPN, GCD, GEN_BIT, INTERLOCK_4, PARITY, RDM, REFLECT, SHR_8PLE, SIGN_I

### STRING_CONST_SIZE (17 files)
CLEAN, DEL_CHARS, EXEC, FILL, FINDB, FINDP, FIX, IS_CC, IS_NCC, LIST_ADD, MESSAGE_4R, MESSAGE_8, REPLACE_ALL, REPLACE_CHARS, TRIM, TRIM1, TRIME

### STRUCT_TYPE_DECL (10 files)
CALENDAR, COMPLEX, CONSTANTS_PHYS, ESR_DATA, FRACTION, HOLIDAY_DATA, REAL2, SDT, TIMER_EVENT, VECTOR_3

### MULTI_DIM_ARRAY_INIT (4 files)
CONSTANTS_LANGUAGE, CONSTANTS_LOCATION, CONSTANTS_MATH, CONSTANTS_SETUP

### KEYWORD_ON (3 files)
HYST, MANUAL, MANUAL_2

### VAR_GLOBAL (2 files)
GVL_1.gvl, GVL_2.gvl

### ELSE_SEMICOLON (2 files)
SH, TICKER

### INLINE_ARRAY_INIT (2 files)
DRIVER_4C, SET_DATE

### KEYWORD_OVERRIDE (1 file)
OVERRIDE

### GVL_BINARY_ARTIFACT (1 file — unfixable)
GVL_0.gvl

## How to Reproduce

```bash
cd /path/to/strucpp
npm run build
node OSCAT/oscat-test.mjs
```

Requires the OSCAT V2.3 extracted files at:
`/Users/autonomyserver/Downloads/oscat_experiments/oscat_basic_v23_extracted/`
