# Phase 8.1: Core Test Infrastructure

**Status**: PENDING

**Duration**: 2-3 weeks

**Prerequisites**: Phase 3.6 (REPL Runner)

**Goal**: Implement the foundational test infrastructure: parser extensions for TEST/END_TEST blocks, basic assert functions, C++ test runtime, test main generator, and CLI `--test` flag with single-pass compile-build-run execution

## Overview

This sub-phase delivers the minimum viable testing framework. Test files are ST source files containing `TEST/END_TEST` blocks with `ASSERT_EQ` and `ASSERT_TRUE` assertions. The `--test` CLI flag compiles the source, generates a test harness, builds a binary, runs it, and reports results - all in a single command.

Only PROGRAM testing is supported in this phase (Functions and Function Blocks require Phase 4+5). Each TEST block creates fresh program instances, providing full context isolation.

## Scope

### Language Extensions

#### TEST / END_TEST Blocks

Test blocks are top-level constructs in test files. Each block has a name (string literal), optional VAR declarations, and a body of ST statements plus assert calls:

```st
TEST 'Test name here'
  VAR
    uut : MyProgram;
    expected : INT;
  END_VAR
  expected := 42;
  uut();
  ASSERT_EQ(uut.result, expected);
END_TEST
```

#### POU Invocation

Inside a TEST block, POU instances are invoked with function-call syntax:

```st
VAR uut : Counter; END_VAR
uut();                  (* Executes the program body once *)
uut();                  (* Executes again - state persists within this TEST block *)
```

This maps to calling the generated C++ `run()` method:

```cpp
Program_Counter uut;
uut.run();    // First invocation
uut.run();    // Second invocation - uut.count is accumulated
```

#### Variable Access

Test code accesses POU variables using standard ST dot notation:

```st
uut.count := 10;          (* Set a variable before invocation *)
uut();                     (* Run the POU *)
ASSERT_EQ(uut.count, 11); (* Check the result *)
```

#### Basic Assert Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `ASSERT_EQ` | `ASSERT_EQ(actual, expected)` | Exact equality for any elementary type |
| `ASSERT_TRUE` | `ASSERT_TRUE(condition)` | Boolean condition is TRUE |
| `ASSERT_FALSE` | `ASSERT_FALSE(condition)` | Boolean condition is FALSE |

Assert functions are recognized as built-in calls during parsing. They do not need to be declared. On failure, they report the test file name, line number, expected value, and actual value.

### Example Test File

**Source: `counter.st`**
```st
PROGRAM Counter
  VAR count : INT; END_VAR
  count := count + 1;
END_PROGRAM
```

**Test: `test_counter.st`**
```st
TEST 'Counter increments by 1 each cycle'
  VAR uut : Counter; END_VAR
  uut();
  ASSERT_EQ(uut.count, 1);
  uut();
  ASSERT_EQ(uut.count, 2);
  uut();
  ASSERT_EQ(uut.count, 3);
END_TEST

TEST 'Counter starts at zero'
  VAR uut : Counter; END_VAR
  ASSERT_EQ(uut.count, 0);
END_TEST

TEST 'Counter works with preset value'
  VAR uut : Counter; END_VAR
  uut.count := 100;
  uut();
  ASSERT_EQ(uut.count, 101);
END_TEST

TEST 'Counter handles negative values'
  VAR uut : Counter; END_VAR
  uut.count := -5;
  uut();
  ASSERT_EQ(uut.count, -4);
END_TEST

TEST 'Boolean flag tracks positive count'
  VAR uut : Counter; positive : BOOL; END_VAR
  uut();
  positive := uut.count > 0;
  ASSERT_TRUE(positive);
END_TEST
```

**Usage:**
```bash
strucpp counter.st --test test_counter.st
```

**Output:**
```
STruC++ Test Runner v1.0

test_counter.st
  [PASS] Counter increments by 1 each cycle
  [PASS] Counter starts at zero
  [PASS] Counter works with preset value
  [PASS] Counter handles negative values
  [PASS] Boolean flag tracks positive count

-----------------------------------------
5 tests, 5 passed, 0 failed
```

## Implementation

### 1. Test Model (`src/testing/test-model.ts`)

Data structures representing a parsed test file:

```typescript
export interface TestFile {
  fileName: string;
  testCases: TestCase[];
}

export interface TestCase {
  name: string;            // From TEST 'name'
  varBlocks: VarBlock[];   // Local variable declarations
  body: Statement[];       // Statements including asserts
  sourceSpan: SourceSpan;  // Location in test file
}

export interface AssertCall {
  kind: "AssertCall";
  assertType: "ASSERT_EQ" | "ASSERT_TRUE" | "ASSERT_FALSE";
  args: Expression[];      // Arguments to the assert
  sourceSpan: SourceSpan;
}
```

