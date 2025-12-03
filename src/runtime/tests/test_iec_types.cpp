/**
 * STruC++ Runtime - IEC Types Unit Tests
 */

#include <gtest/gtest.h>
#include "iec_types.hpp"
#include "iec_traits.hpp"

using namespace strucpp;

TEST(IECTypesTest, TypeSizes) {
    EXPECT_EQ(sizeof(BOOL_t), 1);
    EXPECT_EQ(sizeof(BYTE_t), 1);
    EXPECT_EQ(sizeof(WORD_t), 2);
    EXPECT_EQ(sizeof(DWORD_t), 4);
    EXPECT_EQ(sizeof(LWORD_t), 8);
    
    EXPECT_EQ(sizeof(SINT_t), 1);
    EXPECT_EQ(sizeof(INT_t), 2);
    EXPECT_EQ(sizeof(DINT_t), 4);
    EXPECT_EQ(sizeof(LINT_t), 8);
    
    EXPECT_EQ(sizeof(USINT_t), 1);
    EXPECT_EQ(sizeof(UINT_t), 2);
    EXPECT_EQ(sizeof(UDINT_t), 4);
    EXPECT_EQ(sizeof(ULINT_t), 8);
    
    EXPECT_EQ(sizeof(REAL_t), 4);
    EXPECT_EQ(sizeof(LREAL_t), 8);
    
    EXPECT_EQ(sizeof(CHAR_t), 1);
    EXPECT_EQ(sizeof(WCHAR_t), 2);
}

TEST(IECTraitsTest, IsAnyBool) {
    EXPECT_TRUE(is_any_bool_v<BOOL_t>);
    EXPECT_FALSE(is_any_bool_v<INT_t>);
    EXPECT_FALSE(is_any_bool_v<BYTE_t>);
}

TEST(IECTraitsTest, IsAnySInt) {
    EXPECT_TRUE(is_any_sint_v<SINT_t>);
    EXPECT_TRUE(is_any_sint_v<INT_t>);
    EXPECT_TRUE(is_any_sint_v<DINT_t>);
    EXPECT_TRUE(is_any_sint_v<LINT_t>);
    EXPECT_FALSE(is_any_sint_v<USINT_t>);
    EXPECT_FALSE(is_any_sint_v<UINT_t>);
}

TEST(IECTraitsTest, IsAnyUInt) {
    EXPECT_TRUE(is_any_uint_v<USINT_t>);
    EXPECT_TRUE(is_any_uint_v<UINT_t>);
    EXPECT_TRUE(is_any_uint_v<UDINT_t>);
    EXPECT_TRUE(is_any_uint_v<ULINT_t>);
    EXPECT_FALSE(is_any_uint_v<SINT_t>);
    EXPECT_FALSE(is_any_uint_v<INT_t>);
}

TEST(IECTraitsTest, IsAnyInt) {
    EXPECT_TRUE(is_any_int_v<SINT_t>);
    EXPECT_TRUE(is_any_int_v<INT_t>);
    EXPECT_TRUE(is_any_int_v<DINT_t>);
    EXPECT_TRUE(is_any_int_v<LINT_t>);
    EXPECT_TRUE(is_any_int_v<USINT_t>);
    EXPECT_TRUE(is_any_int_v<UINT_t>);
    EXPECT_TRUE(is_any_int_v<UDINT_t>);
    EXPECT_TRUE(is_any_int_v<ULINT_t>);
    EXPECT_FALSE(is_any_int_v<REAL_t>);
    EXPECT_FALSE(is_any_int_v<BOOL_t>);
}

TEST(IECTraitsTest, IsAnyReal) {
    EXPECT_TRUE(is_any_real_v<REAL_t>);
    EXPECT_TRUE(is_any_real_v<LREAL_t>);
    EXPECT_FALSE(is_any_real_v<INT_t>);
    EXPECT_FALSE(is_any_real_v<DINT_t>);
}

TEST(IECTraitsTest, IsAnyNum) {
    EXPECT_TRUE(is_any_num_v<SINT_t>);
    EXPECT_TRUE(is_any_num_v<INT_t>);
    EXPECT_TRUE(is_any_num_v<REAL_t>);
    EXPECT_TRUE(is_any_num_v<LREAL_t>);
    EXPECT_FALSE(is_any_num_v<BOOL_t>);
    // Note: BYTE_t and USINT_t are both uint8_t, so BYTE_t is also ANY_NUM
    // This is a known limitation of type aliasing in C++
    EXPECT_TRUE(is_any_num_v<BYTE_t>);
}

