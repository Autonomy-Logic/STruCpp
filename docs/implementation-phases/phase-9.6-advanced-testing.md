# Phase 8.6: Advanced Testing Features

**Status**: PENDING

**Duration**: 2-3 weeks

**Prerequisites**: Phase 8.2 (Assert Library)

**Goal**: Add CI/CD output formats (JUnit XML, TAP), verbose mode, test timing, and lay groundwork for future coverage instrumentation

## Overview

This phase adds production-grade features that make the test runner suitable for professional CI/CD pipelines and larger test suites. The core testing functionality is complete in Phases 8.1-8.3; this phase focuses on tooling, reporting, and developer experience.

## Scope

### JUnit XML Output

JUnit XML is the de facto standard for CI/CD test result reporting (supported by GitHub Actions, Jenkins, GitLab CI, Azure DevOps, etc.):

```bash
strucpp source.st --test test_source.st --test-output junit
```

Generates a JUnit XML file alongside the console output:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="STruC++ Test Runner" tests="5" failures="1" time="0.032">
  <testsuite name="test_counter.st" tests="3" failures="0" time="0.015">
    <testcase name="Counter increments by 1 each cycle" time="0.005"/>
    <testcase name="Counter starts at zero" time="0.004"/>
    <testcase name="Counter works with preset value" time="0.006"/>
  </testsuite>
  <testsuite name="test_motor.st" tests="2" failures="1" time="0.017">
    <testcase name="Motor starts when enabled" time="0.008"/>
    <testcase name="Motor respects speed limit" time="0.009">
      <failure message="ASSERT_LE failed: motor.actual_speed expected &lt;= 1500, got 1750"
               type="AssertionFailure">
at test_motor.st:15
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

**CI/CD integration:**
```yaml
# GitHub Actions
- run: strucpp src/*.st --test tests/test_*.st --test-output junit
- uses: dorny/test-reporter@v1
  with:
    name: ST Tests
    path: test-results.xml
    reporter: java-junit
```

### TAP Output

TAP (Test Anything Protocol) is a simple, line-oriented test output format:

```bash
strucpp source.st --test test_source.st --test-output tap
```

```
TAP version 14
1..5
ok 1 - Counter increments by 1 each cycle
ok 2 - Counter starts at zero
ok 3 - Counter works with preset value
ok 4 - Motor starts when enabled
not ok 5 - Motor respects speed limit
  ---
  message: "ASSERT_LE failed: motor.actual_speed expected <= 1500, got 1750"
  at: test_motor.st:15
  ...
```

### Verbose Mode

Detailed output showing each assert as it executes:

```bash
strucpp source.st --test test_source.st --test-verbose
```

```
STruC++ Test Runner v1.0

test_counter.st
  [RUN ] Counter increments by 1 each cycle
    ASSERT_EQ(uut.count, 1) ... PASS  [line 4]
    ASSERT_EQ(uut.count, 2) ... PASS  [line 6]
    ASSERT_EQ(uut.count, 3) ... PASS  [line 8]
  [PASS] Counter increments by 1 each cycle (0.003s)

  [RUN ] Counter works with preset value
    ASSERT_EQ(uut.count, 101) ... PASS  [line 14]
  [PASS] Counter works with preset value (0.002s)

-----------------------------------------
2 tests, 2 passed, 0 failed (0.005s total)
```

In verbose mode:
- Each assert prints its expression and result as it executes
- Test timing is shown per-test and total
- `[RUN ]` marker shows when a test begins

### Test Timing

Even in normal (non-verbose) mode, the summary includes total execution time:

```
-----------------------------------------
5 tests, 5 passed, 0 failed (0.028s total)
```

Individual test timing is available in verbose mode and in JUnit/TAP output.

**Implementation:** The C++ test runtime uses `<chrono>` for high-resolution timing:

```cpp
auto start = std::chrono::high_resolution_clock::now();
bool result = tc.func(ctx);
auto end = std::chrono::high_resolution_clock::now();
double elapsed = std::chrono::duration<double>(end - start).count();
```

### Test Filtering

Run a subset of tests by name pattern:

```bash
# Run only tests matching a pattern
strucpp source.st --test test_source.st --test-filter "Motor*"

# Run a single test by exact name
strucpp source.st --test test_source.st --test-filter "Motor starts when enabled"
```

**Implementation:** The test runner checks each test name against the filter pattern before executing. Simple glob matching (supports `*` wildcard).

### CLI Flag Summary

| Flag | Description | Default |
|------|-------------|---------|
| `--test <files...>` | Test file(s) to run | (none - required) |
| `--test-output <format>` | Output format: `console`, `junit`, `tap` | `console` |
| `--test-verbose` | Show detailed per-assert output | `false` |
| `--test-filter <pattern>` | Only run tests matching pattern | (all tests) |

## Implementation

### C++ Test Runtime Extensions