### 2. Lexer Additions (`src/frontend/lexer.ts`)

New tokens for test file parsing:

```typescript
// Test-specific keywords
export const TEST = createToken({ name: "TEST", pattern: /TEST/i, longer_alt: Identifier });
export const END_TEST = createToken({ name: "END_TEST", pattern: /END_TEST/i, longer_alt: Identifier });

// Assert built-in functions
export const ASSERT_EQ = createToken({ name: "ASSERT_EQ", pattern: /ASSERT_EQ/i, longer_alt: Identifier });
export const ASSERT_TRUE = createToken({ name: "ASSERT_TRUE", pattern: /ASSERT_TRUE/i, longer_alt: Identifier });
export const ASSERT_FALSE = createToken({ name: "ASSERT_FALSE", pattern: /ASSERT_FALSE/i, longer_alt: Identifier });
```

Note: These tokens should only be added to the token list when parsing test files, to avoid conflicting with user identifiers named `TEST` in normal ST programs. This can be achieved by having a separate token list for test file parsing, or by using the parser's `GATE` mechanism.

### 3. Parser Extensions (`src/frontend/parser.ts`)

New rules for test file parsing:

```typescript
// Top-level rule for test files
testFile() {
  this.MANY(() => {
    this.SUBRULE(this.testCase);
  });
}

// Individual test case
testCase() {
  this.CONSUME(TEST);
  this.CONSUME(StringLiteral);  // Test name
  this.MANY(() => {
    this.SUBRULE(this.varBlock);
  });
  this.SUBRULE(this.testStatementList);
  this.CONSUME(END_TEST);
}

// Statements inside test blocks (reuses existing statement rules + asserts)
testStatement() {
  this.OR([
    { ALT: () => this.SUBRULE(this.assertCall) },
    { ALT: () => this.SUBRULE(this.statement) },  // Existing ST statements
  ]);
}

// Assert function calls
assertCall() {
  this.OR([
    { ALT: () => this.CONSUME(ASSERT_EQ) },
    { ALT: () => this.CONSUME(ASSERT_TRUE) },
    { ALT: () => this.CONSUME(ASSERT_FALSE) },
  ]);
  this.CONSUME(LParen);
  this.SUBRULE(this.expression);
  this.OPTION(() => {
    this.CONSUME(Comma);
    this.SUBRULE2(this.expression);
  });
  this.CONSUME(RParen);
  this.CONSUME(Semicolon);
}
```

### 4. AST Builder Extensions (`src/frontend/ast-builder.ts`)

Build TestFile AST from CST:

```typescript
buildTestFile(cst: CstNode): TestFile {
  const testCases = this.getAllNodes(cst.children.testCase).map(
    (tc) => this.buildTestCase(tc)
  );
  return { fileName: this.fileName, testCases };
}

buildTestCase(cst: CstNode): TestCase {
  const name = cst.children.StringLiteral[0].image.slice(1, -1); // Remove quotes
  const varBlocks = this.getAllNodes(cst.children.varBlock).map(
    (vb) => this.buildVarBlock(vb)
  );
  const body = this.buildTestStatementList(cst.children.testStatementList[0]);
  return { name, varBlocks, body, sourceSpan: this.getSpan(cst) };
}
```

### 5. Test Main Generator (`src/backend/test-main-gen.ts`)

Generates `test_main.cpp` from the TestModel and compiled program classes:

```cpp
// Generated test_main.cpp
#include "generated.hpp"
#include "iec_test.hpp"

using namespace strucpp;

// TEST 'Counter increments by 1 each cycle'
bool test_1(strucpp::TestContext& ctx) {
    Program_Counter uut;
    uut.run();
    if (!ctx.assert_eq<INT_t>(
        static_cast<INT_t>(uut.count), INT_t(1),
        "uut.count", "1", 4)) return false;
    uut.run();
    if (!ctx.assert_eq<INT_t>(
        static_cast<INT_t>(uut.count), INT_t(2),
        "uut.count", "2", 6)) return false;
    uut.run();
    if (!ctx.assert_eq<INT_t>(
        static_cast<INT_t>(uut.count), INT_t(3),
        "uut.count", "3", 8)) return false;
    return true;
}

// TEST 'Counter starts at zero'
bool test_2(strucpp::TestContext& ctx) {
    Program_Counter uut;
    if (!ctx.assert_eq<INT_t>(
        static_cast<INT_t>(uut.count), INT_t(0),
        "uut.count", "0", 13)) return false;
    return true;
}

int main() {
    strucpp::TestRunner runner("test_counter.st");
    runner.add("Counter increments by 1 each cycle", test_1);
    runner.add("Counter starts at zero", test_2);
    return runner.run();
}
```

