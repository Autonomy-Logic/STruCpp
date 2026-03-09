// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
// This file is part of the STruC++ Runtime Library and is covered by the
// STruC++ Runtime Library Exception. See COPYING.RUNTIME for details.
/**
 * STruC++ Test Runtime
 *
 * Header-only C++ test runtime for the STruC++ testing framework.
 * Provides TestContext (assertion methods), TestRunner (orchestration),
 * and value-to-string formatting for failure messages.
 *
 * Supports two output modes:
 * - Text (default): human-readable [PASS]/[FAIL] output for CLI
 * - JSON (--json flag): machine-readable JSON for IDE integration
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
template<typename T, typename std::enable_if<!std::is_enum<T>::value, int>::type = 0>
inline std::string to_display_string(const T& value) {
    std::ostringstream oss;
    oss << value;
    return oss.str();
}

// Enum class specialization: display underlying integer value
template<typename T, typename std::enable_if<std::is_enum<T>::value, int>::type = 0>
inline std::string to_display_string(const T& value) {
    return std::to_string(static_cast<typename std::underlying_type<T>::type>(value));
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
// JSON helpers (no external library — simple char-by-char escaping)
// ============================================================================

/**
 * Escape a string for safe inclusion in a JSON string value.
 */
inline std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
                    out += buf;
                } else {
                    out += c;
                }
                break;
        }
    }
    return out;
}

// ============================================================================
// FailureRecord — stores assertion failure details for JSON output
// ============================================================================

struct FailureRecord {
    std::string assert_type;   // "ASSERT_EQ", "ASSERT_TRUE", etc.
    std::string detail;        // Human-readable description
    std::string file;          // Source file
    int line = 0;              // Line number
    std::string message;       // Optional user message
    std::string expected;      // For ASSERT_EQ/NEQ: expected value
    std::string actual;        // For ASSERT_EQ/NEQ: actual value
};

// ============================================================================
// TestContext
// ============================================================================

/**
 * Per-test context that tracks assertion results and provides assert methods.
 * All assert methods support an optional custom message (nullptr if not provided).
 *
 * In JSON mode, failures are collected into failure_records instead of printed.
 */
struct TestContext {
    const char* test_file = "";
    int failures = 0;
    bool json_mode = false;
    std::vector<FailureRecord> failure_records;

    /**
     * Print optional custom message if provided (text mode only).
     */
    void print_message(const char* msg) {
        if (msg && msg[0] != '\0') {
            printf("         Message: %s\n", msg);
        }
    }