```cpp
// Add to iec_test.hpp

enum class OutputFormat { Console, JUnit, TAP };

class TestRunner {
    // ... existing fields
    OutputFormat format_ = OutputFormat::Console;
    bool verbose_ = false;
    const char* filter_ = nullptr;
    double total_time_ = 0;

    struct TestResult {
        const char* name;
        const char* file;
        bool passed;
        double elapsed_seconds;
        std::string failure_message;  // Empty if passed
        int failure_line;
    };
    std::vector<TestResult> results_;

public:
    void set_format(OutputFormat fmt) { format_ = fmt; }
    void set_verbose(bool v) { verbose_ = v; }
    void set_filter(const char* f) { filter_ = f; }

    int run() {
        // ... run all tests, collect results
        switch (format_) {
            case OutputFormat::Console: print_console(); break;
            case OutputFormat::JUnit:   print_junit();   break;
            case OutputFormat::TAP:     print_tap();     break;
        }
        return failed_ > 0 ? 1 : 0;
    }

private:
    void print_console();   // Existing format (with timing)
    void print_junit();     // JUnit XML to stdout
    void print_tap();       // TAP format to stdout

    bool matches_filter(const char* test_name) {
        if (!filter_) return true;
        // Simple glob matching with '*'
        return glob_match(filter_, test_name);
    }
};
```

### Verbose Assert Reporting

In verbose mode, each assert call prints its result immediately:

```cpp
// In TestContext, verbose mode
template<typename T>
bool assert_eq(T actual, T expected,
               const char* actual_expr, const char* expected_expr,
               int line) {
    if (verbose_) {
        printf("    ASSERT_EQ(%s, %s) ... ", actual_expr, expected_expr);
    }
    if (actual == expected) {
        if (verbose_) printf("PASS  [line %d]\n", line);
        return true;
    }
    if (verbose_) printf("FAIL  [line %d]\n", line);
    // ... report failure details
    return false;
}
```

### Test Main Generation Changes

The test main generator passes CLI flags to the TestRunner:

```cpp
int main(int argc, char* argv[]) {
    strucpp::TestRunner runner("test_counter.st");

    // Parse flags from argv
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--junit") == 0)
            runner.set_format(strucpp::OutputFormat::JUnit);
        else if (strcmp(argv[i], "--tap") == 0)
            runner.set_format(strucpp::OutputFormat::TAP);
        else if (strcmp(argv[i], "--verbose") == 0)
            runner.set_verbose(true);
        else if (strcmp(argv[i], "--filter") == 0 && i + 1 < argc)
            runner.set_filter(argv[++i]);
    }

    runner.add("Counter increments by 1 each cycle", test_1);
    runner.add("Counter starts at zero", test_2);
    return runner.run();
}
```

The STruC++ CLI maps its flags to binary arguments:
- `--test-output junit` → passes `--junit` to the binary
- `--test-verbose` → passes `--verbose` to the binary
- `--test-filter "pattern"` → passes `--filter "pattern"` to the binary

## Future Considerations

### Coverage Instrumentation (Future Phase)

Adding `--test-coverage` would instrument the generated C++ with gcov markers:

```bash
strucpp source.st --test test_source.st --test-coverage
```

This would:
1. Compile with `g++ -fprofile-arcs -ftest-coverage`
2. Run tests to generate `.gcda` files
3. Use `gcov` or `llvm-cov` to produce coverage data
4. Map C++ line coverage back to ST source lines using the line map

Output: coverage percentage per ST source file, uncovered lines highlighted.

**Not implemented in this phase** - requires careful mapping between C++ coverage data and ST source lines. The line map infrastructure (Phase 3.1+) provides the foundation.

### Mock Generation (Future Phase)

When Function Blocks (Phase 5) are available, auto-generating mock FBs:

```bash
strucpp source.st --test test_source.st --mock MockableInterface
```

This would generate a mock FB implementing the specified interface with:
- Controllable return values
- Call counting
- Argument recording

**Not implemented in this phase** - requires Phase 5.2 (interfaces) and careful design.

### Test Generation from AST (Future Phase)

Automatic boundary-value test generation:

```bash
strucpp source.st --generate-tests
```

Would analyze function/FB interfaces and generate test scaffolding:
- For INT inputs: test with 0, -32768, 32767, 1, -1
- For BOOL inputs: test with TRUE and FALSE
- For REAL inputs: test with 0.0, -1.0, 1.0, MAX, MIN, NaN

**Not implemented in this phase** - research topic for future development.

## Deliverables

### Modified Files
- [ ] `src/runtime/test/iec_test.hpp` - Add OutputFormat, verbose mode, timing, filtering
- [ ] `src/backend/test-main-gen.ts` - Generate argv parsing in main(), pass format flags
- [ ] `src/cli.ts` - Add `--test-output`, `--test-verbose`, `--test-filter` flags

### Test Files
- [ ] `tests/integration/test-runner.test.ts` - Extend with output format, verbose, filtering tests

## Testing

### Unit Tests
- JUnit XML output is well-formed XML
- TAP output follows TAP v14 specification
- Verbose mode prints per-assert details
- Test filter matches correct tests (glob with `*`)
- Timing values are positive and reasonable
- Empty filter runs all tests

### Integration Tests
- `--test-output junit` produces valid JUnit XML
- `--test-output tap` produces valid TAP output
- `--test-verbose` shows individual assert results
- `--test-filter "Counter*"` runs only matching tests
- Failure details appear in all output formats
- Exit code is correct regardless of output format
- Total timing appears in summary

## Success Criteria

- JUnit XML output passes XML validation and is consumable by CI tools
- TAP output follows the TAP specification
- Verbose mode shows per-assert pass/fail with line numbers
- Test filtering correctly includes/excludes tests by name pattern
- Timing information is accurate and displayed in all formats
- All existing tests continue to pass (no regressions)
- CI/CD integration works with at least GitHub Actions and Jenkins
