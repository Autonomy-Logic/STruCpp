// SPDX-License-Identifier: GPL-3.0-or-later WITH STruCpp-runtime-exception
// Copyright (C) 2025 Autonomy / OpenPLC Project
/**
 * STruC++ Runtime - Standard Library Unit Tests
 */

#include <gtest/gtest.h>
#include <cmath>
#include "iec_std_lib.hpp"
#include "iec_time.hpp"
#include "iec_date.hpp"
#include "iec_tod.hpp"
#include "iec_dt.hpp"
#include "iec_string.hpp"
#include "iec_wstring.hpp"
#include "iec_char.hpp"

using namespace strucpp;

TEST(StdLibTest, NumericFunctions) {
    IEC_INT negVal(-10);
    IEC_INT posVal(10);
    EXPECT_EQ(ABS(negVal).get(), 10);
    EXPECT_EQ(ABS(posVal).get(), 10);
    
    IEC_REAL realVal(-3.14f);
    EXPECT_FLOAT_EQ(ABS(realVal).get(), 3.14f);
    
    IEC_LREAL sqrtVal4(4.0);
    IEC_LREAL sqrtVal9(9.0);
    EXPECT_NEAR(SQRT(sqrtVal4).get(), 2.0, 0.0001);
    EXPECT_NEAR(SQRT(sqrtVal9).get(), 3.0, 0.0001);
    
    IEC_LREAL expVal(std::exp(1.0));
    IEC_LREAL val100(100.0);
    IEC_LREAL val1(1.0);
    EXPECT_NEAR(LN(expVal).get(), 1.0, 0.0001);
    EXPECT_NEAR(LOG(val100).get(), 2.0, 0.0001);
    EXPECT_NEAR(EXP(val1).get(), std::exp(1.0), 0.0001);
}

TEST(StdLibTest, TrigFunctions) {
    IEC_LREAL zero(0.0);
    IEC_LREAL one(1.0);
    EXPECT_NEAR(SIN(zero).get(), 0.0, 0.0001);
    EXPECT_NEAR(COS(zero).get(), 1.0, 0.0001);
    EXPECT_NEAR(TAN(zero).get(), 0.0, 0.0001);
    
    EXPECT_NEAR(ASIN(zero).get(), 0.0, 0.0001);
    EXPECT_NEAR(ACOS(one).get(), 0.0, 0.0001);
    EXPECT_NEAR(ATAN(zero).get(), 0.0, 0.0001);
}

TEST(StdLibTest, SelectionFunctions) {
    IEC_INT val10(10);
    IEC_INT val20(20);
    IEC_INT val30(30);
    IEC_INT val0(0);
    IEC_INT val5(5);
    IEC_INT valNeg5(-5);
    IEC_INT val15(15);
    IEC_BOOL boolFalse(false);
    IEC_BOOL boolTrue(true);
    
    EXPECT_EQ(SEL(boolFalse, val10, val20).get(), 10);
    EXPECT_EQ(SEL(boolTrue, val10, val20).get(), 20);
    
    EXPECT_EQ(MAX(val10, val20).get(), 20);
    EXPECT_EQ(MAX(val30, val20).get(), 30);
    
    EXPECT_EQ(MIN(val10, val20).get(), 10);
    EXPECT_EQ(MIN(val30, val20).get(), 20);
    
    EXPECT_EQ(LIMIT(val0, val5, val10).get(), 5);
    EXPECT_EQ(LIMIT(val0, valNeg5, val10).get(), 0);
    EXPECT_EQ(LIMIT(val0, val15, val10).get(), 10);
}

TEST(StdLibTest, ComparisonFunctions) {
    IEC_INT val10(10);
    IEC_INT val20(20);
    IEC_INT val10b(10);
    
    EXPECT_TRUE(GT(val20, val10).get());
    EXPECT_FALSE(GT(val10, val20).get());
    
    EXPECT_TRUE(GE(val20, val10).get());
    EXPECT_TRUE(GE(val10, val10b).get());
    EXPECT_FALSE(GE(val10, val20).get());
    
    EXPECT_TRUE(EQ(val10, val10b).get());
    EXPECT_FALSE(EQ(val10, val20).get());
    
    EXPECT_TRUE(LE(val10, val20).get());
    EXPECT_TRUE(LE(val10, val10b).get());
    EXPECT_FALSE(LE(val20, val10).get());
    
    EXPECT_TRUE(LT(val10, val20).get());
    EXPECT_FALSE(LT(val20, val10).get());
    
    EXPECT_TRUE(NE(val10, val20).get());
    EXPECT_FALSE(NE(val10, val10b).get());
}

