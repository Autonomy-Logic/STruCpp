# Phase 8.5: STruC++ Self-Validation Suite

**Status**: PENDING

**Duration**: 2-3 weeks

**Prerequisites**: Phase 8.2 (Assert Library), preferably Phase 8.3 (Function/FB Testing) and Phase 8.4 (Mocking Framework)

**Goal**: Build a comprehensive suite of ST source + test file pairs that validate STruC++ compiler correctness end-to-end, integrate with Vitest for CI, and establish the pattern for ongoing compiler validation

## Overview

This phase leverages the testing framework built in 8.1-8.3 to create a suite of **ST programs with known behavior** paired with **test files that assert that behavior**. If any assertion fails, it means STruC++ generated incorrect C++ code - providing end-to-end compiler validation without inspecting generated C++.

This is inspired by the K-ST approach (formal semantics used to validate ST compilers) but implemented practically: we write ST programs where we know exactly what the output should be, compile them with STruC++, run the tests, and verify correctness.

### Dual Benefit

1. **Compiler validation**: Catches codegen bugs when modifying STruC++ (regression testing)
2. **Language compliance**: Documents expected behavior for every language feature
3. **Living specification**: Test files serve as executable examples of IEC 61131-3 semantics

## Test Suite Structure

```
tests/st-validation/
├── README.md                          # Overview and conventions
├── expressions/
│   ├── arithmetic.st                  # Arithmetic expressions
│   ├── test_arithmetic.st             # Tests for arithmetic
│   ├── boolean.st                     # Boolean expressions
│   ├── test_boolean.st
│   ├── comparison.st                  # Comparison operators
│   ├── test_comparison.st
│   ├── bitwise.st                     # Bit-string operations
│   ├── test_bitwise.st
│   ├── type_conversion.st            # Type conversions
│   └── test_type_conversion.st
├── control_flow/
│   ├── if_elsif_else.st
│   ├── test_if_elsif_else.st
│   ├── case_statement.st
│   ├── test_case_statement.st
│   ├── for_loop.st
│   ├── test_for_loop.st
│   ├── while_loop.st
│   ├── test_while_loop.st
│   ├── repeat_loop.st
│   ├── test_repeat_loop.st
│   ├── exit_statement.st
│   ├── test_exit_statement.st
│   ├── nested_loops.st
│   └── test_nested_loops.st
├── variables/
│   ├── initialization.st             # Variable initialization values
│   ├── test_initialization.st
│   ├── type_defaults.st              # Default values per type
│   ├── test_type_defaults.st
│   ├── constants.st                   # CONSTANT variables
│   └── test_constants.st
├── data_types/
│   ├── integers.st                    # INT, DINT, LINT, etc.
│   ├── test_integers.st
│   ├── reals.st                       # REAL, LREAL
│   ├── test_reals.st
│   ├── booleans.st                    # BOOL operations
│   ├── test_booleans.st
│   ├── strings.st                     # STRING operations
│   ├── test_strings.st
│   ├── time_types.st                  # TIME, DATE, TOD, DT
│   ├── test_time_types.st
│   ├── enumerations.st               # ENUM types
│   ├── test_enumerations.st
│   ├── arrays.st                      # ARRAY access and operations
│   ├── test_arrays.st
│   ├── structs.st                     # STRUCT types
│   ├── test_structs.st
│   └── subranges.st                   # Subrange types
│   └── test_subranges.st
├── composite_access/
│   ├── array_subscript.st
│   ├── test_array_subscript.st
│   ├── struct_member.st
│   ├── test_struct_member.st
│   ├── nested_access.st              # array[i].field.subarray[j]
│   └── test_nested_access.st
├── references/                        # Phase 2.4 features
│   ├── ref_to.st
│   ├── test_ref_to.st
│   ├── dereference.st
│   └── test_dereference.st
├── dynamic_memory/                    # Phase 3.5 features
│   ├── new_delete.st
│   └── test_new_delete.st
├── functions/                         # Phase 4 features (when available)
│   ├── basic_function.st
│   ├── test_basic_function.st
│   ├── function_overload.st
│   ├── test_function_overload.st
│   ├── var_in_out_params.st
│   └── test_var_in_out_params.st
├── function_blocks/                   # Phase 5 features (when available)
│   ├── basic_fb.st
│   ├── test_basic_fb.st
│   ├── fb_state.st
│   ├── test_fb_state.st
│   ├── standard_fbs.st               # TON, CTU, R_TRIG, etc.
│   ├── test_standard_fbs.st
│   ├── fb_methods.st
│   ├── test_fb_methods.st
│   ├── fb_inheritance.st
│   └── test_fb_inheritance.st
└── programs/
    ├── multi_program.st               # Multiple programs interacting
    ├── test_multi_program.st
    ├── configuration.st               # CONFIGURATION/RESOURCE/TASK
    └── test_configuration.st
```

