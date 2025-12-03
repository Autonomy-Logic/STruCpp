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

TEST(TimeValueTest, Construction) {
    IEC_TIME_Value t1;
    EXPECT_EQ(t1.to_nanoseconds(), 0);
    
    IEC_TIME_Value t2 = MAKE_TIME_MS(1000);
    EXPECT_EQ(t2.to_milliseconds(), 1000);
    
    IEC_TIME_Value t3 = MAKE_TIME_S(5);
    EXPECT_EQ(t3.to_seconds(), 5);
}

TEST(TimeValueTest, Components) {
    auto t = IEC_TIME_Value::from_components(1, 2, 30, 45, 500);
    EXPECT_EQ(t.days_component(), 1);
    EXPECT_EQ(t.hours_component(), 2);
    EXPECT_EQ(t.minutes_component(), 30);
    EXPECT_EQ(t.seconds_component(), 45);
    EXPECT_EQ(t.milliseconds_component(), 500);
}

TEST(TimeValueTest, Arithmetic) {
    auto t1 = MAKE_TIME_S(10);
    auto t2 = MAKE_TIME_S(5);
    
    EXPECT_EQ((t1 + t2).to_seconds(), 15);
    EXPECT_EQ((t1 - t2).to_seconds(), 5);
    EXPECT_EQ((t1 * 2).to_seconds(), 20);
    EXPECT_EQ((t1 / 2).to_seconds(), 5);
}

TEST(TimeValueTest, Comparison) {
    auto t1 = MAKE_TIME_S(10);
    auto t2 = MAKE_TIME_S(5);
    auto t3 = MAKE_TIME_S(10);
    
    EXPECT_TRUE(t1 > t2);
    EXPECT_TRUE(t2 < t1);
    EXPECT_TRUE(t1 == t3);
    EXPECT_TRUE(t1 >= t3);
    EXPECT_TRUE(t1 <= t3);
    EXPECT_TRUE(t1 != t2);
}

TEST(DateValueTest, Construction) {
    auto d = DATE_FROM_YMD(2024, 6, 15);
    EXPECT_EQ(d.year(), 2024);
    EXPECT_EQ(d.month(), 6);
    EXPECT_EQ(d.day(), 15);
}

TEST(DateValueTest, Arithmetic) {
    auto d1 = DATE_FROM_YMD(2024, 6, 15);
    auto d2 = d1 + static_cast<int64_t>(10);
    EXPECT_EQ(d2.day(), 25);
    
    auto d3 = DATE_FROM_YMD(2024, 6, 20);
    EXPECT_EQ(d3 - d1, 5);
}

TEST(DateValueTest, DayOfWeek) {
    auto d = DATE_FROM_YMD(2024, 1, 1);
    int dow = d.day_of_week();
    EXPECT_GE(dow, 0);
    EXPECT_LE(dow, 6);
}

TEST(TodValueTest, Construction) {
    auto tod = TOD_FROM_HMS(14, 30, 45);
    EXPECT_EQ(tod.hour(), 14);
    EXPECT_EQ(tod.minute(), 30);
    EXPECT_EQ(tod.second(), 45);
}

TEST(TodValueTest, Comparison) {
    auto tod1 = TOD_FROM_HMS(10, 0, 0);
    auto tod2 = TOD_FROM_HMS(14, 0, 0);
    
    EXPECT_TRUE(tod1 < tod2);
    EXPECT_TRUE(tod2 > tod1);
}

TEST(DtValueTest, Construction) {
    auto dt = DT_FROM_COMPONENTS(2024, 6, 15, 14, 30, 45);
    EXPECT_EQ(dt.year(), 2024);
    EXPECT_EQ(dt.month(), 6);
    EXPECT_EQ(dt.day(), 15);
    EXPECT_EQ(dt.hour(), 14);
    EXPECT_EQ(dt.minute(), 30);
    EXPECT_EQ(dt.second(), 45);
}

TEST(DtValueTest, DateAndTod) {
    auto dt = DT_FROM_COMPONENTS(2024, 6, 15, 14, 30, 45);
    auto date = dt.date();
    auto tod = dt.time_of_day();
    
    EXPECT_EQ(date.year(), 2024);
    EXPECT_EQ(tod.hour(), 14);
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
    IEC_TIME_Var tv(MAKE_TIME_S(10));
    EXPECT_EQ(tv.get().to_seconds(), 10);
    
    tv.force(MAKE_TIME_S(99));
    EXPECT_TRUE(tv.is_forced());
    EXPECT_EQ(tv.get().to_seconds(), 99);
    
    tv.set(MAKE_TIME_S(20));
    EXPECT_EQ(tv.get().to_seconds(), 99);
    EXPECT_EQ(tv.get_underlying().to_seconds(), 20);
    
    tv.unforce();
    EXPECT_EQ(tv.get().to_seconds(), 20);
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
