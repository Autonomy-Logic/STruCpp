TEST 'R_TRIG detects rising edges'
  VAR rt : R_TRIG; q1, q2, q3 : BOOL; END_VAR
  (* CLK FALSE->TRUE: rising edge *)
  rt(CLK := TRUE);
  q1 := rt.Q;
  (* CLK stays TRUE: no edge *)
  rt(CLK := TRUE);
  q2 := rt.Q;
  (* Toggle FALSE then TRUE: another rising edge *)
  rt(CLK := FALSE);
  rt(CLK := TRUE);
  q3 := rt.Q;
  ASSERT_TRUE(q1);
  ASSERT_FALSE(q2);
  ASSERT_TRUE(q3);
END_TEST

TEST 'R_TRIG no edge on repeated TRUE'
  VAR rt : R_TRIG; END_VAR
  rt(CLK := TRUE);
  ASSERT_TRUE(rt.Q);
  rt(CLK := TRUE);
  ASSERT_FALSE(rt.Q);
  rt(CLK := TRUE);
  ASSERT_FALSE(rt.Q);
END_TEST

TEST 'F_TRIG detects falling edges'
  VAR ft : F_TRIG; q1, q2, q3, q4 : BOOL; END_VAR
  (* Initial: CLK=FALSE, M=FALSE. Q = NOT CLK AND NOT M = TRUE *)
  ft(CLK := FALSE);
  q1 := ft.Q;
  (* CLK still FALSE, M now TRUE. Q = NOT FALSE AND NOT TRUE = FALSE *)
  ft(CLK := FALSE);
  q2 := ft.Q;
  (* CLK goes TRUE. Q = NOT TRUE AND NOT TRUE = FALSE *)
  ft(CLK := TRUE);
  q3 := ft.Q;
  (* CLK goes FALSE: falling edge. Q = NOT FALSE AND NOT FALSE = TRUE *)
  ft(CLK := FALSE);
  q4 := ft.Q;
  ASSERT_TRUE(q1);
  ASSERT_FALSE(q2);
  ASSERT_FALSE(q3);
  ASSERT_TRUE(q4);
END_TEST
