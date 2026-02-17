TEST 'Sum 1 to 10 equals 55'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.sum_1_to_10, 55);
END_TEST

TEST 'Countdown executes 10 iterations'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.countdown, 10);
END_TEST

TEST 'Nested loops execute 3x3=9 times'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.nested_result, 9);
END_TEST

TEST 'EXIT breaks out of loop after 5 iterations'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.early_exit_result, 5);
END_TEST

TEST 'Step by 2 counts 0,2,4,6,8,10 = 6 iterations'
  VAR uut : ForLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.step_result, 6);
END_TEST