TEST(StdLibTest, BitShiftFunctions) {
    IEC_BYTE val1(0b00001111);
    IEC_BYTE val2(0b11110000);
    IEC_BYTE val3(0b10000001);
    IEC_INT shift2(2);
    IEC_INT shift1(1);
    
    EXPECT_EQ(SHL(val1, shift2).get(), 0b00111100);
    EXPECT_EQ(SHR(val2, shift2).get(), 0b00111100);
    
    EXPECT_EQ(ROL(val3, shift1).get(), 0b00000011);
    EXPECT_EQ(ROR(val3, shift1).get(), 0b11000000);
}

TEST(StdLibTest, TypeConversions) {
    IEC_INT val100(100);
    IEC_INT val1000(1000);
    IEC_DINT val100000(100000);
    IEC_INT val1(1);
    IEC_INT val0(0);
    IEC_INT val42(42);
    
    EXPECT_EQ(TO_SINT(val100).get(), static_cast<SINT_t>(100));
    EXPECT_EQ(TO_INT(val1000).get(), static_cast<INT_t>(1000));
    EXPECT_EQ(TO_DINT(val100000).get(), static_cast<DINT_t>(100000));
    
    EXPECT_TRUE(TO_BOOL(val1).get());
    EXPECT_FALSE(TO_BOOL(val0).get());
    
    EXPECT_FLOAT_EQ(TO_REAL(val42).get(), 42.0f);
    EXPECT_DOUBLE_EQ(TO_LREAL(val42).get(), 42.0);
}

// =============================================================================
// IEC TIME / DATE / TOD / DT standard-library tests
// =============================================================================
//
// These exercise the IECVar-based surface (the only one codegen emits), so
// passing here means generated POU code that calls `ADD_TIME` etc. will
// link.  Time literals in IEC code lower to raw `int64_t` nanoseconds; we
// mirror that by constructing IEC_TIME directly from a literal `LL` count
// (no separate value-class helper).

TEST(TimeTest, Arithmetic) {
    IEC_TIME t1(10LL * NS_PER_S);
    IEC_TIME t2(5LL * NS_PER_S);

    EXPECT_EQ(TIME_TO_S(ADD_TIME(t1, t2)), 15);
    EXPECT_EQ(TIME_TO_S(SUB_TIME(t1, t2)), 5);
    EXPECT_EQ(TIME_TO_S(MUL_TIME(t1, 2)), 20);
    EXPECT_EQ(TIME_TO_S(DIV_TIME(t1, 2)), 5);
    EXPECT_EQ(DIVTIME(t1, t2), 2);
    EXPECT_EQ(TIME_TO_S(ABS_TIME(IEC_TIME(-5LL * NS_PER_S))), 5);
}

TEST(TimeTest, Comparison) {
    IEC_TIME t1(10LL * NS_PER_S);
    IEC_TIME t2(5LL * NS_PER_S);
    IEC_TIME t3(10LL * NS_PER_S);

    EXPECT_TRUE(GT_TIME(t1, t2));
    EXPECT_TRUE(LT_TIME(t2, t1));
    EXPECT_TRUE(EQ_TIME(t1, t3));
    EXPECT_TRUE(GE_TIME(t1, t3));
    EXPECT_TRUE(LE_TIME(t1, t3));
    EXPECT_TRUE(NE_TIME(t1, t2));
}

TEST(TimeTest, UnitConversion) {
    IEC_TIME t(static_cast<TIME_t>(NS_PER_D + 2 * NS_PER_H + 30 * NS_PER_M + 45 * NS_PER_S + 500 * NS_PER_MS));
    EXPECT_EQ(TIME_TO_D(t), 1);
    EXPECT_EQ(TIME_TO_H(t), 26);
    EXPECT_EQ(TIME_TO_M(t), 26 * 60 + 30);
    EXPECT_EQ(TIME_TO_S(t), 26LL * 3600LL + 30 * 60 + 45);
}

TEST(DateTest, Construction) {
    IEC_DATE d = DATE_FROM_YMD(2024, 6, 15);
    // 2024-06-15 is 19888 days since 1970-01-01.
    EXPECT_EQ(DATE_TO_DAYS(d), 19888);
}

TEST(DateTest, Arithmetic) {
    IEC_DATE d1 = DATE_FROM_YMD(2024, 6, 15);
    IEC_DATE d2 = ADD_DATE(d1, 10);
    EXPECT_EQ(DATE_TO_DAYS(d2), DATE_TO_DAYS(d1) + 10);
    EXPECT_EQ(DATE_TO_DAYS(SUB_DATE(d1, 1)), DATE_TO_DAYS(d1) - 1);

    IEC_DATE d3 = DATE_FROM_YMD(2024, 6, 20);
    EXPECT_EQ(DIFF_DATE(d3, d1), 5);
}

