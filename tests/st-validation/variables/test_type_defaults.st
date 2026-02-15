TEST 'BOOL defaults to FALSE'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_FALSE(uut.d_bool);
END_TEST

TEST 'SINT defaults to 0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_EQ(uut.d_sint, 0);
END_TEST

TEST 'INT defaults to 0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_EQ(uut.d_int, 0);
END_TEST

TEST 'DINT defaults to 0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_EQ(uut.d_dint, 0);
END_TEST

TEST 'USINT defaults to 0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_EQ(uut.d_usint, 0);
END_TEST

TEST 'UINT defaults to 0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_EQ(uut.d_uint, 0);
END_TEST

TEST 'REAL defaults to 0.0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_NEAR(uut.d_real, 0.0, 0.001);
END_TEST

TEST 'LREAL defaults to 0.0'
  VAR uut : TypeDefaultsTest; END_VAR
  ASSERT_NEAR(uut.d_lreal, 0.0, 0.001);
END_TEST
