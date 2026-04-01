TEST 'Bare enum default and comparison'
  VAR uut : EnumBareTest; END_VAR
  uut();
  ASSERT_TRUE(uut.isRed, 'bare RED default should match');
  ASSERT_TRUE(uut.isWalk, 'bare WALK default should match');
END_TEST

TEST 'CASE with bare enum labels'
  VAR uut : EnumBareTest; END_VAR
  uut();
  ASSERT_EQ(uut.result, 1, 'CASE should match bare RED and set result to 1');
END_TEST

TEST 'Bare enum reassignment changes CASE branch'
  VAR uut : EnumBareTest; END_VAR

  uut.ts := GREEN;
  uut();
  ASSERT_EQ(uut.result, 2, 'GREEN -> result 2');

  uut.ts := YELLOW;
  uut();
  ASSERT_EQ(uut.result, 3, 'YELLOW -> result 3');

  uut.ts := RED;
  uut();
  ASSERT_EQ(uut.result, 1, 'RED -> result 1');
END_TEST

TEST 'Bare and qualified produce same result'
  VAR uut : EnumBareTest; END_VAR

  uut.ts := TrafficState.GREEN;
  uut();
  ASSERT_EQ(uut.result, 2, 'Qualified GREEN -> 2');

  uut.ts := GREEN;
  uut();
  ASSERT_EQ(uut.result, 2, 'Bare GREEN -> 2 (same)');
END_TEST
