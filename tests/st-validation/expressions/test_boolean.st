TEST 'AND: TRUE AND TRUE = TRUE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_TRUE(uut.and_result);
END_TEST

TEST 'AND: FALSE AND TRUE = FALSE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_FALSE(uut.and_ff);
END_TEST

TEST 'OR: FALSE OR TRUE = TRUE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_TRUE(uut.or_result);
END_TEST

TEST 'OR: TRUE OR TRUE = TRUE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_TRUE(uut.or_tt);
END_TEST

TEST 'NOT: NOT FALSE = TRUE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_TRUE(uut.not_result);
END_TEST

TEST 'XOR: TRUE XOR FALSE = TRUE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_TRUE(uut.xor_result);
END_TEST

TEST 'Complex: (TRUE AND FALSE) OR (NOT FALSE) = TRUE'
  VAR uut : BooleanTest; END_VAR
  uut();
  ASSERT_TRUE(uut.complex_result);
END_TEST
