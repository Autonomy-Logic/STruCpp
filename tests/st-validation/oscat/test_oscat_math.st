(* OSCAT Math Functions — End-to-End Tests *)

(* === MS_TO_KMH: meters/second to km/h === *)

TEST 'MS_TO_KMH: 1 m/s = 3.6 km/h'
  VAR result : REAL; END_VAR
  result := MS_TO_KMH(ms := 1.0);
  ASSERT_NEAR(result, 3.6, 0.001);
END_TEST

TEST 'MS_TO_KMH: 0 m/s = 0 km/h'
  VAR result : REAL; END_VAR
  result := MS_TO_KMH(ms := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'MS_TO_KMH: 27.778 m/s ~ 100 km/h'
  VAR result : REAL; END_VAR
  result := MS_TO_KMH(ms := 27.778);
  ASSERT_NEAR(result, 100.0, 0.1);
END_TEST

(* === NEGX: negate real === *)

TEST 'NEGX: positive becomes negative'
  VAR result : REAL; END_VAR
  result := NEGX(X := 5.0);
  ASSERT_NEAR(result, -5.0, 0.001);
END_TEST

TEST 'NEGX: negative becomes positive'
  VAR result : REAL; END_VAR
  result := NEGX(X := -3.14);
  ASSERT_NEAR(result, 3.14, 0.001);
END_TEST

TEST 'NEGX: zero stays zero'
  VAR result : REAL; END_VAR
  result := NEGX(X := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

(* === HYPOT: Pythagorean theorem === *)

TEST 'HYPOT: 3-4-5 triangle'
  VAR result : REAL; END_VAR
  result := HYPOT(X := 3.0, Y := 4.0);
  ASSERT_NEAR(result, 5.0, 0.001);
END_TEST

TEST 'HYPOT: unit vector'
  VAR result : REAL; END_VAR
  result := HYPOT(X := 1.0, Y := 0.0);
  ASSERT_NEAR(result, 1.0, 0.001);
END_TEST

TEST 'HYPOT: zero inputs'
  VAR result : REAL; END_VAR
  result := HYPOT(X := 0.0, Y := 0.0);
  ASSERT_NEAR(result, 0.0, 0.001);
END_TEST

TEST 'HYPOT: negative inputs'
  VAR result : REAL; END_VAR
  result := HYPOT(X := -3.0, Y := -4.0);
  ASSERT_NEAR(result, 5.0, 0.001);
END_TEST

(* === EXP10: 10^x === *)

TEST 'EXP10: 10^0 = 1'
  VAR result : REAL; END_VAR
  result := EXP10(X := 0.0);
  ASSERT_NEAR(result, 1.0, 0.001);
END_TEST

TEST 'EXP10: 10^1 = 10'
  VAR result : REAL; END_VAR
  result := EXP10(X := 1.0);
  ASSERT_NEAR(result, 10.0, 0.01);
END_TEST

TEST 'EXP10: 10^3 = 1000'
  VAR result : REAL; END_VAR
  result := EXP10(X := 3.0);
  ASSERT_NEAR(result, 1000.0, 1.0);
END_TEST

TEST 'EXP10: 10^-1 = 0.1'
  VAR result : REAL; END_VAR
  result := EXP10(X := -1.0);
  ASSERT_NEAR(result, 0.1, 0.001);
END_TEST

(* === WINDOW: open interval check === *)

TEST 'WINDOW: value inside range'
  VAR result : BOOL; END_VAR
  result := WINDOW(low := 0.0, in := 5.0, high := 10.0);
  ASSERT_TRUE(result);
END_TEST

TEST 'WINDOW: value below range'
  VAR result : BOOL; END_VAR
  result := WINDOW(low := 0.0, in := -1.0, high := 10.0);
  ASSERT_FALSE(result);
END_TEST

TEST 'WINDOW: value above range'
  VAR result : BOOL; END_VAR
  result := WINDOW(low := 0.0, in := 11.0, high := 10.0);
  ASSERT_FALSE(result);
END_TEST

TEST 'WINDOW: value at lower boundary is excluded'
  VAR result : BOOL; END_VAR
  result := WINDOW(low := 0.0, in := 0.0, high := 10.0);
  ASSERT_FALSE(result);
END_TEST

TEST 'WINDOW: value at upper boundary is excluded'
  VAR result : BOOL; END_VAR
  result := WINDOW(low := 0.0, in := 10.0, high := 10.0);
  ASSERT_FALSE(result);
END_TEST

(* === WINDOW2: closed interval check === *)

TEST 'WINDOW2: value inside range'
  VAR result : BOOL; END_VAR
  result := WINDOW2(LOW := 0.0, IN := 5.0, HIGH := 10.0);
  ASSERT_TRUE(result);
END_TEST

TEST 'WINDOW2: value at lower boundary is included'
  VAR result : BOOL; END_VAR
  result := WINDOW2(LOW := 0.0, IN := 0.0, HIGH := 10.0);
  ASSERT_TRUE(result);
END_TEST

TEST 'WINDOW2: value at upper boundary is included'
  VAR result : BOOL; END_VAR
  result := WINDOW2(LOW := 0.0, IN := 10.0, HIGH := 10.0);
  ASSERT_TRUE(result);
END_TEST

TEST 'WINDOW2: value below range'
  VAR result : BOOL; END_VAR
  result := WINDOW2(LOW := 0.0, IN := -0.001, HIGH := 10.0);
  ASSERT_FALSE(result);
END_TEST

(* === SCALE: linear scaling with limits === *)

TEST 'SCALE: identity with no offset'
  VAR result : REAL; END_VAR
  result := SCALE(X := 5.0, K := 1.0, O := 0.0, MX := 100.0, MN := 0.0);
  ASSERT_NEAR(result, 5.0, 0.001);
END_TEST

TEST 'SCALE: double with offset'
  VAR result : REAL; END_VAR
  result := SCALE(X := 3.0, K := 2.0, O := 10.0, MX := 100.0, MN := 0.0);
  ASSERT_NEAR(result, 16.0, 0.001);
END_TEST

TEST 'SCALE: clamp to max'
  VAR result : REAL; END_VAR
  result := SCALE(X := 100.0, K := 2.0, O := 0.0, MX := 50.0, MN := 0.0);
  ASSERT_NEAR(result, 50.0, 0.001);
END_TEST

TEST 'SCALE: clamp to min'
  VAR result : REAL; END_VAR
  result := SCALE(X := -100.0, K := 1.0, O := 0.0, MX := 50.0, MN := -10.0);
  ASSERT_NEAR(result, -10.0, 0.001);
END_TEST
