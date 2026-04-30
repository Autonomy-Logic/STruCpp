// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Runtime - Debug Dispatch Unit Tests
 *
 * These tests exercise the per-entry force/unforce/read dispatch over a
 * synthetic Entry table that mimics what STruC++ codegen will emit.
 */

#include <gtest/gtest.h>
#include "debug_dispatch.hpp"
#include "iec_var.hpp"

namespace sd = strucpp::debug;
using namespace strucpp;

// ---------------------------------------------------------------------------
// Synthetic project "variables" + Entry table.
// These stand in for what `generated_debug.cpp` would emit for a real project.
// ---------------------------------------------------------------------------
static IEC_BOOL  t_bool  { false };
static IEC_INT   t_int   { 0 };
static IEC_DINT  t_dint  { 0 };
static IEC_LINT  t_lint  { 0 };
static IEC_REAL  t_real  { 0.0f };
static IEC_LREAL t_lreal { 0.0 };

static const sd::Entry g_arr_0[] = {
    { (void*)&t_bool,  sd::TAG_BOOL,  0 },
    { (void*)&t_int,   sd::TAG_INT,   0 },
    { (void*)&t_dint,  sd::TAG_DINT,  0 },
    { (void*)&t_lint,  sd::TAG_LINT,  0 },
    { (void*)&t_real,  sd::TAG_REAL,  0 },
    { (void*)&t_lreal, sd::TAG_LREAL, 0 },
};

// Definitions for the `extern` declarations in debug_dispatch.hpp.
namespace strucpp { namespace debug {
const Entry* const debug_arrays[]    = { g_arr_0 };
const uint16_t     debug_array_counts[] = { sizeof(g_arr_0) / sizeof(g_arr_0[0]) };
const uint8_t      debug_array_count    = 1;
} }

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
static void reset_vars() {
    t_bool.unforce();  t_bool  = false;
    t_int.unforce();   t_int   = 0;
    t_dint.unforce();  t_dint  = 0;
    t_lint.unforce();  t_lint  = 0;
    t_real.unforce();  t_real  = 0.0f;
    t_lreal.unforce(); t_lreal = 0.0;
}

// ---------------------------------------------------------------------------
// Info queries
// ---------------------------------------------------------------------------
TEST(DebugDispatch, HandleArrayCount) {
    reset_vars();
    EXPECT_EQ(sd::handle_array_count(), 1u);
}

TEST(DebugDispatch, HandleElemCount) {
    reset_vars();
    EXPECT_EQ(sd::handle_elem_count(0), 6u);
    EXPECT_EQ(sd::handle_elem_count(1), 0u);  // out of range
    EXPECT_EQ(sd::handle_elem_count(255), 0u);
}

TEST(DebugDispatch, HandleSize) {
    reset_vars();
    EXPECT_EQ(sd::handle_size(0, 0), sizeof(BOOL_t));
    EXPECT_EQ(sd::handle_size(0, 1), sizeof(INT_t));
    EXPECT_EQ(sd::handle_size(0, 2), sizeof(DINT_t));
    EXPECT_EQ(sd::handle_size(0, 3), sizeof(LINT_t));
    EXPECT_EQ(sd::handle_size(0, 4), sizeof(REAL_t));
    EXPECT_EQ(sd::handle_size(0, 5), sizeof(LREAL_t));
    EXPECT_EQ(sd::handle_size(0, 99), 0u);  // out of range
    EXPECT_EQ(sd::handle_size(5, 0), 0u);   // array out of range
}

// ---------------------------------------------------------------------------
// Read operations — sanity check for each type tag
// ---------------------------------------------------------------------------
TEST(DebugDispatch, ReadBool) {
    reset_vars();
    t_bool = true;
    uint8_t buf[1] = {0};
    EXPECT_EQ(sd::handle_read(0, 0, buf), sizeof(BOOL_t));
    EXPECT_EQ(buf[0], 1);
}

TEST(DebugDispatch, ReadInt) {
    reset_vars();
    t_int = 1234;
    uint8_t buf[2] = {0, 0};
    EXPECT_EQ(sd::handle_read(0, 1, buf), sizeof(INT_t));
    INT_t got;
    std::memcpy(&got, buf, sizeof(got));
    EXPECT_EQ(got, 1234);
}

