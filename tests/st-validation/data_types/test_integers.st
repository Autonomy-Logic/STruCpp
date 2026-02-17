TEST 'INT holds 1000'
  VAR uut : IntegerTest; END_VAR
  uut();
  ASSERT_EQ(uut.int_val, 1000);
END_TEST

TEST 'DINT holds 100000'
  VAR uut : IntegerTest; END_VAR
  uut();
  ASSERT_EQ(uut.dint_val, 100000);
END_TEST

TEST 'UINT holds 65000'
  VAR uut : IntegerTest; END_VAR
  uut();
  ASSERT_EQ(uut.uint_val, 65000);
END_TEST

TEST 'Integer addition'
  VAR uut : IntegerTest; END_VAR
  uut();
  ASSERT_EQ(uut.add_result, 300);
END_TEST

TEST 'Integer subtraction produces negative'
  VAR uut : IntegerTest; END_VAR
  uut();
  ASSERT_EQ(uut.sub_result, -50);
END_TEST
