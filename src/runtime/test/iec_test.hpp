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
#include <cstdint>
#include <exception>
#include <vector>
#include <functional>
#include <string>
#include <sstream>
#include <type_traits>

namespace strucpp {

// Forward declaration of scan-cycle time global (defined in iec_std_lib.hpp)
extern int64_t __CURRENT_TIME_NS;

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

// const char* specialization
inline std::string to_display_string(const char* value) {
    return value ? std::string("'") + value + "'" : "(null)";
}

// Overload for IECString (has .c_str() directly)
template<size_t N>
inline std::string to_display_string(const strucpp::IECString<N>& value) {
    return std::string("'") + value.c_str() + "'";
}

// Overload for IECStringVar (has .get().c_str())
template<size_t N>
inline std::string to_display_string(const strucpp::IECStringVar<N>& value) {
    return std::string("'") + value.get().c_str() + "'";
}

// ============================================================================
// TestContext
// ============================================================================

/**
 * Per-test context that tracks assertion results and provides assert methods.
 * All assert methods support an optional custom message (nullptr if not provided).
 */
struct TestContext {
    const char* test_file = "";
    int failures = 0;

    /**
     * Print optional custom message if provided.
     */
    void print_message(const char* msg) {
        if (msg && msg[0] != '\0') {
            printf("         Message: %s\n", msg);
        }
    }

    /**
     * ASSERT_EQ: check actual == expected (same type)
     */
    template<typename T>
    bool assert_eq(T actual, T expected,
                   const char* actual_expr, const char* expected_expr,
                   int line, const char* msg = "") {
        if (actual == expected) return true;
        std::string actual_str = to_display_string(actual);
        std::string expected_str = to_display_string(expected);
        printf("         ASSERT_EQ failed: %s expected %s, got %s\n",
               actual_expr, expected_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_EQ: check actual == expected (mixed types, e.g. IECStringVar vs const char*)
     */
    template<typename T, typename U,
        std::enable_if_t<!std::is_same_v<std::decay_t<T>, std::decay_t<U>>, int> = 0>
    bool assert_eq(T actual, U expected,
                   const char* actual_expr, const char* expected_expr,
                   int line, const char* msg = "") {
        if (actual == expected) return true;
        std::string actual_str = to_display_string(actual);
        std::string expected_str = to_display_string(expected);
        printf("         ASSERT_EQ failed: %s expected %s, got %s\n",
               actual_expr, expected_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_NEQ: check actual != expected (same type)
     */
    template<typename T>
    bool assert_neq(T actual, T expected,
                    const char* actual_expr, const char* expected_expr,
                    int line, const char* msg = "") {
        if (actual != expected) return true;
        std::string actual_str = to_display_string(actual);
        printf("         ASSERT_NEQ failed: %s should not equal %s\n",
               actual_expr, actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_NEQ: check actual != expected (mixed types)
     */
    template<typename T, typename U,
        std::enable_if_t<!std::is_same_v<std::decay_t<T>, std::decay_t<U>>, int> = 0>
    bool assert_neq(T actual, U expected,
                    const char* actual_expr, const char* expected_expr,
                    int line, const char* msg = "") {
        if (actual != expected) return true;
        std::string actual_str = to_display_string(actual);
        printf("         ASSERT_NEQ failed: %s should not equal %s\n",
               actual_expr, actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_TRUE: check condition is true
     */
    bool assert_true(bool condition, const char* expr, int line,
                     const char* msg = "") {
        if (condition) return true;
        printf("         ASSERT_TRUE failed: %s expected TRUE, got FALSE\n", expr);
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_FALSE: check condition is false
     */
    bool assert_false(bool condition, const char* expr, int line,
                      const char* msg = "") {
        if (!condition) return true;
        printf("         ASSERT_FALSE failed: %s expected FALSE, got TRUE\n", expr);
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_GT: check actual > threshold
     */
    template<typename T, typename U = T>
    bool assert_gt(T actual, U threshold,
                   const char* actual_expr, const char* threshold_expr,
                   int line, const char* msg = "") {
        if (actual > threshold) return true;
        std::string actual_str = to_display_string(actual);
        std::string threshold_str = to_display_string(threshold);
        printf("         ASSERT_GT failed: %s expected > %s, got %s\n",
               actual_expr, threshold_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_LT: check actual < threshold
     */
    template<typename T, typename U = T>
    bool assert_lt(T actual, U threshold,
                   const char* actual_expr, const char* threshold_expr,
                   int line, const char* msg = "") {
        if (actual < threshold) return true;
        std::string actual_str = to_display_string(actual);
        std::string threshold_str = to_display_string(threshold);
        printf("         ASSERT_LT failed: %s expected < %s, got %s\n",
               actual_expr, threshold_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_GE: check actual >= threshold
     */
    template<typename T, typename U = T>
    bool assert_ge(T actual, U threshold,
                   const char* actual_expr, const char* threshold_expr,
                   int line, const char* msg = "") {
        if (actual >= threshold) return true;
        std::string actual_str = to_display_string(actual);
        std::string threshold_str = to_display_string(threshold);
        printf("         ASSERT_GE failed: %s expected >= %s, got %s\n",
               actual_expr, threshold_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_LE: check actual <= threshold
     */
    template<typename T, typename U = T>
    bool assert_le(T actual, U threshold,
                   const char* actual_expr, const char* threshold_expr,
                   int line, const char* msg = "") {
        if (actual <= threshold) return true;
        std::string actual_str = to_display_string(actual);
        std::string threshold_str = to_display_string(threshold);
        printf("         ASSERT_LE failed: %s expected <= %s, got %s\n",
               actual_expr, threshold_str.c_str(), actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
        failures++;
        return false;
    }

    /**
     * ASSERT_NEAR: check |actual - expected| <= tolerance
     */
    template<typename T, typename U = T, typename V = T>
    bool assert_near(T actual, U expected, V tolerance,
                     const char* actual_expr, const char* expected_expr,
                     const char* tolerance_expr,
                     int line, const char* msg = "") {
        if (std::abs(static_cast<double>(actual) - static_cast<double>(expected))
            <= static_cast<double>(tolerance)) return true;
        std::string actual_str = to_display_string(actual);
        std::string expected_str = to_display_string(expected);
        std::string tolerance_str = to_display_string(tolerance);
        printf("         ASSERT_NEAR failed: %s expected %s +/- %s, got %s\n",
               actual_expr, expected_str.c_str(), tolerance_str.c_str(),
               actual_str.c_str());
        printf("         at %s:%d\n", test_file, line);
        print_message(msg);
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
            __CURRENT_TIME_NS = 0;  // Reset scan-cycle time for each test
            try {
                bool result = tc.func(ctx);
                if (result && ctx.failures == 0) {
                    printf("  [PASS] %s\n", tc.name);
                    passed_++;
                } else {
                    printf("  [FAIL] %s\n", tc.name);
                    failed_++;
                }
            } catch (const std::exception& e) {
                printf("  [FAIL] %s (exception: %s)\n", tc.name, e.what());
                failed_++;
            } catch (...) {
                printf("  [FAIL] %s (unknown exception)\n", tc.name);
                failed_++;
            }
        }

        printf("\n-----------------------------------------\n");
        int total = passed_ + failed_;
        printf("%d %s, %d passed, %d failed\n",
               total, total == 1 ? "test" : "tests", passed_, failed_);

        return failed_ > 0 ? 1 : 0;
    }
};

} // namespace strucpp
