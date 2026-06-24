(* Tests for the TrafficLight function block *)

TEST 'TrafficLight starts in RED state'
  VAR light : TrafficLight; END_VAR

  light();
  ASSERT_EQ(light.currentState, TrafficState.RED, 'Should start in RED');
  ASSERT_TRUE(light.redLight, 'Red light should be on');
  ASSERT_FALSE(light.greenLight, 'Green light should be off');
  ASSERT_FALSE(light.yellowLight, 'Yellow light should be off');
END_TEST

TEST 'TrafficLight transitions RED to GREEN after red duration'
  VAR
    light : TrafficLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#100ms;
  timing.greenDuration := T#100ms;
  timing.yellowDuration := T#50ms;
  light.timing := timing;

  (* Run through the red phase *)
  light();
  ADVANCE_TIME(T#50ms);
  light();
  ASSERT_EQ(light.currentState, TrafficState.RED, 'Still RED at 50ms');

  ADVANCE_TIME(T#50ms);
  light();
  ASSERT_EQ(light.currentState, TrafficState.GREEN, 'Should be GREEN after 100ms');
  ASSERT_TRUE(light.greenLight);
  ASSERT_FALSE(light.redLight);
END_TEST

TEST 'TrafficLight full cycle RED -> GREEN -> YELLOW -> RED'
  VAR
    light : TrafficLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#100ms;
  timing.greenDuration := T#80ms;
  timing.yellowDuration := T#40ms;
  light.timing := timing;

  (* Start in RED *)
  light();
  ASSERT_EQ(light.currentState, TrafficState.RED);

  (* Advance past red duration -> GREEN *)
  ADVANCE_TIME(T#50ms);
  light();
  ADVANCE_TIME(T#50ms);
  light();
  ASSERT_EQ(light.currentState, TrafficState.GREEN, 'After red duration -> GREEN');

  (* Advance past green duration -> YELLOW *)
  ADVANCE_TIME(T#40ms);
  light();
  ADVANCE_TIME(T#40ms);
  light();
  ASSERT_EQ(light.currentState, TrafficState.YELLOW, 'After green duration -> YELLOW');

  (* Advance past yellow duration -> RED *)
  ADVANCE_TIME(T#20ms);
  light();
  ADVANCE_TIME(T#20ms);
  light();
  ASSERT_EQ(light.currentState, TrafficState.RED, 'After yellow duration -> back to RED');
END_TEST

TEST 'TrafficLight disabled does not advance'
  VAR
    light : TrafficLight;
    timing : PhaseTiming;
  END_VAR

  timing.redDuration := T#100ms;
  light.timing := timing;
  light.enable := FALSE;

  light();
  ADVANCE_TIME(T#200ms);
  light();

  ASSERT_EQ(light.currentState, TrafficState.RED, 'Disabled light should stay in RED');
END_TEST

TEST 'TrafficLight methods report correct state'
  VAR light : TrafficLight; END_VAR

  light();
  ASSERT_TRUE(light.IsRed(), 'IsRed should be TRUE initially');
  ASSERT_FALSE(light.IsGreen(), 'IsGreen should be FALSE initially');
  ASSERT_EQ(light.GetState(), TrafficState.RED, 'GetState should return RED');
END_TEST
