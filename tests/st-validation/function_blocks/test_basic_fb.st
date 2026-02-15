TEST 'Counter increments by specified amount'
  VAR c : Counter; END_VAR
  c(increment := 5);
  ASSERT_EQ(c.count, 5);
  c(increment := 3);
  ASSERT_EQ(c.count, 8);
END_TEST

TEST 'Counter starts at zero'
  VAR c : Counter; END_VAR
  ASSERT_EQ(c.count, 0);
END_TEST

TEST 'Two counters are independent'
  VAR a : Counter; b : Counter; END_VAR
  a(increment := 10);
  b(increment := 20);
  ASSERT_EQ(a.count, 10);
  ASSERT_EQ(b.count, 20);
END_TEST

TEST 'Toggle alternates state'
  VAR t : Toggle; END_VAR
  ASSERT_FALSE(t.state);
  t();
  ASSERT_TRUE(t.state);
  t();
  ASSERT_FALSE(t.state);
  t();
  ASSERT_TRUE(t.state);
END_TEST
