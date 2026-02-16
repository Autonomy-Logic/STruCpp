TEST 'Subrange assignment and arithmetic'
  VAR uut : SubrangeTest; END_VAR
  uut();
  ASSERT_EQ(uut.result, 60);
END_TEST
