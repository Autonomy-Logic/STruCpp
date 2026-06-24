(* Tests for traffic light data types *)

TEST 'TrafficState enum values are distinct'
  VAR
    s1 : TrafficState;
    s2 : TrafficState;
    s3 : TrafficState;
  END_VAR

  s1 := TrafficState.RED;
  s2 := TrafficState.YELLOW;
  s3 := TrafficState.GREEN;

  ASSERT_NEQ(s1, s2, 'RED and YELLOW must differ');
  ASSERT_NEQ(s2, s3, 'YELLOW and GREEN must differ');
  ASSERT_NEQ(s1, s3, 'RED and GREEN must differ');
END_TEST

TEST 'PedestrianState enum values are distinct'
  VAR
    p1 : PedestrianState;
    p2 : PedestrianState;
    p3 : PedestrianState;
  END_VAR

  p1 := PedestrianState.WALK;
  p2 := PedestrianState.DONT_WALK;
  p3 := PedestrianState.FLASHING;

  ASSERT_NEQ(p1, p2, 'WALK and DONT_WALK must differ');
  ASSERT_NEQ(p2, p3, 'DONT_WALK and FLASHING must differ');
END_TEST

TEST 'PhaseTiming struct default values'
  VAR timing : PhaseTiming; END_VAR

  ASSERT_EQ(timing.greenDuration, T#30s, 'Default green should be 30s');
  ASSERT_EQ(timing.yellowDuration, T#5s, 'Default yellow should be 5s');
  ASSERT_EQ(timing.redDuration, T#35s, 'Default red should be 35s');
END_TEST

TEST 'PhaseTiming struct custom values'
  VAR timing : PhaseTiming; END_VAR

  timing.greenDuration := T#20s;
  timing.yellowDuration := T#3s;
  timing.redDuration := T#25s;

  ASSERT_EQ(timing.greenDuration, T#20s);
  ASSERT_EQ(timing.yellowDuration, T#3s);
  ASSERT_EQ(timing.redDuration, T#25s);
END_TEST

TEST 'LogEntry struct initialization'
  VAR entry : LogEntry; END_VAR

  entry.previousState := TrafficState.RED;
  entry.newState := TrafficState.GREEN;
  entry.timestamp := T#1500ms;

  ASSERT_EQ(entry.previousState, TrafficState.RED);
  ASSERT_EQ(entry.newState, TrafficState.GREEN);
  ASSERT_EQ(entry.timestamp, T#1500ms);
END_TEST