**Key generation rules:**
- Each TEST block becomes a `bool test_N(TestContext&)` function
- VAR declarations become local C++ variables (fresh per invocation)
- `uut()` becomes `uut.run()` (for programs)
- `ASSERT_EQ(a, b)` becomes `ctx.assert_eq<T>(a, b, "a", "b", line)`
- `ASSERT_TRUE(x)` becomes `ctx.assert_true(x, "x", line)`
- Test functions return `true` on success, `false` on first failure (fail-fast within a test)
- `main()` registers all tests and calls `runner.run()`

### 6. C++ Test Runtime (`src/runtime/test/iec_test.hpp`)

Header-only C++ test runtime:

```cpp
#pragma once
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <cmath>
#include <vector>
#include <functional>

namespace strucpp {

struct TestContext {
    const char* test_file;
    int failures = 0;

    template<typename T>
    bool assert_eq(T actual, T expected,
                   const char* actual_expr, const char* expected_expr,
                   int line) {
        if (actual == expected) return true;
        // Print failure details (type-appropriate formatting)
        report_failure("ASSERT_EQ", actual_expr, expected_expr,
                       to_string(actual), to_string(expected), line);
        failures++;
        return false;
    }

    bool assert_true(bool condition, const char* expr, int line) {
        if (condition) return true;
        report_failure_bool("ASSERT_TRUE", expr, "TRUE", "FALSE", line);
        failures++;
        return false;
    }

    bool assert_false(bool condition, const char* expr, int line) {
        if (!condition) return true;
        report_failure_bool("ASSERT_FALSE", expr, "FALSE", "TRUE", line);
        failures++;
        return false;
    }

private:
    void report_failure(const char* assert_type,
                        const char* actual_expr, const char* expected_expr,
                        const char* actual_val, const char* expected_val,
                        int line);
    // ... type-specific to_string helpers
};

using TestFunc = std::function<bool(TestContext&)>;

struct TestCase {
    const char* name;
    TestFunc func;
};

class TestRunner {
    const char* test_file_;
    std::vector<TestCase> tests_;
    int passed_ = 0;
    int failed_ = 0;

public:
    TestRunner(const char* test_file) : test_file_(test_file) {}

    void add(const char* name, TestFunc func) {
        tests_.push_back({name, func});
    }

    int run() {
        printf("STruC++ Test Runner v1.0\n\n");
        printf("%s\n", test_file_);

        for (auto& tc : tests_) {
            TestContext ctx{test_file_};
            bool result = tc.func(ctx);
            if (result && ctx.failures == 0) {
                printf("  [PASS] %s\n", tc.name);
                passed_++;
            } else {
                printf("  [FAIL] %s\n", tc.name);
                failed_++;
            }
        }

        printf("\n-----------------------------------------\n");
        printf("%d tests, %d passed, %d failed\n",
               passed_ + failed_, passed_, failed_);

        return failed_ > 0 ? 1 : 0;
    }
};

} // namespace strucpp
```

### 7. CLI Integration (`src/cli.ts`)

Add `--test` flag to the CLI:

```typescript
// New CLI options
interface CLIOptions {
  // ... existing options
  test?: string[];           // Test file paths
  testVerbose?: boolean;     // Verbose test output
}
```

The `--test` execution flow:

```typescript
async function runTests(sourceFiles: string[], testFiles: string[], options: CLIOptions) {
  // 1. Compile all source files
  const compileResult = compile(combinedSource, { headerFileName: 'generated.hpp' });
  if (!compileResult.success) {
    reportCompileErrors(compileResult.errors);
    process.exit(1);
  }

  // 2. Parse test files
  const testModels = testFiles.map(f => parseTestFile(fs.readFileSync(f, 'utf-8'), f));

  // 3. Generate test_main.cpp
  const testMainCpp = generateTestMain(testModels, compileResult);

  // 4. Write files to temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strucpp-test-'));
  // ... write generated.hpp, generated.cpp, test_main.cpp

  // 5. Compile with g++
  execSync(`g++ -std=c++17 -I"${runtimeInclude}" -I"${testRuntime}" ...`);

  // 6. Execute binary and capture output
  const result = execSync(`"${binaryPath}"`, { encoding: 'utf-8' });
  const exitCode = /* parse exit code */;

  // 7. Display results
  process.stdout.write(result);

  // 8. Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

  // 9. Exit with test result code
  process.exit(exitCode);
}
```

## Deliverables

### New Files
- [ ] `src/testing/test-model.ts` - TestFile, TestCase, AssertCall types
- [ ] `src/testing/test-parser.ts` - Parse test ST files into TestModel
- [ ] `src/backend/test-main-gen.ts` - Generate test_main.cpp
- [ ] `src/runtime/test/iec_test.hpp` - C++ test runner and assertions
- [ ] `tests/frontend/test-parser.test.ts` - Test file parser unit tests
- [ ] `tests/backend/test-main-gen.test.ts` - Test main generator unit tests
- [ ] `tests/integration/test-runner.test.ts` - End-to-end integration tests

