TEST 'Enum default value and comparison with dot notation'
  VAR uut : EnumDotTest; END_VAR
  uut();
  ASSERT_TRUE(uut.isRed, 'TrafficState.RED default should match');
  ASSERT_TRUE(uut.isWalk, 'PedestrianState.WALK default should match');
END_TEST

TEST 'CASE with enum dot-notation labels'
  VAR uut : EnumDotTest; END_VAR
  uut();
  ASSERT_EQ(uut.result, 1, 'CASE should match TrafficState.RED and set result to 1');
END_TEST

TEST 'Enum reassignment changes CASE branch'
  VAR uut : EnumDotTest; END_VAR

  uut.ts := TrafficState.GREEN;
  uut();
  ASSERT_EQ(uut.result, 2, 'GREEN -> result 2');

  uut.ts := TrafficState.YELLOW;
  uut();
  ASSERT_EQ(uut.result, 3, 'YELLOW -> result 3');

  uut.ts := TrafficState.RED;
  uut();
  ASSERT_EQ(uut.result, 1, 'RED -> result 1');
END_TEST
