TEST 'Accumulator accumulates over multiple calls'
  VAR acc : Accumulator; END_VAR
  acc(value := 10);
  acc(value := 20);
  acc(value := 30);
  ASSERT_EQ(acc.total, 60);
END_TEST

TEST 'Accumulator internal state tracks calls'
  VAR acc : Accumulator; END_VAR
  acc(value := 1);
  acc(value := 1);
  ASSERT_EQ(acc.callCount, 2);
END_TEST

TEST 'MaxTracker tracks maximum input'
  VAR mt : MaxTracker; END_VAR
  mt(input := 5);
  ASSERT_EQ(mt.maxValue, 5);
  mt(input := 3);
  ASSERT_EQ(mt.maxValue, 5);
  mt(input := 8);
  ASSERT_EQ(mt.maxValue, 8);
  mt(input := 1);
  ASSERT_EQ(mt.maxValue, 8);
END_TEST
