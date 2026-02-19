TEST 'TON initial state Q=FALSE'
  VAR t : TON; END_VAR
  t(IN := FALSE, PT := T#1s);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TOF initial state Q=FALSE'
  VAR t : TOF; END_VAR
  t(IN := FALSE, PT := T#1s);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TP initial state Q=FALSE'
  VAR t : TP; END_VAR
  t(IN := FALSE, PT := T#1s);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TON does not fire before PT elapsed'
  VAR t : TON; END_VAR
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ASSERT_FALSE(t.Q);
  ASSERT_EQ(t.ET, T#80ms);
END_TEST

TEST 'TON fires exactly at PT'
  VAR t : TON; END_VAR
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ASSERT_TRUE(t.Q);
  ASSERT_EQ(t.ET, T#100ms);
END_TEST

TEST 'TON resets when IN goes FALSE'
  VAR t : TON; END_VAR
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  (* Reset *)
  t(IN := FALSE, PT := T#100ms);
  ASSERT_FALSE(t.Q);
  ASSERT_EQ(t.ET, T#0s);
END_TEST

TEST 'TON multiple calls same cycle do not advance'
  VAR t : TON; END_VAR
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#100ms);
  t(IN := TRUE, PT := T#100ms);
  t(IN := TRUE, PT := T#100ms);
  (* All three calls see same TIME(), so ET should be 0ms *)
  ASSERT_EQ(t.ET, T#0ms);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TOF holds Q after IN drops'
  VAR t : TOF; END_VAR
  t(IN := TRUE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := FALSE, PT := T#100ms);
  ASSERT_TRUE(t.Q);
  ADVANCE_TIME(T#20ms);
  t(IN := FALSE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := FALSE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := FALSE, PT := T#100ms);
  ASSERT_TRUE(t.Q);
  ADVANCE_TIME(T#20ms);
  t(IN := FALSE, PT := T#100ms);
  ADVANCE_TIME(T#20ms);
  t(IN := FALSE, PT := T#100ms);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TP generates pulse for PT duration'
  VAR t : TP; END_VAR
  t(IN := TRUE, PT := T#60ms);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#60ms);
  ASSERT_TRUE(t.Q);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#60ms);
  ASSERT_TRUE(t.Q);
  ADVANCE_TIME(T#20ms);
  t(IN := TRUE, PT := T#60ms);
  ASSERT_FALSE(t.Q);
END_TEST
