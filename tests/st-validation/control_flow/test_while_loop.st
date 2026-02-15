TEST 'WHILE counts to 5'
  VAR uut : WhileLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.count_result, 5);
END_TEST

TEST 'WHILE sums 1 to 10'
  VAR uut : WhileLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.sum_result, 55);
END_TEST

TEST 'WHILE with EXIT breaks early'
  VAR uut : WhileLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.early_exit, 3);
END_TEST
