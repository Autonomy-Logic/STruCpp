TEST 'Nested FOR loops 3x4 = 12 iterations'
  VAR uut : NestedLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.matrix_sum, 12);
END_TEST

TEST 'Inner EXIT only breaks inner loop'
  VAR uut : NestedLoopTest; END_VAR
  uut();
  ASSERT_EQ(uut.break_outer, 3);
END_TEST
