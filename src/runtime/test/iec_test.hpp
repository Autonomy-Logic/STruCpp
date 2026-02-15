/**
 * STruC++ Test Runtime
 *
 * Header-only C++ test runtime for the STruC++ testing framework.
 * Provides TestContext (assertion methods), TestRunner (orchestration),
 * and value-to-string formatting for failure messages.
 */
#pragma once

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <vector>
#include <functional>
#include <string>
#include <sstream>

namespace strucpp {

// ============================================================================
// Value formatting
// ============================================================================

/**
 * Convert a value to a display string for assertion failure messages.
 * Uses overloads to handle different IEC types correctly.
 */
template<typename T>
inline std::string to_display_string(const T& value) {
    std::ostringstream oss;
    oss << value;
    return oss.str();
}

// Bool specialization: show TRUE/FALSE instead of 1/0
inline std::string to_display_string(const bool& value) {
    return value ? "TRUE" : "FALSE";
}

// ============================================================================
// TestContext
// ============================================================================

/**
 * Per-test context that tracks assertion results and provides assert methods.
 */
struct TestContext {
    const char* test_file = "";
    int failures = 0;

    /**
     * ASSERT_EQ: check actual == expected
     */
    template<typename T>
    bool assert_eq(T actual, T expected,
                   const char* actual_expr, const char* expected_expr,
                   int line) {
        if (actual == expected) return true;
        std::string actual_str = to_display_string(actual);
        std::string expected_str = to_display_string(expected);
        printf("         ASSERT_EQ failed: %s expected %s, got %s\n",
               actual_expr, expected_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        failures++;
        return false;
    }

    /**
     * ASSERT_TRUE: check condition is true
     */
    bool assert_true(bool condition, const char* expr, int line) {
        if (condition) return true;
        printf("         ASSERT_TRUE failed: %s expected TRUE, got FALSE\n", expr);
        printf("         at %s:%d\n", test_file, line);
        failures++;
        return false;
    }

    /**
     * ASSERT_FALSE: check condition is false
     */
    bool assert_false(bool condition, const char* expr, int line) {
        if (!condition) return true;
        printf("         ASSERT_FALSE failed: %s expected FALSE, got TRUE\n", expr);
        printf("         at %s:%d\n", test_file, line);
        failures++;
        return false;
    }
};

// ============================================================================
// TestRunner
// ============================================================================

using TestFunc = std::function<bool(TestContext&)>;

struct TestCaseEntry {
    const char* name;
    TestFunc func;
};

/**
 * Test runner that orchestrates test execution and reports results.
 */
class TestRunner {
    const char* test_file_;
    std::vector<TestCaseEntry> tests_;
    int passed_ = 0;
    int failed_ = 0;

public:
    explicit TestRunner(const char* test_file) : test_file_(test_file) {}

    void add(const char* name, TestFunc func) {
        tests_.push_back({name, std::move(func)});
    }

    int run() {
        printf("STruC++ Test Runner v1.0\n\n");
        printf("%s\n", test_file_);

        for (auto& tc : tests_) {
            TestContext ctx;
            ctx.test_file = test_file_;
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
