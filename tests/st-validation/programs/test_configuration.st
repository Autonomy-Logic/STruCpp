TEST 'Program state increments on each call'
  VAR uut : ConfigTest; END_VAR
  uut();
  ASSERT_EQ(uut.cycle_count, 1);
  ASSERT_TRUE(uut.running);
  uut();
  ASSERT_EQ(uut.cycle_count, 2);
END_TEST