TEST(IECTraitsTest, IsAnyBit) {
    EXPECT_TRUE(is_any_bit_v<BOOL_t>);
    EXPECT_TRUE(is_any_bit_v<BYTE_t>);
    EXPECT_TRUE(is_any_bit_v<WORD_t>);
    EXPECT_TRUE(is_any_bit_v<DWORD_t>);
    EXPECT_TRUE(is_any_bit_v<LWORD_t>);
    EXPECT_FALSE(is_any_bit_v<INT_t>);
    EXPECT_FALSE(is_any_bit_v<REAL_t>);
}

TEST(IECTraitsTest, IsAnyDate) {
    EXPECT_TRUE(is_any_date_v<TIME_t>);
    EXPECT_TRUE(is_any_date_v<DATE_t>);
    EXPECT_TRUE(is_any_date_v<TOD_t>);
    EXPECT_TRUE(is_any_date_v<DT_t>);
    EXPECT_TRUE(is_any_date_v<LTIME_t>);
    EXPECT_TRUE(is_any_date_v<LDATE_t>);
    EXPECT_TRUE(is_any_date_v<LTOD_t>);
    EXPECT_TRUE(is_any_date_v<LDT_t>);
    EXPECT_FALSE(is_any_date_v<INT_t>);
}

TEST(IECTraitsTest, IsAnyString) {
    EXPECT_TRUE(is_any_string_v<CHAR_t>);
    EXPECT_TRUE(is_any_string_v<WCHAR_t>);
    EXPECT_FALSE(is_any_string_v<INT_t>);
    EXPECT_FALSE(is_any_string_v<BYTE_t>);
}

TEST(IECTraitsTest, IsAnyTime) {
    EXPECT_TRUE(is_any_time_v<TIME_t>);
    EXPECT_TRUE(is_any_time_v<LTIME_t>);
    // Note: TIME_t, DATE_t, TOD_t, DT_t, LINT_t are all int64_t, so DATE_t is also ANY_TIME
    // This is a known limitation of type aliasing in C++
    EXPECT_TRUE(is_any_time_v<DATE_t>);
    EXPECT_FALSE(is_any_time_v<INT_t>);
}

TEST(IECTraitsTest, IsAnyMagnitude) {
    EXPECT_TRUE(is_any_magnitude_v<INT_t>);
    EXPECT_TRUE(is_any_magnitude_v<REAL_t>);
    EXPECT_TRUE(is_any_magnitude_v<TIME_t>);
    EXPECT_FALSE(is_any_magnitude_v<BOOL_t>);
    // Note: TIME_t, DATE_t, TOD_t, DT_t, LINT_t are all int64_t, so DATE_t is also ANY_MAGNITUDE
    // This is a known limitation of type aliasing in C++
    EXPECT_TRUE(is_any_magnitude_v<DATE_t>);
}

TEST(IECTraitsTest, BitSize) {
    EXPECT_EQ(iec_bit_size_v<BOOL_t>, 1);
    EXPECT_EQ(iec_bit_size_v<BYTE_t>, 8);
    EXPECT_EQ(iec_bit_size_v<WORD_t>, 16);
    EXPECT_EQ(iec_bit_size_v<DWORD_t>, 32);
    EXPECT_EQ(iec_bit_size_v<LWORD_t>, 64);
    
    EXPECT_EQ(iec_bit_size_v<SINT_t>, 8);
    EXPECT_EQ(iec_bit_size_v<INT_t>, 16);
    EXPECT_EQ(iec_bit_size_v<DINT_t>, 32);
    EXPECT_EQ(iec_bit_size_v<LINT_t>, 64);
    
    EXPECT_EQ(iec_bit_size_v<REAL_t>, 32);
    EXPECT_EQ(iec_bit_size_v<LREAL_t>, 64);
    
    EXPECT_EQ(iec_bit_size_v<CHAR_t>, 8);
    EXPECT_EQ(iec_bit_size_v<WCHAR_t>, 16);
}

TEST(IECTraitsTest, Limits) {
    EXPECT_EQ(iec_limits<SINT_t>::min(), -128);
    EXPECT_EQ(iec_limits<SINT_t>::max(), 127);
    
    EXPECT_EQ(iec_limits<INT_t>::min(), -32768);
    EXPECT_EQ(iec_limits<INT_t>::max(), 32767);
    
    EXPECT_EQ(iec_limits<USINT_t>::min(), 0);
    EXPECT_EQ(iec_limits<USINT_t>::max(), 255);
    
    EXPECT_EQ(iec_limits<UINT_t>::min(), 0);
    EXPECT_EQ(iec_limits<UINT_t>::max(), 65535);
    
    EXPECT_EQ(iec_limits<BYTE_t>::min(), 0);
    EXPECT_EQ(iec_limits<BYTE_t>::max(), 255);
}