TEST(DateTest, Comparison) {
    IEC_DATE early = DATE_FROM_YMD(2024, 1, 1);
    IEC_DATE late = DATE_FROM_YMD(2024, 12, 31);

    EXPECT_TRUE(LT_DATE(early, late));
    EXPECT_TRUE(GT_DATE(late, early));
    EXPECT_TRUE(EQ_DATE(early, DATE_FROM_YMD(2024, 1, 1)));
    EXPECT_TRUE(NE_DATE(early, late));
}

TEST(TodTest, Construction) {
    // 14:30:45 → 14*3600 + 30*60 + 45 = 52245 seconds = 52245 * 10^9 ns.
    IEC_TOD tod = TOD_FROM_HMS(14, 30, 45);
    EXPECT_EQ(TOD_TO_NS(tod), 52245LL * 1000000000LL);
}

TEST(TodTest, ArithmeticNormalises) {
    IEC_TOD ten_am = TOD_FROM_HMS(10, 0, 0);
    // +5h crosses noon but not midnight.
    IEC_TOD plus5h = ADD_TOD(ten_am, 5LL * 3600LL * 1000000000LL);
    EXPECT_EQ(TOD_TO_NS(plus5h), 15LL * 3600LL * 1000000000LL);

    // +20h wraps past midnight: 10am + 20h = 6am next day → normalised to 6am.
    IEC_TOD next_morning = ADD_TOD(ten_am, 20LL * 3600LL * 1000000000LL);
    EXPECT_EQ(TOD_TO_NS(next_morning), 6LL * 3600LL * 1000000000LL);
}

TEST(TodTest, Comparison) {
    IEC_TOD tod1 = TOD_FROM_HMS(10, 0, 0);
    IEC_TOD tod2 = TOD_FROM_HMS(14, 0, 0);

    EXPECT_TRUE(LT_TOD(tod1, tod2));
    EXPECT_TRUE(GT_TOD(tod2, tod1));
}

TEST(DtTest, Construction) {
    IEC_DT dt = DT_FROM_COMPONENTS(2024, 6, 15, 14, 30, 45);
    // 2024-06-15 14:30:45 UTC = days_to_epoch * 86400 + 14*3600 + 30*60 + 45 seconds.
    const int64_t expected_seconds = 19888LL * 86400LL + 14LL * 3600LL + 30LL * 60LL + 45LL;
    EXPECT_EQ(DT_TO_SECONDS(dt), expected_seconds);
    EXPECT_EQ(DT_TO_NS(dt), expected_seconds * 1000000000LL);
}

TEST(DtTest, DateAndTodRoundTrip) {
    IEC_DT dt = DT_FROM_COMPONENTS(2024, 6, 15, 14, 30, 45);
    IEC_DATE date = DATE_OF_DT(dt);
    IEC_TOD tod = TOD_OF_DT(dt);

    EXPECT_TRUE(EQ_DATE(date, DATE_FROM_YMD(2024, 6, 15)));
    EXPECT_EQ(TOD_TO_NS(tod), TOD_TO_NS(TOD_FROM_HMS(14, 30, 45)));

    // CONCAT_DATE_TOD rebuilds the original DT from the split parts.
    IEC_DT rebuilt = CONCAT_DATE_TOD(date, tod);
    EXPECT_TRUE(EQ_DT(rebuilt, dt));
}

TEST(DtTest, Arithmetic) {
    IEC_DT base = DT_FROM_COMPONENTS(2024, 6, 15, 14, 30, 45);
    const int64_t one_minute_ns = 60LL * 1000000000LL;
    IEC_DT later = ADD_DT(base, one_minute_ns);
    EXPECT_EQ(DIFF_DT(later, base), one_minute_ns);
    EXPECT_TRUE(EQ_DT(SUB_DT(later, one_minute_ns), base));
}

TEST(StringTest, Construction) {
    STRING s1;
    EXPECT_EQ(s1.length(), 0);
    EXPECT_TRUE(s1.empty());
    
    STRING s2("Hello");
    EXPECT_EQ(s2.length(), 5);
    EXPECT_STREQ(s2.c_str(), "Hello");
}

TEST(StringTest, Assignment) {
    STRING s;
    s = "World";
    EXPECT_STREQ(s.c_str(), "World");
}

