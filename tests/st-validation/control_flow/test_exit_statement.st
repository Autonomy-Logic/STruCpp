TEST 'EXIT from FOR loop'
  VAR uut : ExitTest; END_VAR
  uut();
  ASSERT_EQ(uut.for_exit, 7);
END_TEST

TEST 'EXIT from WHILE loop'
  VAR uut : ExitTest; END_VAR
  uut();
  ASSERT_EQ(uut.while_exit, 4);
END_TEST

TEST 'EXIT from REPEAT loop'
  VAR uut : ExitTest; END_VAR
  uut();
  ASSERT_EQ(uut.repeat_exit, 3);
END_TEST
