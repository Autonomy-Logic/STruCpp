TEST 'Constant REAL used in expression'
  VAR uut : ConstantsTest; END_VAR
  uut();
  ASSERT_NEAR(uut.area, 78.5397, 0.01);
END_TEST

TEST 'Constant INT used in expression'
  VAR uut : ConstantsTest; END_VAR
  uut();
  ASSERT_EQ(uut.doubled, 200);
END_TEST