TEST(StringTest, Concatenation) {
    STRING s1("Hello");
    STRING s2(" World");
    STRING s3 = s1 + s2;
    EXPECT_STREQ(s3.c_str(), "Hello World");
    
    s1 += s2;
    EXPECT_STREQ(s1.c_str(), "Hello World");
}

TEST(StringTest, Comparison) {
    STRING s1("ABC");
    STRING s2("ABC");
    STRING s3("DEF");
    
    EXPECT_TRUE(s1 == s2);
    EXPECT_TRUE(s1 != s3);
    EXPECT_TRUE(s1 < s3);
    EXPECT_TRUE(s3 > s1);
}

TEST(StringTest, Substring) {
    STRING s("Hello World");
    
    auto left = LEFT(s, 5);
    EXPECT_STREQ(left.c_str(), "Hello");
    
    auto right = RIGHT(s, 5);
    EXPECT_STREQ(right.c_str(), "World");
    
    auto mid = MID(s, 7, 5);
    EXPECT_STREQ(mid.c_str(), "World");
}

TEST(StringTest, Find) {
    STRING s("Hello World");
    STRING needle("World");
    
    EXPECT_EQ(FIND(s, needle), 7);
    
    STRING notFound("XYZ");
    EXPECT_EQ(FIND(s, notFound), 0);
}

TEST(StringTest, Length) {
    STRING s("Hello");
    EXPECT_EQ(LEN(s), 5);
}

TEST(WStringTest, Construction) {
    WSTRING ws1;
    EXPECT_EQ(ws1.length(), 0);
    
    WSTRING ws2(u"Hello");
    EXPECT_EQ(ws2.length(), 5);
}

TEST(WStringTest, Comparison) {
    WSTRING ws1(u"ABC");
    WSTRING ws2(u"ABC");
    WSTRING ws3(u"DEF");
    
    EXPECT_TRUE(ws1 == ws2);
    EXPECT_TRUE(ws1 != ws3);
    EXPECT_TRUE(ws1 < ws3);
}

TEST(CharTest, CharFunctions) {
    EXPECT_TRUE(IS_ALPHA('A'));
    EXPECT_TRUE(IS_ALPHA('z'));
    EXPECT_FALSE(IS_ALPHA('1'));
    
    EXPECT_TRUE(IS_DIGIT('5'));
    EXPECT_FALSE(IS_DIGIT('A'));
    
    EXPECT_TRUE(IS_ALNUM('A'));
    EXPECT_TRUE(IS_ALNUM('5'));
    EXPECT_FALSE(IS_ALNUM(' '));
    
    EXPECT_TRUE(IS_SPACE(' '));
    EXPECT_TRUE(IS_SPACE('\t'));
    EXPECT_FALSE(IS_SPACE('A'));
    
    EXPECT_EQ(TO_UPPER('a'), 'A');
    EXPECT_EQ(TO_LOWER('A'), 'a');
}

TEST(CharTest, Conversions) {
    EXPECT_EQ(CHAR_TO_INT('A'), 65);
    EXPECT_EQ(CHAR_FROM_INT(65), 'A');
    
    EXPECT_EQ(CHAR_TO_WCHAR('A'), u'A');
    EXPECT_EQ(WCHAR_TO_CHAR(u'A'), 'A');
}

TEST(TimeVarTest, Forcing) {
    // IEC_TIME is just `IECVar<TIME_t>`, so debugger forcing works the
    // same way it does for any other elementary type — no per-type
    // wrapper.  This pins that the IECVar surface is enough.
    IEC_TIME tv(10LL * NS_PER_S);
    EXPECT_EQ(TIME_TO_S(tv), 10);

    tv.force(99LL * NS_PER_S);
    EXPECT_TRUE(tv.is_forced());
    EXPECT_EQ(TIME_TO_S(tv), 99);

    tv.set(20LL * NS_PER_S);
    EXPECT_EQ(TIME_TO_S(tv), 99);  // forced value still wins
    EXPECT_EQ(tv.get_underlying() / NS_PER_S, 20);

    tv.unforce();
    EXPECT_EQ(TIME_TO_S(tv), 20);
}

TEST(StringVarTest, Forcing) {
    STRING_VAR sv("Hello");
    EXPECT_STREQ(sv.get().c_str(), "Hello");
    
    sv.force("Forced");
    EXPECT_TRUE(sv.is_forced());
    EXPECT_STREQ(sv.get().c_str(), "Forced");
    
    sv.set("World");
    EXPECT_STREQ(sv.get().c_str(), "Forced");
    EXPECT_STREQ(sv.get_underlying().c_str(), "World");
    
    sv.unforce();
    EXPECT_STREQ(sv.get().c_str(), "World");
}
