TEST 'Array first element'
  VAR uut : ArrayTest; END_VAR
  uut();
  ASSERT_EQ(uut.first, 10);
END_TEST

TEST 'Array last element'
  VAR uut : ArrayTest; END_VAR
  uut();
  ASSERT_EQ(uut.last, 50);
END_TEST

TEST 'Array sum of elements'
  VAR uut : ArrayTest; END_VAR
  uut();
  ASSERT_EQ(uut.sum, 150);
END_TEST