## Example Validation Test Pairs

### Arithmetic Validation

**`expressions/arithmetic.st`:**
```st
PROGRAM ArithmeticTest
  VAR
    add_result : INT;
    sub_result : INT;
    mul_result : INT;
    div_result : INT;
    mod_result : INT;
    neg_result : INT;
    precedence_result : INT;
    a : INT;
    b : INT;
  END_VAR

  a := 10;
  b := 3;
  add_result := a + b;
  sub_result := a - b;
  mul_result := a * b;
  div_result := a / b;
  mod_result := a MOD b;
  neg_result := -a;
  precedence_result := a + b * 2;   (* Should be 16, not 26 *)
END_PROGRAM
```

**`expressions/test_arithmetic.st`:**
```st
TEST 'Addition'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.add_result, 13);
END_TEST

TEST 'Subtraction'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.sub_result, 7);
END_TEST

TEST 'Multiplication'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.mul_result, 30);
END_TEST

TEST 'Integer division truncates'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.div_result, 3, 'INT division 10/3 should truncate to 3');
END_TEST

TEST 'Modulo operation'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.mod_result, 1, '10 MOD 3 = 1');
END_TEST

TEST 'Unary negation'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.neg_result, -10);
END_TEST

TEST 'Operator precedence (* before +)'
  VAR uut : ArithmeticTest; END_VAR
  uut();
  ASSERT_EQ(uut.precedence_result, 16, 'a + b * 2 = 10 + 6 = 16');
END_TEST
```

### Control Flow Validation

**`control_flow/for_loop.st`:**
```st
PROGRAM ForLoopTest
  VAR
    sum_1_to_10 : INT;
    countdown : INT;
    nested_result : INT;
    early_exit_result : INT;
    step_result : INT;
    i : INT;
    j : INT;
  END_VAR

  (* Sum 1 to 10 *)
  sum_1_to_10 := 0;
  FOR i := 1 TO 10 DO
    sum_1_to_10 := sum_1_to_10 + i;
  END_FOR;

  (* Countdown *)
  countdown := 0;
  FOR i := 10 TO 1 BY -1 DO
    countdown := countdown + 1;
  END_FOR;

  (* Nested loops *)
  nested_result := 0;
  FOR i := 1 TO 3 DO
    FOR j := 1 TO 3 DO
      nested_result := nested_result + 1;
    END_FOR;
  END_FOR;

  (* Early exit *)
  early_exit_result := 0;
  FOR i := 1 TO 100 DO
    IF i > 5 THEN EXIT; END_IF;
    early_exit_result := early_exit_result + 1;
  END_FOR;

  (* Step by 2 *)
  step_result := 0;
  FOR i := 0 TO 10 BY 2 DO
    step_result := step_result + 1;
  END_FOR;
END_PROGRAM
```

**`control_flow/test_for_loop.st`:**
```st
TEST 'Sum 1 to 10 equals 55'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.sum_1_to_10, 55);
END_TEST

TEST 'Countdown executes 10 iterations'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.countdown, 10);
END_TEST

TEST 'Nested loops execute 3x3=9 times'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.nested_result, 9);
END_TEST

TEST 'EXIT breaks out of loop after 5 iterations'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.early_exit_result, 5);
END_TEST

TEST 'Step by 2 counts 0,2,4,6,8,10 = 6 iterations'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.step_result, 6);
END_TEST
```

## Vitest Integration

### Test Orchestrator

A Vitest test file orchestrates running all ST validation tests:

