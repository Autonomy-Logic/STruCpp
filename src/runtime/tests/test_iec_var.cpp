/**
 * STruC++ Runtime - IEC Variable Wrapper Unit Tests
 */

#include <gtest/gtest.h>
#include "iec_var.hpp"
#include "iec_traits.hpp"

using namespace strucpp;

TEST(IECVarTest, DefaultConstruction) {
    IEC_INT var;
    EXPECT_EQ(var.get(), 0);
    EXPECT_FALSE(var.is_forced());
}

TEST(IECVarTest, ValueConstruction) {
    IEC_INT var(42);
    EXPECT_EQ(var.get(), 42);
    EXPECT_FALSE(var.is_forced());
}

TEST(IECVarTest, SetAndGet) {
    IEC_INT var;
    var.set(100);
    EXPECT_EQ(var.get(), 100);
    
    var = 200;
    EXPECT_EQ(var.get(), 200);
}

TEST(IECVarTest, ImplicitConversion) {
    IEC_INT var(42);
    INT_t value = var;
    EXPECT_EQ(value, 42);
}

TEST(IECVarTest, Forcing) {
    IEC_INT var(10);
    EXPECT_EQ(var.get(), 10);
    EXPECT_FALSE(var.is_forced());
    
    var.force(99);
    EXPECT_TRUE(var.is_forced());
    EXPECT_EQ(var.get(), 99);
    EXPECT_EQ(var.get_underlying(), 10);
    EXPECT_EQ(var.get_forced_value(), 99);
    
    var.set(20);
    EXPECT_EQ(var.get(), 99);
    EXPECT_EQ(var.get_underlying(), 20);
    
    var.unforce();
    EXPECT_FALSE(var.is_forced());
    EXPECT_EQ(var.get(), 20);
}

TEST(IECVarTest, ArithmeticOperators) {
    IEC_INT a(10);
    IEC_INT b(3);
    
    EXPECT_EQ(a + b, 13);
    EXPECT_EQ(a - b, 7);
    EXPECT_EQ(a * b, 30);
    EXPECT_EQ(a / b, 3);
    EXPECT_EQ(a % b, 1);
}

TEST(IECVarTest, CompoundAssignment) {
    IEC_INT var(10);
    
    var += 5;
    EXPECT_EQ(var.get(), 15);
    
    var -= 3;
    EXPECT_EQ(var.get(), 12);
    
    var *= 2;
    EXPECT_EQ(var.get(), 24);
    
    var /= 4;
    EXPECT_EQ(var.get(), 6);
    
    var %= 4;
    EXPECT_EQ(var.get(), 2);
}

TEST(IECVarTest, ComparisonOperators) {
    IEC_INT a(10);
    IEC_INT b(20);
    IEC_INT c(10);
    
    EXPECT_TRUE(a == c);
    EXPECT_TRUE(a != b);
    EXPECT_TRUE(a < b);
    EXPECT_TRUE(a <= b);
    EXPECT_TRUE(a <= c);
    EXPECT_TRUE(b > a);
    EXPECT_TRUE(b >= a);
    EXPECT_TRUE(a >= c);
}

TEST(IECVarTest, BitwiseOperators) {
    IEC_BYTE a(0b11110000);
    IEC_BYTE b(0b10101010);
    
    EXPECT_EQ((a & b).get(), 0b10100000);
    EXPECT_EQ((a | b).get(), 0b11111010);
    EXPECT_EQ((a ^ b).get(), 0b01011010);
    EXPECT_EQ((~a).get(), static_cast<BYTE_t>(0b00001111));
}

TEST(IECVarTest, BitwiseCompoundAssignment) {
    IEC_BYTE var(0b11110000);
    
    var &= 0b10101010;
    EXPECT_EQ(var.get(), 0b10100000);
    
    var |= 0b00001111;
    EXPECT_EQ(var.get(), 0b10101111);
    
    var ^= 0b11111111;
    EXPECT_EQ(var.get(), 0b01010000);
}

TEST(IECVarTest, UnaryOperators) {
    IEC_INT var(10);
    EXPECT_EQ(+var, 10);
    EXPECT_EQ(-var, -10);
    
    IEC_BOOL boolVar(true);
    EXPECT_FALSE(!boolVar);
    
    IEC_BOOL boolVar2(false);
    EXPECT_TRUE(!boolVar2);
}

TEST(IECVarTest, IncrementDecrement) {
    IEC_INT var(10);
    
    EXPECT_EQ(++var, 11);
    EXPECT_EQ(var.get(), 11);
    
    EXPECT_EQ(var++, 11);
    EXPECT_EQ(var.get(), 12);
    
    EXPECT_EQ(--var, 11);
    EXPECT_EQ(var.get(), 11);
    
    EXPECT_EQ(var--, 11);
    EXPECT_EQ(var.get(), 10);
}

TEST(IECVarTest, ForcingWithArithmetic) {
    IEC_INT var(10);
    var.force(50);
    
    var += 5;
    EXPECT_EQ(var.get(), 50);
    EXPECT_EQ(var.get_underlying(), 55);
}

TEST(IECVarTest, RealTypes) {
    IEC_REAL realVar(3.14f);
    EXPECT_FLOAT_EQ(realVar.get(), 3.14f);
    
    realVar *= 2.0f;
    EXPECT_FLOAT_EQ(realVar.get(), 6.28f);
    
    IEC_LREAL lrealVar(3.14159265358979);
    EXPECT_DOUBLE_EQ(lrealVar.get(), 3.14159265358979);
}

TEST(IECVarTest, BoolType) {
    IEC_BOOL boolVar(true);
    EXPECT_TRUE(boolVar.get());
    
    boolVar = false;
    EXPECT_FALSE(boolVar.get());
    
    boolVar.force(true);
    EXPECT_TRUE(boolVar.get());
    
    boolVar = false;
    EXPECT_TRUE(boolVar.get());
}

TEST(IECVarTest, TimeTypes) {
    IEC_TIME timeVar(1000000000LL);
    EXPECT_EQ(timeVar.get(), 1000000000LL);
    
    IEC_LTIME ltimeVar(1000000000000LL);
    EXPECT_EQ(ltimeVar.get(), 1000000000000LL);
}

TEST(IECVarTest, CharTypes) {
    IEC_CHAR charVar('A');
    EXPECT_EQ(charVar.get(), 'A');
    
    IEC_WCHAR wcharVar(u'B');
    EXPECT_EQ(wcharVar.get(), u'B');
}

TEST(IECVarTest, TraitsWithIECVar) {
    EXPECT_TRUE(is_any_int_v<IEC_INT>);
    EXPECT_TRUE(is_any_int_v<IEC_DINT>);
    EXPECT_TRUE(is_any_real_v<IEC_REAL>);
    EXPECT_TRUE(is_any_bit_v<IEC_BYTE>);
    EXPECT_TRUE(is_any_bool_v<IEC_BOOL>);
}
