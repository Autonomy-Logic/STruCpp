TEST 'REAL addition'
  VAR uut : RealTest; END_VAR
  uut();
  ASSERT_NEAR(uut.r_add, 4.0, 0.001);
END_TEST

TEST 'REAL subtraction'
  VAR uut : RealTest; END_VAR
  uut();
  ASSERT_NEAR(uut.r_sub, 6.5, 0.001);
END_TEST

TEST 'REAL multiplication'
  VAR uut : RealTest; END_VAR
  uut();
  ASSERT_NEAR(uut.r_mul, 7.0, 0.001);
END_TEST

TEST 'REAL division'
  VAR uut : RealTest; END_VAR
  uut();
  ASSERT_NEAR(uut.r_div, 2.5, 0.001);
END_TEST

TEST 'REAL negation'
  VAR uut : RealTest; END_VAR
  uut();
  ASSERT_NEAR(uut.r_neg, -5.5, 0.001);
END_TEST

TEST 'LREAL precision'
  VAR uut : RealTest; END_VAR
  uut();
  ASSERT_NEAR(uut.lr_val, 1.23456789, 0.0001);
END_TEST
