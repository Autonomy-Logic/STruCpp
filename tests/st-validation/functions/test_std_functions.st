TEST 'ABS of negative'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.abs_result, 42);
END_TEST

TEST 'MIN returns smaller'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.min_result, 3);
END_TEST

TEST 'MAX returns larger'
  VAR uut : StdFunctionsTest; END_VAR
  uut();
  ASSERT_EQ(uut.max_result, 10);
END_TEST