TEST(DebugDispatch, ReadLint) {
    reset_vars();
    t_lint = 0x123456789ABCLL;
    uint8_t buf[8] = {0};
    EXPECT_EQ(sd::handle_read(0, 3, buf), sizeof(LINT_t));
    LINT_t got;
    std::memcpy(&got, buf, sizeof(got));
    EXPECT_EQ(got, 0x123456789ABCLL);
}

TEST(DebugDispatch, ReadReal) {
    reset_vars();
    t_real = 3.14159f;
    uint8_t buf[4] = {0};
    EXPECT_EQ(sd::handle_read(0, 4, buf), sizeof(REAL_t));
    REAL_t got;
    std::memcpy(&got, buf, sizeof(got));
    EXPECT_FLOAT_EQ(got, 3.14159f);
}

// ---------------------------------------------------------------------------
// Force / unforce round trip
// ---------------------------------------------------------------------------
TEST(DebugDispatch, ForceAndReadReturnsForced) {
    reset_vars();
    INT_t new_val = 9999;
    uint8_t bytes[2];
    std::memcpy(bytes, &new_val, sizeof(new_val));

    EXPECT_EQ(sd::handle_set(0, 1, true, bytes, sizeof(bytes)), sd::STATUS_OK);
    EXPECT_TRUE(t_int.is_forced());

    // PLC logic writing via = is ignored while forced
    t_int = 42;
    EXPECT_TRUE(t_int.is_forced());
    EXPECT_EQ(t_int.get(), 9999);

    // Debug read also reflects the forced value
    uint8_t buf[2] = {0, 0};
    sd::handle_read(0, 1, buf);
    INT_t got;
    std::memcpy(&got, buf, sizeof(got));
    EXPECT_EQ(got, 9999);
}

TEST(DebugDispatch, UnforceRestoresPlcWrites) {
    reset_vars();
    INT_t forced = 42;
    uint8_t bytes[2];
    std::memcpy(bytes, &forced, sizeof(forced));

    sd::handle_set(0, 1, true, bytes, sizeof(bytes));
    EXPECT_TRUE(t_int.is_forced());

    EXPECT_EQ(sd::handle_set(0, 1, false, nullptr, 0), sd::STATUS_OK);
    EXPECT_FALSE(t_int.is_forced());

    t_int = 123;
    EXPECT_EQ(t_int.get(), 123);
}

TEST(DebugDispatch, ForceBool) {
    reset_vars();
    uint8_t bytes[1] = { 1 };
    EXPECT_EQ(sd::handle_set(0, 0, true, bytes, 1), sd::STATUS_OK);
    EXPECT_TRUE(t_bool.is_forced());
    EXPECT_EQ(t_bool.get(), true);

    bytes[0] = 0;
    EXPECT_EQ(sd::handle_set(0, 0, true, bytes, 1), sd::STATUS_OK);
    EXPECT_EQ(t_bool.get(), false);
}

TEST(DebugDispatch, ForceReal) {
    reset_vars();
    REAL_t v = -2.5f;
    uint8_t bytes[4];
    std::memcpy(bytes, &v, sizeof(v));
    EXPECT_EQ(sd::handle_set(0, 4, true, bytes, sizeof(bytes)), sd::STATUS_OK);
    EXPECT_TRUE(t_real.is_forced());
    EXPECT_FLOAT_EQ(t_real.get(), -2.5f);
}

// ---------------------------------------------------------------------------
// Out-of-bounds handling
// ---------------------------------------------------------------------------
TEST(DebugDispatch, ReadOutOfBoundsReturnsZero) {
    reset_vars();
    uint8_t buf[8] = {0};
    EXPECT_EQ(sd::handle_read(0, 99, buf), 0u);
    EXPECT_EQ(sd::handle_read(5, 0, buf), 0u);
}

TEST(DebugDispatch, SetOutOfBoundsReturnsError) {
    reset_vars();
    uint8_t bytes[2] = {0, 0};
    EXPECT_EQ(sd::handle_set(0, 99, true, bytes, 2), sd::STATUS_OUT_OF_BOUNDS);
    EXPECT_EQ(sd::handle_set(5, 0, true, bytes, 2), sd::STATUS_OUT_OF_BOUNDS);
}

TEST(DebugDispatch, SetWithInsufficientDataReturnsError) {
    reset_vars();
    uint8_t bytes[1] = {0};  // need 2 for INT
    EXPECT_EQ(sd::handle_set(0, 1, true, bytes, 1), sd::STATUS_DATA_TOO_LARGE);
}
