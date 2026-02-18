(* OSCAT Function Blocks — End-to-End Tests *)
(* Tests keyword identifiers (SET as VAR_INPUT) and FB state behavior *)

(* === FF_DRE: D-type flip-flop with rising edge clock === *)

TEST 'FF_DRE: initial state is FALSE'
  VAR ff : FF_DRE; END_VAR
  ff(SET := FALSE, D := FALSE, CLK := FALSE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_DRE: SET forces Q TRUE'
  VAR ff : FF_DRE; END_VAR
  ff(SET := TRUE, D := FALSE, CLK := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
END_TEST

TEST 'FF_DRE: RST forces Q FALSE'
  VAR ff : FF_DRE; END_VAR
  (* First set Q to TRUE *)
  ff(SET := TRUE, D := FALSE, CLK := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  (* Then reset *)
  ff(SET := FALSE, D := FALSE, CLK := FALSE, RST := TRUE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_DRE: RST overrides SET'
  VAR ff : FF_DRE; END_VAR
  ff(SET := TRUE, D := TRUE, CLK := FALSE, RST := TRUE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_DRE: rising CLK edge captures D=TRUE'
  VAR ff : FF_DRE; END_VAR
  (* CLK low first to establish edge *)
  ff(SET := FALSE, D := TRUE, CLK := FALSE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
  (* Rising edge with D=TRUE *)
  ff(SET := FALSE, D := TRUE, CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
END_TEST

TEST 'FF_DRE: rising CLK edge captures D=FALSE'
  VAR ff : FF_DRE; END_VAR
  (* First set Q high *)
  ff(SET := TRUE, D := FALSE, CLK := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  (* CLK low to prepare edge *)
  ff(SET := FALSE, D := FALSE, CLK := FALSE, RST := FALSE);
  (* Rising edge with D=FALSE *)
  ff(SET := FALSE, D := FALSE, CLK := TRUE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_DRE: no change on sustained CLK high'
  VAR ff : FF_DRE; END_VAR
  (* Rising edge captures D=TRUE *)
  ff(SET := FALSE, D := TRUE, CLK := FALSE, RST := FALSE);
  ff(SET := FALSE, D := TRUE, CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  (* Now D changes but CLK stays high — no edge, no capture *)
  ff(SET := FALSE, D := FALSE, CLK := TRUE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
END_TEST

(* === COUNT_BR: byte counter with SET keyword input === *)

TEST 'COUNT_BR: initial count is 0'
  VAR ctr : COUNT_BR; END_VAR
  ctr(SET := FALSE, IN := 0, UP := FALSE, DN := FALSE, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 0);
END_TEST

TEST 'COUNT_BR: RST resets count to 0'
  VAR ctr : COUNT_BR; END_VAR
  (* Count up once *)
  ctr(SET := FALSE, IN := 0, UP := FALSE, DN := FALSE, RST := FALSE);
  ctr(SET := FALSE, IN := 0, UP := TRUE, DN := FALSE, RST := FALSE);
  (* Now reset *)
  ctr(SET := FALSE, IN := 0, UP := FALSE, DN := FALSE, RST := TRUE);
  ASSERT_EQ(ctr.CNT, 0);
END_TEST

TEST 'COUNT_BR: SET loads IN value'
  VAR ctr : COUNT_BR; END_VAR
  ctr(SET := TRUE, IN := 42, UP := FALSE, DN := FALSE, MX := 255, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 42);
END_TEST

TEST 'COUNT_BR: SET clamps IN to MX'
  VAR ctr : COUNT_BR; END_VAR
  ctr(SET := TRUE, IN := 200, UP := FALSE, DN := FALSE, MX := 100, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 100);
END_TEST

TEST 'COUNT_BR: count up on rising edge'
  VAR ctr : COUNT_BR; END_VAR
  (* UP low *)
  ctr(SET := FALSE, IN := 0, UP := FALSE, DN := FALSE, STEP := 1, MX := 255, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 0);
  (* UP rising edge *)
  ctr(SET := FALSE, IN := 0, UP := TRUE, DN := FALSE, STEP := 1, MX := 255, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 1);
END_TEST

TEST 'COUNT_BR: count up multiple steps'
  VAR ctr : COUNT_BR; END_VAR
  ctr(SET := FALSE, IN := 0, UP := FALSE, DN := FALSE, STEP := 5, MX := 255, RST := FALSE);
  (* First rising edge: 0 + 5 = 5 *)
  ctr(SET := FALSE, IN := 0, UP := TRUE, DN := FALSE, STEP := 5, MX := 255, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 5);
  (* Need falling edge before next count *)
  ctr(SET := FALSE, IN := 0, UP := FALSE, DN := FALSE, STEP := 5, MX := 255, RST := FALSE);
  (* Second rising edge: 5 + 5 = 10 *)
  ctr(SET := FALSE, IN := 0, UP := TRUE, DN := FALSE, STEP := 5, MX := 255, RST := FALSE);
  ASSERT_EQ(ctr.CNT, 10);
END_TEST
