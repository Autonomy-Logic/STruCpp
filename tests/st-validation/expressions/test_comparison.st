TEST 'Equal: 5 = 5'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.eq_true);
END_TEST

TEST 'Not equal: 5 = 6 is FALSE'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_FALSE(uut.eq_false);
END_TEST

TEST 'Not equal operator: 5 <> 6'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.neq_true);
END_TEST

TEST 'Less than: 3 < 5'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.lt_true);
END_TEST

TEST 'Less than false: 5 < 3'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_FALSE(uut.lt_false);
END_TEST

TEST 'Greater than: 5 > 3'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.gt_true);
END_TEST

TEST 'Less or equal when equal: 5 <= 5'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.le_eq);
END_TEST

TEST 'Less or equal when less: 3 <= 5'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.le_lt);
END_TEST

TEST 'Greater or equal when equal: 5 >= 5'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.ge_eq);
END_TEST

TEST 'Greater or equal when greater: 5 >= 3'
  VAR uut : ComparisonTest; END_VAR
  uut();
  ASSERT_TRUE(uut.ge_gt);
END_TEST
