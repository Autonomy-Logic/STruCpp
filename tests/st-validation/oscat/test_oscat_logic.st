(* OSCAT Logic Functions — End-to-End Tests *)

(* === FF_JKE: JK flip-flop with edge detection === *)

TEST 'FF_JKE: initial state is FALSE'
  VAR ff : FF_JKE; END_VAR
  ff(SET := FALSE, J := FALSE, CLK := FALSE, K := FALSE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_JKE: SET forces Q TRUE'
  VAR ff : FF_JKE; END_VAR
  ff(SET := TRUE, J := FALSE, CLK := FALSE, K := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
END_TEST

TEST 'FF_JKE: RST forces Q FALSE'
  VAR ff : FF_JKE; END_VAR
  ff(SET := TRUE, J := FALSE, CLK := FALSE, K := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  ff(SET := FALSE, J := FALSE, CLK := FALSE, K := FALSE, RST := TRUE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_JKE: RST overrides SET'
  VAR ff : FF_JKE; END_VAR
  ff(SET := TRUE, J := FALSE, CLK := FALSE, K := FALSE, RST := TRUE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_JKE: J=1 K=0 sets Q on rising edge'
  VAR ff : FF_JKE; END_VAR
  ff(SET := FALSE, J := TRUE, CLK := FALSE, K := FALSE, RST := FALSE);
  ff(SET := FALSE, J := TRUE, CLK := TRUE, K := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
END_TEST

TEST 'FF_JKE: J=0 K=1 clears Q on rising edge'
  VAR ff : FF_JKE; END_VAR
  ff(SET := TRUE, J := FALSE, CLK := FALSE, K := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  ff(SET := FALSE, J := FALSE, CLK := FALSE, K := TRUE, RST := FALSE);
  ff(SET := FALSE, J := FALSE, CLK := TRUE, K := TRUE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_JKE: J=1 K=1 toggles Q on rising edge'
  VAR ff : FF_JKE; END_VAR
  ff(SET := FALSE, J := TRUE, CLK := FALSE, K := TRUE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
  ff(SET := FALSE, J := TRUE, CLK := TRUE, K := TRUE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  ff(SET := FALSE, J := TRUE, CLK := FALSE, K := TRUE, RST := FALSE);
  ff(SET := FALSE, J := TRUE, CLK := TRUE, K := TRUE, RST := FALSE);
  ASSERT_FALSE(ff.Q);
END_TEST

TEST 'FF_JKE: J=0 K=0 holds Q on rising edge'
  VAR ff : FF_JKE; END_VAR
  ff(SET := TRUE, J := FALSE, CLK := FALSE, K := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
  ff(SET := FALSE, J := FALSE, CLK := FALSE, K := FALSE, RST := FALSE);
  ff(SET := FALSE, J := FALSE, CLK := TRUE, K := FALSE, RST := FALSE);
  ASSERT_TRUE(ff.Q);
END_TEST

(* === FLOOR2: floor function for REAL === *)

TEST 'FLOOR2: positive exact'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := 3.0);
  ASSERT_EQ(result, 3);
END_TEST

TEST 'FLOOR2: positive fractional'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := 3.99);
  ASSERT_EQ(result, 3);
END_TEST

TEST 'FLOOR2: negative fractional rounds down'
  VAR result : DINT; END_VAR
  result := FLOOR2(X := -3.14);
  ASSERT_EQ(result, -4);
END_TEST

(* === MODR: real modulo via FLOOR2 === *)

TEST 'MODR: 5.5 mod 2.5 = 0.5'
  VAR result : REAL; END_VAR
  result := MODR(IN := 5.5, DIVI := 2.5);
  ASSERT_NEAR(result, 0.5, 0.001);
END_TEST

TEST 'MODR: 10.0 mod 3.0 = 1.0'
  VAR result : REAL; END_VAR
  result := MODR(IN := 10.0, DIVI := 3.0);
  ASSERT_NEAR(result, 1.0, 0.001);
END_TEST

TEST 'MODR: division by 0 returns 0'
  VAR result : REAL; END_VAR
  result := MODR(IN := 5.0, DIVI := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST
