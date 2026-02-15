TEST 'TRUE AND TRUE = TRUE'
  VAR uut : BooleanTypeTest; END_VAR
  uut();
  ASSERT_TRUE(uut.and_tt);
END_TEST

TEST 'TRUE AND FALSE = FALSE'
  VAR uut : BooleanTypeTest; END_VAR
  uut();
  ASSERT_FALSE(uut.and_tf);
END_TEST

TEST 'FALSE OR FALSE = FALSE'
  VAR uut : BooleanTypeTest; END_VAR
  uut();
  ASSERT_FALSE(uut.or_ff);
END_TEST

TEST 'TRUE OR FALSE = TRUE'
  VAR uut : BooleanTypeTest; END_VAR
  uut();
  ASSERT_TRUE(uut.or_tf);
END_TEST

TEST 'NOT TRUE = FALSE'
  VAR uut : BooleanTypeTest; END_VAR
  uut();
  ASSERT_FALSE(uut.not_t);
END_TEST

TEST 'NOT FALSE = TRUE'
  VAR uut : BooleanTypeTest; END_VAR
  uut();
  ASSERT_TRUE(uut.not_f);
END_TEST