### Modified Files
- [ ] `src/cli.ts` - Add `--test` flag and test execution flow
- [ ] `src/frontend/lexer.ts` - Add TEST, END_TEST, ASSERT_* tokens
- [ ] `src/frontend/parser.ts` - Add test file parsing rules
- [ ] `src/frontend/ast.ts` - Add test-specific AST node types
- [ ] `src/frontend/ast-builder.ts` - Build test AST nodes

## Testing

### Unit Tests (`tests/frontend/test-parser.test.ts`)
- Parse simple TEST block with one assert
- Parse multiple TEST blocks
- Parse VAR declarations in TEST blocks
- Parse ASSERT_EQ with two arguments
- Parse ASSERT_TRUE/ASSERT_FALSE with one argument
- Parse POU invocation syntax `uut()`
- Parse member access `uut.varName`
- Error on missing END_TEST
- Error on assert with wrong argument count

### Unit Tests (`tests/backend/test-main-gen.test.ts`)
- Generate test function for single TEST block
- Generate main() with test registration
- Generate variable declarations for VAR block
- Generate POU invocation as `run()` call
- Generate ASSERT_EQ with correct type cast
- Generate ASSERT_TRUE/ASSERT_FALSE
- Multiple TEST blocks generate separate functions

### Integration Tests (`tests/integration/test-runner.test.ts`)
- Compile and run test with all assertions passing (exit code 0)
- Compile and run test with a failing assertion (exit code 1)
- Test output contains [PASS] / [FAIL] markers
- Test output contains failure details (line, expected, actual)
- Multiple TEST blocks have independent state
- POU invocation accumulates state within TEST block
- Variable preset before invocation works correctly

## Success Criteria

- `strucpp source.st --test test.st` compiles, builds, runs, and reports in a single command
- Each TEST block gets fresh POU instances (context isolation)
- ASSERT_EQ correctly compares elementary types (INT, DINT, REAL, BOOL, etc.)
- ASSERT_TRUE/ASSERT_FALSE work for boolean conditions
- Failed assertions report file name, line number, expected and actual values
- Exit code is 0 when all tests pass, 1 when any test fails
- Temporary files are cleaned up after execution
- Generated C++ compiles without warnings
- All unit and integration tests pass

## Validation Examples

### Example 1: Passing Tests
```bash
$ strucpp counter.st --test test_counter.st
STruC++ Test Runner v1.0

test_counter.st
  [PASS] Counter increments by 1 each cycle
  [PASS] Counter starts at zero

-----------------------------------------
2 tests, 2 passed, 0 failed
$ echo $?
0
```

### Example 2: Failing Test
```bash
$ strucpp buggy.st --test test_buggy.st
STruC++ Test Runner v1.0

test_buggy.st
  [PASS] Basic operation works
  [FAIL] Edge case handling
         ASSERT_EQ failed: uut.result expected 0, got -1
         at test_buggy.st:12

-----------------------------------------
2 tests, 1 passed, 1 failed
$ echo $?
1
```

### Example 3: Multiple Invocations with State
```st
(* Verify state accumulates within a TEST block but resets between blocks *)
TEST 'State accumulates within test'
  VAR uut : Counter; END_VAR
  uut();
  uut();
  uut();
  ASSERT_EQ(uut.count, 3);  (* Three invocations = count of 3 *)
END_TEST

TEST 'State is fresh in new test'
  VAR uut : Counter; END_VAR
  ASSERT_EQ(uut.count, 0);  (* Fresh instance, count starts at 0 *)
  uut();
  ASSERT_EQ(uut.count, 1);  (* Only one invocation *)
END_TEST
```

## Notes

### Relationship to Other Phases

- **Phase 3.6** (REPL): Reuses the C++ compilation pipeline (g++ invocation, runtime include paths, isocline is NOT needed)
- **Phase 4** (Functions): Will enable function call testing in Phase 8.3
- **Phase 5** (Function Blocks): Will enable FB instantiation testing in Phase 8.3

### Design Decisions

1. **Fail-fast within TEST blocks**: On the first assertion failure within a TEST block, the test stops and is marked as FAIL. Other TEST blocks still execute. This matches ceedling behavior.

2. **Token separation**: Test-specific tokens (TEST, END_TEST, ASSERT_*) are only active when parsing test files, not normal ST source. This prevents conflicts with user code that might use `TEST` as an identifier.

3. **No isocline dependency**: Unlike the REPL, the test runner does not need the isocline line editing library. It runs non-interactively with no stdin input.

4. **Program invocation syntax**: `uut()` (function-call syntax) is used instead of a special command like `RUN(uut)`. This is consistent with IEC 61131-3 syntax for FB invocation and will extend naturally when Functions and FBs are added in Phase 8.3.