**`tests/integration/st-validation.test.ts`:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// Skip if g++ is unavailable
const hasGpp = (() => {
  try { execSync('which g++', { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

const describeIfGpp = hasGpp ? describe : describe.skip;

describeIfGpp('ST Validation Suite', () => {
  const validationDir = path.resolve(__dirname, '../st-validation');
  const strucppBin = path.resolve(__dirname, '../../dist/cli.js');

  // Auto-discover all test pairs
  const testFiles = glob.sync('**/test_*.st', { cwd: validationDir });

  for (const testFile of testFiles) {
    const sourceFile = testFile.replace('test_', '');
    const testPath = path.join(validationDir, testFile);
    const sourcePath = path.join(validationDir, sourceFile);

    // Skip if source file doesn't exist (test for future phase)
    if (!fs.existsSync(sourcePath)) continue;

    const testName = testFile.replace(/\.st$/, '').replace(/^test_/, '');

    it(`validates ${testName}`, () => {
      const result = execSync(
        `node "${strucppBin}" "${sourcePath}" --test "${testPath}"`,
        { encoding: 'utf-8', timeout: 30000 }
      );
      expect(result).toContain('0 failed');
      expect(result).not.toContain('[FAIL]');
    }, 30000);
  }
});
```

### Running the Suite

```bash
# Run all ST validation tests through Vitest
npm test -- tests/integration/st-validation.test.ts

# Run validation tests directly with strucpp
strucpp tests/st-validation/expressions/arithmetic.st \
  --test tests/st-validation/expressions/test_arithmetic.st

# Run all tests in a category
for f in tests/st-validation/control_flow/test_*.st; do
  source="${f/test_/}"
  strucpp "$source" --test "$f"
done
```

### CI Pipeline Integration

**GitHub Actions example (`.github/workflows/test.yml`):**
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm ci
      - run: npm run build
      - run: npm test
        # npm test runs all Vitest tests including st-validation
```

The ST validation suite runs as part of the standard `npm test` command. Any codegen regression immediately fails the CI pipeline.

## Conventions for Writing Validation Tests

### Naming Convention
- Source file: `descriptive_name.st`
- Test file: `test_descriptive_name.st`
- Both files live in the same directory under the appropriate category

### Test Granularity
- One source file per language feature or concept
- Test file covers all important behaviors of that feature
- Each TEST block tests one specific aspect
- TEST names are descriptive and document expected behavior

### Coverage Goals
- Every ST language feature should have at least one validation pair
- Edge cases (boundary values, zero, negative, overflow) should be covered
- Cross-feature interactions should be tested where relevant

### Adding New Validation Tests

When implementing a new compiler feature:
1. Create `feature_name.st` with a PROGRAM exercising the feature
2. Create `test_feature_name.st` with TEST blocks asserting expected behavior
3. Place both in the appropriate category directory
4. Run `strucpp feature_name.st --test test_feature_name.st` to verify
5. The Vitest orchestrator will auto-discover the new pair

## Deliverables

### New Files
- [ ] `tests/st-validation/README.md` - Conventions and structure overview
- [ ] `tests/st-validation/expressions/arithmetic.st` + `test_arithmetic.st`
- [ ] `tests/st-validation/expressions/boolean.st` + `test_boolean.st`
- [ ] `tests/st-validation/expressions/comparison.st` + `test_comparison.st`
- [ ] `tests/st-validation/control_flow/if_elsif_else.st` + `test_if_elsif_else.st`
- [ ] `tests/st-validation/control_flow/case_statement.st` + `test_case_statement.st`
- [ ] `tests/st-validation/control_flow/for_loop.st` + `test_for_loop.st`
- [ ] `tests/st-validation/control_flow/while_loop.st` + `test_while_loop.st`
- [ ] `tests/st-validation/control_flow/repeat_loop.st` + `test_repeat_loop.st`
- [ ] `tests/st-validation/variables/initialization.st` + `test_initialization.st`
- [ ] `tests/st-validation/variables/type_defaults.st` + `test_type_defaults.st`
- [ ] `tests/st-validation/data_types/integers.st` + `test_integers.st`
- [ ] `tests/st-validation/data_types/reals.st` + `test_reals.st`
- [ ] `tests/st-validation/data_types/arrays.st` + `test_arrays.st`
- [ ] `tests/st-validation/programs/multi_program.st` + `test_multi_program.st`
- [ ] `tests/integration/st-validation.test.ts` - Vitest orchestrator

### Deferred (Added When Phases Complete)
- `tests/st-validation/functions/` - After Phase 4
- `tests/st-validation/function_blocks/` - After Phase 5
- `tests/st-validation/data_types/strings.st` - After STRING codegen is complete

## Success Criteria

- At least 15 source+test pairs covering core language features
- All validation tests pass on the current STruC++ compiler
- Vitest orchestrator auto-discovers and runs all pairs
- CI pipeline runs the full suite on every commit
- Adding a new validation pair requires no configuration changes
- Test suite catches intentionally introduced codegen regressions

## Notes

### Incremental Growth

The suite starts with tests for currently implemented features (expressions, control flow, variables, data types, programs) and grows as new phases are completed. Test pairs for Functions and FBs will be added in parallel with Phase 4 and 5 implementation.

### Regression Detection

The primary value is regression detection. When modifying the codegen, a failing ST validation test pinpoints exactly which language feature broke. This is far more precise than C++ compilation tests (which only verify syntax) or unit tests (which test individual compiler components in isolation).

### Performance

Each validation test compiles an ST program to C++, builds it with g++, and runs it. With small test programs, each takes ~1-2 seconds. With 30+ test pairs, the full suite should complete in under a minute. The Vitest orchestrator runs tests in parallel where possible.
