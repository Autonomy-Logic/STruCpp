TEST 'REPEAT counts to 5'
  VAR uut : RepeatLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.count_result, 5);
END_TEST

TEST 'REPEAT always executes at least once'
  VAR uut : RepeatLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.executes_once, 1);
END_TEST