    /**
     * Record a failure. In text mode, prints to stdout. In JSON mode, appends to failure_records.
     */
    void record_failure(const char* assert_type, const std::string& detail,
                        int line, const char* msg,
                        const std::string& expected = "", const std::string& actual = "") {
        if (json_mode) {
            FailureRecord rec;
            rec.assert_type = assert_type;
            rec.detail = detail;
            rec.file = test_file;
            rec.line = line;
            if (msg && msg[0] != '\0') rec.message = msg;
            rec.expected = expected;
            rec.actual = actual;
            failure_records.push_back(std::move(rec));
        } else {
            printf("         %s failed: %s\n", assert_type, detail.c_str());
            printf("         at %s:%d\n", test_file, line);
            print_message(msg);
        }
        failures++;
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
        std::string detail = std::string(actual_expr) + " expected " + expected_str + ", got " + actual_str;
        record_failure("ASSERT_EQ", detail, line, msg, expected_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " expected " + expected_str + ", got " + actual_str;
        record_failure("ASSERT_EQ", detail, line, msg, expected_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " should not equal " + actual_str;
        record_failure("ASSERT_NEQ", detail, line, msg, actual_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " should not equal " + actual_str;
        record_failure("ASSERT_NEQ", detail, line, msg, actual_str, actual_str);
        return false;
    }

    /**
     * ASSERT_TRUE: check condition is true
     */
    bool assert_true(bool condition, const char* expr, int line,
                     const char* msg = "") {
        if (condition) return true;
        std::string detail = std::string(expr) + " expected TRUE, got FALSE";
        record_failure("ASSERT_TRUE", detail, line, msg);
        return false;
    }

    /**
     * ASSERT_FALSE: check condition is false
     */
    bool assert_false(bool condition, const char* expr, int line,
                      const char* msg = "") {
        if (!condition) return true;
        std::string detail = std::string(expr) + " expected FALSE, got TRUE";
        record_failure("ASSERT_FALSE", detail, line, msg);
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
        std::string detail = std::string(actual_expr) + " expected > " + threshold_str + ", got " + actual_str;
        record_failure("ASSERT_GT", detail, line, msg, threshold_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " expected < " + threshold_str + ", got " + actual_str;
        record_failure("ASSERT_LT", detail, line, msg, threshold_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " expected >= " + threshold_str + ", got " + actual_str;
        record_failure("ASSERT_GE", detail, line, msg, threshold_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " expected <= " + threshold_str + ", got " + actual_str;
        record_failure("ASSERT_LE", detail, line, msg, threshold_str, actual_str);
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
        std::string detail = std::string(actual_expr) + " expected " + expected_str +
                             " +/- " + tolerance_str + ", got " + actual_str;
        record_failure("ASSERT_NEAR", detail, line, msg, expected_str, actual_str);
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
 * Per-test result used by JSON output mode.
 */
struct TestCaseResult {
    const char* name;
    bool passed;
    std::string exception_msg;           // Non-empty if test threw an exception
    std::vector<FailureRecord> failures; // Assertion failures (from TestContext)
};

/**
 * Test runner that orchestrates test execution and reports results.
 * Supports text (default) and JSON (--json) output modes.
 */
class TestRunner {
    const char* test_file_;
    std::vector<TestCaseEntry> tests_;
    int passed_ = 0;
    int failed_ = 0;
    bool json_mode_ = false;

public:
    explicit TestRunner(const char* test_file) : test_file_(test_file) {}

    void set_json_mode(bool enabled) { json_mode_ = enabled; }

    void add(const char* name, TestFunc func) {
        tests_.push_back({name, std::move(func)});
    }

    int run() {
        if (json_mode_) {
            return run_json();
        }
        return run_text();
    }

private:
    int run_text() {
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

    int run_json() {
        std::vector<TestCaseResult> results;

        for (auto& tc : tests_) {
            TestContext ctx;
            ctx.test_file = test_file_;
            ctx.json_mode = true;
            __CURRENT_TIME_NS = 0;

            TestCaseResult result;
            result.name = tc.name;
            result.passed = false;

            try {
                bool ok = tc.func(ctx);
                result.passed = ok && ctx.failures == 0;
                result.failures = std::move(ctx.failure_records);
            } catch (const std::exception& e) {
                result.exception_msg = e.what();
            } catch (...) {
                result.exception_msg = "unknown exception";
            }

            if (result.passed) passed_++;
            else failed_++;
            results.push_back(std::move(result));
        }

        // Serialize to JSON using printf (no JSON library)
        int total = passed_ + failed_;
        printf("{\"version\":1,\"file\":\"%s\",\"results\":[",
               json_escape(test_file_).c_str());

        for (size_t i = 0; i < results.size(); i++) {
            if (i > 0) printf(",");
            const auto& r = results[i];
            printf("{\"name\":\"%s\",\"passed\":%s",
                   json_escape(r.name).c_str(),
                   r.passed ? "true" : "false");

            if (!r.passed) {
                // Emit first failure (most relevant for IDE) or exception
                if (!r.exception_msg.empty()) {
                    printf(",\"failure\":{\"assertType\":\"EXCEPTION\","
                           "\"detail\":\"%s\","
                           "\"file\":\"%s\",\"line\":0}",
                           json_escape(r.exception_msg).c_str(),
                           json_escape(test_file_).c_str());
                } else if (!r.failures.empty()) {
                    const auto& f = r.failures[0];
                    printf(",\"failure\":{\"assertType\":\"%s\","
                           "\"detail\":\"%s\","
                           "\"file\":\"%s\",\"line\":%d",
                           json_escape(f.assert_type).c_str(),
                           json_escape(f.detail).c_str(),
                           json_escape(f.file).c_str(),
                           f.line);
                    if (!f.message.empty()) {
                        printf(",\"message\":\"%s\"",
                               json_escape(f.message).c_str());
                    }
                    if (!f.expected.empty() || !f.actual.empty()) {
                        printf(",\"expected\":\"%s\",\"actual\":\"%s\"",
                               json_escape(f.expected).c_str(),
                               json_escape(f.actual).c_str());
                    }
                    printf("}");
                }
            }
            printf("}");
        }

        printf("],\"summary\":{\"total\":%d,\"passed\":%d,\"failed\":%d}}",
               total, passed_, failed_);

        return failed_ > 0 ? 1 : 0;
    }
};

} // namespace strucpp
