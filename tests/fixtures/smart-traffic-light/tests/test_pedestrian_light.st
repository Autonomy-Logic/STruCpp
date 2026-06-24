(* Tests for the PedestrianLight function block *)

TEST 'PedestrianLight starts in DONT_WALK'
  VAR ped : PedestrianLight; END_VAR

  ped();
  ASSERT_EQ(ped.pedestrianState, PedestrianState.DONT_WALK, 'Should start DONT_WALK');
  ASSERT_TRUE(ped.dontWalkLight, 'Dont walk light should be on');
  ASSERT_FALSE(ped.walkLight, 'Walk light should be off');
END_TEST

TEST 'PedestrianLight walks when traffic is RED and requested'
  VAR
    ped : PedestrianLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#200ms;
  timing.greenDuration := T#100ms;
  timing.yellowDuration := T#50ms;
  ped.timing := timing;
  ped.walkDuration := T#80ms;

  (* Start in RED *)
  ped();
  ASSERT_EQ(ped.currentState, TrafficState.RED, 'Should be RED');

  (* Request walk *)
  ped.walkRequest := TRUE;
  ped();

  ASSERT_EQ(ped.pedestrianState, PedestrianState.WALK, 'Should be WALK after request during RED');
  ASSERT_TRUE(ped.walkLight, 'Walk light should be on');
END_TEST

TEST 'PedestrianLight transitions WALK to FLASHING after duration'
  VAR
    ped : PedestrianLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#500ms;
  timing.greenDuration := T#100ms;
  timing.yellowDuration := T#50ms;
  ped.timing := timing;
  ped.walkDuration := T#80ms;

  ped.walkRequest := TRUE;
  ped();
  ASSERT_EQ(ped.pedestrianState, PedestrianState.WALK, 'Should be WALK');

  (* Advance past walk duration *)
  ADVANCE_TIME(T#40ms);
  ped();
  ADVANCE_TIME(T#40ms);
  ped();

  ASSERT_EQ(ped.pedestrianState, PedestrianState.FLASHING, 'Should be FLASHING after walk duration');
END_TEST

TEST 'PedestrianLight IsWalking method'
  VAR
    ped : PedestrianLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#200ms;
  ped.timing := timing;

  ped();
  ASSERT_FALSE(ped.IsWalking(), 'Not walking initially');

  ped.walkRequest := TRUE;
  ped();
  ASSERT_TRUE(ped.IsWalking(), 'Walking after request during RED');
END_TEST

TEST 'PedestrianLight resets when traffic goes GREEN'
  VAR
    ped : PedestrianLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#100ms;
  timing.greenDuration := T#100ms;
  timing.yellowDuration := T#50ms;
  ped.timing := timing;

  (* Walk during RED *)
  ped.walkRequest := TRUE;
  ped();
  ASSERT_EQ(ped.pedestrianState, PedestrianState.WALK);

  (* Advance to GREEN *)
  ADVANCE_TIME(T#50ms);
  ped();
  ADVANCE_TIME(T#50ms);
  ped();

  ASSERT_EQ(ped.currentState, TrafficState.GREEN, 'Traffic should be GREEN');
  ASSERT_EQ(ped.pedestrianState, PedestrianState.DONT_WALK, 'Ped should be DONT_WALK');
  ASSERT_FALSE(ped.walkRequest, 'Walk request should be cleared');
END_TEST
