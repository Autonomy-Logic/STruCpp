TEST 'INT to REAL conversion'
  VAR uut : TypeConversionTest; END_VAR
  uut();
  ASSERT_NEAR(uut.int_to_real_result, 42.0, 0.001);
END_TEST

TEST 'REAL to INT truncation'
  VAR uut : TypeConversionTest; END_VAR
  uut();
  ASSERT_EQ(uut.real_to_int_result, 3);
END_TEST

TEST 'INT to DINT widening'
  VAR uut : TypeConversionTest; END_VAR
  uut();
  ASSERT_EQ(uut.int_to_dint_result, 42);
END_TEST

TEST 'BOOL to INT'
  VAR uut : TypeConversionTest; END_VAR
  uut();
  ASSERT_EQ(uut.bool_to_int_result, 1);
END_TEST
