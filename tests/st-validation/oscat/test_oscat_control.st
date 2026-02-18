(* OSCAT Control Function Blocks — End-to-End Tests *)

(* === TOGGLE: toggle output on rising clock edge === *)

TEST 'TOGGLE: initial Q is FALSE'
  VAR t : TOGGLE; END_VAR
  t(CLK := FALSE, RST := FALSE);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TOGGLE: first rising edge toggles Q TRUE'
  VAR t : TOGGLE; END_VAR
  t(CLK := FALSE, RST := FALSE);
  t(CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(t.Q);
END_TEST

TEST 'TOGGLE: second rising edge toggles Q FALSE'
  VAR t : TOGGLE; END_VAR
  t(CLK := FALSE, RST := FALSE);
  t(CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(t.Q);
  t(CLK := FALSE, RST := FALSE);
  t(CLK := TRUE, RST := FALSE);
  ASSERT_FALSE(t.Q);
END_TEST

TEST 'TOGGLE: sustained CLK high does not toggle'
  VAR t : TOGGLE; END_VAR
  t(CLK := FALSE, RST := FALSE);
  t(CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(t.Q);
  t(CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(t.Q);
END_TEST

TEST 'TOGGLE: RST forces Q FALSE'
  VAR t : TOGGLE; END_VAR
  t(CLK := FALSE, RST := FALSE);
  t(CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(t.Q);
  t(CLK := FALSE, RST := TRUE);
  ASSERT_FALSE(t.Q);
END_TEST

(* === HYST_1: simple hysteresis === *)

TEST 'HYST_1: below low -> Q FALSE'
  VAR h : HYST_1; END_VAR
  h(IN := 5.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_FALSE(h.Q);
  ASSERT_FALSE(h.WIN);
END_TEST

TEST 'HYST_1: above high -> Q TRUE'
  VAR h : HYST_1; END_VAR
  h(IN := 90.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_TRUE(h.Q);
  ASSERT_FALSE(h.WIN);
END_TEST

TEST 'HYST_1: in window -> WIN TRUE, Q unchanged'
  VAR h : HYST_1; END_VAR
  h(IN := 50.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_TRUE(h.WIN);
END_TEST

TEST 'HYST_1: hysteresis holds Q through window'
  VAR h : HYST_1; END_VAR
  h(IN := 90.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_TRUE(h.Q);
  h(IN := 50.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_TRUE(h.Q);
  ASSERT_TRUE(h.WIN);
END_TEST

TEST 'HYST_1: crossing low clears Q'
  VAR h : HYST_1; END_VAR
  h(IN := 90.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_TRUE(h.Q);
  h(IN := 10.0, HIGH := 80.0, LOW := 20.0);
  ASSERT_FALSE(h.Q);
END_TEST

(* === MANUAL_1: automatic/manual mode selector === *)

TEST 'MANUAL_1: auto mode passes IN to Q'
  VAR m : MANUAL_1; END_VAR
  m(IN := TRUE, MAN := FALSE, M_I := FALSE, SET := FALSE, RST := FALSE);
  ASSERT_TRUE(m.Q);
  ASSERT_EQ(m.STATUS, 100);
END_TEST

TEST 'MANUAL_1: auto mode with IN FALSE'
  VAR m : MANUAL_1; END_VAR
  m(IN := FALSE, MAN := FALSE, M_I := FALSE, SET := FALSE, RST := FALSE);
  ASSERT_FALSE(m.Q);
  ASSERT_EQ(m.STATUS, 100);
END_TEST

TEST 'MANUAL_1: manual SET forces Q TRUE'
  VAR m : MANUAL_1; END_VAR
  m(IN := FALSE, MAN := TRUE, M_I := FALSE, SET := FALSE, RST := FALSE);
  m(IN := FALSE, MAN := TRUE, M_I := FALSE, SET := TRUE, RST := FALSE);
  ASSERT_TRUE(m.Q);
  ASSERT_EQ(m.STATUS, 101);
END_TEST

TEST 'MANUAL_1: manual RST forces Q FALSE'
  VAR m : MANUAL_1; END_VAR
  m(IN := FALSE, MAN := TRUE, M_I := FALSE, SET := FALSE, RST := FALSE);
  m(IN := FALSE, MAN := TRUE, M_I := FALSE, SET := FALSE, RST := TRUE);
  ASSERT_FALSE(m.Q);
  ASSERT_EQ(m.STATUS, 102);
END_TEST

TEST 'MANUAL_1: manual M_I passthrough when no edges'
  VAR m : MANUAL_1; END_VAR
  m(IN := FALSE, MAN := TRUE, M_I := TRUE, SET := FALSE, RST := FALSE);
  ASSERT_TRUE(m.Q);
  ASSERT_EQ(m.STATUS, 103);
END_TEST
